@CLAUDE_arch.md

CLAUDE.md — Arcanthyr Session File
Updated: 14 April 2026 (end of session 55) · Supersedes all prior versions
Full architecture reference → CLAUDE_arch.md — UPLOAD EVERY SESSION alongside CLAUDE.md

---

## SESSION RULES

| Rule | Detail |
|---|---|
| Read this file first | Always |
| Upload both files | Upload CLAUDE.md AND CLAUDE_arch.md at the start of every session — both are required |
| Conditional file loading | Load CLAUDE_init.md only when the task involves CLI commands, wrangler deploys, Docker/SSH ops, or PowerShell scripting · Load CLAUDE_decisions.md only when making architectural changes, evaluating design tradeoffs, or when a past decision is directly relevant · Do not load either speculatively |
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
| retrieval_baseline.sh | KEY now auto-reads from ~/ai-stack/.env — no manual export needed · still requires query_text field · results in ~/retrieval_baseline_results.txt |
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
| BM25_FTS_ENABLED | Kill switch REMOVED — variable does not exist in current server.py. BM25/FTS5 pass runs unconditionally when section references are present. Confirmed session 27. |
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
| requeue admin routes | POST /api/admin/requeue-chunks — re-enqueues done=0 chunks · POST /api/admin/requeue-metadata — re-enqueues enriched=0 cases · POST /api/admin/requeue-merge — re-triggers merge for deep_enriched=0 cases where all chunks done · all require X-Nexus-Key · read key from .env with $key = (Select-String "NEXUS_SECRET_KEY" .env).Line.Split("=")[1] |
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

**Tooling:**
- Claude.ai — architecture, planning, debugging, writing CLAUDE.md, code review
- Claude Code (VS Code) — file edits, terminal commands, git, wrangler deploys
- PowerShell / SSH — VPS runtime commands, long-running Python scripts

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

## SYSTEM STATE — 13 April 2026 (end of session 51)

| Component | Status |
|---|---|
| Qdrant general-docs-v2 | vectors updated · 6 secondary source chunks re-embedded this session |
| D1 cases | 1,234+ (scraper running) · all deep_enriched=1 |
| D1 case_chunks | 18,271+ · all embedded |
| D1 secondary_sources | 1,201 total · all embedded=1 |
| enrichment_poller | RUNNING |
| Cloudflare Queue | drained |
| Scraper | RUNNING |
| arcanthyr.com | Live |
| Subject matter filter | LIVE · SM_PENALTY=0.65 · cache loaded 1,234 entries |
| Baseline (31 queries) | 12 pass / ~13 partial / 3 miss (corpus gap) |
| procedure_notes | 89/516 at session start · fix deployed · full requeue running overnight · verify count next session |

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

## OUTSTANDING PRIORITIES

6. **Pass 2 (Qwen3) prompt quality review** — DEFERRED · low urgency since merge synthesis bypasses Pass 2 output entirely · PRINCIPLES_SPEC never updated for Qwen3-30b but has no practical effect
7. **subject_matter filter — DEPLOYED session 51 (cache-based penalty)** — SM_PENALTY=0.65 applied to non-criminal/non-mixed case_chunk results in Pass 1 and Pass 2 via hourly in-memory cache from `GET /api/pipeline/case-subjects` Worker route · misclassification audit partially complete: Pilling cases correctly administrative (workers comp — not criminal); 3 genuine misclassifications corrected ([2021] TASMC 13, [2020] TASSC 16, [2022] TASSC 69) · full audit recommended before Option A (Qdrant payload re-embed) — low urgency now that cache penalty is delivering results · Tasmania v Rattigan audit status unverified this session
8. **Domain filter UI — potentially unblockable** — SM filter now live server-side · UI chip (All / Criminal / Administrative / Civil) would communicate filter param through Worker to server.py · prerequisite: confirm misclassification audit complete so filter is reliable · CC prompt drafted and ready
9. **Arcanthyr MCP server — post-scraper milestone** — thin wrapper over existing server.py search + D1 routes · deploy on VPS as public HTTPS endpoint · connect via claude.ai Customize → Connectors · per-user API key auth · buildable in one session · prerequisite: scraper completion + subject_matter filter deployed so MCP queries return clean criminal-scoped results
10. **Citation authority agent — post-scraper milestone** — pure SQL traversal over authorities_extracted · produces ranked authority summaries per topic · ingest as secondary_source chunks via existing pipeline · no embedding changes · no new infrastructure · run quarterly as corpus maintenance cron · prerequisite: scraper completion (network too sparse at current volume)
11. **Local/office deployment — post-MCP milestone** — export D1 as SQLite + Qdrant snapshot · run on office server or NAS · nightly sync from VPS pipeline · MCP server points at local instance for fast queries · prerequisite: MCP server built and validated first

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

---

## CHANGES THIS SESSION (session 40) — 5 April 2026

- **Header chunk null enriched_text documented** — `chunk_index=0` rows with `done=1, enriched_text IS NULL, embedded=1` confirmed as expected behavior, not pipeline fault. CHUNK v3 classifies as `header` type, writes no enriched prose. Poller falls back to `chunk_text`. 20 confirmed cases. Added to CLAUDE_arch.md case_chunks D1 schema section. Why: recurring question across sessions — documenting prevents re-investigation.

- **Retrieval baseline rerun (session 40)** — 18 questions, 10 pass / 5 partial / 0 miss. Matches session 36 result. No regressions from block_023/028 corpus additions. `.env` path bug in `retrieval_baseline.sh` fixed on VPS (was reading `~/ai-stack/.env`, file is `.env.secrets`). Why: needed fresh baseline after session 37 corpus additions.

- **Item 1 (Restore Claude API key) confirmed moot** — Sol (Claude API toggle) tested on arcanthyr.com and working. Wrangler secret `ANTHROPIC_API_KEY` is set and functional. VPS .env reference was stale context from when server.py used Claude API directly (now uses Qwen3). Removed from both roadmaps. Why: roadmap item was blocking other priorities unnecessarily.

- **Item 2 (malformed corpus row) FIXED** — `hoc-b{BLOCK_NUMBER}-m001-drug-treatment-orders` stale Qdrant point (`b9bcd0d5`) deleted. D1 was already clean (fixed session 24). Correct point (`8f56e796`, `hoc-b054-m001-drug-treatment-orders`) confirmed present with correct `citation` and `source_id` payload. Correct block number: 054 (master_corpus_part2.md:13969). Removed from both roadmaps. Why: been on roadmap since session 13.

- **RRF displacement — full investigation and architectural decision** — discovered there is NO RRF in the codebase. Four separate Qdrant calls (Pass 1, concept search, Pass 2 case chunks, Pass 3 secondary sources) run sequentially. Pass 2/3 append after sorted+capped Pass 1 block. BM25 results hardcoded at score 0.0. No multi-signal reward — chunks appearing in multiple passes just deduped. CC read full `search_text()` function via hex-ssh. CC used Context7 to confirm Qdrant supports native RRF via `prefetch` + `FusionQuery`. Opus consultation recommended: Qdrant-native RRF (four legs in one call) + Python-side BM25 synthetic scoring. `extract_legal_concepts()` confirmed as regex-only (no latency concern for prefetch model). Implementation plan: Step 1 (Qdrant RRF) + Step 2 (BM25 scoring) together, then tune. Prerequisite: check Qdrant client version for prefetch score_threshold support. Why: systemic retrieval quality ceiling — all five persistent partials traced to lack of cross-pass ranking.

- **CC vs manual SSH rule added** — simple read/run commands (baseline, logs, single queries) faster done manually via SSH. CC with hex-ssh for multi-step VPS file edits, diagnosis across multiple files, or replacing SCP round-trips.

## CHANGES THIS SESSION (session 42) — 5 April 2026

- **RRF implementation reverted — sequential passes restored** — session 41 RRF deployment caused retrieval regression: baseline moved from 10/5/0 (session 40) to ~8/2/4. Root cause: wrong-domain chunks accumulating multi-leg RRF score by matching surface vocabulary across legs — e.g. self-defence "reasonable belief" chunks scoring 1.5 on "beyond reasonable doubt" query by appearing in both unfiltered leg and concept leg. Sequential pass architecture restored (Pass 1 cosine → Pass 2 case chunks appended → Pass 3 secondary sources appended → BM25 last). Court hierarchy band restored to 0.05 on cosine scores. `extract_legal_concepts()` function deleted — was only used for Leg B. Post-revert baseline: 10/5/0, matching session 40. Why reverted: RRF requires independent retrieval signals across legs — Leg B was the same embedding model on a munged version of the same query, providing no independent signal. At ~10K vectors, same chunks dominated all legs. Why documented fully: Opus recommended RRF in session 40; implementation was technically correct but corpus and embedding architecture weren't ready for it.

- **RRF retry conditions documented** — per Opus session 42 analysis, RRF should not be retried until: (1) corpus >50K vectors — diversity across legs requires enough vectors that different legs surface genuinely different candidates; (2) independent retrieval signals — Leg B needs a truly different signal such as a different embedding model, learned sparse encoder (SPLADE), or native BM25 as a prefetch leg; (3) per-leg diagnostics — log each leg's top-3 independently before fusing so noise injection is visible; (4) comprehensive doctrine chunk coverage — corpus gaps cause RRF to amplify wrong-domain chunks that happen to match query vocabulary. Added to CLAUDE_arch.md retrieval decisions section.

- **Opus referral process — lesson learned** — Opus architectural recommendation (session 40) went straight to implementation without a post-deploy baseline rerun gate. Rule added: any Opus recommendation replacing working retrieval logic requires a baseline rerun as the first post-deploy step before further work. Rollback plan must be identified before implementation begins.

- **Q2 CONCEPTS fixes — self-defence disambiguation** — three secondary source chunks updated via Cloudflare MCP direct D1 write (update-secondary-raw route returns 404 for IDs containing spaces): (1) Reasonableness of Belief in Defense Case Overview — CONCEPTS rewritten to scope explicitly to self-defence/honest and reasonable mistake, removing generic "legal standards" vocabulary that was matching BRD queries; (2) hoc-b057-m001-beyond-reasonable-doubt — CONCEPTS expanded with explicit BRD terms (beyond reasonable doubt, criminal standard, s141, Green v The Queen, Walters v R, acquittal); (3) hoc-brd-m001-beyond-reasonable-doubt-criminal-standard — raw_text cleaned (block header markup was embedded into vector), CONCEPTS confirmed comprehensive. All three reset to embedded=0 via MCP, poller re-embedding. Why: Q2 was returning self-defence "reasonable belief" chunks at pos 1 score 1.5 — semantic overlap on "reasonable" + "standard" vocabulary was beating two existing BRD chunks.

- **BRD chunk — pre-existing corpus entry confirmed** — hoc-b057-m001-beyond-reasonable-doubt existed since session 13 (March 2026). Q2 failure was not a corpus gap — it was a CONCEPTS scoping problem on the competing self-defence chunks. New chunk hoc-brd-m001-beyond-reasonable-doubt-criminal-standard added as supplementary entry; raw_text cleaned of block header markup via MCP.

- **subject_matter filter — deferred with full design documented** — Q14 ("leading questions examination in chief") partial diagnosed: coronial case_chunk (court=supreme, subject_matter=administrative) beating s37 legislation chunk by 0.0008 cosine — effectively noise. Root cause: Pass 1 is unfiltered, court hierarchy re-rank discriminates by court tier not by subject matter. Subject_matter misclassification confirmed as real risk before any filter is applied: Tasmania v Rattigan [2021] TASSC 28 and Tasmania v Pilling [2020] TASSC 13 both classified as "administrative" despite being criminal cases. Corpus is 320 criminal / 393 non-criminal (55% non-criminal) — ratio will worsen as scraper runs. Full design for next session: see CLAUDE_arch.md subject_matter filter section. Why deferred: misclassification audit required before filter can be safely applied; re-embed required to get subject_matter into Qdrant payload for Pass 1 filtering.

- **update-secondary-raw 404 on IDs with spaces** — route returns "not found" for secondary source IDs containing spaces (e.g. "Reasonableness of Belief in Defense Case Overview"). Workaround: use Cloudflare Developer Platform MCP to write directly to D1. Root cause not diagnosed — likely the Worker route is doing an exact string match that fails on URL-encoded spaces. Added to known issues.

- **System state** — 722 cases (719 deep_enriched) · 11,729 chunks (11,639 embedded, 90 pending poller) · 1,199 secondary sources (all embedded) · scraper running.

- **Domain filter chip — trial implementation designed, not yet built** — UI design completed for a row of filter chips above the search input: [All] [Criminal] [Civil] [Administrative], defaulting to Criminal. Soft score penalty (0.80 multiplier) applied to non-matching case chunks in Pass 2 after a batched D1 subject_matter lookup. Isolated implementation designed: new DomainFilter.jsx component, one parameter added to Worker and server.py each, full revert is delete one file + remove ~10 lines across four files. Not yet implemented — deferred until subject_matter misclassification audit complete (Option A prerequisite). CC prompt fully drafted and ready for next session.

- **Citation authority agent — architecture confirmed** — agent traversal over authorities_extracted JSON in D1 confirmed viable without any embedding or re-embed. Each case stores authorities_extracted as a structured JSON array with fields: name (cited case), treatment (cited/applied/considered/distinguished), proposition (what it was cited for). Pure SQL aggregation across the corpus produces citation frequency rankings per topic. Agent output to be ingested as secondary_source chunks via existing pipeline — surfaces naturally in retrieval, zero new infrastructure. Prerequisite: scraper completion (citation network only meaningful at scale). Scheduled as post-scraper-completion milestone.

- **Arcanthyr MCP server — architecture confirmed, roadmap item added** — confirmed buildable as thin wrapper over existing server.py search endpoint and D1 routes. Colleagues connect via claude.ai Customize → Connectors — paste URL, one click, no local installation required. Available on Free (1 connector), Pro, Max, Team, Enterprise plans. Team/Enterprise: Owner adds once to org, colleagues enable individually. MCP server must be publicly reachable over HTTPS from Anthropic IP ranges — VPS already meets this requirement. Auth via per-user API keys on top of existing NEXUS_SECRET_KEY pattern. Protocol is AI-agnostic — ChatGPT, local models, LangChain agents can all call the same MCP tools once OpenAI MCP support is production-ready. Why significant: corpus becomes AI-agnostic asset; any AI is interchangeable reasoning layer on top.

- **Local/office deployment — architecture confirmed, roadmap item added** — full corpus at scraper completion estimated 10-12GB (D1 ~1.5-2GB SQLite, Qdrant ~4-6GB vectors + payload, raw text ~5GB). Both components fully portable: D1 exports as standard SQLite, Qdrant has native snapshot/restore. Local deployment runs on spare PC or NAS (16GB RAM, SSD sufficient). Office sharing via local network: Qdrant + SQLite + server.py on office server, all practitioners hit same instance. Recommended end state: Option C — cloud VPS handles pipeline (scraper, enrichment, queue), nightly sync to local read replica for fast practitioner queries. SQLite concurrent write limitation noted — adequate for small office, PostgreSQL migration path available if needed at scale. Arcanthyr UI role in local deployment: corpus management and ingestion interface; MCP server for querying.

- **"Leading authorities on X" query type — confirmed viable with current architecture** — current semantic retrieval surfaces relevant cases adequately for practitioner use (user can assess authority from returned list). Court hierarchy re-rank provides partial authority signal. Full citation-frequency ranking not required at current corpus size — meaningful only post-scraper-completion when network is dense enough to be reliable. authorities_extracted already being populated by pipeline on every case — no pipeline changes needed before the agent pass.

## CHANGES THIS SESSION (session 41) — 5 April 2026

- **Qdrant-native RRF implemented** — `search_text()` in server.py refactored: four separate `client.query_points()` calls (Pass 1, 1b, 2, 3) replaced with single call using `Prefetch` legs + `FusionQuery(fusion=Fusion.RRF)`, limit=top_k*3 (overfetch). Legs: A (unfiltered semantic, threshold 0.45), B (concept vector, conditional on concept_query non-None, threshold 0.45), C (case_chunk filtered, threshold 0.35), D (secondary_source filtered, threshold 0.25). Why: multi-signal reward for chunks appearing in multiple legs; resolves cosine score noise that caused Q8 partials; net code reduction.

