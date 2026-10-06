"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Plays an exit animation before a modal closes: `requestClose` flips `closing` (add the
 * `*-exit` classes), then calls `onClose` once the animation has had `durationMs` to run.
 * `cancelClose` aborts it before `onClose` fires.
 */
export function useExitTransition(
  onClose: () => void,
  durationMs = 140,
): { closing: boolean; requestClose: () => void; cancelClose: () => void } {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onCloseRef.current();
      // Components that stay mounted while hidden (e.g. `open` prop) must be able to play the enter
      // animation again on the next open.
      closingRef.current = false;
      setClosing(false);
    }, durationMs);
  }, [durationMs]);

  /** Aborts a pending close (e.g. the opener was tapped again mid-exit); `onClose` is not called. */
  const cancelClose = useCallback(() => {
    if (!closingRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    closingRef.current = false;
    setClosing(false);
  }, []);

  return { closing, requestClose, cancelClose };
}
