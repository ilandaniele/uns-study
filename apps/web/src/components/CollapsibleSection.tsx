"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  /** Anchor id; a matching URL hash (e.g. `#notificaciones`) opens the section. */
  id?: string;
  /** Extra classes for the wrapper (e.g. red border for destructive sections). */
  className?: string;
  /** Extra classes for the title (e.g. red text). */
  titleClassName?: string;
  children: ReactNode;
};

/** Profile-style section that collapses behind its title, using native `<details>` (no JS state). */
export function CollapsibleSection({ title, description, defaultOpen = false, id, className, titleClassName, children }: Props) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!id) return;
    function openIfHashMatches() {
      if (window.location.hash === `#${id}` && ref.current) {
        ref.current.open = true;
        ref.current.scrollIntoView({ block: "start" });
      }
    }
    openIfHashMatches();
    window.addEventListener("hashchange", openIfHashMatches);
    return () => window.removeEventListener("hashchange", openIfHashMatches);
  }, [id]);

  return (
    <details
      ref={ref}
      id={id}
      open={defaultOpen}
      className={`group scroll-mt-16 ${className ?? "border-t border-app"}`}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-control py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <h2 className={`t-title ${titleClassName ?? ""}`}>{title}</h2>
          {description ? <span className="mt-0.5 block text-xs text-muted">{description}</span> : null}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="pb-6 pt-1">{children}</div>
    </details>
  );
}
