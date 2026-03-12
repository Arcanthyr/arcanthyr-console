# CLAUDE.md — Arcanthyr Session Handover
*Updated: 12 March 2026 (morning session)*

---

## SESSION RULES
- Open every session by reading this file first.
- Diagnose from actual output before recommending fixes.
- Run `git add -A`, `git commit`, `git push origin master` separately after every `npx wrangler deploy` — PowerShell does not support `&&`.
- Before every deploy: verify upload list shows only files from `public/` — if `.env` or `.git` appear, stop immediately.
- Suggest context window restart proactively when conversation grows long.
- **Claude Code (CC) is available in VS Code** — use it for all file edits, script runs, and terminal work. Hand off to CC with explicit instructions rather than describing changes for Tom to make manually. CC cannot establish SSH connections (needs credentials) — Tom opens SSH tunnels, CC handles everything else.
- **wrangler d1 execute must be run from `Arc v 4/` directory** where `wrangler.toml` lives — not from repo root. Always add `--remote` flag for live D1.
- **PowerShell execution policy** — if npx is blocked: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
- **grep does not exist in PowerShell** — use `Select-String` instead, or run grep on VPS SSH terminal.

---

## TOOLING
- **Claude.ai (chat)** — architecture decisions, planning, debugging from output, writing CLAUDE.md, reviewing code before deploy
- **Claude Code (VS Code)** — file edits, running scripts, terminal commands, git operations, wrangler deploys
- **PowerShell (local)** — SSH to VPS, scp file transfers, anything CC can't do

---

## SYSTEM STATE (as of 12 Mar 2026 morning)

| Component | Status |
|---|---|
| Qdrant collection | `general-docs-v2` · 1935 points · 1024-dim cosine |
| Embedding model | `argus-ai/pplx-embed-context-v1-0.6b:fp32` (Ollama, VPS Docker) |
| Score threshold | 0.45 (empirically validated) |
| D1 `cases` | 0 rows — clean slate |
| D1 `secondary_sources` | 662 rows · enriched=1, embedded=1, enriched_text=NULL (raw_text IS the embedded content — pre-enriched manually) |
| D1 `legislation` | 5 Acts · embedded=1 · 1272 sections in Qdrant |
| Qdrant corpus vectors | 662 valid secondary_source vectors (re-embedded from raw_text this session) |
| Qdrant legislation vectors | 1272 valid legislation section vectors (embedded this session via poller) |
| Worker.js | v11 deployed |
| enrichment_poller.py | In repo at `Arc v 4/enrichment_poller.py`, on VPS at `~/ai-stack/agent-general/src/` |
| server.py | pplx-embed + general-docs-v2 + threshold 0.45 + BM25 pre-retrieval LIVE |
| Phase 5 | VALIDATED — Workers AI and Claude API both returning results via console search page |
| BM25 pre-retrieval | LIVE — query text section refs extracted, fetched from legislation_sections + secondary_sources |

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
  --mode embed   → fetches enriched=1, embedded=0 rows → pplx-embed → Qdrant → embedded=1
                 → ALSO runs legislation embedding pass automatically
  --mode both    → enrich then embed in sequence
  --mode reconcile → diffs D1 embedded=1 vs Qdrant chunk_ids → resets missing to embedded=0
  --loop         → runs continuously (60s sleep between passes)
  --status       → prints pipeline counts and exits
```

**CRITICAL — Enrichment model by content type:**
| Content | Enrichment model | Notes |
|---|---|---|
| Scraped cases (bulk) | Workers AI / Llama — in Worker at ingest time | Free, automated, NOT via VPS poller |
| Manual case uploads | Workers AI / Llama — same Worker path | NOT via VPS poller |
| Secondary sources corpus | None — raw_text IS the content (pre-enriched manually via ChatGPT) | embed raw_text directly |
| Legislation | None — raw statutory text embedded directly | |
| Future secondary source uploads (small volume) | Claude API via poller | Acceptable for low volume |

The VPS poller's Claude API enrichment path is for small-volume secondary source uploads ONLY. Scraped cases are enriched by Workers AI (Llama 3.1 8B) inside the Worker at ingest time — never through the poller.

**BM25 pre-retrieval (LIVE):**
```
User query
    ↓
