# CLAUDE.md — Arcanthyr Session Handover
*Updated: 15 March 2026 (evening)*

---

## SESSION RULES
- Open every session by reading this file first.
- Diagnose from actual output before recommending fixes.
- Run `git add -A`, `git commit`, `git push origin master` separately after every `npx wrangler deploy` — PowerShell does not support `&&`.
- Before every deploy: verify upload list shows only files from `public/` — if `.env` or `.git` appear, stop immediately.
- Suggest context window restart proactively when conversation grows long.
- **Claude Code (CC) is available in VS Code** — use it for all file edits, script runs, and terminal work. Hand off to CC with explicit instructions rather than describing changes for Tom to make manually. CC cannot establish SSH connections — Tom opens SSH tunnels, CC handles everything else.
- **wrangler d1 execute must be run from `Arc v 4/` directory** where `wrangler.toml` lives — not from repo root. Always add `--remote` flag for live D1.
- **PowerShell execution policy** — ALWAYS run this first in every new PowerShell session before any npx/wrangler command: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
- **grep does not exist in PowerShell** — use `Select-String` instead, or run grep on VPS SSH terminal.
- **PowerShell heredoc / &&** — neither works. Run commands one at a time. No `&&`. No `<<'EOF'`.
- **CC brief pattern** — always ask CC to read relevant files and report current state before making changes. Never assume file contents.

---

## TOOLING
- **Claude.ai (chat)** — architecture decisions, planning, debugging from output, writing CLAUDE.md, reviewing code before deploy
- **Claude Code (VS Code)** — file edits, running scripts, terminal commands, git operations, wrangler deploys
- **PowerShell (local)** — SSH to VPS, scp file transfers, anything CC can't do

---

## SYSTEM STATE (as of 15 Mar 2026 evening)

| Component | Status |
|---|---|
| Qdrant collection | `general-docs-v2` · **1984 points** · 1024-dim cosine · embed pass COMPLETE |
| Embedding model | `argus-ai/pplx-embed-context-v1-0.6b:fp32` (Ollama, VPS Docker) |
| Score threshold | 0.45 (empirically validated) |
| D1 `cases` | 8 rows — 2026 scrape batch (TASSC 1–6, TASFC 1–2) · judge + parties backfilled |
| D1 `secondary_sources` | 711 rows · enriched=1, embedded=1 · category=doctrine · embedding_model + embedding_version populated |
| D1 `legislation` | 5 Acts · embedded=1 · 1272 sections in Qdrant · embedding_model + embedding_version populated |
| D1 `case_citations` | 5 rows · 1 case processed · ready to scale with scraper |
| D1 `case_legislation_refs` | 5 rows · 1 case processed · ready to scale with scraper |
| Worker.js | Latest deployed (402aa0e9) |
| enrichment_poller.py | In repo + VPS · includes category in Qdrant payload |
| server.py | pplx-embed + general-docs-v2 + threshold 0.45 + BM25 pre-retrieval LIVE · case_name added to ingest payload (15 Mar 2026) |
| xref_agent.py | Built + validated · VPS · INSERT OR IGNORE idempotency confirmed |
| Phase 5 | VALIDATED — citation discipline rules live, hallucination significantly reduced |
| BM25 pre-retrieval | LIVE — legislation sections layer + case-law layer (case_legislation_refs) |
| Workers AI citation discipline | TIGHTENED 15 Mar 2026 — approved gap phrase enforced, confabulation substantially reduced |
| Frontend | Dark Gazette theme deployed — see Frontend section below |
| Hogan on Crime re-processing | **IN PROGRESS** — automated pipeline running overnight (see RAG Pipeline section) |

---

## ARCHITECTURE

**Stack:** Cloudflare Worker (`arcanthyr-api`) + D1 (`arcanthyr`) + Qdrant (`general-docs-v2`, port 6334) + Ollama/pplx-embed (Docker) + nexus `server.py` (Docker `agent-general`)

