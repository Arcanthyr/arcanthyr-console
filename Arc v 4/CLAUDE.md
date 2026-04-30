@CLAUDE_arch.md

CLAUDE.md — Arcanthyr Session File
Updated: 30 April 2026 (end of session 108) · Supersedes all prior versions
Full architecture reference → CLAUDE_arch.md — UPLOAD EVERY SESSION alongside CLAUDE.md
Changelog archive → CLAUDE_changelog.md (sessions 21–105) — load conditionally

---

## RETRIEVAL LAYER — FROZEN (24 April 2026)
Retrieval pipeline frozen at baseline 28P / 3Pa / 0M on the 31-query eval; 28,876 Qdrant points; four-pass architecture (Pass 1 unfiltered cosine → Pass 2 case chunks → Pass 3 secondary sources → Pass 4 citation authority); BM25 interleave live; vocabulary anchor prepend deployed across all Acts; subject-matter filter + query expansion + quarantine filter live on all passes. Known partials (Q9 guilty plea, Q14 s 37 EA, Q26 unreasonable verdict) attributed to content coverage and semantic ceiling, not retrieval defect.
Re-opening requires a named trigger from real-use feedback (D1 query_log rows where sufficient=0), not from internal signals. Internal signals — score distributions, rank drift, baseline variance across runs, citation churn, variant instability — are explicitly not triggers. They are the over-optimisation signature. Triggers:

1–3 logged failures that cluster on a nameable class → targeted fix matching the class (gap → corpus authoring).
1–3 non-clustered failures → noise, no action.
4+ logged failures → extend benchmark to match real query distribution before any retrieval tuning.

Real-use failure captured via thumbs-down button on INTEL page answer view (wired session 95-post, sets query_log.sufficient=0 with optional missing_note). Review cadence: four-week minimum before any conclusion from the data.

---

## SYSTEM STATE — 26 April 2026 (end of session 105)

