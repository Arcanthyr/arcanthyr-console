# CLAUDE.md — Arcanthyr Session Handover
*Updated: 14 March 2026*

---

## SESSION RULES
- Open every session by reading this file first.
- Diagnose from actual output before recommending fixes.
- Run `git add -A`, `git commit`, `git push origin master` separately after every `npx wrangler deploy` — PowerShell does not support `&&`.
- Before every deploy: verify upload list shows only files from `public/` — if `.env` or `.git` appear, stop immediately.
- Suggest context window restart proactively when conversation grows long.
- **Claude Code (CC) is available in VS Code** — use it for all file edits, script runs, and terminal work. Hand off to CC with explicit instructions rather than describing changes for Tom to make manually. CC cannot establish SSH connections — Tom opens SSH tunnels, CC handles everything else.
- **wrangler d1 execute must be run from `Arc v 4/` directory** where `wrangler.toml` lives — not from repo root. Always add `--remote` flag for live D1.
- **PowerShell execution policy** — if npx is blocked: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
- **grep does not exist in PowerShell** — use `Select-String` instead, or run grep on VPS SSH terminal.

---

## TOOLING
- **Claude.ai (chat)** — architecture decisions, planning, debugging from output, writing CLAUDE.md, reviewing code before deploy
- **Claude Code (VS Code)** — file edits, running scripts, terminal commands, git operations, wrangler deploys
- **PowerShell (local)** — SSH to VPS, scp file transfers, anything CC can't do

---

## SYSTEM STATE (as of 14 Mar 2026)

| Component | Status |
|---|---|
| Qdrant collection | `general-docs-v2` · ~1984 points (embed pass in progress) · 1024-dim cosine |
| Embedding model | `argus-ai/pplx-embed-context-v1-0.6b:fp32` (Ollama, VPS Docker) |
| Score threshold | 0.45 (empirically validated) |
| D1 `cases` | 0 rows — clean slate |
| D1 `secondary_sources` | 711 rows · enriched=1, embedded=in progress · category column added |
| D1 `legislation` | 5 Acts · embedded=1 · 1272 sections in Qdrant |
| Qdrant corpus vectors | 711 secondary_source vectors being embedded (was 662, now 711 after collision fix) |
| Qdrant legislation vectors | 1272 valid legislation section vectors |
| Worker.js | v12 deployed (1c2ec9a7) |
| enrichment_poller.py | In repo + VPS · now includes category in Qdrant payload |
| server.py | pplx-embed + general-docs-v2 + threshold 0.45 + BM25 pre-retrieval LIVE |
| Phase 5 | VALIDATED — Workers AI and Claude API both returning results via console search page |
| BM25 pre-retrieval | LIVE |
| ingest_corpus.py | Updated — reads `[CATEGORY:]` → writes to category column in D1 |

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

**Secondary sources corpus — IMPORTANT:**
- 711 rows, all enriched=1 (set manually — raw_text is the content, no Claude API enrichment needed)
- enriched_text is NULL across all rows — this is correct, poller falls back to raw_text
- Do NOT run `--mode enrich` on these rows

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

**server.py (nexus):**
- Lives in `agent-general/src/` — volume-mounted
- Local copy: `Arc v 4/arcanthyr-nexus/server.py` (gitignored)
- Update: edit locally → SCP → `docker compose restart agent-general` → test

**SCP commands:**
```powershell
# enrichment_poller.py
scp "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\enrichment_poller.py" tom@31.220.86.192:~/ai-stack/agent-general/src/

# server.py
scp "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\arcanthyr-nexus\server.py" tom@31.220.86.192:~/ai-stack/agent-general/src/server.py
```

---

## D1 SCHEMA (current)

**secondary_sources:** id, title, source_type, author, date_published, tags, related_cases, related_acts, raw_text, chunk_count, date_added, enriched_text, enriched, embedded, enrichment_error, category ← new
**cases:** id, enriched (0/1), embedded (0/1), enrichment_error
**legislation:** id, title, jurisdiction, act_type, embedded (0/1)
**legislation_sections:** id, leg_id, section_number, section_title, content, section_reference

---

## WORKER ROUTES

All routes require `X-Nexus-Key` header:

