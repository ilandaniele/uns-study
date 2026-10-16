import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_LAYERS, activeLayerKinds, normalizeLayers, playableLayers, setLayers, soundFeatureFor, stopAmbient, type AmbientKind } from "./focus-audio";

describe("normalizeLayers", () => {
  it("migrates the legacy single ambient into one full-volume layer", () => {
    expect(normalizeLayers(undefined, "rain", 0.3)).toEqual([{ kind: "rain", volume: 1 }]);
    expect(normalizeLayers(undefined, "brown")).toEqual([{ kind: "brown", volume: 1 }]);
  });

  it("maps legacy white and pink to the real kinds", () => {
    expect(normalizeLayers(undefined, "white")).toEqual([{ kind: "white", volume: 1 }]);
    expect(normalizeLayers(undefined, "pink")).toEqual([{ kind: "pink", volume: 1 }]);
  });

  it("gives no layers for off, unknown or garbage", () => {
    expect(normalizeLayers(undefined, "off")).toEqual([]);
    expect(normalizeLayers(undefined, "jazz")).toEqual([]);
    expect(normalizeLayers(undefined, 3)).toEqual([]);
    expect(normalizeLayers("nope", "rain")).toEqual([]);
    expect(normalizeLayers([null, 4, { kind: "x" }, { volume: 1 }])).toEqual([]);
  });

  it("prefers an existing layers array over the legacy field", () => {
    expect(normalizeLayers([{ kind: "cafe", volume: 0.4 }], "rain")).toEqual([{ kind: "cafe", volume: 0.4 }]);
    expect(normalizeLayers([], "rain")).toEqual([]);
  });

  it("removes duplicates, clamps volume and caps the count", () => {
    expect(
      normalizeLayers([
        { kind: "rain", volume: 2 },
        { kind: "rain", volume: 0.1 },
        { kind: "wind", volume: -1 },
        { kind: "fire", volume: "x" },
      ]),
    ).toEqual([
      { kind: "rain", volume: 1 },
      { kind: "wind", volume: 0 },
      { kind: "fire", volume: 1 },
    ]);
    const many = (["rain", "brown", "ocean", "fire", "white", "pink"] as const).map((kind) => ({ kind, volume: 1 }));
    expect(normalizeLayers(many)).toHaveLength(MAX_LAYERS);
  });
});

describe("gating helpers", () => {
  const rain = { kind: "rain" as const, volume: 1 };
  const cafe = { kind: "cafe" as const, volume: 1 };

  it("a lone classic sound is focus_sounds, everything else focus_custom", () => {
    expect(soundFeatureFor("rain", [])).toBe("focus_sounds");
    expect(soundFeatureFor("cafe", [])).toBe("focus_custom");
    expect(soundFeatureFor("fire", [rain])).toBe("focus_custom");
  });

  it("lapsed plans keep only the first classic layer", () => {
    expect(playableLayers([rain, cafe], "unlocked")).toEqual([rain, cafe]);
    expect(playableLayers([rain, cafe], "locked")).toEqual([rain]);
    expect(playableLayers([cafe, rain], "locked")).toEqual([]);
    expect(playableLayers([rain], "unknown")).toEqual([]);
  });
});

// A minimal Web Audio double: enough to build the graphs and count nodes.
class FakeNode {
  targets: FakeNode[] = [];
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  delayTime = new FakeParam();
  type = "";
  buffer: unknown = null;
  loop = false;
  detune = new FakeParam();
  onended: (() => void) | null = null;
  constructor(readonly kind: string) {}
  connect(t: FakeNode) {
    this.targets.push(t);
    return t;
  }
  disconnect() {}
  start() {}
  stop() {}
}
class FakeParam {
  value = 0;
  setValueAtTime() {}
  setTargetAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
  cancelScheduledValues() {}
}
const made: FakeNode[] = [];
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  sampleRate = 800;
  destination = new FakeNode("destination");
  resume() {}
  private make(kind: string) {
    const n = new FakeNode(kind);
    made.push(n);
    return n;
  }
  createGain() {
    return this.make("gain");
  }
  createDynamicsCompressor() {
    return this.make("compressor");
  }
  createBiquadFilter() {
    return this.make("filter");
  }
  createBufferSource() {
    return this.make("source");
  }
  createOscillator() {
    return this.make("osc");
  }
  createDelay() {
    return this.make("delay");
  }
  createBuffer(_c: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
}

describe("setLayers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as unknown as { window: unknown }).window = { AudioContext: FakeAudioContext };
  });
  afterEach(() => {
    stopAmbient();
    vi.runAllTimers();
    vi.useRealTimers();
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  /** Gains wired straight into the ambient master fader: one per layer. */
  function layerGains(): FakeNode[] {
    const masterFader = made.find((n) => n.kind === "gain" && n.targets.some((t) => t.kind === "compressor"));
    return made.filter((n) => n.kind === "gain" && masterFader && n.targets.includes(masterFader));
  }

  it("creates one layer gain per layer and diffs on update", () => {
    made.length = 0;
    const kinds: AmbientKind[] = ["rain", "cafe", "wind"];
    setLayers(kinds.map((kind) => ({ kind, volume: 1 })), 0.5);
    expect(activeLayerKinds()).toEqual(kinds);
    expect(layerGains()).toHaveLength(3);

    // Dropping one and adding another only builds the new one.
    setLayers([{ kind: "rain", volume: 0.5 }, { kind: "fire", volume: 1 }], 0.5);
    expect(activeLayerKinds().sort()).toEqual(["fire", "rain"]);
    expect(layerGains()).toHaveLength(4);
  });

  it("builds every kind without throwing and stops on an empty list", () => {
    setLayers([{ kind: "white", volume: 1 }, { kind: "pink", volume: 1 }, { kind: "brown", volume: 1 }, { kind: "ocean", volume: 1 }], 1);
    expect(activeLayerKinds()).toHaveLength(4);
    setLayers([], 1);
    expect(activeLayerKinds()).toEqual([]);
  });

  it("builds library, thunder and lofi, and leaves no timer behind once stopped", () => {
    const before = vi.getTimerCount();
    const gainsBefore = layerGains().length;
    setLayers([{ kind: "library", volume: 1 }, { kind: "thunder", volume: 1 }, { kind: "lofi", volume: 1 }], 1);
    expect(activeLayerKinds()).toEqual(["library", "thunder", "lofi"]);
    expect(layerGains()).toHaveLength(gainsBefore + 3);
    vi.advanceTimersByTime(60_000);
    setLayers([], 1);
    expect(activeLayerKinds()).toEqual([]);
    vi.runAllTimers();
    expect(vi.getTimerCount()).toBe(before);
  });
});

describe("new sounds", () => {
  it("are custom-mix sounds, locked for lapsed plans, and volume is clamped", () => {
    expect(soundFeatureFor("lofi", [])).toBe("focus_custom");
    expect(soundFeatureFor("library", [])).toBe("focus_custom");
    expect(playableLayers([{ kind: "thunder", volume: 1 }], "locked")).toEqual([]);
    expect(normalizeLayers([{ kind: "library", volume: 2 }])).toEqual([{ kind: "library", volume: 1 }]);
  });
});
