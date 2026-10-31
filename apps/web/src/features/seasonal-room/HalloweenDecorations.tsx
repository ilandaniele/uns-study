"use client";

import { memo, useId, useSyncExternalStore } from "react";
import { isHalloweenSeason } from "./halloween-season";
import styles from "./HalloweenDecorations.module.css";

function subscribe(notify: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => { timer = setTimeout(() => { notify(); schedule(); }, 60_000 - Date.now() % 60_000); };
  schedule();
  document.addEventListener("visibilitychange", notify);
  return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", notify); };
}
const snapshot = () => isHalloweenSeason(Date.now());
const serverSnapshot = () => false;

/** Visual only. Fixed ornaments stay outside chair markers; the whole layer ignores hit testing. */
export const HalloweenDecorations = memo(function HalloweenDecorations({ width, height }: { width: number; height: number }) {
  const active = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const id = useId();
  if (!active) return null;
  return <svg data-room-season="halloween" className={styles.layer} aria-hidden="true" pointerEvents="none" focusable="false" width={width} height={height} viewBox="0 0 1090 1536" preserveAspectRatio="none">
    <defs>
      <radialGradient id={`${id}-pumpkin`} cx="35%" cy="25%" r="80%"><stop stopColor="#ffbd58" /><stop offset=".48" stopColor="#df6e18" /><stop offset="1" stopColor="#773309" /></radialGradient>
      <radialGradient id={`${id}-light`}><stop stopColor="#ffc66a" stopOpacity=".38" /><stop offset="1" stopColor="#ff9e36" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-ghost`} x2=".8" y2="1"><stop stopColor="#fff7e8" stopOpacity=".95" /><stop offset="1" stopColor="#d7d1eb" stopOpacity=".65" /></linearGradient>
    </defs>

    {/* The back wall and corners are above the first chairs, leaving all labels clear. */}
    <g transform="translate(24 18)"><Cobweb /></g>
    <g transform="translate(1066 18) scale(-1 1)"><Cobweb /></g>
    <path d="M192 32Q545 101 898 32" fill="none" stroke="#47263b" strokeWidth="3" opacity=".8" />
    {[245, 345, 445, 545, 645, 745, 845].map((x, index) => <g key={x}>
      <circle cx={x} cy={37 + 32 * Math.sin((x - 192) / 706 * Math.PI)} r="13" fill={`url(#${id}-light)`} />
      <circle cx={x} cy={37 + 32 * Math.sin((x - 192) / 706 * Math.PI)} r="4" fill={index % 2 ? "#c7afd6" : "#ffb75c"} />
    </g>)}
    <g transform="translate(340 91)"><g className={styles.bat}><Bat /></g></g>
    <g transform="translate(760 83) scale(.8)"><g className={styles.batLate}><Bat /></g></g>

    {/* Ghosts float in the central aisle, away from both table blocks. */}
    <ellipse cx="545" cy="624" rx="27" ry="8" fill="#211b2c" opacity=".22" />
    <g transform="translate(545 565)"><g className={styles.ghost}><Ghost fill={`url(#${id}-ghost)`} /></g></g>
    <ellipse cx="551" cy="990" rx="21" ry="6" fill="#211b2c" opacity=".18" />
    <g transform="translate(551 945) scale(.72)"><g className={styles.ghostSlow}><Ghost fill={`url(#${id}-ghost)`} /></g></g>

    {/* Lanterns are grounded along the entrance, below the front wall-bar seats. */}
    <g transform="translate(148 1484)"><Pumpkin id={id} /></g>
    <g transform="translate(944 1484) scale(.85)"><Pumpkin id={id} /></g>
    <g transform="translate(429 1471)"><Candle light={`url(#${id}-light)`} /></g>
    <g transform="translate(664 1471) scale(.85)"><Candle light={`url(#${id}-light)`} /></g>
  </svg>;
});

function Cobweb() {
  return <g fill="none" stroke="#eee0d3" strokeWidth="1.6" opacity=".55">
    <path d="M0 72V0H128M0 0L110 62M0 0L65 78M0 0L125 25M0 0L22 80" />
    <path d="M0 23Q9 17 8 29Q20 21 24 29Q34 20 43 24M0 47Q14 38 15 55Q30 42 44 52Q53 36 78 43Q81 26 101 20M0 72Q21 59 23 80M23 80Q40 62 65 78Q70 55 110 62Q107 33 125 25Q113 8 128 0" />
  </g>;
}

function Bat() {
  return <g fill="#322135" stroke="#9d7f91" strokeWidth="1.2" strokeLinejoin="round">
    <path className={styles.wingLeft} d="M-3 0Q-18-21-45-20L-39-4Q-29-10-23 3Q-12-5-3 7Z" />
    <path className={styles.wingRight} d="M3 0Q18-21 45-20L39-4Q29-10 23 3Q12-5 3 7Z" />
    <path d="M-6-8L-8-17L0-12L8-17L6-8Q11 3 0 15Q-11 3-6-8Z" />
    <path d="M-3-6H-2M2-6H3" stroke="#ffd891" strokeWidth="2" />
  </g>;
}

function Ghost({ fill }: { fill: string }) {
  return <g>
    <path d="M-24 4V-12C-24-46 24-46 24-12V4L25 26Q17 31 10 22Q0 33-10 22Q-18 31-25 26Z" fill={fill} stroke="#f5ecdf" strokeOpacity=".45" strokeWidth="1.5" />
    <ellipse cx="-8" cy="-11" rx="3" ry="5" fill="#51495d" /><ellipse cx="8" cy="-11" rx="3" ry="5" fill="#51495d" />
    <path d="M-4 2Q0 7 4 2" fill="none" stroke="#766276" strokeWidth="2" strokeLinecap="round" />
  </g>;
}

function Pumpkin({ id }: { id: string }) {
  return <g>
    <ellipse cy="30" rx="46" ry="12" fill="#241c17" opacity=".5" />
    <ellipse cy="8" rx="85" ry="59" fill={`url(#${id}-light)`} />
    <path d="M-4-29Q-8-42 5-44L12-40Q0-38 4-27" fill="#636e35" stroke="#3f4726" strokeWidth="3" />
    <ellipse cy="1" rx="42" ry="33" fill={`url(#${id}-pumpkin)`} stroke="#873d13" strokeWidth="2" />
    <path d="M-12-29Q-32 0-15 30M9-30Q28 0 15 30M0-30Q-8 0 0 32" fill="none" stroke="#963d13" strokeOpacity=".5" strokeWidth="2" />
    <g className={styles.lantern} fill="#ffe6a0" stroke="#85401c" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M-28-4L-16-15L-9-1ZM9-1L16-15L28-4ZM-5 7L0 0L5 7Z" />
      <path d="M-24 10L-12 15L-8 10L-2 17L6 12L12 15L24 8Q17 32-5 25Q-18 22-24 10Z" />
    </g>
  </g>;
}

function Candle({ light }: { light: string }) {
  return <g>
    <ellipse cy="22" rx="19" ry="5" fill="#241c17" opacity=".35" />
    <ellipse cy="-6" rx="31" ry="38" fill={light} />
    <rect x="-8" y="-7" width="16" height="29" rx="4" fill="#d9bd8b" />
    <path d="M-7-6V4Q-3 10-1 1V-5" fill="none" stroke="#f0ddab" strokeWidth="3" />
    <path className={styles.flame} d="M0-30Q-13-9 0-9Q11-12 0-30" fill="#ffd878" />
    <path d="M0-20Q-5-11 0-11Q4-13 0-20" fill="#fff4c3" />
  </g>;
}