Step 1 — Semantic search → top 6 Qdrant chunks
    ↓
Step 2 — Extract section references from query text (regex: s\s*(\d+[A-Z]?)(?!\d))
    ↓
Step 3 — Fetch matching rows from legislation_sections AND secondary_sources via
         Worker route /api/pipeline/fetch-sections-by-reference
    ↓
Step 4 — Merge, deduplicate, append with bm25:true and score:0.0
    ↓
Response generator (Workers AI / Claude API)
```

Note: BM25 extracts refs from QUERY TEXT ONLY — not from returned chunks — to avoid cascade noise.

**server.py (nexus):**
- Lives in `agent-general/src/` — volume-mounted (`./agent-general/src:/app/src`)
- Local copy for editing: `Arc v 4/arcanthyr-nexus/server.py` (gitignored directory)
- Update: edit locally → SCP to `~/ai-stack/agent-general/src/server.py` → `docker compose restart agent-general` → test
- No rebuild needed unless Dockerfile changes

**SCP commands:**
```powershell
# enrichment_poller.py
scp "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\enrichment_poller.py" tom@31.220.86.192:~/ai-stack/agent-general/src/

# server.py
scp "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\arcanthyr-nexus\server.py" tom@31.220.86.192:~/ai-stack/agent-general/src/server.py
```

**Cloudflare Tunnel:**
- Runs as root systemd at `/usr/bin/cloudflared`, config at `/etc/cloudflared/config.yml`
- Routes `nexus.arcanthyr.com/ingest` → `agent-general` (port 18789)

**Ollama Docker isolation:**
- Models pulled on VPS host go to `/usr/share/ollama/.ollama/` — NOT visible to container
- Must pull inside container: `docker exec ollama ollama pull <model>`

**pplx-embed-context-v1:**
- Model: `argus-ai/pplx-embed-context-v1-0.6b:fp32` (2.4GB, MIT licence)
- Produces 1024-dim embeddings. CPU inference — slow but free.
- Score calibration: strong match 0.485–0.525 | noise 0.359–0.404 | threshold 0.45

**Phase 5 design (locked):**
- Qdrant top 6 chunks, min score 0.45, max 8 results
- Re-rank by court hierarchy (CCA/FullCourt > Supreme > Magistrates) within 0.05 score band
- Full metadata per chunk
- Console toggle: Workers AI (default) / Claude API
- Claude API: `claude-sonnet-4-20250514` via Anthropic API key (wrangler secret)
- Workers AI: `@cf/meta/llama-3.1-8b-instruct` via Cloudflare

---

## D1 SCHEMA (current)

**secondary_sources:** id, title, raw_text, enriched_text (NULL for corpus — raw_text is embedded), enriched (1), embedded (0/1), enrichment_error
**cases:** id, enriched (0/1), embedded (0/1), enrichment_error
**legislation:** id, title, jurisdiction, year, embedded (0/1)
**legislation_sections:** id, legislation_id, section_number, heading, text, part

⚠️ KNOWN ISSUE — Chunk ID collision: `Evidence Act 2001 (Tas) s 38` exists as TWO distinct chunks in master_corpus.md (L27997 general doctrine, L28761 procedural sequence). D1 only has ONE — whichever was inserted second. Scope of ID collisions across full corpus unknown — audit required before next ingest.

---

## PIPELINE ROUTES (Worker v11)

All routes require `X-Nexus-Key` header:

| Route | Method | Purpose |
|---|---|---|
| `/api/pipeline/status` | GET | Counts: total, enriched, embedded, errored |
| `/api/pipeline/fetch-unenriched` | GET | Returns enriched=0 rows |
| `/api/pipeline/fetch-for-embedding` | GET | Returns enriched=1, embedded=0 rows |
| `/api/pipeline/fetch-embedded` | GET | Returns all embedded=1 IDs |
| `/api/pipeline/fetch-legislation-for-embedding` | GET | Returns legislation sections where legislation.embedded=0 |
| `/api/pipeline/fetch-sections-by-reference` | POST | BM25: fetches legislation_sections + secondary_sources by section_number |
| `/api/pipeline/write-enriched` | POST | Writes enriched_text, sets enriched=1 |
| `/api/pipeline/mark-embedded` | POST | Sets embedded=1 (batched, max 99 per D1 call) |
| `/api/pipeline/mark-legislation-embedded` | POST | Sets legislation.embedded=1 for list of leg_ids |
| `/api/pipeline/reset-embedded` | POST | Sets embedded=0 (batched, max 99 per D1 call) |

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

# Embed pass (corpus + legislation)
python3 enrichment_poller.py --mode embed --batch 100

# Background loop
nohup python3 enrichment_poller.py --mode embed --batch 100 --loop > embed.log 2>&1 &

# Reconcile (diff D1 vs Qdrant, reset missing to embedded=0)
python3 enrichment_poller.py --mode reconcile

# Check Qdrant point count
curl -s http://localhost:6334/collections/general-docs-v2 | python3 -m json.tool | grep points_count
```

