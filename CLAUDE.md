CLAUDE.md — Arcanthyr Session File
Updated: 23 March 2026 (end of session 14) · Supersedes all prior versions
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

**Tooling:**
- Claude.ai — architecture, planning, debugging, writing CLAUDE.md, code review
- Claude Code (VS Code) — file edits, terminal commands, git, wrangler deploys
- PowerShell / SSH — VPS runtime commands, long-running Python scripts

---

## SYSTEM STATE — 23 March 2026 (end of session 14)

| Component | Status |
|---|---|
| Qdrant general-docs-v2 | 1,272 legislation + 1,172 secondary source chunks · case chunks being re-embedded overnight from enriched_text |
| Embedding model | argus-ai/pplx-embed-context-v1-0.6b:fp32 (Ollama, VPS Docker) |
| Score threshold | 0.45 (validated) |
| D1 cases | 303 cases · all enriched=1 · deep_enriched reprocessing overnight · subject_matter column added |
| D1 case_chunks | 5,202 total · 5,187 done=0 requeued for v3 re-enrichment · enriched_text column added · reprocess running overnight |
| D1 secondary_sources | 1,172 total · all enriched=1 · all embedded=1 · untouched this session |
| D1 secondary_sources_fts | 1,171 rows · backfilled session 13 · all three retrieval passes operational |
| D1 legislation | 5 Acts · embedded=1 · 1,272 sections in Qdrant · untouched this session |
| worker.js | Deployed session 14 · versions db71db45 + f150e037 · CHUNK prompt v3 + fetch-case-chunks enriched_text SELECT |
| Cloudflare plan | Workers Paid ($5/month) — neuron cap removed |
| CHUNK enrichment model | GPT-4o-mini-2024-07-18 · v3 prompt live |
| Cloudflare Queues | LIVE · 2,440+ messages processed as of session end · 0 retries · processing overnight |
| enrichment_poller | Permanent Docker service · running · re-embedding case chunks from enriched_text as queue completes |
| server.py | Case chunk threshold 0.35 · HCA tier 4 · unchanged this session |
| Retrieval | Triple-pass hybrid pipeline operational · baseline rerun needed after re-embed completes |
| Phase 5 | VALIDATED — Claude API primary path confirmed good answer quality |
| Corpus | COMPLETE — 1,172 chunks · all embedded · FTS5 backfilled · BRD chunk added |
| Scraper | Running — Task Scheduler daily noon · 303 cases · unaffected by this session's changes |

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

1. **Verify overnight reprocess complete** — check case_chunks done=1 count reaches 5,202 · check poller re-embedding from enriched_text · then run retrieval baseline
2. **Fix malformed row** — `hoc-b{BLOCK_NUMBER}-m001-drug-treatment-orders` · placeholder never substituted · find and fix citation in D1 and Qdrant
3. **handleFetchSectionsByReference LIKE fix** — replace `'%38%'` ID slug match with FTS5 search against secondary_sources_fts
4. **Run retrieval baseline** — after re-embed completes · expect improvement on case law queries · Q2 BRD and Q13 RRF noise are the markers to watch
5. **subject_matter classification** — verify cases.subject_matter populated correctly after reprocess · spot-check civil vs criminal split
6. **Add subject_matter filter to retrieval** — once populated, scope case chunk retrieval to criminal cases for criminal law queries

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