| Component | Status |
|---|---|
| Qdrant general-docs-v2 | 28,876 points · RE-EMBED COMPLETE — vocabulary anchor prepend deployed, all case chunks embedded; 233 authority_synthesis chunks added session 79; court payload backfilled session 94 across all 26,157 case_chunk points (1,914 citations) |
| D1 cases | 1,914 (scraper running) · 1,914 deep_enriched=1 |
| D1 case_chunks | 26,051 total · embedded=0: 17 (all header chunks, null enriched_text — permanently excluded by design; effective backlog: 0) · retry_count + dlq columns added (DLQ threshold: 3 failures); pending check is now done=0 AND dlq=0 |
| D1 secondary_sources | 1,444 total · embedded=0: ~3 (nexus-save entries only — 411 Word-artifact rows cleaned session 98, embedded=0 reset for re-embed, poller clearing backlog) |
| D1 case_chunks_fts | 26,034 rows — 1:1 match with D1 case_chunks where enriched_text IS NOT NULL · 194 duplicate rows deleted session 75 · root cause fixed Worker e5934624 (DELETE-then-INSERT upsert) |
| D1 query_log | Active — answer_text + model columns added session 69, deleted soft-delete column added · feedback system live session 96 (sufficient INTEGER, missing_note TEXT; POST /api/legal/mark-insufficient wired to thumbs-down button on Research page) · flagged_by column dropped session 103 Phase 1 |
| Insufficient feedback button | LIVE — ↓ Insufficient button in INTEL page ReadingPane SaveFlagPanel · POST /api/legal/mark-insufficient (no auth, accepts query_id + optional missing_note) · popup with Submit/Skip buttons + visible error state on API failure (session 105) · see RETRIEVAL LAYER — FROZEN block above SYSTEM STATE for feedback-triggered re-opening conditions |
| D1 quarantined_chunks | 253 rows · Qdrant quarantined=true flag LIVE on all 253 points · server.py must_not filter LIVE on all four passes (Pass 1, Pass 2, Pass 3, Pass 4) |
| Pass 4 / Citation authority agent | LIVE — `AUTHORITY_PASS_ENABLED=true` in `~/ai-stack/.env.config` · keyword list calibrated session 81 (3 false-positive topical phrases removed, 10 passive-voice forms added) · Worker version 57719d21 |
| D1 case_citations | 10,575 rows · subject_matter filter removed session 108 — now indexes all deep_enriched=1 cases |
| D1 case_legislation_refs | 5,356 rows · source_url backfilled for 5 Acts (Evidence, Criminal Code, Justices, Misuse of Drugs, Police Offences) |
| enrichment_poller | RUNNING — Stage 3 legislation embed complete (all 8 Acts embedded=1) · corpus secondary source backlog clear |
| Cloudflare Queue | drained |
| Scraper | COMPLETE — full historical pass done 25 April 2026 (TASSC/TASCCA/TASFC/TASMC back to 2004) · running daily via Task Scheduler for forward-looking capture · INSERT OR IGNORE prevents duplicates |
| arcanthyr.com | Live |
| Subject matter filter | LIVE · SM_PENALTY=0.65 · LEG_WHITELIST_CORE + LEG_WHITELIST_ADJACENT + keyword bridge LIVE · Domain filter UI LIVE · Pass 2 MatchAny criminal/mixed hard filter LIVE (all three parts complete) |
| Stare decisis UI | LIVE |
| Save to Nexus | LIVE — approved column, approval gate, pending review in Library, delete action (D1+FTS5+Qdrant cleanup) |
| Query history | LIVE — answer_text + model stored per query, side panel on Research page, click-to-view, Save to Nexus / Delete per entry |
| Baseline (31 queries) | ≥28P / ≤3Pa / 0M — query expansion deployed session 77 (19 Apr 2026) · post-court-backfill snapshot captured session 94 at `~/retrieval_baseline_post_court_backfill.txt` · pre-variant-stab runs 1 & 2 captured session 95 at `~/retrieval_baseline_pre_variant_stab_run1.txt` and `run2.txt` (variance envelope: 31/31 top-1 citation drift across 3 samples, but P/Pa/M grade stable at 28P/3Pa/0M — grade-level robustness despite internal noise) · Q9 TASCCA re-rank visibly live; zero P→M regressions · session 74 canonical `~/retrieval_baseline_post_interleave.txt` retained as prior reference · generic `~/retrieval_baseline_results.txt` still Apr 16, do not grep |
| procedure_notes | 319 success / ~340 not_sentencing |
| auslaw-mcp | RUNNING on VPS — digest-pinned `sha256:480e8968...`, isolated network `auslaw-mcp_auslaw-isolated`, 10 tools via Windows Claude Code (user-scope `auslaw`) · (b)(c)(d) hardening complete session 88 · search_cases dead (VPS TCP-blocked by AustLII) · search_by_citation also dead (VPS TCP-blocked, returns 403 as of session 101) · two-step search pattern (word-search → search_by_citation) fully dead — no AustLII lookup path currently available from VPS or CF edge |
| BM25 case_chunks_fts | LIVE — interleave mode, split-constant design: BM25_SCORE_KEYWORD=0.0139 (boost path, additive) · BM25_INTERLEAVE_SCORE=0.50 (novel-hit path, competes with borderline semantic) · SM_PENALTY retained (0.50×0.65=0.325 suppresses SM-mismatched novel hits) |
| Legislation anchor | LIVE — vocabulary anchor prepend deployed in poller [LEG] pass (session 90) · format: Key terms: {act_title}; s {section_number} {heading}. · Stage 1 (EA 245) + Stage 2 (CC 468, MDA 253, JA 163, POA 143) complete · Stage 3 (SA 147, YJA 216, JR 96) complete · future legislation uploads anchor automatically · legislation.embedded is canonical backlog gate — legislation_sections.embedding_model unreliable for Stage 1+2 sections |
| Court hierarchy band | LIVE CORPUS-WIDE — session 94 payload backfill via `patch_court_payload.py` (located at `/home/tom/ai-stack/agent-general/src/` on VPS) · 1,914 citations / 26,157 case_chunk points patched · 0 null remaining · Q9 TASCCA re-rank confirmed live · revert path: `patch_court_payload.py --revert` |

---

## MEASUREMENT & CHANGE DISCIPLINE

**Resolution-before-optimisation check.** Before starting any session whose stated purpose is to improve a metric, state at the top: (a) current value, (b) what change would count as success, (c) whether the instrument can resolve a change of that size. If (c) is "no" or "unknown," the session is an instrumentation session, not an optimisation session — scope accordingly. Heuristic: binary-graded benchmarks under ~100 items have ≈±15pp resolution at 95% confidence; they cannot distinguish changes smaller than ~10pp of genuine movement. Treat small-n evals as direction indicators, never as fine-grained feedback.

**Trigger-based re-opening of frozen components.** A component marked FROZEN in CLAUDE.md is re-opened only on a named real-use trigger from D1 query_log where sufficient=0 — a query that failed, dated, in working use. Internal-signal triggers are explicitly disallowed: "the baseline moved," "scores drifted," "variance widened," "a rank swapped," "I noticed churn." Those are the over-optimisation pattern.