**VPS:** Contabo, `31.220.86.192`, Ubuntu 24.04, 23GB RAM, 6 vCPU
**Live site:** `arcanthyr.com` (Cloudflare Worker custom domain)
**GitHub:** `https://github.com/Arcanthyr/arcanthyr-console`

**D1 vs Qdrant:**
- D1 = source of truth / relational. Library UI reads from D1. Text and metadata live here permanently.
- Qdrant = semantic search index. Vectors + chunk_id payload pointing back to D1 rows. Rebuilt from D1 if needed.
- Library delete wipes Qdrant chunks but NOT D1 rows.
- Full reset: `wrangler d1 execute DELETE` on relevant table + Qdrant collection delete + recreate.

**Data flow (Pipeline v2 — CURRENT):**
```
Console upload → Worker → D1 (raw_text stored, enriched=0, embedded=0)
                       → NO nexus call (fire-and-forget removed in v9)

VPS enrichment_poller.py (manual or cron):
  --mode enrich    → fetches enriched=0 rows → Claude API → writes enriched_text → enriched=1
  --mode embed     → fetches enriched=1, embedded=0 rows → pplx-embed → Qdrant → embedded=1
                   → ALSO runs legislation embedding pass automatically
  --mode both      → enrich then embed in sequence
  --mode reconcile → diffs D1 embedded=1 vs Qdrant chunk_ids → resets missing to embedded=0
  --loop           → runs continuously (60s sleep between passes)
  --status         → prints pipeline counts and exits
```

**CRITICAL — Enrichment model by content type:**
| Content | Enrichment model | Notes |
|---|---|---|
| Scraped cases (bulk) | Workers AI / Llama 3.1 8B — in Worker at ingest time | Free, automated, NOT via VPS poller |
| Manual case uploads | Workers AI / Llama — same Worker path | NOT via VPS poller |
| Secondary sources corpus | None — raw_text IS the content (pre-enriched manually via ChatGPT) | embed raw_text directly |
| Legislation | None — raw statutory text embedded directly | |
| Future secondary source uploads (small volume) | Claude API via poller | Acceptable for low volume |

The VPS poller's Claude API enrichment path is for small-volume secondary source uploads ONLY. Scraped cases are enriched by Workers AI (Llama 3.1 8B) inside the Worker at ingest time — never through the poller.

**Secondary sources corpus — IMPORTANT:**
- 711 rows, all enriched=1 (set manually — raw_text is the content, no Claude API enrichment needed)
- enriched_text is NULL across all rows — this is correct, poller falls back to raw_text
- Do NOT run `--mode enrich` on these rows

**BM25 pre-retrieval (LIVE):**
```
User query
    ↓
Step 1 — Semantic search → top 6 Qdrant chunks
    ↓
Step 2 — Extract section references from query text (regex: s\s*(\d+[A-Z]?)(?!\d))
    ↓
Step 3 — Fetch matching rows from legislation_sections AND secondary_sources via
         Worker route /api/pipeline/fetch-sections-by-reference
    ↓
Step 3b — Fetch cases citing same legislation from case_legislation_refs via
          Worker route /api/pipeline/fetch-cases-by-legislation-ref (LIKE '% s N%')
    ↓
Step 4 — Merge, deduplicate, append with bm25:true and score:0.0
         Case-law BM25 chunks carry bm25_source:"case_litigation_ref"
    ↓
Response generator (Workers AI / Claude API)
```

Note: BM25 extracts refs from QUERY TEXT ONLY — not from returned chunks — to avoid cascade noise.

**Cross-reference Worker routes (added 15 Mar 2026):**
- `GET  /api/pipeline/fetch-cases-for-xref` — returns citation + authorities_extracted + legislation_extracted for all cases with xref data. Paginated (limit/offset).
- `POST /api/pipeline/write-citations` — batch INSERT OR IGNORE into case_citations
- `POST /api/pipeline/write-legislation-refs` — batch INSERT OR IGNORE into case_legislation_refs
- `POST /api/pipeline/fetch-cases-by-legislation-ref` — takes references array, LIKE matches against case_legislation_refs, joins to cases. Returns citation + case_name + court + holding.

