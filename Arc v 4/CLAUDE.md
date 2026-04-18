@CLAUDE_arch.md

CLAUDE.md — Arcanthyr Session File
Updated: 18 April 2026 (end of session 70) · Supersedes all prior versions
Full architecture reference → CLAUDE_arch.md — UPLOAD EVERY SESSION alongside CLAUDE.md
Changelog archive → CLAUDE_changelog.md (sessions 21–65) — load conditionally

---

## SYSTEM STATE — 18 April 2026 (end of session 70)

| Component | Status |
|---|---|
| Qdrant general-docs-v2 | RE-EMBED IN PROGRESS — vocabulary anchor prepend deployed, ~12,600 case chunks remaining (down from 24,700) |
| D1 cases | 1,820 (scraper running) · 1,820 deep_enriched=1 · 0 stuck |
| D1 case_chunks | 25,253 total · embedded=0: ~12,600 (re-embed ~50% complete with vocabulary anchors) |
| D1 secondary_sources | 1,200 total (1,199 corpus + 1 nexus-save) · embedded=0: 0 (secondary source re-embed complete) |
| D1 case_chunks_fts | 25,236 rows — FTS5 index on case chunk enriched_text |
| D1 query_log | Active — answer_text + model columns added session 69, deleted soft-delete column added |
| D1 quarantined_chunks | 0 rows · stub quarantine table with signal columns, ready for post-baseline activation |
| D1 synthesis_feedback | 0 rows · route wired session 68 (POST /api/pipeline/feedback) |
| D1 case_citations | 6,959 rows |
| D1 case_legislation_refs | 5,147 rows |
| enrichment_poller | RUNNING — vocabulary anchor functions deployed · DO NOT MODIFY OR RESTART until re-embed completes |
| Cloudflare Queue | drained |
| Scraper | RUNNING (status uncertain — processed_date field unreliable; check scraper.log after 11am AEST) |
| arcanthyr.com | Live |
| Subject matter filter | LIVE · SM_PENALTY=0.65 · LEG_WHITELIST_CORE + LEG_WHITELIST_ADJACENT + keyword bridge LIVE · Domain filter UI LIVE |
| Stare decisis UI | LIVE |
| Save to Nexus | LIVE — approved column, approval gate, pending review in Library, delete action (D1+FTS5+Qdrant cleanup) |
| Query history | LIVE — answer_text + model stored per query, side panel on Research page, click-to-view, Save to Nexus / Delete per entry |
| Baseline (31 queries) | 13P / 9Pa / 9M — session 64 (16 Apr 2026) · RE-RUN REQUIRED after re-embed completes |
| procedure_notes | 319 success / ~340 not_sentencing |

---

## OUTSTANDING PRIORITIES

