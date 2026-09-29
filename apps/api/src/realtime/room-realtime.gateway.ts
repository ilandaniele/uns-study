import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
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
  type DisputeWonEvent,
  type RoomAdminPresentEvent,
  type RoomSummary,
  type SeatDisputeLiteDto,
  type SeatFreedAlertEvent,
  type SeatStateChangedEvent,
  type TableNicknameChangedEvent,
} from "@uns/contracts";
import { AUTH } from "../auth/auth.tokens.js";
import type { Auth } from "../auth/auth.instance.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { NotificationService } from "../notifications/notification.service.js";
import { verifySocketToken } from "./socket-token.js";
import { env } from "../env.js";

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
@WebSocketGateway({ cors: { origin: env.webOrigins, credentials: true } })
export class RoomRealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RoomRealtimeGateway.name);

  /** Per-room deferred summary/notification work, coalesced within `SUMMARY_COALESCE_MS`. */
  private readonly pendingSummaries = new Map<string, { changes: SeatStateChange[]; timer: NodeJS.Timeout | null; lastFlushAt: number }>();

  constructor(
    @Inject(RoomStateService) private readonly roomState: RoomStateService,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  /** Anonymous connections are allowed; joining a room map is opt-in via `room:join`. Authed
   *  sockets are additionally auto-joined to their private `user:{userId}` channel for DMs. */
  async handleConnection(socket: Socket): Promise<void> {
    const userId = await resolveSocketUserId(this.auth, socket.handshake);
    socket.data.userId = userId;
    if (userId) socket.join(userChannel(userId));
  }

  /** Returns an ack (`{ joined }`) once the socket is subscribed, so the client can re-fetch its
   *  snapshot strictly after joining and never miss an event emitted in between. */
  @SubscribeMessage(SocketEvents.RoomJoin)
  onJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): { joined: boolean } {
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
    const parsed = roomPayloadSchema.safeParse(body);
    if (!parsed.success) return;
    socket.leave(roomChannel(parsed.data.roomId));
  }

  /** `roomId` here is the chat room id (`ChatMessageDto.chatRoomId`), not the map room id. Requires auth. */
  @SubscribeMessage(SocketEvents.ChatJoin)
  onChatJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): void {
    if (!socket.data.userId) return;
    const parsed = chatPayloadSchema.safeParse(body);
    if (!parsed.success) return;
    socket.join(chatChannel(parsed.data.roomId));
  }

  @SubscribeMessage(SocketEvents.ChatLeave)
  onChatLeave(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): void {
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

  /** Broadcasts a table's nickname changing (crossing/leaving the vote threshold, or an admin clearing it). */
  emitTableNicknameChanged(roomId: string, payload: TableNicknameChangedEvent): void {
    this.server?.to(roomChannel(roomId)).emit(SocketEvents.TableNicknameChanged, payload);
  }

  /** Forcibly disconnects every live socket for a user — used on SUSPEND/BAN so the session revocation takes effect immediately. */
  disconnectUser(userId: string): void {
    this.server?.in(userChannel(userId)).disconnectSockets(true);
  }
}
