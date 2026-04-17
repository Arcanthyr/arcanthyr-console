# CC Session 67 — Handoff Prompt

Upload: CLAUDE.md + CLAUDE_arch.md before starting.

## ABSOLUTE CONSTRAINTS — DO NOT VIOLATE

* DO NOT modify `enrichment_poller.py` or restart `enrichment-poller` container
* DO NOT run any UPDATE/DELETE on `case_chunks`, `secondary_sources`, or `cases` tables
* DO NOT reset `embedded`, `enriched`, `done`, or `deep_enriched` flags on any row
* DO NOT run `retrieval_baseline.sh`
* enrichment-poller is actively re-embedding ~25K chunks with vocabulary anchors — do not interfere

If any task produces an unexpected finding that seems to call for modifying the above, STOP and report to Tom. Do not adapt around the constraint.

---

## ALREADY COMPLETED (Cowork session 66-67)

These tasks are DONE. Do not re-run them:

* **Task A (Query Log Analysis)** — query_log table has 0 rows. Table is live but no queries logged yet. Check if the INSERT in worker.js is firing correctly (see Task K note).
* **Task B (CHUNK Truncation)** — Only 10/25,236 chunks over 1,400 chars (0.04%). Not a priority. No action.
* **Task C (Sparse CONCEPTS)** — 1,137 rows lack `[CONCEPTS:]` bracket format, but many use `Concepts:` (no brackets) which the poller's `build_secondary_embedding_text()` already handles. Not an immediate concern.
* **Task D (quarantined_chunks table)** — Created in D1 with indexes. Empty, ready for post-baseline activation.
* **Task E (synthesis_feedback table)** — Created in D1 with indexes. Empty, ready for route wiring later.
* **Legislation whitelist (server.py)** — Deployed and verified. `LEG_WHITELIST_CORE`, `LEG_WHITELIST_ADJACENT`, keyword bridge all live.
* **handleRequeueMerge citation scoping (worker.js)** — Deployed as version `ff31b1af`. `body.citations` array support added.

---

## TASKS FOR THIS CC SESSION

### TASK F — TTS Route Read + Likely Defer

The live TTS route chain (browser → Worker /api/tts → server.py /tts → OpenAI TTS API) may still be needed for reading query responses aloud (non-ambient clips).

**F1 — Read current state (DO THIS FIRST):**
* hex-ssh read `~/ai-stack/agent-general/src/server.py` — find the `/tts` route handler. Report the full handler.
* Read `Arc v 4/worker.js` — grep for `handleTts` or `/api/tts`. Report the full handler.
* Read `arcanthyr-console/arcanthyr-ui/src/utils/tts.js` — identify which calls still go to `/api/tts` vs static CDN paths.

**F2 — Decision:**
* If `playTTS()` in tts.js falls back to `/api/tts` for non-preset phrases (reading query responses aloud): **DEFER. Do NOT remove the route.** Report the finding and move on.
* If `/api/tts` is only called for ambient clips that are now static: Remove the route from both server.py and worker.js. Show diffs first.

**Expected outcome:** Defer (tts.js likely still calls /api/tts for live synthesis).

---

### TASK H — Stare Decisis UI Layer (frontend + possibly worker.js)

Data is already in D1: `case_citations` (5,340 rows) and `case_legislation_refs` (4,056 rows).

**H1 — Read current state:**
* Read `arcanthyr-console/arcanthyr-ui/src/pages/Library.jsx` — find the case detail reading pane and current tab structure (Facts/Holding/Principles).
* In `worker.js`, grep for `case_citations` and `case_legislation_refs` — check if fetch routes already exist.

**H2 — If NO routes exist, add two routes to worker.js:**
```javascript
// GET /api/legal/case-citations/:citation — returns citing + cited relationships
// SELECT * FROM case_citations WHERE citing_case = ? OR cited_case = ?
// (verify actual column names by reading the CREATE TABLE or xref_agent.py first)

// GET /api/legal/case-legislation-refs/:citation — returns legislation refs
// SELECT * FROM case_legislation_refs WHERE citation = ?
```

IMPORTANT: Before writing any SQL, verify the actual column names in `case_citations` and `case_legislation_refs` tables. The prompt assumes `citing_case`/`cited_case` but the actual schema from xref_agent.py may differ. Read `Arc v 4/xref_agent.py` or run:
```sql
PRAGMA table_info(case_citations)
```
via Cloudflare MCP (account def9cef091857f82b7e096def3faaa25, DB 1b8ca95d-b8b3-421d-8c77-20f80432e1a0).

**H3 — Add "Citations" tab to case detail reading pane:**
* Tab shows: cases this case cites (grouped by treatment: applied/distinguished/not followed/referred to) and cases that cite this case (same grouping)
* Fetch data lazily when tab is selected (not on case row click)
* Match existing tab styling

Show all diffs before applying.

---

### TASK I — Auto-Populate Citation + Case Name on Upload (frontend only)

In Upload.jsx Cases tab, after file drop/select, scan first 1,000 chars for citation and case name.

