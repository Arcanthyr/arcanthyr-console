# Arcanthyr — AI Session Brief
*Last updated: 10 March 2026*

---

## 1. How to Use This File
AI session briefing + CC operational rules for Arcanthyr console stack.
Fresh Claude.ai session: upload this file, summarise system state in 5 lines, identify top priority, wait for instruction.

---

## 2. Session Rules

**Token discipline — CRITICAL:**
- Never upload whole code files to Claude.ai — CC reads from disk
- Never paste the same file twice in one session
- Paste only targeted findings (10-50 lines), not whole files
- Reset conversation after each Priority item closes

**CC ↔ Claude.ai collaboration pattern (DEFAULT WORKFLOW):**
1. Claude.ai writes a targeted investigation prompt
2. You give it to CC — CC reads files from disk, returns findings only
3. You paste findings (small) back to Claude.ai
4. Claude.ai verifies, diagnoses, writes fix instruction
5. You give fix instruction to CC
6. CC applies fix and confirms locally BEFORE any deploy or commit
7. Claude.ai reviews confirmation — then and only then: deploy + commit

**CC autonomy rules:**
- Act autonomously: targeted single-file bug fix with clear evidence, one-line changes, token renames
- Return findings only (no fix): multi-file changes, architectural impact, anything unclear
- Always escalate to Claude.ai: architectural decisions, new patterns, anything that touches 3+ files

**CC — never do without instruction:**
- Deploy (`npx wrangler deploy`)
- Commit + push to GitHub
- `docker compose build`
- Modify `.claudeignore`, `.gitignore`, `.wranglerignore`, `.env`

**CC — confirm locally before deploy:**
- For Worker.js: verify route logic, check handler exists, confirm no syntax errors
- For server.py: restart container, curl `/health`, curl affected endpoint
- Report confirmation result before deploy is authorised

---

## 3. Command Structure
- Claude.ai = architecture, diagnosis, prompt crafting, verification
- CC = file reads, edits, terminal, local confirmation
- When uncertain mid-session: stop and flag, do not decide unilaterally
- Do not generate speculative code blocks — wait for targeted instruction

---

## 4. Critical Terminal Rules

**PowerShell:**
- NEVER chain with `&&` — run each command separately
- Execution policy fix: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
- `curl` in PowerShell = Invoke-WebRequest — run curl commands on VPS instead
- `scp` must run from local PowerShell, NOT inside SSH session

---

## 5. Current System State

| Component | Status |
|---|---|
| arcanthyr.com | Live — Cloudflare Worker |
| nexus.arcanthyr.com | Live — VPS Docker (port 18789) |
| Qdrant | general-docs-v2 · 458 pts (legislation only) · 1024-dim cosine |
| Evidence Act 2001 | 250 sections D1 · 99 Qdrant chunks ✅ |
| Justices Act 1959 | 198 sections D1 · 82 Qdrant chunks ✅ |
| Police Offences Act 1935 | 152 sections D1 · 79 Qdrant chunks ✅ |
| Misuse of Drugs Act 2001 | 268 sections D1 · 29 Qdrant chunks ✅ |
| Criminal Code Act 1924 | 468 sections D1 · 169 Qdrant chunks ✅ |
| D1 cases | 0 rows — wiped, scraper will rebuild |
| D1 legal_principles | 0 rows — wiped, scraper will rebuild |
| Worker.js | v8 — deployed + committed |
| server.py | v2 — pplx-embed active, threshold 0.45 |
| app.js | v12 |
| Scraper | PAUSED — ready to run, clean slate |
| Git | master up to date (both repos) |

---

## 6. Open Items

### Priority 1 — Next Session
**Hogan on Crime ingest (`master_corpus.md`)**
- All 32 blocks complete and assembled
- Crowley v Murphy citation fixed (line 1393 — `(1981) 34 ALR 496`)
- Sammak and Reid and Swan citations still `[REVIEW]` flagged — resolve via AustLII when available (pre-2005 unreported TASCCA decisions)
- Remaining known issues (George v Rockett / MacLeod duplicates, weak headings) — acceptable for ingest, fix in future pass
- Workflow: run Validation Prompt across `master_corpus.md` → test single chunk POST → fire `ingest_corpus.py`
- `ingest_corpus.py` ready, pointed at `/api/legal/upload-corpus`
- `handleUploadCorpus` deployed (Worker.js v8)

