# CLAUDE_arch.md — Arcanthyr Architecture Reference
*Updated: 15 April 2026 (end of session 62). Upload every session alongside CLAUDE.md.*

---

## ARCHITECTURE OVERVIEW

**Stack:** Cloudflare Worker (`arcanthyr-api`) + D1 (`arcanthyr`) + Qdrant (`general-docs-v2`) + Ollama/pplx-embed (Docker) + nexus `server.py` (Docker `agent-general`)

| Component | Detail |
|---|---|
| VPS | Contabo · `31.220.86.192` · Ubuntu 24.04 · 23GB RAM · 6 vCPU |
| Live site | `arcanthyr.com` (Cloudflare Worker custom domain) |
| GitHub | `https://github.com/Arcanthyr/arcanthyr-console` |
| Git root | `arcanthyr-console/` (monorepo since session 35) · `Arc v 4/`, `arcanthyr-ui/`, `Local Scraper/`, and root scripts all tracked here · git commands run from `arcanthyr-console/` · wrangler/npx commands still run from `Arc v 4/` |
| Cloudflare plan | Workers Paid ($5/month) · Account ID: `def9cef091857f82b7e096def3faaa25` |

**D1 vs Qdrant:**
- D1 = source of truth / relational. Text and metadata live here permanently.
- Qdrant = semantic search index. Vectors + chunk_id payload pointing back to D1. Rebuilt from D1 if needed.
- Library delete wipes Qdrant chunks but NOT D1 rows.
- Full reset: `wrangler d1 execute DELETE` on relevant table + Qdrant collection delete + recreate.

---

## MCP SERVERS & TOOLS

### Claude.ai (available to Claude in every session)

| Tool category | Tools |
|---|---|
| Web | `web_search`, `web_fetch`, `image_search` |
| Files (container) | `bash_tool` (network disabled), `view`, `str_replace`, `create_file`, `present_files` |
| Memory & history | `memory_user_edits`, `conversation_search`, `recent_chats` |
| Visualisation | `visualize:show_widget`, `visualize:read_me` |
| Utilities | `ask_user_input_v0`, `message_compose_v1`, `recipe_display_v0`, `weather_fetch`, `fetch_sports_data`, `places_search`, `places_map_display_v0`, `tool_search` |

