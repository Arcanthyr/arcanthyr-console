import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { getVoice, setVoice } from '../utils/tts';

const links = [
  { to: '/research', label: 'RESEARCH' },
  { to: '/library',  label: 'LIBRARY'  },
  { to: '/upload',   label: 'UPLOAD'   },
  { to: '/compose',  label: 'COMPOSE'  },
];

export default function Nav() {
  const navigate = useNavigate();
  const [voice, setVoiceState] = useState(getVoice);

  function toggleVoice() {
    const next = voice === 'male' ? 'female' : 'male';
    setVoice(next);
    setVoiceState(next);
  }

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0',
      height: '72px',
      background: 'var(--bg-topbar)',
      borderBottom: '1px solid var(--border)',
      padding: '0 20px',
    }}>
      {/* Sigil — replaces wordmark, links back to landing */}
      <button
        onClick={() => navigate('/')}
        aria-label="Go to home"
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          marginRight: '28px',
          cursor: 'pointer',
          flexShrink: 0,
          display: 'flex',
        }}
      >
        <img
          src="/unnamed.jpg"
          alt=""
          style={{
            height: '56px',
            width: '56px',
            objectFit: 'contain',
            opacity: 0.85,
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.85'}
        />
      </button>

      {links.map(l => (
        <NavLink key={l.to} to={l.to}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          style={({ isActive }) => ({
            fontSize: '12px',
            padding: '0 14px',
            height: '56px',
            display: 'flex',
            alignItems: 'center',
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
            letterSpacing: '0.04em',
            transition: 'color 0.15s, background 0.15s',
          })}>
          {l.label}
        </NavLink>
      ))}

      {/* Voice toggle — right side */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
        <button
          onClick={toggleVoice}
          title={`Switch to ${voice === 'male' ? 'female' : 'male'} voice`}
          style={{
            padding: '3px 10px',
            borderRadius: '12px',
            fontSize: '11px',
            background: 'var(--surface)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            letterSpacing: '0.04em',
            cursor: 'pointer',
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--surface-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--surface)'; }}
        >
          {voice === 'male' ? 'Male' : 'Female'}
        </button>
      </div>
    </nav>
  );
}
