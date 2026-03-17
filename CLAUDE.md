CLAUDE.md — Arcanthyr Session File
Updated: 18 March 2026 (end of session) · Supersedes all prior versions
Full architecture reference → CLAUDE_arch.md — UPLOAD EVERY SESSION alongside CLAUDE.md

SESSION RULES
RuleDetailRead this file firstAlwaysUpload both filesUpload CLAUDE.md AND CLAUDE_arch.md at the start of every session — both are requiredDiagnose from actual outputBefore recommending any fixPowerShell setupRun Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass at start of every PS session — required before any wrangler/npx commandAlways specify terminalEvery command must state: which terminal (VS Code, PowerShell, SSH/VPS) AND which directoryenrichment_pollerRun inside container only with --loop flag: docker compose exec -d agent-general python3 /app/src/enrichment_poller.py --loop · Must cd ~/ai-stack first · Env vars set in docker-compose.ymlgit commitsgit add -A, git commit, git push origin master — separately, no &&Pre-deploy checkVerify upload list shows only public/ files — if .env or .git appear, stopwrangler d1Must run from Arc v 4/ directory · always add --remote for live D1PowerShell limitsNo &&, no heredoc <<'EOF', no grep (use Select-String), no head (use Select-Object -First N)CC brief patternAsk CC to read files and report state BEFORE making changesCC cannot run PythonWindows Store stub blocks it — run Python in PowerShell terminal directlyCC vs SSHCC for local file edits · SSH terminal for VPS runtime commandsLong-running scriptsRun directly in PowerShell terminal — CC too slow (confirmed: ingest runs, embed pass)Context windowSuggest restart proactively when conversation grows longD1 database namearcanthyr (binding: DB, ID: 1b8ca95d-b8b3-421d-8c77-20f80432e1a0)Component quirksDocument in CLAUDE_arch.md Component Notes sectionPasting into terminalNever paste wrangler output back into terminal — type commands freshRogue d fileDelete with Remove-Item "c:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\d" if it reappears — commit deletionserver.py authAll direct calls to localhost:18789 require header X-Nexus-Key · Get value: grep NEXUS_SECRET_KEY ~/ai-stack/.env on VPS · "unauthorized" = missing or wrong keyserver.py search fieldSearch endpoint expects query_text (not query) · "query_text is required" = wrong field name · endpoint: POST localhost:18789/searchretrieval_baseline.shRequires X-Nexus-Key header and query_text field · results in ~/retrieval_baseline_results.txt · if "query" field error: sed -i 's/\\"query\\":/\\"query_text\\":/' ~/retrieval_baseline.shingest_corpus.pyLives at arcanthyr-console\ingest_corpus.py (NOT inside Arc v 4/) · INPUT_FILE hardcoded — change manually between part1/part2 runs · PROCEDURE_ONLY=True filters procedure chunks only · upload-corpus uses destructive upsert — do NOT re-run against already-ingested citationsBash scripts on VPSLarge pastes truncate in SSH terminal — create files locally and SCP to VPS insteadPowerShell file creationUse @' ... '@ with Out-File -Encoding utf8 then SCP to VPS
Tooling:

Claude.ai — architecture, planning, debugging, writing CLAUDE.md, code review
Claude Code (VS Code) — file edits, terminal commands, git, wrangler deploys
PowerShell / SSH — VPS runtime commands, long-running Python scripts


