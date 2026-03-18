# CLAUDE_arch.md — Arcanthyr Architecture Reference
*Updated: 18 March 2026. Upload every session alongside CLAUDE.md.*

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

**Always run enrichment_poller.py via docker compose exec:**
```bash
cd ~/ai-stack
docker compose exec agent-general python3 /app/src/enrichment_poller.py --mode embed --loop
```

`OLLAMA_URL` and `QDRANT_URL` are now set in docker-compose.yml `agent-general` environment block (added 17 Mar 2026) — no inline `-e` overrides needed.

**The poller reads `OLLAMA_URL` (not `OLLAMA_HOST`).**

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
  --mode both      → enrich then embed in sequence
  --mode reconcile → diffs D1 embedded=1 vs Qdrant chunk_ids → resets missing to embedded=0
  --loop           → runs continuously (60s sleep between passes)
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

**Secondary sources corpus:** 2,031 rows (1,138 master + 892 procedure + 1 corroboration). All enriched=1. `enriched_text` is NULL — correct, poller falls back to `raw_text`. Do NOT run `--mode enrich` on these rows.

---

## ASYNC JOB PATTERN — DESIGN DECISION (18 March 2026)

**Problem:** fetch-case-url and PDF case uploads timeout on large judgments. Worker has 30s wall-clock limit. summarizeCase() runs up to 6 sequential Workers AI calls on large judgments.

**Confirmed correct solution: Cloudflare Queues**

Rejected alternatives (do not revisit without new information):
- Fire-and-forget / ctx.waitUntil() — removed in Worker v9. Silently drops calls at volume (confirmed). ctx.waitUntil() has same problem on nexus write-back path.
- CF REST API for Workers AI from VPS — requires paid Cloudflare API token. Outside free tier intent.
- VPS Qwen3 for case enrichment — explicitly rejected architecture decision. Enrichment stays in Worker via Workers AI.
- Cloudflare Queues was previously deferred (early March) only because the VPS poller was simpler at the time for secondary_sources. For cases it is the right and only viable free path.

**Build spec (dedicated session):**
1. Add Queue binding to wrangler.toml
2. Modify fetch-case-url + PDF upload handlers — drop message on Queue, return immediately
3. Add queue consumer handler in Worker.js — runs processCaseUpload() with no wall-clock limit
4. Frontend: show "queued" status, poll for completion
5. Add `restart: unless-stopped` to agent-general in docker-compose.yml

**Scope of timeout problem:**
- Secondary sources ✅ already async via poller — no issue
- Legislation ✅ fine for Tasmanian Acts — no issue
- Scraper ⚠️ silently loses large judgments (HTTP 0 errors confirmed in March scraping)
- Console case upload ⚠️ same timeout problem

**Gate:** Do not reopen scraper until Cloudflare Queues pattern is built and confirmed working.

---

## BM25 PRE-RETRIEVAL (LIVE)

```
User query
    ↓
Step 1 — Semantic search → top 6 Qdrant chunks
    ↓
Step 2 — Extract section references from query text (regex: s\s*(\d+[A-Z]?)(?!\d))
    ↓
Step 3 — Fetch matching rows from legislation_sections AND secondary_sources
         via Worker route /api/pipeline/fetch-sections-by-reference
    ↓
Step 3b — Fetch cases citing same legislation from case_legislation_refs
          via Worker route /api/pipeline/fetch-cases-by-legislation-ref (LIKE '% s N%')
    ↓
Step 4 — Merge all results, deduplicate by chunk_id
    ↓
Step 5 — Pass to Claude API / Workers AI for grounded answer
```

Note: BM25 extracts refs from QUERY TEXT ONLY — not from returned chunks — to avoid cascade noise.

---

## NEXUS SERVER.PY — ROUTES AND GLOBALS

**All routes require `X-Nexus-Key` header except `/health`.**

