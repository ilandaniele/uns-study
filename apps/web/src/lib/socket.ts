import { SocketEvents } from "@sala/contracts";
import { apiFetch, ApiRequestError } from "./api";
import { peekMe } from "./me-store";
import { decodeServerFrame, encodeClientFrame } from "./realtime-protocol";

/** Refresh the cached realtime token this long before the server-side expiry. */
const TOKEN_EXPIRY_MARGIN_MS = 30_000;
let cachedToken: RealtimeTokenDto | null = null;

interface RealtimeTokenDto {
  token: string;
  expiresAt: number;
}

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;
const RECONNECT_JITTER = 0.3;
/** The backoff restarts from the base delay once a connection has stayed open this long. */
const STABLE_AFTER_MS = 30_000;
const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;

/** Minimal socket surface the app uses; mirrors the subset of the old Socket.IO client API. */
export interface RealtimeSocket {
  readonly connected: boolean;
  /** Reserved events: "connect", "disconnect" (reason), "connect_error" (err). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (data: any) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, handler?: (data: any) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string, data?: unknown, ack?: (res: any) => void): this;
  connect(): this;
  /** Manual: no auto-reconnect until `connect()`. */
  disconnect(): this;
}
export type Socket = RealtimeSocket;

/**
 * Fetches a short-lived realtime auth token via the same-origin REST API (`GET
 * /api/v1/realtime/token`). It is sent as `?token=` on the WebSocket URL, so the socket does not
 * depend on the session cookie being readable by the socket host. Returns `null` for anonymous
 * visitors, who connect without one.
 */
async function fetchSocketToken(): Promise<string | null> {
  // Reuse the token until shortly before it expires (reconnects would otherwise refetch each time).
  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_EXPIRY_MARGIN_MS) return cachedToken.token;
  cachedToken = null;
  // Already known to be signed out: the endpoint would only answer 401.
  if (peekMe()?.user === null) return null;
  try {
    const dto = await apiFetch<RealtimeTokenDto>("/api/v1/realtime/token");
    cachedToken = dto;
    return dto.token;
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 401) return null;
    console.error("[socket] failed to fetch realtime token", err);
    return null;
  }
}

function socketBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (configured) return configured.replace(/^http/i, "ws").replace(/\/+$/, "");
  return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
}

type Handler = (data: unknown) => void;

class WebSocketClient implements RealtimeSocket {
  connected = false;

  private readonly listeners = new Map<string, Set<Handler>>();
  private ws: WebSocket | null = null;
  /** Bumped by every connect()/disconnect() so a stale async connect attempt can bail out. */
  private generation = 0;
  private manual = true;
  private connecting = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private nextAckId = 1;
  private readonly acks = new Map<number, Handler>();
  private buffer: Array<{ event: string; data: unknown; ack?: Handler }> = [];

  on(event: string, handler: Handler): this {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(handler);
    return this;
  }

  off(event: string, handler?: Handler): this {
    if (!handler) this.listeners.delete(event);
    else this.listeners.get(event)?.delete(handler);
    return this;
  }

  emit(event: string, data?: unknown, ack?: Handler): this {
    if (this.connected && this.ws) this.send(event, data, ack);
    else this.buffer.push({ event, data, ack });
    return this;
  }

  connect(): this {
    this.manual = false;
    if (this.ws || this.connecting || this.reconnectTimer) return this;
    void this.open();
    return this;
  }

  disconnect(): this {
    this.manual = true;
    this.generation++;
    this.connecting = false;
    this.clearReconnect();
    const ws = this.ws;
    if (ws) {
      this.teardown(ws, "io client disconnect");
      try {
        ws.close(1000, "client-disconnect");
      } catch {
        // already closed
      }
    }
    return this;
  }

  private dispatch(event: string, data?: unknown): void {
    for (const handler of [...(this.listeners.get(event) ?? [])]) {
      try {
        handler(data);
      } catch (err) {
        console.error(`[socket] handler for "${event}" threw`, err);
      }
    }
  }

  private send(event: string, data: unknown, ack?: Handler): void {
    let id: number | undefined;
    if (ack) {
      id = this.nextAckId++;
      this.acks.set(id, ack);
    }
    this.ws?.send(encodeClientFrame(event, data, id));
  }

  private async open(): Promise<void> {
    const generation = ++this.generation;
    this.connecting = true;
    const token = await fetchSocketToken();
    if (generation !== this.generation) return; // disconnected or superseded while fetching the token
    this.connecting = false;

    let ws: WebSocket;
    try {
      const url = `${socketBaseUrl()}/api/v1/realtime/ws${token ? `?token=${encodeURIComponent(token)}` : ""}`;
      ws = new WebSocket(url);
    } catch (err) {
      this.dispatch("connect_error", err);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    let opened = false;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      opened = true;
      this.connected = true;
      this.stableTimer = setTimeout(() => {
        this.attempt = 0;
      }, STABLE_AFTER_MS);
      this.pingTimer = setInterval(() => this.ping(ws), PING_INTERVAL_MS);
      this.dispatch("connect");
      const pending = this.buffer;
      this.buffer = [];
      for (const item of pending) this.send(item.event, item.data, item.ack);
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (this.ws !== ws || typeof ev.data !== "string") return;
      if (ev.data === "pong") {
        this.clearPong();
        return;
      }
      const frame = decodeServerFrame(ev.data);
      if (!frame) return;
      if ("ack" in frame) {
        const ack = this.acks.get(frame.ack);
        if (ack) {
          this.acks.delete(frame.ack);
          ack(frame.d);
        }
      } else {
        this.dispatch(frame.e, frame.d);
      }
    };
    ws.onerror = () => {
      if (this.ws === ws && !opened) this.dispatch("connect_error", new Error("websocket error"));
    };
    ws.onclose = (ev: CloseEvent) => {
      if (this.ws !== ws) return;
      this.teardown(ws, ev.reason || `transport close (${ev.code})`);
      if (!this.manual) this.scheduleReconnect();
    };
  }

  /** Detaches `ws` and reports the disconnect (only if it had been connected). */
  private teardown(ws: WebSocket, reason: string): void {
    if (this.ws !== ws) return;
    const wasConnected = this.connected;
    this.ws = null;
    this.connected = false;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.clearPong();
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.stableTimer = null;
    this.acks.clear(); // an ack can no longer arrive on a dead connection
    if (wasConnected) this.dispatch("disconnect", reason);
  }

  private ping(ws: WebSocket): void {
    if (this.ws !== ws || this.pongTimer) return;
    try {
      ws.send("ping");
    } catch {
      return;
    }
    this.pongTimer = setTimeout(() => {
      this.pongTimer = null;
      if (this.ws !== ws) return;
      // No pong in time: the connection is half-dead. Drop it and reconnect.
      this.teardown(ws, "ping timeout");
      try {
        ws.close(4000, "ping-timeout");
      } catch {
        // already closed
      }
      if (!this.manual) this.scheduleReconnect();
    }, PONG_TIMEOUT_MS);
  }

  private clearPong(): void {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private scheduleReconnect(): void {
    if (this.manual || this.reconnectTimer) return;
    const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.attempt);
    this.attempt++;
    const delay = Math.round(base * (1 + (Math.random() * 2 - 1) * RECONNECT_JITTER));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manual) void this.open();
    }, delay);
  }
}

/** Inert socket for server rendering: never connects, never buffers. */
const ssrSocket: RealtimeSocket = {
  connected: false,
  on() {
    return ssrSocket;
  },
  off() {
    return ssrSocket;
  },
  emit() {
    return ssrSocket;
  },
  connect() {
    return ssrSocket;
  },
  disconnect() {
    return ssrSocket;
  },
};

let socket: WebSocketClient | null = null;

/**
 * Lazily creates a single shared realtime connection for the browser session. A fresh token is
 * fetched before every (re)connection attempt (tokens are TTL-limited to 5 minutes).
 */
export function getSocket(): Socket {
  // Client components still render once on the server; never open a real connection from there
  // (it would try to fetch a relative token URL and keep a socket alive inside the SSR function).
  if (typeof window === "undefined") return ssrSocket;
  if (!socket) {
    socket = new WebSocketClient();
    socket.connect();
  }
  return socket;
}

/**
 * Forces the shared socket to drop its current connection and reconnect, fetching a fresh token
 * (or none, for a just-signed-out visitor). Call this right after a successful sign-in/sign-up/
 * sign-out so the socket leaves whatever anonymous/user channels it had joined instead of carrying
 * stale identity across the transition. A no-op if the socket hasn't been created yet.
 */
export function resetSocket(): void {
  cachedToken = null; // identity is changing; never reuse the previous user's token
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}

/**
 * Joins the realtime channel for a chat room. `chatRoomId` is the id from
 * `ChatMessageDto.chatRoomId` (the `chat_rooms` row id), not the study room id.
 * Requires an authenticated socket; the API silently ignores anonymous attempts.
 */
export function joinChat(chatRoomId: string): void {
  getSocket().emit(SocketEvents.ChatJoin, { roomId: chatRoomId });
}

export function leaveChat(chatRoomId: string): void {
  getSocket().emit(SocketEvents.ChatLeave, { roomId: chatRoomId });
}
