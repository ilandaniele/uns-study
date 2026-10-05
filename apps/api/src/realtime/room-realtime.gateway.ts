import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import {
  SocketEvents,
  type ChatMessageDto,
  type DirectMessageDto,
  type DisputeChallengedEvent,
  type CheckInExpiringEvent,
  type DisputeWonEvent,
  type RoomAdminPresentEvent,
  type RoomSummary,
  type SeatDisputeLiteDto,
  type SeatFreedAlertEvent,
  type SeatStateChangedEvent,
  type TableNicknameChangedEvent,
} from "@sala/contracts";
import { AUTH } from "../auth/auth.tokens.js";
import { RestrictionService } from "../users/restriction.service.js";
import type { Auth } from "../auth/auth.instance.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { NotificationService } from "../notifications/notification.service.js";
import { verifySocketToken } from "./socket-token.js";
import { env } from "../env.js";
import { socketClientIp, takeSocketToken, type SocketBucket } from "./socket-bucket.js";

function roomChannel(roomId: string): string {
  return `room:${roomId}`;
}

function userChannel(userId: string): string {
  return `user:${userId}`;
}

function chatChannel(chatRoomId: string): string {
  return `chat:${chatRoomId}`;
}

const roomPayloadSchema = z.object({ roomId: z.string().uuid() });
const chatPayloadSchema = z.object({ roomId: z.string().uuid() });

/** Per-socket cap on how many room channels can be joined at once — a socket has no business
 *  watching more than a handful of rooms in this MVP. */
const MAX_JOINED_ROOMS_PER_SOCKET = 5;

/** Per-socket budget for client->server events (joins/leaves); beyond it the event is ignored. */
const SOCKET_EVENT_LIMIT = 10;
const SOCKET_EVENT_WINDOW_MS = 10_000;

/** Concurrent sockets allowed per client IP; extras are disconnected on connect. */
const MAX_CONNECTIONS_PER_IP = 20;

/** How long a chat:join restriction lookup is reused (same trade-off as AuthGuard's block cache). */
const RESTRICTION_CACHE_TTL_MS = 30_000;

/** Summary emits (and seat-freed notifications) for one room are coalesced within this window. */
const SUMMARY_COALESCE_MS = 250;

/**
 * Resolves the authenticated user id (if any) for a raw Socket.IO handshake. Tries the signed
 * `handshake.auth.token` first (issued by `GET /api/v1/realtime/token` — required in production
 * since the socket server isn't behind the web app's same-origin proxy and can't read its session
 * cookie), then falls back to the Better Auth session cookie used by HTTP requests (works locally,
 * where the socket and API share an origin). Never rejects — anonymous sockets stay anonymous.
 * Exported standalone so it can be unit-tested against a mocked `Auth` without a real socket.
 */
export async function resolveSocketUserId(
  auth: Auth,
  handshake: { headers: IncomingHttpHeaders; auth?: unknown },
): Promise<string | null> {
  const token = (handshake.auth as { token?: unknown } | undefined)?.token;
  if (typeof token === "string") {
    const userId = verifySocketToken(token);
    if (userId) return userId;
  }

  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(handshake.headers) });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Socket.IO notifications for room state, chat and DMs. PostgreSQL remains canonical — sockets
 *  never carry coordinates and never mutate state. */
