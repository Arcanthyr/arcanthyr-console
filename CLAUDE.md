CLAUDE.md — Arcanthyr Session File
Updated: 24 March 2026 (end of session 18, full) · Supersedes all prior versions
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
| Cloudflare Queues | LIVE — fetch-case-url and upload-case both async via queue · Queue name: arcanthyr-case-processing · Message types: METADATA (Pass 1) and CHUNK (principle extraction) |
| case_chunks table | New D1 table — stores 3k-char chunks per case · columns: id, citation, chunk_index, chunk_text, principles_json, done, embedded · PK is `citation__chunk__N` format |
| deep_enriched flag | New column on cases table · 0 = Pass 1 only · 1 = all chunks processed and merged |
| Queue message types | METADATA → Pass 1 + split + enqueue chunks · CHUNK → one Workers AI call per chunk + merge when all done |
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
| requeue admin routes | POST /api/admin/requeue-chunks — re-enqueues done=0 chunks · POST /api/admin/requeue-metadata — re-enqueues enriched=0 cases · both require X-Nexus-Key · read key from .env with $key = (Select-String "NEXUS_SECRET_KEY" .env).Line.Split("=")[1] |
| PowerShell Invoke-WebRequest | Add -UseBasicParsing to avoid security prompt · use $key pattern above for auth header |
| Workers Paid | Cloudflare Workers Paid plan active ($5/month) — no neuron cap · purchased session 10 |
| CLAUDE_decisions.md | Upload each session alongside CLAUDE.md + CLAUDE_arch.md · CC appends decisions directly · re-extract quarterly via extract_decisions.py |
| Wrangler auth | If D1 queries return error 7403, run npx wrangler login to re-authenticate |
| arcanthyr-ui dev server | `cd "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\arcanthyr-ui"` then `npm run dev` · Browser calls arcanthyr.com Worker directly (no Vite proxy) · auth removed for local dev — no login required |
| arcanthyr-ui deploy | Cloudflare Pages — not yet configured · TBD next session |
| JWT secret | worker.js uses `env.JWT_SECRET` fallback to `env.NEXUS_SECRET_KEY` · no separate JWT_SECRET set in Wrangler — NEXUS_SECRET_KEY is signing key |
| worker.js query field | Frontend sends `{ query }` → Worker reads `body.query` → calls server.py with `{ query_text }` · never send query_text from frontend |
| Vite proxy IPv6 fix | proxy target hardcoded to `104.21.1.159` with `Host: arcanthyr.com` header + `secure: false` · Node.js on Windows prefers IPv6 but proxy fails · IPv4 workaround required |
| wrangler deploy path | Always `cd "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4"` — quotes required due to space in path |

**Tooling:**
- Claude.ai — architecture, planning, debugging, writing CLAUDE.md, code review
- Claude Code (VS Code) — file edits, terminal commands, git, wrangler deploys
- PowerShell / SSH — VPS runtime commands, long-running Python scripts

---

## SYSTEM STATE — 24 March 2026 (end of session 18)

| Component | Status |
|---|---|
| Qdrant general-docs-v2 | 1,272 legislation + 1,172 secondary source chunks · case chunks re-embedding overnight |
| D1 cases | 543 total · 479 deep_enriched · 537 holding=null or failed (Pass 1 prompt fix needed) |
| D1 case_chunks | 8,533 total · 5,128 good (done=1, enriched_text populated) · 3,143 done=0 (reprocessing overnight) |
| D1 secondary_sources | 1,172 total · all enriched=1 · all embedded=1 |
| worker.js | Version 7e0c7dc0 · CHUNK handler fix deployed · re-throw on JSON parse failure + chunk_type guard |
| enrichment_poller | Running · idle (no chunks ready to embed — waiting for queue to produce done=1 chunks) |
| Cloudflare Queue | Draining overnight · requeue-chunks called multiple times · ~3,143 chunks remaining |
| Scraper | DISABLED — Task Scheduler paused overnight · re-enable after done=0 = 0 |
| arcanthyr-ui | Library improved · local dev working · Cloudflare Pages deploy still pending |

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

**Note:** Baseline rerun required next session after embed pass completes on new corpus (1,171 chunks).

