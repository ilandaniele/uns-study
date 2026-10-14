import {
  SocketEvents,
  type ChatMessageDto,
  type DirectMessageDto,
  type DisputeChallengedEvent,
  type GroupMessageDto,
  type GroupUpdatedEvent,
  type CheckInExpiringEvent,
  type DisputeWonEvent,
  type RoomAdminPresentEvent,
  type RoomSummary,
  type SeatDisputeLiteDto,
  type SeatFreedAlertEvent,
  type SeatStateChangedEvent,
  type TableNicknameChangedEvent,
} from "@sala/contracts";
import type { Auth } from "../auth/auth.instance.js";
import type { NotificationService } from "../notifications/notification.service.js";
import { Logger } from "../platform/logger.js";
import type { Scheduler } from "../platform/scheduler.js";
import type { RoomStateService, SeatStateChange } from "../rooms/room-state.service.js";
import type { RealtimeHub } from "./realtime-hub.js";
import { verifySocketToken, type SocketTokenClaims } from "./socket-token.js";

/** Summary emits (and seat-freed notifications) for one room are coalesced within this window. */
const SUMMARY_COALESCE_MS = 250;

/** Scheduler key of the deferred summary flush for a room (handler registered for prefix `summary`). */
export function summaryJobKey(roomId: string): string {
  return `summary:${roomId}`;
}

/**
 * Resolves the authenticated user id (if any) for a WebSocket upgrade. Tries the signed `?token=`
 * first (issued by `GET /api/v1/realtime/token`; required wherever the socket host cannot read the
 * web app's session cookie), then falls back to the Better Auth session cookie used by HTTP requests
 * (works where the socket and API share an origin). A token only counts while the session it was
 * minted for is still live (`isSessionActive`), so signing out cuts realtime access immediately
 * instead of after the token TTL. Never rejects: anonymous sockets stay anonymous. Exported
 * standalone so it can be unit-tested against a mocked `Auth` without a real socket.
 */
