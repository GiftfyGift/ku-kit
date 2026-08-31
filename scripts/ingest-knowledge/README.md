# Document-repository ingestion

Extracts text from source documents and loads them into the KU-KIT Assistant's backend (R2 +
`DOC_MANIFEST` KV — see `../../backend/cloudflare-worker/`).

## What gets ingested

1. **`sources.json`'s `documents[]`** — anything that needs fetching from Google Drive first (empty
   right now — see `sources.json`'s `_discovery` note: the 4 Drive folders originally pointed at
   turned out to already be sitting locally, see #2).
2. **`../../assets/docs/**`, walked automatically** (PDF + PPTX only — see `sources.json`'s
   `_deliberatelyExcluded` note on why `.xlsx` needs manual opt-in, not automatic ingestion).
3. **`../../content/product-knowledge.json`'s existing chunks**, reused as-is.

## Running it

```bash
npm install
node ingest.js --dry-run   # extracts + stages locally only, no upload — safe to run any time,
                            # doesn't need Cloudflare resources to exist yet
node ingest.js             # also uploads to R2 + writes KV manifest entries (needs
                            # backend/cloudflare-worker/.env populated and wrangler authenticated)
```

Re-run whenever new source documents show up in `assets/docs/` or get added to `sources.json`.

## Adding a new Drive-sourced document

Add an entry to `sources.json`'s `documents[]` (see the existing shape), then have Claude Code (or
anyone with Drive access) fetch that file into `source-files/<localFile>` before running
`ingest.js` — a plain Node script can't reach Google Drive without separate OAuth setup, so this
step stays manual/Claude-assisted rather than scripted.

**Before adding any spreadsheet**: open it and check for internal-only columns first — see
`sources.json`'s `_deliberatelyExcluded` note. This project's parts-recommendation spreadsheets
specifically have a track record of mixing customer-safe and internal-only data in the same sheet.