**Poller embed fallback logic:** Uses `enriched_text` if present, falls back to `raw_text`. For the 662 corpus chunks, `enriched_text` is NULL so `raw_text` is used — this is correct and intentional.

---

## CORPUS STATE & KNOWN ISSUES

**secondary_sources corpus (662 chunks):**
- Pre-enriched manually via ChatGPT before upload — raw_text IS the enriched content
- enriched_text is NULL across all 662 rows — this is correct, do NOT run `--mode enrich` on these
- Vectors rebuilt from raw_text this session — all 662 are now valid
- Source: `master_corpus.md` + `block_*.txt` files in repo root

**Known corpus integrity issues:**
1. **Chunk ID collision** — `Evidence Act 2001 (Tas) s 38` is duplicated. Scope unknown — full audit needed.
2. **Practical/procedural content stripped** — the enrichment process that produced master_corpus.md sanitised informal practitioner notes into formal doctrine chunks. Lost content includes:
   - block_027: "Quick soldiers 5 on PIS s. 38" workflow, scripted examination question templates
   - block_020: NOTE -- annotations, Quick differences tables, 1 scripted question
   - block_008, block_024: NOTE -- annotations
   - block_021: GAV NOTE: annotation
   - block_007: Quick links section
3. **No `type: procedure` chunk category** — practitioner workflow content needs different treatment from doctrine. Not yet implemented.

---

## PRIORITIES — NEXT SESSION

### Priority 1 — Corpus ID collision audit
Scan master_corpus.md for all duplicate chunk IDs. Confirm scope. Fix collisions by appending a disambiguator (e.g. `-doctrine`, `-procedure`) before next ingest run.

### Priority 2 — Re-process block_027 (s 38 practical content)
Extract from block_027.txt:
- "Quick soldiers 5 on PIS s. 38" full workflow
- Scripted examination question templates (PROCEEDING TO S 38 sections)
Create as new chunks with unique IDs (e.g. `Evidence Act 2001 (Tas) s 38 — Practical Workflow`). Upload via console.

### Priority 3 — Define `type: procedure` chunk format
Write an enrichment prompt that PRESERVES rather than sanitises:
- Step sequences
- Scripted questions
- Tactical notes and practitioner commentary
Apply to blocks 020, 008, 024, 021, 007 after block_027.

### Priority 4 — Re-process remaining affected blocks
blocks 020, 008, 024, 021, 007 — extract stripped informal/practical content, upload as procedure chunks.

### Priority 5 — Schema versioning
Add `embedding_model` TEXT and `embedding_version` TEXT columns to `secondary_sources` and `legislation_sections`. Backfill current rows with `pplx-embed-context-v1-0.6b` / `1.0`. Prevents painful audits on future embedding model migrations.

### Priority 6 — LLM metadata extraction for scraper
Replace regex-based case metadata extraction in scraper with LLM extraction (Workers AI). Must be done BEFORE scraper resumes — regex will eventually break on AustLII HTML variation.

