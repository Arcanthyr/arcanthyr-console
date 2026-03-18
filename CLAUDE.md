CLAUDE.md — Arcanthyr Session File
Updated: 18 March 2026 (end of session 2) · Supersedes all prior versions
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
| enrichment_poller | Run inside container only with --loop flag: `docker compose exec -d agent-general python3 /app/src/enrichment_poller.py --loop` · Must `cd ~/ai-stack` first · Env vars set in docker-compose.yml |
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
| poller batch/sleep | Default batch: 50 · Loop sleep: 15 seconds (increased from 10/60 this session for faster embed) |

**Tooling:**
- Claude.ai — architecture, planning, debugging, writing CLAUDE.md, code review
- Claude Code (VS Code) — file edits, terminal commands, git, wrangler deploys
- PowerShell / SSH — VPS runtime commands, long-running Python scripts

---

## SYSTEM STATE — 18 March 2026 (end of session 2)

| Component | Status |
|---|---|
| Qdrant general-docs-v2 | ~2,910 points (embed pass running) · target ~3,303 secondary/legislation + 153 Neil case chunks pending |
| Embedding model | argus-ai/pplx-embed-context-v1-0.6b:fp32 (Ollama, VPS Docker) |
| Score threshold | 0.45 (validated) |
| D1 cases | 13+ rows — includes [2021] TASCCA 12 (Neill-Fraser) · enriched=1 · deep_enriched=1 |
| D1 case_chunks | 153 chunks for [2021] TASCCA 12 · all done=1 · ~30 embedded (poller running) |
| D1 secondary_sources | 2,031 total · all enriched=1 · embedded=1 |
| D1 legislation | 5 Acts · embedded=1 · 1,272 sections in Qdrant |
| Worker.js | Deployed 9599e2f5 — chunked case pipeline + callWorkersAI reasoning_content fix |
| Cloudflare Queues | LIVE — arcanthyr-case-processing · METADATA + CHUNK handler · fan-out pattern working |
| enrichment_poller.py | Extended with run_case_chunk_embedding_pass() · batch=50 · sleep=15 |
| server.py | pplx-embed + general-docs-v2 + threshold 0.45 + BM25 + concept search LIVE |
| Phase 5 | VALIDATED — Workers AI (Qwen3-30b) returning real answers |
| Frontend | Dark Gazette theme · fetch-case-url async with polling · PDF upload async with polling |

---

## RETRIEVAL BASELINE — 18 March 2026 (pre-procedure embed re-run pending)

Re-run baseline after embed confirms ~3,303 points + Neil chunks embedded.

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

1. **Confirm embed pass complete** — SSH, `~/ai-stack`: `curl -s http://localhost:6334/collections/general-docs-v2 | python3 -m json.tool | grep points_count` — target ~3,303 + 153 Neil chunks = ~3,456

2. **Re-run retrieval baseline** — SSH: `bash ~/retrieval_baseline.sh` — after embed confirms. Check Q5, Q7, Q8, Q10, Q12, Q13, Q14.

3. **Test Neil case retrieval** — ask console: "What is the test for fresh and compelling evidence under s 402A?" + "What is the significance of DNA secondary transfer?" + "What must prosecution establish re DNA evidence?" — should hit case_chunk vectors.

4. **Category normalisation** — deferred until post-retrieval testing.

---

## KNOWN ISSUES / WATCH LIST