**Successive-fix pattern alarm.** If three consecutive sessions on the same subsystem each (a) identify a new issue, (b) ship a fix, and (c) leave the top-line metric unchanged, STOP before session four. Before touching the subsystem again, answer in writing: why is the metric static, what failure would a real user experience, and what output-level evidence supports continuing. This rule fires on observable conditions (three sessions, same subsystem, no movement) and is intended to interrupt "each fix surfaces the next issue" drift.

---

## OUTSTANDING PRIORITIES

---

## KNOWN ISSUES / WATCH LIST

- **`/api/legal/` block is rate-limited only** — routes in this block (amendments, fetch-judgment, parliament-bill-url, etc.) carry no X-Nexus-Key auth. Calling components such as AmendmentPanel have no nexusKey prop. Any new route called from a user-facing component without an existing credential mechanism must go in this block, not behind X-Nexus-Key, unless a credential flow is added to the component first.
- **`api.js req()` wraps `/api/legal/` responses as `{ result: ... }`** — the block returns `json({ result })`, so consuming code must unwrap: `const { result } = await api.parliamentBillUrl(...)`, then `result.url`. This shape is not obvious from the route handler alone.
- **Planning brief command hygiene** — session 97: the planning assistant re-introduced `node --check worker.js` in a CC brief despite SESSION RULES retiring it session 84. When generating CC briefs, cross-check any shell command against SESSION RULES before including it.
- **Bulk requeue race condition** — firing >500 simultaneous CHUNK messages causes GPT-4o-mini rate limit exhaustion and merge race conditions · always use batched approach (limit=250) for bulk requeue operations · never reset all chunks simultaneously · pending check for non-DLQ chunks is now done=0 AND dlq=0 — update any requeue tooling accordingly
- **Never reset enriched=0 on all cases** — this triggers full Pass 1 + chunk re-split + CHUNK re-processing for all cases · use `requeue-merge` (synthesis-only) or `requeue-chunks` (chunk-only) for targeted operations · similarly, done=0 queries must include dlq=0 to exclude dead-letter chunks
- **fetch-case-url vs upload-case** — URL-based ingestion must use `POST /api/legal/fetch-case-url` · `upload-case` is for direct text upload only · posting {url} to upload-case crashes on citation.match(undefined)
- **legislation.embedded is canonical embed gate** — `legislation_sections.embedding_model` is unreliable for Stage 1+2 sections (embedded before that column was being written by the poller). Do not use section-level column as backlog indicator. Correct query: `SELECT title, embedded FROM legislation` — Act-level flag is authoritative. The 1,731 `embedding_model IS NULL` count seen session 90 is noise, not backlog.
- **Qwen3 /query endpoint timeout** — server.py Qwen3 inference times out when scraper hammering Ollama · not a problem for UI (uses Claude API primary)
- **Workers AI content moderation** — Qwen3 blocks graphic evidence · CHUNK enrichment on GPT-4o-mini · Pass 1/Pass 2 still on Workers AI — monitor
- **Word artifact noise** — 131 chunks cleaned 18 Mar 2026 · re-run gen_cleanup_sql.py if new Word-derived chunks ingested
- **FTS5 export limitation** — wrangler d1 export does not support virtual tables
- **Scraper no per-case resume — known limitation** — progress file stores only `court_year: "done"`; mid-year failure restarts full year scrape. Harmless due to `INSERT OR IGNORE`. Per-case checkpointing not worth engineering effort at current stage.
- **Pass 2 principles irrelevant / merge overwrite — acknowledged, no fix** — Qwen3 Pass 2 extracts case-level `principles_extracted` but CHUNK handler (GPT-4.1-mini) overwrites this field with chunk-level data; merge uses chunk-level output only; Pass 2 principles never surface to user. Not causing visible defect — merge works correctly off chunk data. No fix planned.
- **Synthesis skip on null enriched_text** — performMerge synthesis call requires enrichedTexts.length > 0 · cases whose chunks have null enriched_text fall back to raw principle concatenation (old format)
- **/search top_k=12 server-side cap** — server.py line 296 hard-caps at 12 regardless of requested top_k. Cap retained for latency bounding. Confirmed session 76: passing `"top_k": 12` in the request payload breaks the endpoint (returns 0 chunks) — the field is not accepted; omit it, default 6 is what the baseline script uses.
- **Q27 (provocation) confirmed as corpus content gap** — provocation defence was abolished in Tasmania 2003; corpus correctly sparse. Authoring decision, not retrieval defect.
- **Stale baseline file gotcha** — `~/retrieval_baseline_results.txt` on VPS is Apr 16 (pre-quarantine) and is regularly what grep/head default to. Always use timestamped snapshots: `~/retrieval_baseline_pre_reembed.txt`, `_post_reembed.txt`, `_post_quarantine.txt`, `_pre_interleave.txt`, `_post_interleave.txt` (session 74 canonical). Session 75 lost 20 minutes chasing a phantom stub-quarantine leak diagnosed from the stale file.
- **AustLII CF-edge block — mechanism identified session 102** — block is Cloudflare Bot Management / Turnstile ("Just a moment..." + `challenges.cloudflare.com` in CSP), not an IP-range block; applies to all CF-origin automated requests regardless of egress path. CF Browser Rendering (headless Chromium) tested session 102 — also 403s; Bot Management identifies its own BR ASN by design, no CF-origin path can bypass. `lawlibrary.tas.gov.au` is behind the same CF Bot Management — identical response. AustLII usage policy explicitly prohibits spidering, scraping, crawling, vectorisation, and embedding of case law in writing. `handleAustLIIWordSearch` dead — accepted loss (jade.io search POST-based). `handleFetchJudgment` restored via jade.io URL translation (session 101). jade.io confirmed 200 from CF edge. `search_by_citation` dead (VPS TCP-block). Two-step search pattern fully dead. `runDailySync` permanently parked — all CF-edge discovery paths exhausted; local scraper on residential IP is permanent forward-looking capture. Heuristic: if CF Workers `fetch()` 403s a target, CF Browser Rendering will too — same ASN, same bot fingerprint.
- **CF Browser Rendering wrangler.toml binding syntax** — correct TOML is `[browser]` (single brackets); `[[browser]]` creates an array-of-tables and wrangler 4.75 rejects it with "should be an object but got [...]". Apply same rule to any future single-object bindings in wrangler.toml.
- **`austlii_cache` key/fetch URL intentionally decoupled** — cache entries keyed on raw AustLII viewdoc URL (`rawUrl`) but fetched from jade.io since session 101. Stable AustLII URL as cache key; jade.io as live fetch source. Cache hit serves jade.io HTML against an AustLII-keyed entry — correct and intended behaviour. Do not "fix" this.
- **Q14 semantic ceiling — known** — `manual-b4135-chunk` (s 37 EA leading questions doctrine) scores ~0.46 against "leading questions technique" query; case_chunks floor ~0.63–0.69. Vocabulary patch + anchor fix delivered (examination technique added to CONCEPTS, anchor=Yes confirmed). Gap is structural: "technique" query too broad, matched by examination/witness case_chunks. Chunk correctly authored and embedded. A practitioner querying "s 37 Evidence Act leading questions" retrieves it in top 3. Q14 passes on case chunks (Police v Endlay). Secondary source surfacing is a known ceiling, not a pipeline defect.
- **Party name constraint — DEPLOYED session 93** — Prophylactic bullet added to Sol citationRules block (worker.js ~L2663) and as item 3 in V'ger RULES block (worker.js ~L2905). Instructs LLM to cite by citation alone when source shows only citation without parties. Skipped on performMerge — operates on single case's own material, no pathway to fabricate. The "Police v FRS" for [2020] TASMC 9 flagged session 92 was NOT hallucination — it's stored practitioner shorthand (Option A confirmed): `cases.case_name` = "Police v FRS", `case_chunks.enriched_text` chunk 0 uses it, two authored secondary_sources chunks ("Police v FRS - Tendency Evidence Admissibility", "Police v FRS - Example Tendency Notice") use it by design. V'ger was retrieving faithfully. Summary criminal matters are routinely styled "Police v X" in Tasmanian practitioner reference even where formal AustLII parties name informants. No corpus cleanup needed.
- **cases.embedded column unreliable as case-level gate** — Lambert and Stokes [2007] TASSC 76 shows `cases.embedded = 0` while all 49 chunks have `case_chunks.embedded = 1`. Same pattern family as the legislation_sections.embedding_model issue (session 90 finding). Canonical case-level embed signal is aggregation over case_chunks.embedded, not the case-row column. Do not use `cases.embedded` as a backlog gate or retrieval diagnostic.
- **Retrieval stochastic variance across runs — diagnosis corrected session 94** — S92 vs S93 variance previously attributed to ANN jitter; session 94 VPS diagnostic confirmed root cause is GPT-4.1-mini variant generator non-determinism (default temperature ~1.0, no seeding). Same query → different variant set across calls → max-score merge over 4 legs produces score swings up to 0.08. Q5 Lambert 18 surfaces at rank 9 only when the "not testify" paraphrase variant is generated (1-in-3 runs); Q2 Dunning 10 best-of-legs is rank 15 (outside limit=12 cap). Session 100: formally closed — grade-level P/Pa/M stable across all variant draws (session 95 finding); internal citation churn is benign noise; no action.
- **Grade-level robustness despite internal retrieval noise — session 95 finding** — Pre-variant-stab variance capture across 3 baseline runs at current state showed 31/31 queries with top-1 citation drift between runs, but P/Pa/M grade stable across all samples at 28P/3Pa/0M. System answers stably at the user-facing grade level even while internal retrieval ordering is noisy. Relevant chunks are typically in the retrieved pool across all variant draws; which one ranks #1 varies. Argues for treating the baseline metric as the true quality signal rather than the internal score distributions — and surfaces the question of whether the 31/31 drift matters at all to real outcomes. Feeds into Priority 1 strategic review.
- **Court hierarchy band — live corpus-wide session 94** — Prior to patch, payload.court was None on 26,152 of 26,157 case_chunk points (anchor re-embed predated session 91 poller fix). Band re-rank was silently inert corpus-wide. Patched via `patch_court_payload.py` sourcing truth from cases.court in D1. Q9 TASCCA re-rank confirmed live post-patch. No baseline regressions. Revert available via `patch_court_payload.py --revert`. Also: 9 TASMC 2016 cases corrected in D1 where scraper had stored court='supreme' (script-derived from citation string was authoritative).
- **Body-level alias injection is a conditional lever, not a universal one** — Established experimentally session 76. Body-text prose injection shifts the embedding vector enough to win top-rank on queries whose wording overlaps the injected prose, but does not help queries that diverge lexically from the injected wording — even when the underlying concept is identical. Consequence: corpus-side aliasing work has a permanent ceiling imposed by query-side variation. Aliasing by body edit remains viable for closing specific high-value query pairs only if user phrasing can be predicted; query expansion (deployed session 77) is the architectural fix for open-ended recall. Do not attempt further corpus-side aliasing injection as a substitute for the query expansion path.
- **Parallel CC workflow — preferred pattern** — for tasks with independent sub-tasks and no shared state risk, direct multiple CC instances concurrently. Tom and Claude.ai oversee and coordinate, CC instances implement in parallel. Flag suitable tasks for parallelisation at session planning stage.
- **MCP D1 PRAGMA table_info truncation** — session 95-post, the Cloudflare Developer Platform MCP d1_database_query tool returned cid 0–17 on PRAGMA table_info(query_log), silently omitting cid 18+. This masked a pre-existing `sufficient` column at cid 18 (origin unrecovered from Claude.ai conversation history; added in an unlogged Cowork or CC session between Phase 4 word-search deploy ~20 April and session 95 on 24 April; column had zero non-null values corpus-wide so no operational impact). Cause suspected: MCP result-row cap on wide tables. Workaround: for schema-existence checks on any table with >~15 columns, use `SELECT <col> FROM <table> LIMIT 0` — returns "no such column" if absent, empty success if present, no row-cap risk. Reserve PRAGMA for narrow tables or when you can verify the output includes the highest expected cid.
- **`cases.court` stores D1 lowercase abbreviations, not AustLII codes** — values are `supreme` / `cca` / `fullcourt` / `magistrates`. AustLII codes (`TASSC`, `TASCCA`, `TASFC`, `TASMC`) appear in the citation string only. Any filter, colour map, or query keyed on AustLII codes will return zero matches. Before writing any filter touching `cases.court`, run `SELECT court, COUNT(*) FROM cases GROUP BY court` via D1 MCP to confirm live values.
- **Dual `COURT_COLORS` maps with different key schemes** — `CaseSearch.jsx` keys on D1 lowercase values (`supreme`, `cca`, `fullcourt`, `magistrates`); `StareDecisisSection.jsx` keys on AustLII uppercase codes (`TASSC`, `TASCCA`, etc.). These are intentionally different schemas — do not unify without checking both components. If adding a new court colour, update both maps with the correct key for each file.
- **Landing.jsx nav buttons are a separate component from Nav.jsx** — no shared code between them. Editing Nav.jsx has zero effect on Landing.jsx button styling. When making nav changes, always edit both files explicitly. Not a bug — by design — but cost a full component read to discover session 108.
- **CaseSearch.jsx state/court filtering is entirely client-side** — `filterByStates` runs post-fetch on the full case list loaded at mount. `handleLibraryList` accepts no state or court filter params. The `STATE_COURTS` map currently only has entries for `TAS` and `HCA`; all other keys return `undefined` → silent empty-set from `filterByStates`. Any future state addition requires an explicit entry in that map.
- **xref_agent subject_matter filter was in Worker.js, not xref_agent.py** — `handleFetchCasesForXref` (Worker.js line ~2337) held the `AND subject_matter IN ('criminal', 'mixed')` clause. Removed session 108; xref now covers all `deep_enriched=1` cases. If filter needs restoring, look in Worker.js not the Python script.

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
| runDailySync | PERMANENTLY PARKED — all CF-edge discovery paths exhausted (raw fetch 403, Browser Rendering 403 via same Bot Management ASN, VPS TCP-block, jade.io has no listing pages, lawlibrary.tas.gov.au blocked). Local Task Scheduler scraper is permanent forward-looking capture. Re-open only if a non-CF-origin, non-AustLII discovery source is identified (e.g. court RSS feed or public API not behind Bot Management). See CLAUDE_decisions.md session 102. |
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
| arcanthyr-ui deploy | Build: cd arcanthyr-ui → npm run build → cp -r dist/. "../Arc v 4/public/" → cd "../Arc v 4" → npx wrangler deploy · Do NOT use wrangler pages deploy · Do NOT add _redirects to public/ · Do NOT `git add public/assets/` — build assets under public/assets/ are gitignored; only public/index.html and source files need staging |
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
| str_replace on markdown table rows | Known silent no-op when row contains pipes, backticks, or parens-heavy content (confirmed session 103). The Edit tool returns success but nothing changes. Reliable fallback: Python script with line-index deletion and explicit `utf-8` stdout wrapper. ALWAYS grep the file after editing a table row to confirm the change landed. |
| Null byte in CLAUDE.md — generalised str_replace failure root cause | The file contains a null byte that causes silent no-ops on any multi-line block containing em-dashes, arrows, backticks, or pipes — not just table rows. When any str_replace silently fails on CLAUDE.md, the null byte is the likely cause. Fix: use Python line-index deletion (read file → identify line numbers → rewrite without target lines) rather than str_replace for affected blocks. |
| Multi-line block deletion (CHANGES THIS SESSION blocks etc.) | Python line-index deletion is the reliable method: read file, identify start/end line numbers of the block, rewrite file omitting those lines. The str_replace approach fails on these blocks for the same null-byte reason as table rows. |
| `replace_all: true` on Edit tool | When the same CSS change applies to multiple identical inline style objects in one file, use `replace_all: true` rather than sequential single-target edits. Faster and safer than a search-and-replace loop. |
| truncation_log table | D1 table tracking cases truncated on upload · columns: id, citation, original_length, truncated_to, source, status, date_truncated, date_resolved · status values: flagged/confirmed/replaced · `GET /api/pipeline/truncation-status` (no auth) returns flagged entries · `POST /api/pipeline/truncation-resolve` (X-Nexus-Key) for confirm/delete actions |
| docker compose port interpolation | ${VAR} in ports mapping is interpolated at parse time from .env only — env_file: does NOT apply · hardcode invariant ports directly in docker-compose.yml |
| Session health check | At session start, if `$TEMP\arcanthyr_health.txt` exists, read it and summarise corpus state (total cases, enrichment queue depth, embedding backlog) before doing anything else |
| Truncation tolerance | CLAUDE.md is structured with operational content (state, priorities, rules) in the first ~300 lines. History and procedures at the tail tolerate truncation — they exist as in-session reference, not session-start-critical context |
| auslaw-mcp search pattern | All AustLII lookup paths currently dead — search_cases dead (VPS TCP-block), word-search dead (AustLII CF-edge 403 confirmed session 101), search_by_citation dead (VPS TCP-block). Local scraper (residential IP) is the only working AustLII access path. For case text of known citations, jade.io URL format (`jade.io/au/cases/tas/COURT/YEAR/NUM`) is accessible from CF edge via `handleFetchJudgment`. |
| Reachability testing | `mcp__fetch__fetch` is unreliable for reachability checks — fails with `AsyncClient.__init__() got an unexpected keyword argument 'proxies'` regardless of target URL · use Firecrawl instead · Firecrawl's infrastructure shares the datacenter IP class with Cloudflare edge — a 200 from Firecrawl predicts a 200 from a CF-edge fetch · `austliiUrl()` in CaseSearch.jsx (was Library.jsx) always produces AustLII `/cgi-bin/viewdoc/au/cases/tas/COURT/YEAR/NUM.html` format — not jade.io format; `buildJadeUrl` is used only for the "Open on jade.io" anchor link, not passed to `handleFetchJudgment` |
| CLAUDE_changelog.md | Load when investigating a past session's changes, debugging a regression to a specific date, or when referencing work from sessions older than the 3-session retention window |
| Baseline output files | Always use timestamped snapshots (e.g. ~/retrieval_baseline_post_query_expansion.txt) — ~/retrieval_baseline_results.txt is Apr 16 stale; never grep it · canonical reference: ~/retrieval_baseline_post_query_expansion.txt (session 77) |
| grep on CLAUDE.md | Always use `grep -a` — the file contains a null byte and returns "Binary file matches" without the flag; every content or line-number check on CLAUDE.md requires `grep -a` |

