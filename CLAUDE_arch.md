# CLAUDE_arch.md — Arcanthyr Architecture Reference
*Updated: 18 March 2026 (end of session 6). Upload every session alongside CLAUDE.md.*

---

## ARCHITECTURE OVERVIEW

**Stack:** Cloudflare Worker (`arcanthyr-api`) + D1 (`arcanthyr`) + Qdrant (`general-docs-v2`) + Ollama/pplx-embed (Docker) + nexus `server.py` (Docker `agent-general`)

| Component | Detail |
|---|---|
| VPS | Contabo · `31.220.86.192` · Ubuntu 24.04 · 23GB RAM · 6 vCPU |
| Live site | `arcanthyr.com` (Cloudflare Worker custom domain) |
| GitHub | `https://github.com/Arcanthyr/arcanthyr-console` |
| Cloudflare plan | Workers Free · Account ID: `def9cef091857f82b7e096def3faaa25` |

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

**enrichment-poller is now a permanent Docker service (added session 5):**
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

VPS enrichment_poller.py (manual or cron):
  --mode enrich    → enriched=0 rows → Claude API → enriched_text → enriched=1
  --mode embed     → enriched=1, embedded=0 rows → pplx-embed → Qdrant → embedded=1
                   → also runs legislation embedding pass automatically
                   → also runs case_chunk embedding pass (added session 2)
  --mode both      → enrich then embed in sequence
  --mode reconcile → diffs D1 embedded=1 vs Qdrant chunk_ids → resets missing to embedded=0
  --loop           → runs continuously (15s sleep between passes)
  --status         → prints pipeline counts and exits
```

**CRITICAL — After any secondary_sources ingest, manually set enriched=1:**
```sql
UPDATE secondary_sources SET enriched=1 WHERE id LIKE '%[procedure]%' AND enriched=0;
-- or for all unenriched rows:
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
| Future secondary source uploads (small volume) | Claude API via poller | Acceptable for low volume |

**Secondary sources corpus:** 2,032 rows (1,138 master + 892 procedure + 1 corroboration + 1 sentencing). All enriched=1. `enriched_text` is NULL — correct, poller falls back to `raw_text`. Do NOT run `--mode enrich` on these rows.

---

## RETRIEVAL ARCHITECTURE (v4 — SESSION 5)

Two separate retrieval layers — Worker.js and server.py are distinct:

**Layer 1 — Worker.js handleLegalQuery (primary user-facing)**
Calls server.py /search → gets semantic + case chunk results
Runs in-memory BM25 against secondary_sources corpus (~2,032 docs)
Calls /api/pipeline/fts-search (D1 FTS5) for keyword pass
RRF blend (k=60) across all three passes
Returns blended chunks to Claude API (primary) / Workers AI Qwen3 (fallback)

**Layer 2 — server.py search_text() (called by Worker)**

Pass 1 — Semantic: Qdrant cosine similarity (pplx-embed-context-v1)
         top 6, min score 0.45, re-ranked by court hierarchy within 0.05 band

Pass 2 — Concept search: second-pass re-embed of extracted legal terms
         adds candidates above 0.45 threshold

Pass 3 — BM25 section fetch: explicit section references → D1 legislation sections
         appended with score=0.0, not subject to score threshold

Pass 4 — BM25 case-law fetch: cases citing referenced legislation
         appended with score=0.0

Pass 5 — Case chunk second-pass (NEW session 5):
         Qdrant filtered to type=case_chunk · threshold 0.15 · top 4
         Merged before return · catches dense transcript text that loses semantic race at 0.45

CRITICAL architectural facts:
- RRF blend is in Worker.js — NOT server.py
- server.py has no RRF, no in-memory BM25 corpus, no FTS5
- Case chunks only exist in Qdrant — invisible to BM25/FTS5 passes in Worker.js
- Case chunk second-pass in server.py is the only mechanism that surfaces case chunks
- Kill switch: BM25_FTS_ENABLED flag is in Worker.js (not server.py)

---

## ASYNC JOB PATTERN — LIVE (deployed 18 March 2026, session 2)

**Problem:** fetch-case-url and PDF case uploads timeout on large judgments. Worker has 30s wall-clock limit. summarizeCase() runs up to 6 sequential Workers AI calls on large judgments.

**Confirmed correct solution: Cloudflare Queues**

Rejected alternatives (do not revisit without new information):
- Fire-and-forget / ctx.waitUntil() — removed in Worker v9. Silently drops calls at volume (confirmed). ctx.waitUntil() has same problem on nexus write-back path.
- CF REST API for Workers AI from VPS — requires paid Cloudflare API token. Outside free tier intent.
- VPS Qwen3 for case enrichment — explicitly rejected architecture decision. Enrichment stays in Worker via Workers AI.
- Cloudflare Queues was previously deferred (early March) only because the VPS poller was simpler at the time for secondary_sources. For cases it is the right and only viable free path.

