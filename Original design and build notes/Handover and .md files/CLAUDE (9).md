# CLAUDE.md — Arcanthyr Session Handover
*Updated: 11 March 2026*

---

## SESSION RULES
- Open every session by reading this file first.
- Diagnose from actual output before recommending fixes.
- Run `git add -A`, `git commit`, `git push origin master` separately after every `npx wrangler deploy` — PowerShell does not support `&&`.
- Before every deploy: verify upload list shows only files from `public/` — if `.env` or `.git` appear, stop immediately.
- Suggest context window restart proactively when conversation grows long.

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
| master_corpus.md | 725 chunks — D1 ingest complete, Qdrant ingest BLOCKED |

---

## ARCHITECTURE

**Stack:** Cloudflare Worker (`arcanthyr-api`) + D1 (`arcanthyr`) + Qdrant (`general-docs-v2`, port 6334) + Ollama/pplx-embed (Docker) + nexus `server.py` (Docker `agent-general`)

**VPS:** Contabo, `31.220.86.192`, Ubuntu 24.04, 23GB RAM, 6 vCPU
**Live site:** `arcanthyr.com` (Cloudflare Worker custom domain)
**GitHub:** `https://github.com/Arcanthyr/arcanthyr-console`

**D1 vs Qdrant:**
- D1 = source of truth / relational. Library UI reads from D1.
- Qdrant = semantic search vectors. Rebuilt from D1 if needed.
- Library delete wipes Qdrant chunks but NOT D1 cases table.
- Full reset: separate `wrangler d1 execute DELETE` on `cases` + `legal_principles`.

**server.py (nexus):**
- Lives in `agent-general/src/` — volume-mounted (`./agent-general/src:/app/src`)
- Update: edit locally → `sudo cp` to `~/ai-stack/agent-general/src/server.py` → `docker compose restart agent-general` → curl health check
- No rebuild needed unless Dockerfile changes

**Cloudflare Tunnel:**
- Runs as root systemd at `/usr/bin/cloudflared`, config at `/etc/cloudflared/config.yml`
- Routes `nexus.arcanthyr.com/ingest` → `agent-general` (port 18789)

**Ollama Docker isolation:**
- Models pulled on VPS host go to `/usr/share/ollama/.ollama/` — NOT visible to container
- Must pull inside container: `docker exec ollama ollama pull <model>`
- Or copy blobs + manifest from host to `~/ai-stack/ollama-data/models/`

**pplx-embed-context-v1:**
- Model: `argus-ai/pplx-embed-context-v1-0.6b:fp32` (2.4GB, MIT licence)
- Produces 1024-dim embeddings. CPU inference: slow but free.
- No instruction prefixes required.
- Score calibration: strong match 0.485–0.525 | noise 0.359–0.404 | threshold 0.45

**Phase 5 design (locked):**
- Qdrant top 6 chunks, min score 0.45, max 8 results
- Re-rank by court hierarchy (CCA/FullCourt > Supreme > Magistrates) within 0.05 score band
- Full metadata per chunk
- Claude API first, then Qwen3 comparison
- Anthropic API key: `npx wrangler secret put ANTHROPIC_API_KEY`

---

## THE CORPUS QDRANT PROBLEM

### What happened
`ingest_corpus.py` sends each chunk to `arcanthyr.com/api/legal/upload-corpus` (Worker). The Worker writes to D1 synchronously (works — 657 rows landed), then fire-and-forgets a call to `nexus.arcanthyr.com/ingest` for embedding. The fire-and-forget returns immediately so the Worker doesn't time out.

**Problem:** At volume (657 sequential calls), the Cloudflare Tunnel drops or silently times out the nexus calls. D1 gets all 657 rows. Qdrant gets almost none. Qdrant stuck at 459 (legislation only) after two full ingest runs.

Evidence from logs: nexus received and processed the old batch (`src-1773138828520-a7kpmgq28`, 374 chunks) and one Commonwealth chunk, then nothing. The tunnel is not designed for hundreds of rapid sequential ingest calls from an external source.

### Short-term fix (do this next session)
Bypass the Worker/tunnel entirely for corpus embedding. Call nexus directly from `ingest_corpus.py` via SSH tunnel:

**Option A — SSH tunnel (recommended, no infra change):**
```powershell
ssh -L 18789:localhost:18789 tom@31.220.86.192
```
Then in `ingest_corpus.py` change the nexus embed call to hit `http://localhost:18789/ingest` directly. Bypasses Cloudflare entirely. Keep D1 write going via Worker as normal — only change is where the embedding call goes.

