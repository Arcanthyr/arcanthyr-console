import { useRef, useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export default function VanishingInput({ onSubmit, placeholder = '' }) {
  const [value, setValue] = useState('');
  const [animating, setAnimating] = useState(false);
  const [focused, setFocused] = useState(false);

  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  const particlesRef = useRef([]);
  const rafRef = useRef(null);

  const buildParticles = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;
    const ctx = canvas.getContext('2d');
    const W = 800, H = 60;
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);
    ctx.font = "italic 26px 'Libre Baskerville', Georgia, serif";
    ctx.fillStyle = '#C8CDD2';
    ctx.fillText(value, 0, 42);

    const { data } = ctx.getImageData(0, 0, W, H);
    const pts = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (data[(y * W + x) * 4 + 3] > 100) {
          pts.push({
            x, y,
            vx: (Math.random() - 0.4) * 5,
            vy: (Math.random() - 0.6) * 4 - 1,
            life: 1,
            r: Math.random() * 1.5 + 0.5,
            color: [data[(y * W + x) * 4], data[(y * W + x) * 4 + 1], data[(y * W + x) * 4 + 2]],
          });
        }
      }
    }
    particlesRef.current = pts.filter((_, i) => i % 3 === 0);
  }, [value]);

  const runAnimation = useCallback((start) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particlesRef.current = particlesRef.current
      .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.05, life: p.life * 0.93 }))
      .filter(p => p.life > 0.05);

    particlesRef.current.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.life * 0.9;
      ctx.fillStyle = `rgb(${p.color[0]},${p.color[1]},${p.color[2]})`;
      ctx.fillRect(p.x, p.y, p.r, p.r);
      ctx.restore();
    });

    if (particlesRef.current.length > 0 && Date.now() - start < 2000) {
      rafRef.current = requestAnimationFrame(() => runAnimation(start));
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setAnimating(false);
    }
  }, []);

  const vanishAndSubmit = () => {
    if (!value.trim() || animating) return;
    buildParticles();
    const query = value;
    setValue('');
    setAnimating(true);
    rafRef.current = requestAnimationFrame(() => runAnimation(Date.now()));
    setTimeout(() => onSubmit?.(query), 200);
  };

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  return (
    <div style={{ width: '100%', maxWidth: '540px' }}>
      <div style={{
        position: 'relative',
        background: '#111314',
        border: `1px solid ${focused ? 'rgba(74,158,255,0.35)' : '#1E2124'}`,
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        padding: '11px 16px',
        gap: '10px',
        boxShadow: focused ? '0 0 0 3px rgba(74,158,255,0.06)' : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        overflow: 'hidden',
      }}>
        {/* Search icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="#3D4247" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>

        {/* Particle canvas */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: '50%',
            left: '42px',
            transform: 'translateY(-50%) scale(0.5)',
            transformOrigin: 'left center',
            pointerEvents: 'none',
            opacity: animating ? 1 : 0,
          }}
        />

        <input
          ref={inputRef}
          value={animating ? '' : value}
          onChange={e => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={e => e.key === 'Enter' && vanishAndSubmit()}
          placeholder={placeholder}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            outline: 'none',
            fontFamily: "'Libre Baskerville', serif",
            fontSize: '13px',
            color: animating ? 'transparent' : '#C8CDD2',
            letterSpacing: '0.01em',
            transition: 'color 0.05s',
          }}
        />

        <AnimatePresence>
          {value.trim() && !animating && (
            <motion.button
              key="search-btn"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.15 }}
              onClick={vanishAndSubmit}
              style={{
                background: '#4A9EFF',
                border: 'none',
                borderRadius: '4px',
                padding: '5px 14px',
                color: '#fff',
                fontSize: '10px',
                fontFamily: "'Libre Baskerville', serif",
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              Search
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
