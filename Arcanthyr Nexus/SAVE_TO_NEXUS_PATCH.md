# Save to Nexus — Patch (two fixes)

Addendum to SAVE_TO_NEXUS_BUILD_PLAN.md. Apply on top of Worker `96751a35` / commit `40eb0f9`.

---

## Fix 1 — Delete approved secondary sources from Library UI

**Problem:** The reject action on `POST /api/admin/approve-secondary` only deletes rows with `approved=0`. Once a Nexus save is approved and embedded, there's no way to remove it from the UI — you'd need a manual D1 delete plus Qdrant point cleanup.

**Worker change — `handleApproveSecondary` in worker.js:**

Add a third action: `"delete"`. Unlike `"reject"` (which has the `AND approved = 0` safety gate), `"delete"` removes the row regardless of approved status AND cleans up the Qdrant vector.

```
if (action === "delete") {
  // 1. Delete from Qdrant via server.py /delete endpoint
  //    Body: { citation: id } — server.py delete_citation() removes all points
  //    matching the citation field in Qdrant payload
  //    Requires X-Nexus-Key header, WORKER_URL from env
  const deleteRes = await fetch(`${env.WORKER_URL_INTERNAL || 'https://arcanthyr.com'}/api/pipeline/delete-vector`, ...);
  // Note: if no /delete-vector route exists, call server.py directly:
  //   fetch(`${nexusUrl}/delete`, { method: 'POST', headers: { 'X-Nexus-Key': env.NEXUS_SECRET_KEY }, body: JSON.stringify({ citation: id }) })
  
  // 2. Delete from FTS5
  await env.DB.prepare("DELETE FROM secondary_sources_fts WHERE source_id = ?").bind(id).run();
  
  // 3. Delete from D1
  await env.DB.prepare("DELETE FROM secondary_sources WHERE id = ?").bind(id).run();
  
  return Response.json({ ok: true, action: "delete" });
}
```

**Check how server.py /delete works:** The route is `POST /delete` with body `{ citation: "..." }`. It deletes all Qdrant points where `payload.citation == citation` OR `payload.source_id == citation`. The secondary source poller writes `source_id: chunk['id']` into Qdrant payload — so passing the secondary source `id` as the citation value should match. Verify by grepping server.py for `delete_citation`.

**Library.jsx — Secondary Sources table:**

Add a small delete action (🗑 icon or "Delete" text link) on each row in the secondary sources table — but ONLY for rows where `id` starts with `nexus-save-` (don't show delete on corpus secondary sources). On click:

1. `window.confirm("Delete this saved answer from the corpus? This removes it from both D1 and Qdrant.")` 
2. POST to `/api/admin/approve-secondary` with `{ id, action: "delete" }`
3. On success: remove row from table state

Also show the delete action in the **Pending Review section** as a third option alongside Approve/Reject — for cases where you want to delete rather than just reject (e.g. if you approved something by mistake and want to fully remove it).

---

## Fix 2 — Date stamp on Nexus save title/ID

**Problem:** Saved answers have no date reference in their title or display — hard to assess recency when they surface in search results.

**Two changes:**

### 2a. Research.jsx — SaveFlagPanel title pre-fill

Change the pre-filled title from just the query text to include a date prefix:

```js
// Current:
const defaultTitle = queryText;

// New:
const today = new Date().toISOString().slice(0, 10); // "2026-04-18"
const defaultTitle = `${queryText} (${today})`;
```

User can still edit the title before confirming. The date suffix makes it immediately obvious when the synthesis was generated.

### 2b. ReadingPane / Research results — show date_added for secondary sources

When a secondary source chunk appears in search results, include the `date_added` field in the display. The Worker's `handleLegalQuery` already returns chunk metadata — check if `date_added` is included in the secondary source payload from Qdrant or if it needs to be added to the poller's metadata dict.

If `date_added` is NOT in the Qdrant payload currently:
- Add `'date_added': chunk.get('date_added', '')` to the secondary source metadata dict in `enrichment_poller.py` `run_embed_secondary_sources()`
- This will only populate on newly embedded rows — existing rows won't have it until next re-embed
- For now, the title date suffix (2a above) is the primary recency signal

If `date_added` IS already in payload:
- Display it as a subtle "(saved 2026-04-18)" tag next to secondary source results in the Research page results list

---

## Deploy sequence

1. Edit worker.js — add `"delete"` action to `handleApproveSecondary`
2. `node --check worker.js`
3. `npx wrangler deploy` (from Arc v 4/)
4. Edit Research.jsx — date prefix on title pre-fill
5. Edit Library.jsx — delete button on nexus-save rows + pending review section
6. `cd ../arcanthyr-ui && npm run build`
7. `cp -r dist/. "../Arc v 4/public/"` -Force
8. `cd "../Arc v 4" && npx wrangler deploy`

## Verify

1. Go to Library → Secondary Sources → find `nexus-save-1776474727084` → click Delete → confirm row removed from table
2. Query "elements of common assault" again → confirm the saved answer no longer surfaces
3. Run a new query → Save to Nexus → confirm title shows "(2026-04-18)" suffix
4. Check D1: `SELECT id, title FROM secondary_sources WHERE approved = 0` — title should include date