**LIVE implementation:**
- Queue name: `arcanthyr-case-processing`
- **METADATA message:** Pass 1 (first 8k chars) → one Workers AI call → writes `case_name`, `judge`, `parties`, `facts`, `issues`, `enriched=1` to D1 → splits full `raw_text` into 3k-char chunks → writes to `case_chunks` table → enqueues one CHUNK message per chunk → `ack()`
- **CHUNK message:** reads `chunk_text` from `case_chunks` → one Workers AI call → writes `principles_json`, sets `done=1` → checks `COUNT(*) WHERE done=0` for this citation → if 0, merges all chunk results → writes `principles_extracted`, `holdings_extracted`, `legislation_extracted`, `authorities_extracted`, `deep_enriched=1` to `cases` → `ack()`
- **Frontend:** polls `/api/legal/case-status` — `enriched=1` set after Pass 1 (fast metadata, seconds), `deep_enriched=1` set after merge completes (background, minutes)
- **No wall-clock risk:** each queue consumer execution makes exactly one Workers AI call

---

## NEXUS SERVER.PY — ROUTES AND GLOBALS

**All routes require `X-Nexus-Key` header except `/health`.**

| Method | Route | Handler | Notes |
|---|---|---|---|
| GET | `/health` | inline | Returns `{"status":"ok"}` — no auth |
| POST | `/ingest` | `ingest_text()` | Embed + upsert chunk to Qdrant · sets _bm25_corpus["dirty"]=True |
| POST | `/search` | `search_text()` | Triple-pass hybrid retrieval: semantic + BM25 + FTS5 → RRF |
| POST | `/query` | `query_qwen()` | search + Qwen3 inference |
| POST | `/extract-pdf` | `extract_pdf_text()` | pdfminer only |
| POST | `/extract-pdf-ocr` | `extract_pdf_text_ocr()` | pdfminer + OCR fallback |
| POST | `/delete` | `delete_citation()` | Delete Qdrant vectors by `citation` field |
| POST | `/delete-by-type` | `delete_type()` | Delete Qdrant vectors by `type` field |
| POST | `/process-document` | `process_document()` | Extract text → split to ~3k-word blocks → GPT enrichment per block (Master + Procedure if prompt_mode='both') → parse chunks → insert to D1. Runs in background thread, returns `job_id` immediately. |
| GET | `/ingest-status/<job_id>` | `get_ingest_status()` | Returns live job state from `INGEST_JOBS` dict |

**Key module-level globals (server.py):**

| Global | Value | Purpose |
|---|---|---|
| `INGEST_JOBS` | `{}` | In-memory job store — maps `job_id → job state dict`. Cleared on container restart. |
| `MASTER_PROMPT` | long string constant | GPT enrichment prompt for doctrine/case law pass |
| `PROCEDURE_PROMPT` | long string constant | GPT enrichment prompt for practitioner procedure/script pass |
| `EMBED_MODEL` | `argus-ai/pplx-embed-context-v1-0.6b:fp32` | Ollama embedding model |
| `COLLECTION` | `general-docs-v2` | Qdrant collection name |
| `_bm25_corpus` | dict | In-memory BM25 corpus cache: docs, tf, df, avg_dl, built_at, dirty |
| `BM25_TTL` | 600 | BM25 corpus rebuild TTL in seconds |
| `BM25_K1` | 1.5 | BM25 term frequency saturation parameter |
| `BM25_B` | 0.75 | BM25 document length normalisation parameter |
| `BM25_TOP_K` | 10 | Number of BM25 candidates per query |
| `BM25_FTS_ENABLED` | True | Kill switch for D1 FTS5 retrieval pass |

**process-document known limitations:**
- `prompt_mode: "both"` FIXED session 3 — now runs Master + Procedure prompts per block
- `python-docx` and `striprtf` not installed in agent-general container — DOCX/RTF uploads will error
- `OPENAI_API_KEY` must be set in container env

**Worker.js ingest proxy routes:**

| Method | Route | Forwards to | Auth |
|---|---|---|---|
| POST | `/api/ingest/upload-document` | `https://nexus.arcanthyr.com/process-document` | `X-Nexus-Key` |
| GET | `/api/ingest/status/:jobId` | `https://nexus.arcanthyr.com/ingest-status/{jobId}` | `X-Nexus-Key` |

**Corpus chunk POST requirements (CF WAF):** chunks from server.py to Worker `/api/legal/upload-corpus` must use:
- `text` field: base64-encoded UTF-8 string
- `"encoding": "base64"` field in body
- `User-Agent: Mozilla/5.0 (compatible; Arcanthyr/1.0)` header
- No `X-Nexus-Key` header on upload-corpus route — uses User-Agent spoof instead

---

## PHASE 5 DESIGN (LOCKED)

- Qdrant top 6 chunks, min score 0.45, max 8
- Re-rank by court hierarchy within 0.05 band: CCA/FullCourt > Supreme > Magistrates
- Full metadata per chunk
- Claude API primary → Workers AI (Qwen3-30b) fallback
- API key via `npx wrangler secret put ANTHROPIC_API_KEY`

