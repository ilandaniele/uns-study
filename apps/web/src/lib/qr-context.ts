"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

export interface QrContext {
  /** Table code to highlight on the room map, e.g. "M01", from `?table=`. */
  highlightTableCode: string | null;
  /** QR token to attach to check-in/observation requests, from `?qr=` (only when `source=qr`). */
  qrToken: string | null;
}

/**
 * Pure parser for the QR-scan context out of a URL's query string:
 * `?table=<code>&source=qr&qr=<token>` (as produced by `/q/[token]`'s redirect).
 * `qrToken` is only surfaced when `source=qr` is present, so a plain `?table=` deep link
 * (no QR scan) never gets treated as QR-verified.
 */
export function parseQrContext(searchParams: Pick<URLSearchParams, "get">): QrContext {
  const table = searchParams.get("table");
  const source = searchParams.get("source");
  const qr = searchParams.get("qr");
  return {
    highlightTableCode: table && table.trim().length > 0 ? table : null,
    qrToken: source === "qr" && qr && qr.trim().length > 0 ? qr : null,
  };
}

/** Reads the QR-scan context from the current page's URL search params. */
export function useQrContext(): QrContext {
  const searchParams = useSearchParams();
  return useMemo(() => parseQrContext(searchParams), [searchParams]);
}
