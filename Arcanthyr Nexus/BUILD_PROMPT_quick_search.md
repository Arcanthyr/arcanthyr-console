# Build Prompt — Quick Search tab (Arcanthyr console)

**Context:** Scope was negotiated in a Cowork session against CLAUDE.md + CLAUDE_arch.md. Original build plan proposed OLEXI MCP, auslaw-mcp Docker container, Jade fetch, and a new search_history table. All four were cut after review — see "Dropped scope and why" at bottom. What follows is the final agreed build.

**Assumed uploads:** CLAUDE.md, CLAUDE_arch.md. Upload CLAUDE_init.md too if you expect any wrangler/npx/SSH work (you will).

---

## Goal

Give Tom a simple keyword-search tab in the arcanthyr.com console. Type a word (e.g. `driving`) or section reference (e.g. `s 138 Evidence Act`) → get a card list of cases discussing it. No boolean. No AI synthesis. Pure retrieval, rendered cleanly.

Three sources, in order of priority:
1. **Corpus** — Tom's 1,820 Tasmanian cases, indexed in `case_chunks_fts` (FTS5, 25,236 rows, already exists)
2. **AustLII** — external national coverage via AustLII's own keyword search, proxied through VPS to preserve IP hygiene
3. **Jade** (Phase 3 only) — optional "View in Jade" button for cleaner judgment rendering of selected results

---

## Phase 1 — Corpus keyword search (ship first)

**Backend: new Worker route `GET /api/legal/search-corpus`**

- No auth (follow `handleLibraryList` / `handleSearchByLegislation` unauth pattern)
- Params: `q` (required, free-form keyword string), `limit` (default 30, max 50), `offset` (default 0)
- Query D1 `case_chunks_fts` via MATCH, JOIN `cases` table for `case_name`, `court`, `subject_matter`, `case_date`
- Stop-word filter the query before passing to MATCH (reuse logic from existing `/api/pipeline/case-chunks-fts-search` — it already does this)
- Return shape per hit: `{ chunk_id, citation, case_name, court, subject_matter, case_date, snippet (800 chars of enriched_text) }`
- Group or dedupe by citation if multiple chunks from same case match — return best-matching chunk per case, with a `match_count` field showing how many chunks in that case hit
- Order: FTS5 rank score DESC, then court hierarchy (HCA → FullCourt/CCA → Supreme → Magistrates), then `case_date` DESC

