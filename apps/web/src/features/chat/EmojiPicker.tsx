"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { DotsThreeIcon, SmileyIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { CHAT_REACTION_EMOJIS } from "@sala/contracts";

/** Native top-layer popover: it stays above the chat scroller without moving messages. */
export function EmojiPicker({ label, variant = "reaction", disabled, selected, onSelect }: {
  label: string;
  variant?: "reaction" | "message";
  disabled?: boolean;
  selected?: string;
  onSelect: (emoji: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(variant === "message");

  const position = useCallback(() => {
    const anchor = trigger.current?.getBoundingClientRect();
    const menu = popup.current;
    if (!anchor || !menu) return;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const bounds = menu.getBoundingClientRect();
    // Before the native opening event the box is hidden; use its fixed grid dimensions.
    const menuWidth = bounds.width || Math.min(expanded ? 236 : 276, width - 16);
    const menuHeight = bounds.height || (expanded ? 226 : 58);
    menu.style.left = `${Math.max(left + 8, Math.min(anchor.right - menuWidth, left + width - menuWidth - 8))}px`;
    const above = anchor.top - menuHeight - 8;
    menu.style.top = `${Math.max(top + 8, Math.min(above >= top + 8 ? above : anchor.bottom + 8, top + height - menuHeight - 8))}px`;
  }, [expanded]);

  useLayoutEffect(() => {
    if (!open) return;
    position();
    popup.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const dismiss = (event: Event) => {
      if (!popup.current?.contains(event.target as Node)) popup.current?.hidePopover();
    };
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    document.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
      document.removeEventListener("scroll", dismiss, true);
    };
  }, [open, position]);

  function choose(emoji: string) {
    popup.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
    onSelect(emoji);
  }

  return <>
    <button ref={trigger} type="button" popoverTarget={id} disabled={disabled}
      aria-label={label} title={label} aria-expanded={open} aria-haspopup="dialog"
      className={variant === "message"
        ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-primary disabled:opacity-40"
        : "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted before:absolute before:-inset-1.5 before:content-[''] hover:bg-surface-2 hover:text-primary disabled:opacity-40"}>
      <SmileyIcon size={variant === "message" ? 23 : 18} aria-hidden="true" />
    </button>
    <div ref={popup} id={id} popover="auto" role="dialog"
      aria-label={variant === "message" ? "Emojis para el mensaje" : "Elegí una reacción"}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          popup.current?.hidePopover();
          trigger.current?.focus({ preventScroll: true });
        }
      }}
      onBeforeToggle={event => { if (event.newState === "open") position(); }}
      onToggle={event => {
        const visible = event.newState === "open";
        setOpen(visible);
        if (!visible) setExpanded(variant === "message");
      }}
      className={`fixed inset-auto m-0 max-w-[calc(100vw-16px)] overflow-visible rounded-2xl border border-app bg-surface p-1.5 text-main shadow-xl ${expanded ? "w-[236px]" : "w-[276px]"}`}>
      <>
        {expanded ? <div className="flex h-9 items-center justify-between pl-2 text-xs font-semibold text-muted">
          <span>{variant === "message" ? "Agregar emoji" : "Reaccionar"}</span>
          <button type="button" onClick={() => popup.current?.hidePopover()} aria-label="Cerrar emojis" className="relative flex h-8 w-8 items-center justify-center rounded-full before:absolute before:-inset-1.5 before:content-[''] hover:bg-surface-2"><XIcon size={16} aria-hidden="true" /></button>
        </div> : null}
        <div className={`grid ${expanded ? "grid-cols-5" : "grid-cols-6"}`}>
          {(expanded ? CHAT_REACTION_EMOJIS : CHAT_REACTION_EMOJIS.slice(0, 5)).map(emoji =>
            <button key={emoji} type="button" aria-label={`${variant === "message" ? "Insertar" : "Reaccionar"} ${emoji}`}
              aria-pressed={variant === "reaction" ? selected === emoji : undefined} disabled={disabled}
              onClick={() => choose(emoji)} className="flex h-11 min-w-0 items-center justify-center rounded-xl text-xl hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary">
              {emoji}
            </button>)}
          {!expanded ? <button type="button" aria-label="Más emojis" onClick={() => setExpanded(true)} className="flex h-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2"><DotsThreeIcon size={23} weight="bold" aria-hidden="true" /></button> : null}
        </div>
      </>
    </div>
  </>;
}
