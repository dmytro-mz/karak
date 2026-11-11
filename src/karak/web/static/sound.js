// Sound effects, all synthesised with WebAudio (no audio files).

let ctx = null;
let out = null;
let muted = localStorage.getItem("karak.muted") === "1";
let volume = Number(localStorage.getItem("karak.volume") ?? 0.8);
let noiseBuffer = null;
const BOOST = 5;

export const isMuted = () => muted;
export const getVolume = () => volume;

export function setMuted(value) {
  muted = value;
  localStorage.setItem("karak.muted", value ? "1" : "0");
}

export function setVolume(value) {
  volume = Math.min(1, Math.max(0, value));
  localStorage.setItem("karak.volume", String(volume));
  if (out) out.gain.setTargetAtTime(volume * BOOST, ctx.currentTime, 0.02);
}

// Browsers only start audio after a user gesture.
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 12;
    out = ctx.createGain();
    out.gain.value = volume * BOOST;
    out.connect(limiter).connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
}

const ready = () => !muted && volume > 0 && ctx && ctx.state === "running";

function tone(freq, dur, { type = "sine", gain = 0.06, at = 0, slide = 0 } = {}) {
  if (!ready()) return;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(dur, { gain = 0.06, at = 0, freq = 2500, q = 0.9, slide = 0, type = "bandpass" } = {}) {
  if (!ready()) return;
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t);
  if (slide) filter.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  filter.Q.value = q;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(amp).connect(out);
  src.start(t);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  step: () => noise(0.07, { gain: 0.05, freq: 380, q: 1.5 }),
  tile: () => {
    noise(0.12, { gain: 0.1, freq: 260, q: 0.8 });
    tone(90, 0.12, { type: "triangle", gain: 0.05 });
  },
  draw: () => noise(0.14, { gain: 0.05, freq: 1800, slide: 0.5 }),
  dice: () => {
    for (let i = 0; i < 7; i++) noise(0.035, { gain: 0.09, freq: 2400 + Math.random() * 1600, q: 4, at: i * 0.06 + Math.random() * 0.02 });
    noise(0.06, { gain: 0.08, freq: 1400, q: 3, at: 0.48 });
  },
  growl: (big = false) => {
    noise(big ? 1.3 : 0.6, { gain: big ? 0.16 : 0.09, freq: big ? 180 : 320, q: 2, slide: big ? 0.6 : 0.7, type: "lowpass" });
    tone(big ? 70 : 110, big ? 1.2 : 0.5, { type: "sawtooth", gain: big ? 0.05 : 0.025, slide: 0.7 });
  },
  clash: () => {
    tone(1900, 0.35, { type: "triangle", gain: 0.05, slide: 0.98 });
    tone(2730, 0.28, { type: "triangle", gain: 0.035 });
    noise(0.12, { gain: 0.09, freq: 5200, q: 2 });
  },
  win: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.22, { type: "triangle", gain: 0.06, at: i * 0.09 })),
  hurt: () => {
    tone(220, 0.35, { type: "sawtooth", gain: 0.05, slide: 0.5 });
    noise(0.15, { gain: 0.09, freq: 600 });
  },
  tie: () => [440, 440].forEach((f, i) => tone(f, 0.14, { type: "square", gain: 0.03, at: i * 0.16 })),
  loot: () => [1046, 1318, 1568].forEach((f, i) => tone(f, 0.12, { type: "sine", gain: 0.05, at: i * 0.06 })),
  coins: () => {
    for (let i = 0; i < 8; i++) tone(2000 + Math.random() * 1800, 0.09, { type: "triangle", gain: 0.03, at: i * 0.05 });
  },
  heal: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, { type: "sine", gain: 0.04, at: i * 0.08 })),
  curse: () => {
    tone(196, 0.9, { type: "sawtooth", gain: 0.03, slide: 0.8 });
    tone(207, 0.9, { type: "sawtooth", gain: 0.03, slide: 0.8 });
  },
  portal: () => tone(300, 0.5, { type: "sine", gain: 0.06, slide: 3 }),
  turn: () => [659, 880].forEach((f, i) => tone(f, 0.18, { type: "triangle", gain: 0.06, at: i * 0.12 })),
  fanfare: () => [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.26, { type: "triangle", gain: 0.06, at: i * 0.12 })),
  lose: () => [392, 349, 311, 262].forEach((f, i) => tone(f, 0.32, { type: "triangle", gain: 0.05, at: i * 0.18 })),
  tick: () => tone(1250, 0.03, { type: "square", gain: 0.018 }),
  error: () => tone(170, 0.16, { type: "sawtooth", gain: 0.03 }),
  chat: () => tone(880, 0.07, { gain: 0.03 }),
};
