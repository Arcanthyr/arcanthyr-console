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

  if (loading) {
    return <div style={{ padding: '32px 24px', color: 'var(--text-secondary)', fontSize: '13px' }}>Loading…</div>;
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Left: table */}
      <div style={{
        flex: selectedLeg ? '0 0 480px' : '1',
        overflow: 'auto',
        padding: '24px',
        borderRight: selectedLeg ? '1px solid var(--border)' : 'none',
      }}>
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
                  onClick={() => setSelectedLeg(prev => prev?.id === r.id ? null : r)}
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
      </div>

      {/* Right: detail pane */}
      {selectedLeg && (
        <LegDetailPane
          leg={selectedLeg}
          onClose={() => setSelectedLeg(null)}
        />
      )}
    </div>
  );
}

function LegDetailPane({ leg, onClose }) {
  return (
    <div style={{ flex: 1, background: 'var(--pane-bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #e0ded9', background: 'var(--pane-bg)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--pane-dim)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Amendment History
            </div>
            <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--pane-text)', lineHeight: 1.3, textTransform: 'capitalize' }}>
              {leg.title}
            </div>
            {leg.court && (
              <div style={{ fontSize: '13px', color: 'var(--pane-dim)', marginTop: '4px' }}>
                {leg.court}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ fontSize: '18px', color: 'var(--pane-dim)', background: 'transparent', padding: '0 4px', lineHeight: 1, flexShrink: 0, marginLeft: '16px' }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
        <AmendmentPanel key={leg.id} actId={actIdFromSourceUrl(leg.source_url)} actName={leg.title} />
      </div>
    </div>
  );
}

const td = { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };
