import { useState } from 'react';
import { api } from '../api';

export default function ShareModal({ query, answer, onClose }) {
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const subject = query ? `Research: ${query.slice(0, 60)}` : 'Arcanthyr Research';

  async function handleSend() {
    if (!to) return;
    setLoading(true);
    setError('');
    try {
      await api.share({ to, subject, researchSummary: answer, note });
      setSent(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-em)',
        borderRadius: '8px', padding: '32px', width: '480px', maxWidth: '90vw',
      }} onClick={e => e.stopPropagation()}>
        {sent ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '24px', marginBottom: '12px' }}>✓</div>
            <div style={{ color: 'var(--text-body)' }}>Sent via Resend</div>
            <button onClick={onClose} style={{ marginTop: '20px', color: 'var(--accent)', fontSize: '13px' }}>Close</button>
          </div>
        ) : (
          <>
            <div style={{ fontWeight: 700, marginBottom: '20px', fontSize: '15px' }}>Share research</div>

            <label style={labelStyle}>To</label>
            <input
              type="email" value={to} onChange={e => setTo(e.target.value)}
              placeholder="recipient@example.com"
              style={inputStyle}
            />

            <label style={labelStyle}>Subject</label>
            <input value={subject} readOnly style={{ ...inputStyle, color: 'var(--text-secondary)' }} />

            <label style={labelStyle}>Research summary</label>
            <textarea
              value={answer || ''} readOnly rows={5}
              style={{ ...inputStyle, resize: 'none', fontStyle: 'italic', fontSize: '13px', color: 'var(--text-secondary)' }}
            />

            <label style={labelStyle}>Note (optional)</label>
            <textarea
              value={note} onChange={e => setNote(e.target.value)}
              rows={2} placeholder="Add a note…"
              style={{ ...inputStyle, resize: 'none' }}
            />

            {error && <div style={{ color: 'var(--red)', fontSize: '12px', marginBottom: '12px' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '8px 16px' }}>Cancel</button>
              <button onClick={handleSend} disabled={loading || !to} style={{
                background: 'var(--accent)', color: '#fff', fontWeight: 700,
                fontSize: '13px', padding: '8px 20px', borderRadius: '4px',
                opacity: loading || !to ? 0.5 : 1,
              }}>
                {loading ? 'Sending…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block', fontSize: '11px', letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text-secondary)',
  marginBottom: '6px', marginTop: '16px',
};
const inputStyle = {
  display: 'block', width: '100%', padding: '8px 12px',
  background: 'var(--surface-hover)', border: '1px solid var(--border)',
  borderRadius: '4px', color: 'var(--text-primary)', fontSize: '14px',
};