- **BM25 synthetic scoring implemented** — BM25/FTS5 results previously injected at score=0.0 now receive synthetic RRF-equivalent scores: `BM25_SCORE_EXACT_SECTION = 1/(60+3)` (~0.0159) for section ref matches, `BM25_SCORE_CASE_REF = 1/(60+8)` (~0.0147) for case-by-legislation-ref matches. Multi-signal boost added: if BM25 chunk already exists in fused Qdrant results, score is added rather than inserting duplicate. Final sort + top_k cap moved to after BM25 merge. Why: BM25 hits at 0.0 were not competing with Qdrant results — exact section reference matches now rank competitively.

- **Court hierarchy band recalibrated** — band constant changed from 0.05 to 0.005. Why: RRF scores are ~0.015–0.025 range, not cosine 0–1 range; old band was too wide and meaningless on RRF scores.

- **Unified conversion loop** — all Qdrant result types now use same conversion path post-fusion. Every chunk dict sets `_id = payload.get('chunk_id')` (present for case_chunk, None for others) and `_qdrant_id = str(hit.id)`. Why: case chunks previously had separate dedup key; unified path required for single fused result set.

- **`query_filter` → `filter` fix** — Prefetch constructor parameter name corrected from `query_filter=` to `filter=`. Root cause: Pydantic validation error "Extra inputs are not permitted" — the installed qdrant-client version uses `filter=` not `query_filter=`. Symptom: zero chunks returned on all queries despite clean container startup. Why documented: parameter name differs from `query_points()` outer call which does use `query_filter=` — easy to confuse.

