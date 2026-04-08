# CLAUDE.md — Arcanthyr Session Handover
*Updated: 15 March 2026*

---

## SESSION RULES
- Open every session by reading this file first.
- Diagnose from actual output before recommending fixes.
- Run `git add -A`, `git commit`, `git push origin master` separately after every `npx wrangler deploy` — PowerShell does not support `&&`.
- Before every deploy: verify upload list shows only files from `public/` — if `.env` or `.git` appear, stop immediately.
- Suggest context window restart proactively when conversation grows long.
- **Claude Code (CC) is available in VS Code** — use it for all file edits, script runs, and terminal work. Hand off to CC with explicit instructions rather than describing changes for Tom to make manually. CC cannot establish SSH connections — Tom opens SSH tunnels, CC handles everything else.
- **wrangler d1 execute must be run from `Arc v 4/` directory** where `wrangler.toml` lives — not from repo root. Always add `--remote` flag for live D1.
- **PowerShell execution policy** — ALWAYS run this first in every new PowerShell session before any npx/wrangler command: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
- **grep does not exist in PowerShell** — use `Select-String` instead, or run grep on VPS SSH terminal.
- **PowerShell heredoc / &&** — neither works. Run commands one at a time. No `&&`. No `<<'EOF'`.
- **CC brief pattern** — always ask CC to read relevant files and report current state before making changes. Never assume file contents.

---

## TOOLING
- **Claude.ai (chat)** — architecture decisions, planning, debugging from output, writing CLAUDE.md, reviewing code before deploy
- **Claude Code (VS Code)** — file edits, running scripts, terminal commands, git operations, wrangler deploys
- **PowerShell (local)** — SSH to VPS, scp file transfers, anything CC can't do

---

## SYSTEM STATE (as of 15 Mar 2026)

| Component | Status |
|---|---|
| Qdrant collection | `general-docs-v2` · **1984 points** · 1024-dim cosine · embed pass COMPLETE |
| Embedding model | `argus-ai/pplx-embed-context-v1-0.6b:fp32` (Ollama, VPS Docker) |
| Score threshold | 0.45 (empirically validated) |
| D1 `cases` | 8 rows — 2026 scrape batch (TASSC 1–6, TASFC 1–2) · judge + parties backfilled |
| D1 `secondary_sources` | 711 rows · enriched=1, embedded=1 · category=doctrine · embedding_model + embedding_version populated |
| D1 `legislation` | 5 Acts · embedded=1 · 1272 sections in Qdrant · embedding_model + embedding_version populated |
| Worker.js | Latest deployed (a66e5b44) |
| enrichment_poller.py | In repo + VPS · includes category in Qdrant payload |
| server.py | pplx-embed + general-docs-v2 + threshold 0.45 + BM25 pre-retrieval LIVE |
| Phase 5 | VALIDATED — citation discipline rules live, hallucination significantly reduced |
| BM25 pre-retrieval | LIVE |
| Frontend | Dark Gazette theme deployed — see Frontend section below |

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
| Scraped cases (bulk) | Workers AI / Llama 3.1 8B — in Worker at ingest time | Free, automated, NOT via VPS poller |
| Manual case uploads | Workers AI / Llama — same Worker path | NOT via VPS poller |
| Secondary sources corpus | None — raw_text IS the content (pre-enriched manually via ChatGPT) | embed raw_text directly |
| Legislation | None — raw statutory text embedded directly | |
| Future secondary source uploads (small volume) | Claude API via poller | Acceptable for low volume |

The VPS poller's Claude API enrichment path is for small-volume secondary source uploads ONLY. Scraped cases are enriched by Workers AI (Llama 3.1 8B) inside the Worker at ingest time — never through the poller.

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

Note: BM25 extracts refs from QUERY TEXT ONLY — not from returned chunks — to avoid cascade noise.

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

## D1 SCHEMA (current — fully updated 15 Mar 2026)

**cases:**
id, citation, court, case_date, case_name, url, facts, issues, holding, principles_extracted,
processed_date, summary_quality_score, raw_text, holdings_extracted, legislation_extracted,
authorities_extracted, enriched, embedded, enrichment_error, **judge** ← new, **parties** ← new