### Priority 2 — Next Session
**Resume scraper**
- Clean slate: `scraper_progress.json` deleted, D1 cases + legal_principles wiped
- Coverage: 2025 → 2005, all four courts (TASSC, TASCCA, TASFC, TAMagC)
- Session limit: 100 cases · delays: 10-20s · business hours: 08:00-18:00 AEST only
- Scraper runs via local Python on Windows, proxied through arcanthyr.com/api/legal/fetch-page
- AustLII only ever sees Cloudflare edge IPs — VPS IP ban irrelevant
- No auto-restart — run manually each session during business hours

### Priority 3 — Backlog
- Fix case name extraction via Llama (replace fragile regex)
- Evaluate pplx-embed-context-v1-0.6b quality after first scraper run — spot check retrieval scores
- Submit AustLII whitelisting request: http://www.austlii.edu.au/austlii/feedback.html
- Fix deploy.ps1 encoding (UTF-8 without BOM)
- Qwen3 inference (needs GPU — deferred)
- Console UI: manual metadata fields at upload time
- Console UI: auto-populate legislation title/jurisdiction/year on drag-and-drop (prevents typo slugs like `police-offenecs`)
- VPS /preprocess endpoint for pandoc + split pipeline (migrate off local terminal)
- Rename `general-docs-v2` to cleaner name on next Qdrant migration
- Doctrinal normalisation pass across master_corpus.md (unify citation formats, deduplicate concepts)
- Add cross-jurisdiction retrieval synonyms to corpus (e.g. "warrantless entry", "hot pursuit", "evidence exclusion risk")

---

## 7. Known Issues

| # | Issue | Notes |
|---|---|---|
| 1 | Evidence Act column garbling | pdfminer can't reconstruct two-column layout |
| 2 | Misuse of Drugs low chunk count | Schedule tables don't parse as semantic chunks |
| 3 | Llama 3b confabulates | Invents citations — WorkersAI for genuine retrieval only |
| 4 | Duplicate citation formats | Both 'TASSC 2024 24' and '[2024] TASSC 24' present |
| 5 | ~41 Criminal Code sections missing | Large/schedule sections truncated at D1 8000 char limit |
| 6 | legislation_extracted duplicates | Same section 5x — Llama extraction quality |
| 7 | Qwen3 too slow | Needs GPU — deferred |
| 8 | deploy.ps1 encoding broken | Run scp + ssh manually as workaround |
| 9 | general-docs-v2 naming | Cosmetic -v2 suffix — no functional impact, rename on next migration |
| 10 | Sammak / Reid and Swan citations | [REVIEW] flagged in master_corpus.md — pre-2005 unreported TASCCA, find via AustLII |
| 11 | George v Rockett / MacLeod duplicates | Minor duplicate chunks in corpus — acceptable for now, fix in future normalisation pass |

---

## 8. Infrastructure

**VPS:** IP `31.220.86.192` · user `tom` · stack `~/ai-stack/`

**Services:**
| Service | Port |
|---|---|
| agent-general | 18789 |
| qdrant-general | 6334 |
| ollama | 11434 |
| n8n | 5678 |
| open-webui | 3000 |

**Ollama models:** `argus-ai/pplx-embed-context-v1-0.6b:fp32` (active — embedding) · `qwen3:8b` · `qwen3:4b` · `qwen2.5:1.5b` · `nomic-embed-text` (retired — do not use)

**IMPORTANT — Ollama Docker vs host:**
- Ollama runs as a Docker container (`container_name: ollama`) with its own model volume (`./ollama-data:/root/.ollama`)
- Models must be pulled INSIDE the container: `docker exec ollama ollama pull <model>`
- Models pulled on the host (`ollama pull`) go to `/usr/share/ollama/.ollama/` and are NOT visible to the container
- If a model exists on host but not in container: copy blobs + manifest from `/usr/share/ollama/.ollama/models/` to `~/ai-stack/ollama-data/models/`

**Cloudflare Worker:** name `arcanthyr-api` · file `Worker.js` · assets `public/` only
D1 binding: `DB` → `arcanthyr` (id: `1b8ca95d-b8b3-421d-8c77-20f80432e1a0`)
AI binding: `AI` (WorkersAI) · Cron: 02:00 UTC → runDailySync

**Nexus auth:** all POST endpoints require `X-Nexus-Key` header
Retrieve: `KEY=$(grep NEXUS_SECRET_KEY ~/ai-stack/.env | cut -d= -f2)`

---

## 9. Nexus Endpoints (port 18789)

