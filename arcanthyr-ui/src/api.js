const BASE = import.meta.env.VITE_API_BASE || 'https://arcanthyr.com';

async function req(method, path, body, extraHeaders = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const api = {
  verify:  () => Promise.resolve({ ok: true }),
  login:   () => Promise.resolve({ ok: true }),
  logout:  () => Promise.resolve({ ok: true }),

  query: (query_text, model = 'claude', subjectFilter = null) => req('POST',
    model === 'workers' ? '/api/legal/legal-query-workers-ai' : '/api/legal/legal-query',
    {
      query: query_text,
      subject_matter_filter: subjectFilter && subjectFilter !== 'all' ? subjectFilter.toLowerCase() : null,
    }),

  cases:         ()           => req('GET',  '/api/legal/cases'),
  corpus:        ()           => req('GET',  '/api/legal/corpus'),
  legislation:   ()           => req('GET',  '/api/legal/legislation'),
  library:       ()           => req('GET',  '/api/legal/library'),
  caseStatus:    (citation)   => req('GET',  `/api/legal/case-status?citation=${encodeURIComponent(citation)}`),
  caseAuthority: (citation)   => req('GET',  `/api/legal/case-authority?citation=${encodeURIComponent(citation)}`),
  searchByLegislation: (q, limit = 50, offset = 0) =>
    req('GET', `/api/legal/search-by-legislation?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`),
  wordSearch: (q, limit = 30, court = null) => {
    const params = new URLSearchParams({ q, limit: String(limit) });
    if (court) params.set('court', court);
    return req('GET', `/api/legal/word-search?${params.toString()}`);
  },
  austliiWordSearch: (q, limit = 20) => {
    const params = new URLSearchParams({ q, limit: String(limit) });
    return req('GET', `/api/legal/austlii-word-search?${params.toString()}`);
  },
  amendments: (actId) =>
    req('GET', `/api/legal/amendments?act=${encodeURIComponent(actId)}`),

  resolveAct: (name) =>
    req('GET', `/api/legal/resolve-act?name=${encodeURIComponent(name)}`),

  fetchJudgment: async (url, citation = null) => {
    const params = new URLSearchParams({ url });
    if (citation) params.set('citation', citation);
    const response = await fetch(BASE + `/api/legal/fetch-judgment?${params.toString()}`);
    const data = await response.json();
    const r = data.result ?? data;
    if (!r.ok) throw new Error(r.error || 'Failed to fetch judgment');
    return r.html;
  },
  share:         (body)       => req('POST', '/api/legal/share', body),
  requeueChunks: (nexusKey)   => req('POST', '/api/admin/requeue-chunks', {}, { 'X-Nexus-Key': nexusKey }),

  formatAndUpload: async (blocks) => {
    const res = await fetch(`${BASE}/api/legal/format-and-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; Arcanthyr/1.0)',
      },
      body: JSON.stringify(blocks),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  uploadCorpus: async (blocks) => {
    const citationMatch = blocks.text?.match(/\[CITATION:\s*([^\]]+)\]/);
    const citation = citationMatch ? citationMatch[1].trim() : null;
    if (!citation) throw new Error('No [CITATION:] field found in block text');
    const res = await fetch(`${BASE}/api/legal/upload-corpus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; Arcanthyr/1.0)',
      },
      body: JSON.stringify({ ...blocks, citation }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  uploadCase: async (formDataOrObj) => {
    const isFormData = formDataOrObj instanceof FormData;
    const res = await fetch(`${BASE}/api/legal/upload-case`, {
      method: 'POST',
      headers: isFormData ? undefined : { 'Content-Type': 'application/json' },
      body: isFormData ? formDataOrObj : JSON.stringify(formDataOrObj),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  fetchCaseUrl: async (body) => {
    const res = await fetch(`${BASE}/api/legal/fetch-case-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  uploadLegislation: async (payload) => {
    const res = await fetch(`${BASE}/api/legal/upload-legislation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  processDocument: async ({ file_b64, filename, prompt_mode = 'master' }) => {
    const res = await fetch(`${BASE}/api/ingest/process-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_b64, filename, prompt_mode }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  pollIngestStatus: async (jobId) => {
    const res = await fetch(`${BASE}/api/ingest/status/${jobId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  saveToNexus: async (body) => {
    const res = await fetch(`${BASE}/api/legal/format-and-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; Arcanthyr/1.0)',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  getQueryHistory:    ()     => req('GET',  '/api/query/history'),
  deleteQueryHistory: (id)   => req('POST', '/api/query/history/delete', { id }),

  markInsufficient: async (queryId, missingNote, flaggedBy) => {
    const res = await fetch(`${BASE}/api/legal/mark-insufficient`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query_id: queryId,
        missing_note: missingNote || null,
        flagged_by: flaggedBy || null,
      }),
    });
    const data = await res.json();
    const r = data.result ?? data;
    if (!res.ok) throw new Error(r.error || `HTTP ${res.status}`);
    return r;
  },

  flagSynthesis: async (body, nexusKey) => {
    const res = await fetch(`${BASE}/api/pipeline/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Nexus-Key': nexusKey },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  fetchPendingNexus: async (nexusKey) => {
    const res = await fetch(`${BASE}/api/admin/pending-nexus`, {
      headers: { 'X-Nexus-Key': nexusKey },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  approveSecondary: async (body, nexusKey) => {
    const res = await fetch(`${BASE}/api/admin/approve-secondary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Nexus-Key': nexusKey },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
};
