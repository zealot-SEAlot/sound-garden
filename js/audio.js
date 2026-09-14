/* Sound: shared helpers, scales and the pitch grid, instrument voices, and the audio graph. */

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const SCALES = {
  'Major pentatonic': [0, 2, 4, 7, 9],
  'Minor pentatonic': [0, 3, 5, 7, 10],
  'Dreamy lydian': [0, 2, 4, 6, 7, 9, 11],
  'Japanese in': [0, 1, 5, 7, 8],
};
const BASE_MIDI = 48;          // C3
const OCTAVES = 3;
const DEFAULT_VOLUME = 80;

let scaleName = Object.keys(SCALES)[0];
let volumeLevel = DEFAULT_VOLUME;
let audio = null;              // built on the first click: browsers only allow sound after the user interacts

const rowCount = () => SCALES[scaleName].length * OCTAVES;
const rowIndex = (yFrac) => clamp(Math.floor(yFrac * rowCount()), 0, rowCount() - 1);
const snapY = (yFrac) => (rowIndex(yFrac) + 0.5) / rowCount();
const volumeGain = (level) => (level / 100) ** 2;   // squared so the slider feels even to the ear

function midiFor(yFrac) {
  const steps = SCALES[scaleName];
  const idx = rowCount() - 1 - rowIndex(yFrac);     // top row is the highest note
  return BASE_MIDI + 12 * Math.floor(idx / steps.length) + steps[idx % steps.length];
}

/* ---------- instrument voices ---------- */
function envelope(ac, dest, t, { attack, peak, decay }) {
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  gain.connect(dest);
  return gain;
}

function tone(ac, dest, { type, freq, start, stop, level = 1 }) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = level;
  osc.connect(gain).connect(dest);
  osc.start(start);
  osc.stop(stop);
  return osc;
}

// Each colour is its own instrument; petal count differs too so flowers are distinguishable without colour.
const INSTRUMENTS = {
  bell: {
    label: 'Bell', hue: 48, petals: 5,
    play(ac, out, freq, t) {
      const env = envelope(ac, out, t, { attack: 0.005, peak: 0.18, decay: 2.2 });
      [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([mult, level]) =>
        tone(ac, env, { type: 'sine', freq: freq * mult, start: t, stop: t + 2.3, level }));
    },
  },
  marimba: {
    label: 'Marimba', hue: 345, petals: 6,
    play(ac, out, freq, t) {
      const body = envelope(ac, out, t, { attack: 0.003, peak: 0.3, decay: 0.55 });
      tone(ac, body, { type: 'sine', freq, start: t, stop: t + 0.6 });
      const knock = envelope(ac, out, t, { attack: 0.002, peak: 0.08, decay: 0.08 });
      tone(ac, knock, { type: 'sine', freq: freq * 4, start: t, stop: t + 0.1 });
    },
  },
  harp: {
    label: 'Harp', hue: 172, petals: 7,
    play(ac, out, freq, t) {
      const env = envelope(ac, out, t, { attack: 0.004, peak: 0.12, decay: 1.2 });
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 2;
      filter.frequency.setValueAtTime(freq * 8, t);
      filter.frequency.exponentialRampToValueAtTime(freq * 1.2, t + 0.8);
      filter.connect(env);
      tone(ac, filter, { type: 'sawtooth', freq, start: t, stop: t + 1.3 });
    },
  },
  flute: {
    label: 'Flute', hue: 265, petals: 8,
    play(ac, out, freq, t) {
      const env = envelope(ac, out, t, { attack: 0.12, peak: 0.16, decay: 1.4 });
      const osc = tone(ac, env, { type: 'triangle', freq, start: t, stop: t + 1.6 });
      const vibrato = ac.createOscillator();
      const depth = ac.createGain();
      vibrato.frequency.value = 5;
      depth.gain.value = freq * 0.006;
      vibrato.connect(depth).connect(osc.frequency);
      vibrato.start(t);
      vibrato.stop(t + 1.6);
    },
  },
  piano: {
    label: 'Piano', hue: 212, petals: 4,
    play(ac, out, freq, t) {
      const env = envelope(ac, out, t, { attack: 0.004, peak: 0.2, decay: 1.8 });
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(freq * 12, 16000), t);
      filter.frequency.exponentialRampToValueAtTime(freq * 2.5, t + 1.2);   // bright hammer strike that mellows
      filter.connect(env);
      [[1, 1], [2, 0.4], [3, 0.15], [4, 0.08]].forEach(([mult, level]) =>
        tone(ac, filter, { type: 'triangle', freq: freq * mult, start: t, stop: t + 1.9, level }));
    },
  },
  kalimba: {
    label: 'Kalimba', hue: 122, petals: 3,
    play(ac, out, freq, t) {
      const tine = envelope(ac, out, t, { attack: 0.002, peak: 0.26, decay: 1.1 });
      tone(ac, tine, { type: 'sine', freq, start: t, stop: t + 1.2 });
      const ping = envelope(ac, out, t, { attack: 0.001, peak: 0.07, decay: 0.12 });
      tone(ac, ping, { type: 'sine', freq: freq * 5.4, start: t, stop: t + 0.15 });   // metallic overtone of the tine
    },
  },
  strings: {
    label: 'Strings', hue: 300, petals: 9,
    play(ac, out, freq, t) {
      const env = envelope(ac, out, t, { attack: 0.22, peak: 0.24, decay: 1.8 });
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = Math.min(freq * 4, 8000);
      filter.Q.value = 0.5;
      filter.connect(env);
      [-7, 7].forEach((cents) => {
        const osc = tone(ac, filter, { type: 'sawtooth', freq, start: t, stop: t + 2.1, level: 0.6 });
        osc.detune.value = cents;   // two slightly detuned voices give an ensemble shimmer
      });
    },
  },
  bass: {
    label: 'Bass', hue: 85, petals: 10,
    play(ac, out, freq, t) {
      const low = freq / 2;   // sounds an octave below its row, for bass lines
      const env = envelope(ac, out, t, { attack: 0.006, peak: 0.3, decay: 0.8 });
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 3;
      filter.frequency.setValueAtTime(low * 8, t);
      filter.frequency.exponentialRampToValueAtTime(low * 1.5, t + 0.4);
      filter.connect(env);
      tone(ac, filter, { type: 'triangle', freq: low, start: t, stop: t + 0.9 });
      tone(ac, filter, { type: 'square', freq: low, start: t, stop: t + 0.9, level: 0.25 });
    },
  },
};
const INSTRUMENT_NAMES = Object.keys(INSTRUMENTS);
const DEFAULT_INSTRUMENT = INSTRUMENT_NAMES[0];

