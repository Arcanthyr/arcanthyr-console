CLAUDE.md — Arcanthyr Session File
Updated: 18 March 2026 (end of session) · Supersedes all prior versions
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
| Cloudflare Queues decision | Confirmed as the correct async pattern for case upload/fetch timeouts. Fire-and-forget removed in v9 (silently dropped calls). ctx.waitUntil() not viable for nexus calls same reason. CF Queues is the only reliable free async path. Build as dedicated session. |
| D1 no citation column | secondary_sources PK is `id` (TEXT) — no `citation` column. Never query `WHERE citation =`. |

**Tooling:**
- Claude.ai — architecture, planning, debugging, writing CLAUDE.md, code review
- Claude Code (VS Code) — file edits, terminal commands, git, wrangler deploys
- PowerShell / SSH — VPS runtime commands, long-running Python scripts

---

## SYSTEM STATE — 18 March 2026 (end of session)

| Component | Status |
|---|---|
| Qdrant general-docs-v2 | ~2,675 points mid-session (embed pass still running) · target ~3,303 (3,302 procedure + 1 corroboration) |
| Embedding model | argus-ai/pplx-embed-context-v1-0.6b:fp32 (Ollama, VPS Docker) |
| Score threshold | 0.45 (validated) |
| D1 cases | 12 rows — Parsons [2018] TASSC 62 + Tasmania v S [2004] TASSC 84 + others |
| D1 secondary_sources | 1,138 Master + 285 part1 procedure + 607 part2 procedure + 1 corroboration chunk = 2,031 total · procedure rows embedded=0 pending poller (running) · 131 rows cleaned of Word artifact noise this session (reset to embedded=0 for re-embed) |
| D1 legislation | 5 Acts · embedded=1 · 1,272 sections in Qdrant |
| D1 case_citations | 5 rows · 1 case processed |
| D1 case_legislation_refs | 5 rows · 1 case processed |
| Worker.js | Deployed 78c2c9bd — handleLegalQueryWorkersAI Qwen3 response fix + budget_tokens deployed this session |
| procedure_notes column | On cases table · Parsons + Tasmania v S [2004] TASSC 84 confirmed populated |
| ingest_corpus.py | Updated: PROCEDURE_ONLY flag + section-aware splitting + [procedure] citation suffix |
| master_corpus files | part1: 285 procedure chunks ingested · part2: 607 procedure chunks ingested · total new: 892 |
| retrieval_baseline.sh | On VPS ~/retrieval_baseline.sh · baseline run complete · re-run pending after embed completes |
| server.py | pplx-embed + general-docs-v2 + threshold 0.45 + BM25 + concept search LIVE |
| Phase 5 | VALIDATED — Workers AI (Qwen3-30b) now returning real answers (fixed this session) |
| Frontend | Dark Gazette theme · Procedure Notes collapsible in case detail · fetch-case-url form on ingest page |
| scripts/ | All previously uncommitted scripts committed to `Arc v 4/scripts/` this session |

---

## RETRIEVAL BASELINE — 18 March 2026 (Master corpus only, pre-procedure embed)

Re-run after embed pass confirms ~3,303 points. Expected fixes: Q7, Q8, Q12, Q13, Q14. Q10 now has corroboration chunk ingested. Q5 Vallance chunks cleaned of Word artifact noise — should improve.

| Q | Question | Result | Root cause |
|---|---|---|---|
| Q1 | s 137 Evidence Act test | ✅ Pass | Strong — legislation + secondary + authorities |
| Q2 | Elements of common assault | ✅ Pass | Correct secondary chunks with elements |
| Q3 | Firearms Act weapon definition | ✅ Pass | Relevant legislation + secondary |
| Q4 | Police search without warrant | ⚠️ Partial | s16 conveyance note retrieved, doctrine thin |
| Q5 | Fault element recklessness | ⚠️ Partial | Vallance chunk exists — Word artifact noise cleaned this session, pending re-embed |
| Q6 | Standard of proof | ✅ Pass | s141 Evidence Act correct |
| Q7 | Tendency evidence test | ❌ Fail | Procedure corpus gap — now ingested, pending embed |
| Q8 | Propensity evidence admissibility | ❌ Fail | Procedure corpus gap — now ingested, pending embed |
| Q9 | Sentencing first offenders | ⚠️ Partial | Proportionality retrieved, first offender content thin |
| Q10 | Corroboration | ❌ Fail | Corroboration chunk written and ingested this session — pending embed |
| Q11 | s 38 application | ✅ Pass | Rich content with submissions and authorities |
| Q12 | Hostile witness steps | ❌ Fail | Procedure corpus gap — now ingested, pending embed |
| Q13 | Tendency objection | ❌ Fail | Procedure corpus gap — now ingested, pending embed |
| Q14 | Leading questions technique | ⚠️ Partial | Procedure corpus gap — now ingested, pending embed |
| Q15 | Witness refuses to answer | ✅ Pass | Justices Act s43 + secondary |

