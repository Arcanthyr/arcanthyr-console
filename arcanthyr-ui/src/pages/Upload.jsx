import { useState, useRef, useEffect } from 'react';
import Nav from '../components/Nav';
import PipelineStatus from '../components/PipelineStatus';
import { api } from '../api';

const TABS = ['Cases', 'Secondary Sources', 'Legislation'];
const COURTS = ['TASCCA', 'TASSC', 'TASMC', 'HCA'];
const CATEGORIES = ['annotation', 'case authority', 'procedure', 'doctrine', 'checklist', 'practice note', 'script', 'legislation'];
const JURISDICTIONS = ['TAS', 'CTH', 'VIC', 'NSW', 'QLD', 'WA', 'SA', 'ACT', 'NT'];

export default function Upload() {
  const [tab, setTab] = useState(0);


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-shell)' }}>
      <Nav />
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-page)' }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{
            padding: '12px 24px', fontSize: '13px',
            color: tab === i ? 'var(--accent)' : 'var(--text-secondary)',
            borderBottom: tab === i ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'transparent',
          }}>
            {t}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '32px', maxWidth: '760px', width: '100%', margin: '0 auto' }}>
        {tab === 0 && <CasesTab />}
        {tab === 1 && <CorpusTab />}
        {tab === 2 && <LegislationTab />}
      </div>
    </div>
  );
}