Note: a route called `/api/pipeline/case-chunks-fts-search` already exists (session 68, X-Nexus-Key auth'd, internal use). Do NOT modify it. Build the new `/api/legal/search-corpus` as a sibling following the same D1 query pattern but unauth'd and with the grouping/ordering tweaks above.

**Frontend: new page `arcanthyr-ui/src/pages/QuickSearch.jsx`**

- Input box, submit button
- Results as card list (reuse visual style from Library.jsx `LegislationResultsTable` or `CasesTable` — whichever is cleaner)
- Each card: citation (bold), case name, court badge, year, snippet, match_count pill if >1
- Click card → open existing reading pane (same as Library case-click flow)
- Loading spinner during fetch, empty state, error state
- New API method in `src/api.js`: `searchCorpus(q, limit, offset)`

**Routing:**
- Add to `src/App.jsx`: new route `/quick-search` → QuickSearch component
- Add to `src/components/Nav.jsx`: new tab "Quick Search" between Research and Library

**Verify before shipping Phase 1:**
1. `node --check worker.js` passes
2. Type "driving" → get a list of cases that mention it, ranked sensibly
3. Click a result → reading pane opens with the case, works the same as Library click-through
4. Type a gibberish string → clean empty state, no error
5. Type nothing and submit → no query fires (input validation)

---

## Phase 2 — External AustLII search (same tab, source toggle)

**Backend: new Worker route `GET /api/legal/search-austlii`**

- No auth
- Params: `q`, `limit` (default 20, max 30)
- Build AustLII search URL: `https://www6.austlii.edu.au/cgi-bin/sinosrch.cgi?meta=%2Fau&query={encoded_q}&method=auto&results=50`
- Fetch via server.py `/fetch-page` endpoint (already exists — used by `runDailySync` for exactly this purpose, avoids direct Cloudflare-edge fetch fingerprinting)
- `POST {VPS}/fetch-page` with body `{ url: austlii_search_url }`, X-Nexus-Key header
- Parse returned HTML — AustLII's result format is stable. Each result is a `<li>` or table row with citation, case name, URL, snippet. Test with a live fetch first before writing the parser, so the parser matches actual current markup
- Return shape per hit: `{ citation, case_name, court, year, snippet, austlii_url }`

**Corpus-membership badge:**
- After parsing AustLII results, collect all citations into an array
- Single D1 query: `SELECT citation FROM cases WHERE citation IN (?, ?, ...)`
- For each AustLII hit whose citation is in the corpus, add `in_corpus: true` to the result object
- Frontend renders an "In Arcanthyr corpus" pill on those results → click pill or card navigates into the corpus reading pane instead of opening AustLII

**Frontend update to QuickSearch.jsx:**
- Source toggle above input: `[ Corpus ] [ AustLII ] [ Both ]` (Corpus default)
- "Both" mode: fire both routes in parallel, merge results, corpus results first, AustLII results after (deduped by citation — if same case appears in both, show corpus version with an extra "also on AustLII" subtle indicator)
- Clear per-source loading states
- "In corpus" pill handling per above

**Verify Phase 2:**
1. Type "driving" on Corpus source → same as Phase 1
2. Switch to AustLII → get external results, no duplicates with corpus
3. Switch to Both → merged list, corpus items first, "in corpus" badges correct on overlapping AustLII items
4. VPS /fetch-page is returning AustLII HTML successfully (if not, AustLII may be rate-limiting — check `docker compose logs agent-general` for the /fetch-page call)

---

## Phase 3 — Jade direct-URL button (optional, ~2 hours)

On every result card that has a citation parseable into `[YEAR] COURT NUMBER`:

- Add "View in Jade" link button (not a modal — just an external link)
- Parse citation → construct `https://jade.io/content/ext/mnc/{year}/{court_lowercase}/{number}`
- Opens in new tab

That's it. No backend, no fetch, no parsing. If the user wants Jade's rendering they click through. Skip the full-fetch-and-render-inline approach from the original plan — it's fragile and the convenience isn't worth the parser maintenance.

Citation parser: small helper in frontend (src/utils/citation.js or similar). AustLII-style citations look like `[2020] TASSC 14` → `{year: 2020, court: 'tassc', number: 14}`. Handle variants (TASCCA, TASFC, HCA, FCA, NSWSC etc).

**Verify Phase 3:**
- Click "View in Jade" on a known case → opens Jade's version of the judgment
- Citations that don't parse cleanly → button hidden, not broken

---

## Phase 4 — Search history (small extension of existing query_log)

**D1 migration:**

```sql
ALTER TABLE query_log ADD COLUMN search_type TEXT DEFAULT 'research';
```

Do NOT create a new `search_history` table. `query_log` already has the right shape (query_text, timestamp, result_ids, deleted soft-delete column, etc.) and the Research page already has a history side panel built against it.

**Worker changes:**

- In `handleSearchCorpus` and `handleSearchAustlii`: after returning results, write to query_log with `search_type = 'quick_corpus'` or `'quick_austlii'`. Non-fatal — wrap in try/catch per existing pattern in `handleLegalQuery`.
- `answer_text` should be NULL for these (no synthesis happened)
- `model` should be NULL (no LLM was called)
- `result_ids` / `result_scores` / `result_sources` can still be populated from the hit list
- Extend `/api/research/history` and `/api/research/history-delete` handlers to accept an optional `search_type` filter param. If present, filter. If absent, return all as today (backward compatible).

**Frontend:**
- Extend Research page history side panel: add three tiny filter pills `[ All ] [ Research ] [ Quick ]` at the top of the panel
- Clicking a past Quick Search entry → navigates to /quick-search and fires the query again (no cached answer to restore — Quick Search is always live)
- Delete action works the same

**Verify Phase 4:**
1. `SELECT search_type, COUNT(*) FROM query_log GROUP BY search_type` — returns both research and quick rows after use
2. History panel filter toggles work
3. Clicking a Quick history entry re-runs the search, doesn't try to restore a non-existent answer

---

## Deploy sequence (per CLAUDE.md rules)

For each phase:

**1. Backend changes (worker.js):**
- Edit `Arc v 4/worker.js`
- `cd "Arc v 4" && node --check worker.js` — must pass
- `cd "Arc v 4" && npx wrangler deploy` — confirm upload list is `public/` files only, no `.env` or `.git`

**2. Frontend changes (arcanthyr-ui):**
- Edit files under `arcanthyr-console/arcanthyr-ui/src/`
- `cd arcanthyr-console/arcanthyr-ui && npm run build`
- `cp -r arcanthyr-console/arcanthyr-ui/dist/. "arcanthyr-console/Arc v 4/public/"`
- `cd "arcanthyr-console/Arc v 4" && npx wrangler deploy`

**3. D1 schema changes (Phase 4 only):**
- `cd "arcanthyr-console/Arc v 4" && npx wrangler d1 execute arcanthyr --remote --command "ALTER TABLE query_log ADD COLUMN search_type TEXT DEFAULT 'research'"`

**4. Git commits (from monorepo root):**
- `cd arcanthyr-console`
- Stage and commit per phase, not one mega-commit: "Phase 1 — Quick Search corpus FTS route + tab", "Phase 2 — AustLII external search + source toggle", etc.
- `git add -A && git commit && git push origin master` — separately, no `&&` between commit/push per CLAUDE.md rule

**PowerShell reminders:**
- `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` at start
- Never use `&&`, heredoc, grep, head — use Select-String, Select-Object -First N

---

## Files to touch

**Worker (Arc v 4/):**
- `worker.js` — add `handleSearchCorpus`, `handleSearchAustlii`, route registrations, extend history handler with search_type filter

**Frontend (arcanthyr-ui/src/):**
- `pages/QuickSearch.jsx` (new)
- `App.jsx` — route add
- `components/Nav.jsx` — tab add
- `api.js` — `searchCorpus()`, `searchAustlii()` methods
- `utils/citation.js` (new, Phase 3) — citation parser for Jade URL construction
- `pages/Research.jsx` — history panel filter pills (Phase 4)

**No changes needed:**
- server.py — `/fetch-page` already exists and does what's needed
- No Docker/compose changes — no new containers
- No new D1 tables — extend query_log only

---

## Dropped scope (do NOT build)

These were in the original proposal and were cut after review. Don't add them back without a new conversation:

- **OLEXI MCP integration** — external Google Cloud Run dependency, value-add over AustLII's own keyword search is unclear, creates an "what if it disappears" risk. AustLII's native search accepts plain keywords and returns parseable HTML — build directly against that instead.
- **auslaw-mcp Docker container** — court-hierarchy ranking is 20 lines of re-sort in the Worker; paragraph citations are already in AustLII HTML; full judgment text is the same bytes AustLII serves. The container would bundle three small things you can do in one Worker route, at the cost of a security audit, a container lifecycle, and dependency risk. Not worth it.
- **Jade full-fetch + inline render** — replaced with Phase 3 "View in Jade" button. External link is enough.
- **New `search_history` D1 table** — duplicates `query_log` which already has the right shape. Extend with `search_type` column instead.
- **Server.py /search/quick and /search/deep routes** — wrong layer. Worker is the backend-for-frontend. server.py is internal service. New routes belong on the Worker.
- **AI synthesis layer on search results** — out of scope. Research tab handles synthesis; Quick Search is pure retrieval.
- **Boolean search UI** — Tom doesn't want boolean. Plain keyword in, ranked case list out.

---

## Rules and gotchas for CC to respect

- **SYSTEM STATE check rule** (added session 71): before proposing any work as new/outstanding, check SYSTEM STATE table in CLAUDE.md. Don't propose work that's already live.
- **Poller running** — do NOT modify or restart `enrichment-poller` until the in-progress re-embed completes (~7,549 case chunks remaining per session 70 state). This build doesn't need to touch the poller, but noting it.
- **server.py is VPS-canonical** — if any /fetch-page quirk surfaces, SCP down before editing locally (see CLAUDE.md rule).
- **worker.js syntax check** — always `node --check worker.js` before `wrangler deploy`.
- **Upload list check** — always verify wrangler's upload list shows `public/` files only, no `.env` or `.git`.
- **AustLII parser fragility** — AustLII HTML is stable but not guaranteed. Write the parser defensively (handle missing fields gracefully, log unexpected structures, don't crash the whole route on one malformed result row).
- **/fetch-page rate limits** — if AustLII starts returning 403s or the /fetch-page proxy itself gets rate-limited, stop and check `docker compose logs agent-general` before pushing through. The VPS is not currently banned (confirmed session 35) — keep it that way by not hammering.
- **Testing** — before claiming Phase 1 done, actually open localhost:5173 or arcanthyr.com, type three different queries ("driving", "s 138 Evidence Act", "hostile witness"), confirm results look right. Don't ship on the basis of "the code compiles and the route returns 200."

---

## Build order

1. Phase 1 end-to-end (corpus FTS + UI). Commit. Test on arcanthyr.com.
2. Phase 2 (AustLII external + source toggle). Commit. Test.
3. Phase 4 (query_log extension + history filter). Commit. Test.
4. Phase 3 (Jade button) — only if time permits and Phases 1+2+4 are solid.

Phases 1–3 are the MVP. Phase 4 is polish. Phase 3 is gravy.

---

## Session close

When done, run the `arcanthyr-session-closer` skill to update CLAUDE.md's SYSTEM STATE, OUTSTANDING PRIORITIES, and add a CHANGES THIS SESSION block per the end-of-session procedure. Also update CLAUDE_arch.md's FUTURE ROADMAP — remove the "OLEXI / auslaw-mcp search integration" entry if it's there (it shouldn't be but check), and note that Quick Search is now live.
