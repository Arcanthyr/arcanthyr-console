# Synthesis Feedback Loop — Build Plan
*Arcanthyr · Prepared April 2026 · Self-contained: implement without prior conversation context*

---

## What This Feature Does

When Arcanthyr produces a good synthesis answer, a practitioner can save it back into the secondary sources corpus. Saved answers accumulate as a curated annotation layer — future queries on the same topic surface the prior synthesis as supporting context, giving retrieval a worked example to build from rather than raw fragments alone.

The loop is **curated, not automatic**. Answers go to a staging queue first. Tom reviews and approves before anything gets embedded. This is non-negotiable for a legal knowledge base.

---

## Prerequisites

- **`subject_matter` filter must already be implemented** before building this feature. Saved answers need correct subject_matter tags to prevent cross-domain bleed in retrieval. Do not build this feature without it.
- Corpus should be at a reasonably stable state — saving answers built from incomplete source material permanently degrades the corpus.

---

## Design Decisions (already settled — do not relitigate)

1. **Staging via D1, not KV** — `approved=0` rows in `secondary_sources`. Queryable, auditable, zero new infrastructure.
2. **Enrichment skipped** — saved answers are already synthesised prose. Rows land with `enriched=1, embedded=0`. Poller embeds after approval.
3. **Citation chain preserved** — `source_chunk_ids` JSON column stores the Qdrant point IDs of every chunk that contributed to the answer. Never surfaced in UI but permanently queryable for audit/tracing.
4. **Source query preserved** — `source_query` TEXT column stores the raw query string that generated the answer. Separate from title. Enables future Q-vector retrieval if desired.
5. **Weight penalty in retrieval** — synthesised chunks get a 0.8 score multiplier so they don't crowd out primary material.
6. **Dedupe suppression** — if any of the saved answer's `source_chunk_ids` are already present in the current result set, the saved answer is dropped entirely. As corpus grows and retrieval improves, saved answers surface less — the problem self-corrects.
7. **Subject_matter hard filter** — synthesised chunks only retrieve within their tagged subject_matter domain. Belt-and-suspenders against drift.
8. **UI label** — synthesised chunks render as "Prior synthesis" with the source query as subtitle, visually distinct from case chunks and secondary source chunks.

---

## Implementation — Step by Step

### Step 1 — D1 Schema Changes

Add three columns to `secondary_sources`:

```sql
ALTER TABLE secondary_sources ADD COLUMN approved INTEGER NOT NULL DEFAULT 1;
ALTER TABLE secondary_sources ADD COLUMN source_chunk_ids TEXT;
ALTER TABLE secondary_sources ADD COLUMN source_query TEXT;
```

**Important:** Default `approved=1` so all existing rows are unaffected. Only new rows with `source_type='synthesised'` land with `approved=0`.

Run via wrangler (from `Arc v 4/`):
```powershell
npx wrangler d1 execute arcanthyr --remote --command "ALTER TABLE secondary_sources ADD COLUMN approved INTEGER NOT NULL DEFAULT 1"
npx wrangler d1 execute arcanthyr --remote --command "ALTER TABLE secondary_sources ADD COLUMN source_chunk_ids TEXT"
npx wrangler d1 execute arcanthyr --remote --command "ALTER TABLE secondary_sources ADD COLUMN source_query TEXT"
```

Verify:
```powershell
npx wrangler d1 execute arcanthyr --remote --command "PRAGMA table_info(secondary_sources)"
```

Also confirm all existing rows have `approved=1`:
```powershell
npx wrangler d1 execute arcanthyr --remote --command "SELECT COUNT(*) FROM secondary_sources WHERE approved=0"
```
Should return 0.

---

### Step 2 — Worker Route: `/api/legal/save-synthesis`

Add to `worker.js`. Requires `X-Nexus-Key` header.

