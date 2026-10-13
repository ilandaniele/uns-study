"use client";

import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasInAppHistory } from "@/lib/nav-history";

/** Icon-only back arrow: goes back in-app when there is history, else to `fallbackHref`. */
export function BackButton({ fallbackHref, label = "Volver" }: { fallbackHref: string; label?: string }) {
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
      className="-ml-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control text-main transition-transform duration-150 ease-out hover:bg-[var(--surface-2)] active:scale-[0.96] active:bg-[var(--surface-2)]"
    >
      <ArrowLeftIcon aria-hidden="true" weight="bold" size={20} />
    </Link>
  );
}
