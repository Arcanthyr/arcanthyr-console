import { NavLink, useNavigate } from 'react-router-dom';

const links = [
  { to: '/intel',        label: 'AI ASSIST'    },
  { to: '/case-search',  label: 'CASE SEARCH'  },
  { to: '/legislation',  label: 'LEGISLATION'  },
  { to: '/corpus-admin', label: 'CORPUS ADMIN' },
];

export default function Nav() {
  const navigate = useNavigate();

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
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
          src="/thisone.png"
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
            height: '40px',
            minWidth: '120px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            border: isActive ? '1px solid var(--accent)' : '1px solid var(--border-em)',
            borderRadius: '3px',
            letterSpacing: '0.04em',
            transition: 'color 0.15s, background 0.15s, border-color 0.15s',
          })}>
          {l.label}
        </NavLink>
      ))}

    </nav>
  );
}