---

## KEY FILE LOCATIONS

| File | Path |
|---|---|
| enrichment_poller.py | `Arc v 4/scripts/enrichment_poller.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| server.py (nexus) | `Arc v 4/arcanthyr-nexus/server.py` (local, gitignored) · `~/ai-stack/agent-general/src/server.py` (VPS) |
| xref_agent.py | `Arc v 4/xref_agent.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| ingest_corpus.py | `arcanthyr-console/ingest_corpus.py` — run from there, NOT from `Arc v 4/` |
| reingest_duplicates.py | `arcanthyr-console/reingest_duplicates.py` — run from there |
| gen_cleanup_sql.py | `arcanthyr-console/gen_cleanup_sql.py` — generates SQL to strip Word artifacts from raw_text |
| cleanup_corpus.py | VPS `~/cleanup_corpus.py` — applies Word artifact cleanup via upload-corpus upsert |
| ingest_corroboration.py | VPS `~/ingest_corroboration.py` — one-off corroboration chunk ingest script |
| retrieval_baseline.sh | VPS `~/retrieval_baseline.sh` — 15 baseline questions, results in ~/retrieval_baseline_results.txt |
| master_corpus_part1.md | `arcanthyr-console/` — 317 chunks (32 master + 285 procedure) |
| master_corpus_part2.md | `arcanthyr-console/` — 821 chunks (214 master + 607 procedure) |
| sentencing_first_offenders.md | `arcanthyr-console/` — 1 procedure chunk, ingested session 4 |
| scripts/ | `Arc v 4/scripts/` — all support scripts committed 18 Mar 2026 |
| worker.js | `Arc v 4/worker.js` (renamed from Worker.js session 3) |
| CLAUDE.md | `Arc v 4/CLAUDE.md` |
| CLAUDE_arch.md | `Arc v 4/CLAUDE_arch.md` |
| austlii_scraper.py | `arcanthyr-console/Local Scraper/austlii_scraper.py` — runs on Windows only (VPS IP blocked) |
| scraper_progress.json | `arcanthyr-console/Local Scraper/scraper_progress.json` — recreated session 4, TASSC 2024 will resume from case 1 |
| docker-compose.yml | `~/ai-stack/docker-compose.yml` (VPS) |
| RAG_Workflow_Arcanthyr_v3.docx | `arcanthyr-console/` — updated 18 Mar 2026 |
| debug_parse.py | `arcanthyr-console/debug_parse.py` — one-off parser diagnostic script, safe to delete |

**server.py is volume-mounted** (`./agent-general/src:/app/src` in docker-compose.yml) — NOT baked into image. Changes only require: edit locally → SCP to VPS → `docker compose up -d --force-recreate agent-general` → health check. No rebuild unless Dockerfile changes.

**SCP command for server.py:**
```powershell
scp "path\to\server.py" tom@31.220.86.192:/home/tom/ai-stack/agent-general/src/server.py
```

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

- **Populated:** 2,031 rows (full corpus including non-embedded rows)
- **Sync:** INSERT and DELETE routes in Worker updated to maintain FTS table
- **Query route:** POST `/api/pipeline/fts-search` — returns `source_id`, `title`, `bm25_score`
- **Export limitation:** `npx wrangler d1 export` does not support virtual tables. Drop, export, recreate if backup needed.
- **Backfill if gap detected:** `INSERT INTO secondary_sources_fts (rowid, source_id, title, raw_text) SELECT rowid, id, title, raw_text FROM secondary_sources WHERE id NOT IN (SELECT source_id FROM secondary_sources_fts)`

---

## KNOWN ISSUES / WATCH LIST

