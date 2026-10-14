import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import type { MeDto } from "@sala/contracts";
import { env } from "../env.js";
import type { AppEnv } from "../http/context.js";
import { optionalAuth } from "../http/guards.js";
import { isAdFree } from "../subscriptions/ad-free.js";

export const meRouter = new Hono<AppEnv>();

meRouter.get("/me", optionalAuth, async (c) => {
  const { checkIns, db, roles, restriction } = c.var.services;
  const user = c.var.user;
  const subscriptionsEnabled = Boolean(env.mpAccessToken);
  const subscriptionPriceArs = env.subscriptionPriceArs;
  if (!user) {
    const anonymous: MeDto = {
      user: null,
      activeCheckIn: null,
      roles: [],
      restrictions: [],
      profileCompleted: false,
      adFree: false,
      subscriptionsEnabled,
      subscriptionPriceArs,
      canManageAdmins: false,
    };
    return c.json(anonymous);
  }

  await roles.ensureAdminFromEnv(user.id, user.email, user.emailVerified === true);

  const [activeCheckIn, userRoles, activeRestrictions, [profile], [subscription], canManageAdmins] = await Promise.all([
    checkIns.getActiveCheckIn(user.id),
    roles.rolesFor(user.id),
    restriction.activeRestrictions(user.id),
    db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, user.id)),
    db
      .select({ status: schema.userSubscriptions.status })
      .from(schema.userSubscriptions)
      .where(eq(schema.userSubscriptions.userId, user.id)),
    roles.isOwner(user.id),
  ]);

  const me: MeDto = {
    user,
    activeCheckIn,
    roles: userRoles,
    restrictions: activeRestrictions.map((r) => ({ type: r.type, until: r.until ? r.until.toISOString() : null })),
    profileCompleted: Boolean(profile && (profile.firstName || profile.nickname)),
    adFree: isAdFree({ subscriptionStatus: subscription?.status, roles: userRoles }),
    subscriptionsEnabled,
    subscriptionPriceArs,
    canManageAdmins,
  };
  return c.json(me);
});