---

## OUTSTANDING PRIORITIES

1. **Morning check** — `SELECT COUNT(*) FROM case_chunks WHERE done=0` → confirm 0
2. **Run retrieval baseline** — ~/retrieval_baseline.sh on VPS after done=0 confirms 0
3. **Re-enable scrapers** — Task Scheduler run_scraper + run_scraper_evening after done=0 = 0
4. **Fix Pass 1 prompts for Qwen3** — pull pass1Prompt/pass2Prompt/singlePassPrompt via CC · redesign for Qwen3-30b output style · increase Pass 1 maxTokens 2000→3000 · fix holding merge to last-non-null-wins · test on 5–10 cases · requeue-metadata all 543
5. **Fix merge logic** — holdings consolidation in CHUNK merge step · deduplicate across chunks · add principles consolidation · then requeue-metadata (free, fast — no GPT calls)
6. **Poller CASE-EMBED guard** — add `enriched_text IS NOT NULL` to CASE-EMBED fetch in enrichment_poller.py
7. **Fix malformed row** — `hoc-b{BLOCK_NUMBER}-m001-drug-treatment-orders`
8. **handleFetchSectionsByReference LIKE fix** — replace `'%38%'` slug match with FTS5
9. **Cloudflare Pages deploy** — arcanthyr-ui local dev working · configure Pages project
10. **Library reading pane from Research** — click source card → reading pane opens

---

## KNOWN ISSUES / WATCH LIST

- **Case chunks reprocessing overnight** — 5,187 chunks requeued session 14 · v3 prompt running · check done count in morning · poller re-embedding as chunks complete
- **Baseline rerun needed** — after re-embed completes · previous 14/3/0 score was with old chunk payloads · expect case law query improvement
- **subject_matter pending** — cases.subject_matter will populate as chunks complete overnight · verify spot-check before using as retrieval filter
- **FTS5 backfill complete** — 1,171 rows · session 13
- **CHUNK prompt reasoning field** — added and reverted session 10 · do not re-add
- **Qwen3 /query endpoint timeout** — server.py Qwen3 inference times out when scraper hammering Ollama · not a problem for UI (uses Claude API primary)
- **RRF displacement of case chunks** — case chunks only in semantic pass · investigate next session
- **Workers AI content moderation** — Qwen3 blocks graphic evidence · CHUNK enrichment on GPT-4o-mini · Pass 1/Pass 2 still on Workers AI — monitor
- **python-docx / striprtf** — not installed in agent-general container · DOCX/RTF uploads will error
- **Word artifact noise** — 131 chunks cleaned 18 Mar 2026 · re-run gen_cleanup_sql.py if new Word-derived chunks ingested
- **FTS5 export limitation** — wrangler d1 export does not support virtual tables
- **Scraper no per-case resume** — progress file only stores court_year: "done"

---

## CHANGES THIS SESSION (session 18) — 24 March 2026