export async function resolveSocketUserId(
  token: string | null,
  cookieHeader: string | null,
  deps: {
    auth: Pick<Auth, "api">;
    isSessionActive: (claims: SocketTokenClaims) => Promise<boolean>;
  },
): Promise<string | null> {
  if (typeof token === "string") {
    const claims = verifySocketToken(token);
    if (claims && (await deps.isSessionActive(claims).catch((err: unknown) => {
      console.error(JSON.stringify({ evt: "socket_session_check_error", msg: err instanceof Error ? err.message : String(err) }));
      return false;
    }))) return claims.userId;
  }

  try {
    const headers = new Headers();
    if (cookieHeader) headers.set("cookie", cookieHeader);
    const session = await deps.auth.api.getSession({ headers });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Realtime notifications for room state, chat and DMs, published through a `RealtimeHub`. The
 *  database remains canonical: sockets never carry coordinates and never mutate state.
 *
 *  Pending seat changes live in memory. The `summary:<roomId>` job only triggers `flushRoom`; if the
 *  Durable Object restarted in between, the flush is a no-op (accepted: clients re-fetch on reconnect). */
export class RoomRealtimeGateway {
  private readonly logger = new Logger(RoomRealtimeGateway.name);

  /** Per-room deferred summary/notification work, coalesced within `SUMMARY_COALESCE_MS`. */
  private readonly pendingSummaries = new Map<string, { changes: SeatStateChange[]; timer: ReturnType<typeof setTimeout> | null; scheduled: boolean; lastFlushAt: number }>();

  constructor(
    private readonly hub: RealtimeHub,
    private readonly roomState: Pick<RoomStateService, "getRoomSummary">,
    private readonly notifications: Pick<NotificationService, "handleSeatFreed">,
    /** `null` falls back to `setTimeout` (unit tests without a scheduler). */
    private readonly scheduler: Scheduler | null,
  ) {}

  /** Emits `seat:state-changed` per changed seat immediately, then returns. The refreshed
   *  `room:summary-changed` and the seat-freed notifications are computed off the request path,
   *  coalesced per room within `SUMMARY_COALESCE_MS`. */
  async broadcastSeatChanges(roomId: string, changes: SeatStateChange[]): Promise<void> {
    if (changes.length === 0) return;
    for (const change of changes) {
      const event: SeatStateChangedEvent = {
        roomId,
        seatId: change.seatId,
        status: change.status,
        confidence: change.confidence,
        lastUpdatedAt: change.lastUpdatedAt.toISOString(),
        verified: change.verified,
        occupiedUntil: change.occupiedUntil ? change.occupiedUntil.toISOString() : null,
      };
      this.hub.publishToRoom(roomId, SocketEvents.SeatStateChanged, event);
    }
    this.scheduleSummary(roomId, changes);
  }

  private scheduleSummary(roomId: string, changes: SeatStateChange[]): void {
    const pending = this.pendingSummaries.get(roomId) ?? { changes: [], timer: null, scheduled: false, lastFlushAt: 0 };
    pending.changes.push(...changes);
    this.pendingSummaries.set(roomId, pending);
    if (pending.timer || pending.scheduled) return;
    const delay = Math.max(0, SUMMARY_COALESCE_MS - (Date.now() - pending.lastFlushAt));
    if (this.scheduler) {
      this.scheduler.scheduleIfAbsent(summaryJobKey(roomId), new Date(Date.now() + delay));
      pending.scheduled = true; // either we inserted the job or one is already due
      return;
    }
    pending.timer = setTimeout(() => {
      this.flushRoom(roomId).catch((err) => this.logger.error("Failed to flush room summary", err instanceof Error ? err.stack : String(err)));
    }, delay);
    (pending.timer as { unref?: () => void }).unref?.();
  }

  /** Emits the coalesced summary and seat-freed notifications for a room. Public: it is the
   *  scheduler handler for `summary:<roomId>`. A no-op when nothing is pending. */
  async flushRoom(roomId: string): Promise<void> {
    const pending = this.pendingSummaries.get(roomId);
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = null;
    pending.scheduled = false;
    const changes = pending.changes;
    pending.changes = [];
    pending.lastFlushAt = Date.now();
    if (changes.length === 0) return;

    // Derived from the live map (via `getRoomSummary`), so the emitted summary always equals what
    // a fresh map fetch shows.
    const summary = await this.roomState.getRoomSummary(roomId);
    this.hub.publishToRoom(roomId, SocketEvents.RoomSummaryChanged, summary satisfies RoomSummary);

    // Figures out who should get a "seat freed" alert (opted in, not currently checked into this
    // room) and sends any due push notifications itself. The in-app toast (for whoever has the page
    // open) is this gateway's job since it owns the per-user channels.
    try {
      const recipients = await this.notifications.handleSeatFreed(roomId, changes, summary);
      for (const { userId, seatIds } of recipients) {
        const event: SeatFreedAlertEvent = { seatIds, freeCount: summary.free };
        this.hub.publishToUser(userId, SocketEvents.SeatFreedAlert, event);
      }
    } catch (err) {
      this.logger.error("Failed to process seat-freed notifications", err instanceof Error ? err.stack : String(err));
    }
  }

  /** Runs all pending deferred summary/notification work now (used by tests and shutdown). */
  async flushPending(): Promise<void> {
    await Promise.all(
      [...this.pendingSummaries.keys()].map((roomId) => {
        this.scheduler?.cancel(summaryJobKey(roomId));
        return this.flushRoom(roomId);
      }),
    );
  }

  /** Room-wide, unconditional in-app banner: everyone currently viewing the room sees it,
   *  regardless of their notification preferences (those only gate the push side). */
  emitAdminPresent(roomId: string, payload: RoomAdminPresentEvent): void {
    this.hub.publishToRoom(roomId, SocketEvents.RoomAdminPresent, payload);
  }

  emitDailyReset(roomId: string): void {
    this.hub.publishToRoom(roomId, SocketEvents.RoomDailyReset, { roomId });
  }

  emitChatMessage(chatRoomId: string, message: ChatMessageDto): void {
    this.hub.publishToChat(chatRoomId, SocketEvents.ChatMessageCreated, message);
  }

  emitChatDeleted(chatRoomId: string, messageId: string): void {
    this.hub.publishToChat(chatRoomId, SocketEvents.ChatMessageDeleted, { chatRoomId, messageId });
  }

  /** Notifies both participants' private `user:{userId}` channels. */
  emitDm(userIds: string[], message: DirectMessageDto): void {
    for (const userId of userIds) {
      this.hub.publishToUser(userId, SocketEvents.DmMessageCreated, message);
    }
  }

  /** Each member's private `user:{userId}` channel. */
  emitGroupMessage(memberIds: string[], message: GroupMessageDto): void {
    for (const userId of memberIds) {
      this.hub.publishToUser(userId, SocketEvents.GroupMessageCreated, message);
    }
  }

  emitGroupUpdated(memberIds: string[], payload: GroupUpdatedEvent): void {
    for (const userId of memberIds) {
      this.hub.publishToUser(userId, SocketEvents.GroupUpdated, payload);
    }
  }

  emitDisputeOpened(roomId: string, dispute: SeatDisputeLiteDto): void {
    this.hub.publishToRoom(roomId, SocketEvents.SeatDisputeOpened, dispute);
  }

  emitDisputeUpdated(roomId: string, dispute: SeatDisputeLiteDto): void {
    this.hub.publishToRoom(roomId, SocketEvents.SeatDisputeUpdated, dispute);
  }

  emitDisputeResolved(roomId: string, dispute: SeatDisputeLiteDto): void {
    this.hub.publishToRoom(roomId, SocketEvents.SeatDisputeResolved, dispute);
  }

  /** Notifies the incumbent's private `user:{userId}` channel that their seat is being disputed. */
  emitDisputeChallenge(incumbentUserId: string, payload: DisputeChallengedEvent): void {
    this.hub.publishToUser(incumbentUserId, SocketEvents.DisputeYouAreChallenged, payload);
  }

  /** Notifies a CLAIM opener's private `user:{userId}` channel that their claim won and the seat
   *  is now free for them to self-check-in. */
  emitDisputeWon(openerUserId: string, payload: DisputeWonEvent): void {
    this.hub.publishToUser(openerUserId, SocketEvents.DisputeYouWon, payload);
  }

  /** Tells a user (private `user:{userId}` channel) their active check-in is about to expire. */
  emitCheckInExpiring(userId: string, payload: CheckInExpiringEvent): void {
    this.hub.publishToUser(userId, SocketEvents.CheckInExpiring, payload);
  }

  /** Broadcasts a table's nickname changing (crossing/leaving the vote threshold, or an admin clearing it). */
  emitTableNicknameChanged(roomId: string, payload: TableNicknameChangedEvent): void {
    this.hub.publishToRoom(roomId, SocketEvents.TableNicknameChanged, payload);
  }

  /** Announcement banner changed: sockets in the announcement's room, or everyone when it is global (`roomId` null). */
  emitAnnouncementChanged(roomId: string | null, payload: unknown): void {
    if (roomId) this.hub.publishToRoom(roomId, SocketEvents.AnnouncementChanged, payload);
    else this.hub.broadcast(SocketEvents.AnnouncementChanged, payload);
  }

  /** Forcibly disconnects every live socket for a user, used on SUSPEND/BAN so the session revocation takes effect immediately. */
  disconnectUser(userId: string): void {
    this.hub.disconnectUser(userId);
  }
}