/* ---------- audio graph ---------- */
// voices -> (dry + echo) -> limiter -> volume -> speakers.
// Recordings tap the limiter, so they ignore the volume slider; the limiter stops many simultaneous notes from clipping.
function buildAudioGraph() {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const voices = ac.createGain();
  voices.gain.value = 0.5;
  const delay = ac.createDelay(1);
  delay.delayTime.value = 0.33;
  const feedback = ac.createGain();
  feedback.gain.value = 0.35;
  const wet = ac.createGain();
  wet.gain.value = 0.3;
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  const volume = ac.createGain();
  volume.gain.value = volumeGain(volumeLevel);
  voices.connect(limiter);
  voices.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(wet).connect(limiter);
  limiter.connect(volume).connect(ac.destination);
  return { ac, voices, mix: limiter, volume };
}

function ensureAudio() {
  if (!audio) audio = buildAudioGraph();
  if (audio.ac.state === 'suspended') audio.ac.resume();
}

function setOutputVolume(level) {
  if (audio) audio.volume.gain.setTargetAtTime(volumeGain(level), audio.ac.currentTime, 0.03);
}

/* ---------- per-garden channels ---------- */
// Each garden plays through its own gain node, so muting silences notes that are still ringing, not just new ones.
const MUTE_RAMP_SECONDS = 0.03;
const gardenBuses = new Map();   // garden id -> GainNode

function gardenBus(garden) {
  let bus = gardenBuses.get(garden.id);
  if (!bus) {
    bus = audio.ac.createGain();
    bus.gain.value = garden.muted ? 0 : 1;
    bus.connect(audio.voices);
    gardenBuses.set(garden.id, bus);
  }
  return bus;
}

function setGardenMuted(garden) {
  if (audio) gardenBus(garden).gain.setTargetAtTime(garden.muted ? 0 : 1, audio.ac.currentTime, MUTE_RAMP_SECONDS);
}

function playNote(f, garden = null) {
  if (!audio) return;
  const { ac, voices } = audio;
  const panner = ac.createStereoPanner();
  panner.pan.value = clamp(f.x * 2 - 1, -1, 1);
  panner.connect(garden ? gardenBus(garden) : voices);   // instrument previews have no garden
  const freq = 440 * 2 ** ((midiFor(f.y) - 69) / 12);
  INSTRUMENTS[f.instrument].play(ac, panner, freq, ac.currentTime);
}
