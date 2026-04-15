import { useState, useEffect } from 'react';
import Nav from '../components/Nav';

const BASE = 'https://arcanthyr.com';

export default function HealthReports() {
  const [nexusKey, setNexusKey] = useState('');
  const [reports, setReports] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');

  async function fetchReports(key) {
    if (!key) return;
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${BASE}/api/admin/health-reports`, {
        headers: { 'X-Nexus-Key': key },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setReports(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchDetail(key, id) {
    setLoadingDetail(true);
    try {
      const r = await fetch(`${BASE}/api/admin/health-reports/${encodeURIComponent(id)}`, {
        headers: { 'X-Nexus-Key': key },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSelected(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-shell)' }}>
      <Nav />

      {/* Auth bar */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-page)', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Admin key:</span>
        <input
          type="password"
          value={nexusKey}
          onChange={e => setNexusKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetchReports(nexusKey)}
          placeholder="X-Nexus-Key"
          style={{
            padding: '5px 10px', fontSize: '12px', fontFamily: 'monospace',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '4px', color: 'var(--text-primary)', width: '280px',
          }}
        />
        <button
          onClick={() => fetchReports(nexusKey)}
          style={{
            padding: '5px 14px', fontSize: '12px', fontWeight: 700,
            background: 'var(--accent)', color: '#fff', borderRadius: '4px',
          }}
        >
          Load Reports
        </button>
        {reports && (
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {reports.length} report{reports.length !== 1 ? 's' : ''}
          </span>
        )}
        {error && <span style={{ fontSize: '12px', color: 'var(--red)' }}>{error}</span>}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Report list */}
        <div style={{
          width: selected ? '440px' : '100%',
          flexShrink: 0,
          overflow: 'auto',
          borderRight: selected ? '1px solid var(--border)' : 'none',
          padding: '20px 24px',
        }}>
          {loading && <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading…</div>}

          {!loading && reports === null && (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '40px', textAlign: 'center' }}>
              Enter your admin key and click Load Reports.
            </div>
          )}

          {!loading && reports !== null && reports.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '40px', textAlign: 'center' }}>
              No health check reports yet. Run corpus_health_check.py on the VPS to generate the first report.
            </div>
          )}

          {reports && reports.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Clusters', 'Contradictions', 'Gaps', ''].map(h => (
                    <th key={h} style={{
                      padding: '8px 12px', textAlign: 'left', fontSize: '11px',
                      color: 'var(--text-secondary)', fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: selected?.id === r.id ? 'var(--surface-hover)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 12px', color: 'var(--text-primary)' }}>
                      {r.created_at?.slice(0, 10)}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                      {r.cluster_count ?? '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        color: r.contradiction_count > 0 ? 'var(--amber)' : 'var(--text-secondary)',
                        fontWeight: r.contradiction_count > 0 ? 700 : 400,
                      }}>
                        {r.contradiction_count ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                      {r.gap_count ?? '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <button
                        onClick={() => fetchDetail(nexusKey, r.id)}
                        style={{
                          padding: '3px 10px', fontSize: '11px', fontWeight: 600,
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: '3px', color: 'var(--accent)', cursor: 'pointer',
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail pane */}
        {selected && (
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
            {loadingDetail && <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading detail…</div>}
            {!loadingDetail && <ReportDetail report={selected} onClose={() => setSelected(null)} />}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Report detail ─────────────────────────────────────────────────────────── */
function ReportDetail({ report, onClose }) {
  const rj = typeof report.report_json === 'string'
    ? JSON.parse(report.report_json)
    : report.report_json;

  const highContradictions = rj?.contradictions?.high_confidence || [];
  const otherContradictions = rj?.contradictions?.other || [];
  const intraGaps = rj?.gaps?.intra_cluster || [];
  const crossGaps = rj?.gaps?.cross_domain || [];
  const smallClusters = rj?.small_clusters || [];
  const errorClusters = rj?.error_clusters || [];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Health Report — {report.created_at?.slice(0, 10)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px' }}>
            {report.summary_text}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '4px' }}>
            {report.id}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '4px 12px', fontSize: '12px', background: 'transparent',
            border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-secondary)',
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Clusters', val: rj?.cluster_count },
          { label: 'High contradictions', val: highContradictions.length, warn: highContradictions.length > 0 },
          { label: 'Other contradictions', val: otherContradictions.length },
          { label: 'Intra gaps', val: intraGaps.length },
          { label: 'Cross-domain refs', val: crossGaps.length },
        ].map(({ label, val, warn }) => (
          <div key={label} style={{
            padding: '10px 16px', background: 'var(--surface)',
            border: `1px solid ${warn ? 'var(--amber)' : 'var(--border)'}`,
            borderRadius: '6px', minWidth: '100px',
          }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: warn ? 'var(--amber)' : 'var(--text-primary)' }}>{val ?? '—'}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Contradictions — high confidence first */}
      <Section title="Contradictions" count={highContradictions.length + otherContradictions.length}>
        {highContradictions.length === 0 && otherContradictions.length === 0 && (
          <EmptyState>No contradictions detected across {rj?.cluster_count} clusters.</EmptyState>
        )}
        {highContradictions.map((c, i) => (
          <ContradictionCard key={i} item={c} badge="HIGH" badgeColor="var(--red)" />
        ))}
        {otherContradictions.map((c, i) => (
          <ContradictionCard key={i} item={c} badge={c.confidence?.toUpperCase()} badgeColor="var(--amber)" />
        ))}
      </Section>

      {/* Intra-cluster gaps — grouped by cluster */}
      <Section title="Intra-Cluster Gaps" count={intraGaps.length}>
        {intraGaps.length === 0 && (
          <EmptyState>No intra-cluster gaps detected.</EmptyState>
        )}
        {groupBy(intraGaps, 'cluster').map(([label, items]) => (
          <ClusterGroup key={label} label={label}>
            {items.map((g, i) => <GapCard key={i} item={g} />)}
          </ClusterGroup>
        ))}
      </Section>

      {/* Cross-domain references — collapsed by default */}
      <CollapsibleSection title="Cross-Domain References" count={crossGaps.length}>
        {crossGaps.length === 0 && (
          <EmptyState>No cross-domain references flagged.</EmptyState>
        )}
        {groupBy(crossGaps, 'cluster').map(([label, items]) => (
          <ClusterGroup key={label} label={label}>
            {items.map((g, i) => <GapCard key={i} item={g} />)}
          </ClusterGroup>
        ))}
      </CollapsibleSection>

      {/* Small / error clusters — collapsed */}
      {(smallClusters.length > 0 || errorClusters.length > 0) && (
        <CollapsibleSection title="Audit Notes" count={smallClusters.length + errorClusters.length}>
          {smallClusters.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Skipped (too small — fewer than 3 chunks):
              </div>
              {smallClusters.map((s, i) => (
                <div key={i} style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace', padding: '2px 0' }}>
                  {s.cluster} ({s.chunk_ids?.length ?? 0} chunks)
                </div>
              ))}
            </div>
          )}
          {errorClusters.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '6px' }}>
                Errors during analysis:
              </div>
              {errorClusters.map((e, i) => (
                <div key={i} style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace', padding: '2px 0' }}>
                  {e.cluster} [{e.pass}]: {e.error}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function Section({ title, count, children }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{
        fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.07em',
        borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '14px',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>{title}</span>
        {count > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{count}</span>}
      </div>
      {children}
    </div>
  );
}

function CollapsibleSection({ title, count, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: '28px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', padding: '8px 0',
          fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)',
          textTransform: 'uppercase', letterSpacing: '0.07em',
          borderBottom: '1px solid var(--border)', background: 'transparent',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <span>{title}</span>
        <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>
          {count > 0 ? count : ''} {open ? '▲' : '▼'}
        </span>
      </button>
      {open && <div style={{ marginTop: '14px' }}>{children}</div>}
    </div>
  );
}

function ContradictionCard({ item, badge, badgeColor }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '6px', padding: '14px 16px', marginBottom: '10px',
    }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
        <span style={{
          padding: '2px 7px', borderRadius: '3px', fontSize: '10px', fontWeight: 700,
          background: `${badgeColor}22`, color: badgeColor, flexShrink: 0,
        }}>{badge}</span>
        <span style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.4' }}>
          {item.description}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <ChunkBadge id={item.chunk_a} label="A" />
        <ChunkBadge id={item.chunk_b} label="B" />
        <ClusterBadge label={item.cluster} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <Callout color="var(--red)" label="Why it's a contradiction" text={item.why_contradiction} />
        <Callout color="var(--text-muted)" label="Why it might not be" text={item.why_not} />
      </div>
    </div>
  );
}

function GapCard({ item }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '6px', padding: '12px 14px', marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '6px' }}>
        <span style={{
          padding: '2px 7px', borderRadius: '3px', fontSize: '10px', fontWeight: 700,
          background: 'rgba(58,122,58,0.15)', color: 'var(--green)', flexShrink: 0, whiteSpace: 'nowrap',
        }}>GAP</span>
        <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>{item.concept}</span>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
        {item.description}
      </div>
      {item.referenced_in?.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Referenced in:</span>
          {item.referenced_in.map(id => <ChunkBadge key={id} id={id} />)}
        </div>
      )}
    </div>
  );
}

function ClusterGroup({ label, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        fontSize: '11px', fontWeight: 700, color: 'var(--accent)',
        fontFamily: 'monospace', marginBottom: '8px', padding: '3px 8px',
        background: 'rgba(74,158,255,0.08)', borderRadius: '3px', display: 'inline-block',
      }}>
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ChunkBadge({ id, label }) {
  const short = id?.length > 32 ? id.slice(0, 32) + '…' : id;
  return (
    <span style={{
      padding: '2px 7px', background: 'var(--surface-hover)',
      border: '1px solid var(--border)', borderRadius: '3px',
      fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-secondary)',
    }}>
      {label ? `${label}: ` : ''}{short}
    </span>
  );
}

function ClusterBadge({ label }) {
  if (!label) return null;
  return (
    <span style={{
      padding: '2px 7px', background: 'rgba(74,158,255,0.08)',
      border: '1px solid rgba(74,158,255,0.2)', borderRadius: '3px',
      fontSize: '10px', fontFamily: 'monospace', color: 'var(--accent)',
    }}>
      {label}
    </span>
  );
}

function Callout({ color, label, text }) {
  return (
    <div style={{
      padding: '8px 10px', borderLeft: `3px solid ${color}`,
      background: `${color}11`, borderRadius: '0 4px 4px 0',
    }}>
      <div style={{ fontSize: '10px', color, fontWeight: 700, marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
        {text || '—'}
      </div>
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px 0', fontStyle: 'italic' }}>
      {children}
    </div>
  );
}

/* ── Util ────────────────────────────────────────────────────────────────────── */
function groupBy(arr, key) {
  const map = new Map();
  for (const item of arr) {
    const k = item[key] || 'unknown';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return [...map.entries()];
}