**Tooling:**
- Claude.ai — architecture, planning, debugging, writing CLAUDE.md, code review
- Claude Code (VS Code) — file edits, terminal commands, git, wrangler deploys
- PowerShell / SSH — VPS runtime commands, long-running Python scripts

---

## CHANGES THIS SESSION (session 106) — 26 April 2026

- **Logo swap** — Nav.jsx, Landing.jsx, and ReadingPane.jsx all updated to reference new `public/“this one”` emblem asset; all three prior `/unnamed.jpg` references replaced including the 48px empty-state reference in ReadingPane.jsx
- **“THE ARC” landing rename** — Landing.jsx:81 wordmark string changed from `Arcanthyr` to `THE ARC`; existing `textTransform: uppercase` wrapper makes it render correctly; ShareModal email subject unchanged
- **ALL CAPS labels** — `textTransform: 'uppercase'` applied to all interactive labels across ReadingPane.jsx, Intel.jsx, CaseSearch.jsx; Ask → button left as design exception; hardcoded uppercase strings untouched
- **Legislation title-case safety net** — `textTransform: 'capitalize'` added to LegislationTable Act column cell; no hardcoded legislation name strings required changing (all already title-case or outside scope)
- **Session numbering corrected** — Phase 4 bullet incorrectly bundled into session 105 block by CC's session-close writer; extracted and placed in correct session 106 block

