import { useState } from 'react';
import { api } from '../api';
import PrincipleCard from './PrincipleCard';

const SAVE_CATEGORIES = ['annotation', 'doctrine', 'practice note', 'checklist'];

export default function ReadingPane({ selected, answer, query, queryId, onShare, onClose }) {
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
          {answer && (
            <SaveFlagPanel
              query={query}
              answer={answer}
              queryId={queryId}
            />
          )}
        </div>
      </div>
    );
  }

  if (selected.type === 'authority_synthesis') {
    return <AuthorityPane selected={selected} onClose={onClose} />;
  }

  return <CasePane selected={selected} answer={answer} query={query} queryId={queryId} onShare={onShare} onClose={onClose} />;
}

function AuthorityPane({ selected, onClose }) {
  return (
    <div style={{ flex: 1, background: 'var(--bg-shell)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '14px 24px 0',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-topbar)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', padding: '1px 6px', borderRadius: '3px', background: 'rgba(200,140,50,0.08)', color: '#C88C32', textTransform: 'uppercase' }}>AUTHORITY</span>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                {selected.citation || selected.id}
              </span>
            </div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', lineHeight: 1.35 }}>
              {selected.title || selected.citation}
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close"
            style={{
              fontSize: '16px', padding: '3px 10px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-muted)',
              background: 'transparent',
              lineHeight: 1,
              flexShrink: 0,
              marginLeft: '16px',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >×</button>
        </div>
        <div style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#C88C32', paddingBottom: '10px' }}>
          Authority Analysis
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
        <pre style={{ fontFamily: 'inherit', fontSize: '13px', color: 'var(--text-body)', lineHeight: 1.85, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
          {selected.text || selected.raw_text || 'No content available.'}
        </pre>
      </div>
    </div>
  );
}

function CasePane({ selected, answer, query, queryId, onShare, onClose }) {
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
            ? (
              <>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.85 }}>{answer}</div>
                <SaveFlagPanel
                  query={query}
                  answer={answer}
                  queryId={queryId}
                />
              </>
            )
            : <EmptyState>Run a query to see the AI summary.</EmptyState>
        )}
      </div>
    </div>
  );
}

