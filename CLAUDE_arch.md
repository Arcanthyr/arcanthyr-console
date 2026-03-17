# CLAUDE_arch.md — Arcanthyr Architecture Reference
*Updated when architecture changes. Do NOT upload every session — read on demand.*

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

**Always run enrichment_poller.py with explicit env vars:**
```bash
docker exec -e OLLAMA_URL=http://ollama:11434 -e QDRANT_URL=http://qdrant-general:6333 -it agent-general python3 /app/src/enrichment_poller.py --mode embed
```

**The poller reads `OLLAMA_URL` (not `OLLAMA_HOST`)** — container has `OLLAMA_HOST` set but poller uses `OLLAMA_URL`. Always pass explicitly via `-e`.

**agent-general container env vars (docker-compose.yml):** `NEXUS_SECRET_KEY`, `WORKER_URL` (= `https://arcanthyr.com`), `OPENAI_API_KEY` (required for `/process-document` GPT-4o-mini calls), `OLLAMA_HOST`, `QDRANT_HOST`. If `OPENAI_API_KEY` is missing, `/process-document` jobs will fail at the enriching step.

**Never test API routes via SSH from PowerShell** — SSH quoting mangles auth headers. SSH to VPS first, then run curl locally:
```bash
KEY=$(docker exec agent-general env | grep NEXUS_SECRET_KEY | cut -d= -f2)
curl -s -X POST http://localhost:18789/delete-by-type \
  -H "Content-Type: application/json" \
  -H "X-Nexus-Key: $KEY" \
  -d '{"type":"secondary_source"}'
```

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

**Enrichment model by content type:**

| Content | Enrichment model | Notes |
|---|---|---|
| Scraped cases (bulk) | Workers AI / Llama 3.1 8B — in Worker at ingest | Free, automated, NOT via VPS poller |
| Manual case uploads | Workers AI / Llama — same Worker path | NOT via VPS poller |
| Secondary sources corpus | None — raw_text IS the content | embed raw_text directly, enriched_text stays NULL |
| Legislation | None — raw statutory text embedded directly | |
| Future secondary source uploads (small volume) | Claude API via poller | Acceptable for low volume |

**Secondary sources corpus:** 1,138 rows, all enriched=1 (set manually). `enriched_text` is NULL — correct, poller falls back to `raw_text`. Do NOT run `--mode enrich` on these rows.

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
| POST | `/process-document` | `process_document()` | Extract text from file → split to ~3k-word blocks → GPT-4o-mini enrichment per block → parse chunks → insert to D1 via Worker `/api/legal/upload-corpus`. Runs in background thread, returns `job_id` immediately. |
| GET | `/ingest-status/<job_id>` | `get_ingest_status()` | Returns live job state from `INGEST_JOBS` dict: `status`, `total_blocks`, `block_current`, `chunks_parsed`, `chunks_inserted`, `chunks_skipped`, `errors[]` |

**Key module-level globals (server.py):**

| Global | Value | Purpose |
|---|---|---|
| `INGEST_JOBS` | `{}` | In-memory job store — maps `job_id → job state dict`. Cleared on container restart. |
| `MASTER_PROMPT` | long string constant | GPT-4o-mini system prompt for doctrine/case law enrichment pass |
| `PROCEDURE_PROMPT` | long string constant | GPT-4o-mini system prompt for practitioner procedure/script enrichment pass |
| `EMBED_MODEL` | `argus-ai/pplx-embed-context-v1-0.6b:fp32` | Ollama embedding model |
| `COLLECTION` | `general-docs-v2` | Qdrant collection name |

**process-document known limitations (16 Mar 2026):**
- `prompt_mode: "both"` runs Master Prompt only — Procedure pass not yet implemented
- `python-docx` and `striprtf` not yet installed in `agent-general` container — DOCX and RTF uploads will return an install error until packages are added to Dockerfile and image rebuilt
- `OPENAI_API_KEY` must be set in container environment (see docker-compose.yml)

**Worker.js ingest proxy routes (added 16 Mar 2026):**

| Method | Route | Forwards to | Auth |
|---|---|---|---|
| POST | `/api/ingest/upload-document` | `https://nexus.arcanthyr.com/process-document` | `X-Nexus-Key: env.NEXUS_SECRET_KEY` |
| GET | `/api/ingest/status/:jobId` | `https://nexus.arcanthyr.com/ingest-status/{jobId}` | `X-Nexus-Key: env.NEXUS_SECRET_KEY` |