## CHANGES THIS SESSION (session 107) — 26 April 2026

- **Post-rebuild UI fixes (6)** — moved Secondary Sources sub-tab from Case Search into Corpus Admin placeholder; transplanted Legislation sub-page from Case Search into Legislation main page shell; added "This case cites N · Cited by N" tallies inline in case header without toggle; converted state filter to multi-select tabs (TAS default, TAS fallback on empty); converted year filter to court-scoped dropdown; added GET /api/legal/feedback route surfacing query_log WHERE sufficient=0
- **Corpus Admin restored** — Upload sub-page rewired (had disappeared post-rebuild); Feedback sub-page built (query text, missing_note, model, answer, chunks — read-only); Compose renamed EMAIL and moved to far-right tab; tab order: CORPUS · SECONDARY SOURCES · UPLOAD · FEEDBACK · EMAIL
- **INTEL page fixes** — SOURCE label added to third toggle row; CRIMINAL pre-selected as Domain default; Save to Nexus border removed to match Insufficient styling
- **Legislation page enhancements** — View Online button wired to source_url captured at upload; row-click anywhere opens amendment drawer; Similarity % replaces "matching chunks" in word search results
- **Court filter bug fixed** — TAS state tab was returning empty results because filter keyed on AustLII codes (`TASSC` etc.) while `cases.court` stores D1 lowercase abbreviations (`supreme`, `cca`, `fullcourt`, `magistrates`); STATE_COURTS.TAS remapped to D1 values; COURT_COLORS map corrected to match
- **Court tag + badge styling** — all four court tags unified to white text on dark background; Indexed badge changed from green to blue; HCA red unchanged
- **Schema gotcha documented** — `cases.court` value set added to CLAUDE_arch.md; dual COURT_COLORS map split (CaseSearch vs StareDecisis) added to KNOWN ISSUES

## CHANGES THIS SESSION (session 108) — 30 April 2026

- **Nav button borders corpus-wide** — uniform 120×40px bordered boxes deployed to Nav.jsx; Landing.jsx required a separate edit (independent implementation — no shared component with Nav.jsx)
- **Case Search state filter fixed** — removed TAS fallback from `toggleState` and `caseRows`; non-TAS selections now show empty state message "There are no cases in the corpus for this jurisdiction at present"; filtering confirmed 100% client-side via `filterByStates`
- **INTEL renamed AI ASSIST** — label changed in Nav.jsx and Landing.jsx; route `/intel` unchanged
- **"Cites N" pill added to case detail** — `citesCount` prop wired to `StareDecisisSection.jsx` from pre-existing `citesImmediate` local variable in CaseSearch.jsx; no new API call
- **Corpus Admin Upload sub-tabbed** — `UploadPanel` split into Cases (default) / Legislation / Secondary Sources sub-tabs
- **Landing page grid removed** — `linear-gradient` checker pattern and `@keyframes grid-scroll` removed from Landing.jsx and index.css
- **Intel page cleanup** — Source filter row restored (accidentally removed with chunk display), toggle alignment fixed via fixed-width labels, chunk display removed from results
- **xref_agent scope expanded** — `AND subject_matter IN ('criminal', 'mixed')` removed from `handleFetchCasesForXref` in Worker.js (version 86921e1e); backfill ran immediately; case_citations 7,213 → 10,575 (+3,362); case_legislation_refs 5,147 → 5,356 (+209)

