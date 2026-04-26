import { useState, useEffect } from 'react';
import { api } from '../api';
import AmendmentPanel from './AmendmentPanel';

const BASE = 'https://arcanthyr.com';

function actIdFromSourceUrl(sourceUrl) {
  if (!sourceUrl) return null;
  const m = /\/((?:act|sr)-\d{4}-\d{3})$/.exec(sourceUrl);
  return m ? m[1] : null;
}

export default function LegislationPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeg, setSelectedLeg] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await api.library();
      setRows((r.result || r).legislation || []);
    } catch (e) {
      console.error('Legislation load failed:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm(`Delete ${id}?`)) return;
    try {
      fetch(`${BASE}/api/legal/library/delete/legislation/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setRows(prev => prev.filter(r => r.id !== id));
      if (selectedLeg?.id === id) setSelectedLeg(null);
    } catch (e) { alert(e.message); }
  }

  function toggleLeg(r) {
    setSelectedLeg(prev => prev?.id === r.id ? null : r);
  }

  if (loading) {
    return <div style={{ padding: '32px 24px', color: 'var(--text-secondary)', fontSize: '13px' }}>Loading…</div>;
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['Act', 'Jurisdiction', 'Status', 'Date Updated', 'Actions'].map(c => (
                <th key={c} style={{
                  textAlign: 'left', padding: '8px 12px',
                  fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
                }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '24px 12px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '13px' }}>No legislation ingested yet.</td></tr>
            ) : rows.map(r => (
              <tr
                key={r.id}
                onClick={() => toggleLeg(r)}
                style={{
                  cursor: 'pointer',
                  background: selectedLeg?.id === r.id ? 'var(--surface-hover)' : 'transparent',
                  borderLeft: selectedLeg?.id === r.id ? '2px solid var(--accent)' : '2px solid transparent',
                }}
                onMouseEnter={e => { if (selectedLeg?.id !== r.id) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = selectedLeg?.id === r.id ? 'var(--surface-hover)' : 'transparent'; }}
              >
                <td style={td}>
                  <span style={{ color: 'var(--accent)', textTransform: 'capitalize' }}>
                    {r.title}
                  </span>
                  {selectedLeg?.id === r.id && (
                    <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--text-muted)' }}>▾ Amendment history</span>
                  )}
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
                <td style={td} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {r.source_url && (
                      <a
                        href={r.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                        onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                      >
                        View Online ↗
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(r.id)}
                      style={{ fontSize: '11px', color: 'var(--red)', textTransform: 'uppercase' }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedLeg && (
        <div style={{ marginTop: '16px', padding: '16px 20px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', textTransform: 'capitalize' }}>
            {selectedLeg.title}
          </div>
          <AmendmentPanel actId={actIdFromSourceUrl(selectedLeg.source_url)} actName={selectedLeg.title} />
        </div>
      )}
    </div>
  );
}

const td = { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };
