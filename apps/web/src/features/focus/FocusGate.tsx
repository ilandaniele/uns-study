"use client";

import { CheckIcon, CrownSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { useMe } from "@/lib/me-store";
import { PRO_FEATURES, proLockState, type ProFeatureId } from "@/features/subscriptions/pro";
import { ProBadge } from "@/features/subscriptions/ProBadge";
import { FocusView } from "./FocusView";

const TEASER_FEATURES: ProFeatureId[] = ["focus_custom", "focus_sounds", "focus_pip", "focus_stats"];

/** /foco is a Pro feature: subscribers get the timer, everyone else a locked preview. */
export function FocusGate() {
  const { me, loading } = useMe();
  const lock = proLockState(me, loading);
  if (lock === "unlocked") return <FocusView />;
  if (lock === "unknown" && loading) return <FocusSkeleton />;
  return <FocusLocked signedIn={!!me?.user} canSubscribe={me?.subscriptionsEnabled ?? false} priceArs={me?.subscriptionPriceArs} />;
}

function FocusSkeleton() {
  return (
    <main aria-busy="true" className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-24 pt-6 md:pb-10">
      <div className="h-8 w-32 animate-pulse rounded-control bg-surface-2" />
      <div className="h-80 animate-pulse rounded-control border border-app bg-surface" />
    </main>
  );
}

function FocusLocked({ signedIn, canSubscribe, priceArs }: { signedIn: boolean; canSubscribe: boolean; priceArs?: number }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-24 pt-6 md:pb-10">
      <div className="flex items-start gap-1">
        <BackButton fallbackHref="/" />
        <div className="flex flex-col gap-1">
          <h1 className="t-heading flex items-center gap-2">
            Foco <ProBadge inline />
          </h1>
          <p className="text-sm text-muted">{PRO_FEATURES.focus.description}</p>
        </div>
      </div>

      <section aria-labelledby="focus-locked-title" className="relative overflow-hidden rounded-control border border-app bg-surface">
        {/* Blurred stand-in for the timer, so the page shows what Pro unlocks. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex select-none flex-col items-center justify-center gap-5 px-4 opacity-50 blur-[3px]">
          <div className="flex gap-2">
            {["Foco", "Pausa corta", "Pausa larga"].map((l, i) => (
              <span key={l} className={`rounded-full border border-app px-3 py-1 text-xs font-semibold ${i === 0 ? "bg-primary text-white" : "text-muted"}`}>
                {l}
              </span>
            ))}
          </div>
          <span className="font-mono text-7xl font-bold tracking-tight text-main sm:text-8xl">25:00</span>
          <span className="h-11 w-36 rounded-control bg-primary" />
        </div>

        <div className="relative flex min-h-80 items-center justify-center bg-[color-mix(in_srgb,var(--surface)_55%,transparent)] px-4 py-8 sm:py-12">
          <div className="w-full max-w-sm rounded-float border border-app bg-surface p-5 shadow-xl">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-primary">
              <CrownSimpleIcon size={20} weight="fill" aria-hidden="true" />
            </span>
            <h2 id="focus-locked-title" className="t-title mt-3">
              Foco es parte de Pro
            </h2>
            <ul className="mt-3 space-y-1.5 text-sm text-main">
              {TEASER_FEATURES.map((id) => (
                <li key={id} className="flex items-start gap-2">
                  <CheckIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                  {PRO_FEATURES[id].title}
                </li>
              ))}
            </ul>
            {canSubscribe && priceArs ? (
              <p className="mt-4 text-xs text-muted">${priceArs.toLocaleString("es-AR")}/mes · cancelás cuando quieras</p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              {canSubscribe ? (
                <Link
                  href="/suscripcion"
                  className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-4 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98]"
                >
                  Hacerme Pro
                </Link>
              ) : null}
              {!signedIn ? (
                <Link
                  href="/login?next=/foco"
                  className="inline-flex min-h-11 items-center justify-center rounded-control border border-app px-4 text-sm font-medium text-main hover:bg-surface-2"
                >
                  Ya soy Pro, iniciar sesión
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