All four use standard inline X-Nexus-Key auth pattern.

**Case ingest path (IMPORTANT — different from secondary sources):**
Cases do NOT go through enrichment_poller.py for embedding. They go:
```
Worker summarizeCase() → nexus /ingest endpoint → server.py ingest_text() → Qdrant
```
The Qdrant payload for cases is built in `ingest_text()` in server.py. `case_name` is now included in this payload (added 15 Mar 2026). All future scrapes will have `case_name` in Qdrant vectors automatically.

**Existing 8 cases — known gap:** `case_name` is NOT in their Qdrant payloads (fix applied after they were ingested). Citation-only display degrades gracefully. Backfill requires a `reingest-case` Worker route (delete + reingest pattern). Not worth building for 8 cases — defer until scraper has run at volume.

**server.py (nexus):**
- Lives in `agent-general/src/` — volume-mounted
- Local copy: `Arc v 4/arcanthyr-nexus/server.py` (gitignored)
- Update: edit locally → SCP → `docker compose restart agent-general` → curl health check
- **Port is 18789** — not 8000. Always health check on `http://localhost:18789/health` after restart.

**SCP commands:**
```powershell
# enrichment_poller.py
scp "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\enrichment_poller.py" tom@31.220.86.192:~/ai-stack/agent-general/src/

# server.py
scp "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\arcanthyr-nexus\server.py" tom@31.220.86.192:~/ai-stack/agent-general/src/server.py

# xref_agent.py
scp "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\xref_agent.py" tom@31.220.86.192:~/ai-stack/agent-general/src/
```

---

## D1 SCHEMA (current — fully updated 15 Mar 2026)

**cases:**
id, citation, court, case_date, case_name, url, facts, issues, holding, principles_extracted,
processed_date, summary_quality_score, raw_text, holdings_extracted, legislation_extracted,
authorities_extracted, enriched, embedded, enrichment_error, judge, parties

**secondary_sources:**
id, title, source_type, author, date_published, tags, related_cases, related_acts, raw_text,
chunk_count, date_added, enriched_text, enriched, embedded, enrichment_error, category,
embedding_model, embedding_version

**legislation:**
id, title, jurisdiction, act_type, embedded

**legislation_sections:**
id, legislation_id, section_number, heading, text, part,
embedding_model, embedding_version

**case_citations:**
id (SHA1 of citing_case|cited_case), citing_case, cited_case, treatment, why, date_added

**case_legislation_refs:**
id (SHA1 of citation|legislation_ref), citation, legislation_ref, date_added

**email_contacts:**
id, name, email, role, organisation, jurisdiction, date_added, notes

---

## LLM QUERY PATHS

| Path | Model | Route |
|---|---|---|
| Claude API | claude-sonnet-4-20250514 | POST /api/legal/legal-query |
| Workers AI | @cf/meta/llama-3.1-8b-instruct | POST /api/legal/legal-query-workers-ai |
| Qwen3 | Via nexus | POST /api/legal/legal-query-qwen |

**Frontend model toggle:** Workers AI is default on page load. Toggle switches between Workers AI and Claude only. Qwen is intentionally not exposed in the UI yet — route exists in Worker, no frontend button.

**Citation format in LLM context (updated 15 Mar 2026):**
Cases are now formatted as `{case_name} {citation} ({court})` — e.g. `Smith v Jones [2024] TASSC 42 (Supreme)`. The `[N]` chunk index prefix has been removed. `case_name` degrades gracefully to empty string for existing 8 cases (citation-only display) until Qdrant backfill.

