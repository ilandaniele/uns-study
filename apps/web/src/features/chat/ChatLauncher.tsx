"use client";

import type { ChatMessageDto } from "@sala/contracts";
import { ChatCircleIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { useSession } from "@/lib/auth-client";
import { useExitTransition } from "@/lib/useExitTransition";
import { ChatSoundToggle } from "./ChatSoundToggle";
import { ConversationList } from "./ConversationList";
import { conversationIdFromPath } from "./dm-notify";
import { DmThread } from "./DmThread";
import { GroupThread } from "./GroupThread";
import { NewGroupView } from "./NewGroupView";
import { RoomChatPanel } from "./RoomChatPanel";
import { conversationErrorMessage, findConversationWith, startConversation } from "./start-conversation";
import { UnreadBadge } from "./UnreadBadge";
import { countUnread, sumDmUnread, sumGroupUnread } from "./unread";
import { useConversations } from "./useConversations";
import { useDmNotifications } from "./useDmNotifications";
import { useGroups } from "./useGroups";
import {
  backChatView,
  closeChatWidget,
  openChatWidget,
  pushChatView,
  resetChatWidget,
  topView,
  useChatWidget,
  viewKey,
  type ChatWidgetState,
  type ChatWidgetView,
} from "./widget-store";

/** Routes where the floating chat would cover the chat itself or a full-screen form. */
const HIDDEN_PREFIXES = ["/chat", "/login", "/recuperar"];
const LAST_SEEN_KEY = "sala:room-chat-last-seen";
const PHONE_QUERY = "(max-width: 639px)";
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

function subscribePhone(listener: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** True below `sm`, where the card is modal (scrim, focus kept inside). */
function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

/** Mirrors the unread total on the installed app's icon (Badging API; silently absent elsewhere). */
function useAppBadge(total: number): void {
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    const update = total > 0 ? nav.setAppBadge?.(total) : nav.clearAppBadge?.();
    update?.catch(() => {});
  }, [total]);
}

function directionClass(state: ChatWidgetState): string {
  return state.direction === "forward" ? "chat-view-forward" : state.direction === "back" ? "chat-view-back" : "";
}

/**
 * Floating chat bubble, like a messaging app's chat head: a round button at the bottom-right
 * that opens and closes a small messenger in a card anchored to it (room chat, the chat
 * list, private conversations, group chats). Signed-in users get an unread badge (room messages
 * since they last looked, plus unread private and group messages), so the chat stays connected in the
 * background while the card is closed.
 */
export function ChatLauncher() {
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id ?? null;
  // Remounting per user resets the unread state (and the widget's view stack) on sign-in / sign-out.
  return userId ? <SignedInLauncher key={userId} userId={userId} /> : <AnonLauncher key="anon" sessionPending={isPending} />;
}

interface ChatShellState {
  state: ChatWidgetState;
  view: ChatWidgetView;
  hidden: boolean;
  closing: boolean;
  visible: boolean;
  showCard: boolean;
  requestClose: () => void;
  cancelClose: () => void;
  fabRef: RefObject<HTMLButtonElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  phone: boolean;
}