- **Docker internal hostnames** — poller must use `OLLAMA_URL=http://ollama:11434` and `QDRANT_URL=http://qdrant-general:6333`. Never `localhost` inside a container.
- **Poller env var is OLLAMA_URL not OLLAMA_HOST** — now set in docker-compose.yml. Pass explicitly to docker compose exec if not already set.
- **Qdrant port mapping** — host-side: 6334. Inside Docker network: 6333.
- **Nexus health check port is 18789** — not 8000.
- **Always set enriched=1 after secondary_sources ingest** — new rows land with enriched=0. Poller won't touch them until enriched=1.
- **ingest_corpus.py destructive upsert** — ON CONFLICT DO UPDATE resets embedded=0 and wipes enriched_text on citation collision. Never re-run against already-ingested citations.
- **ingest_corpus.py block separator format** — `<!-- block_NNN master -->` or `<!-- block_NNN procedure -->` (with type word). PowerShell Out-File writes BOM which corrupts separator matching. Always use Python to write corpus files. Confirmed session 4.
- **upload-corpus auth** — uses User-Agent spoof, NOT X-Nexus-Key. Python urllib User-Agent blocked by CF WAF — always set `User-Agent: Mozilla/5.0 (compatible; Arcanthyr/1.0)`.
- **Category normalisation** — DONE session 3. 8 canonical categories. Canonical values: annotation, case authority, procedure, doctrine, checklist, practice note, script, legislation.
- **Word artifact noise** — 131 secondary_sources chunks cleaned 18 Mar 2026. Re-run gen_cleanup_sql.py if new Word-derived corpus chunks ingested.
- **authorities_extracted vs key_authorities** — D1 column is `authorities_extracted`. `key_authorities` is Llama prompt field only — does NOT exist in D1.
- **case_name missing from Qdrant for existing cases** — fix in server.py applies to future ingests only. Backfill deferred.
- **Unknown chunk in sources panel** — pre-existing chunk with incomplete metadata (`citation: unknown`).
- **Llama returning literal `"null"` string** — latent risk. Audit D1 after bulk scraping.
- **Workers AI prompt length sensitivity** — verbose prompts cause CPU timeout. Keep concise.
- **AustLII block** — VPS IP (31.220.86.192) permanently blocked. Scraper must run locally on Windows only.
- **Cloudflare Workers Observability** — use `npx wrangler tail arcanthyr-api` for real-time logs (not CF dashboard — events may lag 2 minutes).
- **OpenAI mini API quirks** — `max_completion_tokens` not `max_tokens`; no `temperature`; normalise `\r\n` before regex.
- **PowerShell SSH quoting mangles auth headers** — never test API routes via SSH from PowerShell. SSH to VPS first, then run curl.
- **TASSC 2024 scraper timeouts** — cases 3, 8, 9, 10 failed with HTTP 0 in previous run. Zero rows in D1. Will retry when scraper resumes.
- **Pre-scraper gate** — CLEARED session 4. Queues live + baseline 15/15. Scraper ready.
- **BM25 corpus cold start** — ~2s delay on first query after container restart. Acceptable.
- **FTS5 export limitation** — wrangler d1 export does not support virtual tables.
- **tmux send-keys poller pattern** — DO NOT use. Fires into wrong context, runs in main shell, dies on SSH disconnect. Attach to tmux manually instead. Confirmed session 4.

---

## SCRAPER CONFIG

- Courts: TASSC, TASCCA, TASFC, TAMagC
- Years: `range(2025, 2004, -1)` — 2025 to 2005 inclusive
- `MAX_CASES_PER_SESSION`: 100
- Delays: 10–20s random · Business hours: 08:00–18:00 AEST
- Proxy: `arcanthyr.com/api/legal/fetch-page` — routes via Cloudflare edge (VPS IP blocked)
- Upload timeout: 120s (acceptable now that Worker returns immediately via Queues)
- **Gate CLEARED session 4: (1) Cloudflare Queues async pattern confirmed, (2) retrieval baseline 15/15 complete**
- **Progress file:** `arcanthyr-console/Local Scraper/scraper_progress.json` — 2025 courts marked done, resumes at TASSC 2024/11 (cases 1–10 ingested session 6).
- **Automation:** Windows Task Scheduler fires run_scraper.bat daily at 8am AEST

**Scraping workflow:**
```
austlii_scraper.py (local Windows)
    → fetches AustLII HTML via arcanthyr.com/api/legal/fetch-page proxy
    → strips HTML to plain text locally
    → derives citation from URL structure
    → POSTs raw text + citation + court_hint to /api/legal/upload-case
        → Worker: METADATA queue message → Pass 1 metadata + chunk split
                  CHUNK queue messages → per-chunk principles → merge → deep_enriched=1
    → nexus /ingest embed pass via poller (not inline)

Post-scrape checklist:
    - Run xref_agent.py --mode both after each batch
    - Audit D1 for Llama literal "null" strings
    - Check D1 for cases with null case_name/facts (hidden in library UI)
```

**If progress file is lost:** recreate manually with courts already processed marked "done":
```json
{
  "TASSC_2025": "done",
  "TASCCA_2025": "done",
  "TASFC_2025": "done",
  "TAMagC_2025": "done"
}
```
Write using Python (not PowerShell Out-File) to avoid encoding issues.

---

## CLOUDFLARE ACCOUNT

- **Plan:** Workers Free
- **Account ID:** `def9cef091857f82b7e096def3faaa25`
- **Browser Rendering `/crawl`** — available on Free plan. Potential future use for secondary source ingestion. NOT suitable for AustLII.

---

## COMPONENT NOTES

### Windows Task Scheduler — scraper automation

- Task name: Arcanthyr Scraper
- Triggers: Daily at 8:00 AM AEST
- Action: runs run_scraper.bat in Local Scraper/ directory
- run_scraper.bat: `cd /d "...Local Scraper" && python austlii_scraper.py`
- Business hours gate in scraper handles time window — task fires daily, gate exits if outside 08:00–18:00
- Exit code 2 = business hours gate fired (normal/expected outside hours)
- Python: resolved via batch file wrapper (WindowsApps sandboxing blocked direct python.exe path)