**Request body:**
```json
{
  "query": "string — the original query text",
  "title": "string — editable label, defaults to 'Synthesised: [query]'",
  "answer_text": "string — full synthesis answer text",
  "subject_matter": "string — must match valid subject_matter values",
  "source_chunk_ids": ["array", "of", "qdrant", "point", "ids"]
}
```

**Handler logic:**
```javascript
async function handleSaveSynthesis(request, env) {
  const body = await request.json();
  const { query, title, answer_text, subject_matter, source_chunk_ids } = body;

  if (!query || !answer_text || !subject_matter) {
    return Response.json({ error: 'query, answer_text and subject_matter required' }, { status: 400 });
  }
  if (!Array.isArray(source_chunk_ids) || source_chunk_ids.length === 0) {
    return Response.json({ error: 'source_chunk_ids must be a non-empty array' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const finalTitle = title || `Synthesised: ${query.slice(0, 80)}`;

  await env.DB.prepare(`
    INSERT INTO secondary_sources
      (id, title, raw_text, source_type, subject_matter, enriched, embedded, approved, source_chunk_ids, source_query, date_added)
    VALUES (?, ?, ?, 'synthesised', ?, 1, 0, 0, ?, ?, datetime('now'))
  `).bind(
    id,
    finalTitle,
    answer_text,
    subject_matter,
    JSON.stringify(source_chunk_ids),
    query
  ).run();

  return Response.json({ success: true, id, message: 'Saved to review queue' });
}
```

Add route in the main router:
```javascript
if (path === '/api/legal/save-synthesis' && method === 'POST') {
  if (!checkAuth(request, env)) return unauthorized();
  return handleSaveSynthesis(request, env);
}
```

---

### Step 3 — Worker Routes: `/api/admin/synthesis-queue`

**GET** — returns pending items:
```javascript
async function handleGetSynthesisQueue(env) {
  const rows = await env.DB.prepare(`
    SELECT id, title, source_query, subject_matter, date_added,
           substr(raw_text, 1, 200) as preview
    FROM secondary_sources
    WHERE source_type='synthesised' AND approved=0
    ORDER BY date_added DESC
  `).all();
  return Response.json(rows.results);
}
```

**POST** — approve or discard:
```json
{ "id": "uuid", "action": "approve" | "discard" }
```
```javascript
async function handleSynthesisQueueAction(request, env) {
  const { id, action } = await request.json();
  if (!id || !['approve', 'discard'].includes(action)) {
    return Response.json({ error: 'id and action required' }, { status: 400 });
  }
  if (action === 'approve') {
    await env.DB.prepare(`UPDATE secondary_sources SET approved=1 WHERE id=?`).bind(id).run();
    return Response.json({ success: true, message: 'Approved — will embed on next poller cycle' });
  }
  if (action === 'discard') {
    await env.DB.prepare(`DELETE FROM secondary_sources WHERE id=? AND source_type='synthesised'`).bind(id).run();
    return Response.json({ success: true, message: 'Discarded' });
  }
}
```

Route registration:
```javascript
if (path === '/api/admin/synthesis-queue' && method === 'GET') {
  if (!checkAuth(request, env)) return unauthorized();
  return handleGetSynthesisQueue(env);
}
if (path === '/api/admin/synthesis-queue' && method === 'POST') {
  if (!checkAuth(request, env)) return unauthorized();
  return handleSynthesisQueueAction(request, env);
}
```

---

### Step 4 — Poller: Respect `approved` Flag

In `enrichment_poller.py`, the embedding query for `secondary_sources` must add `AND approved=1`.

Find the existing query that selects `secondary_sources` rows for embedding — it will look something like:
```python
WHERE enriched=1 AND embedded=0
```

Change to:
```python
WHERE enriched=1 AND embedded=0 AND approved=1
```

This is the critical gate. Without it, the poller will embed unapproved rows.

SCP and restart:
```powershell
scp "C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\enrichment_poller.py" tom@31.220.86.192:/home/tom/ai-stack/agent-general/src/enrichment_poller.py
```
```bash
docker compose restart enrichment-poller
```

