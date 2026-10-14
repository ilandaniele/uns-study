import type { SocketState, WsLike } from "./do-realtime-hub.js";

/** In-memory stand-in for a hibernatable `WebSocket` (tests only). The attachment is structured-cloned
 *  on every write, like the real one, so tests catch accidental sharing of mutable state. */
export class FakeWebSocket implements WsLike {
  readonly sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  private attachment: unknown = null;

  send(message: string): void {
    if (this.closed) throw new Error("socket closed");
    this.sent.push(message);
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
  }

  serializeAttachment(value: unknown): void {
    this.attachment = structuredClone(value);
  }

  deserializeAttachment(): unknown {
    return this.attachment === null ? null : structuredClone(this.attachment);
  }

  /** Parsed JSON frames the server sent. */
  frames(): unknown[] {
    return this.sent.map((s) => JSON.parse(s) as unknown);
  }
}

/** In-memory stand-in for `DurableObjectState`'s socket methods (tests only). */
export class FakeSocketState implements SocketState {
  private readonly accepted: Array<{ ws: FakeWebSocket; tags: string[] }> = [];

  acceptWebSocket(ws: WsLike, tags: string[] = []): void {
    this.accepted.push({ ws: ws as FakeWebSocket, tags });
  }

  getWebSockets(tag?: string): FakeWebSocket[] {
    return this.accepted.filter((a) => !a.ws.closed && (tag === undefined || a.tags.includes(tag))).map((a) => a.ws);
  }

  /** Test helper: registers a socket with an attachment in one go. */
  add(ws: FakeWebSocket, tags: string[], attachment: unknown): FakeWebSocket {
    this.acceptWebSocket(ws, tags);
    ws.serializeAttachment(attachment);
    return ws;
  }
}
