"use client";

import { CaretDownIcon, ChatCircleDotsIcon } from "@phosphor-icons/react/dist/ssr";
import { FeedbackForm } from "./FeedbackForm";

export function RoomFeedbackCard() {
  return <details className="group rounded-2xl border border-app bg-surface px-4">
    <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
      <ChatCircleDotsIcon aria-hidden="true" size={23} className="shrink-0 text-primary" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Dejanos tu sugerencia</span><span className="mt-0.5 block text-xs text-muted">Tu idea nos ayuda a mejorar la sala.</span></span>
      <CaretDownIcon aria-hidden="true" size={17} className="shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
    </summary>
    <div className="pb-4"><FeedbackForm compact /></div>
  </details>;
}