**secondary_sources:**
id, title, source_type, author, date_published, tags, related_cases, related_acts, raw_text,
chunk_count, date_added, enriched_text, enriched, embedded, enrichment_error, category,
**embedding_model** ← new, **embedding_version** ← new

**legislation:**
id, title, jurisdiction, act_type, embedded

**legislation_sections:**
id, legislation_id, section_number, heading, text, part,
**embedding_model** ← new, **embedding_version** ← new

**email_contacts:**
id, name, email, created_at

**entries:**
id, created_at, text, tag, next, clarify, draft, _v, deleted

---

## WORKER ROUTES

All routes require `X-Nexus-Key` header:

| Route | Method | Purpose |
|---|---|---|
| `/api/legal/upload-corpus` | POST | Ingest secondary source chunk |
| `/api/legal/upload-case` | POST | Ingest case (Workers AI enrichment inline) |
| `/api/legal/reprocess-case` | POST | Re-run summarizeCase() on existing case from raw_text — updates judge, parties, processed_date ONLY |
| `/api/pipeline/fetch-unenriched` | GET | Returns enriched=0 rows |
| `/api/pipeline/fetch-for-embedding` | GET | Returns enriched=1, embedded=0 rows — includes category |
| `/api/pipeline/fetch-embedded` | GET | Returns all embedded=1 IDs |
| `/api/pipeline/fetch-legislation-for-embedding` | GET | Returns legislation sections where legislation.embedded=0 |
| `/api/pipeline/fetch-sections-by-reference` | POST | BM25: fetches legislation_sections + secondary_sources by section_number |
| `/api/pipeline/write-enriched` | POST | Writes enriched_text, sets enriched=1 |
| `/api/pipeline/mark-embedded` | POST | Sets embedded=1 (batched, max 99 per D1 call) |
| `/api/pipeline/mark-legislation-embedded` | POST | Sets legislation.embedded=1 for list of leg_ids |
| `/api/pipeline/reset-embedded` | POST | Sets embedded=0 (batched, max 99 per D1 call) |

**IMPORTANT — `/api/legal/upload-case` hard-rejects duplicate citations (line 149).** To re-extract fields on an existing case, use `/api/legal/reprocess-case` instead.

---

## CASE EXTRACTION PIPELINE (Worker — Llama 3.1 8B)

The `summarizeCase()` function in Worker.js runs a two-pass Llama extraction for cases over ~6,000 chars, single-pass for shorter cases.

**Fields extracted:**
- Pass 1: `case_name`, `facts`, `issues`, `judge`, `parties`
- Pass 2: `holdings`, `legislation`, `key_authorities` (with treatment: applied/followed/distinguished/mentioned), `principles`

**Jurisdiction anchoring (in prompt):**
- All prompts open with: "You are extracting verified legal information from a Tasmanian court judgment. Primary jurisdiction is Tasmania."
- Legislation must be extracted verbatim from the case text — Llama must NOT recall or infer legislation names from training knowledge
- `_sanitiseLegislation()` post-processes refs to append `(Tas)` if no jurisdiction suffix present

**`_buildSummary()` note:**
- Uses `asString(val, fallback)` helper — `!val` catches null/undefined/empty string
- Watch for Llama returning literal string `"null"` — `!val` won't catch it, `"null"` would be written to D1
- `judge` and `parties` use `?? null` coercion before D1 bind to prevent D1_TYPE_ERROR on undefined

