import { useState, useEffect, useRef } from 'react';
import { playTTS, stopAll, onAudioStop, unlockAudio } from '../utils/tts';

/**
 * Small read-aloud button.
 *
 * Props:
 *   getText — string | (() => string)   text to read
 *   style   — optional extra button styles
 */
export default function ReadButton({ getText, style }) {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const dead = useRef(false);

  useEffect(() => {
    dead.current = false;
    // When any audio stops (natural end or another button's stopAll), mark not playing
    const unsub = onAudioStop(() => { if (!dead.current) setPlaying(false); });
    return () => { dead.current = true; unsub(); };
  }, []);

  async function handleClick(e) {
    e.stopPropagation(); // don't trigger parent card clicks

    if (playing) {
      stopAll();
      return; // onAudioStop listener handles setPlaying(false)
    }

    // unlockAudio MUST be called synchronously inside the click handler —
    // before any await — so the browser accepts the AudioContext resume.
    unlockAudio();

    const text = ((typeof getText === 'function' ? getText() : getText) || '').trim();
    if (!text) return;

    setLoading(true);
    try {
      const source = await playTTS(text);
      // playTTS returns null if superseded by a concurrent call
      if (source && !dead.current) setPlaying(true);
    } catch (err) {
      console.warn('[TTS] ReadButton:', err.message);
    } finally {
      if (!dead.current) setLoading(false);
    }
  }

  const isActive = playing;
  return (
    <button
      onClick={handleClick}
      title={playing ? 'Stop reading' : 'Read aloud'}
      aria-label={playing ? 'Stop reading' : 'Read aloud'}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        width:          '26px',
        height:         '26px',
        borderRadius:   '4px',
        border:   `1px solid ${isActive ? 'rgba(74,158,255,0.35)' : 'var(--border)'}`,
        background:     isActive ? 'var(--accent-dim)' : 'transparent',
        color:          isActive ? 'var(--accent)' : 'var(--text-muted)',
        fontSize:       '13px',
        lineHeight:     1,
        flexShrink:     0,
        cursor:         'pointer',
        transition:     'color 0.15s, background 0.15s, border-color 0.15s',
        ...style,
      }}
      onMouseEnter={e => {
        if (!isActive) {
          e.currentTarget.style.color      = 'var(--text-secondary)';
          e.currentTarget.style.background = 'var(--surface)';
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          e.currentTarget.style.color      = 'var(--text-muted)';
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {loading
        ? <span style={{ animation: 'pulse 0.8s ease-in-out infinite', display: 'block' }}>⟳</span>
        : playing ? '⏹' : '🔊'}
    </button>
  );
}
