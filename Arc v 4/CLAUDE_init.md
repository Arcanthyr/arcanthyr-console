# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Session Setup

Before any `wrangler` or `npx` command in PowerShell:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

**Read CLAUDE.md and CLAUDE_arch.md at the start of every session** — both are required for full context.

---

## Commands

### Git workflow (monorepo — session 35)
```powershell
# All git commands run from arcanthyr-console/ root
cd "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console"
git add -A
git commit -m "message"
git push origin master
```
**wrangler and npx commands still run from `Arc v 4/`** — git root and wrangler root are different directories.

### Deploy Worker
```bash
# From "Arc v 4/" directory
wrangler deploy
```

### D1 Database (always add `--remote` for live data)
```bash
wrangler d1 execute arcanthyr --remote --command "SELECT COUNT(*) FROM cases"
wrangler d1 execute arcanthyr --remote --file schema.sql
```

### Stream Worker logs
```bash
wrangler tail
```

### Secrets
```bash
wrangler secret put NEXUS_SECRET_KEY
```

### VPS: Check enrichment poller (SSH)
```bash
docker compose logs --tail=20 enrichment-poller
docker compose ps
```

### VPS: server.py health check

Service proof-of-life: `docker compose logs --tail=20 agent-general | grep 'Nexus ingest server running'` — server.py does not expose /status or /health. If the line is present and dated after the file mtime, the container is running current code.

Container name discovery: run `docker compose ps` from `~/ai-stack` — Compose v2 naming varies. Do not hardcode container names with `-1` suffix.

### SCP server.py (canonical copy is on VPS — always pull before editing)
```powershell
# Download from VPS
scp tom@31.220.86.192:/home/tom/ai-stack/agent-general/src/server.py "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\server.py"
# Upload to VPS
scp "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\server.py" tom@31.220.86.192:/home/tom/ai-stack/agent-general/src/server.py
```
After uploading server.py, force-recreate the container on VPS: `docker compose up -d --force-recreate agent-general`

### Retrieval baseline
```bash
# On VPS — results in ~/retrieval_baseline_results.txt
./retrieval_baseline.sh
```

### Baseline file gotcha (session 75)

The generic `~/retrieval_baseline_results.txt` is frequently stale — it's whatever was written by the last manual `bash ~/retrieval_baseline.sh` run, which may predate the deploys you want to measure against. When grep'ing for specific query results, always target the timestamped snapshot:
- `~/retrieval_baseline_post_interleave.txt` (19 Apr 2026 11:01) — session 74 canonical, 26P/3Pa/2M
- `~/retrieval_baseline_pre_interleave.txt` (19 Apr 2026 10:51) — pre session 74
- `~/retrieval_baseline_post_quarantine.txt` (19 Apr 2026 09:56) — session 71 post-quarantine
- `~/retrieval_baseline_post_reembed.txt` (19 Apr 2026 07:58) — session 65 post-re-embed

Before grep'ing baseline output, run `ls -la ~/retrieval_baseline*.txt` to confirm file age matches the period you want to analyse.

### Corpus processing (PowerShell, "Arc v 4/" directory)
```bash
python process_blocks.py
```

There is no `npm`, `build`, `lint`, or `test` step — the Worker (`worker.js`) is vanilla JS deployed directly via `wrangler deploy`.

---

## Architecture

### Three-Tier Stack

```
Browser (public/app.js + HTML)
    ↓ REST API calls
Cloudflare Edge (worker.js)
    ↓ HTTP fetch (auth: X-Nexus-Key)
VPS Backend (server.py port 18789 + enrichment_poller.py)
    ↓
Qdrant (vector DB, localhost:6334 on VPS host)
Ollama (embedding model, local)
```

**No build step.** `public/` is served as Worker static assets; `worker.js` is the single Worker entry point deployed directly.

---

### Key Files

| File | Where | Purpose |
|---|---|---|
| `worker.js` | Cloudflare Edge | All HTTP routing, D1 ops, case pipeline orchestration, queue consumer |
| `server.py` | VPS (Docker: `agent-general`) | Semantic search, Qdrant ops, hybrid retrieval, Qwen3 inference |
| `enrichment_poller.py` | VPS (Docker: `enrichment-poller`) | Background loop: enrich secondary_sources + case_chunks via GPT-4o-mini, embed via Ollama |
| `public/app.js` | Browser | SPA frontend, no framework |
| `wrangler.toml` | — | Worker config: D1 binding (`DB`), AI binding (`AI`), Queue binding (`CASE_QUEUE`) |
| `schema.sql` | — | D1 schema source of truth |
| `CLAUDE_arch.md` | — | Full architecture reference, route map, component notes |

