import { SignIn, SignedIn, SignedOut } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import '@fontsource/libre-baskerville/400.css';
import '@fontsource/libre-baskerville/700.css';
import '@fontsource/libre-baskerville/400-italic.css';

export default function Landing() {
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

      <SignedIn>
        <Navigate to="/intel" replace />
      </SignedIn>

      <SignedOut>
        <div style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          padding: '0 24px',
        }}>

          {/* Sigil */}
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

          {/* Clerk sign-in */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.95, duration: 0.6 }}
          >
            <SignIn />
          </motion.div>

        </div>
      </SignedOut>

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