| Method | Route | Handler | Notes |
|---|---|---|---|
| GET | `/health` | inline | Returns `{"status":"ok"}` — no auth |
| POST | `/ingest` | `ingest_text()` | Embed + upsert chunk to Qdrant |
| POST | `/search` | `search_text()` | Semantic search + BM25 layers |
| POST | `/query` | `query_qwen()` | search + Qwen3 inference |
| POST | `/extract-pdf` | `extract_pdf_text()` | pdfminer only |
| POST | `/extract-pdf-ocr` | `extract_pdf_text_ocr()` | pdfminer + OCR fallback |
| POST | `/delete` | `delete_citation()` | Delete Qdrant vectors by `citation` field |
| POST | `/delete-by-type` | `delete_type()` | Delete Qdrant vectors by `type` field |
| POST | `/process-document` | `process_document()` | Extract text → split to ~3k-word blocks → GPT enrichment per block → parse chunks → insert to D1 via Worker `/api/legal/upload-corpus`. Runs in background thread, returns `job_id` immediately. |
| GET | `/ingest-status/<job_id>` | `get_ingest_status()` | Returns live job state from `INGEST_JOBS` dict |

**Key module-level globals (server.py):**

| Global | Value | Purpose |
|---|---|---|
| `INGEST_JOBS` | `{}` | In-memory job store — maps `job_id → job state dict`. Cleared on container restart. |
| `MASTER_PROMPT` | long string constant | GPT enrichment prompt for doctrine/case law pass |
| `PROCEDURE_PROMPT` | long string constant | GPT enrichment prompt for practitioner procedure/script pass |
| `EMBED_MODEL` | `argus-ai/pplx-embed-context-v1-0.6b:fp32` | Ollama embedding model |
| `COLLECTION` | `general-docs-v2` | Qdrant collection name |

**process-document known limitations:**
- `prompt_mode: "both"` runs Master Prompt only — Procedure pass not yet implemented in server.py
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
| scripts/ | `Arc v 4/scripts/` — all support scripts committed 18 Mar 2026 |
| Worker.js | `Arc v 4/Worker.js` |
| CLAUDE.md | `Arc v 4/CLAUDE.md` |
| CLAUDE_arch.md | `Arc v 4/CLAUDE_arch.md` |
| austlii_scraper.py | `Local Scraper/` (not in git) — runs on Windows only (VPS IP blocked) |
| docker-compose.yml | `~/ai-stack/docker-compose.yml` (VPS) |

**server.py is volume-mounted** (`./agent-general/src:/app/src` in docker-compose.yml) — NOT baked into image. Changes only require: edit locally → SCP to VPS → `docker compose up -d --force-recreate agent-general` → health check. No rebuild unless Dockerfile changes.

**SCP command for server.py:**
```powershell
scp "path\to\server.py" tom@31.220.86.192:/home/tom/ai-stack/agent-general/src/server.py
```

---

## KNOWN ISSUES / WATCH LIST

- **Docker internal hostnames** — poller must use `OLLAMA_URL=http://ollama:11434` and `QDRANT_URL=http://qdrant-general:6333`. Never `localhost` inside a container.
- **Poller env var is OLLAMA_URL not OLLAMA_HOST** — now set in docker-compose.yml.
- **Qdrant port mapping** — host-side: 6334. Inside Docker network: 6333.
- **Nexus health check port is 18789** — not 8000.
- **Always set enriched=1 after secondary_sources ingest** — new rows land with enriched=0. Poller won't touch them until enriched=1.
- **ingest_corpus.py destructive upsert** — ON CONFLICT DO UPDATE resets embedded=0 and wipes enriched_text on citation collision. Never re-run against already-ingested citations.
- **upload-corpus auth** — uses User-Agent spoof, NOT X-Nexus-Key. Python urllib User-Agent blocked by CF WAF — always set `User-Agent: Mozilla/5.0 (compatible; Arcanthyr/1.0)`.
- **Category normalisation** — `legal doctrine` normalised to `doctrine` 16 Mar 2026. Remaining fragmented categories deferred.
- **Concept search partial fix** — `extract_legal_concepts()` fires correctly but tendency evidence chunks may not reach Phase 5 response. Next step: check raw search output vs Phase 5 prompt receives.
- **Word artifact noise** — 131 secondary_sources chunks had `.underline`, `{.mark}`, image tags in raw_text. Cleaned 18 Mar 2026 via gen_cleanup_sql.py + wrangler --file. Re-run script if new Word-derived corpus chunks ingested.
- **authorities_extracted vs key_authorities** — D1 column is `authorities_extracted`. `key_authorities` is Llama prompt field only — does NOT exist in D1.
- **case_name missing from Qdrant for existing cases** — fix in server.py applies to future ingests only. Backfill deferred.
- **Unknown chunk in sources panel** — pre-existing chunk with incomplete metadata (`citation: unknown`).
- **Llama returning literal `"null"` string** — latent risk. Audit D1 after bulk scraping.
- **Workers AI prompt length sensitivity** — verbose prompts cause CPU timeout. Keep concise.
- **AustLII block** — VPS IP (31.220.86.192) permanently blocked. Scraper must run locally on Windows only.
- **Cloudflare Workers Observability** — use `npx wrangler tail arcanthyr-api` for real-time logs (not CF dashboard — events may lag 2 minutes).
- **OpenAI mini API quirks** — `max_completion_tokens` not `max_tokens`; no `temperature`; normalise `\r\n` before regex.
- **PowerShell SSH quoting mangles auth headers** — never test API routes via SSH from PowerShell. SSH to VPS first, then run curl.
- **handleLegalQueryWorkersAI Qwen3 fix** — response shape three-path fallback + `budget_tokens: 0` deployed 18 Mar 2026 (commit 78c2c9bd). Workers AI now returning real answers.
- **Pre-scraper gate** — char-based windowing in Llama extraction uses `fullText[8000:28000]`. Will miss reasoning in long judgments. Scraper paused. Fix: heading-boundary split or full-text extraction. Test URLs: TASCCA 2021/12, TASSC 2018/62, TASMC 2016/14.
- **Qdrant general-docs-v2 point count** — ~2,675 mid-session 18 Mar 2026. Target ~3,303 after procedure + corroboration embed pass completes.

