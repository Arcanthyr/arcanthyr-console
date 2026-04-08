# CLAUDE.md — Arcanthyr Session Handover
*Updated: 11 March 2026 (evening session)*

---

## SESSION RULES
- Open every session by reading this file first.
- Diagnose from actual output before recommending fixes.
- Run `git add -A`, `git commit`, `git push origin master` separately after every `npx wrangler deploy` — PowerShell does not support `&&`.
- Before every deploy: verify upload list shows only files from `public/` — if `.env` or `.git` appear, stop immediately.
- Suggest context window restart proactively when conversation grows long.
- **Claude Code (CC) is available in VS Code** — use it for all file edits, script runs, and terminal work. Hand off to CC with explicit instructions rather than describing changes for Tom to make manually. CC cannot establish SSH connections (needs credentials) — Tom opens SSH tunnels, CC handles everything else.
- **wrangler d1 execute must be run from `Arc v 4/` directory** where `wrangler.toml` lives — not from repo root.
- **PowerShell execution policy** — if npx is blocked: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

---

## TOOLING
- **Claude.ai (chat)** — architecture decisions, planning, debugging from output, writing CLAUDE.md, reviewing code before deploy
- **Claude Code (VS Code)** — file edits, running scripts, terminal commands, git operations, wrangler deploys
- **PowerShell (local)** — SSH to VPS, scp file transfers, anything CC can't do

---

## SYSTEM STATE (as of 11 Mar 2026 evening)

| Component | Status |
|---|---|
| Qdrant collection | `general-docs-v2` · embedding IN PROGRESS · 1024-dim cosine |
| Embedding model | `argus-ai/pplx-embed-context-v1-0.6b:fp32` (Ollama, VPS Docker) |
| Score threshold | 0.45 (empirically validated) |
| D1 `cases` | 0 rows — clean slate |
| D1 `secondary_sources` | 662 rows · enriched=1, embedded=0→1 (poller running) |
| D1 `legislation` | 5 Acts · embedded=0 — needs re-upload via console |
| Qdrant corpus vectors | EMBEDDING IN PROGRESS via enrichment_poller.py (nohup, PID ~2348650) |
| Qdrant legislation vectors | ❌ WIPED — needs re-upload of 5 Acts via console |
| Worker.js | v9 deployed — fire-and-forget REMOVED, pipeline routes added |
| enrichment_poller.py | In repo at `Arc v 4/enrichment_poller.py`, on VPS at `~/ai-stack/agent-general/src/` |
| ingest_corpus.py | ⚠️ STILL HAS dual-call modification — must revert after embed confirms complete |
| server.py | pplx-embed + general-docs-v2 + threshold 0.45 |

---

## ARCHITECTURE

**Stack:** Cloudflare Worker (`arcanthyr-api`) + D1 (`arcanthyr`) + Qdrant (`general-docs-v2`, port 6334) + Ollama/pplx-embed (Docker) + nexus `server.py` (Docker `agent-general`)

**VPS:** Contabo, `31.220.86.192`, Ubuntu 24.04, 23GB RAM, 6 vCPU
**Live site:** `arcanthyr.com` (Cloudflare Worker custom domain)
**GitHub:** `https://github.com/Arcanthyr/arcanthyr-console`

**D1 vs Qdrant:**
- D1 = source of truth / relational. Library UI reads from D1. Text and metadata live here permanently.
- Qdrant = semantic search index. Vectors + chunk_id payload pointing back to D1 rows. Rebuilt from D1 if needed.
- Library delete wipes Qdrant chunks but NOT D1 rows.
- Full reset: `wrangler d1 execute DELETE` on relevant table + Qdrant collection delete + recreate.

**Data flow (Pipeline v2 — CURRENT):**
```
Console upload → Worker → D1 (raw_text stored, enriched=0, embedded=0)
                       → NO nexus call (fire-and-forget removed in v9)

VPS enrichment_poller.py (manual or cron):
  --mode enrich  → fetches enriched=0 rows → Claude API → writes enriched_text → enriched=1
  --mode embed   → fetches enriched=1, embedded=0 → pplx-embed → Qdrant → embedded=1
  --mode both    → enrich then embed in sequence
  --mode reconcile → diffs D1 embedded=1 vs Qdrant chunk_ids → resets missing to embedded=0
  --loop         → runs continuously (60s sleep between passes)
  --status       → prints pipeline counts and exits
```

**Qdrant upsert note:** Qdrant returns `{"status": "acknowledged"}` for async upserts — points land shortly after. Uses deterministic UUID5 from chunk_id for idempotent upserts. `?wait=true` param NOT supported by this Qdrant version — do not add it.

**server.py (nexus):**
- Lives in `agent-general/src/` — volume-mounted (`./agent-general/src:/app/src`)
- Update: edit locally → `sudo cp` to `~/ai-stack/agent-general/src/server.py` → `docker compose restart agent-general` → curl health check
- No rebuild needed unless Dockerfile changes

