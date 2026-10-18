"use client";

import { useEffect, useRef } from "react";

/** Marks the selected seat's detail (desktop panel); taps inside it keep the seat open. */
export const SEAT_DETAIL_ATTR = "data-seat-detail";

// A pointer that travels further than this between down and up was a pan or a scroll, not a tap.
const TAP_SLOP_PX = 10;

// Seats toggle themselves; dialogs (the mobile sheet, modals) and the detail panel are part of the
// selection; any other control does its own job (and may open a seat itself), so none of them dismiss.
const KEEP_SELECTOR = `.seat-button, [role="dialog"], [${SEAT_DETAIL_ATTR}], button, a, input, select, textarea, label, [role="button"], [role="link"], [role="menuitem"], [contenteditable="true"]`;

/** True when a tap on `target` should close the selected seat: empty map floor or plain page outside the map. */
export function isOutsideSeatTap(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (!target.isConnected) return false;
  return target.closest(KEEP_SELECTOR) === null;
}

/** While `active`, a tap on the map floor or anywhere outside the map and the seat detail calls `onDismiss`. */
export function useDismissSeatOnOutsideTap(active: boolean, onDismiss: () => void): void {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!active) return;
    let start: { x: number; y: number; target: EventTarget | null } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      start = event.isPrimary ? { x: event.clientX, y: event.clientY, target: event.target } : null;
    };
    const onPointerUp = (event: PointerEvent) => {
      const down = start;
      start = null;
      if (!down || !event.isPrimary || event.button !== 0) return;
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > TAP_SLOP_PX) return;
      if (isOutsideSeatTap(down.target) && isOutsideSeatTap(event.target)) onDismissRef.current();
    };
    const onCancel = () => {
      start = null;
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onCancel, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onCancel, true);
    };
  }, [active]);
}