Rate limit: 10 req/IP/60s on `/api/ingest/` prefix. No auth check on browser side (public proxy).

**Corpus chunk POST requirements (CF WAF):** chunks posted from server.py to Worker `/api/legal/upload-corpus` must use:
- `text` field: base64-encoded UTF-8 string
- `"encoding": "base64"` field in body
- `User-Agent: Mozilla/5.0 (compatible; Arcanthyr/1.0)` header
Without these, Cloudflare WAF returns 403 (Python-urllib User-Agent blocked).

---

## PHASE 5 DESIGN (LOCKED)

- Qdrant top 6 chunks, min score 0.45, max 8
- Re-rank by court hierarchy within 0.05 band: CCA/FullCourt > Supreme > Magistrates
- Full metadata per chunk
- Claude API primary → Workers AI (Llama) fallback
- API key via `npx wrangler secret put ANTHROPIC_API_KEY`

---

## KEY FILE LOCATIONS

| File | Path |
|---|---|
| enrichment_poller.py | `Arc v 4/enrichment_poller.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| server.py (nexus) | `Arc v 4/arcanthyr-nexus/server.py` (local, gitignored) · `~/ai-stack/agent-general/src/server.py` (VPS) |
| xref_agent.py | `Arc v 4/xref_agent.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| ingest_corpus.py | `arcanthyr-console/` root — run from there, NOT from `Arc v 4/` |
| reingest_duplicates.py | `arcanthyr-console/` root — run from there, NOT from `Arc v 4/` |
| master_corpus.md | `Arc v 4/master_corpus.md` — OLD corpus · keep until new corpus retrieval-tested |
| master_corpus_part1.md | `Arc v 4/master_corpus_part1.md` — NEW corpus blocks 1–28 (317 chunks) |
| master_corpus_part2.md | `Arc v 4/master_corpus_part2.md` — NEW corpus blocks 29–56 (821 chunks) |
| process_blocks.py | `Arc v 4/process_blocks.py` — automated RAG pipeline script |
| blocks_3k/ | `Arc v 4/blocks_3k/` — 56 resplit blocks at ~3,000 words each |
| blocks/ | `Arc v 4/blocks/` — original 32 blocks at ~5,000–7,400 words (backup) |
| hogan_on_crime.md | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\hogan_on_crime.md` |
| split_legal_doc.py | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\split_legal_doc.py` |
| process_log.txt | `Arc v 4/process_log.txt` — pipeline run log |
| Worker.js | `Arc v 4/Worker.js` |
| CLAUDE.md | `Arc v 4/CLAUDE.md` |
| CLAUDE_arch.md | `Arc v 4/CLAUDE_arch.md` |
| austlii_scraper.py | `Local Scraper/` (not in git) |
| reprocess_cases.ps1 | `Arc v 4/reprocess_cases.ps1` |
| docker-compose.yml | `~/ai-stack/docker-compose.yml` (VPS) |

**server.py is volume-mounted** (`./agent-general/src:/app/src` in docker-compose.yml) — NOT baked into image. Changes only require: edit locally → SCP to VPS → `sudo cp` to `~/ai-stack/agent-general/src/server.py` → `docker compose restart agent-general` → health check. No rebuild unless Dockerfile changes.

---

## KNOWN ISSUES / WATCH LIST

