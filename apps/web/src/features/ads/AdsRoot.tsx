"use client";

import { AppOpenInterstitial } from "./AppOpenInterstitial";
import { HouseInterstitial } from "./HouseInterstitial";
import { SideRails } from "./SideRails";

/** Mounted once in the root layout; every ad surface hides itself for subscribers and on excluded routes. */
export function AdsRoot() {
  return (
    <>
      <AppOpenInterstitial />
      <HouseInterstitial />
      <SideRails />
    </>
  );
}
