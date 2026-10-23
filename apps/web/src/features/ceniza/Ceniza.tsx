"use client";

import { memo, useEffect, useId, useRef } from "react";
import { frameFor, nextAction, START, type Point, type Pose } from "./behavior";

interface TableRect { x: number; y: number; width: number; height: number }

/** A single decorative sprite in the map's coordinate system; never captures input. */
export const Ceniza = memo(function Ceniza({ tables }: { tables: ReadonlyMap<string, TableRect> }) {
  const id = useId();
  const location = useRef<SVGGElement>(null);
  const facing = useRef<SVGGElement>(null);
  const sprite = useRef<SVGImageElement>(null);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let animation = 0;
    let position: Point = { ...START };
    let previous: Pose = "rest";
    let direction = 1;
    const draw = (point: Point, frame: number) => {
      location.current?.setAttribute("transform", `translate(${point.x} ${point.y})`);
      facing.current?.setAttribute("transform", `scale(${direction} 1)`);
      sprite.current?.setAttribute("x", String(-frame * 96));
    };
    const stop = () => {
      clearTimeout(timer);
      cancelAnimationFrame(animation);
    };
    const step = () => {
      const action = nextAction(position, previous);
      previous = action.pose;
      const from = position;
      if (action.target.x !== from.x) direction = action.target.x < from.x ? -1 : 1;
      draw(position, frameFor(action.pose, 0));
      if (action.pose === "sleep" || action.pose === "lie" || action.pose === "rest") {
        timer = setTimeout(step, action.duration);
        return;
      }
      const started = performance.now();
      let lastDraw = -Infinity;
      const tick = (now: number) => {
        const elapsed = now - started;
        const t = Math.min(1, elapsed / action.duration);
        // Soft acceleration/deceleration, with a steady walking speed in between.
        const progress = t < 0.1 ? 5 * t * t / 0.9 : t > 0.9 ? 1 - 5 * (1 - t) ** 2 / 0.9 : (t - 0.05) / 0.9;
        position = { x: from.x + (action.target.x - from.x) * progress, y: from.y + (action.target.y - from.y) * progress };
        if (now - lastDraw >= 50 || t === 1) {
          draw(position, frameFor(action.pose, elapsed));
          lastDraw = now;
        }
        if (t < 1) animation = requestAnimationFrame(tick);
        else timer = setTimeout(step, 250);
      };
      animation = requestAnimationFrame(tick);
    };
    const resume = () => {
      stop();
      if (motion.matches) {
        position = { ...START };
        direction = 1;
        previous = "rest";
        draw(position, 5);
      } else if (!document.hidden) {
        // Pause while hidden; resume locally without catching up hours of animation.
        previous = "rest";
        timer = setTimeout(step, 8_000);
      }
    };
    motion.addEventListener("change", resume);
    document.addEventListener("visibilitychange", resume);
    resume();
    return () => {
      stop();
      motion.removeEventListener("change", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  return (
    <g aria-hidden="true" pointerEvents="none" data-ceniza="" className="pointer-events-none">
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={1090} height={1536}>
          <rect width={1090} height={1536} fill="white" />
          {Array.from(tables, ([code, table]) => <rect key={code} {...table} rx={3} fill="black" />)}
        </mask>
      </defs>
      <g mask={`url(#${id})`}>
        <g ref={location} transform={`translate(${START.x} ${START.y})`}>
          <ellipse cx={0} cy={-3} rx={23} ry={7} fill="black" opacity={0.16} />
          <g ref={facing}>
            <svg x={-32} y={-57} width={64} height={64} viewBox="0 0 96 96" overflow="hidden" className="dark:brightness-75">
              <image ref={sprite} href="/room/ceniza.webp" x={-5 * 96} y={0} width={864} height={96} />
            </svg>
          </g>
        </g>
      </g>
    </g>
  );
});
