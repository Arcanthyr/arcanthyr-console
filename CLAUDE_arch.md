# CLAUDE_arch.md — Arcanthyr Architecture Reference
*Updated: 23 March 2026 (end of session 16). Upload every session alongside CLAUDE.md.*

---

## ARCHITECTURE OVERVIEW

**Stack:** Cloudflare Worker (`arcanthyr-api`) + D1 (`arcanthyr`) + Qdrant (`general-docs-v2`) + Ollama/pplx-embed (Docker) + nexus `server.py` (Docker `agent-general`)

| Component | Detail |
|---|---|
| VPS | Contabo · `31.220.86.192` · Ubuntu 24.04 · 23GB RAM · 6 vCPU |
| Live site | `arcanthyr.com` (Cloudflare Worker custom domain) |
| GitHub | `https://github.com/Arcanthyr/arcanthyr-console` |
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
Console upload → Worker → D1 (raw_text stored, enriched=0, embedded=0)
                       → NO nexus call (fire-and-forget removed in v9)

VPS enrichment_poller.py (permanent Docker service, --loop):
  [EMBED] pass   → enriched=1, embedded=0 rows → pplx-embed → Qdrant → embedded=1
  [CASE-EMBED]   → case_chunks done=1, embedded=0 → pplx-embed → Qdrant → embedded=1
  [LEG]          → legislation embedded=0 → pplx-embed → Qdrant → embedded=1
  [ENRICH]       → unenriched secondary_sources → GPT-4o-mini (OpenAI API) → enriched_text → enriched=1
```

**CRITICAL — After any secondary_sources ingest, manually set enriched=1:**
```sql
UPDATE secondary_sources SET enriched=1 WHERE enriched=0;
```
New rows land with `enriched=0`. Poller's embed pass only picks up `enriched=1, embedded=0` rows. Without this step, rows sit invisible to the poller forever.

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
Pass 1 — Semantic: Qdrant cosine (pplx-embed), top 6, min score 0.45, court hierarchy re-rank within 0.05 band
Pass 2 — Concept search: second-pass re-embed of extracted legal terms, adds candidates above 0.45
Pass 3 — BM25 section fetch: explicit section references → D1 legislation sections, score=0.0
Pass 4 — BM25 case-law fetch: cases citing referenced legislation, score=0.0
Pass 5 — Case chunk pass (UNCONDITIONAL — session 8): Qdrant filtered to type=case_chunk, threshold 0.35, top 4, merged with dedup. Runs on every query — no gate.

**Diagnostic rule:** empty or unexpected results → first check:
`docker compose logs --tail=50 agent-general`
Skip/error messages are logged per-pass and visible immediately.

---

## CORPUS PIPELINE — SECONDARY SOURCES (v3, session 12)

**Session 13 corpus state:**
- Part 1: 488 chunks · Part 2: 683 chunks · BRD manual chunk: 1 · Total: 1,172 chunks
- All enriched=1 · all embedded=1 · FTS5 backfilled (1,171 rows — BRD chunk also in FTS5)
- Next manual chunk block number: hoc-b057 (hoc-b056 is highest corpus block)
- Malformed row: hoc-b{BLOCK_NUMBER}-m001-drug-treatment-orders — fix pending
- Corpus uses preservation-focused Master prompt + Repair pass from process_blocks.py

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
- **CHUNK message:** reads `chunk_text` from `case_chunks` → GPT-4o-mini-2024-07-18 call with v3 prompt → writes `principles_json` + `enriched_text`, sets `done=1` → checks `COUNT(*) WHERE done=0` → if 0, merges all chunk results + derives `subject_matter` → writes `deep_enriched=1` + `subject_matter` to `cases` → `ack()`
- **Frontend:** polls `/api/legal/case-status` — `enriched=1` set after Pass 1, `deep_enriched=1` set after merge

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

## ARCANTHYR-UI (session 16)

**Stack:** React + Vite + Cloudflare Pages (deploy pending)
**Repo location:** `arcanthyr-console/arcanthyr-ui/`
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
- `Library.jsx` — 3 tabs: cases/corpus/legislation · case rows clickable → split reading pane with Facts/Holding/Principles tabs
- Components: `Nav.jsx`, `ResultCard.jsx`, `PrincipleCard.jsx`, `ReadingPane.jsx`, `ShareModal.jsx`, `PipelineStatus.jsx`

**Production deploy (pending):**
- Cloudflare Pages project not yet created
- Will need `VITE_API_BASE` env var pointing to `https://arcanthyr.com`
- Build command: `npm run build` · output dir: `dist`

