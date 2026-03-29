CLAUDE.md — Arcanthyr Session File
Updated: 29 March 2026 (end of session 24) · Supersedes all prior versions
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
| enriched=1 after ingest | After any secondary_sources ingest, always manually set `enriched=1` via wrangler d1 — new rows land with enriched=0 and poller won't embed them until this is done |
| Cloudflare Queues | LIVE — fetch-case-url and upload-case both async via queue · Queue name: arcanthyr-case-processing · Message types: METADATA (Pass 1), CHUNK (principle extraction), MERGE (synthesis-only re-merge) |
| case_chunks table | D1 table — stores 3k-char chunks per case · columns: id, citation, chunk_index, chunk_text, principles_json, enriched_text, done, embedded · PK is `citation__chunk__N` format |
| deep_enriched flag | Column on cases table · 0 = Pass 1 only · 1 = all chunks processed and merged |
| Queue message types | METADATA → Pass 1 + split + enqueue chunks · CHUNK → one GPT-4o-mini call per chunk + merge when all done · MERGE → synthesis-only re-merge (no chunk reprocessing) |
| D1 no citation column | secondary_sources PK is `id` (TEXT) — no `citation` column. Never query `WHERE citation =`. |
| callWorkersAI fix | reasoning_content fallback added — if content is null, falls back to reasoning_content before text. Fixes Qwen3 thinking mode responses. |
| poller batch/sleep | Default batch: 50 · Loop sleep: 15 seconds |
| BM25_FTS_ENABLED | Kill switch in server.py — set False to disable FTS5 pass. SCP + force-recreate container. No wrangler deploy needed. |
| Canonical categories | annotation, case authority, procedure, doctrine, checklist, practice note, script, legislation — normalised 18 Mar 2026 |
| Scraper location | `arcanthyr-console\Local Scraper\austlii_scraper.py` · progress file: `arcanthyr-console\Local Scraper\scraper_progress.json` · log: `arcanthyr-console\Local Scraper\scraper.log` · runs on Windows only (VPS IP blocked) |
| Scraper progress file | No per-case resume — file only stores `{court}_{year}: "done"` or absent. Scraper always starts from case 1 for any unfinished court/year. Re-uploading already-ingested cases is harmless (upsert). |
| run_scraper.bat location | `C:\Users\Hogan\run_scraper.bat` — must be LOCAL (not OneDrive) to avoid Task Scheduler Launch Failure error |
| PDF upload (case) | OCR fallback now wired — scanned PDFs auto-route to VPS /extract-pdf-ocr · citation and court auto-populate from OCR text · court detection checks header (first 500 chars) before full text |
| server.py canonical copy | VPS is canonical — always SCP down before editing locally: `scp tom@31.220.86.192:/home/tom/ai-stack/agent-general/src/server.py "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\server.py"` |
| SCP server.py to VPS | `scp "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\server.py" tom@31.220.86.192:/home/tom/ai-stack/agent-general/src/server.py` then force-recreate agent-general |
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

**Tooling:**
- Claude.ai — architecture, planning, debugging, writing CLAUDE.md, code review
- Claude Code (VS Code) — file edits, terminal commands, git, wrangler deploys
- PowerShell / SSH — VPS runtime commands, long-running Python scripts

---

## SYSTEM STATE — 29 March 2026 (end of session 24)

| Component | Status |
|---|---|
| Qdrant general-docs-v2 | 10,333 vectors total · 1,272 legislation + 1,172 secondary source chunks · case chunks embedding via poller |
| D1 cases | 549 total · 329 deep_enriched · 220 pending chunk completion · [2026] TASFC 1 deleted (junk raw_text) |
| D1 case_chunks | 8,672 total · ~1,753 done=0 (nightly cron clearing 250/night) · ~6,919 done=1 |
| D1 secondary_sources | 1,172 total · all enriched=1 · all embedded=1 |
| enrichment_poller | RUNNING — restarted 29 March after 5-day stall · force-recreated with enriched_text IS NOT NULL guard |
| Cloudflare Queue | Nightly cron clearing done=0 chunks at 3am UTC (1pm AEST) · 250/night |
| Scraper | NOT RUNNING — last log entry 24 March · Task Scheduler status unknown · re-investigate next session |
| arcanthyr.com | Live — Worker version bdfa662e (session 24: Pass 1 case_name prompt fix + enriched_text IS NOT NULL SQL guard) |
| arcanthyr-ui.pages.dev | Redundant — safe to delete · no longer updated |

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

1. **Monitor nightly cron** — ~1,753 chunks pending · cron fires 3am UTC (1pm AEST) · 250/night · ~7 nights remaining · check: `SELECT SUM(CASE WHEN done=0 THEN 1 ELSE 0 END) as pending FROM case_chunks`
2. **Bulk re-merge old-format cases after cron completes** — fire `requeue-merge` with `{"target":"remerge","limit":330}` once done=0=0 · synthesis will produce new-format principles for all early-merged cases
3. **Run retrieval baseline** — ~/retrieval_baseline.sh on VPS after chunk cleanup completes and poller re-embeds
4. **Fix scraper Task Scheduler** — last log entry 24 March · confirm Task Scheduler status and re-enable if dead
5. **Upload FSST medications chunk** — formatted chunk ready · upload via arcanthyr.com Upload tab (Secondary Sources) · citation: hoc-b033-m004-fsst-medications-false-positive-response · then set enriched=1 · deferred from session 24
6. **Legislation Act name gap** — prepend legislation_id as Act name in Qdrant payload · re-embed 1,272 sections
7. **handleFetchSectionsByReference LIKE fix** — replace '%38%' slug match with FTS5
8. **Delete arcanthyr-ui.pages.dev** — Cloudflare dashboard → Pages → arcanthyr-ui → Settings → Delete project
9. **Fix corpus ... placeholders** — 5 gaps identified: part1.md:1282, part2.md:381/1167/1957/2415 · source file fixes + re-ingest needed · low priority
10. **Disable runDailySync legacy cron** — 2am UTC cron calls legacy Worker-native AustLII scraper superseded by Python scraper · safe to disable · low priority