---

## SCRAPER CONFIG

- Courts: TASSC, TASCCA, TASFC, TAMagC
- Years: `range(2025, 2004, -1)` — 2025 to 2005 inclusive
- `MAX_CASES_PER_SESSION`: 100
- Delays: 10–20s random · Business hours: 08:00–18:00 AEST
- Proxy: `arcanthyr.com/api/legal/fetch-page` — routes via Cloudflare edge (VPS IP blocked)
- **Do not resume until: (1) Cloudflare Queues async pattern built and confirmed, (2) retrieval baseline re-run post embed pass**

**Scraping workflow:**
```
austlii_scraper.py (local Windows)
    → fetches AustLII HTML via arcanthyr.com/api/legal/fetch-page proxy
    → strips HTML to plain text locally
    → derives citation from URL structure
    → POSTs raw text + citation + court_hint to /api/legal/upload-case
        → Worker: two Qwen3-30b calls (pass 1: case_name/facts/issues/judge/parties,
                                        pass 2: holdings/legislation/key_authorities/principles)
        → D1: all fields written, enriched=1, embedded=0
        → procedure pass: callWorkersAI(procedurePassPrompt) → procedure_notes → D1 UPDATE
    → nexus /ingest embed pass via poller (not inline)

Post-scrape checklist:
    - Run xref_agent.py --mode both after each batch
    - Audit D1 for Llama literal "null" strings
```

---

## CLOUDFLARE ACCOUNT

- **Plan:** Workers Free
- **Account ID:** `def9cef091857f82b7e096def3faaa25`
- **Browser Rendering `/crawl`** — available on Free plan. Potential future use for secondary source ingestion. NOT suitable for AustLII.

---

## COMPONENT NOTES

### enrichment_poller.py

Volume-mounted at `./agent-general/src:/app/src`. Not container-native — defaults to `localhost` for Ollama/Qdrant. Now overridden in docker-compose.yml environment block.

**Correct invocation:**
```bash
cd ~/ai-stack
docker compose exec agent-general python3 /app/src/enrichment_poller.py --mode embed --loop
```

**Modes:** `--mode enrich`, `--mode embed`, `--mode both`, `--mode reconcile`, `--loop`, `--status`

**Cases enrichment path: NOT YET BUILT** — poller currently handles `secondary_sources` only. Cases are enriched inline in the Worker via Workers AI. Async case enrichment requires Cloudflare Queues (see ASYNC JOB PATTERN section).

### Workers AI (Cloudflare) — model and usage inventory

**Current model:** `@cf/qwen/qwen3-30b-a3b-fp8` — used for ALL Workers AI calls.

**Active Workers AI calls:**

