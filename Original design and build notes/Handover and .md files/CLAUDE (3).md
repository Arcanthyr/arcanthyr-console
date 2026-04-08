# Arcanthyr — Claude Code Briefing
*Last updated: 8 March 2026 (evening session)*

---

## How to Use This Document
This file serves as both the Claude Code session briefing and the
handover document for new Claude.ai conversations. When starting a
new Claude.ai session, paste this file and begin from the Open Items
section — current priorities are listed there in order.

---

## Claude.ai Session Management
- At the start of each session, paste this file and confirm understanding before proceeding
- Claude.ai should proactively prompt Tom to update CLAUDE.md and start a fresh conversation when:
  - The conversation exceeds ~40 messages
  - A major milestone is completed (e.g. a full Priority item closed)
  - Responses begin to feel repetitive or context is clearly degrading
  - A large file has been uploaded more than once in the same session
- To update CLAUDE.md: ask Claude.ai to generate a full updated file, download it, and replace the local copy at `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\CLAUDE.md`

**Token efficiency rules:**
- Only upload a file when Claude.ai explicitly asks for it
- Never upload the same file twice in one session — Claude.ai retains it
- For targeted questions, paste only the relevant section rather than the whole file
- Start a new conversation after each Priority item closes, not at the end of a long session

---

## Claude Code (CC) Conventions
- **Before applying any multi-file or multi-edit change**: ask CC to summarise ALL proposed diffs across ALL files in one message, so they can be copied to Claude.ai for review before any individual change is accepted
- Use this prompt: *"Show me all diffs across all files in one summary before applying any of them"*
- CC will then list every before/after block — copy the full output to Claude.ai, get approval, then tell CC to apply
- For targeted, surgical single-file changes (token renames, one-line fixes, column removals): tell CC to apply directly — no diff review needed
- **NEVER chain PowerShell commands with `&&`** — run each separately
- If execution policy errors appear: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

---

## Command and Control Structure
- Claude.ai is the command and control layer — architecture, analysis, diagnosis, and prompt crafting happen there
- Claude Code (VS Code) is the execution layer only — file edits, terminal commands, deploys
- When uncertain about approach or architecture mid-session, stop and flag it rather than deciding unilaterally
- Do not generate large code blocks speculatively — wait for a targeted instruction

---

## Current System State

| Component | Status |
|---|---|
| arcanthyr.com | Live — Cloudflare Worker custom domain |
| nexus.arcanthyr.com | Live — VPS Docker container (port 18789) |
| Qdrant collection | general-docs · ~5500+ pts · 768-dim cosine |
| D1 database | cases + legislation + legislation_sections populated |
| Evidence Act 2001 | 249 sections in D1 · 98 Qdrant chunks ✅ |
| Justices Act 1959 | 170 sections in D1 · 81 Qdrant chunks ✅ |
| Police Offences Act 1935 | 145 sections in D1 · 78 Qdrant chunks ✅ |
| Misuse of Drugs Act 2001 | 284 sections in D1 · 29 Qdrant chunks ✅ (Schedule-heavy) |
| Criminal Code Act 1924 | NOT YET UPLOADED — awaiting OCR deploy test |
| Worker.js | v7 — deployed and committed |
| server.py | v2 — OCR fallback endpoint added (/extract-pdf-ocr) |
| app.js | v12 — upload progress messages updated |
| Scraper | PAUSED — resume after Criminal Code resolved |
| Git | All changes committed to master |

---

## Infrastructure

### VPS (OVH)
- IP: 31.220.86.192
- User: tom
- Stack directory: ~/ai-stack/
- docker-compose.yml lives here

### Services (docker-compose)
| Service | Port |
|---|---|
| agent-general | 18789 |
| qdrant-general | 6334 |
| ollama | 11434 |
| n8n | 5678 |
| open-webui | 3000 |

### Ollama Models
- nomic-embed-text (active)
- qwen3:8b (inactive)
- qwen3:4b (inactive)
- qwen2.5:1.5b (slow)

