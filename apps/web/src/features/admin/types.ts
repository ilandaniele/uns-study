import type { RoomMapDto } from "@sala/contracts";

// Shapes returned by admin-only API endpoints that aren't part of the shared `@sala/contracts`
// package (admin responses are duck-typed here to match `apps/api/src/admin/*`).

export interface AdminOccupantDto {
  seatId: string;
  seatCode: string;
  userId: string;
  name: string;
  /** Null unless the caller is an ADMIN. */
  email: string | null;
}

export interface AdminLiveDto {
  map: RoomMapDto;
  occupants: AdminOccupantDto[];
}

export interface AuditEntryDto {
  id: string;
  actorId: string | null;
  actorName: string | null;
  targetUserId: string | null;
  targetName: string | null;
  reportId: string | null;
  action: string;
  metadata: unknown;
  createdAt: string;
}

export interface AdminUserSearchResultDto {
  userId: string;
  name: string;
  email: string | null;
  createdAt: string;
  isAdmin: boolean;
}

export interface RoomQrCodeDto {
  id: string;
  token: string;
  tableCode: string | null;
  active: boolean;
  createdAt: string;
  scanCount: number;
  lastScannedAt: string | null;
}