- **`summarizeCase()`** — two-pass case enrichment at scrape/upload time. Pass 1: facts/issues/case_name/judge/parties. Pass 2: windowed holdings/principles/legislation/key_authorities. Short judgments (≤22,000 chars): single pass. Long judgments: Pass 1 + multiple Pass 2 windows (6+ sequential calls on large judgments — timeout risk).
- **`procedurePassPrompt`** — called after summarizeCase() in processCaseUpload(). Extracts in-court procedural sequences (voir dire, s38, tendency/coincidence, sentencing). Outputs Markdown chunks with metadata tags. Returns `NO PROCEDURE CONTENT` if nothing relevant. VALIDATED against Tasmania v S [2004] TASSC 84 — 3 procedure sequences correctly extracted (voir dire, s38, tendency evidence).
- **`handleLegalQueryWorkersAI()`** — Phase 5 fast/free query toggle. Response shape fix deployed 18 Mar 2026: three-path fallback + `budget_tokens: 0`.
- **`handleDraft()`, `handleNextActions()`, `handleWeeklyReview()`, `handleClarifyAgent()`** — Axiom journal features. Upgrade optional, low priority.

**Planned:** `/api/legal/extract-metadata` route — scraper metadata pre-extraction. Upgrade `summarizeCase()` at the same time when scraper work resumes.

> Do NOT do a global model string replace — query handler and journal functions need independent evaluation.

### Workers AI — Qwen3 response shape (18 March 2026)

`handleLegalQueryWorkersAI` was returning "No response from model." — Qwen3-30b returns output in different shape than Llama. Fix deployed 18 Mar 2026:

```javascript
// Three-path fallback (now in handleLegalQueryWorkersAI):
const answer =
  response?.choices?.[0]?.message?.content?.trim() ||
  response?.choices?.[0]?.text?.trim() ||
  response?.response?.trim() ||
  "No response from model.";

// Plus budget_tokens: 0 to disable thinking mode
```

`callWorkersAI()` already had this fix via regex extraction. `handleLegalQueryWorkersAI` was the gap.

### Qdrant payload field names

- Secondary source type filter: field = `type`, value = `secondary_source` (NOT `source_type`)
- Legislation type filter: field = `type`, value = `legislation`
- Ghost points from pre-type-field era were deleted 17 Mar 2026

### secondary_sources D1 schema notes

- PK is `id` (TEXT) — populated from CITATION metadata field in master_corpus
- **No `citation` column exists** — do not query for it. Always use `id`.
- Category default is `'doctrine'` (D1 column default)
- Full column list: `id, title, source_type, author, date_published, tags, related_cases, related_acts, raw_text, chunk_count, date_added, enriched_text, enriched, embedded, enrichment_error, category, embedding_model, embedding_version`

### cases D1 schema notes

- PK is `id` (TEXT) — citation with spaces replaced by hyphens
- Full column list: `id, citation, court, case_date, case_name, url, full_text, facts, issues, holding, holdings_extracted, principles_extracted, legislation_extracted, key_authorities, offences, judge, parties, procedure_notes, processed_date, summary_quality_score, enriched, embedded`
- `procedure_notes` — Markdown chunks from procedurePassPrompt. NULL if no relevant procedure found.
- Cases with null `case_name` or `facts` are hidden in library UI

### ingest_corpus.py

- INPUT_FILE is hardcoded — must be manually changed between part1 and part2 runs
- Located at: `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\ingest_corpus.py` (NOT inside Arc v 4/)
- PROCEDURE_ONLY flag (line 8) — when True, filters procedure chunks only and appends [procedure] suffix to all citations
- Section-aware splitting: preserves master/procedure block type from `<!-- block_NNN -->` separators
- Dedup logic: repeated citations get [2], [3] suffixes in encounter order
- Minimum body length check: chunks under 100 chars logged as warnings but still ingested
- DESTRUCTIVE UPSERT WARNING: upload-corpus uses ON CONFLICT DO UPDATE which resets embedded=0 and wipes enriched_text on any citation collision. Never re-run against already-ingested citations. Procedure chunks safe (distinct [procedure] suffix). Master chunks must never be re-ingested.

### master_corpus files