**Backfill script:** `Arc v 4/reprocess_cases.ps1`
- Loops citations, POSTs to `/api/legal/reprocess-case`
- Reads `NEXUS_KEY` from `$env:NEXUS_KEY`
- Response wrapped as `{ result: { ... } }` — access fields as `$Response.result.judge`
- Usage:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
$env:NEXUS_KEY = "your-key-here"
.\reprocess_cases.ps1
```

---

## PHASE 5 — QUERY PIPELINE

**Citation discipline rules (live as of 15 Mar 2026):**
Both Workers AI and Claude API paths now include citation grounding rules in the user turn (after contextBlocks, before answerNote):

- Workers AI path: trimmed single-sentence rule (prompt length sensitive — verbose rules caused Worker CPU timeout)
- Claude API path: full citation discipline block

**Rule summary:** Only cite cases and legislation appearing explicitly in retrieved source material. If sources lack specific authority, say so. Do not generate citations from training knowledge.

**Workers AI timeout risk:** Workers AI (Llama 3.1 8B) is sensitive to prompt length. Keep citation rules in the Workers AI path concise. If queries start timing out, suspect prompt length first.

**Phase 5 design (locked):**
- Qdrant top 6 chunks, min score 0.45, max 8
- Re-rank by court hierarchy (CCA/FullCourt > Supreme > Magistrates) within 0.05 band
- Full metadata per chunk
- Claude API first, Workers AI fallback

---

## RETRIEVAL QUALITY TESTING (15 Mar 2026)

15 queries run. Key findings:

**Working well:**
- Legislation retrieval — Acts and sections surfacing correctly
- s 38 procedure (Q11) — excellent, step-by-step with correct section references
- Citation discipline rules — hallucinated citations eliminated after fix

**Corpus gaps confirmed:**
- Recklessness fault element — no Tasmanian Criminal Code doctrine chunks
- Tendency evidence doctrine — partial (Brown v Tasmania, McPhillamy correct; procedure missing)
- Sentencing first offenders — no specific material
- Corroboration — no material

**Procedural content gap confirmed:**
- Q12 (hostile witness handling) — complete retrieval failure, returned irrelevant Criminal Code sections
- Q14 (examination in chief leading questions) — poor
- Q15 (witness refuses to answer) — confused Justices Act committal with Evidence Act compellability

Hogan on Crime procedural re-processing is justified — see Priority 1 below.

---

## FRONTEND (Dark Gazette theme — deployed 15 Mar 2026)

**Pages:**
| File | Purpose |
|---|---|
| `index.html` | Landing — sigil hero, nav bar added, centred layout, blue pulse-hover buttons |
| `console.html` | Merged console + search — query card, answer card, sources card, Axiom Relay |
| `email.html` | New standalone email page — compose form + contacts |
| `legal.html` | Legal research — Cases/Legislation/Secondary Sources/Library tabs |
| `search.html` | DELETED — merged into console.html |

**Structural changes from previous version:**
- Input card and Recent Entries removed from console
- Email Centre moved to own page
- search.html deleted, merged into console.html
- Nav bar added to index.html
- legal.html width overflow fixed (table replaced with lib-item rows)
- Library tab — expandable sections grouped by category

**Design tokens (styles.css v4):**
- `--bg`: `#0e0e0e` · `--surface`: `#1a1a1a` · `--surface-raise`: `#242424`
- `--text`: `#f0ece4` · `--text-mid`: `#b8b0a4` · `--text-dim`: `#706860`
- `--border`: `#2e2e2e` · `--border-heavy`: `#444`
- `--red`: `#a82020` · `--blue`: `#3a6a9a` · `--blue-dim`: `#0e1e30`
- `--green`: `#3a6a3e` · `--ink`: `#f0ece4`
- `--gold` and `--gold-dim` REMOVED — replaced entirely with blue tokens
- Max-width: 800px · Top-rule cards (no box borders) · Times New Roman headings/buttons
- Output/generated text areas (answer, sources, relay): Georgia serif
- `.btn-primary`: blue bg, white text, Times New Roman, pulse-blue hover animation
- Nav sigil: `sigil.jpg` at 36px height on all pages

**Bug fixes in this session:**
- `--text-primary` → `--text` in app.js
- `contactsModal.style.display` null guard added
- `lookupLegislationRef` defined in legal.html inline script
- `--gold`/`--gold-dim` undefined tokens globally fixed

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

