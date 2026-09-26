export interface QrResolveDto {
  roomSlug: string;
  tableCode: string | null;
}

export interface RoomStatsDto {
  roomId: string;
  /** 0..1 */
  freshSeatCoverage: number;
  activeCheckIns: number;
  observationsLast24h: number;
  checkInsLast24h: number;
}
