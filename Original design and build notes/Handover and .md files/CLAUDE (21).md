CLAUDE.md — Arcanthyr Session File
Updated: 18 March 2026 (end of session 3) · Supersedes all prior versions
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
| enrichment_poller | Run inside tmux WITHOUT -d flag (tmux is the backgrounding mechanism): `tmux new-session -d -s poller && tmux send-keys -t poller "cd ~/ai-stack && docker compose exec -e OLLAMA_URL=http://ollama:11434 -e QDRANT_URL=http://qdrant-general:6333 agent-general python3 /app/src/enrichment_poller.py --loop" Enter` · Must `cd ~/ai-stack` first · Do NOT use -d with docker compose exec inside tmux |
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
| Pasting into terminal | Never paste wrangler output back into terminal — type commands fresh |
| Rogue d file | Delete with `Remove-Item "c:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\d"` if it reappears — commit deletion |
| server.py auth | All direct calls to localhost:18789 require header `X-Nexus-Key` · Get value: `grep NEXUS_SECRET_KEY ~/ai-stack/.env` on VPS · "unauthorized" = missing or wrong key |
| server.py search field | Search endpoint expects `query_text` (not `query`) · "query_text is required" = wrong field name · endpoint: `POST localhost:18789/search` |
| retrieval_baseline.sh | Requires `X-Nexus-Key` header and `query_text` field · results in `~/retrieval_baseline_results.txt` |
| ingest_corpus.py | Lives at `arcanthyr-console\ingest_corpus.py` (NOT inside `Arc v 4/`) · INPUT_FILE hardcoded — change manually between part1/part2 runs · PROCEDURE_ONLY=True filters procedure chunks only · upload-corpus uses destructive upsert — do NOT re-run against already-ingested citations |
| Bash scripts on VPS | Large pastes truncate in SSH terminal — create files locally and SCP to VPS instead |
| PowerShell file creation | Use `@' ... '@` with `Out-File -Encoding utf8` then SCP to VPS |
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

**Tooling:**
- Claude.ai — architecture, planning, debugging, writing CLAUDE.md, code review
- Claude Code (VS Code) — file edits, terminal commands, git, wrangler deploys
- PowerShell / SSH — VPS runtime commands, long-running Python scripts

---

## SYSTEM STATE — 18 March 2026 (end of session 3)

| Component | Status |
|---|---|
| Qdrant general-docs-v2 | ~3,148 points (poller running in tmux) · target ~3,527 (366 secondary + 13 Neil chunks remaining) |
| Embedding model | argus-ai/pplx-embed-context-v1-0.6b:fp32 (Ollama, VPS Docker) |
| Score threshold | 0.45 (validated) |
| D1 cases | 13+ rows — includes [2021] TASCCA 12 (Neill-Fraser) · enriched=1 · deep_enriched=1 |
| D1 case_chunks | 153 chunks for [2021] TASCCA 12 · all done=1 · 140/153 embedded · 13 remaining |
| D1 secondary_sources | 2,031 total · all enriched=1 · 1,665 embedded · 366 remaining |
| D1 secondary_sources_fts | 2,031 rows — FTS5 virtual table live, porter tokenizer, full corpus populated |
| D1 legislation | 5 Acts · embedded=1 · 1,272 sections in Qdrant |
| Worker.js | Deployed a8feddde — BM25 corpus route + FTS search route + library status pills + worker.js rename |
| Cloudflare Queues | LIVE — arcanthyr-case-processing · METADATA + CHUNK handler · fan-out pattern working |
| enrichment_poller.py | Extended with run_case_chunk_embedding_pass() · batch=50 · sleep=15 · running in tmux |
| server.py | Triple-pass hybrid retrieval: semantic + in-memory BM25 + D1 FTS5 · RRF blend · BM25_FTS_ENABLED=True |
| Retrieval | Triple-pass hybrid LIVE — semantic (Qdrant) + in-memory BM25 (1,665 docs) + FTS5 (2,031 docs) → RRF |
| Phase 5 | VALIDATED — Workers AI (Qwen3-30b) returning real answers |
| Frontend | Dark Gazette theme · Library pills (enriched/embedded/deep_enriched/chunks) · category display clean |
| process-document "both" | FIXED — runs Master + Procedure prompts per block |
| Category normalisation | DONE — 8 canonical categories |
| RAG workflow doc | Updated to v3 (18 Mar 2026) |

---

## RETRIEVAL BASELINE — 18 March 2026 (re-run pending embed completion)

Re-run baseline after embed confirms ~3,527 points.