### Cloudflare
- Worker name: `arcanthyr-api`
- Main file: `Worker.js`
- Assets directory: `public/` (Wrangler deploys only this folder — keep sensitive files out)
- D1 binding: `DB` → database `arcanthyr` (id: `1b8ca95d-b8b3-421d-8c77-20f80432e1a0`)
- AI binding: `AI` (WorkersAI)
- Cron trigger: daily at 02:00 UTC → runDailySync
- Deploy via: `npx wrangler deploy`

### Nexus Authentication
- All `/search` and `/delete` requests to the VPS require header: `X-Nexus-Key`
- Key stored in `~/ai-stack/.env` as `NEXUS_SECRET_KEY`
- Retrieve on VPS with: `KEY=$(grep NEXUS_SECRET_KEY ~/ai-stack/.env | cut -d= -f2)`

### Nexus (server.py) Endpoints
All on port 18789. All POST routes require `X-Nexus-Key` header.

| Method | Endpoint | Purpose | Required fields |
|---|---|---|---|
| GET | `/health` | Health check | — |
| POST | `/ingest` | Embed + store text chunks in Qdrant | `text`, `citation` |
| POST | `/search` | Semantic search — returns re-ranked chunks | `query_text` |
| POST | `/query` | Search + Qwen3 inference in one call | `query_text` |
| POST | `/extract-pdf` | Extract text from PDF bytes (pdfminer only) | `pdf_base64` |
| POST | `/extract-pdf-ocr` | Extract text with OCR fallback (pdfminer → Tesseract) | `pdf_base64` |
| POST | `/delete` | Delete all Qdrant vectors for a citation | `citation` |

**Worker.js routes PDF extraction through `/extract-pdf-ocr` — not `/extract-pdf`.**

**Search/ingest defaults:** `top_k=6` (max 8), `score_threshold=0.65`, `chunk_size=500`, `chunk_overlap=50`

**Chunk payload fields:** `text`, `source`, `citation`, `chunk`, `total_chunks`, `summary`, `category`, `jurisdiction`, `court`, `year`, `outcome`, `principles`, `legislation`, `offences`

**Note:** `court` and `year` are null for legislation chunks — use this to filter legislation out of case searches.

---

## Architecture
- **Frontend/API layer**: Cloudflare Worker — live at arcanthyr.com
- **Database**: Cloudflare D1 (SQLite) — cases + legislation + legislation_sections
- **Vector search**: Qdrant (self-hosted on VPS via Docker) — collection: general-docs
- **LLM inference**: VPS Docker — agent-general container (server.py)
- **Scraper**: AustLII scraper pipeline — PAUSED
- **Embeddings**: nomic-embed-text (active) — pplx-embed-context-v1 under evaluation as replacement
- **PDF extraction**: pdfminer with automatic Tesseract OCR fallback (scanned PDFs)

---

## Phase 5 Design (Locked)
- Qdrant: top 6 chunks, min score 0.72, max 8 results
- Re-rank by court hierarchy within 0.05 score band: CCA/FullCourt > Supreme > Magistrates
- Full metadata per chunk (including court, year, citation)
- LLM routing: Claude API first, fallback to Qwen3 local (deferred — GPU needed)
- API key: `npx wrangler secret put ANTHROPIC_API_KEY`

---

## Key File Locations

### Local Repos
| Repo | Local Path | GitHub |
|---|---|---|
| Main (Worker) | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4` | github.com/Arcanthyr/arcanthyr-console |
| Nexus (server.py) | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\arcanthyr-nexus` | github.com/Arcanthyr/arcanthyr-nexus |

### Main Repo Contents (Arc v 4)
- `Worker.js` — Cloudflare Worker (v7)
- `wrangler.toml` — Worker config, D1 binding, AI binding, cron
- `public/` — static assets served by Worker
- `public/styles.css` — design system (monumental stoic palette — parchment/charcoal/blue/amber/burgundy-red)
- `public/legal.html` — legal research UI (tabs: Cases, Legislation, Secondary Sources, Library)
- `public/app.js` — v12 — main JS (vault, legal search, upload handlers)
- `schema.sql` — D1 schema reference
- `scraper_progress.json` — scraper state (excluded from Wrangler deploy)
- `.env` — secrets (excluded from both Wrangler and git)
- `.wranglerignore` — excludes .env, .git, .wrangler, *.py, *.log, *.docx, scraper_progress.json
- `.gitignore` — excludes .env, .wrangler, Local Scraper/.env, arcanthyr-nexus/

