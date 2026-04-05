import { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

function DockItem({ item, mouseX }) {
  const ref = useRef(null);
  const [hovered, setHovered] = useState(false);

  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const sizeTransform = useTransform(distance, [-160, 0, 160], [44, 72, 44]);
  const size = useSpring(sizeTransform, { mass: 0.1, stiffness: 150, damping: 12 });

  return (
    <Link
      to={item.href}
      style={{ textDecoration: 'none', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
    >
      <AnimatePresence>
        {hovered && (
          <motion.div
            key="tooltip"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 10px)',
              background: '#111314',
              border: '1px solid #1E2124',
              borderRadius: '5px',
              padding: '3px 10px',
              fontSize: '10px',
              fontFamily: "'Libre Baskerville', serif",
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#C8CDD2',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            {item.label}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        ref={ref}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: hovered ? '#1A1D20' : '#111314',
          border: `1px solid ${hovered ? '#252A2E' : '#1E2124'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: hovered ? '#E8E9EA' : '#7A8087',
          transition: 'background 0.2s, border-color 0.2s, color 0.2s',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {item.icon}
      </motion.div>
    </Link>
  );
}

export default function FloatingDock({ items }) {
  const mouseX = useMotionValue(Infinity);

  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.clientX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: '10px',
        background: 'rgba(14,16,18,0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid #1E2124',
        borderRadius: '28px',
        padding: '12px 18px',
      }}
    >
      {items.map((item) => (
        <DockItem key={item.label} item={item} mouseX={mouseX} />
      ))}
    </motion.div>
  );
}
