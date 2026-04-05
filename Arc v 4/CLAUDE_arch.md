# CLAUDE_arch.md — Arcanthyr Architecture Reference
*Updated: 5 April 2026 (end of session 36). Upload every session alongside CLAUDE.md.*

---

## ARCHITECTURE OVERVIEW

**Stack:** Cloudflare Worker (`arcanthyr-api`) + D1 (`arcanthyr`) + Qdrant (`general-docs-v2`) + Ollama/pplx-embed (Docker) + nexus `server.py` (Docker `agent-general`)

| Component | Detail |
|---|---|
| VPS | Contabo · `31.220.86.192` · Ubuntu 24.04 · 23GB RAM · 6 vCPU |
| Live site | `arcanthyr.com` (Cloudflare Worker custom domain) |
| GitHub | `https://github.com/Arcanthyr/arcanthyr-console` |
| Git root | `arcanthyr-console/` (monorepo since session 35) · `Arc v 4/`, `arcanthyr-ui/`, `Local Scraper/`, and root scripts all tracked here · git commands run from `arcanthyr-console/` · wrangler/npx commands still run from `Arc v 4/` |
| Cloudflare plan | Workers Paid ($5/month) · Account ID: `def9cef091857f82b7e096def3faaa25` |

**D1 vs Qdrant:**
- D1 = source of truth / relational. Text and metadata live here permanently.
- Qdrant = semantic search index. Vectors + chunk_id payload pointing back to D1. Rebuilt from D1 if needed.
- Library delete wipes Qdrant chunks but NOT D1 rows.
- Full reset: `wrangler d1 execute DELETE` on relevant table + Qdrant collection delete + recreate.

---

## DOCKER INTERNAL HOSTNAMES — CRITICAL

**`localhost` inside a Docker container refers to that container, not the VPS host. All inter-container calls must use Docker service names.**

| Service | Host-side | Inside Docker container |
|---|---|---|
| Qdrant general | `http://localhost:6334` | `http://qdrant-general:6333` |
| Ollama | not accessible from host | `http://ollama:11434` |
| agent-general nexus | `http://localhost:18789` | `http://agent-general:18789` |

**Nexus health check port is 18789** — always curl `http://localhost:18789/health` after restart.

**enrichment-poller is a permanent Docker service (added session 5):**
The poller runs as a dedicated container with `restart: unless-stopped`. No tmux required.

Start/restart:
```bash
cd ~/ai-stack
docker compose up -d enrichment-poller
```

Check logs:
```bash
docker compose logs --tail=50 enrichment-poller
```

The service uses the same image as agent-general, same volume mount (`./agent-general/src:/app/src`), and reads `OLLAMA_URL` + `QDRANT_URL` from environment. Changes to enrichment_poller.py take effect immediately — no rebuild needed.

Do NOT run the poller manually via `docker compose exec` anymore — the service handles it.

**agent-general container env vars (docker-compose.yml):** `NEXUS_SECRET_KEY`, `WORKER_URL` (= `https://arcanthyr.com`), `OPENAI_API_KEY` (required for `/process-document` GPT calls), `OLLAMA_URL`, `QDRANT_URL`. If `OPENAI_API_KEY` is missing, `/process-document` jobs will fail at the enriching step.

**Never test API routes via SSH from PowerShell** — SSH quoting mangles auth headers. SSH to VPS first, then run curl locally.

---

## DATA FLOW PIPELINE (v2 — CURRENT)

```
Console upload → Worker → D1 (raw_text stored, enriched=1, embedded=0)
                       → NO nexus call (fire-and-forget removed in v9)
                       → upload-corpus and format-and-upload set enriched=1 on INSERT (session 26)

VPS enrichment_poller.py (permanent Docker service, --loop):
  [EMBED] pass   → enriched=1, embedded=0 rows → pplx-embed → Qdrant → embedded=1
  [CASE-EMBED]   → case_chunks done=1, embedded=0 → pplx-embed → Qdrant → embedded=1
  [LEG]          → legislation embedded=0 → pplx-embed → Qdrant → embedded=1
  [ENRICH]       → unenriched secondary_sources → GPT-4o-mini (OpenAI API) → enriched_text → enriched=1
```

**Secondary sources enriched=1 on insert (session 26):** Console upload routes (`handleUploadCorpus`, `handleFormatAndUpload`) both set `enriched=1` on INSERT — no manual `wrangler d1` step needed after any console upload. Poller embed pass picks up `enriched=1, embedded=0` rows. If using a custom ingest path outside the Worker routes, verify enriched=1 is set manually before the poller runs.

