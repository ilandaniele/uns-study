"use client";

import { useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { EmojiPicker } from "./EmojiPicker";
import { insertComposerEmoji } from "./composer-text";

export interface ChatComposerProps {
  maxLength: number;
  placeholder?: string;
  disabled?: boolean;
  onSend: (content: string) => Promise<void>;
  /** Analytics event fired after a successful send (room chat by default, `dm_sent` for DM threads). */
  analyticsEvent?: "chat_message_sent" | "dm_sent" | "group_sent";
  /** "widget" sits inside the floating card, which already clears the safe area. */
  variant?: "page" | "widget";
}

/** Text composer with a character counter, shared by the room chat and DM threads. */
export function ChatComposer({ maxLength, placeholder = "Escribí un mensaje…", disabled, onSend, analyticsEvent = "chat_message_sent", variant = "page" }: ChatComposerProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const trimmed = value.trim();

  function insertEmoji(emoji: string) {
    const result = insertComposerEmoji(value, emoji, input.current?.selectionStart ?? value.length, input.current?.selectionEnd ?? value.length, maxLength);
    setValue(result.value);
    requestAnimationFrame(() => {
      input.current?.focus({ preventScroll: true });
      input.current?.setSelectionRange(result.caret, result.caret);
    });
  }

  async function handleSubmit() {
    if (!trimmed || sending || disabled) return;
    setSending(true);
    try {
      await onSend(trimmed);
      trackEvent(analyticsEvent);
      setValue("");
    } catch {
      // onSend surfaces the error itself; keep the typed text so it can be retried.
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`sticky bottom-0 flex items-start gap-2 border-t border-app bg-surface p-3 ${variant === "widget" ? "pb-3" : "pb-safe sm:pb-3"}`}>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-11 items-start rounded-2xl border border-app bg-surface-2 pl-1 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <EmojiPicker label="Agregar emoji al mensaje" variant="message" disabled={disabled || sending} onSelect={insertEmoji} />
        <textarea
          ref={input}
          value={value}
          onChange={(event) => setValue(event.target.value.slice(0, maxLength))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={1}
          aria-label="Mensaje"
          disabled={disabled || sending}
          className="min-h-11 min-w-0 flex-1 resize-none bg-transparent py-3 pr-3 text-base leading-5 text-main outline-none disabled:opacity-50 sm:text-sm"
        />
        </div>
        <p className="mt-1 text-right text-xs text-muted">
          {value.length}/{maxLength}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={!trimmed || sending || disabled}
        className="min-h-11 shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
      >
        Enviar
      </button>
    </div>
  );
}