| Route | Method | Purpose |
|---|---|---|
| `/api/legal/upload-corpus` | POST | Ingest secondary source chunk |
| `/api/legal/upload-case` | POST | Ingest case (Workers AI enrichment inline) |
| `/api/pipeline/fetch-unenriched` | GET | Returns enriched=0 rows |
| `/api/pipeline/fetch-for-embedding` | GET | Returns enriched=1, embedded=0 rows — now includes category |
| `/api/pipeline/fetch-embedded` | GET | Returns all embedded=1 IDs |
| `/api/pipeline/fetch-legislation-for-embedding` | GET | Returns legislation sections where legislation.embedded=0 |
| `/api/pipeline/fetch-sections-by-reference` | POST | BM25: fetches legislation_sections + secondary_sources by section_number |
| `/api/pipeline/write-enriched` | POST | Writes enriched_text, sets enriched=1 |
| `/api/pipeline/mark-embedded` | POST | Sets embedded=1 (batched, max 99 per D1 call) |
| `/api/pipeline/mark-legislation-embedded` | POST | Sets legislation.embedded=1 for list of leg_ids |
| `/api/pipeline/reset-embedded` | POST | Sets embedded=0 (batched, max 99 per D1 call) |

---

## ENRICHMENT POLLER — OPERATION

**Location:** `Arc v 4/enrichment_poller.py` (repo) · `~/ai-stack/agent-general/src/` (VPS)

**Environment:**
```bash
set -a && source ~/ai-stack/.env && set +a
```

**Run commands:**
```bash
# Status
python3 enrichment_poller.py --status

# Embed pass
python3 enrichment_poller.py --mode embed --batch 100

# Background loop
nohup python3 enrichment_poller.py --mode embed --batch 100 --loop > embed.log 2>&1 &

# Reconcile
python3 enrichment_poller.py --mode reconcile

# Check Qdrant point count
curl -s http://localhost:6334/collections/general-docs-v2 | python3 -m json.tool | grep points_count
```

---

## CORPUS STATE

**secondary_sources (711 chunks):**
- Pre-enriched via ChatGPT Master Prompt before upload — raw_text IS the content
- enriched_text NULL across all rows — correct, do NOT run `--mode enrich`
- All 244 original CITATION IDs were unique after collision fix (was 196 unique, 48 dropped)
- 711 rows after re-ingest (splitter produces more granular chunks than citation count suggests)
- category column populated: all current rows = doctrine
- Embed pass in progress as of 14 Mar 2026 — expected final Qdrant count: ~1984

**Corpus files:**
- `master_corpus.md` — lives in `Arc v 4/` (not repo root)
- `block_*.txt` — source blocks in repo root
- `ingest_corpus.py` — in repo root, must be run from `Arc v 4/` directory

---

## CORPUS INTEGRITY (resolved this session)

- ✅ Chunk ID collision audit complete — 29 duplicate groups resolved, 48 IDs disambiguated
- ✅ `[CATEGORY: doctrine]` added to all 244 citation blocks
- ✅ category column added to D1, Worker.js, ingest_corpus.py, enrichment_poller.py
- ✅ 2 orphan placeholder chunks (block_026 + [REVIEW]) deleted
- ✅ Full re-ingest from clean corpus — 711 rows in D1
- ✅ Qdrant secondary_source vectors wiped and rebuilding from clean corpus

---

## RAG WORKFLOW — PROMPT DEVELOPMENT

**Document:** `RAG_Workflow_Arcanthyr_v1.docx` (manually updated this session)

Two prompts now available:

| Prompt | Use for | Output TYPE values |
|---|---|---|
| Master Prompt (Section 6) | Doctrinal content — legislation, cases, legal rules | legal doctrine, evidentiary rule, case authority, etc. |
| Procedure Prompt (Section 6A) | Practitioner content — workflows, scripts, checklists, annotations | procedure, script, checklist, annotation |

**Selection rule:**
- Default to Master Prompt
- Switch to Procedure Prompt for blocks containing scripted questions, numbered workflows, bold/italic practitioner notes, or in-court step sequences
- When in doubt: run Master Prompt first, check UNPROCESSED, run Procedure Prompt on flagged sections

