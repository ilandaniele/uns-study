import { SocketEvents } from "@uns/contracts";
import { io, type Socket } from "socket.io-client";
import { apiFetch, ApiRequestError } from "./api";
import { peekMe } from "./me-store";

// Resolved at build time in next.config.ts (falls back to API_PROXY_TARGET, then localhost).
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

let socket: Socket | null = null;

/** Refresh the cached realtime token this long before the server-side expiry. */
const TOKEN_EXPIRY_MARGIN_MS = 30_000;
let cachedToken: RealtimeTokenDto | null = null;

interface RealtimeTokenDto {
  token: string;
  expiresAt: number;
}

/**
 * Fetches a short-lived Socket.IO auth token via the same-origin REST API (`GET
 * /api/v1/realtime/token`, works behind the web app's proxy). The socket itself connects straight
 * to `NEXT_PUBLIC_SOCKET_URL` — Socket.IO can't be routed through Vercel's rewrites — so it can't
 * rely on the session cookie in production and needs this token instead. Returns `null` for
 * anonymous visitors, who connect without one.
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

/**
 * Lazily creates a single shared Socket.IO connection for the browser session.
 * `auth` is a function so Socket.IO calls it again before every (re)connection attempt, fetching a
 * fresh token each time (tokens are TTL-limited to 5 minutes). `withCredentials` is kept for local
 * dev, where the socket and API share an origin and the session cookie is also readable there.
 */
export function getSocket(): Socket {
  // Client components still render once on the server; never open a real connection from there
  // (it would try to fetch a relative token URL and keep a socket alive inside the SSR function).
  if (typeof window === "undefined") {
    return io(SOCKET_URL, { autoConnect: false });
  }
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      autoConnect: true,
      // WebSocket first: skips the polling handshake round-trips; polling stays as a fallback.
      transports: ["websocket", "polling"],
      auth: (cb) => {
        void fetchSocketToken().then((token) => cb(token ? { token } : {}));
      },
    });
  }
  return socket;
}

/**
 * Forces the shared socket to drop its current connection and reconnect, re-running the `auth`
 * callback above so it picks up a fresh token (or none, for a just-signed-out visitor). Call this
 * right after a successful sign-in/sign-up/sign-out so the socket leaves whatever anonymous/user
 * channels it had joined instead of carrying stale identity across the transition. A no-op if the
 * socket hasn't been created yet (nothing to reconnect).
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
