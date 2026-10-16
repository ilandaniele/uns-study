/**
 * Ambient sound and the end-of-phase chime, all synthesised with Web Audio: no audio files to
 * download, nothing copyrighted, and it works offline. Browser-only; every call is a no-op on SSR.
 *
 * Everything is deliberately warm: noise always goes through a lowpass (never full-band), levels
 * are conservative and the master bus has a compressor, so nothing is harsh or clips.
 */

export type AmbientKind = "rain" | "brown" | "ocean" | "fire" | "white" | "pink" | "cafe" | "wind" | "library" | "thunder" | "lofi";

export interface AmbientLayer {
  kind: AmbientKind;
  /** 0..1, relative to the master volume. */
  volume: number;
}

export const AMBIENT_KINDS: readonly AmbientKind[] = ["rain", "brown", "ocean", "fire", "white", "pink", "cafe", "wind", "library", "thunder", "lofi"];
/** The sounds that shipped before layers existed: a single one of these is the old `focus_sounds` feature. */
export const BASE_AMBIENT_KINDS: readonly AmbientKind[] = ["rain", "brown", "ocean", "fire"];
export const MAX_LAYERS = 4;

export const AMBIENT_LABEL: Record<AmbientKind, string> = {
  rain: "Lluvia",
  brown: "Ruido marrón suave",
  ocean: "Olas",
  fire: "Fogata",
  white: "Ruido blanco",
  pink: "Ruido rosa",
  cafe: "Café",
  wind: "Viento",
  library: "Biblioteca",
  thunder: "Lluvia con truenos",
  lofi: "Lofi",
};

function isKind(value: unknown): value is AmbientKind {
  return typeof value === "string" && (AMBIENT_KINDS as readonly string[]).includes(value);
}

