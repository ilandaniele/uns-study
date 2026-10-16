"use client";

import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react/dist/ssr";
import { SocketEvents } from "@sala/contracts/events";
import type { GroupFocusDto, GroupPresenceDto } from "@sala/contracts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { apiDelete, apiFetch, apiPost, apiPut, enc, isProRequired } from "@/features/pro/pro-api";
import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { usePro } from "@/features/subscriptions/usePro";
import { getSocket } from "@/lib/socket";
import { FOCUS_CHIPS, FOCUS_MAX_MINUTES, FOCUS_MIN_MINUTES, formatCountdown, parseFocusMinutes, remainingMs } from "./group-focus";
import { formatMessageTime } from "./grouping";

const REFRESH_MS = 60_000;

export interface GroupStudyPanelProps {
  groupId: string;
  currentUserId: string;
}

/** Collapsible "Dónde está mi grupo": who is seated where, the seat-share opt-out and a shared focus timer. */
export function GroupStudyPanel({ groupId, currentUserId }: GroupStudyPanelProps) {
  const { lock } = usePro();
  const [open, setOpen] = useState(false);
  const [presence, setPresence] = useState<GroupPresenceDto | null>(null);
  // Null until known: free users cannot read presence, so they cannot learn whether they already opted out.
  const [shareChoice, setShareChoice] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const unlocked = lock === "unlocked";
  const sharing = presence?.sharing ?? shareChoice;
  const focus: GroupFocusDto | null = presence?.focus ?? null;
  const left = remainingMs(focus, now);
  const running = focus !== null && left > 0;

  const load = useCallback(() => {
    apiFetch<GroupPresenceDto>(`/api/v1/groups/${enc(groupId)}/presence`)
      .then((next) => {
        setPresence(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!isProRequired(err)) setError("No pudimos cargar dónde está tu grupo.");
      });
  }, [groupId]);

  // Reads are free: load on open, refresh every minute while visible, and on any group update for this group.
  useEffect(() => {
    if (!open || !unlocked) return;
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    const socket = getSocket();
    const onUpdated = (payload?: { groupId?: string }) => {
      if (!payload || payload.groupId === groupId) load();
    };
    socket.on(SocketEvents.GroupUpdated, onUpdated);
    return () => {
      window.clearInterval(timer);
      socket.off(SocketEvents.GroupUpdated, onUpdated);
    };
  }, [open, unlocked, groupId, load]);

  // Tick once a second only while a countdown is on screen.
  useEffect(() => {
    if (!open || !running) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [open, running]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (isProRequired(err)) openProUpsell("group_study");
      else setError("No pudimos completar la acción. Probá de nuevo en un rato.");
    } finally {
      setBusy(false);
    }
  }

  function setShare(share: boolean) {
    void run(async () => {
      await apiPut(`/api/v1/groups/${enc(groupId)}/seat-share`, { share });
      setShareChoice(share);
      setPresence((p) => (p ? { ...p, sharing: share } : p));
      if (unlocked) load();
    });
  }

  function startFocus(minutes: number) {
    void run(async () => {
      const started = await apiPost<GroupFocusDto>(`/api/v1/groups/${enc(groupId)}/focus`, { minutes });
      setNow(Date.now());
      setPresence((p) => (p ? { ...p, focus: started } : p));
    });
  }

  function stopFocus() {
    void run(async () => {
      await apiDelete(`/api/v1/groups/${enc(groupId)}/focus`);
      setPresence((p) => (p ? { ...p, focus: null } : p));
    });
  }

  const customValue = parseFocusMinutes(customMinutes);

  return (
    <section aria-label="Dónde está mi grupo" className="border-b border-app bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-sm font-semibold text-main hover:bg-[var(--surface-2)]"
      >
        Dónde está mi grupo
        {open ? <CaretUpIcon aria-hidden="true" weight="bold" size={14} /> : <CaretDownIcon aria-hidden="true" weight="bold" size={14} />}
      </button>

      {open ? (
        <div className="flex flex-col gap-3 px-4 pb-3">
          {unlocked ? (
            presence === null ? (
              <p className="text-sm text-muted">{error ?? "Cargando…"}</p>
            ) : presence.members.length === 0 ? (
              <p className="text-sm text-muted">Nadie del grupo está sentado en este momento.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {presence.members.map((member) => (
                  <li key={member.userId} className="flex items-center gap-2">
                    <Avatar userId={member.userId} name={member.displayName} url={member.avatarUrl} aliasAnimal={member.aliasAnimal} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-main">
                        <Link href={`/u/${member.userId}`} className="hover:underline">
                          {member.userId === currentUserId ? "Vos" : member.displayName}
                        </Link>
                      </p>
                      <p className="truncate text-xs text-muted">
                        <Link href={`/sala/${member.roomSlug}?seat=${member.seatId}`} className="hover:underline">
                          {member.roomName} · {member.seatLabel}
                        </Link>{" "}
                        · desde {formatMessageTime(member.since)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : lock === "locked" ? (
            <button
              type="button"
              onClick={() => openProUpsell("group_study")}
              className="self-start rounded-control border border-app bg-surface min-h-11 px-3.5 text-sm font-semibold text-main hover:bg-[var(--surface-2)]"
            >
              Ver dónde se sentó tu grupo y compartir un temporizador (Pro)
            </button>
          ) : null}

          <div className="flex flex-col gap-1.5">
            {sharing === null ? (
              <>
                <p className="text-sm font-medium text-main">Compartir mi lugar con este grupo</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setShare(true)}
                    className="min-h-11 rounded-control border border-app px-3.5 text-sm font-semibold text-main hover:bg-[var(--surface-2)] disabled:opacity-50"
                  >
                    Compartir
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setShare(false)}
                    className="min-h-11 rounded-control border border-app px-3.5 text-sm font-semibold text-main hover:bg-[var(--surface-2)] disabled:opacity-50"
                  >
                    No compartir
                  </button>
                </div>
              </>
            ) : (
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-main">
                <input type="checkbox" checked={sharing} disabled={busy} onChange={(e) => setShare(e.target.checked)} className="h-4 w-4" />
                Compartir mi lugar con este grupo
              </label>
            )}
            <p className="text-xs text-muted">Solo lo ven integrantes del grupo y únicamente mientras tenés un check-in activo.</p>
          </div>

          {unlocked ? (
            <div className="flex flex-col gap-2 rounded-float border border-app p-3">
              <p className="text-sm font-semibold text-main">Temporizador compartido</p>
              {running ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-2xl font-semibold text-main" role="timer" aria-live="off">
                    {formatCountdown(left)}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={stopFocus}
                    className="min-h-11 rounded-control border border-app px-3.5 text-sm font-semibold text-main hover:bg-[var(--surface-2)] disabled:opacity-50"
                  >
                    Detener
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {FOCUS_CHIPS.map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        disabled={busy}
                        onClick={() => startFocus(minutes)}
                        className="min-h-11 rounded-full border border-app px-3.5 text-sm font-semibold text-main hover:bg-[var(--surface-2)] disabled:opacity-50"
                      >
                        {minutes} min
                      </button>
                    ))}
                  </div>
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (customValue !== null) startFocus(customValue);
                    }}
                  >
                    <input
                      type="number"
                      inputMode="numeric"
                      min={FOCUS_MIN_MINUTES}
                      max={FOCUS_MAX_MINUTES}
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(e.target.value)}
                      placeholder={`${FOCUS_MIN_MINUTES}-${FOCUS_MAX_MINUTES} min`}
                      aria-label="Minutos del temporizador"
                      className="min-h-11 w-28 rounded-control border border-app bg-surface px-3 text-sm text-main"
                    />
                    <button
                      type="submit"
                      disabled={busy || customValue === null}
                      className="min-h-11 rounded-control border border-app px-3.5 text-sm font-semibold text-main hover:bg-[var(--surface-2)] disabled:opacity-50"
                    >
                      Empezar
                    </button>
                  </form>
                </>
              )}
            </div>
          ) : null}

          {error && presence !== null ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