## END-OF-SESSION UPDATE PROCEDURE

**Authoritative procedure: `arcanthyr-session-closer` skill (Claude.ai side).** That skill generates the canonical CC prompt at session close, including all steps below plus changelog migration and cross-file staleness scan. The procedure here is a fallback for freehand closes — if you are reading this because the skill wasn't invoked, ensure all numbered steps below run, especially Step 5 (changelog migration) which is the failure mode that produced 8 sessions of drift across sessions 93–100.

**1. Outstanding Priorities — reconcile, don't append**
- Read every item in the Outstanding Priorities list
- Cross-check each item against CHANGES THIS SESSION and any work completed this session
- For each item that is now complete: remove it entirely (do not leave it with a ✅ — delete the line)
- For each item that is partially progressed: update the status text in place
- Only then add new outstanding items for work that opened this session

**1b. KNOWN ISSUES — prune and update**
- Remove any entry the session changelog shows as resolved
- Update any entry where the status has partially changed (e.g. one sub-issue fixed, another remains)

**1c. Cross-file staleness scan — components REMOVED or RENAMED only**
- For every component named in this session as removed or renamed (route paths, table names, function names, file names, KV bindings), grep all five MDs (CLAUDE.md, CLAUDE_arch.md, CLAUDE_init.md, CLAUDE_decisions.md, CLAUDE_changelog.md) for the identifier
- Read every hit; remove or update any description that is now stale
- Additions don't need this scan — only removals/renames invalidate existing other-file content