/** Open/close state shared by the signed-in and signed-out launchers. */
function useChatShell(pathname: string): ChatShellState {
  const state = useChatWidget();
  const view = topView(state);
  const phone = useIsPhone();
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    closeChatWidget();
    fabRef.current?.focus();
  }, []);
  const { closing, requestClose, cancelClose } = useExitTransition(close, 150);

  const hidden = HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const open = state.open;
  const visible = open && !closing && !hidden;
  const showCard = (open || closing) && !hidden;

  // Switching user (or leaving the app shell) starts the next session on the room view.
  useEffect(() => () => resetChatWidget(), []);

  // Navigating away (e.g. a profile link in the chat) closes the card. A card opened in the same
  // commit as the route change (openChatWidget right before navigating) was never seen open, so it stays.
  const lastPath = useRef(pathname);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    if (wasOpen.current) closeChatWidget();
  }, [pathname]);
  useEffect(() => {
    wasOpen.current = open;
  });

  const key = viewKey(view);
  useEffect(() => {
    if (!visible) return;
    panelRef.current?.querySelector<HTMLElement>(`[data-chat-view="${key}"]`)?.focus();
  }, [visible, key]);

  useEffect(() => {
    if (!visible) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !window.matchMedia(PHONE_QUERY).matches) return;
      // Modal below `sm`: Tab cycles through the card and the bubble (which closes it).
      const panel = panelRef.current;
      const fab = fabRef.current;
      if (!panel || !fab) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE), fab].filter((el) => el.getClientRects().length > 0);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!active || (!panel.contains(active) && active !== fab)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || active === panel || panel.querySelector(`[data-chat-view="${key}"]`) === active)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [visible, requestClose, key]);

  // The list was laid out while hidden (no height), so it could not pin itself to the bottom.
  const roomOnTop = view.kind === "room";
  useLayoutEffect(() => {
    if (!open || !roomOnTop) return;
    const log = panelRef.current?.querySelector<HTMLElement>('[role="log"]');
    if (log) log.scrollTop = log.scrollHeight;
  }, [open, roomOnTop]);

  return { state, view, hidden, closing, visible, showCard, requestClose, cancelClose, fabRef, panelRef, phone };
}

function AnonLauncher({ sessionPending }: { sessionPending: boolean }) {
  const pathname = usePathname() ?? "/";
  const shell = useChatShell(pathname);
  const baseId = useId();
  if (shell.hidden) return null;
  return (
    <ChatShell shell={shell} titleId={`${baseId}-room`} totalUnread={0} renderCard={false}>
      <div className="border-b border-app px-4 py-3">
        <h2
          id={`${baseId}-room`}
          className="font-display text-[17px] font-extrabold uppercase leading-none tracking-[0.01em] text-main"
        >
          <span aria-hidden="true">#</span> Sala de Estudio
        </h2>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        {sessionPending ? (
          <p className="text-muted">Cargando…</p>
        ) : (
          <>
            <p className="max-w-[28ch] text-sm text-muted">Iniciá sesión para hablar con la gente que está en la sala.</p>
            <Link
              href={`/login?next=${encodeURIComponent(pathname)}`}
              className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Iniciar sesión
            </Link>
          </>
        )}
      </div>
    </ChatShell>
  );
}