| Method | Endpoint | Fields |
|---|---|---|
| GET | /health | — |
| POST | /ingest | text, citation |
| POST | /search | query_text |
| POST | /query | query_text |
| POST | /extract-pdf | pdf_base64 |
| POST | /extract-pdf-ocr | pdf_base64 |
| POST | /delete | citation |

Worker.js routes all PDF extraction through `/extract-pdf-ocr` — not `/extract-pdf`.
Defaults: `top_k=6` (max 8) · `score_threshold=0.45` · `chunk_size=500` · `chunk_overlap=50`
Chunk fields: `text, source, citation, chunk, total_chunks, summary, category, jurisdiction, court, year, outcome, principles, legislation, offences`
Legislation filter: `court=null AND year=null`

---

## 10. Worker.js Endpoint Map (v8)
*Do not invent, rename, or duplicate.*

| Method | Endpoint | Handler |
|---|---|---|
| POST | /api/ai/draft | handleDraft |
| POST | /api/ai/next-actions | handleNextActions |
| POST | /api/ai/weekly-review | handleWeeklyReview |
| POST | /api/ai/axiom-relay | handleAxiomRelay |
| POST | /api/ai/clarify-agent | handleClarifyAgent |
| POST | /api/email/send | handleSendEmail |
| GET | /api/email/contacts | handleGetContacts |
| POST | /api/email/contacts | handleAddContact |
| DELETE | /api/email/contacts/{id} | handleDeleteContact |
| GET | /api/legal/sync-progress | getSyncProgress |
| POST | /api/legal/search-cases | handleSearchCases |
| POST | /api/legal/search-principles | handleSearchPrinciples |
| POST | /api/legal/trigger-sync | runDailySync |
| POST | /api/legal/backfill-year | runYearBackfill |
| POST | /api/legal/upload-case | handleUploadCase |
| POST | /api/legal/upload-corpus | handleUploadCorpus |
| POST | /api/legal/upload-legislation | handleUploadLegislation |
| GET | /api/legal/library | handleLibrary |
| DELETE | /api/legal/library/{id} | handleLibraryDelete |
| POST | /api/legal/section-lookup | handleSectionLookup |
| POST | /api/legal/fetch-page | handleFetchPage (AustLII proxy) |
| GET | /api/entries | all non-deleted, newest first, limit 200 |
| POST | /api/entries | create — id, created_at, text, tag, next, clarify |
| DELETE | /api/entries/{id} | soft-delete single |
| DELETE | /api/entries | soft-delete all |
| PATCH | /api/entries | restore all |

---

## 11. Key File Locations

**Local repos:**
- Main: `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4`
- Nexus: `...\Arc v 4\arcanthyr-nexus`
- GitHub: github.com/Arcanthyr/arcanthyr-console · github.com/Arcanthyr/arcanthyr-nexus

**Main repo (Arc v 4):**
`Worker.js` · `wrangler.toml` · `public/` · `public/styles.css` · `public/legal.html` · `public/app.js` · `schema.sql`
`.env` — excluded from Wrangler + git
`.wranglerignore` — excludes .env, .git, .wrangler, *.py, *.log, *.docx, scraper_progress.json
`.gitignore` — excludes .env, .wrangler, Local Scraper/.env, arcanthyr-nexus/

**Scraper (local only — NOT in git repo):**
- Location: `Local Scraper/` directory (outside Arc v 4 repo)
- `austlii_scraper.py` — main scraper, not version controlled
- `scraper_progress.json` — deleted (clean slate), will be recreated on next run
- `scraper.log` — running log

**Secondary source pipeline (local):**
- `hogan_on_crime.md` — pandoc conversion of Hogan on Crime.docx
- `split_legal_doc.py` — updated splitter
- `rag_blocks/` — 32 blocks (all formatted)
- `ingest_corpus.py` — parser script, POSTs to /api/legal/upload-corpus
- `master_corpus.md` — READY FOR INGEST (all 32 blocks, Crowley v Murphy fixed)

**VPS:**
- server.py: `~/ai-stack/agent-general/src/server.py` (volume-mounted)
- docker-compose: `~/ai-stack/docker-compose.yml`
- secrets: `~/ai-stack/.env`

---

## 12. .claudeignore
Both repos have `.claudeignore`. CC must never read, edit, or act on these files. Recreate if missing.

**Main repo:** `.env · *.pdf · node_modules/ · .wrangler/`
**Nexus repo:** `.env · *.log · *.pdf · deploy.ps1`

---

## 13. Deployment Procedures

