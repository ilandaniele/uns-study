"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, DotsThreeIcon, UserPlusIcon } from "@phosphor-icons/react/dist/ssr";
import type { FriendStateDto, FriendTarget } from "@sala/contracts";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { useMe } from "@/lib/me-store";
import { notifyFriendsChanged, useFriendRefresh } from "./useFriendRefresh";

type Props = { target: FriendTarget; name: string; initial?: FriendStateDto };
export function FriendAction(props: Props) {
  const { me } = useMe();
  if (!me?.user || (props.target.kind === "user" && props.target.userId === me.user.id)) return null;
  return <Action key={`${me.user.id}:${JSON.stringify(props.target)}:${props.initial?.state}:${props.initial?.friendshipId}`} {...props}/>;
}

function Action({ target, name, initial }: Props) {
  const [state, setState] = useState<FriendStateDto | null>(initial ?? null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [blockConfirm, setBlockConfirm] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const busy = useRef(false), sequence = useRef(0);
  const alive = useRef(true);
  const invalidate = useCallback(() => { sequence.current++; alive.current = false; }, []);
  const targetJson = JSON.stringify(target);
  const refresh = useCallback(() => {
    const request = ++sequence.current;
    void apiFetch<FriendStateDto>("/api/v1/me/friends/state", { method: "POST", body: JSON.stringify({ target: JSON.parse(targetJson) }) })
      .then(dto => { if (request === sequence.current) { setState(dto); setError(""); setUnavailable(false); } })
      .catch(e => { if (request === sequence.current) { setUnavailable(e instanceof ApiRequestError && e.status === 404); setError("No pudimos cargar la amistad. Volvé a probar."); } });
  }, [targetJson]);
  useEffect(() => { alive.current = true; if (!initial) refresh(); return invalidate; }, [initial, refresh, invalidate]);
  useFriendRefresh(refresh, !initial && !unavailable);

  async function act(action: "SEND" | "ACCEPT" | "DECLINE" | "REMOVE" | "BLOCK") {
    if (busy.current || !state) return;
    busy.current = true; sequence.current++; setPending(true); setError("");
    try {
      if (action === "SEND") {
        const result = await apiFetch<FriendStateDto>("/api/v1/me/friends/requests", { method: "POST", body: JSON.stringify({ target }) });
        if (!alive.current) return;
        setState(result);
      } else {
        const id = state.friendshipId;
        if (!id) return;
        await apiFetch(action === "BLOCK" ? `/api/v1/me/friends/${id}/block` : action === "REMOVE" ? `/api/v1/me/friends/${id}` : `/api/v1/me/friends/requests/${id}/respond`, {
          method: action === "REMOVE" ? "DELETE" : "POST", ...(action === "REMOVE" || action === "BLOCK" ? {} : { body: JSON.stringify({ action }) }),
        });
        if (!alive.current) return;
        setState(action === "ACCEPT" ? { state: "FRIENDS", friendshipId: id, canRequest: false, retryAt: null } : { state: "NONE", friendshipId: null, canRequest: false, retryAt: new Date(Date.now() + 86_400_000).toISOString() });
        if (action === "BLOCK") setUnavailable(true);
      }
      setConfirm(false); setBlockConfirm(false); notifyFriendsChanged();
      if (!initial && action !== "BLOCK") refresh();
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "No pudimos guardar el cambio. Probá de nuevo."); }
    finally { busy.current = false; if (alive.current) setPending(false); }
  }

  if (unavailable || state?.state === "SELF") return null;
  const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-app px-4 text-sm font-semibold disabled:opacity-50";
  return <div role="group" className="max-w-full space-y-2" aria-label={`Amistad con ${name}`}>
    <div className="flex flex-wrap items-start gap-2">
    {!state ? error ? <button className={button} onClick={refresh}>Reintentar amistad</button> : <span className="text-xs text-muted">Cargando…</span>
      : state.state === "NONE" ? <><button type="button" className={`${button} text-primary`} disabled={pending || !state.canRequest} onClick={() => void act("SEND")}><UserPlusIcon size={18} aria-hidden="true"/>{pending ? "Enviando…" : "Agregar a amigos"}</button>{!state.canRequest ? <p className="max-w-64 text-xs text-muted">{state.retryAt ? "Podés volver a enviar una solicitud después de 24 horas." : "No recibe solicitudes de amistad."}</p> : null}</>
      : state.state === "OUTGOING" ? <button type="button" className={`${button} text-muted`} disabled={pending} onClick={() => void act("REMOVE")}>{pending ? "Cancelando…" : "Cancelar solicitud"}</button>
      : state.state === "INCOMING" ? <div className="flex flex-wrap gap-2"><button type="button" disabled={pending} className={`${button} bg-primary text-white`} onClick={() => void act("ACCEPT")}>Aceptar</button><button type="button" disabled={pending} className={button} onClick={() => void act("DECLINE")}>Rechazar</button></div>
      : <><button type="button" className={`${button} text-primary`} aria-expanded={confirm} disabled={pending} onClick={() => setConfirm(value => !value)}><CheckIcon size={18} aria-hidden="true"/>Amigos</button>{confirm ? <div className="rounded-xl border border-app bg-surface-2 p-3 text-sm"><p>¿Quitar a {name} de tus amigos?</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={pending} className={`${button} text-red-500`} onClick={() => void act("REMOVE")}>Quitar amistad</button><button type="button" disabled={pending} className={button} onClick={() => setConfirm(false)}>Cancelar</button></div></div> : null}</>}
    {state?.friendshipId ? <details className="relative"><summary aria-label={`Más opciones de amistad con ${name}`} className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-app [&::-webkit-details-marker]:hidden"><DotsThreeIcon aria-hidden="true" size={22}/></summary><div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-xl border border-app bg-surface p-2 shadow-lg"><button type="button" disabled={pending} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); setBlockConfirm(true); }} className="min-h-11 w-full rounded-lg px-3 text-left text-sm text-red-500">Bloquear persona</button></div></details> : null}
    </div>
    {blockConfirm ? <div className="max-w-sm rounded-xl border border-app bg-surface-2 p-3 text-sm"><p>¿Bloquear a {name}? Se eliminará la amistad y no podrá enviarte solicitudes.</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={() => void act("BLOCK")} className={`${button} text-red-500`}>Confirmar bloqueo</button><button type="button" disabled={pending} className={button} onClick={() => setBlockConfirm(false)}>Cancelar</button></div></div> : null}
    <div aria-live="polite">{error ? <p role="alert" className="max-w-72 text-xs text-red-500">{error}</p> : null}</div>
  </div>;
}
