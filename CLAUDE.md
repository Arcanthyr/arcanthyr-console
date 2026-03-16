# CLAUDE.md — Arcanthyr Session Handover
*Updated: 16 March 2026 (morning session)*
*Supersedes: CLAUDE.md (15 Mar 2026 evening) + CLAUDE_addendum.md*

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
- **CC cannot run Python reliably** — the Windows Store Python stub blocks CC from executing scripts. Always run Python scripts in the PowerShell terminal directly, not via CC.
- **CC prompt precision matters** — vague prompts burn quota. Be specific: "change line X from Y to Z" is better than "fix the logic."
- **CC for file reads and edits, VPS SSH for runtime checks** — use CC to inspect and edit local files, use direct SSH for anything that needs to run on the VPS.

---

## TOOLING
- **Claude.ai (chat)** — architecture decisions, planning, debugging from output, writing CLAUDE.md, reviewing code before deploy
- **Claude Code (VS Code)** — file edits, running scripts, terminal commands, git operations, wrangler deploys
- **PowerShell (local)** — SSH to VPS, scp file transfers, anything CC can't do

---

## SYSTEM STATE (as of 16 Mar 2026 — morning)

| Component | Status |
|---|---|
| Qdrant collection | `general-docs-v2` · embed pass IN PROGRESS · 1273 points pre-pass (legislation + cases only) |
| Embedding model | `argus-ai/pplx-embed-context-v1-0.6b:fp32` (Ollama, VPS Docker) |
| Score threshold | 0.45 (empirically validated) |
| D1 `cases` | 8 rows — 2026 scrape batch (TASSC 1–6, TASFC 1–2) · judge + parties backfilled |
| D1 `secondary_sources` | **1,138 rows** · enriched=1, embedded=0 (embed pass running) · includes 37 re-ingested duplicate chunks |
| D1 `legislation` | 5 Acts · embedded=1 · 1272 sections in Qdrant · embedding_model + embedding_version populated |
| D1 `case_citations` | 5 rows · 1 case processed · ready to scale with scraper |
| D1 `case_legislation_refs` | 5 rows · 1 case processed · ready to scale with scraper |
| Worker.js | Latest deployed (402aa0e9) |
| enrichment_poller.py | In repo + VPS · includes category in Qdrant payload |
| server.py | pplx-embed + general-docs-v2 + threshold 0.45 + BM25 pre-retrieval LIVE |
| xref_agent.py | Built + validated · VPS · INSERT OR IGNORE idempotency confirmed |
| Phase 5 | VALIDATED — citation discipline rules live, hallucination significantly reduced |
| BM25 pre-retrieval | LIVE — legislation sections layer + case-law layer (case_legislation_refs) |
| Workers AI citation discipline | TIGHTENED 15 Mar 2026 — approved gap phrase enforced |
| Frontend | Dark Gazette theme deployed — UI overhaul IN PROGRESS (CC briefs written, not yet deployed) |
| Hogan on Crime re-processing | **COMPLETE** — 56 blocks processed, 1,138 chunks in D1, embed pass running |

---

## IMMEDIATE NEXT ACTIONS (priority order)

### 1 — Confirm embed pass complete
Check Qdrant point count after embed pass finishes:
```bash
curl -s http://localhost:6334/collections/general-docs-v2 | python3 -m json.tool | grep points_count
```
Expected: ~1273 (existing) + ~1101 (new corpus) = ~2374 points. May vary slightly.

### 2 — Retrieval testing (15 baseline questions)
Run all 15 test questions via the Arcanthyr console. Compare results against the baseline answers documented below. Key failure modes to watch in the old corpus: Q7 (tendency test), Q10 (corroboration), Q12 (hostile witness), Q13 (tendency objection).

### 3 — Category normalisation in D1
Fix fragmented category values in `secondary_sources`:
```sql
UPDATE secondary_sources SET category = 'doctrine' WHERE category = 'legal doctrine';
```
Other minor categories (`Evidentiary guidance`, `Parties, Accessories and Principles`, `Defence - Duress`) are topic labels not category labels — assess after retrieval testing whether to normalise or leave.

### 4 — UI overhaul (CC briefs ready)
CC briefs written and ready to paste. See UI CHANGES section below.