**Workers AI citation discipline (tightened 15 Mar 2026):**
Llama system prompts now include "Never invent citations" in every variant. User prompt citation rules expanded from a single IMPORTANT sentence to 5 explicit rules including an approved gap phrase: "The retrieved sources do not contain sufficient information on this point." Confabulation on insufficient sources substantially reduced — confirmed in live testing.

**First live A/B comparison — 15 Mar 2026 (planning law query, thin corpus):**
- Workers AI: after tightening, used approved gap phrase correctly, no fabricated conclusions
- Claude API: correctly identified source limitations, transparently admitted gap without padding
- Baseline data point for future performance evaluation once corpus is validated

---

## XREF AGENT

**xref_agent.py — usage:**
```bash
# On VPS — always source env first
set -a && source ~/ai-stack/.env && set +a

python3 ~/ai-stack/agent-general/src/xref_agent.py --mode both       # full run
python3 ~/ai-stack/agent-general/src/xref_agent.py --mode citations   # citations only
python3 ~/ai-stack/agent-general/src/xref_agent.py --mode legislation # legislation refs only
python3 ~/ai-stack/agent-general/src/xref_agent.py --mode status      # connectivity check
```

**Run after every scraping batch.** Fully idempotent — safe to re-run at any time.

**Dedup mechanism:** SHA1 hash of `citing_case|cited_case` (citations) and `citation|legislation_ref` (legislation refs). INSERT OR IGNORE — re-runs skip existing rows automatically.

**Data source:** Reads `authorities_extracted` and `legislation_extracted` from D1 `cases` table.
- `authorities_extracted` — JSON array of `{name, treatment, why}` objects. Treatment values: applied, followed, distinguished, mentioned, cited.
- `legislation_extracted` — JSON array of plain strings e.g. `"Evidence Act 2001 (Tas) s 138"`

**CRITICAL naming:** D1 column is `authorities_extracted`. `key_authorities` is the Llama prompt field name only — it does NOT exist as a D1 column. Do not use `key_authorities` in any D1 query.

**Cron — PENDING:** Set up nightly cron once scraper is actively running.

---

## FRONTEND

**Dark Gazette theme** — live at arcanthyr.com
- Colour tokens: `--blue`, `--blue-dim` (gold removed entirely in 14 Mar session)
- Output text: Georgia
- `.btn-primary`: blue bg, white text, Times New Roman
- Index page: centred card layout

**Console model toggle:** Workers AI default, Claude toggle. Qwen not wired in UI.

**Sources panel citation format:** Now displays `Case Name [Year] Court DecisionNo` where case_name is available. Existing 8 cases show citation only until Qdrant backfill.

---

## RAG PIPELINE — AUTOMATED HOGAN ON CRIME REPROCESSING

**Status: RUNNING OVERNIGHT (started 15 Mar 2026 evening)**

This session built and validated an automated pipeline (`process_blocks.py`) to re-process all 56 Hogan on Crime blocks through the Master and Procedure prompts, replacing the previous manual ChatGPT workflow.

### What was built

**`process_blocks.py`** — located at `Arc v 4/process_blocks.py`

Automated pipeline that:
1. Reads each block file from `blocks_3k/` sequentially
2. Sends each block through Master Prompt (fresh context) then Procedure Prompt (fresh context)
3. Extracts only `## FORMATTED CHUNKS` sections from each response
4. Appends to `master_corpus_part1.md` (blocks 1–28) or `master_corpus_part2.md` (blocks 29–56)
5. Auto-triggers follow-up prompt in same session if FINAL STATUS is not READY FOR APPEND
6. Logs every call to `process_log.txt`
7. Logs failures to `failed_blocks.txt` with block number, prompt name, and error

**Key configuration (current):**
```python
MODEL         = "gpt-5-mini-2025-08-07"
MAX_TOKENS    = 32000        # max_completion_tokens
BLOCKS_DIR    = "./blocks_3k"
TOTAL_BLOCKS  = 56
PART1_END     = 28           # blocks 1-28 → part1, 29-56 → part2
SLEEP_BETWEEN = 5            # seconds between calls
```