**I1 — Read Upload.jsx** — find the file input handler on the Cases tab.

**I2 — Implement with improved regex:**
```javascript
const text = fileContent.slice(0, 1000);
const citationMatch = text.match(/\[(\d{4})\]\s+(TASSC|TASCCA|TASMC|TASFC)\s+(\d+)/i);
// Capture multi-word party names — grab everything up to [, (, or newline
const caseNameMatch = text.match(/((?:R|DPP|Tasmania|Police|State of Tasmania)\s+v\s+[A-Z][^\[\(\n]{1,60})/i);
if (citationMatch) {
  setCitation(`[${citationMatch[1]}] ${citationMatch[2].toUpperCase()} ${citationMatch[3]}`);
  // Derive court from code
  const courtMap = { TASSC: 'supreme', TASCCA: 'cca', TASMC: 'magistrates', TASFC: 'fullcourt' };
  setCourt(courtMap[citationMatch[2].toUpperCase()] || '');
}
if (caseNameMatch) setCaseName(caseNameMatch[1].trim());
```

NOTE: The original regex `/(R\s+v\s+\w+|\w+\s+v\s+\w+)/i` only captures single-word party names. The improved version above captures multi-word names up to a delimiter.

Frontend-only change. Show diff before applying.

---

### TASK J — RTF Upload Support (frontend only)

**J1 — Read Upload.jsx** — find the accept list on the Secondary Sources tab file input.

**J2 — Add `.rtf` to accept list. Add RTF stripper:**
```javascript
function stripRtf(rtf) {
  // Strip RTF header and font table
  let text = rtf.replace(/\{\\fonttbl[^}]*\}/g, '');
  text = text.replace(/\{\\colortbl[^}]*\}/g, '');
  text = text.replace(/\\[a-z]+[-]?\d*[ ]?/gi, '');  // control words
  text = text.replace(/\{|\}/g, '');                   // braces
  text = text.replace(/\\\n/g, '\n');                  // line breaks
  text = text.replace(/\\\*/g, '');                    // destinations
  text = text.replace(/[\\][^a-z]/gi, '');             // control symbols
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
```

Add a console.warn when RTF is detected: `console.warn('RTF file detected — stripping control sequences. Please verify extracted text.');`

In the file reader callback, detect `.rtf` extension and run `stripRtf()` before passing to upload pipeline.

Frontend-only. Show diff before applying.

---

### TASK K — CLAUDE.md Stale Note Fix + Query Log Check

**K1 — hex-ssh read server.py** — search for `case_chunks_fts` and `fts-search-chunks`. Check whether the case_chunks BM25 pass has its own enable/disable guard or runs unconditionally. Report the relevant code.

**K2 — Update the `BM25_FTS_ENABLED` entry in the SESSION RULES table of `Arc v 4/CLAUDE.md`** to accurately reflect both FTS5 passes (secondary_sources_fts and case_chunks_fts) and their gate conditions.

**K3 — Query log check:** The query_log table has 0 rows despite being wired in session 65. Grep worker.js for the INSERT INTO query_log statement — verify it's in the live code path (not dead code or behind a condition that never fires). Report finding.

Local file edits only (CLAUDE.md, worker.js if needed). No SCP for CLAUDE.md.

---

### TASK L — Corpus Health Check State

**Already diagnosed (Cowork session 66):** corpus_health_check.py is fully built and operational. Last ran 15 April 2026 — produced 13 clusters, 1 high-confidence contradiction, 28 intra-cluster gaps. Monthly cron active.

**What's missing (minor hardening only):**
* No token overflow guard for large clusters
* No clustering instability diff check between runs  
* No idempotency key against duplicate runs
* No local JSON fallback if Worker is down

**Action:** Read `~/ai-stack/agent-general/src/corpus_health_check.py` via hex-ssh to confirm current state matches this assessment. If the core functionality (clustering, contradiction detection, gap detection, D1 writes) is all present: note "confirmed complete, minor hardening deferred" and skip. Do NOT build hardening improvements this session.

---

## DEPLOYMENT PLAN

**One frontend build + deploy** — batch Tasks H, I, J into a single `npm run build` from `arcanthyr-ui/` then:
```
cp -r dist/. "../Arc v 4/public/"
cd "../Arc v 4"
node --check worker.js
npx wrangler deploy
```

**One worker.js deploy** — if Task H adds new routes, they're included in the same wrangler deploy above.

**server.py** — only if Task F results in route removal (unlikely). If so: SCP → force-recreate agent-general ONLY (NOT enrichment-poller).

**PowerShell setup required before any wrangler/npx command:**
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

---

## TASKS DELIBERATELY EXCLUDED

* **Task G (Query expansion)** — DEFERRED. The vocabulary anchor re-embed (session 65) solves the same recall problem from the embedding side. Adding query expansion now prevents isolating which change helped. Revisit after re-embed baseline.
* **RRF, stub quarantine activation, subject_matter Part 3 MatchAny** — all gated on post-re-embed baseline.
* **enrichment_poller.py changes** — off-limits until re-embed completes.