### 5 — Commit everything
Files with uncommitted changes:
- `ingest_corpus.py` — chunking logic rewrite, bracket fix, dry-run flag, deduplication pass
- `reingest_duplicates.py` — new script
- `Arc v 4/arcanthyr-nexus/server.py` — `/delete-by-type` route added
- `Arc v 4/blocks_3k/` — 56 resplit block files
- `Arc v 4/master_corpus_part1.md` — new corpus part 1 (317 chunks)
- `Arc v 4/master_corpus_part2.md` — new corpus part 2 (821 chunks)
- `Arc v 4/process_log.txt` — full pipeline run log

Suggested commit message:
`"Complete corpus re-ingest: new Hogan on Crime corpus 1138 chunks, add delete-by-type route, update ingest_corpus.py, add reingest_duplicates.py"`

### 6 — Delete old master_corpus.md
Only after retrieval testing confirms new corpus is working. File: `Arc v 4/master_corpus.md`

---

## ARCHITECTURE

**Stack:** Cloudflare Worker (`arcanthyr-api`) + D1 (`arcanthyr`) + Qdrant (`general-docs-v2`, port 6334 host / 6333 internal) + Ollama/pplx-embed (Docker) + nexus `server.py` (Docker `agent-general`)

**VPS:** Contabo, `31.220.86.192`, Ubuntu 24.04, 23GB RAM, 6 vCPU
**Live site:** `arcanthyr.com` (Cloudflare Worker custom domain)
**GitHub:** `https://github.com/Arcanthyr/arcanthyr-console`

**D1 vs Qdrant:**
- D1 = source of truth / relational. Library UI reads from D1. Text and metadata live here permanently.
- Qdrant = semantic search index. Vectors + chunk_id payload pointing back to D1 rows. Rebuilt from D1 if needed.
- Library delete wipes Qdrant chunks but NOT D1 rows.
- Full reset: `wrangler d1 execute DELETE` on relevant table + Qdrant collection delete + recreate.

---

## CRITICAL ARCHITECTURE NOTE — DOCKER INTERNAL HOSTNAMES

**When running the enrichment poller or any script inside a Docker container, `localhost` refers to that container — NOT the VPS host. All inter-container calls must use Docker service names.**

| Service | Host-side access | Inside Docker container |
|---|---|---|
| Qdrant general | `http://localhost:6334` | `http://qdrant-general:6333` |
| Ollama | Not directly accessible from host | `http://ollama:11434` |
| agent-general nexus | `http://localhost:18789` | `http://agent-general:18789` |

**Always run enrichment_poller.py with explicit env vars:**
```bash
docker exec -e OLLAMA_URL=http://ollama:11434 -e QDRANT_URL=http://qdrant-general:6333 -it agent-general python3 /app/src/enrichment_poller.py --mode embed
```

**The poller reads `OLLAMA_URL` (not `OLLAMA_HOST`).** The container has `OLLAMA_HOST` set but the poller uses `OLLAMA_URL` — always pass it explicitly via `-e` flag.

**Never test API routes via SSH from PowerShell** — SSH quoting mangles auth headers. SSH to VPS first, then run curl locally on the VPS:
```bash
KEY=$(docker exec agent-general env | grep NEXUS_SECRET_KEY | cut -d= -f2)
curl -s -X POST http://localhost:18789/delete-by-type \
  -H "Content-Type: application/json" \
  -H "X-Nexus-Key: $KEY" \
  -d '{"type":"secondary_source"}'
```

---

## DATA FLOW (Pipeline v2 — CURRENT)

```
Console upload → Worker → D1 (raw_text stored, enriched=0, embedded=0)
                       → NO nexus call (fire-and-forget removed in v9)

VPS enrichment_poller.py (manual or cron):
  --mode enrich    → fetches enriched=0 rows → Claude API → writes enriched_text → enriched=1
  --mode embed     → fetches enriched=1, embedded=0 rows → pplx-embed → Qdrant → embedded=1
                   → ALSO runs legislation embedding pass automatically
  --mode both      → enrich then embed in sequence
  --mode reconcile → diffs D1 embedded=1 vs Qdrant chunk_ids → resets missing to embedded=0
  --loop           → runs continuously (60s sleep between passes)
  --status         → prints pipeline counts and exits
```

