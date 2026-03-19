CLAUDE.md — Arcanthyr Session File
Updated: 19 March 2026 (end of session 7) · Supersedes all prior versions
Full architecture reference → CLAUDE_arch.md — UPLOAD EVERY SESSION alongside CLAUDE.md

---

## SESSION RULES

| Rule | Detail |
|---|---|
| Read this file first | Always |
| Upload both files | Upload CLAUDE.md AND CLAUDE_arch.md at the start of every session — both are required |
| Diagnose from actual output | Before recommending any fix |
| PowerShell setup | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` at start of every PS session — required before any wrangler/npx command |
| Always specify terminal | Every command must state: which terminal (VS Code, PowerShell, SSH/VPS) AND which directory |
| enrichment_poller | Runs as permanent Docker service `enrichment-poller` (restart: unless-stopped) — no tmux required · poller auto-restarts on crash/reboot · check logs: `docker compose logs --tail=20 enrichment-poller` |
| git commits | `git add -A`, `git commit`, `git push origin master` — separately, no && |
| Pre-deploy check | Verify upload list shows only `public/` files — if `.env` or `.git` appear, stop |
| wrangler d1 | Must run from `Arc v 4/` directory · always add `--remote` for live D1 |
| PowerShell limits | No &&, no heredoc `<<'EOF'`, no grep (use Select-String), no head (use Select-Object -First N) |
| CC brief pattern | Ask CC to read files and report state BEFORE making changes |
| CC cannot run Python | Windows Store stub blocks it — run Python in PowerShell terminal directly |
| CC vs SSH | CC for local file edits · SSH terminal for VPS runtime commands |
| Long-running scripts | Run directly in PowerShell terminal — CC too slow (confirmed: ingest runs, embed pass) |
| Context window | Suggest restart proactively when conversation grows long |
| D1 database name | arcanthyr (binding: DB, ID: 1b8ca95d-b8b3-421d-8c77-20f80432e1a0) |
| Component quirks | Document in CLAUDE_arch.md Component Notes section |
| qdrant-general host port | Host-side port is 6334 (not 6333) — docker-compose maps 127.0.0.1:6334->6333/tcp · always curl localhost:6334 from VPS host |
| Pasting into terminal | Never paste wrangler output back into terminal — type commands fresh · Never paste PS prompt prefix into terminal |
| Rogue d file | Delete with `Remove-Item "c:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\d"` if it reappears — commit deletion |
| server.py auth | All direct calls to localhost:18789 require header `X-Nexus-Key` · Get value: `grep NEXUS_SECRET_KEY ~/ai-stack/.env` on VPS · "unauthorized" = missing or wrong key |
| server.py search field | Search endpoint expects `query_text` (not `query`) · "query_text is required" = wrong field name · endpoint: `POST localhost:18789/search` |
| retrieval_baseline.sh | Requires `X-Nexus-Key` header and `query_text` field · results in `~/retrieval_baseline_results.txt` |
| ingest_corpus.py | Lives at `arcanthyr-console\ingest_corpus.py` (NOT inside `Arc v 4/`) · INPUT_FILE hardcoded — change manually · PROCEDURE_ONLY=True filters procedure chunks only · Block separator format MUST be `<!-- block_NNN master -->` or `<!-- block_NNN procedure -->` followed by `### Heading` then `[DOMAIN:]` on next line · Use Python (not PowerShell Out-File) to create corpus files — PowerShell BOM/encoding corrupts block separators · upload-corpus uses destructive upsert — do NOT re-run against already-ingested citations |
| Bash scripts on VPS | Large pastes truncate in SSH terminal — create files locally and SCP to VPS instead |
| PowerShell file creation | Use Python script to write files, not Out-File — BOM corruption confirmed on corpus files |
| upload-corpus auth | Route does NOT use X-Nexus-Key — uses User-Agent spoof: `Mozilla/5.0 (compatible; Arcanthyr/1.0)` |
| enriched=1 after ingest | After any secondary_sources ingest, always manually set `enriched=1` via wrangler d1 — new rows land with enriched=0 and poller won't embed them until this is done |
| Cloudflare Queues | LIVE — fetch-case-url and upload-case both async via queue · Queue name: arcanthyr-case-processing · Message types: METADATA (Pass 1) and CHUNK (principle extraction) |
| case_chunks table | New D1 table — stores 3k-char chunks per case · columns: id, citation, chunk_index, chunk_text, principles_json, done, embedded · PK is `citation__chunk__N` format |
| deep_enriched flag | New column on cases table · 0 = Pass 1 only · 1 = all chunks processed and merged |
| Queue message types | METADATA → Pass 1 + split + enqueue chunks · CHUNK → one Workers AI call per chunk + merge when all done |
| D1 no citation column | secondary_sources PK is `id` (TEXT) — no `citation` column. Never query `WHERE citation =`. |
| callWorkersAI fix | reasoning_content fallback added — if content is null, falls back to reasoning_content before text. Fixes Qwen3 thinking mode responses. |
| poller batch/sleep | Default batch: 50 · Loop sleep: 15 seconds |
| BM25_FTS_ENABLED | Kill switch in server.py — set False to disable FTS5 pass. SCP + force-recreate container. No wrangler deploy needed. |
| Canonical categories | annotation, case authority, procedure, doctrine, checklist, practice note, script, legislation — normalised 18 Mar 2026 |
| Scraper location | `arcanthyr-console\Local Scraper\austlii_scraper.py` · progress file: `arcanthyr-console\Local Scraper\scraper_progress.json` · runs on Windows only (VPS IP blocked) |
| Scraper progress file | No per-case resume — file only stores `{court}_{year}: "done"` or absent. Scraper always starts from case 1 for any unfinished court/year. Re-uploading already-ingested cases is harmless (upsert). |
| run_scraper.bat location | `C:\Users\Hogan\run_scraper.bat` — must be LOCAL (not OneDrive) to avoid Task Scheduler Launch Failure error |
| PDF upload (case) | OCR fallback now wired — scanned PDFs auto-route to VPS /extract-pdf-ocr · citation and court auto-populate from OCR text · court detection checks header (first 500 chars) before full text |
| server.py canonical copy | VPS is canonical — always SCP down before editing locally: `scp tom@31.220.86.192:/home/tom/ai-stack/agent-general/src/server.py "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\server.py"` |
| SCP server.py to VPS | `scp "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\server.py" tom@31.220.86.192:/home/tom/ai-stack/agent-general/src/server.py` then force-recreate agent-general |
| backfill scripts | Must run on VPS — fetch D1 data via Worker API (not wrangler subprocess), hit Qdrant via localhost:6334 |
| Retrieval diagnostics | First step always: `docker compose logs --tail=50 agent-general` on VPS — skip message visible immediately |

