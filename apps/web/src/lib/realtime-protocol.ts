/** Client half of the wire protocol shared with the API (JSON text frames). The API keeps the full file
 *  (`apps/api/src/realtime/ws-protocol.ts`, adding the server-side encoders/decoders): keep the shared types and
 *  `decodeServerFrame`/`encodeClientFrame` in sync. No imports. */

/** client -> server. `id` present means the client expects an ack. */
export interface ClientFrame {
  e: string;
  d?: unknown;
  id?: number;
}

/** server -> client event. */
export interface ServerEvent {
  e: string;
  d: unknown;
}

/** server -> client reply to a `ClientFrame` that carried an `id`. */
export interface ServerAck {
  ack: number;
  d: unknown;
}

export type ServerFrame = ServerEvent | ServerAck;

/** Heartbeat: the client sends the raw text `ping`, the runtime auto-answers `pong` without waking the DO. */
export const WS_PING = "ping";
export const WS_PONG = "pong";

export function encodeClientFrame(e: string, d?: unknown, id?: number): string {
  const frame: ClientFrame = { e };
  if (d !== undefined) frame.d = d;
  if (id !== undefined) frame.id = id;
  return JSON.stringify(frame);
}

function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Parses a server frame; `null` for anything malformed (the client ignores those). */
export function decodeServerFrame(raw: string): ServerFrame | null {
  const obj = parseObject(raw);
  if (!obj) return null;
  if (typeof obj.ack === "number") return { ack: obj.ack, d: obj.d };
  if (typeof obj.e === "string") return { e: obj.e, d: obj.d };
  return null;
}