function SignedInLauncher({ userId }: { userId: string }) {
  const pathname = usePathname() ?? "/";
  const shell = useChatShell(pathname);
  const { state, view, hidden, visible } = shell;
  const baseId = useId();
  const { conversations, loading, error, refetch } = useConversations();
  // A groups failure must not hide the DMs, so only the conversations request drives the list status.
  const { groups, refetch: refetchGroups } = useGroups();
  const [notice, setNotice] = useState<string | null>(null);
  const pendingRef = useRef(false);

  // The DM on screen (widget thread or /chat/dm/{id}) is read as it arrives: no blip, no badge.
  const viewingConversationId = visible && view.kind === "dm" ? view.conversationId : conversationIdFromPath(pathname);
  const viewingGroupId = visible && view.kind === "group" ? view.groupId : null;
  useDmNotifications({ currentUserId: userId, viewingConversationId, viewingGroupId });

  // Reading a conversation clears its unread count server-side; pick that up on the next route.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    refetch();
    refetchGroups();
  }, [pathname, refetch, refetchGroups]);

  // Unread room messages are counted against the newest message the user has had on screen.
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  // First visit ever: start counting from now instead of flagging the whole history.
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(() =>
    typeof window === "undefined" ? null : (readLastSeen() ?? new Date().toISOString()),
  );

  // Room view on screen, or the full /chat page: everything currently loaded counts as read.
  const reading = (visible && view.kind === "room") || pathname === "/chat";
  const newest = messages[messages.length - 1]?.createdAt ?? null;
  if (reading && newest && (lastSeenAt === null || Date.parse(newest) > Date.parse(lastSeenAt))) {
    setLastSeenAt(newest);
  }
  useEffect(() => {
    if (lastSeenAt) writeLastSeen(lastSeenAt);
  }, [lastSeenAt]);

  const roomUnread = reading ? 0 : countUnread(messages, lastSeenAt, userId);
  const privateUnread = sumDmUnread(conversations, viewingConversationId) + sumGroupUnread(groups, viewingGroupId);
  const totalUnread = roomUnread + privateUnread;
  useAppBadge(totalUnread);

  async function openDmWith(otherUserId: string) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setNotice(null);
    try {
      const existing = findConversationWith(conversations, otherUserId);
      if (existing) {
        pushChatView({ kind: "dm", conversationId: existing.id, conversation: existing });
        return;
      }
      const created = await startConversation(otherUserId);
      pushChatView({ kind: "dm", conversationId: created.id, conversation: created });
      refetch();
    } catch (err) {
      setNotice(conversationErrorMessage(err));
    } finally {
      pendingRef.current = false;
    }
  }

  // Keeps listening (notifier, badge) on /chat routes too, where the bubble itself is hidden.
  if (hidden) return null;

  const roomId = `${baseId}-room`;
  const listId = `${baseId}-list`;
  const dmId = `${baseId}-dm`;
  const groupId = `${baseId}-group`;
  const newGroupId = `${baseId}-new-group`;
  const titleId =
    view.kind === "list" ? listId : view.kind === "dm" ? dmId : view.kind === "group" ? groupId : view.kind === "new-group" ? newGroupId : roomId;
  const direction = directionClass(state);
  const { showCard } = shell;

  return (
    <ChatShell shell={shell} titleId={titleId} totalUnread={totalUnread} renderCard>
      <div
        key="room"
        data-chat-view="room"
        tabIndex={-1}
        hidden={view.kind !== "room"}
        className={`flex min-h-0 flex-1 flex-col outline-none ${view.kind === "room" ? direction : ""}`}
      >
        <RoomChatPanel
          currentUserId={userId}
          variant="widget"
          titleId={roomId}
          onMessagesChange={setMessages}
          dmUnread={privateUnread}
          onBack={backChatView}
          onOpenUser={(otherUserId) => void openDmWith(otherUserId)}
          notice={notice}
          onDismissNotice={() => setNotice(null)}
          headerEnd={<ChatSoundToggle />}
        />
      </div>

      {showCard && view.kind === "list" ? (
        <div
          key={viewKey(view)}
          data-chat-view="list"
          tabIndex={-1}
          className={`flex min-h-0 flex-1 flex-col outline-none ${direction}`}
        >
          <div className="flex items-center gap-1 border-b border-app bg-surface py-2.5 pl-4 pr-2">
            <h2
              id={listId}
              className="min-w-0 flex-1 font-display text-[17px] font-extrabold uppercase leading-none tracking-[0.01em] text-main"
            >
              Chats
            </h2>
            <ChatSoundToggle />
          </div>
          <ConversationList
            variant="widget"
            conversations={conversations}
            groups={groups}
            loading={loading}
            error={error}
            currentUserId={userId}
            roomUnread={roomUnread}
            onOpenRoom={() => pushChatView({ kind: "room" })}
            onNewGroup={() => pushChatView({ kind: "new-group" })}
            onSelect={(id) => pushChatView({ kind: "dm", conversationId: id })}
            onSelectGroup={(id) => pushChatView({ kind: "group", groupId: id, group: groups.find((g) => g.id === id) })}
          />
        </div>
      ) : null}

      {showCard && view.kind === "dm" ? (
        <div
          key={viewKey(view)}
          data-chat-view={viewKey(view)}
          tabIndex={-1}
          className={`flex min-h-0 flex-1 flex-col outline-none ${direction}`}
        >
          <DmThread
            variant="widget"
            conversationId={view.conversationId}
            conversation={conversations.find((c) => c.id === view.conversationId) ?? view.conversation ?? null}
            currentUserId={userId}
            onBack={backChatView}
            headerEnd={<ChatSoundToggle />}
            titleId={dmId}
            onRead={refetch}
          />
        </div>
      ) : null}

      {showCard && view.kind === "group" ? (
        <div
          key={viewKey(view)}
          data-chat-view={viewKey(view)}
          tabIndex={-1}
          className={`flex min-h-0 flex-1 flex-col outline-none ${direction}`}
        >
          <GroupThread
            groupId={view.groupId}
            group={groups.find((g) => g.id === view.groupId) ?? view.group ?? null}
            currentUserId={userId}
            onBack={backChatView}
            onLeft={() => {
              refetchGroups();
              backChatView();
            }}
            headerEnd={<ChatSoundToggle />}
            titleId={groupId}
            onRead={refetchGroups}
          />
        </div>
      ) : null}

      {showCard && view.kind === "new-group" ? (
        <div
          key={viewKey(view)}
          data-chat-view={viewKey(view)}
          tabIndex={-1}
          className={`flex min-h-0 flex-1 flex-col outline-none ${direction}`}
        >
          <NewGroupView
            onBack={backChatView}
            onCreated={(group) => {
              pushChatView({ kind: "group", groupId: group.id, group });
              refetchGroups();
            }}
            headerEnd={<ChatSoundToggle />}
            titleId={newGroupId}
          />
        </div>
      ) : null}
    </ChatShell>
  );
}

