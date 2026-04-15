/**
 * TTS utility — singleton audio player for Arcanthyr.
 *
 * Uses Web Audio API (AudioContext) for reliable cross-browser playback.
 * AudioContext must be unlocked from a user gesture; call unlockAudio()
 * synchronously inside any click/submit handler before awaiting playTTS.
 *
 * Ambient clips are served from static WAV files in /Voices/ — zero latency,
 * no MOSS-TTS round-trip. Non-preset text calls /api/tts as normal.
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

// Reverse map: normalised phrase → preset key, used to short-circuit playTTS
// if a caller passes a preset phrase as text directly.
const _TEXT_TO_KEY = Object.fromEntries(
  Object.entries(PRESETS).map(([k, v]) => [v.toLowerCase().trim(), k])
);

// Build the static WAV path for a given preset key and voice.
function _staticPath(key, voice) {
  const dir = voice === 'male' ? '/Voices/ambient_male' : '/Voices/ambient';
  return `${dir}/${key}.wav`;
}

// ── Web Audio API state ──────────────────────────────────────────────────────

let _ctx        = null;  // AudioContext — created on first unlockAudio()
let _sourceNode = null;  // current AudioBufferSourceNode
let _generation = 0;     // incremented on every play call; aborts stale in-flight work

// ── Stop listeners ───────────────────────────────────────────────────────────

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

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Ensure AudioContext exists and is running. Returns false if unavailable. */
async function _ensureCtx() {
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('[TTS] AudioContext create failed:', e);
      return false;
    }
  }
  if (_ctx.state === 'suspended') {
    await _ctx.resume().catch(e => console.warn('[TTS] resume failed:', e));
  }
  return true;
}

/**
 * Decode an ArrayBuffer and start playback.
 * Returns the AudioBufferSourceNode, or null if superseded by a newer call.
 * Throws on decode error.
 */
async function _decodeAndPlay(arrayBuf, myGen) {
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

// ── Preference accessors ─────────────────────────────────────────────────────

export const getVoice = () => localStorage.getItem('arcanthyr_tts_voice') || 'male';
export const setVoice = v  => localStorage.setItem('arcanthyr_tts_voice', v);

export const isAudioPlaying = () => !!_sourceNode;

// ── Playback control ─────────────────────────────────────────────────────────

/** Stop any currently playing audio and notify all listeners. */
export function stopAll() {
  if (_sourceNode) {
    try { _sourceNode.stop(); } catch {}
    _sourceNode = null;
    _notifyStop();
  }
}

/**
 * Fetch TTS audio and play it via AudioContext.
 *
 * For preset phrases, serves the pre-recorded WAV from /Voices/ directly
 * (zero latency, no server round-trip). All other text calls /api/tts.
 *
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
  const v = voice || getVoice();

  if (!await _ensureCtx()) return null;

  // Static file shortcut — serve preset phrase from /Voices/ without hitting the API.
  const key = _TEXT_TO_KEY[t.toLowerCase().trim()];
  if (key) {
    try {
      const res = await fetch(_staticPath(key, v));
      if (res.ok) {
        if (myGen !== _generation) { console.log('[TTS] aborted (superseded during static fetch)'); return null; }
        const arrayBuf = await res.arrayBuffer();
        if (myGen !== _generation) { console.log('[TTS] aborted (superseded after static fetch)'); return null; }
        console.log('[TTS] serving preset from static file:', key, v);
        return _decodeAndPlay(arrayBuf, myGen);
      }
      console.warn('[TTS] static file not ok, falling back to API:', res.status);
    } catch (e) {
      console.warn('[TTS] static fetch failed, falling back to API:', e);
    }
  }

  // API path — arbitrary text or static file unavailable.
  console.log('[TTS] fetching from API:', t.slice(0, 50) + (t.length > 50 ? '…' : ''));

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: t, voice: v }),
  });

  if (myGen !== _generation) {
    console.log('[TTS] aborted (superseded during API fetch)');
    return null;
  }

  console.log('[TTS] API response:', res.status, res.headers.get('content-type'));

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
  return _decodeAndPlay(arrayBuf, myGen);
}

/**
 * Play a preset ambient clip by name using the stored voice preference.
 * Fetches the pre-recorded WAV from /Voices/ directly — no API call.
 * Falls back to /api/tts if the static file is unavailable.
 * Errors are caught and logged — ambient failures are non-fatal.
 */
export async function playAmbient(clipName) {
  const text = PRESETS[clipName];
  if (!text) return;

  stopAll();
  const myGen = ++_generation;
  const voice = getVoice();

  if (!await _ensureCtx()) return null;

  const url = _staticPath(clipName, voice);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (myGen !== _generation) return null;
    const arrayBuf = await res.arrayBuffer();
    if (myGen !== _generation) return null;
    console.log('[TTS] ambient from static file:', clipName, voice);
    return _decodeAndPlay(arrayBuf, myGen);
  } catch (err) {
    console.warn('[TTS] static file failed for', clipName, '— falling back to API:', err);
    return playTTS(text).catch(e => console.warn('[TTS] ambient API fallback error:', e));
  }
}
