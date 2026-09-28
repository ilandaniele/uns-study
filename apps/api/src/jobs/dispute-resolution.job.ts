import { Inject, Injectable } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { DisputeService } from "../disputes/disputes.service.js";

const TICK_INTERVAL_MS = 15_000;

/** Resolves any OPEN seat dispute whose 5-minute window has closed. Also resolved lazily on reads/votes. */
@Injectable()
export class DisputeResolutionJob {
  constructor(@Inject(DisputeService) private readonly disputes: DisputeService) {}

  @Interval(TICK_INTERVAL_MS)
  async tick(): Promise<void> {
    await this.disputes.resolveDue(new Date());
  }
}