- **Docker internal hostnames** — poller must use `OLLAMA_URL=http://ollama:11434` and `QDRANT_URL=http://qdrant-general:6333`. Never `localhost` inside a container.
- **Poller env var is OLLAMA_URL not OLLAMA_HOST** — always pass explicitly via `-e`.
- **Qdrant port mapping** — host-side: 6334. Inside Docker network: 6333. Use `qdrant-general:6333` from containers, `localhost:6334` from VPS host.
- **Nexus health check port is 18789** — not 8000.
- **ingest_corpus.py path** — lives in `arcanthyr-console/`, corpus files in `Arc v 4/`. Use absolute paths in INPUT_FILE. Run from `arcanthyr-console/`.
- **reingest_duplicates.py path** — same, lives in `arcanthyr-console/`.
- **Category normalisation** — `legal doctrine` normalised to `doctrine` 16 Mar 2026. Remaining fragmented categories deferred until post-retrieval testing confirmed.
- **Always set enriched=1 after secondary_sources ingest** — new rows land with enriched=0.
- **Concept search partial fix** — `extract_legal_concepts()` added to server.py strips filler words and runs second Qdrant pass. Fires correctly (confirmed in logs) but tendency evidence chunks not reaching Claude Phase 5 response despite scoring 0.66 in raw search. Suspected cause: Phase 5 prompt instructing Claude to only answer from provided material — chunks may be present but Claude judging them as insufficient for "the test". Next step: check raw search output vs what Phase 5 prompt receives.
- **Retrieval baseline questions** — 15 questions scored 17 Mar 2026: 3 pass (Q1 s137, Q3 weapons, Q15 witness refuses), 4 partial (Q2 assault elements, Q4 search without warrant, Q6 standard of proof, Q11 s38 application), 7 fail (Q5 recklessness, Q7 tendency test, Q8 propensity, Q9 sentencing first offenders, Q10 corroboration, Q12 hostile witness, Q13 tendency objection, Q14 leading questions).
- **Procedural content corpus gap** — Q12 hostile witness steps and Q14 leading questions confirmed missing from corpus. Stripped during ChatGPT enrichment. Requires re-ingest via Procedure Prompt as separate upload stream.
- **authorities_extracted vs key_authorities** — D1 column is `authorities_extracted`. `key_authorities` is Llama prompt field only — does NOT exist in D1.
- **case_name missing from Qdrant for existing 8 cases** — fix in server.py applies to future ingests only. Backfill deferred until scraper has run at volume.
- **Unknown chunk in sources panel** — one semantic result as `unknown Unknown score 0.678`. Pre-existing chunk with incomplete metadata.
- **Llama returning literal `"null"` string** — latent risk. Audit D1 after bulk scraping.
- **Workers AI prompt length sensitivity** — verbose prompts cause CPU timeout. Keep concise.
- **AustLII block** — VPS IP (31.220.86.192) permanently blocked. Scraper must run locally on Windows only.
- **Cloudflare Workers Observability disabled** — use `npx wrangler tail arcanthyr-api` for real-time logs.
- **process_blocks.py debug_response.txt** — always contains LAST response only. Use process_log.txt for run history.
- **OpenAI mini API quirks** — `max_completion_tokens` not `max_tokens`; no `temperature`; normalise `\r\n` before regex.
- **PART1_END in process_blocks.py** — currently 28. Update both `TOTAL_BLOCKS` and `PART1_END` if block count changes.
- **PowerShell SSH quoting mangles auth headers** — never test API routes via SSH from PowerShell. SSH to VPS first.
- **Tendency evidence corpus gap** — doctrine partial, procedure should now be in new corpus. Verify in retrieval testing.
- **Corroboration gap** — s 64 Evidence Act definition cited by old system does NOT exist. Corroboration largely abolished under uniform evidence law. Do not add chunk until retrieval testing confirms position.
- **Console UI cannot handle large files** — never upload large corpus files via browser. Always use `ingest_corpus.py`.
- **Pre-scraper gate — char-based windowing in Llama extraction** — Worker.js case extraction uses `fullText[8000:28000]` (char offsets). Will miss reasoning sections in long judgments where reasoning starts after char 28000. Scraper paused until heading-boundary split is implemented. Test URLs when fixing: TASCCA 2021/12, TASSC 2018/62, TASMC 2016/14.
- **process-document DOCX/RTF support** — `python-docx` and `striprtf` not installed in `agent-general` container. Dockerfile rebuild required before DOCX/RTF uploads will work. PDF, MD, TXT functional now.
- **Qdrant general-docs-v2 point count** — 2,404 points as at 16 Mar 2026 (embed pass complete: 1,272 legislation + ~1,138 secondary sources).

---

## SCRAPER CONFIG

- Courts: TASSC, TASCCA, TASFC, TAMagC
- Years: `range(2025, 2004, -1)` — 2025 to 2005 inclusive
- `MAX_CASES_PER_SESSION`: 100
- Delays: 10–20s random · Business hours: 08:00–18:00 AEST
- Proxy: `arcanthyr.com/api/legal/fetch-page` — routes via Cloudflare edge (VPS IP blocked)
- Previously ingested: TASSC 2026 (1–6), TASFC 2026 (1–2) — 8 cases total
- **Do not resume until retrieval testing on new corpus is complete**