/* ── Cases tab ─────────────────────────────────────────────── */
function CasesTab() {
  const fileRef = useRef();
  const [staged, setStaged] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [pipeline, setPipeline] = useState([]);
  const [url, setUrl] = useState('');
  const [urlUploading, setUrlUploading] = useState(false);
  const [urlError, setUrlError] = useState('');

  function onDrop(e) {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || e.target.files || [])];
    const newFiles = files.map(f => ({ file: f, citation: '', court: 'TASCCA', ocr: false }));
    setStaged(s => [...s, ...newFiles]);
  }

  async function uploadAll() {
    setUploading(true);
    for (const item of staged) {
      if (!item.citation) continue;
      const fd = new FormData();
      fd.append('file', item.file);
      fd.append('citation', item.citation);
      fd.append('court', item.court);
      try {
        const r = await api.uploadCase(fd);
        const cit = r.result?.citation || item.citation;
        if (r.result?.ocr) {
          setStaged(s => s.map(x => x.citation === item.citation ? { ...x, ocr: true } : x));
        }
        setPipeline(p => [...p, cit]);
      } catch (e) {
        console.error(e);
      }
    }
    setStaged([]);
    setUploading(false);
  }

  async function uploadUrl() {
    if (!url.trim()) return;
    setUrlUploading(true);
    setUrlError('');
    try {
      const r = await api.fetchCaseUrl({ url: url.trim() });
      const cit = r.result?.citation || url.trim();
      setPipeline(p => [...p, cit]);
      setUrl('');
    } catch (e) {
      setUrlError(e.message);
    } finally {
      setUrlUploading(false);
    }
  }

  return (
    <div>
      <SectionTitle>Upload cases</SectionTitle>
      <div
        onDrop={onDrop} onDragOver={e => e.preventDefault()}
        onClick={() => fileRef.current.click()}
        style={dropZoneStyle}
      >
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Drop PDF, TXT or DOCX files here, or click to browse
        </div>
        <input ref={fileRef} type="file" multiple accept=".pdf,.txt,.docx" onChange={onDrop} style={{ display: 'none' }} />
      </div>

      <div style={{ marginTop: '20px' }}>
        <label style={labelStyle}>Or paste AustLII URL directly</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="url"
            placeholder="https://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            style={{ ...smallInput, flex: 1 }}
          />
          <button
            onClick={uploadUrl}
            disabled={urlUploading || !url.trim()}
            style={{ ...primaryBtn, opacity: urlUploading || !url.trim() ? 0.5 : 1 }}
          >
            {urlUploading ? '…' : 'Fetch'}
          </button>
        </div>
        {urlError && <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--red)' }}>{urlError}</div>}
      </div>

      {staged.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          {staged.map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: '10px', alignItems: 'center',
              padding: '10px 0', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ flex: 1, fontSize: '13px', color: 'var(--text-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.file.name}
              </div>
              <input
                value={item.citation}
                onChange={e => setStaged(s => s.map((x, j) => j === i ? { ...x, citation: e.target.value } : x))}
                placeholder="Citation e.g. [2024] TASCCA 12"
                style={{ ...smallInput, width: '220px' }}
              />
              <select
                value={item.court}
                onChange={e => setStaged(s => s.map((x, j) => j === i ? { ...x, court: e.target.value } : x))}
                style={{ ...smallInput, width: '100px' }}
              >
                {COURTS.map(c => <option key={c}>{c}</option>)}
              </select>
              {item.ocr && <span style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(232,168,56,0.15)', color: 'var(--amber)', borderRadius: '3px' }}>OCR</span>}
              <button onClick={() => setStaged(s => s.filter((_, j) => j !== i))} style={{ color: 'var(--text-muted)', fontSize: '16px' }}>×</button>
            </div>
          ))}
          <button onClick={uploadAll} disabled={uploading} style={primaryBtn}>
            {uploading ? 'Uploading…' : `Upload ${staged.filter(x => x.citation).length} file${staged.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {pipeline.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <SectionTitle>Pipeline queue</SectionTitle>
          {pipeline.map(cit => <PipelineStatus key={cit} citation={cit} />)}
        </div>
      )}
    </div>
  );
}

/* ── Corpus tab ────────────────────────────────────────────── */
function CorpusTab() {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalSlug, setModalSlug] = useState('');
  const [modalCategory, setModalCategory] = useState('doctrine');
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const fileRef = useRef();

  const toSlug = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  useEffect(() => {
    if (!jobId) return;
    const timer = setInterval(async () => {
      try {
        const s = await api.pollIngestStatus(jobId);
        setJobStatus(s);
        if (s.status === 'complete' || s.status === 'failed') {
          clearInterval(timer);
          setJobId(null);
          setJobStatus(null);
          if (s.status === 'complete') {
            setResult(`✓ ${s.chunks_inserted} chunk${s.chunks_inserted !== 1 ? 's' : ''} ingested from ${s.filename}`);
          } else {
            setSubmitError(s.error || 'Processing failed');
          }
        }
      } catch (e) {
        clearInterval(timer);
        setJobId(null);
        setJobStatus(null);
        setSubmitError(e.message);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [jobId]);

  async function startProcessDocument(file) {
    setResult('');
    setSubmitError('');
    setJobId(null);
    setJobStatus(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const file_b64 = ev.target.result.split(',')[1];
      try {
        const r = await api.processDocument({ file_b64, filename: file.name });
        setJobId(r.job_id);
        setJobStatus({ status: r.status });
      } catch (e) {
        setSubmitError(e.message);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'md') {
      const reader = new FileReader();
      reader.onload = ev => setText(ev.target.result);
      reader.readAsText(file);
    } else if (['pdf', 'docx', 'txt'].includes(ext)) {
      startProcessDocument(file);
    }
  }

  function handleFileInput(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    startProcessDocument(file);
    e.target.value = '';
  }

  async function handleSubmit() {
    if (!text.trim()) return;
    if (text.trimStart().startsWith('<!-- block_')) {
      await doUpload({});
      return;
    }
    const firstLine = text.trim().split('\n')[0].slice(0, 80);
    setModalTitle(firstLine);
    setModalSlug(`manual-${toSlug(firstLine)}`);
    setModalCategory('doctrine');
    setShowModal(true);
  }

  async function doUpload(modalValues) {
    setShowModal(false);
    setUploading(true);
    setResult('');
    setSubmitError('');
    try {
      if (text.trimStart().startsWith('<!-- block_')) {
        const citationMatch = text.match(/\[CITATION:\s*([^\]]+)\]/);
        if (!citationMatch) {
          setSubmitError('No [CITATION:] field found in block text — add one before uploading.');
          return;
        }
        await api.uploadCorpus({ text });
        setResult(`✓ Ingested: ${citationMatch[1].trim()}`);
      } else {
        const r = await api.formatAndUpload({ text, mode: 'single', title: modalValues.title, slug: modalValues.slug, category: modalValues.category });
        setResult(`✓ ${r.result?.count || 'Uploaded'} chunks ingested`);
      }
      setText('');
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setUploading(false);
    }
  }

  const inputStyle = { ...smallInput, display: 'block', width: '100%', marginBottom: '12px' };
  const isProcessing = !!jobId;

  return (
    <div>
      <SectionTitle>Upload secondary source</SectionTitle>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border-em)'}`,
          borderRadius: '6px', padding: '28px', textAlign: 'center', cursor: 'pointer',
          marginBottom: '16px', background: dragging ? 'var(--accent-dim)' : 'var(--surface)',
          fontSize: '13px', color: 'var(--text-secondary)',
        }}
      >
        {dragging
          ? 'Drop file here'
          : isProcessing
          ? 'Processing…'
          : 'Drop .pdf, .docx or .txt to process via VPS · Drop .md to load into text area · or click to browse'}
      </div>
      <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" onChange={handleFileInput} style={{ display: 'none' }} />

      {isProcessing && jobStatus && (
        <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--text-secondary)', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px' }}>
          ⟳ {jobStatus.status}
          {jobStatus.total_blocks ? ` · block ${jobStatus.block_current || 0}/${jobStatus.total_blocks}` : ''}
          {jobStatus.chunks_parsed > 0 ? ` · ${jobStatus.chunks_parsed} chunks parsed` : ''}
          {jobStatus.chunks_inserted > 0 ? ` · ${jobStatus.chunks_inserted} inserted` : ''}
        </div>
      )}

      <label style={labelStyle}>Or paste pre-formatted blocks / raw source text</label>
      <textarea
        value={text} onChange={e => setText(e.target.value)}
        rows={14} placeholder={'Paste raw source text (GPT will format) or pre-formatted blocks starting with <!-- block_NNN master -->'}
        style={{
          display: 'block', width: '100%', padding: '12px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '4px', color: 'var(--text-primary)', fontSize: '13px',
          lineHeight: 1.6, resize: 'vertical', fontFamily: 'monospace',
        }}
      />
      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={handleSubmit} disabled={uploading || !text.trim()} style={primaryBtn}>
          {uploading ? 'Uploading…' : 'Upload corpus'}
        </button>
        {result && <span style={{ fontSize: '13px', color: '#6abf6a' }}>{result}</span>}
      </div>
      {submitError && (
        <p style={{ color: '#ff6b6b', fontSize: '12px', marginTop: '8px' }}>
          {submitError}
        </p>
      )}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 100,
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border-em)',
            borderRadius: '8px', padding: '28px', width: '480px', maxWidth: '90vw',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px' }}>
              Confirm chunk details
            </div>
            <label style={labelStyle}>Title</label>
            <input value={modalTitle} onChange={e => {
              setModalTitle(e.target.value);
              setModalSlug(`manual-${toSlug(e.target.value)}`);
            }} style={inputStyle} />
            <label style={labelStyle}>Citation slug</label>
            <input value={modalSlug} onChange={e => setModalSlug(e.target.value)} style={inputStyle} />
            <label style={labelStyle}>Category</label>
            <select value={modalCategory} onChange={e => setModalCategory(e.target.value)} style={inputStyle}>
              {['annotation', 'case authority', 'procedure', 'doctrine', 'checklist', 'practice note', 'script', 'legislation'].map(c => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowModal(false)} style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '8px 16px' }}>
                Cancel
              </button>
              <button
                onClick={() => doUpload({ title: modalTitle, slug: modalSlug, category: modalCategory })}
                style={{ background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '13px', padding: '8px 20px', borderRadius: '4px' }}
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Legislation tab ───────────────────────────────────────── */
function LegislationTab() {
  const fileRef = useRef();
  const [actName, setActName] = useState('');
  const [jurisdiction, setJurisdiction] = useState('TAS');
  const [sourceUrl, setSourceUrl] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState('');
  const [dragging, setDragging] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped) setFile(dropped);
  }

  async function handleSubmit() {
    if (!actName || !file) return;
    setUploading(true);
    setResult('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('act_name', actName);
    fd.append('jurisdiction', jurisdiction);
    if (sourceUrl) fd.append('source_url', sourceUrl);
    try {
      const r = await api.uploadLegislation(fd);
      setResult(`✓ ${r.result?.sections || 'Uploaded'} sections ingested`);
      setActName(''); setSourceUrl(''); setFile(null);
    } catch (e) {
      setResult(`Error: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <SectionTitle>Upload legislation</SectionTitle>
      <label style={labelStyle}>Act name</label>
      <input value={actName} onChange={e => setActName(e.target.value)} placeholder="Evidence Act 2001" style={{ ...smallInput, display: 'block', width: '100%', marginBottom: '12px' }} />
      <label style={labelStyle}>Jurisdiction</label>
      <select value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} style={{ ...smallInput, display: 'block', width: '160px', marginBottom: '12px' }}>
        {JURISDICTIONS.map(j => <option key={j}>{j}</option>)}
      </select>
      <label style={labelStyle}>Source URL (optional)</label>
      <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://legislation.tas.gov.au/..." style={{ ...smallInput, display: 'block', width: '100%', marginBottom: '16px' }} />
      <label style={labelStyle}>File (PDF or TXT)</label>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border-em)'}`,
          borderRadius: '6px', padding: '28px', textAlign: 'center', cursor: 'pointer',
          marginBottom: '4px', background: dragging ? 'var(--accent-dim)' : 'var(--surface)',
          fontSize: '13px', color: 'var(--text-secondary)',
        }}
      >
        {file ? file.name : dragging ? 'Drop file here' : 'Drag & drop PDF or TXT here, or click to browse'}
      </div>
      <input ref={fileRef} type="file" accept=".pdf,.txt" onChange={e => setFile(e.target.files[0])} style={{ display: 'none' }} />
      <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={handleSubmit} disabled={uploading || !actName || !file} style={primaryBtn}>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        {result && <span style={{ fontSize: '13px', color: result.startsWith('✓') ? '#6abf6a' : 'var(--red)' }}>{result}</span>}
      </div>
    </div>
  );
}

/* ── Shared styles ─────────────────────────────────────────── */
function SectionTitle({ children }) {
  return <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-body)', marginBottom: '16px' }}>{children}</div>;
}

const dropZoneStyle = {
  border: '1px dashed var(--border-em)', borderRadius: '6px',
  padding: '40px', textAlign: 'center', cursor: 'pointer',
  background: 'var(--surface)', transition: 'border-color 0.2s',
};
const smallInput = {
  padding: '7px 10px', background: 'var(--surface)',
  border: '1px solid var(--border)', borderRadius: '4px',
  color: 'var(--text-primary)', fontSize: '13px',
};
const labelStyle = {
  display: 'block', fontSize: '11px', letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '6px',
};
const primaryBtn = {
  padding: '9px 20px', background: 'var(--accent)', color: '#fff',
  fontWeight: 700, fontSize: '13px', borderRadius: '4px',
  opacity: 1, cursor: 'pointer',
};
