import { useState, useEffect } from 'react';
import Nav from '../components/Nav';
import Globe from '../components/ui/Globe';
import { api } from '../api';

// ── Globe locations & arcs ────────────────────────────────────
const LOCATIONS = [
  { name: 'Devonport',  lat: -41.1775, lng: 146.3497, label: 'DVP  −41.18°  146.35°' },
  { name: 'Ulverstone', lat: -41.1569, lng: 146.1731, label: 'ULV  −41.16°  146.17°' },
  { name: 'Burnie',     lat: -41.0549, lng: 145.9099, label: 'BUR  −41.05°  145.91°' },
  { name: 'Melbourne',  lat: -37.8136, lng: 144.9631, label: 'MEL  −37.81°  144.96°' },
];

const ARCS = [
  { from: LOCATIONS[0], to: LOCATIONS[3], altitude: 0.3 },  // Devonport → Melbourne
  { from: LOCATIONS[2], to: LOCATIONS[3], altitude: 0.28 }, // Burnie → Melbourne
  { from: LOCATIONS[0], to: LOCATIONS[2], altitude: 0.1 },  // Devonport → Burnie
];

// ── localStorage helpers ──────────────────────────────────────
const CONTACTS_KEY  = 'arcanthyr_contacts';
const HISTORY_KEY   = 'arcanthyr_messages';

const loadLS  = (key, def) => { try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; } };
const saveLS  = (key, val) => localStorage.setItem(key, JSON.stringify(val));

// ── Shared field style ────────────────────────────────────────
const fieldStyle = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  color: 'var(--text-primary)',
  fontSize: '13px',
  fontFamily: "'Libre Baskerville', serif",
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.2s',
};

const label = (text) => (
  <div style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
    {text}
  </div>
);