**Tooling:**
- Claude.ai — architecture, planning, debugging, writing CLAUDE.md, code review
- Claude Code (VS Code) — file edits, terminal commands, git, wrangler deploys
- PowerShell / SSH — VPS runtime commands, long-running Python scripts

---

## SYSTEM STATE — 19 March 2026 (end of session 7)

| Component | Status |
|---|---|
| Qdrant general-docs-v2 | 3,481+ points (stable — no new embed pass this session) |
| Embedding model | argus-ai/pplx-embed-context-v1-0.6b:fp32 (Ollama, VPS Docker) |
| Score threshold | 0.45 (validated) |
| D1 cases | 29 rows · 22 deep_enriched=1 · 7 pending (2026 cases — deep_enriched=0, awaiting neuron reset) · scraper resuming TASSC 2024/11 at noon 20 Mar |
| D1 case_chunks | 651 chunks · all done=1 · all embedded=1 · zero empty enrichment |
| D1 secondary_sources | 2,032 total · all enriched=1 · all embedded |
| D1 secondary_sources_fts | 2,031 rows — FTS5 virtual table live, porter tokenizer |
| D1 legislation | 5 Acts · embedded=1 · 1,272 sections in Qdrant |
| worker.js | Deployed session 8 · version c5f8101c · orderedChunks + [CASE EXCERPT]/[ANNOTATION] labels + Qwen3 prompt fix + Workers AI 4006 error handling |
| Cloudflare Queues | LIVE — arcanthyr-case-processing · METADATA + CHUNK handler · fan-out pattern working |
| enrichment_poller | Permanent Docker service (restart: unless-stopped) · no tmux · check: docker compose logs enrichment-poller |
| server.py | Semantic (Qdrant 0.45) + concept search + score=0.0 BM25 append + case chunk pass UNCONDITIONAL (Qdrant 0.15, type=case_chunk, top 4) · NO RRF · NO in-memory BM25 · NO FTS5 — these were documented in session 3 but never deployed |
| Retrieval | Case chunk pass UNCONDITIONAL (session 8 fix) · Worker.js calls /search, takes results verbatim, assembles context · NO RRF blend in Worker.js · /api/pipeline/bm25-corpus and /api/pipeline/fts-search routes exist but are DEAD — nothing calls them |
| Phase 5 | VALIDATED — Workers AI (Qwen3-30b) returning real answers |
| Frontend | Dark Gazette theme · Library pills · category display · UI briefs 1–6 complete · max_tokens fix deployed |
| process-document "both" | FIXED — runs Master + Procedure prompts per block |
| Category normalisation | DONE — 8 canonical categories |
| RAG workflow doc | Updated to v3 (18 Mar 2026) |
| Axiom Relay backend | handleAxiomRelay() written + wired — session 4 |
| Scraper | Task Scheduler FIXED — run_scraper.bat moved to C:\Users\Hogan\run_scraper.bat · fires daily 8am AEST · AustLII header truncation fix applied to extract_text() |
| Reconcile | D1 and Qdrant in sync — confirmed 18 Mar 2026 |
| qdrant-general host port | 6334 (host) → 6333 (container) |
| Prompts | Qwen3 (handleLegalQueryWorkersAI) — updated to reason from raw judgment text · CASE EXCERPT / ANNOTATION framing added |

---

## RETRIEVAL BASELINE — 18 March 2026 (session 4 — COMPLETE)

15/15 passing. Full clean sweep after embed pass completion.

| Q | Question | Result | Notes |
|---|---|---|---|
| Q1 | s 137 Evidence Act test | ✅ Pass | Strong — multiple s137 chunks |
| Q2 | Elements of common assault | ✅ Pass | Bonde v Maney hit cleanly |
| Q3 | Firearms Act weapon definition | ✅ Pass | |
| Q4 | Police search without warrant | ✅ Pass | s16 conveyance, Ghani tests, Jeffrey v Black |
| Q5 | Fault element recklessness | ✅ Pass | Vallance, Beechey v McDonald, Cth Code ss5.2-5.5 |
| Q6 | Standard of proof | ✅ Pass | |
| Q7 | Tendency evidence test | ✅ Pass | s97 chunks, significant probative value, notice requirements |
| Q8 | Propensity evidence admissibility | ✅ Pass | ss97-101 framework, Lockyer, Gipp v R |
| Q9 | Sentencing first offenders | ✅ Pass | Manual chunk ingested and embedded session 4 |
| Q10 | Corroboration | ✅ Pass | s164 abolition, s165 discretionary warning |
| Q11 | s 38 application | ✅ Pass | Extremely rich retrieval |
| Q12 | Hostile witness steps | ✅ Pass | s38 workflow chunks |
| Q13 | Tendency objection | ✅ Pass | Police v FRS four-step framework |
| Q14 | Leading questions technique | ✅ Pass | Police v Endlay, s42 application |
| Q15 | Witness refuses to answer | ✅ Pass | s43 Justices Act |

---

## IMMEDIATE NEXT ACTIONS

1. **Deploy worker.js** — orderedChunks + label + prompt changes applied locally but NOT deployed. Run `npx wrangler deploy` from `Arc v 4/` first thing next session.

2. **Investigate RRF displacement** — Neill-Fraser case chunks score 0.4915 semantically but are displaced by RRF blend. Case chunks are invisible to BM25/FTS5 passes (secondary source only). Likely cause: RRF ranks secondary source BM25/FTS5 hits ahead of case chunks that only appear in semantic pass. Possible fix: boost case_chunk rank in RRF, or add case chunk score directly to RRF contribution.

3. **Monitor scraper** — Task Scheduler firing daily 8am AEST from `C:\Users\Hogan\run_scraper.bat`. Check `arcanthyr-console\Local Scraper\scraper.log` for progress.

