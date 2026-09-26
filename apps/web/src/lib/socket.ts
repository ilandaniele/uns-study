import { SocketEvents } from "@uns/contracts";
import { io, type Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";

let socket: Socket | null = null;

/**
 * Lazily creates a single shared Socket.IO connection for the browser session.
 * `withCredentials` forwards the Better Auth session cookie so the API can resolve
 * `socket.data.userId` on the handshake (required for chat/DM channels).
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      autoConnect: true,
    });
  }
  return socket;
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