// ── Main component ────────────────────────────────────────────
export default function Compose() {
  const [tab, setTab]           = useState('compose'); // 'compose' | 'contacts' | 'history'
  const [to, setTo]             = useState('');
  const [subject, setSubject]   = useState('');
  const [body, setBody]         = useState('');
  const [sending, setSending]   = useState(false);
  const [status, setStatus]     = useState(null); // { ok, msg }
  const [contacts, setContacts] = useState(() => loadLS(CONTACTS_KEY, []));
  const [history, setHistory]   = useState(() => loadLS(HISTORY_KEY, []));

  useEffect(() => saveLS(CONTACTS_KEY, contacts), [contacts]);
  useEffect(() => saveLS(HISTORY_KEY, history),   [history]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!to.trim() || !body.trim()) return;
    setSending(true);
    setStatus(null);

    const entry = {
      id:        Date.now(),
      to:        to.trim(),
      subject:   subject.trim() || '(no subject)',
      body:      body.trim(),
      timestamp: new Date().toISOString(),
      status:    'pending',
    };

    try {
      // Uses the existing /api/legal/share Worker route (Resend)
      await api.share({ to: entry.to, subject: entry.subject, researchSummary: entry.body, note: '' });
      entry.status = 'sent';
      setStatus({ ok: true, msg: 'Dispatched via Resend.' });
    } catch (err) {
      entry.status = 'queued';
      setStatus({ ok: false, msg: `Send failed: ${err.message}` });
    }

    setHistory(h => [entry, ...h]);
    setTo('');
    setSubject('');
    setBody('');
    setSending(false);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: 'var(--bg-page)', fontFamily: "'Libre Baskerville', serif",
    }}>
      <Nav />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Globe panel ── */}
        <div style={{
          flex: '0 0 460px',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-page)',
          overflow: 'hidden',
          position: 'relative',
        }}>
          <Globe size={420} locations={LOCATIONS} arcs={ARCS} />
          <div style={{
            position: 'absolute', bottom: '24px',
            fontSize: '10px', fontStyle: 'italic',
            color: 'var(--text-muted)', letterSpacing: '0.08em',
          }}>
            Dispatching from Tasmania, Australia
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Tab bar */}
          <div style={{
            display: 'flex', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-topbar)', flexShrink: 0,
          }}>
            {[
              { id: 'compose',  label: 'Compose' },
              { id: 'contacts', label: 'Contacts' },
              { id: 'history',  label: `History${history.length ? ` (${history.length})` : ''}` },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '13px 22px', fontSize: '12px',
                  background: 'transparent',
                  color: tab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
                  borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                  letterSpacing: '0.06em',
                  transition: 'color 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {tab === 'compose'  && <ComposeTab to={to} setTo={setTo} subject={subject} setSubject={setSubject} body={body} setBody={setBody} sending={sending} status={status} onSend={handleSend} contacts={contacts} />}
            {tab === 'contacts' && <ContactsTab contacts={contacts} setContacts={setContacts} onSelect={email => { setTo(email); setTab('compose'); }} />}
            {tab === 'history'  && <HistoryTab history={history} setHistory={setHistory} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Compose tab ───────────────────────────────────────────────
function ComposeTab({ to, setTo, subject, setSubject, body, setBody, sending, status, onSend, contacts }) {
  return (
    <form onSubmit={onSend} style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* To */}
      <div>
        {label('To')}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="recipient@example.com"
            list="contact-list"
            style={fieldStyle}
            onFocus={e => e.target.style.borderColor = 'rgba(74,158,255,0.4)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <datalist id="contact-list">
            {contacts.map(c => <option key={c.id} value={c.email} label={c.name} />)}
          </datalist>
        </div>
      </div>

      {/* Subject */}
      <div>
        {label('Subject')}
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Re: [matter reference]"
          style={fieldStyle}
          onFocus={e => e.target.style.borderColor = 'rgba(74,158,255,0.4)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {label('Message')}
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder={'Dear Counsel,\n\nFurther to your instructions…'}
          rows={12}
          style={{
            ...fieldStyle,
            resize: 'vertical',
            lineHeight: 1.75,
            minHeight: '200px',
          }}
          onFocus={e => e.target.style.borderColor = 'rgba(74,158,255,0.4)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '14px' }}>
        {status && (
          <span style={{
            fontSize: '11px', fontStyle: 'italic', letterSpacing: '0.04em',
            color: status.ok ? 'var(--accent)' : 'var(--amber)',
          }}>
            {status.msg}
          </span>
        )}
        <button
          type="submit"
          disabled={sending || !to.trim() || !body.trim()}
          style={{
            padding: '10px 28px',
            background: (sending || !to.trim() || !body.trim()) ? 'var(--surface)' : 'var(--accent)',
            color: '#fff', fontSize: '12px', fontWeight: 700,
            fontFamily: "'Libre Baskerville', serif",
            letterSpacing: '0.1em', textTransform: 'uppercase',
            borderRadius: '4px',
            opacity: (sending || !to.trim() || !body.trim()) ? 0.35 : 1,
            transition: 'opacity 0.2s',
            cursor: (sending || !to.trim() || !body.trim()) ? 'default' : 'pointer',
          }}
        >
          {sending ? '…' : 'Dispatch →'}
        </button>
      </div>
    </form>
  );
}

// ── Contacts tab ──────────────────────────────────────────────
function ContactsTab({ contacts, setContacts, onSelect }) {
  const [name,  setName]  = useState('');
  const [email, setEmail] = useState('');
  const [org,   setOrg]   = useState('');

  const addContact = (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setContacts(c => [...c, { id: Date.now(), name: name.trim(), email: email.trim(), org: org.trim() }]);
    setName(''); setEmail(''); setOrg('');
  };

  const deleteContact = (id) => setContacts(c => c.filter(x => x.id !== id));

  return (
    <div style={{ padding: '24px 32px' }}>
      {/* Add form */}
      <div style={{ marginBottom: '28px', paddingBottom: '24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '14px' }}>
          Add Contact
        </div>
        <form onSubmit={addContact} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" style={{ ...fieldStyle, flex: 1 }}
              onFocus={e => e.target.style.borderColor = 'rgba(74,158,255,0.4)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" type="email" style={{ ...fieldStyle, flex: 2 }}
              onFocus={e => e.target.style.borderColor = 'rgba(74,158,255,0.4)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input value={org} onChange={e => setOrg(e.target.value)} placeholder="Organisation (optional)" style={{ ...fieldStyle, flex: 1 }}
              onFocus={e => e.target.style.borderColor = 'rgba(74,158,255,0.4)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            <button type="submit" disabled={!name.trim() || !email.trim()} style={{
              padding: '9px 18px', background: 'var(--accent)', color: '#fff',
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', borderRadius: '4px',
              fontFamily: "'Libre Baskerville', serif",
              opacity: (!name.trim() || !email.trim()) ? 0.35 : 1, flexShrink: 0,
            }}>
              Add
            </button>
          </div>
        </form>
      </div>

      {/* Contact list */}
      {contacts.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '13px' }}>No contacts yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {contacts.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 0', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '2px' }}>{c.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--accent)', fontFamily: 'monospace' }}>{c.email}</div>
                {c.org && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{c.org}</div>}
              </div>
              <button onClick={() => onSelect(c.email)} style={{
                padding: '4px 12px', fontSize: '11px', borderRadius: '4px',
                border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'transparent',
                cursor: 'pointer', letterSpacing: '0.04em', flexShrink: 0,
              }}>
                Compose
              </button>
              <button onClick={() => deleteContact(c.id)} style={{
                fontSize: '11px', color: 'var(--red)', background: 'transparent', flexShrink: 0,
              }}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────
const STATUS_COLORS = { sent: 'var(--green)', queued: 'var(--amber)', pending: 'var(--text-muted)' };

function HistoryTab({ history, setHistory }) {
  const [expanded, setExpanded] = useState(null);

  const deleteMessage = (id) => setHistory(h => h.filter(m => m.id !== id));

  if (history.length === 0) {
    return (
      <div style={{ padding: '32px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '13px' }}>
        No messages sent yet.
      </div>
    );
  }

  return (
    <div style={{ padding: '0' }}>
      {history.map(m => (
        <div key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
          <div
            onClick={() => setExpanded(expanded === m.id ? null : m.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px 32px', cursor: 'pointer',
              background: expanded === m.id ? 'var(--surface)' : 'transparent',
              transition: 'background 0.15s',
            }}
          >
            {/* Status dot */}
            <span style={{ fontSize: '10px', color: STATUS_COLORS[m.status] || 'var(--text-muted)', flexShrink: 0 }}>●</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.subject}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                → {m.to}
              </div>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0, letterSpacing: '0.02em' }}>
              {new Date(m.timestamp).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
            <span style={{ fontSize: '10px', color: STATUS_COLORS[m.status], textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
              {m.status}
            </span>
            <button
              onClick={e => { e.stopPropagation(); deleteMessage(m.id); }}
              style={{ fontSize: '11px', color: 'var(--red)', background: 'transparent', flexShrink: 0 }}
            >
              Delete
            </button>
          </div>

          {expanded === m.id && (
            <div style={{ padding: '16px 32px 20px', background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
              <pre style={{
                fontFamily: "'Libre Baskerville', serif",
                fontSize: '13px', color: 'var(--text-body)',
                lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
              }}>
                {m.body}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