---

## KEY FILE LOCATIONS

| File | Path |
|---|---|
| enrichment_poller.py | `Arc v 4/scripts/enrichment_poller.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| server.py (nexus) | `Arc v 4/server.py` (local) · `~/ai-stack/agent-general/src/server.py` (VPS canonical) |
| xref_agent.py | `Arc v 4/xref_agent.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| ingest_corpus.py | `arcanthyr-console/ingest_corpus.py` — run from there, NOT from `Arc v 4/` |
| ingest_part2.py | `arcanthyr-console/ingest_part2.py` — standalone part2 ingest script |
| reingest_duplicates.py | `arcanthyr-console/reingest_duplicates.py` |
| gen_cleanup_sql.py | `arcanthyr-console/gen_cleanup_sql.py` |
| retrieval_baseline.sh | VPS `~/retrieval_baseline.sh` — results in ~/retrieval_baseline_results.txt |
| master_corpus_part1.md | `arcanthyr-console/Arc v 4/master_corpus_part1.md` — 488 chunks (session 12) |
| master_corpus_part2.md | `arcanthyr-console/Arc v 4/master_corpus_part2.md` — 683 chunks (session 12) |
| sentencing_first_offenders.md | `arcanthyr-console/` — 1 procedure chunk, ingested session 4 |
| scripts/ | `Arc v 4/scripts/` — all support scripts committed 18 Mar 2026 |
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

- **Current state (session 12):** Empty — wiped for clean corpus ingest · needs backfill after embed pass
- **Sync:** `handleUploadCorpus` uses `INSERT OR REPLACE INTO secondary_sources_fts` (fixed session 12) — re-ingest safe
- **Query route:** POST `/api/pipeline/fts-search` — returns `source_id`, `title`, `bm25_score`
- **Export limitation:** `npx wrangler d1 export` does not support virtual tables
- **Backfill:** `INSERT INTO secondary_sources_fts (rowid, source_id, title, raw_text) SELECT rowid, id, title, raw_text FROM secondary_sources WHERE id NOT IN (SELECT source_id FROM secondary_sources_fts)`

---

## KNOWN ISSUES / WATCH LIST

- **secondary_sources_fts empty** — wiped session 12 for clean ingest · backfill needed after embed pass · BM25/FTS5 retrieval pass blind until fixed
- **Docker internal hostnames** — poller must use `OLLAMA_URL=http://ollama:11434` and `QDRANT_URL=http://qdrant-general:6333`
- **Qdrant port mapping** — host-side: 6334. Inside Docker network: 6333
- **Nexus health check port is 18789** — not 8000
- **Always set enriched=1 after secondary_sources ingest** — new rows land with enriched=0
- **ingest_corpus.py destructive upsert** — ON CONFLICT DO UPDATE resets embedded=0 on citation collision
- **upload-corpus auth** — uses User-Agent spoof, NOT X-Nexus-Key
- **Category normalisation** — DONE session 3. 8 canonical categories
- **Word artifact noise** — 131 secondary_sources chunks cleaned 18 Mar 2026. Re-run gen_cleanup_sql.py if new Word-derived corpus chunks ingested
- **AustLII block** — VPS IP (31.220.86.192) permanently blocked. Scraper must run locally on Windows only
- **Cloudflare Workers Observability** — use `npx wrangler tail arcanthyr-api` for real-time logs
- **PowerShell SSH quoting mangles auth headers** — never test API routes via SSH from PowerShell
- **CHUNK prompt v3 live** — deployed session 14 · 6-type classification · enriched_text primary output · faithful prose principles · 5,187 chunks requeued for reprocess · completing overnight · run retrieval baseline after re-embed confirms complete
- **subject_matter pending** — cases.subject_matter populating overnight as chunks complete · verify criminal/civil split before using as retrieval filter
- **Workers AI content moderation** — Qwen3 blocks graphic evidence · CHUNK enrichment on GPT-4o-mini · Pass 1/Pass 2 still on Workers AI — monitor