- **Silent CHUNK enrichment failure diagnosed and fixed** — 3,677 case chunks (49% of corpus) had done=1 but enriched_text=NULL and empty principles_json (chunk_type=null). Root cause: JSON parse failure in CHUNK handler inner try/catch was swallowed — execution continued to UPDATE done=1 with empty defaults. GPT was returning valid 200 responses but unparseable JSON on ~49% of chunks, silently poisoning D1 since session 14 v3 reprocess.
- **CHUNK handler fix deployed — worker.js version 7e0c7dc0** — (1) inner JSON parse catch now re-throws → outer catch fires → msg.retry() called → queue retries; (2) chunk_type guard added before UPDATE done=1 — throws if chunk_type is null/undefined, catching empty GPT responses. Chunks that fail now retry up to queue max retries then dead-letter rather than silently marking done=1 with null enriched_text.
- **3,677 chunks reset and requeued** — `UPDATE case_chunks SET done=0, embedded=0 WHERE done=1 AND enriched_text IS NULL AND JSON_EXTRACT(principles_json, '$.chunk_type') IS NULL` — requeue-chunks called multiple times, queue draining overnight. 5,128 good chunks confirmed at session end (up from 4,856).
- **Pass 1 holding failure identified** — 537/543 cases have holding=NULL or "AI extraction failed". Root cause: pass1Prompt and pass2Prompt were designed for Llama 3.1 8B, Qwen3-30b-a3b-fp8 was swapped in on 17 March without prompt redesign, validated on only one case (Sears v Copper Mines). Fix deferred to next session — pull actual prompt text via CC, redesign for Qwen3, test on 5–10 cases, then requeue-metadata on all 543 cases. No re-scraping needed — raw_text in D1.
- **Library UI improved** — single scroll reading pane (Facts → Holding → Principles, no tabs) · search bar + court/year filter chips · stats counters removed · sigil import fixed in ReadingPane.jsx (sigil.jpg → /unnamed.jpg) · title search field corrected (case_name → title) · dead StatsRow component removed.
- **Poller CASE-EMBED guard — OUTSTANDING** — enrichment_poller.py CASE-EMBED pass fetches done=1 AND embedded=0 but does not check enriched_text IS NOT NULL. Add as defensive measure next session.
- **Scraper disabled** — Task Scheduler run_scraper and run_scraper_evening disabled to prevent new cases competing with reprocess queue overnight. Re-enable after done=0 confirms 0.
- **processed_date column null** — confirmed never populated by scraper pipeline, cannot determine which cases were processed by Llama 3.1 8B vs Qwen3-30b from D1. Irrelevant since all cases need requeue-metadata after Pass 1 prompt fix.

## CHANGES THIS SESSION (session 17) — 23 March 2026

- **Vite proxy removed** — api.js BASE now hardcodes `https://arcanthyr.com` · browser calls Worker directly · proxy section deleted from vite.config.js · fixes 502 timeout that was hitting 104.21.1.159 directly
- **Auth removed for local dev** — verify/login/logout replaced with no-op stubs in api.js · Landing.jsx replaced with immediate redirect to /research · auth useEffect guards removed from Research.jsx, Upload.jsx, Library.jsx
- **Research UX: query → AI Summary** — setActiveTab('summary') fires after query completes · source cards in left panel made non-interactive (onClick removed, cursor pointer removed from ResultCard.jsx)
- **Library reading pane** — click case row opens split reading pane · Facts/Holding/Principles tabs · facts/holding/subject_matter added to handleLibraryList SELECT in worker.js · deployed via dashboard (wrangler deploy blocked by Cloudflare API routing issue from ISP — transient, unrelated to codebase)
- **Upload URL input** — AustLII URL text input added to Cases tab · Fetch button wired to api.uploadCase({ url }) · file upload still available as primary option
- **ResultCard cursor fix** — removed leftover cursor:pointer and hover styles after onClick removal
- **wrangler deploy note** — timed out repeatedly this session · confirmed ISP routing issue to api.cloudflare.com (not IP block, not auth, not code) · workaround: dashboard deploy · expect to resolve on its own

## CHANGES THIS SESSION (session 16) — 23 March 2026

