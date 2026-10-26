"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EmojiPicker } from "./EmojiPicker";
import {
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

export function MessageReactionButton({ messageId, deleted }: { messageId: string; deleted: boolean }) {
  const context = useContext(Context);
  if (!context || deleted) return null;
  const mine = context.counts[messageId]?.find(reaction => reaction.mine)?.emoji;
  return <EmojiPicker label="Reaccionar al mensaje" selected={mine} disabled={context.pending.has(messageId)}
    onSelect={emoji => void context.set(messageId, mine === emoji ? null : emoji)} />;
}

export function MessageReactionBar({ messageId, deleted }: { messageId: string; deleted: boolean }) {
  const context = useContext(Context);
  const counts = context?.counts[messageId] ?? [];
  if (!context || deleted || !counts.length) return null;
  return <div className="mt-1 flex flex-wrap gap-1.5" aria-label="Reacciones del mensaje">
    {counts.map(reaction => <button key={reaction.emoji} type="button" disabled={context.pending.has(messageId)}
      aria-pressed={reaction.mine}
      aria-label={`${reaction.emoji}, ${reaction.count} ${reaction.count === 1 ? "reacción" : "reacciones"}${reaction.mine ? ", tu reacción" : ""}`}
      onClick={() => void context.set(messageId, reaction.mine ? null : reaction.emoji)}
      className={`relative inline-flex min-h-8 items-center justify-center gap-1 rounded-full border px-2 text-sm before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] disabled:opacity-50 ${reaction.mine ? "border-primary/40 bg-primary/10" : "border-app bg-surface"}`}>
      <span aria-hidden="true">{reaction.emoji}</span><span aria-hidden="true" className="text-[11px] font-semibold">{reaction.count}</span>
    </button>)}
  </div>;
}
