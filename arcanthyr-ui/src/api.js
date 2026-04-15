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

  uploadLegislation: async (formData) => {
    const res = await fetch(`${BASE}/api/legal/upload-legislation`, {
      method: 'POST',
      body: formData,
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
};
