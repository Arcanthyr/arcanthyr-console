# CLAUDE.md — Arcanthyr Session Handover
*Updated: 11 March 2026*

---

## SESSION RULES
- Open every session by reading this file first.
- Diagnose from actual output before recommending fixes.
- Run `git add -A`, `git commit`, `git push origin master` separately after every `npx wrangler deploy` — PowerShell does not support `&&`.
- Before every deploy: verify upload list shows only files from `public/` — if `.env` or `.git` appear, stop immediately.
- Suggest context window restart proactively when conversation grows long.
- **Claude Code (CC) is available in VS Code** — use it for all file edits, script runs, and terminal work. Hand off to CC with explicit instructions rather than describing changes for Tom to make manually. CC cannot establish SSH connections (needs credentials) — Tom opens SSH tunnels, CC handles everything else.

---

## TOOLING
- **Claude.ai (chat)** — architecture decisions, planning, debugging from output, writing CLAUDE.md, reviewing code before deploy
- **Claude Code (VS Code)** — file edits, running scripts, terminal commands, git operations, wrangler deploys
- **PowerShell (local)** — SSH tunnels, anything CC can't do

---

## SYSTEM STATE (as of 11 Mar 2026)

| Component | Status |
|---|---|
| Qdrant collection | `general-docs-v2` · 459 pts · 1024-dim cosine |
| Embedding model | `argus-ai/pplx-embed-context-v1-0.6b:fp32` (Ollama, VPS Docker) |
| Score threshold | 0.45 (empirically validated) |
| D1 `cases` | 0 rows — wiped clean slate |
| D1 `legal_principles` | 0 rows — wiped clean slate |
| D1 `secondary_sources` | 657 rows ✅ |
| Qdrant corpus vectors | ❌ NOT embedded — 459 pts = legislation only |
| Legislation (5 Acts) | Re-ingested into general-docs-v2 ✅ (458 pts) |
| Scraper | PAUSED — clean slate, ready |
| Worker.js | v8 deployed — fire-and-forget corpus upload |
| server.py | pplx-embed + general-docs-v2 + threshold 0.45 |
| ingest_corpus.py | Fixed (splitter, metadata regex, endpoint) — committed |
| master_corpus.md | 725 chunks — D1 ingest complete, Qdrant ingest RUNNING via SSH tunnel + dual-call script |

---

## ARCHITECTURE

**Stack:** Cloudflare Worker (`arcanthyr-api`) + D1 (`arcanthyr`) + Qdrant (`general-docs-v2`, port 6334) + Ollama/pplx-embed (Docker) + nexus `server.py` (Docker `agent-general`)

**VPS:** Contabo, `31.220.86.192`, Ubuntu 24.04, 23GB RAM, 6 vCPU
**Live site:** `arcanthyr.com` (Cloudflare Worker custom domain)
**GitHub:** `https://github.com/Arcanthyr/arcanthyr-console`

**D1 vs Qdrant:**
- D1 = source of truth / relational. Library UI reads from D1. Text and metadata live here permanently.
- Qdrant = semantic search index. Holds vectors + reference IDs pointing back to D1 rows. Rebuilt from D1 if needed.
- Library delete wipes Qdrant chunks but NOT D1 rows.
- Full reset: separate `wrangler d1 execute DELETE` on relevant table + Qdrant collection delete.

**Data flow (current):**
```
Console upload → Worker → D1 (text stored)
                       → fire-and-forget → Cloudflare Tunnel → nexus → pplx-embed → Qdrant
```
The tunnel leg is unreliable at volume (see KNOWN PROBLEM below).

**server.py (nexus):**
- Lives in `agent-general/src/` — volume-mounted (`./agent-general/src:/app/src`)
- Update: edit locally → `sudo cp` to `~/ai-stack/agent-general/src/server.py` → `docker compose restart agent-general` → curl health check
- No rebuild needed unless Dockerfile changes

**Cloudflare Tunnel:**
- Runs as root systemd at `/usr/bin/cloudflared`, config at `/etc/cloudflared/config.yml`
- Routes `nexus.arcanthyr.com/ingest` → `agent-general` (port 18789)
- Fine for low-volume requests (scraper, legislation). Unreliable for bulk corpus ingest (657+ sequential calls).

**Ollama Docker isolation:**
- Models pulled on VPS host go to `/usr/share/ollama/.ollama/` — NOT visible to container
- Must pull inside container: `docker exec ollama ollama pull <model>`
- Or copy blobs + manifest from host to `~/ai-stack/ollama-data/models/`

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

## KNOWN PROBLEM — TUNNEL UNRELIABLE AT VOLUME

The Cloudflare Tunnel cannot sustain hundreds of rapid sequential embed calls fired through it from an external origin. At corpus scale (657 chunks) D1 receives all rows but Qdrant receives almost none — the tunnel silently drops requests.

