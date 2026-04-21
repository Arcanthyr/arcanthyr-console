const COURT_TAGS = {
  TASCCA: { label: 'CCA', bg: '#1a3a5c', color: '#4A9EFF' },
  TASSC:  { label: 'SC',  bg: '#1e2124', color: '#C8CDD2' },
  TASMC:  { label: 'MC',  bg: '#1a3a1a', color: '#6abf6a' },
  HCA:    { label: 'HCA', bg: '#2a1a1a', color: '#E84A4A' },
};
const TYPE_TAGS = {
  secondary:           { label: 'CORPUS',    bg: '#1a1a1a',              color: '#7A8087' },
  secondary_source:    { label: 'CORPUS',    bg: '#1a1a1a',              color: '#7A8087' },
  legislation:         { label: 'LEG',       bg: '#0d2a2a',              color: '#4ad4d4' },
  authority_synthesis: { label: 'AUTHORITY', bg: 'rgba(200,140,50,0.08)', color: '#C88C32' },
};

function Tag({ label, bg, color }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: '3px',
      fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
      background: bg, color, textTransform: 'uppercase',
    }}>
      {label}
    </span>
  );
}

export default function ResultCard({ result, isActive, onClick }) {
  const courtTag = COURT_TAGS[result.court];
  const typeTag  = TYPE_TAGS[result.type] || TYPE_TAGS[result.doc_type];
  const tag = courtTag || typeTag || { label: result.type || result.doc_type || '?', bg: '#1a1a1a', color: '#7A8087' };
  const score = result.score ?? result.relevance_score ?? 0;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        background: isActive ? 'var(--surface)' : 'transparent',
        borderLeft: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-hover)'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <Tag {...tag} />
        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
          {result.citation || result.ref || result.id}
        </span>
      </div>
      {result.title && (
        <div style={{ fontSize: '13px', color: 'var(--text-body)', marginBottom: '4px', lineHeight: 1.4 }}>
          {result.title}
        </div>
      )}
      {result.snippet && (
        <div
          style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}
          dangerouslySetInnerHTML={{ __html: result.snippet }}
        />
      )}
      {score > 0 && (
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ flex: 1, height: '2px', background: 'var(--border)', borderRadius: '1px' }}>
            <div style={{ width: `${Math.min(score * 100, 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: '1px' }} />
          </div>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{score.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