### VPS File Locations
- `server.py`: `~/ai-stack/agent-general/src/server.py` (volume-mounted)
- `docker-compose.yml`: `~/ai-stack/docker-compose.yml`
- `.env` (VPS secrets): `~/ai-stack/.env`

### Other
- Criminal Code split files: local at `CrimCode_Part_*.txt` (9 parts, ready but not yet uploaded — prefer single PDF via OCR now)

## .claudeignore
Both repos have a `.claudeignore`. Claude Code must never read, edit, or act on these files.

**Main repo (Arc v 4):**
```
.env
*.pdf
CrimCode_Part_*.txt
node_modules/
.wrangler/
```

**Nexus repo (arcanthyr-nexus):**
```
.env
*.log
*.pdf
deploy.ps1
```
If either `.claudeignore` is missing, create it before doing anything else.

---

## Open Items — Next Session

### Priority 1 — COMPLETE ✅
~~Re-ingest Evidence Act into Qdrant~~ — Done.

### Priority 2 — COMPLETE ✅
All items done this session:
- ~~Wire legal.html to handle #citation= hash param~~ ✅
- ~~Library table — replace Size with Sections Parsed~~ ✅ (then removed Sections column entirely)
- ~~UI styling changes~~ ✅ (burgundy-red headings, blue active buttons, uppercase bold Times New Roman tabs, token cleanup)
- ~~Clear Form buttons~~ ✅
- ~~Upload progress messages~~ ✅

### Priority 3 — In Progress

**Criminal Code upload**
- OCR fallback now live in server.py (`/extract-pdf-ocr`) and Worker.js routes to it
- Tesseract + poppler-utils + pdf2image already installed in Dockerfile.agent — no rebuild needed
- **Next action**: test OCR by dragging full Criminal Code PDF into legislation upload form
- If OCR works: Criminal Code uploads as single PDF, auto-splits into parts automatically
- Auto-split logic now in legal.html — splits at section boundaries, uploads sequentially, shows "Part X of Y" progress
- Part IDs: `criminal-code-act-1924-tas-part-1` etc — Worker.js `handleUploadLegislation` accepts `part_number` field
- Library shows part labels in title e.g. "Criminal Code Act 1924 (Part 1)"
- Scanned PDF warning added to dropzone — warns if < 500 chars/MB extracted

**Resume scraper**
- Still paused pending Criminal Code upload and pipeline review
- ~20 scraper errors not yet reviewed
- ~20 cases with court=unknown — re-extract from raw_text when scraper resumes

