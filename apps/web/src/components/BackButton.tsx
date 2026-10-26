"use client";

import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasInAppHistory } from "@/lib/nav-history";

/** Goes back in-app when there is history, else to `fallbackHref`. Optionally shows its label. */
export function BackButton({ fallbackHref, label = "Volver", showLabel = false }: { fallbackHref: string; label?: string; showLabel?: boolean }) {
  const router = useRouter();
  return (
    <Link
      href={fallbackHref}
      aria-label={label}
      title={label}
      onClick={(event) => {
        if (!hasInAppHistory()) return;
        event.preventDefault();
        router.back();
      }}
      className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-main transition-transform duration-150 ease-out hover:bg-[var(--surface-2)] active:scale-[0.96] active:bg-[var(--surface-2)] ${showLabel ? "gap-2 rounded-full border border-app bg-surface px-4 text-sm font-semibold" : "-ml-2 rounded-control"}`}
    >
      <ArrowLeftIcon aria-hidden="true" weight="bold" size={20} />
      {showLabel ? <span>{label}</span> : null}
    </Link>
  );
}
