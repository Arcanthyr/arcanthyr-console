import { useState, useEffect } from 'react';
import { api } from '../api';

const BASE = 'https://arcanthyr.com';

export default function SecondarySourcesPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nexusKey, setNexusKey] = useState('');
  const [pendingItems, setPendingItems] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await api.library();
      setData(r.result || r);
    } catch (e) {
      console.error('Secondary sources load failed:', e);
    } finally {
      setLoading(false);
    }
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

  async function handleDelete(id) {
    if (!confirm(`Delete ${id}?`)) return;
    try {
      fetch(`${BASE}/api/legal/library/delete/secondary/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load();
    } catch (e) { alert(e.message); }
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      {loading && <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading…</div>}
      {data && (
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
    </div>
  );
}

/* ── Pending Review ─────────────────────────────────────────── */
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
                  borderRadius: '4px', color: 'var(--green)', textTransform: 'uppercase',
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
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr>
            {['Title / Domain', 'ID', 'Category', 'Status', 'Actions'].map(c => (
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
            <tr><td colSpan={5} style={{ padding: '24px 12px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '13px' }}>No records.</td></tr>
          ) : rows.map(r => {
            const isMalformed = (r.id || '').includes('{');
            const isNexusSave = (r.id || '').startsWith('nexus-save-');
            return (
              <tr key={r.id} style={{ background: isMalformed ? 'rgba(232,74,74,0.05)' : 'transparent' }}>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-body)' }}>{r.title}</div>
                    {r.court === 'authority_synthesis' && (
                      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', padding: '1px 6px', borderRadius: '3px', background: 'rgba(200,140,50,0.08)', color: '#C88C32', textTransform: 'uppercase', flexShrink: 0 }}>AUTHORITY</span>
                    )}
                  </div>
                  {r.court && r.court !== 'authority_synthesis' && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{r.court}</div>}
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
                      ? <button onClick={() => onDeleteNexus(r.id)} style={{ fontSize: '11px', color: 'var(--red)', textTransform: 'uppercase' }}>Delete</button>
                      : <button onClick={() => onDelete(r.id)} style={{ fontSize: '11px', color: 'var(--red)', textTransform: 'uppercase' }}>Delete</button>
                    }
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const td = { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };
const tdMono = { ...td, fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-secondary)' };