**Scraping workflow:**
```
austlii_scraper.py (local Windows)
    → fetches AustLII HTML via arcanthyr.com/api/legal/fetch-page proxy
    → strips HTML to plain text locally
    → derives citation from URL structure
    → derives court_hint from URL path segment
    → POSTs raw text + citation + court_hint to /api/legal/upload-case
        → Worker: two Llama calls (pass 1: case_name/facts/issues/judge/parties,
                                    pass 2: holdings/legislation/key_authorities/principles)
        → D1: all fields written, enriched=1, embedded=0
    → nexus /ingest called by Worker → server.py ingest_text() → Qdrant

Post-scrape checklist:
    - Run xref_agent.py --mode both after each batch
    - Audit D1 for Llama literal "null" strings
```

---

## PROCESS_BLOCKS.PY PIPELINE NOTES

- `gpt-5-mini-2025-08-07` works well on 3k-word blocks — do NOT use original 5k–7k word blocks
- `gpt-5.2` and `gpt-5.4` not suitable — near-empty or stalled output in testing
- Mini API quirks: use `max_completion_tokens` not `max_tokens`; no `temperature` param; normalise `\r\n`
- Two-tier fallback (mini → gpt-5.4) not yet implemented
- `PART1_END = 28` in process_blocks.py

**Ingest sequence:**
```bash
# From arcanthyr-console/
python ingest_corpus.py --dry-run       # verify chunk count first
python ingest_corpus.py                 # INPUT_FILE must be set to absolute path

# After ingest, set enriched=1:
npx wrangler d1 execute arcanthyr --remote --command "UPDATE secondary_sources SET enriched=1 WHERE enriched=0;"

# Then embed pass on VPS:
docker exec -e OLLAMA_URL=http://ollama:11434 -e QDRANT_URL=http://qdrant-general:6333 \
  -it agent-general python3 /app/src/enrichment_poller.py --mode embed --loop
```

Do NOT run both corpus parts simultaneously — write conflicts in D1.

---

## RETRIEVAL TESTING — 15 BASELINE QUESTIONS

Run after every major corpus change. Priority watch failures from old corpus: Q7, Q10, Q12, Q13.

| # | Question | Old corpus failure |
|---|---|---|
| 1 | what is the test under s 137 Evidence Act | — |
| 2 | elements of common assault Tasmania | — |
| 3 | what is the definition of a weapon under the Firearms Act | Largely fabricated |
| 4 | when can police search without a warrant | — |
| 5 | what is the fault element for recklessness | Cited UK cases (Caldwell, R v G) not Tas Criminal Code s13 |
| 6 | standard of proof in criminal proceedings | — |
| 7 | what is the test for tendency evidence | Cited Woolmington v DPP (completely wrong) |
| 8 | propensity evidence admissibility | — |
| 9 | sentencing principles for first offenders | — |
| 10 | what amounts to corroboration | Cited fictional "s 64 Evidence Act" |
| 11 | how do I make a s 38 application | — |
| 12 | steps for handling a hostile witness | Pulled random Criminal Code sections |
| 13 | how do I object to tendency evidence | Wandered into Misuse of Drugs Act chunks |
| 14 | examination in chief technique leading questions | — |
| 15 | what do I do if a witness refuses to answer | — |

---

## UI CHANGES — CC BRIEFS (READY TO DEPLOY)

Frontend only — safe to run anytime, no VPS interaction. Paste briefs in order in CC.

**Brief 1 — Reconnaissance**
> Read every file in `Arc v 4/public/`. List each filename and a one-sentence description. Do not make any changes.

**Brief 2 — Visual fixes**
> Read all HTML files in `Arc v 4/public/`. Make these style changes across all pages:
> 1. Remove any relevance threshold / score bar UI element
> 2. Any element labelled "Console" in nav or headings → rename to "Arc Console"
> 3. Match sigil image background to page background (or remove background on sigil container so it inherits)
> 4. All buttons must use Times New Roman font — add `font-family: 'Times New Roman', Times, serif`
> 5. Any headings in blue → change to white (includes "Enter" on home page, "Database Status" on research page)
> 6. Any buttons with blue background → change to match existing non-blue button style. Keep white text
> 7. Remove "A forge for clarity — where raw thought is shaped into action." from home page entirely
> 8. Any gold or yellow-tinted text → change to white. Placeholder/hint text → `rgba(255,255,255,0.5)`
>
> List every file modified and every change made.

