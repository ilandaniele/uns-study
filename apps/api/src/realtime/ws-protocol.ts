/** Wire protocol shared by the API and the web client (JSON text frames). `apps/web/src/lib/
 *  realtime-protocol.ts` is a byte-identical copy of this file: change both together. No imports. */

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

/** Frames larger than this close the socket with 1009. */
export const MAX_FRAME_BYTES = 4096;

export const WsCloseCodes = {
  TooBig: 1009,
  ServerError: 1011,
  SessionEnded: 4001,
  RateLimited: 4008,
} as const;

export function encodeServerEvent(e: string, d: unknown): string {
  return JSON.stringify({ e, d } satisfies ServerEvent);
}

export function encodeServerAck(ack: number, d: unknown): string {
  return JSON.stringify({ ack, d } satisfies ServerAck);
}

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

/** Parses a client frame; `null` for anything malformed (the server ignores those). */
export function decodeClientFrame(raw: string): ClientFrame | null {
  const obj = parseObject(raw);
  if (!obj || typeof obj.e !== "string") return null;
  const frame: ClientFrame = { e: obj.e };
  if ("d" in obj) frame.d = obj.d;
  if (obj.id !== undefined) {
    if (typeof obj.id !== "number" || !Number.isSafeInteger(obj.id)) return null;
    frame.id = obj.id;
  }
  return frame;
}

/** Parses a server frame; `null` for anything malformed (the client ignores those). */
export function decodeServerFrame(raw: string): ServerFrame | null {
  const obj = parseObject(raw);
  if (!obj) return null;
  if (typeof obj.ack === "number") return { ack: obj.ack, d: obj.d };
  if (typeof obj.e === "string") return { e: obj.e, d: obj.d };
  return null;
}
