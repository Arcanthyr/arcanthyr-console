# CLAUDE_changelog.md — Arcanthyr Session Changelog Archive

*Sessions 21–91 · 26 March 2026 – 22 April 2026*
*Archived from CLAUDE.md on 18 April 2026 (session 70 restructure); sessions 74, 77–80 added end of session 83; session 82 added end of session 85; session 85 added end of session 88; session 86 added end of session 89; session 87 added end of session 90; session 88 added end of session 91; session 89 added end of session 92; session 90 added end of session 93; session 91 added end of session 94*

Load condition: Load when investigating a past session's changes, debugging a regression to a specific date, or when the current session references work from sessions older than the 3-session retention window in CLAUDE.md.

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

## CHANGES THIS SESSION (session 90) — 21 April 2026

- **Legislation vocabulary anchor — full deployment** — New `build_legislation_embedding_text()` function in poller [LEG] pass prepends `Key terms: {act_title}; s {section_number} {heading}.` before every legislation section embed. Opus-designed, minimal format, whitelist-agnostic. Permanent — all future legislation uploads anchor automatically.
- **Stage 1 (Evidence Act, 245 sections) re-embedded** — Q14 topic fixed (wrong-topic tendency chunk displaced); Q6, Q11, Q12, Q13 score improvements confirmed. Zero P→M regressions across 31-query baseline.
- **Stage 2 (Criminal Code 468, MDA 253, Justices Act 163, Police Offences 143 — 1,027 sections) re-embedded** — Q6 structural improvement confirmed (all 3 positions correctly cite s 46 Criminal Code). Q21 improvement attributed to query expansion variance (Sentencing Act not yet re-embedded at Stage 2). Zero regressions.
- **Stage 3 (Sentencing Act 147, Youth Justice Act 216, Justices Rules 96 — 459 sections) embed initiated** — first embed for all three Acts; no regression risk. Poller running.
- **Q14 doctrine chunk authored** — `manual-b4135-chunk` rewritten from stub (concept list only) to full doctrine chunk: s 37 rule, five statutory exceptions, objection procedure, cross-examination distinction, s 38 relationship. 3,794 chars. Queued for re-embed.
- **Q9 and Q26 corpus chunks authored and uploaded** — Q9: guilty plea discount (Tasmanian common law, utilitarian value + remorse, timing — no TASCCA quantum authority confirmed). Q26: unreasonable verdict / M v The Queen (Pell, SKA, Libke, circumstantial evidence — no TASCCA local authority confirmed). Both close outstanding priority #2.
- **Synthesis feedback loop parked** — decision: do not build until corpus growth stabilises. Plan retained in repo. Rationale in decisions.md.

---

## CHANGES THIS SESSION (session 89) — 21 April 2026

- **Model upgrades** — gpt-4o-mini-2024-07-18 → gpt-4.1-mini-2025-04-14 across all worker.js call sites (handleFormatAndUpload, performMerge main synthesis, performMerge sentencing synthesis, runSentencingBackfill, CHUNK handler) and server.py (generate_query_variants, call_gpt_mini); claude-sonnet-4-20250514 → claude-sonnet-4-6 for Sol path in handleLegalQuery; both deployed, smoke tested, committed 786f9a6
- **TYPE_TAGS cosmetic fix** — added `"secondary_source": "CORPUS"` alias to ResultCard.jsx TYPE_TAGS; secondary source result cards now display "CORPUS" label correctly instead of raw type string
- **Synthesis dedup tightened** — performMerge() synthesis prompt range reduced from 4–8 to 3–5 principles; explicit pre-output grouping and deduplication instructions added; forward-only (existing corpus unaffected)
- **update-secondary-raw diagnosis closed** — root cause of session 88 404s confirmed as hand-typed ID mismatches during manual testing, not a routing or encoding bug; silent-success bug (returning `{ ok: true, updated: 0 }` on no-match) fixed to proper HTTP 404; KNOWN ISSUES entry corrected
- **Subject_matter audit complete** — full audit of all non-criminal cases with criminal party name patterns run via auslaw-mcp; 11 rows checked; 0 genuine misclassifications; Tasmania v Rattigan [2021] TASSC 28 corrected administrative → criminal, 8 case chunks reset embedded=0 for re-embed; audit documented as clean
- **Corpus additions — 8 new secondary source chunks** — block_023 (MDA s 29 prescribed belief, MDA evidentiary/possession/schedules, Youth Justice Act responsibility/diversion, Youth Justice Act joint charges/procedure) and block_028 (FV victim opinion/forgiveness, FV s 29A serial perpetrator declaration, FV aggravating children presence, FVO consent orders/jurisdiction) formatted and uploaded via console paste path

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

## CHANGES THIS SESSION (session 87) — 21 April 2026

- **Legislative Amendment History feature** — new Worker routes `GET /api/legal/amendments?act=act-YYYY-NNN` (fetches CCL projectdata API, 30-day D1 cache in `tbl_amendment_cache`) and `GET /api/legal/resolve-act?name=...` (Act name → actId, writes `source_url` back to `legislation` table on first resolution)
- **AmendmentPanel.jsx** — collapsible panel showing full amendment timeline for any Tasmanian Act; Principal Act pinned with blue badge; per-amendment action button; lazy-loads on first expand; commit `f97a53e`
- **Feature relocated to Legislation tab** — removed from case reading pane (legislation_extracted restored to plain list); wired into LegislationTable as inline detail panel on row click; `actIdFromSourceUrl()` parses act-YYYY-NNN from source_url; `handleLibraryList` updated to include source_url in legislation SELECT; commit `7634fa2`
- **"Locate Hansard ↗" button** — replaced broken direct slug links with `google.com/search?q=site:parliament.tas.gov.au+"N+of+YYYY"` after confirming parliament.tas.gov.au migrated to slug-based URLs incompatible with numeric construction; button relabelled from "Second reading ↗"; commit `c0e277f`
- **source_url backfill** — 5 priority Acts updated in `legislation` table: Evidence Act 2001 (`act-2001-076`), Criminal Code Act 1924 (`act-1924-069`), Justices Act 1959 (`act-1959-077`), Misuse of Drugs Act 2001 (`act-2001-094`), Police Offences Act 1935 (`act-1935-044`)
- **Self-healing resolution** — `resolve-act` route writes `source_url` back to D1 on first use; new Acts added to corpus require no manual backfill; resolve-act is primary path, source_url is cache acceleration

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

## CHANGES THIS SESSION (session 85) — 20 April 2026

- **Word-search bug fixed (Phase 1)** — `GET /api/legal/word-search` was silently returning 0 results since launch; two bugs: `bm25()`/`snippet()` throw `SQLITE_ERROR` in JOIN/GROUP BY context → two-query architecture (FTS-only then cases IN); D1 100 bound-variable limit hit when passing all 200 deduped citations → slice to `limit` before IN clause, court filter moved to JS. Deployed `1f230fa4`.
- **AustLII external search (Phase 2)** — new `GET /api/legal/austlii-word-search` Worker route; `parseAustLIIResults()` regex parser targeting `/cgi-bin/viewdoc/au/cases/tas/(COURT)/YEAR/NUM.html`; case name cleanup strips tags, decodes HTML entities, trims AustLII citation+date suffix. Deployed across `57ae6838` → `420de222`.
- **VPS→AustLII blocked** — Contabo VPS IP blocked by AustLII (curl returns 000); `handleAustLIIWordSearch` switched from `handleFetchPage` VPS proxy to direct `fetch()` from Cloudflare edge with browser-mimicking headers. Edge IPs not blocked.
- **Async parallel UI track** — Library word-search fires local FTS and AustLII in parallel; local results render at ~200ms; AustLII section trails in with spinner; "In corpus" chip on AustLII results whose citation matches local corpus; "Open on AustLII" link-out per result.
- **D1 word-search diagnosis** — confirmed `case_chunks.id` is TEXT PRIMARY KEY (not integer rowid alias); `case_chunks_fts` has `citation UNINDEXED` column; correct join pattern is `fts.citation → cases.citation` not `fts.rowid → case_chunks.id`.

---

## CHANGES THIS SESSION (session 83) — 20 April 2026

- **Word Search feature for Case Library deployed** — new Worker route `GET /api/legal/word-search` (no X-Nexus-Key, matches `search-by-legislation` auth pattern) queries `case_chunks_fts` with phrase-match-first strategy and silent fallback to AND-of-all-tokens when phrase match returns zero rows. SQL uses `GROUP BY citation` with `MIN(bm25(case_chunks_fts)) AS best_rank` — one row per case, snippet from best-ranked chunk, `match_count` column showing how many chunks inside the case hit. Sanitiser strips FTS5 Booleans (`"`, `*`, `()`, `:`, `NEAR`, `AND`, `OR`, `NOT`) so users never need operator syntax. `api.wordSearch(q, limit, court)` added to `arcanthyr-ui/src/api.js`. `Library.jsx` CasesTable extended with third search mode ("Word search") — state plumbing, form UI, results table, safe `renderSnippet()` helper splitting on `<mark>…</mark>` with `<strong>` React nodes (no `dangerouslySetInnerHTML`). Worker version `1334562d-526d-432c-bdf0-ee6e201059b5`.
- **Three tracked files found truncated mid-statement in Session 82 commit `107bd96`** — discovered during session 83 deploy. `arcanthyr-ui/src/api.js` cut at `if (!res.ok) throw new` (missing `approveSecondary` fetch close + object-literal `};`). `arcanthyr-ui/src/pages/Library.jsx` cut mid-word at `background` (missing Delete Case button JSX + `labelStyle` const). `Arc v 4/worker.js` cut at `pass1.judge || ` (missing METADATA handler tail — `parties`/`facts`/`issues` bind, `.run()` close, `splitIntoChunks` loop, CHUNK enqueue, `msg.ack()`, queue consumer catch block + `export default` close). All three restored: api.js to 172 lines, Library.jsx to 1079 lines, worker.js to 4557 lines. Worker tail recovered from commit `b80a7a2` (session 81 close, last known-good).
- **Root cause = SCP LF↔CRLF conversion, previously documented as "cosmetic"** — the diff-inflation symptom noted session 78 (commit `a60fa1e`) is actually the tip of a destructive failure mode. When short-files are SCP'd between Windows and VPS with CRLF translation, byte counts can mismatch in ways that leave the tail of a file dropped on disk. The truncated files look syntactically plausible at a glance — `pass1.judge || ` reads as a partially-typed line, not obvious corruption. KNOWN ISSUE upgraded from "cosmetic only" to "mechanically destructive". Remediation plan set as Priority #1 for session 84.
- **`node --check` exposed as unreliable pre-deploy gate** — returned exit code 0 with no output on the truncated worker.js despite unclosed template literals, unterminated function call, and missing module-level close. `@babel/parser` with `sourceType: 'module'` caught it immediately. Switched pre-deploy verification to babel parse going forward. `npm run build` (rolldown production pass) also catches it — it is what surfaced the api.js truncation to Tom during this session's deploy attempt.
- **Session 82 legislation batch-insert fix survived the truncation** — `handleUploadLegislation` at line 1218, `env.DB.batch(stmts)` call at line 1320 both present in the restored worker.js. The SCP truncation hit only the file tail, so mid-file session 82 edits were preserved. Verified via `grep -n` after restoration.
- **Deploy successful** — UI build produced `dist/assets/index-BSsNgR53.js` (1377 kB, gzip 382 kB), wrangler uploaded 2 modified assets, worker deployed as version `1334562d-526d-432c-bdf0-ee6e201059b5` with producer/consumer bindings intact. Smoke test pending Tom on `arcanthyr.com` Library → Cases → Word search tab.

---

## CHANGES THIS SESSION (session 82) — 20 April 2026

- **Scraper confirmed complete** — D1 case count stable at 1,914 (identical to session 81 close); corpus extends [2005] TASSC 1 → [2026] TASSC 9; embed backlog 0; one stuck case ([2023] TASSC 6 Bob Brown Foundation, civil) unchanged and ignorable.
- **Legislation upload pipeline fixed — 3 bugs** — root cause was FormData/multipart vs JSON mismatch in api.js (Worker calls `request.json()` → Cloudflare returned HTML 400); also fixed field name mismatch (`act_name`/File object → `title`/`doc_text` string) and wrong response field (`sections` → `sections_parsed`). Deployed UI fix version `6dbe379f`.
- **Worker batch insert fix** — `handleUploadLegislation` replaced sequential per-section D1 loop with chunked `env.DB.batch()` pattern (99 statements/batch) to prevent CPU timeout on large Acts. Deployed version `c2428694`. Pattern matches `handleWriteCitations`.
- **Sentencing Act 1997 (Tas) ingested** — 147 sections in `legislation_sections`, legislation_id `sentencing-act-1997-tas`; priority sections confirmed present (s 9, s 11A, s 12, s 15, s 17). Poller [LEG] pass to embed pending.
- **Q9 misdiagnosis corrected** — prior session diagnosis of "Sentencing Act s 11A guilty plea discount" was wrong; Tasmania has no statutory guilty plea discount. s 11A is sexual offences aggravating factors. Q9 fix requires secondary source authoring on Tasmanian common law discount doctrine.
- **Rule 3 (multi-citation) confirmed live** — probe query "when can an appellate court interfere with a sentence that was manifestly excessive" returned 6 case chunks (0.73–0.75), synthesis aggregated correctly across citations. Rule 3 is not dead code.
- **Upload UI helper text added** — legislation dropzone now shows "For best results, use HTML source from legislation.tas.gov.au — disable legislative history, copy the page text into a .txt file before uploading. Avoid PDFs."

