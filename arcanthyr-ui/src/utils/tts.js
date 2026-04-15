/**
 * TTS utility — singleton audio player for Arcanthyr.
 *
 * Uses Web Audio API (AudioContext) for reliable cross-gesture playback.
 * AudioContext must be unlocked from a user gesture; call unlockAudio()
 * synchronously inside any click/submit handler before awaiting playTTS.
 *
 * localStorage key:
 *   arcanthyr_tts_voice  — 'male' | 'female'  (default: 'male')
 */

const PRESETS = {
  welcome:    'Welcome to Arcanthyr. How may I be of service today?',
  processing: 'Processing your request, please stand by.',
  searching:  'Searching the case database.',
  thinking:   'Analysing your query.',
  complete:   'Your results are ready.',
  error:      'Something went wrong. Please try again.',
  no_results: 'No results found for your query.',
  loading:    'Loading, please wait.',
};

// Web Audio API state
let _ctx        = null;  // AudioContext — created on first unlockAudio()
let _sourceNode = null;  // current AudioBufferSourceNode
let _generation = 0;     // aborts stale in-flight fetches

// Stop listeners — fired whenever audio stops (naturally or via stopAll)
const _stopListeners = new Set();

/**
 * Register a callback that fires whenever audio stops.
 * Returns an unsubscribe function.
 */
export function onAudioStop(fn) {
  _stopListeners.add(fn);
  return () => _stopListeners.delete(fn);
}

function _notifyStop() {
  _stopListeners.forEach(fn => fn());
}

// ── Audio context unlock ─────────────────────────────────────────────────────

/**
 * Create (or resume) the AudioContext.
 * MUST be called synchronously inside a user gesture handler (click, submit,
 * keydown) before any await — otherwise the context stays suspended and
 * audio.start() will be silently blocked by the browser autoplay policy.
 */
export function unlockAudio() {
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('[TTS] AudioContext not available:', e);
      return;
    }
  }
  if (_ctx.state === 'suspended') {
    _ctx.resume().catch(e => console.warn('[TTS] resume failed:', e));
  }
}

// ── Preference accessors ────────────────────────────────────────────────────

export const getVoice = () => localStorage.getItem('arcanthyr_tts_voice') || 'male';
export const setVoice = v  => localStorage.setItem('arcanthyr_tts_voice', v);

export const isAudioPlaying = () => !!_sourceNode;

// ── Playback control ────────────────────────────────────────────────────────

/** Stop any currently playing audio and notify all listeners. */
export function stopAll() {
  if (_sourceNode) {
    try { _sourceNode.stop(); } catch {}
    _sourceNode = null;
    _notifyStop();
  }
}

/**
 * Fetch TTS audio from /api/tts and play it via AudioContext.
 * Returns the AudioBufferSourceNode, or null if aborted by a concurrent call.
 * Throws on HTTP or decode error.
 *
 * Call unlockAudio() synchronously before awaiting this function.
 */
export async function playTTS(text, voice) {
  const t = (text || '').trim();
  if (!t) return null;

  stopAll();
  const myGen = ++_generation;

  // Lazily create context if unlockAudio() hasn't been called yet
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('[TTS] AudioContext create failed:', e);
      return null;
    }
  }
  if (_ctx.state === 'suspended') {
    await _ctx.resume().catch(e => console.warn('[TTS] resume failed:', e));
  }

  console.log('[TTS] fetching for:', t.slice(0, 50) + (t.length > 50 ? '…' : ''));

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: t, voice: voice || getVoice() }),
  });

  if (myGen !== _generation) {
    console.log('[TTS] aborted (superseded during fetch)');
    return null;
  }

  console.log('[TTS] response:', res.status, res.headers.get('content-type'));

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `TTS error ${res.status}`);
  }

  const blob = await res.blob();
  console.log('[TTS] blob:', blob.size, 'bytes, type:', blob.type);

  if (myGen !== _generation) {
    console.log('[TTS] aborted (superseded after blob)');
    return null;
  }

  const arrayBuf = await blob.arrayBuffer();
  let decoded;
  try {
    decoded = await _ctx.decodeAudioData(arrayBuf);
  } catch (e) {
    console.warn('[TTS] decodeAudioData failed:', e);
    throw e;
  }

  if (myGen !== _generation) {
    console.log('[TTS] aborted (superseded after decode)');
    return null;
  }

  const source = _ctx.createBufferSource();
  source.buffer = decoded;
  source.connect(_ctx.destination);
  source.onended = () => {
    if (_sourceNode === source) { _sourceNode = null; _notifyStop(); }
  };
  source.start(0);
  _sourceNode = source;

  console.log('[TTS] playing, duration:', decoded.duration.toFixed(1), 's');
  return source;
}

/**
 * Play a preset ambient clip by name using the stored voice preference.
 * Errors are caught and logged — ambient failures are non-fatal.
 */
export async function playAmbient(clipName) {
  const text = PRESETS[clipName];
  if (!text) return;
  return playTTS(text).catch(err => console.warn('[TTS] ambient error:', err));
}
