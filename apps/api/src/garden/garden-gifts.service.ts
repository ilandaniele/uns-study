import { eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { gardenSeedGiftSchema, type GardenSeedGiftDto, type GardenSeedGiftRequest } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import type { Clock } from "../platform/clock.js";
import type { RolesService } from "../users/roles.service.js";
import type { RestrictionService } from "../users/restriction.service.js";
import type { RealtimeHub } from "../realtime/realtime-hub.js";
import type { GardenService } from "./garden.service.js";

export class GardenGiftsService {
  constructor(
    private readonly db: Db,
    private readonly garden: GardenService,
    private readonly roles: RolesService,
    private readonly restrictions: RestrictionService,
    private readonly clock: Clock,
    private readonly hub: RealtimeHub,
  ) {}

  async grant(actorId: string, userId: string, input: GardenSeedGiftRequest): Promise<GardenSeedGiftDto> {
    if (!(await this.roles.isSuperAdmin(actorId))) throw ApiErrors.forbidden("Sólo el súper admin puede regalar semillas.");
    await this.restrictions.assertNot(actorId, ["SUSPENDED", "BANNED"]);
    const parsed = gardenSeedGiftSchema.safeParse(input);
    if (!parsed.success) throw ApiErrors.validation("Ingresá entre 1 y 10.000 semillas y un motivo de 3 a 200 caracteres.");
    const gift = parsed.data;
    const result = this.db.transaction(tx => {
      const previous = tx.select().from(schema.gardenSeedGrants).where(eq(schema.gardenSeedGrants.id,gift.grantId)).get();
      if (previous) {
        if (previous.userId !== userId || previous.actorId !== actorId || previous.seeds !== gift.seeds)
          throw ApiErrors.validation("Ese regalo ya está asociado a otra cantidad o persona.");
        return { grantId: gift.grantId, seeds: previous.seeds, duplicate: true };
      }
      if (!tx.select({id:schema.user.id}).from(schema.user).where(eq(schema.user.id,userId)).get()) throw ApiErrors.notFound("La cuenta ya no está disponible.");
      this.garden.adjustPurchaseCredit(tx,userId,gift.seeds);
      tx.insert(schema.gardenSeedGrants).values({id:gift.grantId,userId,actorId,seeds:gift.seeds,createdAt:this.clock.now()}).run();
      tx.insert(schema.moderationActions).values({actorId,targetUserId:userId,action:"GARDEN_SEEDS_GRANTED",metadata:{grantId:gift.grantId,seeds:gift.seeds,reason:gift.reason}}).run();
      return {grantId:gift.grantId,seeds:gift.seeds,duplicate:false};
    });
    if (!result.duplicate) this.hub.publishToUser(userId,"garden:changed",{reason:"seeds"});
    return result;
  }
}