---

### Case Processing Pipeline

```
Upload (PDF/text)
  → worker.js /api/legal/upload-case
  → D1 cases table (raw_text + Pass 1 metadata)
  → Cloudflare Queue: METADATA message
  → Worker splits case into 3k-char chunks → case_chunks table
  → Enqueue CHUNK messages (one per chunk)
  → GPT-4o-mini: CHUNK prompt v3 → enriched_text + principles_json
  → When all chunks done → performMerge():
      → GPT-4o-mini synthesis call (reads enriched_text from reasoning chunks)
      → Produces 4-8 case-specific principles → principles_extracted
      → Falls back to raw principle concatenation on failure
  → enrichment_poller detects done=1 chunks with embedded=0
  → Embed enriched_text via Ollama → Qdrant upsert
  → Mark embedded=1 in D1
```

**CHUNK prompt v3** (session 14): classifies chunk type (reasoning/evidence/submissions/procedural/header/mixed), writes 200–350 word `enriched_text` prose for reasoning chunks, extracts `reasoning_quotes` (verbatim judicial passages), sets `subject_matter`.

**Merge synthesis** (session 22): GPT-4o-mini call at merge time reads enriched_text from reasoning/mixed chunks + Pass 1 context, produces case-specific prose principles. Shared `performMerge()` function used by CHUNK handler (normal) and MERGE handler (re-merge only).

---

### Retrieval Pipeline (sequential four-pass + BM25 interleave — frozen session 96)

Triggered by `POST /api/legal/legal-query` → delegates to `server.py /search`:

1. **Pass 1** — Qdrant unfiltered cosine, threshold 0.45, SM penalty + leg whitelist, court hierarchy re-rank within 0.05 band
2. **Pass 2** — case_chunks filtered to criminal/mixed, threshold 0.35, appended (cannot displace Pass 1)
3. **Pass 3** — secondary_sources, threshold 0.25, appended
4. **Pass 4** — authority_synthesis, gated by `should_fire_pass4`, threshold 0.50
5. **BM25 interleave** — section refs + case-by-ref + novel case_chunks_fts hits
6. **LLM synthesis** — Sol (Claude API) or V'ger (Workers AI Qwen3)

Retrieval layer is frozen as of session 96. See CLAUDE.md `## RETRIEVAL LAYER — FROZEN` for re-opening conditions. Full architecture in CLAUDE_arch.md.

---

### D1 Database — Key Tables

| Table | PK Format | Notes |
|---|---|---|
| `cases` | citation string | `enriched`, `deep_enriched`, `subject_matter` columns |
| `case_chunks` | `citation__chunk__N` | `chunk_text`, `enriched_text`, `principles_json`, `done`, `embedded` |
| `secondary_sources` | `id` TEXT | No `citation` column — never query `WHERE citation =` |
| `secondary_sources_fts` | — | FTS5 virtual table; mirrors secondary_sources |
| `legislation_sections` | — | Referenced by `handleFetchSectionsByReference` |

---

### Auth & External Services