**2. SYSTEM STATE table — refresh all counts**
- Re-query or update every numeric value in the SYSTEM STATE table to reflect current actuals
- Do not leave stale counts from a previous session

**3. File header datestamp — update it**
- Change the "Updated:" line at the top of CLAUDE.md to today's date and current session number
- Update the datestamp in CLAUDE_arch.md header too

**4. CHANGES THIS SESSION — write the new block as normal**
- Add the session block with what + why for each change
- Insert immediately BEFORE the `## END-OF-SESSION UPDATE PROCEDURE` heading, not at end of file
- **Context compaction check** — if context was compacted mid-session, verify the most recent block's session number before appending. The block count heuristic ("will contain 4 blocks — always") assumes no compaction. If the most recent block's session number is not the previous session, add a new block rather than appending to the existing one.

**5. Changelog migration — UNCONDITIONAL after every session close**
- After Step 4, CLAUDE.md will contain 4 `## CHANGES THIS SESSION` blocks. Always.
- Move the OLDEST block to CLAUDE_changelog.md: prepend it after the file header block, before the first existing `## CHANGES THIS SESSION` entry
- Delete the moved block from CLAUDE.md
- Update the CLAUDE_changelog.md header range line `*Sessions 21–N · ...*` to reflect the newly archived session number
- Update the CLAUDE.md header pointer `Changelog archive → CLAUDE_changelog.md (sessions 21–N)` to match
- This step has no condition. If you skip it, drift accumulates silently — eight sessions of accumulation at sessions 93–100 is what produced the session 103 drift audit.

**6. Verify before finishing — grep, don't trust the Edit return code**
- `grep -c "^## CHANGES THIS SESSION" "Arc v 4/CLAUDE.md"` — must return exactly 3
- `grep -n "END-OF-SESSION UPDATE PROCEDURE" "Arc v 4/CLAUDE.md"` — confirm new session block appears on a lower line number than this heading
- For each str_replace performed this session, grep the file for distinctive new content to confirm it landed (Edit tool can silently no-op on markdown table rows — see SESSION RULES)
- Read back Outstanding Priorities; confirm no completed item remains
- Read back KNOWN ISSUES; confirm no resolved entry remains
- Confirm datestamp updated and SYSTEM STATE counts current

**Do not treat this as an append operation.** The Outstanding Priorities list and KNOWN ISSUES must reflect reality after this session, not accumulate history. The CHANGES THIS SESSION blocks must cycle out to the changelog at every close.

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

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 