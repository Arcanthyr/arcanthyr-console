# Save to Nexus + Flag — Build Plan

CC build spec for synthesis answer promotion and quality feedback UI.
Standalone — all context needed is in this file.

---

## Background

Two features on the Research page synthesis answer panel:

1. **Save to Nexus** (prominent) — promotes a good AI synthesis answer back into the secondary_sources corpus for future retrieval. Lands in a staging queue (approved=0) so Tom reviews before it gets embedded.
2. **Flag** (subtle) — one-click negative feedback that writes to the existing synthesis_feedback D1 table. Quality monitoring signal, no modal.

Architecture decision (from CLAUDE_decisions.md): "Saved answers go to a staging queue (approved=0 in secondary_sources) before ingestion. Tom reviews and approves before embedding. No auto-ingestion path." Rationale: legal knowledge base where accuracy is the whole point — a bad auto-saved answer would be self-reinforcing in future queries.

---

## Part 1 — D1 Schema Change

Add `approved` column to secondary_sources:

```sql
ALTER TABLE secondary_sources ADD COLUMN approved INTEGER DEFAULT 1;
```

Default 1 so all existing 1,199 rows are unaffected. Only Save to Nexus rows land with approved=0.

**Update enrichment_poller.py embed pass** — add `AND approved = 1` to the fetch query for secondary sources embedding. This is the gate that prevents unapproved answers from reaching Qdrant. The poller fetches from the Worker route `GET /api/pipeline/fetch-secondary-for-embedding` — update that Worker route's SQL to include `AND approved = 1`.

---

## Part 2 — Worker Routes

### 2a. Save to Nexus route

Use the existing `POST /api/legal/format-and-upload` route in **single-chunk mode** (`mode: 'single'`). No new route needed.

The frontend will POST:
```json
{
  "text": "<synthesis answer text>",
  "mode": "single",
  "title": "<derived from query>",
  "slug": "nexus-save-<timestamp>",
  "category": "annotation",
  "approved": 0
}
```

**Worker change required:** In `handleFormatAndUpload`, when `body.approved === 0` is present, pass `approved = 0` in the D1 INSERT instead of the default 1. This is the only change to the existing route — a single conditional on the INSERT.

Auth: existing User-Agent spoof pattern (same as all format-and-upload calls from the frontend).

### 2b. Approval route (new)

`POST /api/admin/approve-secondary` — X-Nexus-Key auth.

Body: `{ "id": "<secondary_source_id>", "action": "approve" | "reject" }`

- `approve`: `UPDATE secondary_sources SET approved = 1 WHERE id = ?` — poller will pick it up on next cycle
- `reject`: `DELETE FROM secondary_sources WHERE id = ? AND approved = 0` — only deletes unapproved rows (safety gate)

Returns: `{ ok: true, action: "approve|reject" }`

### 2c. Pending review list (new)

`GET /api/admin/pending-nexus` — X-Nexus-Key auth.

SQL: `SELECT id, title, category, raw_text, date_added FROM secondary_sources WHERE approved = 0 ORDER BY date_added DESC`

Returns: `{ ok: true, items: [...] }`

### 2d. Flag route

Already exists: `POST /api/pipeline/feedback` — writes to synthesis_feedback table. Body: `{ query_id, chunk_id, feedback_type, comment }`. X-Nexus-Key auth. No changes needed.

---

## Part 3 — Frontend (arcanthyr-ui)

### 3a. Research.jsx — Save to Nexus button

Location: on the AI synthesis answer panel, after the answer text renders.

**Button:** "Save to Nexus" with a small archive/bookmark icon (use lucide-react `BookmarkPlus` or `Archive`). Understated style — outline/ghost button matching existing UI variables (var(--border), var(--text-secondary)). Not prominent until hovered.

**On click:** opens an inline confirmation panel (NOT a modal — keep it lightweight). Panel contains:
- **Title** field: pre-filled with the user's query text, editable, capped at 120 chars
- **Category** dropdown: defaults to "annotation". Options: annotation, doctrine, practice note, checklist (subset of canonical categories that make sense for synthesised answers)
- **Preview:** the synthesis answer text (read-only, scrollable if long, max-height ~200px)
- **Confirm** button + **Cancel** link

**On confirm:**
- POST to `/api/legal/format-and-upload` with `{ text: synthesisAnswer, mode: 'single', title, slug: 'nexus-save-' + Date.now(), category, approved: 0 }`
- Auth: User-Agent spoof header (same pattern as existing upload calls in api.js)
- On success: button changes to "Saved ✓" (disabled state) with a subtle green tint, persists for the duration of that query result
- On error: brief inline error message, button re-enabled

### 3b. Research.jsx — Flag button

Location: next to (or below) Save to Nexus, smaller and more subtle.