@Injectable()
// Client->server payloads are just room UUIDs; cap well below the 1 MB default.
@WebSocketGateway({ maxHttpBufferSize: 64 * 1024, cors: { origin: env.webOrigins, credentials: true } })
export class RoomRealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RoomRealtimeGateway.name);

  /** Per-room deferred summary/notification work, coalesced within `SUMMARY_COALESCE_MS`. */
  private readonly pendingSummaries = new Map<string, { changes: SeatStateChange[]; timer: NodeJS.Timeout | null; lastFlushAt: number }>();

  /** Live socket count per client IP (see `MAX_CONNECTIONS_PER_IP`). */
  private readonly connectionsPerIp = new Map<string, number>();

  /** Per-socket event budget; weakly keyed so a closed socket takes its bucket with it. */
  private readonly socketBuckets = new WeakMap<Socket, SocketBucket>();

  /** userId -> whether a SUSPENDED/BANNED restriction was active, and when we looked. */
  private readonly blockedCache = new Map<string, { blocked: boolean; at: number }>();

  constructor(
    @Inject(RoomStateService) private readonly roomState: RoomStateService,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
  ) {}

  /** Anonymous connections are allowed; joining a room map is opt-in via `room:join`. Authed
   *  sockets are additionally auto-joined to their private `user:{userId}` channel for DMs. */
  async handleConnection(socket: Socket): Promise<void> {
    const ip = socketClientIp(socket.handshake.headers, socket.handshake.address);
    const open = this.connectionsPerIp.get(ip) ?? 0;
    if (open >= MAX_CONNECTIONS_PER_IP) {
      socket.disconnect(true);
      return;
    }
    this.connectionsPerIp.set(ip, open + 1);
    socket.data.ip = ip;

    const userId = await resolveSocketUserId(this.auth, socket.handshake);
    socket.data.userId = userId;
    if (userId) socket.join(userChannel(userId));
  }

  handleDisconnect(socket: Socket): void {
    const ip = socket.data.ip as string | undefined;
    if (!ip) return; // rejected before it was counted
    const open = (this.connectionsPerIp.get(ip) ?? 1) - 1;
    if (open > 0) this.connectionsPerIp.set(ip, open);
    else this.connectionsPerIp.delete(ip);
  }

  /** False once the socket has used up its event budget; the caller then ignores the event. */
  private allowEvent(socket: Socket): boolean {
    let bucket = this.socketBuckets.get(socket);
    if (!bucket) {
      bucket = { count: 0, windowStart: Date.now() };
      this.socketBuckets.set(socket, bucket);
    }
    return takeSocketToken(bucket, Date.now(), SOCKET_EVENT_LIMIT, SOCKET_EVENT_WINDOW_MS);
  }

  private async isBlocked(userId: string): Promise<boolean> {
    const now = Date.now();
    const cached = this.blockedCache.get(userId);
    if (cached && now - cached.at < RESTRICTION_CACHE_TTL_MS) return cached.blocked;
    const active = await this.restrictions.activeRestrictions(userId);
    const blocked = active.some((r) => r.type === "SUSPENDED" || r.type === "BANNED");
    if (this.blockedCache.size > 5000) this.blockedCache.clear();
    this.blockedCache.set(userId, { blocked, at: now });
    return blocked;
  }

  /** Returns an ack (`{ joined }`) once the socket is subscribed, so the client can re-fetch its
   *  snapshot strictly after joining and never miss an event emitted in between. */
  @SubscribeMessage(SocketEvents.RoomJoin)
  onJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): { joined: boolean } {
    if (!this.allowEvent(socket)) return { joined: false };
    const parsed = roomPayloadSchema.safeParse(body);
    if (!parsed.success) return { joined: false };
    const channel = roomChannel(parsed.data.roomId);
    const joinedRooms = [...socket.rooms].filter((r) => r !== socket.id);
    if (joinedRooms.length >= MAX_JOINED_ROOMS_PER_SOCKET && !socket.rooms.has(channel)) return { joined: false };
    void socket.join(channel);
    return { joined: true };
  }

  @SubscribeMessage(SocketEvents.RoomLeave)
  onLeave(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): void {
    if (!this.allowEvent(socket)) return;
    const parsed = roomPayloadSchema.safeParse(body);
    if (!parsed.success) return;
    socket.leave(roomChannel(parsed.data.roomId));
  }

  /** `roomId` here is the chat room id (`ChatMessageDto.chatRoomId`), not the map room id. Requires auth. */
  @SubscribeMessage(SocketEvents.ChatJoin)
  async onChatJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<void> {
    if (!socket.data.userId) return;
    if (!this.allowEvent(socket)) return;
    const parsed = chatPayloadSchema.safeParse(body);
    if (!parsed.success) return;
    // A banned/suspended user can't post (AuthGuard) and shouldn't keep reading live chat either.
    if (await this.isBlocked(socket.data.userId)) return;
    socket.join(chatChannel(parsed.data.roomId));
  }

  @SubscribeMessage(SocketEvents.ChatLeave)
  onChatLeave(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): void {
    if (!this.allowEvent(socket)) return;
    const parsed = chatPayloadSchema.safeParse(body);
    if (!parsed.success) return;
    socket.leave(chatChannel(parsed.data.roomId));
  }

  /** Emits `seat:state-changed` per changed seat immediately, then returns. The refreshed
   *  `room:summary-changed` and the seat-freed notifications are computed off the request path,
   *  coalesced per room within `SUMMARY_COALESCE_MS`. */
  async broadcastSeatChanges(roomId: string, changes: SeatStateChange[]): Promise<void> {
    if (changes.length === 0) return;
    const channel = roomChannel(roomId);
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
      this.server?.to(channel).emit(SocketEvents.SeatStateChanged, event);
    }
    this.scheduleSummary(roomId, changes);
  }

  private scheduleSummary(roomId: string, changes: SeatStateChange[]): void {
    const pending = this.pendingSummaries.get(roomId) ?? { changes: [], timer: null, lastFlushAt: 0 };
    pending.changes.push(...changes);
    this.pendingSummaries.set(roomId, pending);
    if (pending.timer) return;
    const delay = Math.max(0, SUMMARY_COALESCE_MS - (Date.now() - pending.lastFlushAt));
    pending.timer = setTimeout(() => {
      this.flushRoom(roomId).catch((err) => this.logger.error("Failed to flush room summary", err instanceof Error ? err.stack : String(err)));
    }, delay);
    pending.timer.unref?.();
  }

  private async flushRoom(roomId: string): Promise<void> {
    const pending = this.pendingSummaries.get(roomId);
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = null;
    const changes = pending.changes;
    pending.changes = [];
    pending.lastFlushAt = Date.now();
    if (changes.length === 0) return;

    // Derived from the live map (via `getRoomSummary`), so the emitted summary always equals what
    // a fresh map fetch shows.
    const summary = await this.roomState.getRoomSummary(roomId);
    this.server?.to(roomChannel(roomId)).emit(SocketEvents.RoomSummaryChanged, summary satisfies RoomSummary);

    // Figures out who should get a "seat freed" alert (opted in, not currently checked into this
    // room) and sends any due push notifications itself. The in-app toast (for whoever has the page
    // open) is this gateway's job since it already owns `this.server` and the per-user channels.
    try {
      const recipients = await this.notifications.handleSeatFreed(roomId, changes, summary);
      for (const { userId, seatIds } of recipients) {
        const event: SeatFreedAlertEvent = { seatIds, freeCount: summary.free };
        this.server?.to(userChannel(userId)).emit(SocketEvents.SeatFreedAlert, event);
      }
    } catch (err) {
      this.logger.error("Failed to process seat-freed notifications", err instanceof Error ? err.stack : String(err));
    }
  }

  /** Runs all pending deferred summary/notification work now (used by tests and shutdown). */
  async flushPending(): Promise<void> {
    await Promise.all([...this.pendingSummaries.keys()].map((roomId) => this.flushRoom(roomId)));
  }

  /** Room-wide, unconditional in-app banner — everyone currently viewing the room sees it,
   *  regardless of their notification preferences (those only gate the push side). */
  emitAdminPresent(roomId: string, payload: RoomAdminPresentEvent): void {
    this.server?.to(roomChannel(roomId)).emit(SocketEvents.RoomAdminPresent, payload);
  }

  emitDailyReset(roomId: string): void {
    this.server?.to(roomChannel(roomId)).emit(SocketEvents.RoomDailyReset, { roomId });
  }

  emitChatMessage(chatRoomId: string, message: ChatMessageDto): void {
    this.server?.to(chatChannel(chatRoomId)).emit(SocketEvents.ChatMessageCreated, message);
  }

  emitChatDeleted(chatRoomId: string, messageId: string): void {
    this.server?.to(chatChannel(chatRoomId)).emit(SocketEvents.ChatMessageDeleted, { chatRoomId, messageId });
  }

  /** Notifies both participants' private `user:{userId}` channels. */
  emitDm(userIds: string[], message: DirectMessageDto): void {
    for (const userId of userIds) {
      this.server?.to(userChannel(userId)).emit(SocketEvents.DmMessageCreated, message);
    }
  }

  emitDisputeOpened(roomId: string, dispute: SeatDisputeLiteDto): void {
    this.server?.to(roomChannel(roomId)).emit(SocketEvents.SeatDisputeOpened, dispute);
  }

  emitDisputeUpdated(roomId: string, dispute: SeatDisputeLiteDto): void {
    this.server?.to(roomChannel(roomId)).emit(SocketEvents.SeatDisputeUpdated, dispute);
  }

  emitDisputeResolved(roomId: string, dispute: SeatDisputeLiteDto): void {
    this.server?.to(roomChannel(roomId)).emit(SocketEvents.SeatDisputeResolved, dispute);
  }

  /** Notifies the incumbent's private `user:{userId}` channel that their seat is being disputed. */
  emitDisputeChallenge(incumbentUserId: string, payload: DisputeChallengedEvent): void {
    this.server?.to(userChannel(incumbentUserId)).emit(SocketEvents.DisputeYouAreChallenged, payload);
  }

  /** Notifies a CLAIM opener's private `user:{userId}` channel that their claim won and the seat
   *  is now free for them to self-check-in. */
  emitDisputeWon(openerUserId: string, payload: DisputeWonEvent): void {
    this.server?.to(userChannel(openerUserId)).emit(SocketEvents.DisputeYouWon, payload);
  }

  /** Tells a user (private `user:{userId}` channel) their active check-in is about to expire. */
  emitCheckInExpiring(userId: string, payload: CheckInExpiringEvent): void {
    this.server?.to(userChannel(userId)).emit(SocketEvents.CheckInExpiring, payload);
  }

  /** Broadcasts a table's nickname changing (crossing/leaving the vote threshold, or an admin clearing it). */
  emitTableNicknameChanged(roomId: string, payload: TableNicknameChangedEvent): void {
    this.server?.to(roomChannel(roomId)).emit(SocketEvents.TableNicknameChanged, payload);
  }

  /** Forcibly disconnects every live socket for a user — used on SUSPEND/BAN so the session revocation takes effect immediately. */
  disconnectUser(userId: string): void {
    this.server?.in(userChannel(userId)).disconnectSockets(true);
  }
}
