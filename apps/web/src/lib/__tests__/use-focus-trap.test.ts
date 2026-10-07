import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Node environment: React hooks are replaced by a minimal runner and the DOM by tiny fakes.
let cleanups: (() => void)[] = [];
vi.mock("react", () => ({
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: (fn: () => void | (() => void)) => {
    const cleanup = fn();
    if (cleanup) cleanups.push(cleanup);
  },
}));

import { useFocusTrap } from "../useFocusTrap";

type Listener = (e: unknown) => void;

const doc: { activeElement: unknown; listeners: Record<string, Listener[]> } = { activeElement: null, listeners: {} };
function makeEl(name: string) {
  const self: Record<string, unknown> = { name };
  self.focus = vi.fn(() => {
    doc.activeElement = self;
  });
  return self as unknown as HTMLElement;
}

function makePanel(items: HTMLElement[]) {
  const panel = makeEl("panel") as unknown as Record<string, unknown>;
  panel.querySelector = () => items[0] ?? null;
  panel.querySelectorAll = () => items;
  panel.contains = (n: unknown) => n === panel || items.includes(n as HTMLElement);
  return panel as unknown as HTMLElement;
}

function press(key: string, shiftKey = false) {
  const e = { key, shiftKey, preventDefault: vi.fn() };
  for (const l of doc.listeners.keydown ?? []) l(e);
  return e;
}

beforeEach(() => {
  cleanups = [];
  doc.listeners = {};
  vi.stubGlobal("document", {
    get activeElement() {
      return doc.activeElement;
    },
    addEventListener: (t: string, l: Listener) => (doc.listeners[t] ??= []).push(l),
    removeEventListener: (t: string, l: Listener) => {
      doc.listeners[t] = (doc.listeners[t] ?? []).filter((x) => x !== l);
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("useFocusTrap", () => {
  it("focuses the first item on mount and wraps Tab / Shift+Tab", () => {
    const a = makeEl("a");
    const b = makeEl("b");
    const panel = makePanel([a, b]);
    useFocusTrap({ current: panel });
    expect(doc.activeElement).toBe(a);

    const back = press("Tab", true);
    expect(back.preventDefault).toHaveBeenCalled();
    expect(doc.activeElement).toBe(b);

    const fwd = press("Tab");
    expect(fwd.preventDefault).toHaveBeenCalled();
    expect(doc.activeElement).toBe(a);
  });

  it("does not intercept Tab in the middle of the panel", () => {
    const a = makeEl("a");
    const b = makeEl("b");
    const c = makeEl("c");
    useFocusTrap({ current: makePanel([a, b, c]) });
    (b.focus as () => void)();
    expect(press("Tab").preventDefault).not.toHaveBeenCalled();
  });

  it("calls onEscape on Escape only when provided", () => {
    const onEscape = vi.fn();
    useFocusTrap({ current: makePanel([makeEl("a")]) }, { onEscape });
    expect(press("Escape").preventDefault).toHaveBeenCalled();
    expect(onEscape).toHaveBeenCalledTimes(1);
    cleanups.forEach((c) => c());

    cleanups = [];
    useFocusTrap({ current: makePanel([makeEl("a")]) });
    expect(press("Escape").preventDefault).not.toHaveBeenCalled();
  });

  it("focuses initialFocus and restores previous focus on unmount", () => {
    const previous = makeEl("trigger");
    (previous.focus as () => void)();
    const a = makeEl("a");
    const cancel = makeEl("cancel");
    useFocusTrap({ current: makePanel([a, cancel]) }, { initialFocus: { current: cancel } });
    expect(doc.activeElement).toBe(cancel);

    cleanups.forEach((c) => c());
    expect(doc.activeElement).toBe(previous);
    expect(doc.listeners.keydown).toHaveLength(0);
  });

  it("does nothing while inactive", () => {
    useFocusTrap({ current: makePanel([makeEl("a")]) }, { active: false });
    expect(doc.listeners.keydown ?? []).toHaveLength(0);
  });
});
