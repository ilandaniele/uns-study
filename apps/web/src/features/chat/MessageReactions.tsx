"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SmileyIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import {
  CHAT_REACTION_EMOJIS,
  SocketEvents,
  type MessageReactionChanged,
  type MessageReactionsDto,
  type ReactionScope,
} from "@sala/contracts";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";

interface ReactionContext {
  counts: MessageReactionsDto;
  pending: Set<string>;
  set: (id: string, emoji: string | null) => Promise<void>;
}
const Context = createContext<ReactionContext | null>(null);
async function read(
  scope: ReactionScope,
  threadId: string,
  ids: string[],
): Promise<MessageReactionsDto> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  const pages = await Promise.all(
    chunks.map((part) =>
      apiFetch<MessageReactionsDto>(
        `/api/v1/message-reactions/${scope}/${threadId}?ids=${part.join(",")}`,
      ),
    ),
  );
  return Object.assign({}, ...pages) as MessageReactionsDto;
}

export function ReactionsProvider({
  scope,
  threadId,
  messageIds,
  children,
}: {
  scope: ReactionScope;
  threadId: string | null;
  messageIds: string[];
  children: ReactNode;
}) {
  const [counts, setCounts] = useState<MessageReactionsDto>({});
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
  const busy = useRef(new Set<string>());
  const known = useRef(new Set<string>());
  const revision = useRef(0);
  const idsKey = messageIds.join(",");
  useEffect(() => {
    if (!threadId || !idsKey) return;
    let cancelled = false;
    const ids = idsKey.split(",");
    const version = revision.current;
    const missing = ids.filter(
      (id) => !known.current.has(`${scope}:${threadId}:${id}`),
    );
    if (missing.length)
      void read(scope, threadId, missing)
        .then((data) => {
          if (!cancelled && version === revision.current) {
            for (const id of missing)
              known.current.add(`${scope}:${threadId}:${id}`);
            setCounts((old) => ({ ...old, ...data }));
          }
        })
        .catch(() => undefined);
    const socket = getSocket();
    const refresh = (event?: MessageReactionChanged) => {
      if (
        event &&
        (event.scope !== scope ||
          event.threadId !== threadId ||
          !ids.includes(event.messageId))
      )
        return;
      const version = revision.current;
      void read(scope, threadId, event ? [event.messageId] : ids)
        .then((data) => {
          if (!cancelled && version === revision.current)
            setCounts((old) => ({ ...old, ...data }));
        })
        .catch(() => undefined);
    };
    const reconnect = () => refresh();
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    socket.on(SocketEvents.MessageReactionChanged, refresh);
    socket.on("connect", reconnect);
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      socket.off(SocketEvents.MessageReactionChanged, refresh);
      socket.off("connect", reconnect);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [scope, threadId, idsKey]);

  async function react(id: string, emoji: string | null) {
    if (!threadId || busy.current.has(id)) return;
    busy.current.add(id);
    revision.current++;
    setPending(new Set(busy.current));
    setError("");
    try {
      const data = await apiFetch<MessageReactionsDto>(
        `/api/v1/message-reactions/${scope}/${threadId}/${id}`,
        { method: "PUT", body: JSON.stringify({ emoji }) },
      );
      setCounts((old) => ({ ...old, ...data }));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se guardó la reacción. Intentá de nuevo.",
      );
    } finally {
      busy.current.delete(id);
      setPending(new Set(busy.current));
    }
  }
  return (
    <Context.Provider value={{ counts, pending, set: react }}>
      {children}
      {error ? (
        <p role="alert" className="px-3 py-2 text-xs text-occupied">
          {error}
        </p>
      ) : null}
    </Context.Provider>
  );
}

export function MessageReactionBar({
  messageId,
  deleted,
}: {
  messageId: string;
  deleted: boolean;
}) {
  const context = useContext(Context);
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    picker.current?.querySelector<HTMLButtonElement>("button")?.focus();
    picker.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    const outside = (event: PointerEvent) => {
      if (
        !picker.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  if (!context || deleted) return null;
  const counts = context.counts[messageId] ?? [];
  const mine = counts.find((c) => c.mine)?.emoji;
  const pending = context.pending.has(messageId);
  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-1"
      aria-label="Reacciones del mensaje"
    >
      {counts.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={pending}
          aria-pressed={r.mine}
          aria-label={`${r.emoji}, ${r.count} ${r.count === 1 ? "reacción" : "reacciones"}${r.mine ? ", tu reacción" : ""}`}
          onClick={() => void context.set(messageId, r.mine ? null : r.emoji)}
          className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border px-2 text-sm disabled:opacity-50 ${r.mine ? "border-[var(--primary)] bg-primary/10" : "border-app bg-surface"}`}
        >
          <span aria-hidden="true">{r.emoji}</span>
          <span aria-hidden="true" className="text-xs">
            {r.count}
          </span>
        </button>
      ))}
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-expanded={open}
        aria-label="Reaccionar al mensaje"
        className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 disabled:opacity-50"
      >
        <SmileyIcon size={19} aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={picker}
          role="group"
          aria-label="Elegí una reacción"
          className="basis-full min-w-[194px] rounded-2xl border border-app bg-surface p-2 shadow-sm"
        >
          <div className="grid grid-cols-4">
            {CHAT_REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Reaccionar ${emoji}`}
                aria-pressed={mine === emoji}
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  void context.set(messageId, mine === emoji ? null : emoji);
                  trigger.current?.focus();
                }}
                className="flex min-h-11 min-w-0 items-center justify-center rounded-xl text-xl hover:bg-surface-2"
              >
                {emoji}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
            className="mt-1 flex min-h-11 w-full items-center justify-center gap-2 rounded-full text-xs text-muted"
          >
            <XIcon size={14} aria-hidden="true" />
            Cerrar reacciones
          </button>
        </div>
      ) : null}
    </div>
  );
}