**Cloudflare Tunnel:**
- Runs as root systemd at `/usr/bin/cloudflared`, config at `/etc/cloudflared/config.yml`
- Routes `nexus.arcanthyr.com/ingest` → `agent-general` (port 18789)
- Pipeline v2 no longer uses tunnel for embedding — tunnel now only carries lightweight requests

**Ollama Docker isolation:**
- Models pulled on VPS host go to `/usr/share/ollama/.ollama/` — NOT visible to container
- Must pull inside container: `docker exec ollama ollama pull <model>`

**pplx-embed-context-v1:**
- Model: `argus-ai/pplx-embed-context-v1-0.6b:fp32` (2.4GB, MIT licence)
- Produces 1024-dim embeddings. CPU inference — slow but free.
- No instruction prefixes required.
- Score calibration: strong match 0.485–0.525 | noise 0.359–0.404 | threshold 0.45

**Phase 5 design (locked):**
- Qdrant top 6 chunks, min score 0.45, max 8 results
- Re-rank by court hierarchy (CCA/FullCourt > Supreme > Magistrates) within 0.05 score band
- Full metadata per chunk
- Claude API for responses (Anthropic API key: `npx wrangler secret put ANTHROPIC_API_KEY`)

---

## D1 SCHEMA (as of this session)

**secondary_sources:** id, title, text, raw_text, enriched_text, enriched (0/1), embedded (0/1), enrichment_error, source_id (NOT a column — id IS the chunk identifier)
**cases:** id, + enriched (0/1), embedded (0/1), enrichment_error
**legislation:** id, + embedded (0/1)

All 662 secondary_sources rows backfilled to enriched=1 (manually processed corpus).
Legislation rows backfilled to embedded=0 — needs re-upload.

---

## PIPELINE ROUTES (Worker v9)

All routes require `X-Nexus-Key` header except `/api/pipeline/status` (GET, no auth):

| Route | Method | Purpose |
|---|---|---|
| `/api/pipeline/status` | GET | Counts: total, enriched, embedded, errored |
| `/api/pipeline/fetch-unenriched` | GET | Returns enriched=0 rows (batch param) |
| `/api/pipeline/fetch-for-embedding` | GET | Returns enriched=1, embedded=0 rows (batch param) |
| `/api/pipeline/fetch-embedded` | GET | Returns all embedded=1 IDs (for reconcile) |
| `/api/pipeline/write-enriched` | POST | Writes enriched_text, sets enriched=1 |
| `/api/pipeline/mark-embedded` | POST | Sets embedded=1 for list of chunk_ids |
| `/api/pipeline/reset-embedded` | POST | Sets embedded=0 for list of chunk_ids (reconcile recovery) |

---

## ENRICHMENT POLLER — OPERATION

**Location:** `Arc v 4/enrichment_poller.py` (repo) + `~/ai-stack/agent-general/src/enrichment_poller.py` (VPS)

**Environment (source from `~/ai-stack/.env`):**
```bash
set -a && source ~/ai-stack/.env && set +a
```

**Run commands:**
```bash
# Check status
python3 enrichment_poller.py --status

# Embed pass only (current use case)
python3 enrichment_poller.py --mode embed --batch 50

# Background loop
nohup python3 enrichment_poller.py --mode embed --batch 50 --loop > embed.log 2>&1 &

# Reconcile (diff D1 vs Qdrant, reset missing to embedded=0)
python3 enrichment_poller.py --mode reconcile

# Check log
tail -f embed.log

# Check Qdrant point count
curl -s http://localhost:6334/collections/general-docs-v2 | python3 -m json.tool | grep points_count
```

**After updating enrichment_poller.py locally — copy to VPS:**
```powershell
scp "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\enrichment_poller.py" tom@31.220.86.192:~/ai-stack/agent-general/src/
```

---

## PRIORITIES — NEXT SESSION

### Priority 1 — Confirm corpus embed complete
Check Qdrant point count. Expect ~662 corpus pts when done:
```bash
curl -s http://localhost:6334/collections/general-docs-v2 | python3 -m json.tool | grep points_count
```
If still running, leave it. If stalled, check `tail -50 embed.log` for errors then restart.

### Priority 2 — Re-upload 5 legislation Acts via console
Qdrant was wiped this session. Legislation vectors are gone. Upload via console drag-and-drop:
- Criminal Code Act 1924
- Evidence Act 2001
- Justices Act 1959
- Police Offences Act 1935
- Misuse of Drugs Act 2001

After upload verify Qdrant adds ~458 pts on top of corpus count.

### Priority 3 — Revert ingest_corpus.py
CC must remove the dual-call modification (direct nexus POST + NEXUS_KEY env read). Restore to single Worker call only. Commit the revert.