- master_corpus_part1.md: 317 chunks total (32 master + 285 procedure), 705,516 bytes
- master_corpus_part2.md: 821 chunks total (214 master + 607 procedure), 1,524,842 bytes
- Procedure chunks ingested 18 March 2026: 892 total (285 part1 + 607 part2)
- All procedure citations have [procedure] suffix to distinguish from master corpus citations
- Location: `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\` (and duplicate in Arc v 4\)
- NOT on VPS — local Windows only
- Total corpus after procedure ingest + corroboration chunk: 2,031 chunks

### corpus_manifest.json

- Generated by generate_manifest.py (in scripts/)
- Location: `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\corpus_manifest.json`
- Contains: source_file, chunk_index, id, citation_raw, heading, category, body_length, raw_text_hash
- Ground truth for post-ingest D1 validation and backfill alignment

### retrieval_baseline.sh

- Location: VPS `~/retrieval_baseline.sh`
- Auth: requires `X-Nexus-Key` header — value from `grep NEXUS_SECRET_KEY ~/ai-stack/.env`
- Field name: uses `query_text` (not `query`)
- File creation: use PowerShell `@' ... '@ | Out-File -Encoding utf8` then SCP to VPS
- Run after every embed pass or server.py change to validate retrieval quality
- Results in `~/retrieval_baseline_results.txt`

### Word artifact cleanup

- **gen_cleanup_sql.py** — run locally in VS Code terminal. Fetches affected rows from D1 via wrangler, strips `.underline`, `{.mark}`, image tags, hyperlink markdown from raw_text, generates `cleanup_corpus.sql`
- **cleanup_corpus.sql** — execute via `npx wrangler d1 execute arcanthyr --remote --file "path\to\cleanup_corpus.sql"`
- Affected rows reset to `embedded=0` automatically — poller re-embeds with clean text
- Check scope first: `SELECT COUNT(*) FROM secondary_sources WHERE raw_text LIKE '%.underline%'`
- 131 rows cleaned 18 Mar 2026. Re-run if new Word-derived chunks ingested.

### Worker.js — filename casing

File is `Arc v 4/Worker.js` (capital W). Pending rename to `worker.js` (lowercase) — use `git mv` with intermediate name on Windows.

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

- `gpt-5-mini-2025-08-07` works well on 3k-word blocks — do NOT use original 5k–7k word blocks
- Mini API quirks: use `max_completion_tokens` not `max_tokens`; no `temperature` param; normalise `\r\n`
- `PART1_END = 28` in process_blocks.py
- Two independent API calls per block: Master Prompt + Procedure Prompt
- 56 blocks total, both prompts, no failures (completed 15 Mar 2026)

**Ingest sequence:**
```bash
# From arcanthyr-console/ — PowerShell
python ingest_corpus.py   # INPUT_FILE must be set to absolute path, PROCEDURE_ONLY=True for procedure pass

# After ingest, ALWAYS set enriched=1 (PowerShell, Arc v 4/ directory):
npx wrangler d1 execute arcanthyr --remote --command "UPDATE secondary_sources SET enriched=1 WHERE id LIKE '%[procedure]%' AND enriched=0"

