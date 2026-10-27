import { and, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { SocketEvents } from "@sala/contracts";
import { inChunks, schema, type Db } from "@sala/database";
import type { Auth } from "../auth/auth.instance.js";
import { env } from "../env.js";
import { ApiException } from "../common/api-error.js";
import { Logger } from "../platform/logger.js";
import type { RestrictionService } from "../users/restriction.service.js";
import { ipTag, userTag, type SocketState, type WsLike } from "./do-realtime-hub.js";
import { resolveSocketUserId } from "./room-realtime.gateway.js";
import { socketClientIp, takeSocketToken, type SocketBucket } from "./socket-bucket.js";
import type { SocketTokenClaims } from "./socket-token.js";
import { decodeClientFrame, encodeServerAck, MAX_FRAME_BYTES, WsCloseCodes } from "./ws-protocol.js";

/** Per-socket cap on how many room channels (and, separately, chat channels) can be joined at once. */
const MAX_JOINED_ROOMS_PER_SOCKET = 5;

/** Per-socket budget for client->server events (joins/leaves); beyond it the frame is dropped. */
const SOCKET_EVENT_LIMIT = 10;
const SOCKET_EVENT_WINDOW_MS = 10_000;

/** Consecutive dropped frames after which the socket is closed with 4008. */
const MAX_CONSECUTIVE_DROPS = 3;

/** Concurrent sockets allowed per client IP; extras get a 429 on upgrade. */
const MAX_CONNECTIONS_PER_IP = 20;

/** How long a chat:join restriction lookup is reused. */
const RESTRICTION_CACHE_TTL_MS = 30_000;

const roomPayloadSchema = z.object({ roomId: z.string().uuid() });
const chatPayloadSchema = z.object({ roomId: z.string().uuid() });

/** Serialized into each hibernating socket (structured clone, 2 KB max, so everything is capped). */
export interface SocketAttachment {
  ip: string;
  userId: string | null;
  sessionId: string | null;
  rooms: string[];
  chats: string[]; // max 5 rooms (MAX_JOINED_ROOMS_PER_SOCKET), same cap for chats
  bucket: { tokens: number; refilledAt: number }; // 10 events / 10 s (SOCKET_EVENT_LIMIT); tokens = events spent in the window
  /** Consecutive dropped frames (see MAX_CONSECUTIVE_DROPS). */
  drops?: number;
}

/** Session lookups behind token validation and the sweep. Overridable so tests do not need a database. */
export interface SessionLookup {
  isActive(claims: SocketTokenClaims): boolean | Promise<boolean>;
  live(userIds: string[]): Array<{ id: string; userId: string }> | Promise<Array<{ id: string; userId: string }>>;
}

export function dbSessionLookup(db: Db): SessionLookup {
  return {
    /** True while the Better Auth session a socket token was minted for still exists, belongs to the
     *  same user and has not expired. */
    isActive: ({ userId, sessionId }) =>
      db
        .select({ id: schema.session.id })
        .from(schema.session)
        .innerJoin(schema.user, eq(schema.user.id, schema.session.userId))
        .where(and(eq(schema.session.id, sessionId), eq(schema.session.userId, userId), gt(schema.session.expiresAt, new Date()), env.isProduction ? eq(schema.user.emailVerified, true) : undefined))
        .limit(1)
        .all().length > 0,
    live: (userIds) =>
      inChunks(userIds, (part) =>
        db
          .select({ id: schema.session.id, userId: schema.session.userId })
          .from(schema.session)
          .innerJoin(schema.user, eq(schema.user.id, schema.session.userId))
          .where(and(inArray(schema.session.userId, part), gt(schema.session.expiresAt, new Date()), env.isProduction ? eq(schema.user.emailVerified, true) : undefined))
          .all(),
      ),
  };
}

export interface RealtimeSocketsDeps {
  state: SocketState;
  db: Db;
  auth: Pick<Auth, "api">;
  restrictions: Pick<RestrictionService, "assertNot">;
  webOrigins: string[];
  /** Test seams; production uses `dbSessionLookup(db)`, `WebSocketPair` and a 101 `Response`. */
  sessions?: SessionLookup;
  createPair?: () => { client: unknown; server: WsLike };
  upgradeResponse?: (client: unknown) => Response;
  now?: () => number;
}

function defaultCreatePair(): { client: unknown; server: WsLike } {
  const Pair = (globalThis as unknown as { WebSocketPair: new () => Record<number, unknown> }).WebSocketPair;
  const pair = new Pair();
  return { client: pair[0], server: pair[1] as WsLike };
}

function defaultUpgradeResponse(client: unknown): Response {
  return new Response(null, { status: 101, webSocket: client } as ResponseInit);
}

/** WebSocket server inside the Durable Object (Hibernation API). Sockets are accepted with
 *  `state.acceptWebSocket`, so the DO can be evicted between messages; everything a message handler
 *  needs lives in the socket's attachment. Sockets never carry coordinates and never mutate state. */
export class RealtimeSockets {
  private readonly logger = new Logger(RealtimeSockets.name);
  private readonly sessions: SessionLookup;
  private readonly now: () => number;
  /** userId -> whether a SUSPENDED/BANNED restriction was active, and when we looked. */
  private readonly blockedCache = new Map<string, { blocked: boolean; at: number }>();

  constructor(private readonly deps: RealtimeSocketsDeps) {
    this.sessions = deps.sessions ?? dbSessionLookup(deps.db);
    this.now = deps.now ?? Date.now;
  }

  /** Upgrades a `GET /api/v1/realtime/ws` request. 403 on a foreign Origin, 429 past the per-IP cap.
   *  Anonymous sockets are allowed; identity comes from `?token=` (preferred) or the session cookie. */
  async accept(req: Request): Promise<Response> {
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }
    // Browsers always send Origin on WebSocket handshakes; non-browser clients have no cookies to abuse.
    const origin = req.headers.get("origin");
    if (origin && !this.deps.webOrigins.includes(origin)) {
      return new Response("Origin not allowed.", { status: 403 });
    }

    const ip = socketClientIp(req.headers);
    if (this.deps.state.getWebSockets(ipTag(ip)).length >= MAX_CONNECTIONS_PER_IP) {
      return new Response("Too many connections.", { status: 429 });
    }

    // Authenticate before accepting: the user tag is fixed at accept, and chat:join can never race it.
    let sessionId: string | null = null;
    const token = new URL(req.url).searchParams.get("token");
    const userId = await resolveSocketUserId(token, req.headers.get("cookie"), {
      auth: this.deps.auth,
      isSessionActive: async (claims) => {
        const active = await this.sessions.isActive(claims);
        if (active) sessionId = claims.sessionId;
        return active;
      },
    });

    const { client, server } = (this.deps.createPair ?? defaultCreatePair)();
    const tags = [ipTag(ip)];
    if (userId) tags.push(userTag(userId));
    this.deps.state.acceptWebSocket(server, tags);
    const attachment: SocketAttachment = {
      ip,
      userId,
      sessionId: userId ? sessionId : null,
      rooms: [],
      chats: [],
      bucket: { tokens: 0, refilledAt: this.now() },
      drops: 0,
    };
    server.serializeAttachment(attachment);
    return (this.deps.upgradeResponse ?? defaultUpgradeResponse)(client);
  }

  async onMessage(ws: WsLike, raw: string | ArrayBuffer): Promise<void> {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    const bytes = text.length * 3 > MAX_FRAME_BYTES ? new TextEncoder().encode(text).byteLength : text.length;
    if (bytes > MAX_FRAME_BYTES) {
      this.close(ws, WsCloseCodes.TooBig, "frame-too-big");
      return;
    }
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) return;
    const frame = decodeClientFrame(text);
    if (!frame) return;

    const isJoin = frame.e === SocketEvents.RoomJoin;
    if (!isJoin && frame.e !== SocketEvents.RoomLeave && frame.e !== SocketEvents.ChatJoin && frame.e !== SocketEvents.ChatLeave) return;
    // chat:join from an anonymous socket is ignored without spending budget.
    if (frame.e === SocketEvents.ChatJoin && !attachment.userId) return;

    if (!this.takeBudget(attachment)) {
      attachment.drops = (attachment.drops ?? 0) + 1;
      ws.serializeAttachment(attachment);
      if (isJoin && frame.id !== undefined) ws.send(encodeServerAck(frame.id, { joined: false }));
      if (attachment.drops >= MAX_CONSECUTIVE_DROPS) this.close(ws, WsCloseCodes.RateLimited, "rate-limited");
      return;
    }
    attachment.drops = 0;

    switch (frame.e) {
      case SocketEvents.RoomJoin: {
        const joined = this.joinRoom(attachment, frame.d);
        ws.serializeAttachment(attachment);
        // The client re-fetches its snapshot only after this ack, so it must mean "already subscribed".
        if (frame.id !== undefined) ws.send(encodeServerAck(frame.id, { joined }));
        return;
      }
      case SocketEvents.RoomLeave: {
        const parsed = roomPayloadSchema.safeParse(frame.d);
        if (parsed.success) attachment.rooms = attachment.rooms.filter((r) => r !== parsed.data.roomId);
        ws.serializeAttachment(attachment);
        return;
      }
      case SocketEvents.ChatJoin: {
        const parsed = chatPayloadSchema.safeParse(frame.d);
        ws.serializeAttachment(attachment);
        if (!parsed.success) return;
        // A banned/suspended user cannot post and should not keep reading live chat either.
        if (await this.isBlocked(attachment.userId as string)) return;
        // Re-read: the attachment may have changed while the restriction lookup was awaited.
        const fresh = (ws.deserializeAttachment() as SocketAttachment | null) ?? attachment;
        const chatRoomId = parsed.data.roomId;
        if (!fresh.chats.includes(chatRoomId)) {
          if (fresh.chats.length >= MAX_JOINED_ROOMS_PER_SOCKET) return;
          fresh.chats.push(chatRoomId);
          ws.serializeAttachment(fresh);
        }
        return;
      }
      case SocketEvents.ChatLeave: {
        const parsed = chatPayloadSchema.safeParse(frame.d);
        if (parsed.success) attachment.chats = attachment.chats.filter((r) => r !== parsed.data.roomId);
        ws.serializeAttachment(attachment);
        return;
      }
    }
  }

  /** The runtime frees the socket's tags and attachment itself; this only completes the close handshake. */
  async onClose(ws: WsLike): Promise<void> {
    try {
      ws.close(1000, "closed");
    } catch {
      // already closed
    }
  }

  /** Closes (4001) every authenticated socket whose session is gone: the exact session when the
   *  socket came in with a token, else any live session of that user (cookie handshakes). */
  async sweepSessions(): Promise<void> {
    const sockets = this.deps.state
      .getWebSockets()
      .map((ws) => ({ ws, att: ws.deserializeAttachment() as SocketAttachment | null }))
      .filter((s): s is { ws: WsLike; att: SocketAttachment & { userId: string } } => typeof s.att?.userId === "string");
    if (sockets.length === 0) return;
    const userIds = [...new Set(sockets.map((s) => s.att.userId))];
    const live = await this.sessions.live(userIds);
    const liveSessions = new Set(live.map((r) => r.id));
    const liveUsers = new Set(live.map((r) => r.userId));
    for (const { ws, att } of sockets) {
      const alive = att.sessionId ? liveSessions.has(att.sessionId) : liveUsers.has(att.userId);
      if (!alive) this.close(ws, WsCloseCodes.SessionEnded, "session-ended");
    }
  }

  /** Spends one event from the socket's budget and writes the bucket back into the attachment. */
  private takeBudget(attachment: SocketAttachment): boolean {
    const bucket: SocketBucket = { count: attachment.bucket.tokens, windowStart: attachment.bucket.refilledAt };
    const ok = takeSocketToken(bucket, this.now(), SOCKET_EVENT_LIMIT, SOCKET_EVENT_WINDOW_MS);
    attachment.bucket = { tokens: bucket.count, refilledAt: bucket.windowStart };
    return ok;
  }

  private joinRoom(attachment: SocketAttachment, body: unknown): boolean {
    const parsed = roomPayloadSchema.safeParse(body);
    if (!parsed.success) return false;
    const roomId = parsed.data.roomId;
    if (attachment.rooms.includes(roomId)) return true;
    if (attachment.rooms.length >= MAX_JOINED_ROOMS_PER_SOCKET) return false;
    attachment.rooms.push(roomId);
    return true;
  }

  private async isBlocked(userId: string): Promise<boolean> {
    const now = this.now();
    const cached = this.blockedCache.get(userId);
    if (cached && now - cached.at < RESTRICTION_CACHE_TTL_MS) return cached.blocked;
    let blocked = false;
    try {
      await this.deps.restrictions.assertNot(userId, ["SUSPENDED", "BANNED"]);
    } catch (err) {
      if (!(err instanceof ApiException)) throw err;
      blocked = true;
    }
    if (this.blockedCache.size > 5000) this.blockedCache.clear();
    this.blockedCache.set(userId, { blocked, at: now });
    return blocked;
  }

  private close(ws: WsLike, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch (err) {
      this.logger.warn(`ws close failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