**Enrichment model by content type:**

| Content | Enrichment model | Notes |
|---|---|---|
| Scraped cases (bulk) | Workers AI / Qwen3-30b — in Worker at ingest time | Free, automated, NOT via VPS poller |
| Manual case uploads | Workers AI — same Worker path | NOT via VPS poller |
| Secondary sources corpus | None — raw_text IS the content | embed raw_text directly, enriched_text stays NULL |
| Legislation | None — raw statutory text embedded directly | |
| Future secondary source uploads (small volume) | GPT-4o-mini-2024-07-18 via OpenAI API (OPENAI_API_KEY in VPS .env) | switched from Claude API session 13 — Claude API key unavailable |

**Secondary sources corpus (session 12):** 1,171 rows · all enriched=1 · embedded=0 (poller embedding overnight). `enriched_text` is NULL — correct, poller falls back to `raw_text`. Do NOT run `--mode enrich` on these rows.

---

## RETRIEVAL ARCHITECTURE (v5 — SESSION 8, confirmed against live code)

CRITICAL: Session 3 RRF/BM25/FTS5 work was documented as complete but was
never deployed. Neither worker.js nor server.py contain RRF, in-memory BM25,
or FTS5 blend logic. The /api/pipeline/bm25-corpus and /api/pipeline/fts-search
Worker routes exist but are dead — nothing calls them during query handling.

**Actual pipeline — Worker.js handleLegalQuery:**
- Calls server.py /search
- Takes nexusData.chunks verbatim — no reordering, no blending
- Assembles context and passes to Claude API (primary) / Workers AI Qwen3 (fallback)
- handleLegalQueryWorkersAI only: citation detection → case_chunk sort to front + cap 2 secondary sources + [CASE EXCERPT]/[ANNOTATION] labels

**Actual pipeline — server.py search_text():**

### Retrieval Pipeline (Four-Pass Hybrid)