/** Scrim, dialog card and the floating button. `children` are the views stacked inside the card. */
function ChatShell({
  shell,
  titleId,
  totalUnread,
  renderCard,
  children,
}: {
  shell: ChatShellState;
  titleId: string;
  totalUnread: number;
  renderCard: boolean;
  children: ReactNode;
}) {
  const { closing, visible, showCard, requestClose, cancelClose, fabRef, panelRef, phone } = shell;
  const state = visible ? "open" : "closed";
  const fabLabel = visible
    ? "Cerrar chat de la sala"
    : totalUnread > 0
      ? `Abrir chat de la sala, ${totalUnread} ${totalUnread === 1 ? "mensaje" : "mensajes"} sin leer`
      : "Abrir chat de la sala";

  return (
    <>
      {showCard ? (
        // Phones: a scrim so a tap outside closes the card. From `sm:` the card floats freely.
        <div
          aria-hidden="true"
          data-state={state}
          onClick={requestClose}
          className="chat-scrim fixed inset-0 z-50 bg-black/40 sm:hidden"
        />
      ) : null}

      {/* Stays mounted while signed in so the chat keeps listening and the badge stays live. */}
      {renderCard || showCard ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal={phone ? "true" : undefined}
          aria-labelledby={titleId}
          tabIndex={-1}
          hidden={!showCard}
          data-state={state}
          className="chat-card fixed inset-x-3 bottom-[calc(140px+env(safe-area-inset-bottom))] z-50 flex h-[min(600px,calc(100dvh-209px-env(safe-area-inset-bottom)))] min-h-0 origin-[calc(100%-32px)_calc(100%+40px)] flex-col overflow-hidden rounded-[12px] border border-app bg-surface shadow-lg outline-none sm:left-auto sm:right-4 sm:w-[380px] sm:origin-[calc(100%-28px)_calc(100%+40px)] lg:right-6 lg:bottom-[92px] lg:h-[min(640px,calc(100dvh-161px))]"
        >
          {children}
        </div>
      ) : null}

      <button
        ref={fabRef}
        type="button"
        onClick={() => (visible ? requestClose() : closing ? cancelClose() : openChatWidget())}
        aria-label={fabLabel}
        aria-expanded={visible}
        className={`fixed right-4 bottom-[calc(72px+env(safe-area-inset-bottom))] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-primary-dark active:scale-[0.96] motion-reduce:transition-none lg:right-6 lg:bottom-6 ${showCard ? "z-[60]" : "z-30"}`}
      >
        {/* The two glyphs swap with a short rotate + fade so the bubble reads as one toggle. */}
        <ChatCircleIcon
          size={26}
          weight="fill"
          aria-hidden="true"
          className={`absolute transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:rotate-0 motion-reduce:scale-100 ${visible ? "rotate-45 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100"}`}
        />
        <XIcon
          size={24}
          weight="bold"
          aria-hidden="true"
          className={`absolute transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:rotate-0 motion-reduce:scale-100 ${visible ? "rotate-0 scale-100 opacity-100" : "-rotate-45 scale-75 opacity-0"}`}
        />
        {totalUnread > 0 && !visible ? (
          <UnreadBadge
            key={totalUnread > 0 ? "on" : "off"}
            count={totalUnread}
            className="badge-pop absolute -right-1 -top-1 ring-2 ring-[var(--bg)]"
          />
        ) : null}
      </button>
    </>
  );
}