**Brief 3 — Structural: new Ingest page**
> Read all HTML files in `Arc v 4/public/` and `Worker.js`.
> 1. Create `Arc v 4/public/ingest.html` modelled on existing page layout and nav
> 2. Move ALL upload sections from every existing page into `ingest.html` — case upload, corpus/secondary source upload, legislation upload, any other upload or ingest forms
> 3. Add "Ingest" as a nav link to `ingest.html` on every existing page
> 4. Remove upload sections from original pages after moving
> 5. Move "Database Status" section off Legal Research page onto `ingest.html`
>
> List every file modified and every element moved.

**Brief 4 — Structural: Axiom Relay rename + cleanup**
> Read all HTML files in `Arc v 4/public/` and `Worker.js`.
> 1. Find the page currently named "Email" or containing email functionality
> 2. Rename that page, its nav label, its HTML file, and all internal headings to "Axiom Relay"
> 3. Find any older "Axiom Relay" page or section predating this rename — delete it and remove its nav link
> 4. In `Worker.js`, remove routes/handlers for old Axiom Relay functionality. Keep only routes for renamed email page
>
> List every file modified and every deletion made.

**Brief 5 — Functionality: legislation search single input box**
> Read the legal research HTML page in `Arc v 4/public/` and the legislation search handler in `Worker.js`.
> 1. Find the legislation search section — currently has separate fields for act name, year, section number
> 2. Replace with a single text input. Placeholder: "Search legislation — act name, section, year…"
> 3. Update search handler so single input is sent as broad query searching across act name, section number, year (LIKE with wildcards across all relevant D1 columns)
>
> List every file and function modified.

**Brief 6 — Functionality: legislation "View" link fix**
> Read all HTML files in `Arc v 4/public/` and `Worker.js`.
> 1. In Sources Retrieved panel on legal research page — find "View" button on legislation results. Change redirect from case search area to legislation page
> 2. In Library page — find "View" option on legislation entries. Same fix
>
> List every file and handler modified.

---

## CLOUDFLARE ACCOUNT

- **Plan:** Workers Free
- **Account ID:** `def9cef091857f82b7e096def3faaa25`
- **Browser Rendering `/crawl`** — available on Free plan. Potential future use for secondary source ingestion (Bar Association publications, Law Reform Commission reports). NOT suitable for AustLII (self-identifies as bot).

---

## COMPONENT NOTES

Operational limitations, gotchas, and non-standard invocations for stack components.

### enrichment_poller.py

Not container-native. Defaults to `localhost` for Ollama (port 11434) and Qdrant (port 6334). When run via `docker compose exec`, must override:

```
OLLAMA_URL=http://ollama:11434
QDRANT_URL=http://qdrant-general:6333
```

These are now set in the `agent-general` environment block in `docker-compose.yml`.

**`--loop` flag already implemented** — correct invocation is: `docker compose exec -d agent-general python3 /app/src/enrichment_poller.py --loop` · `OLLAMA_URL` and `QDRANT_URL` now set in docker-compose.yml (added 17 Mar 2026) so no inline env var overrides needed after next agent-general restart.

### Workers AI (Cloudflare) — model and usage inventory

**Current model:** `@cf/meta/llama-3.1-8b-instruct` — used for ALL Workers AI calls via `callWorkersAI()` helper (line 31), except `handleLegalQueryWorkersAI()` which calls `env.AI.run` directly with the same model. The `llama-3.2-3b-instruct` reference was incorrect — does not exist in Worker.js.

**Active Workers AI calls:**

- **`summarizeCase()`** — two-pass case enrichment at scrape time (pass 1: facts/issues/case_name from opening; pass 2: principles/holdings/legislation from reasoning). Upgrade target: `@cf/qwen/qwen3-30b-a3b-fp8`.
- **`handleLegalQueryWorkersAI()`** — Phase 5 fast/free query toggle. Evaluate model upgrade separately.
- **`handleDraft()`, `handleNextActions()`, `handleWeeklyReview()`, `handleClarifyAgent()`** — Axiom journal features (entry drafting, next actions, weekly review, clarification). Not legal extraction — upgrade optional, low priority.

