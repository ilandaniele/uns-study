"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePro } from "@/features/subscriptions/usePro";
import { playChime, playableLayers, setLayers, stopAmbient } from "./focus-audio";
import { showFocusNotification } from "./focus-notify";
import { focusActions, getFocus, useFocus } from "./focus-store";
import { PHASE_LABEL, formatClock, remainingMs, type Completion, type FocusSettings } from "./pomodoro";
import { useMe } from "@/lib/me-store";
import { startFocusSync } from "./focus-sync";

const TICK_MS = 500;

function announce(last: Completion, s: FocusSettings) {
  const d = getFocus();
  const next = d.timer.phase;
  const running = d.timer.status === "running";
  if (d.chime) playChime(next === "focus" ? "focus" : "break", d.volume || 0.6);
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;
  if (last.phase === "focus") {
    const mins = next === "long" ? s.longMin : s.shortMin;
    void showFocusNotification(
      next === "long" ? "Terminaste la serie" : "Bloque de foco terminado",
      running ? `${PHASE_LABEL[next]} de ${mins} min. Levantate, estirá, tomá agua.` : `Arrancá la ${PHASE_LABEL[next].toLowerCase()} cuando quieras.`,
    );
  } else {
    void showFocusNotification(
      "Se terminó la pausa",
      running ? `Vuelve el foco: ${s.focusMin} min.` : `Cuando vuelvas, arrancá el próximo bloque de ${s.focusMin} min.`,
    );
  }
}

/**
 * App-wide engine for the Pomodoro timer, mounted once in the root layout so the countdown keeps
 * running (and ringing) while the user moves between the room, chat or ranking.
 */
export function FocusRuntime() {
  return <FocusEngine />;
}

function FocusEngine() {
  const { me, loading } = useMe();
  const userId=me?.user?.id??null;
  useEffect(()=>{
    if(loading)return;
    return startFocusSync(userId,(phase)=>announce({phase,at:Date.now(),focusMin:0},getFocus().settings));
  },[userId,loading]);
  const { lock } = usePro();
  const focus = useFocus();
  const { timer, layers, volume } = focus;
  const titleRef = useRef<{ base: string; set: string } | null>(null);

  // Settle finished phases on a short interval while running, and right away when the tab returns.
  useEffect(() => {
    if (timer.status !== "running") return;
    const run = () => {
      const done = focusActions.settle(Date.now());
      if (done.length > 0) announce(done[done.length - 1], getFocus().settings);
    };
    run();
    const id = window.setInterval(run, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [timer.status, timer.endsAt]);

  // Ambient noise plays only during a running focus block; breaks are quiet.
  const running = timer.status === "running" && timer.phase === "focus";
  const playing = useMemo(() => (running ? playableLayers(layers, lock) : []), [running, layers, lock]);
  useEffect(() => {
    if (playing.length > 0) setLayers(playing, volume);
    else stopAmbient();
  }, [playing, volume]);
  useEffect(() => () => stopAmbient(), []);

  // Countdown in the tab title, so it reads from another tab or the taskbar.
  useEffect(() => {
    const restore = () => {
      const t = titleRef.current;
      if (t && document.title === t.set) document.title = t.base;
      titleRef.current = null;
    };
    if (timer.status === "idle") {
      restore();
      return;
    }
    const paint = () => {
      const prev = titleRef.current;
      // A navigation replaced the title since our last write: that is the new base.
      const base = prev && document.title === prev.set ? prev.base : document.title;
      const clock = formatClock(remainingMs(getFocus().timer, Date.now()));
      const mark = timer.status === "paused" ? "Pausa" : PHASE_LABEL[timer.phase];
      const set = `${clock} ${mark} | ${base}`;
      document.title = set;
      titleRef.current = { base, set };
    };
    paint();
    if (timer.status !== "running") return;
    const id = window.setInterval(paint, 1000);
    return () => window.clearInterval(id);
  }, [timer.status, timer.phase, timer.endsAt]);

  useEffect(
    () => () => {
      const t = titleRef.current;
      if (t && document.title === t.set) document.title = t.base;
    },
    [],
  );

  return null;
}