1. **Re-embed baseline rerun** — BLOCKED on re-embed completion (~12,600 case chunks remaining, secondary sources complete). When `embedded=0` count hits zero, run full 31-query baseline. Compare against session 64 (13P/9Pa/9M). This is the validation gate for the session 65 system review fixes.
2. **Deploy server.py BM25 case_chunks_fts pass** — code written and tested locally (session 68). `fetch_case_chunks_fts()` function + wiring into `search_text()` after existing BM25 layers. BLOCKED on re-embed completion — deploy after baseline so impact can be isolated. SCP + force-recreate required.
3. **Stub quarantine (Step 1 from session 64)** — soft-quarantine secondary_source rows with raw_text <300 chars; filter flag in Qdrant + quarantined_chunks D1 table (already created session 66); not hard delete. 253 stubs identified. Build after re-embed baseline confirms vocabulary anchor impact.
4. **BM25 interleave vs append** — evaluate interleaving BM25 results with semantic results instead of appending. Evaluation plan documented in `BM25_INTERLEAVE_EVALUATION_PLAN.md` (Arcanthyr Nexus). Evaluate after vocabulary anchors + FTS5 append are baselined.
5. **Query expansion** — rewrite user query into 3-4 semantic variants pre-Qdrant via Workers AI Qwen3. Highest long-term ROI. Build when simpler wins are measured. DEFERRED — vocabulary anchors (session 65 re-embed) solve the same recall problem from the embedding side; building both simultaneously prevents isolating which change helped.
6. **subject_matter filter Part 3** — re-embed backlog clears subject_matter into Qdrant payload (Parts 1+2 deployed). Deploy server.py MatchAny filter on Pass 3 once re-embed completes and baseline confirms no regression.

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
- **Q8 partial — root cause confirmed** — s55 (0.7272) and CW v R (0.7239) both from Pass 1, 0.0033 cosine gap · both have court="" (tier 1) so court hierarchy doesn't help · RRF was trialled session 41 but reverted (regression) · deferred until RRF retry conditions met (see CLAUDE_arch.md)
- **Workers AI content moderation** — Qwen3 blocks graphic evidence · CHUNK enrichment on GPT-4o-mini · Pass 1/Pass 2 still on Workers AI — monitor
- **striprtf** — not installed in agent-general container · RTF uploads will error · python-docx is installed (added Dockerfile.agent session 27) so DOCX uploads work
- **Word artifact noise** — 131 chunks cleaned 18 Mar 2026 · re-run gen_cleanup_sql.py if new Word-derived chunks ingested
- **FTS5 export limitation** — wrangler d1 export does not support virtual tables
- **Scraper no per-case resume** — progress file only stores court_year: "done"
- **Pass 2 (Qwen3) principles irrelevant** — CHUNK merge overwrites principles_extracted with chunk-level data · Pass 2 output never visible · PRINCIPLES_SPEC update session 22 has no practical effect until merge behaviour changes
- **Synthesis skip on null enriched_text** — performMerge synthesis call requires enrichedTexts.length > 0 · cases whose chunks have null enriched_text fall back to raw principle concatenation (old format)
- **Q1 retrieval regression (common assault)** — Misuse of Drugs Act s1 scoring above assault chunk. Vocabulary anchor prepend (session 65) may resolve by anchoring both chunks to their correct domains. Re-test after re-embed completes.
- **Q11 retrieval regression (s138 voir dire)** — returning wrong Evidence Act sections. Vocabulary anchor prepend (session 65) will re-inject CONCEPTS terms (s138, voir dire, improperly obtained) at embedding time without re-enrichment. Re-test after re-embed completes.

---

## SESSION RULES

| Rule | Detail |
|---|---|
| Read this file first | Always |
| Upload both files | Upload CLAUDE.md AND CLAUDE_arch.md at the start of every session — both are required |
| Conditional file loading | Load CLAUDE_init.md only when the task involves CLI commands, wrangler deploys, Docker/SSH ops, or PowerShell scripting · Load CLAUDE_decisions.md only when making architectural changes, evaluating design tradeoffs, or when a past decision is directly relevant · Load CLAUDE_changelog.md only when investigating past sessions or debugging regressions to a specific date · Do not load any speculatively |
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

## CHANGES THIS SESSION (session 69) — 18 April 2026

- **Save to Nexus — full feature shipped** — synthesis answer promotion loop with staging queue. D1: `ALTER TABLE secondary_sources ADD COLUMN approved INTEGER DEFAULT 1` — existing 1,199 rows unaffected, only Save to Nexus rows land with approved=0. Worker: `handleFormatAndUpload` passes `approved=0` from body when present; new `handleApproveSecondary` route (POST /api/admin/approve-secondary, X-Nexus-Key) with approve/reject/delete actions; new `handlePendingNexus` route (GET /api/admin/pending-nexus, X-Nexus-Key); `fetch-secondary-for-embedding` SQL updated with `AND approved = 1` gate. Frontend: SaveFlagPanel in Research.jsx (inline confirmation panel with title/category/preview, not modal), Flag button (POST /api/pipeline/feedback). Library.jsx: PendingReviewSection in Secondary Sources tab (approve/reject per row, X-Nexus-Key input). Verified end-to-end: approved=0 blocks poller → approve flips gate → poller embeds → saved answer surfaces in retrieval at 0.51. Worker versions: `96751a35`, `b7fbe37f`. Commit `40eb0f9`. Why: promotes good synthesis answers back into corpus for future retrieval, with human review gate preventing self-reinforcing bad answers.

