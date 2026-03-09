# Arcanthyr — AI Session Brief
*Last updated: 9 March 2026*

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

This pattern replaces file uploads in almost all cases.

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
| Qdrant | general-docs · ~5500+ pts · 768-dim cosine |
| D1 | cases + legislation + legislation_sections populated |
| Evidence Act 2001 | 249 sections D1 · 98 Qdrant chunks ✅ |
| Justices Act 1959 | 170 sections D1 · 81 Qdrant chunks ✅ |
| Police Offences Act 1935 | 145 sections D1 · 78 Qdrant chunks ✅ |
| Misuse of Drugs Act 2001 | 284 sections D1 · 29 Qdrant chunks ✅ |
| Criminal Code Act 1924 | NOT YET UPLOADED — awaiting OCR test |
| Worker.js | v7 — deployed + committed |
| server.py | v2 — OCR fallback live (/extract-pdf-ocr) |
| app.js | v12 |
| Scraper | PAUSED — resume after Criminal Code resolved |
| Git | master up to date |

---

## 6. Open Items

### Priority 3 — In Progress
**Criminal Code upload**
- OCR pipeline live — test by dragging full PDF into legislation upload form
- Auto-split logic in legal.html — splits at section boundaries, uploads sequentially
- Part IDs: `criminal-code-act-1924-tas-part-1` etc
- Next action: OCR test → confirm extraction quality → ingest

**Resume scraper** — blocked by Criminal Code
- ~20 scraper errors unreviewed
- ~20 cases court=unknown — re-extract from raw_text on resume

### Priority 4 — Backlog
- Fix case name extraction via Llama (replace regex)
- Evaluate pplx-embed-context-v1 as embedding replacement
- Fix deploy.ps1 encoding (UTF-8 without BOM)
- Qwen3 inference (needs GPU — deferred)

---

## 7. Known Issues

| # | Issue | Notes |
|---|---|---|
| 1 | Evidence Act column garbling | pdfminer can't reconstruct two-column layout |
| 2 | Misuse of Drugs low chunk count | Schedule tables don't parse as semantic chunks |
| 3 | ~20 cases court=unknown | Re-extract from raw_text when scraper resumes |
| 4 | Llama 3b confabulates | Invents citations — WorkersAI for genuine retrieval only |
| 5 | Duplicate citation formats | Both 'TASSC 2024 24' and '[2024] TASSC 24' present |
| 6 | ~52 Evidence Act sections missing | Schedule + >8000 char sections truncated at D1 limit |
| 7 | legislation_extracted duplicates | Same section 5x — Llama extraction quality |
| 8 | Qwen3 too slow | Needs GPU — deferred |
| 9 | deploy.ps1 encoding broken | Run scp + ssh manually as workaround |

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

**Ollama models:** nomic-embed-text (active) · qwen3:8b · qwen3:4b · qwen2.5:1.5b (slow)

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
Defaults: `top_k=6` (max 8) · `score_threshold=0.65` · `chunk_size=500` · `chunk_overlap=50`
Chunk fields: `text, source, citation, chunk, total_chunks, summary, category, jurisdiction, court, year, outcome, principles, legislation, offences`
Legislation filter: `court=null AND year=null`

---

## 10. Worker.js Endpoint Map (v7)
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
| POST | /api/legal/extract-pdf | handleExtractPdf → /extract-pdf-ocr |
| POST | /api/legal/upload-legislation | handleUploadLegislation (accepts part_number) |
| POST | /api/legal/upload-secondary | handleUploadSecondarySource |
| GET | /api/legal/library | handleLibraryList |
| DELETE | /api/legal/library/delete/{docType}/{id} | handleLibraryDelete → nexus /delete |
| POST | /api/legal/section-lookup | handleSectionLookup |
| POST | /api/legal/legal-query | handleLegalQuery (Claude API — Phase 5) |
| POST | /api/legal/legal-query-qwen | handleLegalQueryQwen (deferred) |
| POST | /api/legal/legal-query-workers-ai | handleLegalQueryWorkersAI (Llama) |
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

**VPS:**
- server.py: `~/ai-stack/agent-general/src/server.py` (volume-mounted)
- docker-compose: `~/ai-stack/docker-compose.yml`
- secrets: `~/ai-stack/.env`

**Criminal Code split files:** local `CrimCode_Part_*.txt` (9 parts — prefer single PDF via OCR now)

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

**server.py — deploy.ps1 broken (issue #9). Use manually:**
```
scp server.py tom@31.220.86.192:~/server.py
ssh tom@31.220.86.192 "cp ~/server.py ~/ai-stack/agent-general/src/server.py && cd ~/ai-stack && docker compose restart agent-general"
ssh tom@31.220.86.192 "curl -s http://localhost:18789/health"
git add -A
git commit -m "message"
git push origin master
```
Do NOT run `docker compose build` unless Dockerfile changed.

---

## 14. Verification Commands

**Qdrant search test (VPS):**
```
KEY=$(grep NEXUS_SECRET_KEY ~/ai-stack/.env | cut -d= -f2)
curl -s -X POST http://localhost:18789/search \
  -H "Content-Type: application/json" \
  -H "X-Nexus-Key: $KEY" \
  -d '{"query_text": "your query", "top_k": 3, "score_threshold": 0.5}' | python3 -m json.tool
```

**Qdrant count by citation (VPS):**
```
curl -s http://localhost:6334/collections/general-docs/points/count \
  -H "Content-Type: application/json" \
  -d '{"filter": {"must": [{"key": "citation", "match": {"value": "evidence-act-2001-tas"}}]}}' | python3 -m json.tool
```

**D1 section lookup:**
```
curl -s -X POST https://arcanthyr.com/api/legal/section-lookup \
  -H "Content-Type: application/json" \
  -d '{"title":"Evidence Act 2001","jurisdiction":"Tas","section":"38"}' | python3 -m json.tool
```

---

## 15. Qdrant / Ingest Rules
- Always delete before re-ingest — upsert adds alongside, does not replace
- citation field is the delete key
- /delete confirmed working end-to-end
- handleLibraryDelete in Worker.js calls nexus /delete automatically
- Verify deletion with count check before re-uploading

---

## 16. Docker Rules
- All docker compose commands from `~/ai-stack/`
- Volume mount confirmed: `./agent-general/src:/app/src` — server.py changes need restart only
- `python -u` flag confirmed in docker-compose.yml for both agent containers
- No sudo needed for cp on this machine
- Tesseract + poppler-utils + pdf2image already in Dockerfile.agent — no rebuild needed

---

## 17. Phase 5 Design (Locked)
- Qdrant: top 6 chunks · min score 0.72 · max 8
- Re-rank by court hierarchy within 0.05 band: CCA/FullCourt > Supreme > Magistrates
- LLM routing: Claude API first → Qwen3 local fallback (deferred — GPU needed)
- API key: `npx wrangler secret put ANTHROPIC_API_KEY`

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
- bodyStartMatch: `\n\d+[A-Z]?\.?\s+[A-Z][^\n]{3,}\n(` — may fail if first section has no subsections
- Use AustLII .txt versions over PDFs where available — cleaner extraction

---

## 20. Operational Rules
**Never:** expose secrets in Worker assets · ingest duplicates · modify Docker stack without reviewing compose · run ingestion without citation IDs · deploy without local confirmation first

**Always:** delete before re-ingest · confirm ingestion counts · validate search after schema changes · CC confirms fix locally before deploy authorised · git push after every deploy

**Core principles:** simplicity first · no temporary fixes · senior developer standard · legal platform — accuracy matters