---

## IMMEDIATE NEXT ACTIONS

1. **Confirm embed pass complete** — SSH, `~/ai-stack`: `curl -s http://localhost:6334/collections/general-docs-v2 | python3 -m json.tool | grep points_count` — target ~3,303. If poller not running: `docker compose exec agent-general python3 /app/src/enrichment_poller.py --mode embed --loop`

2. **Re-run retrieval baseline** — SSH: `bash ~/retrieval_baseline.sh` — after embed confirms ~3,303 points. Check Q5, Q7, Q8, Q10, Q12, Q13, Q14.

3. **Build Cloudflare Queues async pattern** — dedicated session. See design spec in FUTURE ROADMAP. Required before scraper reopens. Do NOT attempt fire-and-forget or ctx.waitUntil() — both removed/rejected for reliability reasons.

4. **Category normalisation** — deferred until post-retrieval testing.

---

## KNOWN ISSUES / WATCH LIST

- **fetch-case-url timeout** — times out on large judgments (>~100 paragraphs). Fix: Cloudflare Queues async pattern (dedicated build session). Small judgments work fine. Fire-and-forget removed in v9. ctx.waitUntil() rejected — same reliability issue on nexus write-back path.
- **Scanned PDF upload timeout** — large scanned PDFs timeout on console upload. Born-digital PDFs and short scanned judgments work fine. Same fix as above.
- **Scraper silently loses large judgments** — upload-case timeout causes HTTP 0 errors. Cases marked as processed in scraper_progress.json but missing from D1. Fix: Cloudflare Queues.
- **Procedure Prompt second pass in summarizeCase()** — IMPLEMENTED and validated against Tasmania v S [2004] TASSC 84 (voir dire, s38, tendency evidence — all three procedure sequences correctly extracted). Gate cleared.
- **Category fragmentation** — non-standard category values in D1 secondary_sources. Deferred until post-retrieval testing.
- **process-document "both" mode** — prompt_mode="both" runs Master Prompt only. Procedure Prompt second pass not yet implemented in server.py.
- **python-docx / striprtf** — not installed in agent-general container. DOCX/RTF uploads will error.
- **Worker.js filename case** — wrangler warns about Worker.js vs worker.js. Rename when convenient.
- **Cases with null case_name/facts** — don't render in library UI (hidden). Delete via wrangler d1 directly.
- **ingest_corpus.py destructive upsert** — upload-corpus ON CONFLICT DO UPDATE resets embedded=0 and wipes enriched_text on citation collision. Never re-run against already-ingested citations. Procedure chunks safe (distinct [procedure] suffix). Master chunks must never be re-ingested via this script.
- **Q9 sentencing first offenders** — proportionality retrieved but first offender content thin. Corpus gap, not procedure gap.
- **Q5 recklessness (Vallance)** — 131 corpus chunks cleaned of Word artifact noise this session (reset to embedded=0). Re-embed in progress. Should improve after poller completes.
- **Word artifact noise** — 131 secondary_sources chunks had `.underline`, `{.mark}`, image tags in raw_text. Cleaned via gen_cleanup_sql.py + wrangler --file this session. Scripts saved to `Arc v 4/scripts/`.
- **handleLegalQueryWorkersAI Qwen3 fix** — response shape mismatch fixed this session (three-path fallback + budget_tokens: 0). Deployed 78c2c9bd. Workers AI now returning real answers.
- **Async job pattern — architecture decision confirmed** — Cloudflare Queues is the correct path. Full design spec in FUTURE ROADMAP. Key rejected alternatives: fire-and-forget (removed v9, silently drops), ctx.waitUntil() (same problem on nexus write-back), CF REST API (requires paid token), VPS Qwen3 (rejected architecture decision). Do not revisit without new information.

---

## CHANGES THIS SESSION — 18 March 2026

