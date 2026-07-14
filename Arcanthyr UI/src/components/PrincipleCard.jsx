const CHUNK_TYPE_COLORS = {
  reasoning:    '#1a3a5c',
  evidence:     '#1a2e1a',
  submissions:  '#2a2a1a',
  procedural:   '#1a1a2e',
  header:       '#1a1a1a',
  mixed:        '#2a1a2a',
};

export default function PrincipleCard({ chunk, index }) {
  const type = chunk.chunk_type || 'reasoning';
  const bg = CHUNK_TYPE_COLORS[type] || CHUNK_TYPE_COLORS.mixed;

  const principles = (() => {
    if (!chunk.principles_json) return [];
    try {
      const p = typeof chunk.principles_json === 'string'
        ? JSON.parse(chunk.principles_json)
        : chunk.principles_json;
      return Array.isArray(p) ? p : (p.principles || []);
    } catch { return []; }
  })();

  const quotes = (() => {
    if (!chunk.principles_json) return [];
    try {
      const p = typeof chunk.principles_json === 'string'
        ? JSON.parse(chunk.principles_json)
        : chunk.principles_json;
      return Array.isArray(p.reasoning_quotes) ? p.reasoning_quotes : [];
    } catch { return []; }
  })();

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: '6px',
      overflow: 'hidden', marginBottom: '12px',
    }}>
      <div style={{
        background: bg, padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <span style={{
          fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
          color: 'var(--text-secondary)', textTransform: 'uppercase',
        }}>
          Chunk {index + 1}
        </span>
        <span style={{
          fontSize: '10px', background: 'rgba(255,255,255,0.08)',
          color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '3px',
        }}>
          {type}
        </span>
        {chunk.score != null && (
          <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>
            {chunk.score?.toFixed(3)}
          </span>
        )}
      </div>

      <div style={{ padding: '14px', background: 'var(--surface)' }}>
        {chunk.enriched_text && (
          <p style={{ fontSize: '14px', color: 'var(--text-body)', lineHeight: 1.7, marginBottom: '12px' }}>
            {chunk.enriched_text}
          </p>
        )}

        {quotes.length > 0 && quotes.map((q, i) => (
          <blockquote key={i} style={{
            borderLeft: '3px solid var(--border-em)', paddingLeft: '12px',
            marginBottom: '8px', fontStyle: 'italic',
            fontSize: '13px', color: 'var(--text-secondary)',
          }}>
            {q}
          </blockquote>
        ))}

        {principles.length > 0 && (
          <ul style={{ marginTop: '10px', paddingLeft: '16px' }}>
            {principles.map((p, i) => (
              <li key={i} style={{ fontSize: '13px', color: 'var(--text-body)', lineHeight: 1.6, marginBottom: '4px' }}>
                {typeof p === 'string' ? p : p.principle || JSON.stringify(p)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