# Then embed pass on VPS (SSH, ~/ai-stack):
docker compose exec agent-general python3 /app/src/enrichment_poller.py --mode embed --loop
```

Do NOT run both corpus parts simultaneously — write conflicts in D1.

---

## RETRIEVAL TESTING — 15 BASELINE QUESTIONS

Run after every major corpus or pipeline change. Results in `~/retrieval_baseline_results.txt`.

| # | Question | Status 18 Mar 2026 | Notes |
|---|---|---|---|
| 1 | what is the test under s 137 Evidence Act | ✅ Pass | Strong |
| 2 | elements of common assault Tasmania | ✅ Pass | |
| 3 | what is the definition of a weapon under the Firearms Act | ✅ Pass | |
| 4 | when can police search without a warrant | ⚠️ Partial | Doctrine thin |
| 5 | what is the fault element for recklessness | ⚠️ Partial | Word artifacts cleaned — re-test |
| 6 | standard of proof in criminal proceedings | ✅ Pass | |
| 7 | what is the test for tendency evidence | ❌ Fail→pending | Procedure chunks ingested, pending embed |
| 8 | propensity evidence admissibility | ❌ Fail→pending | Procedure chunks ingested, pending embed |
| 9 | sentencing principles for first offenders | ⚠️ Partial | Content thin — consider manual chunk |
| 10 | what amounts to corroboration | ❌ Fail→pending | Corroboration chunk ingested 18 Mar 2026, pending embed |
| 11 | how do I make a s 38 application | ✅ Pass | |
| 12 | steps for handling a hostile witness | ❌ Fail→pending | Procedure chunks ingested, pending embed |
| 13 | how do I object to tendency evidence | ❌ Fail→pending | Procedure chunks ingested, pending embed |
| 14 | examination in chief technique leading questions | ⚠️ Partial→pending | Procedure chunks ingested, pending embed |
| 15 | what do I do if a witness refuses to answer | ✅ Pass | |

---

## UI CHANGES — CC BRIEFS (READY TO DEPLOY)

Frontend only — safe to run anytime, no VPS interaction. Paste briefs in order in CC.

**Brief 1 — Reconnaissance**
> Read every file in `Arc v 4/public/`. List each filename and a one-sentence description. Do not make any changes.

**Brief 2 — Visual fixes**
> Read all HTML files in `Arc v 4/public/`. Make these style changes across all pages:
> 1. Remove any relevance threshold / score bar UI element
> 2. Any element labelled "Console" in nav or headings → rename to "Arc Console"
> 3. Match sigil image background to page background
> 4. All buttons must use Times New Roman font
> 5. Any headings in blue → change to white
> 6. Any buttons with blue background → change to match existing non-blue button style
> 7. Remove "A forge for clarity — where raw thought is shaped into action." from home page
> 8. Any gold or yellow-tinted text → change to white
>
> List every file modified and every change made.

**Brief 3 — Structural: new Ingest page**
> Read all HTML files in `Arc v 4/public/` and `Worker.js`.
> 1. Create `Arc v 4/public/ingest.html` modelled on existing page layout and nav
> 2. Move ALL upload sections from every existing page into `ingest.html`
> 3. Add "Ingest" as a nav link on every existing page
> 4. Remove upload sections from original pages after moving
> 5. Move "Database Status" section onto `ingest.html`
>
> List every file modified and every element moved.

**Brief 4 — Structural: Axiom Relay rename + cleanup**
> Read all HTML files in `Arc v 4/public/` and `Worker.js`.
> 1. Find the page currently named "Email" or containing email functionality
> 2. Rename to "Axiom Relay" throughout
> 3. Find any older "Axiom Relay" page — delete it and remove its nav link
> 4. In `Worker.js`, remove routes for old Axiom Relay functionality
>
> List every file modified and every deletion made.

**Brief 5 — Functionality: legislation search single input box**
> Read the legal research HTML page in `Arc v 4/public/` and the legislation search handler in `Worker.js`.
> 1. Replace separate act name/year/section fields with a single text input
> 2. Placeholder: "Search legislation — act name, section, year…"
> 3. Update search handler to use LIKE with wildcards across all relevant D1 columns
>
> List every file and function modified.

**Brief 6 — Functionality: legislation "View" link fix**
> Read all HTML files in `Arc v 4/public/` and `Worker.js`.
> 1. In Sources Retrieved panel — "View" button on legislation results → redirect to legislation page
> 2. In Library page — "View" option on legislation entries → same fix
>
> List every file and handler modified.

---

## FUTURE ROADMAP

- **Cloudflare Queues async pattern** — GATE before scraper reopens. See ASYNC JOB PATTERN section for full spec.
- **Legislation enrichment via Claude API** — plain English summaries, cross-references. Do AFTER cross-reference agent design confirmed.
- **Auto-populate legislation metadata on upload** — Claude API reads filename/first page.
- **BM25 improvements** — proper scoring + hybrid ranking with semantic scores.
- **Console status indicator** — show enriched/embedded progress per document after upload.
- **Qwen3 UI toggle** — add third button to model toggle. Workers AI now confirmed working (18 Mar 2026).
- **Reingest-case route** — delete + reingest pattern to backfill case_name into Qdrant.
- **Nightly cron for xref_agent.py** — after scraper is actively running.
- **Stare decisis layer** — surface treatment history from case_citations.
- **Animated sigil** — swap `sigil.jpg` for `sigil.gif` if rotating GIF produced.
- **restart: unless-stopped on agent-general** — add to docker-compose.yml. Low effort, high value.
- **UI generator** — find a UI/website generator for smoother frontend iteration.
- **Qwen3 model upgrade in summarizeCase()** — upgrade `callWorkersAI()` to `@cf/qwen/qwen3-30b-a3b-fp8` fully. Do with new `/api/legal/extract-metadata` route when scraper work resumes. Do NOT global replace.