**CRITICAL — Enrichment model by content type:**
| Content | Enrichment model | Notes |
|---|---|---|
| Scraped cases (bulk) | Workers AI / Llama 3.1 8B — in Worker at ingest time | Free, automated, NOT via VPS poller |
| Manual case uploads | Workers AI / Llama — same Worker path | NOT via VPS poller |
| Secondary sources corpus | None — raw_text IS the content | embed raw_text directly, enriched_text stays NULL |
| Legislation | None — raw statutory text embedded directly | |
| Future secondary source uploads (small volume) | Claude API via poller | Acceptable for low volume |

**Secondary sources corpus — IMPORTANT:**
- 1,138 rows, all enriched=1 (set manually — raw_text is the content, no Claude API enrichment needed)
- enriched_text is NULL across all rows — this is correct, poller falls back to raw_text
- Do NOT run `--mode enrich` on these rows

---

## CORPUS — HOGAN ON CRIME (NEW)

### What was done
The original `master_corpus.md` (711 chunks, generated by ChatGPT manual enrichment) systematically sanitised informal practitioner notes into formal doctrine, stripping procedural sequences, scripted questions, and tactical commentary.

Full reprocessing pipeline:
1. `split_legal_doc.py` — split `hogan_on_crime.md` into 56 blocks at ~3,000 words each (stored in `blocks_3k/`)
2. `process_blocks.py` — automated RAG pipeline using OpenAI gpt-5-mini-2025-08-07, produced `master_corpus_part1.md` (317 chunks, blocks 1–28) and `master_corpus_part2.md` (821 chunks, blocks 29–56)
3. D1 wiped (`DELETE FROM secondary_sources`), Qdrant secondary_source vectors wiped via `/delete-by-type` route
4. `ingest_corpus.py` — ingested both parts into D1 (1,138 rows total)
5. `reingest_duplicates.py` — re-ingested 37 chunks that were silently skipped due to duplicate CITATION values

### Corpus statistics
- Part 1: 317 chunks (blocks 1–28)
- Part 2: 821 chunks (blocks 29–56)
- Total: 1,138 chunks in D1
- 28 duplicate CITATION values found — 37 additional chunks re-ingested with `[2]`/`[3]`/`[4]` suffixes

### Category distribution (as ingested)
| Category | Count |
|---|---|
| annotation | 309 |
| doctrine | 242 |
| case authority | 199 |
| procedure | 161 |
| legal doctrine | 99 |
| checklist | 28 |
| other minor categories | ~41 |

Note: `doctrine` and `legal doctrine` should be normalised to `doctrine` — see Priority 3 above.

---

## INGEST_CORPUS.PY — CURRENT STATE

Location: `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\ingest_corpus.py` (NOT inside `Arc v 4/`)
Corpus files: `Arc v 4/master_corpus_part1.md` and `Arc v 4/master_corpus_part2.md`

**Key features:**
- `INPUT_FILE` — change to full absolute path before each run
- `--dry-run` flag — validates chunk detection, reports count and first 3 metadata extractions. Always dry-run first.
- **Deduplication pass** (lines 100–111) — before POSTing, scans all CITATION values. First occurrence unchanged, subsequent occurrences get `[2]`, `[3]` suffixes. Prints WARNING for each renamed citation.
- Plain bracket regex (not escaped) — new corpus uses `[FIELD:]` not `\[FIELD:\]`
- Chunking splits on `##`/`###` heading lines where next non-empty line starts with `[DOMAIN:`
- Strips `<!-- block_NNN master/procedure -->` comment separators

**Correct ingest sequence:**
```
# From C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\
python ingest_corpus.py --dry-run    # verify chunk count
python ingest_corpus.py              # INPUT_FILE must be set correctly

# After ingest, set enriched=1 on new rows:
npx wrangler d1 execute arcanthyr --remote --command "UPDATE secondary_sources SET enriched=1 WHERE enriched=0;"

# Then run embed pass on VPS:
docker exec -e OLLAMA_URL=http://ollama:11434 -e QDRANT_URL=http://qdrant-general:6333 -it agent-general python3 /app/src/enrichment_poller.py --mode embed --loop
```

**Do NOT run both parts simultaneously** — write conflicts in D1.

---

## REINGEST_DUPLICATES.PY

Location: `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\reingest_duplicates.py`

Use this when a previous ingest silently skipped chunks due to duplicate CITATION values.