**Planned:** `/api/legal/extract-metadata` route (not yet built) — scraper metadata pre-extraction. Will use `@cf/qwen/qwen3-30b-a3b-fp8`. Upgrade `summarizeCase()` at the same time when scraper work resumes.

> Do NOT do a global model string replace — query handler and journal functions need independent evaluation.

### Qdrant payload field names

- Secondary source type filter: field = `type`, value = `secondary_source` (NOT `source_type`)
- Legislation type filter: field = `type`, value = `legislation`
- Ghost points from pre-type-field era were deleted 17 Mar 2026 — any future wipe should check for typeless points

### secondary_sources D1 schema notes

- PK is `id` (TEXT) — populated from CITATION metadata field in master_corpus
- No `citation` column exists — do not query for it
- Category default is `'doctrine'` (D1 column default)
- Full column list: id, title, source_type, author, date_published, tags, related_cases, related_acts, raw_text, chunk_count, date_added, enriched_text, enriched, embedded, enrichment_error, category, embedding_model, embedding_version

### ingest_corpus.py

- INPUT_FILE is hardcoded — must be manually changed between part1 and part2 runs
- Located at: `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\ingest_corpus.py`
- Dedup logic: repeated citations get [2], [3] suffixes in encounter order
- Minimum body length check: chunks under 100 chars are logged as warnings but still ingested

### master_corpus files

- master_corpus_part1.md: 317 chunks, 705,516 bytes
- master_corpus_part2.md: 821 chunks, 1,524,842 bytes
- Location: `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\` (and duplicate in `Arc v 4\`)
- NOT on VPS — local Windows only
- Total corpus: 1,138 chunks

### corpus_manifest.json

- Generated by generate_manifest.py
- Location: `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\corpus_manifest.json`
- Contains: source_file, chunk_index, id, citation_raw, heading, category, body_length, raw_text_hash
- Ground truth for post-ingest D1 validation and backfill alignment

### retrieval_baseline.sh

- Location: VPS `~/retrieval_baseline.sh`
- Usage: `KEY=your_nexus_key bash ~/retrieval_baseline.sh`
- Runs 15 baseline questions, prints top 3 chunks per question with scores
- Run after every embed pass or server.py change to validate retrieval quality

### Worker.js — filename casing

File is currently `Arc v 4/Worker.js` (capital W). On case-sensitive filesystems (Linux, macOS, most CI/CD) this differs from the conventional `worker.js`. Wrangler on Windows currently resolves it correctly, but any tooling, import, or deploy pipeline running on a case-sensitive host will fail to find the file.

**Pending action:** rename to `worker.js` (lowercase). Do this as a two-step git rename on a case-sensitive system, or use `git mv Worker.js worker.js` — Windows git may require a temporary intermediate name to avoid a no-op rename.

---

## FUTURE ROADMAP

- **Legislation enrichment via Claude API** — plain English summaries, cross-references, key concepts. Do AFTER cross-reference agent design confirmed.
- **Auto-populate legislation metadata on upload** — Claude API reads filename/first page, populates title/jurisdiction/year.
- **BM25 improvements** — proper scoring + hybrid ranking with semantic scores. Current: score:0.0 append only.
- **Console status indicator** — show enriched/embedded progress per document after upload.
- **Performance evaluation** — Claude API vs Workers AI response quality. First baseline 15 Mar 2026.
- **Doctrinal normalisation pass** — after retrieval quality validated.
- **Cross-jurisdiction retrieval synonyms** — query expansion layer. After baseline retrieval quality confirmed.
- **Qwen3 UI toggle** — add third button to model toggle once Qwen validated. Route already exists in Worker.
- **Reingest-case route** — delete + reingest pattern to backfill case_name into Qdrant for existing cases. Build after scraper has run at volume.
- **Nightly cron for xref_agent.py** — after scraper is actively running.
- **Stare decisis layer** — surface treatment history from case_citations when a case returned in search results.
- **Animated sigil** — if rotating GIF produced, swap `sigil.jpg` for `sigil.gif` in nav (same position, 36px height).
- **UI generator** — find a UI/website generator for smoother frontend iteration.