### backfill_case_chunk_names.py

- Location: `arcanthyr-console\backfill_case_chunk_names.py` (local) · `/home/tom/backfill_case_chunk_names.py` (VPS)
- Run from VPS only — fetches cases via Worker API (`https://arcanthyr.com/api/legal/library?type=cases`), updates Qdrant at `localhost:6334`
- Field mapping: `result.cases[].ref` → citation · `result.cases[].title` → case_name
- Re-run after any bulk case ingestion to backfill case_name into existing Qdrant payloads
- Do NOT run from Windows — Qdrant port 6334 is localhost-only on VPS
- Root cause of session 5 incident: original script used external IP (blocked) + npx subprocess (not on VPS)

### enrichment_poller.py

Volume-mounted at `./agent-general/src:/app/src`. Not container-native — defaults to `localhost` for Ollama/Qdrant. Override via docker compose exec env vars.

**Correct invocation — attach to tmux first:**
```bash
tmux attach -t poller
# inside tmux:
cd ~/ai-stack && docker compose exec -e OLLAMA_URL=http://ollama:11434 -e QDRANT_URL=http://qdrant-general:6333 agent-general python3 /app/src/enrichment_poller.py --loop
# Ctrl+B D to detach
```

Do NOT use `tmux send-keys` — confirmed to run in main shell and die on SSH disconnect (session 4).

**Modes:** `--mode enrich`, `--mode embed`, `--mode both`, `--mode reconcile`, `--loop`, `--status`

**Cases enrichment path:** handled by Cloudflare Queue consumer (Worker), not the poller. METADATA message → Pass 1 metadata + chunk split. CHUNK messages → per-chunk principle extraction → merge. See ASYNC JOB PATTERN section.

**`run_case_chunk_embedding_pass(batch=10)`** — added 18 March 2026 (session 2). Fetches `case_chunks WHERE done=1 AND embedded=0` via `GET /api/pipeline/fetch-case-chunks-for-embedding`. Embeds `chunk_text` via Ollama pplx-embed. Upserts to Qdrant `general-docs-v2` with payload `{ chunk_id, citation, chunk_index, type: 'case_chunk', source: 'AustLII' }`. Marks embedded via `POST /api/pipeline/mark-case-chunks-embedded`. Runs automatically in `--mode embed` and `--mode both`, after secondary sources pass and before legislation pass.

**Default batch:** 50 · **Loop sleep:** 15 seconds

### BM25 + RRF Hybrid Retrieval (added session 3)

**In-memory BM25 corpus (`_bm25_corpus` in server.py):**
- Built on first search query after container start
- Loads all `embedded=1` secondary_sources rows via GET `/api/pipeline/bm25-corpus`
- Tokenises with `bm25_tokenize()` — regex `[a-z0-9]+`, lowercase
- Stores: docs dict, tf dict, df dict, avg_dl float
- Invalidated: `dirty=True` on any ingest call + TTL 600s fallback

**RRF blend (`rrf_blend()` in server.py):**
- Takes semantic_chunks (list) + bm25_results (list) + optional fts_results (list)
- `rrf_score = sum(1/(60 + rank))` across all passes
- BM25-only hits get injected as new chunks with score=0.0, type='secondary_source', bm25=True
- Returns all chunks sorted by rrf_score descending

**D1 FTS5 (`secondary_sources_fts`):**
- Created session 3 · porter tokenizer · 2,031 rows
- Queried via Worker POST `/api/pipeline/fts-search`
- Input sanitised: `replace(/['"*()]/g, ' ')` before MATCH
- Returns `source_id`, `title`, `bm25_score` (negative — lower is better in SQLite FTS5)
- Normalised to positive in server.py via `abs(bm25_score)`
- Gated by `BM25_FTS_ENABLED = True` in server.py

### Workers AI (Cloudflare) — model and usage inventory

**Current model:** `@cf/qwen/qwen3-30b-a3b-fp8` — used for ALL Workers AI calls.

**Active Workers AI calls:**

- **`summarizeCase()`** — two-pass case enrichment at scrape/upload time. Pass 1: facts/issues/case_name/judge/parties. Pass 2: windowed holdings/principles/legislation/key_authorities. Short judgments (≤22,000 chars): single pass. Long judgments: Pass 1 + multiple Pass 2 windows (6+ sequential calls on large judgments — timeout risk, mitigated by Queues).
- **`procedurePassPrompt`** — called after summarizeCase() in processCaseUpload(). Extracts in-court procedural sequences. Returns `NO PROCEDURE CONTENT` if nothing relevant.
- **`handleLegalQueryWorkersAI()`** — Phase 5 fast/free query toggle. Three-path fallback + `budget_tokens: 0` deployed 18 Mar 2026. `max_tokens: 2000` (raised from 800, session 4).
- **`handleDraft()`, `handleNextActions()`, `handleWeeklyReview()`, `handleClarifyAgent()`** — Axiom journal features. Upgrade optional, low priority.
- **`handleAxiomRelay()`** — Three-stage relay pipeline (added session 4). Stage 1: decompose entries to `{ id, surface, intent, constraint }` JSON (900 tokens). Stage 2: identify 3 tensions/opportunities across entries (400 tokens). Stage 3: final SIGNAL / LEVERAGE POINT / RELAY ACTIONS / DEAD WEIGHT report (1,200 tokens). Returns `{ report: string }`. Wired to AI router `axiom-relay` action.