function SaveFlagPanel({ query, answer, queryId }) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveCategory, setSaveCategory] = useState('annotation');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const [thumbsNote, setThumbsNote] = useState('');
  const [thumbsFlagged, setThumbsFlagged] = useState(false);
  const [thumbsFlagging, setThumbsFlagging] = useState(false);
  const [thumbsError, setThumbsError] = useState('');

  function openSave() {
    const today = new Date().toISOString().slice(0, 10);
    setSaveTitle(`${(query || '').slice(0, 100)} (${today})`);
    setSaveOpen(true);
    setSaveError('');
  }

  async function confirmSave() {
    if (!saveTitle.trim()) { setSaveError('Title is required'); return; }
    setSaving(true);
    setSaveError('');
    try {
      await api.saveToNexus({
        text: answer,
        mode: 'single',
        title: saveTitle.trim(),
        slug: `nexus-save-${new Date().toISOString().slice(0, 10)}-${Date.now()}`,
        category: saveCategory,
        approved: 0,
      });
      setSaved(true);
      setSaveOpen(false);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function doThumbsDown(noteOverride) {
    if (!queryId) return;
    const note = noteOverride !== undefined ? noteOverride : (thumbsNote.trim() || null);
    setThumbsError('');
    setThumbsFlagging(true);
    try {
      await api.markInsufficient(queryId, note, null);
      setThumbsFlagged(true);
      setThumbsOpen(false);
      setThumbsNote('');
    } catch (e) {
      console.error('markInsufficient failed:', e);
      setThumbsError(e.message || 'Could not save feedback — try again');
    } finally {
      setThumbsFlagging(false);
    }
  }

  return (
    <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Save to Nexus */}
        {!saved ? (
          <button
            onClick={openSave}
            disabled={saveOpen || saving}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '5px 12px', fontSize: '11px', borderRadius: '4px',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-secondary)', letterSpacing: '0.04em',
              cursor: saveOpen ? 'default' : 'pointer', opacity: saveOpen ? 0.6 : 1,
              transition: 'color 0.2s, border-color 0.2s, background 0.2s',
            }}
            onMouseEnter={e => { if (!saveOpen) { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-em)'; } }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            ⊕ Save to Nexus
          </button>
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--green)', letterSpacing: '0.04em' }}>✓ Saved to Nexus</span>
        )}

        {/* Insufficient — sets query_log.sufficient=0 */}
        {!thumbsFlagged ? (
          <button
            onClick={() => { setThumbsOpen(o => !o); setThumbsNote(''); setThumbsError(''); }}
            disabled={thumbsFlagging || thumbsOpen}
            style={{
              fontSize: '11px', padding: '5px 10px', background: 'transparent',
              border: 'none', color: 'var(--text-muted)', cursor: (thumbsFlagging || thumbsOpen) ? 'default' : 'pointer',
              letterSpacing: '0.04em', transition: 'color 0.2s',
            }}
            onMouseEnter={e => { if (!thumbsOpen) e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            {thumbsFlagging ? '…' : '↓ Insufficient'}
          </button>
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>↓ Logged</span>
        )}
      </div>

      {thumbsOpen && !thumbsFlagged && (
        <div style={{
          marginTop: '12px', padding: '12px 14px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: '6px',
        }}>
          <textarea
            value={thumbsNote}
            onChange={e => setThumbsNote(e.target.value.slice(0, 500))}
            placeholder="What was missing? (optional)"
            rows={2}
            style={{
              width: '100%', padding: '6px 10px', fontSize: '12px',
              background: 'var(--surface-hover)', border: '1px solid var(--border)',
              borderRadius: '4px', color: 'var(--text-primary)', resize: 'vertical',
              boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />
          {thumbsError && (
            <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '6px' }}>
              {thumbsError}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
            <button
              onClick={doThumbsDown}
              disabled={thumbsFlagging}
              style={{
                padding: '5px 14px', fontSize: '12px', fontWeight: 600,
                background: 'var(--accent)', color: '#fff', borderRadius: '4px',
                cursor: thumbsFlagging ? 'not-allowed' : 'pointer', opacity: thumbsFlagging ? 0.6 : 1,
              }}
            >
              {thumbsFlagging ? 'Submitting…' : 'Submit'}
            </button>
            <button
              onClick={() => doThumbsDown('')}
              disabled={thumbsFlagging}
              style={{
                fontSize: '12px', color: 'var(--text-secondary)', background: 'transparent',
                border: '1px solid var(--border)', borderRadius: '4px', padding: '5px 10px',
                cursor: thumbsFlagging ? 'not-allowed' : 'pointer', opacity: thumbsFlagging ? 0.6 : 1,
              }}
            >
              Skip
            </button>
            <button
              onClick={() => { setThumbsOpen(false); setThumbsNote(''); setThumbsError(''); }}
              style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}



      {/* Save panel */}
      {saveOpen && (
        <div style={{
          marginTop: '12px', padding: '16px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: '6px',
        }}>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Title
            </label>
            <input
              value={saveTitle}
              onChange={e => setSaveTitle(e.target.value.slice(0, 120))}
              style={{
                width: '100%', padding: '6px 10px', fontSize: '12px', boxSizing: 'border-box',
                background: 'var(--surface-hover)', border: '1px solid var(--border)',
                borderRadius: '4px', color: 'var(--text-primary)',
              }}
            />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Category
            </label>
            <select
              value={saveCategory}
              onChange={e => setSaveCategory(e.target.value)}
              style={{
                padding: '6px 10px', fontSize: '12px',
                background: 'var(--surface-hover)', border: '1px solid var(--border)',
                borderRadius: '4px', color: 'var(--text-primary)',
              }}
            >
              {SAVE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{
            maxHeight: '160px', overflow: 'auto', padding: '8px 10px', marginBottom: '12px',
            background: 'var(--bg-shell)', border: '1px solid var(--border)', borderRadius: '4px',
            fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6,
          }}>
            {answer}
          </div>
          {saveError && <div style={{ fontSize: '11px', color: 'var(--red)', marginBottom: '8px' }}>{saveError}</div>}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={confirmSave}
              disabled={saving}
              style={{
                padding: '6px 16px', fontSize: '12px', fontWeight: 600,
                background: 'var(--accent)', color: '#fff', borderRadius: '4px',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Confirm'}
            </button>
            <button
              onClick={() => { setSaveOpen(false); setSaveError(''); }}
              style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
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