### Priority 7 — Resume scraper
Only after Priorities 1-6 complete. Run from `Local Scraper/` directory:
```powershell
python austlii_scraper.py
```

---

## FUTURE ROADMAP

- **Legislation enrichment via Claude API** — add plain English summaries, cross-references, key concepts to legislation vectors. Do AFTER cross-reference agent design is clear so enrichment prompt supports that use case specifically.
- **Cross-reference agent** — nightly cron, citation graph in D1. "What cases cite s 138 most often?" High differentiation value.
- **Auto-populate legislation metadata on upload** — Claude API reads filename/first page, populates title/jurisdiction/year fields. Prevents typo slugs. Low complexity, high daily-use value.
- **BM25 improvements** — current implementation is query-text-only ref extraction. Future: also extract refs from returned chunks with noise filtering, or implement proper BM25 scoring rather than score:0.0 appending.
- **Cross-jurisdiction retrieval synonyms** — query expansion layer. Validate baseline retrieval quality first.
- **Doctrinal normalisation pass** — unify citation formats, remove duplicates, normalise metadata. After retrieval quality validated.
- **Console status indicator** — show enriched/embedded progress per document after upload.
- **Performance evaluation** — Claude API vs Workers AI response quality comparison once corpus validated.
- **BM25 pre-retrieval** — DONE (basic implementation live). Full BM25 scoring and hybrid ranking is a future improvement.

---

## SCRAPER CONFIG (file is authoritative)
- Courts: TASSC, TASCCA, TASFC, TAMagC
- Years: `range(2025, 2004, -1)` — 2025 to 2005 inclusive
- `MAX_CASES_PER_SESSION`: 100
- Delays: 10–20s random
- Business hours: 08:00–18:00 AEST
- Proxy: `arcanthyr.com/api/legal/fetch-page` — routes fetches via Cloudflare edge (VPS IP blocked by AustLII — run scraper locally only)
- Progress file: `scraper_progress.json` — deleted for clean slate
- Previously ingested: TASSC 2025 (1–17), TASCCA 2025 (1–16), partial TASFC 2025

---

## KEY FILE LOCATIONS

| File | Path |
|---|---|
| enrichment_poller.py | `Arc v 4/enrichment_poller.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| server.py (nexus) | `Arc v 4/arcanthyr-nexus/server.py` (local, gitignored) · `~/ai-stack/agent-general/src/server.py` (VPS) |
| ingest_corpus.py | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\ingest_corpus.py` (untracked, outside repo) |
| master_corpus.md | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\master_corpus.md` |
| block_*.txt | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\` (source blocks) |
| Worker.js | `Arc v 4\Worker.js` |
| CLAUDE.md | `Arc v 4\CLAUDE.md` |
| austlii_scraper.py | `Local Scraper/` (not in git) |
| docker-compose.yml | `~/ai-stack/docker-compose.yml` (VPS) |
| split_legal_doc.py | repo root — document splitter |

---

## MIGRATION HISTORY (recent)

- **This session:** Legislation embedding migrated to pipeline v2 (poller handles legislation, nexus call removed from Worker). Worker v9→v11. BM25 pre-retrieval implemented in server.py. Corpus re-embedded from raw_text (enriched_text was NULL across all 662 rows — vectors were previously meaningless). D1 100-param limit fixed in handleResetEmbedded, handleMarkEmbedded, handleMarkLegislationEmbedded. Qdrant verify retries increased to 5, pre-sleep to 2s. Reconcile pass confirmed 1935 points valid.
- **Previous session:** Embedding: `nomic-embed-text` (768-dim) → `argus-ai/pplx-embed-context-v1-0.6b:fp32` (1024-dim, MIT). Qdrant: `general-docs` deleted → `general-docs-v2`. D1 wipe: `cases` + `legal_principles` deleted. Security incident resolved: `.env` exposed via Wrangler. Worker.js v9: fire-and-forget nexus removed, pipeline v2 routes added. enrichment_poller.py written and deployed.