### worker.js — max_tokens on query handlers (updated session 4)

| Handler | Model | max_tokens |
|---|---|---|
| `handleLegalQuery()` | Claude API (claude-sonnet-4-20250514) | 2,000 (raised from 1,024) |
| `handleLegalQueryWorkersAI()` | Workers AI (Qwen3-30b) | 2,000 (raised from 800) |

Both raised session 4 to prevent answer truncation on complex legal queries.

### Workers AI — Qwen3 response shape (18 March 2026)

```javascript
// Three-path fallback (now in handleLegalQueryWorkersAI):
const answer =
  response?.choices?.[0]?.message?.content?.trim() ||
  response?.choices?.[0]?.text?.trim() ||
  response?.response?.trim() ||
  "No response from model.";

// Plus budget_tokens: 0 to disable thinking mode
```

### Qdrant payload field names

- Secondary source type filter: field = `type`, value = `secondary_source` (NOT `source_type`)
- Legislation type filter: field = `type`, value = `legislation`
- Case chunk type filter: field = `type`, value = `case_chunk`
- Ghost points from pre-type-field era were deleted 17 Mar 2026

### secondary_sources D1 schema notes

- PK is `id` (TEXT) — populated from CITATION metadata field in master_corpus
- **No `citation` column exists** — do not query for it. Always use `id`.
- Category default is `'doctrine'` (D1 column default)
- Canonical category values (normalised session 3): annotation, case authority, procedure, doctrine, checklist, practice note, script, legislation
- Full column list: `id, title, source_type, author, date_published, tags, related_cases, related_acts, raw_text, chunk_count, date_added, enriched_text, enriched, embedded, enrichment_error, category, embedding_model, embedding_version`

### cases D1 schema notes

- PK is `id` (TEXT) — citation with spaces replaced by hyphens
- Full column list: `id, citation, court, case_date, case_name, url, full_text, facts, issues, holding, holdings_extracted, principles_extracted, legislation_extracted, key_authorities, offences, judge, parties, procedure_notes, processed_date, summary_quality_score, enriched, embedded, deep_enriched`
- `procedure_notes` — Markdown chunks from procedurePassPrompt. NULL if no relevant procedure found.
- `deep_enriched INTEGER DEFAULT 0` — set to 1 after all CHUNK messages complete and merge writes merged principles/holdings/legislation/authorities to `cases`
- Cases with null `case_name` or `facts` are hidden in library UI

### case_chunks D1 schema

- `id TEXT PRIMARY KEY` — format: `{citation}__chunk__{N}` (e.g. `[2018] TASSC 62__chunk__0`)
- Full column list: `id, citation, chunk_index, chunk_text, principles_json, done, embedded`
- `done INTEGER DEFAULT 0` — set to 1 after CHUNK queue consumer writes `principles_json`
- `embedded INTEGER DEFAULT 0` — set to 1 after VPS poller upserts chunk vector to Qdrant
- `UNIQUE(citation, chunk_index)` constraint — INSERT OR IGNORE safe to retry
- Created 18 March 2026 (session 2)

### ingest_corpus.py

- INPUT_FILE is hardcoded — must be manually changed between runs
- Located at: `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\ingest_corpus.py` (NOT inside Arc v 4/)
- PROCEDURE_ONLY flag (line 8) — when True, filters procedure chunks only and appends [procedure] suffix to all citations
- **Block separator format (CRITICAL):** `<!-- block_NNN master -->` or `<!-- block_NNN procedure -->` (with type word, on its own line). Followed by `### Heading` then `[DOMAIN:]` on the very next line (no blank line between).
- **File creation:** always use Python to write corpus files. PowerShell `Out-File` adds BOM which corrupts block separator regex matching. Confirmed broken in session 4.
- Dedup logic: repeated citations get [2], [3] suffixes in encounter order
- Minimum body length check: chunks under 100 chars logged as warnings but still ingested
- DESTRUCTIVE UPSERT WARNING: upload-corpus uses ON CONFLICT DO UPDATE which resets embedded=0 and wipes enriched_text on any citation collision. Never re-run against already-ingested citations. Procedure chunks safe (distinct [procedure] suffix). Master chunks must never be re-ingested.

**To create a single manual corpus chunk correctly:**
```python
content = "<!-- block_001 procedure -->\n### Chunk Title\n[DOMAIN: Criminal Law]\n[CITATION: Citation text [procedure]]\n[TITLE: Chunk Title]\n[CATEGORY: procedure]\n[SOURCE_TYPE: procedure]\n\nBody text here.\n"
with open(r"C:\path\to\file.md", "w", encoding="utf-8") as f:
    f.write(content)
```

