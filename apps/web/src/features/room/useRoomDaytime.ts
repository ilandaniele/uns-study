"use client";

import { useSyncExternalStore } from "react";
import { isRoomDaytime } from "./room-lighting";

function subscribe(notify: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    timer = setTimeout(() => { notify(); schedule(); }, 60_000 - Date.now() % 60_000);
  };
  schedule();
  document.addEventListener("visibilitychange", notify);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", notify);
  };
}

const snapshot = () => isRoomDaytime(Date.now());
// The server does not know when a cached page will be viewed. Wait for hydration
// to choose the photo instead of briefly showing a day photo during the night.
const serverSnapshot = () => null;

export function useRoomDaytime(): boolean | null {
  return useSyncExternalStore<boolean | null>(subscribe, snapshot, serverSnapshot);
}