SYSTEM STATE — 18 March 2026 (end of session)
ComponentStatusQdrant general-docs-v22,410 points (pre-session) · procedure embed pass PENDING — run poller next sessionEmbedding modelargus-ai/pplx-embed-context-v1-0.6b:fp32 (Ollama, VPS Docker)Score threshold0.45 (validated)D1 cases11 rows — Parsons [2018] TASSC 62 confirmed: holdings_extracted (8) + principles_extracted (10 IF/THEN) fully populatedD1 secondary_sources1,138 Master corpus rows + 285 part1 procedure chunks + 607 part2 procedure chunks ingested this session · all new rows embedded=0 pending pollerD1 legislation5 Acts · embedded=1 · 1,272 sections in QdrantD1 case_citations5 rows · 1 case processedD1 case_legislation_refs5 rows · 1 case processedWorker.jsDeployed d0c487c — procedure pass + fetch-case-url route liveprocedure_notes columnOn cases table · Parsons confirmed populated with procedural sequenceingest_corpus.pyUpdated: PROCEDURE_ONLY flag + section-aware splitting + [procedure] citation suffixmaster_corpus filespart1: 285 procedure chunks ingested · part2: 607 procedure chunks ingested · total new: 892retrieval_baseline.shOn VPS ~/retrieval_baseline.sh · baseline run complete (see results below)server.pypplx-embed + general-docs-v2 + threshold 0.45 + BM25 + concept search LIVEPhase 5VALIDATED — citation discipline liveFrontendDark Gazette theme · Procedure Notes collapsible in case detail · fetch-case-url form on ingest page

RETRIEVAL BASELINE — 18 March 2026 (Master corpus only, pre-procedure embed)
Re-run after procedure embed pass confirms ~3,302 points. Expected fixes: Q7, Q8, Q12, Q13, Q14.
QQuestionResultRoot causeQ1s 137 Evidence Act test✅ PassStrong — legislation + secondary + authoritiesQ2Elements of common assault✅ PassCorrect secondary chunks with elementsQ3Firearms Act weapon definition✅ PassRelevant legislation + secondaryQ4Police search without warrant⚠️ Partials16 conveyance note retrieved, doctrine thinQ5Fault element recklessness⚠️ PartialVallance chunk exists but threshold issue — BM25 tuning neededQ6Standard of proof✅ Passs141 Evidence Act correctQ7Tendency evidence test❌ FailProcedure corpus gap — now ingested, pending embedQ8Propensity evidence admissibility❌ FailProcedure corpus gap — now ingested, pending embedQ9Sentencing first offenders⚠️ PartialProportionality retrieved, first offender content thinQ10Corroboration❌ FailGenuine corpus gap — needs manual chunkQ11s 38 application✅ PassRich content with submissions and authoritiesQ12Hostile witness steps❌ FailProcedure corpus gap — now ingested, pending embedQ13Tendency objection❌ FailProcedure corpus gap — now ingested, pending embedQ14Leading questions technique⚠️ PartialProcedure corpus gap — now ingested, pending embedQ15Witness refuses to answer✅ PassJustices Act s43 + secondary

IMMEDIATE NEXT ACTIONS

Run procedure embed pass — SSH, run poller to embed ~892 new procedure rows. Expected new Qdrant count: ~3,302.

bash   cd ~/ai-stack
   docker compose exec -d agent-general python3 /app/src/enrichment_poller.py --loop
Monitor: curl -s http://localhost:6334/collections/general-docs-v2 | python3 -m json.tool | grep points_count

Re-run retrieval baseline — SSH: bash ~/retrieval_baseline.sh — after embed confirms ~3,302 points. Check Q7, Q8, Q12, Q13, Q14.
Implement async job pattern — Worker hands off to VPS server.py, returns job ID, frontend polls /api/legal/job-status/:id. Required before large judgments can be ingested.
Commit uncommitted files — ingest_corpus.py (PROCEDURE_ONLY changes), retrieval_baseline.sh, generate_manifest.py, backfill scripts, validate_ingest.ps1.
Open scraper — only after Procedure Prompt second pass in summarizeCase() implemented and async pattern confirmed working.
Category normalisation — deferred until post-retrieval testing.


KNOWN ISSUES / WATCH LIST

