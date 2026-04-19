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

### Retrieval Pipeline (Triple-Pass Hybrid)

Triggered by `POST /api/legal/legal-query` → delegates to `server.py`:

1. **Semantic pass** — Qdrant cosine similarity, threshold 0.45, collection `general-docs-v2`
2. **BM25/FTS5 pass** — `secondary_sources_fts` FTS5 table for section/keyword hits
3. **Case chunk pass** — second Qdrant query scoped to case chunks, threshold 0.35, up to 4 chunks
4. **RRF merge** — Reciprocal Rank Fusion across all three passes
5. **LLM synthesis** — Retrieved context sent to Qwen3 (Workers AI) for final answer

Court hierarchy re-ranks when semantic scores are within 0.05: HCA (4) > CCA/FullCourt (3) > Supreme (2) > Magistrates (1).

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
- **retrieval_baseline.sh**: 31 queries (Q1–Q31). KEY reads from `~/ai-stack/.env.secrets` with `cut -d= -f2-` (preserve trailing `=` in base64 key). Pre-RRF baseline at `~/retrieval_baseline_pre_rrf.txt` — do not overwrite. Always `unset KEY` before running if KEY was manually set in current shell. Confirmed working session 64 · current score 10/13/8 · full results at ~/retrieval_baseline_results_apr16.txt
- **Stub detector (designed session 64, not yet built):** multi-signal gate — LENGTH(raw_text) < 300 chars AND (sentence count < 3 OR title-body token overlap > 0.6 OR truncation markers present) — any-of triggers quarantine · do not use length alone (false positives on dense short propositions) · quarantine target: quarantined_chunks D1 table + Qdrant filter flag, never hard delete
- **Legislation whitelist (designed session 64, not yet built):** Core Criminal Acts exempt from SM_PENALTY — Evidence Act, Criminal Code, Sentencing Act, Bail Act, Justices Act, CJ(MI)A, Criminal Law (Detention and Interrogation) Act · Adjacent Acts (Misuse of Drugs, Police Offences, Road Safety, Firearms, Family Violence) penalised 0.65–0.75 · keyword bridge per query for adjacent Act exemption
- **xref_agent cron**: VPS crontab (tom user) — `0 3 * * *` daily — logs to `~/ai-stack/xref_agent.log` — runs `--mode both` across criminal/mixed cases only · check logs: `tail -50 ~/ai-stack/xref_agent.log`
- **sentencing_status column**: Added session 57 — use `WHERE sentencing_status='failed'` for precise sentencing retry targeting · 'not_sentencing' replaces old NOT_SENTENCING sentinel strings in procedure_notes

---

### PowerShell Constraints

- No `&&` chaining — run commands separately
- No heredoc (`<<'EOF'`)
- No `grep` — use `Select-String`
- No `head` — use `Select-Object -First N`
- No `Out-File` for corpus files — use Python to write (PowerShell BOM corrupts block separators)

---

### Enrichment Poller

Runs as permanent Docker service (`restart: unless-stopped`) — no tmux needed. Embeds from `enriched_text` when present, falls back to `chunk_text`. After any secondary_sources ingest, manually set `enriched=1` via wrangler d1 — new rows land with `enriched=0` and the poller won't process them until updated.

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

### TTS — session 60
- MOSS-TTS fully replaced with OpenAI TTS API in server.py session 60
- Route calls `https://api.openai.com/v1/audio/speech`, model `tts-1`, onyx (male) / nova (female)
- Static MP3 replacement in progress next session — /tts route will be removed from server.py and Worker
- 8 phrases being pre-generated: welcome, searching, processing, complete, error, no_results, uploading, uploaded
- Files will live in `Arc v 4/public/Voices/` served from Cloudflare CDN
- OPENAI_API_KEY confirmed in `~/ai-stack/.env.secrets`, injected into agent-general via env_file

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
| Tool reliability | `search_by_citation` instant and reliable · `search_cases` frequently times out against AustLII CGI endpoint (KNOWN ISSUE — AustLII slowness, not IP block) |

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

### auslaw-mcp `search_cases` timeout

- AustLII CGI endpoint slowness, not IP block. Use `search_by_citation` for known citations (round-trips fast). `search_cases` retry on short queries only.
- Same backend as Quick Search Phase 2 (`/fetch-page` proxy to sinosrch.cgi) — Phase 2 build will need timeout tolerance.

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