**Button:** "Flag" with lucide-react `Flag` icon. Text-only/link style, var(--text-tertiary) or var(--red) on hover.

**On click:** single click, no modal. POSTs to `/api/pipeline/feedback` with:
```json
{
  "query_id": "<from the query response>",
  "chunk_id": null,
  "feedback_type": "unhelpful",
  "comment": ""
}
```

Note: query_id is returned in both `handleLegalQuery` and `handleLegalQueryWorkersAI` responses. The frontend already receives it — just needs to be threaded to the Flag button.

Auth: X-Nexus-Key. The key needs to be available in the frontend — check how PipelineStatus.jsx handles this (it has an auth key input pattern). For Flag, consider storing the key in React state at the app level (same pattern as Library truncation modal).

**On success:** button text changes to "Flagged" (disabled), subtle red tint. No toast, no modal.

### 3c. Library.jsx — Pending Nexus review tab/section

Add a **"Pending Review"** indicator to the Secondary Sources tab in Library.

**Option A (minimal):** A count badge on the Secondary Sources tab header — e.g. "SECONDARY SOURCES (3)" when there are pending items. Clicking through shows pending items at the top of the table with an amber "Pending" status pill and Approve/Reject action buttons per row.

**Option B (separate section):** A collapsible "Pending Review" section at the top of the Secondary Sources tab that only renders when count > 0. Each row shows: title, category, date_added, raw_text preview (first 200 chars), and Approve ✓ / Reject ✕ buttons.

Recommend **Option B** — keeps the review workflow visible without polluting the main table.

**Approve button:** POST to `/api/admin/approve-secondary` with `{ id, action: "approve" }`. On success: row animates out of pending section (or refreshes list).

**Reject button:** `window.confirm("Delete this saved answer?")` guard, then POST with `{ id, action: "reject" }`. On success: row removed.

Auth: X-Nexus-Key input — same pattern as PipelineStatus.jsx / TruncationModal (key persists in Library component state).

---

## Part 4 — Files to modify

| File | Changes |
|---|---|
| `Arc v 4/worker.js` | (1) `handleFormatAndUpload`: pass `approved` from body to INSERT when present; (2) new `handleApproveSecondary` route; (3) new `handlePendingNexus` route; (4) `fetch-secondary-for-embedding` SQL: add `AND approved = 1` |
| `arcanthyr-ui/src/api.js` | Add `saveToNexus()`, `flagSynthesis()`, `fetchPendingNexus()`, `approveSecondary()` methods |
| `arcanthyr-ui/src/pages/Research.jsx` | Add SaveToNexus and Flag buttons/panels on synthesis answer |
| `arcanthyr-ui/src/pages/Library.jsx` | Add Pending Review section to Secondary Sources tab |

No server.py changes. No enrichment_poller.py changes (the `approved=1` gate is at the Worker SQL level, which the poller reads from).

---

## Part 5 — Verification

After build:
1. Run a query on arcanthyr.com, click Save to Nexus, confirm — check D1: `SELECT id, title, approved FROM secondary_sources WHERE approved = 0` should show the new row
2. Confirm poller does NOT embed it: wait one poller cycle (~15s), check `embedded` is still 0
3. Go to Library → Secondary Sources → Pending Review section → click Approve
4. Confirm poller now embeds it: wait one cycle, check `embedded = 1`
5. Run the original query again — the saved answer should now appear in retrieval results
6. Test Flag button — check synthesis_feedback table has the new row
7. Test Reject — create a second save, reject it, confirm row deleted from secondary_sources

---

## PowerShell key extraction fix (while you're in worker.js)

The standard PowerShell pattern for extracting NEXUS_SECRET_KEY is broken. `Split("=")[1]` strips the trailing `=` from base64 keys, causing silent auth failures.

Update CLAUDE.md session rules — everywhere `$key = (Select-String "NEXUS_SECRET_KEY" .env).Line.Split("=")[1]` appears, change to:

```powershell
$key = (Select-String "NEXUS_SECRET_KEY" .env).Line.Split("=",2)[1]
```

The `,2` limits the split to 2 parts, preserving the trailing `=` in the base64 value.

---

## Deploy sequence

1. `node --check worker.js` (syntax validation)
2. `npx wrangler d1 execute arcanthyr --remote --command "ALTER TABLE secondary_sources ADD COLUMN approved INTEGER DEFAULT 1"`
3. `npx wrangler deploy` (from Arc v 4/)
4. `cd ../arcanthyr-ui && npm run build`
5. `cp -r dist/. "../Arc v 4/public/"` (with -Force if PowerShell)
6. `cd "../Arc v 4" && npx wrangler deploy` (again, to pick up new frontend assets)
7. Verify via the 7-step checklist above