- **docker-compose.yml env fix** — agent-general service had secret vars (`NEXUS_SECRET_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `WORKER_URL`) in `environment:` block using `${VAR}` interpolation. With no `.env` file present (only `.env.secrets` and `.env.config`), docker compose expanded these to blank strings, and `environment:` takes precedence over `env_file:` — so secrets were always blank inside the container. Fix: removed secret vars from `environment:` block entirely; they now come exclusively from `env_file: [.env.secrets, .env.config]`. Non-secret service-discovery vars (OLLAMA_HOST, QDRANT_HOST, OLLAMA_URL, QDRANT_URL) remain in `environment:`. Why: auth was silently failing on every search request.

- **`AGENT_GENERAL_PORT=18789` added to `.env.config`** — port was undefined, causing docker compose to assign random ephemeral port on every restart. Baseline script targets 18789 hardcoded and was getting empty responses. Why: without this var set, every force-recreate requires manual `AGENT_GENERAL_PORT=18789` prefix.

- **Baseline result: 11/5/0** — up from session 40 baseline of 10/5/0. Partial queries: Q2 (BRD standard — belief test surfacing instead), Q4 (Boatwright probate chunk at position 2 — wrong domain), Q8 (s55 relevance chunk still at position 1), Q10 (failure-to-give-evidence chunk at position 1, not corroboration warning), Q14 (coronial inquiry chunk at position 1, not leading questions doctrine). Retrieval tuning is priority for session 42.

- **server.py version** — deployed with `query_filter` → `filter` fix, RRF + BM25 synthetic scoring live.

## CHANGES THIS SESSION (session 38) — 5 April 2026

- **MCP server installation — full stack** — nine MCP servers now active: Cloudflare Developer Platform (claude.ai connector, already present), Cloudflare API (mcp.cloudflare.com, full 2500+ endpoint coverage in Code Mode, authenticated to Tom's account), GitHub (already present), Context7 (live Wrangler/Qdrant/Vite docs), Playwright (browser automation + UI testing post-deploy), Sequential Thinking (structured reasoning), Fetch (raw HTTP, mcp-server-fetch via Anthropic PyPI), Firecrawl (already present), Magic (already present). All user-scope (global). hex-ssh-mcp (@levnikolaevich/hex-ssh-mcp) installed project-scoped in `Arc v 4/.mcp.json` (gitignored), locked to VPS host/dirs with REMOTE_SSH_MODE=safe. Why: eliminates wrangler relay for D1/Workers/KV queries; eliminates manual SCP round-trips once ssh-agent is configured; provides live library docs to prevent stale API suggestions; enables post-deploy UI verification without manual browser testing.

- **frontend-design plugin installed** — official Anthropic marketplace plugin (claude-plugins-official). Why: improves arcanthyr-ui console quality; targets production-grade UI patterns over generic AI aesthetics.

- **Skills repos cloned to ~/.claude/skills/** — three repos: `vercel-agent-skills` (7 skills: react-best-practices, web-design-guidelines, composition-patterns, react-native-skills, deploy-to-vercel, vercel-cli-with-tokens, react-view-transitions), `jezweb-claude-skills` (10 plugin categories: cloudflare, frontend, design-assets, dev-tools, integrations, shopify, wordpress, writing, social-media, plus statusline-npm tool), `alirezarezvani-claude-skills` (200+ Gemini-format skills + 7 Claude commands: focused-fix, review, security-scan, seo-auditor, plugin-audit, update-docs, git sub-commands). `.mcp.json` found in alirezarezvani repo (contained undisclosed Tessl platform onboarding) — deleted from cloned copy before use.

- **Security audit process established** — repeatable process for third-party tool adoption: audit every non-markdown file in candidate repo via Fetch MCP for raw content + Claude for Chrome for GitHub navigation before installation. Two findings this session: (1) `ancoleman/qdrant-rag-mcp` rejected — wrong embedding dimensions (384-dim default vs Arcanthyr's 1024-dim), would have created a parallel RAG system not a thin wrapper; (2) `alirezarezvani/claude-skills` .mcp.json contained undisclosed Tessl platform onboarding, deleted. All other repos cleared. Process documented in SESSION RULES.

- **hex-ssh smoke test — partial** — MCP connected to 31.220.86.192 but failed with `Encrypted private OpenSSH key detected, but no passphrase given`. Windows ssh-agent not yet configured. Action deferred to Outstanding Priorities #1.

- **`Arc v 4/.gitignore` updated** — `.mcp.json` added to prevent project-scoped MCP config (containing SSH key paths) from being committed.

- **`Arc v 4/.mcp.json` created** — stores hex-ssh project config. Gitignored. Not committed.

## CHANGES THIS SESSION (session 37) — 5 April 2026

- **handleFetchSectionsByReference FTS5 upgrade** — secondary sources section reference lookup upgraded from LIKE-only to dual LIKE+FTS5 pass. LIKE pass retained for structured IDs (e.g. `Evidence Act 2001 (Tas) s 38 - ...`). New FTS5 pass queries `secondary_sources_fts` with phrase MATCH on `"s N"` and `"section N"` — catches content-based references where chunk ID doesn't contain the section reference (e.g. `hoc-b048-m002`, `hoc-b049-m001`, `Irons v Moore`, `Prosecutor selection of witnesses`). Union of both result sets fed to server.py uncapped. Confirmed working via live D1 test — phrase query `"s 38"` returned 5 hits including 3 hoc-block content-based matches the LIKE pass missed. Worker version: `1a214936-5b13-429f-8efd-90d915e87413`. Why: LIKE on ID was silently missing all hoc-block chunks discussing a section in content but not encoding it in the ID.

- **TAMagC 2018-2025 recovery** — all 8 TAMagC year entries deleted from `scraper_progress.json`. AustLII TAMagC page confirmed back up (was returning 500 during sessions 34-36). Scraper will pick up TAMagC from case 1 for each year on next scheduled run. Why: entries were marked done during AustLII outage, blocking TAMagC from ever being scraped.

- **subject_matter retrieval filter — investigated and parked** — proposed UI dropdown filter (All Cases / Criminal / Administrative / Civil) investigated. D1 audit showed non-criminal cases are genuinely topically distinct (planning tribunals, workers comp, contract disputes) — not causing retrieval pollution in practice. Baseline is 10 pass / 5 partial with no failures attributable to non-criminal noise. Feature parked — not worth building. Removed from roadmap. Why: solution looking for a problem that doesn't exist in the current corpus.

- **Corpus content gaps — block_023 and block_028 authored and uploaded** — block_023 (quantity/possession/drug detection) and block_028 (Family Violence Act 2004 overview) drafted and uploaded via console. Both enriched=1 embedded=1 in D1. block_023 ID: `hoc-b023-m001-quantity-possession-detection-drug-offences`. block_028 ID: `manual-family-violence-act-2004-tas-key-provisions-and-practitioner-guidance` (auto-generated slug — modal was skipped on second upload, retrieval unaffected). Why: rag_blocks/ directory does not exist locally; source material for block_023 was genuinely empty in hogan_on_crime.md; both chunks required authoring rather than recovery.

- **worker.js version** — `1a214936-5b13-429f-8efd-90d915e87413`

- **arcanthyr-ui polish pass complete** — 10 fixes across tiers 1-3, commit `b9ffdc0`. Files changed: `index.css` (add @keyframes pulse), `ReadingPane.jsx` (aria-label on ×, Share + × hover feedback, ChunksTab pre→div), `Nav.jsx` (sigil accessible button wrap, NavLink hover bg), `Landing.jsx` (tagline contrast fix, grid-scroll overlay, pill hover fill). Skills installed at project level: `ui-ux-pro-max` (via uipro-cli), `superpowers` (systematic-debugging, software-architecture, using-git-worktrees), `varlock`. `.claude/` added to arcanthyr-ui `.gitignore`. Why: first dedicated UI polish pass — accessibility gaps, missing keyframes, hover feedback, and contrast failures addressed systematically using UI/UX Pro Max design system output.

## CHANGES THIS SESSION (session 39) — 5 April 2026

- **hex-ssh MCP unblocked** — hex-ssh was failing to connect on every session start. Root cause diagnosed: hex-ssh uses the `ssh2` Node library and reads the key file directly via `readFileSync` — no ssh-agent integration exists in the code. ssh-agent work was valid but irrelevant to hex-ssh. Two separate fixes required: (1) `.mcp.json` updated from `command: hex-ssh-mcp` (PS1 wrapper, unlaunchable by VS Code MCP host) to `command: node` with explicit path to `server.mjs`; (2) passphrase removed from `id_ed25519` via `ssh-keygen -p` — hex-ssh has no passphrase path so the key must be unencrypted. Smoke test passing: CC can now read VPS files directly without SCP. Why: deploy-gap pattern (sessions 25, 27, 35) was caused partly by inability to verify VPS file state from CC — hex-ssh closes this gap for read operations.

## CHANGES THIS SESSION (session 36) — 5 April 2026

- **Scraper Task Scheduler tasks re-enabled** — both `Arcanthyr Scraper` (8am AEST) and `run_scraper_evening` (6pm AEST) found Disabled (likely a Windows reboot reset). Re-enabled via PowerShell as Administrator. Scraper resumed from TASSC 2017/13. Why: tasks silently disabled, today's 8am run had not fired.

- **Boland v Boxall [2018] TASFC 11 recovered** — case had 0 chunks and deep_enriched=0 (METADATA queue message failed at original ingest). Fixed by setting enriched=0 and firing requeue-metadata with limit=1. Case fully processed within minutes: case_name populated, deep_enriched=1. Why: only unmerged case in corpus, identified during health check. All 580 cases now deep_enriched=1.

- **17 stuck header chunks closed out** — 17 case_chunks with done=1, embedded=0, enriched_text=NULL were invisible to the poller because `handleFetchCaseChunksForEmbedding` SQL has `AND enriched_text IS NOT NULL`. All are chunk__0 header chunks (court/citation/judge boilerplate) with no retrieval value. Fixed by setting embedded=1 directly (Option A). Why: Option B (removing IS NOT NULL gate, falling back to chunk_text) deferred — header chunks have no retrieval value and fixing the SQL would permanently embed low-value boilerplate vectors for all future cases. Option B added to roadmap as part of subject_matter filter work.

- **Retrieval baseline run (session 36)** — 18 questions. Result: 10 pass / 5 partial / 3 miss (Q8, Q11, Q13). Diagnosed all three gaps: Q8 propensity/tendency terminology mismatch, Q11 s138 chunks missing "voir dire" in CONCEPTS, Q13 tendency notice chunks missing "objection"/"voir dire"/"propensity" in CONCEPTS. All three were retrieval gaps, not corpus gaps. Why: first clean baseline run since session 31 — required before retrieval changes.

- **6 secondary source CONCEPTS lines enriched** — targeted raw_text updates via `update-secondary-raw` + `embedded=0` reset on: (1) CW v R [2010] VSCA 288 — added tendency/propensity/s97/s98/s101; (2) Police v FRS - Tendency Evidence Admissibility — added propensity/similar fact/s97/admissibility; (3) Police v FRS - Example Tendency Notice — added propensity/notice requirements/objection/voir dire/s97/s99; (4) Evidence Act 2001 (Tas) ss 97-98 — added propensity/notice requirements/objection/voir dire; (5) Evidence Act 2001 (Tas) s 138 - Improperly Obtained Evidence — added voir dire/s138 voir dire/admissibility hearing; (6) Illegally or improperly obtained evidence — added voir dire/balancing test/burden of proof/Bunning v Cross indicia. Why: CONCEPTS lines were too generic to surface on practitioner query language.

- **Baseline query wording updated for Q8, Q11, Q13** — `retrieval_baseline.sh` updated locally. Q8: `"propensity evidence criminal proceedings"` → `"tendency evidence propensity similar fact evidence criminal proceedings"`. Q11: `"voir dire admissibility Evidence Act s138"` → `"s138 improperly obtained evidence exclusion voir dire admissibility"`. Q13: `"tendency notice objection voir dire"` → `"tendency evidence notice requirements s97 objection admissibility"`. Why: original queries used query language that didn't match chunk language. SCP to VPS confirmed this session — all three updated query strings verified live on VPS.

- **Retrieval baseline rerun post-fixes** — 10 pass / 5 partial / 0 miss. Q11 → full pass (s138 chunk position 1, score 0.7471). Q13 → full pass (s99 legislation + notice requirements secondary source top 3). Q8 → partial (CW v R position 2, s55 relevance chunk still at position 1). Three misses eliminated. Why: CONCEPTS enrichment + query wording update effective.

## CHANGES THIS SESSION (session 35) — 4 April 2026

- **Case chunk pass dedup fix** — `_qdrant_id` guard added to case chunk second-pass in `search_text()`. Previously deduped against `{c.get("_id") for c in chunks if "_id" in c}` — only matched chunks added by the case chunk pass itself (stored with key `_id`), never chunks from the main semantic pass (stored with `_qdrant_id`). Fix mirrors Pass 3 secondary source pattern: `existing_qdrant_ids_cc` built from all existing chunks' `_qdrant_id` values; guard checks `str(hit.id) in existing_qdrant_ids_cc`. Limit raised 4 → 6. Deployed via SCP + force-recreate. Confirmed: `added 6 case chunks` in logs on test query. Root cause: session 27 fix was committed to git (commit `5935df7`) but never SCP'd to VPS — third instance of the deploy-gap pattern.

- **runDailySync proxy — end-to-end complete** — `POST /fetch-page` route added to `server.py`: validates `austlii.edu.au` domain, fetches with browser-like headers via `requests.get()`, returns `{html, status}`. `handleFetchPage` in `Worker.js` updated with `env` parameter (default null): routes AustLII URLs through VPS when env present, jade.io falls back to direct fetch. `env` threaded through `fetchCaseContent(url, preloadedHtml, env)` and all 7 `handleFetchPage` call sites (lines 190, 222, 694, 709, 739, 1069, 2945). VPS confirmed NOT IP-blocked by AustLII (curl returning 200) — old "VPS IP blocked" CLAUDE.md note was incorrect and has been removed.

- **fetchCaseUrl bug fix** — `uploadUrl()` in `Upload.jsx` was calling `api.uploadCase({ url })` instead of the correct fetch-case-url endpoint. `upload-case` Worker handler destructures `case_text` and `citation` from body — `citation` was undefined, causing `citation.match()` to throw "Cannot read properties of undefined (reading 'trim')". Root cause: `api.fetchCaseUrl` method never existed in `api.js`; form author used nearest available method. Fix: `fetchCaseUrl()` added to `api.js` (calls `POST /api/legal/fetch-case-url`); `Upload.jsx` updated to call it. Frontend rebuilt and deployed.

- **Session 34 git commits caught up** — `Worker.js` session 34 changes (citationToId, INSERT OR IGNORE, handleLibraryList principles_extracted, handleFetchSectionsByReference LIKE tightening) were deployed to Cloudflare in session 34 but never committed to git. Committed and pushed this session (commit `70151b1`).

- **Monorepo migration** — git root moved from `Arc v 4/` to `arcanthyr-console/`. Why: build artifacts were bleeding across the repo boundary (built JS copied into `Arc v 4/public/` from outside the repo root); two-layer bugs (e.g. session 33 wrong JSX field + missing Worker SQL field) required cross-repo context that CC couldn't see in one session; atomic commits across Worker and UI were impossible with separate repos. What was done: `arcanthyr-ui` separate git repo (initialised session 35, 2 commits) absorbed into monorepo; `Arc v 4/scripts/` directory removed (all files were duplicates of root-level scripts or one-off scripts that had already run); rogue terminal fragment files deleted (`d`, `npx`, `onnected`, `scp`, `wrangler`, `how HEAD:server.py...`); `public/assets/index-*.js` and `public/assets/index-*.css` added to `Arc v 4/.gitignore` (10 accumulated build artifacts removed from index); root `.gitignore` created at `arcanthyr-console/`; `ingest_corpus.py`, `ingest_part2.py`, `Local Scraper/`, `master_corpus_part1.md`, `master_corpus_part2.md`, `retrieval_baseline.sh`, `migrate_schema_v2*.sql`, `corpus_manifest.json`, `hogan_on_crime.md`, `sentencing_first_offenders.md`, `validate_ingest.ps1` all now tracked at monorepo root. New rule: git commands run from `arcanthyr-console/`; wrangler/npx commands still run from `Arc v 4/`.

- **TAMagC AustLII outage confirmed** — manually checked AustLII TAMagC URL this session — returning 500. Temporary outage confirmed (not structural gap). TAMagC cases do exist on AustLII. Action deferred to Outstanding Priorities.

## CHANGES THIS SESSION (session 29) — 3 April 2026

- **Secondary source citation fix deployed** — `enrichment_poller.py` `run_embed_secondary_sources()` updated: added `citation: chunk.get('id', '')` and corrected `source_id: chunk.get('id', '')` to metadata dict (previously `source_id` used `chunk.get('source_id', '')` which was always empty; `citation` was entirely absent). Added `[EMBED_SS]` debug log line after upsert to confirm citation/source_id per point. Deployed following Poller Deploy Validation Procedure: SCP → grep → restart → start-time check → clean start. Re-embed running: 1,188 rows reset, ~50 complete at session close.

- **server.py semantic pass citation fallback** — line 271 updated from `payload.get("citation", "unknown")` to `payload.get("citation") or payload.get("chunk_id", "unknown")`. Fixes secondary source chunks showing "unknown" in semantic pass results (Pass 3 already had this fallback). Deployed via SCP + force-recreate agent-general.

- **Poller Deploy Validation Procedure added to CLAUDE.md** — 10-step checklist (deploy → reset → monitor) added as permanent named section. Key rule: restart container BEFORE reset; verify container start time is after file mtime before resetting embedded=0.

- **enrichment_poller.py SCP rules added to SESSION RULES** — pull and push SCP commands added alongside existing server.py SCP rules. Root cause of both past deploy failures was absence of this rule.

- **Session 25 and 27 changelog entries corrected** — both marked with ⚠ "DESCRIBED AS DEPLOYED BUT NOT CONFIRMED ON VPS" with session 29 fix reference.

- **Legislation Act-title prefix re-embed deferred** — audit confirmed session 25 fix never reached VPS (VPS `run_legislation_embedding_pass()` still uses `embed_text = s['text']`). Scheduled for next session after secondary source re-embed completes.

## CHANGES THIS SESSION (session 34) — 4 April 2026

- **handleFetchSectionsByReference LIKE tightening** — four-clause OR pattern deployed in Worker: `id LIKE '%s ' || ? || ' %' OR ... OR id LIKE '%s ' || ?`. Requires `s ` prefix and delimiter after section number. Fixes `s38` matching IDs containing `138`, `238` etc. Deployed worker.js version `7c60439c`.

- **INSERT OR IGNORE fix — both upload handlers** — `handleUploadCase` and `handleFetchCaseUrl` both changed from `INSERT OR REPLACE` to `INSERT OR IGNORE`. Root cause: `citation TEXT NOT NULL UNIQUE` on the cases table meant `INSERT OR REPLACE` was deleting the existing row and re-inserting with a new UUID — resetting `enriched`, `deep_enriched`, `principles_extracted` etc. to zero on every scraper re-run. Fix: `INSERT OR IGNORE` skips silently if citation already exists, enrichment data preserved.

- **Citation-derived ID migration** — `crypto.randomUUID()` replaced with `citationToId(citation)` in both upload handlers. Helper function `citationToId()` added above `handleUploadCase`. All 580 existing UUID rows backfilled via D1 UPDATE to citation-derived IDs (e.g. `2026-tassc-2`). Zero collisions confirmed across all 580 citations before migration. No Qdrant changes needed — Qdrant payloads reference `citation` not `cases.id`. No FK constraints on `cases.id` confirmed before running. Deployed worker.js version `23cf95ba`.

- **Myers v DPP retrieval** — Qdrant point was present in D1 as `embedded=1` but missing from Qdrant index. Reset `embedded=0`, poller re-embedded, retrieval confirmed working.

- **Pass 3 debug log removed** — `chunk_id` debug log (lines 446–447: hit_ids comprehension + unconditional print) removed from `server.py`. Deployed via SCP + force-recreate agent-general.

- **UI changes deployed** — top nav capitalised (RESEARCH/LIBRARY/UPLOAD/COMPOSE) · research source filter tabs consolidated: TASSC/TASCCA/TASMC → single CASES tab (passes all case doc_types) · court filter chips capitalised on Library page · year filter chips added to Library cases table (dynamic from data, combinable with court filter) · Legislation Date Updated column added (reads `current_as_at` via `r.date`), moved after Status column · legislation titles are external links to legislation.tas.gov.au · Secondary Sources title/ID columns swapped (Title leftmost) · query processing indicator: blue italic pulsing text replaces Ask button while loading. Deployed frontend + worker.js.

- **TAMagC AustLII outage diagnosed** — scraper marked TAMagC 2018–2025 as done after 5×404s per year. Confirmed AustLII TAMagC page was temporarily down, not structurally absent. TAMagC cases do exist on AustLII. Action deferred to Outstanding Priorities.

- **Scraper status confirmed** — Task Scheduler tasks `run_scraper` and `run_scraper_evening` both Ready. Scraper actively running, currently working through TASSC 2017. 580 cases in D1 (394 supreme, 111 cca, 74 fullcourt, 1 magistrates).

- **Re-merge fired — 46 cases** — `requeue-merge` with `target:remerge` fired for cases remaining after cron pass. 46 cases re-merged (expected ~330 — cron had already handled the majority). Why: cron cleared done=0 chunks overnight, triggering merges automatically for most cases; only 46 remained with deep_enriched=0 by the time manual re-merge ran.

- **Scraper path corrected in CLAUDE.md** — full absolute path `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Local Scraper\` now in SESSION RULES.

- **cases.id format documented in SESSION RULES** — citation-derived IDs, INSERT OR IGNORE behaviour, citationToId() location.

## CHANGES THIS SESSION (session 33) — 4 April 2026

- **Library Principles tab fix** — `Library.jsx` Principles tab was reading `c.holdings_extracted` (line 335) instead of `c.principles_extracted` — displaying holdings objects where principles should appear · root cause: copy-paste error when tab was originally written · fix: changed field reference to `c.principles_extracted` · why: h.holding was the first property tried in the render fallback so the bug was silent — holdings text appeared instead of principles text

- **handleLibraryList SELECT fix (worker.js)** — `principles_extracted` was absent from the `handleLibraryList` SELECT at line 1596 · only `holdings_extracted` was fetched · even with the JSX fix, `c.principles_extracted` would have been `undefined` · fix: added `principles_extracted` to the SELECT · deployed CF Worker version `ae4b735c` · why: two-bug compounding failure — wrong field name in JSX AND missing field in SQL

- **Documentation process fix diagnosed** — identified systematic pattern: OUTSTANDING PRIORITIES list was append-only across sessions 31–32 · items completed in session 31 (cron finished, re-merge complete, baseline run, scraper re-enabled) were logged in CHANGES but never removed from Outstanding Priorities · SYSTEM STATE table not updated since session 26 · root cause: update prompt was not specific enough to require reconciliation · this session: explicit reconcile step applied, stale items removed, SYSTEM STATE refreshed

## CHANGES THIS SESSION (session 32) — 4 April 2026

- **base64 fix in `post_chunk_to_worker` (server.py)** — `text` field was being sent as base64-encoded string with `encoding: "base64"` flag · Worker's `handleUploadCorpus` has no decode step so every chunk silently failed citation check and was skipped · fix: send raw UTF-8 string, remove `encoding` key · why: silent failure — inserted=0 skipped=N with no error, diagnosed by CC reading full function body

- **Word/PDF → Secondary Sources pipeline confirmed end-to-end** — drag-drop `.docx`/`.pdf`/`.txt` on Secondary Sources tab → base64 → Worker proxy `/api/ingest/process-document` → server.py `process_document()` → GPT-4o-mini block formatting → `post_chunk_to_worker` → Worker `handleUploadCorpus` → D1 → poller embeds to Qdrant · tested with tendency/coincidence evidence Word doc · inserted=8 skipped=0 errors=0 · embedded by poller within one loop cycle · why: pipeline was wired but silently broken at the D1 write seam

- **Retrieval test — tendency/coincidence evidence** — new chunks surfacing correctly in query results alongside existing corpus material · s 97(1) two-limb test, notice requirements, IMM v The Queen all retrieved correctly · minor quality note: synthesis referenced s 137 instead of s 135 for general discretionary exclusion — imprecise but not wrong

- **VPS doc ID format noted** — see operational directives rule above

## CHANGES THIS SESSION (session 31) — 3 April 2026

- **Sentencing second pass implemented and deployed** — new `SENTENCING_SYNTHESIS_PROMPT` constant added at module level · `isSentencingCase()` helper added before `performMerge` · sentencing block inserted in `performMerge` after main synthesis, before D1 write · fires conditionally on `subject_matter='criminal'` or sentencing keyword scan · produces `procedure_notes` (structured sentencing summary) + 2-4 sentencing principles appended to `principles_extracted` · non-sentencing cases return `sentencing_found:false` and are skipped cleanly · tested on DPP v King [2024] TASCCA 8 — 6 doctrine + 2 sentencing principles, `procedure_notes` confirmed written · why: sentencing judgments were systematically half-extracted — penalty analysis, quantum, mitigating factors absent from principles

- **Three subject_matter fixes in MERGE/CHUNK handlers** — MERGE handler SELECT, CHUNK handler SELECT, and CHUNK handler inline object to `performMerge` all updated to include `subject_matter` · without the inline object fix, `subject_matter` would have been fetched but silently dropped before reaching `isSentencingCase()` · why: `isSentencingCase` Check 1 was dead code for all queue-triggered merges

- **PRINCIPLES_SPEC synced across worker.js** — two copies were out of sync: `summarizeCase` copy (line 352) still had old BAD examples ("The prosecution bears the onus...", "IF self-defence is raised...") · updated to match `performMerge` copy · third GOOD example updated from "Weed eradication works..." to "The appellant's failure to disclose gambling debts..." for consistency

- **Civil cases principles fix** — synthesis prompt BAD examples were exclusively criminal law · GPT-4o-mini returning `[]` for civil/family judgments (TASCCA 1, TASFC 1, TASFC 4) · added civil GOOD example ("The appellant's failure to disclose gambling debts totalling $180,000...") · all three cases re-merged successfully with correct principles

- **Bulk re-merge completed** — all 551 cases `deep_enriched=1` · 0 old-format (IF/THEN) principles remaining · confirmed via `LIKE '%"type":"ratio"%'` query returning 0

- **Retrieval baseline run** — 18 questions · 8 clear passes · 5 partial · 2 misses (Q11 s138 semantic mismatch, Q13 tendency notice) · deferred investigation until full scrape complete — corpus coverage gaps expected at current volume

- **Scraper re-enabled** — Task Scheduler Arcanthyr Scraper (8am AEST) and run_scraper_evening (6pm AEST) both set to Ready · all gate conditions met: chunks clean, principles new-format, baseline run, Pass 1 prompts revised, sentencing second pass live

- **enrich_concepts.py confirmed in .gitignore** — already present at line 13, no action needed

- **worker.js version** — `fe29090`

## CHANGES THIS SESSION (session 30) — 3 April 2026

- **Legislation Act-title prefix fix deployed and confirmed** — `enrichment_poller.py` `run_legislation_embedding_pass()` line 848 updated: `embed_text = f"{leg_title} — s {s.get('section_number', '')} {s.get('heading', '')}\n{s['text']}".strip()`. `[EMBED_LEG]` debug log added at line 863. Full 10-step Poller Deploy Validation Procedure followed: SCP → grep → restart → start-time check (container started 35s after file write) → clean start confirmed. Fix was previously documented as deployed in session 25 but never reached VPS.

- **Legislation re-embed complete** — all 5 Acts / ~1,272 sections re-embedded with Act-title-prefixed vectors. Qdrant payloads spot-checked across three Acts (Evidence Act 2001, Criminal Code Act 1924, Misuse of Drugs Act 2001) — `text` field confirmed starting with `"{Act Title} — s {section_number} {heading}\n..."` format, `leg_title` and `section_number` present on all points. Pending count confirmed 0 on completion.

- **Three revised Pass 1 prompts deployed** — all three extraction prompts revised and deployed (Opus + extended thinking used for prompt engineering decisions). Changes consistent across all three:
  - `pass1System` (queue/METADATA path, line 3150) — JSON template format, VERY FIRST LINE instruction, `[` stop character, expanded NEVER list (Criminal Division, Civil Division added), SURNAME normalisation, `""` / `[]` fallbacks
  - `pass1Prompt` (direct upload, long judgments, line 394) — rebuilt to JSON template format matching pass1System, same rules block
  - `singlePassPrompt` (direct upload, short judgments, line 376) — VERY FIRST LINE instruction, expanded NEVER list, SURNAME normalisation, explicit Rules block, `{` first-char constraint
  - `${PRINCIPLES_SPEC}` interpolation preserved exactly at line 389 in singlePassPrompt

- **`validateCaseName()` guard added to Worker.js** — code-level safety net covering all three parse paths. Function at line 521: catches division labels (regex `/^(criminal|civil|criminal division|civil division)$/i`), single-word values (`/^\w+$/`), falls back to first-line regex extract (`/^(.+?)\s*\[/`). Also strips citation suffix (`/^(.+?)\s*\[\d{4}\].*/`) if model included it. Called at: line 446 (singlePass), line 460 (two-pass pass1), line 3205 (queue path).

- **CF Worker version** — `d2f62965-af15-44a9-9b9d-8f926806f9d3`

- **Pre-deploy audit findings** — systematic pattern identified: two fixes (session 25 legislation prefix, session 27 secondary source citation) documented as deployed in CLAUDE.md without VPS confirmation. Root cause: no SCP procedure for enrichment_poller.py, no post-deploy verification step. Resolution: 10-step validation procedure now permanent in POLLER DEPLOY VALIDATION PROCEDURE section; SCP rules added to SESSION RULES.

## CHANGES THIS SESSION (session 27) — 30 March 2026

- **Dedup fix — secondary source pass** — `_qdrant_id` (Qdrant point UUID) added as secondary dedup key in Pass 3 secondary source guard. `existing_qdrant_ids_sec` built from all chunks already collected; guard now checks `str(hit.id) in existing_qdrant_ids_sec` in addition to citation string match. `_qdrant_id` also stored on appended secondary source chunks. Why: semantic pass and Pass 3 were returning the same Qdrant point twice — once with `citation: "unknown"` (stale payload era) causing citation-based dedup to miss it; UUID check is payload-independent and catches all cases.

- **Dedup fix — case chunk pass** — same `_qdrant_id` pattern applied to case chunk pass. `existing_qdrant_ids_cc` built before loop; guard checks `str(hit.id) in existing_qdrant_ids_cc`; `_qdrant_id` stored on appended case chunk results. Why: semantic pass and case chunk pass were returning identical points twice with different keys (`_qdrant_id` vs `_id`), dedup wasn't cross-checking between them.

- **Secondary source citation/source_id fix** — ✅ CONFIRMED DEPLOYED session 29 (3 April 2026). ⚠ Was documented as deployed in session 27 but was not on VPS — the `UPDATE secondary_sources SET embedded=0` ran but the poller code fix (adding `citation` and correcting `source_id` to use `chunk['id']`) was never SCP'd to VPS before the re-embed ran. All 1,188 points were re-embedded with the old (broken) code and remained without `citation` in Qdrant payload. Fix actually applied session 29 following full 10-step validation procedure. All 1,188 secondary source chunks re-embedded with correct payloads — citation and source_id both confirmed present and non-empty in Qdrant.

- **BM25_FTS_ENABLED kill switch confirmed absent** — CLAUDE.md note about this kill switch is stale. Current server.py has no such variable — BM25/FTS5 pass runs unconditionally when section references are present in query. Why: CC confirmed variable does not exist anywhere in current server.py.

- **subject_matter filter deferred** — server.py case chunk Qdrant pass `subject_matter` filter (`MatchAny(any=["criminal","mixed"])`) drafted but not deployed. Qdrant payload for case chunks does not include `subject_matter` field — filter would return zero results. Requires: (1) Worker fetch route to JOIN cases and return `subject_matter` per chunk, (2) poller metadata dict updated, (3) full case chunk re-embed. Why: deploying filter without payload field would silently kill all case chunk retrieval.

## CHANGES THIS SESSION (session 27) — 29 March 2026

### Secondary Sources Upload — Built and hardened
- Paste form fixed: api.js path corrected, citation extraction from [CITATION:] field added client-side
- Drag-and-drop pipeline built: Worker routes POST /api/ingest/process-document and GET /api/ingest/status/:jobId proxy to server.py /process-document; UI polls every 5s with progress bar
- python-docx added to Dockerfile.agent (permanent, no longer needs manual pip install after force-recreate)
- chunks_inserted counter bug fixed: server.py run_ingest_job success check was reading missing ok/success fields — fixed to result.get("result") is not None and not result.get("error")
- Citation quality fixed: split_chunks_from_markdown now prioritises [CASE:] over [CITATION:], falls back to heading slug; source field now uses chunk heading not filename stem

### Secondary Sources Retrieval — Fixed
- Pass 3 added to search_text(): filtered query scoped to type=secondary_source, threshold 0.35, limit 4 — gives secondary sources same low-threshold fallback that case chunks already had
- top_k hard cap raised from 8 to 12
- Root cause of citation:"unknown" in Qdrant diagnosed: enrichment_poller embed_secondary_sources() was omitting citation from payload metadata — all secondary source points had citation:"unknown", making them unretrievable by name
- ✅ "Fixed: poller now writes citation: chunk['id'] and source_id: chunk.get('id','')" — CONFIRMED DEPLOYED session 29 (3 April 2026). ⚠ Was described as deployed in session 27 but was not on VPS (VPS file mtime confirmed 2026-03-29 01:58, before session 27 work).
- Pass 3 dedup and fallback fixed to read chunk_id from payload correctly ✓ (this one did land)
- All 1,188 secondary sources reset to embedded=0 for overnight re-embed — re-embed ran with old code (no citation fix); Qdrant payloads still had citation ABSENT after "re-embed"
- ✅ Fix confirmed complete session 29: poller updated, restarted, reset, re-embed complete with EMBED_SS debug log confirming correct citation/source_id in payload — all 1,188 chunks re-embedded with correct payloads

## CHANGES THIS SESSION (session 26) — 29 March 2026

- **enriched=1 after ingest rule retired** — `handleUploadCorpus` and `handleFormatAndUpload` both set `enriched=1` on INSERT. Manual `wrangler d1` step is no longer needed after any secondary_sources ingest. Rule removed from session rules table.

- **format-and-upload route live** — `POST /api/legal/format-and-upload` handles both raw text and pre-formatted blocks. Raw text path calls GPT-4o-mini with Master Prompt; short source detection appends chunking instruction to system prompt if word count < 800. Pre-formatted path (`<!-- block_` prefix) calls `parseFormattedChunks` directly, no GPT call. Single-chunk mode: `body.mode='single'` bypasses GPT entirely — wraps text in a `<!-- block_0001 master -->` header using provided `title`, `slug`, `category`, then parses and inserts as one chunk. Auth: User-Agent spoof (`Mozilla/5.0 (compatible; Arcanthyr/1.0)`).

- **Secondary sources upload modal** — raw text paste in CorpusTab now triggers a pre-submit confirmation modal. Auto-suggests title (first line of paste, capped 80 chars) and citation slug (`manual-{slugified-title}`). Category dropdown (all 8 canonical categories). Editing the title auto-updates the slug. Pre-formatted blocks skip the modal entirely and upload immediately. Modal sends `{ text, mode: 'single', title, slug, category }` payload.

- **Upload path fix** — `api.js uploadCorpus` was posting to `${BASE}/upload-corpus` (404). Fixed to `${BASE}/api/legal/upload-corpus`. Superseded by `formatAndUpload` for UI use but `uploadCorpus` retained for PowerShell scripting.

- **worker.js version** — `9361a39` · Cloudflare version ID: `f6db67df`

---

## CHANGES THIS SESSION (session 25) — 29 March 2026

- **Legislation Act name prefix in Qdrant** — ✅ CONFIRMED DEPLOYED session 30 (3 April 2026). ⚠ Was documented as deployed in session 25 but was not on VPS — enrichment_poller.py `run_legislation_embedding_pass()` still used `embed_text = s['text']` (raw section text) with no Act title prefix. Re-embed in session 25 ran with old code. Fix actually applied session 30: line 848 updated to `f"{leg_title} — s {s.get('section_number', '')} {s.get('heading', '')}\n{s['text']}".strip()`, [EMBED_LEG] debug log added, 10-step validation procedure followed. All 5 Acts / ~1,272 sections re-embedded — Qdrant payloads verified with correct Act title prefix. Why: retrieval was finding correct legislation sections but Claude couldn't identify which Act they belonged to (diagnosed session 18, s 49 Justices Act test).

- **FSST methylamphetamine chunk ingested** — practitioner forensic guidance on medications that won't cause false positive oral fluid results (paracetamol/codeine, pseudoephedrine, diazepam, citalopram, oxycodone, escitalopram, quetiapine, sertraline, clomipramine, phentermine) plus FSST confirmation that passive methylamphetamine inhalation is scientifically impossible. Citation: `fsst-methylamphetamine-false-positives-passive-inhalation`. Category: practice note. Enriched text written directly (no GPT enrichment needed). Why: practitioner-sourced forensic evidence — directly useful for drug driving defences.

- **arcanthyr-ui.pages.dev deleted** — redundant Cloudflare Pages project removed from dashboard. Why: frontend now served directly from Worker at arcanthyr.com, Pages deployment was never updated after the React rebuild.

- **Corpus placeholder scan resolved** — 5 `...` occurrences investigated: 2 confirmed as legal elisions (not errors), 1 trivial typo fixed (`T...` → `The` in part2.md:381 block_019), 2 genuine content gaps identified (block_023 and block_028 — deferred to Procedure Prompt re-ingest). Why: needed to determine which placeholders were real gaps vs intentional legal text.

- **handleFetchSectionsByReference LIKE fix investigated and deferred** — CC diagnosis confirmed false positive risk from `'%' || ? || '%'` pattern on secondary_sources IDs (s38 matches block IDs containing 038, 138 etc). Two ID formats identified: legacy free-text (`Evidence Act 2001 (Tas) s 38 -...`) and modern `hoc-b` slugs. Tighter `s`-prefix LIKE pattern designed but deferred — retrieval baseline unaffected, low priority. Why: polish fix, not a functional regression.

- **runDailySync deletion cancelled** — confirmed as future feature (forward-looking new case capture once scraper works backwards through historical cases). Needs proxy fix (currently hits AustLII directly from Cloudflare IPs), not deletion. Why: original design intent verified against conversation history.

- **Scraper re-enablement deferred** — deliberately held pending: cron completion → bulk re-merge → retrieval baseline → GPT-4o-mini enrichment quality review → Pass 1/Pass 2 prompt review. Why: no point adding new cases processed under prompts not yet validated.

- **UI Secondary Sources upload path bug identified** — React UI posts to `/upload-corpus` (returns 404) instead of `/api/legal/upload-corpus`. Workaround: PowerShell Invoke-WebRequest. Why: discovered while uploading FSST chunk via UI.

---

## CHANGES THIS SESSION (session 24) — 29 March 2026

- **Pass 1 case_name prompt fix** — added explicit negative constraint: "NEVER use court division labels ('Criminal', 'Civil')". Fallback to citation if no party names visible. Why: Qwen3 was picking up "CRIMINAL DIVISION" header text instead of party names for ~31 cases.

- **31 null case_names patched** — patch_case_names.py extracted party names from raw_text using three cascading patterns (CITATION field → title-line before [year] → inline X v Y). 30 patched, 1 junk case deleted ([2026] TASFC 1 — raw_text was AustLII search page HTML).

- **Malformed corpus row fixed** — `hoc-b{BLOCK_NUMBER}-m001-drug-treatment-orders` corrected to `hoc-b054-m001-drug-treatment-orders`. Bad D1 + FTS5 rows deleted, master_corpus_part2.md:6526 fixed, re-ingested via upload-corpus, enriched=1 set. Why: literal `{BLOCK_NUMBER}` placeholder was never substituted during original corpus processing.

- **Poller enriched_text IS NOT NULL guard** — dual-layer: Worker.js SQL query adds `AND cc.enriched_text IS NOT NULL`, poller Python filters and logs skipped chunks. Why: prevents embedding pre-fix bad chunks that have null enriched_text — these should wait for cron re-enrichment.

- **Enrichment poller restarted** — stalled since 24 March, force-recreated 29 March. Immediately resumed embedding case chunks.

- **Corpus ... placeholder scan** — 5 genuine gaps identified across part1.md and part2.md. Parked for future fix session.

- **worker.js version** — `bdfa662e`

---

## CHANGES THIS SESSION (session 23) — 28 March 2026

- **Synthesis confirmed working** — [2020] TASSC 1 re-merged with new-format principles (`principle`/`statute_refs`/`keywords`, no `type`/`confidence`). GPT-4o-mini synthesis call in `performMerge` produces case-specific prose. Why: needed to verify synthesis wasn't silently failing before bulk re-merge.

- **requeue-merge routing bug diagnosed** — route queries `WHERE deep_enriched=0` but the early-merged cases are `deep_enriched=1`. `LIMIT N` lands on pending cases with incomplete chunks, runtime check rejects them, returns `requeued:0`. Why: explains why re-merge never fired for old-format cases.

- **requeue-merge target param added** — `body.target='remerge'` queries `WHERE deep_enriched=1`, resets each case to `deep_enriched=0` before enqueuing MERGE message. Default behaviour unchanged (`WHERE deep_enriched=0` with runtime chunk check). Why: enables re-merge of early-merged cases without colliding with pending cases pool.

- **JSON parse fix deployed** — `jsonStart`/`jsonEnd` extraction added to synthesis response parsing in `performMerge`. Replaces fragile `JSON.parse(synthRaw.replace(...))` which failed on any GPT preamble text. Why: defensive fix for GPT responses with leading text before the JSON array.

- **Bulk re-merge deferred** — waiting for nightly cron to finish clearing 2,086 pending chunks (~April 5-6) before firing `target:remerge` on all old-format cases. Why: merging now risks mixing good and bad chunk data for the 221 still-pending cases.

- **Scraper not running** — last log entry 24 March. Task Scheduler status unconfirmed. Deferred to next session. Why: pipeline quality more important than new case volume right now.

- **worker.js version** — `5d61d0b7`

## CHANGES THIS SESSION (session 22) — 27 March 2026

- **PRINCIPLES_SPEC redesigned** — replaced IF/THEN format with case-specific prose style · removed `type`, `confidence`, `source_mode`, `authorities_applied` fields · added 3 new GOOD/BAD examples showing case-specificity vs generic rules · why: principles displayed in Library reading pane were generic statute restatements useless for distinguishing cases

- **Root cause diagnosed: CHUNK merge overwrites Pass 2 principles** — Pass 2 (Qwen3 + PRINCIPLES_SPEC) produces `principles_extracted`, but CHUNK merge immediately overwrites it with chunk-level `allPrinciples` concatenation · why: explains why PRINCIPLES_SPEC changes never took effect — the merge clobbered them before they could be seen

- **Chunk-level principles quality confirmed poor** — spot-checked [2020] TASSC 13 chunk 3 · GPT-4o-mini CHUNK v3 prompt produces generic principles with old schema (type/confidence/authorities_applied) despite prompt rule 4 saying "judge's own doctrinal language" · why: CHUNK v3 prompt optimised for enriched_text quality, not principle extraction; no positive examples in prompt

- **Merge synthesis step added (option C)** — GPT-4o-mini synthesis call inserted into `performMerge()` function · reads enriched_text from reasoning/mixed chunks + Pass 1 facts/issues/holdings · produces 4-8 case-specific principles in new format · falls back to raw concatenation on any failure · shared by both CHUNK handler (normal merge) and MERGE handler (synthesis-only re-merge) · why: architecturally correct — single model call with full judgment awareness at merge time, vs per-chunk extraction with no cross-chunk dedup; cost ~$0.001/case vs $3 for full chunk re-processing

- **MERGE queue message type added** — new third branch in queue consumer · fires synthesis-only merge (no chunk reprocessing) · triggered by `POST /api/admin/requeue-merge` route · accepts `{"limit":N}` body · only enqueues cases where deep_enriched=0 AND all chunks done=1 · why: enables re-merging without re-running $3 worth of GPT-4o-mini chunk calls

- **Full corpus accidentally requeued through Pass 1** — `UPDATE cases SET enriched=0` on all 549 cases triggered full METADATA + CHUNK re-processing · 274 merged quickly with old-format principles (chunks had null enriched_text from pre-Fix-1 era, so synthesis skipped) · 275 still pending (2,594 chunks done=0) · queue stalled from rate limit exhaustion · why: enriched=0 reset was too aggressive — should have used requeue-merge for synthesis-only

- **worker.js version** — `cbc38e39`

## CHANGES THIS SESSION (session 21) — 26 March 2026

- **Correct route for URL-based case ingestion confirmed** — `POST /api/legal/fetch-case-url` is the correct endpoint for URL-based ingestion (not `/api/legal/upload-case`). The latter expects `case_text` + `citation` fields — posting `{url}` causes `citation.match()` to throw on undefined. Why: diagnosed after 500 error on test upload; CC traced four `.match()` calls and identified route mismatch as root cause. Note for CLAUDE.md: always use `fetch-case-url` for URL-based ingestion.

- **fetch-page response shape confirmed** — `handleFetchPage` returns `{ html, status }` directly (not wrapped in `result`). All call sites destructuring `{ html, status }` directly are correct. Why: investigated as potential source of undefined `.match()` — ruled out by CC reading function return at line 1727.

- **holding merge bug fixed (three compounding bugs)** — `cases.holding` was NULL on 537/543 cases: (1) Pass 2 merge read `r.holding` (singular) instead of `r.holdings` (array) — always null; (2) `_buildSummary` fell through to "Not extracted" when holdings array empty; (3) CHUNK merge UPDATE never wrote to `cases.holding` — holdings from GPT-4o-mini chunk responses collected into `allHoldings` but only written to `holdings_extracted`. Fix: line 472 flatMap with object extraction, plus `chunkHoldingStr` derived from `allHoldings` added to CHUNK merge UPDATE. Why: diagnosed via CC tracing full merge chain from Pass 2 parse through to D1 write.

- **Merge race condition fixed — atomic claim pattern** — When 500+ cases requeued simultaneously, parallel CHUNK workers both passed `pending.cnt === 0` check before either wrote `done=1`, causing merge to never fire. Fix: inserted `UPDATE cases SET deep_enriched=1 WHERE citation=? AND deep_enriched=0` as atomic gate before merge body — D1 serialises writes so only one worker gets `changes=1` and proceeds. Why: 275 cases stuck at `deep_enriched=0` after overnight requeue despite all chunks done; CC diagnosed race condition and proposed atomic mutex. This is the permanent fix — no more manual one-chunk-per-case recovery needed.

- **max_retries raised from 2 to 5** — wrangler.toml queue consumer `max_retries` raised to 5. Why: with only 2 retries, chunks hitting GPT-4o-mini rate limits during large batch operations exhausted retries within minutes and dead-lettered. 5 retries gives sufficient headroom for rate limits to ease before messages die.

- **Batched chunk cleanup cron added** — new `runBatchedChunkCleanup` function runs nightly at 3am UTC via second cron trigger. Selects up to 250 `done=0` chunks and enqueues as CHUNK messages. Logs remaining count. Self-terminating when `done=0 = 0`. Why: 2,627 pre-Fix-1 bad chunks (enriched_text=NULL, empty principles_json stubs) need re-enrichment but cannot be fired all at once without hitting GPT-4o-mini rate limits. Automated nightly batches of 250 clear the backlog in ~11 nights without manual intervention.

- **requeue-chunks limit parameter added** — `handleRequeueChunks` now accepts optional `{ limit: N }` body. Appends `LIMIT N` to SELECT if present. Allows manual controlled batches via `Body '{"limit":250}'`. Why: previously no way to scope requeue to a subset — all done=0 chunks fired simultaneously.

- **runDailySync legacy cron retained** — 2am UTC cron still calls `runDailySync` (legacy Worker-native AustLII scraper). Confirmed superseded by Python scraper but left running as it is likely a no-op. Clean disable deferred.

- **Phase 0 cleanup executed** — 2,627 bad chunks reset to `done=0, embedded=0`; 275 affected cases reset to `deep_enriched=0, holding=NULL, principles_extracted='[]', holdings_extracted='[]'`. Nightly 3am cron will process 250/night automatically. First batch fires tonight (3am UTC = 1pm AEST).

- **Scraper re-enabled** — Task Scheduler `run_scraper` (8am AEST) and `run_scraper_evening` (6pm AEST) re-enabled after all three pre-scraper checks passed.

- **Bulk requeue race condition documented** — root cause of overnight stall: all 548 cases × ~15 chunks = ~8,000 simultaneous GPT-4o-mini calls hit rate limits; chunks exhausted max_retries=2 before rate limits eased; queue went silent. Not foreseeable — first time all cases requeued simultaneously. Fix: max_retries=5 + batched requeue approach for future bulk operations.

- **worker.js version** — `ba8bafa0`

## CHANGES THIS SESSION (session 43) — 7 April 2026

- **Scraper court code fix: TAMagC → TASMC** — scraper was using TAMagC as the AustLII court code for the Magistrates Court but the correct code is TASMC. Every magistrates year was silently completing with 0 cases (AustLII returned 500, which bumped consecutive_misses to 5 immediately). Fixed in austlii_scraper.py COURTS list. Commit d8ca371. Why: confirmed via direct AustLII URL check — TAMagC path returns 500, TASMC path returns valid cases.

- **Scraper consecutive_misses raised 5 → 20** — low-volume courts and older years have non-sequential case numbering. A gap of 6+ between valid cases caused premature year completion. Raised threshold to 20 to tolerate sparse numbering. Same commit. Why: explained the missing CCA and fullcourt cases pre-2010.

- **Scraper year floor extended 2005 → 2000** — AustLII has Tasmanian cases back to at least 2000 for most courts. Extended YEARS = list(range(2025, 1999, -1)). Same commit.

- **TAMagC entries cleared from scraper_progress.json** — all 21 TAMagC_YYYY entries removed so the scraper re-runs those years under the correct TASMC court code. TASSC/TASCCA/TASFC entries left intact.

- **performMerge holdings fix** — holdings_extracted was always [] on interlocutory rulings because the merge synthesis prompt only asked for a bare principles array. Changed synthSystem to request {"principles": [...], "holdings": [...]} JSON object. Updated parser to extract both keys; synthesisedHoldings pushed into allHoldings before D1 write. Fallback path (synthesis failure) unchanged. Commit dcbded5. Verified working: [2025] TASSC 10 remerged under new prompt produced non-empty holdings_extracted. Why: diagnosed via manual review of [2025] TASSC 6 — Wood J made four distinct admissibility rulings, none captured in holdings_extracted.

- **Enrichment quality audit — [2025] TASSC 6** — full chunk-by-chunk review against judgment text. Chunk typing accurate, enriched_text quality good, authority chain captured correctly. Two gaps identified: (1) empty holdings_extracted on interlocutory rulings (fixed above), (2) s 361A Criminal Code procedural mechanism not captured in enriched_text (deferred — low retrieval priority). One minor bug: chunk__10 had subject_matter "unknown" instead of "criminal" — isolated, not fixed.

- **agent-sensitive crash-loop — confirmed benign pre-existing issue** — no server.py has ever been deployed to the agent-sensitive container. Not a regression. No action required.

- **worker.js version** — `dcbded5`

---

## FUTURE ROADMAP

- **Retrieval tuning — SESSION 42 PRIORITY** — baseline 11/5/0 after RRF deploy · partials: Q2 (BRD — belief test displacing criminal standard), Q4 (Boatwright probate chunk at pos 2), Q8 (s55 relevance chunk at pos 1 — CW v R not surfacing), Q10 (failure-to-give-evidence at pos 1, not corroboration), Q14 (coronial chunk at pos 1, not leading questions) · diagnosis required before fixes · likely causes: concept vector pulling wrong domain on Q2, insufficient type-diversity for Q8, court hierarchy band too tight/loose on Q10/Q14
- **secondary_sources_fts backfill** — completed session 13
- **Run retrieval baseline** — after chunk cleanup completes
- **BRD doctrine chunk** — write and ingest: Criminal Code s13, Walters direction, Green v R — completed session 13
- **handleFetchSectionsByReference LIKE fix** — replace ID slug LIKE match with FTS5
- **subject_matter retrieval filter** — 3-part fix required: (1) update `/api/pipeline/fetch-case-chunks-for-embedding` Worker route to JOIN cases on citation and return `subject_matter` per chunk; (2) add `subject_matter` to enrichment_poller.py case chunk metadata dict; (3) reset `embedded=0` on all case chunks and let poller re-embed. Do not deploy server.py filter until all three complete.
- **Duplicate principle deduplication** — SUPERSEDED by merge synthesis step (session 22) which produces deduplicated case-level principles
- **Re-embed pass** — COMPLETED session 14 as part of CHUNK v3 reprocess — all case chunks being re-embedded from enriched_text overnight
- **Extend scraper to HCA/FCAFC** — after async pattern confirmed at volume
- **Retrieval eval framework** — formalise scored baseline as standing process
- **Cloudflare Browser Rendering /crawl** — Free plan. For Tasmanian Supreme Court sentencing remarks
- **Qwen3 UI toggle** — add third button to model toggle
- **Nightly cron for xref_agent.py** — after scraper actively running
- **Stare decisis layer** — surface treatment history from case_citations
- **Agent work (post-corpus validation)** — contradiction detection, coverage gap analysis, citation network traversal
- **Legislation enrichment via Claude API** — plain English summaries, cross-references
- **CHUNK finish_reason: length** — increase CHUNK max_tokens from 1,500 if truncation rate unacceptable
- **Dead letter queue** — for chunks that fail max_retries. Low priority
- **Word artifact cleanup script** — re-run gen_cleanup_sql.py if new Word-derived corpus chunks ingested

## CHANGES THIS SESSION (session 46) — 11 April 2026

- **Dedicated scraper wake tasks created** — `WakeForScraper` (10:55 AM daily) and `WakeForScraperEvening` (4:55 PM daily) created via `schtasks /create` as SYSTEM/HIGHEST. WakeToRun=True confirmed on both via `Get-ScheduledTask`. Why: session 45 set WakeToRun on the scraper tasks themselves (`Arcanthyr Scraper`, `run_scraper_evening`) but those run as user Hogan — SYSTEM-level dedicated wake tasks are more reliable for waking from sleep. Pattern mirrors session 44 email digest wake tasks. Scraper runs fire 5 minutes after the wake signal at 11:00 AM and 5:00 PM.

## CHANGES THIS SESSION (session 45) — 8 April 2026

- **Diagnosed scraper corpus gaps** — D1 case counts for 2005–2017 were severely low (e.g. TASSC 2017: 12, TASSC 2015: 0, nothing pre-2007 except 2 TASSC). Root cause: session 43 fixes (TASMC court code, consecutive_misses=20, year floor 2000) were committed at 8:11 PM on 7 April but the scraper had already run that morning under the old config. All pre-2018 years had been marked "done" in scraper_progress.json under the old consecutive_misses=5 threshold, causing premature completion with sparse results.

- **Reset scraper_progress.json** — Cleared all 2017-and-earlier entries from scraper_progress.json using a Python one-liner. Kept 2018–2026 for TASSC/TASCCA/TASFC (counts look healthy). TASMC entries were already cleared in session 43. Scraper will now re-run ~72 court/year combinations (TASSC/TASCCA/TASFC 2000–2017 + all TASMC 2000–2026 + TASCCA_2025/TASFC_2025 which were missing entirely).

- **Diagnosed Task Scheduler missed-run behaviour** — Scraper tasks fired at 7:03 PM when PC was turned on (missed scheduled times while off/sleeping). Both tasks hit the business hours guard (08:00–18:00 AEST) and exited immediately. LastTaskResult code 2147946720 confirms this pattern.

- **Set WakeToRun=True on both scraper tasks** — `Arcanthyr Scraper` and `run_scraper_evening` tasks updated via PowerShell `Set-ScheduledTask`. PC will now wake from sleep at scheduled times. Verified: both show WakeToRun: True.

- **Corpus status at session close** — 729 cases, 726 enriched, 3 not enriched; 11,793 chunks all done and embedded. Significant case count increase expected after tomorrow's 11 AM scraper run.

- **handleUploadCorpus FTS5 timeout fallback** — wrapped main INSERT + FTS5 INSERT in try/catch. On error, does `SELECT id FROM secondary_sources WHERE id = ?` to confirm whether the row landed. If confirmed: returns 200 with `{ success: true, warning: "FTS5 index timeout — row confirmed written" }`. If not confirmed: rethrows original error. Why: FTS5 virtual table writes can time out on D1 after the main row write has already committed — previously this surfaced as a 500 to the caller even though the data was safe.

## CHANGES THIS SESSION (session 44) — 7 April 2026

- **Built end-to-end daily email digest pipeline** — Created EMAIL_DIGEST KV namespace on Cloudflare (id: 9ea5773d11ac40ce9904ca21c602e9f4). Added GET /digest and POST /digest routes to existing Arcanthyr Worker. Added DIGEST_API_KEY Wrangler secret for POST auth. CoWork scheduled task POSTs digest HTML to arcanthyr.com/digest every weekday at 6am. Set up Windows Task Scheduler tasks to wake PC at 6am and sleep at 6:15am on weekdays. arcanthyr.com/digest now live and serving.

- **Added Daily Digest ↗ link button to research page** — Placed in model toggle row (Research.jsx line 160), right-aligned via marginLeft: 'auto'. Pill style matches inactive Sol/V'ger toggle buttons. Opens arcanthyr.com/digest in new tab.

- **Resolved deployment issue: Cloudflare edge cache** — Vite bundle hash did not change across three clean builds (content was identical). Cloudflare edge cache served old JS. Fixed via dashboard cache purge (Caching → Configuration → Purge Everything). Button became visible immediately after purge.

**Completed**
- arcanthyr.com/digest live and serving
- CoWork task scheduled and activated
- Daily Digest button visible on research page
- Wake/sleep tasks registered in Task Scheduler

**Key learnings / gotchas**
- Vite bundle hash may not change even after clean dist delete if file content is identical — Cloudflare edge cache can serve stale assets; purge via dashboard when this happens
- `cp -r` in PowerShell without `-Force` silently fails on existing directories — always use `-Force`
- Empty string env values in `.codex/config.toml` override inherited Windows user env vars for Codex-launched MCP processes — omit keys entirely to rely on inheritance

## Session 39 — 2026-04-08

### What we did
- Fixed secondary source upload modal: backdrop click-outside dismiss removed — modal now only closes on explicit Cancel or successful upload
- Simplified upload modal from prefilled 3 fields to clean 4-field form: Title, Reference ID, Category, Source type
- Removed prefill logic that auto-populated Title and Citation slug from first line of pasted text
- Removed tags, author, date_published from modal UI — tags deferred to enrichment poller, date auto-set at upload time
- Added source_type field to D1 insert and Qdrant upsert payload
- Extended handleFetchForEmbedding SELECT to return source_type
- Confirmed upload.jsx lives in arcanthyr-ui/src/Upload.jsx (React, not vanilla JS)
- Test upload (hearsay doctrine chunk) confirmed clean — source_type and date_published verified in D1
- Noted SCP path correction: canonical enrichment_poller.py path is agent-general/src/enrichment_poller.py (not enrichment-poller/)

### Completed
- Modal dismiss bug fixed
- Upload modal UX simplified to 4 fields with placeholders
- source_type stored in D1 and Qdrant on upload
- date_published auto-set to upload date in Worker
- Worker deployed: c4eff825
- Vite build: index-BlprLfZD.js
- enrichment_poller.py deployed to VPS, container force-recreated cleanly
- Git commit: a32231d

### Deferred
- Tag generation for secondary sources — enrichment poller to handle (better model, full text visibility)
- arcanthyr-session-closer skill update (skill confirmed but step 2 confirmation loop did not trigger correctly — to be reviewed)

### Key learnings / gotchas
- enrichment_poller.py canonical VPS path is agent-general/src/enrichment_poller.py — not enrichment-poller/enrichment_poller.py (that path does not exist)
- Upload.jsx is React (arcanthyr-ui/src/), not vanilla JS in public/app.js — app.js no longer exists since React migration

### Platform state
Worker c4eff825 live. Modal fixed and simplified. source_type now flows from upload UI → D1 → Qdrant. Enrichment poller running cleanly on VPS.

## CHANGES THIS SESSION (session 45) — 11 April 2026

- **Pydantic ingest validation layer deployed** — schemas.py created at `/home/tom/ai-stack/agent-general/src/schemas.py` with three models: CaseChunkPayload, SecondarySourcePayload, LegislationPayload. Validation wrapped around all three Qdrant upsert call sites in enrichment_poller.py (lines 711, 800, 877). On ValidationError: logs warning with full error + payload, skips upsert, does NOT mark embedded=1 — row stays available for retry. Container restarted cleanly, smoke test passed. Why: forward protection as scraper adds volume — catches malformed GPT output before it poisons Qdrant.

- **Header chunk embed fix (Option B) deployed** — removed `AND cc.enriched_text IS NOT NULL` gate from `/api/pipeline/fetch-case-chunks-for-embedding` SQL in worker.js. Poller now picks up header chunks (done=1, enriched_text=NULL, embedded=0) and embeds via chunk_text fallback. Worker version d45dd83d. Git commit 17d8f9c. Why: scraper adding new cases daily, each generating a header chunk that would silently accumulate at embedded=0 indefinitely. Pre-fix audit confirmed 0 currently stuck (existing corpus clean).

- **agent-general port hardcoded in docker-compose.yml** — replaced `${AGENT_GENERAL_PORT}` with `18789` directly in ports mapping. Root cause: docker compose interpolates `${VAR}` in ports at parse time from `.env` only — `env_file:` is container-only and does not apply at compose parse time. `.env.config` was correct but never read for interpolation. Result: agent-general was binding to ephemeral port 32773, making baseline script fail silently (live retrieval unaffected as Worker calls via nexus.arcanthyr.com tunnel). Fix is permanent — no variable prefix required on future restarts.

- **Retrieval baseline run** — session 45 result: 10 pass / 5 partial / 0 miss. Same as session 42. Q2 (BRD standard) regressed from partial to miss. Persistent partials: Q4 (Boatwright probate chunk at #2), Q8 (s55 relevance chunk at #1), Q14 (coronial inquiry chunk at #1). No new failures.

- **arcanthyr-session-closer skill fixed** — removed Step 2 (preview/confirmation block) from SKILL.md. Skill now goes directly from Step 1 (analyse) to Step 2 (output CC prompt). Fixes the confirmation loop that prevented the skill from firing cleanly in session 39.

**Completed**
- Outstanding priority #3 (Pydantic validation layer) — done
- Outstanding priority #4 (Option B header chunk fix) — done
- Outstanding priority #5 (retrieval baseline re-run) — done
- docker-compose.yml port hardcode — done

**Key learnings / gotchas**
- docker compose `${VAR}` in ports mapping is interpolated from `.env` only at parse time — `env_file:` injects into container environment only, not compose's own variable substitution. Invariant ports should always be hardcoded.
- Pydantic validation: use log-and-skip pattern (not fail-hard) — overly strict schema would block valid rows on edge cases; retry opportunity preserved by not marking embedded=1 on failure.

## CHANGES THIS SESSION (session 46) — 11 April 2026

### What we did
- Diagnosed Q2 (BRD) baseline retrieval failure — chunks existed but scored too low (0.5073 / 0.4831) to surface over "reasonable belief" chunks (0.5522)
- Root cause: [CONCEPTS:...] header at start of raw_text was dominant embedding signal, drifting BRD vectors into "reasonable/belief" neighbourhood
- Manually patched both BRD chunks with clean enriched_text prose, set embedded=0
- Identified 124 HOC chunks + 1,073 other secondary sources with same problem (901 using Concepts: format, 110 using [CONCEPTS:] format)
- Deployed poller fix: strip both CONCEPTS header formats from embed text and text payload field before Qdrant upsert (regex at line 695)
- Reset 1,201 secondary_sources rows to embedded=0 for full re-embed
- Created ~/ai-stack/.env with pinned port vars — docker compose was assigning ephemeral ports due to missing env file, breaking host-side diagnostic tooling
- Confirmed case_chunks unaffected (2 false positives mid-chunk, regex ^ does not match)

### Completed
- .env created on VPS with stable port bindings (QDRANT_GENERAL_PORT=6334, QDRANT_SENSITIVE_PORT=6335, OLLAMA_PORT=11434, AGENT_SENSITIVE_PORT=18791)
- Poller CONCEPTS strip deployed and confirmed running (grep + container mtime verified)
- 1,201 secondary sources reset to embedded=0, re-embed in progress at session close
- BRD chunk enriched_text patched manually

### Deferred
- Verify re-embed completes clean: SELECT COUNT(*) FROM secondary_sources WHERE embedded=0 should return 0 — check at start of next session
- Re-run Q2 BRD baseline query after re-embed to confirm fix
- Remaining baseline failures — not investigated this session

### Key learnings / gotchas
- Docker host port bindings are ephemeral when compose env vars are unset — always confirm ports via docker compose ps before host-side curl diagnostics
- Ollama has no host port binding by default — exec into agent-general container for any host-side embedding calls: docker exec agent-general python3 -c "..."
- Qdrant search() method removed in newer qdrant-client — use query_points() instead
- HOC secondary sources were ingested with enriched=1 directly, bypassing the enrichment poller, so enriched_text stayed NULL and dirty raw_text went to embedder

### Platform state
Secondary sources re-embed in progress (~25 min, 50/cycle). All other pipeline components healthy. Case count: 729 (+149 since session 45), 11,793 chunks all embedded.

## CHANGES THIS SESSION (session 47) — 11 April 2026

### What we did
- Reviewed Opus design consultation on sentencing extraction quality (263/313 criminal cases with procedure_notes = NULL)
- Root cause confirmed: cases processed before session 22 never ran sentencing second pass — not a prompt or classification failure
- Deployed three fixes to worker.js (version f267f1af):
  1. Removed chunk_type filter from sentencingTexts in performMerge() — all chunks now fed to SENTENCING_SYNTHESIS_PROMPT (was reasoning/mixed/procedural only, excluding evidence chunks containing prior history, victim impact, personal circumstances)
  2. Updated sentencing_found guard clause — now covers varied/confirmed/reviewed sentences (appeal courts that vary rather than impose were returning false)
  3. Added concurrent/cumulative, time served, ancillary orders to procedure_notes extraction checklist
- Fired requeue-merge for 331 criminal cases (+ accidental 726 full requeue from CC — harmless, idempotent)
- Re-merge in progress at session close — 12/331 criminal cases completed at last check, rest still processing

### Completed
- Sentencing synthesis input fix (all chunk types) — deployed
- Sentencing guard clause expansion — deployed
- Procedure_notes extraction fields expanded — deployed
- Requeue-merge fired for full corpus

### Deferred
- Spot-check procedure_notes results after queue drains — run count query at start of next session
- Option C (CHUNK-level sentencing enriched_text branch) — deferred to retrieval tuning phase; synthesis fix sufficient for now
- Verify session 46 secondary_sources re-embed completed (SELECT COUNT(*) FROM secondary_sources WHERE embedded=0)
- Re-run Q2 BRD baseline query after re-embed

### Key learnings / gotchas
- requeue-merge with target "remerge" sets deep_enriched=0 before re-enqueuing — spot-check counts will show regression mid-processing, not a bug
- PowerShell curl is alias for Invoke-WebRequest — use Invoke-WebRequest with -Headers @{} hashtable syntax, not -H string syntax
- CC will suggest additional requeue commands unprompted — verify before running to avoid duplicate work

### Platform state
Worker f267f1af live. Sentencing synthesis now receives full judgment text. 331+ cases re-merging via queue — check results next session.

## CHANGES THIS SESSION (session 48) — 11 April 2026

### What we did
- Confirmed secondary_sources re-embed complete: 1,201 → 0 remaining
- Confirmed procedure_notes null count (723/738) is expected — bulk of corpus predates procedure pass (session 17); no backfill action needed
- Diagnosed and fixed parties stringify bug in worker.js METADATA handler — Qwen3 returns `parties` as array, D1 threw `D1_TYPE_ERROR: Type 'object' not supported`. Fix: `Array.isArray` guard with `.join(", ")` before D1 bind (same pattern as `issues` field)
- Deployed fix (version b4869e6d)
- Requeued 3 cases stuck at enriched=0: 2022-tasmc-1 (the parties bug victim), 2016-tassc-51, 2016-tascca-7 — all reprocessed successfully
- Observed AustLII cron timeout on TAMagC/2026 (all 9 fetches ConnectTimeoutError) — transient AustLII issue, no code fix needed

### Parallel session: Scraper audit & fix
- Scraper appeared to achieve zero cases; TASMC 2026 never ran
- Root cause 1: TASMC added to COURTS (session 43) but YEARS ceiling was 2025 — range now starts at 2026
- Root cause 2: AustLII HTTP 500s treated as 404s — 30-min outage could burn 20 consecutive_misses and mark year "done" with 0 cases. TASMC_2025 had 100% 500 rate. TASMC_2024 missed cases 1–12, TASMC_2023 missed cases 5–16
- Fixes applied: (1) 500 retry logic — sleep 60–90s + one retry before counting miss, (2) per-court year ranges via COURT_YEARS dict replacing single YEARS range, (3) loop reordered to court-outer, (4) progress.json cleared TASMC 2023/2024/2025, (5) log string fix /5→/20
- Scraper confirmed working: 34 cases scraped (TASCCA_2025: 5, TASMC_2024: 4, TASMC_2023: 3, TASMC_2022: 8, TASMC_2021: 18+)

### Completed
- Secondary sources re-embed (session 46 carry-over) — done
- Parties array stringify fix — deployed and verified
- Scraper 500-retry and per-court year ranges — deployed in parallel session

### Deferred
- Re-run Q2 BRD baseline query (carried from session 46)
- Procedure Prompt second pass backfill (321 criminal cases) — gated behind Pass 2 quality review
- Remaining baseline failures — not investigated

### Key learnings / gotchas
- parties field uses join(", ") not JSON.stringify() — it's a display field, not parsed back
- Wrangler tail started before a deploy doesn't reliably show new version output — always start fresh tail after deploy
- AustLII 500s are transient and affect all courts — scraper must distinguish 500 (retry) from 404 (real miss)

### Platform state
Cases: 738 deep_enriched. Secondary sources: 1,201 all embedded (re-embed complete). Scraper: operational with 500-retry logic, per-court year ranges, TASMC backfill in progress.

## CHANGES THIS SESSION (session 49) — 11 April 2026

### What we did
- Confirmed Q2 BRD baseline fixed — secondary_sources now surfacing top results after session 46 re-embed. Re-embed confirmed working.
- Case count: 802 total, 802 deep_enriched (+64 since session 48). Scraper healthy — TASSC/TASCCA/TASFC done 2018–2026, TASMC done 2018–2025.
- Diagnosed procedure_notes low count (16/373 criminal cases) — root cause confirmed as queue still draining from session 47 requeue-merge, not a pipeline failure. isSentencingCase() and SENTENCING_SYNTHESIS_PROMPT both confirmed correct.
- Fired second requeue-merge (requeued=250) — inadvertently requeued full corpus again (citation parameter not scoped in handleRequeueMerge). Harmless/idempotent.
- Confirmed sentencing synthesis working from tail logs — cases showing "sentencing pass for X — N sentencing principles added" and "no sentencing content found" for non-sentencing judgments (correct behaviour).
- Confirmed subject_matter values are bare strings ('criminal', 'administrative', etc.) — isSentencingCase() Check 1 fires correctly for all 373 criminal cases.
- Expanded retrieval_baseline.sh from 18 to 31 queries — added Q19–Q31 covering sentencing, criminal procedure, appeals, family violence, expert evidence, right to silence.
- Saved pre-RRF baseline: ~/retrieval_baseline_pre_rrf.txt (287 lines, all 31 queries).
- Confirmed Opus RRF overhaul spec already exists (session ~40, April 5) — design complete, ready for implementation session. No further Opus consultation needed.

### Completed
- Q2 BRD baseline confirmed fixed
- Scraper progress reviewed — healthy, 2018+ done
- procedure_notes diagnosis — pipeline correct, queue was draining
- retrieval_baseline.sh expanded to 31 queries
- Pre-RRF baseline saved

### Deferred
- Check final procedure_notes count after queue fully drains (run: `SELECT COUNT(*) FROM cases WHERE subject_matter='criminal' AND procedure_notes IS NOT NULL`)
- RRF retrieval pipeline overhaul — implementation session, use Opus spec from April 5 session. Run baseline before and after (pre-change file: ~/retrieval_baseline_pre_rrf.txt).
- Corpus content gaps (Q10, Q14, Q31) — defer until scraper runs further back
- Scraper coverage review (extend pre-2018) — defer, review tomorrow
- Procedure Prompt second pass backfill — gated behind Pass 2 quality review

### Key learnings / gotchas
- Route paths and D1 column names must be verified from source before use in commands — do not infer. Ask CC to grep/read first.
- handleRequeueMerge() does not scope by citation — any requeue-merge call with target="remerge" requeues the full eligible corpus regardless of citation parameter. Verify before firing.
- isSentencingCase() Check 1 fires on bare 'criminal' string — confirmed correct, not the bottleneck
- Queue counts mid-drain show artificially low procedure_notes — always check queue state before diagnosing synthesis failures

### Platform state
Cases: 802 total, 802 deep_enriched. Secondary sources: 1,201 all embedded. Scraper: healthy, running back through 2017 and earlier. Sentencing synthesis: working correctly. Pre-RRF baseline saved.

## CHANGES THIS SESSION (session 50) — 13 April 2026

### What we did
- **Corpus progress check** — 1,234 total cases (all deep_enriched=1), up from 802 at session 49 close (+432 from scraper). 18,271 case chunks all done and embedded, up from 11,793. Secondary sources: 1,201 all embedded. Scraper actively running.

- **procedure_notes coverage gap diagnosed** — Found 72/513 criminal cases with procedure_notes (14%). CCA coverage only 10% (15/149) — severely low given CCA primarily handles sentencing appeals. Diagnosed two root causes via D1 queries and chunk inspection on Roland v Tasmania [2016] TASCCA 20 (24 chunks, ~60K chars total):
  1. `cases.holding` field (Pass 1 extracted outcome containing sentence quantum) was never passed to the sentencing synthesis prompt — absent from both caseRow SELECTs in CHUNK and MERGE handlers
  2. 40K char cap on sentencingTexts was truncating long judgments before reaching sentencing discussion. CCA judgments handle conviction grounds first (chunks 1–13), sentencing last (chunks 21–23). Cap cut off at approximately chunk 13 — model never saw the sentencing content.

- **Four fixes applied to worker.js and deployed**:
  1. CHUNK handler caseRow SELECT: added `holding` field
  2. MERGE handler caseRow SELECT: added `holding` field
  3. sentUser context: added `Outcome (Pass 1 summary): ${caseRow.holding || 'Not extracted'}` before chunk texts — gives model sentence quantum even when truncation occurs
  4. 40K cap raised to 120K chars — gpt-4o-mini supports 128K token context; previous cap was ~12× more conservative than necessary

- **Single-case test passed** — Reset Roland v Tasmania [2016] TASCCA 20 to deep_enriched=0, fired MERGE with limit=1. Within 2 minutes: deep_enriched=1, correct procedure_notes written ("Initially sentenced to three years imprisonment, the trial judge backdated..."). No timeout issues.

- **Full requeue-merge fired** — `{"target":"remerge"}` for all 1,234 cases at session close. Queue draining.

### Key learnings / gotchas
- 40K sentencing cap was an undocumented default from session 31 with no recorded rationale. gpt-4o-mini input processing is parallelised — 120K input adds ~1–2 seconds over 40K. The 25-second AbortController provides adequate timeout protection.
- `cases.holding` (Pass 1 outcome) is a more reliable source of sentence quantum than chunk-level `allHoldings` for CCA appeals — it captures the disposition section that may not fall cleanly within any single chunk.

### Deferred
- Verify final procedure_notes count after queue drains: `SELECT COUNT(*) FROM cases WHERE subject_matter='criminal' AND procedure_notes IS NOT NULL`
- Q2 BRD baseline rerun (carried from session 46/49)
- RRF retrieval pipeline overhaul — next major piece of work (Opus spec from session 40 ready)

## CHANGES THIS SESSION (session 51) — 13 April 2026

- **procedure_notes coverage confirmed** — 90/516 criminal cases (17.4%) at session start, up from 16/373 (4.3%) at session 49. 22 cases still processing at check (queue draining from session 50 requeue). Code fixes from session 50 (120K cap, `cases.holding` field) confirmed working. Batched requeue PowerShell script provided: 3×40 cases with 3-min gaps via `Invoke-WebRequest` loop — avoids GPT-4o-mini rate limit exhaustion from simultaneous synthesis calls.

- **RRF deferred — subject_matter filter implemented instead** — Corpus at ~20K vectors vs required 50K minimum for RRF; single embedding model (no independent retrieval signals across legs). Prerequisites not met. Pre-RRF baseline preserved at `~/retrieval_baseline_pre_rrf.txt`. Subject_matter filter implemented as higher-impact change requiring no re-embed.

- **subject_matter filter — LIVE** — Cache-based penalty approach (no case chunk re-embed required). New Worker route `GET /api/pipeline/case-subjects` returns full `{citation: subject_matter}` map for all cases (no X-Nexus-Key required). New server.py globals: `SM_PENALTY = 0.65`, `SM_ALLOW = {'criminal', 'mixed'}`, `_sm_cache`, `_sm_cache_ts`, `get_subject_matter_cache()` (hourly refresh via requests.get to Worker). `apply_sm_penalty()` applied to `case_chunk` type results in Pass 1 (after scoring, before court hierarchy re-rank) and in Pass 2 append loop. **Bug fix**: added `chunks.sort(key=lambda c: -c["score"])` between penalty application and court hierarchy re-rank — without this, `top_score` used the pre-penalty sort order making the cosine band wrong. Worker deployed via wrangler. Server.py deployed and verified (grep confirmed SM_PENALTY, get_subject_matter_cache, apply_sm_penalty all present). SM cache loaded on first search: 1,234 entries. Baseline wins: Q4 (tendency evidence clean), Q10 (s164 corroboration now at position 1 — was failure-to-give-evidence chunk), Q14 (s37 leading questions now at position 1 — coronial inquiry chunk gone).

- **Misclassification audit** — Prior KNOWN ISSUES entries for Tasmania v Pilling [2020] TASSC 13 and Tasmania v Pilling (No 2) [2020] TASSC 46 were incorrect — both are workers compensation cases, correctly classified as administrative. Three genuine misclassifications corrected via Cloudflare MCP D1 UPDATE to `subject_matter='criminal'`: [2021] TASMC 13, [2020] TASSC 16, [2022] TASSC 69.

- **Full 31-query retrieval baseline run** — Post-SM filter. 12 clear passes / ~13 partials / 3 miss (all corpus gaps). SM filter wins confirmed: Q4, Q10, Q14. Q8 improved: s55 relevance chunk now at position 3 (was position 1). Q2 regression identified and fixed (see below). Corpus gap misses: Q24 (committal procedure), Q27 (provocation/manslaughter), Q31 (right to silence) — no doctrine in corpus, require new chunks.

- **Q2 BRD fix — multi-round disambiguation** — Root cause: session 46 CONCEPTS strip removed semantic disambiguation from secondary source body text. Honest/reasonable mistake and police-powers chunks (Reasonableness of Belief, annotation, George v Rockett definition, hoc-b023 prescribed belief, Samoukovic v Brown, Innes v Weate discretion) have body text vocabulary (reasonable/belief/proof/standard/certainty) that overlaps with BRD queries. Fix: updated raw_text of all 6 competing chunks to add strong domain anchor sentences at the start of body text (MISTAKE OF FACT DEFENCE / POLICE OFFICER PRESCRIBED BELIEF STANDARD / POLICE OFFICER DISCRETION prefixes), reset embedded=0, re-embedded via poller. BRD enriched_text (hoc-b057, hoc-brd) reverted to clean BRD-only vocabulary after a contamination incident (see lesson below). Result: hoc-b057 at position 1 (0.5568) for BRD queries.

- **Embedding contamination lesson — CRITICAL** — During Q2 fix, added "distinct from George v Rockett prescribed belief test" disambiguation language to BRD enriched_text. This caused BRD chunks to drop out of top 6 entirely (from 0.54 to <0.51). Root cause: "this is NOT about X" language in an embedding text pulls the vector toward X just as much as "this IS about X." The model cannot reason about negation — it just sees semantic proximity to X. **Rule: never add cross-domain disambiguation to enriched_text. Put domain anchors on the COMPETING chunks only. Keep target chunk embedding text purely about the target domain.** Added to KNOWN ISSUES as CONCEPTS-adjacent vocabulary contamination.

- **worker.js `GET /api/pipeline/case-subjects` route** — Added at line ~3090 (after bm25-corpus block). Returns `{subjects: {citation: subject_matter}}` for all 1,234 cases. No auth required (non-sensitive read). Required for server.py `get_subject_matter_cache()` hourly refresh.

## CHANGES THIS SESSION (session 52) — 13 April 2026

### What we did
- **Truncation feedback loop — FULL FEATURE SHIPPED** — End-to-end implementation: detection, persistence, backfill, scraper warnings, and console UI.

  **D1 schema:** New `truncation_log` table (id, citation, original_length, truncated_to, source, status, date_truncated, date_resolved). `status` values: flagged/confirmed/replaced. `ON CONFLICT DO UPDATE` resets to flagged on re-scrape.

  **Worker changes (worker.js):**
  - Case text caps corrected: `handleFetchCaseUrl` was already at 500K (not 200K as documented), `handleUploadCase` was uncapped. Both now uniformly 500K with truncation logging. `processCaseUpload` (dead code — neither handler calls it) updated 200K→500K for consistency.
  - Truncation detection: both upload handlers now write to `truncation_log` D1 table when truncation fires (before the substring). Source field set to 'scraper' or 'manual_upload' per handler.
  - `GET /api/pipeline/truncation-status` — returns all truncation_log entries, no auth required (same pattern as case-subjects).
  - `POST /api/pipeline/truncation-resolve` — X-Nexus-Key required. Actions: 'confirm' (sets status=confirmed) or 'delete' (removes case + chunks + truncation_log entry).
  - Build error from CC str_replace cutting a template literal — fixed. Added `node --check worker.js` validation rule.

  **Scraper (austlii_scraper.py):** Console warnings added — `logging.warning` at >2M chars (Worker truncation threshold), `logging.info` at >200K chars (old cap comparison). Local file, no VPS deploy needed.

  **Backfill:** 20 cases flagged as potentially truncated via `LENGTH(full_text) >= 199000` query. Inserted into truncation_log with `original_length=-1` (unknown — retroactive), `source='backfill'`, `status='flagged'`.

  **Console UI (Library.jsx):**
  - Fetches `/api/pipeline/truncation-status` on mount, builds truncationMap for flagged entries.
  - CasesTable status column: red "Incomplete" pill badge for truncated cases (replaces normal status dot). Click opens TruncationModal.
  - TruncationModal: shows citation, source, obtained chars; for original_length=-1 shows "retroactively flagged" note; for known originals shows original/missing/percentage. Nexus key input (persists in Library state). Confirm Index and Delete Case buttons with busy state + error handling. window.confirm guard on delete.
  - Auth pattern matched from PipelineStatus.jsx. CSS variables matched: var(--red), var(--surface), var(--border-em), var(--amber).

- **EMAIL_DIGEST KV namespace identified** — KV binding `EMAIL_DIGEST` (ID: 9ea5773d11ac40ce9904ca21c602e9f4) used by email/contact management features and runDailySync email summary. Previously undocumented in MDs.

### Key learnings / gotchas
- CLAUDE.md had stale "200K cap" reference — actual state was handleFetchCaseUrl at 500K, handleUploadCase uncapped, processCaseUpload 200K (dead code). Always have CC grep actual values before assuming documented state is correct.
- 500K cap chosen over 2M to limit chunk explosion: 500K case = ~167 chunks/GPT calls (~$1.67); 2M case = ~667 chunks (~$6.67) plus queue congestion and OpenAI rate limit risk.
- Option B (chunk full text before truncating for storage) rejected — chunking happens in async queue consumer reading from D1 `cases.full_text`, so the text must be stored at full (or capped) length before the consumer runs. Can't reorder without breaking the async architecture.
- CC str_replace can clip multi-line template literals at context window boundaries — always run `node --check worker.js` after CC edits before deploying.
- `processCaseUpload` at worker.js line ~269 is dead code — neither `handleUploadCase` nor `handleFetchCaseUrl` calls it.

### Deferred
- Verify procedure_notes count after queue drain (carried from session 50)
- Q2 BRD baseline rerun (carried from session 46/49)
- Sentencing extraction fix implementation (carried)
- subject_matter filter: audit remaining misclassifications (carried)

### Platform state
Cases: 1,234+ (scraper running). Case chunks: 18,271+ all embedded. Secondary sources: 1,201 all embedded. truncation_log: 20 flagged cases. Scraper: running. enrichment_poller: running.

## CHANGES THIS SESSION (session 53) — 13 April 2026

- **procedure_notes health check** — 89/516 criminal cases (17%) at session start, flat from session 52 close. Repair batches from prior sessions had stalled. Full diagnosis run this session.

- **Root cause confirmed — two bugs in sentencing synthesis:**
  1. CHUNK handler `performMerge` call (worker.js line 3498) was constructing an inline caseRow that dropped `holding` — even though the DB fetch at line 3227 includes `holding`, it was omitted from `{ case_name, court, facts, issues, subject_matter }`. The session 50 sentUser prompt addition of `Outcome (Pass 1 summary): ${caseRow.holding}` was silently receiving `undefined` for all cases processed via the normal scraper CHUNK path. MERGE handler (requeue-merge path) was already correct — explains why prior requeue-merge passes partially worked.
  2. `max_completion_tokens: 2000` insufficient for complex multi-party sentencing cases — model output truncated mid-JSON, `JSON.parse` threw SyntaxError, caught silently by catch block, `procedure_notes` stayed null.
  3. Secondary: 25-second `AbortController` timeout too short for large cases (16+ chunks, ~48K char sentencing input) under concurrent queue load.

- **Test-first diagnosis methodology** — Before any code change, reset 3 cases to `deep_enriched=0` via Cloudflare MCP D1: Oh Marris [2023] TASCCA 1 (16 chunks, large), Hawdon [2022] TASCCA 4 (medium), Burns [2022] TASSC 43 (short). Fired default requeue-merge. D1 spot-check confirmed: Hawdon ✅ procedure_notes written, Burns ✅ procedure_notes written, Oh Marris ❌ still null. Size-dependent failure confirmed without touching code.

- **Three fixes deployed — worker.js version f02624fa:**
  1. `sentTimeout`: `25000` → `45000` ms
  2. `max_completion_tokens`: `2000` → `4000` (sentencing synthesis OpenAI call only — main synthesis and CHUNK enrichment unchanged)
  3. CHUNK handler inline caseRow: added `holding: caseRow?.holding` — fixes all new scraper cases going forward

- **Fix verified** — Reset Oh Marris to `deep_enriched=0`, fired requeue-merge, checked D1 after 60s: procedure_notes confirmed written ("The respondent was convicted of one count of rape and one count of indecent assault..."). Hardest test case passing.

- **Full requeue-merge fired** — `target:'remerge'` PowerShell loop queued ~1750 MERGE messages across ~7 iterations before being stopped. Race condition noted: queue processes MERGE messages and resets `deep_enriched` to 1, loop then re-picks those cases. Loop stopped manually at ~7 × 250. Duplicate processing is idempotent — procedure_notes will be correctly written or overwritten. Processing overnight on Cloudflare. Verify count at next session start.

- **D1 spot-check — 157 confirmed sentencing cases with NULL procedure_notes** — identified via SQL query on holding/issues fields containing sentencing language. Breakdown by court: Supreme 258/319 null, CCA 124/149 null, Magistrates 39/42 null, Fullcourt 6/6 null. Overnight requeue expected to resolve majority.

## CHANGES THIS SESSION (session 54) — 14 April 2026

### Health checks
- **Session-open health checks run:** 1,295 cases, 50 chunks done=0 (poller clearing), 0 embedding backlog, 0 secondary source backlog. Secondary source re-embed from session 53 confirmed complete.
- **procedure_notes count:** 88/571 criminal cases (15%) — effectively flat from session 53 close (89/516). The overnight bulk requeue-merge (~1750 messages) produced zero improvement. Root cause confirmed as Theory B: OpenAI rate limit 429s swallowed silently by the catch block, deep_enriched=1 written permanently, cases locked out of retry.

### Scraper audit
- **8 stale progress.json entries cleared** via CC — TASSC_2025, TASFC_2025, TASSC_2024, TASCCA_2024, TASFC_2024, TASCCA_2017, TASFC_2017, TASSC_2007. Root causes: 2024/2025 were marked done prematurely under old consecutive_misses=5 config (session 43 fix came after); 2017 CCA/fullcourt completed with zero results; 2007 TASSC aborted mid-run on AustLII 500 outage. Scraper will re-run these on next scheduled sessions.
- **TASMC ceiling confirmed correct** — COURT_YEARS['TASMC'] tops at 2025. No 2026 magistrates cases exist on AustLII, so no change needed.
- **truncation_log original_length=-1 bug noted** — all 20 backfill-flagged cases have original_length=-1 because the backfill INSERT used -1 as placeholder for unknown pre-truncation length. Scraper path also has this bug — worker does not capture pre-truncation length before the substring call. Minor fix deferred.
- **Three 2026 cases at 50,000 chars** (TASSC 2, 3, 5) — truncated at old 50K limit from before the 500K upgrade. Should be deleted and re-fetched at full length. Deferred.

### Sentencing backfill route — built, deployed, then paused on quality failure
- **runSentencingBackfill(env, limit) + POST /api/admin/backfill-sentencing** deployed (worker.js version dd196b8f). Architectural design is correct: direct-write pass bypassing queue and deep_enriched gate, targets subject_matter='criminal' AND procedure_notes IS NULL AND deep_enriched=1, mirrors performMerge() sentencing block exactly, writes only procedure_notes and appends to principles_extracted. NULL procedure_notes acts as implicit retry flag.
- **Smoke test passed:** {processed:1, skippedNotSentencing:2, failed:0, remaining:482} — architecturally sound.
- **Quality verification failed:** Three test cases graded by reconstructing actual D1 chunks (both cases well within 120K cap — failures are model failures, not input failures):
  - Field v Reardon [2006] TASSC 20 (sentence appeal): 13/25
  - Tasmania v Lockwood [2023] TASSC 5 (disputed-facts hearing reasons — NOT a sentencing): 7/25
  - Smillie v Tasmania [2017] TASCCA 26 (CCA sentence appeal): 12/25
  - Average: 10.7/25. Rollout paused (threshold is 14/25).

### Six quality failure modes identified in SENTENCING_SYNTHESIS_PROMPT
1. **Wrong-document classification** — model receives non-sentencing criminal judgments (fact-finding reasons, dangerous criminal applications, interlocutory rulings) and hedges instead of returning sentencing_found:false
2. **Hallucinated comparables** — model writes "the court relied on comparable cases" even when zero are cited; most damaging failure for sentencing-range research
3. **Hallucinated reasoning principles** — model invokes "general deterrence", "community protection", "rehabilitation potential" when source doesn't contain them
4. **Mitigating factor blindness** — model says "no substantial mitigating factors" even when source explicitly enumerates them
5. **Sentence structure terminology errors** — model conflates global / concurrent / cumulative sentences
6. **Missing appellate analytical structure** — for appeals, model misses the legal test applied (House v The King, Dinsdale v The Queen), appellate reasoning, and the appeal court's own comparators

### Architectural gap confirmed (from late-session Opus consultation in Cowork)
- **sentencing_status column recommended** — `procedure_notes IS NULL` is overloaded: means both "correctly null" and "failed silently." One column (`sentencing_status TEXT`: NULL / 'success' / 'failed' / 'not_sentencing') fixes observability and makes retry precise. `WHERE sentencing_status='failed'` replaces the heuristic 186-case keyword query. See decisions log for full design.

### Deferred
- Phase 0: test one clean TASMC first-instance sentencing via D1 chunks — determines whether fix is prompt revision or model upgrade
- SENTENCING_SYNTHESIS_PROMPT revision (6 failure modes documented above)
- sentencing_status D1 column + performMerge() instrumentation
- Re-process existing 89 procedure_notes under new prompt
- Resume backfill only after 5-case validation set scores 19+/25 average
- Existing 89 procedure_notes: set back to NULL before next session (misleading in current state)
- truncation_log original_length=-1 fix
- Three 50K-truncated 2026 cases re-fetch
- subject_matter filter (carried)
- Q2 BRD baseline rerun (carried)

### Platform state
Cases: 1,295. Case chunks: 19,008 total, 50 done=0 (enrichment in progress), 0 embedded=0. Secondary sources: 1,201 all embedded. procedure_notes: 88/571 criminal cases (15%). truncation_log: 20 flagged. Scraper: running (8 stale entries cleared). enrichment_poller: running.

## CHANGES THIS SESSION (session 55) — 14 April 2026

- **Session-open health checks:** 1,382 cases, 0 enrichment queue, 0 embedding backlog. All pipelines clear.
- **89 procedure_notes nulled:** `UPDATE cases SET procedure_notes = NULL WHERE procedure_notes IS NOT NULL AND subject_matter = 'criminal'` — previous outputs were actively misleading (session 54 quality failure). 89 rows confirmed nulled before any new work.
- **Phase 0 sentencing diagnosis:** Reconstructed [2020] TASSC 44 (Stanley v Koehler) chunk-by-chunk. Key finding: the "evidence chunks excluded from synthesis input" assumption was WRONG — the code already reads chunk_text from ALL chunks with no type filter. The sentencing extraction failure is purely prompt-level, not input-assembly. Evidence content (priors, personal circumstances, offence facts) is being passed to the model — the model just wasn't extracting it because the prompt said "reasoning sections" and had a weak decision rule.
- **SENTENCING_SYNTHESIS_PROMPT rewritten:** Four changes to worker.js:
  1. Full prompt replacement — Step 1 classification with explicit positive/negative case lists (now correctly excludes fact-finding, dangerous criminal applications, conviction-only appeals); Step 2 extraction split by first_instance/sentence_appeal/sentence_review; "never invent comparable cases" instruction; appeal-specific fields (original sentence, appellate standard, House v The Queen)
  2. Input label changed: "Judgment reasoning sections" → "Full judgment text"
  3. case_type field logged in performMerge parsing (not stored to D1)
  4. Same label fix + case_type log added to backfill route
- **Backfill route citation targeting added (by CC):** handleSentencingBackfill now accepts `body.citations` array to target specific cases. If absent, falls back to original sweep query. No procedure_notes IS NULL constraint when citations provided (re-runs work).
- **5-case validation — PASSED:**
  - Classification 6/6: Stanley (true ✅), Lockwood (true ✅), Smart (correctly false — conviction appeal/acquittal), Sudani (correctly false — s85(2) admissibility ruling), Dalton-Smith (correctly false — limitation period ruling), Barnes (true ✅), Venn (true ✅)
  - Fabrication: zero across all outputs — every claim verified against full AustLII judgment text
  - Quantum: stated in all sentencing cases (Barnes $650+6mo+conviction, Venn $250→$850+12mo CCO, Stanley 6mo+18mo cumulative=2yr)
  - **Backfill route safe to unpause**

## CHANGES THIS SESSION (session 56) — 14 April 2026

### Sentencing backfill
- **Backfill running unattended on VPS** — loop script firing batches of 5 via `/api/admin/backfill-sentencing`, ~237 cases remaining at session start, ETA ~80 min from session open. Quality spot-checked: Medical Council penalty appeals, workplace safety cases, H v DPP — specific sentence dates, quantum, and conditions captured correctly. Zero fabrication visible.
- **305 NOT_SENTENCING sentinel rows confirmed** — cases that pass keyword heuristic in D1 but fail `isSentencingCase()` on chunk inspection. These are NOT_SENTENCING strings in procedure_notes, not real data. Note added: these will need cleanup if `sentencing_status` column is ever added.

### Stale roadmap items identified and removed
- **Bare-year case_name appending** — confirmed resolved via D1 query (GLOB found zero real hits). Session 26 patch fully cleaned existing data. New cases coming in via scraper are clean. Removed from outstanding items.
- **Pass 2 Qwen3 prompt quality review** — confirmed low priority in CLAUDE_arch.md and verified via live D1 sample (1381/1382 cases have principles, quality looks case-specific). Removed as active task. Roadmap entry already marked "DEFERRED · low urgency — merge synthesis bypasses Pass 2 output" — confirmed correct.
- **Phase 0 TASMC diagnosis** — completed in session 55 (Stanley v Koehler chunk reconstruction). Already done. Removed from deferred list.
- **Backfill validation gate** — 5-case validation PASSED in session 55 (6/6 classification, zero fabrication). Backfill unpaused and running. Removed from deferred list.
- **Citation authority agent** — confirmed built in session 15 (`xref_agent.py`, `case_citations` and `case_legislation_refs` tables exist). What remains is only the nightly cron setup, which is a separate roadmap item. Corrected roadmap entry accordingly.
- **Q2 BRD baseline** — confirmed fixed after session 46 secondary source re-embed. Baseline history shows 14 pass/3 partial. "Carried" note was stale. Removed.
- **Re-process 89 procedure_notes** — covered by the currently running backfill. Removed from deferred list.

### subject_matter filter — Parts 1 and 2 deployed
- **Part 1 — worker.js** `fetch-case-chunks-for-embedding` route: added `c.subject_matter` to SELECT (already had LEFT JOIN cases). Deployed version `1393e405`.
- **Part 2 — enrichment_poller.py**: added `'subject_matter': chunk.get('subject_matter') or 'unknown'` to case chunk metadata dict at line 783. Applied directly on VPS via hex-ssh. Container restarted.
- **End-to-end verification**: Worker route confirmed returning `subject_matter` field. Qdrant spot-check confirmed new points contain `subject_matter: "unknown"` (correct for new unmerged cases) in payload. Parts 1 and 2 fully confirmed.
- **Part 3 deferred to tonight**: `UPDATE case_chunks SET embedded = 0` — fires before sleep, poller re-embeds ~19,000 chunks overnight. Existing criminal cases will come through as `"criminal"` after re-embed. server.py filter (`MatchAny(any=["criminal","mixed"])`) to be deployed tomorrow morning after confirming embedded=0 count is zero.
- **Part 3 command** (PowerShell, `Arc v 4/`): `npx wrangler d1 execute arcanthyr --remote --command "UPDATE case_chunks SET embedded = 0"`

### Platform state
Cases: 1,382. Secondary sources: 1,201. Case chunks: ~19,000. procedure_notes: running backfill (target >400/571 criminal cases). subject_matter filter: Parts 1+2 deployed, Part 3 pending tonight.

## CHANGES THIS SESSION (session 57) — 14 April 2026

### Session-open health checks
- Cases: 1,423. Embed backlog: 309 (subject_matter Part 3 re-embed in progress from overnight). Sentencing backfill: 120 real procedure_notes at session open (backfill running).

### Roadmap audit — items confirmed already done and struck off
- **Sentencing extraction fix** — confirmed fully implemented and backfill running. Memory was stale. Removed from list.
- **Word/PDF drag-drop upload** — confirmed built and working end-to-end in session 27. Removed from list.
- **Qwen3 UI toggle (third button)** — confirmed in session history: recommendation was to skip the third button, two-button Sol/V'ger toggle is correct as-is. Scratched.
- **Arcanthyr MCP server** — evaluated and dismissed: UI already does retrieval + synthesis; MCP wrapper just adds a layer with no meaningful gain over existing web UI. Scratched.
- **Citation authority agent build** — confirmed built in session 15 (xref_agent.py, case_citations and case_legislation_refs tables exist). Roadmap entry corrected; only cron setup remained.

### sentencing_status column (item 6)
- `ALTER TABLE cases ADD COLUMN sentencing_status TEXT` — additive, no pipeline impact
- `performMerge()` in worker.js: added `sentencingStatus` variable tracking three outcome paths — `'success'` (sentencing_found=true + procedureNotes non-null), `'failed'` (isSentencingCase=true but pass threw or returned no notes), `'not_sentencing'` (isSentencingCase=false). Written to final `UPDATE cases SET`.
- `runSentencingBackfill()`: same three outcome paths + status written on all D1 write paths including catch block. Sweep query updated to `sentencing_status IS NULL OR 'failed'` for precise retries.
- Deployed worker.js version `f2da1503`.
- Cleanup: `UPDATE cases SET sentencing_status = 'not_sentencing', procedure_notes = NULL WHERE procedure_notes = 'NOT_SENTENCING'` — 305 rows cleaned. Sentinel strings removed from procedure_notes.
- Backfill: `UPDATE cases SET sentencing_status = 'success' WHERE procedure_notes IS NOT NULL AND procedure_notes != 'NOT_SENTENCING'` — 126 rows marked success.
- Final state: 126 success, 310 not_sentencing, 1,056 NULL (non-criminal or awaiting backfill).

### truncation_log cleanup + re-fetch (item 5)
- Diagnosed: 20 entries all with `original_length=-1` and `source=backfill` — false positives from backfill script hitting its 120K prompt cap, not actual 500K raw_text truncation. CC confirmed no code fix needed (no `source='backfill'` write exists in worker.js — entries were from a one-time session 52 D1 command).
- 18 false positives marked confirmed: `UPDATE truncation_log SET status='confirmed', date_resolved=datetime('now') WHERE source='backfill' AND citation NOT IN ('[2022] TASSC 11','[2021] TASSC 27')`.
- Two genuinely over-500K cases deleted and re-fetched: `[2022] TASSC 11` (774K) and `[2021] TASSC 27` (549K). Both hit 500K again on re-fetch — genuinely enormous judgments. Both queued through full METADATA → CHUNK → MERGE pipeline. In progress at session close.

### xref_agent.py — criminal filter + treatment upgrade + nightly cron
- **Fix 1 — Criminal filter**: `handleFetchCasesForXref` in worker.js updated — added `AND subject_matter IN ('criminal', 'mixed')` to SQL, added `subject_matter` to SELECT. Civil/administrative cases excluded from citation network.
- **Fix 2 — Treatment upgrade**: `upgrade_treatment()` function added to xref_agent.py — post-processes `treatment='cited'` using `why` field keywords to upgrade to `applied`, `distinguished`, `not followed`, `referred to`. Already-specific values left untouched.
- **Batch D1 writes**: `handleWriteCitations` and `handleWriteLegislationRefs` in worker.js switched from sequential `await`-per-row to `env.DB.batch()` in 100-row chunks — fixed 30s Worker timeout on large batches.
- **Python timeout**: `write_citation_rows` and `write_legislation_rows` raised from 30s to 120s.
- **Full corpus run**: 563 criminal/mixed cases processed. 5,340 case_citations rows, 4,056 case_legislation_refs rows inserted. Treatment breakdown: 214 applied, 233 referred to, 33 distinguished, 17 not followed (upgraded from cited). [2026] TASSC 1 (civil) correctly excluded — 0 new inserts confirmed.
- **Nightly cron**: added to VPS crontab for `tom` user — `0 3 * * *`, logs to `~/ai-stack/xref_agent.log`.
- Deployed worker.js version `b654b868`. xref_agent.py synced to local repo and committed.

### Platform state
Cases: 1,492. Case chunks: ~21,458 total. Embed backlog: 184 (Part 3 re-embed + two re-fetched large cases in progress). Secondary sources: 1,201. procedure_notes: 126 success / 310 not_sentencing / 1,056 NULL. case_citations: 5,340. case_legislation_refs: 4,056. subject_matter filter: Parts 1+2 deployed; Part 3 re-embed in progress — server.py filter deploy pending embed backlog = 0.

## CHANGES THIS SESSION (session — 15 Apr 2026)

### MOSS-TTS-Nano — installed and integrated
- Cloned repo to ~/ai-stack/MOSS-TTS-Nano on VPS
- Installed CPU-only torch (torch==2.7.0+cpu, torchaudio==2.7.0+cpu) to avoid 2GB CUDA download
- Installed all requirements including WeTextProcessing/pynini via conda-forge
- Confirmed inference working via infer.py test (en_2.wav reference audio)
- Evaluated all available English voices: en_2, en_3, en_4, en_6, en_7, en_8 (en_1/en_5 not present in repo)
- Selected en_8 (male) as default voice, en_6 (female) as toggle alternative
- Generated ambient clip sets for both voices (8 clips each):
  - assets/ambient/ — en_6 (female): welcome, processing, searching, thinking, complete, error, no_results, loading
  - assets/ambient_male/ — en_8 (male): same 8 clips
- Set up systemd service (moss-tts.service) — enabled, running on 127.0.0.1:18083, auto-starts on boot
- Service confirmed active: ~990MB RAM, CPU-only inference

### TTS integration — server.py + Worker + frontend
- Added /tts route to server.py: POST, X-Nexus-Key auth, body { text, voice: "male"|"female" }, calls MOSS-TTS at 127.0.0.1:18083, returns raw WAV bytes as audio/wav. Voice defaults to female if omitted.
- Added /api/tts route to Worker (version da147055): forwards to VPS /tts with X-Nexus-Key, returns WAV blob with CORS headers
- Frontend TTS feature (version d05ea653 → 09186cc1):
  - src/utils/tts.js — singleton, generation counter for race condition prevention, onAudioStop pub/sub, playTTS/playAmbient/stopAll/getVoice/setVoice. Web Audio API (AudioContext) used — NOT HTMLAudioElement (fixes iOS/browser autoplay restrictions). unlockAudio() called synchronously in click/submit handlers before any await.
  - src/components/ReadButton.jsx — 🔊/⏹/⟳ states, stopPropagation, subscribes to onAudioStop
  - src/components/Nav.jsx — Male/Female pill toggle (no gender symbols), mute button removed
  - src/pages/Research.jsx — searching/complete/no_results/error ambient clips fire-and-forget on query lifecycle
  - src/App.jsx — welcome clip on first user interaction per session (sessionStorage flag), NOT setTimeout
- Voice preference stored in localStorage under arcanthyr_tts_voice (D1 sync deferred)
- Mute removed — users mute at OS/browser level

### Retrieval issue identified — not resolved
- Query "elements of assault" returned no relevant results despite 14 assault-related secondary sources in D1 (all embedded=1)
- Root cause not yet confirmed — suspected query embedding mismatch or retrieval scoring issue
- Deferred to next session — terminal state issue prevented VPS curl diagnostic
- Key finding: NEXUS_SECRET_KEY is NOT stored on VPS — only in local .env at Arc v 4/.env and injected via Worker

## CHANGES THIS SESSION (session 58) — 15 April 2026

### Retrieval diagnostic — "elements of assault" returning no results
- Root cause identified: 114 secondary source rows have YAML-style `---` frontmatter in `raw_text`; poller strip regex (session 46) used `^` anchor that never matched because `---\n` precedes `[CONCEPTS:]`
- Session 46 mass re-embed reinforced the problem — dirty text was re-embedded with fresh vectors
- Milligan and Harrison chunks identified as unfixable (body content was citation fragment only, ~93–104 chars) — deleted

### enrichment_poller.py — strip_frontmatter() rewrite
- Replaced single-line CONCEPTS regex at line 695 with dual-case `strip_frontmatter()` function
- Case 1: anchored `---` block strip with blank-line tolerance (handles `---\nCONCEPTS\nTOPIC\nJURISDICTION\n---\n` and variants)
- Case 2: bare inline `[CONCEPTS:]` / `Concepts:` line (session-46 behaviour preserved)
- Validated ALL PASS across 6 test cases including mid-body safety check before writing
- SCP'd to VPS, agent-general force-recreated, confirmed running new code

### ingest_corpus.py — Concepts: prepend removed
- Removed `Concepts: {concepts}\n\n{prose}` prepend from text assembly before POST
- Nothing downstream reads the prefix from raw_text — confirmed by reading Worker upload handler and server.py ingest path
- Future rows now land in D1 with clean prose only

### D1 — 113 secondary source raw_text rows cleaned
- strip_frontmatter() applied in Python to all 114 `---`-prefixed rows, cleaned text written back to D1
- embedded=0 reset on all 113 changed rows (1 no-op: markdown horizontal rule, not frontmatter)
- Re-embed in progress via enrichment-poller — ~63 remaining at session close, completing in background

### FTS5 note (deferred)
- 113 secondary_sources_fts rows still hold old dirty text
- Will update naturally on next INSERT OR REPLACE for those IDs
- No breakage, low priority

### TTS diagnostic — server-side working, container networking issue identified
- Root cause: MOSS-TTS was binding on 127.0.0.1 only; agent-general container cannot reach host loopback
- Fix applied: systemd service updated to `--host 0.0.0.0`; server.py updated to call `172.19.0.1:18083`
- docker-compose.yml: MOSS-TTS audio assets mount added (`/home/tom/ai-stack/MOSS-TTS-Nano/assets/audio` → same path in container)
- Direct host curl to 172.19.0.1:18083 returns 221KB WAV — MOSS-TTS itself confirmed working
- Remaining issue: container still cannot reach 172.19.0.1:18083 despite MOSS-TTS binding on 0.0.0.0 — unresolved, carry to next session
- /query endpoint on server.py confirmed dead code — nothing in worker.js calls it; both Sol and V'ger paths use /search for retrieval

### Key rotation reminder (low priority)
- NEXUS_SECRET_KEY was exposed in conversation history this session
- Rotate when convenient: generate new key, wrangler secret put, update VPS .env
