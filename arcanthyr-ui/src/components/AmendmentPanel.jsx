import { useState, useEffect } from 'react';
import { api } from '../api';

export default function AmendmentPanel({ actName, actId: initialActId }) {
  const [expanded, setExpanded]   = useState(false);
  const [actId, setActId]         = useState(initialActId || null);
  const [actTitle, setActTitle]   = useState(null);
  const [amendments, setAmendments] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  useEffect(() => {
    if (!expanded) return;
    if (amendments !== null) return; // already loaded
    load();
  }, [expanded]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      let resolvedId = actId;

      if (!resolvedId) {
        const r = await api.resolveAct(actName);
        const payload = r.result ?? r;
        if (!payload.actId) {
          setError('Amendment history not available for this Act.');
          setLoading(false);
          return;
        }
        resolvedId = payload.actId;
        setActId(resolvedId);
        setActTitle(payload.actTitle || actName);
      }

      const r2 = await api.amendments(resolvedId);
      const payload2 = r2.result ?? r2;
      setActTitle(prev => prev || payload2.actTitle || actName);
      setAmendments(payload2.amendments || []);
    } catch (e) {
      setError(e.message || 'Failed to load amendment history.');
    } finally {
      setLoading(false);
    }
  }

  const count = amendments ? amendments.length : null;

  return (
    <div style={{ marginTop: '12px', border: '1px solid var(--border)', borderRadius: '5px', overflow: 'hidden' }}>
      {/* Header / toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', background: 'var(--surface)', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
          Amendment History{count !== null ? ` (${count})` : ''}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '0 0 8px' }}>
          {loading && (
            <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Loading…
            </div>
          )}
          {error && (
            <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--red)' }}>
              {error}
            </div>
          )}
          {amendments !== null && amendments.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No amendment records found for this Act.
            </div>
          )}
          {amendments !== null && amendments.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    {['Act', 'Year', 'Commenced', 'Action'].map(h => (
                      <th key={h} style={{
                        padding: '5px 12px', textAlign: 'left', fontSize: '10px',
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {amendments.map((a, i) => (
                    <AmendmentRow key={`${a.actNo}-${a.year}`} a={a} isFirst={i === 0} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AmendmentRow({ a, isFirst }) {
  const [resolving, setResolving] = useState(false);
  const rowBg = a.isOriginal ? 'rgba(74,158,255,0.05)' : 'transparent';
  const td = { padding: '7px 12px', verticalAlign: 'top', borderBottom: '1px solid var(--border)' };

  async function openBillPage() {
    setResolving(true);
    try {
      const r = await api.parliamentBillUrl(a.year, parseInt(a.actNo, 10));
      const resolved = r?.result?.url ?? r?.url ?? null;
      window.open(resolved || a.billPageUrl, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(a.billPageUrl, '_blank', 'noopener,noreferrer');
    }
    setResolving(false);
  }

  const billBtnBase = {
    fontSize: '11px', background: 'none', border: 'none', padding: 0,
    cursor: resolving ? 'wait' : 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
  };

  let actionBtn = null;
  if (a.hasBillPage && a.hasSecondReading === true) {
    actionBtn = (
      <button disabled={resolving} onClick={openBillPage}
        style={{ ...billBtnBase, color: resolving ? 'var(--text-muted)' : 'var(--accent)', textDecoration: 'none' }}>
        {resolving ? 'Resolving...' : 'Locate Hansard ↗'}
      </button>
    );
  } else if (a.hasBillPage && a.hasSecondReading === 'maybe') {
    actionBtn = (
      <button disabled={resolving} onClick={openBillPage}
        title="Second reading PDF may not be available for pre-2005 bills"
        style={{ ...billBtnBase, color: resolving ? 'var(--text-muted)' : 'var(--accent)', textDecoration: 'none', borderBottom: resolving ? 'none' : '1px dashed var(--accent)' }}>
        {resolving ? 'Resolving...' : 'Locate Hansard ↗'}
      </button>
    );
  } else {
    actionBtn = (
      <a href={a.hansardSearchUrl} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: '11px', color: 'var(--text-muted)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
        Search Hansard ↗
      </a>
    );
  }

  return (
    <tr style={{ background: rowBg }}>
      <td style={td}>
        <div style={{ color: 'var(--text-body)', lineHeight: 1.4 }}>
          {a.name}
          {a.isOriginal && (
            <span style={{
              marginLeft: '6px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
              padding: '1px 5px', borderRadius: '3px',
              background: 'rgba(74,158,255,0.12)', color: 'var(--accent)',
              textTransform: 'uppercase',
            }}>
              Principal Act
            </span>
          )}
        </div>
      </td>
      <td style={{ ...td, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
        {a.year}
      </td>
      <td style={{ ...td, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
        {a.commenceDate ? a.commenceDate.slice(0, 10) : '—'}
      </td>
      <td style={td}>
        {actionBtn}
      </td>
    </tr>
  );
}
