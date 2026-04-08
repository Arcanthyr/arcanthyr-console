CLAUDE.md — Arcanthyr Session File
Updated: 18 March 2026 (end of session 4) · Supersedes all prior versions
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
| enrichment_poller | Run inside tmux WITHOUT -d flag (tmux is the backgrounding mechanism): attach to tmux session first, then run command in foreground, then Ctrl+B D to detach · Must `cd ~/ai-stack` first · Do NOT use -d with docker compose exec inside tmux |
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

**Tooling:**
- Claude.ai — architecture, planning, debugging, writing CLAUDE.md, code review
- Claude Code (VS Code) — file edits, terminal commands, git, wrangler deploys
- PowerShell / SSH — VPS runtime commands, long-running Python scripts

---

## SYSTEM STATE — 18 March 2026 (end of session 4)

| Component | Status |
|---|---|
| Qdrant general-docs-v2 | 3,457 points (embed pass COMPLETE) · 2,032 secondary + 1,272 legislation + 153 case chunks |
| Embedding model | argus-ai/pplx-embed-context-v1-0.6b:fp32 (Ollama, VPS Docker) |
| Score threshold | 0.45 (validated) |
| D1 cases | 13+ rows — includes [2021] TASCCA 12 (Neill-Fraser) · enriched=1 · deep_enriched=1 |
| D1 case_chunks | 153 chunks for [2021] TASCCA 12 · all done=1 · all 153 embedded |
| D1 secondary_sources | 2,032 total (incl. sentencing first offenders chunk) · all enriched=1 · all embedded |
| D1 secondary_sources_fts | 2,031 rows — FTS5 virtual table live, porter tokenizer, full corpus populated |
| D1 legislation | 5 Acts · embedded=1 · 1,272 sections in Qdrant |
| worker.js | Deployed 44f54c6b — max_tokens 2,000 (Claude + Qwen3 query handlers) · handleAxiomRelay() added |
| Cloudflare Queues | LIVE — arcanthyr-case-processing · METADATA + CHUNK handler · fan-out pattern working |
| enrichment_poller.py | Extended with run_case_chunk_embedding_pass() · batch=50 · sleep=15 · running in tmux |
| server.py | Triple-pass hybrid retrieval: semantic + in-memory BM25 + D1 FTS5 · RRF blend · BM25_FTS_ENABLED=True |
| Retrieval | Triple-pass hybrid LIVE — semantic (Qdrant) + in-memory BM25 (2,032 docs) + FTS5 (2,031 docs) → RRF |
| Phase 5 | VALIDATED — Workers AI (Qwen3-30b) returning real answers |
| Frontend | Dark Gazette theme · Library pills · category display · UI briefs 1–6 complete · max_tokens fix deployed |
| process-document "both" | FIXED — runs Master + Procedure prompts per block |
| Category normalisation | DONE — 8 canonical categories |
| RAG workflow doc | Updated to v3 (18 Mar 2026) |
| Axiom Relay backend | handleAxiomRelay() written + wired — session 4 |
| Scraper progress file | Recreated — ready to resume at TASSC 2024 (2025 courts marked done) |
| Reconcile | D1 and Qdrant in sync — confirmed 18 Mar 2026 |

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

1. **Run the scraper** — PowerShell, `arcanthyr-console\Local Scraper\` directory: `python austlii_scraper.py` · Run during business hours (08:00–18:00 AEST) · Monitor CF dashboard for neuron usage · Scraper resumes at TASSC 2024 (progress file set)

2. **Test Neill-Fraser case retrieval** — ask console: "What is the test for fresh and compelling evidence under s 402A?" + "What is the significance of DNA secondary transfer?" + "What must prosecution establish re DNA evidence?" — Q1 and Q3 passing; Q2 (DNA secondary transfer) pending — those 13 case chunks were embedded, re-test now

3. **Commit CLAUDE.md / CLAUDE_arch.md updates** — after copying updated files into `Arc v 4/`

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

---

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

- **Run scraper** — IMMEDIATE. Resume TASSC 2024. Run during business hours. Monitor CF dashboard.
- **Test Neill-Fraser DNA secondary transfer** — Q2 was pending embed; re-test now embed is complete.
- **Extend scraper to HCA/FCAFC** — after async pattern confirmed at volume.
- **Retrieval eval framework** — formalise scored baseline as standing process.
- **RAG workflow doc** — DONE v3 18 Mar 2026.
- **Cloudflare Browser Rendering /crawl** — Free plan. For Tasmanian Supreme Court sentencing remarks.
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