1. **Pass 1 — Semantic**: Qdrant cosine, threshold 0.45, collection general-docs-v2, top_k (default 6, cap 12)
2. **Pass 1b — Concept search**: same collection unfiltered, threshold 0.45, top_k * 2
3. **Pass 2 — Case chunks**: filtered type=case_chunk, threshold 0.35, limit 4
4. **Pass 3 — Secondary sources**: filtered type=secondary_source, threshold 0.35, limit 4 (added session 27)
5. **BM25/FTS5**: section references bypass scoring entirely, injected at score=0.0
6. **RRF merge**: Reciprocal Rank Fusion across all passes
7. **LLM synthesis**: top chunks sent to Claude API (Sol) or Qwen3 Workers AI (V'ger)

Court hierarchy re-ranks within 0.05 band: HCA (4) > CCA/FullCourt (3) > Supreme (2) > Magistrates (1).

**Diagnostic rule:** empty or unexpected results → first check:
`docker compose logs --tail=50 agent-general`
Skip/error messages are logged per-pass and visible immediately.

---

## CORPUS PIPELINE — SECONDARY SOURCES (v3, session 12)

**Session 13 corpus state:**
- Part 1: 488 chunks · Part 2: 683 chunks · BRD manual chunk: 1 · Total: 1,172 chunks
- All enriched=1 · all embedded=1 · FTS5 backfilled (1,171 rows — BRD chunk also in FTS5)
- Next sequential block number for `ingest_corpus.py` bulk runs: hoc-b057 (hoc-b056 is highest corpus block)
- Console uploads via `format-and-upload` use timestamp-derived block numbers (`hoc-b{4-digit-timestamp}`) — sequential counter only applies to bulk `ingest_corpus.py` runs
- Malformed row hoc-b{BLOCK_NUMBER}-m001-drug-treatment-orders — FIXED session 24 (corrected to hoc-b054)
- Corpus uses preservation-focused Master prompt + Repair pass from process_blocks.py

**format-and-upload — primary console upload route (session 26):**
`POST /api/legal/format-and-upload` · auth: User-Agent spoof (`Mozilla/5.0 (compatible; Arcanthyr/1.0)`) · sets `enriched=1` on INSERT automatically · handled by `handleFormatAndUpload`

Four processing paths:
1. **Pre-formatted blocks** — text starts with `<!-- block_` → `parseFormattedChunks()` called directly, no GPT call
2. **Raw text >800 words** — calls GPT-4o-mini-2024-07-18 with Master Prompt
3. **Raw text <800 words** — calls GPT with Master Prompt + short-source note appended (demands separate chunks per doctrinal unit, strict CASE AUTHORITY CHUNK RULE)
4. **Single-chunk mode** — `body.mode='single'` bypasses GPT entirely; wraps text in `<!-- block_0001 master -->` header using provided `title`, `slug`, `category`; calls `parseFormattedChunks()` and inserts as one chunk

**Word/PDF drag-drop pipeline (session 32 — confirmed working):**
Upload.jsx accepts `.pdf`, `.docx`, `.txt` on Secondary Sources tab → reads as base64 DataURL → `api.processDocument({ file_b64, filename })` → Worker proxy `POST /api/ingest/process-document` → server.py `process_document()` → background thread: extract text → split blocks → GPT-4o-mini format → `post_chunk_to_worker` → Worker `POST /api/legal/upload-corpus` → D1 insert `enriched=1, embedded=0` → poller embeds to Qdrant.

Key fix (session 32): `post_chunk_to_worker` was sending base64-encoded text with `encoding: "base64"` flag — Worker has no decode step, all chunks silently skipped. Fixed to send raw UTF-8.

ID format: citation-derived slugs (e.g. `DocTitle__Citation`) — different from console paste `hoc-b{timestamp}` format. Both valid. Re-uploading same doc skips silently via `INSERT OR IGNORE`.

**cases.id format (session 34):** `cases.id` is now citation-derived (e.g. `2026-tassc-2`), not UUID. `citationToId()` helper in worker.js normalises citation → lowercase slug. Both `handleUploadCase` and `handleFetchCaseUrl` use `INSERT OR IGNORE` — re-uploading an existing citation is a no-op, enrichment data is preserved. All 580 pre-existing UUID rows were backfilled via D1 UPDATE. No Qdrant changes required — Qdrant payloads reference `citation` not `cases.id`.

`.md` files on drop: load into textarea instead of triggering pipeline — intentional, allows preview/edit before submit.

**Parser fix (ingest_corpus.py session 9):**
- Heading regex: `#+ .+` (was `###? .+`) — now accepts single # headings
- Metadata lookahead: `\[[A-Z]+:` (was `\[DOMAIN:`) — now accepts any bracket field
- PROCEDURE_ONLY flag: False for full corpus ingest

**FTS5 and corpus re-ingest (session 12):**
- Root cause of 500 errors on upload-corpus: `handleUploadCorpus` FTS5 insert had no ON CONFLICT clause
- Fix: `INSERT OR REPLACE INTO secondary_sources_fts` deployed version 2d3716de
- If 500 errors ever recur on upload-corpus: `DELETE FROM secondary_sources_fts` then retry
- FTS5 table is currently empty — backfill needed after embed pass completes

**FTS5 backfill command (run after embed pass complete):**
```sql
INSERT INTO secondary_sources_fts (rowid, source_id, title, raw_text)
SELECT rowid, id, title, raw_text FROM secondary_sources
WHERE id NOT IN (SELECT source_id FROM secondary_sources_fts)
```

---

## ASYNC JOB PATTERN — LIVE (deployed 18 March 2026, session 2)

**Problem:** fetch-case-url and PDF case uploads timeout on large judgments. Worker has 30s wall-clock limit.

**Confirmed correct solution: Cloudflare Queues**

**LIVE implementation:**
- Queue name: `arcanthyr-case-processing`
- **METADATA message:** Pass 1 (first 8k chars) → one Workers AI call → writes `case_name`, `judge`, `parties`, `facts`, `issues`, `enriched=1` to D1 → splits full `raw_text` into 3k-char chunks → writes to `case_chunks` table → enqueues one CHUNK message per chunk → `ack()`
- **CHUNK message:** reads `chunk_text` from `case_chunks` → GPT-4o-mini-2024-07-18 call with v3 prompt → writes `principles_json` + `enriched_text`, sets `done=1` → checks `COUNT(*) WHERE done=0` → if 0, calls `performMerge()` → `ack()`
- **MERGE message (session 22):** synthesis-only re-merge — reads all `principles_json` from `case_chunks`, runs `performMerge()` with synthesis GPT-4o-mini call, writes case-level principles → `ack()`
- **Frontend:** polls `/api/legal/case-status` — `enriched=1` set after Pass 1, `deep_enriched=1` set after merge

### performMerge() — shared merge function (session 22)

Used by both CHUNK handler (when last chunk completes) and MERGE handler (re-merge only). Steps:
1. Collect `allPrinciples`, `allHoldings`, `allLegislation`, `allAuthorities` from all chunk `principles_json`
2. Collect `enriched_text` from reasoning/mixed chunks into `enrichedTexts` array
3. If `enrichedTexts.length > 0`: make GPT-4o-mini synthesis call with enriched_text + Pass 1 context → produces 4-8 case-specific principles
4. If synthesis fails or enrichedTexts empty: fall back to raw `allPrinciples` concatenation
  → Sentencing second pass (conditional — fires if `subject_matter='criminal'` or sentencing keywords in chunks):
      → `isSentencingCase()` checks subject_matter + keyword scan across principles_json + issues string
      → GPT-4o-mini: `SENTENCING_SYNTHESIS_PROMPT` → `{sentencing_found, procedure_notes, sentencing_principles}`
      → If `sentencing_found=true`: `procedure_notes` written to cases table, `sentencing_principles` appended to `synthesisedPrinciples`
      → If `sentencing_found=false`: no-op, case gets doctrine principles only
5. Atomic gate: `UPDATE cases SET deep_enriched=1 WHERE citation=? AND deep_enriched=0` — only one worker proceeds
6. Write `principles_extracted`, `holdings_extracted`, `legislation_extracted`, `authorities_extracted`, `subject_matter`, `holding`, `procedure_notes` to D1

**Synthesis prompt** produces principles as JSON array of `{ principle, statute_refs, keywords }` — no type/confidence/source_mode fields. Case-specific prose style, not generic IF/THEN.

**Synthesis skip condition:** If all chunks have null `enriched_text` (pre-Fix-1 bad chunks), synthesis is skipped and raw concatenation is used. This produces old-format principles. Fix: re-merge after chunks are re-enriched.

**Synthesis error handling:** catch block logs `[queue] synthesis failed for {citation}, falling back to raw concat: {error}` and sets `synthesisedPrinciples = allPrinciples` (old format with `type`/`confidence`). No retry. If synthesis fails, case gets old-format principles silently — check Worker real-time logs to diagnose.

---

## NEXUS SERVER.PY — ROUTES AND GLOBALS

**All routes require `X-Nexus-Key` header except `/health`.**

| Method | Route | Handler | Notes |
|---|---|---|---|
| GET | `/health` | inline | Returns `{"status":"ok"}` — no auth |
| POST | `/ingest` | `ingest_text()` | Embed + upsert chunk to Qdrant |
| POST | `/search` | `search_text()` | Five-pass retrieval |
| POST | `/query` | `query_qwen()` | search + Qwen3 inference |
| POST | `/extract-pdf` | `extract_pdf_text()` | pdfminer only |
| POST | `/extract-pdf-ocr` | `extract_pdf_text_ocr()` | pdfminer + OCR fallback |
| POST | `/delete` | `delete_citation()` | Delete Qdrant vectors by `citation` field |
| POST | `/delete-by-type` | `delete_type()` | Delete Qdrant vectors by `type` field |
| POST | `/process-document` | `process_document()` | Extract text → split → GPT enrichment → D1 |
| GET | `/ingest-status/<job_id>` | `get_ingest_status()` | Returns live job state |

**Key module-level globals (server.py):**

| Global | Value | Purpose |
|---|---|---|
| `EMBED_MODEL` | `argus-ai/pplx-embed-context-v1-0.6b:fp32` | Ollama embedding model |
| `COLLECTION` | `general-docs-v2` | Qdrant collection name |
| `_bm25_corpus` | dict | In-memory BM25 corpus cache |
| `BM25_TTL` | 600 | BM25 corpus rebuild TTL in seconds |
| `BM25_FTS_ENABLED` | True | Kill switch for D1 FTS5 retrieval pass |

---

## PHASE 5 DESIGN (LOCKED)

- Qdrant top 6 chunks, min score 0.45, max 8
- Re-rank by court hierarchy within 0.05 band: CCA/FullCourt > Supreme > Magistrates
- Full metadata per chunk
- Claude API primary → Workers AI (Qwen3-30b) fallback
- API key via `npx wrangler secret put ANTHROPIC_API_KEY`

---

## ARCANTHYR-UI (session 19 — DEPLOYED)

### arcanthyr-ui — Frontend Architecture (session 19)

**Deployment:** React/Vite app built to `dist/`, copied into `Arc v 4/public/`, served by Worker via `[assets]` binding at arcanthyr.com. NOT a separate Cloudflare Pages deployment.

**Deploy command:**
```
cd arcanthyr-ui && npm run build
cp -r dist/. "../Arc v 4/public/"
cd "../Arc v 4" && npx wrangler deploy
```

**SPA routing:** `not_found_handling = "single-page-application"` in wrangler.toml — catches all deep links and serves index.html.

**_redirects:** Do NOT add a _redirects file to arcanthyr-ui/public/ — it conflicts with Workers Assets and causes infinite loop error 10021.

**Model toggle names:** Sol = Claude API (claude-sonnet) · V'ger = Workers AI (Cloudflare Qwen3-30b) · V'ger is default

**Globe dependencies:** Three.js + @react-three/fiber + @react-three/drei · Earth texture from unpkg · lives on Compose page

**Stack:** React + Vite
**Repo location:** `arcanthyr-console/arcanthyr-ui/` — tracked in monorepo (no separate GitHub repo · absorbed session 35)
**Dev server:** `npm run dev` from `arcanthyr-console/arcanthyr-ui/` · `http://localhost:5173`

**API base (session 17+):**
- `api.js BASE = 'https://arcanthyr.com'` — browser calls Worker directly, no proxy
- Vite proxy removed — `vite.config.js` has no server.proxy section
- CORS on Worker allows `http://localhost:5173` → preflight passes cleanly

**Auth flow (local dev — session 17+):**
- Auth removed for local dev — verify/login/logout are no-op stubs returning `{ ok: true }`
- Landing.jsx immediately redirects to /research (no password screen)
- Worker JWT/cookie auth still live in production — unaffected

**API field names (critical):**
- Frontend → Worker: `{ query }` (not query_text)
- Worker → server.py: `{ query_text }` (Worker translates internally)
- Never send `query_text` from frontend — Worker reads `body.query`

**Pages (all in `src/pages/`):**
- `Landing.jsx` — immediate redirect to /research (auth removed session 17)
- `Research.jsx` — query input, model toggle (Claude/Workers), filter chips, non-clickable source list, AI Summary auto-displays in reading pane after query
- `Upload.jsx` — 3 tabs: Cases (file drop + AustLII URL input) / Secondary Sources (drag+drop .md/.txt) / Legislation (drag+drop .pdf/.txt)
- `Library.jsx` — 3 tabs: CASES/SECONDARY SOURCES/LEGISLATION · case rows clickable → split reading pane with Facts/Holding/Principles tabs · Principles tab reads `c.principles_extracted` (fixed session 33) · year filter chips + court filter chips combinable · Legislation tab: Date Updated column (reads `current_as_at` via `r.date`), external link to legislation.tas.gov.au · Secondary Sources: Title column leftmost · `handleLibraryList` SELECT includes `principles_extracted` (session 33)
- Components: `Nav.jsx`, `ResultCard.jsx`, `PrincipleCard.jsx`, `ReadingPane.jsx`, `ShareModal.jsx`, `PipelineStatus.jsx`

**Production deploy (pending):**
- Cloudflare Pages project not yet created
- Will need `VITE_API_BASE` env var pointing to `https://arcanthyr.com`
- Build command: `npm run build` · output dir: `dist`

---

## KEY FILE LOCATIONS

| File | Path |
|---|---|
| enrichment_poller.py | `Arc v 4/enrichment_poller.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| server.py (nexus) | `Arc v 4/server.py` (local) · `~/ai-stack/agent-general/src/server.py` (VPS canonical) |
| xref_agent.py | `Arc v 4/xref_agent.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| ingest_corpus.py | `arcanthyr-console/ingest_corpus.py` — run from there, NOT from `Arc v 4/` |
| ingest_part2.py | `arcanthyr-console/ingest_part2.py` — standalone part2 ingest script |
| retrieval_baseline.sh | `arcanthyr-console/retrieval_baseline.sh` (repo) · VPS `~/retrieval_baseline.sh` — results in ~/retrieval_baseline_results.txt |
| master_corpus_part1.md | `arcanthyr-console/master_corpus_part1.md` — 488 chunks (session 12) |
| master_corpus_part2.md | `arcanthyr-console/master_corpus_part2.md` — 683 chunks (session 12) |
| sentencing_first_offenders.md | `arcanthyr-console/sentencing_first_offenders.md` — 1 procedure chunk, ingested session 4 |
| worker.js | `Arc v 4/worker.js` |
| CLAUDE.md | `Arc v 4/CLAUDE.md` |
| CLAUDE_arch.md | `Arc v 4/CLAUDE_arch.md` |
| arcanthyr-ui | `arcanthyr-console/arcanthyr-ui/` — React/Vite frontend · `npm run dev` from this dir |
| api.js | `arcanthyr-console/arcanthyr-ui/src/api.js` — all Worker API calls |
| vite.config.js | `arcanthyr-console/arcanthyr-ui/vite.config.js` — no proxy (removed session 17) |
| austlii_scraper.py | `arcanthyr-console/Local Scraper/austlii_scraper.py` — Windows only |
| scraper_progress.json | `arcanthyr-console/Local Scraper/scraper_progress.json` |
| scraper.log | `arcanthyr-console/Local Scraper/scraper.log` |
| docker-compose.yml | `~/ai-stack/docker-compose.yml` (VPS) |
| run_scraper.bat | `C:\Users\Hogan\run_scraper.bat` — LOCAL path required |
| `Dockerfile.agent` | VPS | agent-general image definition — python-docx, qdrant-client, pypdf etc. baked in |

**server.py is volume-mounted** (`./agent-general/src:/app/src` in docker-compose.yml) — NOT baked into image. Changes only require: edit locally → SCP to VPS → `docker compose up -d --force-recreate agent-general` → health check. No rebuild unless Dockerfile changes.

---

## D1 SCHEMA — SECONDARY_SOURCES_FTS (added session 3)

FTS5 virtual table for full-text search over secondary_sources corpus.

```sql
CREATE VIRTUAL TABLE secondary_sources_fts USING fts5(
    source_id UNINDEXED,
    title,
    raw_text,
    tokenize='porter'
);
```

---

## COMPONENT NOTES

### austlii_scraper.py

- Location: `arcanthyr-console\Local Scraper\austlii_scraper.py`
- Progress: `arcanthyr-console\Local Scraper\scraper_progress.json`
- Log: `arcanthyr-console\Local Scraper\scraper.log`
- Runs on Windows via Task Scheduler (VPS IP banned by AustLII)
- Task Scheduler tasks: `run_scraper` (8am AEST) + `run_scraper_evening` (6pm AEST)
- SESSION_LIMIT: 150 per run
- Behavioural jitter: 7% chance 25-45s additional pause
- Business hours gate in scraper handles time window
- Exit code 2 = business hours gate fired (normal/expected outside hours)

### backfill_case_chunk_names.py

- Location: `arcanthyr-console\backfill_case_chunk_names.py` (local) · `/home/tom/backfill_case_chunk_names.py` (VPS)
- Run from VPS only — fetches cases via Worker API, updates Qdrant at `localhost:6334`
- Do NOT run from Windows — Qdrant port 6334 is localhost-only on VPS

### enrichment_poller.py

Volume-mounted at `./agent-general/src:/app/src`. Runs as permanent Docker service.

**Modes:** `--mode enrich`, `--mode embed`, `--mode both`, `--mode reconcile`, `--loop`, `--status`

**Cases enrichment path:** handled by Cloudflare Queue consumer (Worker), not the poller. METADATA message → Pass 1 metadata + chunk split. CHUNK messages → per-chunk principle extraction → merge with synthesis.

**Default batch:** 50 · **Loop sleep:** 15 seconds

### enrichment_poller.py — payload text limits (fixed session 9)

All three embed passes previously truncated payload text to [:1000]. Fixed:
- secondary_sources embed pass: [:5000]
- case_chunk embed pass: [:3000]
- legislation embed pass: [:3000]

### BM25 + RRF Hybrid Retrieval (added session 3)

**In-memory BM25 corpus (`_bm25_corpus` in server.py):**
- Built on first search query after container start
- Loads all `embedded=1` secondary_sources rows via GET `/api/pipeline/bm25-corpus`
- Invalidated: `dirty=True` on any ingest call + TTL 600s fallback

**D1 FTS5 (`secondary_sources_fts`):**
- Created session 3 · porter tokenizer
- **Backfilled session 13** — 1,171 rows · clean INSERT after wipe · all three retrieval passes operational
- Queried via Worker POST `/api/pipeline/fts-search`
- Gated by `BM25_FTS_ENABLED = True` in server.py

### Workers AI (Cloudflare) — model and usage inventory

**Current model:** `@cf/qwen/qwen3-30b-a3b-fp8` — used for ALL Workers AI calls.

**Active Workers AI calls:**
- **`summarizeCase()`** — two-pass case enrichment at scrape/upload time
- **`procedurePassPrompt`** — extracts in-court procedural sequences
- **`handleLegalQueryWorkersAI()`** — Phase 5 fast/free query toggle
- **`handleAxiomRelay()`** — Three-stage relay pipeline

### worker.js — max_tokens on query handlers

| Handler | Model | max_tokens |
|---|---|---|
| `handleLegalQuery()` | Claude API (claude-sonnet-4-20250514) | 2,000 |
| `handleLegalQueryWorkersAI()` | Workers AI (Qwen3-30b) | 2,000 |

### Sentencing Second Pass (session 31)

- Constant: `SENTENCING_SYNTHESIS_PROMPT` — module level in worker.js
- Helper: `isSentencingCase(caseRow, allChunks)` — three checks: (1) `subject_matter='criminal'`, (2) sentencing keyword regex across `principles_json`, (3) issues string scan
- Fires inside `performMerge()` after main synthesis, before D1 write
- Cost: ~$0.001/case, only on criminal cases (~60% of corpus)
- Output: `procedure_notes` (200-400 word structured prose) + 2-4 sentencing principles merged into `principles_extracted`
- Non-destructive: non-sentencing criminal cases return `sentencing_found=false`, no extra cost beyond the one GPT call
- Triggered by `requeue-merge` automatically — no separate route needed
- `subject_matter` must be included in both CHUNK and MERGE handler SELECTs and passed through the inline `caseRow` object to `performMerge` — omitting it silently breaks Check 1

### worker.js — admin routes

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/requeue-chunks` | POST | Re-enqueues done=0 chunks · accepts `{"limit":N}` |
| `/api/admin/requeue-metadata` | POST | Re-enqueues enriched=0 cases (full Pass 1 + CHUNK pipeline) |
| `/api/admin/requeue-merge` | POST | Re-triggers merge · accepts `{"limit":N}` · optional `"target":"remerge"` queries deep_enriched=1 cases, resets to 0 before enqueuing MERGE · default (no target) queries deep_enriched=0 with runtime chunk check |
| `/api/legal/format-and-upload` | POST | Dual-mode corpus upload — pre-formatted blocks (parse direct), raw text (GPT Master Prompt, short-source variant <800 words), or `mode='single'` (bypass GPT, wrap in block header) · `handleFormatAndUpload` · auth: User-Agent spoof |

### Qdrant payload field names

- Secondary source type filter: field = `type`, value = `secondary_source`
- Legislation type filter: field = `type`, value = `legislation`
- Case chunk type filter: field = `type`, value = `case_chunk`

### secondary_sources D1 schema notes

- PK is `id` (TEXT) — populated from CITATION metadata field in corpus
- **No `citation` column exists** — do not query for it. Always use `id`.
- Canonical category values: annotation, case authority, procedure, doctrine, checklist, practice note, script, legislation
- Full column list: `id, title, source_type, author, date_published, tags, related_cases, related_acts, raw_text, chunk_count, date_added, enriched_text, enriched, embedded, enrichment_error, category, embedding_model, embedding_version`

### cases D1 schema notes

- PK is `id` (TEXT) — citation with spaces replaced by hyphens
- Full column list: `id, citation, court, case_date, case_name, url, full_text, facts, issues, holding, holdings_extracted, principles_extracted, legislation_extracted, key_authorities, offences, judge, parties, procedure_notes, processed_date, summary_quality_score, enriched, embedded, deep_enriched, subject_matter`
- `subject_matter TEXT` — added session 14 · values: criminal/civil/administrative/family/mixed/unknown · derived at merge step from most frequent chunk-level classification
- `deep_enriched INTEGER DEFAULT 0` — set to 1 after all CHUNK messages complete and merge runs
- `procedure_notes TEXT` — populated by sentencing second pass for criminal judgments · NULL for non-criminal or non-sentencing cases

### case_chunks D1 schema

- `id TEXT PRIMARY KEY` — format: `{citation}__chunk__{N}`
- Full column list: `id, citation, chunk_index, chunk_text, principles_json, enriched_text, done, embedded`
- `enriched_text TEXT` — added session 14 · stores v3 prompt output · used as embed source by poller (falls back to chunk_text if null)
- `done INTEGER DEFAULT 0` — set to 1 after CHUNK queue consumer writes `principles_json`
- `embedded INTEGER DEFAULT 0` — set to 1 after VPS poller upserts chunk vector to Qdrant

### ingest_corpus.py

- INPUT_FILE is hardcoded — must be manually changed between runs
- Located at: `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\ingest_corpus.py`
- PROCEDURE_ONLY flag — False for full corpus ingest
- Dedup logic: repeated citations get [2], [3] suffixes
- DESTRUCTIVE UPSERT WARNING: ON CONFLICT DO UPDATE resets embedded=0 on citation collision

### master_corpus files (session 12)

- master_corpus_part1.md: 488 chunks · `arcanthyr-console/master_corpus_part1.md`
- master_corpus_part2.md: 683 chunks · `arcanthyr-console/master_corpus_part2.md`
- New corpus: preservation-focused Master prompt + Repair pass · hoc-b{N}-m{N}-{slug} citation format
- Total: 1,171 chunks · all enriched=1 · poller embedding overnight

### retrieval_baseline.sh

- Location: VPS `~/retrieval_baseline.sh`
- Auth: KEY auto-reads from `~/ai-stack/.env` — no manual export needed
- Field name: `query_text`
- Results in `~/retrieval_baseline_results.txt`
- **Last run: 22 Mar 2026 (session 13) — 14 pass / 3 partial / 0 fail (new corpus)**
- Q2 BRD partial (BRD chunk now ingested — verify next run) · Q9 guilty plea partial (corpus gap) · Q13 case_chunk RRF noise

### Word artifact cleanup

- **gen_cleanup_sql.py** — run locally, strips Word formatting artifacts from raw_text
- **131 rows cleaned 18 Mar 2026** — re-run if new Word-derived chunks ingested

---

## PROCESS_BLOCKS.PY PIPELINE NOTES

- `gpt-4o-mini-2024-07-18` — use this model string. Do NOT use gpt-5.x — near-empty output
- `max_completion_tokens` not `max_tokens`; no `temperature`; normalise `\r\n`
- `PART1_END = 28` in process_blocks.py
- 56 blocks total · completed 20 Mar 2026 (session 10 overnight run)
- New Master prompt: preservation-focused, 500-800 word body target, verbatim/near-verbatim prose
- REPAIR_PROMPT: second pass catches thin chunks
- Citation format: `hoc-b{N}-m{N}-{slug}`

---

---

### Secondary Sources Upload Pipeline

Two paths:

**Paste path** (single formatted block):
- Upload.jsx detects <!-- block_ prefix → extracts [CITATION:] client-side → api.uploadCorpus → handleUploadCorpus → D1 insert (enriched=1, embedded=0) → poller embeds

**Drag-and-drop path** (.docx/.pdf/.txt):
- File base64 encoded → POST /api/ingest/process-document → Worker proxies to server.py /process-document → background thread: extract text (python-docx/pypdf) → split_chunks_from_markdown → per-block GPT-4o-mini Master Prompt → post_chunk_to_worker → D1 inserts → job_id returned → UI polls /api/ingest/status/:jobId every 5s

Citation priority in split_chunks_from_markdown:
1. [CASE:] value → {source_name}_{slugified_case}
2. [CITATION:] value (not bare year) → {source_name}_{slugified_citation}
3. Fallback → {source_name}_chunk_{i+1:04d}_{heading_slug}

Source title uses chunk heading (not filename stem).

---

## FUTURE ROADMAP

- **Fix malformed corpus row** — `hoc-b{BLOCK_NUMBER}-m001-drug-treatment-orders` · D1 id and Qdrant chunk_id both need correcting · identify correct block number first
- **Restore Claude API key in VPS .env** — console.anthropic.com login loop blocking access · contact support@anthropic.com · update both VPS .env and Wrangler secret once resolved
- **handleFetchSectionsByReference LIKE fix** — replace ID slug LIKE match with FTS5 search
- **subject_matter retrieval filter** — scope case chunk Qdrant pass to criminal cases for criminal law queries · pending cases.subject_matter population after overnight reprocess
- **Extend scraper to HCA/FCAFC** — after async pattern confirmed at volume
- **Retrieval eval framework** — formalise scored baseline as standing process
- **Cloudflare Browser Rendering /crawl** — Free plan. For Tasmanian Supreme Court sentencing remarks
- **FTS5 as mandatory third RRF source** — validate post-scraper-run
- **Qwen3 UI toggle** — add third button to model toggle
- **Nightly cron for xref_agent.py** — after scraper actively running
- **Stare decisis layer** — surface treatment history from case_citations
- **Agent work** — contradiction detection, coverage gap analysis, citation network traversal
- **Legislation enrichment via Claude API** — plain English summaries, cross-references
- **CHUNK finish_reason: length** — increase CHUNK max_tokens from 1,500 if truncation rate unacceptable
- **Dead letter queue** — for chunks that fail max_retries. Low priority
- **Word artifact cleanup** — re-run gen_cleanup_sql.py if new Word-derived chunks ingested
- **RRF displacement of case chunks** — case chunks only in semantic pass · BM25/FTS5 secondary-source hits accumulate rank that outpaces case chunks · need to boost case_chunk RRF contribution or add explicit score-weighted pass