- **arcanthyr-ui created** — new React/Vite app at `arcanthyr-console/arcanthyr-ui/` · five views: Landing, Research, Upload, Library, ShareModal · all API calls via `api.js` with `credentials:include` · Vite proxy routes `/api/*` → live Worker
- **CORS deployed to worker.js** — `ALLOWED_ORIGINS` list (`*.pages.dev` + `localhost:5173/4173`) · `Access-Control-Allow-Credentials: true` · `X-Nexus-Key` in allowed headers
- **JWT auth implemented** — `signJWT`/`verifyJWT`/`getTokenFromRequest` via Web Crypto API (no npm) · httpOnly cookie `arc_token` · 24h expiry · signed with `env.JWT_SECRET` fallback to `env.NEXUS_SECRET_KEY`
- **Auth routes added** — `POST /api/auth/login` · `GET /api/auth/verify` · `POST /api/auth/logout`
- **New Worker routes** — `GET /api/legal/cases` · `GET /api/legal/corpus` · `GET /api/legal/legislation` (aliases to existing library handler) · `POST /api/legal/share`
- **Cookie Secure flag removed** — `SameSite=None; Secure` → `SameSite=Lax` on login and logout · required for HTTP local dev · production will be HTTPS via Cloudflare Pages · worker.js version `1be8eb3b`
- **Vite proxy IPv6 fix** — proxy target changed from `arcanthyr.com` to `104.21.1.159` with `Host: arcanthyr.com` header · Node.js on Windows resolves to IPv6 which proxy cannot connect over
- **api.js query field fixed** — frontend was sending `query_text`, worker expects `query` · fixed to `{ query: query_text }` · Worker internally translates to `query_text` before calling server.py · server.py unchanged
- **Model toggle added to Research** — Claude API / Workers AI toggle · routes to `legal-query-workers-ai` handler when Workers selected · chip style matching filter buttons
- **Upload drag and drop restored** — CorpusTab: drag zone reads `.md`/`.txt` into textarea via FileReader · LegislationTab: drop zone replaces old button, click also triggers file picker
- **Landing loop fixed** — `window.location.href = '/'` redirect removed from `api.js` `req()` 401 handler · was causing infinite remount on Landing where 401 is expected for logged-out users
- **Scraper updated** — SESSION_LIMIT 100 → 150 · behavioural jitter added (7% chance 25-45s additional pause) · second Task Scheduler task added at 18:00 (`run_scraper_evening`) · throughput ~300 cases/day
- **sigil.gif pending** — `sigil.jpg` placeholder in `src/assets/` · swap by dropping `sigil.gif` in same folder and updating import in `Landing.jsx` and `ReadingPane.jsx`

## CHANGES THIS SESSION (session 15) — 23 March 2026

