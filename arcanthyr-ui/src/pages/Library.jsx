import { useState, useEffect } from 'react';
import Nav from '../components/Nav';
import { api } from '../api';

const TABS = ['CASES', 'SECONDARY SOURCES', 'LEGISLATION'];

const COURT_COLORS = {
  TASCCA: { color: '#4A9EFF', bg: '#1a3a5c' },
  TASSC:  { color: '#C8CDD2', bg: '#1e2124' },
  TASMC:  { color: '#6abf6a', bg: '#1a3a1a' },
  HCA:    { color: '#E84A4A', bg: '#2a1a1a' },
};

function courtTag(court) {
  const s = COURT_COLORS[court] || { color: '#7A8087', bg: '#1a1a1a' };
  return (
    <span style={{
      padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 700,
      background: s.bg, color: s.color, textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      {court}
    </span>
  );
}

function statusDot(row) {
  if (row.enrichment_error) return <span title={row.enrichment_error} style={{ color: 'var(--red)', fontSize: '11px' }}>● Error</span>;
  if (!row.enriched) return <span style={{ color: 'var(--accent)', fontSize: '11px', animation: 'pulse 1.5s infinite' }}>● Processing</span>;
  if (row.chunks_embedded < row.chunk_count) return <span style={{ color: 'var(--accent)', fontSize: '11px' }}>● Embedding</span>;
  return <span style={{ color: 'var(--green)', fontSize: '11px' }}>● Indexed</span>;
}

function austliiUrl(citation) {
  // [year] TASCCA n → https://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/tas/TASCCA/year/n.html
  const m = citation?.match(/\[(\d{4})\]\s+(TASCCA|TASSC|TASMC)\s+(\d+)/);
  if (!m) return null;
  return `https://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/tas/${m[2]}/${m[1]}/${m[3]}.html`;
}

export default function Library() {
  const [tab, setTab] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCase, setSelectedCase] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await api.library();
      setData(r.result || r);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(docType, id) {
    if (!confirm(`Delete ${id}?`)) return;
    try {
      fetch(`https://arcanthyr.com/api/legal/library/delete/${docType}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load();
    } catch (e) { alert(e.message); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-shell)' }}>
      <Nav />
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-page)' }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => { setTab(i); setSelectedCase(null); }} style={{
            padding: '12px 24px', fontSize: '13px', background: 'transparent',
            color: tab === i ? 'var(--accent)' : 'var(--text-secondary)',
            borderBottom: tab === i ? '2px solid var(--accent)' : '2px solid transparent',
          }}>
            {t}
          </button>
        ))}
        <button onClick={load} style={{ marginLeft: 'auto', padding: '12px 24px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          ↻ Refresh
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: selectedCase ? '0 0 480px' : '1', overflow: 'auto', padding: '24px', borderRight: selectedCase ? '1px solid var(--border)' : 'none' }}>
          {loading && <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading…</div>}
          {error && <div style={{ color: 'var(--red)', fontSize: '13px' }}>{error}</div>}
          {data && (
            <>
              {tab === 0 && <CasesTable rows={data.cases || []} onDelete={handleDelete} onSelect={setSelectedCase} selectedId={selectedCase?.id} />}
              {tab === 1 && <CorpusTable rows={data.secondary || []} onDelete={handleDelete} />}
              {tab === 2 && <LegislationTable rows={data.legislation || []} onDelete={handleDelete} />}
            </>
          )}
        </div>
        {selectedCase && <CaseReadingPane c={selectedCase} onClose={() => setSelectedCase(null)} />}
      </div>
    </div>
  );
}

/* ── Cases table ───────────────────────────────────────────── */
function CasesTable({ rows, onDelete, onSelect, selectedId }) {
  const [search, setSearch] = useState('');
  const [courtFilter, setCourtFilter] = useState([]);
  const [yearFilter, setYearFilter] = useState([]);

  const courts = [...new Set(rows.map(r => r.court).filter(Boolean))].sort();
  const years = [...new Set(rows.map(r => r.date?.slice(0, 4) || r.citation?.match(/\d{4}/)?.[0]).filter(Boolean))].sort().reverse();

  const filtered = rows.filter(r => {
    const matchSearch = !search ||
      r.citation?.toLowerCase().includes(search.toLowerCase()) ||
      r.title?.toLowerCase().includes(search.toLowerCase());
    const matchCourt = courtFilter.length === 0 || courtFilter.includes(r.court);
    const rowYear = r.date?.slice(0, 4) || r.citation?.match(/\d{4}/)?.[0];
    const matchYear = yearFilter.length === 0 || yearFilter.includes(rowYear);
    return matchSearch && matchCourt && matchYear;
  });

  function toggleChip(arr, setArr, val) {
    setArr(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]);
  }

  const chipStyle = (active) => ({
    padding: '3px 10px', fontSize: '11px', borderRadius: '12px', cursor: 'pointer',
    textTransform: 'uppercase',
    background: active ? 'rgba(74,158,255,0.15)' : 'transparent',
    border: `1px solid ${active ? '#4A9EFF' : 'var(--border)'}`,
    color: active ? '#4A9EFF' : 'var(--text-secondary)',
  });

  return (
    <>
      <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search citation or case name…"
          style={{ padding: '8px 12px', fontSize: '13px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {courts.map(c => (
            <button key={c} onClick={() => toggleChip(courtFilter, setCourtFilter, c)} style={chipStyle(courtFilter.includes(c))}>{c}</button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {years.map(y => (
            <button key={y} onClick={() => toggleChip(yearFilter, setYearFilter, y)} style={chipStyle(yearFilter.includes(y))}>{y}</button>
          ))}
        </div>
      </div>
      <Table
        cols={['Citation', 'Title / Subject', 'Court', 'Chunks', 'Status', 'Actions']}
        rows={filtered}
        renderRow={r => {
          const url = austliiUrl(r.ref || r.citation);
          const isMalformed = (r.ref || '').includes('{');
          const isSelected = r.id === selectedId;
          return (
            <tr
              key={r.id}
              onClick={() => onSelect(r)}
              style={{
                opacity: isMalformed ? 0.6 : 1,
                cursor: 'pointer',
                background: isSelected ? 'var(--surface-hover)' : 'transparent',
                borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              <td style={tdMono}>{r.ref || r.citation}</td>
              <td style={td}>
                <div style={{ fontSize: '13px', color: 'var(--text-body)' }}>{r.title}</div>
                {r.subject_matter && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{r.subject_matter}</div>}
              </td>
              <td style={td}>{courtTag(r.court)}</td>
              <td style={{ ...td, fontSize: '12px', color: 'var(--text-secondary)' }}>
                {r.chunks_embedded}/{r.chunk_count}
              </td>
              <td style={td}>{statusDot(r)}</td>
              <td style={td}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {url && r.enriched && (
                    <a href={url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ fontSize: '11px', color: 'var(--accent)' }}>AustLII ↗</a>
                  )}
                  <button onClick={e => { e.stopPropagation(); onDelete('case', r.ref || r.id); }} style={{ fontSize: '11px', color: 'var(--red)' }}>Delete</button>
                </div>
              </td>
            </tr>
          );
        }}
      />
    </>
  );
}

/* ── Corpus table ──────────────────────────────────────────── */
function CorpusTable({ rows, onDelete }) {
  return (
    <Table
      cols={['Title / Domain', 'ID', 'Category', 'Status', 'Actions']}
      rows={rows}
      renderRow={r => {
        const isMalformed = (r.id || '').includes('{');
        return (
          <tr key={r.id} style={{ background: isMalformed ? 'rgba(232,74,74,0.05)' : 'transparent' }}>
            <td style={td}>
              <div style={{ fontSize: '13px', color: 'var(--text-body)' }}>{r.title}</div>
              {r.court && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{r.court}</div>}
            </td>
            <td style={tdMono}>{r.id}</td>
            <td style={{ ...td, fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{r.category}</td>
            <td style={td}>
              {r.embedded
                ? <span style={{ color: 'var(--green)', fontSize: '11px' }}>● Embedded</span>
                : <span style={{ color: 'var(--amber)', fontSize: '11px' }}>● Pending</span>}
            </td>
            <td style={td}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {isMalformed && <span style={{ fontSize: '11px', color: 'var(--red)' }}>Malformed</span>}
                <button onClick={() => onDelete('secondary', r.id)} style={{ fontSize: '11px', color: 'var(--red)' }}>Delete</button>
              </div>
            </td>
          </tr>
        );
      }}
    />
  );
}

/* ── Legislation table ─────────────────────────────────────── */
function LegislationTable({ rows, onDelete }) {
  return (
    <Table
      cols={['Act', 'Jurisdiction', 'Status', 'Date Updated', 'Actions']}
      rows={rows}
      renderRow={r => (
        <tr key={r.id}>
          <td style={td}>
            <a
              href="https://www.legislation.tas.gov.au"
              target="_blank"
              rel="noopener"
              style={{ color: 'var(--accent)', textDecoration: 'none' }}
              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
            >
              {r.title} ↗
            </a>
          </td>
          <td style={{ ...td, fontSize: '12px', color: 'var(--text-secondary)' }}>{r.court}</td>
          <td style={td}>
            {r.embedded
              ? <span style={{ color: 'var(--green)', fontSize: '11px' }}>● Embedded</span>
              : <span style={{ color: 'var(--amber)', fontSize: '11px' }}>● Pending</span>}
          </td>
          <td style={{ ...td, fontSize: '12px', color: 'var(--text-secondary)' }}>
            {r.date || '—'}
          </td>
          <td style={td}>
            <button onClick={() => onDelete('legislation', r.id)} style={{ fontSize: '11px', color: 'var(--red)' }}>Delete</button>
          </td>
        </tr>
      )}
    />
  );
}

/* ── Shared ────────────────────────────────────────────────── */

function Table({ cols, rows, renderRow }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c} style={{
                textAlign: 'left', padding: '8px 12px',
                fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
              }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={cols.length} style={{ padding: '24px 12px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '13px' }}>No records.</td></tr>
          ) : rows.map(renderRow)}
        </tbody>
      </table>
    </div>
  );
}

const td = { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };
const tdMono = { ...td, fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-secondary)' };

/* ── Case reading pane ─────────────────────────────────────── */
function CaseReadingPane({ c, onClose }) {
  const url = austliiUrl(c.ref || c.citation);

  return (
    <div style={{ flex: 1, background: 'var(--pane-bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #e0ded9', background: 'var(--pane-bg)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--pane-dim)', marginBottom: '4px' }}>
              {c.ref || c.citation}
            </div>
            <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--pane-text)', lineHeight: 1.3 }}>
              {c.title || c.case_name}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--pane-dim)', marginTop: '4px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              {courtTag(c.court)}
              {c.date && <span>{c.date.slice(0, 10)}</span>}
              {url && <a href={url} target="_blank" rel="noopener" style={{ fontSize: '11px', color: 'var(--accent)' }}>AustLII ↗</a>}
            </div>
          </div>
          <button onClick={onClose} style={{ fontSize: '18px', color: 'var(--pane-dim)', background: 'transparent', padding: '0 4px', lineHeight: 1, flexShrink: 0, marginLeft: '16px' }}>×</button>
        </div>
      </div>
      {/* Body */}
      <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#3D4247', textTransform: 'uppercase', marginBottom: 8 }}>Facts</div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--pane-text)' }}>{c.facts || 'Not extracted'}</p>
        </div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#3D4247', textTransform: 'uppercase', marginBottom: 8 }}>Holding</div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--pane-text)' }}>{c.holding && c.holding !== 'AI extraction failed' ? c.holding : 'Not extracted'}</p>
        </div>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#3D4247', textTransform: 'uppercase', marginBottom: 8 }}>Principles</div>
          {(() => {
            try {
              const items = typeof c.principles_extracted === 'string'
                ? JSON.parse(c.principles_extracted)
                : (c.principles_extracted || []);
              if (!items.length) return <p style={{ fontSize: 14, color: '#3D4247', fontStyle: 'italic' }}>None extracted</p>;
              return <ol style={{ paddingLeft: 18 }}>{items.map((h, i) => (
                <li key={i} style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--pane-text)', marginBottom: 8 }}>
                  {typeof h === 'string' ? h : (h.holding || h.principle || JSON.stringify(h))}
                </li>
              ))}</ol>;
            } catch {
              return <p style={{ fontSize: 14, color: 'var(--pane-dim)', fontStyle: 'italic' }}>None extracted</p>;
            }
          })()}
        </div>
      </div>
    </div>
  );
}