- **server.py type filter** — `type: 'case_chunk'` not yet in server.py retrieval filter/weight logic. Add alongside `secondary_source` and `legislation` types when next editing server.py.
- **fetch-case-url timeout** — FIXED via Cloudflare Queues. Large judgments now process via fan-out chunk pipeline.
- **Scraper silently loses large judgments** — FIXED via Cloudflare Queues. Gate cleared for scraper reopening (pending retrieval baseline re-run).
- **Procedure Prompt second pass in summarizeCase()** — IMPLEMENTED and validated.
- **Category fragmentation** — non-standard category values in D1 secondary_sources. Deferred.
- **process-document "both" mode** — prompt_mode="both" runs Master Prompt only. Not yet fixed.
- **python-docx / striprtf** — not installed in agent-general container. DOCX/RTF uploads will error.
- **Worker.js filename case** — wrangler warns about Worker.js vs worker.js. Rename when convenient.
- **Cases with null case_name/facts** — don't render in library UI. Delete via wrangler d1 directly.
- **Q9 sentencing first offenders** — thin corpus. Consider targeted manual chunk.
- **Q5 recklessness (Vallance)** — cleaned this session. Re-test after embed.
- **Word artifact noise** — 131 secondary_sources chunks cleaned 18 Mar 2026. Re-run gen_cleanup_sql.py if new Word-derived chunks ingested.
- **restart: unless-stopped on agent-general** — not yet added to docker-compose.yml. Low effort, high value.
- **chunk JSON parse failures** — some CHUNK messages hit finish_reason: length and produce truncated JSON. Logged as parse errors, chunk contributes 0 principles but pipeline continues. Acceptable loss rate (~5-10%).
- **merge fires multiple times** — done=0 count check is idempotent but merge UPDATE runs once per completed chunk after all chunks done. No corruption but slightly wasteful. Low priority fix.

---

## CHANGES THIS SESSION (session 2) — 18 March 2026

- Cloudflare Queues async pattern built and deployed — fetch-case-url + upload-case both queued
- Chunked case pipeline built — METADATA + CHUNK queue handler, fan-out, merge logic
- case_chunks D1 table created
- deep_enriched column added to cases table
- Two new pipeline routes: fetch-case-chunks-for-embedding + mark-case-chunks-embedded
- enrichment_poller.py extended with run_case_chunk_embedding_pass()
- callWorkersAI reasoning_content fallback fixed — Qwen3 thinking mode now handled
- Pass 1 token limit increased from 800 to 1500
- Poller batch increased to 50, sleep reduced to 15 seconds
- Neill-Fraser [2021] TASCCA 12 successfully ingested — case_name/judge/facts/principles all populated
- splitIntoChunks() utility function added to Worker.js
- Producer queue messages updated to { type: 'METADATA', citation } format

---

## FUTURE ROADMAP

- **Re-run retrieval baseline** — after embed pass completes. Priority: Q5, Q7, Q8, Q10, Q12, Q13, Q14.
- **server.py case_chunk type** — add case_chunk to retrieval type handling in server.py.
- **Reopen scraper** — gate cleared (Queues live). Run during business hours. Monitor neuron usage in CF dashboard.
- **Extend scraper to HCA/FCAFC** — after async pattern confirmed working at volume.
- **Retrieval eval framework** — formalise scored baseline as standing process.
- **Q9 sentencing first offenders** — thin corpus. Consider targeted manual chunk.
- **RAG workflow doc update** — update RAG_Workflow_Arcanthyr_v2.docx.
- **Cloudflare Browser Rendering /crawl** — available Free plan. For Tasmanian Supreme Court sentencing remarks.
- **BM25 improvements** — proper scoring + hybrid ranking.
- **Console status indicator** — show enriched/embedded/deep_enriched progress per document.
- **Qwen3 UI toggle** — add third button once Qwen validated.
- **Nightly cron for xref_agent.py** — after scraper active.
- **Stare decisis layer** — surface treatment history from case_citations.
- **Animated sigil** — swap sigil.jpg for sigil.gif if rotating GIF produced.
- **restart: unless-stopped on agent-general** — add to docker-compose.yml.
- **chunk finish_reason: length** — increase CHUNK max_tokens from 1000 to reduce JSON truncation.
- **Dead letter queue** — add DLQ for chunks that fail max_retries. Low priority.
- **Category normalisation** — doctrine vs legal doctrine. Post-retrieval testing.
- **Qwen3 model upgrade in summarizeCase()** — already on Qwen3-30b. No action needed.
- **Word artifact cleanup script** — re-run gen_cleanup_sql.py if new Word-derived corpus chunks ingested.
- **Agent work (post-corpus validation)** — contradiction detection, coverage gap analysis, citation network traversal.