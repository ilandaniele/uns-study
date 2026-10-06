/**
 * Ambient noise and the end-of-phase chime, all synthesised with Web Audio: no audio files to
 * download, nothing copyrighted, and it works offline. Browser-only; every call is a no-op on SSR.
 */

export type Ambient = "off" | "white" | "pink" | "brown";

export const AMBIENT_LABEL: Record<Ambient, string> = {
  off: "Silencio",
  white: "Ruido blanco",
  pink: "Ruido rosa",
  brown: "Ruido marrón",
};

let ctx: AudioContext | null = null;
let noiseSource: AudioBufferSourceNode | null = null;
let noiseGain: GainNode | null = null;
let currentAmbient: Ambient = "off";
const buffers = new Map<Ambient, AudioBuffer>();

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

/** Ten seconds of looping noise; pink and brown use the usual cheap filters (Voss/Kellet, leaky integrator). */
function noiseBuffer(ac: AudioContext, kind: Exclude<Ambient, "off">): AudioBuffer {
  const cached = buffers.get(kind);
  if (cached) return cached;
  const length = ac.sampleRate * 10;
  const buf = ac.createBuffer(1, length, ac.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (kind === "white") {
      data[i] = white * 0.35;
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

/** Starts, switches or stops the ambient noise. Must first run inside a user gesture (a tap). */
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
  gain.connect(ac.destination);
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, kind);
  src.loop = true;
  src.connect(gain);
  src.start();
  // Fade in over ~0.6 s instead of a hard start.
  gain.gain.setTargetAtTime(volumeCurve(volume), ac.currentTime, 0.2);
  noiseSource = src;
  noiseGain = gain;
}

export function setAmbientVolume(volume: number): void {
  if (!ctx || !noiseGain) return;
  noiseGain.gain.setTargetAtTime(volumeCurve(volume), ctx.currentTime, 0.05);
}

export function stopAmbient(): void {
  const ac = ctx;
  const src = noiseSource;
  const gain = noiseGain;
  noiseSource = null;
  noiseGain = null;
  currentAmbient = "off";
  if (!ac || !src || !gain) return;
  gain.gain.setTargetAtTime(0, ac.currentTime, 0.08);
  src.stop(ac.currentTime + 0.4);
}

/** Perceptual volume: the slider is linear, loudness is not. */
function volumeCurve(v: number): number {
  const x = Math.min(1, Math.max(0, v));
  return x * x;
}

/**
 * A soft two-note chime (a bell-like sine with a fifth above and a slow decay). Rising for
 * "back to focus", falling for "take a break", so the sound itself says which phase starts.
 */
export function playChime(kind: "break" | "focus", volume = 0.7): void {
  const ac = context();
  if (!ac) return;
  const notes = kind === "break" ? [784, 523.25] : [523.25, 784];
  const peak = 0.28 * Math.max(0.15, Math.min(1, volume));
  notes.forEach((freq, i) => {
    const t = ac.currentTime + i * 0.28;
    for (const [mult, amp] of [[1, 1], [2.01, 0.18], [3.0, 0.06]] as const) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak * amp, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      osc.connect(g).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 1.9);
    }
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
  const peak = 0.12 * Math.max(0.15, Math.min(1, volume));
  [880, 1318.5].forEach((freq, i) => {
    const t = ac.currentTime + i * 0.09;
    for (const [mult, amp] of [[1, 1], [2, 0.08]] as const) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak * amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      osc.connect(g).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    }
  });
}
