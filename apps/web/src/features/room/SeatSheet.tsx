"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

export interface SeatSheetProps {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onClose: () => void;
  children: ReactNode;
}

/** Drag distance (px) that commits a swipe on the grab handle. */
const SWIPE = 56;
/** Release velocity (px/ms) that commits a swipe even when the drag is short. */
const VELOCITY = 0.11;
/** Exit animation length (ms) plus the fallback timer that guarantees onClose fires. */
const EXIT_MS = 200;
const EXIT_FALLBACK_MS = 220;
const REST_TRANSITION = "transform 220ms var(--ease-drawer)";

/**
 * Mobile bottom sheet for the seat detail, in the style of map apps: it opens as a short "peek"
 * that leaves the room map visible, swipes up to show everything and swipes down to close.
 * There is no backdrop, so tapping another seat on the map switches the sheet to that seat.
 */
export function SeatSheet({ expanded, onExpandedChange, onClose, children }: SeatSheetProps) {
  const startY = useRef<number | null>(null);
  const startTime = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closed = useRef(false);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (fallback.current) clearTimeout(fallback.current);
    },
    [],
  );

  function finishClose() {
    if (closed.current) return;
    closed.current = true;
    if (fallback.current) clearTimeout(fallback.current);
    onClose();
  }

  /** Slides the sheet off the bottom, then reports the close (immediately with reduced motion). */
  function requestClose() {
    if (closed.current || closing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishClose();
      return;
    }
    setClosing(true);
    fallback.current = setTimeout(finishClose, EXIT_FALLBACK_MS);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    startY.current = event.clientY;
    startTime.current = Date.now();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (startY.current === null) return;
    // Follow the finger downwards; resist upwards so the sheet never detaches from the bottom edge.
    const delta = event.clientY - startY.current;
    // Written straight to the element: a state update per pointermove would re-render the whole sheet.
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.style.transition = "none";
    sheet.style.transform = `translateY(${delta > 0 ? delta : delta / 4}px)`;
  }

  /** Hands the sheet back to its resting position with the usual settle animation. */
  function resetDrag() {
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.style.transition = REST_TRANSITION;
    sheet.style.transform = "";
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (startY.current === null) return;
    const delta = event.clientY - startY.current;
    startY.current = null;
    const elapsed = Math.max(Date.now() - startTime.current, 1);
    const swipedDown = delta > SWIPE || (delta > 0 && delta / elapsed > VELOCITY);
    // Closing keeps the dragged offset so the exit continues from where the finger let go.
    if (!(swipedDown && !expanded)) resetDrag();
    if (Math.abs(delta) < 6) {
      onExpandedChange(!expanded);
    } else if (swipedDown) {
      if (expanded) onExpandedChange(false);
      else requestClose();
    } else if (delta < -SWIPE / 2) {
      onExpandedChange(true);
    }
  }

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="false"
      aria-label="Detalle del lugar"
      className={`sheet-enter fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-sheet border-t border-app bg-surface pb-safe shadow-[0_-8px_24px_rgba(0,0,0,0.18)] ${
        expanded ? "max-h-[88dvh]" : "max-h-[62dvh]"
      }`}
      style={{
        transform: closing ? "translateY(100%)" : undefined,
        transition: closing ? `transform ${EXIT_MS}ms var(--ease-drawer)` : REST_TRANSITION,
      }}
      onTransitionEnd={(event) => {
        if (closing && event.target === event.currentTarget && event.propertyName === "transform") {
          finishClose();
        }
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          startY.current = null;
          resetDrag();
        }}
        aria-hidden="true"
        className="flex h-7 shrink-0 cursor-grab touch-none items-center justify-center"
      >
        <span className="h-1.5 w-11 rounded-full bg-[var(--border-strong)]" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </div>
  );
}