| Q | Question | Result | Notes |
|---|---|---|---|
| Q1 | s 137 Evidence Act test | ✅ Pass | Strong |
| Q2 | Elements of common assault | ✅ Pass | |
| Q3 | Firearms Act weapon definition | ✅ Pass | |
| Q4 | Police search without warrant | ⚠️ Partial | Doctrine thin |
| Q5 | Fault element recklessness | ⚠️ Partial | Word artifacts cleaned — re-test |
| Q6 | Standard of proof | ✅ Pass | |
| Q7 | Tendency evidence test | ❌ Fail→pending | Procedure chunks ingested, pending embed |
| Q8 | Propensity evidence admissibility | ❌ Fail→pending | Procedure chunks ingested, pending embed |
| Q9 | Sentencing first offenders | ⚠️ Partial | Thin corpus |
| Q10 | Corroboration | ❌ Fail→pending | Corroboration chunk ingested, pending embed |
| Q11 | s 38 application | ✅ Pass | |
| Q12 | Hostile witness steps | ❌ Fail→pending | Procedure chunks ingested, pending embed |
| Q13 | Tendency objection | ❌ Fail→pending | Procedure chunks ingested, pending embed |
| Q14 | Leading questions technique | ⚠️ Partial→pending | Procedure chunks ingested, pending embed |
| Q15 | Witness refuses to answer | ✅ Pass | |

---

## IMMEDIATE NEXT ACTIONS

1. **Confirm embed pass complete** — SSH, `~/ai-stack`: `curl -s http://localhost:6334/collections/general-docs-v2 | python3 -m json.tool | grep points_count` — target ~3,527

2. **Test Neil case retrieval** — ask console: "What is the test for fresh and compelling evidence under s 402A?" + "What is the significance of DNA secondary transfer?" + "What must prosecution establish re DNA evidence?" — should hit case_chunk vectors.

3. **Re-run retrieval baseline** — SSH: `bash ~/retrieval_baseline.sh` — after embed confirms. Check Q5, Q7, Q8, Q10, Q12, Q13, Q14.

4. **Reopen scraper** — gate cleared (Queues live, baseline re-run). Run during business hours. Monitor neuron usage in CF dashboard.

---

## KNOWN ISSUES / WATCH LIST

- **chunk finish_reason: length** — ~5-10% of CHUNK messages produce truncated JSON. Acceptable loss. Consider increasing CHUNK max_tokens further (currently 1,500).
- **merge fires multiple times** — idempotent but slightly wasteful. Low priority.
- **process-document "both" mode** — FIXED session 3.
- **python-docx / striprtf** — not installed in agent-general container. DOCX/RTF uploads will error.
- **Cases with null case_name/facts** — don't render in library UI. Delete via wrangler d1 directly.
- **Q9 sentencing first offenders** — thin corpus. Consider targeted manual chunk.
- **Word artifact noise** — 131 chunks cleaned 18 Mar 2026. Re-run gen_cleanup_sql.py if new Word-derived chunks ingested.
- **BM25 corpus builds on first query** — ~2s delay on cold start after container restart. Acceptable.
- **FTS5 export limitation** — `npx wrangler d1 export` does not support databases with virtual tables. Drop FTS table, export, recreate if backup needed.
- **category in library UI** — source_type display label fixed session 3. Now shows normalised category value.

---

## CHANGES THIS SESSION (session 3) — 18 March 2026

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

- **Re-run retrieval baseline** — after embed pass complete. Priority: Q5, Q7, Q8, Q10, Q12, Q13, Q14.
- **Test Neil case retrieval** — s 402A, DNA secondary transfer, DNA prosecution burden.
- **Reopen scraper** — gate cleared. Run during business hours. Monitor CF dashboard.
- **Extend scraper to HCA/FCAFC** — after async pattern confirmed at volume.
- **Retrieval eval framework** — formalise scored baseline as standing process.
- **Q9 sentencing first offenders** — thin corpus. Consider targeted manual chunk.
- **RAG workflow doc** — DONE v3 18 Mar 2026.
- **Cloudflare Browser Rendering /crawl** — Free plan. For Tasmanian Supreme Court sentencing remarks.
- **BM25 improvements** — D1 FTS5 now live as Phase B. Consider wiring as mandatory third source post-baseline.
- **Console status indicator** — DONE session 3 (library pills).
- **Qwen3 UI toggle** — add third button once Qwen validated.
- **Nightly cron for xref_agent.py** — after scraper active.
- **Stare decisis layer** — surface treatment history from case_citations.
- **Animated sigil** — swap sigil.jpg for sigil.gif if rotating GIF produced.
- **chunk finish_reason: length** — increase CHUNK max_tokens from 1,500 if truncation rate unacceptable.
- **Dead letter queue** — for chunks that fail max_retries. Low priority.
- **Category normalisation** — DONE session 3.
- **Word artifact cleanup script** — re-run gen_cleanup_sql.py if new Word-derived corpus chunks ingested.
- **Agent work (post-corpus validation)** — contradiction detection, coverage gap analysis, citation network traversal.
- **FTS5 as mandatory third RRF source** — currently gated by BM25_FTS_ENABLED. Validate post-baseline.
