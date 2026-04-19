@CLAUDE_arch.md

CLAUDE.md — Arcanthyr Session File
Updated: 19 April 2026 (end of session 74) · Supersedes all prior versions
Full architecture reference → CLAUDE_arch.md — UPLOAD EVERY SESSION alongside CLAUDE.md
Changelog archive → CLAUDE_changelog.md (sessions 21–65) — load conditionally

---

## SYSTEM STATE — 19 April 2026 (end of session 72)

| Component | Status |
|---|---|
| Qdrant general-docs-v2 | RE-EMBED COMPLETE — vocabulary anchor prepend deployed, all case chunks embedded |
| D1 cases | 1,914 (scraper running) · 1,913 deep_enriched=1 · 1 stuck |
| D1 case_chunks | 26,051 total · embedded=0: 17 (all header chunks, null enriched_text — permanently excluded by design; effective backlog: 0) |
| D1 secondary_sources | 1,202 total · embedded=0: 2 (both orphaned Nexus saves, Tom handling manually — not a pipeline fault) |
| D1 case_chunks_fts | 26,228 rows — FTS5 index on case chunk enriched_text (post-re-embed FTS trigger catchup — verify no chunk_index=0 pollution next session) |
| D1 query_log | Active — answer_text + model columns added session 69, deleted soft-delete column added |
| D1 quarantined_chunks | 253 rows · Qdrant quarantined=true flag LIVE on all 253 points · server.py must_not filter LIVE on all three passes (Pass 1, Pass 2, Pass 3) |
| D1 synthesis_feedback | 0 rows · route wired session 68 (POST /api/pipeline/feedback) |
| D1 case_citations | 6,959 rows |
| D1 case_legislation_refs | 5,147 rows |
| enrichment_poller | RUNNING — re-embed complete, all chunks at embedded=1 |
| Cloudflare Queue | drained |
| Scraper | RUNNING (status uncertain — processed_date field unreliable; check scraper.log after 11am AEST) |
| arcanthyr.com | Live |
| Subject matter filter | LIVE · SM_PENALTY=0.65 · LEG_WHITELIST_CORE + LEG_WHITELIST_ADJACENT + keyword bridge LIVE · Domain filter UI LIVE |
| Stare decisis UI | LIVE |
| Save to Nexus | LIVE — approved column, approval gate, pending review in Library, delete action (D1+FTS5+Qdrant cleanup) |
| Query history | LIVE — answer_text + model stored per query, side panel on Research page, click-to-view, Save to Nexus / Delete per entry |
| Baseline (31 queries) | 26P / 3Pa / 2M — session 74 (19 Apr 2026) · post-BM25-interleave deploy · up from 24P/4Pa/3M at session 73 · Q8 Pa→P, Q16 M→P (Neill-Fraser material surfaced — corpus-gap diagnosis refuted) |
| procedure_notes | 319 success / ~340 not_sentencing |
| auslaw-mcp | RUNNING on VPS — digest-pinned `sha256:480e8968...`, isolated network `auslaw-mcp_auslaw-isolated`, 10 tools via Windows Claude Code (user-scope `auslaw`) |
| BM25 case_chunks_fts | LIVE — interleave mode, split-constant design: BM25_SCORE_KEYWORD=0.0139 (boost path, additive) · BM25_INTERLEAVE_SCORE=0.50 (novel-hit path, competes with borderline semantic) · SM_PENALTY retained (0.50×0.65=0.325 suppresses SM-mismatched novel hits) |

---

## OUTSTANDING PRIORITIES

1. **Practitioner↔statutory vocabulary aliasing — new category of anchor work** — Interleave deploy (session 74) confirmed FTS alone cannot bridge vocabulary mismatches where the practitioner term is absent from source text — aliasing remains the only fix for Q12-class queries. Q14 (Hefny v Barnes, leading questions) identified as likely-same-class: FTS surfaces a case applying the rule, not stating it. Q12 ("hostile witness") confirmed this session as vocabulary mismatch: corpus uses "unfavourable witness" (statutory), practitioners query "hostile witness" (vernacular). FTS cannot bridge because keyword doesn't appear in source text. Fix is at embedding time: add vernacular aliases to vocabulary anchor for s 38 EA chunks. Likely candidates from current baseline partials: Q10 (corroboration), Q14 (leading questions), Q23 (search warrant execution), Q24 (committal hearing) — all procedural queries where Hogan-on-Crime phrasing differs from practitioner vocabulary. Audit pass: identify pairs, add to vocabulary anchor, re-embed affected chunks only (not full re-embed).