- **Admin routes** (Worker): `X-Nexus-Key` header required. Get value: `grep NEXUS_SECRET_KEY ~/ai-stack/.env.secrets | cut -d= -f2` on VPS.
- **upload-corpus route**: No `X-Nexus-Key` — uses `User-Agent: Mozilla/5.0 (compatible; Arcanthyr/1.0)`.
- **server.py**: All direct calls to `localhost:18789` require `X-Nexus-Key`.
- **Qdrant**: VPS host port is `6334` (not 6333) — always `curl localhost:6334` from host.
- **Search endpoint**: expects field `query_text` (not `query`).
- **Route/column verification**: Never construct commands with route paths or D1 column names inferred from context — ask CC to grep/read source first. Confirmed failure mode: /api/pipeline/requeue-merge (wrong), criminal column (does not exist).
- **handleRequeueMerge citation scope**: citation parameter in requeue-merge body does NOT scope the requeue — target="remerge" always requeues full eligible corpus. Verify before firing.
- **retrieval_baseline.sh**: 31 queries (Q1–Q31). KEY reads from `~/ai-stack/.env.secrets` with `cut -d= -f2-` (preserve trailing `=` in base64 key). Pre-RRF baseline at `~/retrieval_baseline_pre_rrf.txt` — do not overwrite. Always `unset KEY` before running if KEY was manually set in current shell. Confirmed working session 64 · current score 28P/3Pa/0M on 31-query benchmark (frozen session 96) · always use timestamped snapshots under ~/retrieval_baseline_*.txt — the generic results.txt is stale
- **Stub detector (designed session 64, LIVE):** 253 rows in quarantined_chunks D1 table · Qdrant filter flag active on all four retrieval passes (deployed sessions 71–73) · multi-signal gate — LENGTH(raw_text) < 300 chars AND (sentence count < 3 OR title-body token overlap > 0.6 OR truncation markers present) — any-of triggers quarantine · do not use length alone (false positives on dense short propositions)
- **Legislation whitelist (designed session 64, LIVE):** LEG_WHITELIST_CORE + LEG_WHITELIST_ADJACENT + keyword bridge active on Pass 1 · Core Criminal Acts exempt from SM_PENALTY — Evidence Act, Criminal Code, Sentencing Act, Bail Act, Justices Act, CJ(MI)A, Criminal Law (Detention and Interrogation) Act · Adjacent Acts (Misuse of Drugs, Police Offences, Road Safety, Firearms, Family Violence) penalised 0.65–0.75 · keyword bridge per query for adjacent Act exemption
- **xref_agent cron**: VPS crontab (tom user) — `0 3 * * *` daily — logs to `~/ai-stack/xref_agent.log` — runs `--mode both` across criminal/mixed cases only · check logs: `tail -50 ~/ai-stack/xref_agent.log`
- **sentencing_status column**: Added session 57 — use `WHERE sentencing_status='failed'` for precise sentencing retry targeting · 'not_sentencing' replaces old NOT_SENTENCING sentinel strings in procedure_notes

---

### PowerShell Constraints

- No `&&` chaining — run commands separately
- No heredoc (`<<'EOF'`)
- No `grep` — use `Select-String`
- No `head` — use `Select-Object -First N`
- No `Out-File` for corpus files — use Python to write (PowerShell BOM corrupts block separators)
- `curl` is an alias for `Invoke-WebRequest` — fails with "NonInteractive mode" in CC's shell; always use `Invoke-WebRequest -UseBasicParsing` directly

---

### Enrichment Poller

Runs as permanent Docker service (`restart: unless-stopped`) — no tmux needed. Embeds from `enriched_text` when present, falls back to `chunk_text`.

### docker compose restart vs force-recreate — KEY RULE
`docker compose restart` stops and restarts the same container instance — the environment baked in at container creation time stays frozen. After any key rotation or env_file change (`NEXUS_SECRET_KEY` or other secrets), always use:
```bash
docker compose up -d --force-recreate <service-name>
```
`force-recreate` creates a new container that reads the current `env_file`, picking up rotated keys. This was the root cause of the session 63 poller 401 crash-loop: container created before session 61 key rotation kept the old NEXUS_SECRET_KEY through every restart until force-recreated.

Also: if poller is 401-ing against the Worker but direct curl to server.py works, the mismatch is between the Worker's wrangler secret and what the poller's container has. Check with:
```bash
docker compose exec enrichment-poller printenv NEXUS_SECRET_KEY
```
If blank or wrong → force-recreate, do not restart.

---

### ingest_corpus.py

Lives at `arcanthyr-console\ingest_corpus.py` (monorepo root — not inside `Arc v 4/`). Block separator format must be:
```
<!-- block_NNN master -->
### Heading
[DOMAIN:]
```
`upload-corpus` is destructive upsert — do not re-run against already-ingested citations.

---

### Scraper — Task Scheduler notes

