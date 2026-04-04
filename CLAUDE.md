CLAUDE.md — Arcanthyr Session File
Updated: 4 April 2026 (end of session 33) · Supersedes all prior versions
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
| enrichment_poller | Runs as permanent Docker service `enrichment-poller` (restart: unless-stopped) — no tmux required · poller auto-restarts on crash/reboot · check logs: `docker compose logs --tail=20 enrichment-poller` |
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
| qdrant-general host port | Host-side port is 6334 (not 6333) — docker-compose maps 127.0.0.1:6334->6333/tcp · always curl localhost:6334 from VPS host |
| Pasting into terminal | Never paste wrangler output back into terminal — type commands fresh · Never paste PS prompt prefix into terminal |
| Rogue d file | Delete with `Remove-Item "c:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\d"` if it reappears — commit deletion |
| server.py auth | All direct calls to localhost:18789 require header `X-Nexus-Key` · Get value: `grep NEXUS_SECRET_KEY ~/ai-stack/.env` on VPS · "unauthorized" = missing or wrong key |
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
| Scraper location | `arcanthyr-console\Local Scraper\austlii_scraper.py` · progress file: `arcanthyr-console\Local Scraper\scraper_progress.json` · log: `arcanthyr-console\Local Scraper\scraper.log` · runs on Windows only (VPS IP blocked) |
| Scraper progress file | No per-case resume — file only stores `{court}_{year}: "done"` or absent. Scraper always starts from case 1 for any unfinished court/year. Re-uploading already-ingested cases is harmless (upsert). |
| run_scraper.bat location | `C:\Users\Hogan\run_scraper.bat` — must be LOCAL (not OneDrive) to avoid Task Scheduler Launch Failure error |
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
| arcanthyr-ui dev server | `cd "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\arcanthyr-ui"` then `npm run dev` · Browser calls arcanthyr.com Worker directly (no Vite proxy) · auth removed for local dev — no login required |
| arcanthyr-ui deploy | Build: cd arcanthyr-ui → npm run build → cp -r dist/. "../Arc v 4/public/" → cd "../Arc v 4" → npx wrangler deploy · Do NOT use wrangler pages deploy · Do NOT add _redirects to public/ |
| Model toggle names | Sol = Claude API (claude-sonnet) · V'ger = Workers AI (Cloudflare Qwen3-30b) · V'ger is default |
| JWT secret | worker.js uses `env.JWT_SECRET` fallback to `env.NEXUS_SECRET_KEY` · no separate JWT_SECRET set in Wrangler — NEXUS_SECRET_KEY is signing key |
| worker.js query field | Frontend sends `{ query }` → Worker reads `body.query` → calls server.py with `{ query_text }` · never send query_text from frontend |
| Vite proxy IPv6 fix | proxy target hardcoded to `104.21.1.159` with `Host: arcanthyr.com` header + `secure: false` · Node.js on Windows prefers IPv6 but proxy fails · IPv4 workaround required |
| wrangler deploy path | Always `cd "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4"` — quotes required due to space in path |
| Merge synthesis | GPT-4o-mini synthesis call at merge time produces case-level principles from enriched_text · shared `performMerge()` function used by both CHUNK and MERGE handlers · falls back to raw concat on failure |
| PRINCIPLES_SPEC | Updated session 22 — case-specific prose style, no IF/THEN, no type/confidence/source_mode fields · only affects Pass 2 (Qwen3) which is overwritten by merge anyway |
| Bulk requeue danger | Never reset enriched=0 on all cases simultaneously — causes Pass 1 re-run + chunk re-split + GPT-4o-mini rate limit exhaustion · use requeue-merge for synthesis-only re-runs |
| requeue-merge target param | body.target='remerge' queries deep_enriched=1 cases, resets each to 0 before enqueuing MERGE message · default (no target) queries deep_enriched=0 with runtime chunk check · added session 23 |
| Opus referral triggers | Defer to Opus + extended thinking (always on) for: (1) Prompt engineering decisions — any LLM prompt that affects data quality at scale; (2) Architectural choices with downstream consequences (schema design, pipeline changes); (3) Any decision where getting it wrong requires a patch script, re-embed, or bulk data fix; (4) Design decisions affecting 100+ rows or Qdrant points. CC should flag these rather than answering directly. |