**Resilience features:**
- 4 retry attempts per call
- 60s backoff on rate limit errors (429), 10s on other errors
- Failed blocks logged to `failed_blocks.txt` — re-run with `--single N`
- End-of-run summary prints failed blocks if any

**CLI flags:**
```
python process_blocks.py                  # full run
python process_blocks.py --start-from 15 # resume from block 15
python process_blocks.py --single 7      # re-run one block
python process_blocks.py --test          # blocks 1-2 only
python process_blocks.py --dry-run       # validate config, no API calls
```

### Source file locations

| File | Path |
|---|---|
| process_blocks.py | `Arc v 4/process_blocks.py` |
| blocks_3k/ | `Arc v 4/blocks_3k/` — 56 files at ~3,000 words each |
| blocks/ | `Arc v 4/blocks/` — original 32 files at ~5,000–7,400 words (keep as backup) |
| hogan_on_crime.md | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\hogan_on_crime.md` |
| split_legal_doc.py | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\split_legal_doc.py` |
| master_corpus_part1.md | `Arc v 4/master_corpus_part1.md` — generated by pipeline |
| master_corpus_part2.md | `Arc v 4/master_corpus_part2.md` — generated by pipeline |
| process_log.txt | `Arc v 4/process_log.txt` |
| failed_blocks.txt | `Arc v 4/failed_blocks.txt` — only exists if failures occurred |

### Model selection rationale

Tested models during this session:
- `gpt-5-mini-2025-08-07` — **SELECTED**. Fast (~1.5 min/call), good instruction following on 3k-word blocks, full coverage confirmed on block_002 test. Cost estimate ~$3 for full 56-block run.
- `gpt-5.2` — rejected. Near-empty output on test (7 lines, 264 bytes). Unusable.
- `gpt-5.4` — rejected. Stalled at 23+ minutes on single block, produced near-empty output. Unusable for this volume.

Mini on 3,000-word blocks performs significantly better than mini on the original 5,000–7,400-word blocks. The resplit from 32 → 56 blocks was the key fix.

### API configuration notes (OpenAI mini-specific)

Mini requires different parameters than standard OpenAI models:
- Use `max_completion_tokens` NOT `max_tokens` — mini rejects `max_tokens` with 400 error
- Do NOT pass `temperature` parameter — mini only supports default (1), rejects explicit values
- `\r\n` line endings in responses — extraction regex must normalise before matching (already handled in script)

### Morning checklist after overnight run

1. Check `process_log.txt` — confirm all 56 blocks completed
2. Check `failed_blocks.txt` — if exists, re-run each failed block with `--single N`
3. Check file sizes of `master_corpus_part1.md` and `master_corpus_part2.md` — should be substantial (100KB+ each)
4. Spot-check output quality — open corpus files and verify chunk structure, metadata markers, and coverage
5. Bring corpus files to Claude.ai for global validation pass before ingestion
6. After validation: upload via Arcanthyr console → run embed pass on VPS → confirm Qdrant point count increase

### After overnight run — next steps

1. **Global validation pass** — run Validation Prompt (Section 9 of RAG_Workflow_Arcanthyr_v1.docx) across each corpus file. Split into two passes (part1 and part2) — each is too large for a single context window pass together.
2. **Wipe existing secondary_sources corpus** — the 711 rows in D1 and corresponding Qdrant vectors are the old ChatGPT-enriched corpus with known procedural content gaps. After validation confirms the new corpus is clean, wipe and re-ingest.
3. **Upload new corpus** — upload `master_corpus_part1.md` and `master_corpus_part2.md` via Arcanthyr console upload endpoint.
4. **Run embed pass** — `python3 enrichment_poller.py --mode embed` on VPS.
5. **Confirm Qdrant point count** — should increase significantly from 1984.
6. **Retrieval testing** — test the practitioner queries that previously failed (s 38 hostile witness, tendency evidence, recklessness, first offender sentencing).

---