### CHUNK message handler — v3 prompt (session 14)
CHUNK queue consumer calls GPT-4o-mini-2024-07-18 with v3 enrichment prompt. Switched from Workers AI (Qwen3) in session 10 due to content moderation blocks on graphic legal content.

**v3 prompt changes (session 14):**
- 6-type chunk classification: reasoning / evidence / submissions / procedural / header / mixed
- enriched_text field: 200-350 word prose synthesis for reasoning chunks; honest description for other types
- reasoning_quotes: up to 2 verbatim judicial passages per chunk
- subject_matter: criminal/civil/administrative/family/mixed/unknown
- principles stated in judge's own doctrinal terms — not IF/THEN abstraction
- max 2 principles per chunk (was unlimited, caused repetition across chunks)
- max_completion_tokens: 1,600 (was 2,500)
- Code-side validator: strips authorities not named in excerpt, enforces type gates, caps array lengths

**User message format (v3):**
Includes: Case, Court, Judge, Date, Chunk N of M, Hint (header/unknown), Case context Facts/Issues, EXCERPT START/END delimiters

**isLikelyHeader() function:** detects chunk_index=0 with uppercase label patterns (COURT:/CITATION:/PARTIES: etc) — passes role_hint: 'header' to suppress principle extraction from header chunks

**empty extraction guard:** enriched_text present and >30 words = valid done state regardless of principles/holdings arrays being empty (prevents infinite retry on evidence/header chunks)

**Reprocess session 14:** all 5,187 case chunks reset done=0, all case_chunk Qdrant vectors deleted, requeued overnight. Secondary sources and legislation untouched.

### Admin requeue routes (added session 10)
- POST /api/admin/requeue-chunks — reads case_chunks WHERE done=0, enqueues CHUNK messages
- POST /api/admin/requeue-metadata — reads cases WHERE enriched=0, enqueues METADATA messages
- Both require X-Nexus-Key auth
- PowerShell trigger: `$key = (Select-String "NEXUS_SECRET_KEY" .env).Line.Split("=")[1]` then `Invoke-WebRequest -Uri "https://arcanthyr.com/api/admin/requeue-X" -Method POST -Headers @{"X-Nexus-Key"=$key} -UseBasicParsing | Select-Object -ExpandProperty Content`

### handleUploadCorpus — FTS5 fix (session 12)
- Previous behaviour: `INSERT INTO secondary_sources_fts` — failed with SQLITE_CONSTRAINT on any re-ingest where FTS5 already had rows for that citation
- Fixed: `INSERT OR REPLACE INTO secondary_sources_fts` — deployed version 2d3716de
- Workaround if 500 errors still appear: `DELETE FROM secondary_sources_fts` before ingest run

---

## SCRAPER CONFIG

- Courts: TASSC, TASCCA, TASFC, TAMagC
- Years: `range(2025, 2004, -1)` — 2025 to 2005 inclusive
- `MAX_CASES_PER_SESSION`: 150 (raised session 16 from 100)
- Delays: 10–20s random + 7% chance of 25-45s behavioural jitter (added session 16) · Business hours: 08:00–18:00 AEST
- Schedule: Windows Task Scheduler · noon (`run_scraper.bat`) + 18:00 (`run_scraper_evening`) · throughput ~300 cases/day
- Proxy: `arcanthyr.com/api/legal/fetch-page` — routes via Cloudflare edge (VPS IP blocked)
- Upload timeout: 120s
- **Current position:** stopped at TASSC/2020/5 (session limit) · will resume TASSC/2020/6 next run
- **Progress file:** `arcanthyr-console/Local Scraper/scraper_progress.json` — NO per-case resume · stores court_year: "done" only

