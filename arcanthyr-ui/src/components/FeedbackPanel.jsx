import { useState, useEffect } from 'react';
import { api } from '../api';

export default function FeedbackPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedAnswers, setExpandedAnswers] = useState({});
  const [expandedChunks, setExpandedChunks] = useState({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await api.feedback();
      setRows(r.result?.rows || r.rows || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function toggle(setMap, id) {
    setMap(prev => ({ ...prev, [id]: !prev[id] }));
  }

  if (loading) {
    return <div style={{ padding: '32px 24px', color: 'var(--text-secondary)', fontSize: '13px' }}>Loading…</div>;
  }
  if (error) {
    return <div style={{ padding: '32px 24px', color: 'var(--red)', fontSize: '13px' }}>{error}</div>;
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          Insufficient feedback — {rows.length} entr{rows.length !== 1 ? 'ies' : 'y'}
        </div>
        <button
          onClick={load}
          style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--border)' }}
        >
          ↻ Refresh
        </button>
      </div>

      {rows.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '13px' }}>
          No insufficient feedback logged yet.
        </div>
      )}

      {rows.map(row => (
        <div key={row.id} style={{
          marginBottom: '12px',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          background: 'var(--surface)',
          overflow: 'hidden',
        }}>
          {/* Header row */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', wordBreak: 'break-word' }}>
                {row.query_text}
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                {row.timestamp && <span>{new Date(row.timestamp).toLocaleString()}</span>}
                {row.model && (
                  <span style={{
                    padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 600,
                    background: row.model === 'sol' ? 'rgba(74,158,255,0.12)' : 'rgba(106,191,106,0.12)',
                    color: row.model === 'sol' ? 'var(--accent)' : 'var(--green)',
                    textTransform: 'uppercase',
                  }}>
                    {row.model === 'sol' ? 'Sol' : row.model === 'vger' ? "V'ger" : row.model}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Missing note */}
          {row.missing_note && (
            <div style={{ padding: '10px 16px', background: 'rgba(232,74,74,0.05)', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Missing: </span>
              <span style={{ fontSize: '13px', color: 'var(--text-body)' }}>{row.missing_note}</span>
            </div>
          )}

          {/* Collapsible answer */}
          {row.answer_text && (
            <div style={{ borderBottom: '1px solid var(--border)' }}>
              <button
                onClick={() => toggle(setExpandedAnswers, row.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 16px',
                  fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: 'var(--text-secondary)', background: 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <span>Answer text</span>
                <span style={{
                  fontSize: '12px', display: 'inline-block',
                  transform: expandedAnswers[row.id] ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s',
                }}>▾</span>
              </button>
              {expandedAnswers[row.id] && (
                <div style={{ padding: '10px 16px 14px', fontSize: '13px', color: 'var(--text-body)', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {row.answer_text}
                </div>
              )}
            </div>
          )}

          {/* Collapsible retrieved chunks */}
          {row.result_ids && row.result_ids !== '[]' && (
            <div>
              <button
                onClick={() => toggle(setExpandedChunks, row.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 16px',
                  fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: 'var(--text-secondary)', background: 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <span>Retrieved chunks</span>
                <span style={{
                  fontSize: '12px', display: 'inline-block',
                  transform: expandedChunks[row.id] ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s',
                }}>▾</span>
              </button>
              {expandedChunks[row.id] && (
                <div style={{ padding: '8px 16px 12px' }}>
                  {(() => {
                    try {
                      const ids = JSON.parse(row.result_ids);
                      const scores = row.result_scores ? JSON.parse(row.result_scores) : [];
                      return ids.map((id, i) => (
                        <div key={i} style={{
                          fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-secondary)',
                          padding: '3px 0', borderBottom: '1px solid var(--border)',
                          display: 'flex', gap: '12px',
                        }}>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{id}</span>
                          {scores[i] !== undefined && (
                            <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{(scores[i] * 100).toFixed(0)}%</span>
                          )}
                        </div>
                      ));
                    } catch {
                      return <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{row.result_ids}</span>;
                    }
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