What it does:
1. Parses both corpus files using identical chunking logic to `ingest_corpus.py`
2. Identifies all CITATION values that appear more than once
3. Skips the first occurrence (already in D1), collects subsequent occurrences with `[2]`/`[3]` suffixes
4. POSTs each to the Worker upload endpoint
5. Immediately sets `enriched=1` on each new row so embed pass picks it up automatically
6. Reads `NEXUS_SECRET_KEY` from `Arc v 4/.env` automatically

```
python reingest_duplicates.py --dry-run    # confirm list before sending
python reingest_duplicates.py              # live run
```

---

## NEW VPS ROUTE — /delete-by-type

Added to `server.py` (both local and VPS).

```python
# POST /delete-by-type
# Body: {"type": "secondary_source"}
# Deletes all Qdrant points where payload type == value
# Auth: X-Nexus-Key header required
```

Use for bulk corpus wipes. The existing `/delete` route only deletes by citation.

**Always test directly on VPS (not via PowerShell SSH):**
```bash
KEY=$(docker exec agent-general env | grep NEXUS_SECRET_KEY | cut -d= -f2)
curl -s -X POST http://localhost:18789/delete-by-type \
  -H "Content-Type: application/json" \
  -H "X-Nexus-Key: $KEY" \
  -d '{"type":"secondary_source"}'
```

---

## RETRIEVAL TESTING — 15 BASELINE QUESTIONS

These 15 questions were used to validate the OLD corpus (`master_corpus.md`). Run the same questions against the new corpus after the embed pass completes and compare results.

**Known failures in old corpus (priority watch):**
- Q7 — cited Woolmington v DPP for tendency test (completely wrong)
- Q10 — cited fictional "s 64 Evidence Act" corroboration definition
- Q12 — hostile witness answer pulled random Criminal Code sections
- Q13 — tendency objection answer wandered into Misuse of Drugs Act chunks
- Q3 — Firearms Act definition largely fabricated
- Q5 — recklessness cited UK cases (Caldwell, R v G) not Tasmanian Criminal Code s13

**The 15 questions:**

Doctrinal — legislation focused:
1. "what is the test under s 137 Evidence Act"
2. "elements of common assault Tasmania"
3. "what is the definition of a weapon under the Firearms Act"
4. "when can police search without a warrant"
5. "what is the fault element for recklessness"

Doctrinal — case authority focused:
6. "standard of proof in criminal proceedings"
7. "what is the test for tendency evidence"
8. "propensity evidence admissibility"
9. "sentencing principles for first offenders"
10. "what amounts to corroboration"

Practitioner — procedure/workflow:
11. "how do I make a s 38 application"
12. "steps for handling a hostile witness"
13. "how do I object to tendency evidence"
14. "examination in chief technique leading questions"
15. "what do I do if a witness refuses to answer"

---

## UI CHANGES — CC BRIEFS (READY TO DEPLOY)

The following CC briefs are written and ready to paste in order. Frontend work only — safe to run anytime, no VPS interaction.

**Brief 1 — Reconnaissance (run first)**
> Read every file in `Arc v 4/public/`. List each filename and give me a one-sentence description of what it contains. Do not make any changes.

**Brief 2 — Visual fixes**
> Read all HTML files in `Arc v 4/public/`. Make the following style changes across all pages:
> 1. Remove any relevance threshold / score bar UI element from all pages
> 2. Any element labelled "Console" in nav or headings → rename to "Arc Console"
> 3. Find the sigil image element. Match its background colour to the page background colour (or remove any background set on the sigil container so it inherits the page background)
> 4. All buttons must use Times New Roman font — find any buttons not using Times New Roman (including Workers AI / Claude routing toggle buttons) and add `font-family: 'Times New Roman', Times, serif` to their styles
> 5. Any headings currently styled in blue → change to white. This includes "Enter" on the home page and "Database Status" on the legal research page
> 6. Any buttons currently styled with a blue background → change their background colour to match the existing non-blue button style on the same page. Keep white text
> 7. Remove the text "A forge for clarity — where raw thought is shaped into action." from the home page entirely
> 8. Any gold or yellow-tinted text → change to white. Any placeholder / shadow / hint text → use faded/muted white (e.g. `rgba(255,255,255,0.5)`) rather than gold
>
> After making all changes, list every file modified and every change made.