### Priority 4 — Backlog
- Fix case name extraction via Llama summarisation prompt (not regex)
- Evaluate pplx-embed-context-v1 as embedding model replacement
- Tesseract OCR on VPS — **now complete, pending test** (see Priority 3)
- Fix deploy.ps1 encoding issue (â€" characters = UTF-8/Windows-1252 mismatch — file needs re-saving as UTF-8 without BOM)
- Qwen3 inference (needs GPU — deferred)

---

## Known Issues (Persistent)

| # | Issue | Notes |
|---|---|---|
| 1 | Evidence Act column garbling | pdfminer can't fully reconstruct two-column layout. AustLII HTML source would fix permanently. |
| 2 | Misuse of Drugs Act low chunk count | 29 chunks from 284 sections — Schedule (drug names table) doesn't parse as semantic chunks. Acceptable. |
| 3 | ~20 cases court=unknown | Pre-upgrade extraction. Re-extract from raw_text when scraper resumes. |
| 4 | Llama 3b confabulates case law | Invents citations when no real cases available. Claude holds the instruction reliably. WorkersAI suitable only for genuine case retrieval. |
| 5 | Duplicate citation formats in Qdrant | Both 'TASSC 2024 24' and '[2024] TASSC 24' present for same cases. |
| 6 | ~52 Evidence Act sections missing | Schedule + sections >8000 chars truncated at D1 row limit. |
| 7 | legislation_extracted duplicates | Same section appearing 5x — Llama extraction quality issue. |
| 8 | Qwen3 inference too slow | Needs GPU. Deferred. |
| 9 | deploy.ps1 encoding broken | â€" characters from UTF-8/Windows-1252 mismatch. Workaround: run scp + ssh commands manually. |

---

## Parser / Pipeline Notes (Important for Future Uploads)

**Legislation upload — title convention**
Always use the full Act name including year: `Evidence Act 2001`, `Justices Act 1959` etc.
Year is extracted automatically from the title by the Worker (`title.match(/\b(\d{4})\b/g)`).
Do NOT put year in the Year field (field has been removed from the form).
Jurisdiction is a separate dropdown — do not include in title.

**Large legislation — auto-split**
legal.html automatically splits text > 80,000 chars at clean section boundaries before uploading.
Each part is uploaded sequentially as `title (Part N)` with ID `{base-id}-part-N`.
Section lookup works across all parts transparently (searches by title + jurisdiction, not ID).
SPLIT_THRESHOLD = 80,000 chars · CHUNK_TARGET = 70,000 chars per part.

**Scanned PDF detection**
If extracted text < 500 chars/MB of PDF size, dropzone shows warning and aborts.
Worker.js now routes all PDF extraction through `/extract-pdf-ocr` which:
1. Tries pdfminer first (fast, accurate for digital PDFs)
2. Falls back to Tesseract OCR if yield < 300 chars/page (scanned PDFs)
OCR at 300 DPI — expect several minutes for large Acts.

**bodyStartMatch logic**
Looks for `\n\d+[A-Z]?\.?\s+[A-Z][^\n]{3,}\n\(` — section line followed immediately by `(` on next line. Works for Evidence Act because subsections start with (1). May fail for Acts where the first section has no subsections (body starts with plain prose). Monitor on next legislation upload.

**sectionPattern relaxation risk**
Changed from `\s{2,}` to `\s+` — single-space matches now valid section starts. Could produce false positives on inline references like "section 38 applies". Mitigated by seenSections dedup and capital-letter heading check. Watch for spurious sections in future uploads.

**PDF extraction behaviour**
- pdfminer with `LAParams(boxes_flow=None)` sorts top-to-bottom — better than default
- Two-column PDFs still have partial garbling despite the fix
- AustLII plain-text (.txt) versions are cleaner than PDFs — use .txt where available
- Scanned/image PDFs now handled via Tesseract OCR fallback

**Legislation ingest batching**
Sections are sent to nexus `/ingest` in batches of 20. Supports Acts up to ~300 sections within the 30s Worker timeout per part. Large Acts auto-split before upload.

**Qdrant delete behaviour**
- `/delete` endpoint in server.py confirmed working end-to-end
- `handleLibraryDelete` in Worker.js confirmed working — calls nexus `/delete` with citation ID
- Always delete before re-ingest — upsert adds new vectors alongside old ones
- Verify deletion with Qdrant count check before re-uploading

---

## docker-compose.yml — Critical Notes
- `python -u src/server.py` confirmed present for BOTH agent-sensitive and agent-general — `-u` flag is in the repo file ✓
- `src/` volume mount confirmed: `./agent-general/src:/app/src` — edits to server.py on VPS take effect on container restart, no rebuild needed
- `agent-general` also mounts `./agent-general:/app/docs` — PDF uploads land here
- `ANTHROPIC_API_KEY`, `NEXUS_SECRET_KEY`, `OLLAMA_PORT`, `QDRANT_GENERAL_PORT`, `AGENT_GENERAL_PORT` all sourced from `~/ai-stack/.env`
- `qdrant-general` is on `general-net` (outbound internet allowed) — `qdrant-sensitive` is on `sensitive-net` (no internet, ever)
- n8n live at `n8n.arcanthyr.com` (port 5678, internal only)
- **Do NOT run `docker compose build` unless the Dockerfile itself has changed**
- Tesseract, poppler-utils, pdf2image, pytesseract already in Dockerfile.agent — no rebuild needed for OCR

---

## Deployment Procedures

### Worker.js Changes
Run each command separately in PowerShell:
```
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
npx wrangler deploy
git add -A
git commit -m "your message"
git push origin master
```
Note: ignore 'master is not recognized' error on second push line — push succeeds regardless.

### server.py Changes (arcanthyr-nexus repo)
`server.py` has its own local repo at:
`C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\arcanthyr-nexus`

**deploy.ps1 is currently broken** (encoding issue — known issue #9). Use manual commands instead:
```
scp server.py tom@31.220.86.192:~/server.py
ssh tom@31.220.86.192 "cp ~/server.py ~/ai-stack/agent-general/src/server.py && cd ~/ai-stack && docker compose restart agent-general"
ssh tom@31.220.86.192 "curl -s http://localhost:18789/health"
git add -A
git commit -m "your message"
git push origin master
```

**Do NOT run `docker compose build` unless the Dockerfile itself has changed.**

### Verifying Qdrant Content
Run on VPS:
```
KEY=$(grep NEXUS_SECRET_KEY ~/ai-stack/.env | cut -d= -f2)
curl -s -X POST http://localhost:18789/search \
  -H "Content-Type: application/json" \
  -H "X-Nexus-Key: $KEY" \
  -d '{"query_text": "your query", "top_k": 3, "score_threshold": 0.5}' | python3 -m json.tool
```

### Checking Qdrant Count for a Citation
```
curl -s http://localhost:6334/collections/general-docs/points/count \
  -H "Content-Type: application/json" \
  -d '{"filter": {"must": [{"key": "citation", "match": {"value": "evidence-act-2001-tas"}}]}}' | python3 -m json.tool
```

### Checking Section Text in D1
```
curl -s -X POST https://arcanthyr.com/api/legal/section-lookup \
  -H "Content-Type: application/json" \
  -d '{"title":"Evidence Act 2001","jurisdiction":"Tas","section":"38"}' | python3 -m json.tool
```

---

## Qdrant / Nexus Rules
- **Always delete before re-ingest** — upsert adds new vectors alongside old ones, it does not replace
- `citation` field in payload is the key for delete-by-filter
- Chunk payloads don't include category/source fields — filter by (court==null AND year==null) to exclude legislation from case search
- score_threshold default: 0.65 across all handlers
- /delete endpoint: confirmed working end-to-end as of 8 March 2026
- Library delete propagates to Qdrant automatically via handleLibraryDelete → nexus /delete

---

## PowerShell Conventions (CRITICAL)
- **NEVER chain commands with `&&`** — PowerShell does not support this
- Run each command separately, one at a time
- If execution policy errors appear, run first:
  `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
- `curl` in PowerShell is Invoke-WebRequest — use `$()` syntax or run curl commands on VPS instead
- `scp` must be run from local PowerShell, NOT from inside the VPS SSH session

---

## Wrangler Deploy Checklist (CRITICAL)
Before every `npx wrangler deploy`:
1. Verify the upload list shows ONLY files from `public/`
2. If `.env`, `.git`, or any sensitive file appears — **STOP IMMEDIATELY**
3. After deploy: `git add -A` → `git commit` → `git push origin master`
4. GitHub drifts if the push is skipped after deploy

---

## Docker / VPS Rules
- docker compose commands must be run from `~/ai-stack/` directory
- docker compose logs only visible with `python -u` flag (set in docker-compose.yml on VPS)
- No sudo needed on this machine — regular cp works for volume-mounted files
- VPS IP: 31.220.86.192 (verify on VPS with: `curl -s ifconfig.me`)

---

## Workflow Rules

### 1. Plan Before Acting
- For ANY task with 3+ steps or architectural impact: write a plan first and confirm before touching files
- If something goes sideways mid-task: STOP and re-plan — do not keep pushing
- For simple, obvious single-file fixes: just do it

### 2. Verification Before Done
- Never mark a task complete without proving it works
- Run tests, check logs, demonstrate correctness
- For deploys: confirm Worker is live and responding before calling it done

### 3. Minimal Impact
- Changes should touch only what is necessary
- Avoid introducing new dependencies without flagging it
- If a fix feels hacky, pause and find the cleaner solution

### 4. Autonomous Bug Fixing
- When given a bug report with logs or terminal output: just fix it
- Point at the evidence (logs, errors, stack traces) and resolve it
- Do not ask for hand-holding on straightforward debugging

### 5. Capture Lessons
- After any correction from Tom: note the pattern in a `tasks/lessons.md` file
- Write rules that prevent the same mistake recurring

### 6. Keep CLAUDE.md Current
**During session** — update immediately after any of the following:
- New endpoint added or removed
- Architectural decision made or changed
- Known issue resolved or discovered
- Naming convention or behaviour change
- Any Open Items status change

**End of session** — full pass before closing:
- Update Open Items to reflect current state
- Remove anything resolved
- Add anything discovered this session
- Correct any stale values (thresholds, ports, flags, file paths)

CLAUDE.md is the source of truth. If it's wrong, the next session starts blind.

---

## Worker.js Endpoint Map (v7)
*Do not invent, rename, or duplicate these. All routes are in Worker.js.*

### /api/ai/
| Method | Endpoint | Handler |
|---|---|---|
| POST | `/api/ai/draft` | handleDraft |
| POST | `/api/ai/next-actions` | handleNextActions |
| POST | `/api/ai/weekly-review` | handleWeeklyReview |
| POST | `/api/ai/axiom-relay` | handleAxiomRelay |
| POST | `/api/ai/clarify-agent` | handleClarifyAgent |

### /api/email/
| Method | Endpoint | Handler |
|---|---|---|
| POST | `/api/email/send` | handleSendEmail |
| GET | `/api/email/contacts` | handleGetContacts |
| POST | `/api/email/contacts` | handleAddContact |
| DELETE | `/api/email/contacts/{id}` | handleDeleteContact |

### /api/legal/
| Method | Endpoint | Handler |
|---|---|---|
| GET | `/api/legal/sync-progress` | getSyncProgress |
| POST | `/api/legal/search-cases` | handleSearchCases |
| POST | `/api/legal/search-principles` | handleSearchPrinciples |
| POST | `/api/legal/trigger-sync` | runDailySync |
| POST | `/api/legal/backfill-year` | runYearBackfill |
| POST | `/api/legal/upload-case` | handleUploadCase |
| POST | `/api/legal/extract-pdf` | handleExtractPdf (routes to /extract-pdf-ocr on nexus) |
| POST | `/api/legal/upload-legislation` | handleUploadLegislation (accepts optional part_number) |
| POST | `/api/legal/upload-secondary` | handleUploadSecondarySource |
| GET | `/api/legal/library` | handleLibraryList |
| DELETE | `/api/legal/library/delete/{docType}/{id}` | handleLibraryDelete — also purges Qdrant via nexus /delete |
| POST | `/api/legal/section-lookup` | handleSectionLookup |
| POST | `/api/legal/legal-query` | handleLegalQuery (Claude API — Phase 5 primary) |
| POST | `/api/legal/legal-query-qwen` | handleLegalQueryQwen (local Qwen via nexus — deferred) |
| POST | `/api/legal/legal-query-workers-ai` | handleLegalQueryWorkersAI (WorkersAI — Llama) |
| POST | `/api/legal/fetch-page` | handleFetchPage (AustLII proxy) |

### /api/entries/
| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/entries` | All non-deleted entries, newest first, limit 200 |
| POST | `/api/entries` | Create — required: id, created_at, text, tag, next, clarify |
| DELETE | `/api/entries/{id}` | Soft-delete single entry |
| DELETE | `/api/entries` | Soft-delete all entries |
| PATCH | `/api/entries` | Restore all soft-deleted entries |

---

## styles.css Design Tokens (current)
Key token names after 8 March cleanup:
- `--ink`: #2a2a2a (near-black — replaces old `--gold`)
- `--ink-dim`: #f0f0f0 (near-white — replaces old `--gold-dim`)
- `--border-heavy`: #b8b3a8 (hover/emphasis border — replaces old `--border-light`)
- `--red`: #8B1A1A (burgundy-red — headings, h2, page titles)
- `--blue`: #3a6a9a — active states, chips, AI elements
- `--border`: #ccc8be — default border

---

## Core Principles
- **Simplicity first**: Make every change as simple as possible
- **No laziness**: Find root causes — no temporary fixes
- **Senior standard**: Would a careful senior developer approve this change?
- **Legal platform caution**: This platform handles legal research — accuracy and stability matter