**Tooling:**
- Claude.ai — architecture, planning, debugging, writing CLAUDE.md, code review
- Claude Code (VS Code) — file edits, terminal commands, git, wrangler deploys
- PowerShell / SSH — VPS runtime commands, long-running Python scripts

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

## SYSTEM STATE — 4 April 2026 (end of session 33)

| Component | Status |
|---|---|
| Qdrant general-docs-v2 | 10,333+ vectors · all 1,272 legislation sections re-embedded with Act name prefix · 1,174+ secondary sources · citation + source_id confirmed in all payloads · case chunks embedded |
| D1 cases | 551 total · all 551 deep_enriched=1 · 0 pending merge · all new-format principles (no IF/THEN remaining) |
| D1 case_chunks | all done=1 (nightly cron complete session 31) · case-embed active via poller |
| D1 secondary_sources | 1,174+ total · all enriched=1 · all embedded=1 |
| enrichment_poller | RUNNING — case-embed active |
| Cloudflare Queue | Nightly cron COMPLETE — all done=0 chunks cleared · cron still armed for new scraper cases |
| Scraper | RUNNING — Task Scheduler 8am + 6pm AEST (re-enabled session 31) |
| arcanthyr.com | Live — worker.js version ae4b735c · Library Principles tab fix deployed |
| arcanthyr-ui.pages.dev | DELETED — redundant Cloudflare Pages project removed |

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

1. **Fix runDailySync proxy** — update to use fetch-page proxy instead of direct AustLII fetch · do NOT delete — feature needed for forward-looking new case capture once scraper works backwards
2. **handleFetchSectionsByReference LIKE tightening** — current `'%' || ? || '%'` on secondary_sources produces false positives (s38 matches IDs with 138) · low priority — retrieval baseline unaffected · tighten LIKE pattern to require `s` prefix before number
3. **Fix corpus content gaps** — block_023 (dangling `...BUT see below`) and block_028 (`[Continues with specifics...]`) need source material from `rag_blocks/` · defer to Procedure Prompt re-ingest session
4. **Fix UI Secondary Sources upload path** — React UI POSTs to `/upload-corpus` instead of `/api/legal/upload-corpus` · one-line fix in arcanthyr-ui
5. **Pass 3 debug log in server.py** — `chunk_id` debug log added to Pass 3 fires unconditionally · needs removal or conditionalization (e.g. guard behind env flag or only when results empty)
6. **Myers v DPP retrieval test** — post-enrichment check still not run · run after next batch of secondary source uploads
7. **Ingest Validation Layer (Pydantic)** — DEFERRED · Pydantic validation guard for enrichment_poller.py. Validates enrichment output before writes to Qdrant/D1. Catches malformed metadata at ingest time rather than during retrieval. Status: Deferred — the two bugs it would have caught are fixed at source, corpus is clean, no bulk ingests imminent. Build when next bulk operation or model swap is approaching. Scope: (1) schemas.py — CaseChunk + SecondarySourceChunk Pydantic models, (2) try/catch validation wrapper around Qdrant write calls in poller, (3) optional validation_failures D1 table for logging bad rows. Isolated to poller only — no changes to worker.js, server.py, or frontend. Schema constraints: citation required not optional, case_name min length (catches single-word division labels), chunk_text min length, type literal enum ("case", "secondary_source"). Architecture context: poller runs in Docker on VPS (~/ai-stack/agent-general), writes to Qdrant general-docs-v2 and D1 arcanthyr. Pattern: AutoBe/Typia — define schema tightly, validate on output, log structured errors. Trigger condition: next bulk ingest or model swap.

---

## KNOWN ISSUES / WATCH LIST