| Item | Detail |
|---|---|
| Scraper Task Scheduler | WakeToRun=True set on both tasks (Arcanthyr Scraper, run_scraper_evening) — PC wakes from sleep at scheduled time · if tasks ever recreated, re-run: `$task = Get-ScheduledTask -TaskName "X"; $task.Settings.WakeToRun = $true; Set-ScheduledTask -InputObject $task` |
| scraper_progress.json path | Lives at `arcanthyr-console\Local Scraper\scraper_progress.json` — NOT at `C:\Users\Hogan\OneDrive\Arcanthyr\Local Scraper\` (that path does not exist) |
| Sentencing backfill route | `POST /api/admin/backfill-sentencing` (X-Nexus-Key) — direct-write sentencing pass, limit 1–30 per call. Accepts optional `body.citations` array for targeted runs (session 55). SENTENCING_SYNTHESIS_PROMPT revised and validated session 55 — classification 6/6, fabrication 0. Safe to fire. |
| scraper_progress.json | 8 stale entries cleared session 54. Safe to re-scrape already-ingested citations — INSERT OR IGNORE skips silently. |

### TTS — fully removed (session 103 Phase 1)

MOSS-TTS removed from VPS (session 60). UI voice controls stripped (sessions 61–62). Static MP3 preset approach abandoned (session 62). Worker `/api/tts` route, `src/utils/tts.js`, and `ReadButton.jsx` all removed session 103 Phase 1 cleanup. server.py `/tts` route (proxy to OpenAI TTS) retained on VPS — dormant, no Worker caller. If TTS is ever revived, re-add Worker route + frontend files from git history (commit `5064c9b`). See CLAUDE_arch.md `### TTS — fully removed (session 103 Phase 1)` for details.

---

## auslaw-mcp (session 72)

Third-party MCP server for AustLII/Jade case search. Runs on VPS, registered in Windows Claude Code.

| Item | Detail |
|---|---|
| Clone path | `~/auslaw-mcp` on VPS — deliberately OUTSIDE `~/ai-stack/` tree to keep off ai-stack networks |
| Image digest | `ghcr.io/russellbrenner/auslaw-mcp@sha256:480e8968b34e43d6d4a6eec3c43ca4dc0d98e63e08faf3645fb8fafb1a307ced` — pinned, do not change without re-audit |
| Compose service | `auslaw-mcp` in `~/auslaw-mcp/docker-compose.yaml` — `build:` block removed, image pinned by digest |
| Network | `auslaw-mcp_auslaw-isolated` (bridge `br-09cccc527fb4`) — NOT connected to any `ai-stack_*` network, do not add external network references |
| `.env` | `LOG_LEVEL=1`, `MCP_TRANSPORT=stdio`, `NODE_ENV=production`, `JADE_SESSION_COOKIE=` (blank) |
| `.mcp.json` | Deleted from clone root per third-party tool security rule — never restore |
| MCP registration | User-scope in `C:\Users\Hogan\.claude.json` as name `auslaw` — registered via `claude mcp add-json` with backtick-escaped double-quoted JSON |
| Transport | SSH-wrapped `docker exec -i auslaw-mcp node /app/dist/index.js` — `claude` CLI lives on Windows, not VPS |
| Tools exposed | 10 total — `search_cases`, `search_by_citation`, `format_citation`, `jade_citation_lookup`, plus 6 others |
| Tool reliability | All AustLII access paths from VPS DEAD — `search_cases` (VPS TCP-block, session 88), `search_by_citation` (VPS TCP-block, returns 403 as of session 101), word-search (CF-edge 403 via Bot Management, session 101). Two-step search pattern fully dead. `format_citation` and `jade_citation_lookup` may still work (no AustLII network call). auslaw-mcp container retained on VPS but currently functional only when invoked from local Windows CC (residential IP unblocked). |

### MCP registration — PowerShell gotchas