- **Save to Nexus — delete action for approved rows** — `handleApproveSecondary` extended with `action: "delete"`: deletes from Qdrant (via server.py /delete), FTS5, and D1 regardless of approved status. Library.jsx: delete icon on nexus-save rows + pending review section. Why: once approved and embedded, there was no way to remove a saved answer without manual D1+Qdrant cleanup.

- **Save to Nexus — date stamp on IDs and titles** — Nexus save slug format changed from `nexus-save-{timestamp}` to `nexus-save-{YYYY-MM-DD}-{timestamp}` for date visibility in Library table. Title pre-fill includes date suffix: `${queryText} (${today})`. Worker version `c0312c37`. Why: no date reference in saved answer IDs made it impossible to assess recency in Library or review queue.

- **Query history — full feature shipped** — D1: three columns added to query_log (`answer_text TEXT`, `model TEXT`, `deleted INTEGER DEFAULT 0`). Worker: both `handleLegalQuery` and `handleLegalQueryWorkersAI` extended to store `answer_text` and `model` ("sol"/"vger") in query_log INSERT. New `handleQueryHistory` route (GET /api/research/history, no auth, LIMIT 50, WHERE deleted=0 AND answer_text IS NOT NULL). New `handleQueryHistoryDelete` route (POST /api/research/history-delete, soft delete). Frontend: collapsible side panel on Research.jsx with scrollable list of past queries (query text truncated, date+time, model pill), click-to-view in reading pane without re-querying, Save to Nexus and Delete actions per entry, auto-prepend on new query, fetch on page load. api.js: `fetchQueryHistory()` and `deleteQueryHistory(id)` methods. Worker version `9bde6961`. Commit `104925a`. Why: Tom wanted to browse past queries, re-read answers without re-querying, and promote good answers to corpus.

- **Stuck case [2023] TASSC 6 fixed** — fired requeue-merge via PowerShell after fixing key extraction. Returned `requeued: 1`. Was the only case with deep_enriched=0 (14 chunks all done, merge never fired). Now all 1,820 cases deep_enriched=1. Why: stuck since session 68, blocking clean system state.

- **PowerShell base64 key extraction bug diagnosed** — `$key = (Select-String "NEXUS_SECRET_KEY" .env).Line.Split("=")[1]` produces 43-char key (strips trailing `=` from base64 padding). Fix: `Split("=",2)[1]` limits split to 2 parts, preserving the base64 `=`. Same root cause as the retrieval_baseline.sh bug fixed in sessions 61-63 (`cut -d= -f2` vs `cut -d= -f2-`). Requeue-merge was returning "Unauthorised" until this was fixed. CLAUDE_init.md updated.

- **CLAUDE_init.md cleanup** — removed stale "BROKEN at session 61 close" warning on retrieval_baseline.sh entry (line 180). Collapsed to single accurate line referencing session 64 confirmed-working status.

- **Re-embed progress confirmed** — secondary sources complete (0 remaining). Case chunks ~50% done (~12,600 remaining from 24,700). ETA ~1 hour from mid-session check. Poller running healthy — DO NOT restart or modify until complete.

