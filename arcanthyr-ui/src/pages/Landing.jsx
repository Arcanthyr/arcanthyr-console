import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import '@fontsource/libre-baskerville/400.css';
import '@fontsource/libre-baskerville/700.css';
import '@fontsource/libre-baskerville/400-italic.css';

import VanishingInput from '../components/ui/VanishingInput';

const SUGGESTIONS = [
  'Evidence Act 2001 (Tas)',
  'Criminal Code s234',
  'Sentencing guidelines',
  'Bail Act 1994',
  'Court of Appeal — recent',
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div style={{
      fontFamily: "'Libre Baskerville', serif",
      background: '#000000',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── Main content ── */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        padding: '0 24px',
      }}>

        {/* Sigil — 2× larger */}
        <motion.img
          src="/thisone.png"
          alt="The Arc"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 0.9, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.9, ease: 'easeOut' }}
          style={{
            width: '320px',
            height: '320px',
            objectFit: 'contain',
            marginBottom: '12px',
          }}
        />

        {/* Wordmark */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65, duration: 0.6 }}
          style={{
            fontSize: '12px', fontWeight: 700,
            letterSpacing: '0.35em', color: '#E8E9EA',
            textTransform: 'uppercase', marginBottom: '7px',
          }}
        >
          THE ARC
        </motion.div>

        {/* Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          style={{
            fontSize: '11px', fontStyle: 'italic',
            color: '#7A8087', letterSpacing: '0.05em',
            marginBottom: '36px',
          }}
        >
          Tasmanian Criminal Law Research
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.95, duration: 0.6 }}
          style={{ marginBottom: '14px', width: '100%', display: 'flex', justifyContent: 'center' }}
        >
          <VanishingInput
            placeholder=""
            onSubmit={(q) => navigate(`/intel?q=${encodeURIComponent(q)}`)}
          />
        </motion.div>

        {/* Suggestion pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.6 }}
          style={{
            display: 'flex', flexWrap: 'wrap', gap: '8px',
            justifyContent: 'center', maxWidth: '560px',
            marginBottom: '44px',
          }}
        >
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => navigate(`/intel?q=${encodeURIComponent(s)}`)}
              style={{
                background: 'transparent', border: '1px solid #1E2124',
                borderRadius: '20px', padding: '5px 14px', fontSize: '10px',
                fontFamily: "'Libre Baskerville', serif", letterSpacing: '0.05em',
                color: '#7A8087', cursor: 'pointer', transition: 'color 0.2s, border-color 0.2s, background 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#C8CDD2'; e.currentTarget.style.borderColor = '#252A2E'; e.currentTarget.style.background = 'rgba(74,158,255,0.05)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#7A8087'; e.currentTarget.style.borderColor = '#1E2124'; e.currentTarget.style.background = 'transparent'; }}
            >
              {s}
            </button>
          ))}
        </motion.div>

        {/* Nav links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.25, duration: 0.6 }}
          style={{ display: 'flex', gap: '6px' }}
        >
          {[
            { label: 'AI Assist',    path: '/intel'        },
            { label: 'Case Search',  path: '/case-search'  },
            { label: 'Legislation',  path: '/legislation'  },
            { label: 'Corpus Admin', path: '/corpus-admin' },
          ].map(({ label, path }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              style={{
                minWidth: '120px', height: '40px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent',
                border: '1px solid #252A2E',
                borderRadius: '3px',
                fontFamily: "'Libre Baskerville', serif",
                fontSize: '12px', letterSpacing: '0.04em', textTransform: 'uppercase',
                color: '#7A8087', cursor: 'pointer',
                transition: 'color 0.15s, background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#4A9EFF'; e.currentTarget.style.borderColor = '#4A9EFF'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#7A8087'; e.currentTarget.style.borderColor = '#252A2E'; e.currentTarget.style.background = 'transparent'; }}
            >
              {label}
            </button>
          ))}
        </motion.div>

      </div>

      {/* Corner mark */}
      <div style={{
        position: 'absolute', bottom: '20px', right: '24px',
        fontSize: '9px', fontStyle: 'italic', color: '#1E2124',
        letterSpacing: '0.06em', zIndex: 2,
      }}>
        TAS · v4
      </div>

    </div>
  );
}