fetch-case-url timeout — times out on large judgments (>~100 paragraphs). Fix: async job pattern. Small judgments work fine.
Scanned PDF upload timeout — large scanned PDFs timeout on console upload. Born-digital PDFs and short scanned judgments work fine.
Procedure Prompt second pass in summarizeCase() — not yet implemented. Scraper PAUSED. Note: procedurePassPrompt in Worker.js is judgment-tuned (voir dire, admissibility rulings) — NOT the RAG workflow Procedure Prompt. Different prompts for different content types.
Category fragmentation — non-standard category values in D1 secondary_sources. Deferred until post-retrieval testing.
process-document "both" mode — prompt_mode="both" runs Master Prompt only. Procedure Prompt second pass not yet implemented in server.py.
python-docx / striprtf — not installed in agent-general container. DOCX/RTF uploads will error.
Worker.js filename case — wrangler warns about Worker.js vs worker.js. Rename when convenient.
Cases with null case_name/facts — don't render in library UI (hidden). Delete via wrangler d1 directly.
ingest_corpus.py destructive upsert — upload-corpus ON CONFLICT DO UPDATE resets embedded=0 and wipes enriched_text on citation collision. Never re-run against already-ingested citations. Procedure chunks safe (distinct [procedure] suffix). Master chunks must never be re-ingested via this script.
Q10 corroboration — zero retrieval results. Corroboration largely abolished under uniform evidence law. Needs targeted manual chunk written and ingested.
Q5 recklessness (Vallance) — chunk exists in corpus but not surfacing at default threshold. BM25 tuning needed. Not a corpus gap.


CHANGES THIS SESSION — 18 March 2026

Retrieval baseline script (~/retrieval_baseline.sh) built and run — 15 questions, results documented above
Diagnosed and fixed server.py auth (X-Nexus-Key header) and field name (query_text) issues in baseline script
Confirmed process_blocks.py procedure pass completed 15 March (56 blocks, both prompts, no failures)
Confirmed procedure chunks were NOT previously ingested — Master corpus only in D1/Qdrant
ingest_corpus.py updated: PROCEDURE_ONLY flag, section-aware block splitting, [procedure] citation suffix
Confirmed destructive upsert behaviour of upload-corpus — documented in Known Issues
Part1 procedure chunks ingested: 285 chunks, 285 OK, 0 FAIL
Part2 procedure chunks ingested: 607 chunks (completed at session close)
Parsons [2018] TASSC 62 confirmed: pipeline capturing holdings and IF/THEN principles correctly — no "why" gap
CLAUDE_arch.md confirmed as essential — now required upload every session (line 3 updated)
Retrieval root cause analysis: 6 pass, 3 partial, 6 fail — majority fixable by procedure embed pass


FUTURE ROADMAP

Async job pattern for case upload/fetch — Worker receives upload or URL, hands to VPS server.py, returns job ID, frontend polls status. Build before extending scraper.
Fetch-by-URL case upload — route built, needs async pattern for large judgments. Already works for short cases.
Procedure Prompt second pass in summarizeCase() — GATE before scraper reopens.
Procedure Notes Markdown renderer — replace white-space: pre-wrap once real procedure content confirmed from scraper.
Extend scraper to HCA/FCAFC — after async pattern confirmed working.
Retrieval eval framework — formalise scored baseline (found/partial/missed by category) as standing process after every corpus or pipeline change.
Q10 corroboration chunk — write targeted manual chunk covering current law and ingest.
Q5 Vallance BM25 tuning — Vallance recklessness chunk exists, not surfacing at default threshold. Adjust BM25 concept keywords.
RAG workflow doc update — update RAG_Workflow_Arcanthyr_v2.docx: two-run ingest sequence, PROCEDURE_ONLY flag, [procedure] suffix, destructive upsert warning, updated chunk counts (892 procedure + 1138 master = 2030 total).
Cloudflare Browser Rendering /crawl — available Free plan. For Tasmanian Supreme Court sentencing remarks. NOT AustLII.
BM25 improvements — proper scoring + hybrid ranking.
Console status indicator — show enriched/embedded progress per document.
Qwen3 UI toggle — add third button once Qwen validated.
Reingest-case route — delete + reingest pattern to backfill case_name into Qdrant.
Nightly cron for xref_agent.py — after scraper active.
Stare decisis layer — surface treatment history from case_citations.
Animated sigil — swap sigil.jpg for sigil.gif if rotating GIF produced.
Agent work (post-corpus validation) — contradiction detection, coverage gap analysis, citation network traversal, stale authority detection, query expansion, procedural sequence assembly, bulk enrichment audit.
Category normalisation — doctrine vs legal doctrine in secondary_sources. Post-retrieval testing.