**Chunk format compatibility:**
- Both prompts produce the same metadata structure
- `[CATEGORY: doctrine]` vs `[CATEGORY: procedure]` distinguishes chunk type
- Both append to the same `master_corpus.md`

**Known corpus content gap:**
- Procedural/annotation content in blocks 027, 020, 008, 024, 021, 007 was stripped by the Master Prompt during original processing
- block_027 tested against Procedure Prompt this session — output validated
- Remaining blocks to be re-processed when retrieval testing confirms the gap is material
- Decision deferred: run retrieval quality tests against current corpus first before committing to full Hogan on Crime re-processing

---

## PRIORITIES — NEXT SESSION

### Priority 1 — Verify embed pass complete
```bash
curl -s http://localhost:6334/collections/general-docs-v2 | python3 -m json.tool | grep points_count
```
Expected: ~1984 points. If not complete, resume:
```bash
nohup python3 enrichment_poller.py --mode embed --batch 100 --loop > embed.log 2>&1 &
```

### Priority 2 — Retrieval quality testing
Run 10–15 test queries via the console search page. Mix of:
- Doctrinal: "what is the test under s 137", "elements of assault"
- Practitioner: "how do I handle a hostile witness", "s 38 application steps"

Evaluate whether procedural gap is hurting retrieval in practice before deciding on Hogan on Crime re-processing.

### Priority 3 — Schema versioning
Add `embedding_model` TEXT and `embedding_version` TEXT columns to `secondary_sources` and `legislation_sections`. Backfill with `pplx-embed-context-v1-0.6b` / `1.0`.

### Priority 4 — LLM metadata extraction for scraper
Replace regex-based case metadata extraction in scraper with Workers AI extraction. Must be done BEFORE scraper resumes.

### Priority 5 — Resume scraper
Only after Priorities 1–4 complete.

---

## FUTURE ROADMAP

- **Hogan on Crime procedural re-processing** — re-run blocks 027, 020, 008, 024, 021, 007 through Procedure Prompt, upload procedure chunks via console. Full book re-processing only if retrieval testing reveals material gap.
- **Automated ingestion pipeline** — drag-and-drop in console → Claude API enrichment/splitting → embed. For smaller documents. Larger docs (Hogan on Crime scale) stay on manual ChatGPT pipeline.
- **Legislation enrichment via Claude API** — plain English summaries, cross-references, key concepts. After cross-reference agent design is clear.
- **Cross-reference agent** — nightly cron, citation graph in D1.
- **Auto-populate legislation metadata on upload** — Claude API reads filename/first page, populates fields.
- **BM25 improvements** — proper scoring, hybrid ranking.
- **Console status indicator** — show enriched/embedded progress per document after upload.
- **Performance evaluation** — Claude API vs Workers AI response quality comparison once corpus validated.

---

## SCRAPER CONFIG

- Courts: TASSC, TASCCA, TASFC, TAMagC
- Years: `range(2025, 2004, -1)` — 2025 to 2005 inclusive
- `MAX_CASES_PER_SESSION`: 100
- Delays: 10–20s random
- Business hours: 08:00–18:00 AEST
- Proxy: `arcanthyr.com/api/legal/fetch-page`
- Progress file: `scraper_progress.json` — deleted for clean slate
- Previously ingested: TASSC 2025 (1–17), TASCCA 2025 (1–16), partial TASFC 2025
- Do not resume until LLM metadata extraction is implemented (Priority 4)

---

## KEY FILE LOCATIONS

| File | Path |
|---|---|
| enrichment_poller.py | `Arc v 4/enrichment_poller.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| server.py (nexus) | `Arc v 4/arcanthyr-nexus/server.py` (local, gitignored) · `~/ai-stack/agent-general/src/server.py` (VPS) |
| ingest_corpus.py | repo root — run from `Arc v 4/` |
| master_corpus.md | `Arc v 4/master_corpus.md` |
| block_*.txt | repo root |
| Worker.js | `Arc v 4/Worker.js` |
| CLAUDE.md | `Arc v 4/CLAUDE.md` |
| austlii_scraper.py | `Local Scraper/` (not in git) |
| RAG_Workflow_Arcanthyr_v1.docx | manually maintained — prompt reference document |
| docker-compose.yml | `~/ai-stack/docker-compose.yml` (VPS) |
| split_legal_doc.py | repo root |