**MCP — Claude in Chrome** (browser automation on Tom's machine):
`navigate`, `read_page`, `find`, `form_input`, `javascript_tool`, `get_page_text`, `read_console_messages`, `read_network_requests`, `computer` (mouse/keyboard/screenshot), `tabs_create/close/context`, `shortcuts_list/execute`, `file_upload`, `upload_image`, `resize_window`, `switch_browser`, `gif_creator`
→ Use for: testing arcanthyr.com UI, inspecting network requests, reading browser console errors

**MCP — Cloudflare Developer Platform** (claude.ai connector):
`accounts_list`, `set_active_account`, `d1_database_create/delete/get/query`, `d1_databases_list`, `workers_list`, `workers_get_worker`, `workers_get_worker_code`, `kv_namespace_create/delete/get/update`, `kv_namespaces_list`, `r2_bucket_create/delete/get`, `r2_buckets_list`, `hyperdrive_config_*`, `search_cloudflare_documentation`, `migrate_pages_to_workers_guide`
→ Use for: querying live D1 without wrangler, checking deployed worker versions, reading live worker.js code

**MCP — Gmail / Google Calendar** (claude.ai connector — OAuth not yet completed, auth-only)

**KV Namespace — EMAIL_DIGEST** (ID: 9ea5773d11ac40ce9904ca21c602e9f4):
Used by email/contact management features (Resend email composer, contact list) and `runDailySync` email summary. Bound in `wrangler.toml`.

---

### Claude Code (CC — available in every CC session)

**Built-in:** `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `LS`, `WebFetch`, `TodoWrite`, `Task`, `NotebookRead/Edit`

**MCP — cloudflare** (mcp.cloudflare.com):
`mcp__cloudflare__execute`, `mcp__cloudflare__search`

**MCP — Cloudflare Developer Platform** (claude.ai connector — same as Claude.ai above):
Full D1/Workers/KV/R2 access

**MCP — context7**:
`resolve-library-id`, `query-docs`
→ Use for: looking up current Cloudflare Workers API docs and other library documentation

**MCP — fetch**:
`mcp__fetch__fetch`
→ Use for: fetching URLs directly from CC

**MCP — firecrawl**:
`firecrawl_scrape`, `firecrawl_crawl`, `firecrawl_check_crawl_status`, `firecrawl_search`, `firecrawl_extract`, `firecrawl_map`, `firecrawl_agent`, `firecrawl_agent_status`, `firecrawl_browser_create/delete/execute/list`
→ Use for: JS-rendered web scraping (potential AustLII alternative to Python scraper)

**MCP — github**:
`get_file_contents`, `create_or_update_file`, `push_files`, `search_code`, `search_repositories`, `search_issues/users`, `get/list/create/update_issue`, `add_issue_comment`, `get/list/create_pull_request`, `get_pull_request_comments/files/reviews/status`, `create_pull_request_review`, `update_pull_request_branch`, `merge_pull_request`, `list_commits`, `create_branch`, `fork_repository`, `create_repository`
→ Use for: reading/writing files on GitHub directly, creating issues and PRs — alternative to git CLI

**MCP — hex-ssh**:
`ssh-read-lines`, `ssh-write-chunk`, `ssh-edit-block`, `ssh-search-code`, `ssh-verify`, `ssh-upload`, `ssh-download`, `remote-ssh`
→ Use for: reading and editing server.py and other VPS files directly without SCP; replaces manual SCP workflow for server.py edits

**MCP — magic (21st.dev)**:
`21st_magic_component_builder`, `21st_magic_component_refiner`, `21st_magic_component_inspiration`, `logo_search`
→ Use for: UI component generation for arcanthyr-ui frontend work

**MCP — playwright**:
`browser_navigate`, `browser_navigate_back`, `browser_snapshot`, `browser_take_screenshot`, `browser_click`, `browser_type`, `browser_fill_form`, `browser_select_option`, `browser_hover`, `browser_drag`, `browser_press_key`, `browser_wait_for`, `browser_evaluate`, `browser_run_code`, `browser_file_upload`, `browser_handle_dialog`, `browser_console_messages`, `browser_network_requests`, `browser_tabs`, `browser_resize`, `browser_close`
→ Use for: automated browser testing of arcanthyr.com from CC (headless)

**MCP — sequential-thinking**:
`sequentialthinking`
→ Use for: complex multi-step reasoning tasks where structured chain-of-thought helps
→ Installed globally as `mcp-server-sequential-thinking` (v2025.12.18) — config updated from npx to direct binary (session 49). Restart CC after any reinstall.

**MCP tools vs auto-activating skills — key distinction:**
- **MCP tools** (hex-ssh, sequential-thinking, playwright, context7, fetch, firecrawl, github, magic, cloudflare) — require **explicit invocation** by CC. They do not trigger automatically under any condition.
- **Superpowers skills** (systematic-debugging, verification-before-completion, test-driven-development) — **auto-activate** on matching conditions (bug/failure reported; about to claim work complete; implementing a feature/bugfix). No invocation needed.
- **code-simplifier** — built-in Claude Code plugin (tengu_amber_lattice plugin system), already enabled in `~/.claude.json`. Not a separate MCP server. The `/simplify` skill covers the same purpose explicitly.

**MCP — Gmail / Google Calendar** (claude.ai connector — OAuth not yet completed, auth-only)

**Skills — ~/.claude/skills/ (installed session 40)**

*Pre-existing (session 38):*
- `alirezarezvani-claude-skills` — 220+ skills: senior-architect, dependency-auditor, RAG architect, security auditor
- `jezweb-claude-skills` — Cloudflare Workers, Vite+React, D1/Drizzle, Hono, shadcn, Tailwind v4
- `vercel-agent-skills` — Web design guidelines (WCAG/UX audit) + React best practices

*Superpowers (obra/superpowers — installed session 40):*
- `systematic-debugging` — Auto-activates on bugs/failures; four-phase root-cause process before fixes
- `verification-before-completion` — Auto-activates before claiming work done; enforces evidence-over-claims
- `test-driven-development` — Auto-activates on feature/bugfix implementation; red-green-refactor
- `subagent-driven-development` — Parallel subagents per task with review checkpoints between iterations

*Antigravity (sickn33/antigravity-awesome-skills — installed session 40):*
- `rag-engineer` — RAG systems: chunking, embeddings, hybrid search patterns
- `vector-database-engineer` — Qdrant/pgvector index config, HNSW/IVF/PQ, hybrid search
- `embedding-strategies` — Embedding model selection, chunking optimisation, domain fine-tuning
- `python-pro` — Python 3.12+, uv, ruff, pydantic, async patterns
- `async-python-patterns` — asyncio, aiohttp, concurrent I/O, WebSocket, background tasks
- `docker-expert` — Multi-stage builds, container security hardening, compose patterns
- `prompt-engineering` — Few-shot, chain-of-thought, structured outputs, agent behaviour
- `context-window-management` — Token budgeting, context summarisation, serial position effects
- `bash-linux` — Bash/Linux scripting patterns

---

### VPS Environment Files

`.env.secrets` — MANUAL ONLY, never read via CC or hex-ssh:
- Contains: `RESEND_API_KEY`, `CLAUDE_API_KEY`, `NEXUS_SECRET_KEY`, `OPENAI_API_KEY`, `Nexus_arc_bridge_key`, `GITHUB_TOKEN`
- Location: `~/ai-stack/.env.secrets`
- chmod 600 — only readable by tom

`.env.config` — CC-safe, no secrets:
- Contains: non-sensitive config vars only (currently just a comment header — empty)
- Location: `~/ai-stack/.env.config`
- CC may freely read and edit this file

`docker-compose.yml` references both files via `env_file: [.env.secrets, .env.config]`

**agent-general port** — hardcoded `127.0.0.1:18789->18789/tcp` in docker-compose.yml since session 45 · previously used `${AGENT_GENERAL_PORT}` variable which was never read at compose parse time (only `.env` is read for port interpolation, not `env_file:`) · do not revert to variable form

`.env.backup` — original combined `.env`, retained as backup at `~/ai-stack/.env.backup`

**`~/ai-stack/.env` (session 46):** Created with pinned port vars — `QDRANT_GENERAL_PORT=6334`, `QDRANT_SENSITIVE_PORT=6335`, `OLLAMA_PORT=11434`, `AGENT_SENSITIVE_PORT=18791`. Previously missing, causing docker compose to assign ephemeral host ports on each `compose up`. Qdrant now reliably reachable from VPS host at `localhost:6334`. Ollama has no host port binding — use `docker exec agent-general` for any host-side embedding calls (e.g. `docker exec agent-general python3 -c "..."`).

When CC needs a secret value (e.g. for a health check), use remote-ssh to grep the specific key only:
`grep NEXUS_SECRET_KEY ~/ai-stack/.env.secrets | cut -d= -f2`
Never ask CC to read the full `.env.secrets` file.

---

## DOCKER INTERNAL HOSTNAMES — CRITICAL

**`localhost` inside a Docker container refers to that container, not the VPS host. All inter-container calls must use Docker service names.**

| Service | Host-side | Inside Docker container |
|---|---|---|
| Qdrant general | `http://localhost:6334` | `http://qdrant-general:6333` |
| Ollama | not accessible from host | `http://ollama:11434` |
| agent-general nexus | `http://localhost:18789` | `http://agent-general:18789` |

**Nexus health check port is 18789** — always curl `http://localhost:18789/health` after restart.

**enrichment-poller is a permanent Docker service (added session 5):**
The poller runs as a dedicated container with `restart: unless-stopped`. No tmux required.

Start/restart:
```bash
cd ~/ai-stack
docker compose up -d enrichment-poller
```

Check logs:
```bash
docker compose logs --tail=50 enrichment-poller
```

The service uses the same image as agent-general, same volume mount (`./agent-general/src:/app/src`), and reads `OLLAMA_URL` + `QDRANT_URL` from environment. Changes to enrichment_poller.py take effect immediately — no rebuild needed.

Do NOT run the poller manually via `docker compose exec` anymore — the service handles it.

**agent-general container env vars (docker-compose.yml):** `NEXUS_SECRET_KEY`, `WORKER_URL` (= `https://arcanthyr.com`), `OPENAI_API_KEY` (required for `/process-document` GPT calls), `OLLAMA_URL`, `QDRANT_URL`. If `OPENAI_API_KEY` is missing, `/process-document` jobs will fail at the enriching step.

**Never test API routes via SSH from PowerShell** — SSH quoting mangles auth headers. SSH to VPS first, then run curl locally.

---

## DATA FLOW PIPELINE (v2 — CURRENT)

```
Console upload → Worker → D1 (raw_text stored, enriched=1, embedded=0)
                       → NO nexus call (fire-and-forget removed in v9)
                       → upload-corpus and format-and-upload set enriched=1 on INSERT (session 26)

VPS enrichment_poller.py (permanent Docker service, --loop):
  [EMBED] pass   → enriched=1, embedded=0 rows → pplx-embed → Qdrant → embedded=1
  [CASE-EMBED]   → case_chunks done=1, embedded=0 → pplx-embed → Qdrant → embedded=1
  [LEG]          → legislation embedded=0 → pplx-embed → Qdrant → embedded=1
  [ENRICH]       → unenriched secondary_sources → GPT-4o-mini (OpenAI API) → enriched_text → enriched=1
```

**Secondary sources enriched=1 on insert (session 26):** Console upload routes (`handleUploadCorpus`, `handleFormatAndUpload`) both set `enriched=1` on INSERT — no manual `wrangler d1` step needed after any console upload. Poller embed pass picks up `enriched=1, embedded=0` rows. If using a custom ingest path outside the Worker routes, verify enriched=1 is set manually before the poller runs.

**Enrichment model by content type:**

| Content | Enrichment model | Notes |
|---|---|---|
| Scraped cases (bulk) | Workers AI / Qwen3-30b — in Worker at ingest time | Free, automated, NOT via VPS poller |
| Manual case uploads | Workers AI — same Worker path | NOT via VPS poller |
| Secondary sources corpus | None — raw_text IS the content | embed raw_text directly, enriched_text stays NULL |
| Legislation | None — raw statutory text embedded directly | |
| Future secondary source uploads (small volume) | GPT-4o-mini-2024-07-18 via OpenAI API (OPENAI_API_KEY in VPS .env) | switched from Claude API session 13 — Claude API key unavailable |

**Secondary sources corpus (session 12):** 1,171 rows · all enriched=1 · embedded=0 (poller embedding overnight). `enriched_text` is NULL — correct, poller falls back to `raw_text`. Do NOT run `--mode enrich` on these rows.

---

## RETRIEVAL ARCHITECTURE (v5 — SESSION 8, confirmed against live code)

CRITICAL: Session 3 RRF/BM25/FTS5 work was documented as complete but was
never deployed. Neither worker.js nor server.py contain RRF, in-memory BM25,
or FTS5 blend logic. The /api/pipeline/bm25-corpus and /api/pipeline/fts-search
Worker routes exist but are dead — nothing calls them during query handling.

**Actual pipeline — Worker.js handleLegalQuery:**
- Calls server.py /search
- Takes nexusData.chunks verbatim — no reordering, no blending
- Assembles context and passes to Claude API (primary) / Workers AI Qwen3 (fallback)
- handleLegalQueryWorkersAI only: citation detection → case_chunk sort to front + cap 2 secondary sources + [CASE EXCERPT]/[ANNOTATION] labels

**Actual pipeline — server.py search_text():**

### Retrieval Pipeline (Sequential Pass — session 42, reverted from RRF)

1. **Pass 1 — unfiltered semantic** — `client.query_points()`, threshold 0.45, limit top_k*2. Short legislation filter (type=legislation + len<200 removed). **SM penalty:** `apply_sm_penalty()` applied to all results — non-criminal/non-mixed `case_chunk` types multiplied by `SM_PENALTY=0.65`. Re-sort by penalised scores (required before court hierarchy band to get correct `top_score`). Court hierarchy re-rank within 0.05 cosine band: HCA(4) > CCA/FullCourt(3) > Supreme(2) > Magistrates(1). Cap to top_k. `seen_ids` set built from Pass 1 results.
2. **Pass 2 — case chunks appended** — `type=case_chunk` filter, threshold 0.35, limit 8. `apply_sm_penalty()` applied to each hit before dedup check. Deduped against `seen_ids`. Appended after Pass 1 — cannot displace Pass 1 results.
3. **Pass 3 — secondary sources appended** — `type=secondary_source` filter, threshold 0.25, limit 8. Deduped against `seen_ids`. Appended after Pass 2.
4. **BM25/FTS5 append** — section refs → BM25_SCORE_EXACT_SECTION (~0.0159), case-by-ref → BM25_SCORE_CASE_REF (~0.0147). Multi-signal boost if chunk already in results. Final top_k cap (no re-sort — BM25 stays last).
5. **LLM synthesis** — top chunks to Claude API (Sol) or Qwen3 Workers AI (V'ger)

**Why RRF was reverted (session 42):** RRF requires independent retrieval signals across legs. Leg B (extract_legal_concepts) used the same embedding model on a munged version of the same query — no independent signal. At ~10K vectors, same chunks dominated all legs, causing wrong-domain chunks to accumulate multi-leg RRF score via surface vocabulary overlap (e.g. self-defence "reasonable belief" scoring high on BRD query). Baseline regression: 10/5/0 → ~8/2/4.

**Key implementation notes:**
- `env_file:` in docker-compose.yml supplies secrets to agent-general — do not re-add secret vars to `environment:` block
- Force-recreate requires `AGENT_GENERAL_PORT=18789` prefix if running outside sourced shell (now in .env.config, should be automatic)

### RRF retry conditions (Opus session 42)

Do not retry RRF until all four conditions are met:
1. **Corpus >50K vectors** — diversity across legs requires enough vectors that different legs surface genuinely different candidates
2. **Independent retrieval signals** — Leg B needs a truly different signal: different embedding model, learned sparse encoder (SPLADE), or native BM25 as a prefetch leg
3. **Per-leg diagnostics** — log each leg's top-3 independently before fusing so noise injection is visible
4. **Comprehensive doctrine chunk coverage** — corpus gaps cause RRF to amplify wrong-domain chunks that happen to match query vocabulary

### subject_matter filter — design for session 43

**Problem:** Pass 1 is unfiltered — non-criminal case chunks (coronial, civil, administrative) can outscore criminal doctrine chunks on queries where witness/examination vocabulary appears in both domains. Corpus is 320 criminal / 393 non-criminal and scraper will worsen this ratio.

**Confirmed misclassifications (audit required before any filter):**
- Tasmania v Rattigan [2021] TASSC 28 — tagged administrative, is criminal
- Tasmania v Pilling [2020] TASSC 13 — tagged administrative, is criminal
- Tasmania v Pilling (No 2) [2020] TASSC 46 — tagged administrative, is criminal

Full audit query:
```sql
SELECT citation, case_name, subject_matter FROM cases
WHERE subject_matter != 'criminal'
AND (case_name LIKE 'R v%' OR case_name LIKE 'Tasmania v%' OR case_name LIKE 'Police v%')
```

**DEPLOYED session 51 — Cache-based penalty (Option C):**
- Hourly in-memory cache loaded from `GET /api/pipeline/case-subjects` Worker route
- `SM_PENALTY = 0.65`, `SM_ALLOW = {'criminal', 'mixed'}` globals in server.py
- `get_subject_matter_cache()` — loads cache, refreshes if >3600s stale or empty
- `apply_sm_penalty(chunk)` — if `type=case_chunk` and citation's SM not in SM_ALLOW, multiply score by 0.65
- Applied in Pass 1 (after scoring, before court hierarchy re-rank) AND in Pass 2 append loop
- **Critical**: re-sort by penalised scores BEFORE computing `top_score` for court hierarchy band
- Misclassification audit: Pilling cases correctly administrative (workers comp); 3 genuine misclassifications corrected ([2021] TASMC 13, [2020] TASSC 16, [2022] TASSC 69); Tasmania v Rattigan status unverified

**Option A — Qdrant payload re-embed (deferred):**
- Would enable native Qdrant filter on `subject_matter` field in Pass 1 query
- Requires: JOIN cases in `fetch-case-chunks-for-embedding` route, add `subject_matter` to poller metadata dict, reset all case chunks embedded=0, full re-embed
- Lower priority now that cache penalty is delivering results (Q4, Q10, Q14 fixed)
- Prerequisite: complete misclassification audit before re-embed

**Real systemic fix:** get `subject_matter` into Qdrant payload (requires re-embed) so Pass 1 can filter at Qdrant level without cache. Option A's re-embed is a prerequisite for this.

**Diagnostic rule:** empty or unexpected results → first check:
`docker compose logs --tail=50 agent-general`
Skip/error messages are logged per-pass and visible immediately.

---

## CORPUS PIPELINE — SECONDARY SOURCES (v3, session 12)

**Session 13 corpus state:**
- Part 1: 488 chunks · Part 2: 683 chunks · BRD manual chunk: 1 · Total: 1,172 chunks
- All enriched=1 · all embedded=1 · FTS5 backfilled (1,171 rows — BRD chunk also in FTS5)
- Next sequential block number for `ingest_corpus.py` bulk runs: hoc-b057 (hoc-b056 is highest corpus block)
- Console uploads via `format-and-upload` use timestamp-derived block numbers (`hoc-b{4-digit-timestamp}`) — sequential counter only applies to bulk `ingest_corpus.py` runs
- Malformed row hoc-b{BLOCK_NUMBER}-m001-drug-treatment-orders — FIXED session 24 (corrected to hoc-b054)
- Corpus uses preservation-focused Master prompt + Repair pass from process_blocks.py

**format-and-upload — primary console upload route (session 26):**
`POST /api/legal/format-and-upload` · auth: User-Agent spoof (`Mozilla/5.0 (compatible; Arcanthyr/1.0)`) · sets `enriched=1` on INSERT automatically · handled by `handleFormatAndUpload`

Four processing paths:
1. **Pre-formatted blocks** — text starts with `<!-- block_` → `parseFormattedChunks()` called directly, no GPT call
2. **Raw text >800 words** — calls GPT-4o-mini-2024-07-18 with Master Prompt
3. **Raw text <800 words** — calls GPT with Master Prompt + short-source note appended (demands separate chunks per doctrinal unit, strict CASE AUTHORITY CHUNK RULE)
4. **Single-chunk mode** — `body.mode='single'` bypasses GPT entirely; wraps text in `<!-- block_0001 master -->` header using provided `title`, `slug`, `category`; calls `parseFormattedChunks()` and inserts as one chunk

**Word/PDF drag-drop pipeline (session 32 — confirmed working):**
Upload.jsx accepts `.pdf`, `.docx`, `.txt` on Secondary Sources tab → reads as base64 DataURL → `api.processDocument({ file_b64, filename })` → Worker proxy `POST /api/ingest/process-document` → server.py `process_document()` → background thread: extract text → split blocks → GPT-4o-mini format → `post_chunk_to_worker` → Worker `POST /api/legal/upload-corpus` → D1 insert `enriched=1, embedded=0` → poller embeds to Qdrant.

Key fix (session 32): `post_chunk_to_worker` was sending base64-encoded text with `encoding: "base64"` flag — Worker has no decode step, all chunks silently skipped. Fixed to send raw UTF-8.

ID format: citation-derived slugs (e.g. `DocTitle__Citation`) — different from console paste `hoc-b{timestamp}` format. Both valid. Re-uploading same doc skips silently via `INSERT OR IGNORE`.

**cases.id format (session 34):** `cases.id` is now citation-derived (e.g. `2026-tassc-2`), not UUID. `citationToId()` helper in worker.js normalises citation → lowercase slug. Both `handleUploadCase` and `handleFetchCaseUrl` use `INSERT OR IGNORE` — re-uploading an existing citation is a no-op, enrichment data is preserved. All 580 pre-existing UUID rows were backfilled via D1 UPDATE. No Qdrant changes required — Qdrant payloads reference `citation` not `cases.id`.

`.md` files on drop: load into textarea instead of triggering pipeline — intentional, allows preview/edit before submit.

**Parser fix (ingest_corpus.py session 9):**
- Heading regex: `#+ .+` (was `###? .+`) — now accepts single # headings
- Metadata lookahead: `\[[A-Z]+:` (was `\[DOMAIN:`) — now accepts any bracket field
- PROCEDURE_ONLY flag: False for full corpus ingest

**FTS5 and corpus re-ingest (session 12):**
- Root cause of 500 errors on upload-corpus: `handleUploadCorpus` FTS5 insert had no ON CONFLICT clause
- Fix: `INSERT OR REPLACE INTO secondary_sources_fts` deployed version 2d3716de
- If 500 errors ever recur on upload-corpus: `DELETE FROM secondary_sources_fts` then retry
- FTS5 table is currently empty — backfill needed after embed pass completes

**FTS5 backfill command (run after embed pass complete):**
```sql
INSERT INTO secondary_sources_fts (rowid, source_id, title, raw_text)
SELECT rowid, id, title, raw_text FROM secondary_sources
WHERE id NOT IN (SELECT source_id FROM secondary_sources_fts)
```

---

## ASYNC JOB PATTERN — LIVE (deployed 18 March 2026, session 2)

**Problem:** fetch-case-url and PDF case uploads timeout on large judgments. Worker has 30s wall-clock limit.

**Confirmed correct solution: Cloudflare Queues**

**LIVE implementation:**
- Queue name: `arcanthyr-case-processing`
- **METADATA message:** Pass 1 (first 8k chars) → one Workers AI call → writes `case_name`, `judge`, `parties`, `facts`, `issues`, `enriched=1` to D1 → splits full `raw_text` into 3k-char chunks → writes to `case_chunks` table → enqueues one CHUNK message per chunk → `ack()`
- **CHUNK message:** reads `chunk_text` from `case_chunks` → GPT-4o-mini-2024-07-18 call with v3 prompt → writes `principles_json` + `enriched_text`, sets `done=1` → checks `COUNT(*) WHERE done=0` → if 0, calls `performMerge()` → `ack()`
- **MERGE message (session 22):** synthesis-only re-merge — reads all `principles_json` from `case_chunks`, runs `performMerge()` with synthesis GPT-4o-mini call, writes case-level principles → `ack()`
- **Frontend:** polls `/api/legal/case-status` — `enriched=1` set after Pass 1, `deep_enriched=1` set after merge

### performMerge() — shared merge function (session 22)

Used by both CHUNK handler (when last chunk completes) and MERGE handler (re-merge only). Steps:
1. Collect `allPrinciples`, `allHoldings`, `allLegislation`, `allAuthorities` from all chunk `principles_json`
2. Collect `enriched_text` from reasoning/mixed chunks into `enrichedTexts` array
3. If `enrichedTexts.length > 0`: make GPT-4o-mini synthesis call with enriched_text + Pass 1 context → produces 4-8 case-specific principles
4. If synthesis fails or enrichedTexts empty: fall back to raw `allPrinciples` concatenation
  → Sentencing second pass (conditional — fires if `subject_matter='criminal'` or sentencing keywords in chunks):
      → `isSentencingCase()` checks subject_matter + keyword scan across principles_json + issues string
      → GPT-4o-mini: `SENTENCING_SYNTHESIS_PROMPT` → `{sentencing_found, procedure_notes, sentencing_principles}`
      → If `sentencing_found=true`: `procedure_notes` written to cases table, `sentencing_principles` appended to `synthesisedPrinciples`
      → If `sentencing_found=false`: no-op, case gets doctrine principles only
5. Atomic gate: `UPDATE cases SET deep_enriched=1 WHERE citation=? AND deep_enriched=0` — only one worker proceeds
6. Write `principles_extracted`, `holdings_extracted`, `legislation_extracted`, `authorities_extracted`, `subject_matter`, `holding`, `procedure_notes` to D1

**Synthesis prompt** produces principles as JSON array of `{ principle, statute_refs, keywords }` — no type/confidence/source_mode fields. Case-specific prose style, not generic IF/THEN.

**Synthesis skip condition:** If all chunks have null `enriched_text` (pre-Fix-1 bad chunks), synthesis is skipped and raw concatenation is used. This produces old-format principles. Fix: re-merge after chunks are re-enriched.

**Synthesis error handling:** catch block logs `[queue] synthesis failed for {citation}, falling back to raw concat: {error}` and sets `synthesisedPrinciples = allPrinciples` (old format with `type`/`confidence`). No retry. If synthesis fails, case gets old-format principles silently — check Worker real-time logs to diagnose.

**NOTE (session 43):** Merge synthesis output schema changed. synthSystem now requests `{"principles": [...], "holdings": []}` JSON object instead of a bare array. Parser extracts both keys. `synthesisedHoldings` is pushed into `allHoldings` before the D1 write. Fallback path (synthesis failure) unchanged — falls back to chunk-level `allHoldings`.

---

## NEXUS SERVER.PY — ROUTES AND GLOBALS

**All routes require `X-Nexus-Key` header except `/health`.**

| Method | Route | Handler | Notes |
|---|---|---|---|
| GET | `/health` | inline | Returns `{"status":"ok"}` — no auth |
| POST | `/ingest` | `ingest_text()` | Embed + upsert chunk to Qdrant |
| POST | `/search` | `search_text()` | Five-pass retrieval |
| POST | `/query` | `query_qwen()` | search + Qwen3 inference |
| POST | `/extract-pdf` | `extract_pdf_text()` | pdfminer only |
| POST | `/extract-pdf-ocr` | `extract_pdf_text_ocr()` | pdfminer + OCR fallback |
| POST | `/delete` | `delete_citation()` | Delete Qdrant vectors by `citation` field |
| POST | `/delete-by-type` | `delete_type()` | Delete Qdrant vectors by `type` field |
| POST | `/process-document` | `process_document()` | Extract text → split → GPT enrichment → D1 |
| GET | `/ingest-status/<job_id>` | `get_ingest_status()` | Returns live job state |

**Key module-level globals (server.py):**

| Global | Value | Purpose |
|---|---|---|
| `EMBED_MODEL` | `argus-ai/pplx-embed-context-v1-0.6b:fp32` | Ollama embedding model |
| `COLLECTION` | `general-docs-v2` | Qdrant collection name |
| `_bm25_corpus` | dict | In-memory BM25 corpus cache |
| `BM25_TTL` | 600 | BM25 corpus rebuild TTL in seconds |
| `BM25_FTS_ENABLED` | True | Kill switch for D1 FTS5 retrieval pass |

---

## PHASE 5 DESIGN (LOCKED)

- Qdrant top 6 chunks, min score 0.45, max 8
- Re-rank by court hierarchy within 0.05 band: CCA/FullCourt > Supreme > Magistrates
- Full metadata per chunk
- Claude API primary → Workers AI (Qwen3-30b) fallback
- API key via `npx wrangler secret put ANTHROPIC_API_KEY`

---

## ARCANTHYR-UI (session 19 — DEPLOYED)

### arcanthyr-ui — Frontend Architecture (session 19)

**Deployment:** React/Vite app built to `dist/`, copied into `Arc v 4/public/`, served by Worker via `[assets]` binding at arcanthyr.com. NOT a separate Cloudflare Pages deployment.

**Deploy command:**
```
cd arcanthyr-ui && npm run build
cp -r dist/. "../Arc v 4/public/"
cd "../Arc v 4" && npx wrangler deploy
```

**SPA routing:** `not_found_handling = "single-page-application"` in wrangler.toml — catches all deep links and serves index.html.

**_redirects:** Do NOT add a _redirects file to arcanthyr-ui/public/ — it conflicts with Workers Assets and causes infinite loop error 10021.

**Model toggle names:** Sol = Claude API (claude-sonnet) · V'ger = Workers AI (Cloudflare Qwen3-30b) · V'ger is default

**Globe dependencies:** Three.js + @react-three/fiber + @react-three/drei · Earth texture from unpkg · lives on Compose page

**Stack:** React + Vite
**Repo location:** `arcanthyr-console/arcanthyr-ui/` — tracked in monorepo (no separate GitHub repo · absorbed session 35)
**Dev server:** `npm run dev` from `arcanthyr-console/arcanthyr-ui/` · `http://localhost:5173`

**API base (session 17+):**
- `api.js BASE = 'https://arcanthyr.com'` — browser calls Worker directly, no proxy
- Vite proxy removed — `vite.config.js` has no server.proxy section
- CORS on Worker allows `http://localhost:5173` → preflight passes cleanly

**Auth flow (local dev — session 17+):**
- Auth removed for local dev — verify/login/logout are no-op stubs returning `{ ok: true }`
- Landing.jsx immediately redirects to /research (no password screen)
- Worker JWT/cookie auth still live in production — unaffected

**API field names (critical):**
- Frontend → Worker: `{ query }` (not query_text)
- Worker → server.py: `{ query_text }` (Worker translates internally)
- Never send `query_text` from frontend — Worker reads `body.query`

**Pages (all in `src/pages/`):**
- `Landing.jsx` — immediate redirect to /research (auth removed session 17)
- `Research.jsx` — query input, model toggle (Claude/Workers), filter chips, non-clickable source list, AI Summary auto-displays in reading pane after query
- `Upload.jsx` — 3 tabs: Cases (file drop + AustLII URL input) / Secondary Sources (drag+drop .md/.txt) / Legislation (drag+drop .pdf/.txt)
- `Library.jsx` — 3 tabs: CASES/SECONDARY SOURCES/LEGISLATION · case rows clickable → split reading pane with Facts/Holding/Principles tabs · Principles tab reads `c.principles_extracted` (fixed session 33) · year filter chips + court filter chips combinable · Legislation tab: Date Updated column (reads `current_as_at` via `r.date`), external link to legislation.tas.gov.au · Secondary Sources: Title column leftmost · `handleLibraryList` SELECT includes `principles_extracted` (session 33)
- Components: `Nav.jsx`, `ResultCard.jsx`, `PrincipleCard.jsx`, `ReadingPane.jsx`, `ShareModal.jsx`, `PipelineStatus.jsx`

**Production deploy (pending):**
- Cloudflare Pages project not yet created
- Will need `VITE_API_BASE` env var pointing to `https://arcanthyr.com`
- Build command: `npm run build` · output dir: `dist`

---

## KEY FILE LOCATIONS

| File | Path |
|---|---|
| enrichment_poller.py | `Arc v 4/enrichment_poller.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| server.py (nexus) | `Arc v 4/server.py` (local) · `~/ai-stack/agent-general/src/server.py` (VPS canonical) |
| xref_agent.py | `Arc v 4/xref_agent.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| corpus_health_check.py | `Arc v 4/corpus_health_check.py` (repo) · `~/ai-stack/agent-general/src/corpus_health_check.py` (VPS) · cron: `0 2 1 * *` · logs to `~/ai-stack/health_check.log` |
| ingest_corpus.py | `arcanthyr-console/ingest_corpus.py` — run from there, NOT from `Arc v 4/` |
| ingest_part2.py | `arcanthyr-console/ingest_part2.py` — standalone part2 ingest script |
| retrieval_baseline.sh | `arcanthyr-console/retrieval_baseline.sh` (repo) · VPS `~/retrieval_baseline.sh` — results in ~/retrieval_baseline_results.txt |
| master_corpus_part1.md | `arcanthyr-console/master_corpus_part1.md` — 488 chunks (session 12) |
| master_corpus_part2.md | `arcanthyr-console/master_corpus_part2.md` — 683 chunks (session 12) |
| sentencing_first_offenders.md | `arcanthyr-console/sentencing_first_offenders.md` — 1 procedure chunk, ingested session 4 |
| worker.js | `Arc v 4/worker.js` |
| CLAUDE.md | `Arc v 4/CLAUDE.md` |
| CLAUDE_arch.md | `Arc v 4/CLAUDE_arch.md` |
| arcanthyr-ui | `arcanthyr-console/arcanthyr-ui/` — React/Vite frontend · `npm run dev` from this dir |
| api.js | `arcanthyr-console/arcanthyr-ui/src/api.js` — all Worker API calls |
| vite.config.js | `arcanthyr-console/arcanthyr-ui/vite.config.js` — no proxy (removed session 17) |
| austlii_scraper.py | `arcanthyr-console/Local Scraper/austlii_scraper.py` — Windows only |
| scraper_progress.json | `arcanthyr-console/Local Scraper/scraper_progress.json` |
| scraper.log | `arcanthyr-console/Local Scraper/scraper.log` |
| docker-compose.yml | `~/ai-stack/docker-compose.yml` (VPS) |
| run_scraper.bat | `C:\Users\Hogan\run_scraper.bat` — LOCAL path required |
| `Dockerfile.agent` | VPS | agent-general image definition — python-docx, qdrant-client, pypdf etc. baked in |

**server.py is volume-mounted** (`./agent-general/src:/app/src` in docker-compose.yml) — NOT baked into image. Changes only require: edit locally → SCP to VPS → `docker compose up -d --force-recreate agent-general` → health check. No rebuild unless Dockerfile changes.

---

## D1 SCHEMA — SECONDARY_SOURCES_FTS (added session 3)

FTS5 virtual table for full-text search over secondary_sources corpus.

```sql
CREATE VIRTUAL TABLE secondary_sources_fts USING fts5(
    source_id UNINDEXED,
    title,
    raw_text,
    tokenize='porter'
);
```

---

## D1 DATABASE — KEY TABLES

| Table | Primary Key | Key columns |
|---|---|---|
| `cases` | `id` TEXT (citation-derived) | `citation`, `court`, `case_name`, `facts`, `issues`, `holding`, `principles_extracted`, `holdings_extracted`, `authorities_extracted`, `subject_matter`, `enriched`, `deep_enriched`, `procedure_notes` |
| `case_chunks` | `id` TEXT (`{citation}__chunk__{N}`) | `citation`, `chunk_index`, `chunk_text`, `enriched_text`, `principles_json`, `done`, `embedded` |
| `secondary_sources` | `id` TEXT | `title`, `raw_text`, `enriched_text`, `category`, `source_type`, `enriched`, `embedded` |
| `legislation` | `id` TEXT | `title`, `court`, `sections_json`, `embedded`, `current_as_at` |
| `legislation_sections` | `id` TEXT | `leg_id`, `section_number`, `heading`, `text`, `embedded` |
| `truncation_log` | `id` TEXT (= cases.id) | `original_length`, `truncated_to`, `source`, `status`, `date_truncated`, `date_resolved` |
| `health_check_reports` | `id` UUID | Monthly corpus audit reports — `summary_text`, `report_json` (full structured output), `cluster_count`, `contradiction_count`, `gap_count`, `run_date` |
| `health_check_clusters` | `run_id + chunk_id` (composite) | Per-run cluster assignments from GPT-4o-mini pre-pass — `cluster_label`, auditable per `run_date` |

---

## COMPONENT NOTES

### austlii_scraper.py

- Location: `arcanthyr-console\Local Scraper\austlii_scraper.py`
- Progress: `arcanthyr-console\Local Scraper\scraper_progress.json`
- Log: `arcanthyr-console\Local Scraper\scraper.log`
- Runs on Windows via Task Scheduler (VPS IP banned by AustLII)
- Task Scheduler tasks: `run_scraper` (8am AEST) + `run_scraper_evening` (6pm AEST)
- SESSION_LIMIT: 150 per run
- Behavioural jitter: 7% chance 25-45s additional pause
- Business hours gate in scraper handles time window
- Exit code 2 = business hours gate fired (normal/expected outside hours)

**NOTE (session 43):** Correct AustLII court code for Magistrates Court is TASMC (not TAMagC). The scraper COURTS list has been corrected. The Worker's AUSTLII_COURTS map still uses TAMagC as the internal court label → TAMagC AustLII path — this may also need updating if the Worker's legacy daily sync is ever re-enabled.

### backfill_case_chunk_names.py

- Location: `arcanthyr-console\backfill_case_chunk_names.py` (local) · `/home/tom/backfill_case_chunk_names.py` (VPS)
- Run from VPS only — fetches cases via Worker API, updates Qdrant at `localhost:6334`
- Do NOT run from Windows — Qdrant port 6334 is localhost-only on VPS

### enrichment_poller.py

Volume-mounted at `./agent-general/src:/app/src`. Runs as permanent Docker service.

**Modes:** `--mode enrich`, `--mode embed`, `--mode both`, `--mode reconcile`, `--loop`, `--status`

**Cases enrichment path:** handled by Cloudflare Queue consumer (Worker), not the poller. METADATA message → Pass 1 metadata + chunk split. CHUNK messages → per-chunk principle extraction → merge with synthesis.

**Default batch:** 50 · **Loop sleep:** 15 seconds

**CONCEPTS header strip (session 46):** Poller strips `[CONCEPTS:...]` and `Concepts:...` header lines from the start of embed text before the Ollama embedding call and before populating the Qdrant `text` payload field. Regex: `re.sub(r'^\[?concepts:[^\]\n]*\]?\s*\n+', '', text, flags=re.IGNORECASE)`. Deployed at line 695 of enrichment_poller.py. Root cause: for secondary sources with NULL enriched_text, the CONCEPTS header was the dominant embedding signal, drifting vectors away from the actual doctrine content.

### Embedding text contamination rule (session 51)

**Never add cross-domain disambiguation to enriched_text or raw_text body text.**

Example of what went wrong: adding "distinct from the George v Rockett prescribed belief test" to BRD chunk enriched_text caused the BRD chunks to drop out of top-6 results entirely. The embedding model cannot reason about negation — "I am NOT about X" is semantically equivalent to "I am about X." The model sees proximity to X either way.

**Rule:** Put domain anchor sentences on COMPETING chunks only (e.g., "POLICE OFFICER PRESCRIBED BELIEF STANDARD — this is about police powers, not standard of proof"). Keep the TARGET chunk's embedding text purely about the target domain. Zero cross-references to what it is not.

### enrichment_poller.py — payload text limits (fixed session 9)

All three embed passes previously truncated payload text to [:1000]. Fixed:
- secondary_sources embed pass: [:5000]
- case_chunk embed pass: [:3000]
- legislation embed pass: [:3000]

### BM25 + RRF Hybrid Retrieval (added session 3)

**In-memory BM25 corpus (`_bm25_corpus` in server.py):**
- Built on first search query after container start
- Loads all `embedded=1` secondary_sources rows via GET `/api/pipeline/bm25-corpus`
- Invalidated: `dirty=True` on any ingest call + TTL 600s fallback

**D1 FTS5 (`secondary_sources_fts`):**
- Created session 3 · porter tokenizer
- **Backfilled session 13** — 1,171 rows · clean INSERT after wipe · all three retrieval passes operational
- Queried via Worker POST `/api/pipeline/fts-search`
- Gated by `BM25_FTS_ENABLED = True` in server.py

### Workers AI (Cloudflare) — model and usage inventory

**Current model:** `@cf/qwen/qwen3-30b-a3b-fp8` — used for ALL Workers AI calls.

**Active Workers AI calls:**
- **`summarizeCase()`** — two-pass case enrichment at scrape/upload time
- **`procedurePassPrompt`** — extracts in-court procedural sequences
- **`handleLegalQueryWorkersAI()`** — Phase 5 fast/free query toggle
- **`handleAxiomRelay()`** — Three-stage relay pipeline

### worker.js — max_tokens on query handlers

| Handler | Model | max_tokens |
|---|---|---|
| `handleLegalQuery()` | Claude API (claude-sonnet-4-20250514) | 2,000 |
| `handleLegalQueryWorkersAI()` | Workers AI (Qwen3-30b) | 2,000 |

### Sentencing Second Pass (session 31, updated session 47)

- Constant: `SENTENCING_SYNTHESIS_PROMPT` — module level in worker.js
- Helper: `isSentencingCase(caseRow, allChunks)` — three checks: (1) `subject_matter='criminal'`, (2) sentencing keyword regex across `principles_json`, (3) issues string scan
- Fires inside `performMerge()` after main synthesis, before D1 write
- Cost: ~$0.001/case, only on criminal cases (~60% of corpus)
- Output: `procedure_notes` (200-400 word structured prose) + 2-4 sentencing principles merged into `principles_extracted`
- Non-destructive: non-sentencing criminal cases return `sentencing_found=false`, no extra cost beyond the one GPT call
- Triggered by `requeue-merge` automatically — no separate route needed
- `subject_matter` must be included in both CHUNK and MERGE handler SELECTs and passed through the inline `caseRow` object to `performMerge` — omitting it silently breaks Check 1
- **sentencingTexts input (session 47):** reads chunk_text from ALL chunks (no type filter) — previously filtered to reasoning/mixed/procedural only, which excluded evidence chunks containing prior history, victim impact, and personal circumstances
- **sentencing_found guard (session 47):** returns true for imposed, varied, confirmed, or reviewed sentences — only returns false for judgments with no sentence quantum discussion at all (interlocutory, acquittal, evidence ruling)
- **procedure_notes coverage (session 47):** includes concurrent/cumulative sentences, time served declarations, backdating, and ancillary orders (compensation, restraining orders, sex offender registration, forfeiture, licence disqualification)
- **sentUser context (session 50):** `caseRow.holding` (Pass 1 outcome) added to sentUser prompt as `Outcome (Pass 1 summary)` before chunk texts. Requires `holding` field in both CHUNK handler and MERGE handler caseRow SELECTs. Root cause: Pass 1 sentence quantum was never reaching sentencing synthesis — chunk-level allHoldings is often empty for CCA appeal cases where no single chunk captures the full disposition.
- **Input cap (session 50):** Raised from 40K to 120K chars. Previous 40K cap was truncating sentencing content from long CCA judgments (24+ chunks, ~60K chars total). gpt-4o-mini supports 128K token context — 120K chars ≈ 30K tokens, well within limit. 25-second AbortController provides timeout protection regardless of input size.
- **Timeout and token limits (session 53):** `sentTimeout` raised from 25s to 45s — large cases (16+ chunks, ~48K chars input) were hitting the abort threshold under concurrent queue load. `max_completion_tokens` raised from 2000 to 4000 — complex multi-party sentencing responses were being truncated mid-JSON, causing silent SyntaxError in the catch block and null `procedure_notes`. Both changes apply to the sentencing synthesis OpenAI call only (not main synthesis or CHUNK enrichment).
- **CHUNK handler holding fix (session 53):** CHUNK handler `performMerge` call now includes `holding: caseRow?.holding` in the inline caseRow. Previously `holding` was fetched at line 3227 but dropped when constructing the inline object — `caseRow.holding` was `undefined` in `sentUser` for all cases processed via the normal scraper path. MERGE handler (requeue-merge path) was already correct via its explicit DB fetch.

### Sentencing Backfill Route (session 54)

- Admin route: `POST /api/admin/backfill-sentencing` — X-Nexus-Key auth, accepts `{"limit": N}` clamped to [1,30]
- Function: `runSentencingBackfill(env, limit)` in worker.js (alongside performMerge)
- Targets: `subject_matter='criminal' AND procedure_notes IS NULL AND deep_enriched=1`
- Mirrors performMerge() sentencing block exactly: same chunk fetch, same allHoldings construction, same sentUser structure (120K cap), same OpenAI parameters (gpt-4o-mini-2024-07-18, max_completion_tokens 4000, 45s AbortController), same isSentencingCase() guard
- Writes only `procedure_notes` and appends to `principles_extracted` via read-modify-write. Does NOT touch deep_enriched, does NOT re-run main synthesis, does NOT use the queue
- NULL procedure_notes is the implicit retry flag — failed cases stay in result set
- Returns: `{ ok, processed, skippedNotSentencing, failed, candidatesInBatch, remaining, errors }`
- **STATUS: ACTIVE** — SENTENCING_SYNTHESIS_PROMPT rewritten session 55 and validated (classification 6/6, fabrication 0). Safe to fire.
- **Session 55 prompt rewrite:** Three-step prompt — Step 1 classifies case type (first_instance/sentence_appeal/sentence_review vs non-sentencing) with explicit positive/negative case lists; Step 2 extracts with different schemas for first-instance vs appeal/review (appeal schema includes original sentence, appellate standard applied, House v The Queen, grounds, outcome); Step 3 formats JSON. Input is ALL chunk_text (no type filtering — this was already the case pre-session-55, the prompt just mislabeled it as "reasoning sections"). Output includes `case_type` field (logged, not stored to D1). Key instruction: "never invent comparable cases — only include cases explicitly cited in the judgment text."
- **Citation targeting (session 55):** accepts optional `body.citations` array. If present: queries `WHERE citation IN (...)` with no `procedure_notes IS NULL` constraint (re-runs work). If absent: original sweep query (`subject_matter='criminal' AND procedure_notes IS NULL AND deep_enriched=1`).

### sentencing_status column (deployed session 57)

`sentencing_status TEXT` added to cases table via `ALTER TABLE`. Values: NULL (not yet processed), 'success' (procedure_notes written), 'failed' (isSentencingCase=true but extraction failed), 'not_sentencing' (isSentencingCase=false). Implemented in both `performMerge()` and `runSentencingBackfill()`. Sweep query updated to `sentencing_status IS NULL OR sentencing_status='failed'` for precise retries. 305 NOT_SENTENCING sentinel strings cleaned from procedure_notes in same deployment. Use `WHERE sentencing_status='failed'` for targeted retry runs.

### worker.js — admin routes

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/requeue-chunks` | POST | Re-enqueues done=0 chunks · accepts `{"limit":N}` |
| `/api/admin/requeue-metadata` | POST | Re-enqueues enriched=0 cases (full Pass 1 + CHUNK pipeline) |
| `/api/admin/requeue-merge` | POST | Re-triggers merge · accepts `{"limit":N}` · optional `"target":"remerge"` queries deep_enriched=1 cases, resets to 0 before enqueuing MERGE · default (no target) queries deep_enriched=0 with runtime chunk check |
| `/api/legal/format-and-upload` | POST | Dual-mode corpus upload — pre-formatted blocks (parse direct), raw text (GPT Master Prompt, short-source variant <800 words), or `mode='single'` (bypass GPT, wrap in block header) · `handleFormatAndUpload` · auth: User-Agent spoof |
| `/api/admin/health-reports` | GET | List all health check reports (summary only, no report_json), DESC, LIMIT 24 · X-Nexus-Key |
| `/api/admin/health-reports/:id` | GET | Single health check report including full report_json · X-Nexus-Key |
| `/api/admin/health-reports` | POST | Write monthly health check report (id, summary_text, report_json, cluster_count, contradiction_count, gap_count) · X-Nexus-Key |
| `/api/admin/health-clusters` | POST | Write cluster assignments batch (run_id, run_date, assignments[]) via D1 batch() · X-Nexus-Key |

### xref_agent.py (session 57)
- Location: VPS `~/ai-stack/agent-general/src/xref_agent.py`
- Cron: `0 3 * * *` in tom's crontab — logs to `~/ai-stack/xref_agent.log`
- Filters: `subject_matter IN ('criminal', 'mixed')` — civil/admin excluded
- Treatment upgrade: `upgrade_treatment()` post-processes `'cited'` using `why` keywords → applied/distinguished/not followed/referred to
- Idempotent: `INSERT OR IGNORE` with SHA1 IDs — safe to re-run
- Worker batch writes: `env.DB.batch()` in 100-row chunks (not sequential await)

### Qdrant payload field names

- Secondary source type filter: field = `type`, value = `secondary_source`
- Legislation type filter: field = `type`, value = `legislation`
- Case chunk type filter: field = `type`, value = `case_chunk`

### secondary_sources D1 schema notes

- PK is `id` (TEXT) — populated from CITATION metadata field in corpus
- **No `citation` column exists** — do not query for it. Always use `id`.
- Canonical category values: annotation, case authority, procedure, doctrine, checklist, practice note, script, legislation
- Full column list: `id, title, source_type, author, date_published, tags, related_cases, related_acts, raw_text, chunk_count, date_added, enriched_text, enriched, embedded, enrichment_error, category, embedding_model, embedding_version`

### cases D1 schema notes

- PK is `id` (TEXT) — citation with spaces replaced by hyphens
- Full column list: `id, citation, court, case_date, case_name, url, full_text, facts, issues, holding, holdings_extracted, principles_extracted, legislation_extracted, key_authorities, offences, judge, parties, procedure_notes, processed_date, summary_quality_score, enriched, embedded, deep_enriched, subject_matter`
- `subject_matter TEXT` — added session 14 · values: criminal/civil/administrative/family/mixed/unknown · derived at merge step from most frequent chunk-level classification
- `deep_enriched INTEGER DEFAULT 0` — set to 1 after all CHUNK messages complete and merge runs
- `procedure_notes TEXT` — populated by sentencing second pass for criminal judgments · NULL for non-criminal or non-sentencing cases
- `sentencing_status TEXT` — added session 57 · values: NULL (not yet processed) / 'success' (procedure_notes written) / 'failed' (isSentencingCase=true but extraction failed) / 'not_sentencing' (isSentencingCase=false) · use `WHERE sentencing_status='failed'` for precise retry targeting

### case_chunks D1 schema

- `id TEXT PRIMARY KEY` — format: `{citation}__chunk__{N}`
- Full column list: `id, citation, chunk_index, chunk_text, principles_json, enriched_text, done, embedded`
- `enriched_text TEXT` — added session 14 · stores v3 prompt output · used as embed source by poller · no chunk_text fallback — chunks with null enriched_text are excluded at SQL level
- `done INTEGER DEFAULT 0` — set to 1 after CHUNK queue consumer writes `principles_json`
- `embedded INTEGER DEFAULT 0` — set to 1 after VPS poller upserts chunk vector to Qdrant
- **Header chunk null enriched_text (intentionally unembedded)** — `chunk_index=0` rows with `done=1, enriched_text IS NULL` sit permanently at `embedded=0`. CHUNK v3 classifies these as `header` type and intentionally writes no enriched prose. `fetch-case-chunks-for-embedding` excludes them via `AND cc.enriched_text IS NOT NULL` — they never enter the poller cycle. The poller Python skip guard is a harmless safety net. Accurate backlog count: `SELECT COUNT(*) FROM case_chunks WHERE embedded=0 AND enriched_text IS NOT NULL`.

### ingest_corpus.py

- INPUT_FILE is hardcoded — must be manually changed between runs
- Located at: `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\ingest_corpus.py`
- PROCEDURE_ONLY flag — False for full corpus ingest
- Dedup logic: repeated citations get [2], [3] suffixes
- DESTRUCTIVE UPSERT WARNING: ON CONFLICT DO UPDATE resets embedded=0 on citation collision

### master_corpus files (session 12)

- master_corpus_part1.md: 488 chunks · `arcanthyr-console/master_corpus_part1.md`
- master_corpus_part2.md: 683 chunks · `arcanthyr-console/master_corpus_part2.md`
- New corpus: preservation-focused Master prompt + Repair pass · hoc-b{N}-m{N}-{slug} citation format
- Total: 1,171 chunks · all enriched=1 · poller embedding overnight

### retrieval_baseline.sh

- Location: VPS `~/retrieval_baseline.sh`
- Auth: KEY auto-reads from `~/ai-stack/.env` — no manual export needed
- Field name: `query_text`
- Results in `~/retrieval_baseline_results.txt`
- **Last run: 22 Mar 2026 (session 13) — 14 pass / 3 partial / 0 fail (new corpus)**
- Q2 BRD partial (BRD chunk now ingested — verify next run) · Q9 guilty plea partial (corpus gap) · Q13 case_chunk RRF noise

### retrieval_baseline.sh — KEY extraction
- KEY is read from `~/ai-stack/.env.secrets` (not `.env` — `.env` does not contain secrets)
- `cut -d= -f2-` required (not `cut -d= -f2`) — base64 keys end with `=` padding; `-f2` drops it, causing silent auth failure
- Always `unset KEY` before running if KEY was manually exported in the current shell session
- Baseline broken as of session 61 end — direct curl works, script still returns 0 chunks — unresolved

### Word artifact cleanup

- **gen_cleanup_sql.py** — run locally, strips Word formatting artifacts from raw_text
- **131 rows cleaned 18 Mar 2026** — re-run if new Word-derived chunks ingested

---

## PROCESS_BLOCKS.PY PIPELINE NOTES

- `gpt-4o-mini-2024-07-18` — use this model string. Do NOT use gpt-5.x — near-empty output
- `max_completion_tokens` not `max_tokens`; no `temperature`; normalise `\r\n`
- `PART1_END = 28` in process_blocks.py
- 56 blocks total · completed 20 Mar 2026 (session 10 overnight run)
- New Master prompt: preservation-focused, 500-800 word body target, verbatim/near-verbatim prose
- REPAIR_PROMPT: second pass catches thin chunks
- Citation format: `hoc-b{N}-m{N}-{slug}`

---

---

### Secondary Sources Upload Pipeline

Two paths:

**Paste path** (single formatted block):
- Upload.jsx detects <!-- block_ prefix → extracts [CITATION:] client-side → api.uploadCorpus → handleUploadCorpus → D1 insert (enriched=1, embedded=0) → poller embeds

**Drag-and-drop path** (.docx/.pdf/.txt):
- File base64 encoded → POST /api/ingest/process-document → Worker proxies to server.py /process-document → background thread: extract text (python-docx/pypdf) → split_chunks_from_markdown → per-block GPT-4o-mini Master Prompt → post_chunk_to_worker → D1 inserts → job_id returned → UI polls /api/ingest/status/:jobId every 5s

Citation priority in split_chunks_from_markdown:
1. [CASE:] value → {source_name}_{slugified_case}
2. [CITATION:] value (not bare year) → {source_name}_{slugified_citation}
3. Fallback → {source_name}_chunk_{i+1:04d}_{heading_slug}

Source title uses chunk heading (not filename stem).

---

## FUTURE ROADMAP

- **subject_matter filter** — Part 1 (Worker route JOIN) confirmed deployed. Part 2 (poller metadata dict) deployed session 60. Part 3 (re-embed backlog ~7,046 chunks) in progress — poller writing correct payloads from session 60 onwards. Deploy server.py `MatchAny(any=["criminal","mixed"])` filter on Pass 3 once backlog clears to 0.
- **Domain filter UI** — DEPLOYED session 61 · ALL/CRIMINAL/ADMINISTRATIVE/CIVIL chips on Research page · subject_matter_filter param threaded frontend → api.js → Worker → server.py · cache-based hard exclusion for case_chunks when filter explicitly set · ALL behaviour unchanged (existing SM_PENALTY applies)
- **Citation authority agent (xref_agent.py)** — COMPLETE. Tables populated: 5,340 case_citations, 4,056 case_legislation_refs. Nightly cron live at 3am VPS time. Outstanding: stare decisis UI layer (see below).
- **Word/PDF drag-and-drop upload pipeline** — COMPLETE. Upload.jsx accepts .pdf/.docx/.txt on Secondary Sources tab → process-document → server.py background extraction → GPT-4o-mini format → D1 insert → poller embeds to Qdrant. Live since session 32.
- **Stare decisis UI layer** — surface citation treatment history in case detail view. Data source: `case_citations` (5,340 rows, criminal/mixed only) and `case_legislation_refs` (4,056 rows). Show: cited-by count, treatment breakdown (applied/distinguished/not followed), which cases this case cites. Frontend build on case detail panel — no backend work needed, data already in D1.
- **RRF retry** — do not retry until: corpus >50K vectors; independent retrieval signals across legs (different embedding model, SPLADE, or BM25 prefetch); per-leg diagnostics logged before fusing; comprehensive doctrine chunk coverage. Current corpus ~10K vectors, single embedding model — prerequisites not met.
- **Pass 2 (Qwen3) prompt quality review** — CLOSED. Live D1 sample confirms 1381/1382 cases have principles; quality is case-specific. Merge synthesis bypasses Pass 2 output. No action required.
- **Extend scraper to HCA/FCAFC** — after async pattern confirmed at volume
- **Retrieval eval framework** — formalise scored baseline as standing process
- **Cloudflare Browser Rendering /crawl** — Available on Workers Free and Paid plans (account `def9cef091857f82b7e096def3faaa25` already has access, no upgrade needed). Submit a starting URL → receive async job ID → poll for results as HTML, Markdown, or structured JSON. Key features: crawl depth + page limits + wildcard URL filters; automatic page discovery from sitemaps and links; incremental crawling via `modifiedSince`/`maxAge` (skip unchanged pages on repeat runs); `render: false` static mode for non-JS sites. Respects robots.txt. Self-identifies as a bot — NOT suitable for AustLII (would be blocked; existing local scraper + Cloudflare edge proxy remains the correct AustLII path). Arcanthyr use cases: (1) Tasmanian Supreme Court sentencing remarks pages — crawl periodically, pipe Markdown output into `process_blocks.py` → upload via console → embed pass on VPS; (2) Law Reform Commission reports, Bar Association publications, and other secondary legal sources — replaces manual downloading. Implementation sketch: Worker cron trigger → POST to `/crawl` with target URL + scope controls → poll job ID → on completion fetch Markdown → split via `process_blocks.py` logic → upload-corpus → embed. Build after primary corpus (Hogan on Crime) is validated and scraper is running at volume.
- **Legislation enrichment via Claude API** — plain English summaries, cross-references
- **CHUNK finish_reason: length** — increase CHUNK max_tokens from 1,500 if truncation rate unacceptable
- **Dead letter queue** — for chunks that fail max_retries. Low priority
- **Word artifact cleanup** — re-run gen_cleanup_sql.py if new Word-derived chunks ingested
- **Query expansion** — before hitting Qdrant, rewrite the incoming user query into 3–4 semantic variants via a fast LLM call (Workers AI Qwen3 or GPT-4o-mini), then run each variant through Pass 1 and merge results before RRF. Improves recall for plain-language queries hitting formal doctrine chunks (e.g. "what happens if I don't show up to court" → also queries "failure to appear", "bench warrant", "non-attendance accused"). Low implementation risk — additive to existing pipeline, no schema changes. Build when retrieval baseline plateaus and recall gaps are confirmed as query-phrasing failures rather than corpus gaps.
- **Procedural sequence assembly** — given a query like "how do I handle a hostile witness" or "what do I do at a bail application", an agent retrieves all relevant procedure, script, doctrine, and checklist chunks then sequences them into a step-by-step response rather than returning them as parallel flat results. Requires a dedicated "sequence assembly" prompt layer after retrieval, before Qwen3 synthesis. Highest value for procedural queries where order matters. Build after retrieval quality is stable.
- **Bulk enrichment audit** — periodic scan of D1 for secondary source chunks where `[CONCEPTS:]` contains fewer than 5 terms, indicating thin enrichment. Flag rows to a `needs_enrichment` queue, re-run enrichment pass via GPT-4o-mini with an expanded concepts prompt. Complements the monthly health check (which catches structural gaps) by catching quality gaps in already-ingested chunks. Low priority — build if retrieval misses are traced to sparse concept vectors.
- **Auto-populate citation and case name from uploaded file** — when a file is dropped or selected in the upload UI, scan the first 1,000 characters for AustLII citation pattern (`[YYYY] TASSC/TASMC/TASCCA/TASFC N`) and case name pattern (R v Name, DPP v Name, X v Y). Auto-fill the citation and case name fields; derive and set the court dropdown from the court code. Frontend-only change in `app.js` — no Worker or D1 changes needed. Reduces manual entry errors on upload.
- **RTF support on upload** — add `.rtf` to the upload form's accept list in the Secondary Sources tab. Add an RTF text stripper in `app.js` (strip RTF control words and markup, extract plain text) before passing to the existing upload pipeline. Frontend-only change. Low effort, occasionally useful for older legal documents exported from Word as RTF.

### Secondary Sources Upload — Session 39 changes
- Upload modal (arcanthyr-ui/src/Upload.jsx) now collects: Title, Reference ID, Category, Source type
- source_type passed from modal → Worker handleFormatAndUpload → D1 secondary_sources.source_type
- date_published auto-set to upload date (new Date().toISOString().split('T')[0]) in Worker — not collected from UI
- tags remain '[]' on insert — to be populated by enrichment poller in future
- handleFetchForEmbedding SELECT now returns source_type
- Qdrant secondary source upsert payload now includes source_type field

### MOSS-TTS-Nano service
- Path: ~/ai-stack/MOSS-TTS-Nano
- Port: 18083 (localhost only, never public)
- Systemd: moss-tts.service (enabled, auto-start)
- Runtime: Python 3.12 venv at ~/ai-stack/MOSS-TTS-Nano/venv
- Model: 0.1B params, CPU-only, ~990MB RAM
- Voice assets: assets/audio/en_8.wav (male default), assets/audio/en_6.wav (female)
- Ambient clips: assets/ambient_male/ (en_8), assets/ambient/ (en_6)
- API: POST /api/generate — multipart form, returns { audio_base64: "..." }

### TTS request chain
browser → POST /api/tts (Worker) → POST /tts (server.py:18789) → POST /api/generate (MOSS-TTS:18083) → WAV bytes back

### Frontend TTS
- src/utils/tts.js — singleton service, Web Audio API, voice pref in localStorage
- Read button on: research answer display, case summary cards, AI Summary tab in case panel
- Ambient triggers: welcome (first interaction/session), searching (query submit), complete/no_results/error (query result)
- Voice toggle: Male/Female pills in Nav (no mute button)
- MOSS-TTS must bind on `0.0.0.0` (not `127.0.0.1`) for agent-general container to reach it via Docker bridge gateway `172.19.0.1:18083`
- systemd service file: `/etc/systemd/system/moss-tts.service` — `--host 0.0.0.0 --port 18083`
- docker-compose.yml agent-general volumes: MOSS-TTS audio assets mounted at `/home/tom/ai-stack/MOSS-TTS-Nano/assets/audio`
- server.py `/query` endpoint is dead code — nothing calls it; all retrieval goes through `/search`

### TTS Architecture (session 59)

Ambient clips (8 preset phrases × 2 voices) are served as static Cloudflare CDN assets from `/Voices/ambient/` and `/Voices/ambient_male/`. These are pre-recorded WAV files — no server involved.

Live TTS (query responses read aloud) routes: Browser → Worker `/api/tts` → `nexus.arcanthyr.com/tts` → `server.py:18789/tts` → MOSS-TTS at `172.19.0.1:18083`. MOSS-TTS synthesis takes ~2m13s on CPU — to be replaced with OpenAI TTS API next session.

Docker→host networking for MOSS-TTS: requires iptables ACCEPT rule on bridge interface `br-09b8cf509a2d` for port 18083. Rule persisted in `/etc/iptables/rules.v4`.

- **TTS**: MOSS-TTS replaced session 60 with OpenAI TTS API (`tts-1`, onyx/nova voices). Static MP3 replacement planned next session — `/tts` route and Worker proxy will be removed entirely once static files deployed.
