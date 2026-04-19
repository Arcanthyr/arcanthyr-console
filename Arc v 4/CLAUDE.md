@CLAUDE_arch.md

CLAUDE.md — Arcanthyr Session File
Updated: 20 April 2026 (end of session 80) · Supersedes all prior versions
Full architecture reference → CLAUDE_arch.md — UPLOAD EVERY SESSION alongside CLAUDE.md
Changelog archive → CLAUDE_changelog.md (sessions 21–65) — load conditionally

---

## SYSTEM STATE — 20 April 2026 (end of session 80)

| Component | Status |
|---|---|
| Qdrant general-docs-v2 | 28,876 points · RE-EMBED COMPLETE — vocabulary anchor prepend deployed, all case chunks embedded; 233 authority_synthesis chunks added session 79 |
| D1 cases | 1,914 (scraper running) · 1,913 deep_enriched=1 · 1 stuck |
| D1 case_chunks | 26,051 total · embedded=0: 17 (all header chunks, null enriched_text — permanently excluded by design; effective backlog: 0) |
| D1 secondary_sources | 1,437 total (233 authority_synthesis added session 79) · embedded=0: 2 (orphaned Nexus saves, not a pipeline fault — authority chunks may be residual during poller catch-up window) |
| D1 case_chunks_fts | 26,034 rows — 1:1 match with D1 case_chunks where enriched_text IS NOT NULL · 194 duplicate rows deleted session 75 · root cause fixed Worker e5934624 (DELETE-then-INSERT upsert) |
| D1 query_log | Active — answer_text + model columns added session 69, deleted soft-delete column added |
| D1 quarantined_chunks | 253 rows · Qdrant quarantined=true flag LIVE on all 253 points · server.py must_not filter LIVE on all four passes (Pass 1, Pass 2, Pass 3, Pass 4) |
| Pass 4 / Citation authority agent | SHADOW MODE — `AUTHORITY_PASS_ENABLED=false` (default) · gate fires + logs `[Pass 4] gate=FIRE reason=... ENABLED=false (shadow)` but skips Qdrant query · enable after 24–72h telemetry review by adding `AUTHORITY_PASS_ENABLED=true` to `~/ai-stack/.env.config` + force-recreate agent-general · Worker version 648207f6 |
| D1 synthesis_feedback | 0 rows · route wired session 68 (POST /api/pipeline/feedback) |
| D1 case_citations | 6,959 rows |
| D1 case_legislation_refs | 5,147 rows |
| enrichment_poller | RUNNING — re-embed complete, all chunks at embedded=1 |
| Cloudflare Queue | drained |
| Scraper | RUNNING (status uncertain — processed_date field unreliable; check scraper.log after 11am AEST) |
| arcanthyr.com | Live |
| Subject matter filter | LIVE · SM_PENALTY=0.65 · LEG_WHITELIST_CORE + LEG_WHITELIST_ADJACENT + keyword bridge LIVE · Domain filter UI LIVE · Pass 2 MatchAny criminal/mixed hard filter LIVE (all three parts complete) |
| Stare decisis UI | LIVE |
| Save to Nexus | LIVE — approved column, approval gate, pending review in Library, delete action (D1+FTS5+Qdrant cleanup) |
| Query history | LIVE — answer_text + model stored per query, side panel on Research page, click-to-view, Save to Nexus / Delete per entry |
| Baseline (31 queries) | ≥28P / ≤3Pa / 0M — query expansion deployed session 77 (19 Apr 2026) · Q12 MISS→PASS (s38 EA chunk #1 @ 0.6759) · Q23 MISS→PASS (secondary-chunk-12 #3 @ 0.6697) · zero P→M regressions · exact count pending Tom's manual review of Q7/Q14/Q15 · new snapshot `~/retrieval_baseline_post_query_expansion.txt` · session 74 canonical `~/retrieval_baseline_post_interleave.txt` retained as prior reference · generic `~/retrieval_baseline_results.txt` still Apr 16, do not grep |
| procedure_notes | 319 success / ~340 not_sentencing |
| auslaw-mcp | RUNNING on VPS — digest-pinned `sha256:480e8968...`, isolated network `auslaw-mcp_auslaw-isolated`, 10 tools via Windows Claude Code (user-scope `auslaw`) |
| BM25 case_chunks_fts | LIVE — interleave mode, split-constant design: BM25_SCORE_KEYWORD=0.0139 (boost path, additive) · BM25_INTERLEAVE_SCORE=0.50 (novel-hit path, competes with borderline semantic) · SM_PENALTY retained (0.50×0.65=0.325 suppresses SM-mismatched novel hits) |

---

## OUTSTANDING PRIORITIES

1. **Post-scrape authoring pass** — Q9 (guilty plea discount / Sentencing Act s 11A) and Q26 (unreasonable verdict / M v The Queen) diagnosed this session as authoring gaps but deferred until scrape-complete. Further MISS/Partial triage deferred to post-scrape baseline re-run.

2. **Q14 diagnostic — why is s 37 EA not in top 3?** — Live Q14 ("leading questions examination in chief") returns [2021] TASSC 4 Hefny v Barnes at #1 (0.50), Hofer/TASCCA 11 cross-examination at #2/#3. s 37 EA legislation chunk exists in corpus but not surfacing. Not a vocabulary mismatch ("leading questions" is both statutory and practitioner term). Hypothesis: case-application chunks outscoring legislation chunk on semantic density. Diagnosis task: check s 37 EA chunk's vocabulary anchor, check whether it's being returned at any position in top 12, check whether it's being SM-penalised incorrectly. If chunk is fine but ranking is wrong, may need doctrinal authoring (practice note on leading-questions-in-chief technique) rather than retrieval tuning.

3. **Bucket 2 corpus hygiene — 10 s 38 EA chunks lack CONCEPTS headers** — Session 76 D1 audit surfaced that most `Evidence Act 2001 (Tas) s 38 -` prefixed chunks have no `Concepts:` or `[CONCEPTS:]` line in raw_text (chunks: `Steps for Inconsistencies`, `Cross-Examination Procedure`, `Application for Leave to Cross-Examine`, `Further Application Setup`, `Cross-Examination Workflow`, `Result after Cross-Examination`, `Leave Application`, `Setting Up Application`, `Alternative Options`, `S 38(6) Factors`). These chunks get reduced anchor signal from `build_secondary_embedding_text()` — no CONCEPTS for the anchor prepend means they're only weakly lifted. Corpus hygiene issue independent of aliasing. Low priority — defer unless s 38 EA queries show regressions now that query expansion is live. Fix by full raw_text rewrite with a standard CONCEPTS line each; one-time cost ~10 chunks.

4. **auslaw-mcp hardening followups** — (a) rate budget in `/fetch-page` proxy to prevent MCP queries starving daily scraper's AustLII allowance, (b) resource limits on compose service (`mem_limit: 1g`, `cpus: '1.0'`), (c) filesystem hardening (`read_only: true` + `tmpfs: [/tmp]` once write paths confirmed), (d) GitHub MCP install (guide already written as `github-mcp-setup.md`, existing `github` MCP already wired — low priority).

5. **Quick Search tab (arcanthyr.com practitioner UI)** — Build plan finalised in session 73 (conversation-external — not built, see handover notes). Three phases: corpus FTS keyword search (Phase 1), AustLII external via `/fetch-page` (Phase 2 — watch for CGI slowness inherited from auslaw-mcp `search_cases` timeout issue), query_log `search_type` extension (Phase 4). Phase 3 Jade link button is gravy. Phase 5 (full-judgment fetch + reading pane with cached HTML, 30-day TTL `austlii_cache` D1 table) added as separate extension. Track 2 (remote MCP at `auslaw.arcanthyr.com`) explicitly deferred — auslaw-mcp in CC covers 90% of the use case.

6. **Citation authority agent — Phase 4 pending (force-recreate + shadow validation)** — Pass 4 leg deployed session 80 in shadow mode (`AUTHORITY_PASS_ENABLED=false`). Phase 3 UI verified clean (Playwright session 80 — no regression, shadow gate holding). **Next step (Tom):** SSH to VPS → `echo "AUTHORITY_PASS_ENABLED=false" >> ~/ai-stack/.env.config` → `cd ~/ai-stack && docker compose up -d --force-recreate agent-general` → `docker compose exec agent-general printenv AUTHORITY_PASS_ENABLED`. Monitor `docker compose logs --tail=50 agent-general | grep "Pass 4"` across 24–72h. When flag flip is ready (Priority #9 below), bundle the worker.js sources-mapper fix in the same session/deploy.

8. **Research page source-card tags rendering "?" — fix before flag flip** — Pre-existing bug exposed by session 80 Playwright UI verification. Root cause: `handleLegalQuery` and `handleLegalQueryWorkersAI` sources mapper in worker.js strips `type`/`source_type` fields when building the frontend response; `court` also frequently empty string from Qdrant case_chunk payloads. Fix: add `type: c.type, source_type: c.source_type` to both handlers' `sources.map()` — one-line change per handler. Not urgent (tags cosmetic, retrieval/synthesis works). **Becomes urgent when `AUTHORITY_PASS_ENABLED=true`** — authority chunks will render as "?" instead of amber AUTHORITY, defeating Phase 3 UI differentiation. Must fix in the same session as the flag flip.

7. **Sentencing Act 1997 (Tas) ingest into legislation corpus** — structural gap surfaced this session during Q9 diagnosis (`SELECT DISTINCT legislation_id FROM legislation_sections` returned no Sentencing Act row). Deferred to post-scrape authoring pass. Ingest via legislation upload pipeline; verify section-level chunking covers s 11A (guilty plea discount), s 12 (concurrent/cumulative), and sentencing purposes (ss 3–5).

---

## KNOWN ISSUES / WATCH LIST

- **Sentencing Act 1997 (Tas) absent from legislation_sections** — confirmed via `SELECT DISTINCT legislation_id FROM legislation_sections` audit session 78; table has no row for Sentencing Act. Q9 (guilty plea discount / s 11A) is a corpus gap, not a retrieval defect. Fix: ingest via legislation upload pipeline. Deferred to post-scrape authoring pass.
- **SCP'd file edits produce LF→CRLF git diff inflation** — session 78 Phase 2b commit `a60fa1e` showed 106 insertions / 10 deletions for a 4-line logic change because SCP of VPS-edited files to Windows converts LF line endings to CRLF. Workaround: add `.gitattributes` with `*.py text eol=lf`; or edit Python files locally and SCP up rather than down. Cosmetic issue only — logic is correct.
- **Corpus ... placeholders — 3 of 5 resolved** — part1.md:1282 and part2.md:2415 confirmed as legal elisions (not errors) · part2.md:381 `T...` fixed to `The` · remaining 2 genuine gaps: part2.md:1167 block_023 (`...BUT see below` dangling ref) and part2.md:1957 block_028 (`[Continues with specifics...]` placeholder) — both need source material from rag_blocks/, deferred to Procedure Prompt re-ingest
- **Synthesis deduplication loose** — "4-8 principles" instruction not tight enough · spot-check produced 4 principles from 2 ideas (redundant restatements) · not a blocker for retrieval (embeddings match correctly) · note for Pass 2 prompt quality review on roadmap
- **CONCEPTS-adjacent vocabulary contamination** — session 46 CONCEPTS strip removed semantic disambiguation from secondary source body text · chunks about police-powers (George v Rockett, Samoukovic v Brown, prescribed belief) and honest/reasonable mistake defence have body text vocabulary (reasonable/belief/proof/standard/certainty) that overlaps with BRD queries · 6 chunks fixed session 51 with domain anchor sentences · monitor as new chunks are ingested — same pattern will recur for any chunk discussing "reasonable" belief/assessment in a non-BRD context
- **Bulk requeue race condition** — firing >500 simultaneous CHUNK messages causes GPT-4o-mini rate limit exhaustion and merge race conditions · always use batched approach (limit=250) for bulk requeue operations · never reset all chunks simultaneously
- **Never reset enriched=0 on all cases** — this triggers full Pass 1 + chunk re-split + CHUNK re-processing for all cases · use `requeue-merge` (synthesis-only) or `requeue-chunks` (chunk-only) for targeted operations
- **fetch-case-url vs upload-case** — URL-based ingestion must use `POST /api/legal/fetch-case-url` · `upload-case` is for direct text upload only · posting {url} to upload-case crashes on citation.match(undefined)
- **subject_matter misclassification — partially resolved** — Pilling entries in prior KNOWN ISSUES were incorrect: Tasmania v Pilling [2020] TASSC 13 and [2020] TASSC 46 are workers compensation cases, correctly classified as administrative · 3 genuine misclassifications corrected this session ([2021] TASMC 13, [2020] TASSC 16, [2022] TASSC 69 → all set to criminal) · Tasmania v Rattigan [2021] TASSC 28 audit status unverified · full audit still recommended before Option A Qdrant re-embed
- **update-secondary-raw 404 on space-containing IDs** — POST /api/pipeline/update-secondary-raw returns "not found" for secondary source IDs with spaces in them · workaround: use Cloudflare Developer Platform MCP direct D1 query · root cause undiagnosed
- **FTS5 backfill complete** — 1,171 rows · session 13
- **CHUNK prompt reasoning field** — added and reverted session 10 · do not re-add
- **Qwen3 /query endpoint timeout** — server.py Qwen3 inference times out when scraper hammering Ollama · not a problem for UI (uses Claude API primary)
- **Workers AI content moderation** — Qwen3 blocks graphic evidence · CHUNK enrichment on GPT-4o-mini · Pass 1/Pass 2 still on Workers AI — monitor
- **striprtf** — not installed in agent-general container · RTF uploads will error · python-docx is installed (added Dockerfile.agent session 27) so DOCX uploads work
- **Word artifact noise** — 131 chunks cleaned 18 Mar 2026 · re-run gen_cleanup_sql.py if new Word-derived chunks ingested
- **FTS5 export limitation** — wrangler d1 export does not support virtual tables
- **Scraper no per-case resume** — progress file only stores court_year: "done"
- **Pass 2 (Qwen3) principles irrelevant** — CHUNK merge overwrites principles_extracted with chunk-level data · Pass 2 output never visible · PRINCIPLES_SPEC update session 22 has no practical effect until merge behaviour changes
- **Synthesis skip on null enriched_text** — performMerge synthesis call requires enrichedTexts.length > 0 · cases whose chunks have null enriched_text fall back to raw principle concatenation (old format)
- **Health check false positive (tendency evidence contradiction)** — "Tendency Evidence Exclusion in Bail Hearings" vs "Tendency Evidence Requirements and Admissibility" flagged as contradiction by GPT-4o-mini health check. Not a genuine contradiction — s 94 EA correctly exempts bail proceedings from tendency/coincidence rules; the two chunks describe different contexts. Resolved by s94 chunk ingested session 71. Monitor in next health check run.
- **/search top_k=12 server-side cap** — server.py line 296 hard-caps at 12 regardless of requested top_k. Cap retained for latency bounding. With query expansion live (4 fan-out queries), the merged Pass 1 pool is larger but still capped at top_k*2 per leg — monitor for cases where the cap is discarding strong results. Confirmed session 76: passing `"top_k": 12` in the request payload breaks the endpoint (returns 0 chunks) — the field is not accepted; omit it, default 6 is what the baseline script uses.
- **Q27 (provocation) confirmed as corpus content gap** — provocation defence was abolished in Tasmania 2003; corpus correctly sparse. Authoring decision, not retrieval defect.
- **Stale baseline file gotcha** — `~/retrieval_baseline_results.txt` on VPS is Apr 16 (pre-quarantine) and is regularly what grep/head default to. Always use timestamped snapshots: `~/retrieval_baseline_pre_reembed.txt`, `_post_reembed.txt`, `_post_quarantine.txt`, `_pre_interleave.txt`, `_post_interleave.txt` (session 74 canonical). Session 75 lost 20 minutes chasing a phantom stub-quarantine leak diagnosed from the stale file.
- **Body-level alias injection is a conditional lever, not a universal one** — Established experimentally session 76. Body-text prose injection shifts the embedding vector enough to win top-rank on queries whose wording overlaps the injected prose, but does not help queries that diverge lexically from the injected wording — even when the underlying concept is identical. Consequence: corpus-side aliasing work has a permanent ceiling imposed by query-side variation. Aliasing by body edit remains viable for closing specific high-value query pairs only if user phrasing can be predicted; query expansion (deployed session 77) is the architectural fix for open-ended recall. Do not attempt further corpus-side aliasing injection as a substitute for the query expansion path.
- **Research page source-card tags show "?" — worker.js mapper strips type** — Confirmed session 80 via Playwright React fiber inspection. `handleLegalQuery` and `handleLegalQueryWorkersAI` sources mapper does not include `type` or `source_type` in the objects sent to the frontend; result objects arrive as `{ citation, court, year, score, summary }`. ResultCard TYPE_TAGS lookup fails silently → fallback label '?'. Fix: add `type: c.type, source_type: c.source_type` to both handlers' `sources.map()` in worker.js. Must fix before or with `AUTHORITY_PASS_ENABLED=true` flip — otherwise authority_synthesis chunks render as "?" not amber AUTHORITY.
- **Qdrant court field frequently empty on case_chunk payloads** — Session 80 Playwright verification found `court: ""` across 4× TASMC chunks on a doctrinal query. Separate from the worker.js mapper issue above (court is empty before it even reaches the mapper). Investigate whether scraper writes court into Qdrant payload at ingest or only into D1 `cases.court`. Low priority — type-based tag fallback (once mapper fix lands) will render correct tag without needing court.

---

## SESSION RULES

| Rule | Detail |
|---|---|
| Read this file first | Always |
| Upload both files | Upload CLAUDE.md AND CLAUDE_arch.md at the start of every session — both are required |
| Conditional file loading | If the task involves CLI commands, wrangler deploys, Docker/SSH ops, or PowerShell scripting — ask Tom to upload CLAUDE_init.md before proceeding · If making architectural changes, evaluating design tradeoffs, or referencing a past decision — ask Tom to upload CLAUDE_decisions.md · If investigating past sessions or debugging a regression to a specific date — ask Tom to upload CLAUDE_changelog.md · Do not request any speculatively |
| Diagnose from actual output | Before recommending any fix |
| PowerShell setup | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` at start of every PS session — required before any wrangler/npx command |
| Always specify terminal | Every command must state: which terminal (VS Code, PowerShell, SSH/VPS) AND which directory |
| enrichment_poller | Runs as permanent Docker service `enrichment-poller` (restart: unless-stopped) — no tmux required · poller auto-restarts on crash/reboot · check logs: `docker compose logs --tail=20 enrichment-poller` |
| git commits | Run from `arcanthyr-console/` root (monorepo root since session 35) · `git add -A`, `git commit`, `git push origin master` — separately, no && |
| Pre-deploy check | Verify upload list shows only `public/` files — if `.env` or `.git` appear, stop |
| wrangler d1 | Must run from `Arc v 4/` directory · always add `--remote` for live D1 |
| PowerShell limits | No &&, no heredoc `<<'EOF'`, no grep (use Select-String), no head (use Select-Object -First N) |
| CC brief pattern | Ask CC to read files and report state BEFORE making changes |
| CC cannot run Python | Windows Store stub blocks it — run Python in PowerShell terminal directly |
| CC vs SSH | CC for local file edits · SSH terminal for VPS runtime commands |
| CC vs manual SSH | Simple read/run commands (baseline, logs, single queries) → SSH yourself, faster and cheaper · CC with hex-ssh for multi-step VPS file edits, diagnosis across multiple files, or anything replacing SCP round-trips · Rule: if it's one command and paste-back, do it manually |
| Session closer verification | After CC runs the session close commit, always run `git status` from arcanthyr-console/ root to confirm all claimed new files are actually present — session closer has a known failure mode of logging "created" for files never written to disk |
| Long-running scripts | Run directly in PowerShell terminal — CC too slow (confirmed: ingest runs, embed pass) |
| Context window | Suggest restart proactively when conversation grows long |
| CC effort | Set to High permanently — maximum effort on all responses |
| Adaptive thinking | Disabled |
| MCP tools | CC has hex-ssh (direct VPS edit/upload without SCP), github, firecrawl, playwright, context7, fetch, sequential-thinking, magic — use these instead of manual SCP/git CLI where possible · Full tool list in CLAUDE_arch.md MCP SERVERS & TOOLS section · Never ask CC to read .env.secrets — grep individual keys only via remote-ssh |
| D1 database name | arcanthyr (binding: DB, ID: 1b8ca95d-b8b3-421d-8c77-20f80432e1a0) |
| Component quirks | Document in CLAUDE_arch.md Component Notes section |
| qdrant-general host port | Host-side port is 6334 (not 6333) — docker-compose maps 127.0.0.1:6334->6333/tcp · always curl localhost:6334 from VPS host |
| Pasting into terminal | Never paste wrangler output back into terminal — type commands fresh · Never paste PS prompt prefix into terminal |
| Rogue d file | Delete with `Remove-Item "c:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\d"` if it reappears — commit deletion |
| server.py auth | All direct calls to localhost:18789 require header `X-Nexus-Key` · Get value: `grep NEXUS_SECRET_KEY ~/ai-stack/.env.secrets` on VPS · "unauthorized" = missing or wrong key |
| server.py search field | Search endpoint expects `query_text` (not `query`) · "query_text is required" = wrong field name · endpoint: `POST localhost:18789/search` |
| retrieval_baseline.sh | KEY auto-reads from `~/ai-stack/.env.secrets` using `cut -d= -f2-` (preserve trailing `=`) · results in ~/retrieval_baseline_results.txt · pre-RRF baseline at ~/retrieval_baseline_pre_rrf.txt — do not overwrite · 31 queries (Q1–Q31) · run after any retrieval architecture change before further work |
| ingest_corpus.py | Lives at `arcanthyr-console\ingest_corpus.py` (NOT inside `Arc v 4/`) · INPUT_FILE hardcoded — change manually · PROCEDURE_ONLY=False for full corpus ingest · Block separator format MUST be `<!-- block_NNN master -->` or `<!-- block_NNN procedure -->` followed by `### Heading` then `[DOMAIN:]` on next line · Use Python (not PowerShell Out-File) to create corpus files — PowerShell BOM/encoding corrupts block separators · upload-corpus uses destructive upsert — do NOT re-run against already-ingested citations |
| ingest_part2.py | Lives at `arcanthyr-console\ingest_part2.py` — standalone copy of ingest_corpus.py with INPUT_FILE hardcoded to master_corpus_part2.md and PROCEDURE_ONLY=False |
| FTS5 wipe before re-ingest | Before any corpus re-ingest run: `DELETE FROM secondary_sources_fts` via wrangler d1 — INSERT OR REPLACE fix deployed session 12 (version 2d3716de) so this should no longer be needed, but if 500 errors appear on upload-corpus, wipe FTS5 first |
| Bash scripts on VPS | Large pastes truncate in SSH terminal — create files locally and SCP to VPS instead |
| PowerShell file creation | Use Python script to write files, not Out-File — BOM corruption confirmed on corpus files |
| upload-corpus auth | Route does NOT use X-Nexus-Key — uses User-Agent spoof: `Mozilla/5.0 (compatible; Arcanthyr/1.0)` |
| Cloudflare Queues | LIVE — fetch-case-url and upload-case both async via queue · Queue name: arcanthyr-case-processing · Message types: METADATA (Pass 1), CHUNK (principle extraction), MERGE (synthesis-only re-merge) |
| case_chunks table | D1 table — stores 3k-char chunks per case · columns: id, citation, chunk_index, chunk_text, principles_json, enriched_text, done, embedded · PK is `citation__chunk__N` format |
| deep_enriched flag | Column on cases table · 0 = Pass 1 only · 1 = all chunks processed and merged |
| Queue message types | METADATA → Pass 1 + split + enqueue chunks · CHUNK → one GPT-4o-mini call per chunk + merge when all done · MERGE → synthesis-only re-merge (no chunk reprocessing) |
| D1 no citation column | secondary_sources PK is `id` (TEXT) — no `citation` column. Never query `WHERE citation =`. |
| callWorkersAI fix | reasoning_content fallback added — if content is null, falls back to reasoning_content before text. Fixes Qwen3 thinking mode responses. |
| poller batch/sleep | Default batch: 50 · Loop sleep: 15 seconds |
| BM25_FTS_ENABLED | Kill switch REMOVED — variable does not exist. TWO FTS5/BM25 passes in server.py: (1) secondary_sources FTS5 — LIVE, gates on section refs detected in query (via fetch_sections_by_reference / fts-search Worker route); (2) case_chunks_fts BM25 pass — session 65 changelog claims deployed but ABSENT from both local and VPS server.py — DEPLOY GAP, needs re-deploy. BM25_SCORE_KEYWORD constant defined at line 31 but currently unused. |
| Pass 3 threshold | Lowered 0.35 → 0.25, limit raised 4 → 8 (session 28) — secondary source recall gap diagnosed via Ratten v R not surfacing · chunk_id debug log added to Pass 3 in server.py (fires unconditionally) |
| VPS doc ID format | server.py `post_chunk_to_worker` generates citation-derived IDs (e.g. `DocTitle__Citation`) — different from console paste `hoc-b{timestamp}` format · both are valid · if duplicate rows appear for VPS-uploaded docs, check for GPT generating slightly different citation strings on re-run |
| update-secondary-raw | POST /api/pipeline/update-secondary-raw — updates raw_text + resets embedded=0 on secondary_sources row · requires X-Nexus-Key · body: {id, raw_text} · deployed session 28 worker.js version 65017090 |
| fetch-secondary-raw | GET /api/pipeline/fetch-secondary-raw — paginated fetch of id + raw_text from secondary_sources · requires X-Nexus-Key · params: ?offset=N&limit=N (max 100) · returns {ok, chunks, total, offset} · deployed session 28 |
| enrich_concepts.py | One-off concepts enrichment script — Arc v 4/enrich_concepts.py · expands CONCEPTS/TOPIC/JURISDICTION lines + adds search anchor sentence via GPT-4o-mini · hits fetch-secondary-raw to read, update-secondary-raw to write · run: python enrich_concepts.py · --dry-run and --limit N flags available · add to .gitignore |
| Canonical categories | annotation, case authority, procedure, doctrine, checklist, practice note, script, legislation — normalised 18 Mar 2026 |
| Scraper location | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Local Scraper\austlii_scraper.py` · progress file: `...\scraper_progress.json` · log: `...\scraper.log` · runs on Windows only (Task Scheduler on local machine) |
| Scraper progress file | No per-case resume — file only stores `{court}_{year}: "done"` or absent. Scraper always starts from case 1 for any unfinished court/year. Re-uploading already-ingested cases is harmless (INSERT OR IGNORE skips silently). |
| run_scraper.bat location | `C:\Users\Hogan\run_scraper.bat` — must be LOCAL (not OneDrive) to avoid Task Scheduler Launch Failure error |
| Scraper wake tasks | Dedicated SYSTEM-level wake tasks created (session 46): `WakeForScraper` fires 10:55 AM daily, `WakeForScraperEvening` fires 4:55 PM daily · both have WakeToRun=True · wakes PC 5 min before scraper runs at 11:00 AM and 5:00 PM AEST · created as SYSTEM/HIGHEST so wake works from sleep without user login |
| cases.id format | Now citation-derived (e.g. `2026-tassc-2`), not UUID · `citationToId()` helper in worker.js · both upload handlers use `INSERT OR IGNORE` — re-upload of existing citation is a no-op, enrichment data preserved |
| TAMagC on AustLII | TAMagC cases exist on AustLII but the court is subject to outages · if scraper returns all 404s for a TAMagC year, check AustLII manually before marking as no data · do not assume structural absence · VPS is NOT IP-blocked by AustLII (confirmed curl 200 session 35) |
| runDailySync proxy | AustLII fetches routed through VPS `/fetch-page` endpoint (server.py) to avoid Cloudflare edge IP patterns · jade.io URLs fetch directly · `env` threaded through `handleFetchPage` and `fetchCaseContent` · deployed session 35 |
| PDF upload (case) | OCR fallback now wired — scanned PDFs auto-route to VPS /extract-pdf-ocr · citation and court auto-populate from OCR text · court detection checks header (first 500 chars) before full text |
| server.py canonical copy | VPS is canonical — always SCP down before editing locally: `scp tom@31.220.86.192:/home/tom/ai-stack/agent-general/src/server.py "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\server.py"` |
| SCP server.py to VPS | `scp "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\server.py" tom@31.220.86.192:/home/tom/ai-stack/agent-general/src/server.py` then force-recreate agent-general |
| enrichment_poller.py canonical copy | VPS is canonical — always SCP down before editing locally: `scp tom@31.220.86.192:/home/tom/ai-stack/agent-general/src/enrichment_poller.py "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\enrichment_poller.py"` |
| SCP enrichment_poller.py to VPS | `scp "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\enrichment_poller.py" tom@31.220.86.192:/home/tom/ai-stack/agent-general/src/enrichment_poller.py` then `docker compose restart enrichment-poller` (NOT force-recreate — bind mount means restart is sufficient for Python code changes) |
| backfill scripts | Must run on VPS — fetch D1 data via Worker API (not wrangler subprocess), hit Qdrant via localhost:6334 |
| Retrieval diagnostics | First step always: `docker compose logs --tail=50 agent-general` on VPS — skip message visible immediately |
| enrichment_poller payload | Payload text limits fixed session 9 — secondary_sources [:5000], case_chunks [:3000], legislation [:3000] |
| CHUNK prompt v3 | DEPLOYED session 14 — 6-type chunk classification (reasoning/evidence/submissions/procedural/header/mixed), enriched_text primary output, faithful prose principles replacing IF/THEN, reasoning_quotes field, subject_matter classification · worker.js version db71db45 + f150e037 |
| case_chunks schema | New columns added session 14: enriched_text TEXT (stores v3 prompt output), subject_matter TEXT (on cases table) · poller now embeds from enriched_text with chunk_text fallback |
| requeue-chunks scope | No citation filter — requeues ALL done=0 chunks · for single-case pilot: manually reset that case only before calling the route |
| total_chunks in queue | CHUNK queue messages now include total_chunks field — used for Chunk N of M positional hint in prompt |
| ingest_corpus.py parser | Fixed session 9 — heading regex now accepts single # and any [UPPERCASE:] field as lookahead |
| process_blocks.py | Updated session 9 — new preservation-focused Master prompt, Repair pass added, model fixed to gpt-4o-mini-2024-07-18, MAX_TOKENS=32000 |
| CHUNK enrichment model | GPT-4o-mini-2024-07-18 via OpenAI API (OPENAI_API_KEY Worker secret) — NOT Workers AI · switched session 10 due to content moderation blocks |
| requeue admin routes | POST /api/admin/requeue-chunks — re-enqueues done=0 chunks · POST /api/admin/requeue-metadata — re-enqueues enriched=0 cases · POST /api/admin/requeue-merge — re-triggers merge for deep_enriched=0 cases where all chunks done · all require X-Nexus-Key · read key from .env with $key = (Select-String "NEXUS_SECRET_KEY" .env).Line.Split("=",2)[1] |
| PowerShell Invoke-WebRequest | Add -UseBasicParsing to avoid security prompt · use $key pattern above for auth header |
| Workers Paid | Cloudflare Workers Paid plan active ($5/month) — no neuron cap · purchased session 10 |
| CLAUDE_decisions.md | Upload each session alongside CLAUDE.md + CLAUDE_arch.md · CC appends decisions directly · re-extract quarterly via extract_decisions.py |
| Wrangler auth | If D1 queries return error 7403, run npx wrangler login to re-authenticate |
| Cloudflare MCP | Use `mcp__claude_ai_Cloudflare_Developer_Platform__*` tools to query D1, inspect Workers, check KV/R2/Queues — eliminates wrangler relay through Tom · Account: Virtual_wiseman.operations@hotmail.com · Account ID: def9cef091857f82b7e096def3faaa25 |
| hex-ssh MCP | Project-scoped in `Arc v 4/.mcp.json` (gitignored) · Locked to ALLOWED_HOSTS=31.220.86.192, ALLOWED_DIRS=/home/tom/ai-stack, ALLOWED_LOCAL_DIRS=C:\Users\Hogan\OneDrive\Arcanthyr, REMOTE_SSH_MODE=safe · command: node · args: full path to server.mjs · key: id_ed25519 (passphrase removed session 39) |
| hex-ssh reads VPS files | Use hex-ssh MCP in CC to read VPS files directly (server.py, enrichment_poller.py, logs) — no SCP required for reads · SCP still required for writes/deploys · tool: ssh-read-lines on host 31.220.86.192 user tom |
| hex-ssh key | id_ed25519 passphrase removed session 39 — key loads cleanly via default path scan · no ssh-agent step required at session start · do not re-add passphrase |
| hex-ssh .mcp.json | command: node · args: ["C:\Users\Hogan\AppData\Roaming\npm\node_modules\@levnikolaevich\hex-ssh-mcp\dist\server.mjs"] · env: ALLOWED_HOSTS, ALLOWED_DIRS, ALLOWED_LOCAL_DIRS, REMOTE_SSH_MODE · registered user-scope in ~/.claude.json (session 41) — project .mcp.json retained but redundant |
| Third-party tool security audit | Before installing any MCP server, plugin, or skills repo: audit every non-markdown file via Fetch MCP for raw content · Check for undisclosed outbound connections, platform onboarding, or credential harvesting · Delete any .mcp.json found in cloned skill repos before use |
| arcanthyr-ui git repo | `arcanthyr-ui` is part of the monorepo — tracked under `arcanthyr-console/arcanthyr-ui/` · no separate GitHub repo · git root is `arcanthyr-console/`, not `arcanthyr-ui/` · migrated session 35 (was briefly a separate repo, absorbed into monorepo same session) |
| arcanthyr-ui dev server | `cd "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\arcanthyr-ui"` then `npm run dev` · Browser calls arcanthyr.com Worker directly (no Vite proxy) · auth removed for local dev — no login required |
| arcanthyr-ui deploy | Build: cd arcanthyr-ui → npm run build → cp -r dist/. "../Arc v 4/public/" → cd "../Arc v 4" → npx wrangler deploy · Do NOT use wrangler pages deploy · Do NOT add _redirects to public/ |
| Model toggle names | Sol = Claude API (claude-sonnet) · V'ger = Workers AI (Cloudflare Qwen3-30b) · V'ger is default |
| JWT secret | worker.js uses `env.JWT_SECRET` fallback to `env.NEXUS_SECRET_KEY` · no separate JWT_SECRET set in Wrangler — NEXUS_SECRET_KEY is signing key |
| worker.js query field | Frontend sends `{ query }` → Worker reads `body.query` → calls server.py with `{ query_text }` · never send query_text from frontend |
| Vite proxy IPv6 fix | proxy target hardcoded to `104.21.1.159` with `Host: arcanthyr.com` header + `secure: false` · Node.js on Windows prefers IPv6 but proxy fails · IPv4 workaround required |
| wrangler deploy path | Always `cd "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4"` — quotes required due to space in path · wrangler and npx commands run from `Arc v 4/` · git commands run from `arcanthyr-console/` root |
| Merge synthesis | GPT-4o-mini synthesis call at merge time produces case-level principles from enriched_text · shared `performMerge()` function used by both CHUNK and MERGE handlers · falls back to raw concat on failure |
| PRINCIPLES_SPEC | Updated session 22 — case-specific prose style, no IF/THEN, no type/confidence/source_mode fields · only affects Pass 2 (Qwen3) which is overwritten by merge anyway |
| Bulk requeue danger | Never reset enriched=0 on all cases simultaneously — causes Pass 1 re-run + chunk re-split + GPT-4o-mini rate limit exhaustion · use requeue-merge for synthesis-only re-runs |
| requeue-merge target param | body.target='remerge' queries deep_enriched=1 cases, resets each to 0 before enqueuing MERGE message · default (no target) queries deep_enriched=0 with runtime chunk check · added session 23 |
| Opus referral triggers | Defer to Opus + extended thinking (always on) for: (1) Prompt engineering decisions — any LLM prompt that affects data quality at scale; (2) Architectural choices with downstream consequences (schema design, pipeline changes); (3) Any decision where getting it wrong requires a patch script, re-embed, or bulk data fix; (4) Design decisions affecting 100+ rows or Qdrant points. CC should flag these rather than answering directly. |
| docker compose force-recreate | Always run with AGENT_GENERAL_PORT=18789 prefix when doing manual restarts — e.g. AGENT_GENERAL_PORT=18789 docker compose up -d --force-recreate agent-general — or the port will be assigned randomly and the baseline script will fail silently |
| hex-ssh deploys | CC force-recreate via hex-ssh remote-ssh will always get ephemeral ports unless env is loaded — the docker-compose.yml fix (session 41) now handles this via env_file: but AGENT_GENERAL_PORT still needs to be in .env.config (added session 41) |
| Upload case text limit | 500K char cap · `handleFetchCaseUrl` and `handleUploadCase` both cap at 500,000 chars · `processCaseUpload` line ~269 also 500K but is dead code (neither handler calls it) · truncation events logged to `truncation_log` D1 table · raised from 200K session 43, corrected session 52 |
| worker.js syntax check | After any CC edit to worker.js, run `node --check worker.js` from `Arc v 4/` before `wrangler deploy` — catches unterminated strings, missing brackets, and other parse errors that would fail the build |
| truncation_log table | D1 table tracking cases truncated on upload · columns: id, citation, original_length, truncated_to, source, status, date_truncated, date_resolved · status values: flagged/confirmed/replaced · `GET /api/pipeline/truncation-status` (no auth) returns flagged entries · `POST /api/pipeline/truncation-resolve` (X-Nexus-Key) for confirm/delete actions |
| docker compose port interpolation | ${VAR} in ports mapping is interpolated at parse time from .env only — env_file: does NOT apply · hardcode invariant ports directly in docker-compose.yml |
| Session health check | At session start, if `$TEMP\arcanthyr_health.txt` exists, read it and summarise corpus state (total cases, enrichment queue depth, embedding backlog) before doing anything else |
| Truncation tolerance | CLAUDE.md is structured with operational content (state, priorities, rules) in the first ~300 lines. History and procedures at the tail tolerate truncation — they exist as in-session reference, not session-start-critical context |
| CLAUDE_changelog.md | Load when investigating a past session's changes, debugging a regression to a specific date, or when referencing work from sessions older than the 3-session retention window |

**Tooling:**
- Claude.ai — architecture, planning, debugging, writing CLAUDE.md, code review
- Claude Code (VS Code) — file edits, terminal commands, git, wrangler deploys
- PowerShell / SSH — VPS runtime commands, long-running Python scripts

---

## CHANGES THIS SESSION (session 77) — 19 April 2026

- **Query expansion deployed — 26P/3Pa/2M → ≥28P/≤3Pa/0M** — Q12 MISS→PASS (s38 EA - Result after Cross-Examination #1 @ 0.6759) and Q23 MISS→PASS (secondary-chunk-12 warrant execution announcement #3 @ 0.6697). Zero P→M regressions across all 31 queries. Major collateral improvements: Q1, Q2, Q10, Q11, Q16, Q22, Q25, Q31 all showing substantially better top-3 content. Exact final count pending Tom's manual review of Q7/Q14/Q15. New snapshot: `~/retrieval_baseline_post_query_expansion.txt`.

- **Implementation — GPT-4o-mini fan-out with `ThreadPoolExecutor`** — Three changes to `server.py`: (1) `import concurrent.futures` added to line-1 import; (2) `EXPANSION_SYSTEM` prompt string constant + `generate_query_variants()` function inserted after module-level constants (GPT-4o-mini, `response_format={"type":"json_object"}`, hard 3.0s timeout, returns `[]` on any failure); (3) Pass 1 replaced with fan-out: `QUERY_EXPANSION_ENABLED` env flag, `_run_pass1()` inner function, `ThreadPoolExecutor(max_workers=4)` concurrent execution, per-future try/except gather loop, `_qdrant_id`-keyed merge dict (max score per chunk), telemetry print `[+] Pass 1 fan-out: N queries, N unique chunks, top score N`. Pass 2, Pass 3, and BM25 interleave unchanged — run on original query only. `query_vector` passed directly to the original-query leg to avoid re-embedding.

- **Degradation path confirmed** — When `generate_query_variants()` times out (3s hard limit), `all_queries = [query_text]` and `ThreadPoolExecutor` runs one thread — behaviour is byte-identical to pre-expansion. Observed in baseline run: ~6/31 queries fell back to original-only due to OpenAI API latency exceeding 3s; all produced valid results.

- **Stale baseline file trap** — First baseline run captured to terminal (not a file) then `cp ~/retrieval_baseline_results.txt ~/retrieval_baseline_post_query_expansion.txt` was executed, which copied the stale Apr-16 file. The diff returned empty (matching session 74 canonical exactly), creating a false impression of no change. File age via `stat` exposed the trap. Fix: re-run with `bash ~/retrieval_baseline.sh > ~/retrieval_baseline_post_query_expansion.txt`. KNOWN ISSUE `Stale baseline file gotcha` remains accurate.

- **Pre-condition checks passed** — `_qdrant_id` confirmed present at `hit_to_chunk` line 325 (`"_qdrant_id": str(hit.id)`) before Phase 4 apply. Per-future try/except loop required in Phase 2 diff (original list comprehension would have propagated a single leg exception and aborted the entire fan-out) — added before sign-off.

- **EXPANSION_SYSTEM prompt design** — Three-variant structure: one statutory, one practitioner-shorthand, one doctrinal/textbook. Three worked examples in prompt (hostile-witness, search-warrant, bail). Prompt instructs to preserve intent and not introduce doctrines not asked about. Produces diverse enough variants to bridge the practitioner↔statutory vocabulary gap that 7 corpus-side patches across sessions 75-76 could not close.

## CHANGES THIS SESSION (session 78) — 19 April 2026

- **subject_matter filter Part 3 deployed — Pass 2 case_chunk query now hard-filters on subject_matter ∈ {criminal, mixed}** — All three parts of the subject_matter filter feature are now complete: Part 1 (Worker route JOIN), Part 2 (poller metadata dict + re-embed), Part 3 (server.py MatchAny on Pass 2 Qdrant query). Two-line patch to `server.py`: (1) added `MatchAny` to the `qdrant_client.models` import on line 5; (2) appended `FieldCondition(key="subject_matter", match=MatchAny(any=["criminal","mixed"]))` to the Pass 2 `must` list alongside the existing `type=case_chunk` condition on line 513. Deploy verified: syntax clean, container force-recreated, `Nexus ingest server running on port 18789`. Test query "tendency evidence significant probative value test" returned zero civil/administrative case_chunks — [2024] TASSC 55 (Tasmania v GD, criminal) confirmed passing filter.

- **Citation authority agent Phase 1 — 233 authority-synthesis chunks generated and staged** — `scripts/build_authority_chunks.py` created: queries D1 `case_citations` (n≥5), pulls full citation graph and `authorities_extracted` via paginated query, extracts proposition strings per authority name, buckets treatments (followed/applied/approved/adopted, considered/discussed, distinguished/not followed), writes one `.md` file per authority to `scripts/authority-chunks-staging/`. Key constants: `SOURCE_TYPE='authority_synthesis'`, `MIN_CITATIONS=5`, `MAX_PROPS=15`, `MAX_CITING=25`. Script includes Phase 1 assertions (SOURCE_TYPE check, citation_id prefix check) and slug-collision suffix. Result: 233 chunks generated, zero assertion errors. Staged files are D1-and-Qdrant-clean until Phase 2c ingest.

- **Phase 2b — isolation filters deployed before any ingest (commit `a60fa1e`)** — Three changes so normal retrieval is blind to authority_synthesis type before any chunk is ingested: (1) `enrichment_poller.py` — `SYNTHESIS_TYPES = {'authority_synthesis'}` constant added at module level; secondary_sources embed metadata dict now routes `'type': (chunk.get('source_type') if chunk.get('source_type') in SYNTHESIS_TYPES else 'secondary_source')`. (2) `server.py` Pass 1 `must_not` — added `FieldCondition(key="type", match=MatchValue(value="authority_synthesis"))` alongside quarantine filter. (3) `server.py` Pass 3 `must_not` — same addition as safety belt (Pass 3 already strict via `must=[type=secondary_source]` but defence-in-depth). Both services force-recreated and smoke-tested. Grep confirms 3 `must_not` lines in server.py post-deploy. Phase 2c (ingest via upload-corpus) parked to next session.

- **Windows subprocess npx fix** — `build_authority_chunks.py` initial list-form `subprocess.run(['npx', ...])` raised `FileNotFoundError` on Windows because npx is a `.cmd` wrapper, not a `.exe`. Fixed by using string-form command with `shell=True` and escaping SQL double-quotes with `sql.replace('"', '\\"')`. List-form + `shell=True` was rejected because it mis-parses quoted SQL arguments on Windows cmd.

- **LF→CRLF git diff inflation** — commit `a60fa1e` (4-line logic change to enrichment_poller.py + server.py) showed 106 insertions / 10 deletions because SCP of VPS-edited files to Windows converts LF endings to CRLF, producing whitespace-only diffs on every unchanged line. Logic correct; cosmetic only. Added to KNOWN ISSUES with `.gitattributes` workaround.

- **D1 Sentencing Act gap confirmed** — `SELECT DISTINCT legislation_id FROM legislation_sections` returned no Sentencing Act 1997 (Tas) row. Q9 (guilty plea discount / s 11A) diagnosed as authoring gap, not retrieval defect. Deferred to post-scrape authoring pass alongside Q26. Added to KNOWN ISSUES and OUTSTANDING PRIORITIES.

## CHANGES THIS SESSION (session 79) — 20 April 2026

- **Phase 2c complete — 233 authority_synthesis chunks ingested clean across all six verification gates** — D1 collision check clean (0 pre-existing `authority-%` IDs); 233/233 rows written with `source_type='authority_synthesis'`, `enriched=1`, populated `raw_text`; Qdrant payload `type='authority_synthesis'` confirmed on two independent spot-checks at opposite ends of the alphabet (`authority-ab-v-the-queen`, `authority-attorney-general-v-b`), both showing correct `build_secondary_embedding_text()` vocabulary anchor prepend (`Key terms: ...`); poller auto-embedding without manual flag flip (climbed 7 → 50 → 95 → 233 over the session tail). Phase 2b isolation gate confirmed firing end-to-end — chunks blocked from Pass 1 / Pass 3 normal retrieval by the `must_not={type=authority_synthesis}` filter, reachable only via the yet-to-be-built Phase 3 Pass 4 leg.

- **New script `scripts/ingest_authority_chunks.py` — 61-line dedicated ingest path for authority-synthesis chunks** — reads each staged `.md` file as a single atomic chunk, regex-extracts `[CITATION:]` / `[TITLE:]` / `[CATEGORY:]` from metadata block, hardcodes `doc_type='authority_synthesis'` (since `build_authority_chunks.py` omits `[TYPE:]`), POSTs to `/api/legal/upload-corpus` with the Mozilla User-Agent spoof, supports `--limit N` flag for dry-run testing. Decision rationale (see CLAUDE_decisions.md): dedicated script chosen over (a) fixing `build_authority_chunks.py` to emit ingest-ready format + extending `ingest_corpus.py` for a third block type, because the staged files were structurally valid, regen would burn tokens, authority chunks are a genuinely distinct content type warranting their own ingest path, and blast radius stays minimal.

- **Material structural mismatch caught at recon — Phase 1 output did not match `ingest_corpus.py` format** — three independent issues: `[TYPE:]` field absent across all 233 files (would have left `source_type=null` and defeated the Phase 2b `SYNTHESIS_TYPES` gate); no `<!-- block_NNN -->` separator; metadata-before-heading order inverted. Caught by a single CC recon step (file heads + grep coverage counts) before any ingest fired. Logged as an optional cleanup item for `build_authority_chunks.py` — not blocking.

- **Learning — `handleUploadCorpus` now writes `enriched=1` on insert** — contradicting the `enriched=0` pattern documented in early-April conversation history. Worker was updated silently at some point. Means the originally-planned "post-insert D1 UPDATE to flip enriched" step was redundant; poller picked rows up immediately. Rule added to CLAUDE_decisions.md: don't over-trust conversation history for Worker/D1 state that mutates silently — when one MCP D1 query can settle the question, run it first.

- **Learning — Cloudflare Worker burst-token-bucket rate limit on bulk ingest** — at `DELAY_SEC=0.5` (120 req/min), Worker rate-limited clusters at request positions ~#49-53 and ~#148-161 (14/233 returned 429; cluster pattern consistent with burst bucket depletion, not sustained-rate limiting). Bumping to `DELAY_SEC=1.0` (60 req/min) cleared all 14 on retry with zero residual. Rule added to CLAUDE_init.md: bulk ingest scripts targeting `/api/legal/upload-corpus` use `DELAY_SEC=1.0` from the start.

- **Baseline numbers discrepancy flagged at session open — userMemories stale on retrieval baseline** — session-open prompt quoted "10P / 11P / 8M / 3 ungraded" (totals 32, not 31; matches session-51 frozen state in userMemories, not the current SYSTEM STATE `≥28P / ≤3Pa / 0M` from session 77). Flagged early; no downstream decisions landed on the stale figure. userMemories updates asynchronously — stale memory bleed is expected but worth catching when it appears in scope-setting.

## CHANGES THIS SESSION (session 80) — 20 April 2026

- **Phase 3 Citation authority agent — Pass 4 gate + retrieval leg deployed in shadow mode** — `should_fire_pass4(query_text) -> (bool, reason)` function in `server.py` with three independent gate rules: (1) keyword match against `AUTHORITY_KEYWORDS` list (treatment vocabulary, citation-profile vocabulary, judicial-treatment intent phrases, and narrow topical-authority phrases); (2) bare-citation lookup — query ≤60 chars AND ≥1 CITATION_REGEX match; (3) relationship intent — ≥2 citations in query. Pass 4 `query_points` block inserted after domain filter, before final sort+cap (lines 737–771 post-edit); uses `Filter(must=[type=authority_synthesis], must_not=[quarantined=True])` with `AUTHORITY_PASS_THRESHOLD=0.50`, `AUTHORITY_PASS_LIMIT=3`, `AUTHORITY_PASS_TIMEOUT_SEC=0.5` (ThreadPoolExecutor with 500ms timeout). Dedup against `seen_ids`. `AUTHORITY_PASS_ENABLED=false` by default — gate fires and logs `[Pass 4] gate=FIRE reason=... ENABLED=false (shadow)` but skips Qdrant query. Worker version 648207f6.

- **AUTHORITY_KEYWORDS finalised via D1 corpus scan** — corpus scan confirmed all 233 chunks are per-case citation profiles (Treatment section + Propositions for which cited + Citing cases), NOT topical aggregation chunks. "Leading authorities on X" style queries have weak chunk support — no ranking chunks exist, only per-case profiles mentioning propositions in passing. Keywords refined to focus on treatment vocabulary (followed by, applied in, distinguished in, etc.), judicial-treatment intent phrases (subsequent treatment, cases citing, etc.), and citation-profile vocabulary (citing cases, how often cited, citation profile). Narrow topical-authority phrases (leading authority on, leading case on, key authority on, authority on) retained but flagged for shadow-mode monitoring — cut before flag flip if false-positive FIRE rate is high on queries where Pass 1/2/3 already returns good doctrinal results. Broader phrases (leading authority, leading case, seminal case, landmark case, most cited, principal authority) dropped — no corpus support, would FIRE but retrieve weakly.

- **worker.js Phase 2 — Sol and V'ger updated for [AUTHORITY ANALYSIS] label** — Sol (`handleLegalQuery`): caseBlocks map now emits a four-way label switch (`[CASE EXCERPT]` / `[LEGISLATION]` / `[AUTHORITY ANALYSIS]` / `[ANNOTATION]`) as net-new label injection (Sol previously had no labels at all); default systemPrompt variant gets instruction sentence: "AUTHORITY ANALYSIS blocks summarise how Tasmanian courts have cited and treated a specific case — use them to describe subsequent treatment, citation frequency, and how the case has been applied or distinguished." V'ger (`handleLegalQueryWorkersAI`): existing binary ternary (`case_chunk → [CASE EXCERPT]`, else `[ANNOTATION]`) extended to three-way (`authority_synthesis → [AUTHORITY ANALYSIS]`); same instruction sentence added to default systemPrompt variant.

- **UI Phase 3 — amber AUTHORITY tag, Library badge, AuthorityPane** — `ResultCard.jsx`: `authority_synthesis` added to `TYPE_TAGS` (label: AUTHORITY, bg: `rgba(200,140,50,0.08)`, color: `#C88C32`); tag resolution extended to check `result.type` before `result.doc_type` (server.py search returns `type`, not `doc_type`). `Library.jsx` CorpusTable: amber AUTHORITY badge added inline with title when `r.court === 'authority_synthesis'` (source_type aliased as court by `handleLibraryList`); `r.court` subtitle suppressed for authority_synthesis rows. `ReadingPane.jsx`: branch added before CasePane dispatch — `if (selected.type === 'authority_synthesis')` renders new `AuthorityPane` component; AuthorityPane shows amber AUTHORITY header, citation/title, close button, and full `selected.text` or `selected.raw_text` in a scrollable pre-wrap block.

- **server.py local mirror synced** — VPS file downloaded to `Arc v 4/server.py` via hex-ssh ssh-download post-edit. `grep -c "must_not"` = 4 (3 Phase 2b isolation gates + 1 new Pass 4 gate), `grep -c "should_fire_pass4"` = 2, `grep -c "AUTHORITY_PASS"` = 9.

---

## END-OF-SESSION UPDATE PROCEDURE

Use this prompt at the end of every session to update CLAUDE.md and CLAUDE_arch.md. You must do all of the following — do not skip any step.

**1. Outstanding Priorities — reconcile, don't append**
- Read every item in the Outstanding Priorities list
- Cross-check each item against CHANGES THIS SESSION and any work completed this session
- For each item that is now complete: remove it entirely (do not leave it with a ✅ — delete the line)
- For each item that is partially progressed: update the status text in place
- Only then add new outstanding items for work that opened this session

**1b. KNOWN ISSUES — prune and update**
- Remove any entry the session changelog shows as resolved
- Update any entry where the status has partially changed (e.g. one sub-issue fixed, another remains)

**2. SYSTEM STATE table — refresh all counts**
- Re-query or update every numeric value in the SYSTEM STATE table to reflect current actuals
- Do not leave stale counts from a previous session

**3. File header datestamp — update it**
- Change the "Updated:" line at the top of CLAUDE.md to today's date and current session number
- Update the datestamp in CLAUDE_arch.md header too

**4. CHANGES THIS SESSION — write the new block as normal**
- Add the session block with what + why for each change

**5. Verify before finishing**
- Read back the Outstanding Priorities list after your edits
- Confirm no completed item remains in the list
- Confirm no resolved KNOWN ISSUE remains
- Confirm the datestamp is updated
- Confirm SYSTEM STATE counts are current

**Do not treat this as an append operation.** The Outstanding Priorities list and KNOWN ISSUES must reflect reality after this session, not accumulate history.

---

## POLLER DEPLOY VALIDATION PROCEDURE

Use this checklist for any enrichment_poller.py change that affects Qdrant payloads or embed text. Two past fixes were documented as deployed but never reached the VPS — this procedure prevents recurrence.

**DEPLOY**
1. SCP `enrichment_poller.py` to VPS (see SCP rule above)
2. Grep VPS file for changed lines: `grep -n "<changed pattern>" /home/tom/ai-stack/agent-general/src/enrichment_poller.py`
3. `docker compose restart enrichment-poller` — restart the container so the running process reloads the file (the bind mount makes the file visible; only a restart loads it into the process)
4. Verify container start time is AFTER file mtime:
   - `stat /home/tom/ai-stack/agent-general/src/enrichment_poller.py | grep Modify`
   - `docker inspect ai-stack-enrichment-poller-1 --format '{{.State.StartedAt}}'`
   - Container start time must be after file mtime. If not, stop — the running container has old code.
5. `docker compose logs --tail=10 enrichment-poller` — confirm clean start, no import errors

**RESET** (only after steps 1–5 confirmed)

6. Run the `UPDATE ... SET embedded=0` D1 query
7. `SELECT COUNT(*) as pending FROM <table> WHERE embedded=0` — confirm count matches expectation exactly

**MONITOR**

8. `docker compose logs --tail=30 enrichment-poller` — watch first batch; confirm new fields appear in log output (add `log.info` debug line to new field before deploying)
9. After first batch: Qdrant scroll spot-check 3–5 points — confirm new fields are present and non-empty in payload
10. After all batches complete: `SELECT COUNT(*) as pending FROM <table> WHERE embedded=0` — must be 0 (if non-zero, some rows silently failed and won't retry)

**Key failure modes to guard against:**
- Reset before restart — the poller picks up embedded=0 rows with old code, re-embeds with stale metadata, marks embedded=1, window is gone
- Grep passes but process is stale — file on disk is correct but container hasn't restarted; check start time vs mtime
- Silent partial failure — embedded count non-zero after "complete" means some rows failed all Qdrant verify attempts and stayed embedded=0; check for `⚠ Point not found` warnings in logs

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

**Note:** Baseline rerun required after chunk cleanup completes and poller re-embeds.

---
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                