**Brief 3 — Structural: new Ingest page**
> Read all HTML files in `Arc v 4/public/` and `Worker.js`.
> 1. Create a new file `Arc v 4/public/ingest.html`. Model its layout and nav on the existing pages for consistency
> 2. Move ALL upload sections from every existing page into `ingest.html` — this includes case upload, corpus/secondary source upload, legislation upload, and any other upload or ingest forms
> 3. Add "Ingest" as a nav link to `ingest.html` on every existing page
> 4. Remove the upload sections from their original pages after moving them
> 5. Move the "Database Status" section off the Legal Research page and onto `ingest.html` — it belongs with pipeline management, not search
>
> After changes, list every file modified and every element moved.

**Brief 4 — Structural: Axiom Relay rename + cleanup**
> Read all HTML files in `Arc v 4/public/` and `Worker.js`.
> 1. Find the page currently named "Email" or containing email functionality
> 2. Rename that page, its nav label, its HTML file, and all internal headings to "Axiom Relay"
> 3. Find any older "Axiom Relay" page or section that predates this rename — delete it and remove its nav link entirely
> 4. In `Worker.js`, find any routes or handlers for the old Axiom Relay functionality — remove them. Keep only the routes that serve the renamed email page
>
> List every file modified and every deletion made.

**Brief 5 — Functionality: legislation search single input box**
> Read the legal research HTML page in `Arc v 4/public/` and the legislation search handler in `Worker.js`.
> 1. Find the legislation search section — it currently has separate fields for act name, year, and section number
> 2. Replace all those fields with a single text input box. Placeholder text: "Search legislation — act name, section, year…"
> 3. Update the search handler so the single input value is sent as a broad query that searches across act name, section number, and year fields (use LIKE with wildcards across all relevant D1 columns)
> 4. The goal is fuzzy/broad matching — a user typing "Criminal Code s 125" or "Evidence Act 2001" or just "tendency" should return relevant results
>
> List every file and every function modified.

**Brief 6 — Functionality: legislation "View" link fix**
> Read all HTML files in `Arc v 4/public/` and `Worker.js`.
> 1. In the "Sources Retrieved" panel on the legal research page — find the "View" button/link that appears on legislation results. It currently redirects to the case search area. Change it to redirect to the legislation page instead
> 2. In the Library page — find the "View" option on legislation entries. Same fix — redirect to the legislation page, not the case search area
>
> List every file and handler modified.

---

## BM25 PRE-RETRIEVAL (LIVE)

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
Step 3b — Fetch cases citing same legislation from case_legislation_refs via
          Worker route /api/pipeline/fetch-cases-by-legislation-ref (LIKE '% s N%')
    ↓
Step 4 — Merge all results, deduplicate by chunk_id
    ↓