# Find embed log
find ~/ -name "embed.log" 2>/dev/null
# Usually at: ~/ai-stack/agent-general/src/embed.log
```

---

## CORPUS STATE

**secondary_sources (711 chunks):**
- Pre-enriched via ChatGPT Master Prompt before upload — raw_text IS the content
- enriched_text NULL across all rows — correct, do NOT run `--mode enrich`
- All 244 original CITATION IDs unique after collision fix
- category column: all current rows = doctrine
- Embed pass COMPLETE as of 15 Mar 2026 — 1984 points in Qdrant confirmed

**Corpus files:**
- `master_corpus.md` — lives in `Arc v 4/` (not repo root)
- `block_*.txt` — source blocks in repo root
- `ingest_corpus.py` — in repo root, must be run from `Arc v 4/` directory

---

## RAG WORKFLOW — PROMPT DEVELOPMENT

**Document:** `RAG_Workflow_Arcanthyr_v1.docx` (manually maintained)

Three prompts available:

| Prompt | Section | Use for | CATEGORY value |
|---|---|---|---|
| Master Prompt | Section 6 | Doctrinal content — legislation, cases, legal rules | doctrine |
| Procedure Prompt | Section 6A | Practitioner content — workflows, scripts, checklists, annotations | procedure |
| UNPROCESSED follow-up | Section 6B (TBC) | Doctrinal units flagged UNPROCESSED by Master Prompt | doctrine |

**Processing sequence for new blocks:**
1. Master Prompt → doctrinal chunks
2. Procedure Prompt → practitioner/procedure chunks
3. UNPROCESSED follow-up → catches units flagged by Master Prompt
4. Validation Prompt → quality check (split corpus into two documents if too large for single pass — split at clean citation boundary)

**Procedure Prompt constraint:** Must preserve scripted questions, examination sequences, and tactical notes intact — NOT summarise or sanitise. The practitioner value is in the exact wording and sequence.

**Selection rule:**
- Default to Master Prompt
- Switch to Procedure Prompt for blocks containing scripted questions, numbered workflows, bold/italic practitioner notes, or in-court step sequences
- When in doubt: run Master Prompt first, check UNPROCESSED, run Procedure Prompt on flagged sections

---

## PRIORITIES — NEXT SESSION

### Priority 1 — Procedure chunk re-processing (Hogan on Crime)
Retrieval testing confirmed procedural content gap is material. Process blocks in this order:

1. block_027 (s 38 hostile witness — highest value, Procedure Prompt already validated)
2. block_020
3. block_008
4. block_024
5. block_021
6. block_007
7. Identify tendency evidence block — check which block covers s 97/tendency applications, add to list

For each block: run through Procedure Prompt → review output → append to master_corpus.md → upload via console → confirm embedded.

Also check for blocks with corpus gaps confirmed in retrieval testing:
- Recklessness (Criminal Code fault elements)
- Sentencing principles for first offenders
- Corroboration

### Priority 2 — Broader corpus audit
Before scraper resumes, audit master_corpus.md for procedural content that was formalised by the Master Prompt (no informal markers) and is therefore not flagged by the existing block inventory. Use missed-recall patterns from retrieval testing (Priority 1 above) to identify which topics to audit first.

### Priority 3 — Resume scraper
Only after Priority 1 and 2 have meaningfully improved retrieval quality on practitioner queries.

Pre-scraper checklist:
- [ ] Confirm `summarizeCase()` prompt includes judge and parties (DONE ✅)
- [ ] Confirm scraper routes AustLII fetches via `arcanthyr.com/api/legal/fetch-page` proxy (DONE ✅)
- [ ] Scraper runs locally on Windows — NOT on VPS (VPS IP blocked by AustLII)

### Priority 4 — Cross-reference agent (new D1 tables)
Build two new tables and nightly cron to populate them:

```sql
CREATE TABLE case_citations (
  id TEXT PRIMARY KEY,
  citing_case TEXT,
  cited_case TEXT,
  treatment TEXT,   -- applied|followed|distinguished|mentioned
  why TEXT,
  date_added TEXT
);