- `claude mcp add -- ssh ...` does NOT stop flag parsing on the SSH args — use `claude mcp add-json` instead
- PowerShell single-quoted JSON mangles internal quotes — use backtick-escaped double quotes: `` `"name`": `"auslaw`"... ``
- Registration is user-scope (`C:\Users\Hogan\.claude.json`) — survives project switches

### tcpdump audit procedure (for any new VPS MCP install)

- Run tcpdump as user with `-Z tom` flag — drops privileges after opening socket, pcap file owned by tom (avoid passwordless sudo)
- Identify the container's bridge interface first: `docker network inspect <network_name>` → read the bridge name (format `br-<12-hex>`)
- Capture while exercising the tool: `sudo tcpdump -i br-<hex> -Z tom -w /tmp/audit.pcap`
- Analyse: extract destination IPs with `tcpdump -r /tmp/audit.pcap -nn | awk '{print $3,$5}' | sort -u`
- Rule: any destination outside the tool's advertised scope is a red flag — investigate before proceeding

### `/fetch-page` on server.py is NOT an HTTP CONNECT proxy

- `/fetch-page` is a URL-param FastAPI endpoint (`GET /fetch-page?url=...`) — takes a URL and returns rendered content
- Does NOT speak the HTTP CONNECT proxy protocol — cannot be used as `HTTPS_PROXY` target
- If a third-party tool needs central outbound gating, either stand up a real proxy (Squid/mitmproxy) or modify the tool to call `/fetch-page` explicitly per-URL

### auslaw-mcp `search_cases` / `search_by_citation` — both dead from VPS (sessions 88, 101, 102)

- VPS Contabo IP range TCP-blocked by AustLII at network level — confirmed session 88, re-confirmed session 101 (`search_by_citation` returns 403 as of session 101). NOT slowness.
- CF-edge also blocked by Cloudflare Bot Management (sessions 101–102): all targets including sinosrch, viewdoc, lawlibrary.tas.gov.au return Turnstile challenge ("Just a moment..." + `challenges.cloudflare.com` in CSP).
- CF Browser Rendering (headless Chromium) tested session 102 — Cloudflare identifies its own BR ASN, also 403. No CF-origin path can bypass.
- Quick Search AustLII word-search: accepted loss (jade.io search is POST-based, no clean CF-edge replacement). Local FTS5 word-search path still works.
- `handleFetchJudgment` restored via jade.io URL translation (session 101) — only working AustLII content path from CF edge. Cache key remains AustLII viewdoc URL (intentional decoupling); fetch source is jade.io.
- `runDailySync` permanently parked (session 102). Local Windows scraper on residential IP via Task Scheduler is permanent forward-looking capture.
- auslaw-mcp container retained on VPS but its AustLII-touching tools are dead from there. It works when invoked from local Windows CC only.

### server.py `/search` top_k cap

- Line 296: `top_k = min(int(body.get("top_k", 6)), 12)`. Hard-caps at 12 regardless of client request.
- BM25 FTS new-chunk recall structurally gated by this cap. When running `retrieval_baseline.sh` or any curl test, requesting top_k > 12 silently returns only 12.

### server.py must_not quarantine filter

- LIVE on all three Qdrant passes. `grep -c "must_not" /home/tom/ai-stack/agent-general/src/server.py` must return 3 after any edit.
- If it returns a different number, a patch has accidentally removed or duplicated one of the filters.

### BM25 FTS deploy location

- `fetch_case_chunks_fts()` at server.py line ~141, call site inside `search_text()` after case-law BM25 block, before domain filter.
- Chunks tagged `bm25_source="case_chunks_fts"`. Case-law BM25 layer uses `bm25_source="case_legislation_ref"` — two distinct FTS pathways, both live.

### qvenv for VPS Python scripts

- `/tmp/qvenv` — venv on VPS host with `qdrant-client` installed, created session 73 for quarantine_stubs.py (qdrant-client not on system Python, and script hardcodes localhost:6334 so couldn't run inside agent-general container).
- Activate with `source /tmp/qvenv/bin/activate`. Reusable for any future VPS-host Python work touching Qdrant directly.

### Python subprocess npx on Windows (session 78)

`subprocess.run(['npx', ...])` raises `FileNotFoundError` on Windows because `npx` is a `.cmd` wrapper, not a `.exe`. Always use the string form with `shell=True`:

```python
cmd = f'npx wrangler d1 execute arcanthyr --remote --json --command "{sql_escaped}"'
result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(WRANGLER_DIR), shell=True)
```

Escape SQL double-quotes first: `sql_escaped = sql.replace('"', '\\"')`. Do NOT use list-form + `shell=True` — the list form mis-parses quoted SQL arguments on Windows cmd.

### subprocess.run wrangler stdout encoding — Windows (session 98)

Always pass `encoding='utf-8', errors='replace'` to any `subprocess.run` that captures wrangler or npx stdout on Windows. Non-ASCII D1 content (Word artifacts, curly quotes, em dashes) is the norm once Word-derived corpus chunks are present. Without it, `result.stdout` is `None` and the error surfaces as `TypeError: JSON object must be str, not NoneType` — not a UnicodeDecodeError, which makes the root cause non-obvious.

### source_type discriminator and SYNTHESIS_TYPES (session 78)

The `SYNTHESIS_TYPES` set in `enrichment_poller.py` is the routing mechanism for non-standard Qdrant type values. When `secondary_sources.source_type` matches a value in the set, the Qdrant payload `type` field is set to that value instead of `'secondary_source'`.

- Extend by adding to `SYNTHESIS_TYPES`, not by adding code branches
- Audit via `SELECT source_type, COUNT(*) FROM secondary_sources GROUP BY source_type` — all rows with a SYNTHESIS_TYPES value must have been embedded after the poller restart; rows embedded before will still carry `type='secondary_source'` in Qdrant
- `server.py` must have matching `must_not=[FieldCondition(key="type", match=MatchValue(value=X))]` on any retrieval pass that should exclude the new type

### SCP git diff inflation (session 78)

SCP of VPS-edited files to Windows converts LF line endings to CRLF. Git then shows every unchanged line as modified (whitespace diff), inflating commit stats dramatically (e.g., a 4-line logic change appeared as 106 insertions / 10 deletions).

Fix options:
1. Add `.gitattributes` to the repo root: `*.py text eol=lf`
2. Edit Python files locally and SCP **up** to VPS (not down then edit locally)

The inflation is cosmetic — logic is correct. But it makes code review noisy and can obscure real changes in diff views.

### Authority synthesis ingest script — session 79

- Location: `scripts/ingest_authority_chunks.py` (61 lines; lives outside `Arc v 4/`, inside `arcanthyr-console/scripts/`)
- Invocation from console root in PowerShell: `python scripts\ingest_authority_chunks.py` (full run) or `python scripts\ingest_authority_chunks.py --limit 1` (dry-run gate)
- Reads staged `.md` files from `scripts/authority-chunks-staging/` (233 files as of session 79)
- POSTs to `/api/legal/upload-corpus` with Mozilla User-Agent spoof, hardcodes `doc_type='authority_synthesis'`, regex-extracts CITATION/TITLE/CATEGORY from metadata block
- `DELAY_SEC=1.0` — established session 79. Cloudflare Worker rate-limits bulk ingest at 0.5s (120/min) in burst clusters around position ~50 and ~150. 1.0s (60/min) is clean. Do not reduce below 1.0s for bulk ingest without a >500-chunk benchmark run.
- The script prints a footer line suggesting an `UPDATE secondary_sources SET enriched=1 ...` query — this is dead instruction for the upload-corpus path (Worker now sets enriched=1 on INSERT). Ignore the footer.

**Legislation upload format (session 82):** Always use HTML source from legislation.tas.gov.au with legislative history disabled, saved as .txt. PDF uploads risk pagination artifacts corrupting section boundary detection. History-on versions pollute embeddings with amendment reference numbers.

**Q9 / guilty plea discount:** Tasmania has no statutory provision. s 11A Sentencing Act 1997 is sexual offences aggravating factors, not guilty plea discount. The discount is common law only — fix via secondary source authoring.

## Session 84 — Pre-commit hook (20 April 2026)

Pre-commit hook lives at `arcanthyr-console/.git/hooks/pre-commit` (not tracked by git — `.git/` is excluded). If lost (fresh clone, OS reinstall), recreate manually: bash shebang, `git diff --cached -z --name-only --diff-filter=ACM | grep -zE '\.(js|jsx)$'` piped to `while IFS= read -r -d '' f` loop, runs `node -e` babel parse on each file, exits 1 on failure. `NODE_PATH` must point to `arcanthyr-ui/node_modules` (that is where `@babel/parser` is installed). Space-safe by design — required for `Arc v 4/Worker.js`.

### Embed backlog queries (session 90)

| Gate | Correct query |
|---|---|
| legislation embed backlog | `legislation.embedded` (Act-level flag) is the correct gate — `SELECT title, embedded FROM legislation`. `legislation_sections.embedding_model IS NULL` count is unreliable: Stage 1+2 sections were embedded before that column was being written; the 1,731 NULL count seen session 90 is noise. Poller [LEG] pass reads `legislation.embedded=0` at Act level, not the section-level column. |

---

## Session-long observation accumulation

During any working session, maintain a short internal running list of observations that would be useful in the MDs but aren't yet — specifically:

- Component or route behaviour that differed from its existing documentation.
- Commands, flags, or patterns that were tried and failed, with the specific failure mode.
- Heuristics or rules applied this session that aren't in the MDs but probably should be.
- MD content that was expected but missing, causing extra reading or guessing.

Do not report these mid-session unless directly relevant to the current task. Hold them until the session-closer skill explicitly prompts for addenda, at which point report the accumulated list under the four categories specified by that prompt. One line per entry, concrete and specific — a file/line/route reference, a named command, a specific gotcha. Drop anything vague, speculative, or already covered in the session's main summary. If nothing in a category is worth reporting, say "none" rather than inventing entries.

This exists because the planning-side closer only captures what was visible to Tom and the planning assistant. Anything CC figured out alone — a diagnostic shortcut, an unexpected file dependency, a quiet workaround — evaporates at session end unless CC surfaces it here.

---

## Evaluating proposed optimisation work
When a proposed optimisation arises, treat "don't do this — current state is adequate" as a first-class option alongside technical alternatives, not a last resort. Before generating technical options:

- State the current metric value and whether the measurement can resolve the proposed improvement.
- If the measurement cannot resolve it, say so before proposing the change.
- If the component is marked FROZEN in CLAUDE.md, check D1 query_log for rows with sufficient=0 before proposing any change. Absent any, the correct answer is "no change — frozen."

Default for a frozen component with no logged real-use failure is no work. Propose "no work" visibly, not implicitly.

---

### Component quirks / operational rules (session 99)

| Rule | Detail |
|---|---|
| Queue handler early-exit | `continue` inside `try{}` inside `for (const msg of batch.messages)` is safe — jumps to next iteration, catch block does not fire. Use for guard clauses (DLQ check, type filter) rather than wrapping 200+ lines in else blocks |
| New route auth pattern | Before specifying auth on a new route, check whether the calling component already has the credential. AmendmentPanel has no nexusKey — routes called from it must go in the `/api/legal/` rate-limited block (no X-Nexus-Key). Match the nearest equivalent existing route's auth pattern. |
| api.js /api/legal/ response shape | `req()` for routes in the `/api/legal/` block returns `{ result: <payload> }` — consuming code must unwrap: `const { result } = await api.someRoute(...)` |
| DLQ pending check | Canonical pending chunk query is now `done=0 AND dlq=0` — `done=0` alone includes dead-letter chunks. Update any admin query or requeue script accordingly. |
| wrangler.toml binding syntax | Single-object bindings use `[binding_name]` (e.g. `[browser]`, `[ai]`); `[[binding_name]]` creates an array-of-tables and wrangler 4.75 rejects it — "should be an object but got [...]" |

---

## VERIFICATION & SCRIPTING

**Verification discipline (added session 103)**
- Before any dead-code removal phase, read the actual current file state via `view` or `cat`. Do NOT rely on CLAUDE.md descriptions to know what a file currently contains — CLAUDE.md describes design intent, not current implementation. Grounded: this session's Phase 1 plan assumed nine api.js methods to remove based on prior MD descriptions; the actual file contained only two.
- Commit message bodies and CHANGES THIS SESSION blocks must be drafted from `git diff --stat` (file count) and per-file `git show <commit> -- <file>` output (actual content), not from session notes or plan briefs.
- Isolate actual diff lines from `git show <hash> -- <file>` output by piping through `grep "^[-+]" | grep -v "^---\|^+++"` — the command's leading commit message body otherwise matches grep patterns and produces noise.

**Python scripting on Windows / PowerShell (added session 103)**
- Python scripts emitting non-cp1252 characters (em-dash, emoji, smart quotes) raise UnicodeEncodeError at print/write time on Windows default codepages. Always prepend `import sys, io; sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')` to any CC-invoked script handling those characters.
- Inline `python3 -c "..."` mangles backtick characters via bash command substitution. When a script contains backticks, parentheses-heavy strings, or other shell-special characters, write to a temp file and invoke via `python3 path/to/file.py` instead.