### master_corpus files

- master_corpus_part1.md: 317 chunks total (32 master + 285 procedure), 705,516 bytes
- master_corpus_part2.md: 821 chunks total (214 master + 607 procedure), 1,524,842 bytes
- Procedure chunks ingested 18 March 2026: 892 total (285 part1 + 607 part2)
- All procedure citations have [procedure] suffix to distinguish from master corpus citations
- Location: `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\` (and duplicate in Arc v 4\)
- NOT on VPS — local Windows only
- Total corpus after all ingests: 2,032 chunks (incl. corroboration + sentencing first offenders)

### retrieval_baseline.sh

- Location: VPS `~/retrieval_baseline.sh`
- Auth: requires `X-Nexus-Key` header — value from `grep NEXUS_SECRET_KEY ~/ai-stack/.env`
- Field name: uses `query_text` (not `query`)
- File creation: use Python (not PowerShell Out-File) to avoid encoding issues
- Run after every embed pass or server.py change to validate retrieval quality
- Results in `~/retrieval_baseline_results.txt`
- **Last run: 18 Mar 2026 — 15/15 passing**

### Word artifact cleanup

- **gen_cleanup_sql.py** — run locally in VS Code terminal. Fetches affected rows from D1 via wrangler, strips `.underline`, `{.mark}`, image tags, hyperlink markdown from raw_text, generates `cleanup_corpus.sql`
- **cleanup_corpus.sql** — execute via `npx wrangler d1 execute arcanthyr --remote --file "path\to\cleanup_corpus.sql"`
- Affected rows reset to `embedded=0` automatically — poller re-embeds with clean text
- Check scope first: `SELECT COUNT(*) FROM secondary_sources WHERE raw_text LIKE '%.underline%'`
- 131 rows cleaned 18 Mar 2026. Re-run if new Word-derived chunks ingested.

### worker.js — callWorkersAI() and splitIntoChunks()

**`callWorkersAI()` — `reasoning_content` fallback (added 18 March 2026, session 2)**
If `choices[0].message.content` is null or empty, falls back to `choices[0].message.reasoning_content` before falling through to `choices[0].text` and `result.response`. Fixes Qwen3 thinking-mode responses.

**`splitIntoChunks(text, chunkSize=3000)` — utility function (added 18 March 2026, session 2)**
Splits judgment text into fixed-size character chunks for queue fan-out. Default chunk size 3,000 chars. No overlap.

### worker.js — filename casing

Renamed from `Worker.js` to `worker.js` session 3. wrangler.toml updated to `main = "worker.js"`. Warning resolved.

### Library UI — status pills (added session 3)

`/api/legal/library` route now returns additional fields per document type:
- Cases: `enriched`, `deep_enriched`, `chunk_count` (subquery on case_chunks), `chunks_embedded`
- Secondary: `enriched`, `embedded`, `category`
- Legislation: `embedded`

`renderLibRow()` in legal.html displays pills: `⬤ Enriched` (grey), `⬤ Embedded` (green), `⬤ Deep` (green), `chunks: N/M embedded`. Secondary rows show normalised `category` as type label (not raw source_type).

### UI — session 4 changes

- max_tokens 2,000 on both query handlers — fixes answer truncation
- handleAxiomRelay() added to worker.js — wired to `axiom-relay` AI router case
- Stray image `unnamed (2) (1) (1).jpg` deleted from public/
- All UI briefs 1–6 confirmed complete
- worker.js deployed version: `44f54c6b`

### scripts/ directory (Arc v 4/scripts/)

All support scripts committed 18 Mar 2026:
- `ingest_corpus.py` — two-pass corpus ingest with PROCEDURE_ONLY flag
- `retrieval_baseline.sh` — 15 baseline questions
- `generate_manifest.py` — corpus manifest generator
- `validate_ingest.ps1` — post-ingest D1 validation
- `backfill_enriched_text.py`, `backfill_enriched_text.sql` — enriched_text backfill
- `execute_backfill.py` — backfill runner
- `reingest_duplicates.py` — duplicate citation reingestion
- `migrate_schema_v2.sql`, `migrate_schema_v2.safe.sql` — schema migration scripts
- `split_legal_doc.py` — document splitter
- `worker_pipeline_v2_diff_addendum.js` — Worker v2 pipeline diff reference
- `gen_cleanup_sql.py` — Word artifact cleanup SQL generator

---

## PROCESS_BLOCKS.PY PIPELINE NOTES

- `gpt-4o-mini-2024-07-18` — use this model string. Do NOT use gpt-5.2/5.4 — near-empty output in testing.
- Mini API quirks: use `max_completion_tokens` not `max_tokens`; no `temperature` param; normalise `\r\n`
- `PART1_END = 28` in process_blocks.py
- `prompt_mode='both'` now supported (fixed session 3) — runs Master + Procedure prompts per block
- 56 blocks total, both prompts, no failures (completed 15 Mar 2026)

**Ingest sequence:**
```bash
# From arcanthyr-console/ — PowerShell
python ingest_corpus.py   # INPUT_FILE must be set to absolute path, PROCEDURE_ONLY=True for procedure pass

