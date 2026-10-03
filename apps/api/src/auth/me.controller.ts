import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { env } from "../env.js";
import type { MeDto } from "@sala/contracts";
import { OptionalAuthGuard } from "./auth.guard.js";
import { CurrentUser } from "./current-user.decorator.js";
import type { RequestUser } from "./request-user.js";
import { CheckInService } from "../checkins/checkins.service.js";
import { DB } from "../database/database.module.js";
import { RolesService } from "../users/roles.service.js";
import { RestrictionService } from "../users/restriction.service.js";

@Controller("me")
@UseGuards(OptionalAuthGuard)
export class MeController {
  constructor(
    @Inject(CheckInService) private readonly checkIns: CheckInService,
    @Inject(DB) private readonly db: Db,
    @Inject(RolesService) private readonly roles: RolesService,
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
  ) {}

  @Get()
  async get(@CurrentUser() user: RequestUser | undefined): Promise<MeDto> {
    const subscriptionsEnabled = Boolean(env.mpAccessToken);
    const subscriptionPriceArs = env.subscriptionPriceArs;
    if (!user) {
      return {
        user: null,
        activeCheckIn: null,
        roles: [],
        restrictions: [],
        profileCompleted: false,
        adFree: false,
        subscriptionsEnabled,
        subscriptionPriceArs,
      };
    }

    await this.roles.ensureAdminFromEnv(user.id, user.email, user.emailVerified === true);

    const [activeCheckIn, roles, activeRestrictions, [profile], [subscription]] = await Promise.all([
      this.checkIns.getActiveCheckIn(user.id),
      this.roles.rolesFor(user.id),
      this.restrictions.activeRestrictions(user.id),
      this.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, user.id)),
      this.db
        .select({ status: schema.userSubscriptions.status })
        .from(schema.userSubscriptions)
        .where(eq(schema.userSubscriptions.userId, user.id)),
    ]);

    return {
      user,
      activeCheckIn,
      roles,
      restrictions: activeRestrictions.map((r) => ({ type: r.type, until: r.until ? r.until.toISOString() : null })),
      profileCompleted: Boolean(profile && (profile.firstName || profile.nickname)),
      adFree: subscription?.status === "authorized",
      subscriptionsEnabled,
      subscriptionPriceArs,
    };
  }
}
