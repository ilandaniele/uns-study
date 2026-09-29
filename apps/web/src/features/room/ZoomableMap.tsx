"use client";

import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, ArrowsCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { useRef, type ReactNode } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

/** Pinch/pan wrapper plus zoom buttons for touch screens. Loaded only on mobile via `next/dynamic`. */
export default function ZoomableMap({ children }: { children: ReactNode }) {
  const zoomRef = useRef<ReactZoomPanPinchRef>(null);
  return (
    <>
      <TransformWrapper ref={zoomRef} minScale={0.5} maxScale={4} initialScale={1} limitToBounds>
        <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%", height: "100%" }}>
          {children}
        </TransformComponent>
      </TransformWrapper>
      <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-xl border border-app bg-surface shadow-md">
        <button
          type="button"
          onClick={() => zoomRef.current?.zoomIn()}
          aria-label="Acercar"
          className="flex h-10 w-10 items-center justify-center text-main hover:bg-[var(--surface-2)]"
        >
          <MagnifyingGlassPlusIcon aria-hidden="true" size={20} />
        </button>
        <div className="h-px bg-[var(--border)]" />
        <button
          type="button"
          onClick={() => zoomRef.current?.zoomOut()}
          aria-label="Alejar"
          className="flex h-10 w-10 items-center justify-center text-main hover:bg-[var(--surface-2)]"
        >
          <MagnifyingGlassMinusIcon aria-hidden="true" size={20} />
        </button>
        <div className="h-px bg-[var(--border)]" />
        <button
          type="button"
          onClick={() => zoomRef.current?.resetTransform()}
          aria-label="Restablecer zoom"
          className="flex h-10 w-10 items-center justify-center text-main hover:bg-[var(--surface-2)]"
        >
          <ArrowsCounterClockwiseIcon aria-hidden="true" size={20} />
        </button>
      </div>
    </>
  );
}
