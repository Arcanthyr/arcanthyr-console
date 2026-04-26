import { useState, useEffect } from 'react';
import { api } from '../api';

const COURT_COLORS = {
  TASCCA: { color: '#4A9EFF', bg: '#1a3a5c' },
  TASSC:  { color: '#C8CDD2', bg: '#1e2124' },
  TASMC:  { color: '#6abf6a', bg: '#1a3a1a' },
  HCA:    { color: '#E84A4A', bg: '#2a1a1a' },
};

function courtTag(court) {
  if (!court) return null;
  const s = COURT_COLORS[court] || { color: '#7A8087', bg: '#1a1a1a' };
  return (
    <span style={{
      padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 700,
      background: s.bg, color: s.color, textTransform: 'uppercase', letterSpacing: '0.05em',
      flexShrink: 0,
    }}>
      {court}
    </span>
  );
}

const TREATMENT_STYLES = {
  applied:      { color: 'var(--green)',          bg: 'rgba(106,191,106,0.12)' },
  followed:     { color: 'var(--green)',          bg: 'rgba(106,191,106,0.12)' },
  distinguished:{ color: 'var(--amber)',          bg: 'rgba(255,180,0,0.12)'  },
  'referred to':{ color: 'var(--text-secondary)', bg: 'rgba(120,128,135,0.12)' },
  mentioned:    { color: 'var(--text-secondary)', bg: 'rgba(120,128,135,0.12)' },
  cited:        { color: 'var(--text-secondary)', bg: 'rgba(120,128,135,0.12)' },
  'not followed':{ color: 'var(--red)',           bg: 'rgba(232,74,74,0.12)'  },
};

function treatmentPill(treatment) {
  if (!treatment) return null;
  const key = treatment.toLowerCase();
  const s = TREATMENT_STYLES[key] || { color: 'var(--text-secondary)', bg: 'rgba(120,128,135,0.12)' };
  return (
    <span style={{
      padding: '1px 7px', borderRadius: '3px', fontSize: '10px', fontWeight: 600,
      background: s.bg, color: s.color, textTransform: 'capitalize', flexShrink: 0,
      letterSpacing: '0.03em',
    }}>
      {treatment}
    </span>
  );
}

function CaseRow({ row, onSelectCase }) {
  const citation = row.citing_case || row.cited_case;
  const why = row.why ? row.why.slice(0, 100) + (row.why.length > 100 ? '…' : '') : null;

  return (
    <div
      onClick={() => citation && onSelectCase(citation)}
      style={{
        padding: '9px 12px', borderRadius: '4px', cursor: citation ? 'pointer' : 'default',
        background: 'rgba(0,0,0,0.18)', marginBottom: '6px',
        border: '1px solid var(--border)',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { if (citation) e.currentTarget.style.background = 'rgba(74,158,255,0.07)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.18)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', color: 'var(--pane-text)', fontWeight: 400, flex: '1 1 auto', minWidth: 0 }}>
          {row.case_name || citation}
        </span>
        {treatmentPill(row.treatment)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: why ? '4px' : 0 }}>
        <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--pane-dim)' }}>{citation}</span>
        {courtTag(row.court)}
      </div>
      {why && (
        <div style={{ fontSize: '12px', color: 'var(--pane-dim)', fontStyle: 'italic', marginTop: '2px' }}>
          {why}
        </div>
      )}
    </div>
  );
}

const sectionLabel = {
  fontSize: 11, letterSpacing: '0.08em', color: 'var(--pane-dim)',
  textTransform: 'uppercase', marginBottom: 8, fontWeight: 600,
};

export default function StareDecisisSection({ citation, onSelectCase }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!citation) return;
    setData(null);
    setLoading(true);
    api.caseAuthority(citation)
      .then(r => { setData(r.result ?? r); setLoading(false); })
      .catch(() => { setData({ cited_by: [], cites: [], legislation: [], treatment_summary: {}, cited_by_count: 0 }); setLoading(false); });
  }, [citation]);

  const citedBy          = data?.cited_by         ?? [];
  const cites            = data?.cites            ?? [];
  const legislation      = data?.legislation      ?? [];
  const citedByCount     = data?.cited_by_count   ?? 0;
  const treatmentSummary = data?.treatment_summary ?? {};
  const isEmpty = data !== null && citedBy.length === 0 && cites.length === 0 && legislation.length === 0;
  const summaryEntries   = Object.entries(treatmentSummary).filter(([, v]) => v > 0);

  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 24 }}>
      {/* Header / toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', margin: '0 -12px', background: 'transparent', cursor: 'pointer',
          color: 'var(--pane-text)', borderRadius: '4px', transition: 'background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(74,158,255,0.06)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            fontSize: 12, letterSpacing: '0.08em', color: 'var(--text-secondary)',
            textTransform: 'uppercase', fontWeight: 600,
          }}>
            Case Authority
          </span>
          {loading ? (
            <span style={{
              padding: '1px 8px', borderRadius: '3px', fontSize: '11px', fontWeight: 600,
              background: 'rgba(120,128,135,0.15)', color: 'var(--text-muted)',
              animation: 'pulse 1.5s infinite',
            }}>
              …
            </span>
          ) : (
            <span style={{
              padding: '1px 8px', borderRadius: '3px', fontSize: '11px', fontWeight: 600,
              background: citedByCount > 0 ? 'rgba(74,158,255,0.13)' : 'rgba(120,128,135,0.1)',
              color: citedByCount > 0 ? 'var(--accent)' : 'var(--text-muted)',
            }}>
              Cited by {citedByCount}
            </span>
          )}
        </div>
        <span style={{
          fontSize: '14px', color: 'var(--pane-dim)',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.18s',
          display: 'inline-block',
        }}>
          ▾
        </span>
      </button>

      {/* Body */}
      {open && (
        <div style={{ paddingBottom: 24 }}>
          {isEmpty && (
            <p style={{ fontSize: 13, color: 'var(--pane-dim)', fontStyle: 'italic' }}>
              No citation data yet — authority index updates nightly.
            </p>
          )}

          {!isEmpty && data && (
            <>
              {/* Treatment summary */}
              {summaryEntries.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={sectionLabel}>Treatment</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {summaryEntries.map(([t, count]) => {
                      const s = TREATMENT_STYLES[t.toLowerCase()] || { color: 'var(--text-secondary)', bg: 'rgba(120,128,135,0.12)' };
                      return (
                        <span key={t} style={{
                          padding: '2px 9px', borderRadius: '3px', fontSize: '11px', fontWeight: 600,
                          background: s.bg, color: s.color,
                        }}>
                          {t} · {count}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Cited by */}
              {citedBy.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={sectionLabel}>Cited by ({citedBy.length})</div>
                  {citedBy.map((row, i) => (
                    <CaseRow key={i} row={row} onSelectCase={onSelectCase} />
                  ))}
                </div>
              )}

              {/* This case cites */}
              {cites.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={sectionLabel}>This case cites ({cites.length})</div>
                  {cites.map((row, i) => (
                    <CaseRow key={i} row={row} onSelectCase={onSelectCase} />
                  ))}
                </div>
              )}

              {/* Legislation */}
              {legislation.length > 0 && (
                <div>
                  <div style={sectionLabel}>Legislation ({legislation.length})</div>
                  {legislation.map((ref, i) => (
                    <div key={i} style={{
                      fontFamily: 'monospace', fontSize: '12px', color: 'var(--pane-dim)',
                      padding: '4px 0', borderBottom: '1px solid var(--border)',
                    }}>
                      {ref}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