## RAG WORKFLOW PROMPTS

The full prompt text for all four prompts (Master, Procedure, Follow-up, Validation) is documented in `RAG_Workflow_Arcanthyr_v1.docx` (manually maintained). The Master and Procedure prompts are also embedded verbatim in `process_blocks.py` as constants `MASTER_PROMPT`, `PROCEDURE_PROMPT`, and `FOLLOWUP_PROMPT`.

**Two-prompt system design:**
- Master Prompt → formal doctrine chunks (`[CATEGORY: doctrine]`)
- Procedure Prompt → practitioner/procedure chunks (`[CATEGORY: procedure]`)
- Both prompts run on every block — master covers doctrinal content, procedure covers scripted questions, workflows, annotations
- Follow-up prompt fires automatically in same session if FINAL STATUS ≠ READY FOR APPEND
- Validation Prompt → global quality check on assembled corpus (run manually after assembly)

**Key design constraint:** Each block processed in a completely fresh context window — no shared history between blocks or between master/procedure passes within the same block. Follow-up is the only exception (appends to same session).

**Output extraction:** Only `## FORMATTED CHUNKS` section extracted from each response. All other sections (SOURCE DOCTRINAL UNITS, COVERAGE REPORT, VALIDATION REPORT, FINAL STATUS) are discarded from corpus output.

---

## PRIORITIES — NEXT SESSION

### Priority 1 — Complete Hogan on Crime automated re-processing ⏳ IN PROGRESS
- Morning: check process_log.txt and failed_blocks.txt
- Re-run any failed blocks with `--single N`
- Run global validation pass on both corpus files
- Wipe old secondary_sources corpus and re-ingest new corpus
- Run embed pass on VPS
- Confirm retrieval quality improvement on practitioner queries

### Priority 2 — Retrieval testing after new corpus ingested
Test these specific queries that previously failed or returned gaps:
- s 38 hostile witness procedure
- Tendency evidence (s 97) — doctrine + procedure
- Recklessness (Criminal Code fault elements)
- Sentencing principles for first offenders
- Corroboration (NOTE: s 64 Evidence Act definition cited by old system does NOT exist — largely abolished under uniform evidence law. Do not add a corroboration chunk until confirmed clean from new corpus.)

### Priority 3 — Resume scraper
Only after Priority 1 and 2 have meaningfully improved retrieval quality on practitioner queries.

Pre-scraper checklist:
- [x] Confirm `summarizeCase()` prompt includes judge and parties
- [x] Confirm scraper routes AustLII fetches via `arcanthyr.com/api/legal/fetch-page` proxy
- [x] Scraper runs locally on Windows — NOT on VPS (VPS IP blocked by AustLII)
- [ ] After first scraping batch: run `xref_agent.py --mode both`
- [ ] After first scraping batch: set up xref_agent.py nightly cron

### Priority 4 — Cross-reference agent follow-up
- [ ] Nightly cron setup — after scraper is actively running
- [ ] Wire case_legislation_refs into BM25 improvement pass (proper scoring, not score:0.0)
- [ ] Stare decisis layer — surface treatment history from case_citations when a case is returned in search results
- [ ] Backfill case_name into Qdrant for existing 8 cases — build `reingest-case` Worker route after scraper has run at volume

### Priority 5 — Schema versioning backfill for cases
Add `embedding_model` and `embedding_version` to `cases` table (currently only on secondary_sources and legislation_sections). Backfill when cases corpus is populated.

---

## FUTURE ROADMAP