**Immediate workaround (in progress):**
SSH tunnel bypasses Cloudflare entirely for the embed call.

**Important — architecture clarification confirmed by CC:**
The nexus URL is NOT in `ingest_corpus.py`. It lives in `Worker.js` at line 1080. The script only calls the Cloudflare Worker (`ENDPOINT`). The Worker fire-and-forgets to nexus server-side — that's where the tunnel drops calls at volume. There is no single-line fix in the script.

**Correct fix — dual-call modification to `ingest_corpus.py`:**
1. Tom opens SSH tunnel in a separate PowerShell window (keep open during run):
```powershell
ssh -L 18789:localhost:18789 tom@31.220.86.192
```
2. CC modifies `ingest_corpus.py` to make TWO calls per chunk:
   - Call 1: existing Worker call (`ENDPOINT`) — handles D1 write as normal
   - Call 2: new direct nexus call to `http://localhost:18789/ingest` — handles embedding, bypasses tunnel entirely
3. The Worker's fire-and-forget to nexus will still fire but can be ignored — it will fail silently as before, but the direct call handles embedding correctly.

**Auth requirement:**
The direct nexus call requires `X-Nexus-Key` header (the `NEXUS_SECRET_KEY` Wrangler secret). To retrieve it:
- Check VPS: `grep -i "nexus" ~/ai-stack/docker-compose.yml` and `grep -r "NEXUS_SECRET_KEY" ~/ai-stack/agent-general/src/server.py`
- Or temporarily comment out auth check in `server.py` for the duration of the local tunnel run (safe — tunnel is localhost only), then restore after.

Run `ingest_corpus.py` after modification — expect ~1115 pts total when complete (458 legislation + 657 corpus).
After run: revert dual-call modification before committing — production should stay single-call via Worker.

**Long-term fix (planned — see PIPELINE REBUILD below):**
Decouple D1 write from embedding entirely using `enriched` and `embedded` flags on D1 rows.

---

## PIPELINE REBUILD (planned next major work)

### The problem with the current pipeline
The current pipeline is tightly coupled — upload triggers embed immediately via the tunnel. This breaks at scale and means the console only works reliably for small uploads. The enrichment/formatting pass (splitting + metadata tagging) is currently manual (human feeds blocks to Claude/ChatGPT in fresh sessions).

### Target architecture
Console drag-and-drop → fully automated split → enrich → embed → searchable. No manual steps.

```
Console drop (any format: PDF, DOCX, TXT, MD)
        ↓
Worker receives file → writes raw to D1 (enriched=0, embedded=0)
        ↓
VPS background poller (cron, every few minutes)
        ↓
    [Step 1 — Split]
    Python splitter runs on raw text if >6500 words
    Produces chunks of 5000 words targeting section boundaries
        ↓
    [Step 2 — Enrich]
    Claude API called independently per chunk (fresh context each time)
    Adds: [DOMAIN] [TYPE] [ACT] [SECTION] [CITATION] [TOPIC] [CONCEPTS]
    Validates output — retries if metadata incomplete
    Writes enriched chunks back to D1 (enriched=1)
        ↓
    [Step 3 — Embed]
    pplx-embed runs locally on VPS (no tunnel needed — Qdrant is co-located)
    Vectors stored in Qdrant with D1 row reference
    D1 row updated: embedded=1
        ↓
Searchable in console
```

### Why Claude API for enrichment
- Enrichment requires genuine legal reasoning — correct TYPE classification, CONCEPTS field quality, rule isolation, case authority detection
- Quality of enrichment determines quality of every search result permanently
- Cost is negligible (~$2-5 per major secondary source at current API pricing)
- Smaller models (Llama, Qwen on CPU) produce inconsistent metadata at this task complexity
- Each chunk sent as independent API call = no context drift, same quality as manual fresh-session approach

### D1 schema additions needed
Add to `secondary_sources` table (and future `cases`, `legislation` tables):
```sql
ALTER TABLE secondary_sources ADD COLUMN enriched INTEGER DEFAULT 0;
ALTER TABLE secondary_sources ADD COLUMN embedded INTEGER DEFAULT 0;
ALTER TABLE secondary_sources ADD COLUMN raw_text TEXT;
```

### Tunnel role in new architecture
Tunnel only carries lightweight poll requests (fetch 10 unembedded rows, mark rows complete) — not bulk text payload. Heavy work stays inside VPS. Tunnel load: one small JSON request every few minutes instead of 657 sequential calls.

---

## PRIORITIES — NEXT SESSION

### Priority 1 — Verify corpus Qdrant embedding completed
Ingest run was started at end of session 11 Mar 2026 via SSH tunnel + dual-call script modification. Check completion:
```bash
curl -s http://localhost:6334/collections/general-docs-v2 | python3 -m json.tool
```
Expect ~1115 pts (458 legislation + 657 corpus). If lower, note how many landed and consider re-run from offset.

