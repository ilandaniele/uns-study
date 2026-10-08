/**
 * Ambient sound and the end-of-phase chime, all synthesised with Web Audio: no audio files to
 * download, nothing copyrighted, and it works offline. Browser-only; every call is a no-op on SSR.
 *
 * Everything is deliberately warm: noise always goes through a lowpass (never full-band), levels
 * are conservative and the master bus has a compressor, so nothing is harsh or clips.
 */

export type Ambient = "off" | "rain" | "brown" | "ocean" | "fire";

export const AMBIENT_LABEL: Record<Ambient, string> = {
  off: "Silencio",
  rain: "Lluvia",
  brown: "Ruido marrón suave",
  ocean: "Olas",
  fire: "Fogata",
};

/** Maps a persisted value (including the retired white/pink presets) onto a current preset. */
export function normalizeAmbient(value: unknown): Ambient {
  switch (value) {
    case "rain":
    case "white":
    case "pink":
      return "rain";
    case "brown":
    case "ocean":
    case "fire":
      return value;
    default:
      return "off";
  }
}

type NoiseKind = "pink" | "brown";

const FADE_IN_TAU = 0.7; // ~2 s to settle
const FADE_OUT_TAU = 0.2; // ~0.6 s to settle
const MASTER_LEVEL = 0.5;

let ctx: AudioContext | null = null;
let master: DynamicsCompressorNode | null = null;
let noiseGain: GainNode | null = null;
let ambientNodes: AudioScheduledSourceNode[] = [];
let eventTimer: ReturnType<typeof setTimeout> | null = null;
let currentAmbient: Ambient = "off";
const buffers = new Map<NoiseKind, AudioBuffer>();

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // Browsers start contexts suspended until a user gesture; resuming here is harmless otherwise.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Shared output bus: a gentle compressor so stacked sounds can never clip. */
function bus(ac: AudioContext): AudioNode {
  if (!master) {
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    comp.connect(ac.destination);
    master = comp;
  }
  return master;
}

/** Ten seconds of looping noise; pink and brown use the usual cheap filters (Voss/Kellet, leaky integrator). */
function noiseBuffer(ac: AudioContext, kind: NoiseKind): AudioBuffer {
  const cached = buffers.get(kind);
  if (cached) return cached;
  const length = ac.sampleRate * 10;
  const buf = ac.createBuffer(1, length, ac.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (kind === "pink") {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    } else {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
  }
  // Cross-fade the loop seam so it never clicks.
  const fade = Math.floor(ac.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    data[i] = data[i] * t + data[length - fade + i] * (1 - t);
  }
  buffers.set(kind, buf);
  return buf;
}

function loopingNoise(ac: AudioContext, kind: NoiseKind): AudioBufferSourceNode {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, kind);
  src.loop = true;
  // Start at a random offset so two layers of the same buffer don't phase together.
  src.start(0, Math.random() * 8);
  ambientNodes.push(src);
  return src;
}