- **Corpus ... placeholders — 3 of 5 resolved** — part1.md:1282 and part2.md:2415 confirmed as legal elisions (not errors) · part2.md:381 `T...` fixed to `The` · remaining 2 genuine gaps: part2.md:1167 block_023 (`...BUT see below` dangling ref) and part2.md:1957 block_028 (`[Continues with specifics...]` placeholder) — both need source material from rag_blocks/, deferred to Procedure Prompt re-ingest
- **UI Secondary Sources upload broken** — React UI posts to `/upload-corpus` (404) instead of `/api/legal/upload-corpus` · workaround: use PowerShell Invoke-WebRequest directly · fix is one-line path change in arcanthyr-ui
- **Synthesis deduplication loose** — "4-8 principles" instruction not tight enough · spot-check produced 4 principles from 2 ideas (redundant restatements) · not a blocker for retrieval (embeddings match correctly) · note for Pass 2 prompt quality review on roadmap
- **Bulk requeue race condition** — firing >500 simultaneous CHUNK messages causes GPT-4o-mini rate limit exhaustion and merge race conditions · always use batched approach (limit=250) for bulk requeue operations · never reset all chunks simultaneously
- **Never reset enriched=0 on all cases** — this triggers full Pass 1 + chunk re-split + CHUNK re-processing for all cases · use `requeue-merge` (synthesis-only) or `requeue-chunks` (chunk-only) for targeted operations
- **fetch-case-url vs upload-case** — URL-based ingestion must use `POST /api/legal/fetch-case-url` · `upload-case` is for direct text upload only · posting {url} to upload-case crashes on citation.match(undefined)
- **subject_matter pending** — cases.subject_matter will populate as chunks complete · verify spot-check before using as retrieval filter
- **FTS5 backfill complete** — 1,171 rows · session 13
- **CHUNK prompt reasoning field** — added and reverted session 10 · do not re-add
- **Qwen3 /query endpoint timeout** — server.py Qwen3 inference times out when scraper hammering Ollama · not a problem for UI (uses Claude API primary)
- **RRF displacement of case chunks** — case chunks only in semantic pass · investigate next session
- **Workers AI content moderation** — Qwen3 blocks graphic evidence · CHUNK enrichment on GPT-4o-mini · Pass 1/Pass 2 still on Workers AI — monitor
- **striprtf** — not installed in agent-general container · RTF uploads will error · python-docx is installed (added Dockerfile.agent session 27) so DOCX uploads work
- **Word artifact noise** — 131 chunks cleaned 18 Mar 2026 · re-run gen_cleanup_sql.py if new Word-derived chunks ingested
- **FTS5 export limitation** — wrangler d1 export does not support virtual tables
- **Scraper no per-case resume** — progress file only stores court_year: "done"
- **Pass 2 (Qwen3) principles irrelevant** — CHUNK merge overwrites principles_extracted with chunk-level data · Pass 2 output never visible · PRINCIPLES_SPEC update session 22 has no practical effect until merge behaviour changes
- **Synthesis skip on null enriched_text** — performMerge synthesis call requires enrichedTexts.length > 0 · cases whose chunks have null enriched_text fall back to raw principle concatenation (old format)

---

## CHANGES THIS SESSION (session 29) — 3 April 2026

- **Secondary source citation fix deployed** — `enrichment_poller.py` `run_embed_secondary_sources()` updated: added `citation: chunk.get('id', '')` and corrected `source_id: chunk.get('id', '')` to metadata dict (previously `source_id` used `chunk.get('source_id', '')` which was always empty; `citation` was entirely absent). Added `[EMBED_SS]` debug log line after upsert to confirm citation/source_id per point. Deployed following Poller Deploy Validation Procedure: SCP → grep → restart → start-time check → clean start. Re-embed running: 1,188 rows reset, ~50 complete at session close.

- **server.py semantic pass citation fallback** — line 271 updated from `payload.get("citation", "unknown")` to `payload.get("citation") or payload.get("chunk_id", "unknown")`. Fixes secondary source chunks showing "unknown" in semantic pass results (Pass 3 already had this fallback). Deployed via SCP + force-recreate agent-general.

- **Poller Deploy Validation Procedure added to CLAUDE.md** — 10-step checklist (deploy → reset → monitor) added as permanent named section. Key rule: restart container BEFORE reset; verify container start time is after file mtime before resetting embedded=0.

- **enrichment_poller.py SCP rules added to SESSION RULES** — pull and push SCP commands added alongside existing server.py SCP rules. Root cause of both past deploy failures was absence of this rule.

- **Session 25 and 27 changelog entries corrected** — both marked with ⚠ "DESCRIBED AS DEPLOYED BUT NOT CONFIRMED ON VPS" with session 29 fix reference.

- **Legislation Act-title prefix re-embed deferred** — audit confirmed session 25 fix never reached VPS (VPS `run_legislation_embedding_pass()` still uses `embed_text = s['text']`). Scheduled for next session after secondary source re-embed completes.

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

---

## FUTURE ROADMAP

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
