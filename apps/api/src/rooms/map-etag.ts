import { createHash } from "node:crypto";
import type { RoomMapDto } from "@sala/contracts";

/**
 * Strong ETag for a room map: a hash of everything that can change between two reads — each seat's
 * live state (status, confidence, last update, dispute, verification) and each table's nickname.
 * Quoted per RFC 9110.
 */
export function roomMapEtag(map: RoomMapDto): string {
  const hash = createHash("sha1");
  hash.update(map.room.id);
  hash.update(JSON.stringify(map.room.operatingHours ?? null));
  for (const s of map.seats) {
    hash.update(`|${s.id}:${s.status}:${s.confidence}:${s.lastUpdatedAt ?? ""}:${s.dispute?.id ?? ""}:${s.dispute?.closesAt ?? ""}:${s.verified ? 1 : 0}`);
  }
  for (const t of map.tables) hash.update(`|${t.id}:${t.nickname ?? ""}`);
  return `"${hash.digest("base64url")}"`;
}

/** True when an `If-None-Match` header (list, weak validators, or `*`) matches `etag`. */
export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === "*") return true;
  return ifNoneMatch.split(",").some((tag) => tag.trim().replace(/^W\//, "") === etag);
}