function filter(ac: AudioContext, type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** Calls `fn` at random intervals until the ambient is stopped or switched. */
function scheduleEvents(minMs: number, maxMs: number, fn: () => void): void {
  const tick = () => {
    eventTimer = setTimeout(() => {
      if (!ctx || !noiseGain) return;
      fn();
      tick();
    }, minMs + Math.random() * (maxMs - minMs));
  };
  tick();
}

/** A short, quiet, filtered noise burst (a raindrop or a fire crackle). */
function burst(ac: AudioContext, out: AudioNode, opts: { freq: number; q: number; peak: number; dur: number }): void {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, "pink");
  const bp = filter(ac, "bandpass", opts.freq, opts.q);
  const lp = filter(ac, "lowpass", 3500);
  const g = ac.createGain();
  const t = ac.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(opts.peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
  src.connect(bp).connect(lp).connect(g).connect(out);
  src.start(t, Math.random() * 8, opts.dur + 0.05);
}

function buildAmbient(ac: AudioContext, kind: Exclude<Ambient, "off">, out: AudioNode): void {
  switch (kind) {
    case "brown": {
      const lp = filter(ac, "lowpass", 500);
      loopingNoise(ac, "brown").connect(lp).connect(out);
      break;
    }
    case "rain": {
      // Soft wash of pink noise with the top end rolled off, plus the odd quiet droplet.
      const hp = filter(ac, "highpass", 300);
      const lp = filter(ac, "lowpass", 2200);
      const shelf = filter(ac, "highshelf", 1500);
      shelf.gain.value = -9;
      const wash = ac.createGain();
      wash.gain.value = 0.7;
      loopingNoise(ac, "pink").connect(hp).connect(lp).connect(shelf).connect(wash).connect(out);
      scheduleEvents(120, 520, () => {
        burst(ac, out, { freq: 1200 + Math.random() * 1600, q: 2, peak: 0.02 + Math.random() * 0.03, dur: 0.05 + Math.random() * 0.05 });
      });
      break;
    }
    case "ocean": {
      // Brown noise whose level and brightness swell slowly, like waves.
      const lp = filter(ac, "lowpass", 450);
      const swell = ac.createGain();
      swell.gain.value = 0.65;
      const lfo = ac.createOscillator();
      lfo.frequency.value = 0.09 + Math.random() * 0.03;
      const depthGain = ac.createGain();
      depthGain.gain.value = 0.3;
      const depthFreq = ac.createGain();
      depthFreq.gain.value = 300;
      lfo.connect(depthGain).connect(swell.gain);
      lfo.connect(depthFreq).connect(lp.frequency);
      lfo.start();
      ambientNodes.push(lfo);
      loopingNoise(ac, "brown").connect(lp).connect(swell).connect(out);
      break;
    }
    case "fire": {
      const lp = filter(ac, "lowpass", 380);
      const rumble = ac.createGain();
      rumble.gain.value = 0.8;
      loopingNoise(ac, "brown").connect(lp).connect(rumble).connect(out);
      scheduleEvents(250, 1600, () => {
        burst(ac, out, { freq: 900 + Math.random() * 1800, q: 1.2, peak: 0.03 + Math.random() * 0.05, dur: 0.02 + Math.random() * 0.06 });
      });
      break;
    }
  }
}

/** Starts, switches or stops the ambient sound. Must first run inside a user gesture (a tap). */
export function setAmbient(kind: Ambient, volume: number): void {
  const ac = context();
  if (!ac) return;
  if (kind === currentAmbient && noiseGain) {
    setAmbientVolume(volume);
    return;
  }
  stopAmbient();
  currentAmbient = kind;
  if (kind === "off") return;
  const gain = ac.createGain();
  gain.gain.value = 0;
  gain.connect(bus(ac));
  noiseGain = gain;
  buildAmbient(ac, kind, gain);
  // Slow fade-in instead of a hard start.
  gain.gain.setTargetAtTime(volumeCurve(volume) * MASTER_LEVEL, ac.currentTime, FADE_IN_TAU);
}

export function setAmbientVolume(volume: number): void {
  if (!ctx || !noiseGain) return;
  noiseGain.gain.setTargetAtTime(volumeCurve(volume) * MASTER_LEVEL, ctx.currentTime, 0.05);
}

export function stopAmbient(): void {
  const ac = ctx;
  const gain = noiseGain;
  const nodes = ambientNodes;
  if (eventTimer) clearTimeout(eventTimer);
  eventTimer = null;
  noiseGain = null;
  ambientNodes = [];
  currentAmbient = "off";
  if (!ac || !gain) return;
  gain.gain.cancelScheduledValues(ac.currentTime);
  gain.gain.setTargetAtTime(0, ac.currentTime, FADE_OUT_TAU);
  const end = ac.currentTime + 0.9;
  for (const n of nodes) {
    try {
      n.stop(end);
    } catch {
      // already stopped
    }
  }
  setTimeout(() => gain.disconnect(), 1100);
}

/** Perceptual volume: the slider is linear, loudness is not. */
function volumeCurve(v: number): number {
  const x = Math.min(1, Math.max(0, v));
  return x * x;
}

/** Plays soft marimba-like notes: sine fundamental plus quick-decaying upper partials, lowpassed. */
function playNotes(
  ac: AudioContext,
  notes: number[],
  opts: { gap: number; peak: number; decay: number; partials: readonly (readonly [number, number, number])[]; echo?: boolean },
): void {
  const out = bus(ac);
  const lp = filter(ac, "lowpass", 3000);
  let dest: AudioNode = out;
  if (opts.echo) {
    // A tiny feedback delay for a hint of room.
    const delay = ac.createDelay(0.5);
    delay.delayTime.value = 0.13;
    const fb = ac.createGain();
    fb.gain.value = 0.3;
    const wet = ac.createGain();
    wet.gain.value = 0.22;
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(out);
    lp.connect(delay);
  }
  lp.connect(dest);
  dest = lp;
  notes.forEach((freq, i) => {
    const t = ac.currentTime + 0.02 + i * opts.gap;
    for (const [mult, amp, decayMult] of opts.partials) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(opts.peak * amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + opts.decay * decayMult);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + opts.decay * decayMult + 0.05);
    }
  });
}

// [frequency multiple, amplitude, decay multiple]: upper partials die away much faster.
const MARIMBA_PARTIALS = [[1, 1, 1], [4, 0.12, 0.25], [10, 0.04, 0.1]] as const;

/**
 * A soft marimba/kalimba-like chime. Rising pentatonic for "back to focus", falling for "take a
 * break", so the sound itself says which phase starts.
 */
export function playChime(kind: "break" | "focus", volume = 0.7): void {
  const ac = context();
  if (!ac) return;
  const notes = kind === "break" ? [783.99, 659.25, 523.25] : [523.25, 659.25, 783.99];
  playNotes(ac, notes, {
    gap: 0.18,
    peak: 0.15 * Math.max(0.15, Math.min(1, volume)),
    decay: 1.3,
    partials: MARIMBA_PARTIALS,
    echo: true,
  });
}

/** Unlocks audio on iOS/Safari: call from the first tap so later chimes can play. */
export function primeAudio(): void {
  context();
}

/**
 * Short soft rising two-note blip for an incoming private message. Quieter and shorter than
 * `playChime`. No-op unless a context already exists and is running (primed by an earlier
 * gesture): it never creates or resumes one itself, so it can't trip autoplay policies.
 */
export function playDmBlip(volume = 0.5): void {
  const ac = ctx;
  if (!ac || ac.state !== "running") return;
  playNotes(ac, [660, 990], {
    gap: 0.09,
    peak: 0.1 * Math.max(0.15, Math.min(1, volume)),
    decay: 0.4,
    partials: [[1, 1, 1], [4, 0.06, 0.25]],
  });
}
