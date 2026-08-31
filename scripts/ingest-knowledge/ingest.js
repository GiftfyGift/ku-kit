// Ingests the KU-KIT Assistant's document repository into R2 + the
// DOC_MANIFEST KV namespace.
//
// Prereqs (see README.md): Cloudflare resources provisioned, wrangler
// authenticated, source-files/ populated per sources.json (Claude Code's
// Drive connector downloads those; a couple of large ones need a manual
// browser download instead — see sources.json's "note" fields).
//
// Usage:
//   npm install
//   node ingest.js --dry-run   # extract + preview only, no upload
//   node ingest.js             # extract, upload to R2, write KV manifest

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { extractText } = require('./extract');

const ROOT = __dirname;
const KU_KIT_ROOT = path.join(ROOT, '..', '..');
const STAGING_DIR = path.join(ROOT, 'staging');
const SOURCE_FILES_DIR = path.join(ROOT, 'source-files');
const DRY_RUN = process.argv.includes('--dry-run');

const R2_BUCKET = 'kukit-docs';
const KV_BINDING = 'DOC_MANIFEST';
const WORKER_DIR = path.join(KU_KIT_ROOT, 'backend', 'cloudflare-worker');

function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const stagedKeysThisRun = new Set();

function stageAndUpload({ key, text, meta }) {
  if (stagedKeysThisRun.has(key)) {
    console.warn(`  NOTE: ${key} already staged this run (likely a PDF + PPTX pair of the same document) — overwriting with this later version.`);
  }
  stagedKeysThisRun.add(key);
  fs.mkdirSync(path.dirname(path.join(STAGING_DIR, key)), { recursive: true });
  const stagedPath = path.join(STAGING_DIR, key);
  fs.writeFileSync(stagedPath, text, 'utf8');
  console.log(`  staged: ${key} (${text.length} chars)`);

  if (DRY_RUN) return;

  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${R2_BUCKET}/${key}`,
    '--file', stagedPath, '--remote'], { cwd: WORKER_DIR, stdio: 'inherit' });

  execFileSync('npx', ['wrangler', 'kv', 'key', 'put', '--binding', KV_BINDING,
    key, JSON.stringify(meta), '--remote'], { cwd: WORKER_DIR, stdio: 'inherit' });
}

async function ingestFromSourcesJson() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources.json'), 'utf8'));
  for (const doc of manifest.documents) {
    const localPath = path.join(SOURCE_FILES_DIR, doc.localFile);
    if (!fs.existsSync(localPath)) {
      console.warn(`  SKIP (not downloaded yet): ${doc.localFile} — ${doc.note || 'see sources.json'}`);
      continue;
    }
    console.log(`Extracting: ${doc.localFile}`);
    try {
      const text = await extractText(localPath);
      const key = `${doc.category}/${slugify(doc.title)}-${doc.lang}.txt`;
      stageAndUpload({
        key,
        text,
        meta: { title: doc.title, lang: doc.lang, category: doc.category, route: doc.route, sourceUrl: doc.sourceUrl },
      });
    } catch (err) {
      console.error(`  FAILED: ${doc.localFile}:`, err.message);
    }
  }
}

// Walks the full local assets/docs/<category>/ tree generically — see
// sources.json's "_discovery" note: this local folder turned out to already
// hold everything the 4 Drive folders were pointing at, plus more (PPTX
// originals alongside PDF exports), so there's no fixed folder list here.
// PDF + PPTX only — .xlsx is deliberately excluded, see sources.json's
// "_deliberatelyExcluded" note (internal-only columns risk).
const ROUTE_BY_FOLDER = {
  assembly: 'product-assembly', service: 'service', tiller: 'product-tiller',
  engine: 'product-engine', manuals: 'product', maintenance: 'service',
  authenticity: 'product', 'pre-delivery': 'service', 'product-knowledge': 'product',
  parts: 'parts', marketing: 'marketing',
};
const LANG_ALIASES = { th: 'th', en: 'en', swa: 'sw', sw: 'sw' };
const INDEXABLE_EXT = new Set(['.pdf', '.pptx']);

function parseDocFilename(file) {
  const ext = path.extname(file).toLowerCase();
  const stem = path.basename(file, ext);
  const match = stem.match(/^(.*)-(th|en|swa|sw)$/i);
  if (match) return { slug: match[1], lang: LANG_ALIASES[match[2].toLowerCase()] };
  // No recognized lang suffix (e.g. Parts-Book-ZT140.pdf) — treat as
  // language-neutral English rather than skipping real content outright.
  return { slug: stem, lang: 'en' };
}

async function ingestAssetsDocsAll() {
  const docsDir = path.join(KU_KIT_ROOT, 'assets', 'docs');
  if (!fs.existsSync(docsDir)) return;
  for (const folder of fs.readdirSync(docsDir)) {
    const folderPath = path.join(docsDir, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    const route = ROUTE_BY_FOLDER[folder] || folder;
    // .pptx before .pdf so that when both exist for the same document, the
    // PDF (final exported format) is the one stageAndUpload's dedup keeps.
    const files = fs.readdirSync(folderPath).sort((a, b) => {
      const rank = f => (f.toLowerCase().endsWith('.pdf') ? 1 : 0);
      return rank(a) - rank(b);
    });
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!INDEXABLE_EXT.has(ext)) {
        if (ext === '.xlsx') console.warn(`  SKIP (spreadsheet, needs manual review — see sources.json): ${folder}/${file}`);
        continue;
      }
      const { slug, lang } = parseDocFilename(file);
      const filePath = path.join(folderPath, file);
      console.log(`Extracting: assets/docs/${folder}/${file}`);
      try {
        const text = await extractText(filePath);
        const key = `${folder}/${slugify(slug)}-${lang}.txt`;
        stageAndUpload({
          key,
          text,
          meta: { title: slug.replace(/-/g, ' '), lang, category: folder, route, sourceUrl: `assets/docs/${folder}/${file}` },
        });
      } catch (err) {
        console.error(`  FAILED: ${folder}/${file}:`, err.message);
      }
    }
  }
}

// content/product-knowledge.json — already-extracted text from an earlier
// session; reused as-is (one R2 object per source document, chunks rejoined)
// rather than re-extracted from the original PDFs a second time.
function ingestProductKnowledgeJson() {
  const pkPath = path.join(KU_KIT_ROOT, 'content', 'product-knowledge.json');
  if (!fs.existsSync(pkPath)) return;
  const pk = JSON.parse(fs.readFileSync(pkPath, 'utf8'));
  const byDoc = {};
  for (const chunk of pk.chunks || []) {
    (byDoc[chunk.route + '|' + chunk.lang] ||= { chunks: [], meta: null }).chunks.push(chunk);
  }
  for (const doc of pk.documents || []) {
    const group = byDoc[doc.route + '|' + doc.lang];
    if (!group) continue;
    group.chunks.sort((a, b) => (a.chunkNumber || 0) - (b.chunkNumber || 0));
    const text = group.chunks.map(c => c.text).join('\n\n');
    const key = `product/${slugify(doc.title)}-${doc.lang}.txt`;
    console.log(`Reusing product-knowledge chunks: ${doc.title} (${doc.lang})`);
    stageAndUpload({
      key,
      text,
      meta: { title: doc.title, lang: doc.lang, category: 'product', route: doc.route, sourceUrl: doc.sourceUrl },
    });
  }
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (extract + stage only, no upload) ===' : '=== Ingesting into R2 + KV ===');
  await ingestFromSourcesJson();
  await ingestAssetsDocsAll();
  ingestProductKnowledgeJson();
}

main().catch(err => { console.error(err); process.exit(1); });
