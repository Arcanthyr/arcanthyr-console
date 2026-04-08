# CLAUDE.md — Arcanthyr Session Handover
*Updated: 15 March 2026*

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

## SYSTEM STATE (as of 15 Mar 2026)

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

## RAG WORKFLOW / CORPUS PROCESSING

**Two-prompt system for Hogan on Crime re-processing:**

1. Master Prompt → doctrine chunks (standard enrichment)
2. Procedure Prompt → practitioner/procedure chunks
3. UNPROCESSED follow-up → catches units flagged by Master Prompt
4. Validation Prompt → quality check (split corpus into two documents if too large for single pass — split at clean citation boundary)

**Procedure Prompt constraint:** Must preserve scripted questions, examination sequences, and tactical notes intact — NOT summarise or sanitise. The practitioner value is in the exact wording and sequence.

**Selection rule:**
- Default to Master Prompt
- Switch to Procedure Prompt for blocks containing scripted questions, numbered workflows, bold/italic practitioner notes, or in-court step sequences
- When in doubt: run Master Prompt first, check UNPROCESSED, run Procedure Prompt on flagged sections

---

## PRIORITIES — NEXT SESSION

### Priority 1 — Procedure chunk re-processing (Hogan on Crime)
Retrieval testing confirmed procedural content gap is material. Process blocks in this order:

1. block_027 (s 38 hostile witness — highest value, Procedure Prompt already validated)
2. block_020
3. block_008
4. block_024
5. block_021
6. block_007
7. Identify tendency evidence block — check which block covers s 97/tendency applications, add to list

For each block: run through Procedure Prompt → review output → append to master_corpus.md → upload via console → confirm embedded.

Also check for blocks with corpus gaps confirmed in retrieval testing:
- Recklessness (Criminal Code fault elements)
- Sentencing principles for first offenders
- Corroboration (NOTE: do not add corroboration chunk until Hogan on Crime re-processing complete — that material may capture it correctly. The s 64 Evidence Act definition previously cited by the system does NOT exist — corroboration largely abolished under uniform evidence law.)

### Priority 2 — Broader corpus audit
Before scraper resumes, audit master_corpus.md for procedural content that was formalised by the Master Prompt (no informal markers) and is therefore not flagged by the existing block inventory. Use missed-recall patterns from retrieval testing to identify which topics to audit first.

### Priority 3 — Resume scraper
Only after Priority 1 and 2 have meaningfully improved retrieval quality on practitioner queries.

Pre-scraper checklist:
- [x] Confirm `summarizeCase()` prompt includes judge and parties
- [x] Confirm scraper routes AustLII fetches via `arcanthyr.com/api/legal/fetch-page` proxy
- [x] Scraper runs locally on Windows — NOT on VPS (VPS IP blocked by AustLII)
- [ ] After first scraping batch: run `xref_agent.py --mode both`
- [ ] After first scraping batch: set up xref_agent.py nightly cron

### Priority 4 — Cross-reference agent ✅ COMPLETE (15 Mar 2026)
Tables, Worker routes, and xref_agent.py built and validated.

Remaining follow-up:
- [ ] Nightly cron setup — after scraper is actively running
- [ ] Wire case_legislation_refs into BM25 improvement pass (proper scoring, not score:0.0)
- [ ] Stare decisis layer — surface treatment history from case_citations when a case is returned in search results
- [ ] Backfill case_name into Qdrant for existing 8 cases — build `reingest-case` Worker route (delete + reingest pattern) after scraper has run at volume

### Priority 5 — Schema versioning backfill for cases
Add `embedding_model` and `embedding_version` to `cases` table (currently only on secondary_sources and legislation_sections). Backfill when cases corpus is populated.

---

## FUTURE ROADMAP

