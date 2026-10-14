import type { DisputeService } from "../disputes/disputes.service.js";

/** Resolves any OPEN seat dispute whose 5-minute window has closed. Also resolved lazily on reads/votes. */
export class DisputeResolutionJob {
  constructor(private readonly disputes: DisputeService) {}

  /** Scheduler entry point (`dispute-resolution`, every 15 s). */
  async tick(): Promise<void> {
    await this.disputes.resolveDue(new Date());
  }
}
