"use client";

/** The only module that knows Google Publisher Tag. Everything else talks to `AdProvider`. */

import { trackEvent } from "@/lib/analytics";
import { markShown } from "./ad-policy";
import type { RewardOutcome } from "./ad-provider";

const GPT_SRC = "https://securepubads.g.doubleclick.net/tag/js/gpt.js";
const REWARDED_READY_TIMEOUT_MS = 10_000;

interface GptSlot {
  addService(service: GptPubAds): GptSlot;
}

interface GptPubAds {
  addEventListener(type: string, listener: (e: GptEvent) => void): void;
  removeEventListener(type: string, listener: (e: GptEvent) => void): void;
}

interface GptEvent {
  slot: GptSlot;
  isEmpty?: boolean;
  makeRewardedVisible?: () => boolean;
}

interface GoogleTag {
  cmd: Array<() => void>;
  apiReady?: boolean;
  enums: { OutOfPageFormat: { REWARDED: number; INTERSTITIAL: number } };
  defineOutOfPageSlot(path: string, format: number): GptSlot | null;
  pubads(): GptPubAds;
  enableServices(): void;
  display(slot: GptSlot): void;
  destroySlots(slots?: GptSlot[]): boolean;
}

declare global {
  interface Window {
    googletag?: GoogleTag | { cmd: Array<() => void> };
  }
}

let loadPromise: Promise<boolean> | null = null;
// Registered once per page session. A user who subscribes mid-session can still see an interstitial that was
// already registered before upgrading, until the next reload; accepted (ad-free gating applies to new ads).
let interstitialRegistered = false;

function gt(): GoogleTag {
  return window.googletag as GoogleTag;
}

/** Injects gpt.js once. Resolves false when it cannot load (blocked, offline). */
export function loadGpt(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (loadPromise) return loadPromise;
  window.googletag = window.googletag ?? { cmd: [] };
  loadPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = GPT_SRC;
    script.onload = () => resolve(true);
    script.onerror = () => {
      loadPromise = null;
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

/** Runs `fn` once GPT is ready (immediately if it already is). */
function whenReady(fn: () => void): void {
  window.googletag = window.googletag ?? { cmd: [] };
  window.googletag.cmd.push(fn);
}

export function requestRewarded(unitPath: string): Promise<RewardOutcome> {
  return new Promise<RewardOutcome>((resolve) => {
    whenReady(() => {
      const g = gt();
      const slot = g.defineOutOfPageSlot(unitPath, g.enums.OutOfPageFormat.REWARDED);
      // A null slot means the rewarded format is unsupported on this page or device.
      if (!slot) {
        resolve("unavailable");
        return;
      }
      const pubads = g.pubads();
      let granted = false;
      let ready = false;
      let settled = false;
      const listeners: Array<[string, (e: GptEvent) => void]> = [];

      const finish = (outcome: RewardOutcome) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        for (const [type, fn] of listeners) pubads.removeEventListener(type, fn);
        g.destroySlots([slot]);
        resolve(outcome);
      };
      const listen = (type: string, fn: (e: GptEvent) => void) => {
        const wrapped = (e: GptEvent) => {
          if (e.slot === slot) fn(e);
        };
        listeners.push([type, wrapped]);
        pubads.addEventListener(type, wrapped);
      };
      const timer = window.setTimeout(() => {
        if (!ready) finish("unavailable");
      }, REWARDED_READY_TIMEOUT_MS);

      slot.addService(pubads);
      listen("rewardedSlotReady", (e) => {
        ready = true;
        window.clearTimeout(timer);
        e.makeRewardedVisible?.();
      });
      listen("rewardedSlotGranted", () => {
        granted = true;
      });
      listen("rewardedSlotClosed", () => finish(granted ? "granted" : "closed"));
      listen("slotRenderEnded", (e) => {
        if (e.isEmpty) finish("unavailable");
      });
      g.enableServices();
      g.display(slot);
    });
  });
}

/**
 * Registers the GAM web interstitial. Google renders it on the visitor's next navigation, with
 * its own frequency control; it cannot be triggered on demand. At most once per page load.
 */
export function registerInterstitial(unitPath: string): Promise<"registered" | "unavailable"> {
  if (interstitialRegistered) return Promise.resolve("registered");
  return new Promise((resolve) => {
    whenReady(() => {
      const g = gt();
      const slot = g.defineOutOfPageSlot(unitPath, g.enums.OutOfPageFormat.INTERSTITIAL);
      if (!slot) {
        resolve("unavailable");
        return;
      }
      interstitialRegistered = true;
      const pubads = g.pubads();
      pubads.addEventListener("slotOnload", (e) => {
        if (e.slot !== slot) return;
        markShown("app_open", Date.now(), window.localStorage);
        trackEvent("ad_impression", { placement: "app_open", provider: "gam" });
      });
      slot.addService(pubads);
      g.enableServices();
      g.display(slot);
      resolve("registered");
    });
  });
}