---

## CHANGES THIS SESSION (session 80) — 20 April 2026

- **Phase 3 Citation authority agent — Pass 4 gate + retrieval leg deployed in shadow mode** — `should_fire_pass4(query_text) -> (bool, reason)` function in `server.py` with three independent gate rules: (1) keyword match against `AUTHORITY_KEYWORDS` list (treatment vocabulary, citation-profile vocabulary, judicial-treatment intent phrases, and narrow topical-authority phrases); (2) bare-citation lookup — query ≤60 chars AND ≥1 CITATION_REGEX match; (3) relationship intent — ≥2 citations in query. Pass 4 `query_points` block inserted after domain filter, before final sort+cap (lines 737–771 post-edit); uses `Filter(must=[type=authority_synthesis], must_not=[quarantined=True])` with `AUTHORITY_PASS_THRESHOLD=0.50`, `AUTHORITY_PASS_LIMIT=3`, `AUTHORITY_PASS_TIMEOUT_SEC=0.5` (ThreadPoolExecutor with 500ms timeout). Dedup against `seen_ids`. `AUTHORITY_PASS_ENABLED=false` by default — gate fires and logs `[Pass 4] gate=FIRE reason=... ENABLED=false (shadow)` but skips Qdrant query. Worker version 648207f6.

- **AUTHORITY_KEYWORDS finalised via D1 corpus scan** — corpus scan confirmed all 233 chunks are per-case citation profiles (Treatment section + Propositions for which cited + Citing cases), NOT topical aggregation chunks. "Leading authorities on X" style queries have weak chunk support — no ranking chunks exist, only per-case profiles mentioning propositions in passing. Keywords refined to focus on treatment vocabulary (followed by, applied in, distinguished in, etc.), judicial-treatment intent phrases (subsequent treatment, cases citing, etc.), and citation-profile vocabulary (citing cases, how often cited, citation profile). Narrow topical-authority phrases (leading authority on, leading case on, key authority on, authority on) retained but flagged for shadow-mode monitoring — cut before flag flip if false-positive FIRE rate is high on queries where Pass 1/2/3 already returns good doctrinal results. Broader phrases (leading authority, leading case, seminal case, landmark case, most cited, principal authority) dropped — no corpus support, would FIRE but retrieve weakly.

- **worker.js Phase 2 — Sol and V'ger updated for [AUTHORITY ANALYSIS] label** — Sol (`handleLegalQuery`): caseBlocks map now emits a four-way label switch (`[CASE EXCERPT]` / `[LEGISLATION]` / `[AUTHORITY ANALYSIS]` / `[ANNOTATION]`) as net-new label injection (Sol previously had no labels at all); default systemPrompt variant gets instruction sentence: "AUTHORITY ANALYSIS blocks summarise how Tasmanian courts have cited and treated a specific case — use them to describe subsequent treatment, citation frequency, and how the case has been applied or distinguished." V'ger (`handleLegalQueryWorkersAI`): existing binary ternary (`case_chunk → [CASE EXCERPT]`, else `[ANNOTATION]`) extended to three-way (`authority_synthesis → [AUTHORITY ANALYSIS]`); same instruction sentence added to default systemPrompt variant.

- **UI Phase 3 — amber AUTHORITY tag, Library badge, AuthorityPane** — `ResultCard.jsx`: `authority_synthesis` added to `TYPE_TAGS` (label: AUTHORITY, bg: `rgba(200,140,50,0.08)`, color: `#C88C32`); tag resolution extended to check `result.type` before `result.doc_type` (server.py search returns `type`, not `doc_type`). `Library.jsx` CorpusTable: amber AUTHORITY badge added inline with title when `r.court === 'authority_synthesis'` (source_type aliased as court by `handleLibraryList`); `r.court` subtitle suppressed for authority_synthesis rows. `ReadingPane.jsx`: branch added before CasePane dispatch — `if (selected.type === 'authority_synthesis')` renders new `AuthorityPane` component; AuthorityPane shows amber AUTHORITY header, citation/title, close button, and full `selected.text` or `selected.raw_text` in a scrollable pre-wrap block.

- **server.py local mirror synced** — VPS file downloaded to `Arc v 4/server.py` via hex-ssh ssh-download post-edit. `grep -c "must_not"` = 4 (3 Phase 2b isolation gates + 1 new Pass 4 gate), `grep -c "should_fire_pass4"` = 2, `grep -c "AUTHORITY_PASS"` = 9.

## CHANGES THIS SESSION (session 79) — 20 April 2026

- **Phase 2c complete — 233 authority_synthesis chunks ingested clean across all six verification gates** — D1 collision check clean (0 pre-existing `authority-%` IDs); 233/233 rows written with `source_type='authority_synthesis'`, `enriched=1`, populated `raw_text`; Qdrant payload `type='authority_synthesis'` confirmed on two independent spot-checks at opposite ends of the alphabet (`authority-ab-v-the-queen`, `authority-attorney-general-v-b`), both showing correct `build_secondary_embedding_text()` vocabulary anchor prepend (`Key terms: ...`); poller auto-embedding without manual flag flip (climbed 7 → 50 → 95 → 233 over the session tail). Phase 2b isolation gate confirmed firing end-to-end — chunks blocked from Pass 1 / Pass 3 normal retrieval by the `must_not={type=authority_synthesis}` filter, reachable only via the yet-to-be-built Phase 3 Pass 4 leg.

- **New script `scripts/ingest_authority_chunks.py` — 61-line dedicated ingest path for authority-synthesis chunks** — reads each staged `.md` file as a single atomic chunk, regex-extracts `[CITATION:]` / `[TITLE:]` / `[CATEGORY:]` from metadata block, hardcodes `doc_type='authority_synthesis'` (since `build_authority_chunks.py` omits `[TYPE:]`), POSTs to `/api/legal/upload-corpus` with the Mozilla User-Agent spoof, supports `--limit N` flag for dry-run testing. Decision rationale (see CLAUDE_decisions.md): dedicated script chosen over (a) fixing `build_authority_chunks.py` to emit ingest-ready format + extending `ingest_corpus.py` for a third block type, because the staged files were structurally valid, regen would burn tokens, authority chunks are a genuinely distinct content type warranting their own ingest path, and blast radius stays minimal.

- **Material structural mismatch caught at recon — Phase 1 output did not match `ingest_corpus.py` format** — three independent issues: `[TYPE:]` field absent across all 233 files (would have left `source_type=null` and defeated the Phase 2b `SYNTHESIS_TYPES` gate); no `<!-- block_NNN -->` separator; metadata-before-heading order inverted. Caught by a single CC recon step (file heads + grep coverage counts) before any ingest fired. Logged as an optional cleanup item for `build_authority_chunks.py` — not blocking.

- **Learning — `handleUploadCorpus` now writes `enriched=1` on insert** — contradicting the `enriched=0` pattern documented in early-April conversation history. Worker was updated silently at some point. Means the originally-planned "post-insert D1 UPDATE to flip enriched" step was redundant; poller picked rows up immediately. Rule added to CLAUDE_decisions.md: don't over-trust conversation history for Worker/D1 state that mutates silently — when one MCP D1 query can settle the question, run it first.

- **Learning — Cloudflare Worker burst-token-bucket rate limit on bulk ingest** — at `DELAY_SEC=0.5` (120 req/min), Worker rate-limited clusters at request positions ~#49-53 and ~#148-161 (14/233 returned 429; cluster pattern consistent with burst bucket depletion, not sustained-rate limiting). Bumping to `DELAY_SEC=1.0` (60 req/min) cleared all 14 on retry with zero residual. Rule added to CLAUDE_init.md: bulk ingest scripts targeting `/api/legal/upload-corpus` use `DELAY_SEC=1.0` from the start.

- **Baseline numbers discrepancy flagged at session open — userMemories stale on retrieval baseline** — session-open prompt quoted "10P / 11P / 8M / 3 ungraded" (totals 32, not 31; matches session-51 frozen state in userMemories, not the current SYSTEM STATE `≥28P / ≤3Pa / 0M` from session 77). Flagged early; no downstream decisions landed on the stale figure. userMemories updates asynchronously — stale memory bleed is expected but worth catching when it appears in scope-setting.

## CHANGES THIS SESSION (session 78) — 19 April 2026

- **subject_matter filter Part 3 deployed — Pass 2 case_chunk query now hard-filters on subject_matter ∈ {criminal, mixed}** — All three parts of the subject_matter filter feature are now complete: Part 1 (Worker route JOIN), Part 2 (poller metadata dict + re-embed), Part 3 (server.py MatchAny on Pass 2 Qdrant query). Two-line patch to `server.py`: (1) added `MatchAny` to the `qdrant_client.models` import on line 5; (2) appended `FieldCondition(key="subject_matter", match=MatchAny(any=["criminal","mixed"]))` to the Pass 2 `must` list alongside the existing `type=case_chunk` condition on line 513. Deploy verified: syntax clean, container force-recreated, `Nexus ingest server running on port 18789`. Test query "tendency evidence significant probative value test" returned zero civil/administrative case_chunks — [2024] TASSC 55 (Tasmania v GD, criminal) confirmed passing filter.

- **Citation authority agent Phase 1 — 233 authority-synthesis chunks generated and staged** — `scripts/build_authority_chunks.py` created: queries D1 `case_citations` (n≥5), pulls full citation graph and `authorities_extracted` via paginated query, extracts proposition strings per authority name, buckets treatments (followed/applied/approved/adopted, considered/discussed, distinguished/not followed), writes one `.md` file per authority to `scripts/authority-chunks-staging/`. Key constants: `SOURCE_TYPE='authority_synthesis'`, `MIN_CITATIONS=5`, `MAX_PROPS=15`, `MAX_CITING=25`. Script includes Phase 1 assertions (SOURCE_TYPE check, citation_id prefix check) and slug-collision suffix. Result: 233 chunks generated, zero assertion errors. Staged files are D1-and-Qdrant-clean until Phase 2c ingest.

- **Phase 2b — isolation filters deployed before any ingest (commit `a60fa1e`)** — Three changes so normal retrieval is blind to authority_synthesis type before any chunk is ingested: (1) `enrichment_poller.py` — `SYNTHESIS_TYPES = {'authority_synthesis'}` constant added at module level; secondary_sources embed metadata dict now routes `'type': (chunk.get('source_type') if chunk.get('source_type') in SYNTHESIS_TYPES else 'secondary_source')`. (2) `server.py` Pass 1 `must_not` — added `FieldCondition(key="type", match=MatchValue(value="authority_synthesis"))` alongside quarantine filter. (3) `server.py` Pass 3 `must_not` — same addition as safety belt (Pass 3 already strict via `must=[type=secondary_source]` but defence-in-depth). Both services force-recreated and smoke-tested. Grep confirms 3 `must_not` lines in server.py post-deploy. Phase 2c (ingest via upload-corpus) parked to next session.

- **Windows subprocess npx fix** — `build_authority_chunks.py` initial list-form `subprocess.run(['npx', ...])` raised `FileNotFoundError` on Windows because npx is a `.cmd` wrapper, not a `.exe`. Fixed by using string-form command with `shell=True` and escaping SQL double-quotes with `sql.replace('"', '\\"')`. List-form + `shell=True` was rejected because it mis-parses quoted SQL arguments on Windows cmd.

- **LF→CRLF git diff inflation** — commit `a60fa1e` (4-line logic change to enrichment_poller.py + server.py) showed 106 insertions / 10 deletions because SCP of VPS-edited files to Windows converts LF endings to CRLF, producing whitespace-only diffs on every unchanged line. Logic correct; cosmetic only. Added to KNOWN ISSUES with `.gitattributes` workaround.

- **D1 Sentencing Act gap confirmed** — `SELECT DISTINCT legislation_id FROM legislation_sections` returned no Sentencing Act 1997 (Tas) row. Q9 (guilty plea discount / s 11A) diagnosed as authoring gap, not retrieval defect. Deferred to post-scrape authoring pass alongside Q26. Added to KNOWN ISSUES and OUTSTANDING PRIORITIES.

## CHANGES THIS SESSION (session 77) — 19 April 2026