**Worker.js — run each separately in PowerShell:**
```
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
npx wrangler deploy
git add -A
git commit -m "message"
git push origin master
```
Before deploy: verify upload list shows ONLY `public/` files. If `.env` or `.git` appear — STOP.
After deploy: git push is mandatory — GitHub drifts if skipped.

**server.py — deploy.ps1 broken (issue #8). Use manually:**
```
scp server.py tom@31.220.86.192:~/server.py
ssh tom@31.220.86.192 "cp ~/server.py ~/ai-stack/agent-general/src/server.py && cd ~/ai-stack && docker compose restart agent-general"
ssh tom@31.220.86.192 "curl -s http://localhost:18789/health"
git add -A
git commit -m "message"
git push origin master
```
Do NOT run `docker compose build` unless Dockerfile changed.
Note: `~/ai-stack` on VPS is NOT a git repo — nexus is tracked via local `arcanthyr-nexus` repo only.

---

## 14. Verification Commands

**Qdrant search test (VPS):**
```
KEY=$(grep NEXUS_SECRET_KEY ~/ai-stack/.env | cut -d= -f2)
curl -s -X POST http://localhost:18789/search \
  -H "Content-Type: application/json" \
  -H "X-Nexus-Key: $KEY" \
  -d '{"query_text": "your query", "top_k": 3, "score_threshold": 0.45}' | python3 -m json.tool
```

**Qdrant count by citation (VPS):**
```
curl -s http://localhost:6334/collections/general-docs-v2/points/count \
  -H "Content-Type: application/json" \
  -d '{"filter": {"must": [{"key": "citation", "match": {"value": "evidence-act-2001-tas"}}]}}' | python3 -m json.tool
```

**Qdrant total count (VPS):**
```
curl -s http://localhost:6334/collections/general-docs-v2/points/count \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -m json.tool
```

**D1 section lookup:**
```
curl -s -X POST https://arcanthyr.com/api/legal/section-lookup \
  -H "Content-Type: application/json" \
  -d '{"title":"Evidence Act 2001","jurisdiction":"Tas","section":"38"}' | python3 -m json.tool
```

**D1 table counts (PowerShell):**
```
npx wrangler d1 execute arcanthyr --remote --command "SELECT 'cases' as tbl, COUNT(*) as count FROM cases UNION ALL SELECT 'legal_principles', COUNT(*) FROM legal_principles UNION ALL SELECT 'secondary_sources', COUNT(*) FROM secondary_sources"
```

**D1 table list:**
```
npx wrangler d1 execute arcanthyr --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

---

## 15. Qdrant / Ingest Rules
- Always delete before re-ingest — upsert adds alongside, does not replace
- citation field is the delete key
- /delete confirmed working end-to-end
- handleLibraryDelete in Worker.js calls nexus /delete automatically (Qdrant only — does NOT wipe D1 cases)
- Verify deletion with count check before re-uploading
- D1 cases/legal_principles require separate wipe via wrangler d1 execute if full reset needed

---

## 16. Docker Rules
- All docker compose commands from `~/ai-stack/`
- Volume mount confirmed: `./agent-general/src:/app/src` — server.py changes need restart only
- `python -u` flag confirmed in docker-compose.yml for both agent containers
- No sudo needed for cp on this machine
- Tesseract + poppler-utils + pdf2image already in Dockerfile.agent — no rebuild needed

---

## 17. Phase 5 Design (Locked)
- Qdrant: top 6 chunks · min score 0.45 · max 8
- Re-rank by court hierarchy within 0.05 band: CCA/FullCourt > Supreme > Magistrates
- LLM routing: Claude API first → Qwen3 local fallback (deferred — GPU needed)
- API key: `npx wrangler secret put ANTHROPIC_API_KEY`

**pplx-embed score calibration (empirically validated 10 Mar 2026):**
| Query type | Score range |
|---|---|
| Strong topical match | 0.485 – 0.525 |
| Off-domain noise | 0.359 – 0.404 |
| Production threshold | 0.45 |

---

## 18. Design Tokens (styles.css)
- `--ink`: #2a2a2a · `--ink-dim`: #f0f0f0 · `--border-heavy`: #b8b3a8
- `--red`: #8B1A1A (headings) · `--blue`: #3a6a9a (active/AI) · `--border`: #ccc8be

---

## 19. Pipeline Notes (legislation uploads only)
- Title must include year: `Evidence Act 2001` — year extracted by regex, do not put in Year field
- Auto-split threshold: 80,000 chars · target 70,000 chars/part
- OCR fallback: pdfminer first → Tesseract if <300 chars/page · expect minutes for large Acts
- Batching: 20 sections/request · supports ~300 sections within 30s Worker timeout
- bodyStartMatch uses 3-stage fallback: `\n(` first, then `\nCapital letter`, then `\n\n`
- All parts store sections under baseid (not part-suffixed ID) — FK integrity across multi-part uploads
- Use authorised PDFs from Tas legislation site for Acts (not AustLII) — definitive versions
- Use AustLII .txt versions for case law where available — cleaner extraction

---

## 20. handleUploadLegislation — Key Architecture (v8)
- `baseid` = legislation ID without part suffix e.g. `criminal-code-act-1924-tas`
- `id` = part-suffixed ID e.g. `criminal-code-act-1924-tas-part-1` (library display only)
- `legislation` table INSERT uses `baseid` with `INSERT OR IGNORE` — Parts 2–N skip silently
- `legislation_sections` rows use `legislation_id = baseid` — all parts share one parent
- Qdrant chunks use `citation = baseid` — consistent with D1 and section-lookup queries
- `handleSectionLookup` queries on `baseid` — three-way alignment confirmed working

---

## 21. Secondary Source Pipeline — Key Architecture

**RAG workflow doc:** `RAG_Workflow_Arcanthyr_v1.docx` (updated splitter script inside)

**Field mapping — RAG metadata → Qdrant/D1:**

| RAG marker | Qdrant field | Notes |
|---|---|---|
| [TYPE:] | category | Direct map |
| [ACT:] | legislation | Direct map |
| [CITATION:] | citation | Delete key — must be unique slug |
| [CASE:] | court | Case citation if chunk is case authority |
| [TOPIC:] | summary | Direct map |
| [DOMAIN:] | jurisdiction | e.g. Tasmanian Criminal Law |
| [CONCEPTS:] | prepended to text | Prefixed as 'Concepts: ...' before embedding |
| Heading text | source | Direct map |

**handleUploadCorpus (Worker.js v8):**
- Accepts pre-formatted single chunk — no re-chunking
- Calls nexus /ingest directly with all fields as received
- D1 INSERT OR IGNORE into secondary_sources using citation as id
- No auth required on this endpoint

**ingest_corpus.py:**
- Reads `master_corpus.md`, splits at `##` / `###` headings
- Extracts all `[FIELD: value]` markers per chunk
- Prepends `Concepts: ...` to text before sending
- Auto-generates citation slug if `[CITATION:]` absent: `secondary-{heading-slug}`
- 1 second delay between requests
- Reports OK / FAIL per chunk + final summary

**Corpus assembly rules:**
- Copy ONLY `## FORMATTED CHUNKS` from each ChatGPT session output
- Run Validation Prompt across full `master_corpus.md` before ingest
- Test single chunk POST before running full pipeline

---

## 22. Scraper Architecture

**austlii_scraper.py** (located in `Local Scraper/` — NOT in git repo):
- Courts: `TASSC`, `TASCCA`, `TASFC`, `TAMagC`
- Years: `range(2025, 2004, -1)` — 2025 down to 2005 inclusive
- Session limit: 100 cases
- Delays: 10–20 seconds random
- Business hours: 08:00–18:00 AEST only (exits silently outside these hours)
- Proxy: all fetches via `arcanthyr.com/api/legal/fetch-page` — AustLII never sees VPS IP
- Progress tracking: `scraper_progress.json` (deleted — clean slate as of 10 Mar 2026)
- No auto-restart — run manually each session
- Upload endpoint: `https://arcanthyr.com/api/legal/upload-case`

**To run:**
```
python austlii_scraper.py
```
Check first 10–15 lines of `scraper.log` after first run to confirm cases ingesting correctly.

---

## 23. D1 Database Architecture

**Tables:**
| Table | Contents | Reset on wipe? |
|---|---|---|
| cases | Raw case records from scraper | Yes — scraper rebuilds |
| legal_principles | Extracted principles per case | Yes — scraper rebuilds |
| legislation | Act metadata (one row per Act) | No — re-upload via UI |
| legislation_sections | Section text for all Acts | No — re-upload via UI |
| secondary_sources | Hogan on Crime + future secondary sources | No — re-upload via ingest_corpus.py |
| entries | Console journal entries | Never wipe |
| email_contacts | Contact list | Never wipe |

**Key design rules:**
- D1 is the source of truth / core repository
- Qdrant is the semantic search layer built on top — can be rebuilt from D1
- Library UI reads from D1 — deleting from library UI wipes Qdrant chunks but NOT D1 cases
- Full reset requires separate `wrangler d1 execute` wipe on cases + legal_principles
- `INSERT OR IGNORE` on legislation table — duplicate uploads skip silently (safe)

---

## 24. Embedding Architecture

**Current model:** `argus-ai/pplx-embed-context-v1-0.6b:fp32` (Ollama, VPS)
**Previous model:** `nomic-embed-text` (retired 10 Mar 2026)
**Collection:** `general-docs-v2` (1024-dim cosine)
**Previous collection:** `general-docs` (768-dim — deleted 10 Mar 2026)

**Why pplx-embed-context-v1:**
- Specifically designed for RAG document chunks where surrounding context matters
- Document-level context awareness baked into chunk embeddings
- Outperforms nomic on contextual retrieval benchmarks (ConTEB: 81.96% vs voyage-context-3 79.45%)
- MIT licence — free, self-hosted via Ollama
- No instruction prefixes required

**Score calibration (empirically validated):**
- Strong topical match: 0.485–0.525
- Off-domain noise: 0.359–0.404
- Production threshold: 0.45

**Migration notes:**
- pplx outputs 1024-dim vs nomic's 768-dim — collections are incompatible, cannot mix
- Future migration: wipe collection, create new at correct dim, re-embed everything
- Before next migration: consider renaming `general-docs-v2` to `arcanthyr-legal` or similar

---

## 25. Operational Rules
**Never:** expose secrets in Worker assets · ingest duplicates · modify Docker stack without reviewing compose · run ingestion without citation IDs · deploy without local confirmation first · pull Ollama models on VPS host (pull inside container instead)

**Always:** delete before re-ingest · confirm ingestion counts · validate search after schema changes · CC confirms fix locally before deploy authorised · git push after every deploy · use authorised Tas legislation PDFs for Acts · check business hours before running scraper

**Core principles:** simplicity first · no temporary fixes · senior developer standard · legal platform — accuracy matters · D1 is source of truth, Qdrant is search index

---

## 26. Future Roadmap (ideas raised, not yet planned)

### Near term
- **Hogan on Crime ingest** — Priority 1 next session (master_corpus.md ready)
- **Scraper restart** — Priority 2 next session (clean slate, 2025→2005, 4 courts)
- **AustLII whitelist request** — submit via feedback form before scraper runs at scale

### Medium term
- **Metadata enrichment via Llama** — replace fragile case name regex with Workers AI Llama 3.1 8B extraction. Extracts: case_name, citation, judge(s), parties, charges, outcome, statutory_provisions → JSON. Add D1 review queue for low-confidence extractions.
- **Cross-reference builder** — nightly cron agent reads new D1 cases, builds citation graph (which cases cite which, statutory provision frequency, judge patterns). Pure D1 — no Qdrant dependency.
- **Agentic BM25 pre-retrieval** — before hitting Qdrant, route user query through Llama iterative D1 keyword search (max 3 rounds). Delivers 15-30% relevance lift over naive keyword baseline. Integrate into Phase 5.
- **Qdrant validation agent** — post-ingest batch: issues test queries, checks chunks match expected cases, flags outliers. Automates current manual keyword validation.

### Phase 5 (conversational interface — design locked)
- Qdrant retrieval: top 6 chunks, min score 0.45, max 8
- Re-rank by court hierarchy within 0.05 band: CCA/FullCourt > Supreme > Magistrates
- Claude API primary → Qwen3 local fallback (needs GPU)
- API key: `npx wrangler secret put ANTHROPIC_API_KEY`
- Agentic BM25 pre-retrieval step (see above)

### Longer term
- Extended scraper: Tasmanian legislation, second reading speeches, magistrates decisions
- Online research agent for recent decisions not yet in corpus (HIGH RISK — needs strict guardrails)
- Console UI auto-populate legislation metadata on drag-and-drop
- Doctrinal normalisation pass across corpus (unify citations, cross-jurisdiction synonyms)
- pplx-embed-context-v1 quality validation after first full scraper run

### Model allocation policy
| Task | Model | Cost |
|---|---|---|
| Embeddings | pplx-embed-context-v1-0.6b (Ollama/VPS) | Free |
| Metadata extraction | Llama 3.1 8B (Workers AI) | Free |
| Agentic BM25 | Llama 3.1 8B (Workers AI) | Free |
| Conversational interface | Claude API → Qwen3 fallback | Pay per use |

Rule: Llama for all background/pipeline work. Claude API only for user-facing conversational interface.