- Procedure embed pass unblocked — identified enriched=0 issue on procedure chunks, fixed via D1 UPDATE, poller running
- Retrieval baseline confirmed from prior session — results documented above
- Diagnosed and fixed server.py auth (X-Nexus-Key) and field name (query_text) issues
- procedure embed pass gate cleared — tested against Tasmania v S [2004] TASSC 84: voir dire + s38 + tendency evidence procedure sequences all correctly extracted
- Workers AI query fix deployed — handleLegalQueryWorkersAI Qwen3 response shape + budget_tokens (commit 78c2c9bd)
- Corroboration chunk written and ingested (Q10 fix) — Evidence Act 2001 ss164-165A
- 131 corpus chunks cleaned of Word artifact noise — gen_cleanup_sql.py + wrangler --file
- Scripts committed to `Arc v 4/scripts/` — ingest_corpus.py, retrieval_baseline.sh, generate_manifest.py, validate_ingest.ps1, backfill scripts, migrate scripts, split_legal_doc.py, worker_pipeline_v2_diff_addendum.js
- Async job pattern fully designed and validated against conversation history — Cloudflare Queues confirmed as correct path
- Tasmania v S [2004] TASSC 84 fetched via console and confirmed in D1
- Async job pattern design confirmed via external review (CC + 2 mates) — key finding: Workers AI must be called via CF REST API from VPS (env.AI.run not accessible outside Worker), or via Cloudflare Queues keeping enrichment in Worker
- Final decision: Cloudflare Queues — enrichment stays in Worker, no CF REST API token needed, free tier sufficient

---

## FUTURE ROADMAP

- **Cloudflare Queues async pattern** — GATE before scraper reopens and before large judgment uploads reliable. Design spec: Worker receives upload/URL → drops message on Queue → returns immediately → Queue consumer Worker runs processCaseUpload() with no wall-clock limit → D1 written → poller embeds. Build as dedicated session. Key constraints: (1) enrichment stays in Worker via Workers AI, (2) fire-and-forget rejected, (3) ctx.waitUntil() rejected for nexus calls, (4) CF REST API requires paid token. Needs: Queue binding in wrangler.toml, producer in upload/fetch handlers, consumer Worker with queue handler, frontend queued status, restart: unless-stopped on agent-general.
- **Re-run retrieval baseline** — after embed pass completes (~3,303 points). Priority: Q5, Q7, Q8, Q10, Q12, Q13, Q14.
- **Fetch-by-URL case upload** — route built, needs Cloudflare Queues for large judgments. Already works for short cases.
- **Procedure Notes Markdown renderer** — replace white-space: pre-wrap once real procedure content confirmed from scraper.
- **Extend scraper to HCA/FCAFC** — after async pattern confirmed working.
- **Retrieval eval framework** — formalise scored baseline (found/partial/missed by category) as standing process after every corpus or pipeline change.
- **Q9 sentencing first offenders** — thin corpus. Consider targeted manual chunk for first offender principles.
- **Q5 Vallance BM25 tuning** — Vallance chunks cleaned this session. Re-test after embed completes. If still partial, adjust BM25 concept keywords.
- **RAG workflow doc update** — update RAG_Workflow_Arcanthyr_v2.docx: two-run ingest sequence, PROCEDURE_ONLY flag, [procedure] suffix, destructive upsert warning, updated chunk counts (892 procedure + 1138 master + 1 corroboration = 2,031 total).
- **Cloudflare Browser Rendering /crawl** — available Free plan. For Tasmanian Supreme Court sentencing remarks. NOT AustLII.
- **BM25 improvements** — proper scoring + hybrid ranking.
- **Console status indicator** — show enriched/embedded progress per document.
- **Qwen3 UI toggle** — add third button once Qwen validated. Workers AI now confirmed working.
- **Reingest-case route** — delete + reingest pattern to backfill case_name into Qdrant.
- **Nightly cron for xref_agent.py** — after scraper active.
- **Stare decisis layer** — surface treatment history from case_citations.
- **Animated sigil** — swap sigil.jpg for sigil.gif if rotating GIF produced.
- **Word artifact cleanup script** — gen_cleanup_sql.py in scripts/. Re-run if new corpus chunks ingested from Word docs. Check count first: `SELECT COUNT(*) FROM secondary_sources WHERE raw_text LIKE '%.underline%'`
- **restart: unless-stopped on agent-general** — add to docker-compose.yml so poller starts automatically on container restart. Low effort, high value.
- **Agent work (post-corpus validation)** — contradiction detection, coverage gap analysis, citation network traversal, stale authority detection, query expansion, procedural sequence assembly, bulk enrichment audit.
- **Category normalisation** — doctrine vs legal doctrine in secondary_sources. Post-retrieval testing.
- **Qwen3 model upgrade in summarizeCase()** — upgrade from llama-3.1-8b-instruct to @cf/qwen/qwen3-30b-a3b-fp8 in Worker.js. Do alongside new /api/legal/extract-metadata route when scraper work resumes. Do NOT global replace — query handler and journal functions need independent evaluation.
