/**
 * Minimal GA4 loader, only active when `NEXT_PUBLIC_GA_ID` is set. No consent banner needed:
 * `anonymize_ip` is enabled and no advertising/personalization signals are sent.
 */

/** Public GA4 measurement ID of the production property; only used on the production host. */
const PROD_GA_ID = "G-63PGVEW5T2";
const PROD_HOST = "uns-study.vercel.app";

const GA_ID =
  process.env.NEXT_PUBLIC_GA_ID ||
  (typeof window !== "undefined" && window.location.hostname === PROD_HOST ? PROD_GA_ID : undefined);

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
  | "qr_scan";

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
  window.gtag("config", GA_ID, { anonymize_ip: true });
}

/** Sends a GA4 event. No-op when analytics isn't loaded (GA_ID unset). */
export function trackEvent(name: AnalyticsEvent, params?: Record<string, string | number | boolean>): void {
  if (!GA_ID || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", name, params);
}
