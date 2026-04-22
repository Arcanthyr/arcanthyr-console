@CLAUDE_arch.md

CLAUDE.md — Arcanthyr Session File
Updated: 22 April 2026 (end of session 93) · Supersedes all prior versions
Full architecture reference → CLAUDE_arch.md — UPLOAD EVERY SESSION alongside CLAUDE.md
Changelog archive → CLAUDE_changelog.md (sessions 21–90) — load conditionally

---

## SYSTEM STATE — 21 April 2026 (end of session 87)

| Component | Status |
|---|---|
| Qdrant general-docs-v2 | 28,876 points · RE-EMBED COMPLETE — vocabulary anchor prepend deployed, all case chunks embedded; 233 authority_synthesis chunks added session 79 |
| D1 cases | 1,914 (scraper running) · 1,913 deep_enriched=1 · 1 stuck |
| D1 case_chunks | 26,051 total · embedded=0: 17 (all header chunks, null enriched_text — permanently excluded by design; effective backlog: 0) |
| D1 secondary_sources | 1,448 total (Q9 guilty plea discount chunk, Q26 unreasonable verdict chunk, Q14 s37 EA doctrine chunk added session 90) · embedded=0: 3 (nexus-save entries only — all corpus chunks embedded) |
| D1 case_chunks_fts | 26,034 rows — 1:1 match with D1 case_chunks where enriched_text IS NOT NULL · 194 duplicate rows deleted session 75 · root cause fixed Worker e5934624 (DELETE-then-INSERT upsert) |
| D1 query_log | Active — answer_text + model columns added session 69, deleted soft-delete column added |
| D1 quarantined_chunks | 253 rows · Qdrant quarantined=true flag LIVE on all 253 points · server.py must_not filter LIVE on all four passes (Pass 1, Pass 2, Pass 3, Pass 4) |
| Pass 4 / Citation authority agent | LIVE — `AUTHORITY_PASS_ENABLED=true` in `~/ai-stack/.env.config` · keyword list calibrated session 81 (3 false-positive topical phrases removed, 10 passive-voice forms added) · Worker version 57719d21 |
| D1 synthesis_feedback | 0 rows · route wired session 68 (POST /api/pipeline/feedback) |
| D1 case_citations | 6,959 rows |
| D1 case_legislation_refs | 5,147 rows · source_url backfilled for 5 Acts (Evidence, Criminal Code, Justices, Misuse of Drugs, Police Offences) |
| enrichment_poller | RUNNING — Stage 3 legislation embed complete (all 8 Acts embedded=1) · corpus secondary source backlog clear |
| Cloudflare Queue | drained |
| Scraper | RUNNING — active year entries reset (TASSC/TASCCA/TASFC/TASMC 2026 deleted from progress.json, next run re-scrapes) · TASMC 2026 added to COURT_YEARS scope · INSERT OR IGNORE prevents duplicates |
| arcanthyr.com | Live |
| Subject matter filter | LIVE · SM_PENALTY=0.65 · LEG_WHITELIST_CORE + LEG_WHITELIST_ADJACENT + keyword bridge LIVE · Domain filter UI LIVE · Pass 2 MatchAny criminal/mixed hard filter LIVE (all three parts complete) |
| Stare decisis UI | LIVE |
| Save to Nexus | LIVE — approved column, approval gate, pending review in Library, delete action (D1+FTS5+Qdrant cleanup) |
| Query history | LIVE — answer_text + model stored per query, side panel on Research page, click-to-view, Save to Nexus / Delete per entry |
| Baseline (31 queries) | ≥28P / ≤3Pa / 0M — query expansion deployed session 77 (19 Apr 2026) · Q12 MISS→PASS (s38 EA chunk #1 @ 0.6759) · Q23 MISS→PASS (secondary-chunk-12 #3 @ 0.6697) · zero P→M regressions · exact count pending Tom's manual review of Q7/Q14/Q15 · new snapshot `~/retrieval_baseline_post_query_expansion.txt` · session 74 canonical `~/retrieval_baseline_post_interleave.txt` retained as prior reference · generic `~/retrieval_baseline_results.txt` still Apr 16, do not grep |
| procedure_notes | 319 success / ~340 not_sentencing |
| auslaw-mcp | RUNNING on VPS — digest-pinned `sha256:480e8968...`, isolated network `auslaw-mcp_auslaw-isolated`, 10 tools via Windows Claude Code (user-scope `auslaw`) · (b)(c)(d) hardening complete session 88 · search_cases dead (VPS TCP-blocked by AustLII) · two-step search pattern documented |
| BM25 case_chunks_fts | LIVE — interleave mode, split-constant design: BM25_SCORE_KEYWORD=0.0139 (boost path, additive) · BM25_INTERLEAVE_SCORE=0.50 (novel-hit path, competes with borderline semantic) · SM_PENALTY retained (0.50×0.65=0.325 suppresses SM-mismatched novel hits) |
| Legislation anchor | LIVE — vocabulary anchor prepend deployed in poller [LEG] pass (session 90) · format: Key terms: {act_title}; s {section_number} {heading}. · Stage 1 (EA 245) + Stage 2 (CC 468, MDA 253, JA 163, POA 143) complete · Stage 3 (SA 147, YJA 216, JR 96) complete · future legislation uploads anchor automatically · legislation.embedded is canonical backlog gate — legislation_sections.embedding_model unreliable for Stage 1+2 sections |

---

## OUTSTANDING PRIORITIES

1. **Retrieval recall defect — direct-match misses** — Q2 ("sentencing guilty plea discount") fails to surface Dunning [2018] TASCCA 21 chunk 10 and Dunne [2021] TASCCA 5 chunk 3 despite both containing explicit "20% discount" content (deep_enriched=1, chunks embedded=1). Q5 ("right to silence direction jury") persistently fails to surface Lambert and Stokes [2007] TASSC 76 chunk 18 on two consecutive runs despite verbatim right-to-silence content. Not patch-caused — retrieval runs before synthesis. Requires VPS-side Qdrant probe: direct scroll against query vectors, score inspection on known-good chunks, identify whether root cause is query expansion fan-out dilution, BM25 interleave crowding, or score threshold floor.

2. **Q9 secondary source chunk — authoring debt** — Session 90 authoring note claimed "no confirmed TASCCA quantum authority" for guilty plea discount. D1 audit session 93 confirms Dunning [2018] TASCCA 21 and Dunne [2021] TASCCA 5 are both direct 20% quantum TASCCA authorities. Rewrite Q9 chunk to cite them as controlling Tasmanian quantum authorities.

3. **V'ger [LEGISLATION] label fix (edit E from s93 plan)** — V'ger context serialisation omits the [LEGISLATION] label (worker.js ~L2880 does not check for legislation type); affects section-query responses via V'ger toggle. Sol correctly tags legislation chunks; V'ger drift is functional. Scoped as separate-session task to isolate regression attribution.

---

## KNOWN ISSUES / WATCH LIST

- **SCP/CRLF file truncation — HARDENED (session 84)** — Three tracked files truncated mid-statement in s82 commit `107bd96`; Worker.js git record additionally wrong in s83 commit `1e6fb23` (truncated version committed, correct version only on Cloudflare). Session 84 mitigations deployed: `.gitattributes` pins LF on checkout; pre-commit hook runs `@babel/parser` on staged JS/JSX (bash, null-separated loop — space-safe for `Arc v 4/` paths); `npm run build` is pre-deploy gate; Worker.js git record fixed `853a56d`. VPS files (server.py, enrichment_poller.py) outside git — continue to prefer hex-ssh over plain SCP for round-trips.
- **`node --check` false-pass — RETIRED** — Session 83: false-passed on truncated worker.js (exit 0, file cut at `pass1.judge ||`). Session 84: `node --check` retired from SESSION RULE; `npm run build` is now the pre-deploy gate; `@babel/parser` pre-commit hook catches JS/JSX parse errors at commit time.
- **Synthesis deduplication — tightened session 91** — DEDUPLICATION RULES block in `performMerge()` replaced. Four old bullets (including weak "near-synonymous" grouping cue) replaced with four new ones: (1) pre-generation concept grouping with explicit legal distinctness test (same rule + same provision/doctrine required to merge — tendency/coincidence example embedded); (2) nuance preservation rule (prefer formulation with statutory reference and named authority); (3) one principle per distinct concept; (4) output fewer than 3 if genuine distinct rules number fewer than 3. Forward-only — existing D1 rows unaffected.
- **CONCEPTS-adjacent vocabulary contamination** — session 46 CONCEPTS strip removed semantic disambiguation from secondary source body text · chunks about police-powers (George v Rockett, Samoukovic v Brown, prescribed belief) and honest/reasonable mistake defence have body text vocabulary (reasonable/belief/proof/standard/certainty) that overlaps with BRD queries · 6 chunks fixed session 51 with domain anchor sentences · monitor as new chunks are ingested — same pattern will recur for any chunk discussing "reasonable" belief/assessment in a non-BRD context
- **Bulk requeue race condition** — firing >500 simultaneous CHUNK messages causes GPT-4o-mini rate limit exhaustion and merge race conditions · always use batched approach (limit=250) for bulk requeue operations · never reset all chunks simultaneously
- **Never reset enriched=0 on all cases** — this triggers full Pass 1 + chunk re-split + CHUNK re-processing for all cases · use `requeue-merge` (synthesis-only) or `requeue-chunks` (chunk-only) for targeted operations
- **fetch-case-url vs upload-case** — URL-based ingestion must use `POST /api/legal/fetch-case-url` · `upload-case` is for direct text upload only · posting {url} to upload-case crashes on citation.match(undefined)
- **legislation.embedded is canonical embed gate** — `legislation_sections.embedding_model` is unreliable for Stage 1+2 sections (embedded before that column was being written by the poller). Do not use section-level column as backlog indicator. Correct query: `SELECT title, embedded FROM legislation` — Act-level flag is authoritative. The 1,731 `embedding_model IS NULL` count seen session 90 is noise, not backlog.
- **Synthesis feedback loop — parked** — build plan exists at `SYNTHESIS_FEEDBACK_LOOP_BUILD_PLAN.md`, `approved` column on `secondary_sources` exists (session 68), `POST /api/pipeline/feedback` route live (session 68). Steps 2–9 unbuilt. Decision session 90: park until corpus growth stabilises. Rationale: corpus still growing, six-file build non-trivial for current value, saved answers would be superseded by better source material. Revisit when scraper is no longer adding large batches regularly.
- **update-secondary-raw silent success — FIXED session 89** — Handler was returning { ok: true, updated: 0 } when the UPDATE matched zero rows instead of a proper 404. Fixed to return HTTP 404 { ok: false, error: "not found" } on meta.changes === 0. Route works correctly when id is sourced from the fetch-secondary-raw API response. The original KNOWN ISSUES diagnosis (spaces in IDs causing routing failure) was incorrect — the 404s during session 88 were from hand-typed ID mismatches during manual testing.
- **FTS5 backfill complete** — 1,171 rows · session 13
- **CHUNK prompt reasoning field** — added and reverted session 10 · do not re-add
- **Qwen3 /query endpoint timeout** — server.py Qwen3 inference times out when scraper hammering Ollama · not a problem for UI (uses Claude API primary)
- **Workers AI content moderation** — Qwen3 blocks graphic evidence · CHUNK enrichment on GPT-4o-mini · Pass 1/Pass 2 still on Workers AI — monitor
- **Word artifact noise** — 131 chunks cleaned 18 Mar 2026 · re-run gen_cleanup_sql.py if new Word-derived chunks ingested
- **FTS5 export limitation** — wrangler d1 export does not support virtual tables
- **Scraper no per-case resume — known limitation** — progress file stores only `court_year: "done"`; mid-year failure restarts full year scrape. Harmless due to `INSERT OR IGNORE`. Per-case checkpointing not worth engineering effort at current stage.
- **Pass 2 principles irrelevant / merge overwrite — acknowledged, no fix** — Qwen3 Pass 2 extracts case-level `principles_extracted` but CHUNK handler (GPT-4.1-mini) overwrites this field with chunk-level data; merge uses chunk-level output only; Pass 2 principles never surface to user. Not causing visible defect — merge works correctly off chunk data. No fix planned.
- **Synthesis skip on null enriched_text** — performMerge synthesis call requires enrichedTexts.length > 0 · cases whose chunks have null enriched_text fall back to raw principle concatenation (old format)
- **Health check false positive (tendency evidence contradiction)** — "Tendency Evidence Exclusion in Bail Hearings" vs "Tendency Evidence Requirements and Admissibility" flagged as contradiction by GPT-4o-mini health check. Not a genuine contradiction — s 94 EA correctly exempts bail proceedings from tendency/coincidence rules; the two chunks describe different contexts. Resolved by s94 chunk ingested session 71. Monitor in next health check run.
- **/search top_k=12 server-side cap** — server.py line 296 hard-caps at 12 regardless of requested top_k. Cap retained for latency bounding. With query expansion live (4 fan-out queries), the merged Pass 1 pool is larger but still capped at top_k*2 per leg — monitor for cases where the cap is discarding strong results. Confirmed session 76: passing `"top_k": 12` in the request payload breaks the endpoint (returns 0 chunks) — the field is not accepted; omit it, default 6 is what the baseline script uses.
- **Q27 (provocation) confirmed as corpus content gap** — provocation defence was abolished in Tasmania 2003; corpus correctly sparse. Authoring decision, not retrieval defect.
- **Stale baseline file gotcha** — `~/retrieval_baseline_results.txt` on VPS is Apr 16 (pre-quarantine) and is regularly what grep/head default to. Always use timestamped snapshots: `~/retrieval_baseline_pre_reembed.txt`, `_post_reembed.txt`, `_post_quarantine.txt`, `_pre_interleave.txt`, `_post_interleave.txt` (session 74 canonical). Session 75 lost 20 minutes chasing a phantom stub-quarantine leak diagnosed from the stale file.
- **Q14 semantic ceiling — known** — `manual-b4135-chunk` (s 37 EA leading questions doctrine) scores ~0.46 against "leading questions technique" query; case_chunks floor ~0.63–0.69. Vocabulary patch + anchor fix delivered (examination technique added to CONCEPTS, anchor=Yes confirmed). Gap is structural: "technique" query too broad, matched by examination/witness case_chunks. Chunk correctly authored and embedded. A practitioner querying "s 37 Evidence Act leading questions" retrieves it in top 3. Q14 passes on case chunks (Police v Endlay). Secondary source surfacing is a known ceiling, not a pipeline defect.
- **Pass 4 authority_synthesis — same structural vulnerability as Pass 3** — authority_synthesis chunks face the same score-floor crowding as secondary sources. Quota approach generalises: add a second quota block when this becomes a visible problem. Flagged by Opus session 92 — watch item only.
- **Party name constraint — DEPLOYED session 93** — Prophylactic bullet added to Sol citationRules block (worker.js ~L2663) and as item 3 in V'ger RULES block (worker.js ~L2905). Instructs LLM to cite by citation alone when source shows only citation without parties. Skipped on performMerge — operates on single case's own material, no pathway to fabricate. The "Police v FRS" for [2020] TASMC 9 flagged session 92 was NOT hallucination — it's stored practitioner shorthand (Option A confirmed): `cases.case_name` = "Police v FRS", `case_chunks.enriched_text` chunk 0 uses it, two authored secondary_sources chunks ("Police v FRS - Tendency Evidence Admissibility", "Police v FRS - Example Tendency Notice") use it by design. V'ger was retrieving faithfully. Summary criminal matters are routinely styled "Police v X" in Tasmanian practitioner reference even where formal AustLII parties name informants. No corpus cleanup needed.
- **cases.embedded column unreliable as case-level gate** — Lambert and Stokes [2007] TASSC 76 shows `cases.embedded = 0` while all 49 chunks have `case_chunks.embedded = 1`. Same pattern family as the legislation_sections.embedding_model issue (session 90 finding). Canonical case-level embed signal is aggregation over case_chunks.embedded, not the case-row column. Do not use `cases.embedded` as a backlog gate or retrieval diagnostic.
- **Retrieval stochastic variance across runs — confirmed session 93** — S92 vs S93 spot-checks showed different case sets retrieved on 4 of 5 identical queries (Q2, Q3, Q4, Q5 all returned substantially different TASCCA/TASSC cases). Combination of ANN jitter + query expansion fan-out + BM25 interleave stochasticity. Some variance is expected architecture behaviour, but Q2 and Q5 show persistent miss patterns separate from jitter — promoted to OUTSTANDING PRIORITY for root-cause diagnostic.
- **Body-level alias injection is a conditional lever, not a universal one** — Established experimentally session 76. Body-text prose injection shifts the embedding vector enough to win top-rank on queries whose wording overlaps the injected prose, but does not help queries that diverge lexically from the injected wording — even when the underlying concept is identical. Consequence: corpus-side aliasing work has a permanent ceiling imposed by query-side variation. Aliasing by body edit remains viable for closing specific high-value query pairs only if user phrasing can be predicted; query expansion (deployed session 77) is the architectural fix for open-ended recall. Do not attempt further corpus-side aliasing injection as a substitute for the query expansion path.
- **Qdrant court field — FIXED session 91** — root cause: `c.court` absent from Worker SELECT in `fetch-case-chunks-for-embedding` and missing from poller metadata dict. Fixed in both files. Verified via Qdrant payload spot-check on [2019] TASCCA 1 chunks — `court: "cca"` confirmed present. Worker deployed `140a981e`, commit `f7ca5fc`.
- **Parliament.tas.gov.au bill page URLs — slug format unresolvable from Act number** — `billPageUrl` in `handleAmendments` cannot construct a direct bill page URL because parliament.tas.gov.au uses title-derived slugs (e.g. `/bills/bills2025/justice-miscellaneous-reporting-procedures-bill-2025-10-of-2025`) not numeric paths. Current workaround: "Locate Hansard ↗" button links to `google.com/search?q=site:parliament.tas.gov.au+"N+of+YYYY"`. Proper fix requires fetching the year index page and matching by bill number — deferred.
- **Parallel CC workflow — preferred pattern** — for tasks with independent sub-tasks and no shared state risk, direct multiple CC instances concurrently. Tom and Claude.ai oversee and coordinate, CC instances implement in parallel. Flag suitable tasks for parallelisation at session planning stage.

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
| Baseline output files | Always use timestamped snapshots (e.g. ~/retrieval_baseline_post_query_expansion.txt) — ~/retrieval_baseline_results.txt is Apr 16 stale; never grep it · canonical reference: ~/retrieval_baseline_post_query_expansion.txt (session 77) |

**Tooling:**
- Claude.ai — architecture, planning, debugging, writing CLAUDE.md, code review
- Claude Code (VS Code) — file edits, terminal commands, git, wrangler deploys
- PowerShell / SSH — VPS runtime commands, long-running Python scripts

---

## CHANGES THIS SESSION (session 91) — 22 April 2026

- **Q14 re-embed unblocked** — `manual-b4135-chunk` diagnosed as stale vector (embedded=1 in D1 but enriched_text rewritten post-embed in session 90); reset to embedded=0; poller will re-embed with current 3,794-char doctrine prose on next cycle. Live baseline confirmed miss (both target chunks absent from top 5); Q14 remains open pending poller confirm.
- **Qdrant court field fix** — `c.court` added to Worker `fetch-case-chunks-for-embedding` SELECT and to poller metadata dict; 5 chunks from [2019] TASCCA 1 reset and re-embedded; Qdrant payload spot-check confirms `court: "cca"` present; Worker deployed `140a981e`, commit `f7ca5fc`.
- **striprtf installed** — added to `Dockerfile.agent` pip install line; agent-general container rebuilt and force-recreated; import test confirmed ok; KNOWN ISSUES entry cleared.
- **Synthesis dedup tightened** — DEDUPLICATION RULES block in `performMerge()` replaced with four-bullet version: legal distinctness test (same rule + same provision/doctrine), nuance preservation (prefer statutory ref + named authority), one principle per concept, output fewer if warranted. Replaces weak "near-synonymous" cue from session 89. Forward-only.
- **Stale KNOWN ISSUES cleared** — subject_matter Option A entry (feature live since session 89), corpus placeholders entry (block_023/028 content filled session 89 via 8 secondary source chunks — confirmed via history), striprtf entry all deleted.
- **Q9/Q26 closed** — secondary source chunks authored and uploaded this session; both removed from outstanding priorities.
- **Parallel CC workflow adopted** — two CC instances run concurrently this session (Stream A: court field fix + striprtf; Stream B: synthesis dedup). Pattern documented in KNOWN ISSUES for reuse.

---

## CHANGES THIS SESSION (session 92) — 22 April 2026

- **Quota-aware final cap** — server.py `performSearch()` final sort+cap replaced with quota-aware block: `SECONDARY_QUOTA=1`, `SWAP_MIN_SCORE=0.40`, gates on `top_k>=3`. Guarantees ≥1 secondary source in top_k when one scores ≥0.40 and case_chunks would otherwise crowd it out. Log line fires on displacement. Working in production — secondary sources visible in multiple API calls.
- **Anchor regex fix** — `enrichment_poller.py` `build_secondary_embedding_text()` regex changed from `re.match` to `re.search` with fallback to handle inline multi-field header lines (`[# identifier]` format on line 1). `anchor=Yes` confirmed for `manual-b4135-chunk` at 09:50:51. Only one chunk used this header format.
- **Vocab patch: manual-b4135-chunk** — `examination technique` added to CONCEPTS line; opening sentence added to `## The Rule` section. Score lifted 0.4549→0.4705; chunk now #1→#2 among secondary sources on direct Qdrant query. Anchor fix brought score to 0.4572 (slight dilution from 409-char anchor prefix). Q14 remains structural miss — semantic ceiling confirmed.
- **TYPE_TAGS stale entry cleaned** — `secondary_source: { label: 'CORPUS' }` confirmed live since session 89. Stale KNOWN ISSUES entry removed (commit c136731).
- **Stale baseline SESSION RULE added** — SESSION RULES table now includes baseline output file rule: always use timestamped snapshots, `~/retrieval_baseline_results.txt` is Apr 16 stale (commit c136731).
- **Scraper scope + freshness fix** — TASMC_2026 added to `COURT_YEARS` (`range(2026, 2004, -1)`); active year entries (TASSC/TASCCA/TASFC/TASMC 2026) deleted from `scraper_progress.json` so next run re-scrapes for new cases. INSERT OR IGNORE prevents duplicates (commit c4ca8ac).
- **Stage 3 legislation embed confirmed complete** — all 8 Acts `embedded=1` in D1. SA 147 + YJA 216 + JR 96 sections fully embedded with vocabulary anchors.
- **Synthesis dedup spot-check** — 5 queries run (tendency, guilty plea, first offender, unreasonable verdict, right to silence). Dedup rules holding; Q3 shows repetitive hedging on sparse retrieval but no principle-repetition failures. One hallucination identified: party name invention ("Police v FRS") when chunk lacks full party data. Synthesis prompt review noted for next session.

---

## CHANGES THIS SESSION (session 93) — 22 April 2026

- **Synthesis prompt party name constraint deployed** — Sol citationRules block (worker.js L2663) gains new bullet: "Party names must match those in the source material. If a source contains a citation (e.g. [2020] TASMC 9) without party names, cite by citation alone — do not complete or infer party names from training knowledge." V'ger RULES block (worker.js L2905) gains matching numbered item 3 with existing items 3–5 renumbered to 4–6. Prophylactic against citation-without-parties fabrication. Worker `1debff12-f0b7-43fe-afa8-62bedf22d599`, commit `0138309`.
- **Cyrillic typo fix in handleLegalQuery** — `answерNote` (Cyrillic `е` U+0435 at fourth character) renamed to Latin `answerNote` throughout handleLegalQuery. Zero post-edit occurrences of the Cyrillic form in worker.js. No runtime effect but removes a latent code smell.
- **Synthesis prompt audit complete — three prompts reviewed verbatim** — performMerge (gpt-4.1-mini, merge-time, worker.js L3124–L3244), handleLegalQuery (claude-sonnet-4-6, query-time, L2585–L2744, three system-prompt variants A/B/C), handleLegalQueryWorkersAI (@cf/qwen/qwen3-30b-a3b-fp8, query-time, L2823–L2945, three variants). No instruction-density rewrites required — all three well-calibrated to their models. performMerge skipped on party-name edit (no pathway to fabricate; operates on case's own material). V'ger `[LEGISLATION]` label gap identified but deferred to separate session.
- **"Police v FRS" diagnosis corrected** — Session 92 flagged as hallucination; D1 audit confirmed it's stored practitioner shorthand. `cases.case_name` = "Police v FRS" for [2020] TASMC 9 (formal parties "Rebecca Woodhouse and Simon Gerard Vout v FRS" in `parties` column), propagated into case_chunks and two authored secondary_sources. Option A confirmed — summary matters styled "Police v X" is standard Tasmanian practitioner reference. V'ger was retrieving faithfully, not fabricating. Constraint deployment reframed from bugfix to prophylactic.
- **Q2 retrieval recall defect identified** — "sentencing guilty plea discount" spot-check returned only Cleaver [2018] TASCCA 11 in S93, missing Dunning [2018] TASCCA 21 chunk 10 (explicit 20% discount, Markarian citation) and Dunne [2021] TASCCA 5 chunk 3 (explicit 20% reduction). Both cases deep_enriched=1, all chunks embedded=1. S92 retrieved both cleanly. Promoted to outstanding priority.
- **Q5 retrieval recall defect identified — persistent** — "right to silence direction jury" spot-check persistently missed Lambert and Stokes [2007] TASSC 76 across two consecutive runs in S93. Chunk 18 contains verbatim right-to-silence jury direction content; case has 49 chunks all embedded=1. S92 retrieved cleanly. Not ANN jitter — persistent miss. Promoted to outstanding priority.
- **Q9 authoring debt exposed** — Session 90 authoring note on guilty plea discount chunk claimed "no confirmed TASCCA quantum authority"; session 93 D1 audit establishes Dunning [2018] TASCCA 21 and Dunne [2021] TASCCA 5 are both direct 20% quantum TASCCA authorities and were in D1 at time of authoring. Q9 chunk needs rewrite to cite them. Promoted to outstanding priority.
- **Spot-checks confirmed no regression from patch** — 5 session-92 queries rerun via UI V'ger toggle: no principle repetition regression, no citation fabrication, no party names absent from source. Patch-attributable effects all clean; retrieval variance and Q2/Q5 recall issues all predate the patch.

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