- **MCP servers installed** — 21st.dev Magic (user scope), GitHub MCP, Context7, Firecrawl added to Claude Code · magic registered in ~/.claude.json · GitHub PAT with repo scope · all scope user
- **CLAUDE_decisions.md created** — 377 passages, 1,535 lines, 8 sections extracted from 30 past conversations via extract_decisions.py · lives at arcanthyr-console\CLAUDE_decisions.md · upload each session alongside CLAUDE.md and CLAUDE_arch.md
- **UI rebuild designed** — complete design system locked: Libre Baskerville serif throughout, dark chrome (#0A0C0E) + light reading pane (#F8F6F1), IBM accent blue (#4A9EFF) · five views: Landing, Research, Upload, Library, Share modal · sigil (white compass rose GIF) on landing page
- **CC handover brief written** — full spec for arcanthyr-ui React/Vite/Cloudflare Pages build · new repo arcanthyr-ui · worker.js gets CORS headers + /api/auth/login only · all other backend untouched
- **Scraper progress** — 404 cases total (up from 303) · 340 deep_enriched · 64 pending (new scraper cases) · 5,873 chunks done · 5,593 embedded · queue still processing new cases cleanly
- **Wrangler token expired mid-session** — resolved with npx wrangler login · add to session checklist if D1 queries return 7403

## CHANGES THIS SESSION (session 14) — 23 March 2026

- **CHUNK prompt v3 deployed** — replaced single-line IF/THEN extraction prompt with 6-type classification engine (reasoning/evidence/submissions/procedural/header/mixed) · enriched_text field added as primary output (200-350 word prose synthesis for reasoning chunks, honest description for others) · reasoning_quotes field extracts verbatim judicial passages · subject_matter classification added · principles now stated in judge's own doctrinal terms not IF/THEN abstraction · why: old prompt produced same generic principle across 4-5 chunks of same case, hallucinated principles from transcript/header chunks, and output never reached LLM at query time since only raw chunk_text was embedded
- **enriched_text column added to case_chunks** — ALTER TABLE case_chunks ADD COLUMN enriched_text TEXT · why: needed to store v3 prompt output separately from principles_json so poller can embed from it
- **subject_matter column added to cases** — ALTER TABLE cases ADD COLUMN subject_matter TEXT · why: enables future filtering of case chunk retrieval to criminal cases only for criminal law queries; populated by merge step from chunk-level classifications
- **enrichment_poller.py updated** — embeds case chunks from enriched_text when present, falls back to chunk_text · fetch-case-chunks Worker route updated to SELECT enriched_text · SCP'd and force-recreated · why: without this change enriched_text would be stored in D1 but never used for embedding — Qdrant payloads would still contain raw chunk_text
- **total_chunks added to CHUNK queue messages** — METADATA handler now sends total_chunks: chunks.length with each CHUNK message · why: enables Chunk N of M positional hint in v3 prompt, helping model recognise chunk 0 as likely header
- **isLikelyHeader() function added** — detects header chunks at chunk_index 0 via uppercase label patterns · passes role_hint: 'header' in user message · why: chunk 0 was consistently boilerplate header producing hallucinated principles; hint suppresses extraction without hard-coding behaviour
- **Code-side validator added** — strips authorities not named in excerpt, enforces type-based extraction gates, caps array lengths · why: prevents authority hallucination and ensures non-reasoning chunks cannot produce principles regardless of model output
- **max_completion_tokens reduced** — 2,500 → 1,600 · why: v3 output is denser but more structured; 2,500 was wasteful and increased cost; 1,600 is sufficient for all chunk types with margin
- **Pilot validated on [2024] TASCCA 14** — trafficking/sentencing appeal · 15 chunks · chunk 0 correctly classified header · reasoning chunks produced faithful prose principles with verbatim judicial quotes · evidence/factual chunks correctly described without invented doctrine · approved for full rollout
- **Full reprocess initiated** — all 5,187 done=0 chunks requeued · all case_chunk Qdrant vectors deleted (secondary sources and legislation untouched) · queue processing overnight · ~2,440 chunks complete as of session end · 0 retries

## CHANGES THIS SESSION (session 13) — 22 March 2026

- **Embed pass confirmed complete** — 1,171/1,171 secondary source chunks embedded · poller idle
- **Two stuck chunks fixed** — `hoc-b042-m001-lies-consciousness-of-guilt` (15,542 chars) and `hoc-b045-m001-tendency-evidence-probative-value` (26,420 chars) were timing out · root cause: GPT-4o-mini enrichment expanded raw_text far beyond normal chunk size, exceeding 30s Ollama timeout · fix: raise get_embedding() timeout 30s→120s + add large input warning log >8000 chars · Qdrant points deleted, embedded=0 reset, re-embedded successfully at full text
- **FTS5 backfill complete** — secondary_sources_fts wiped (had 1,854 duplicate rows from INSERT OR REPLACE on non-empty table) then clean INSERT from secondary_sources · 1,171 rows · all three retrieval passes now operational
- **Retrieval baseline rerun** — estimated 14 pass / 3 partial / 0 fail · improvement over 12/4/1 · Q2 and Q9 remain partial (corpus gaps) · Q13 has case_chunk RRF noise at rank 1
- **BRD doctrine chunk ingested** — `hoc-b057-m001-beyond-reasonable-doubt` · corrected statutory citation: Evidence Act 2001 (Tas) s 141(1) (not Criminal Code s13) · Green v The Queen (1971) 126 CLR 28 · Walters v The Queen [1969] 2 AC 26 · embedded and verified · next block number for manual chunks: hoc-b057
- **Malformed row identified** — `hoc-b{BLOCK_NUMBER}-m001-drug-treatment-orders` · block number placeholder never substituted · fix deferred
- **Enrichment poller switched to GPT-4o-mini** — replaced both call_claude and call_claude_followup · Claude API key unavailable (console.anthropic.com login loop, likely credit/key issue) · OPENAI_API_KEY confirmed in VPS .env · gpt-4o-mini-2024-07-18 · system prompt preserved in followup messages array · deployed and running clean · no 401 errors
- **CLAUDE.md why directive added** — session change logs now include rationale alongside changes
- **Full directory path directive added** — all commands now include full cd path

## CHANGES THIS SESSION (session 12) — 22 March 2026

- **Corpus wipe confirmed clean** — secondary_sources D1 deleted (0 rows) · Qdrant secondary/case vectors deleted · 1,272 legislation points retained
- **FTS5 root cause identified** — `handleUploadCorpus` FTS5 insert had no ON CONFLICT clause · caused SQLITE_CONSTRAINT 500 errors on any re-ingest where FTS5 table had existing rows
- **FTS5 fix deployed** — `INSERT INTO secondary_sources_fts` → `INSERT OR REPLACE INTO secondary_sources_fts` · worker.js version 2d3716de
- **Corpus ingested** — part1: 488 chunks / 488 OK · part2: 683 chunks / 683 OK · 1,171 total · zero failures
- **enriched=1 set** — all 1,171 rows updated · poller now embedding overnight
- **ingest_part2.py created** — standalone copy of ingest_corpus.py for part2 · lives at arcanthyr-console\ingest_part2.py
- **Case count** — 309 cases · 303 deep_enriched · scraper stopped at TASSC/2020/5 (session limit)
- **Embed pass confirmed complete** — 2,607/2,607 case chunks embedded before session start
- **Battle test** — all 5 checks passed: poller running, 6 cases pending deep_enriched (normal), scraper clean stop, FTS5 fix deployed, secondary_sources 1,171/1,171

## CHANGES THIS SESSION (session 11) — 20 March 2026

- **Corpus reprocessing confirmed complete** — 56/56 blocks · block_001 stale error was from prior run
- **CQT pass confirmed** — block_005 substantive prose preserved · blocks 010/015 correctly procedure-only
- **Embed pass in progress** — 1,187/2,607 case chunks embedded as of session start · poller running cleanly
- **Scraper confirmed running** — TASSC 2022 in progress · all 2025/2024/2023 courts marked done
- **Retrieval baseline rerun** — 12 pass / 4 partial / 1 fail · Q2 BRD confirmed corpus gap
- **RRF/LIKE fix investigation** — handleFetchSectionsByReference LIKE '%38%' confirmed source of noise · fix parked post-ingest
- **retrieval_baseline.sh fixed** — KEY auto-read from .env · SCP'd to VPS
- **BRD corpus gap confirmed** — no standalone BRD chunk in either corpus part · manual ingest required post-corpus-ingest

## CHANGES THIS SESSION (session 9) — 20 March 2026

- **Dead Nexus route deleted from worker.js** · worker.js deployed version 6f006d85
- **Case chunk threshold raised** 0.15 → 0.35 in server.py
- **HCA added to COURT_HIERARCHY** at tier 4
- **enrichment_poller.py payload truncation fixed** — secondary_sources [:5000], case_chunks [:3000], legislation [:3000]
- **ingest_corpus.py parser fixed** — heading regex accepts single # + any [UPPERCASE:] field lookahead + MASTER_ONLY flag added
- **process_blocks.py updated** — new Master prompt, Repair pass, correct model string, MAX_TOKENS=32000
- **Corpus damage confirmed** — 437 of 1,575 chunks silently skipped by old parser (28%)
- **Retrieval baseline extended** — Q16-Q18 added

## CHANGES THIS SESSION (session 8) — 20 March 2026

- **worker.js deployed** · version 84d42ffc
- **Case chunk pass gate removed** — pass now runs unconditionally on every query
- **Workers AI error handling** — callWorkersAI() now throws on result.error or code 4006
- **DST fix** — austlii_scraper.py is_business_hours() now uses zoneinfo Australia/Hobart
- **Scraper rescheduled to noon** — neurons reset at 11am Hobart
- **Architecture docs corrected** — session 3 RRF/BM25/FTS5 work documented as complete but never deployed
- **Cloudflare git integration disconnected**

---

## FUTURE ROADMAP

- **secondary_sources_fts backfill** — IMMEDIATE next session · 1,171 rows embedded but FTS5 empty · BM25/FTS5 retrieval pass blind until fixed
- **Run retrieval baseline** — after embed pass confirms complete
- **BRD doctrine chunk** — write and ingest: Criminal Code s13, Walters direction, Green v R
- **handleFetchSectionsByReference LIKE fix** — replace ID slug LIKE match with FTS5 search
- **subject_matter retrieval filter** — once cases.subject_matter populated after reprocess, add filter to case chunk Qdrant pass to scope criminal law queries to criminal cases only
- **Duplicate principle deduplication** — post-reprocess: compare principles across chunks of same case by semantic similarity, merge/suppress near-duplicates before final storage
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
- **Re-embed pass** — COMPLETED session 14 — case chunks re-embedded from enriched_text (v3 prompt output) · secondary sources and legislation payloads unchanged (already at [:5000]/[:3000] from session 9 fix)
