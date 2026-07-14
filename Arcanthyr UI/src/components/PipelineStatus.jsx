import { useState, useEffect } from 'react';
import { api } from '../api';

const STAGES = ['Upload', 'Pass 1', 'Chunk', 'Enrich', 'Embed', 'Done'];

function stageFromStatus(status) {
  if (!status) return -1;
  if (status === 'done') return 5;
  if (status === 'error') return -2;
  if (status === 'processing') return 3;
  return 1;
}

export default function PipelineStatus({ citation, onRequeue }) {
  const [status, setStatus] = useState(null);
  const [nexusKey, setNexusKey] = useState('');
  const [requeueMsg, setRequeueMsgg] = useState('');

  useEffect(() => {
    if (!citation) return;
    const poll = async () => {
      try {
        const d = await api.caseStatus(citation);
        setStatus(d);
        if (d.status === 'done' || d.status === 'error') return;
        setTimeout(poll, 15000);
      } catch {}
    };
    poll();
  }, [citation]);

  const stageIdx = status ? stageFromStatus(status.status) : -1;
  const isError = status?.status === 'error';

  async function handleRequeue() {
    if (!nexusKey) return;
    try {
      await api.requeueChunks(nexusKey);
      setRequeueMsgg('Re-queued');
    } catch (e) {
      setRequeueMsgg(e.message);
    }
  }

  return (
    <div style={{
      padding: '12px 16px', background: 'var(--surface)',
      borderRadius: '6px', marginTop: '8px',
    }}>
      <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-secondary)', marginBottom: '10px' }}>
        {citation}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {STAGES.map((s, i) => {
          const done = stageIdx >= i;
          const active = stageIdx === i;
          const error = isError && i === stageIdx;
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{
                padding: '3px 8px', borderRadius: '3px', fontSize: '11px',
                background: error ? 'rgba(232,74,74,0.15)' : done ? 'rgba(58,122,58,0.2)' : 'var(--surface-hover)',
                color: error ? 'var(--red)' : done ? '#6abf6a' : 'var(--text-muted)',
                animation: active ? 'pulse 1.5s infinite' : 'none',
                border: active ? '1px solid var(--accent)' : '1px solid transparent',
              }}>
                {s}
              </div>
              {i < STAGES.length - 1 && (
                <div style={{ width: '12px', height: '1px', background: 'var(--border)' }} />
              )}
            </div>
          );
        })}
      </div>

      {isError && status?.error && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--red)' }}>{status.error}</div>
      )}

      {isError && (
        <div style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            value={nexusKey} onChange={e => setNexusKey(e.target.value)}
            placeholder="Admin key to re-queue"
            style={{
              padding: '5px 10px', fontSize: '12px',
              background: 'var(--surface-hover)', border: '1px solid var(--border)',
              borderRadius: '4px', color: 'var(--text-primary)', width: '200px',
            }}
          />
          <button onClick={handleRequeue} style={{
            padding: '5px 12px', background: 'var(--amber)', color: '#000',
            fontWeight: 700, fontSize: '12px', borderRadius: '4px',
          }}>
            Re-queue
          </button>
          {requeueMsg && <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{requeueMsg}</span>}
        </div>
      )}
    </div>
  );
}