# After ingest, ALWAYS set enriched=1 (PowerShell, Arc v 4/ directory):
npx wrangler d1 execute arcanthyr --remote --command "UPDATE secondary_sources SET enriched=1 WHERE id LIKE '%[procedure]%' AND enriched=0"

# Then embed pass on VPS (SSH) — attach to tmux, run in foreground:
tmux attach -t poller
# inside tmux:
cd ~/ai-stack && docker compose exec -e OLLAMA_URL=http://ollama:11434 -e QDRANT_URL=http://qdrant-general:6333 agent-general python3 /app/src/enrichment_poller.py --loop
# Ctrl+B D to detach
```

Do NOT run both corpus parts simultaneously — write conflicts in D1.

---

## RETRIEVAL TESTING — 15 BASELINE QUESTIONS

Run after every major corpus or pipeline change. Results in `~/retrieval_baseline_results.txt`.

| # | Question | Status 18 Mar 2026 (session 4) | Notes |
|---|---|---|---|
| 1 | what is the test under s 137 Evidence Act | ✅ Pass | Strong — multiple s137 chunks |
| 2 | elements of common assault Tasmania | ✅ Pass | Bonde v Maney |
| 3 | what is the definition of a weapon under the Firearms Act | ✅ Pass | |
| 4 | when can police search without a warrant | ✅ Pass | s16, Ghani, Jeffrey v Black |
| 5 | what is the fault element for recklessness | ✅ Pass | Vallance, Beechey, Cth Code |
| 6 | standard of proof in criminal proceedings | ✅ Pass | |
| 7 | what is the test for tendency evidence | ✅ Pass | s97, significant probative value |
| 8 | propensity evidence admissibility | ✅ Pass | ss97-101, Lockyer, Gipp v R |
| 9 | sentencing principles for first offenders | ✅ Pass | Manual chunk top hit |
| 10 | what amounts to corroboration | ✅ Pass | s164 abolition, s165 warning |
| 11 | how do I make a s 38 application | ✅ Pass | Rich retrieval |
| 12 | steps for handling a hostile witness | ✅ Pass | s38 workflow chunks |
| 13 | how do I object to tendency evidence | ✅ Pass | Police v FRS four steps |
| 14 | examination in chief technique leading questions | ✅ Pass | Police v Endlay, s42 |
| 15 | what do I do if a witness refuses to answer | ✅ Pass | s43 Justices Act |

---

## UI CHANGES — CC BRIEFS (ALL COMPLETE — session 4)

All 6 briefs executed and deployed. Frontend work complete. Session 4 additional changes: max_tokens fix, handleAxiomRelay(), stray image deletion.

---

## FUTURE ROADMAP

- **Run scraper** — IMMEDIATE. Resume TASSC 2024. Run during business hours. Monitor CF dashboard.
- **Test Neill-Fraser DNA secondary transfer** — re-test now embed is complete.
- **Extend scraper to HCA/FCAFC** — after async pattern confirmed at volume.
- **Retrieval eval framework** — formalise scored baseline as standing process.
- **Cloudflare Browser Rendering /crawl** — Free plan. For Tasmanian Supreme Court sentencing remarks.
- **FTS5 as mandatory third RRF source** — currently gated by BM25_FTS_ENABLED. Validate post-scraper-run.
- **Qwen3 UI toggle** — add third button to model toggle. Workers AI confirmed working.
- **Nightly cron for xref_agent.py** — after scraper actively running.
- **Stare decisis layer** — surface treatment history from case_citations.
- **Animated sigil** — swap `sigil.jpg` for `sigil.gif` if rotating GIF produced.
- **chunk finish_reason: length** — increase CHUNK max_tokens from 1,500 if truncation rate unacceptable.
- **Dead letter queue** — for chunks that fail max_retries. Low priority.
- **Word artifact cleanup** — re-run gen_cleanup_sql.py if new Word-derived corpus chunks ingested.
- **Agent work (post-corpus validation)** — contradiction detection, coverage gap analysis, citation network traversal.
- **Two-stage case chunk retrieval** — second parallel Qdrant search filtered to `type=case_chunk`, threshold 0.35, top 4, merged into RRF blend before context assembly. Prevents case chunks losing to corpus on semantic score due to dense transcript text. Server.py change only — no Worker deploy needed.
- **Reingest-case route** — delete + reingest pattern to backfill case_name into Qdrant.
- **Legislation enrichment via Claude API** — plain English summaries, cross-references. Do AFTER cross-reference agent design confirmed.
- **Auto-populate legislation metadata on upload** — Claude API reads filename/first page.
- **RAG workflow doc** — DONE v3 18 Mar 2026.