Verify: `docker compose logs --tail=20 enrichment-poller` — confirm no unapproved rows are being picked up.

---

### Step 5 — Poller: Qdrant Upsert Payload for Synthesised Chunks

When embedding a `synthesised` row, the Qdrant payload must include extra fields so server.py can apply the weight penalty and dedupe suppression:

```python
import json as _json

# In run_embed_secondary_sources(), when building the payload dict:
payload = {
    "chunk_id": chunk["id"],
    "title": chunk.get("title", ""),
    "text": embed_text,
    "source_id": chunk["id"],
    "citation": chunk.get("id", ""),
    "type": "secondary_source",
    "source_type": chunk.get("source_type", ""),           # NEW
    "subject_matter": chunk.get("subject_matter", ""),     # NEW
    "source_chunk_ids": _json.loads(chunk.get("source_chunk_ids") or "[]"),  # NEW
    "source_query": chunk.get("source_query", ""),         # NEW
}
```

The Worker route that fetches chunks for embedding must also return these columns. Check `handleFetchForEmbedding` in `worker.js` — add `source_type, subject_matter, source_chunk_ids, source_query` to the SELECT if not already present.

---

### Step 6 — server.py: Weight Penalty + Dedupe Suppression

Two additions in `search_text()`, applied after all passes complete and before the final `top_k` cap.

**6a — Weight penalty:**
```python
SYNTHESISED_WEIGHT = 0.8

for chunk in chunks:
    if chunk.get("source_type") == "synthesised":
        chunk["score"] *= SYNTHESISED_WEIGHT
```

**6b — Dedupe suppression** (drop synthesised chunks whose source material is already present):
```python
def suppress_redundant_syntheses(chunks):
    present_ids = set()
    for c in chunks:
        if c.get("source_type") != "synthesised":
            qid = c.get("_qdrant_id")
            if qid:
                present_ids.add(str(qid))

    result = []
    for c in chunks:
        if c.get("source_type") == "synthesised":
            source_ids = c.get("source_chunk_ids", [])
            if any(str(sid) in present_ids for sid in source_ids):
                continue  # source material already in results — suppress
        result.append(c)
    return result

# Call after all passes, before top_k cap:
chunks = suppress_redundant_syntheses(chunks)
chunks.sort(key=lambda c: -c["score"])
chunks = chunks[:top_k]
```

**6c — Subject_matter filter** (belt-and-suspenders — synthesised chunks are already tagged but this hard-filters at retrieval):

The existing `apply_sm_penalty()` will already apply the 0.65 penalty to non-criminal synthesised chunks. No additional filter needed unless a synthesised chunk has an incorrect `subject_matter` tag — that's an approval-gate problem, not a retrieval problem.

---

### Step 7 — UI: Save Button + Confirm Panel (Research page)

**Prerequisite check first:** Confirm the `/api/legal/legal-query` (or `/api/legal/legal-query-workersai`) response currently returns chunk IDs (`_qdrant_id` or equivalent) for each source chunk. If not, add them to the response before building the UI — the save route needs them.

In `Research.jsx`, after the synthesis answer renders:

**Save button** — appears below the answer, not a primary action:
```jsx
<button className="save-synthesis-btn" onClick={() => setSavePanel(true)}>
  Save answer
</button>
```

**Confirm panel** (inline, not a modal):
```
┌──────────────────────────────────────────────────────┐
│ Save this answer to the knowledge base?              │
│                                                      │
│ Title: [Synthesised: what are the principles...]     │  ← editable
│ Subject matter: [criminal ▾]                         │  ← dropdown
│ Source chunks: 4 chunks cited                        │  ← read-only count
│                                                      │
│ [Confirm Save]                        [Cancel]       │
└──────────────────────────────────────────────────────┘
```

