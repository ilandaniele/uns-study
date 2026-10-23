"use client";

import { memo, useEffect, useId, useRef } from "react";
import { frameFor, nextAction, settleFrames, travelProgress, SLEEP_FRAME, SPRITE_COLUMNS, SPRITE_ROWS, START, type Heading, type Point, type Pose } from "./behavior";

interface TableRect { x: number; y: number; width: number; height: number }

/** A single decorative sprite in the map's coordinate system; never captures input. */
export const Ceniza = memo(function Ceniza({ tables }: { tables: ReadonlyMap<string, TableRect> }) {
  const id = useId();
  const location = useRef<SVGGElement>(null);
  const facing = useRef<SVGGElement>(null);
  const sprite = useRef<SVGImageElement>(null);
  const shadow = useRef<SVGEllipseElement>(null);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let animation = 0;
    let position: Point = { ...START };
    let previous: Pose = "sleep";
    let direction = 1;
    let heading: Heading = "side";
    let distance = 0;
    const draw = (point: Point, frame: number) => {
      location.current?.setAttribute("transform", `translate(${point.x} ${point.y})`);
      facing.current?.setAttribute("transform", `scale(${direction} 1)`);
      sprite.current?.setAttribute("x", String(-(frame % SPRITE_COLUMNS) * 96));
      sprite.current?.setAttribute("y", String(-Math.floor(frame / SPRITE_COLUMNS) * 96));
      shadow.current?.setAttribute("rx", String(heading === "side" ? 23 : 13));
    };
    const stop = () => {
      clearTimeout(timer);
      cancelAnimationFrame(animation);
    };
    const step = () => {
      const action = nextAction(position, previous);
      const waking = settleFrames(previous, true);
      previous = action.pose;
      const from = position;
      const play = (frames: readonly number[], done: () => void) => {
        heading = "side";
        let index = 0;
        const advance = () => {
          if (index >= frames.length) { done(); return; }
          draw(position, frames[index++]!);
          timer = setTimeout(advance, 200);
        };
        advance();
      };
      const begin = () => {
        if (action.pose === "walk") {
          heading = action.target.x !== from.x ? "side" : action.target.y < from.y ? "up" : "down";
          direction = heading === "side" && action.target.x < from.x ? -1 : 1;
        }
        if (action.pose === "sleep" || action.pose === "lie" || action.pose === "sprawl" || action.pose === "rest") {
          play(settleFrames(action.pose), () => {
            draw(position, frameFor(action.pose, 0));
            timer = setTimeout(step, action.duration);
          });
          return;
        }
        draw(position, frameFor(action.pose, 0, distance, heading));
        const started = performance.now();
        const segmentLength = Math.hypot(action.target.x - from.x, action.target.y - from.y);
        const initialDistance = distance;
        let lastDraw = -Infinity;
        const tick = (now: number) => {
          const elapsed = now - started;
          const t = Math.min(1, elapsed / action.duration);
          const progress = travelProgress(elapsed, action.duration);
          position = { x: from.x + (action.target.x - from.x) * progress, y: from.y + (action.target.y - from.y) * progress };
          distance = initialDistance + segmentLength * progress;
          if (now - lastDraw >= 1000 / 60 || t === 1) {
            draw(position, frameFor(action.pose, elapsed, distance, heading));
            lastDraw = now;
          }
          if (t < 1) animation = requestAnimationFrame(tick);
          else timer = setTimeout(step, 250);
        };
        animation = requestAnimationFrame(tick);
      };
      if (waking.length) play(waking, begin);
      else begin();
    };
    const resume = () => {
      stop();
      if (motion.matches) {
        position = { ...START };
        direction = 1;
        heading = "side";
        previous = "sleep";
        draw(position, SLEEP_FRAME);
      } else if (!document.hidden) {
        // Pause while hidden; resume locally without catching up hours of animation.
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
          <ellipse ref={shadow} cx={0} cy={-3} rx={23} ry={7} fill="black" opacity={0.16} />
          <g ref={facing}>
            <svg x={-35} y={-63} width={70} height={70} viewBox="0 0 96 96" overflow="hidden" className="dark:brightness-75">
              <image ref={sprite} href="/room/ceniza-v4.webp" x={-(SLEEP_FRAME % SPRITE_COLUMNS) * 96} y={-Math.floor(SLEEP_FRAME / SPRITE_COLUMNS) * 96} width={SPRITE_COLUMNS * 96} height={SPRITE_ROWS * 96} />
            </svg>
          </g>
        </g>
      </g>
    </g>
  );
});