4. **Copy updated CLAUDE.md + CLAUDE_arch.md into `Arc v 4/`** and commit (this session's commit)

---

## KNOWN ISSUES / WATCH LIST

- **chunk finish_reason: length** — ~5-10% of CHUNK messages produce truncated JSON. Acceptable loss. Consider increasing CHUNK max_tokens further (currently 1,500).
- **merge fires multiple times** — idempotent but slightly wasteful. Low priority.
- **python-docx / striprtf** — not installed in agent-general container. DOCX/RTF uploads will error.
- **Cases with null case_name/facts** — don't render in library UI. Delete via wrangler d1 directly.
- **Word artifact noise** — 131 chunks cleaned 18 Mar 2026. Re-run gen_cleanup_sql.py if new Word-derived chunks ingested.
- **BM25 corpus builds on first query** — ~2s delay on cold start after container restart. Acceptable.
- **FTS5 export limitation** — `npx wrangler d1 export` does not support databases with virtual tables. Drop FTS table, export, recreate if backup needed.
- **ingest_corpus.py block separator format** — PowerShell Out-File adds BOM and corrupts `<!-- block_NNN procedure -->` separators. Always use Python to write corpus files. Confirmed session 4.
- **TASSC 2024 cases 3, 8, 9, 10** — uploaded with HTTP 0 (timeout) in previous scraper run. Zero rows in D1 — will be re-attempted when scraper resumes.
- **Scraper progress file** — lives at `arcanthyr-console\Local Scraper\scraper_progress.json` · if missing, scraper restarts from TASSC 2025. Recreate manually if lost (see CLAUDE_arch.md scraper config).
- **Case chunk dedup in search_text()** — uses internal `_id` field (chunk_id). If corpus chunks ever gain a `chunk_id` field, dedup logic needs review.
- **Case chunk second-pass threshold 0.15** — gated on case reference detection (citation pattern or "v " in query). Only fires for case-specific queries. Safe to scale.
- **RRF/BM25/FTS5 architecture** — lives in Worker.js handleLegalQuery, NOT server.py. Previous CLAUDE.md description was wrong.
- **RRF displacement of case chunks** — case chunks only appear in semantic pass (server.py). BM25/FTS5 passes in Worker.js are secondary-source only. RRF blends all three — secondary source BM25/FTS5 hits can outrank semantically-retrieved case chunks even at score 0.49. Investigate next session.
- **worker.js session 7 changes not deployed** — orderedChunks/label/prompt fix applied locally. Last deployed version 2658f6f0 uses filteredChunks (drops secondary sources entirely for citation queries — superseded). Deploy at start of session 8.
- **Scraper no per-case resume** — progress file only stores `{court}_{year}: "done"` or absent. Scraper always starts from case 1 for any unfinished court/year. CLAUDE.md session 6 note "resumes at TASSC 2024/11" was incorrect.

---

## CHANGES THIS SESSION (session 8) — 20 March 2026

- **worker.js deployed** — session 7 changes now live (orderedChunks, [CASE EXCERPT]/[ANNOTATION] labels, Qwen3 prompt fix) · version 84d42ffc
- **Case chunk pass gate removed** — pass now runs unconditionally on every query · no citation pattern required · Neill-Fraser DNA retrieval confirmed working · server.py SCPed to VPS + agent-general force-recreated
- **Workers AI error handling** — callWorkersAI() now throws on result.error or code 4006 · CHUNK handler throws on empty extraction → msg.retry() fires · prevents silent hollow enrichment on neuron cap
- **DST fix** — austlii_scraper.py is_business_hours() now uses zoneinfo Australia/Hobart · was hardcoded UTC+10, Tasmania currently UTC+11 · caused 8am Task Scheduler trigger to be rejected
- **Scraper rescheduled to noon** — Task Scheduler trigger moved from 8am to 12pm · neurons reset at 11am Hobart (midnight UTC) · one hour buffer before scraper fires
- **MAX_CASES_PER_SESSION confirmed 100** — was temporarily set to 10 for session 6 test run · already restored to 100
- **Architecture docs corrected** — session 3 RRF/BM25/FTS5 work documented as complete but never deployed · Worker.js and server.py confirmed against live code · dead routes identified · CLAUDE_arch.md retrieval section replaced with v5 (confirmed)
- **Cloudflare git integration disconnected** — was auto-deploying on every push from root directory, failing because worker.js is in Arc v 4/ · manual wrangler deploy confirmed as correct workflow
- **Retrieval baseline** — extend with 2-3 natural language case queries without citation patterns added to roadmap
- **All committed** · fe4d059 (session 7 worker deploy) · 58d0d25 (session 8 changes)

## CHANGES THIS SESSION (session 7) — 19 March 2026

- **Task Scheduler fixed** — run_scraper.bat moved to `C:\Users\Hogan\run_scraper.bat` (local, not OneDrive) — fixes Launch Failure error
- **worker.js: citation-aware context assembly** — handleLegalQueryWorkersAI rewritten: (1) reorder — case_chunk entries sorted before secondary_source; (2) cap — max 2 secondary sources when citation query + case chunks present; (3) type labels — `[CASE EXCERPT]` / `[ANNOTATION]` prefix on each context block
- **worker.js: prompt fix** — Qwen3 system prompt updated to reason from raw judgment text rather than refuse; CASE EXCERPT / ANNOTATION framing added
- **worker.js: NOT YET DEPLOYED** — changes applied locally, last deployed version 2658f6f0 (filteredChunks approach, now superseded)
- **Scraper: AustLII header truncation** — `extract_text()` now strips everything before first `COURT :` or `CITATION :` marker — removes navigation/boilerplate from scraped text
- **Junk cases deleted** — [2004] TASSC 84, [2018] TASSC 62, [2016] TASMC 14, [2024] TASSC 6 (no HTML / corrupt)
- **Neill-Fraser reingested** — [2021] TASCCA 12 reingested clean · 152 chunks in Qdrant · all embedded=1
- **CLAUDE.md corrected** — scraper has no per-case resume; progress file only stores "done" or absent; session 6 note "resumes at TASSC 2024/11" was wrong
- **Outstanding issue** — Neill-Fraser DNA chunks scoring 0.4915 semantically but displaced by RRF blend — architectural investigation deferred to session 8

## CHANGES THIS SESSION (session 6) — 18 March 2026

- server.py 1,259-line version SCPed to VPS + agent-general force-recreated
- Scraper test run — 10 x TASSC 2024 cases ingested, all HTTP 200, all deep_enriched=1
- Progress file restored — 2025 courts marked done, resumes at TASSC 2024/11
- Windows Task Scheduler configured — run_scraper.bat fires daily at 8am AEST
- Business hours gate confirmed working via Task Scheduler test
- MAX_CASES_PER_SESSION confirmed 100, business hours gate confirmed restored

## CHANGES THIS SESSION (session 5) — 18 March 2026

- case_name added to case chunk Qdrant payload — worker.js LEFT JOIN cases on fetch-case-chunks-for-embedding + enrichment_poller.py metadata dict updated
- 177 case chunks reset to embedded=0 and re-embedded with full payload — previous embed pass had stored empty payloads (root cause: original embed ran before case_name field existed; backfill via PUT wiped remaining fields)
- backfill_case_chunk_names.py rewritten — runs on VPS, fetches D1 data via Worker API, hits Qdrant at localhost:6334 · original script failed: used external IP (port 6334 blocked) and npx subprocess (not on VPS)
- Two-stage case chunk retrieval added to server.py — second Qdrant pass filtered to type=case_chunk, threshold 0.15, top 4, merged before return
- Prompt fix — Claude Case C (worker.js line 1563) and Qwen3 (server.py) updated: reason from raw judgment text, don't refuse when no clean doctrinal statement present
- Neill-Fraser retrieval — Q1 ✅ Q2 ✅ Q3 ✅ all passing post-fix
- Architecture clarification confirmed — RRF/in-memory BM25/FTS5 blend is in Worker.js handleLegalQuery only · server.py is semantic + BM25 append + case chunk second-pass
- worker.js deployed 4e2b2dcf · server.py SCPed to VPS + agent-general force-recreated

## CHANGES THIS SESSION (session 4) — 18 March 2026

- max_tokens bumped to 2,000 on handleLegalQuery() (Claude API) and handleLegalQueryWorkersAI() (Workers AI) — was 1,024 and 800 respectively — fixes answer truncation
- handleAxiomRelay() written — three-stage Workers AI pipeline: decompose → tensions → final report (SIGNAL / LEVERAGE POINT / RELAY ACTIONS / DEAD WEIGHT)
- axiom-relay case added to AI router — was returning 404, now wired to handleAxiomRelay()
- Sentencing first offenders chunk ingested and embedded — Q9 now passing
- Embed pass completed — 3,457 Qdrant points (2,032 secondary + 1,272 legislation + 153 case chunks)
- Reconcile confirmed — D1 and Qdrant in sync
- Retrieval baseline re-run — 15/15 passing (clean sweep)
- Scraper progress file recreated — ready to resume at TASSC 2024
- UI briefs 1–6 all confirmed complete
- Stray image `unnamed (2) (1) (1).jpg` deleted from public/
- worker.js deployed 44f54c6b

## CHANGES SESSION 3 — 18 March 2026

- Worker.js renamed to worker.js — wrangler warning resolved
- process-document "both" mode fixed — runs Master + Procedure prompts per block, time.sleep(1.5) between
- Category normalisation — 8 canonical categories, 2,031 rows normalised
- Library status pills — enriched/embedded/deep_enriched/chunk counts + category display
- In-memory BM25 corpus — bm25_tokenize, bm25_build_corpus, bm25_query, rrf_blend in server.py
- RRF hybrid retrieval — Reciprocal Rank Fusion replaces score=0.0 BM25 append hack
- /api/pipeline/bm25-corpus Worker route — returns embedded secondary_sources for corpus build
- D1 FTS5 virtual table — secondary_sources_fts, porter tokenizer, 2,031 rows, full corpus
- /api/pipeline/fts-search Worker route — sanitised MATCH query, returns bm25_score
- FTS5 sync — ingest and delete routes updated to maintain FTS table
- Triple-pass hybrid pipeline — semantic + in-memory BM25 + FTS5 → RRF, all three firing
- BM25_FTS_ENABLED flag — kill switch for FTS5 pass in server.py
- RAG workflow doc v3 — complete rewrite reflecting current architecture

---

## FUTURE ROADMAP

- **Deploy worker.js** — IMMEDIATE next session. orderedChunks + label + prompt fix not yet deployed.
- **Investigate RRF displacement** — case chunks scoring ~0.49 but displaced by secondary source BM25/FTS5 RRF contribution. Likely need to boost case_chunk rank in RRF blend or add direct score weighting.
- **Monitor scraper** — Task Scheduler firing daily 8am AEST. Check scraper.log for progress.
- **Extend scraper to HCA/FCAFC** — after async pattern confirmed at volume.
- **Retrieval eval framework** — formalise scored baseline as standing process.
- **Extend retrieval baseline** — add 2-3 natural language case queries without citation patterns (e.g. "Neill-Fraser DNA secondary transfer") to catch gate/threshold issues early
- **RAG workflow doc** — DONE v3 18 Mar 2026.
- **Cloudflare Browser Rendering /crawl** — Free plan. For Tasmanian Supreme Court sentencing remarks.
- **Scraper noon schedule** — Task Scheduler set to 12pm daily · neurons reset 11am Hobart · do not move earlier without checking neuron reset time
- **Neuron cap monitoring** — at 100 cases/day with large judgments (100+ chunks each) cap may be hit · if recurring, consider moving to Workers Paid ($5/month) or GPT-4o mini (~$0.05/day) for chunk enrichment
- **Cloudflare git integration** — disconnected session 8 · deploy manually via wrangler only
- **FTS5 as mandatory third RRF source** — currently gated by BM25_FTS_ENABLED. Validate post-scraper-run.
- **Qwen3 UI toggle** — add third button to model toggle. Workers AI confirmed working.
- **Nightly cron for xref_agent.py** — after scraper actively running.
- **Stare decisis layer** — surface treatment history from case_citations.
- **Animated sigil** — swap sigil.jpg for sigil.gif if rotating GIF produced.
- **chunk finish_reason: length** — increase CHUNK max_tokens from 1,500 if truncation rate unacceptable.
- **Dead letter queue** — for chunks that fail max_retries. Low priority.
- **Word artifact cleanup script** — re-run gen_cleanup_sql.py if new Word-derived corpus chunks ingested.
- **Agent work (post-corpus validation)** — contradiction detection, coverage gap analysis, citation network traversal.
- **Reingest-case route** — delete + reingest pattern to backfill case_name into Qdrant.
- **Legislation enrichment via Claude API** — plain English summaries, cross-references. Do AFTER cross-reference agent design confirmed.
- **Auto-populate legislation metadata on upload** — Claude API reads filename/first page.
