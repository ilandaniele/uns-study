/* eslint-disable react-hooks/rules-of-hooks -- hook harness calls the hook outside a component on purpose */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The suite runs in a node environment without a DOM renderer, so React's hooks are replaced by a
// minimal single-instance harness: state cells and refs persist across calls, effects run on demand.
const h = vi.hoisted(() => ({
  cells: [] as unknown[],
  cleanups: [] as Array<() => void>,
  idx: 0,
}));

vi.mock("react", () => ({
  useState: <T,>(init: T) => {
    const i = h.idx++;
    if (!(i in h.cells)) h.cells[i] = init;
    return [h.cells[i] as T, (v: T) => void (h.cells[i] = v)] as const;
  },
  useRef: <T,>(init: T) => {
    const i = h.idx++;
    if (!(i in h.cells)) h.cells[i] = { current: init };
    return h.cells[i] as { current: T };
  },
  useCallback: <T,>(fn: T) => fn,
  useEffect: (fn: () => void | (() => void), deps?: unknown[]) => {
    const i = h.idx++;
    if (deps && i in h.cells) return; // mount-only effect already ran
    h.cells[i] = true;
    const cleanup = fn();
    if (cleanup && deps) h.cleanups.push(cleanup);
  },
}));

import { useExitTransition } from "../useExitTransition";

function mount(onClose: () => void, duration?: number) {
  h.idx = 0;
  return useExitTransition(onClose, duration);
}

describe("useExitTransition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.cells = [];
    h.cleanups = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("flags closing immediately and calls onClose after the duration", () => {
    const onClose = vi.fn();
    mount(onClose).requestClose();
    expect(mount(onClose).closing).toBe(true);
    vi.advanceTimersByTime(139);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets after closing so a persistent component can reopen", () => {
    const onClose = vi.fn();
    mount(onClose).requestClose();
    vi.advanceTimersByTime(140);
    expect(mount(onClose).closing).toBe(false);
    mount(onClose).requestClose();
    vi.advanceTimersByTime(140);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("ignores a second request while closing", () => {
    const onClose = vi.fn();
    const first = mount(onClose);
    first.requestClose();
    first.requestClose();
    vi.advanceTimersByTime(500);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls the latest onClose", () => {
    const a = vi.fn();
    const b = vi.fn();
    mount(a).requestClose();
    mount(b);
    vi.advanceTimersByTime(140);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("honours a custom duration and clears the timer on unmount", () => {
    const onClose = vi.fn();
    mount(onClose, 300).requestClose();
    vi.advanceTimersByTime(299);
    expect(onClose).not.toHaveBeenCalled();
    h.cleanups.forEach((c) => c());
    vi.advanceTimersByTime(1000);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancelClose mid-close clears closing and never calls onClose", () => {
    const onClose = vi.fn();
    mount(onClose).requestClose();
    vi.advanceTimersByTime(70);
    mount(onClose).cancelClose();
    expect(mount(onClose).closing).toBe(false);
    vi.advanceTimersByTime(500);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancelClose when not closing is a no-op", () => {
    const onClose = vi.fn();
    mount(onClose).cancelClose();
    expect(mount(onClose).closing).toBe(false);
    vi.advanceTimersByTime(500);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("requestClose works again after a cancel", () => {
    const onClose = vi.fn();
    mount(onClose).requestClose();
    mount(onClose).cancelClose();
    mount(onClose).requestClose();
    expect(mount(onClose).closing).toBe(true);
    vi.advanceTimersByTime(140);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
