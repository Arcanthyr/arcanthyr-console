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
```bash
curl localhost:18789/status -H "X-Nexus-Key: $(grep NEXUS_SECRET_KEY ~/ai-stack/.env.secrets | cut -d= -f2)"
```

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
- **retrieval_baseline.sh**: Now 31 queries (Q1–Q31). Pre-RRF baseline saved at ~/retrieval_baseline_pre_rrf.txt — do not overwrite. Post-RRF baseline saves to ~/retrieval_baseline_post_rrf.txt
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