**extract_text() pipeline (session 7 — current):**
1. BeautifulSoup: remove script/style/nav/header/footer tags
2. Extract judgment div or body
3. Get plain text
4. `_strip_boilerplate()` — remove AustLII navigation patterns
5. **Header truncation:** find first `COURT :` or `CITATION :` marker; truncate everything before it
6. `_strip_noise_lines()` — remove navigation keyword lines
7. `_deduplicate_orders()` — remove duplicate ORDERS block
8. `_compress_whitespace()` — normalise blank lines and spaces

---

## CLOUDFLARE ACCOUNT

- **Plan:** Workers Paid ($5/month) — neuron cap removed (session 10)
- **Account ID:** `def9cef091857f82b7e096def3faaa25`

---

## COMPONENT NOTES

### Windows Task Scheduler — scraper automation

- Task name: Arcanthyr Scraper
- Triggers: Daily at 12:00 PM (noon) AEST — neurons reset 11am Hobart, one hour buffer
- Action: runs `C:\Users\Hogan\run_scraper.bat` — MUST be local path (not OneDrive)
- Business hours gate in scraper handles time window
- Exit code 2 = business hours gate fired (normal/expected outside hours)

### backfill_case_chunk_names.py

- Location: `arcanthyr-console\backfill_case_chunk_names.py` (local) · `/home/tom/backfill_case_chunk_names.py` (VPS)
- Run from VPS only — fetches cases via Worker API, updates Qdrant at `localhost:6334`
- Do NOT run from Windows — Qdrant port 6334 is localhost-only on VPS

### enrichment_poller.py

Volume-mounted at `./agent-general/src:/app/src`. Runs as permanent Docker service.

**Modes:** `--mode enrich`, `--mode embed`, `--mode both`, `--mode reconcile`, `--loop`, `--status`

**Cases enrichment path:** handled by Cloudflare Queue consumer (Worker), not the poller. METADATA message → Pass 1 metadata + chunk split. CHUNK messages → per-chunk principle extraction → merge.

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
- `deep_enriched INTEGER DEFAULT 0` — set to 1 after all CHUNK messages complete

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

- master_corpus_part1.md: 488 chunks · `Arc v 4/master_corpus_part1.md`
- master_corpus_part2.md: 683 chunks · `Arc v 4/master_corpus_part2.md`
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

## FUTURE ROADMAP

- **Fix malformed corpus row** — `hoc-b{BLOCK_NUMBER}-m001-drug-treatment-orders` · D1 id and Qdrant chunk_id both need correcting · identify correct block number first
- **Restore Claude API key in VPS .env** — console.anthropic.com login loop blocking access · contact support@anthropic.com · update both VPS .env and Wrangler secret once resolved
- **handleFetchSectionsByReference LIKE fix** — replace ID slug LIKE match with FTS5 search
- **subject_matter retrieval filter** — scope case chunk Qdrant pass to criminal cases for criminal law queries · pending cases.subject_matter population after overnight reprocess
- **Duplicate principle deduplication** — compare principles across chunks of same case by semantic similarity post-reprocess · merge/suppress near-duplicates
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
- **Word artifact cleanup** — re-run gen_cleanup_sql.py if new Word-derived corpus chunks ingested
- **RRF displacement of case chunks** — case chunks only in semantic pass · BM25/FTS5 secondary-source hits accumulate rank that outpaces case chunks · need to boost case_chunk RRF contribution or add explicit score-weighted pass
- **Re-embed pass** — COMPLETED session 14 · case chunks re-embedded from enriched_text overnight · secondary sources [:5000] and legislation [:3000] unchanged from session 9 fix