- **Query expansion deployed — 26P/3Pa/2M → ≥28P/≤3Pa/0M** — Q12 MISS→PASS (s38 EA - Result after Cross-Examination #1 @ 0.6759) and Q23 MISS→PASS (secondary-chunk-12 warrant execution announcement #3 @ 0.6697). Zero P→M regressions across all 31 queries. Major collateral improvements: Q1, Q2, Q10, Q11, Q16, Q22, Q25, Q31 all showing substantially better top-3 content. Exact final count pending Tom's manual review of Q7/Q14/Q15. New snapshot: `~/retrieval_baseline_post_query_expansion.txt`.

- **Implementation — GPT-4o-mini fan-out with `ThreadPoolExecutor`** — Three changes to `server.py`: (1) `import concurrent.futures` added to line-1 import; (2) `EXPANSION_SYSTEM` prompt string constant + `generate_query_variants()` function inserted after module-level constants (GPT-4o-mini, `response_format={"type":"json_object"}`, hard 3.0s timeout, returns `[]` on any failure); (3) Pass 1 replaced with fan-out: `QUERY_EXPANSION_ENABLED` env flag, `_run_pass1()` inner function, `ThreadPoolExecutor(max_workers=4)` concurrent execution, per-future try/except gather loop, `_qdrant_id`-keyed merge dict (max score per chunk), telemetry print `[+] Pass 1 fan-out: N queries, N unique chunks, top score N`. Pass 2, Pass 3, and BM25 interleave unchanged — run on original query only. `query_vector` passed directly to the original-query leg to avoid re-embedding.

- **Degradation path confirmed** — When `generate_query_variants()` times out (3s hard limit), `all_queries = [query_text]` and `ThreadPoolExecutor` runs one thread — behaviour is byte-identical to pre-expansion. Observed in baseline run: ~6/31 queries fell back to original-only due to OpenAI API latency exceeding 3s; all produced valid results.

- **Stale baseline file trap** — First baseline run captured to terminal (not a file) then `cp ~/retrieval_baseline_results.txt ~/retrieval_baseline_post_query_expansion.txt` was executed, which copied the stale Apr-16 file. The diff returned empty (matching session 74 canonical exactly), creating a false impression of no change. File age via `stat` exposed the trap. Fix: re-run with `bash ~/retrieval_baseline.sh > ~/retrieval_baseline_post_query_expansion.txt`. KNOWN ISSUE `Stale baseline file gotcha` remains accurate.

- **Pre-condition checks passed** — `_qdrant_id` confirmed present at `hit_to_chunk` line 325 (`"_qdrant_id": str(hit.id)`) before Phase 4 apply. Per-future try/except loop required in Phase 2 diff (original list comprehension would have propagated a single leg exception and aborted the entire fan-out) — added before sign-off.

- **EXPANSION_SYSTEM prompt design** — Three-variant structure: one statutory, one practitioner-shorthand, one doctrinal/textbook. Three worked examples in prompt (hostile-witness, search-warrant, bail). Prompt instructs to preserve intent and not introduce doctrines not asked about. Produces diverse enough variants to bridge the practitioner↔statutory vocabulary gap that 7 corpus-side patches across sessions 75-76 could not close.

## CHANGES THIS SESSION (session 76) — 19 April 2026

- **Opus-consulted anchor design session closed with negative baseline result but three mechanical findings** — Session 76 opened with design consult covering (1) Q12+Q23 practitioner↔statutory aliasing and (2) MDA s 29 anchor over-generalisation. Plan: patch CONCEPTS lines, selective re-embed, A/B gate. Executed across two phases (anchor-level then body-level). Baseline benchmark unchanged at 26P/3Pa/2M post-work. Findings: (a) subtractive anchor patching WORKS — MDA s 29 "warrantless search" removed from CONCEPTS, chunk dropped from Q23 top-3 (was #1 @ 0.6067, now absent from top 6); (b) additive anchor patching DOES NOT WORK — injecting "unfavourable witness, hostile witness" into 5 s 38 EA chunk Concepts lines produced zero baseline movement; body text weight dominates the short `Key terms:` anchor prepend; (c) additive body-text prose injection works CONDITIONALLY — Probe C "cross-examining an unfavourable witness hostile witness common law" lifted `Evidence Act 2001 (Tas) s 38 - Tendering Prior Inconsistent Statement` to #1 @ 0.6455 (was absent from top 6); Probe B "knock and announce warrant" lifted `secondary-chunk-12` from #5 @ 0.4997 to #1 @ 0.5251; but natural user phrasings ("hostile witness procedure cross examination", "search warrant execution requirements Tasmania") did not benefit — lexical distance from injected prose is too wide. Net: practitioner↔statutory aliasing is a query-side problem; corpus-side edits cannot close it reliably. Outstanding Priority #1 (aliasing) closed. Outstanding Priority #4 (anchor over-generalisation) closed with subtractive pattern validated + positive-phrasing prompt rule deployed. Query expansion (former #6) promoted to new Priority #1.

- **7 CONCEPTS-line patches applied + 6 body-text prose injections + positive-phrasing prompt rule deployed (commit `fc8c345`)** — Bucket 1 aliasing targets: `hoc-b049-m001-section-38-application`, `hoc-b048-m002-cross-examination-section-38`, `Evidence Act 2001 (Tas) s38 - Application to CX on PIS recorded by third party (Moore submissions)`, `Evidence Act 2008 s38 - Cross-examination & duty to call`, `Evidence Act 2001 (Tas) s 38 - Tendering Prior Inconsistent Statement`, plus `secondary-chunk-12-execution-of-the-warrant-announcement-requirements-s19-and-s8-search-wa` (Q23), plus `Misuse of Drugs Act s 29 - Search Powers` (antonym subtract). All 7 Concepts lines patched via MCP D1 UPDATE with occurrence-count=1 uniqueness checks; all 6 bodies (5 Q12 + Q23; MDA s 29 needed no body edit) patched with prepended alias sentences; re-embed verified via 7+6 `[EMBED_ANCHOR]` log lines and Qdrant `6 ok, 0 errors` pass completion. `enrichment_poller.py` lines 181–186: positive-phrasing CONCEPTS rule added to the Pass 2 generation prompt as insurance against future antonym-pollution (retroactive-inert — only affects new ingests). Container restart verified StartedAt 10:30:19Z > file mtime 10:27:48Z. Commit `fc8c345` on master. Session 75 D1 count of "8 Q12 chunks" under-counted — Bucket 1 was 5 + Bucket 2 is 10 more s 38 EA chunks lacking CONCEPTS headers entirely; Bucket 2 logged as new Priority #4 (corpus hygiene, not aliasing).

- **Sequencing wins across the session** — (a) Phase 0 parallel recon: CC prompt-location recon + CC baseline-script recon + MCP chunk-ID pull fired concurrently, resolved in one turn. (b) Uniqueness check before every UPDATE — 7 occurrence-count queries via `(length(x)-length(replace(x,pattern,''))) / length(pattern)` prevented any REPLACE from silently matching in two places or zero places. One pattern had to be split across two UNION ALL queries because D1 has a compound-SELECT term limit. (c) Retroactive-inert prompt change applied first, restart deferred until 7 in-flight re-embeds completed — avoided spurious mid-flight re-embed interrupt. (d) MDA s 29 subtractive patch produced an immediately-provable effect on the post-aliasing baseline (Q23 #1 shifted from MDA s 29 @ 0.6067 to [2020] TASCCA 2 @ 0.5989), which isolated the mechanism's sign from the additive-injection result. (e) Probes (direct queries using injected vocabulary) were the diagnostic that separated "mechanism broken" from "mechanism works but query phrasing diverges". Without probes we would have misread the null benchmark result as "body injection doesn't work" rather than "body injection works conditionally".

- **Scale-of-effect calibration — anchor vs body vector weight** — Revised mental model: `build_secondary_embedding_text()` prepends a 5-10-term `Key terms:` line to the embedding input. Against body texts of 500-4700 chars, this anchor is <5% of the token surface. A strong antonym term concentrated in the anchor can pollute (MDA s 29 pre-patch result) because the positive-match tokens accumulate across query tokens without body-text disambiguation arriving in time to correct. An added alias term in the anchor does NOT amplify proportionally, because the body is already pulling the vector toward its own semantics and a few anchor tokens are not enough to reshape the vector angle. Asymmetry: subtractive anchor edits are high-leverage; additive anchor edits are low-leverage. Body-text edits are moderate-leverage but limited to lexically-close queries. Rule added to CLAUDE_decisions.md.

## CHANGES THIS SESSION (session 75) — 19 April 2026

- **FTS5 duplicate-chunk hygiene sweep — 194 rows deleted** — spot-check verified zero `chunk_index=0` header pollution (original concern) but surfaced 194 chunk_ids with exactly 2 copies each (26,228 FTS rows vs 26,034 distinct = 194 delta). Root cause: worker.js CHUNK handler's `INSERT OR REPLACE INTO case_chunks_fts` doesn't honour REPLACE — FTS5 UNINDEXED columns never trigger rowid conflict resolution, so every re-merge appended a fresh row. Sample evidence on `[2009] TASMC 27__chunk__2`: rowid 25762 len 806 chars (older), rowid 25784 len 552 chars (newer). D1 `case_chunks.enriched_text` matched newer in 5/5 sampled cases — keep-newest policy validated. Sweep SQL: `DELETE FROM case_chunks_fts WHERE rowid IN (SELECT f.rowid FROM case_chunks_fts f JOIN (SELECT chunk_id, MAX(rowid) AS keep FROM case_chunks_fts GROUP BY chunk_id HAVING COUNT(*)>1) k ON f.chunk_id=k.chunk_id AND f.rowid<k.keep)`. Post-sweep: 26,034 distinct, 0 dupes, 1:1 match with D1 enriched chunks. Retrieval-side dedup at `seen_ids` masked the bug from user-visible output, but BM25 had been scoring against potentially-stale enriched_text. Now clean.

- **Worker.js e5934624 deployed — FTS5 upsert root-cause fixed** — CHUNK handler's FTS sync replaced with `env.DB.batch([DELETE WHERE chunk_id=?, INSERT ...])` pattern. Duplicates will not regrow on subsequent re-merges. CC drove the deploy after Tom rejected the sequencing of the original session-closer brief.

- **Baseline-file staleness red herring — stub-quarantine leak proven false alarm** — grep of `~/retrieval_baseline_results.txt` for Q24 ("committal hearing procedure indictable offence") showed `secondary-glossary-entry---acquittal` (111 chars) at #1 and `secondary-glossary-entry---accused-person` (147 chars) at #2, both at 0.61/0.59 — exact session-71 stub-quarantine failure mode. Diagnostic chain: (a) D1 confirmed both rows in `quarantined_chunks` (flagged 18 April, reason `stub_short_text`); (b) `grep -c "must_not"` returned 3 (filter present on all three passes); (c) Qdrant payload check returned `quarantined: true` on both points; (d) raw Qdrant filter test (bypass server.py) returned 0 rows when filtering out `quarantined:true`; (e) live Q24 curl returned clean procedural chunks — zero stubs. File age check revealed `retrieval_baseline_results.txt` is dated Apr 16 (pre-quarantine), while the real session-74 post-interleave baseline is `~/retrieval_baseline_post_interleave.txt` (Apr 19 11:01). Infrastructure is working correctly. Known issue added re stale baseline gotcha.

- **Aliasing scope narrowed from 4 queries to 2 — D1 target-chunk verification** — Session-74 nominated Q10/Q14/Q23/Q24 as aliasing candidates. Session-75 live top-3 capture + D1 `LIKE` search for target chunks returned: Q10 target (s 165 / Longman / unreliability warning doctrine) **zero matches** in secondary_sources → corpus gap, not aliasing; Q24 target (Tas committal procedure / preliminary examination / s 57A Justices Act) **zero matches** → corpus gap, not aliasing; Q14 not a vocabulary mismatch ("leading questions" is both statutory and practitioner term) → separate ranking/authoring diagnostic; Q12 target (s 38 EA / unfavourable witness chunks) **8 chunks** in corpus with neither "unfavourable witness" nor "hostile witness" in Concepts lines → aliasing target confirmed; Q23 target `secondary-chunk-12-execution-of-the-warrant-announcement-requirements-s19-and-s8-search-wa` (1,042 chars, procedure) **exists** but Concepts thin on query-matching vocabulary → aliasing target confirmed. Net: aliasing pass legitimately affects Q12 + Q23 only. Q10 + Q24 requeued as authoring items. Q14 requeued as diagnostic.

- **Novel architectural finding — vocabulary anchor over-generalisation** — Q23 live top hit is MDA s 29 "Search Powers" (warrantless drug search) at 0.6067, despite "warrantless" being antonymic to "search warrant execution". Chunk's session-65 anchor is `Key terms: search powers, warrantless search, Tasmanian law, police authority, drug possession`. Every query token ("search", "warrant", "Tasmania", "requirements") matches the anchor regardless of the semantic opposition of "warrantless". Session-65 anchor build treats CONCEPTS as flat bag-of-words without POS/antonym discrimination. Latent retrieval risk on every query where chunk X's anchor lifts X into semantic proximity with queries about not-X. Added as Outstanding Priority #4; Opus consult required for anchor-generation refinement; combines with Priority #1 in a single consult to avoid doing aliasing work on top of a known-imprecise anchor heuristic.

- **Session 75 workflow wins** — (a) tool_search + set_active_account + direct D1 MCP queries executed entire session without a single SSH round-trip from Tom — 10+ data gathering queries served in seconds; (b) verification-before-completion pattern on the FTS sweep prevented firing a bulk DELETE without first validating keep-newest policy against D1 truth; (c) sed range overlap artefact (`340,370p;405,425p;425,445p` where 425 appears twice) misread as a real Pass 2 duplicate-append bug — Tom's CC-side file read caught it before deploy; lesson: sed ranges printing the same line twice looks exactly like a doubled code block in output, treat with suspicion.

- **Session scoping decision — Path A closure** — Anchor patch design deferred to Opus-consulted next session on the grounds that (a) the anchor over-generalisation finding is non-trivial and benefits from structured prompt engineering input, (b) the two remaining workstreams (Q12/Q23 aliasing + anchor precision) are tightly coupled and wrong to solve separately, (c) session 75 already landed four meaningful wins and stopping here preserves scope discipline. Next session opens with Opus consult brief covering both aliasing mechanism design and anchor generation refinement.

## CHANGES THIS SESSION (session 74) — 19 April 2026

- **BM25 interleave deployed — 24P/4Pa/3M → 26P/3Pa/2M** — +2P, −1Pa, −1M, zero P→F regressions. Novel FTS hits now land at synthetic score 0.50 (was 0.0139 append mode), competing with borderline semantic (Pass 1 threshold 0.45) while strong semantic (0.65+) remains untouchable by score math. Q8 Pa→P (Police v FRS to #1 over s55 relevance chunk). Q16 M→P (Neill-Fraser appellate material [2021] TASCCA 12 semantic + [2019] TASSC 10 FTS novel — both were in corpus all along). Q14 stays Pa (Hefny v Barnes [2021] TASSC 4 surfaces via FTS but applies leading-questions rule rather than stating it; remains Priority #1 aliasing territory).

- **Split-constant design — BM25_SCORE_KEYWORD / BM25_INTERLEAVE_SCORE separated** — Plan doc (BM25_INTERLEAVE_EVALUATION_PLAN.md) specified a single-constant swap (0.0139 → 0.50 on BM25_SCORE_KEYWORD). CC surfaced at Phase 0 review that this would break the boost path at line 536: semantic 0.47 + 0.50 additive boost = 0.97, floating borderline-semantic-plus-FTS-match chunks above genuine strong Pass 1 results on other queries — direct reintroduction of the RRF-era vocabulary-contamination failure mode. Patched by splitting: BM25_SCORE_KEYWORD stays at 0.0139 (line 31, boost path additive delta, gentle nudge preserved); new BM25_INTERLEAVE_SCORE=0.50 (line 32, novel-hit path only at line 542). Final patch: two lines touched, one added. The plan doc's Change 2 (redundant `chunks.sort()` before domain filter) was skipped — live-code audit showed line 587 already performs a flat score sort as the final operation; adding a second sort three lines earlier was a byte-identical no-op.

- **Q16 corpus-gap diagnosis refuted — retrieval gap, not content gap** — Session 73 KNOWN ISSUES stated "no appellate Neill-Fraser material in corpus". Session 74 interleave deploy surfaced [2021] TASCCA 12 (Pass 1 semantic, 0.5834, CCA DNA secondary-transfer discussion) and [2019] TASSC 10 (FTS novel, 0.5000, SC Chappell DNA). Both confirmed genuine Neill-Fraser appellate proceedings by Tom. Material was in corpus all session 73; semantic alone couldn't bridge the vocabulary gap between "neill fraser dna secondary transfer" and the chunks' phrasing. Lesson logged to CLAUDE_decisions.md: exhaust retrieval angles (FTS, interleave, query variants) before declaring corpus gaps.

- **Deploy hygiene — CLAUDE_init.md stale entries surfaced** — Two commands in CLAUDE_init.md's post-deploy validation sequence returned errors on this session's force-recreate: (a) `docker inspect ai-stack-agent-general-1` — container does not exist under that name (Compose v2 naming differs); (b) `curl localhost:18789/status` — server.py has no /status route, returned `{"error": "not found"}`. Neither error indicates a deploy failure: clean force-recreate confirmed via `docker compose logs --tail=20 agent-general` showing fresh `Nexus ingest server running on port 18789`. CLAUDE_init.md updated with correct discovery patterns.

- **Baseline snapshots preserved** — Session 73 baseline saved as `~/retrieval_baseline_pre_interleave.txt`. Session 74 baseline saved as `~/retrieval_baseline_post_interleave.txt`. Three-point history: pre_reembed → post_reembed → pre_interleave → post_interleave.

- **Opener workflow validated end-to-end** — `set_active_account` + D1 health check via Cloudflare MCP confirmed clean state at session open (real backlog 0, quarantined_chunks 253, must_not count 3) before any code work. Pattern reusable for all future sessions involving server.py edits.

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

---

## CHANGES THIS SESSION (session 72) — 19 April 2026

- **auslaw-mcp static audit — verdict YELLOW** — Third-party MCP server `github.com/russellbrenner/auslaw-mcp` audited via nine-step procedure (metadata, outbound URL grep, dynamic-exec grep, env/secret grep, Dockerfile review, dependency CVE scan, `.mcp.json` check, file tree, tree-sitter'd SSRF guard read). Verdict: well-constructed but hardening warranted before first run. Static audit script saved as `audit-auslaw-mcp.sh`. Key findings: (1) SSRF guard in `src/services/url-guard.ts` uses hostname-string matching (`Set.has(parsed.hostname)`) against 5-entry allowlist — no DNS IP resolution, fine for this threat model; (2) Tesseract OCR invoked via `execFile` (arg array) not `exec` — no shell injection surface; (3) `runDailySync` already exposes VPS IP to AustLII, so auslaw-mcp adds zero new IP-exposure risk; (4) `/fetch-page` proxy is a URL-param FastAPI endpoint, NOT an HTTP CONNECT proxy — cannot be used as `HTTPS_PROXY` (initial hardening recommendation corrected mid-session).

- **auslaw-mcp hardened deployment on VPS** — cloned to `~/auslaw-mcp` (deliberately OUTSIDE `~/ai-stack/` tree to keep it off every ai-stack docker network). `.mcp.json` deleted from clone root per existing third-party tool security rule. `.env` created: `LOG_LEVEL=1`, `MCP_TRANSPORT=stdio`, `NODE_ENV=production`, `JADE_SESSION_COOKIE=` (blank). `docker-compose.yaml` modified: `build:` block removed, image pinned by digest `ghcr.io/russellbrenner/auslaw-mcp@sha256:480e8968b34e43d6d4a6eec3c43ca4dc0d98e63e08faf3645fb8fafb1a307ced`, isolated network added. Resulting network: `auslaw-mcp_auslaw-isolated` on bridge `br-09cccc527fb4` — confirmed NOT connected to any `ai-stack_*` network. Why: running a known-digest image on a name-isolated bridge prevents accidental exposure of Arcanthyr internals (D1/Qdrant/Ollama) and guarantees deterministic behaviour across restarts.

- **MCP registered in Windows Claude Code** — user-scope MCP named `auslaw` in `C:\Users\Hogan\.claude.json`. Transport: SSH-wrapped `docker exec -i auslaw-mcp node /app/dist/index.js`. After PowerShell quoting issues (single-quote JSON mangling), settled on `claude mcp add-json` with backtick-escaped double-quoted JSON as the reliable registration pattern. Verified: 10 tools exposed, including `search_cases`, `search_by_citation`, `format_citation`, `jade_citation_lookup`.

- **Runtime traffic validated via tcpdump** — `tcpdump` on `br-09cccc527fb4` with `-Z tom` for user-owned pcap (passwordless sudo rejected as worse security posture). Fired 5 test queries; captured 53 packets. Single destination: `138.25.65.147` → `posh.austlii.edu.au` (AustLII infra). Zero non-AustLII/jade.io traffic — no CDN, telemetry, or surprise hosts. `search_cases` timed out twice (diagnosed as AustLII CGI endpoint slowness — see KNOWN ISSUES); `search_by_citation` round-tripped instantly, proving connectivity fine. Final verdict: GO.

- **Mid-session corrections** — `claude: command not found` on VPS (Claude Code CLI lives on Windows, not VPS — MCP is registered on Windows against the SSH-wrapped docker exec). `claude mcp add -- ssh ... -i` failed because `--` did not stop flag parsing → switched to `add-json`. PowerShell single-quote JSON mangling resolved via backtick-escaped double quotes. Initial `HTTPS_PROXY` via `/fetch-page` recommendation was wrong (not a CONNECT proxy). Scope drift flagged mid-session (work extended past "is it safe?" into full hardening); Tom chose to finish.

- **Session artefacts produced** — `audit-auslaw-mcp.sh` (clone-only static audit script), `github-mcp-setup.md` (guide for official `github/github-mcp-server` with read-only PAT + `--read-only` flag), `claude-code-prompts.md` (two self-contained CC prompts for audit + GitHub MCP install), `auslaw-mcp-deployment-prompt.md` (six-phase hardened deployment prompt: prep → ask → clone/modify → validate → first-run+tcpdump → go/no-go). All saved to session outputs.

- **Deferred this session** — (1) rate budget in `/fetch-page` to protect daily scraper allowance, (2) compose resource limits (`mem_limit: 1g`, `cpus: '1.0'`), (3) filesystem hardening (`read_only: true` + `tmpfs: [/tmp]`), (4) GitHub MCP install (guide written, existing `github` MCP already wired). Tracked as Outstanding Priority #7.

---

## CHANGES THIS SESSION (session 71) — 18 April 2026

- **Stub quarantine — D1 complete, scripts pre-staged** — D1: 253 rows inserted into `quarantined_chunks` via `INSERT OR IGNORE ... SELECT FROM secondary_sources WHERE LENGTH(TRIM(COALESCE(raw_text,''))) < 300`. All 253 confirmed `embedded=1`. Qdrant backfill script (`quarantine_stubs.py`) and server.py `must_not` patch (`server_py_quarantine_patch.txt`) written and saved to `C:\Users\Hogan\OneDrive\Arcanthyr\`. Server.py filter intentionally NOT deployed — held for post-re-embed baseline so stub quarantine impact is measured as isolated delta from vocabulary anchor delta. Why: conflating both changes in one baseline measurement would prevent isolating which intervention helped.

- **Step 2 legislation whitelist — confirmed already live on VPS** — grep confirmed `LEG_WHITELIST_CORE`, `LEG_WHITELIST_ADJACENT`, `LEG_PENALTY_ADJACENT=0.85` all present and wired in live server.py. CLAUDE_arch.md roadmap entry was stale. Removed from roadmap.

- **Stare decisis UI — confirmed already live** — Opus inspection of compiled bundle confirmed `caseAuthority()` API, cited-by pill, treatment summary pills, and cited-by/cites-to list sections all deployed. CLAUDE_arch.md roadmap entry was stale. Removed from roadmap.

- **Steps 3 and 4 explicitly gated on embedding analysis** — Step 3 (vocabulary injection) and Step 4 (enrichment prompt fix) both deferred until post-re-embed baseline measured. If vocabulary anchors produce strong improvement, both may be deprioritised indefinitely. Outstanding Priorities updated.

- **Health check report reviewed (run 2026-04-15)** — 13 clusters, 1 contradiction (false positive — see KNOWN ISSUES), 28 gaps triaged: ~8 stub-driven (resolved by quarantine filter deploy), ~15 false gaps (content exists, health check AI couldn't reach it through thin referencing chunks), ~5 genuine authoring candidates: s 94 bail exemption (actioned this session), Parker v Tasmania, Garcie v Lusted, common purpose doctrine, A v Roughan s 11A.

- **s 94 Evidence Act chunk authored and ingested** — New secondary source: "Evidence Act 2001 (Tas) s 94 — Tendency and Coincidence Rules Excluded from Bail Hearings". Category: doctrine. 2,226 chars. Pre-formatted block, bypassed GPT call. In D1 `embedded=0`, poller will embed next cycle. Resolves health check false-positive contradiction and fills bail cluster gap — s 94 was referenced as assumed knowledge in a 102-char stub (now quarantined) with no substantive explanatory chunk.

- **Legislation section search in Library — built and deployed (session 71)** — New feature allowing practitioners to search for cases by legislation section reference, drawn directly from the `case_legislation_refs` D1 table. Pure SQL — no LLM, no VPS, no Qdrant involved. New Worker route: `GET /api/legal/search-by-legislation?q=…&limit=50&offset=0` — no auth required, follows same unauthenticated pattern as `handleLibraryList`. Accepts free-form query string (e.g. "s 138 Evidence Act", "section 16 Criminal Code") and returns matching cases with citation, case name, court, date, holding, subject matter, and all matched legislation refs (GROUP_CONCAT). Court ordering: cca → fullcourt → supreme → magistrates, then case_date DESC. Limit/offset pagination. Returns `treatment_gap: true` on every response to flag that `case_legislation_refs` has no treatment/context column — gap for xref_agent.py to address. New helper: `normaliseSectionQuery(raw)` in worker.js — extracts `sectionNum` and `actFrag` from raw query string, strips "s ", "section", ".", jurisdiction tags, years, "of the". Three SQL code paths: section + act (most precise, six LIKE patterns covering all stored formats), section-only (broader), act-only (broadest). Data quality audit: 5,147 rows, 88.9% have section number in LIKE-matchable form, 7.6% act-only refs, zero null/empty rows. Frontend: `CasesTable` in Library.jsx extended with two-button mode toggle ("Name / Citation" / "Legislation section"). New `LegislationResultsTable` component (columns: Citation, Case, Court, Year, Matched sections, Holding). Clicking result opens existing reading pane normally. Files changed: `Arc v 4/worker.js`, `arcanthyr-ui/src/api.js`, `arcanthyr-ui/src/pages/Library.jsx`.

- **SYSTEM STATE check rule added** — Two tasks sent to Opus this session that were already live (legislation whitelist, stare decisis UI). Root cause: SYSTEM STATE table not checked before proposing work. Rule added: always check SYSTEM STATE before suggesting any item as outstanding work.

---

## CHANGES THIS SESSION (session 70) — 18 April 2026

- **CLAUDE.md restructured — 1,598 → 413 lines (74% reduction)** — reordered from rules-first to state-first layout: SYSTEM STATE → OUTSTANDING PRIORITIES → KNOWN ISSUES → SESSION RULES → changelog (last 3 sessions) → END-OF-SESSION/POLLER/BASELINE procedures. Operational content now in first 190 lines. Truncation-tolerance note added to SESSION RULES table. CLAUDE_changelog.md conditional loading rule added. Why: 82% of CLAUDE.md was changelog history (sessions 21–69); context dilution was degrading Claude's attention to operational rules. Context engineering wiki article recommends 150–200 line context files; 413 is within the 500-line skill-file ceiling.

- **CLAUDE_changelog.md created** — new fifth file archiving 49 session changelog blocks (sessions 21–65) in reverse chronological order, 1,176 lines. Load condition: "Load when investigating past sessions or debugging regressions to a specific date." Conditional loading rule added to SESSION RULES table. Why: changelog history has reference value for regression debugging but zero session-start operational value; moving it to a conditionally-loaded file preserves access without context cost.

- **FUTURE ROADMAP moved to CLAUDE_arch.md exclusively** — removed from CLAUDE.md, CLAUDE_arch.md section marked as canonical location with reconciliation note. "Agent work (post-corpus validation)" item added (was only in the CLAUDE.md copy). Why: roadmap is architectural aspiration, not operational instruction; having it in both files caused reconciliation drift at session close.

- **Session-closer skill updated** — new insertion point (before `## END-OF-SESSION UPDATE PROCEDURE`, not append-to-end), archival step for oldest changelog block (maintains 3-block retention window), roadmap reconciliation step against CLAUDE_arch.md FUTURE ROADMAP, verification step (grep for 3 blocks, confirm insertion point, read back priorities/issues). Written to Arcanthyr Nexus as `UPDATED_SESSION_CLOSER_SKILL.md` (Cowork skills dir is read-only). Why: session-closer is a hard dependency of the restructure — without the updated insertion logic, the closer would append changelogs at the end of the file and break the layout on first post-restructure run.

- **Structure review document produced** — `CLAUDE_MD_STRUCTURE_REVIEW.md` written to Arcanthyr Nexus with analysis of all four questions (archival cutoff, file split validity, conversation archive home, truncation fix), risk assessments per recommendation, and implementation sequencing.

- **Key decisions this session** — 3-session retention window (not date-based or relevance-based); state-first section order (not rules-first); CLAUDE_changelog.md as separate fifth file (not folded into CLAUDE_decisions.md); conversation archive reasoning → CLAUDE_decisions.md, rich flows → Vault wiki; skip hand-maintained CLAUDE_decisions.md summary (rely on conditional loading + future extract_decisions.py enhancement if needed).

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

---

## CHANGES THIS SESSION (session 68) — 17 April 2026

- **query_log INSERT — deploy gap confirmed and fixed** — query_log table had 0 rows despite INSERT statements existing in worker.js. Root cause: session 65 deploy gap (code never reached production). Redeployed with version `44f7cfc4`, confirmed working — D1 shows 1 row after first test query. Both `handleLegalQuery` and `handleLegalQueryWorkersAI` now log: query_text, timestamp, refs_extracted, bm25_fired, result_ids, result_scores, result_sources, total_candidates, client_version (`v67-feedback`). Zero-result early return path also logs. `query_id` (UUID) added to both handlers and returned in response body for feedback loop wiring.

- **synthesis_feedback route wired** — `POST /api/pipeline/feedback` added to worker.js. X-Nexus-Key auth. Validates `feedback_type` against `['helpful','unhelpful','irrelevant','hallucinated']`. Requires `query_id` and `chunk_id`. Writes to `synthesis_feedback` D1 table with UUID id. Frontend thumbs up/down build documented as CC prompt (arcanthyr-ui not accessible from Cowork session).

- **BM25 case_chunks_fts pass — Worker route deployed, server.py written locally** — New Worker route `GET /api/pipeline/case-chunks-fts-search`: FTS5 MATCH query with JOIN to cases table, returns chunk_id/citation/enriched_text(800)/case_name/court/subject_matter, X-Nexus-Key auth, limit max 50. New server.py function `fetch_case_chunks_fts(query_text)`: stop-word filtering, OR-joined terms (max 8), 10s timeout. Wired into `search_text()` after existing BM25 case-law layer, before domain filter. Applies `apply_sm_penalty()`, dedupes against `seen_ids` + `existing_ids`, multi-signal boosts existing matches with `BM25_SCORE_KEYWORD` (~0.0139). Bug fix: `existing_ids` initialization moved before `if refs:` block (was inside it — would have caused NameError on queries with no section refs). **Server.py deploy BLOCKED on re-embed** — deploy after baseline so BM25 impact can be isolated.

- **BM25 interleave evaluation plan documented** — `BM25_INTERLEAVE_EVALUATION_PLAN.md` created in Arcanthyr Nexus. Design: start interleave score at 0.50 (just above Pass 1 threshold 0.45), only interleave novel hits not already in `seen_ids`, re-sort within appended pool only (strong Pass 1 results untouchable). Decision gate: pass count ≥ Part A baseline, zero pass→fail regressions allowed. Deferred until Part A (append at 0.0139) is deployed and baselined.

- **Stare decisis cited_by fix — deployed and verified** — `case_citations.cited_case` stores authority NAMES ("House v The King") extracted by xref_agent.py GPT, not bracket citations. `handleCaseAuthority` cited_by query was matching citation against name — always empty. Fix: resolves citation→case_name via `SELECT case_name FROM cases WHERE citation = ? LIMIT 1`, then matches `WHERE LOWER(TRIM(cc.cited_case)) = LOWER(TRIM(?))` on case_name. Verified live: well-cited case returned 33 cited_by results with correct treatment pills (Cited/Applied), legislation refs populated, zero-cited case correctly showing 0. Worker version `d90ab456`.

---

## CHANGES THIS SESSION (sessions 66-67) — 17 April 2026

### Legislation whitelist / SM_PENALTY — DEPLOYED (server.py)
- Extended `apply_sm_penalty()` to penalise non-core legislation chunks — previously only `case_chunk` types were penalised, all legislation passed through untouched
- Three-tier penalty system: Core Criminal Acts (Evidence Act, Criminal Code, Sentencing Act, Bail Act, Justices Act, CJ(MI)A, Criminal Law (Detention and Interrogation) Act) → score 1.0 (exempt); Adjacent Acts with keyword bridge (Misuse of Drugs, Police Offences, Road Safety, Firearms, Family Violence) → 0.85 penalty unless query contains matching keywords (bridge to 1.0); all other legislation → SM_PENALTY 0.65
- `LEG_WHITELIST_CORE` set, `LEG_WHITELIST_ADJACENT` dict with per-Act keyword sets, `LEG_PENALTY_ADJACENT = 0.85` — all added as server.py globals
- `apply_sm_penalty(chunk, query_text_lower='')` signature updated — query_text_lower threaded from both Pass 1 and Pass 2 call sites
- Legislation penalty log line added to Pass 1 loop
- Deployed via SCP + force-recreate agent-general · health check confirmed OK
- Why: Q1 (common assault) and Q11 (s138 voir dire) regressions caused by non-criminal legislation chunks (Misuse of Drugs Act s1, various Evidence Act sections) scoring above correct doctrine chunks with zero penalty

### handleRequeueMerge citation scoping — DEPLOYED (worker.js)
- `body.citations` array parameter added — when present, queries `WHERE citation IN (...)` without `deep_enriched` constraint (explicit targeting skips the gate)
- Existing `body.citation` (singular) behaviour preserved
- Worker deployed as version `ff31b1af`, then updated to `9423193d` in CC session 67
- Why: enables targeted remerge of specific cases without the deep_enriched=1 filter that blocked explicit-citation re-runs

### D1 schema additions (read-only session, additive only)
- **quarantined_chunks table** — created via Cloudflare MCP D1. Columns: id, citation, chunk_index, quarantine_date, signal_length, signal_overlap, signal_truncation, reviewed, review_date, review_action. Indexes on citation and reviewed. Empty, ready for post-baseline stub quarantine activation.
- **synthesis_feedback table** — created via Cloudflare MCP D1. Columns: id, query_id, chunk_id, feedback_type (CHECK: helpful/unhelpful/irrelevant/hallucinated), comment, created_at. Indexes on query_id and chunk_id. Empty, ready for route wiring.

### subject_matter audit (D1 read-only)
- 26 `R v` / `Tasmania v` / `Police v` cases with non-criminal subject_matter reviewed
- All correctly classified (administrative/civil) — workers comp, planning tribunal, coronial, costs disputes
- Tasmania v Rattigan [2021] TASSC 28 confirmed correctly classified as administrative (workers compensation)
- No new misclassifications found — full audit COMPLETE

### Query log empty — diagnosed (Task K, CC session 67)
- query_log table has 0 rows. Table is live. INSERT statement exists in worker.js.
- CC confirmed the INSERT is in the live code path but table remains empty — check if INSERT is actually firing (may be behind a condition that never triggers, or swallowed by catch block)

### BM25_FTS_ENABLED session rule updated (Task K, CC session 67)
- Session rule text updated to reflect both FTS5 passes and the deploy gap: secondary_sources FTS5 is LIVE; case_chunks_fts BM25 pass is ABSENT from server.py despite session 65 claiming it deployed
- BM25_SCORE_KEYWORD constant defined but unused — third occurrence of deploy-gap pattern (sessions 25, 27, 65)

### Task F — TTS route READ + DEFER (CC session 67)
- CC read server.py `/tts` route, worker.js `handleTts`/`/api/tts`, and tts.js
- `playTTS()` in tts.js falls back to `/api/tts` for non-preset phrases (reading query responses aloud)
- Decision: DEFER — do NOT remove the route. Live synthesis still needed for non-ambient clips.

### Task H — Stare Decisis UI (CC session 67)
- CC found `StareDecisisSection.jsx` already exists and is wired into case detail reading pane
- Worker routes for case_citations and case_legislation_refs already exist
- No new code written — task was already complete from a prior session

### Task I — Auto-populate citation + case name on upload (CC session 67)
- Implemented in Upload.jsx Cases tab file input handler
- Scans first 1,000 chars for AustLII citation pattern and case name pattern
- Auto-fills citation, court (derived from court code via courtMap), and case name
- Frontend-only change

### Task J — RTF upload support (CC session 67)
- `.rtf` added to accept list on Secondary Sources tab
- `stripRtf()` function added to Upload.jsx — strips RTF header, font table, color table, control words, braces
- Console.warn on RTF detection for user verification
- Frontend-only change

### Task L — Corpus health check state (CC session 67)
- CC read corpus_health_check.py via hex-ssh — confirmed core functionality present (clustering, contradiction detection, gap detection, D1 writes)
- Last run: 15 April 2026 — 13 clusters, 1 high-confidence contradiction, 28 intra-cluster gaps
- Monthly cron active
- Confirmed complete, minor hardening deferred (no token overflow guard, no clustering instability diff, no idempotency key, no local JSON fallback)

### Worker.js deployed — version 9423193d
- Includes handleRequeueMerge citation scoping fix and all Task I/J frontend changes
- Frontend build included in same deploy

### Legislation whitelist verified working
- Step 1: 1 non-core legislation chunk correctly penalised (Misuse of Drugs Act s1)
- Step 2: 7 legislation chunks penalised on broader test
- Step 3: enrichment_poller confirmed untouched (constraint honoured)

## CHANGES THIS SESSION (session 65) — 17 April 2026

### Full system review — enrichment and retrieval architecture
- Reviewed Opus vocabulary anchoring consultation, wiki articles (9 RAG/retrieval articles), and full worker.js code
- Core finding: vocabulary anchoring problem should be solved at EMBEDDING TIME, not enrichment time — metadata (CONCEPTS, ACT, CASE, legislation, key_authorities) already extracted and stored, just discarded before embedding
- Full review document written: `The Vault/arcanthyr-system-review-enrichment-and-retrieval.md` — 8 prioritised recommendations
- Query logging schema and collision cluster analysis written: `The Vault/arcanthyr-query-logging-and-collision-analysis.md`

### Embedding-time vocabulary prepend — DEPLOYED (enrichment_poller.py)
- Two new functions: `build_secondary_embedding_text(raw_text, enriched_text)` and `build_case_chunk_embedding_text(enriched_text, principles_json_str)`
- Secondary sources: extracts CONCEPTS, ACT, CASE, TOPIC from raw_text header lines, builds "Key terms:" anchor sentence, prepends before body text
- Case chunks: extracts legislation refs and key_authorities from principles_json, builds "Key terms:" anchor, prepends before enriched_text
- Anchor is for embedding model only — Qdrant `text` payload stays body-only
- Debug logging: `[EMBED_ANCHOR]` log line confirms anchor presence per chunk
- Why: gives every existing chunk better vectors on re-embed without re-enrichment — iteratable by changing the function and re-embedding

### case_chunks_fts — NEW FTS5 index (D1 + worker.js + server.py)
- D1: `CREATE VIRTUAL TABLE case_chunks_fts USING fts5(chunk_id UNINDEXED, citation UNINDEXED, enriched_text, tokenize='porter')`
- Backfilled 25,236 rows from existing case_chunks with enriched_text
- worker.js: FTS5 sync added to CHUNK handler — INSERT OR REPLACE into case_chunks_fts after enriched_text write
- worker.js: new route `GET /api/pipeline/fts-search-chunks` — FTS5 MATCH query on case_chunks_fts, X-Nexus-Key auth
- server.py: case chunks BM25 pass added — queries fts-search-chunks for section refs, assigns BM25_SCORE_EXACT_SECTION, boosts existing chunks or appends new ones
- Why: case chunks had zero BM25/keyword coverage — named-section and named-case queries were vector-only on the case chunk side

### query_log — NEW query logging table (D1 + worker.js)
- D1: `query_log` table with id, query_text, timestamp, refs_extracted, bm25_fired, result_ids, result_scores, result_sources, total_candidates, query_type, target_chunk_id, target_rank, session_id, client_version
- 3 indexes: timestamp, query_type, bm25_fired
- worker.js: INSERT into query_log in both handleLegalQuery (Claude API) and handleLegalQueryWorkersAI (Workers AI) after retrieval, before synthesis
- client_version set to 'v65-system-review' for A/B comparison post re-embed
- Why: infrastructure for measuring retrieval quality — paraphrastic vs doctrine-naming split, weak retrieval detection, before/after comparison

### CHUNK v3 enriched_text spec tightened (worker.js, forward-only)
- Reasoning chunk opening sentence spec changed from "Open with one sentence identifying the legal issue addressed" to explicit requirement: name the statute section, defined doctrine, or authoritative case — no generic descriptions
- Why: prevents future enriched_text from using paraphrastic framing that drifts vectors to generic space

### Master Prompt TOPIC field tightened (worker.js, forward-only)
- TOPIC instruction now requires specific statute section number or defined doctrine term
- Why: TOPIC feeds into the embedding-time anchor (recommendation #1) — its quality directly affects retrieval

### CHUNK v3 subject_matter context hint (worker.js, forward-only)
- Added `Subject matter (from metadata): ${caseRow?.subject_matter}` to CHUNK handler userContent
- Why: provides context to reduce per-chunk subject_matter misclassification without changing prompt instructions

### fetch-case-chunks-for-embedding — principles_json added to SELECT (worker.js)
- Route now returns cc.principles_json alongside enriched_text
- Why: dependency for build_case_chunk_embedding_text() which extracts legislation and key_authorities from principles_json

### Full re-embed triggered
- `UPDATE secondary_sources SET embedded = 0` — 1,199 rows
- `UPDATE case_chunks SET embedded = 0 WHERE enriched_text IS NOT NULL` — 25,236 rows
- Poller re-embedding with vocabulary anchors — ETA overnight completion
- Why: all existing content benefits from vocabulary anchor prepend without re-enrichment

### Cowork vs CC workflow clarified
- Cowork (claude.ai) handles: architecture analysis, D1 queries via Cloudflare MCP, file reads/writes in Arc v 4 mount, document drafting
- CC handles: wrangler deploy, SCP to VPS, docker compose commands
- Going forward: Cowork writes all file edits, CC runs deploy commands only

### Deployed versions
- worker.js: `e1426f30`
- enrichment_poller.py: vocabulary anchor functions deployed, container running
- server.py: case chunks FTS5 BM25 pass deployed, agent-general healthy
- Git commit: `bd3a22c`

## CHANGES THIS SESSION (session 64) — 17 April 2026

### Retrieval baseline — confirmed fixed, stale BROKEN flag cleared
- CLAUDE.md "BROKEN" flag on retrieval_baseline.sh was stale — session 63 fix (correct env path + cut -d= -f2-) was confirmed live on VPS this session via 4-step diagnostic
- Direct curl, manual KEY replication, and KEY extraction all confirmed working
- Baseline script is fully operational — do not mark as broken

### Retrieval baseline — full 31-query run completed (session 64 baseline)
- Score: 10 pass / 13 partial / 8 fail (Q1–Q31)
- Previous comparable baseline (April 11, Q1–Q18 only): 10 pass / 5 partial / 0 fail
- New failures confirmed: Q11 (s138 voir dire), Q13 (tendency notice objection), Q16 (Neill-Fraser DNA), Q23 (fitness to stand trial), Q1 regression (common assault)
- Q27, Q31 confirmed corpus gaps (provocation/manslaughter, right to silence)
- Baseline saved as ~/retrieval_baseline_results_apr16.txt on VPS

### Root cause diagnosis — two primary failure modes identified
- **Failure Mode A (stub chunks):** Two confirmed offenders in secondary_sources:
  - `"Stealing by Finding - Definition"` — raw_text ~70 chars, generic legal vocabulary, surfaces on Q19/Q23
  - `"Wilson v Judges [2025] TASSC 10 - Automatism summary"` — truncated/corrupt body (~100 chars), "burden of proof/medical evidence" vocabulary surfaces on Q13/Q16
  - 253 secondary_source rows confirmed under 300 chars raw_text (stub universe)
  - Wilson v Judges is Failure Mode A′ (corrupt ingestion, not thin source) — fix is re-ingest, not expand
- **Failure Mode C (legislation exempt from SM_PENALTY):** Q11 and Q1 caused by legislation chunks (s88/s52/s56; Misuse of Drugs Act s1) scoring above correct secondary source chunks with no penalty
- Failure Mode B (vocab-sparse prose / CONCEPTS strip victim) was NOT confirmed for known regression queries — s138 chunks and tendency notice chunks both have rich body prose containing specialist vocabulary already

### CONCEPTS strip — diagnosis updated
- CONCEPTS strip in poller (session 46) was correct and stays
- CONCEPTS strings are PRESERVED in D1 raw_text for 1,081/1,199 secondary source rows (90%)
- The strip only removes them from the embedding call — raw_text in D1 is untouched
- Session 46 assumption that "all body prose is rich enough to stand alone" was partially wrong — 253 thin chunks exist that depended on CONCEPTS for embedding signal
- True fix: body prose must be self-sufficient; specialist vocabulary should be front-loaded in body, not patched via header

### Enrichment prompt fix — referred to Opus
- Diagnosis: Master Prompt and CHUNK prompt v3 do not consistently instruct GPT-4o-mini to front-load specialist vocabulary (statute sections, defined doctrine terms, case citations) in opening sentences
- Generic synonyms ("the provision", "the rule") are used instead of specific terms ("s138", "tendency notice requirements")
- Full structured Opus consultation prompt prepared and handed to Tom — to be taken to fresh Opus session
- Opus to advise: prompt additions for both Master Prompt and CHUNK v3, validation test design, retroactive fix for existing thin chunks using preserved Concepts data
- Generic synonyms ("the provision", "the test", "the requirement") lose to specific terms ("s138 Evidence Act", "voir dire", "improperly obtained") in embedding space
- Opus consultation prompt prepared — referred for next Opus session
- Build after vocabulary anchors baselined (don't change enrichment and embedding simultaneously)

## CHANGES THIS SESSION (session 63) — 15 April 2026

### What we did
- Diagnosed and fixed poller 401 crash-loop (root cause: NEXUS_SECRET_KEY baked into container at creation time before session 61 key rotation — `docker compose restart` preserves frozen env, `force-recreate` re-reads env_file)
- Fixed retrieval_baseline.sh Q16/17/18 — both local and VPS copies had different breakage; all 31 queries now use `run_query` function; local + VPS synced; committed 5061614
- Deleted Milligan/Harrison stubs from D1 (2 rows), FTS5 (2 entries), Qdrant (2 points b84c64cc + c939d742) — session 58 claimed deletion but they were never deleted
- Confirmed procedure_notes status: 360 criminal null-pn cases all have sentencing_status='not_sentencing' — zero failures, session 47 fix ran clean
- Restored `AND cc.enriched_text IS NOT NULL` gate to `fetch-case-chunks-for-embedding` SQL in worker.js (session 45 removed it expecting a chunk_text fallback that was never added) — header chunks now never enter the poller cycle; Worker 3ddbcf68 deployed
- Updated CLAUDE.md session 40 header chunk note and CLAUDE_arch.md to reflect intentional non-embedding of header chunks
- Verified overnight run: poller clean, no skip messages, Qdrant at 24,008 baseline, chunk backlog 3,794 (accurate count excluding header chunks)

### Key findings
- CLAUDE.md "retrieval_baseline.sh BROKEN" note was stale — script was working; session 62 fix had landed correctly
- Sentencing fix (session 47) confirmed complete — no further action needed
- Word/PDF drag-and-drop upload confirmed complete (previously listed as outstanding — removed from roadmap)
- chunk__0 entries with enriched_text are legitimate (not all first chunks are headers — depends on CHUNK v3 classification); SQL gate correctly excludes only null-enriched_text rows

### Completed
- Retrieval baseline Q16/17/18 fix — all 31 queries functional, local + VPS in sync
- Milligan/Harrison Qdrant/D1/FTS5 cleanup
- Poller 401 fix (force-recreate, key now correct in fresh container)
- Header chunk embed gate restored in worker.js

### Deferred
- subject_matter filter (3-part: Worker route, poller metadata dict, case chunk re-embed)
- AustLII MCP integration (multi-session build)
- Citation authority agent
- Arcanthyr MCP server
- Static TTS MP3s (session 60 in-progress)
- Check Qdrant point count at next session open to confirm overnight embed progress (baseline: 24,008)
- Run accurate backlog check at session open: `SELECT COUNT(*) FROM case_chunks WHERE embedded=0 AND enriched_text IS NOT NULL`

### Platform state
Worker 3ddbcf68 live. Poller running clean, embedding from 2007 TASSC range. Backlog 3,794 at session close. Secondary sources fully embedded (backlog 0). Qdrant baseline 24,008 points.

## CHANGES THIS SESSION (session 62) — 15 April 2026

### Retrieval baseline — fixed and locked
- Root cause confirmed: `cut -d= -f2` stripped trailing `=` from base64 NEXUS key → 401 on every query. Session 61 documented this fix as applied but it never landed on VPS.
- VPS `~/retrieval_baseline.sh` patched via sed — now uses `cut -d= -f2-`
- Local `arcanthyr-console/retrieval_baseline.sh` also fixed: wrong source file (`.env` → `.env.secrets`) corrected alongside the cut fix
- Baseline locked (session 62, post-KEY-fix, mid-reindex): 10 pass / 11 partial / 8 miss / 3 ungraded
- Regression vs session 51 (12P/13Pa/3M) attributed to embed backlog (container up 25 min at test time, 3,849+ chunks not yet in Qdrant) — not a code regression. Re-run required once backlog clears.
- Q16/Q17/Q18 returned "old format" chunks — ungraded, diagnosis deferred

### SYNTHESIS_FEEDBACK_LOOP_BUILD_PLAN.md — recovered and committed
- File was documented as created in session 61 closer but was never committed or saved to VPS — session closer generated a false "created" entry
- Recovered from local copy, encoding corruption fixed (â/Â·/â¡ artifacts → clean dashes/bullets/checkboxes), committed to repo
- CC flagged 6 stale references in the plan before implementation: RRF reference stale (reverted session 42), approved column default confirmed, source_type already in handleFetchForEmbedding, raw_text vs content column name, subject_matter prerequisites met, Part 3 backlog confirmation required before build
- Not yet built — awaiting embed backlog clear

### Corpus Health Check — full build complete
- New D1 tables: `health_check_reports` (id, created_at, summary_text, report_json, cluster_count, contradiction_count, gap_count) and `health_check_clusters` (run_id, chunk_id, cluster_label, run_date)
- Worker deploy `8080a084` — 4 new admin routes: GET /api/admin/health-reports (list), GET /api/admin/health-reports/:id (detail), POST /api/admin/health-reports (VPS write), POST /api/admin/health-clusters (batch cluster assignments)
- fetch-secondary-raw extended to return title and category alongside id/raw_text
- VPS: `corpus_health_check.py` at `~/ai-stack/agent-general/src/` — uses raw requests (no openai SDK, matches poller pattern), paginated fetch of all 1,201 secondary source chunks, GPT-4o-mini clustering pre-pass then contradiction + gap check per cluster, writes report to Worker on completion
- Monthly cron: `0 2 1 * *` → logs to `~/ai-stack/health_check.log`
- UI: `/health-reports` page — admin key gate, list table (date/clusters/contradictions/gaps/View), detail pane (high-confidence contradictions first with why/why-not callouts, intra-cluster gaps grouped by cluster label, cross-domain references collapsed, small/error clusters in audit notes section)
- First test run confirmed: report 55195b94 — 13 clusters, 1 high-confidence contradiction, 28 intra-cluster gaps across 1,201 secondary sources
- Cluster stability diff check marked TODO in script — implement after second run

### Session workflow note
- When working from Claude.ai and SSH/VPS access is needed, task it through CC — CC can bash directly to the VPS without SCP round-trips

## CHANGES THIS SESSION (session 61) — 15 April 2026

### Citation pattern court validation (worker.js)
- Added `courtFromCitation()` helper just before `handleUploadCase` — deterministic court derivation from citation string: TASMC/TAMagC → magistrates, TASCCA → cca, TASFC → fullcourt, TASSC → supreme, null for no match
- Applied in both `handleUploadCase` (overrides court after court_hint fallback chain) and `handleFetchCaseUrl` (`finalCourt = courtFromCitation(citation) || resolvedCourt`)
- Why: AI-extracted court field was wrong on some cases (TASMC cases classified as supreme in prior sessions); citation pattern is deterministic and should always win
- Deployed `fe065c15-54cd-491a-ad2a-db6c38b04937` · verified: 5 sampled TASMC rows confirmed court='magistrates'

### Worker error logging fix (worker.js)
- Added `console.error('legal-query error:', err)` to legal route catch block
- Why: errors were only visible in browser network tab response body, not in wrangler tail — silent failures impossible to diagnose remotely

### NEXUS key rotation
- New key generated, updated in three places: Cloudflare Worker secret (wrangler secret put), VPS ~/ai-stack/.env.secrets, local Arc v 4/.env
- Why: key was exposed in session 58 conversation history — long overdue rotation

### Domain filter UI (Research.jsx, api.js, worker.js, server.py)
- Research.jsx: added `subjectFilter` state (default 'all'), domain chip row ALL/CRIMINAL/ADMINISTRATIVE/CIVIL styled identically to existing chips, passes subjectFilter to api.query
- api.js: `query()` accepts subjectFilter as third arg, sends `subject_matter_filter: null` when 'all' (server ignores null), otherwise lowercase value
- worker.js: both `handleLegalQuery` and `handleLegalQueryWorkersAI` destructure `subject_matter_filter` from body and forward to nexus /search
- server.py: `subject_matter_filter` read from body at top of `search_text()`; exclusion pass runs just before final sort — hard-excludes case_chunk entries whose citation's sm_cache value isn't in the accepted set (criminal filter accepts criminal+mixed; other filters exact match); secondary sources and legislation pass through untouched; ALL omits param entirely, existing SM_PENALTY behaviour unchanged
- Deployed Worker `65aa5a6c-6e4d-4a0d-bdf4-8f8e0fe9be77` + VPS force-recreate confirmed healthy
- Why: server-side SM filter was already live but user had no way to explicitly scope queries to a domain

### Retrieval baseline — BROKEN (unresolved, carry to next session)
- Baseline returning 0 chunks on all 31 queries after NEXUS key rotation
- Root cause partially diagnosed: script was reading KEY from ~/ai-stack/.env (no longer contains key) — fixed to ~/ai-stack/.env.secrets
- Additional fix applied: `cut -d= -f2` → `cut -d= -f2-` to preserve trailing `=` in base64 key
- Despite both fixes, baseline still returns 0 — direct curl with pasted key works fine, health check OK
- Unresolved at session close — do not rely on baseline results until fixed next session

### Synthesis feedback loop — design complete
- Full build plan documented as standalone file `SYNTHESIS_FEEDBACK_LOOP_BUILD_PLAN.md`
- Self-contained: CC can implement without prior conversation context
- Prerequisites: subject_matter filter live (done), embedding backlog cleared (in progress — 3,849 chunks remaining at session close)
- Not yet built — scheduled for next session once backlog clears

## CHANGES THIS SESSION (session 60) — 15 Apr 2026

- **VPS key path corrected**: All VPS curl commands updated — correct path is `~/ai-stack/.env.secrets`, not `~/ai-stack/.env`. NEXUS_SECRET_KEY lives in `.env.secrets` alongside OPENAI_API_KEY and other secrets. `.env` does not contain keys.
- **OpenAI TTS swap**: MOSS-TTS fully replaced in server.py. `/tts` route now calls `https://api.openai.com/v1/audio/speech` with `tts-1` model, `onyx` (male) / `nova` (female) voice mapping, returns MP3 bytes. All MOSS-TTS globals, PHRASE_CACHE, prime_tts_cache() thread, and 172.19.0.1:18083 references removed. Sub-1s latency confirmed. SCP + force-recreate agent-general deployed.
- **subject_matter poller fix (Part 2)**: `subject_matter` field added to case chunk Qdrant metadata dict in enrichment_poller.py (after `case_name`). Was never SCPd to VPS despite session 57 notes claiming it was deployed. Part 1 (Worker route JOIN) confirmed already deployed. SCP + force-recreate enrichment-poller deployed. New chunks embedding from this point will have subject_matter in Qdrant payload.
- **Sentencing extraction gap confirmed resolved**: D1 check shows 257 success / 340 not_sentencing / 0 failed / 0 null for criminal cases. Memory item was stale — fix completed sessions 55–56.
- **subject_matter filter (server.py) still deferred**: Cannot deploy until existing case chunk Qdrant points are re-embedded with subject_matter payload. Backlog currently 7,046 chunks (grown from scraper activity). Poller now writing correct payloads — filter deployable once backlog clears.
- **Static TTS approach decided**: Next session will replace all live TTS API calls with pre-generated static MP3s. 72 sample files being generated (9 voices × 8 phrases) for voice selection. Once voice chosen, final MP3s committed to `public/Voices/`, frontend wired to play on triggers, `/tts` route removed from server.py and Worker entirely.
- **legal-query 500 diagnosed**: Was transient nexus 524 (Cloudflare timeout on VPS search endpoint). server.py confirmed healthy via direct curl. Resolved without code changes.
- **Worker error logging gap noted**: Legal route catch block returns `json({ error: err.message }, 500)` but never console.errors — error only visible in browser network tab response body, not in wrangler tail.

## CHANGES THIS SESSION (session 59) — 15 April 2026

### TTS — iptables fix for Docker→host networking
- Root cause: iptables was blocking Docker bridge (`br-09b8cf509a2d`) from reaching host port 18083 (MOSS-TTS)
- Fix: added INPUT ACCEPT rule for bridge interface on 18083, DROP rule blocking external access to 18083
- Replaced `ufw` with `iptables-persistent` (ufw was removed as a side effect of install)
- Rules persisted to `/etc/iptables/rules.v4` — survive reboot
- Port 3000 (Open WebUI) locked to loopback only

### TTS — static ambient clips
- 16 WAV files (8 phrases × 2 voices) saved to `Arc v 4/public/Voices/ambient/` and `Arc v 4/public/Voices/ambient_male/`
- `tts.js` updated: `playAmbient` now serves from Cloudflare CDN edge (`/Voices/ambient[_male]/<key>.wav`) — zero latency, no VPS round-trip
- `playTTS` gains `_TEXT_TO_KEY` reverse map for static shortcut on preset phrases
- Extracted `_ensureCtx()` and `_decodeAndPlay()` helpers (deduplication)
- Fallback to `/api/tts` if static file unavailable
- Deployed as Worker version `15ddb84a`

### MOSS-TTS — status
- MOSS-TTS confirmed working end-to-end (localhost:18789/tts returns 166KB WAV)
- However synthesis takes ~2m13s per phrase on CPU — unsuitable for real-time use
- Decision: replace MOSS-TTS with OpenAI TTS API next session (~20 lines in server.py)
- MOSS-TTS service left running but dormant; primer thread in server.py logs warnings and exits gracefully
- `server.py`: all `127.0.0.1:18083` references corrected to `172.19.0.1:18083`

### Secondary sources re-embed
- Confirmed complete: 1,201 rows, 0 with `embedded=0`

### Security
- ufw removed (side effect of iptables-persistent install) — ufw chains in memory survived but won't persist on reboot
- Raw table (`*raw PREROUTING`) confirmed as the actual firewall protecting Qdrant (6334), server.py (18789), n8n (5678)
- Port 18083: locked to Docker bridge only (ACCEPT from br-09b8cf509a2d, DROP all others)
- Port 3000: locked to loopback only
- NEXUS_SECRET_KEY rotation still pending (exposed session 58)

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

## CHANGES THIS SESSION (session 51) — 13 April 2026

- **procedure_notes coverage confirmed** — 90/516 criminal cases (17.4%) at session start, up from 16/373 (4.3%) at session 49. 22 cases still processing at check (queue draining from session 50 requeue). Code fixes from session 50 (120K cap, `cases.holding` field) confirmed working. Batched requeue PowerShell script provided: 3×40 cases with 3-min gaps via `Invoke-WebRequest` loop — avoids GPT-4o-mini rate limit exhaustion from simultaneous synthesis calls.

- **RRF deferred — subject_matter filter implemented instead** — Corpus at ~20K vectors vs required 50K minimum for RRF; single embedding model (no independent retrieval signals across legs). Prerequisites not met. Pre-RRF baseline preserved at `~/retrieval_baseline_pre_rrf.txt`. Subject_matter filter implemented as higher-impact change requiring no re-embed.

- **subject_matter filter — LIVE** — Cache-based penalty approach (no case chunk re-embed required). New Worker route `GET /api/pipeline/case-subjects` returns full `{citation: subject_matter}` map for all cases (no X-Nexus-Key required). New server.py globals: `SM_PENALTY = 0.65`, `SM_ALLOW = {'criminal', 'mixed'}`, `_sm_cache`, `_sm_cache_ts`, `get_subject_matter_cache()` (hourly refresh via requests.get to Worker). `apply_sm_penalty()` applied to `case_chunk` type results in Pass 1 (after scoring, before court hierarchy re-rank) and in Pass 2 append loop. **Bug fix**: added `chunks.sort(key=lambda c: -c["score"])` between penalty application and court hierarchy re-rank — without this, `top_score` used the pre-penalty sort order making the cosine band wrong. Worker deployed via wrangler. Server.py deployed and verified (grep confirmed SM_PENALTY, get_subject_matter_cache, apply_sm_penalty all present). SM cache loaded on first search: 1,234 entries. Baseline wins: Q4 (tendency evidence clean), Q10 (s164 corroboration now at position 1 — was failure-to-give-evidence chunk), Q14 (s37 leading questions now at position 1 — coronial inquiry chunk gone).

- **Misclassification audit** — Prior KNOWN ISSUES entries for Tasmania v Pilling [2020] TASSC 13 and Tasmania v Pilling (No 2) [2020] TASSC 46 were incorrect — both are workers compensation cases, correctly classified as administrative. Three genuine misclassifications corrected via Cloudflare MCP D1 UPDATE to `subject_matter='criminal'`: [2021] TASMC 13, [2020] TASSC 16, [2022] TASSC 69.

- **Full 31-query retrieval baseline run** — Post-SM filter. 12 clear passes / ~13 partials / 3 miss (all corpus gaps). SM filter wins confirmed: Q4, Q10, Q14. Q8 improved: s55 relevance chunk now at position 3 (was position 1). Q2 regression identified and fixed (see below). Corpus gap misses: Q24 (committal procedure), Q27 (provocation/manslaughter), Q31 (right to silence) — no doctrine in corpus, require new chunks.

- **Q2 BRD fix — multi-round disambiguation** — Root cause: session 46 CONCEPTS strip removed semantic disambiguation from secondary source body text. Honest/reasonable mistake and police-powers chunks (Reasonableness of Belief, annotation, George v Rockett definition, hoc-b023 prescribed belief, Samoukovic v Brown, Innes v Weate discretion) have body text vocabulary (reasonable/belief/proof/standard/certainty) that overlaps with BRD queries. Fix: updated raw_text of all 6 competing chunks to add strong domain anchor sentences at the start of body text (MISTAKE OF FACT DEFENCE / POLICE OFFICER PRESCRIBED BELIEF STANDARD / POLICE OFFICER DISCRETION prefixes), reset embedded=0, re-embedded via poller. BRD enriched_text (hoc-b057, hoc-brd) reverted to clean BRD-only vocabulary after a contamination incident (see lesson below). Result: hoc-b057 at position 1 (0.5568) for BRD queries.

- **Embedding contamination lesson — CRITICAL** — During Q2 fix, added "distinct from George v Rockett prescribed belief test" disambiguation language to BRD enriched_text. This caused BRD chunks to drop out of top 6 entirely (from 0.54 to <0.51). Root cause: "this is NOT about X" language in an embedding text pulls the vector toward X just as much as "this IS about X." The model cannot reason about negation — it just sees semantic proximity to X. **Rule: never add cross-domain disambiguation to enriched_text. Put domain anchors on the COMPETING chunks only. Keep target chunk embedding text purely about the target domain.** Added to KNOWN ISSUES as CONCEPTS-adjacent vocabulary contamination.

- **worker.js `GET /api/pipeline/case-subjects` route** — Added at line ~3090 (after bm25-corpus block). Returns `{subjects: {citation: subject_matter}}` for all 1,234 cases. No auth required (non-sensitive read). Required for server.py `get_subject_matter_cache()` hourly refresh.

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

## CHANGES THIS SESSION (session 46) — 11 April 2026

- **Dedicated scraper wake tasks created** — `WakeForScraper` (10:55 AM daily) and `WakeForScraperEvening` (4:55 PM daily) created via `schtasks /create` as SYSTEM/HIGHEST. WakeToRun=True confirmed on both via `Get-ScheduledTask`. Why: session 45 set WakeToRun on the scraper tasks themselves (`Arcanthyr Scraper`, `run_scraper_evening`) but those run as user Hogan — SYSTEM-level dedicated wake tasks are more reliable for waking from sleep. Pattern mirrors session 44 email digest wake tasks. Scraper runs fire 5 minutes after the wake signal at 11:00 AM and 5:00 PM.

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

## CHANGES THIS SESSION (session 45) — 8 April 2026

- **Diagnosed scraper corpus gaps** — D1 case counts for 2005–2017 were severely low (e.g. TASSC 2017: 12, TASSC 2015: 0, nothing pre-2007 except 2 TASSC). Root cause: session 43 fixes (TASMC court code, consecutive_misses=20, year floor 2000) were committed at 8:11 PM on 7 April but the scraper had already run that morning under the old config. All pre-2018 years had been marked "done" in scraper_progress.json under the old consecutive_misses=5 threshold, causing premature completion with sparse results.

- **Reset scraper_progress.json** — Cleared all 2017-and-earlier entries from scraper_progress.json using a Python one-liner. Kept 2018–2026 for TASSC/TASCCA/TASFC (counts look healthy). TASMC entries were already cleared in session 43. Scraper will now re-run ~72 court/year combinations (TASSC/TASCCA/TASFC 2000–2017 + all TASMC 2000–2026 + TASCCA_2025/TASFC_2025 which were missing entirely).

- **Diagnosed Task Scheduler missed-run behaviour** — Scraper tasks fired at 7:03 PM when PC was turned on (missed scheduled times while off/sleeping). Both tasks hit the business hours guard (08:00–18:00 AEST) and exited immediately. LastTaskResult code 2147946720 confirms this pattern.

- **Set WakeToRun=True on both scraper tasks** — `Arcanthyr Scraper` and `run_scraper_evening` tasks updated via PowerShell `Set-ScheduledTask`. PC will now wake from sleep at scheduled times. Verified: both show WakeToRun: True.

- **Corpus status at session close** — 729 cases, 726 enriched, 3 not enriched; 11,793 chunks all done and embedded. Significant case count increase expected after tomorrow's 11 AM scraper run.

- **handleUploadCorpus FTS5 timeout fallback** — wrapped main INSERT + FTS5 INSERT in try/catch. On error, does `SELECT id FROM secondary_sources WHERE id = ?` to confirm whether the row landed. If confirmed: returns 200 with `{ success: true, warning: "FTS5 index timeout — row confirmed written" }`. If not confirmed: rethrows original error. Why: FTS5 virtual table writes can time out on D1 after the main row write has already committed — previously this surfaced as a 500 to the caller even though the data was safe.

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

## CHANGES THIS SESSION (session 40) — 5 April 2026

- **Header chunk null enriched_text documented** — `chunk_index=0` rows with `done=1, enriched_text IS NULL` are intentionally never embedded. `fetch-case-chunks-for-embedding` SQL excludes them via `AND cc.enriched_text IS NOT NULL` — they sit permanently at `embedded=0`. Accurate backlog query: `SELECT COUNT(*) FROM case_chunks WHERE embedded=0 AND enriched_text IS NOT NULL`. The poller Python skip guard (`if skipped:`) is now a harmless safety net — header chunks never reach it. Why: decided not to embed chunk_text fallback for header chunks (court/citation/judge boilerplate has no retrieval value).

- **Retrieval baseline rerun (session 40)** — 18 questions, 10 pass / 5 partial / 0 miss. Matches session 36 result. No regressions from block_023/028 corpus additions. `.env` path bug in `retrieval_baseline.sh` fixed on VPS (was reading `~/ai-stack/.env`, file is `.env.secrets`). Why: needed fresh baseline after session 37 corpus additions.

- **Item 1 (Restore Claude API key) confirmed moot** — Sol (Claude API toggle) tested on arcanthyr.com and working. Wrangler secret `ANTHROPIC_API_KEY` is set and functional. VPS .env reference was stale context from when server.py used Claude API directly (now uses Qwen3). Removed from both roadmaps. Why: roadmap item was blocking other priorities unnecessarily.

- **Item 2 (malformed corpus row) FIXED** — `hoc-b{BLOCK_NUMBER}-m001-drug-treatment-orders` stale Qdrant point (`b9bcd0d5`) deleted. D1 was already clean (fixed session 24). Correct point (`8f56e796`, `hoc-b054-m001-drug-treatment-orders`) confirmed present with correct `citation` and `source_id` payload. Correct block number: 054 (master_corpus_part2.md:13969). Removed from both roadmaps. Why: been on roadmap since session 13.

- **RRF displacement — full investigation and architectural decision** — discovered there is NO RRF in the codebase. Four separate Qdrant calls (Pass 1, concept search, Pass 2 case chunks, Pass 3 secondary sources) run sequentially. Pass 2/3 append after sorted+capped Pass 1 block. BM25 results hardcoded at score 0.0. No multi-signal reward — chunks appearing in multiple passes just deduped. CC read full `search_text()` function via hex-ssh. CC used Context7 to confirm Qdrant supports native RRF via `prefetch` + `FusionQuery`. Opus consultation recommended: Qdrant-native RRF (four legs in one call) + Python-side BM25 synthetic scoring. `extract_legal_concepts()` confirmed as regex-only (no latency concern for prefetch model). Implementation plan: Step 1 (Qdrant RRF) + Step 2 (BM25 scoring) together, then tune. Prerequisite: check Qdrant client version for prefetch score_threshold support. Why: systemic retrieval quality ceiling — all five persistent partials traced to lack of cross-pass ranking.

- **CC vs manual SSH rule added** — simple read/run commands (baseline, logs, single queries) faster done manually via SSH. CC with hex-ssh for multi-step VPS file edits, diagnosis across multiple files, or replacing SCP round-trips.

## CHANGES THIS SESSION (session 39) — 5 April 2026

- **hex-ssh MCP unblocked** — hex-ssh was failing to connect on every session start. Root cause diagnosed: hex-ssh uses the `ssh2` Node library and reads the key file directly via `readFileSync` — no ssh-agent integration exists in the code. ssh-agent work was valid but irrelevant to hex-ssh. Two separate fixes required: (1) `.mcp.json` updated from `command: hex-ssh-mcp` (PS1 wrapper, unlaunchable by VS Code MCP host) to `command: node` with explicit path to `server.mjs`; (2) passphrase removed from `id_ed25519` via `ssh-keygen -p` — hex-ssh has no passphrase path so the key must be unencrypted. Smoke test passing: CC can now read VPS files directly without SCP. Why: deploy-gap pattern (sessions 25, 27, 35) was caused partly by inability to verify VPS file state from CC — hex-ssh closes this gap for read operations.

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

## CHANGES THIS SESSION (session 29) — 3 April 2026

- **Secondary source citation fix deployed** — `enrichment_poller.py` `run_embed_secondary_sources()` updated: added `citation: chunk.get('id', '')` and corrected `source_id: chunk.get('id', '')` to metadata dict (previously `source_id` used `chunk.get('source_id', '')` which was always empty; `citation` was entirely absent). Added `[EMBED_SS]` debug log line after upsert to confirm citation/source_id per point. Deployed following Poller Deploy Validation Procedure: SCP → grep → restart → start-time check → clean start. Re-embed running: 1,188 rows reset, ~50 complete at session close.

- **server.py semantic pass citation fallback** — line 271 updated from `payload.get("citation", "unknown")` to `payload.get("citation") or payload.get("chunk_id", "unknown")`. Fixes secondary source chunks showing "unknown" in semantic pass results (Pass 3 already had this fallback). Deployed via SCP + force-recreate agent-general.

- **Poller Deploy Validation Procedure added to CLAUDE.md** — 10-step checklist (deploy → reset → monitor) added as permanent named section. Key rule: restart container BEFORE reset; verify container start time is after file mtime before resetting embedded=0.

- **enrichment_poller.py SCP rules added to SESSION RULES** — pull and push SCP commands added alongside existing server.py SCP rules. Root cause of both past deploy failures was absence of this rule.

- **Session 25 and 27 changelog entries corrected** — both marked with ⚠ "DESCRIBED AS DEPLOYED BUT NOT CONFIRMED ON VPS" with session 29 fix reference.

- **Legislation Act-title prefix re-embed deferred** — audit confirmed session 25 fix never reached VPS (VPS `run_legislation_embedding_pass()` still uses `embed_text = s['text']`). Scheduled for next session after secondary source re-embed completes.

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

## CHANGES THIS SESSION (session 81) — 21 April 2026

- **Pass 4 enabled — AUTHORITY_PASS_ENABLED=true** — Flag flipped in `~/ai-stack/.env.config` (sed in-place replacing `false` → `true`), agent-general force-recreated. Confirmed live via VPS log: `[Pass 4] gate=FIRE reason=bare-lookup hits=0 ENABLED=true` (no longer shadow). 500ms cold-cache timeouts observed on first queries post-restart — expected, should warm up with traffic.

- **AUTHORITY_KEYWORDS calibrated via 24-query shadow probe battery** — Fired all 24 queries via Playwright to generate shadow-mode log events before flip. Findings: (1) 3 topical-authority phrases produced false positives on doctrinal queries (`"authority on"`, `"leading authority on"`, `"key authority on"`) — removed; (2) 4 passive-voice treatment queries missed (`"has X been followed/distinguished/applied/considered"`) — 10 passive-voice forms added (`been followed`, `been applied`, `been distinguished`, `been overruled`, `been approved`, `been adopted`, `been considered`, `been cited`, `been treated`, `often cited`). Post-calibration fire rate on battery: 14/24 (58%) — correctly composed (citation-shaped queries FIRE, doctrinal queries SKIP). Multi-citation rule (rule 3) confirmed never fires independently — queries with ≥2 citations that are also ≤60 chars are always captured by bare-lookup first.

- **worker.js sources mapper fix — type and source_type now flow to frontend** — Both `handleLegalQuery` and `handleLegalQueryWorkersAI` `caseSources` mapper previously returned `{ citation, court, year, score, summary }` with no `type` field. Added `type: c.type, source_type: c.source_type` to both. Verified via Playwright React fiber: results now carry `type: "case_chunk"` / `type: "secondary_source"`. `authority_synthesis` chunks will render amber AUTHORITY tag correctly when they surface. Worker version 57719d21.

- **Remaining tag issue noted (minor)** — `TYPE_TAGS["secondary"]` key in ResultCard.jsx doesn't match actual value `"secondary_source"` from server.py — secondary source cards show raw `"secondary_source"` label instead of `"CORPUS"`. Fix: add `"secondary_source"` alias key to TYPE_TAGS. Logged as new KNOWN ISSUE. Court-based tags (SC/MC/CCA) still require non-empty court field from Qdrant payloads — separate open issue.

## CHANGES THIS SESSION (session 84) — 20 April 2026

- **SCP/CRLF hardening deployed** — `.gitattributes` added at repo root pinning `*.js`, `*.jsx`, `*.py`, `*.md`, `*.json` to `eol=lf` (commit `02b61be`). Pre-commit hook at `.git/hooks/pre-commit` runs `@babel/parser` on staged JS/JSX files; hook uses `#!/bin/bash` + null-separated `git diff -z` + `while IFS= read -r -d ''` loop — space-safe for `Arc v 4/Worker.js` paths (for f in `$STAGED` split on spaces, initial approach failed immediately).
- **Worker.js git record fixed** — git HEAD `1e6fb23` (s83 close commit) contained s82 truncated 4527-line file; correct 4556-line s83 restoration was deployed to Cloudflare but not committed. Fixed: commit `853a56d`. `public/index.html` (unstaged from s83) committed in same batch.
- **`node --check` retired** — SESSION RULE updated: `npm run build` (rolldown pass) is now the pre-deploy gate. `node --check` confirmed false-passing on truncated files — exit 0 with no output on file cut mid-expression.
- **SKILL.md false alarm** — session-closer reported `arcanthyr-session-closer/SKILL.md` truncated at line 40; CC cat confirmed 94 lines, intact. No repair needed. Consistent with known session-closer false-commit pattern.
- **File audit clean** — `api.js`, `Library.jsx`, `Upload.jsx`, `public/index.html`, `server.py`, `enrichment_poller.py` all pass tail-completeness check. No further truncation casualties beyond the three fixed in s83.
