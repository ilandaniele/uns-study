"use client";

import type { ChatMessageDto } from "@sala/contracts";
import { ChatCircleIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useExitTransition } from "@/lib/useExitTransition";
import { RoomChatPanel } from "./RoomChatPanel";
import { countUnread, formatUnread } from "./unread";
import { useConversations } from "./useConversations";

/** Routes where the floating chat would cover the chat itself or a full-screen form. */
const HIDDEN_PREFIXES = ["/chat", "/login", "/recuperar"];
const LAST_SEEN_KEY = "sala:room-chat-last-seen";

function readLastSeen(): string | null {
  try {
    return window.localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

function writeLastSeen(value: string): void {
  try {
    window.localStorage.setItem(LAST_SEEN_KEY, value);
  } catch {
    // Private mode / blocked storage: the badge just resets on the next load.
  }
}

/**
 * Floating chat bubble, like a messaging app's chat head: a round button at the bottom-right
 * that opens and closes the room's live chat in a card anchored to it. Signed-in users get an
 * unread badge (room messages since they last looked, plus unread private messages), so the
 * chat stays connected in the background while the card is closed.
 */
export function ChatLauncher() {
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id ?? null;
  // Remounting per user resets the unread state on sign-in / sign-out.
  return <Launcher key={userId ?? "anon"} userId={userId} sessionPending={isPending} />;
}

function Launcher({ userId, sessionPending }: { userId: string | null; sessionPending: boolean }) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = useCallback(() => {
    setOpen(false);
    fabRef.current?.focus();
  }, []);
  const { closing, requestClose } = useExitTransition(close);
  const visible = open && !closing;

  const hidden = HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  // Navigating away (e.g. "Privados", a profile link in the chat) closes the card.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  // Unread room messages are counted against the newest message the user has had on screen.
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  // First visit ever: start counting from now instead of flagging the whole history.
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(() =>
    typeof window === "undefined" ? null : (readLastSeen() ?? new Date().toISOString()),
  );

  // Open card, or the full /chat page: everything currently loaded counts as read.
  const reading = visible || pathname === "/chat";
  const newest = messages[messages.length - 1]?.createdAt ?? null;
  if (reading && newest && (lastSeenAt === null || Date.parse(newest) > Date.parse(lastSeenAt))) {
    setLastSeenAt(newest);
  }
  useEffect(() => {
    if (lastSeenAt) writeLastSeen(lastSeenAt);
  }, [lastSeenAt]);

  const roomUnread = reading ? 0 : countUnread(messages, lastSeenAt, userId);
  const [dmUnread, setDmUnread] = useState(0);
  const totalUnread = roomUnread + dmUnread;

  useEffect(() => {
    if (!visible) return;
    panelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [visible, requestClose]);

  // The list was laid out while hidden (no height), so it could not pin itself to the bottom.
  useLayoutEffect(() => {
    if (!open) return;
    const log = panelRef.current?.querySelector<HTMLElement>('[role="log"]');
    if (log) log.scrollTop = log.scrollHeight;
  }, [open]);

  // Keeps counting DMs on /chat routes too, where the bubble itself is hidden.
  const dmWatcher = userId ? <DmUnreadWatcher pathname={pathname} onChange={setDmUnread} /> : null;
  if (hidden) return dmWatcher;

  const showCard = open || closing;
  const fabLabel = visible
    ? "Cerrar chat de la sala"
    : totalUnread > 0
      ? `Abrir chat de la sala, ${totalUnread} mensajes sin leer`
      : "Abrir chat de la sala";

  return (
    <>
      {dmWatcher}
      {showCard ? (
        // Phones: a light scrim so a tap outside closes the card. From `sm:` the card floats freely.
        <div
          aria-hidden="true"
          onClick={requestClose}
          className={`fixed inset-0 z-50 bg-black/30 sm:hidden ${closing ? "backdrop-exit" : "backdrop-enter"}`}
        />
      ) : null}

      {/* Stays mounted while signed in so the chat keeps listening and the badge stays live. */}
      {userId || showCard ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          hidden={!showCard}
          className={`fixed inset-x-3 bottom-[calc(140px+env(safe-area-inset-bottom))] z-50 flex h-[min(600px,calc(100dvh-209px-env(safe-area-inset-bottom)))] min-h-0 origin-bottom-right flex-col overflow-hidden rounded-[12px] border border-app bg-surface shadow-lg outline-none sm:left-auto sm:right-4 sm:w-[380px] lg:right-6 lg:bottom-[92px] lg:h-[min(640px,calc(100dvh-161px))] ${closing ? "chat-pop-exit" : "chat-pop-enter"}`}
        >
          {userId ? (
            <RoomChatPanel
              currentUserId={userId}
              variant="widget"
              titleId={titleId}
              onMessagesChange={setMessages}
              dmUnread={dmUnread}
            />
          ) : (
            <>
              <div className="border-b border-app px-4 py-3">
                <h2
                  id={titleId}
                  className="font-display text-[17px] font-extrabold uppercase leading-none tracking-[0.01em] text-main"
                >
                  # Sala de Estudio
                </h2>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                {sessionPending ? (
                  <p className="text-muted">Cargando…</p>
                ) : (
                  <>
                    <p className="max-w-[28ch] text-sm text-muted">
                      Iniciá sesión para hablar con la gente que está en la sala.
                    </p>
                    <Link
                      href={`/login?next=${encodeURIComponent(pathname)}`}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
                    >
                      Iniciar sesión
                    </Link>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      <button
        ref={fabRef}
        type="button"
        onClick={() => (open ? requestClose() : setOpen(true))}
        aria-label={fabLabel}
        aria-expanded={visible}
        className={`fixed right-4 bottom-[calc(72px+env(safe-area-inset-bottom))] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-primary-dark active:scale-[0.94] motion-reduce:transition-none lg:right-6 lg:bottom-6 ${showCard ? "z-[60]" : "z-30"}`}
      >
        {/* The two glyphs swap with a short rotate + fade so the bubble reads as one toggle. */}
        <ChatCircleIcon
          size={26}
          weight="fill"
          aria-hidden="true"
          className={`absolute transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${visible ? "rotate-45 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100"}`}
        />
        <XIcon
          size={24}
          weight="bold"
          aria-hidden="true"
          className={`absolute transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${visible ? "rotate-0 scale-100 opacity-100" : "-rotate-45 scale-75 opacity-0"}`}
        />
        {totalUnread > 0 && !visible ? (
          <span
            key={totalUnread}
            aria-hidden="true"
            className="badge-pop absolute -right-1 -top-1 min-w-[22px] rounded-full bg-[var(--seat-occupied)] px-1.5 text-center text-xs font-bold leading-[22px] text-white tabular-nums ring-2 ring-[var(--bg)]"
          >
            {formatUnread(totalUnread)}
          </span>
        ) : null}
      </button>
    </>
  );
}

/** Reports unread private messages across conversations; refreshed after leaving the DM pages. */
function DmUnreadWatcher({ pathname, onChange }: { pathname: string; onChange: (count: number) => void }) {
  const { conversations, refetch } = useConversations();
  const total = conversations.reduce((sum, c) => sum + c.unread, 0);
  useEffect(() => onChange(total), [total, onChange]);
  // Reading a conversation clears its unread count server-side; pick that up on the next route.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    refetch();
  }, [pathname, refetch]);
  return null;
}
