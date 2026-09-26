import type { RoomMapDto } from "@uns/contracts";

// Shapes returned by admin-only API endpoints that aren't part of the shared `@uns/contracts`
// package (admin responses are duck-typed here to match `apps/api/src/admin/*`).

export interface AdminOccupantDto {
  seatId: string;
  seatCode: string;
  userId: string;
  name: string;
  email: string;
}

export interface AdminLiveDto {
  map: RoomMapDto;
  occupants: AdminOccupantDto[];
}

export interface AuditEntryDto {
  id: string;
  actorId: string | null;
  targetUserId: string | null;
  reportId: string | null;
  action: string;
  metadata: unknown;
  createdAt: string;
}

export interface AdminUserSearchResultDto {
  userId: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface RoomQrCodeDto {
  id: string;
  token: string;
  tableCode: string | null;
  active: boolean;
  createdAt: string;
}