function clamp01(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

/**
 * Turns persisted data into a valid layer list: known kinds only, unique, at most MAX_LAYERS,
 * volumes clamped. Without a `layers` array it migrates the single-sound `ambient` field of the
 * first storage format. The legacy master volume is not folded into the layer (the store keeps
 * `volume` as the master), so a migrated sound plays at exactly the loudness it had before.
 */
export function normalizeLayers(raw: unknown, legacyAmbient?: unknown, legacyVolume?: unknown): AmbientLayer[] {
  void legacyVolume;
  if (Array.isArray(raw)) {
    const out: AmbientLayer[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const { kind, volume } = item as { kind?: unknown; volume?: unknown };
      if (!isKind(kind) || out.some((l) => l.kind === kind)) continue;
      out.push({ kind, volume: clamp01(volume, 1) });
      if (out.length >= MAX_LAYERS) break;
    }
    return out;
  }
  if (raw !== undefined && raw !== null) return [];
  return isKind(legacyAmbient) ? [{ kind: legacyAmbient, volume: 1 }] : [];
}

/** Which Pro feature a sound belongs to: a lone classic sound is `focus_sounds`, anything beyond is `focus_custom`. */
export function soundFeatureFor(kind: AmbientKind, active: readonly AmbientLayer[]): "focus_sounds" | "focus_custom" {
  const others = active.filter((l) => l.kind !== kind);
  return BASE_AMBIENT_KINDS.includes(kind) && others.length === 0 ? "focus_sounds" : "focus_custom";
}

/**
 * What may actually play. Pro plays everything. A lapsed user keeps the saved layers but only the
 * first one, and only if it is a classic sound. While the plan is still loading nothing plays.
 */
export function playableLayers(layers: readonly AmbientLayer[], lock: "unknown" | "locked" | "unlocked"): AmbientLayer[] {
  if (lock === "unlocked") return [...layers];
  if (lock === "unknown") return [];
  const first = layers[0];
  return first && BASE_AMBIENT_KINDS.includes(first.kind) ? [first] : [];
}

type NoiseKind = "white" | "pink" | "brown";

const FADE_IN_TAU = 0.7; // ~2 s to settle
const FADE_OUT_TAU = 0.2; // ~0.6 s to settle
const MASTER_LEVEL = 0.5;

/** One running ambient sound: its own gain, source nodes and event timers, so layers start and stop independently. */
interface LayerHandle {
  kind: AmbientKind;
  gain: GainNode;
  nodes: AudioScheduledSourceNode[];
  timers: Set<ReturnType<typeof setTimeout>>;
  stopped: boolean;
}

let ctx: AudioContext | null = null;
let master: DynamicsCompressorNode | null = null;
let ambientBus: GainNode | null = null;
const handles = new Map<AmbientKind, LayerHandle>();
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

/** Master fader for all ambient layers, in front of the compressor. */
function ambientMaster(ac: AudioContext): GainNode {
  if (!ambientBus) {
    const g = ac.createGain();
    g.gain.value = 0;
    g.connect(bus(ac));
    ambientBus = g;
  }
  return ambientBus;
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
    if (kind === "white") {
      data[i] = white * 0.5;
    } else if (kind === "pink") {
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

function loopingNoise(ac: AudioContext, h: LayerHandle, kind: NoiseKind): AudioBufferSourceNode {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, kind);
  src.loop = true;
  // Start at a random offset so two layers of the same buffer don't phase together.
  src.start(0, Math.random() * 8);
  h.nodes.push(src);
  return src;
}

function filter(ac: AudioContext, type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** A slow sine that wobbles `param` by +-`depth` around its current value. */
function lfo(ac: AudioContext, h: LayerHandle, param: AudioParam, hz: number, depth: number): void {
  const osc = ac.createOscillator();
  osc.frequency.value = hz;
  const amount = ac.createGain();
  amount.gain.value = depth;
  osc.connect(amount).connect(param);
  osc.start();
  h.nodes.push(osc);
}

/** Calls `fn` at random intervals until this layer is stopped. */
function scheduleEvents(h: LayerHandle, minMs: number, maxMs: number, fn: () => void): void {
  const tick = () => {
    const id = setTimeout(() => {
      h.timers.delete(id);
      if (h.stopped || !ctx) return;
      fn();
      tick();
    }, minMs + Math.random() * (maxMs - minMs));
    h.timers.add(id);
  };
  tick();
}

/** Registers a one-shot node with the layer and drops it from the list once it has ended, so long sessions don't leak. */
function track(h: LayerHandle, node: AudioScheduledSourceNode): void {
  h.nodes.push(node);
  node.onended = () => {
    const i = h.nodes.indexOf(node);
    if (i >= 0) h.nodes.splice(i, 1);
  };
}

/** A short, quiet, filtered noise burst (a raindrop, a fire crackle, a page turn, a hi-hat). `at` is an absolute context time. */
function burst(
  ac: AudioContext,
  h: LayerHandle,
  out: AudioNode,
  opts: { freq: number; q: number; peak: number; dur: number; at?: number; lowpass?: number },
): void {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, "pink");
  const bp = filter(ac, "bandpass", opts.freq, opts.q);
  const lp = filter(ac, "lowpass", opts.lowpass ?? 3500);
  const g = ac.createGain();
  const t = opts.at ?? ac.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(opts.peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
  src.connect(bp).connect(lp).connect(g).connect(out);
  src.start(t, Math.random() * 8, opts.dur + 0.05);
  track(h, src);
}

/** The rain bed: a soft wash of pink noise with the top end rolled off, plus the odd quiet droplet. */
function rainChain(ac: AudioContext, h: LayerHandle, out: AudioNode): void {
  const hp = filter(ac, "highpass", 300);
  const lp = filter(ac, "lowpass", 2200);
  const shelf = filter(ac, "highshelf", 1500);
  shelf.gain.value = -9;
  const wash = ac.createGain();
  wash.gain.value = 0.7;
  loopingNoise(ac, h, "pink").connect(hp).connect(lp).connect(shelf).connect(wash).connect(out);
  scheduleEvents(h, 120, 520, () => {
    burst(ac, h, out, { freq: 1200 + Math.random() * 1600, q: 2, peak: 0.02 + Math.random() * 0.03, dur: 0.05 + Math.random() * 0.05 });
  });
}

/** A distant roll of thunder: brown noise through a low lowpass, slow swell, long decay. */
function thunderRumble(ac: AudioContext, h: LayerHandle, out: AudioNode): void {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, "brown");
  src.loop = true;
  const lp = filter(ac, "lowpass", 120 + Math.random() * 80);
  const g = ac.createGain();
  const attack = 0.5 + Math.random() * 0.5;
  const decay = 3 + Math.random() * 3;
  const peak = (0.5 + Math.random() * 0.3) * 0.7;
  const t = ac.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  src.connect(lp).connect(g).connect(out);
  src.start(t, Math.random() * 8);
  src.stop(t + attack + decay + 0.2);
  track(h, src);
}

// Chord loop in C: Cmaj7, Am7, Dm7, G7 (voiced low so it stays warm).
const LOFI_CHORDS: readonly (readonly number[])[] = [
  [130.81, 164.81, 196.0, 246.94],
  [110.0, 130.81, 164.81, 196.0],
  [146.83, 174.61, 220.0, 261.63],
  [98.0, 123.47, 146.83, 174.61],
];
const LOFI_MELODY = [523.25, 587.33, 659.25, 783.99, 880.0];
const LOFI_BPM = 72;
const LOFI_BEAT = 60 / LOFI_BPM;
const LOFI_BAR = LOFI_BEAT * 4;

/** One note: oscillator -> its own envelope -> `dest`, stopped when the envelope ends. */
function lofiNote(
  ac: AudioContext,
  h: LayerHandle,
  dest: AudioNode,
  o: { freq: number; type: OscillatorType; t: number; attack: number; dur: number; peak: number },
): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = o.type;
  osc.frequency.value = o.freq;
  osc.detune.value = (Math.random() - 0.5) * 12;
  g.gain.setValueAtTime(0, o.t);
  g.gain.linearRampToValueAtTime(o.peak, o.t + o.attack);
  g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
  osc.connect(g).connect(dest);
  osc.start(o.t);
  osc.stop(o.t + o.dur + 0.05);
  track(h, osc);
}

function lofi(ac: AudioContext, h: LayerHandle, out: AudioNode): void {
  // Warm bus for the chords and melody: everything above ~900 Hz is gone.
  const warm = filter(ac, "lowpass", 900);
  warm.connect(out);

  let bar = 0;
  const playBar = () => {
    const t0 = ac.currentTime + 0.05;
    for (const freq of LOFI_CHORDS[bar % LOFI_CHORDS.length]) {
      lofiNote(ac, h, warm, { freq, type: "triangle", t: t0, attack: 0.4, dur: LOFI_BAR + 0.25, peak: 0.06 });
    }
    // A sparse, quiet sine note on top, now and then.
    if (Math.random() < 0.6) {
      const beat = Math.floor(Math.random() * 4);
      const freq = LOFI_MELODY[Math.floor(Math.random() * LOFI_MELODY.length)];
      lofiNote(ac, h, warm, { freq, type: "sine", t: t0 + beat * LOFI_BEAT, attack: 0.05, dur: 1.4, peak: 0.025 });
    }
    // Soft kick on beats 1 and 3: a sine dropping 120 -> 45 Hz.
    for (const beat of [0, 2]) {
      const t = t0 + beat * LOFI_BEAT;
      const kick = ac.createOscillator();
      const g = ac.createGain();
      kick.type = "sine";
      kick.frequency.setValueAtTime(120, t);
      kick.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      kick.connect(g).connect(out);
      kick.start(t);
      kick.stop(t + 0.3);
      track(h, kick);
    }
    // Light hat on the off-beats.
    for (const beat of [0.5, 1.5, 2.5, 3.5]) {
      burst(ac, h, out, { freq: 7000 + Math.random() * 1000, q: 1, peak: 0.01, dur: 0.05, at: t0 + beat * LOFI_BEAT, lowpass: 9000 });
    }
    bar++;
  };
  playBar();
  scheduleEvents(h, LOFI_BAR * 1000, LOFI_BAR * 1000, playBar);

  // Vinyl crackle: tiny, sparse ticks.
  scheduleEvents(h, 40, 250, () => {
    burst(ac, h, out, { freq: 3000 + Math.random() * 1500, q: 0.7, peak: 0.005 + Math.random() * 0.01, dur: 0.008 + Math.random() * 0.012, lowpass: 8000 });
  });
}

function buildAmbient(ac: AudioContext, h: LayerHandle, out: AudioNode): void {
  switch (h.kind) {
    case "brown": {
      const lp = filter(ac, "lowpass", 500);
      loopingNoise(ac, h, "brown").connect(lp).connect(out);
      break;
    }
    case "white": {
      // Flat spectrum, but never full-band: the top is rolled off so it stays soft.
      const lp = filter(ac, "lowpass", 6000);
      const level = ac.createGain();
      level.gain.value = 0.35;
      loopingNoise(ac, h, "white").connect(lp).connect(level).connect(out);
      break;
    }
    case "pink": {
      const lp = filter(ac, "lowpass", 5000);
      const level = ac.createGain();
      level.gain.value = 0.8;
      loopingNoise(ac, h, "pink").connect(lp).connect(level).connect(out);
      break;
    }
    case "rain": {
      rainChain(ac, h, out);
      break;
    }
    case "thunder": {
      rainChain(ac, h, out);
      scheduleEvents(h, 15000, 45000, () => thunderRumble(ac, h, out));
      break;
    }
    case "ocean": {
      // Brown noise whose level and brightness swell slowly, like waves.
      const lp = filter(ac, "lowpass", 450);
      const swell = ac.createGain();
      swell.gain.value = 0.65;
      lfo(ac, h, swell.gain, 0.09 + Math.random() * 0.03, 0.3);
      lfo(ac, h, lp.frequency, 0.1, 300);
      loopingNoise(ac, h, "brown").connect(lp).connect(swell).connect(out);
      break;
    }
    case "fire": {
      const lp = filter(ac, "lowpass", 380);
      const rumble = ac.createGain();
      rumble.gain.value = 0.8;
      loopingNoise(ac, h, "brown").connect(lp).connect(rumble).connect(out);
      scheduleEvents(h, 250, 1600, () => {
        burst(ac, h, out, { freq: 900 + Math.random() * 1800, q: 1.2, peak: 0.03 + Math.random() * 0.05, dur: 0.02 + Math.random() * 0.06 });
      });
      break;
    }
    case "cafe": {
      // A low room tone plus band-passed "murmur" whose loudness drifts at random, like talk nearby.
      const room = filter(ac, "lowpass", 600);
      const roomLevel = ac.createGain();
      roomLevel.gain.value = 0.5;
      loopingNoise(ac, h, "brown").connect(room).connect(roomLevel).connect(out);
      const band = filter(ac, "bandpass", 700, 0.8);
      const lp = filter(ac, "lowpass", 1800);
      const murmur = ac.createGain();
      murmur.gain.value = 0.15;
      loopingNoise(ac, h, "pink").connect(band).connect(lp).connect(murmur).connect(out);
      scheduleEvents(h, 400, 1400, () => {
        murmur.gain.setTargetAtTime(0.05 + Math.random() * 0.3, ac.currentTime, 0.5);
        band.frequency.setTargetAtTime(500 + Math.random() * 500, ac.currentTime, 0.8);
      });
      break;
    }
    case "library": {
      // The cafe recipe, much quieter: a faint room tone, a barely-there murmur and the odd page turn.
      const room = filter(ac, "lowpass", 500);
      const roomLevel = ac.createGain();
      roomLevel.gain.value = 0.35;
      loopingNoise(ac, h, "brown").connect(room).connect(roomLevel).connect(out);
      const band = filter(ac, "bandpass", 700, 0.8);
      const lp = filter(ac, "lowpass", 1800);
      const murmur = ac.createGain();
      murmur.gain.value = 0.06;
      loopingNoise(ac, h, "pink").connect(band).connect(lp).connect(murmur).connect(out);
      scheduleEvents(h, 400, 1400, () => {
        murmur.gain.setTargetAtTime(0.04 + Math.random() * 0.08, ac.currentTime, 0.5);
        band.frequency.setTargetAtTime(500 + Math.random() * 500, ac.currentTime, 0.8);
      });
      scheduleEvents(h, 6000, 18000, () => {
        const flips = 2 + Math.floor(Math.random() * 2);
        let at = ac.currentTime;
        for (let i = 0; i < flips; i++) {
          burst(ac, h, out, { freq: 2500 + Math.random() * 1500, q: 1.5, peak: 0.012 + Math.random() * 0.01, dur: 0.08 + Math.random() * 0.07, at });
          at += 0.05 + Math.random() * 0.07;
        }
      });
      break;
    }
    case "lofi": {
      lofi(ac, h, out);
      break;
    }
    case "wind": {
      // Band-passed noise whose center and level sway slowly, like gusts.
      const band = filter(ac, "bandpass", 500, 0.9);
      const gust = ac.createGain();
      gust.gain.value = 0.55;
      lfo(ac, h, band.frequency, 0.12 + Math.random() * 0.05, 250);
      lfo(ac, h, gust.gain, 0.08 + Math.random() * 0.04, 0.3);
      loopingNoise(ac, h, "pink").connect(band).connect(gust).connect(out);
      break;
    }
  }
}

function stopHandle(ac: AudioContext, h: LayerHandle): void {
  h.stopped = true;
  for (const t of h.timers) clearTimeout(t);
  h.timers.clear();
  h.gain.gain.cancelScheduledValues(ac.currentTime);
  h.gain.gain.setTargetAtTime(0, ac.currentTime, FADE_OUT_TAU);
  const end = ac.currentTime + 0.9;
  for (const n of h.nodes) {
    try {
      n.stop(end);
    } catch {
      // already stopped
    }
  }
  setTimeout(() => h.gain.disconnect(), 1100);
}

/** Per-layer headroom: stacking sounds must not get louder than a single one. */
function layerLevel(volume: number, count: number): number {
  return volumeCurve(volume) / Math.sqrt(Math.max(1, count));
}

/**
 * Makes the playing sounds match `layers` (one gain node per layer): starts the new kinds, fades out
 * the ones that disappeared and retunes the rest. An empty list stops everything. Must first run
 * inside a user gesture (a tap), like any Web Audio start.
 */
export function setLayers(layers: readonly AmbientLayer[], masterVolume: number): void {
  if (layers.length === 0) {
    stopAmbient();
    return;
  }
  const ac = context();
  if (!ac) return;
  const out = ambientMaster(ac);
  const wanted = new Map(layers.map((l) => [l.kind, l] as const));
  for (const [kind, h] of handles) {
    if (wanted.has(kind)) continue;
    handles.delete(kind);
    stopHandle(ac, h);
  }
  for (const layer of wanted.values()) {
    const level = layerLevel(layer.volume, wanted.size);
    const existing = handles.get(layer.kind);
    if (existing) {
      existing.gain.gain.setTargetAtTime(level, ac.currentTime, 0.05);
      continue;
    }
    const gain = ac.createGain();
    gain.gain.value = 0;
    gain.connect(out);
    const h: LayerHandle = { kind: layer.kind, gain, nodes: [], timers: new Set(), stopped: false };
    handles.set(layer.kind, h);
    buildAmbient(ac, h, gain);
    // Slow fade-in instead of a hard start.
    gain.gain.setTargetAtTime(level, ac.currentTime, FADE_IN_TAU);
  }
  out.gain.setTargetAtTime(volumeCurve(masterVolume) * MASTER_LEVEL, ac.currentTime, 0.05);
}

/** Kinds currently sounding (not fading out). */
export function activeLayerKinds(): AmbientKind[] {
  return [...handles.keys()];
}

export function stopAmbient(): void {
  const ac = ctx;
  const all = [...handles.values()];
  handles.clear();
  if (!ac) return;
  for (const h of all) stopHandle(ac, h);
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