Step 5 — Pass to Claude API / Workers AI for grounded answer
```

---

## PHASE 5 DESIGN (LOCKED)

- Qdrant top 6 chunks, min score 0.45, max 8
- Re-rank by court hierarchy within 0.05 band: CCA/FullCourt > Supreme > Magistrates
- Full metadata per chunk
- Claude API primary → Workers AI (Llama) fallback
- API key via `npx wrangler secret put ANTHROPIC_API_KEY`

---

## SCRAPER CONFIG

- Courts: TASSC, TASCCA, TASFC, TAMagC
- Years: `range(2025, 2004, -1)` — 2025 to 2005 inclusive
- `MAX_CASES_PER_SESSION`: 100
- Delays: 10–20s random
- Business hours: 08:00–18:00 AEST
- Proxy: `arcanthyr.com/api/legal/fetch-page` — routes fetches via Cloudflare edge (VPS IP blocked by AustLII — run scraper locally only)
- Previously ingested: TASSC 2026 (1–6), TASFC 2026 (1–2) — 8 cases total in D1
- **Do not resume until retrieval testing on new corpus is complete**

---

## KEY FILE LOCATIONS

| File | Path |
|---|---|
| enrichment_poller.py | `Arc v 4/enrichment_poller.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| server.py (nexus) | `Arc v 4/arcanthyr-nexus/server.py` (local, gitignored) · `~/ai-stack/agent-general/src/server.py` (VPS) |
| xref_agent.py | `Arc v 4/xref_agent.py` (repo) · `~/ai-stack/agent-general/src/` (VPS) |
| ingest_corpus.py | `arcanthyr-console/` root — run from there, NOT from `Arc v 4/` |
| reingest_duplicates.py | `arcanthyr-console/` root — run from there, NOT from `Arc v 4/` |
| master_corpus.md | `Arc v 4/master_corpus.md` — OLD corpus · keep until new corpus retrieval-tested |
| master_corpus_part1.md | `Arc v 4/master_corpus_part1.md` — NEW corpus blocks 1–28 (317 chunks) |
| master_corpus_part2.md | `Arc v 4/master_corpus_part2.md` — NEW corpus blocks 29–56 (821 chunks) |
| process_blocks.py | `Arc v 4/process_blocks.py` — automated RAG pipeline script |
| blocks_3k/ | `Arc v 4/blocks_3k/` — 56 resplit blocks at ~3,000 words each |
| blocks/ | `Arc v 4/blocks/` — original 32 blocks at ~5,000–7,400 words (backup) |
| hogan_on_crime.md | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\hogan_on_crime.md` — source document |
| split_legal_doc.py | `C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\split_legal_doc.py` |
| process_log.txt | `Arc v 4/process_log.txt` — pipeline run log |
| Worker.js | `Arc v 4/Worker.js` |
| CLAUDE.md | `Arc v 4/CLAUDE.md` |
| austlii_scraper.py | `Local Scraper/` (not in git) |
| reprocess_cases.ps1 | `Arc v 4/reprocess_cases.ps1` |
| docker-compose.yml | `~/ai-stack/docker-compose.yml` (VPS) |

---

## KNOWN ISSUES / WATCH LIST

- **Docker internal hostnames** — poller must use `OLLAMA_URL=http://ollama:11434` and `QDRANT_URL=http://qdrant-general:6333`. Never `localhost` inside a container. Always pass via `-e` flags on `docker exec`. See CRITICAL ARCHITECTURE NOTE above.
- **Poller env var is OLLAMA_URL not OLLAMA_HOST** — container has `OLLAMA_HOST` set but poller reads `OLLAMA_URL`. Always pass explicitly.
- **Qdrant port mapping** — host-side port is 6334, but inside Docker network it's 6333. `qdrant-general:6333` from inside containers, `localhost:6334` from VPS host.
- **Nexus health check port is 18789** — not 8000. Always curl `http://localhost:18789/health` after agent-general restart.
- **ingest_corpus.py path** — script lives in `arcanthyr-console/`, corpus files in `Arc v 4/`. Use absolute paths in INPUT_FILE. Run from `arcanthyr-console/` not `Arc v 4/`.
- **reingest_duplicates.py path** — same as above, lives in `arcanthyr-console/`.
- **Duplicate CITATION values** — 28 duplicate citations found in new corpus, 37 chunks re-ingested with `[2]`/`[3]`/`[4]` suffixes. ingest_corpus.py now handles deduplication automatically for future runs.
- **Category normalisation needed** — `doctrine` (242) and `legal doctrine` (99) are the same thing. Run UPDATE after retrieval testing confirmed.
- **37 missing chunk explanation** — chunks were detected in dry run but silently skipped by `INSERT OR IGNORE` due to duplicate CITATION values. Fixed by reingest_duplicates.py. Not a script bug.
- **Console UI cannot handle large files** — never upload large corpus files via browser text area. Always use `ingest_corpus.py`.
- **Always set enriched=1 after secondary_sources ingest** — new rows land with enriched=0, poller won't touch them until set to enriched=1. Run UPDATE immediately after ingest.
- **authorities_extracted vs key_authorities** — D1 column is `authorities_extracted`. `key_authorities` is Llama prompt field name only — does NOT exist as a D1 column.
- **case_name missing from Qdrant for existing 8 cases** — fix applied to server.py 15 Mar 2026 but only affects future ingests. Backfill requires reingest-case route — deferred until scraper has run at volume.
- **Unknown chunk in sources panel** — one semantic result displaying as `unknown Unknown score 0.678`. Pre-existing corpus chunk with incomplete metadata.
- **Llama returning literal `"null"` string** — latent risk, not currently causing issues. Audit D1 after bulk scraping.
- **Workers AI prompt length sensitivity** — verbose prompts cause CPU timeout. Keep Workers AI path prompts concise.
- **Tendency evidence corpus gap** — doctrine partial, procedure should now be in new corpus. Verify in retrieval testing.
- **Corroboration corpus gap** — s 64 Evidence Act definition cited by old system does NOT exist. Corroboration largely abolished under uniform evidence law. Do not add a chunk until retrieval testing on new corpus confirms the position.
- **AustLII block** — VPS IP (31.220.86.192) permanently blocked. Scraper must run locally on Windows only.
- **Cloudflare Workers Observability disabled** — use `npx wrangler tail arcanthyr-api` for real-time logs.
- **process_blocks.py debug_response.txt** — always contains LAST response only. Use process_log.txt for run history.
- **OpenAI mini API quirks** — `max_completion_tokens` not `max_tokens`; do not pass `temperature`; normalise `\r\n` line endings before regex.
- **PART1_END in process_blocks.py** — currently 28 (blocks 1–28 → part1, 29–56 → part2). Update both `TOTAL_BLOCKS` and `PART1_END` if block count changes.
- **PowerShell SSH quoting mangles auth headers** — never test API routes via SSH from PowerShell. SSH to VPS first, then run curl locally on VPS.