**Option B — Run ingest_corpus.py on the VPS:**
`scp ingest_corpus.py` and `master_corpus.md` to VPS, run there. Nexus is localhost from inside VPS — no tunnel needed.

**Option C — Temporary direct VPS exposure:**
Open port 18789 on VPS firewall temporarily, hit directly, close after. Less clean.

### Long-term fix
Decouple D1 write from Qdrant embedding entirely. After D1 write succeeds, queue a background job (Cloudflare Queue or a simple VPS cron) that polls D1 for rows where `qdrant_embedded = 0` and processes them in batches. Makes the pipeline resilient to timeouts and restarts — every row gets embedded eventually regardless of how ingest was triggered.

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

---

## SCRAPER CONFIG (file is authoritative)
- Courts: TASSC, TASCCA, TASFC, TAMagC
- Years: `range(2025, 2004, -1)` — 2025 to 2005 inclusive
- `MAX_CASES_PER_SESSION`: 100
- Delays: 10–20s random
- Business hours: 08:00–18:00 AEST
- Proxy: `arcanthyr.com/api/legal/fetch-page`
- VPS IP (31.220.86.192) is blocked by AustLII — run scraper locally only
- Progress file: `scraper_progress.json` — deleted for clean slate
- Previously ingested: TASSC 2025 (1–17), TASCCA 2025 (1–16), partial TASFC 2025

---

## PRIORITIES — NEXT SESSION

### Priority 1 — Fix corpus Qdrant embedding (BLOCKER)
D1 has 657 corpus rows. Qdrant has 0 corpus vectors. Use SSH tunnel (Option A above).
Steps:
1. `ssh -L 18789:localhost:18789 tom@31.220.86.192` (keep open in separate window)
2. Modify `ingest_corpus.py` — change nexus embed call from `nexus.arcanthyr.com/ingest` to `http://localhost:18789/ingest`
3. Run script — embeds all 657 chunks directly into Qdrant
4. Verify: expect ~1115 pts (458 legislation + 657 corpus)

### Priority 2 — Resume scraper
Clean slate confirmed. Run during business hours from `Local Scraper/` directory:
```powershell
python austlii_scraper.py
```
Check first 10–15 lines of `scraper.log` to confirm cases ingesting.

### Priority 3 — Corpus quality (backlog)
- Remove Commonwealth Criminal Code chunk (`Criminal Code Act 1995 (Cth) Chapter 2` — wrong jurisdiction)
- Sammak, Reid, Swan citations still `[REVIEW]` flagged — find via AustLII (pre-2005 TASCCA)
- George v Rockett / MacLeod duplicates — acceptable for now

### Priority 4 — Phase 5 conversational interface
Claude API → Qwen3 fallback, threshold 0.45, court hierarchy re-ranking.

---

## MIGRATION HISTORY (recent)

- **Embedding:** `nomic-embed-text` (768-dim) → `argus-ai/pplx-embed-context-v1-0.6b:fp32` (1024-dim, MIT)
- **Qdrant:** `general-docs` deleted → `general-docs-v2` (1024-dim cosine)
- **D1 wipe:** `cases` (109 rows) + `legal_principles` (492 rows) deleted
- **5 Acts re-ingested:** Criminal Code 1924, Evidence Act 2001, Justices Act 1959, Police Offences Act 1935, Misuse of Drugs Act 2001 → 458 Qdrant pts
- **Security incident resolved:** `.env` exposed via Wrangler static upload. Fixed: frontend → `public/`, `wrangler.toml` → `directory = "public"`, `.wranglerignore` added, 2 API keys rotated.
- **Worker.js:** handleUploadCorpus → fire-and-forget (v8 deployed)
- **ingest_corpus.py:** endpoint, splitter regex, metadata regex all fixed and committed

---

## FUTURE ROADMAP

- **Cloudflare Queue** for async D1→Qdrant embedding (proper long-term fix for corpus ingest problem)
- **`embedded` flag on D1 rows** — track which rows have Qdrant vectors, enable retry/rebuild
- **Auto-populate legislation metadata** on UI drag-and-drop (prevent typo slugs)
- **BM25 pre-retrieval** before Qdrant (Llama 3.1 8B via Workers AI, free tier)
- **Metadata enrichment agent** (replace regex case name extraction with Llama)
- **Cross-reference builder** (nightly cron, citation graph in D1)
- **Python normalisation script** for master_corpus.md (citation format, deduplication, synonym injection)
