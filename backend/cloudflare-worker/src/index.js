// KU-KIT Assistant backend — single Worker, one real route: POST /api/ask.
//
// Flow: retrieve scored chunks from the AI Search instance indexing the
// kukit-docs R2 bucket -> attach citation metadata from the DOC_MANIFEST KV
// namespace -> decide (deterministically, not via the LLM) whether the
// question was too broad -> phrase a clarifying question via Workers AI if
// so, and always synthesize a grounded answer from the retrieved snippets.
//
// AI Search has no native Workers binding yet, so it's called over its REST
// API using a scoped account API token (CF_API_TOKEN, a wrangler secret).

const ALLOWED_ORIGINS = new Set([
  'https://giftfygift.github.io',
  'http://localhost:8843',
]);

// Tune these against real query logs once this is live — they're a starting
// point, not a calibrated result of analysis.
//
// AI Search's top-level `score` is an RRF-fused, RANK-based value (confirmed
// against a live response during setup: top few results all land near
// 0.93-1.0 regardless of how topically relevant they actually are) — it's
// only meaningful for ordering, never as an absolute confidence number. So
// broadness is decided from category *diversity* among the top matches, not
// from any score threshold; SCORE_FLOOR only trims the weak rank-tail before
// that diversity count, it isn't a relevance/confidence gate.
const TOP_K = 8;
const SCORE_FLOOR = 0.2;
const BROAD_CATEGORY_SPREAD = 3; // this many distinct categories among decent matches = broad

const ANSWER_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const CLARIFY_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const LANG_NAMES = { th: 'Thai', en: 'English', fr: 'French', tl: 'Filipino', sw: 'Swahili' };

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function jsonResponse(obj, origin, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

async function aiSearchRetrieve(env, query) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai-search/instances/${env.AI_SEARCH_INSTANCE}/search`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages: [{ role: 'user', content: query }] }),
  });
  if (!res.ok) {
    throw new Error(`AI Search retrieval failed: HTTP ${res.status} — ${await res.text().catch(() => '')}`);
  }
  const body = await res.json();
  // Confirmed against a live call during setup: body.result.chunks[], each
  // { id, type, score, text, item: { key, timestamp, metadata }, scoring_details }
  // — `item.key` is the R2 object key, exactly what DOC_MANIFEST is keyed by.
  const chunks = body?.result?.chunks;
  if (!Array.isArray(chunks)) {
    throw new Error(`Unexpected AI Search response shape: ${JSON.stringify(body).slice(0, 500)}`);
  }
  return chunks.map(chunk => ({
    key: chunk.item?.key || '',
    score: typeof chunk.score === 'number' ? chunk.score : 0,
    text: chunk.text || '',
  })).filter(r => r.key);
}

async function attachManifest(env, matches) {
  return Promise.all(matches.map(async m => {
    const raw = await env.DOC_MANIFEST.get(m.key);
    const meta = raw ? JSON.parse(raw) : {};
    return {
      ...m,
      title: meta.title || m.key,
      lang: meta.lang || '',
      category: meta.category || '',
      route: meta.route || '',
      sourceUrl: meta.sourceUrl || '',
    };
  }));
}

function decideBroad(matches) {
  const decent = matches.filter(m => m.score >= SCORE_FLOOR);
  if (!decent.length) return { broad: false, decent }; // "no results" path, not "broad"
  const categories = new Set(decent.map(m => m.category).filter(Boolean));
  return { broad: categories.size >= BROAD_CATEGORY_SPREAD, decent };
}

async function phraseClarifyingQuestion(env, query, decent, lang) {
  const topics = [...new Set(decent.map(m => m.title))].slice(0, 6);
  const prompt = `A dealer asked a broad question on a Kubota-equipment dealer-training site: "${query}"
The site found matches across several different topics: ${topics.join('; ')}
Write ONE short, friendly clarifying question in ${LANG_NAMES[lang] || 'English'} asking which of these
topics they meant, plus up to 4 short suggested topic labels (each under 6 words, in ${LANG_NAMES[lang] || 'English'}).
Respond with ONLY this JSON, no other text: {"question": "...", "suggestions": ["...", "..."]}`;
  try {
    const result = await env.AI.run(CLARIFY_MODEL, { messages: [{ role: 'user', content: prompt }] });
    // Workers AI auto-parses JSON-looking completions: `response` comes back
    // as an object directly, not a string to regex out — confirmed via a
    // live call during setup. Still handle the string case defensively in
    // case a different model/version reverts to plain text.
    let parsed = result?.response;
    if (typeof parsed === 'string') {
      const match = parsed.match(/\{[\s\S]*\}/);
      if (!match) return null;
      parsed = JSON.parse(match[0]);
    }
    if (!parsed?.question) return null;
    return { question: parsed.question, suggestions: (parsed.suggestions || []).slice(0, 4) };
  } catch (err) {
    console.error('clarify phrasing failed', err);
    return null;
  }
}

async function synthesizeAnswer(env, query, decent, lang) {
  if (!decent.length) return null;
  const sources = decent.slice(0, 5).map((m, i) => `[${i + 1}] ${m.title}: ${m.text.slice(0, 500)}`).join('\n\n');
  const prompt = `Answer the dealer's question using ONLY the numbered sources below — do not add anything not
supported by them. If the sources don't actually answer the question, say so briefly instead of guessing.
Cite sources inline like [1], [2]. Answer in ${LANG_NAMES[lang] || 'English'}, in 2-4 sentences.

Sources:
${sources}

Question: ${query}`;
  try {
    const result = await env.AI.run(ANSWER_MODEL, { messages: [{ role: 'user', content: prompt }] });
    return result?.response?.trim() || null;
  } catch (err) {
    console.error('answer synthesis failed', err);
    return null;
  }
}

async function handleAsk(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, origin, 400);
  }
  const query = String(body?.query || '').trim().slice(0, 500);
  const lang = LANG_NAMES[body?.lang] ? body.lang : 'en';
  if (!query) return jsonResponse({ error: 'Missing query' }, origin, 400);

  let matches;
  try {
    matches = await aiSearchRetrieve(env, query);
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: 'Retrieval failed' }, origin, 502);
  }
  matches = matches.sort((a, b) => b.score - a.score).slice(0, TOP_K);
  matches = await attachManifest(env, matches);

  const { broad, decent } = decideBroad(matches);
  const results = decent.map(m => ({
    title: m.title, snippet: m.text.slice(0, 220), sourceUrl: m.sourceUrl, route: m.route, score: m.score,
  }));

  if (!decent.length) {
    return jsonResponse({ mode: 'none', results: [] }, origin);
  }

  if (broad) {
    const clarify = await phraseClarifyingQuestion(env, query, decent, lang);
    if (clarify) {
      return jsonResponse({ mode: 'clarify', clarifyingQuestion: clarify.question, suggestions: clarify.suggestions, results }, origin);
    }
    // Phrasing failed — degrade to a plain results response rather than dead-ending.
  }

  const answer = await synthesizeAnswer(env, query, decent, lang);
  return jsonResponse({ mode: 'results', answer, results }, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }
    if (url.pathname === '/api/ask' && request.method === 'POST') {
      try {
        return await handleAsk(request, env, origin);
      } catch (err) {
        console.error('Unhandled error in handleAsk', err);
        return jsonResponse({ error: 'Internal error', detail: String(err && err.stack || err) }, origin, 500);
      }
    }
    return jsonResponse({ error: 'Not found' }, origin, 404);
  },
};
