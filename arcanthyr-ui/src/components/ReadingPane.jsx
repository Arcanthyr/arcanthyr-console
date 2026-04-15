import { useState } from 'react';
import PrincipleCard from './PrincipleCard';
import ReadButton from './ReadButton';

export default function ReadingPane({ selected, answer, onShare, onClose }) {
  // Empty state — no selection, no answer
  if (!selected && !answer) {
    return (
      <div style={{
        flex: 1,
        background: 'var(--bg-shell)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
      }}>
        <img src="/unnamed.jpg" alt="" style={{ width: '48px', opacity: 0.08, marginBottom: '16px' }} />
        <div style={{ fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
          Ask a question
        </div>
      </div>
    );
  }

  // Answer only — no case selected
  if (!selected) {
    return (
      <div style={{ flex: 1, background: 'var(--bg-shell)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{
          padding: '14px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-topbar)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              AI Summary
            </div>
            {answer && <ReadButton getText={() => answer} />}
          </div>
          <button
            onClick={onShare}
            style={{
              fontSize: '11px', padding: '5px 12px',
              border: '1px solid var(--border-em)',
              borderRadius: '4px',
              color: 'var(--text-secondary)',
              background: 'transparent',
              letterSpacing: '0.04em',
              transition: 'color 0.2s, background 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            Share
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.85 }}>{answer}</div>
        </div>
      </div>
    );
  }

  return <CasePane selected={selected} answer={answer} onShare={onShare} onClose={onClose} />;
}

function CasePane({ selected, answer, onShare, onClose }) {
  const [tab, setTab] = useState(0);
  const TABS = ['Principles', 'Chunks', 'AI Summary'];

  return (
    <div style={{ flex: 1, background: 'var(--bg-shell)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '14px 24px 0',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-topbar)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', letterSpacing: '0.04em' }}>
              {selected.citation || selected.ref || selected.id}
            </div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', lineHeight: 1.35 }}>
              {selected.title || selected.case_name || selected.citation}
            </div>
            {selected.court && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {selected.court}{selected.date ? ` · ${selected.date}` : ''}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '16px' }}>
            <button
              onClick={onShare}
              style={{
                fontSize: '11px', padding: '5px 12px',
                border: '1px solid var(--border-em)',
                borderRadius: '4px',
                color: 'var(--text-secondary)',
                background: 'transparent',
                letterSpacing: '0.04em',
                transition: 'color 0.2s, background 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              Share
            </button>
            {/* Close — deselects case, returns to answer view */}
            <button
              onClick={onClose}
              title="Close"
              aria-label="Close"
              style={{
                fontSize: '16px', padding: '3px 10px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text-muted)',
                background: 'transparent',
                lineHeight: 1,
                transition: 'color 0.2s, border-color 0.2s, background 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-em)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              ×
            </button>
          </div>
        </div>
        <div style={{ display: 'flex' }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)} style={{
              padding: '8px 16px', fontSize: '12px',
              color: tab === i ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: tab === i ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'transparent',
              letterSpacing: '0.04em',
            }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        {tab === 0 && <PrinciplesTab selected={selected} />}
        {tab === 1 && <ChunksTab selected={selected} />}
        {tab === 2 && (
          answer
            ? <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <ReadButton getText={() => answer} />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Read aloud
                  </span>
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.85 }}>{answer}</div>
              </>
            : <EmptyState>Run a query to see the AI summary.</EmptyState>
        )}
      </div>
    </div>
  );
}

function PrinciplesTab({ selected }) {
  const chunks = selected.chunks || [];
  if (!chunks.length) return <EmptyState>No enriched chunks yet.</EmptyState>;
  return chunks.map((c, i) => <PrincipleCard key={c.id || i} chunk={c} index={i} />);
}

function ChunksTab({ selected }) {
  const chunks = selected.chunks || [];
  if (!chunks.length) return <EmptyState>No chunks.</EmptyState>;
  return chunks.map((c, i) => (
    <div key={c.id || i} style={{ marginBottom: '16px', border: '1px solid var(--border)', borderRadius: '5px', overflow: 'hidden' }}>
      <div style={{
        padding: '6px 12px',
        background: 'var(--surface)',
        fontSize: '11px',
        color: 'var(--text-muted)',
        display: 'flex', gap: '8px',
        letterSpacing: '0.04em',
      }}>
        <span>Chunk {i + 1}</span>
        {c.chunk_type && <span style={{ textTransform: 'capitalize' }}>{c.chunk_type}</span>}
      </div>
      <div style={{
        padding: '12px',
        fontSize: '12px',
        lineHeight: 1.7,
        color: 'var(--text-primary)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        background: 'var(--surface)',
      }}>
        {c.chunk_text}
      </div>
    </div>
  ));
}

function EmptyState({ children }) {
  return (
    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '13px', paddingTop: '8px' }}>
      {children}
    </div>
  );
}
