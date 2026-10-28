"use client";

import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, ArrowsCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { useRef, useState, type ReactNode } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

/** Pinch/pan wrapper plus zoom buttons for touch screens. Loaded only on mobile via `next/dynamic`. */
export default function ZoomableMap({ children }: { children: ReactNode }) {
  const zoomRef = useRef<ReactZoomPanPinchRef>(null);
  // One-finger panning only while zoomed in. At 1x there is nothing to pan, and an enabled pan handler
  // swallows every vertical swipe that starts on the map (preventDefault on touchmove) and focuses
  // the wrapper, so the page couldn't be scrolled past the map and jumped on touch. Pinch still zooms.
  const [zoomed, setZoomed] = useState(false);
  return (
    <>
      {/* No double-tap zoom, pan inertia or snap-back animation: tapping a seat must never move the map. Pinch, drag and the buttons still zoom/pan.
          autoAlignment sizeX/sizeY default to 100, which lets a drag push the map 100 px past its edges even with
          alignment disabled, and nothing snaps it back. Zero keeps every drag inside the map's bounds. */}
      <TransformWrapper
        ref={zoomRef}
        minScale={1}
        maxScale={4}
        initialScale={1}
        limitToBounds
        doubleClick={{ disabled: true }}
        panning={{ disabled: !zoomed, velocityDisabled: true, excluded: ["seat-button"] }}
        autoAlignment={{ disabled: true, sizeX: 0, sizeY: 0 }}
        velocityAnimation={{ disabled: true }}
        onTransform={(_ref, state) => setZoomed(state.scale > 1.01)}
      >
        <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%", height: "100%" }}>
          {children}
        </TransformComponent>
      </TransformWrapper>
      {/* Mid-left, over the empty floor by the windows, so the controls never cover a seat. */}
      <div className="absolute left-2 top-1/2 flex -translate-y-1/2 flex-col overflow-hidden rounded-float border border-app bg-surface shadow-md">
        <button
          type="button"
          onClick={() => zoomRef.current?.zoomIn(0.5, 200)}
          aria-label="Acercar"
          className="flex h-10 w-10 items-center justify-center text-main hover:bg-[var(--surface-2)]"
        >
          <MagnifyingGlassPlusIcon aria-hidden="true" size={20} />
        </button>
        <div className="h-px bg-[var(--border)]" />
        <button
          type="button"
          onClick={() => zoomRef.current?.zoomOut(0.5, 200)}
          aria-label="Alejar"
          className="flex h-10 w-10 items-center justify-center text-main hover:bg-[var(--surface-2)]"
        >
          <MagnifyingGlassMinusIcon aria-hidden="true" size={20} />
        </button>
        <div className="h-px bg-[var(--border)]" />
        <button
          type="button"
          onClick={() => zoomRef.current?.resetTransform(200)}
          aria-label="Restablecer zoom"
          className="flex h-10 w-10 items-center justify-center text-main hover:bg-[var(--surface-2)]"
        >
          <ArrowsCounterClockwiseIcon aria-hidden="true" size={20} />
        </button>
      </div>
    </>
  );
}