- **Query phrasing sensitivity documented** — "elements of common assault" vs "what are the elements of common assault" produce different retrieval results. Root cause: embedding model treats filler words ("what", "are", "the") as signal, diluting the query vector and changing cosine distances to doctrine chunks. Not a bug — architectural limitation of single-pass embedding. Query expansion (Outstanding Priority #5) is the long-term fix.

- **Scraper status uncertain** — D1 shows 1,820 cases but `processed_date` is NULL on 1,805/1,820 rows. Determined `processed_date` is unreliable for tracking scraper activity — the queue path doesn't consistently set it. Most recent dated entries are from 29 March. Scraper log file check required after 11am AEST to confirm current activity.

- **Worker versions this session** — `96751a35` (Save to Nexus + Flag), `b7fbe37f` (delete action + date title), `c0312c37` (date in ID slug), `9bde6961` (query history)
- **Git commits this session** — `40eb0f9`, `104925a`

## CHANGES THIS SESSION (session 68) — 17 April 2026

- **query_log INSERT — deploy gap confirmed and fixed** — query_log table had 0 rows despite INSERT statements existing in worker.js. Root cause: session 65 deploy gap (code never reached production). Redeployed with version `44f7cfc4`, confirmed working — D1 shows 1 row after first test query. Both `handleLegalQuery` and `handleLegalQueryWorkersAI` now log: query_text, timestamp, refs_extracted, bm25_fired, result_ids, result_scores, result_sources, total_candidates, client_version (`v67-feedback`). Zero-result early return path also logs. `query_id` (UUID) added to both handlers and returned in response body for feedback loop wiring.

- **synthesis_feedback route wired** — `POST /api/pipeline/feedback` added to worker.js. X-Nexus-Key auth. Validates `feedback_type` against `['helpful','unhelpful','irrelevant','hallucinated']`. Requires `query_id` and `chunk_id`. Writes to `synthesis_feedback` D1 table with UUID id. Frontend thumbs up/down build documented as CC prompt (arcanthyr-ui not accessible from Cowork session).

- **BM25 case_chunks_fts pass — Worker route deployed, server.py written locally** — New Worker route `GET /api/pipeline/case-chunks-fts-search`: FTS5 MATCH query with JOIN to cases table, returns chunk_id/citation/enriched_text(800)/case_name/court/subject_matter, X-Nexus-Key auth, limit max 50. New server.py function `fetch_case_chunks_fts(query_text)`: stop-word filtering, OR-joined terms (max 8), 10s timeout. Wired into `search_text()` after existing BM25 case-law layer, before domain filter. Applies `apply_sm_penalty()`, dedupes against `seen_ids` + `existing_ids`, multi-signal boosts existing matches with `BM25_SCORE_KEYWORD` (~0.0139). Bug fix: `existing_ids` initialization moved before `if refs:` block (was inside it — would have caused NameError on queries with no section refs). **Server.py deploy BLOCKED on re-embed** — deploy after baseline so BM25 impact can be isolated.

- **BM25 interleave evaluation plan documented** — `BM25_INTERLEAVE_EVALUATION_PLAN.md` created in Arcanthyr Nexus. Design: start interleave score at 0.50 (just above Pass 1 threshold 0.45), only interleave novel hits not already in `seen_ids`, re-sort within appended pool only (strong Pass 1 results untouchable). Decision gate: pass count ≥ Part A baseline, zero pass→fail regressions allowed. Deferred until Part A (append at 0.0139) is deployed and baselined.

- **Stare decisis cited_by fix — deployed and verified** — `case_citations.cited_case` stores authority NAMES ("House v The King") extracted by xref_agent.py GPT, not bracket citations. `handleCaseAuthority` cited_by query was matching citation against name — always empty. Fix: resolves citation→case_name via `SELECT case_name FROM cases WHERE citation = ? LIMIT 1`, then matches `WHERE LOWER(TRIM(cc.cited_case)) = LOWER(TRIM(?))` on case_name. Verified live: well-cited case returned 33 cited_by results with correct treatment pills (Cited/Applied), legislation refs populated, zero-cited case correctly showing 0. Worker version `d90ab456`.

- **Corpus health audit** — D1 counts refreshed via Cloudflare MCP: 1,820 cases (1,819 deep_enriched), 25,253 chunks (24,400 embed backlog from re-embed), 1,199 secondary sources (299 embed backlog), 6,959 case_citations (up from 5,340 — xref nightly cron productive), 5,147 case_legislation_refs (up from 4,056). One stuck case: [2023] TASSC 6 — 14 chunks all done, deep_enriched=0 (merge never fired). Requeue-merge command documented in Outstanding Priorities.

- **worker.js version** — `d90ab456` (final, includes all session 68 changes: query_log fix, synthesis_feedback route, case-chunks-fts-search route, stare decisis cited_by name-match fix)

### Opus retrieval regression review — key conclusions
- Five failure modes confirmed (A, A′, B, C, D) — A and C are the active levers
- Do NOT use GPT-4o-mini to expand stubs from titles — hallucination risk for legal content, unacceptable
- Stub remediation: soft-quarantine (filter flag in Qdrant + quarantined_chunks D1 table) not hard delete — reversible
- Legislation penalty: whitelist approach — Core Criminal Acts (Evidence Act, Criminal Code, Sentencing Act, Bail Act, Justices Act, CJ(MI)A, Criminal Law (Detention and Interrogation) Act) exempt; adjacent Acts (Misuse of Drugs, Police Offences etc.) penalised unless keyword bridge matches query
- Sequencing: Step 0 (baseline freeze) → Step 1 (stub quarantine) → Step 2 (legislation whitelist) → Step 3 (vocab injection, deferred pending Opus prompt session) → Step 4 (re-baseline)
- Step 3 cost is LOW: 1,081 rows have Concepts terms recoverable from raw_text — no LLM re-derivation needed for most rows

### Outstanding after this session
- Stub quarantine (Step 1) — not yet built
- Legislation whitelist/penalty (Step 2) — not yet built
- Enrichment prompt fix — pending Opus session
- Vocab injection pass (Step 3) — pending Opus session + prompt fix
- Q27 (provocation), Q31 (right to silence) — confirmed corpus gaps, need authorship

## CHANGES THIS SESSION (session 70) — 18 April 2026

- **CLAUDE.md restructured — 1,598 → 413 lines (74% reduction)** — reordered from rules-first to state-first layout: SYSTEM STATE → OUTSTANDING PRIORITIES → KNOWN ISSUES → SESSION RULES → changelog (last 3 sessions) → END-OF-SESSION/POLLER/BASELINE procedures. Operational content now in first 190 lines. Truncation-tolerance note added to SESSION RULES table. CLAUDE_changelog.md conditional loading rule added. Why: 82% of CLAUDE.md was changelog history (sessions 21–69); context dilution was degrading Claude's attention to operational rules. Context engineering wiki article recommends 150–200 line context files; 413 is within the 500-line skill-file ceiling.

- **CLAUDE_changelog.md created** — new fifth file archiving 49 session changelog blocks (sessions 21–65) in reverse chronological order, 1,176 lines. Load condition: "Load when investigating past sessions or debugging regressions to a specific date." Conditional loading rule added to SESSION RULES table. Why: changelog history has reference value for regression debugging but zero session-start operational value; moving it to a conditionally-loaded file preserves access without context cost.

- **FUTURE ROADMAP moved to CLAUDE_arch.md exclusively** — removed from CLAUDE.md, CLAUDE_arch.md section marked as canonical location with reconciliation note. "Agent work (post-corpus validation)" item added (was only in the CLAUDE.md copy). Why: roadmap is architectural aspiration, not operational instruction; having it in both files caused reconciliation drift at session close.

- **Session-closer skill updated** — new insertion point (before `## END-OF-SESSION UPDATE PROCEDURE`, not append-to-end), archival step for oldest changelog block (maintains 3-block retention window), roadmap reconciliation step against CLAUDE_arch.md FUTURE ROADMAP, verification step (grep for 3 blocks, confirm insertion point, read back priorities/issues). Written to Arcanthyr Nexus as `UPDATED_SESSION_CLOSER_SKILL.md` (Cowork skills dir is read-only). Why: session-closer is a hard dependency of the restructure — without the updated insertion logic, the closer would append changelogs at the end of the file and break the layout on first post-restructure run.

- **Structure review document produced** — `CLAUDE_MD_STRUCTURE_REVIEW.md` written to Arcanthyr Nexus with analysis of all four questions (archival cutoff, file split validity, conversation archive home, truncation fix), risk assessments per recommendation, and implementation sequencing.

- **Key decisions this session** — 3-session retention window (not date-based or relevance-based); state-first section order (not rules-first); CLAUDE_changelog.md as separate fifth file (not folded into CLAUDE_decisions.md); conversation archive reasoning → CLAUDE_decisions.md, rich flows → Vault wiki; skip hand-maintained CLAUDE_decisions.md summary (rely on conditional loading + future extract_decisions.py enhancement if needed).

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