---

## PROCESS_BLOCKS.PY PIPELINE NOTES

- gpt-5-mini-2025-08-07 works well on 3k-word blocks — do NOT use original 5k-7k word blocks
- gpt-5.2 and gpt-5.4 are not suitable — produced near-empty or stalled output in testing
- Mini API quirks: use `max_completion_tokens` not `max_tokens`; no `temperature` param; normalise `\r\n`
- Two-tier fallback (mini → gpt-5.4) not yet implemented — assess after first full run results
- PART1_END = 28 in process_blocks.py

---

## CLOUDFLARE ACCOUNT DETAILS

- **Plan:** Workers Free
- **Account ID:** `def9cef091857f82b7e096def3faaa25`
- **Cloudflare Browser Rendering `/crawl`** — available on Free plan. Potential future use for secondary source ingestion (Bar Association publications, Law Reform Commission reports). NOT suitable for AustLII (self-identifies as bot).

---

## FUTURE ROADMAP

- **Legislation enrichment via Claude API** — plain English summaries, cross-references, key concepts. Do AFTER cross-reference agent design confirmed.
- **Auto-populate legislation metadata on upload** — Claude API reads filename/first page, populates title/jurisdiction/year. Prevents typo slugs.
- **BM25 improvements** — proper scoring and hybrid ranking. Current: score:0.0 append. Future: proper BM25 scoring + hybrid ranking with semantic scores.
- **Console status indicator** — show enriched/embedded progress per document after upload.
- **Performance evaluation** — Claude API vs Workers AI response quality. First baseline data point captured 15 Mar 2026. Full evaluation after corpus validated.
- **Doctrinal normalisation pass** — after retrieval quality validated.
- **Cross-jurisdiction retrieval synonyms** — query expansion layer. Implement only after baseline retrieval quality confirmed.
- **Qwen3 UI toggle** — add third button to model toggle once Qwen validated. Route already exists in Worker.
- **Reingest-case route** — delete + reingest pattern to backfill case_name into Qdrant for existing cases. Build after scraper has run at volume.
- **Nightly cron for xref_agent.py** — after scraper is actively running.
- **Stare decisis layer** — surface treatment history from case_citations when a case returned in search results.
- **Animated sigil** — if rotating GIF produced, swap `sigil.jpg` for `sigil.gif` in nav (same position, 36px height).
- **UI generator** — find a UI/website generator for smoother frontend iteration without affecting backend functionality.

---

## SCRAPING WORKFLOW (confirmed design)

```
austlii_scraper.py (local Windows)
    → fetches AustLII HTML via arcanthyr.com/api/legal/fetch-page proxy
    → strips HTML to plain text locally
    → derives citation from URL structure
    → derives court_hint from URL path segment
    → POSTs raw text + citation + court_hint to /api/legal/upload-case
        → Worker: two Llama calls (pass 1: case_name/facts/issues/judge/parties,
                                    pass 2: holdings/legislation/key_authorities/principles)
        → D1: all fields written, enriched=1, embedded=0
    → nexus /ingest called by Worker → server.py ingest_text() → Qdrant
```

**Post-scrape checklist:**
- Run `xref_agent.py --mode both` after each batch
- Audit D1 for Llama literal `"null"` strings
- Do not resume scraper until retrieval testing on new corpus complete
