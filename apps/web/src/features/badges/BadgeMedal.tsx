"use client";

import type { AchievementTier } from "@sala/contracts";
import { useId } from "react";

const PALETTE = {
  bronze: ["#efbb88", "#754128", "#c07a42", "I"],
  silver: ["#e3edf5", "#455568", "#9db4c8", "II"],
  gold: ["#fff0a8", "#946314", "#f5bd41", "III"],
  diamond: ["#d8fbff", "#245c83", "#76d9ef", "IV"],
} as const;

/** Original medal artwork; the competitive reveal uses no game logos or copied assets. */
export function BadgeMedal({ tier, size = 72, label }: { tier: AchievementTier; size?: number; label?: string }) {
  const id = useId();
  const [light, dark, main, numeral] = PALETTE[tier];
  return <svg width={size} height={size} viewBox="0 0 96 96" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="shrink-0">
    <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor={light}/><stop offset=".55" stopColor={main}/><stop offset="1" stopColor={dark}/></linearGradient></defs>
    <path d="m25 6 23 8L71 6l-5 29H30Z" fill={dark}/><path d="m32 8 16 6 16-6-4 28H36Z" fill={main}/>
    <path d="m48 18 24 10 10 24-10 24-24 10-24-10-10-24 10-24Z" fill={dark} stroke={light} strokeWidth="2"/>
    <path d="m48 23 20 9 9 20-9 20-20 9-20-9-9-20 9-20Z" fill={`url(#${id})`}/>
    <circle cx="48" cy="51" r="20" fill={dark} opacity=".9" stroke={light} strokeWidth="1"/>
    <path d="m48 35 4 9 10 1-8 7 3 10-9-5-9 5 3-10-8-7 10-1Z" fill={light}/>
    <path d="M24 50q-5 14 10 23m-10-14-6-4m9 12-7-1m52-16q5 14-10 23m10-14 6-4m-9 12 7-1" fill="none" stroke={light} strokeWidth="2" strokeLinecap="round"/>
    <path d="M32 73h32l-4 14H36Z" fill={dark} stroke={main}/><text x="48" y="83" textAnchor="middle" fontFamily="sans-serif" fontWeight="800" fontSize="10" fill={light}>{numeral}</text>
  </svg>;
}
