/**
 * Minimal GA4 loader, only active when `NEXT_PUBLIC_GA_ID` is set. No consent banner needed:
 * `anonymize_ip` is enabled and no advertising/personalization signals are sent.
 */

import { isProductionHost } from "./hosts";

/** Public GA4 measurement ID of the production property; only used on the production host. */
const PROD_GA_ID = "G-63PGVEW5T2";
const GA_ID =
  process.env.NEXT_PUBLIC_GA_ID ||
  (isProductionHost() ? PROD_GA_ID : undefined);

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export type AnalyticsEvent = 
  | "check_in"
  | "observation"
  | "room_view"
  | "chat_message_sent"
  | "dm_sent"
  | "report_submitted"
  | "ranking_view"
  | "study_mode_started"
  | "qr_scan"
  | "ad_impression"
  | "ad_close"
  | "ad_reward";

let loaded = false;

/** Injects the gtag.js script tag once. No-op when `NEXT_PUBLIC_GA_ID` is unset or on the server. */
export function loadAnalytics(): void {
  if (loaded || !GA_ID || typeof document === "undefined") return;
  loaded = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer ?? [];
  // gtag.js only processes `arguments` objects; pushing a plain array silently drops the command.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  window.gtag("js", new Date());
  // Never send the query string: /baja carries a signed unsubscribe token there.
  window.gtag("config", GA_ID, {
    anonymize_ip: true,
    send_page_view: false,
    page_location: cleanLocation(),
  });
}

function cleanLocation(): string {
  return window.location.origin + window.location.pathname;
}

/** Sends a page_view with the query string stripped. No-op when analytics isn't loaded. */
export function trackPageView(): void {
  if (!GA_ID || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "page_view", { page_location: cleanLocation(), page_title: document.title });
}

/** Sends a GA4 event. No-op when analytics isn't loaded (GA_ID unset). */
export function trackEvent(name: AnalyticsEvent, params?: Record<string, string | number | boolean>): void {
  if (!GA_ID || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", name, params);
}