- **Hogan on Crime procedural re-processing** — Priority 1 above. Full book re-processing if retrieval testing reveals further material gaps beyond identified blocks.
- **Legislation enrichment via Claude API** — plain English summaries, cross-references, key concepts. Write enrichment prompt to specifically support cross-reference agent — not generic summarisation. Do AFTER cross-reference agent design confirmed (DONE).
- **Cross-reference agent** — BUILT (Priority 4). Nightly cron pending. Next: BM25 scoring improvement, stare decisis layer in search results UI.
- **Auto-populate legislation metadata on upload** — Claude API reads filename/first page, populates title/jurisdiction/year fields. Prevents typo slugs. Low complexity, high daily-use value.
- **Automated ingestion pipeline** — drag-and-drop → Claude API enrichment/splitting → embed. For smaller documents. Larger docs (Hogan on Crime scale) stay on manual ChatGPT pipeline.
- **BM25 improvements** — proper scoring, hybrid ranking. Current: score:0.0 append. Future: proper BM25 scoring + hybrid ranking with semantic scores.
- **Console status indicator** — show enriched/embedded progress per document after upload.
- **Performance evaluation** — Claude API vs Workers AI response quality. First baseline data point captured 15 Mar 2026 (planning law query, thin corpus). Full evaluation after corpus validated.
- **Doctrinal normalisation pass** — after retrieval quality validated. If missed recalls on related concepts confirmed, normalise synonym handling across corpus before adding query expansion layer.
- **Cross-jurisdiction retrieval synonyms** — query expansion layer: intercept search query, expand with synonyms before Qdrant call. Implement only after baseline retrieval quality confirmed.
- **Qwen3 UI toggle** — add third button to model toggle in console.html once Qwen validated for production use. Route already exists in Worker.
- **Reingest-case route** — delete + reingest pattern to backfill case_name into Qdrant for existing cases. Build after scraper has run at volume.
- **Animated sigil** — if a rotating GIF of the sigil is produced, swap `sigil.jpg` for `sigil.gif` in nav on all pages (same position, same 36px height).

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
- Do not resume until Priority 1 (procedural re-processing) is substantially complete

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
| master_corpus.md | `Arc v 4/master_corpus.md` |
| block_*.txt | repo root |
| Worker.js | `Arc v 4/Worker.js` |
| CLAUDE.md | `Arc v 4/CLAUDE.md` |
| austlii_scraper.py | `Local Scraper/` (not in git) |
| reprocess_cases.ps1 | `Arc v 4/reprocess_cases.ps1` — backfill judge/parties for existing cases ONLY. Does NOT re-embed or touch Qdrant. |
| RAG_Workflow_Arcanthyr_v1.docx | manually maintained — prompt reference document |
| docker-compose.yml | `~/ai-stack/docker-compose.yml` (VPS) |
| split_legal_doc.py | repo root |

---

## KNOWN ISSUES / WATCH LIST

- **authorities_extracted vs key_authorities** — D1 column is `authorities_extracted`. `key_authorities` is the Llama prompt field name only — does NOT exist as a D1 column. Do not use `key_authorities` in any Worker or agent query.
- **case_name missing from Qdrant for existing 8 cases** — fix applied to server.py 15 Mar 2026 but only affects future ingests. Existing vectors show citation-only in LLM context. Backfill requires reingest-case route — deferred until scraper has run at volume.
- **Unknown chunk in sources panel** — one semantic result displaying as `unknown Unknown score 0.678`. Pre-existing corpus chunk with incomplete metadata. Not related to xref or BM25 changes.
- **Llama returning literal `"null"` string** — `asString()` helper won't catch this, written to D1 as string "null". Latent risk, not currently causing issues. Audit D1 after bulk scraping.
- **Workers AI prompt length sensitivity** — verbose prompts cause CPU timeout. Keep Workers AI path prompts concise. If queries timeout, suspect prompt length first.
- **Tendency evidence corpus gap** — doctrine partial (Brown v Tasmania, McPhillamy present), procedure missing. Identify which Hogan on Crime block covers s 97 and add to Priority 1 list.
- **Corroboration corpus gap** — s 64 Evidence Act definition cited by system does NOT exist. Corroboration has largely been abolished under uniform evidence law. Do not add a chunk until Hogan on Crime re-processing complete.
- **AustLII block** — VPS IP (31.220.86.192) permanently blocked by AustLII. Scraper must run locally on Windows only. Fetches route via Cloudflare proxy.
- **Cloudflare Workers Observability disabled** — use `npx wrangler tail arcanthyr-api` in a second PowerShell window for real-time logs during debugging.
- **nexus health check port is 18789** — not 8000. Always curl `http://localhost:18789/health` after agent-general restart.
