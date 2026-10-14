import { Logger } from "../platform/logger.js";
import { DEFAULT_DISCONNECT_CODE, DEFAULT_DISCONNECT_REASON, type RealtimeHub } from "./realtime-hub.js";
import { encodeServerEvent } from "./ws-protocol.js";
import type { SocketAttachment } from "./ws-server.js";

/** The slice of a hibernatable `WebSocket` the realtime layer touches. */
export interface WsLike {
  send(message: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

/** The slice of `DurableObjectState` the realtime layer touches. */
export interface SocketState {
  acceptWebSocket(ws: WsLike, tags?: string[]): void;
  getWebSockets(tag?: string): WsLike[];
}

export const userTag = (userId: string): string => `user:${userId}`;
export const ipTag = (ip: string): string => `ip:${ip}`;

/** Hub over the Durable Object's hibernating sockets. `user:` and `ip:` are WebSocket tags (fixed
 *  at accept); room and chat membership live in each socket's serialized attachment. */
export class DoRealtimeHub implements RealtimeHub {
  private readonly logger = new Logger(DoRealtimeHub.name);

  constructor(private readonly state: SocketState) {}

  publishToRoom(roomId: string, event: string, payload: unknown): void {
    this.sendTo(this.state.getWebSockets(), (a) => a.rooms.includes(roomId), event, payload);
  }

  publishToChat(chatRoomId: string, event: string, payload: unknown): void {
    this.sendTo(this.state.getWebSockets(), (a) => a.chats.includes(chatRoomId), event, payload);
  }

  publishToUser(userId: string, event: string, payload: unknown): void {
    this.sendTo(this.state.getWebSockets(userTag(userId)), () => true, event, payload);
  }

  broadcast(event: string, payload: unknown): void {
    this.sendTo(this.state.getWebSockets(), () => true, event, payload);
  }

  disconnectUser(userId: string, code = DEFAULT_DISCONNECT_CODE, reason = DEFAULT_DISCONNECT_REASON): void {
    for (const ws of this.state.getWebSockets(userTag(userId))) {
      try {
        ws.close(code, reason);
      } catch {
        // already closing
      }
    }
  }

  private sendTo(sockets: WsLike[], match: (a: SocketAttachment) => boolean, event: string, payload: unknown): void {
    if (sockets.length === 0) return;
    const frame = encodeServerEvent(event, payload);
    for (const ws of sockets) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (!attachment || !match(attachment)) continue;
      try {
        ws.send(frame);
      } catch (err) {
        this.logger.warn(`ws send failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
