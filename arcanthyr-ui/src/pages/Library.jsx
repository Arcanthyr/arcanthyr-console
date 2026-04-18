import { useState, useEffect } from 'react';
import Nav from '../components/Nav';
import { api } from '../api';
import StareDecisisSection from '../components/StareDecisisSection';

const BASE = 'https://arcanthyr.com';

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
  const [truncationMap, setTruncationMap] = useState({});
  const [selectedTruncation, setSelectedTruncation] = useState(null);
  const [nexusKey, setNexusKey] = useState('');
  const [pendingItems, setPendingItems] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  useEffect(() => {
    load();
    loadTruncations();
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

  function loadTruncations() {
    fetch(`${BASE}/api/pipeline/truncation-status`)
      .then(r => r.json())
      .then(d => {
        const map = {};
        (d.truncations || []).forEach(t => {
          if (t.status === 'flagged') map[t.id] = t;
        });
        setTruncationMap(map);
      })
      .catch(err => console.warn('Truncation status fetch failed:', err));
  }

  async function loadPending(key) {
    const k = key !== undefined ? key : nexusKey;
    if (!k) return;
    setPendingLoading(true);
    try {
      const r = await api.fetchPendingNexus(k);
      setPendingItems(r.items || []);
    } catch {
      setPendingItems([]);
    } finally {
      setPendingLoading(false);
    }
  }

  async function handleApprove(id) {
    await api.approveSecondary({ id, action: 'approve' }, nexusKey);
    setPendingItems(prev => prev.filter(i => i.id !== id));
  }

  async function handleReject(id) {
    if (!window.confirm('Delete this saved answer?')) return;
    await api.approveSecondary({ id, action: 'reject' }, nexusKey);
    setPendingItems(prev => prev.filter(i => i.id !== id));
  }

  async function handleDeleteNexus(id) {
    if (!window.confirm('Permanently delete this saved answer from D1 and Qdrant?')) return;
    await api.approveSecondary({ id, action: 'delete' }, nexusKey);
    setPendingItems(prev => prev.filter(i => i.id !== id));
    setData(prev => prev ? { ...prev, secondary: (prev.secondary || []).filter(r => r.id !== id) } : prev);
  }

  async function handleDelete(docType, id) {
    if (!confirm(`Delete ${id}?`)) return;
    try {
      fetch(`${BASE}/api/legal/library/delete/${docType}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load();
    } catch (e) { alert(e.message); }
  }

  async function handleTruncationConfirm(id) {
    await fetch(`${BASE}/api/pipeline/truncation-resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Nexus-Key': nexusKey },
      body: JSON.stringify({ id, action: 'confirm' }),
    });
    setTruncationMap(prev => { const next = { ...prev }; delete next[id]; return next; });
    setSelectedTruncation(null);
  }

  async function handleTruncationDelete(id) {
    await fetch(`${BASE}/api/pipeline/truncation-resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Nexus-Key': nexusKey },
      body: JSON.stringify({ id, action: 'delete' }),
    });
    setTruncationMap(prev => { const next = { ...prev }; delete next[id]; return next; });
    setData(prev => prev ? { ...prev, cases: (prev.cases || []).filter(c => c.id !== id) } : prev);
    setSelectedTruncation(null);
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
              {tab === 0 && <CasesTable rows={data.cases || []} onDelete={handleDelete} onSelect={setSelectedCase} selectedId={selectedCase?.id} truncationMap={truncationMap} onTruncationClick={setSelectedTruncation} />}
              {tab === 1 && (
                <>
                  <PendingReviewSection
                    items={pendingItems}
                    loading={pendingLoading}
                    nexusKey={nexusKey}
                    onNexusKeyChange={(k) => { setNexusKey(k); loadPending(k); }}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onDeleteNexus={handleDeleteNexus}
                  />
                  <CorpusTable rows={data.secondary || []} onDelete={handleDelete} onDeleteNexus={handleDeleteNexus} />
                </>
              )}
              {tab === 2 && <LegislationTable rows={data.legislation || []} onDelete={handleDelete} />}
            </>
          )}
        </div>
        {selectedCase && <CaseReadingPane c={selectedCase} onClose={() => setSelectedCase(null)} cases={data?.cases || []} onSelect={setSelectedCase} />}
      </div>

      {selectedTruncation && (
        <TruncationModal
          record={selectedTruncation}
          nexusKey={nexusKey}
          onNexusKeyChange={setNexusKey}
          onConfirm={handleTruncationConfirm}
          onDelete={handleTruncationDelete}
          onClose={() => setSelectedTruncation(null)}
        />
      )}
    </div>
  );
}

/* ── Cases table ───────────────────────────────────────────── */
const modeBtnStyle = (active) => ({
  padding: '5px 14px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer',
  background: active ? 'rgba(74,158,255,0.15)' : 'transparent',
  border: `1px solid ${active ? '#4A9EFF' : 'var(--border)'}`,
  color: active ? '#4A9EFF' : 'var(--text-secondary)',
});

function CasesTable({ rows, onDelete, onSelect, selectedId, truncationMap, onTruncationClick }) {
  // Name/citation search state
  const [search, setSearch] = useState('');
  const [courtFilter, setCourtFilter] = useState([]);
  const [yearFilter, setYearFilter] = useState([]);

  // Legislation section search state
  const [searchMode, setSearchMode] = useState('name');     // 'name' | 'legislation'
  const [legQuery, setLegQuery] = useState('');
  const [legResults, setLegResults] = useState(null);       // null = not searched yet
  const [legLoading, setLegLoading] = useState(false);
  const [legOffset, setLegOffset] = useState(0);
  const [legHasMore, setLegHasMore] = useState(false);

  const courts = [...new Set(rows.map(r => r.court).filter(Boolean))].sort();
  const years  = [...new Set(rows.map(r => r.date?.slice(0, 4) || r.citation?.match(/\d{4}/)?.[0]).filter(Boolean))].sort().reverse();

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

  function handleModeSwitch(mode) {
    setSearchMode(mode);
    setLegResults(null);
    setLegQuery('');
    setLegOffset(0);
    setLegHasMore(false);
  }

  async function runLegSearch(q, offset = 0) {
    if (!q.trim()) return;
    setLegLoading(true);
    try {
      const r = await api.searchByLegislation(q, 50, offset);
      const incoming = r.result?.results ?? r.results ?? [];
      setLegResults(offset === 0 ? incoming : [...(legResults || []), ...incoming]);
      setLegHasMore(r.result?.has_more ?? r.has_more ?? false);
      setLegOffset(offset);
    } catch (e) {
      console.error('Legislation search failed:', e);
      if (offset === 0) setLegResults([]);
    } finally {
      setLegLoading(false);
    }
  }

  return (
    <>
      {/* Search mode toggle */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
        <button onClick={() => handleModeSwitch('name')} style={modeBtnStyle(searchMode === 'name')}>
          Name / Citation
        </button>
        <button onClick={() => handleModeSwitch('legislation')} style={modeBtnStyle(searchMode === 'legislation')}>
          Legislation section
        </button>
      </div>

      {searchMode === 'name' ? (
        /* ── Name / citation search (existing behaviour) ── */
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
                  <td style={td}>
                    {truncationMap[r.id] ? (
                      <button
                        onClick={e => { e.stopPropagation(); onTruncationClick({ ...truncationMap[r.id], case: r }); }}
                        style={{
                          background: 'var(--red)', color: '#fff', border: 'none',
                          borderRadius: '12px', padding: '2px 10px', fontSize: '11px',
                          fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        Incomplete
                      </button>
                    ) : statusDot(r)}
                  </td>
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
      ) : (
        /* ── Legislation section search ── */
        <div>
          <form
            onSubmit={e => { e.preventDefault(); runLegSearch(legQuery); }}
            style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}
          >
            <input
              value={legQuery}
              onChange={e => setLegQuery(e.target.value)}
              placeholder="e.g. s 138 Evidence Act, section 16 Criminal Code, s 75 Sentencing Act"
              style={{ flex: 1, padding: '8px 12px', fontSize: '13px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
            />
            <button
              type="submit"
              disabled={legLoading || !legQuery.trim()}
              style={{ padding: '8px 18px', fontSize: '13px', background: 'rgba(74,158,255,0.15)', border: '1px solid #4A9EFF', borderRadius: '4px', color: '#4A9EFF', cursor: 'pointer', whiteSpace: 'nowrap', opacity: (legLoading || !legQuery.trim()) ? 0.5 : 1 }}
            >
              {legLoading ? 'Searching…' : 'Search'}
            </button>
          </form>

          {legResults === null && !legLoading && (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic', paddingTop: '8px' }}>
              Search by section reference — e.g. "s 138 Evidence Act" or "section 16 Criminal Code"
            </div>
          )}

          {legResults !== null && !legLoading && legResults.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic', paddingTop: '8px' }}>
              No cases found for this section.
            </div>
          )}

          {legResults !== null && legResults.length > 0 && (
            <>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                {legResults.length} case{legResults.length !== 1 ? 's' : ''}{legHasMore ? '+' : ''} · ordered by court hierarchy, then date
              </div>
              <LegislationResultsTable
                results={legResults}
                rows={rows}
                onSelect={onSelect}
                selectedId={selectedId}
              />
              {legHasMore && (
                <button
                  onClick={() => runLegSearch(legQuery, legOffset + 50)}
                  disabled={legLoading}
                  style={{ marginTop: '14px', padding: '6px 18px', fontSize: '12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  {legLoading ? 'Loading…' : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

/* ── Pending Review section ────────────────────────────────── */
function PendingReviewSection({ items, loading, nexusKey, onNexusKeyChange, onApprove, onReject, onDeleteNexus }) {
  const [busy, setBusy] = useState({});

  async function doApprove(id) {
    setBusy(b => ({ ...b, [id]: true }));
    try { await onApprove(id); } catch (e) { alert(e.message); }
    setBusy(b => ({ ...b, [id]: false }));
  }

  async function doReject(id) {
    setBusy(b => ({ ...b, [id]: true }));
    try { await onReject(id); } catch (e) { alert(e.message); }
    setBusy(b => ({ ...b, [id]: false }));
  }

  async function doDelete(id) {
    setBusy(b => ({ ...b, [id]: true }));
    try { await onDeleteNexus(id); } catch (e) { alert(e.message); }
    setBusy(b => ({ ...b, [id]: false }));
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      {/* Key + load row */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          Pending Review
          {items.length > 0 && (
            <span style={{
              marginLeft: '6px', padding: '1px 7px', borderRadius: '10px', fontSize: '10px',
              background: 'rgba(255,165,0,0.18)', color: 'var(--amber)',
            }}>{items.length}</span>
          )}
        </span>
        {!nexusKey && (
          <input
            type="password"
            placeholder="Admin key to load"
            value={nexusKey}
            onChange={e => onNexusKeyChange(e.target.value)}
            style={{
              padding: '3px 8px', fontSize: '11px', width: '160px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '4px', color: 'var(--text-primary)',
            }}
          />
        )}
        {loading && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Loading…</span>}
      </div>

      {items.length === 0 && !loading && nexusKey && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '8px' }}>
          No pending items.
        </div>
      )}

      {items.map(item => (
        <div key={item.id} style={{
          padding: '12px 14px', marginBottom: '8px',
          background: 'rgba(255,165,0,0.06)',
          border: '1px solid rgba(255,165,0,0.25)',
          borderRadius: '6px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{item.title}</div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                <span style={{ textTransform: 'capitalize' }}>{item.category}</span>
                {item.date_added && <span>{item.date_added.slice(0, 10)}</span>}
              </div>
              <div style={{
                fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6,
                overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
              }}>
                {(item.raw_text || '').slice(0, 300)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <button
                onClick={() => doApprove(item.id)}
                disabled={busy[item.id]}
                style={{
                  padding: '5px 12px', fontSize: '11px', fontWeight: 600,
                  background: 'rgba(74,255,130,0.12)', border: '1px solid rgba(74,255,130,0.35)',
                  borderRadius: '4px', color: 'var(--green)',
                  cursor: busy[item.id] ? 'not-allowed' : 'pointer', opacity: busy[item.id] ? 0.5 : 1,
                }}
              >
                ✓ Approve
              </button>
              <button
                onClick={() => doReject(item.id)}
                disabled={busy[item.id]}
                style={{
                  padding: '5px 10px', fontSize: '11px',
                  background: 'transparent', border: '1px solid rgba(232,74,74,0.3)',
                  borderRadius: '4px', color: 'var(--red)',
                  cursor: busy[item.id] ? 'not-allowed' : 'pointer', opacity: busy[item.id] ? 0.5 : 1,
                }}
              >
                ✕
              </button>
              <button
                onClick={() => doDelete(item.id)}
                disabled={busy[item.id]}
                title="Delete from D1 and Qdrant"
                style={{
                  padding: '5px 8px', fontSize: '11px',
                  background: 'transparent', border: '1px solid rgba(232,74,74,0.2)',
                  borderRadius: '4px', color: 'var(--text-muted)',
                  cursor: busy[item.id] ? 'not-allowed' : 'pointer', opacity: busy[item.id] ? 0.5 : 1,
                }}
              >
                🗑
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Corpus table ──────────────────────────────────────────── */
function CorpusTable({ rows, onDelete, onDeleteNexus }) {
  return (
    <Table
      cols={['Title / Domain', 'ID', 'Category', 'Status', 'Actions']}
      rows={rows}
      renderRow={r => {
        const isMalformed = (r.id || '').includes('{');
        const isNexusSave = (r.id || '').startsWith('nexus-save-');
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
                {isNexusSave
                  ? <button onClick={() => onDeleteNexus(r.id)} style={{ fontSize: '11px', color: 'var(--red)' }}>Delete</button>
                  : <button onClick={() => onDelete('secondary', r.id)} style={{ fontSize: '11px', color: 'var(--red)' }}>Delete</button>
                }
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

/* ── Legislation results table ─────────────────────────────── */
function LegislationResultsTable({ results, rows, onSelect, selectedId }) {
  // When a result is clicked, prefer the full library row so the reading pane
  // gets all fields (facts, principles_extracted, etc.). Falls back to the
  // partial legislation-search row if the case isn't in the library list yet.
  function selectRow(r) {
    const full = rows.find(x => (x.ref || x.citation) === r.citation);
    onSelect(full || { ...r, ref: r.citation, title: r.case_name, date: r.case_date });
  }

  return (
    <Table
      cols={['Citation', 'Case', 'Court', 'Year', 'Matched sections', 'Holding']}
      rows={results}
      renderRow={r => {
        const isSelected = r.citation === selectedId || r.citation === (rows.find(x => x.id === selectedId)?.ref);
        return (
          <tr
            key={r.citation}
            onClick={() => selectRow(r)}
            style={{
              cursor: 'pointer',
              background: isSelected ? 'var(--surface-hover)' : 'transparent',
              borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            <td style={tdMono}>{r.citation}</td>
            <td style={td}>
              <div style={{ fontSize: '13px', color: 'var(--text-body)' }}>{r.case_name}</div>
              {r.subject_matter && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{r.subject_matter}</div>}
            </td>
            <td style={td}>{courtTag(r.court)}</td>
            <td style={{ ...td, fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {r.case_date?.slice(0, 4) || '—'}
            </td>
            <td style={{ ...td, maxWidth: '200px' }}>
              {r.matched_refs?.split(' | ').map((ref, i) => (
                <div key={i} style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)', marginBottom: '2px' }}>{ref}</div>
              ))}
            </td>
            <td style={{ ...td, maxWidth: '220px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {r.holding || '—'}
              </div>
            </td>
          </tr>
        );
      }}
    />
  );
}

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
function CaseReadingPane({ c, onClose, cases = [], onSelect }) {
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
        <StareDecisisSection
          citation={c.ref}
          onSelectCase={(citation) => {
            const match = cases.find(x => x.ref === citation);
            if (match) onSelect(match);
          }}
        />
      </div>
    </div>
  );
}

/* ── Truncation modal ──────────────────────────────────────── */
function TruncationModal({ record, nexusKey, onNexusKeyChange, onConfirm, onDelete, onClose }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const obtained = record.obtained_length || 200000;
  const hasOriginal = record.original_length > 0;
  const pct = hasOriginal ? Math.round(obtained / record.original_length * 100) : null;
  const missing = hasOriginal ? record.original_length - obtained : null;
  const citation = record.citation || record.case?.ref || record.case?.citation || record.id;

  async function doAction(action) {
    if (!nexusKey) { setErr('Admin key required'); return; }
    if (action === 'delete' && !window.confirm('Delete this case and all its chunks? This cannot be undone.')) return;
    setBusy(true);
    setErr('');
    try {
      if (action === 'delete') await onDelete(record.id);
      else await onConfirm(record.id);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.65)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-em)',
          borderRadius: '10px',
          padding: '28px',
          maxWidth: '460px',
          width: '90%',
          color: 'var(--text-primary)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--amber)', marginBottom: '20px' }}>
          ⚠ Case Truncated
        </div>

        {/* Detail grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: '90px 1fr',
          gap: '9px 14px', fontSize: '13px', marginBottom: '18px',
        }}>
          <span style={labelStyle}>Citation</span>
          <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{citation}</span>

          <span style={labelStyle}>Source</span>
          <span style={{ color: 'var(--text-body)' }}>{(record.source || '—').replace(/_/g, ' ')}</span>

          <span style={labelStyle}>Obtained</span>
          <span style={{ color: 'var(--text-body)' }}>{obtained.toLocaleString()} characters</span>

          {hasOriginal ? (
            <>
              <span style={labelStyle}>Original</span>
              <span style={{ color: 'var(--text-body)' }}>{record.original_length.toLocaleString()} characters ({pct}%)</span>

              <span style={labelStyle}>Missing</span>
              <span style={{ color: 'var(--red)' }}>~{missing.toLocaleString()} characters</span>
            </>
          ) : (
            <>
              <span style={labelStyle}>Original</span>
              <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Unknown</span>
            </>
          )}
        </div>

        {/* Retroactive note */}
        {record.original_length === -1 && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.6 }}>
            Original size unknown — this case was flagged retroactively. No specific data on extent of deficiency.
          </div>
        )}

        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.6 }}>
          This case was truncated on upload. Content beyond the character limit was not indexed.
        </div>

        {/* Admin key */}
        <input
          value={nexusKey}
          onChange={e => onNexusKeyChange(e.target.value)}
          placeholder="Admin key"
          type="password"
          style={{
            width: '100%', padding: '7px 10px', fontSize: '12px',
            background: 'var(--surface-hover)', border: '1px solid var(--border)',
            borderRadius: '4px', color: 'var(--text-primary)',
            marginBottom: err ? '10px' : '16px', boxSizing: 'border-box',
          }}
        />

        {err && (
          <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '14px' }}>{err}</div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => !busy && doAction('confirm')}
            disabled={busy}
            style={{
              padding: '7px 16px', fontSize: '12px', fontWeight: 600,
              background: 'var(--surface-hover)', border: '1px solid var(--border-em)',
              borderRadius: '6px', color: 'var(--text-body)',
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
            }}
          >
            Confirm Index
          </button>
          <button
            onClick={() => !busy && doAction('delete')}
            disabled={busy}
            style={{
              padding: '7px 16px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(232,74,74,0.12)', border: '1px solid rgba(232,74,74,0.4)',
              borderRadius: '6px', color: 'var(--red)',
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
            }}
          >
            Delete Case
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  color: 'var(--text-muted)', textTransform: 'uppercase',
  fontSize: '11px', letterSpacing: '0.07em', paddingTop: '1px',
};