**After confirming — CC must revert `ingest_corpus.py`:**
Remove the dual-call modification (direct nexus call + NEXUS_KEY env var read). Restore to single Worker call only. Commit the revert. Do not leave the dual-call version in the repo.

**Key facts about the dual-call fix (learned this session):**
- Nexus URL is in `Worker.js` line 1080, NOT in `ingest_corpus.py`
- `ingest_corpus.py` only calls the Cloudflare Worker (`ENDPOINT`)
- Fix added a second direct POST to `http://localhost:18789/ingest` from the script
- Auth header `X-Nexus-Key` reads from `os.environ.get('NEXUS_KEY', '')`
- NEXUS_KEY was read from local `.env` file (on .gitignore — never committed)
- Worker `INSERT OR IGNORE` means D1 re-runs are safe — no duplicates
- Nexus timeout set to 120s per chunk for slow CPU inference
- Expected output per chunk: `D1 [chunk-id] OK  |  NEXUS OK`

### Priority 2 — Validate corpus search quality
Test Phase 5 conversational interface against corpus. Run representative legal queries via Claude API. Confirm reasonable answers are returned before investing in pipeline rebuild. This is the proof-of-value check.

### Priority 3 — Resume scraper
Clean slate confirmed. Run during business hours from `Local Scraper/` directory:
```powershell
python austlii_scraper.py
```
Check first 10–15 lines of `scraper.log` to confirm cases ingesting.

### Priority 4 — Pipeline rebuild
Once corpus validated, rebuild ingest pipeline with decoupled architecture above. This is the major next development phase.

### Priority 5 — Corpus quality (backlog)
- Remove Commonwealth Criminal Code chunk (`Criminal Code Act 1995 (Cth) Chapter 2` — wrong jurisdiction)
- Sammak, Reid, Swan citations still `[REVIEW]` flagged — find via AustLII (pre-2005 TASCCA)
- George v Rockett / MacLeod duplicates — acceptable for now

---

## KEY FILE LOCATIONS

| File | Path |
|---|---|
| ingest_corpus.py | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\ingest_corpus.py` |
| master_corpus.md | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\master_corpus.md` |
| Worker.js | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\Worker.js` |
| CLAUDE.md | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\CLAUDE.md` |
| server.py (nexus) | `~/ai-stack/agent-general/src/server.py` (VPS) |
| austlii_scraper.py | `Local Scraper/` (not in git) |
| docker-compose.yml | `~/ai-stack/docker-compose.yml` (VPS) |
| RAG_Workflow_Arcanthyr_v1.docx | `C:\Users\Hogan\OneDrive\Arcanthyr\` — secondary source formatting workflow |
| split_legal_doc.py | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\` — document splitter |

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
- **5 Acts re-ingested:** Criminal Code 1924, Evidence Act 2001, Justices Act 1959, Police Offences Act 1935, Misuse of Drugs Act 2001 → 458 Qdrant pts
- **Security incident resolved:** `.env` exposed via Wrangler static upload. Fixed: frontend → `public/`, `wrangler.toml` → `directory = "public"`, `.wranglerignore` added, 2 API keys rotated.
- **Worker.js v8:** handleUploadCorpus → fire-and-forget nexus call
- **ingest_corpus.py:** endpoint, splitter regex, metadata regex all fixed and committed
- **Corpus:** 725 chunks processed via manual RAG workflow (RAG_Workflow_Arcanthyr_v1.docx), 657 rows in D1, Qdrant embedding in progress via SSH tunnel workaround

---

## FUTURE ROADMAP

- **Pipeline rebuild** — decouple upload/enrich/embed (see PIPELINE REBUILD above) — NEXT MAJOR PHASE
- **Automated enrichment agent** — Claude API called per chunk inside VPS background poller, replaces manual RAG workflow sessions
- **Console status indicator** — show enriched/embedded progress per document after upload
- **`embedded` + `enriched` flags** on all D1 tables — enable retry, rebuild, pipeline visibility
- **Scraper completion** — once AustLII scrape is done, Cloudflare Worker's main remaining value (edge proxy for AustLII) diminishes; long-term consider consolidating to VPS-only architecture
- **BM25 pre-retrieval** — hybrid keyword + semantic search for statute reference matching
- **Cross-reference builder** — nightly cron, citation graph in D1
- **Auto-populate legislation metadata** on UI drag-and-drop (prevent typo slugs)
- **Phase 5 conversational interface** — Claude API responses with court hierarchy re-ranking (design locked above)
- **Performance evaluation** — Claude API vs Qwen3 on VPS for query responses once corpus validated
