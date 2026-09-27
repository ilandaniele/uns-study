"use client";

import { useState } from "react";

export interface ChatComposerProps {
  maxLength: number;
  placeholder?: string;
  disabled?: boolean;
  onSend: (content: string) => Promise<void>;
}

/** Text composer with a character counter, shared by the room chat and DM threads. */
export function ChatComposer({ maxLength, placeholder = "Escribí un mensaje…", disabled, onSend }: ChatComposerProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const trimmed = value.trim();

  async function handleSubmit() {
    if (!trimmed || sending || disabled) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setValue("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="sticky bottom-0 flex items-end gap-2 border-t border-slate-200 bg-white p-3 pb-safe sm:pb-3">
      <div className="flex-1">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value.slice(0, maxLength))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={1}
          disabled={disabled}
          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-primary focus:outline-none disabled:opacity-50 sm:text-sm"
        />
        <p className="mt-1 text-right text-xs text-slate-400">
          {value.length}/{maxLength}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={!trimmed || sending || disabled}
        className="min-h-11 shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
      >
        Enviar
      </button>
    </div>
  );
}
