@CLAUDE_arch.md

CLAUDE.md — Arcanthyr Session File
Updated: 21 April 2026 (end of session 88) · Supersedes all prior versions
Full architecture reference → CLAUDE_arch.md — UPLOAD EVERY SESSION alongside CLAUDE.md
Changelog archive → CLAUDE_changelog.md (sessions 21–85) — load conditionally

---

## SYSTEM STATE — 21 April 2026 (end of session 87)

| Component | Status |
|---|---|
| Qdrant general-docs-v2 | 28,876 points · RE-EMBED COMPLETE — vocabulary anchor prepend deployed, all case chunks embedded; 233 authority_synthesis chunks added session 79 |
| D1 cases | 1,914 (scraper running) · 1,913 deep_enriched=1 · 1 stuck |
| D1 case_chunks | 26,051 total · embedded=0: 17 (all header chunks, null enriched_text — permanently excluded by design; effective backlog: 0) |
| D1 secondary_sources | 1,437 total (233 authority_synthesis added session 79) · embedded=0: 12 (10 s38 EA chunks re-queued for re-embed session 88 after CONCEPTS prepend; 2 orphaned Nexus saves) |
| D1 case_chunks_fts | 26,034 rows — 1:1 match with D1 case_chunks where enriched_text IS NOT NULL · 194 duplicate rows deleted session 75 · root cause fixed Worker e5934624 (DELETE-then-INSERT upsert) |
| D1 query_log | Active — answer_text + model columns added session 69, deleted soft-delete column added |
| D1 quarantined_chunks | 253 rows · Qdrant quarantined=true flag LIVE on all 253 points · server.py must_not filter LIVE on all four passes (Pass 1, Pass 2, Pass 3, Pass 4) |
| Pass 4 / Citation authority agent | LIVE — `AUTHORITY_PASS_ENABLED=true` in `~/ai-stack/.env.config` · keyword list calibrated session 81 (3 false-positive topical phrases removed, 10 passive-voice forms added) · Worker version 57719d21 |
| D1 synthesis_feedback | 0 rows · route wired session 68 (POST /api/pipeline/feedback) |
| D1 case_citations | 6,959 rows |
| D1 case_legislation_refs | 5,147 rows · source_url backfilled for 5 Acts (Evidence, Criminal Code, Justices, Misuse of Drugs, Police Offences) |
| enrichment_poller | RUNNING — 10 s38 EA chunks pending re-embed (CONCEPTS prepend session 88); otherwise all at embedded=1 |
| Cloudflare Queue | drained |
| Scraper | COMPLETE — corpus stable at 1,914 cases (back to 2005), count unchanged from session 81 close; scraper.log check confirmed no new cases |
| arcanthyr.com | Live |
| Subject matter filter | LIVE · SM_PENALTY=0.65 · LEG_WHITELIST_CORE + LEG_WHITELIST_ADJACENT + keyword bridge LIVE · Domain filter UI LIVE · Pass 2 MatchAny criminal/mixed hard filter LIVE (all three parts complete) |
| Stare decisis UI | LIVE |
| Save to Nexus | LIVE — approved column, approval gate, pending review in Library, delete action (D1+FTS5+Qdrant cleanup) |
| Query history | LIVE — answer_text + model stored per query, side panel on Research page, click-to-view, Save to Nexus / Delete per entry |
| Baseline (31 queries) | ≥28P / ≤3Pa / 0M — query expansion deployed session 77 (19 Apr 2026) · Q12 MISS→PASS (s38 EA chunk #1 @ 0.6759) · Q23 MISS→PASS (secondary-chunk-12 #3 @ 0.6697) · zero P→M regressions · exact count pending Tom's manual review of Q7/Q14/Q15 · new snapshot `~/retrieval_baseline_post_query_expansion.txt` · session 74 canonical `~/retrieval_baseline_post_interleave.txt` retained as prior reference · generic `~/retrieval_baseline_results.txt` still Apr 16, do not grep |
| procedure_notes | 319 success / ~340 not_sentencing |
| auslaw-mcp | RUNNING on VPS — digest-pinned `sha256:480e8968...`, isolated network `auslaw-mcp_auslaw-isolated`, 10 tools via Windows Claude Code (user-scope `auslaw`) · (b)(c)(d) hardening complete session 88 · search_cases dead (VPS TCP-blocked by AustLII) · two-step search pattern documented |
| BM25 case_chunks_fts | LIVE — interleave mode, split-constant design: BM25_SCORE_KEYWORD=0.0139 (boost path, additive) · BM25_INTERLEAVE_SCORE=0.50 (novel-hit path, competes with borderline semantic) · SM_PENALTY retained (0.50×0.65=0.325 suppresses SM-mismatched novel hits) |
| Sentencing Act 1997 (Tas) | 147 sections ingested · legislation_sections populated · poller [LEG] pass pending embed · source_url populated · legislation table source_url now populated for Sentencing Act + 5 backfilled Acts |

---

## OUTSTANDING PRIORITIES

2. **Post-scrape authoring pass** — Q9 (guilty plea discount — common law doctrine, no Tasmanian statutory provision; requires secondary source authoring) and Q26 (unreasonable verdict / M v The Queen) diagnosed this session as authoring gaps but deferred until scrape-complete. Further MISS/Partial triage deferred to post-scrape baseline re-run.

3. **Q14 diagnostic — why is s 37 EA not in top 3?** — Live Q14 ("leading questions examination in chief") returns [2021] TASSC 4 Hefny v Barnes at #1 (0.50), Hofer/TASCCA 11 cross-examination at #2/#3. s 37 EA legislation chunk exists in corpus but not surfacing. Not a vocabulary mismatch ("leading questions" is both statutory and practitioner term). Hypothesis: case-application chunks outscoring legislation chunk on semantic density. Diagnosis task: check s 37 EA chunk's vocabulary anchor, check whether it's being returned at any position in top 12, check whether it's being SM-penalised incorrectly. If chunk is fine but ranking is wrong, may need doctrinal authoring (practice note on leading-questions-in-chief technique) rather than retrieval tuning.

6. **Quick Search tab — COMPLETE** — All five phases delivered. Phase 3 (Jade link button, `buildJadeUrl` using AustLII-style path `jade.io/au/cases/tas/COURT/YEAR/NUM`), Phase 4 (`query_log` `search_type` column, word-search queries now logged), Phase 5 (full-judgment fetch + `austlii_cache` D1 table, 30-day TTL, inline viewer with `dangerouslySetInnerHTML`, CF-edge fetch direct). All verified via browser automation session 86.

---

## KNOWN ISSUES / WATCH LIST

- **Q9 (guilty plea discount) — common law only, no Tasmanian statute** — confirmed session 82: Tasmania has no codified guilty plea discount provision in the Sentencing Act 1997 (unlike NSW s 22 CSPA or Vic s 5(2)(e)). Sentencing Act now ingested (147 sections). Q9 fix requires secondary source authoring on Tasmanian common law discount methodology, not legislation upload.
- **SCP/CRLF file truncation — HARDENED (session 84)** — Three tracked files truncated mid-statement in s82 commit `107bd96`; Worker.js git record additionally wrong in s83 commit `1e6fb23` (truncated version committed, correct version only on Cloudflare). Session 84 mitigations deployed: `.gitattributes` pins LF on checkout; pre-commit hook runs `@babel/parser` on staged JS/JSX (bash, null-separated loop — space-safe for `Arc v 4/` paths); `npm run build` is pre-deploy gate; Worker.js git record fixed `853a56d`. VPS files (server.py, enrichment_poller.py) outside git — continue to prefer hex-ssh over plain SCP for round-trips.
- **`node --check` false-pass — RETIRED** — Session 83: false-passed on truncated worker.js (exit 0, file cut at `pass1.judge ||`). Session 84: `node --check` retired from SESSION RULE; `npm run build` is now the pre-deploy gate; `@babel/parser` pre-commit hook catches JS/JSX parse errors at commit time.
- **Corpus ... placeholders — 3 of 5 resolved** — part1.md:1282 and part2.md:2415 confirmed as legal elisions (not errors) · part2.md:381 `T...` fixed to `The` · remaining 2 genuine gaps: part2.md:1167 block_023 (`...BUT see below` dangling ref) and part2.md:1957 block_028 (`[Continues with specifics...]` placeholder) — both need source material from rag_blocks/, deferred to Procedure Prompt re-ingest
- **Synthesis deduplication loose** — "4-8 principles" instruction not tight enough · spot-check produced 4 principles from 2 ideas (redundant restatements) · not a blocker for retrieval (embeddings match correctly) · note for Pass 2 prompt quality review on roadmap
- **CONCEPTS-adjacent vocabulary contamination** — session 46 CONCEPTS strip removed semantic disambiguation from secondary source body text · chunks about police-powers (George v Rockett, Samoukovic v Brown, prescribed belief) and honest/reasonable mistake defence have body text vocabulary (reasonable/belief/proof/standard/certainty) that overlaps with BRD queries · 6 chunks fixed session 51 with domain anchor sentences · monitor as new chunks are ingested — same pattern will recur for any chunk discussing "reasonable" belief/assessment in a non-BRD context
- **Bulk requeue race condition** — firing >500 simultaneous CHUNK messages causes GPT-4o-mini rate limit exhaustion and merge race conditions · always use batched approach (limit=250) for bulk requeue operations · never reset all chunks simultaneously
- **Never reset enriched=0 on all cases** — this triggers full Pass 1 + chunk re-split + CHUNK re-processing for all cases · use `requeue-merge` (synthesis-only) or `requeue-chunks` (chunk-only) for targeted operations
- **fetch-case-url vs upload-case** — URL-based ingestion must use `POST /api/legal/fetch-case-url` · `upload-case` is for direct text upload only · posting {url} to upload-case crashes on citation.match(undefined)
- **subject_matter audit — COMPLETE session 89** — Full misclassification audit run: all subject_matter != 'criminal' cases with criminal party name patterns (R v, Tasmania v, Police v). 11 rows returned, 0 genuine misclassifications found — Pilling entries correctly administrative (workers comp); R v [Tribunal] entries correctly administrative (judicial review); three bare R v [surname] entries (Trustrum, Holman, Haley) confirmed civil contempt proceedings. Rattigan classification corrected to criminal session 89. Audit clean — safe to proceed with Option A Qdrant re-embed when ready.
- **update-secondary-raw silent success — FIXED session 89** — Handler was returning { ok: true, updated: 0 } when the UPDATE matched zero rows instead of a proper 404. Fixed to return HTTP 404 { ok: false, error: "not found" } on meta.changes === 0. Route works correctly when id is sourced from the fetch-secondary-raw API response. The original KNOWN ISSUES diagnosis (spaces in IDs causing routing failure) was incorrect — the 404s during session 88 were from hand-typed ID mismatches during manual testing.
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
- **Qdrant court field frequently empty on case_chunk payloads** — `court: ""` confirmed on case_chunk results via Playwright fiber inspection sessions 80–81. Mapper fix (session 81) now passes `type` through, so `authority_synthesis` renders amber AUTHORITY and `case_chunk` renders raw type string as fallback label — court-based tags (SC/MC/CCA) still require non-empty court field from Qdrant. Investigate whether scraper writes court into Qdrant payload at ingest or only D1 `cases.court`.
- **TYPE_TAGS key mismatch for secondary sources** — `TYPE_TAGS["secondary"]` in ResultCard.jsx but actual type value from server.py is `"secondary_source"`. Secondary source cards show raw `"secondary_source"` label instead of `"CORPUS"`. Fix: add `"secondary_source"` as alias key in TYPE_TAGS. Low priority — cosmetic only.
- **Parliament.tas.gov.au bill page URLs — slug format unresolvable from Act number** — `billPageUrl` in `handleAmendments` cannot construct a direct bill page URL because parliament.tas.gov.au uses title-derived slugs (e.g. `/bills/bills2025/justice-miscellaneous-reporting-procedures-bill-2025-10-of-2025`) not numeric paths. Current workaround: "Locate Hansard ↗" button links to `google.com/search?q=site:parliament.tas.gov.au+"N+of+YYYY"`. Proper fix requires fetching the year index page and matching by bill number — deferred.

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
| TAMagC on AustLII | TAMagC cases exist on AustLII but the court is subject to outages · if scraper returns all 404s for a TAMagC year, check AustLII manually before marking as no data · do not assume structural absence · VPS is TCP-blocked by AustLII at network level — Contabo IP range silently dropped (confirmed session 85, re-confirmed session 88) |
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
| worker.js syntax check | Do NOT use `node --check` — false-passes on truncated files (session 83, confirmed). After any CC edit to worker.js, use `npm run build` from `arcanthyr-ui/` (rolldown pass catches all JS parse errors) before `wrangler deploy`. Pre-commit hook runs `@babel/parser` on staged `.js`/`.jsx` files automatically (added session 84). |
| truncation_log table | D1 table tracking cases truncated on upload · columns: id, citation, original_length, truncated_to, source, status, date_truncated, date_resolved · status values: flagged/confirmed/replaced · `GET /api/pipeline/truncation-status` (no auth) returns flagged entries · `POST /api/pipeline/truncation-resolve` (X-Nexus-Key) for confirm/delete actions |
| docker compose port interpolation | ${VAR} in ports mapping is interpolated at parse time from .env only — env_file: does NOT apply · hardcode invariant ports directly in docker-compose.yml |
| Session health check | At session start, if `$TEMP\arcanthyr_health.txt` exists, read it and summarise corpus state (total cases, enrichment queue depth, embedding backlog) before doing anything else |
| Truncation tolerance | CLAUDE.md is structured with operational content (state, priorities, rules) in the first ~300 lines. History and procedures at the tail tolerate truncation — they exist as in-session reference, not session-start-critical context |
| auslaw-mcp search pattern | search_cases is dead from VPS (AustLII TCP block) · for topic-based discovery in CC/Cowork sessions: (1) POST https://arcanthyr.com/api/legal/word-search with X-Nexus-Key header to get citations; (2) feed citations to auslaw-mcp search_by_citation for full text |
| CLAUDE_changelog.md | Load when investigating a past session's changes, debugging a regression to a specific date, or when referencing work from sessions older than the 3-session retention window |

**Tooling:**
- Claude.ai — architecture, planning, debugging, writing CLAUDE.md, code review
- Claude Code (VS Code) — file edits, terminal commands, git, wrangler deploys
- PowerShell / SSH — VPS runtime commands, long-running Python scripts

---

## CHANGES THIS SESSION (session 86) — 20 April 2026

- **Phase 3: Jade link button** — Added `buildJadeUrl()` to `Library.jsx`; initial URL used `/article/search` path (500 error); fixed to AustLII-style path `jade.io/au/cases/tas/COURT/YEAR/NUM` confirmed via browser test; verified via JS href inspection
- **Phase 3 URL bug** — `/article/search?query=` returns 500 on Jade; correct format is `https://jade.io/au/cases/tas/TASSC/YEAR/NUM` (AustLII path with different domain); discovered by live browser test during session
- **Phase 4: `search_type` column** — `ALTER TABLE query_log ADD COLUMN search_type TEXT`; both `handleLegalQuery` paths updated to `'semantic'`; `handleWordSearch` and `handleAustLIIWordSearch` now log with `'word_search'` / `'austlii_word_search'`; verified via D1 GROUP BY query
- **Phase 5: `austlii_cache` table + judgment fetch** — New D1 table (`url PK, citation, html, fetched_at`); `handleFetchJudgment` Worker route (`GET /api/legal/fetch-judgment`); CF-edge fetch with browser-mimicking headers (VPS IP blocked); 30-day TTL cache-first logic; upsert on stale
- **Phase 5: inline judgment viewer** — `AustLIIResultsTable` rewritten with per-row `loadingMap`/`htmlMap` state; `extractJudgmentBody()` strips scripts/styles/nav/forms/images; `dangerouslySetInnerHTML` render in 600px serif pane; "Read ↓ / Close ↑ / Loading…" toggle; verified rendering live
- **Phase 5 unwrap bug** — `fetchJudgment` in `api.js` read `data.ok/data.html` directly; fixed to `data.result ?? data` per standard `/api/legal/` wrapper pattern; error contract changed to throw-on-error
- **Jade auth behaviour** — Login prompt on first click is browser-session behaviour only; once logged into Jade in Chrome the session persists; no automation needed or appropriate

---

## CHANGES THIS SESSION (session 87) — 21 April 2026

- **Legislative Amendment History feature** — new Worker routes `GET /api/legal/amendments?act=act-YYYY-NNN` (fetches CCL projectdata API, 30-day D1 cache in `tbl_amendment_cache`) and `GET /api/legal/resolve-act?name=...` (Act name → actId, writes `source_url` back to `legislation` table on first resolution)
- **AmendmentPanel.jsx** — collapsible panel showing full amendment timeline for any Tasmanian Act; Principal Act pinned with blue badge; per-amendment action button; lazy-loads on first expand; commit `f97a53e`
- **Feature relocated to Legislation tab** — removed from case reading pane (legislation_extracted restored to plain list); wired into LegislationTable as inline detail panel on row click; `actIdFromSourceUrl()` parses act-YYYY-NNN from source_url; `handleLibraryList` updated to include source_url in legislation SELECT; commit `7634fa2`
- **"Locate Hansard ↗" button** — replaced broken direct slug links with `google.com/search?q=site:parliament.tas.gov.au+"N+of+YYYY"` after confirming parliament.tas.gov.au migrated to slug-based URLs incompatible with numeric construction; button relabelled from "Second reading ↗"; commit `c0e277f`
- **source_url backfill** — 5 priority Acts updated in `legislation` table: Evidence Act 2001 (`act-2001-076`), Criminal Code Act 1924 (`act-1924-069`), Justices Act 1959 (`act-1959-077`), Misuse of Drugs Act 2001 (`act-2001-094`), Police Offences Act 1935 (`act-1935-044`)
- **Self-healing resolution** — `resolve-act` route writes `source_url` back to D1 on first use; new Acts added to corpus require no manual backfill; resolve-act is primary path, source_url is cache acceleration

---

## CHANGES THIS SESSION (session 88) — 21 April 2026

- **s38 EA CONCEPTS hygiene complete** — 10 `Evidence Act 2001 (Tas) s 38 -` secondary source chunks prepended with `[CONCEPTS:]`, `[TOPIC:]`, `[JURISDICTION:]` headers via direct D1 updates (bypassed broken `update-secondary-raw` Worker route); all 10 reset to `embedded=0` for poller re-embed; Bucket 2 item struck from OUTSTANDING PRIORITIES
- **auslaw-mcp docker hardening complete** — `mem_limit: 1g`, `cpus: '1.0'`, `read_only: true`, `tmpfs: [/tmp]` applied to `~/auslaw-mcp/docker-compose.yaml`; write-path check confirmed only `/tmp` used (OCR via `tmp.fileSync()` in `fetcher.ts`); container force-recreated cleanly
- **auslaw-mcp GitHub MCP (item d) resolved** — existing user-scope `github` MCP in `~/.claude.json` already satisfies requirement; no new config needed; verified via `mcp__github__get_file_contents` on `russellbrenner/auslaw-mcp`
- **auslaw-mcp hardening entry removed** — all four sub-items resolved: (a) confirmed moot — VPS TCP-blocked by AustLII at network level, `/fetch-page` cannot reach AustLII regardless; (b)(c)(d) done this session
- **VPS/AustLII TCP block confirmed and documented** — curl confirmed SYN to `austlii.edu.au:443` silently dropped from Contabo VPS (exit 28, timeout, HTTP 000); session 35 "not blocked" finding retired; canonical answer now documented; `search_cases` KNOWN ISSUES entry root cause corrected
- **Two-step auslaw-mcp search pattern documented** — `search_cases` dead from VPS; canonical CC/Cowork pattern: `POST /api/legal/word-search` for citation discovery → `search_by_citation` for full text fetch; added to SESSION RULES
- **Stale horizon items reconciled** — citation authority agent (now Pass 4, live), AustLII MCP integration (superseded by Quick Search tab + auslaw-mcp), subject_matter filter (all three parts complete) confirmed done; memory updated

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