### Priority 4 — Validate search quality
Test Phase 5 conversational interface. Run representative legal queries. Confirm corpus is returning useful results before moving on. This is the proof-of-value check.

### Priority 5 — Resume scraper
Clean slate confirmed. Run during business hours from `Local Scraper/` directory:
```powershell
python austlii_scraper.py
```

### Priority 6 — Pipeline rebuild (next major phase)
Upload flow: Worker writes raw → poller enriches via Claude API → poller embeds VPS-local.
See FUTURE ROADMAP below for full spec.

### Priority 7 — Corpus quality (backlog)
- Remove Commonwealth Criminal Code chunk (`Criminal Code Act 1995 (Cth) Chapter 2` — wrong jurisdiction)
- Sammak, Reid, Swan citations still `[REVIEW]` flagged — find via AustLII (pre-2005 TASCCA)
- George v Rockett / MacLeod duplicates — acceptable for now

---

## KEY FILE LOCATIONS

| File | Path |
|---|---|
| enrichment_poller.py | `Arc v 4/enrichment_poller.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| ingest_corpus.py | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\ingest_corpus.py` ⚠️ needs revert |
| master_corpus.md | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\master_corpus.md` |
| Worker.js | `Arc v 4\Worker.js` |
| CLAUDE.md | `Arc v 4\CLAUDE.md` |
| server.py (nexus) | `~/ai-stack/agent-general/src/server.py` (VPS) |
| austlii_scraper.py | `Local Scraper/` (not in git) |
| docker-compose.yml | `~/ai-stack/docker-compose.yml` (VPS) |
| RAG_Workflow_Arcanthyr_v1.docx | `C:\Users\Hogan\OneDrive\Arcanthyr\` — secondary source formatting workflow |
| split_legal_doc.py | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\` — document splitter |
| migrate_schema_v2.sql | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\migrate_schema_v2_safe.sql` — already applied |

---

## SCRAPER CONFIG (file is authoritative)
- Courts: TASSC, TASCCA, TASFC, TAMagC
- Years: `range(2025, 2004, -1)` — 2025 to 2005 inclusive
- `MAX_CASES_PER_SESSION`: 100
- Delays: 10–20s random
- Business hours: 08:00–18:00 AEST
- Proxy: `arcanthyr.com/api/legal/fetch-page` — routes fetches via Cloudflare edge (VPS IP 31.220.86.192 is blocked by AustLII — run scraper locally only)
- Progress file: `scraper_progress.json` — deleted for clean slate
- Previously ingested: TASSC 2025 (1–17), TASCCA 2025 (1–16), partial TASFC 2025

---

## MIGRATION HISTORY (recent)

- **Embedding:** `nomic-embed-text` (768-dim) → `argus-ai/pplx-embed-context-v1-0.6b:fp32` (1024-dim, MIT)
- **Qdrant:** `general-docs` deleted → `general-docs-v2` (1024-dim cosine)
- **D1 wipe:** `cases` (109 rows) + `legal_principles` (492 rows) deleted
- **Security incident resolved:** `.env` exposed via Wrangler static upload. Fixed: frontend → `public/`, `wrangler.toml` → `directory = "public"`, `.wranglerignore` added, 2 API keys rotated.
- **Worker.js v9:** fire-and-forget nexus removed. D1 INSERT now writes enriched=0, embedded=0. 7 pipeline API routes added.
- **D1 schema migration:** `raw_text`, `enriched_text`, `enriched`, `embedded`, `enrichment_error` added to `secondary_sources`. `enriched`/`embedded` added to `cases`. `embedded` added to `legislation`. 662 rows backfilled enriched=1/embedded=1.
- **enrichment_poller.py:** written, in repo, on VPS. Handles enrich (Claude API), embed (pplx-embed VPS-local), reconcile (D1 vs Qdrant diff), loop mode.
- **Qdrant wiped:** collection deleted and recreated empty this session. Corpus re-embedding in progress via poller. Legislation needs re-upload.
- **ingest_corpus.py:** dual-call SSH tunnel modification still present — revert pending.

---

## FUTURE ROADMAP

- **Pipeline rebuild** — upload flow: Worker writes raw → poller enriches via Claude API → poller embeds VPS-local. No tunnel, no manual steps. Split step needed for large documents.
- **Console status indicator** — show enriched/embedded progress per document after upload (`/api/pipeline/status` route already exists)
- **Scraper completion** — once AustLII scrape done, Worker's edge proxy role diminishes; consider VPS-only consolidation long-term
- **BM25 pre-retrieval** — hybrid keyword + semantic search for statute reference matching
- **Cross-reference builder** — nightly cron, citation graph in D1
- **Auto-populate legislation metadata** on UI drag-and-drop (prevent typo slugs)
- **Phase 5 conversational interface** — Claude API responses with court hierarchy re-ranking (design locked above)
- **Performance evaluation** — Claude API vs Qwen3 on VPS for query responses once corpus validated
