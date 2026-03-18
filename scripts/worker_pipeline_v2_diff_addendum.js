// =============================================================
// Worker.js — Pipeline v2 changes (ADDENDUM)
// Two additional GET routes needed by enrichment_poller.py
// Add to worker_pipeline_v2_diff.js / Worker.js route handler
// =============================================================

// =============================================================
// CHANGE 5 — GET /api/pipeline/fetch-unenriched
// Returns up to `batch` secondary_sources rows where enriched=0
// Used by enrichment_poller.py enrichment pass
// =============================================================

if (url.pathname === '/api/pipeline/fetch-unenriched' && request.method === 'GET') {
  return handleFetchUnenriched(request, env);
}

async function handleFetchUnenriched(request, env) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const batch = Math.min(parseInt(url.searchParams.get('batch') || '10'), 50);
    const result = await env.DB.prepare(`
      SELECT id, source_id, chunk_index, text, raw_text
      FROM secondary_sources
      WHERE enriched = 0
        AND (enrichment_error IS NULL OR enrichment_error = '')
      ORDER BY source_id, chunk_index
      LIMIT ?
    `).bind(batch).all();

    return new Response(JSON.stringify({ ok: true, chunks: result.results }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// =============================================================
// CHANGE 6 — GET /api/pipeline/fetch-for-embedding
// Returns up to `batch` rows where enriched=1, embedded=0
// Used by enrichment_poller.py embedding pass
// =============================================================

if (url.pathname === '/api/pipeline/fetch-for-embedding' && request.method === 'GET') {
  return handleFetchForEmbedding(request, env);
}

async function handleFetchForEmbedding(request, env) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const batch = Math.min(parseInt(url.searchParams.get('batch') || '10'), 50);
    const result = await env.DB.prepare(`
      SELECT id, source_id, chunk_index, text, enriched_text
      FROM secondary_sources
      WHERE enriched = 1
        AND embedded = 0
      ORDER BY source_id, chunk_index
      LIMIT ?
    `).bind(batch).all();

    return new Response(JSON.stringify({ ok: true, chunks: result.results }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// =============================================================
// CHANGE 7 — GET /api/pipeline/fetch-embedded
// Returns all rows where embedded=1 (for reconciliation)
// Used by enrichment_poller.py --mode reconcile
// =============================================================

if (url.pathname === '/api/pipeline/fetch-embedded' && request.method === 'GET') {
  return handleFetchEmbedded(request, env);
}

async function handleFetchEmbedded(request, env) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const result = await env.DB.prepare(`
      SELECT id FROM secondary_sources WHERE embedded = 1
    `).all();

    return new Response(JSON.stringify({ ok: true, chunks: result.results }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// =============================================================
// CHANGE 8 — POST /api/pipeline/reset-embedded
// Resets embedded=0 for given chunk_ids (reconciliation recovery)
// Body: { "chunk_ids": ["id1", "id2", ...] }
// =============================================================

if (url.pathname === '/api/pipeline/reset-embedded' && request.method === 'POST') {
  return handleResetEmbedded(request, env);
}

async function handleResetEmbedded(request, env) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const { chunk_ids } = await request.json();
    if (!Array.isArray(chunk_ids) || chunk_ids.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'chunk_ids required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const placeholders = chunk_ids.map(() => '?').join(',');
    await env.DB.prepare(
      `UPDATE secondary_sources SET embedded = 0 WHERE id IN (${placeholders})`
    ).bind(...chunk_ids).run();

    return new Response(JSON.stringify({ ok: true, reset: chunk_ids.length }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}
