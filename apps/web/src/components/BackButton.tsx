"use client";

import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasInAppHistory, markBackFallback } from "@/lib/nav-history";

/** Back pops a known app entry; direct-entry fallbacks replace rather than append. */
export function BackButton({ fallbackHref, label = "Volver", showLabel = false, matchFallback = false }: { fallbackHref: string; label?: string; showLabel?: boolean; matchFallback?: boolean }) {
  const router = useRouter();
  return (
    <Link
      href={fallbackHref}
      replace
      aria-label={label}
      title={showLabel ? undefined : label}
      onNavigate={(event) => {
        if (hasInAppHistory(matchFallback ? fallbackHref : undefined)) {
          event.preventDefault();
          router.back();
        } else markBackFallback(fallbackHref);
      }}
      className={`group inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:text-main focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary ${showLabel ? "gap-2.5 pr-3 text-sm font-semibold" : "-ml-2 hover:bg-surface-2"}`}
    >
      <span aria-hidden="true" className={`flex size-9 shrink-0 items-center justify-center rounded-full ${showLabel ? "border border-app bg-surface transition-colors group-hover:border-primary group-hover:bg-surface-2" : ""}`}><ArrowLeftIcon weight="bold" size={18} /></span>
      {showLabel ? <span>{label}</span> : null}
    </Link>
  );
}
