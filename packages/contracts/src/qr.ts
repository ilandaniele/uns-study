export interface QrResolveDto {
  roomSlug: string;
  tableCode: string | null;
  seatCode?: string;
}

/** One closed operational day (Buenos Aires calendar date), snapshotted by the daily reset job. */
export interface RoomDailyStatDto {
  /** 'YYYY-MM-DD' */
  day: string;
  /** 0..1 daily seat coverage: share of active seats with at least one check-in or observation that day. */
  freshSeatCoverage: number;
  checkIns: number;
  observations: number;
  activeUsers: number;
}

export interface RoomStatsDto {
  roomId: string;
  /** 0..1 */
  freshSeatCoverage: number;
  activeCheckIns: number;
  observationsLast24h: number;
  checkInsLast24h: number;
  /** Distinct users with a check-in or observation in the window. */
  activeUsers7d: number;
  activeUsers30d: number;
  /** Distinct users active on >= 2 distinct Buenos Aires calendar days in the window. */
  returningUsers7d: number;
  returningUsers30d: number;
  /** Last 30 closed days, oldest first. */
  dailyStats: RoomDailyStatDto[];
  /** 0..1 share of the last 30 days' observations made with a verified QR (null when there were none). check_ins has no QR column, so there is no check-in share. */
  qrVerifiedObservationShare30d: number | null;
  qrVerifiedObservations30d: number;
  observations30d: number;
}
