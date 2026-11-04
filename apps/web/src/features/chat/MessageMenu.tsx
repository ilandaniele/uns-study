"use client";

import { DotsThreeVerticalIcon } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";

export interface MessageMenuProps {
  isOwn: boolean;
  onDelete?: () => void;
  onReport?: () => void;
  onBlock?: () => void;
  placement?: "top" | "bottom";
  label?: string;
}

/** Per-message "…" menu: own messages get "Eliminar"; others' get "Reportar" / "Bloquear". */
export function MessageMenu({ isOwn, onDelete, onReport, onBlock, placement = "top", label = "Más opciones" }: MessageMenuProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const itemCount = isOwn || !onBlock ? 1 : 2;

  // The native top layer escapes the card and message scroller's overflow clipping.
  const position = useCallback(() => {
    const anchor = trigger.current?.getBoundingClientRect();
    const menu = popup.current;
    if (!anchor || !menu) return;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const menuWidth = menu.offsetWidth || Math.min(176, width - 16);
    const menuHeight = menu.offsetHeight || itemCount * 44;
    const above = anchor.top - menuHeight - 4;
    const below = anchor.bottom + 4;
    const preferred = placement === "bottom"
      ? (below + menuHeight <= top + height - 8 ? below : above)
      : (above >= top + 8 ? above : below);
    menu.style.left = `${Math.max(left + 8, Math.min(anchor.right - menuWidth, left + width - menuWidth - 8))}px`;
    menu.style.top = `${Math.max(top + 8, Math.min(preferred, top + height - menuHeight - 8))}px`;
  }, [itemCount, placement]);

  useLayoutEffect(() => {
    if (!open) return;
    position();
    popup.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const dismiss = (event: Event) => {
      if (!popup.current?.contains(event.target as Node)) popup.current?.hidePopover();
    };
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    document.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
      document.removeEventListener("scroll", dismiss, true);
    };
  }, [open, position]);

  function close() {
    popup.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        popoverTarget={id}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative inline-flex shrink-0 items-center justify-center rounded-full text-muted hover:bg-[var(--surface-2)] hover:text-main ${placement === "bottom" ? "min-h-11 min-w-11" : "h-8 w-8"}`}
      >
        <DotsThreeVerticalIcon aria-hidden="true" size={18} weight="bold" />
      </button>
      <div ref={popup} id={id} popover="auto" role="menu" aria-label={label}
        onBeforeToggle={event => { if (event.newState === "open") position(); }}
        onToggle={event => setOpen(event.newState === "open")}
        onKeyDown={event => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          } else if (event.key === "Tab") {
            close();
          } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
              : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }
        }}
        className="fixed inset-auto m-0 w-44 max-w-[calc(100vw-16px)] overflow-hidden rounded-2xl border border-app bg-surface text-sm shadow-lg">
        {isOwn ? (
          <MenuItem
            label="Eliminar"
            onClick={() => {
              close();
              onDelete?.();
            }}
            danger
          />
        ) : (
          <>
            <MenuItem
              label="Reportar"
              onClick={() => {
                close();
                onReport?.();
              }}
            />
            {onBlock ? (
              <MenuItem
                label="Bloquear"
                onClick={() => {
                  close();
                  onBlock();
                }}
                danger
              />
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`block min-h-11 w-full px-4 py-2 text-left hover:bg-[var(--surface-2)] focus-visible:bg-[var(--surface-2)] ${danger ? "text-red-600" : "text-main"}`}
    >
      {label}
    </button>
  );
}
