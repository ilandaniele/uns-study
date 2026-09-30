"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";

export interface SeatSheetProps {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onClose: () => void;
  children: ReactNode;
}

/** Drag distance (px) that commits a swipe on the grab handle. */
const SWIPE = 56;

/**
 * Mobile bottom sheet for the seat detail, in the style of map apps: it opens as a short "peek"
 * that leaves the room map visible, swipes up to show everything and swipes down to close.
 * There is no backdrop, so tapping another seat on the map switches the sheet to that seat.
 */
export function SeatSheet({ expanded, onExpandedChange, onClose, children }: SeatSheetProps) {
  const startY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    startY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (startY.current === null) return;
    // Follow the finger downwards; resist upwards so the sheet never detaches from the bottom edge.
    const delta = event.clientY - startY.current;
    setDragY(delta > 0 ? delta : delta / 4);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (startY.current === null) return;
    const delta = event.clientY - startY.current;
    startY.current = null;
    setDragY(0);
    if (Math.abs(delta) < 6) {
      onExpandedChange(!expanded);
    } else if (delta > SWIPE) {
      if (expanded) onExpandedChange(false);
      else onClose();
    } else if (delta < -SWIPE / 2) {
      onExpandedChange(true);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Detalle del lugar"
      className={`sheet-enter fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-[22px] border-t border-app bg-surface pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.22)] ${
        expanded ? "max-h-[88dvh]" : "max-h-[62dvh]"
      }`}
      style={{
        transform: dragY ? `translateY(${dragY}px)` : undefined,
        transition: dragY ? "none" : "transform 200ms ease-out, max-height 240ms ease-out",
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          startY.current = null;
          setDragY(0);
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
