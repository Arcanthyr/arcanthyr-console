# Query History — Build Plan

CC build spec for a query history log on the Research page. Standalone — all context needed is in this file.

---

## What this does

Every query + synthesis answer is automatically saved to D1. The Research page gets a history panel where Tom can browse past queries, re-read answers without re-querying, and promote good answers to the corpus (Save to Nexus) or delete them from history.

---

## Part 1 — D1 Schema

The `query_log` table already exists and is populated on every query. Current columns include: `id`, `query_text`, `timestamp`, `refs_extracted`, `bm25_fired`, `result_ids`, `result_scores`, `result_sources`, `total_candidates`, `query_type`, `target_chunk_id`, `target_rank`, `session_id`, `client_version`.

Add three columns:

```sql
ALTER TABLE query_log ADD COLUMN answer_text TEXT;
ALTER TABLE query_log ADD COLUMN model TEXT;
ALTER TABLE query_log ADD COLUMN deleted INTEGER DEFAULT 0;
```

- `answer_text` — the full synthesis response text returned to the user
- `model` — which model generated it: `"sol"` (Claude API) or `"vger"` (Workers AI Qwen3)
- `deleted` — soft delete flag (0 = visible, 1 = hidden from UI). Soft delete so we don't lose query analytics data.

---

## Part 2 — Worker Changes

### 2a. Store answer text in query_log

In both `handleLegalQuery` (Claude API path) and `handleLegalQueryWorkersAI` (Workers AI path), the query_log INSERT already fires after retrieval and before returning the response. Extend the INSERT to include:

- `answer_text`: the synthesis answer string that gets returned to the frontend (the `answer` or `response` field in the JSON response)
- `model`: `"sol"` in handleLegalQuery, `"vger"` in handleLegalQueryWorkersAI

The query_log INSERT is non-fatal (wrapped in try/catch) — this should stay non-fatal. If the answer_text write fails, the query still returns normally.

### 2b. Query history fetch route (new)

`GET /api/research/history` — no auth required (read-only, non-sensitive).

SQL:
```sql
SELECT id, query_text, answer_text, model, timestamp 
FROM query_log 
WHERE deleted = 0 AND answer_text IS NOT NULL
ORDER BY timestamp DESC 
LIMIT 50
```

Returns: `{ ok: true, items: [...] }`

The `LIMIT 50` keeps the payload reasonable. Could add `?offset=N` pagination later if needed, but 50 recent queries is plenty for the initial build.

### 2c. Delete history entry route (new)

`POST /api/research/history-delete` — no auth required (it's a soft delete on the user's own query history, not a corpus modification).

Body: `{ "id": "<query_log_id>" }`

SQL: `UPDATE query_log SET deleted = 1 WHERE id = ?`

Returns: `{ ok: true }`

Note: this is a soft delete. The row stays in query_log for analytics purposes — it just won't appear in the history UI.

---

## Part 3 — Frontend

### 3a. Research.jsx — History panel

Add a collapsible history panel to the Research page. Two design options:

**Option A — Side panel (recommended):** A narrow panel on the left side of the Research page (or right side, whichever fits the existing layout). Shows a scrollable list of past queries. Collapsed by default with a "History" toggle button/icon (lucide-react `Clock` or `History`). When expanded, takes ~250-300px width. Each entry shows:
- Query text (truncated to ~60 chars with ellipsis)
- Date + time (e.g. "18 Apr 2:30 PM")
- Model pill: "Sol" or "V'ger" (small, coloured to match the existing model toggle style)

**Option B — Dropdown panel:** A dropdown that opens below the search input, showing recent queries. Simpler but less persistent.

Recommend **Option A** — it lets Tom keep history visible while working, which matches the "compound questions and answers" workflow he described.

### 3b. History entry click → Reading pane

When a history entry is clicked:
- The answer text loads into the existing reading pane / answer display area (same place synthesis answers currently render)
- The query text populates the search input (so Tom can re-run or modify it)
- The entry gets a subtle "viewing history" indicator so it's clear this is a cached answer, not a fresh query

This should NOT re-run the query. It just displays the stored answer_text.

### 3c. History entry actions

Each history entry (either in the side panel on hover, or when expanded in the reading pane) has two actions:

- **Save to Nexus** — same flow as the existing Save to Nexus button. Pre-fills title with query text + date, category defaults to "annotation", POSTs to format-and-upload with `approved: 0`. Uses the stored `answer_text` as the content.
- **Delete** (🗑) — calls `POST /api/research/history-delete` with the entry ID. Removes from the history list with a fade-out animation. No confirm dialog needed (it's soft delete, recoverable).

### 3d. Auto-refresh on new query

When a new query is submitted and the answer comes back, automatically prepend the new entry to the history list (optimistic UI — don't wait for a re-fetch of the full history).

The query response already returns `query_id` — use this as the history entry ID. Store the query text, answer text, model, and current timestamp locally and prepend to the list.

### 3e. Fetch history on page load

On Research page mount, call `GET /api/research/history`. Populate the history panel. Loading state: subtle skeleton or "Loading history..." text. Empty state: "No queries yet" (or just hide the panel).

---

## Part 4 — Files to modify

| File | Changes |
|---|---|
| `Arc v 4/worker.js` | (1) Extend query_log INSERT in both `handleLegalQuery` and `handleLegalQueryWorkersAI` to include `answer_text` and `model`; (2) new `handleQueryHistory` route (GET); (3) new `handleQueryHistoryDelete` route (POST) |
| `arcanthyr-ui/src/pages/Research.jsx` | History panel component, click-to-view, Save to Nexus / Delete actions per entry, auto-prepend on new query, fetch on mount |
| `arcanthyr-ui/src/api.js` | Add `fetchQueryHistory()`, `deleteQueryHistory(id)` methods |

No server.py changes. No enrichment_poller.py changes.

---

## Performance notes

- D1 write: one extra TEXT column per query. Synthesis answers are typically 200-500 words (~1-3KB). Negligible cost.
- D1 read: one SELECT on page load, LIMIT 50. Sub-millisecond on D1.
- No Qdrant impact. No poller impact.
- Frontend: 50 entries max in memory. Trivial.

---

## Deploy sequence

1. Run the three ALTER TABLE commands via wrangler d1
2. Edit worker.js — extend INSERT, add two new routes
3. `node --check worker.js`
4. `npx wrangler deploy`
5. Edit Research.jsx and api.js
6. `cd ../arcanthyr-ui && npm run build`
7. `cp -r dist/. "../Arc v 4/public/"` -Force
8. `cd "../Arc v 4" && npx wrangler deploy`

## Verify

1. Run a query → check D1: `SELECT id, query_text, answer_text, model FROM query_log ORDER BY timestamp DESC LIMIT 1` — should have answer_text and model populated
2. Refresh Research page → history panel should show the query
3. Click the history entry → answer displays without re-querying
4. Click Save to Nexus on a history entry → check D1 for new `approved=0` secondary source row
5. Click Delete on a history entry → entry disappears from panel, D1 row has `deleted=1`
6. Run a second query → new entry appears at top of history list immediately
