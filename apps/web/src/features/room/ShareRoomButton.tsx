"use client";
import { ShareNetworkIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import type { RoomSummary } from "@sala/contracts";
import { roomShareText } from "./room-tools";

export function ShareRoomButton({
  summary,
  name,
  className = "",
}: {
  summary: RoomSummary;
  name: string;
  className?: string;
}) {
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(id);
  }, [notice]);
  async function share() {
    const text = roomShareText(summary, window.location.href.split("?")[0]!);
    try {
      if (navigator.share) await navigator.share({ title: name, text });
      else {
        await navigator.clipboard.writeText(text);
        setNotice("Enlace copiado");
      }
    } catch (e) {
      if ((e as DOMException).name !== "AbortError")
        setNotice("No se pudo compartir. Podés copiar el enlace de la página.");
    }
  }
  return (
    <div className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => void share()}
        aria-label="Compartir estado de la sala"
        title="Compartir sala"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-app bg-surface text-primary shadow-sm hover:bg-surface-2"
      >
        <ShareNetworkIcon size={21} aria-hidden="true" />
      </button>
      {notice ? (
        <span
          role="status"
          className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-app bg-surface p-3 text-xs shadow-lg"
        >
          {notice}
        </span>
      ) : null}
    </div>
  );
}