CREATE TABLE case_legislation_refs (
  id TEXT PRIMARY KEY,
  citation TEXT,
  legislation_ref TEXT,
  date_added TEXT
);
```

Agent reads `key_authorities` and `legislation_extracted` from D1 cases, builds citation graph. Enables "what cases cite s 138 most often" as a direct D1 lookup. Feeds BM25 and stare decisis layer.

### Priority 5 — Schema versioning backfill for cases
Add `embedding_model` and `embedding_version` to `cases` table (currently only on secondary_sources and legislation_sections). Backfill when cases corpus is populated.

---

## FUTURE ROADMAP

- **Hogan on Crime procedural re-processing** — Priority 1 above. Full book re-processing if retrieval testing reveals further material gaps beyond identified blocks.
- **Legislation enrichment via Claude API** — plain English summaries, cross-references, key concepts. Write enrichment prompt to specifically support cross-reference agent (Priority 4) — not generic summarisation. Do AFTER cross-reference agent design is confirmed.
- **Cross-reference agent** — Priority 4 above. Nightly cron, citation graph in D1. "What cases cite s 138 most often?" High differentiation value.
- **Auto-populate legislation metadata on upload** — Claude API reads filename/first page, populates title/jurisdiction/year fields. Prevents typo slugs. Low complexity, high daily-use value.
- **Automated ingestion pipeline** — drag-and-drop in console → Claude API enrichment/splitting → embed. For smaller documents. Larger docs (Hogan on Crime scale) stay on manual ChatGPT pipeline.
- **BM25 improvements** — proper scoring, hybrid ranking. Current implementation is query-text-only ref extraction. Future: also extract refs from returned chunks with noise filtering.
- **Console status indicator** — show enriched/embedded progress per document after upload.
- **Performance evaluation** — Claude API vs Workers AI response quality comparison once corpus validated.
- **Doctrinal normalisation pass** — after retrieval quality validated. If missed recalls on related concepts confirmed, normalise synonym handling across corpus before adding query expansion layer.
- **Cross-jurisdiction retrieval synonyms** — query expansion layer: intercept search query, expand with synonyms before Qdrant call. Implement only after baseline retrieval quality confirmed.
- **Animated sigil** — if a rotating GIF of the sigil is produced, swap `sigil.jpg` for `sigil.gif` in nav on all pages (same position, same 36px height).

---

## SCRAPER CONFIG

- Courts: TASSC, TASCCA, TASFC, TAMagC
- Years: `range(2025, 2004, -1)` — 2025 to 2005 inclusive
- `MAX_CASES_PER_SESSION`: 100
- Delays: 10–20s random
- Business hours: 08:00–18:00 AEST
- Proxy: `arcanthyr.com/api/legal/fetch-page` — routes fetches via Cloudflare edge (VPS IP blocked by AustLII — run scraper locally only)
- Progress file: `scraper_progress.json` — deleted for clean slate
- Previously ingested: TASSC 2026 (1–6), TASFC 2026 (1–2) — 8 cases total in D1
- Do not resume until Priority 1 (procedural re-processing) is substantially complete

**Scraping workflow (confirmed design):**
```
austlii_scraper.py (local Windows)
    → fetches AustLII HTML via arcanthyr.com/api/legal/fetch-page proxy
    → strips HTML to plain text locally
    → derives citation from URL structure (e.g. /TASSC/2024/42.html → [2024] TASSC 42)
    → derives court_hint from URL path segment (TASSC → supreme)
    → POSTs raw text + citation + court_hint to /api/legal/upload-case
        → Worker: two Llama calls (pass 1: case_name/facts/issues/judge/parties,
                                    pass 2: holdings/legislation/key_authorities/principles)
        → D1: all fields written, enriched=1, embedded=0
    → VPS poller picks up embedded=0 → pplx-embed → Qdrant → embedded=1
```

Note: citation and court derived from URL structure (stable). Llama handles all content fields including case_name, judge, parties. No regex on page HTML body for metadata.

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
| reprocess_cases.ps1 | `Arc v 4/reprocess_cases.ps1` — backfill judge/parties for existing cases |
| RAG_Workflow_Arcanthyr_v1.docx | manually maintained — prompt reference document |
| docker-compose.yml | `~/ai-stack/docker-compose.yml` (VPS) |
| split_legal_doc.py | repo root |

---

## KNOWN ISSUES / WATCH LIST

- **Llama returning literal `"null"` string** — `asString()` helper won't catch this, it would be written to D1 as the string "null". Latent risk, not currently causing issues. Worth a D1 audit after bulk scraping.
- **Workers AI prompt length sensitivity** — verbose prompts cause CPU timeout. Keep Workers AI path prompts concise. If queries timeout, suspect prompt length first.
- **Tendency evidence corpus gap** — doctrine partial (Brown v Tasmania, McPhillamy present), procedure missing. Identify which Hogan on Crime block covers s 97 and add to Priority 1 list.
- **Corroboration corpus gap** — s 64 Evidence Act definition cited by system does NOT exist. Corroboration has largely been abolished under uniform evidence law. Needs a correct doctrine chunk added.
- **AustLII block** — VPS IP (31.220.86.192) permanently blocked by AustLII. Scraper must run locally on Windows only. Fetches route via Cloudflare proxy.
- **Cloudflare Workers Observability disabled** — use `npx wrangler tail arcanthyr-api` in a second PowerShell window for real-time logs during debugging.
