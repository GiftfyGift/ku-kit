# KU-KIT Assistant backend (Cloudflare)

Backend for the KU-KIT Assistant widget's document-repository search: real per-document citations,
a "your question was broad, did you mean X/Y/Z?" clarifying step, and a grounded AI-synthesized
answer — replacing (with a graceful fallback to) the old pure client-side keyword search in
`assets/js/app.js`.

Architecture, reasoning, and the full request/response flow are documented in `src/index.js`'s
header comment and in the plan this was built from
(`C:\Users\yuwadee.t\.claude\plans\precious-munching-marshmallow.md` on the machine it was built
on — copy the relevant sections here if that path won't be around later).

## One-time setup (do this first)

1. Run `../../scripts/cloudflare-setup-wizard.sh` from a Git Bash terminal at the `ku-kit/` repo
   root. It walks through creating a Cloudflare account (if you don't have one), logging in the
   `wrangler` CLI, and creating a scoped API token — and saves everything to
   `backend/cloudflare-worker/.env` (gitignored, never printed back in full).
2. Come back and tell Claude Code you've finished — it reads `.env` and continues from there:
   creating the R2 bucket, KV namespace, AI Search instance, running the ingestion script, and
   deploying this Worker.

## Manual deploy (once resources exist)

```bash
npx wrangler kv namespace create DOC_MANIFEST   # copy the returned id into wrangler.toml
npx wrangler r2 bucket create kukit-docs
npx wrangler secret put CF_API_TOKEN            # paste the token from .env when prompted
npx wrangler deploy
```

The AI Search instance itself (pointed at the `kukit-docs` R2 bucket) is created via the REST API,
not `wrangler` — there's no CLI support for it yet. See `src/index.js`'s `aiSearchRetrieve()` for
the exact endpoint shape.

After deploying, update `KA_API_URL` in `../../assets/js/app.js` (currently an empty string, which
makes the widget skip straight to its local-search fallback) to the deployed Worker's
`https://*.workers.dev` URL, then commit + push.

## Ingesting documents

See `../../scripts/ingest-knowledge/README.md`.