On Confirm Save:
```javascript
const res = await api.saveSynthesis({
  query: currentQuery,
  title: editedTitle,
  answer_text: currentAnswer,
  subject_matter: selectedSubjectMatter,
  source_chunk_ids: currentChunks.map(c => c._qdrant_id).filter(Boolean),
});
if (res.success) {
  showToast('Saved to review queue');
  setSavePanel(false);
}
```

Add `saveSynthesis` to `api.js`:
```javascript
saveSynthesis: (body) => fetchJSON(`${BASE}/api/legal/save-synthesis`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Nexus-Key': getNexusKey() },
  body: JSON.stringify(body),
}),
```

---

### Step 8 — UI: Synthesis Queue Tab (Library or Admin)

A new tab in Library.jsx (alongside CASES / SECONDARY SOURCES / LEGISLATION) or a dedicated admin panel. Loads on tab open via `GET /api/admin/synthesis-queue`.

Renders a review list:
```
Synthesis Review Queue                             [3 pending]

┌──────────────────────────────────────────────────────────┐
│ Query: "what are the principles governing..."            │
│ Title: Synthesised: what are the principles governing... │
│ Subject matter: criminal        Saved: 14 Apr 2026       │
│ Preview: The court must have regard to...                │
│                                          [Approve] [Discard] │
└──────────────────────────────────────────────────────────┘
```

- **Approve** → POST `{ id, action: 'approve' }` → refresh list → toast
- **Discard** → POST `{ id, action: 'discard' }` → refresh list → toast
- Empty state: "No pending answers"

---

### Step 9 — UI: Render Synthesised Chunks Distinctly

In the source chunk display (ResultCard or equivalent), detect `source_type === 'synthesised'` and render with a distinct label:

```jsx
{chunk.source_type === 'synthesised' && (
  <div className="chunk-label synthesised">
    <span>Prior synthesis</span>
    <span className="source-query">{chunk.source_query}</span>
  </div>
)}
```

Use a different border colour — visually distinct from case chunks (which show citation) and secondary source chunks (which show title/section).

---

## Verification Checklist (post-deploy)

```
[ ] Schema: PRAGMA table_info shows approved, source_chunk_ids, source_query columns
[ ] Existing rows: SELECT COUNT(*) WHERE approved=0 returns 0 (default worked)
[ ] Poller query: confirm AND approved=1 gate — docker logs show no unapproved rows picked up
[ ] Save route: POST /api/legal/save-synthesis with test payload — row lands approved=0, embedded=0
[ ] Queue GET: GET /api/admin/synthesis-queue returns the test row
[ ] Approve: POST action=approve — approved flips to 1 in D1
[ ] Poller embeds it — embedded=1 in D1, point in Qdrant with correct payload
[ ] Qdrant payload: spot-check point has source_type, source_chunk_ids, subject_matter
[ ] Retrieval baseline: run retrieval_baseline.sh — scores not degraded vs pre-deploy baseline
[ ] Suppression: query on same topic as a saved answer — saved answer suppressed when source chunks are in result set
[ ] Discard: POST action=discard — row deleted, not flagged
```

---

## What This Feature Is Not

- Not automatic. Nothing gets ingested without Tom's approval.
- Not a replacement for primary sources. Weight penalty and dedupe suppression ensure primary material always wins when present.
- Not RLHF. There is no model update. It is a curated annotation layer, not a training signal.

---

## Files Modified

| File | Change |
|---|---|
| D1 schema | 3 new columns on `secondary_sources` |
| `worker.js` | 2 new routes: `save-synthesis`, `synthesis-queue` (GET + POST) |
| `enrichment_poller.py` | `AND approved=1` gate; synthesised payload fields in upsert |
| `server.py` | `SYNTHESISED_WEIGHT` penalty + `suppress_redundant_syntheses()` |
| `Research.jsx` | Save button + confirm panel |
| `Library.jsx` (or admin tab) | Synthesis queue review UI |
| `api.js` | `saveSynthesis()` method |

*No new infrastructure. No new tables. No new services.*
