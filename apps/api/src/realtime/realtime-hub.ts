/** Where the domain services push realtime notifications. Production: `DoRealtimeHub` over the
 *  Durable Object's hibernating sockets. Tests: `RecordingHub`. The rule still holds:
 *  the Durable Object SQLite database is canonical, these are only notifications. */
export interface RealtimeHub {
  publishToRoom(roomId: string, event: string, payload: unknown): void;
  publishToChat(chatRoomId: string, event: string, payload: unknown): void;
  publishToUser(userId: string, event: string, payload: unknown): void;
  broadcast(event: string, payload: unknown): void;
  /** Closes every live socket of a user; default code 4001 "session-ended". */
  disconnectUser(userId: string, code?: number, reason?: string): void;
}

export const DEFAULT_DISCONNECT_CODE = 4001;
export const DEFAULT_DISCONNECT_REASON = "session-ended";

/** Test double: records what would have been sent. `to` is `room:<id>`, `chat:<id>`, `user:<id>` or `*`. */
export class RecordingHub implements RealtimeHub {
  readonly sent: Array<{ to: string; event: string; payload: unknown }> = [];
  readonly disconnects: Array<{ userId: string; code: number; reason: string }> = [];

  publishToRoom(roomId: string, event: string, payload: unknown): void {
    this.sent.push({ to: `room:${roomId}`, event, payload });
  }

  publishToChat(chatRoomId: string, event: string, payload: unknown): void {
    this.sent.push({ to: `chat:${chatRoomId}`, event, payload });
  }

  publishToUser(userId: string, event: string, payload: unknown): void {
    this.sent.push({ to: `user:${userId}`, event, payload });
  }

  broadcast(event: string, payload: unknown): void {
    this.sent.push({ to: "*", event, payload });
  }

  disconnectUser(userId: string, code = DEFAULT_DISCONNECT_CODE, reason = DEFAULT_DISCONNECT_REASON): void {
    this.disconnects.push({ userId, code, reason });
  }

  /** Events sent so far, optionally narrowed to one event name. */
  eventsFor(event?: string): Array<{ to: string; event: string; payload: unknown }> {
    return event ? this.sent.filter((s) => s.event === event) : [...this.sent];
  }
}
