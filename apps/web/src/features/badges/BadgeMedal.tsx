"use client";

import { BADGE_MOTIFS, type AchievementTier, type BadgeId, type BadgeMotif } from "@sala/contracts";
import { useId } from "react";

const PALETTE = {
  bronze: ["#efbb88", "#754128", "#c07a42", "I"],
  silver: ["#e3edf5", "#455568", "#9db4c8", "II"],
  gold: ["#fff0a8", "#946314", "#f5bd41", "III"],
  diamond: ["#d8fbff", "#245c83", "#76d9ef", "IV"],
} as const;

/** Original illustrated medallions inspired by everyday Argentine objects and native nature. */
export function BadgeMedal({ tier, badgeId, size = 72, label }: { tier: AchievementTier; badgeId?: BadgeId; size?: number; label?: string }) {
  const id = useId();
  const [light, dark, main, numeral] = PALETTE[tier];
  const motif = badgeId ? BADGE_MOTIFS[badgeId] : "mate";
  return <svg width={size} height={size} viewBox="0 0 96 96" data-badge-motif={motif} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="shrink-0">
    <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor={light}/><stop offset=".4" stopColor={main}/><stop offset=".7" stopColor={light}/><stop offset="1" stopColor={dark}/></linearGradient></defs>
    <path d="m26 61-5 26 12-5 8 8 7-24m5 0 6 24 8-8 12 5-6-26" fill="#70b9cb" stroke="#335d65" strokeWidth="1.5"/>
    <path d="m33 66-4 17 4-2 5 5 5-19m14 0 5 19 5-5 4 2-4-17" fill="#f6efdc"/>
    <circle cx="48" cy="43" r="35" fill={dark} opacity=".25" transform="translate(0 3)"/>
    <circle cx="48" cy="43" r="35" fill={`url(#${id})`} stroke={dark} strokeWidth="1.5"/>
    <circle cx="48" cy="43" r="30" fill="#fbf3df" stroke={dark} strokeWidth="1"/>
    <circle cx="48" cy="43" r="27" fill="none" stroke={main} strokeWidth="1" strokeDasharray="1 4"/>
    <BadgeSymbol motif={motif}/>
    <path d="M21 45q0 18 18 24m-17-14-5-3m9 10-6-1m55-16q0 18-18 24m17-14 5-3m-9 10 6-1" fill="none" stroke={main} strokeWidth="2" strokeLinecap="round"/>
    <rect x="37" y="70" width="22" height="13" rx="6.5" fill={dark} stroke={light}/>
    <text x="48" y="79.5" textAnchor="middle" fontFamily="sans-serif" fontWeight="800" fontSize="9" fill={light}>{numeral}</text>
  </svg>;
}

