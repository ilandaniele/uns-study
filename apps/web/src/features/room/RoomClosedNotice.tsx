"use client";

import { ClockIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import type { RoomDto } from "@sala/contracts";
import { ROOM_HOURS_COPY } from "@/features/help/room-hours-copy";

/** Public, persistent notice; its state and reopening time come from the server. */
export function RoomClosedNotice({ room }: { room: RoomDto }) {
  const hours = room.operatingHours;
  if (!hours || hours.open) return null;
  const reopening = hours.nextOpensAt ? new Date(hours.nextOpensAt) : null;
  const confirmed = reopening && Number.isFinite(+reopening);
  const Icon = hours.closure ? WarningCircleIcon : ClockIcon;
  return (
    <section aria-label="Aviso de sala cerrada" role="status"
      className="order-first w-full rounded-2xl border border-primary/40 bg-surface p-4 text-main shadow-sm sm:p-5 lg:col-span-full">
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          <Icon size={26} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="t-label text-primary">Antes de venir</p>
          <h2 className="text-xl font-bold text-main">La sala está cerrada</h2>
          {hours.closure ? <>
            <p className="break-words font-semibold">{hours.closure.title}</p>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">{hours.closure.body}</p>
          </> : <p className="text-sm leading-relaxed text-muted">{ROOM_HOURS_COPY}</p>}
          {confirmed ? <p className="text-sm font-semibold text-main">
            Próxima apertura: <time dateTime={hours.nextOpensAt!}>{new Intl.DateTimeFormat("es-AR", {
              timeZone: room.timezone, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
            }).format(reopening)}</time> <span className="font-normal text-muted">(hora de Bahía Blanca)</span>
          </p> : hours.closure ? <p className="text-sm font-semibold">Hasta nuevo aviso. La reapertura todavía no está confirmada.</p> : null}
          <p className="text-xs leading-relaxed text-muted">Podés seguir consultando la app. Los lugares se podrán marcar cuando la sala abra.</p>
        </div>
      </div>
    </section>
  );
}