---

## KNOWN ISSUES / WATCH LIST

- **Queue stalled on 2,594 chunks** — bulk requeue (548 cases simultaneously) exhausted max_retries=5 on GPT-4o-mini rate limits · nightly cron at 3am UTC re-enqueues 250/night · self-resolving in ~10 nights · can manually fire `requeue-chunks` with `{"limit":250}` to speed up
- **Corpus ... placeholders** — 5 genuine gaps identified: part1.md:1282 (standalone ...), part2.md:381 (T... truncated word), part2.md:1167 (...BUT (see below) dangling ref), part2.md:1957 ([Continues with specifics...] placeholder tag), part2.md:2415 (standalone ...) · source file fixes + re-ingest needed · low priority
- **Synthesis deduplication loose** — "4-8 principles" instruction not tight enough · spot-check produced 4 principles from 2 ideas (redundant restatements) · not a blocker for retrieval (embeddings match correctly) · note for Pass 2 prompt quality review on roadmap
- **~329 cases merged with old-format principles** — synthesis confirmed working (session 23 spot-check on [2020] TASSC 1) · re-merge route fixed with target:remerge param · waiting on cron to clear 2,086 pending chunks before bulk re-merge fires · command: `{"target":"remerge","limit":330}`
- **Bulk requeue race condition** — firing >500 simultaneous CHUNK messages causes GPT-4o-mini rate limit exhaustion and merge race conditions · always use batched approach (limit=250) for bulk requeue operations · never reset all chunks simultaneously
- **Never reset enriched=0 on all cases** — this triggers full Pass 1 + chunk re-split + CHUNK re-processing for all cases · use `requeue-merge` (synthesis-only) or `requeue-chunks` (chunk-only) for targeted operations
- **fetch-case-url vs upload-case** — URL-based ingestion must use `POST /api/legal/fetch-case-url` · `upload-case` is for direct text upload only · posting {url} to upload-case crashes on citation.match(undefined)
- **subject_matter pending** — cases.subject_matter will populate as chunks complete · verify spot-check before using as retrieval filter
- **FTS5 backfill complete** — 1,171 rows · session 13
- **CHUNK prompt reasoning field** — added and reverted session 10 · do not re-add
- **Qwen3 /query endpoint timeout** — server.py Qwen3 inference times out when scraper hammering Ollama · not a problem for UI (uses Claude API primary)
- **RRF displacement of case chunks** — case chunks only in semantic pass · investigate next session
- **Workers AI content moderation** — Qwen3 blocks graphic evidence · CHUNK enrichment on GPT-4o-mini · Pass 1/Pass 2 still on Workers AI — monitor
- **python-docx / striprtf** — not installed in agent-general container · DOCX/RTF uploads will error
- **Word artifact noise** — 131 chunks cleaned 18 Mar 2026 · re-run gen_cleanup_sql.py if new Word-derived chunks ingested
- **FTS5 export limitation** — wrangler d1 export does not support virtual tables
- **Scraper no per-case resume** — progress file only stores court_year: "done"
- **Pass 2 (Qwen3) principles irrelevant** — CHUNK merge overwrites principles_extracted with chunk-level data · Pass 2 output never visible · PRINCIPLES_SPEC update session 22 has no practical effect until merge behaviour changes
- **Synthesis skip on null enriched_text** — performMerge synthesis call requires enrichedTexts.length > 0 · cases whose chunks have null enriched_text fall back to raw principle concatenation (old format)

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
- **subject_matter retrieval filter** — once cases.subject_matter populated after reprocess, add filter to case chunk Qdrant pass to scope criminal law queries to criminal cases only
- **Duplicate principle deduplication** — SUPERSEDED by merge synthesis step (session 22) which produces deduplicated case-level principles
- **Re-embed pass** — COMPLETED session 14 as part of CHUNK v3 reprocess — all case chunks being re-embedded from enriched_text overnight
- **Extend scraper to HCA/FCAFC** — after async pattern confirmed at volume
- **Retrieval eval framework** — formalise scored baseline as standing process
- **Cloudflare Browser Rendering /crawl** — Free plan. For Tasmanian Supreme Court sentencing remarks
- **FTS5 as mandatory third RRF source** — currently gated by BM25_FTS_ENABLED. Validate post-scraper-run
- **Qwen3 UI toggle** — add third button to model toggle
- **Nightly cron for xref_agent.py** — after scraper actively running
- **Stare decisis layer** — surface treatment history from case_citations
- **Agent work (post-corpus validation)** — contradiction detection, coverage gap analysis, citation network traversal
- **Legislation enrichment via Claude API** — plain English summaries, cross-references
- **CHUNK finish_reason: length** — increase CHUNK max_tokens from 1,500 if truncation rate unacceptable
- **Dead letter queue** — for chunks that fail max_retries. Low priority
- **Word artifact cleanup script** — re-run gen_cleanup_sql.py if new Word-derived corpus chunks ingested