function BadgeSymbol({ motif }: { motif: BadgeMotif }) {
  switch (motif) {
    case "mate": return <g strokeLinecap="round" strokeLinejoin="round">
      <path d="M33 41c-4 16 0 25 15 25s19-9 15-25" fill="#aa6b3c" stroke="#68442e" strokeWidth="2"/>
      <path d="M36 47c0 9 3 14 8 15" fill="none" stroke="#dfae70" strokeWidth="3"/>
      <path d="M34 52q14 7 28 0" fill="none" stroke="#69452f" strokeWidth="2"/>
      <ellipse cx="48" cy="40" rx="16" ry="6" fill="#d9ddd1" stroke="#72877b" strokeWidth="2"/>
      <ellipse cx="48" cy="40" rx="12" ry="3.5" fill="#6e853f"/>
      <path d="m51 41 7-16 8-3" fill="none" stroke="#587b80" strokeWidth="4"/><path d="m51 40 7-15 7-3" fill="none" stroke="#dae6df" strokeWidth="1.5"/>
      <path d="m40 39 3 1m2-3 2 1m-6 4 3-1" stroke="#bfcc6f" strokeWidth="1.5"/>
    </g>;
    case "bombilla": return <g strokeLinecap="round" strokeLinejoin="round">
      <path d="m39 58 13-29q2-5 10-4" fill="none" stroke="#496e77" strokeWidth="7"/>
      <path d="m39 58 13-29q2-5 10-4" fill="none" stroke="#d5e3dc" strokeWidth="3"/>
      <ellipse cx="36" cy="61" rx="7" ry="10" transform="rotate(27 36 61)" fill="#a5c0ba" stroke="#496e77" strokeWidth="2"/>
      <path d="m34 56 1 0m4 4 1 0m-7 2 1 0m2 5 1 0" stroke="#496e77" strokeWidth="2"/>
      <path d="M60 53q-6 0-8 10 10 0 10-8m-5 3-4 5" fill="#93ac66" stroke="#65824b" strokeWidth="1.5"/>
    </g>;
    case "termo": return <g strokeLinejoin="round">
      <path d="M57 34h4q6 0 6 8v9q0 7-7 7h-3" fill="none" stroke="#577c7c" strokeWidth="3"/>
      <rect x="37" y="29" width="22" height="38" rx="6" fill="#87c0c7" stroke="#436e73" strokeWidth="2"/>
      <path d="M38 42h20v12H38Z" fill="#faf6e7"/><circle cx="48" cy="48" r="3" fill="#d6a851"/>
      <path d="M41 34v28" stroke="#d1e4db" strokeWidth="2" strokeLinecap="round"/>
      <rect x="40" y="24" width="16" height="7" rx="2" fill="#a9633e" stroke="#68442e" strokeWidth="1.5"/>
      <path d="M40 64h16" stroke="#557b7a" strokeWidth="2"/>
    </g>;
    case "sol": return <g stroke="#c08e32" strokeLinecap="round">
      {Array.from({ length: 12 }, (_, index) => <path key={index} d="M48 21v6" strokeWidth="2.5" transform={`rotate(${index * 30} 48 43)`}/>)}
      <circle cx="48" cy="43" r="12" fill="#efc868" strokeWidth="1.5"/>
      <path d="M42 42h1m10 0h1m-9 7q3 2 6 0" fill="none" strokeWidth="1.5"/>
      <path d="M47 42v4h2" fill="none" strokeWidth="1"/>
    </g>;
    case "ceibo": return <g strokeLinecap="round" strokeLinejoin="round">
      <path d="M47 66V41m0 10-9-11m9 19 10-14" fill="none" stroke="#4c7951" strokeWidth="2.5"/>
      <path d="M46 58c-12 3-16-5-15-8 7-1 14 1 15 8m4-2c12 2 16-5 15-8-7 0-13 2-15 8" fill="#87a965" stroke="#5d844d"/>
      <path d="M47 43c-12-1-13-15-5-17 5 0 8 10 5 17m2 0c-1-15 7-21 12-14 3 6-4 14-12 14m-10-1c-11 2-17-8-11-12 6-2 13 5 11 12" fill="#cd5e46" stroke="#9f3f34" strokeWidth="1.5"/>
      <path d="m42 31 3 7m12-6-5 7m-20-5 5 5" stroke="#edaa78" strokeWidth="2"/>
    </g>;
    case "hornero": return <g strokeLinecap="round" strokeLinejoin="round">
      <path d="M28 62q-1-31 19-31 22 0 22 31Z" fill="#bc8757" stroke="#825637" strokeWidth="2"/>
      <path d="M31 49q14-8 33 0m-34 7q11-5 18-3m-7-16q10-5 18 4" fill="none" stroke="#dfa56a" strokeWidth="2"/>
      <path d="M34 62V52q1-10 10-10 8 1 8 11v9Z" fill="#5d4633"/>
      <path d="M55 32q-7-5-4-10 4-4 8 0l7 3-7 1q2 9-4 6Z" fill="#96704b" stroke="#624b35" strokeWidth="1.5"/>
      <path d="m52 31-5 3m10-3 2 3" stroke="#624b35" strokeWidth="1.5"/><circle cx="56" cy="22" r="1" fill="#273b31"/>
    </g>;
    case "bandera": return <g strokeLinecap="round" strokeLinejoin="round">
      <path d="M31 26v40" stroke="#8d6b44" strokeWidth="3"/>
      <path d="M32 29q9-6 18 0t17 0v26q-8 6-17 0t-18 0Z" fill="#83becd" stroke="#557f86" strokeWidth="1.5"/>
      <path d="M32 38q9-6 18 0t17 0v9q-8 6-17 0t-18 0Z" fill="#fff8e9"/>
      <circle cx="50" cy="43" r="3" fill="#d9ac50"/><circle cx="31" cy="25" r="2.5" fill="#b9935e"/>
    </g>;
  }
}