- **Legislation enrichment via Claude API** — plain English summaries, cross-references, key concepts. Write enrichment prompt to specifically support cross-reference agent — not generic summarisation. Do AFTER cross-reference agent design confirmed (DONE).
- **Auto-populate legislation metadata on upload** — Claude API reads filename/first page, populates title/jurisdiction/year fields. Prevents typo slugs. Low complexity, high daily-use value.
- **Automated ingestion pipeline** — drag-and-drop → Claude API enrichment/splitting → embed. For smaller documents. Larger docs (Hogan on Crime scale) stay on automated process_blocks.py pipeline.
- **BM25 improvements** — proper scoring, hybrid ranking. Current: score:0.0 append. Future: proper BM25 scoring + hybrid ranking with semantic scores.
- **Console status indicator** — show enriched/embedded progress per document after upload.
- **Performance evaluation** — Claude API vs Workers AI response quality. First baseline data point captured 15 Mar 2026 (planning law query, thin corpus). Full evaluation after corpus validated.
- **Doctrinal normalisation pass** — after retrieval quality validated. If missed recalls on related concepts confirmed, normalise synonym handling across corpus before adding query expansion layer.
- **Cross-jurisdiction retrieval synonyms** — query expansion layer: intercept search query, expand with synonyms before Qdrant call. Implement only after baseline retrieval quality confirmed.
- **Qwen3 UI toggle** — add third button to model toggle in console.html once Qwen validated for production use. Route already exists in Worker.
- **Reingest-case route** — delete + reingest pattern to backfill case_name into Qdrant for existing cases. Build after scraper has run at volume.
- **Animated sigil** — if a rotating GIF of the sigil is produced, swap `sigil.jpg` for `sigil.gif` in nav on all pages (same position, same 36px height).
- **Two-tier model fallback for process_blocks.py** — if mini failure rate proves material after first full run, add gpt-5.4 automatic fallback for blocks where mini produces empty or sub-threshold chunk counts. Not needed yet — assess after overnight run results.

---

## SCRAPER CONFIG

- Courts: TASSC, TASCCA, TASFC, TAMagC
- Years: `range(2025, 2004, -1)` — 2025 to 2005 inclusive
- `MAX_CASES_PER_SESSION`: 100
- Delays: 10–20s random
- Business hours: 08:00–18:00 AEST
- Proxy: `arcanthyr.com/api/legal/fetch-page` — routes fetches via Cloudflare edge (VPS IP blocked by AustLII — run scraper locally only)
- Progress file: `scraper_progress.json` — deleted for clean slate
- Previously ingested: TASSC 2026 (1–6), TASFC 2026 (1–2) — 8 cases total in D1
- Do not resume until Priority 1 (corpus re-processing) is substantially complete

**Scraping workflow (confirmed design):**
```
austlii_scraper.py (local Windows)
    → fetches AustLII HTML via arcanthyr.com/api/legal/fetch-page proxy
    → strips HTML to plain text locally
    → derives citation from URL structure (e.g. /TASSC/2024/42.html → [2024] TASSC 42)
    → derives court_hint from URL path segment (TASSC → supreme)
    → POSTs raw text + citation + court_hint to /api/legal/upload-case
        → Worker: two Llama calls (pass 1: case_name/facts/issues/judge/parties,
                                    pass 2: holdings/legislation/key_authorities/principles)
        → D1: all fields written, enriched=1, embedded=0
    → nexus /ingest called by Worker → server.py ingest_text() → Qdrant
    → case_name now included in Qdrant payload for all future ingests ✓
```

**Post-scrape checklist:**
- Run `xref_agent.py --mode both` after each batch
- Audit D1 for Llama literal `"null"` strings (known latent risk — see Known Issues)

---

## KEY FILE LOCATIONS

