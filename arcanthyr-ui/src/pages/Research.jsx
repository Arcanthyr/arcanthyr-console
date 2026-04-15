import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Nav from '../components/Nav';
import ResultCard from '../components/ResultCard';
import ReadingPane from '../components/ReadingPane';
import ShareModal from '../components/ShareModal';
import { api } from '../api';
import { playAmbient, unlockAudio } from '../utils/tts';

const FILTERS = ['ALL', 'CASES', 'CORPUS', 'LEGISLATION'];

export default function Research() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState([]);
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [showShare, setShowShare] = useState(false);
  const [error, setError] = useState('');
  const [model, setModel] = useState('workers');
  const [selected, setSelected] = useState(null);

  // Auto-run query if pre-populated from landing page search
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      handleQueryWith(q);
    }
  }, []);

  async function handleQueryWith(q) {
    if (!q?.trim()) return;
    setLoading(true);
    setError('');
    setResults([]);
    setAnswer('');
    setSources([]);
    setSelected(null);
    playAmbient('searching');
    try {
      const data = await api.query(q.trim(), model);
      const r = data.result || data;
      const ans = r.answer || r.response || '';
      const raw = r.results || r.sources || [];
      setAnswer(ans);
      setResults(raw);
      setSources(r.sources || []);
      if (ans || raw.length > 0) {
        playAmbient('complete');
      } else {
        playAmbient('no_results');
      }
    } catch (e) {
      setError(e.message);
      playAmbient('error');
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(e) {
    e?.preventDefault();
    unlockAudio(); // user gesture — unlock AudioContext before async query
    handleQueryWith(query);
  }

  const filtered = results.filter(r => {
    if (filter === 'ALL') return true;
    if (filter === 'CASES') return r.doc_type !== 'secondary' && r.doc_type !== 'legislation';
    if (filter === 'CORPUS') return r.doc_type === 'secondary';
    if (filter === 'LEGISLATION') return r.doc_type === 'legislation';
    return true;
  });

  const resultKey = (r) => r?.id || r?.citation || r?.ref || JSON.stringify({ title: r?.title, court: r?.court });

  const handleCardClick = (result) => {
    const key = resultKey(result);
    setSelected(prev => prev && resultKey(prev) === key ? null : result);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-shell)' }}>
      <Nav />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left column — matches Library width when case open */}
        <div style={{
          flex: '0 0 480px',
          display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-page)',
          overflow: 'hidden',
        }}>
          {/* Search — enlarged */}
          <form onSubmit={handleQuery} style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleQuery(); } }}
              placeholder="Ask a legal question…"
              rows={6}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '5px',
                color: 'var(--text-primary)',
                fontSize: '15px',
                lineHeight: 1.7,
                resize: 'vertical',
                marginBottom: '10px',
                boxSizing: 'border-box',
                fontFamily: "'Libre Baskerville', serif",
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(74,158,255,0.4)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: '36px', alignItems: 'center' }}>
              {loading ? (
                <span style={{
                  fontSize: '11px', fontStyle: 'italic', color: '#4A9EFF',
                  animation: 'pulse 1s ease-in-out infinite',
                  letterSpacing: '0.04em',
                }}>
                  Processing request…
                </span>
              ) : (
                <button
                  type="submit"
                  disabled={!query.trim()}
                  style={{
                    padding: '9px 20px',
                    background: 'var(--accent)',
                    color: '#fff', fontWeight: 700, fontSize: '13px',
                    borderRadius: '4px', opacity: !query.trim() ? 0.4 : 1,
                    fontFamily: "'Libre Baskerville', serif",
                    letterSpacing: '0.06em',
                    transition: 'opacity 0.2s',
                  }}
                >
                  Ask →
                </button>
              )}
            </div>
          </form>

          {/* Model toggle */}
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Model</span>
            {['claude', 'workers'].map(m => (
              <button
                key={m}
                onClick={() => setModel(m)}
                style={{
                  padding: '3px 10px', borderRadius: '12px', fontSize: '11px',
                  background: model === m ? 'var(--accent-dim)' : 'var(--surface)',
                  color: model === m ? 'var(--accent)' : 'var(--text-secondary)',
                  border: `1px solid ${model === m ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {m === 'claude' ? 'Sol' : "V'ger"}
              </button>
            ))}
            <a
              href="https://arcanthyr.com/digest"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginLeft: 'auto',
                padding: '3px 10px', borderRadius: '12px', fontSize: '11px',
                background: 'var(--surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              Daily Digest ↗
            </a>
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '3px 10px', borderRadius: '12px', fontSize: '11px',
                  background: filter === f ? 'var(--accent-dim)' : 'var(--surface)',
                  color: filter === f ? 'var(--accent)' : 'var(--text-secondary)',
                  border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Results list */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {error && (
              <div style={{ padding: '16px', fontSize: '13px', color: 'var(--red)' }}>{error}</div>
            )}
            {!loading && !error && filtered.length === 0 && query && (
              <div style={{ padding: '24px 16px', fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No results.
              </div>
            )}
            {filtered.map((r, i) => {
              const isActive = !!selected && resultKey(selected) === resultKey(r);
              return (
                <ResultCard
                  key={r.id || r.citation || i}
                  result={r}
                  isActive={isActive}
                  onClick={() => handleCardClick(r)}
                />
              );
            })}
          </div>
        </div>

        {/* Reading pane */}
        <ReadingPane
          selected={selected}
          answer={answer}
          onShare={() => setShowShare(true)}
          onClose={() => setSelected(null)}
        />
      </div>

      {showShare && (
        <ShareModal
          query={query}
          answer={answer}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
