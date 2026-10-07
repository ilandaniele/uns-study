"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal focus management: focuses the panel (or `initialFocus`, or its first focusable) on mount,
 * keeps Tab / Shift+Tab inside it, calls `onEscape` on Escape, and restores focus on unmount.
 * Runs on mount (or when `active` flips on): later changes to `onEscape` are picked up through a ref and never move focus.
 */
export function useFocusTrap(
  panelRef: RefObject<HTMLElement | null>,
  options: { onEscape?: (() => void) | undefined; initialFocus?: RefObject<HTMLElement | null> | undefined;
    /** Set false while the panel isn't rendered (e.g. conditionally shown dialog in the same component). */
    active?: boolean | undefined;
  } = {},
) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  const active = options.active ?? true;

  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = optionsRef.current.initialFocus?.current ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const onEscape = optionsRef.current.onEscape;
        if (onEscape) {
          e.preventDefault();
          onEscape();
        }
        return;
      }
      if (e.key !== "Tab") return;
      const current = panelRef.current;
      if (!current) return;
      const items = Array.from(current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        current.focus();
        return;
      }
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !current.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !current.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- panelRef is stable; runs on mount / activation only
  }, [active]);
}