2. **subject_matter filter Part 3** — Pass 3 server.py MatchAny filter (`criminal`, `mixed`). Re-embed complete so payload field is current. Unblocked but low expected win — SM_PENALTY (0.65) already doing similar work. Deploy only if a baseline regression surfaces on a domain-specific query.

3. **Query expansion** — rewrite user query into 3–4 semantic variants pre-Qdrant via Workers AI Qwen3. Highest long-term ROI on the retrieval side. Build after interleave + aliasing are measured — vocabulary anchors + FTS + interleave may close enough of the gap to deprioritise this.

4. **auslaw-mcp hardening followups** — (a) rate budget in `/fetch-page` proxy to prevent MCP queries starving daily scraper's AustLII allowance, (b) resource limits on compose service (`mem_limit: 1g`, `cpus: '1.0'`), (c) filesystem hardening (`read_only: true` + `tmpfs: [/tmp]` once write paths confirmed), (d) GitHub MCP install (guide already written as `github-mcp-setup.md`, existing `github` MCP already wired — low priority).

5. **Quick Search tab (arcanthyr.com practitioner UI)** — Build plan finalised in session 73 (conversation-external — not built, see handover notes). Three phases: corpus FTS keyword search (Phase 1), AustLII external via `/fetch-page` (Phase 2 — watch for CGI slowness inherited from auslaw-mcp `search_cases` timeout issue), query_log `search_type` extension (Phase 4). Phase 3 Jade link button is gravy. Phase 5 (full-judgment fetch + reading pane with cached HTML, 30-day TTL `austlii_cache` D1 table) added as separate extension. Track 2 (remote MCP at `auslaw.arcanthyr.com`) explicitly deferred — auslaw-mcp in CC covers 90% of the use case. Build after retrieval-side priorities (#1–#4) are cleared.

---

## KNOWN ISSUES / WATCH LIST

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
- **/search top_k=12 server-side cap** — server.py line 296 hard-caps at 12 regardless of requested top_k. Post-session-74 interleave deploy this is no longer blocking for the FTS-new-chunk path (novel hits at 0.50 synthetic displace borderline semantic and surface within the 12-slot cap). Cap retained for latency bounding. Revisit only if query expansion (Priority #3) generates >12 legitimate candidates per query.
- **Q12 miss confirmed as vocabulary mismatch, not retrieval defect** — corpus uses statutory term "unfavourable witness" throughout (Hogan on Crime + EA + cases); practitioners query "hostile witness". FTS cannot bridge. Resolution is practitioner↔statutory aliasing on s 38 EA chunks (Priority #2). Holds as MISS until that work lands.
- **Q27 (provocation) confirmed as corpus content gap** — provocation defence was abolished in Tasmania 2003; corpus correctly sparse. Authoring decision, not retrieval defect.

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

## CHANGES THIS SESSION (session 72) — 19 April 2026

- **auslaw-mcp static audit — verdict YELLOW** — Third-party MCP server `github.com/russellbrenner/auslaw-mcp` audited via nine-step procedure (metadata, outbound URL grep, dynamic-exec grep, env/secret grep, Dockerfile review, dependency CVE scan, `.mcp.json` check, file tree, tree-sitter'd SSRF guard read). Verdict: well-constructed but hardening warranted before first run. Static audit script saved as `audit-auslaw-mcp.sh`. Key findings: (1) SSRF guard in `src/services/url-guard.ts` uses hostname-string matching (`Set.has(parsed.hostname)`) against 5-entry allowlist — no DNS IP resolution, fine for this threat model; (2) Tesseract OCR invoked via `execFile` (arg array) not `exec` — no shell injection surface; (3) `runDailySync` already exposes VPS IP to AustLII, so auslaw-mcp adds zero new IP-exposure risk; (4) `/fetch-page` proxy is a URL-param FastAPI endpoint, NOT an HTTP CONNECT proxy — cannot be used as `HTTPS_PROXY` (initial hardening recommendation corrected mid-session).

- **auslaw-mcp hardened deployment on VPS** — cloned to `~/auslaw-mcp` (deliberately OUTSIDE `~/ai-stack/` tree to keep it off every ai-stack docker network). `.mcp.json` deleted from clone root per existing third-party tool security rule. `.env` created: `LOG_LEVEL=1`, `MCP_TRANSPORT=stdio`, `NODE_ENV=production`, `JADE_SESSION_COOKIE=` (blank). `docker-compose.yaml` modified: `build:` block removed, image pinned by digest `ghcr.io/russellbrenner/auslaw-mcp@sha256:480e8968b34e43d6d4a6eec3c43ca4dc0d98e63e08faf3645fb8fafb1a307ced`, isolated network added. Resulting network: `auslaw-mcp_auslaw-isolated` on bridge `br-09cccc527fb4` — confirmed NOT connected to any `ai-stack_*` network. Why: running a known-digest image on a name-isolated bridge prevents accidental exposure of Arcanthyr internals (D1/Qdrant/Ollama) and guarantees deterministic behaviour across restarts.

- **MCP registered in Windows Claude Code** — user-scope MCP named `auslaw` in `C:\Users\Hogan\.claude.json`. Transport: SSH-wrapped `docker exec -i auslaw-mcp node /app/dist/index.js`. After PowerShell quoting issues (single-quote JSON mangling), settled on `claude mcp add-json` with backtick-escaped double-quoted JSON as the reliable registration pattern. Verified: 10 tools exposed, including `search_cases`, `search_by_citation`, `format_citation`, `jade_citation_lookup`.

- **Runtime traffic validated via tcpdump** — `tcpdump` on `br-09cccc527fb4` with `-Z tom` for user-owned pcap (passwordless sudo rejected as worse security posture). Fired 5 test queries; captured 53 packets. Single destination: `138.25.65.147` → `posh.austlii.edu.au` (AustLII infra). Zero non-AustLII/jade.io traffic — no CDN, telemetry, or surprise hosts. `search_cases` timed out twice (diagnosed as AustLII CGI endpoint slowness — see KNOWN ISSUES); `search_by_citation` round-tripped instantly, proving connectivity fine. Final verdict: GO.

- **Mid-session corrections** — `claude: command not found` on VPS (Claude Code CLI lives on Windows, not VPS — MCP is registered on Windows against the SSH-wrapped docker exec). `claude mcp add -- ssh ... -i` failed because `--` did not stop flag parsing → switched to `add-json`. PowerShell single-quote JSON mangling resolved via backtick-escaped double quotes. Initial `HTTPS_PROXY` via `/fetch-page` recommendation was wrong (not a CONNECT proxy). Scope drift flagged mid-session (work extended past "is it safe?" into full hardening); Tom chose to finish.

- **Session artefacts produced** — `audit-auslaw-mcp.sh` (clone-only static audit script), `github-mcp-setup.md` (guide for official `github/github-mcp-server` with read-only PAT + `--read-only` flag), `claude-code-prompts.md` (two self-contained CC prompts for audit + GitHub MCP install), `auslaw-mcp-deployment-prompt.md` (six-phase hardened deployment prompt: prep → ask → clone/modify → validate → first-run+tcpdump → go/no-go). All saved to session outputs.

- **Deferred this session** — (1) rate budget in `/fetch-page` to protect daily scraper allowance, (2) compose resource limits (`mem_limit: 1g`, `cpus: '1.0'`), (3) filesystem hardening (`read_only: true` + `tmpfs: [/tmp]`), (4) GitHub MCP install (guide written, existing `github` MCP already wired). Tracked as Outstanding Priority #7.

## CHANGES THIS SESSION (session 73) — 19 April 2026

- **Three-stage retrieval deploy — 13P/9Pa/9M (session 64) → 24P/4Pa/3M (session 73)** — +11 passes, −5 partials, −6 misses across one session's work. Zero P→F regressions at any intermediate checkpoint. Stages:
  1. Vocabulary-anchor re-embed completion (pre-session work concluded this session with first baseline rerun): 13P/9Pa/9M → 18P/7Pa/6M.
  2. Stub quarantine deploy across all three Qdrant passes: 18P/7Pa/6M → 22P/6Pa/3M.
  3. BM25 case_chunks_fts pass deployed (append+boost mode): 22P/6Pa/3M → 24P/4Pa/3M.

- **Stub quarantine — Qdrant payload update + server.py must_not filter across all three passes** — (a) `quarantine_stubs.py` executed on VPS via host venv at `/tmp/qvenv`; set `quarantined=true` on 253 Qdrant points (all `source_table='secondary_sources'`, `quarantine_reason='stub_short_text'`). Dry-run verified count=253 before real run. (b) server.py Pass 3 patched first with `must_not=[FieldCondition(key="quarantined", match=MatchValue(value=True))]` inside the existing `Filter(must=[type=secondary_source])` block. (c) Design gap discovered during filter-efficacy smoke test: "Activation for Young Offenders - Public Interest" (a quarantined stub) still appearing at 0.5008 via Pass 1 (which had no type filter, no quarantine filter). Same `must_not` clause extended to Pass 1 (new `query_filter=Filter(must_not=[...])` added — no existing Filter to extend) and Pass 2 (appended to existing `Filter(must=[type=case_chunk])` — defence-in-depth since case_chunks have no `quarantined` field, so it's a no-op for that pass). Final state: 3 `must_not` occurrences in server.py, one per pass. Verified via Q31 + Q16 canaries (both previously showed the stub at #1; both now show legitimate authorities).

- **BM25 case_chunks_fts pass — session 68 code deployed to VPS** — session 68 had written `fetch_case_chunks_fts()` + call site into the local `Arc v 4/server.py` but never SCP'd to VPS (session-closer false-commit pattern). Located at local lines 141–162 (function) + 519 (call site). Extracted as three hunks and applied to live VPS server.py as surgical additions (not whole-file overwrite — would have clobbered the three `must_not` patches landed earlier in the session). Pre-deploy verification: `BM25_SCORE_KEYWORD` (1/(60+12)≈0.0139), `SM_PENALTY` (0.65), `SM_ALLOW` ({'criminal','mixed'}), `seen_ids`, `sm_cache` all confirmed already defined on live VPS in correct scope. `existing_ids` initialization moved out of `if refs:` block per session 68 spec (prevents NameError on queries with no section refs). FTS pass calls Worker `GET /api/pipeline/case-chunks-fts-search` (already live since session 68), stop-word filters query, OR-joins up to 8 terms, 10s timeout. New chunks tagged `bm25_source="case_chunks_fts"`; existing chunks get additive `BM25_SCORE_KEYWORD` boost.

- **top_k=12 server-side cap identified during Phase 4 canary** — CC found server.py line 296: `top_k = min(int(body.get("top_k", 6)), 12)` — `/search` endpoint hard-caps at 12 regardless of requested top_k. FTS new-chunk recall is therefore structurally gated: FTS hits score ~0.009 raw, semantic hits score 0.45+, so new FTS chunks cannot surface into final output when semantic fills top 12. BM25 append value is concentrated in the boost path (confirmed via Q7 lifting 0.6633→0.6772, Q21 lifting 0.6600→0.6739, Q9 lifting 0.6424→0.7016 flipping Pa→P). New-chunk path dormant until interleave lands. Logged as KNOWN ISSUES entry. Interleave evaluation (new Priority #1) specifically addresses.

- **Q12 diagnosis — "hostile witness" vs "unfavourable witness"** — Tom confirmed corpus uses statutory term throughout (Hogan on Crime, EA, cases); "hostile witness" is practitioner vernacular not present in source text. FTS cannot bridge (keyword not in corpus). New category of anchor work identified: practitioner↔statutory vocabulary aliasing, distinct from session 65's domain-language anchoring. Added as new Priority #2. Likely candidates for same treatment from baseline partials: Q10, Q14, Q23, Q24.

- **Quick Search + auslaw-mcp integration architecture review** — Reviewed the two build plans (No-MCP and MCP versions) against the newly-deployed auslaw-mcp. Conclusion: Quick Search corpus FTS + AustLII proxy tab for arcanthyr.com (different user: practitioner at bar table) is orthogonal to auslaw-mcp (developer/researcher in CC sessions). Phase 2 AustLII keyword search will inherit the AustLII CGI slowness documented in the auslaw-mcp `search_cases` timeout KNOWN ISSUE — worth building timeout tolerance into the Phase 2 UX. Phase 5 (full-judgment fetch + reading pane) remains worth building directly against `/fetch-page` rather than routing through an auslaw-mcp HTTP bridge. Track 2 (remote MCP at `auslaw.arcanthyr.com`) deferred indefinitely — auslaw-mcp in CC covers 90% of the use case; the remaining 10% (browser-based claude.ai sessions needing auslaw tools) is too narrow to justify the nginx/SSL/subdomain/auth/maintenance tax. Added as Priority #6 but deliberately ranked below retrieval-side work.

- **Deploy pattern — mid-session patching without whole-file SCP** — The BM25 FTS deploy successfully demonstrated: (1) identify session-written code in local copy, (2) map to live VPS file via line-number recon after intervening patches shifted positions, (3) verify all module-level constants/helpers referenced by new code exist in live VPS, (4) produce unified diff against live VPS (not local), (5) check for Filter-block overlap with earlier patches, (6) apply surgically via hex-ssh. Pattern is reusable for any future "session N code written locally, not deployed" backlog.

- **Session-closer false-commit pattern observed again** — Session 68 closer logged `fetch_case_chunks_fts()` as deployed; VPS file did not contain it. CLAUDE.md already flags this as known session-closer failure mode. No new mitigation — grep verification step in this closer and Tom's `git status` post-commit rule remain the controls.

## CHANGES THIS SESSION (session 74) — 19 April 2026

- **BM25 interleave deployed — 24P/4Pa/3M → 26P/3Pa/2M** — +2P, −1Pa, −1M, zero P→F regressions. Novel FTS hits now land at synthetic score 0.50 (was 0.0139 append mode), competing with borderline semantic (Pass 1 threshold 0.45) while strong semantic (0.65+) remains untouchable by score math. Q8 Pa→P (Police v FRS to #1 over s55 relevance chunk). Q16 M→P (Neill-Fraser appellate material [2021] TASCCA 12 semantic + [2019] TASSC 10 FTS novel — both were in corpus all along). Q14 stays Pa (Hefny v Barnes [2021] TASSC 4 surfaces via FTS but applies leading-questions rule rather than stating it; remains Priority #1 aliasing territory).

- **Split-constant design — BM25_SCORE_KEYWORD / BM25_INTERLEAVE_SCORE separated** — Plan doc (BM25_INTERLEAVE_EVALUATION_PLAN.md) specified a single-constant swap (0.0139 → 0.50 on BM25_SCORE_KEYWORD). CC surfaced at Phase 0 review that this would break the boost path at line 536: semantic 0.47 + 0.50 additive boost = 0.97, floating borderline-semantic-plus-FTS-match chunks above genuine strong Pass 1 results on other queries — direct reintroduction of the RRF-era vocabulary-contamination failure mode. Patched by splitting: BM25_SCORE_KEYWORD stays at 0.0139 (line 31, boost path additive delta, gentle nudge preserved); new BM25_INTERLEAVE_SCORE=0.50 (line 32, novel-hit path only at line 542). Final patch: two lines touched, one added. The plan doc's Change 2 (redundant `chunks.sort()` before domain filter) was skipped — live-code audit showed line 587 already performs a flat score sort as the final operation; adding a second sort three lines earlier was a byte-identical no-op.

- **Q16 corpus-gap diagnosis refuted — retrieval gap, not content gap** — Session 73 KNOWN ISSUES stated "no appellate Neill-Fraser material in corpus". Session 74 interleave deploy surfaced [2021] TASCCA 12 (Pass 1 semantic, 0.5834, CCA DNA secondary-transfer discussion) and [2019] TASSC 10 (FTS novel, 0.5000, SC Chappell DNA). Both confirmed genuine Neill-Fraser appellate proceedings by Tom. Material was in corpus all session 73; semantic alone couldn't bridge the vocabulary gap between "neill fraser dna secondary transfer" and the chunks' phrasing. Lesson logged to CLAUDE_decisions.md: exhaust retrieval angles (FTS, interleave, query variants) before declaring corpus gaps.

- **Deploy hygiene — CLAUDE_init.md stale entries surfaced** — Two commands in CLAUDE_init.md's post-deploy validation sequence returned errors on this session's force-recreate: (a) `docker inspect ai-stack-agent-general-1` — container does not exist under that name (Compose v2 naming differs); (b) `curl localhost:18789/status` — server.py has no /status route, returned `{"error": "not found"}`. Neither error indicates a deploy failure: clean force-recreate confirmed via `docker compose logs --tail=20 agent-general` showing fresh `Nexus ingest server running on port 18789`. CLAUDE_init.md updated with correct discovery patterns.

- **Baseline snapshots preserved** — Session 73 baseline saved as `~/retrieval_baseline_pre_interleave.txt`. Session 74 baseline to be saved as `~/retrieval_baseline_post_interleave.txt`. Three-point history: pre_reembed → post_reembed → pre_interleave → post_interleave (the last is live `results.txt`).

- **Opener workflow validated end-to-end** — `set_active_account` + D1 health check via Cloudflare MCP confirmed clean state at session open (real backlog 0, quarantined_chunks 253, must_not count 3) before any code work. Pattern reusable for all future sessions involving server.py edits.

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