| File | Path |
|---|---|
| enrichment_poller.py | `Arc v 4/enrichment_poller.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| server.py (nexus) | `Arc v 4/arcanthyr-nexus/server.py` (local, gitignored) · `~/ai-stack/agent-general/src/server.py` (VPS) |
| xref_agent.py | `Arc v 4/xref_agent.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| ingest_corpus.py | repo root — run from `Arc v 4/` |
| master_corpus.md | `Arc v 4/master_corpus.md` — OLD corpus (pre-automation, keep until new corpus validated) |
| master_corpus_part1.md | `Arc v 4/master_corpus_part1.md` — NEW corpus blocks 1–28 (generated by process_blocks.py) |
| master_corpus_part2.md | `Arc v 4/master_corpus_part2.md` — NEW corpus blocks 29–56 (generated by process_blocks.py) |
| process_blocks.py | `Arc v 4/process_blocks.py` — automated RAG pipeline script |
| blocks_3k/ | `Arc v 4/blocks_3k/` — 56 resplit blocks at ~3,000 words each |
| blocks/ | `Arc v 4/blocks/` — original 32 blocks at ~5,000–7,400 words (backup) |
| hogan_on_crime.md | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\hogan_on_crime.md` — source document |
| split_legal_doc.py | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\split_legal_doc.py` — block splitter |
| process_log.txt | `Arc v 4/process_log.txt` — pipeline run log |
| failed_blocks.txt | `Arc v 4/failed_blocks.txt` — exists only if failures occurred |
| Worker.js | `Arc v 4/Worker.js` |
| CLAUDE.md | `Arc v 4/CLAUDE.md` |
| austlii_scraper.py | `Local Scraper/` (not in git) |
| reprocess_cases.ps1 | `Arc v 4/reprocess_cases.ps1` — backfill judge/parties for existing cases ONLY. Does NOT re-embed or touch Qdrant. |
| RAG_Workflow_Arcanthyr_v1.docx | manually maintained — full prompt reference document |
| docker-compose.yml | `~/ai-stack/docker-compose.yml` (VPS) |

---

## KNOWN ISSUES / WATCH LIST

- **authorities_extracted vs key_authorities** — D1 column is `authorities_extracted`. `key_authorities` is the Llama prompt field name only — does NOT exist as a D1 column. Do not use `key_authorities` in any Worker or agent query.
- **case_name missing from Qdrant for existing 8 cases** — fix applied to server.py 15 Mar 2026 but only affects future ingests. Existing vectors show citation-only in LLM context. Backfill requires reingest-case route — deferred until scraper has run at volume.
- **Unknown chunk in sources panel** — one semantic result displaying as `unknown Unknown score 0.678`. Pre-existing corpus chunk with incomplete metadata. Not related to xref or BM25 changes.
- **Llama returning literal `"null"` string** — `asString()` helper won't catch this, written to D1 as string "null". Latent risk, not currently causing issues. Audit D1 after bulk scraping.
- **Workers AI prompt length sensitivity** — verbose prompts cause CPU timeout. Keep Workers AI path prompts concise. If queries timeout, suspect prompt length first.
- **Tendency evidence corpus gap** — doctrine partial (Brown v Tasmania, McPhillamy present), procedure missing. Should be captured in new corpus — verify in retrieval testing after ingestion.
- **Corroboration corpus gap** — s 64 Evidence Act definition cited by system does NOT exist. Corroboration has largely been abolished under uniform evidence law. Do not add a chunk until new corpus retrieval testing confirms the position.
- **AustLII block** — VPS IP (31.220.86.192) permanently blocked by AustLII. Scraper must run locally on Windows only. Fetches route via Cloudflare proxy.
- **Cloudflare Workers Observability disabled** — use `npx wrangler tail arcanthyr-api` in a second PowerShell window for real-time logs during debugging.
- **nexus health check port is 18789** — not 8000. Always curl `http://localhost:18789/health` after agent-general restart.
- **process_blocks.py debug_response.txt** — this file is overwritten by each API call and will always contain the LAST response (typically the procedure prompt follow-up). Not a reliable debug tool post-run. Use process_log.txt for run history instead.
- **OpenAI mini API quirks** — `max_completion_tokens` not `max_tokens`; do not pass `temperature` parameter; responses use `\r\n` line endings which require normalisation before regex extraction (handled in script).
- **PART1_END in process_blocks.py** — currently set to 28 (blocks 1–28 → part1, 29–56 → part2). If total block count changes from 56, update both `TOTAL_BLOCKS` and `PART1_END`.
