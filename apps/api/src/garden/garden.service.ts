import { and, eq, or } from "drizzle-orm";
import { schema, type Db, type Tx } from "@sala/database";
import {
  GARDEN_MINUTES_PER_SEED,
  GARDEN_SPECIES,
  GARDEN_STARTER_SEEDS,
  type GardenDto,
  type GardenPlant,
  type GardenPlantRequest,
  type GardenRedeemRequest,
  type SharedGardenDto,
} from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { isMissingSchemaError } from "../common/sqlite-errors.js";
import type { Clock } from "../platform/clock.js";
import { loadStudyIntervals } from "../study-history/study-intervals.js";
import { CollaborationService } from "../badges/collaboration.service.js";
import type { CollaborationProgressDto } from "@sala/contracts";

interface StoredPlant {
  id: string;
  plot: number;
  speciesId: string;
  plantedAt: string;
  baselineMinutes: number;
}
interface GardenState {
  collaboration: CollaborationProgressDto;
  shared: boolean;
  spentSeeds: number;
  bonusSeeds: number;
  plants: StoredPlant[];
  collection: Record<string, number>;
}

/** Study time is read from the existing server ledger; the browser never submits credit or balance. */
export class GardenService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly collaboration = new CollaborationService(db, clock),
  ) {}

  /** Called inside the payment transaction: balance and provider receipt must commit together. */
  adjustPurchaseCredit(tx: Tx, userId: string, delta: number): void {
    const state = this.read(userId);
    const bonusSeeds = state.bonusSeeds + delta;
    tx.insert(schema.userGardens)
      .values({ userId, bonusSeeds, updatedAt: this.clock.now() })
      .onConflictDoUpdate({
        target: schema.userGardens.userId,
        set: { bonusSeeds, updatedAt: this.clock.now() },
      })
      .run();
  }

  async get(userId: string): Promise<GardenDto> {
    const minutes = await this.studyMinutes(userId);
    return this.dto(this.read(userId), minutes);
  }

  async visit(viewerId: string, userId: string): Promise<SharedGardenDto> {
    const dto = await this.get(userId);
    const exists = this.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).get();
    const block = this.db.select().from(schema.userBlocks).where(or(
      and(eq(schema.userBlocks.blockerId, viewerId), eq(schema.userBlocks.blockedId, userId)),
      and(eq(schema.userBlocks.blockerId, userId), eq(schema.userBlocks.blockedId, viewerId)),
    )).get();
    // Gardens are always visitable by signed-in users. Recheck blocks after the awaited ledger.
    if (!exists || block) throw ApiErrors.notFound();
    return {
      plants: dto.plants.map(({ plot, speciesId, stage, progress }) => ({ plot, speciesId, stage, progress })),
      collection: dto.collection,
    };
  }

  async plant(userId: string, input: GardenPlantRequest): Promise<GardenDto> {
    const species = GARDEN_SPECIES.find((s) => s.id === input.speciesId);
    if (
      !species ||
      !Number.isInteger(input.plot) ||
      input.plot < 0 ||
      input.plot >= 25
    )
      throw ApiErrors.validation();
    const minutes = await this.studyMinutes(userId);
    return this.mutate(userId, minutes, (state) => {
      if (state.plants.some((p) => p.plot === input.plot))
        throw ApiErrors.validation("Esta parcela ya tiene un árbol.");
      if (this.balance(state, minutes) < species.cost)
        throw ApiErrors.validation("Todavía no tenés suficientes semillas.");
      state.spentSeeds += species.cost;
      state.plants.push({
        id: crypto.randomUUID(),
        plot: input.plot,
        speciesId: species.id,
        plantedAt: this.clock.now().toISOString(),
        baselineMinutes: minutes,
      });
    });
  }

  async redeem(userId: string, input: GardenRedeemRequest): Promise<GardenDto> {
    const minutes = await this.studyMinutes(userId);
    return this.mutate(userId, minutes, (state) => {
      const plant = state.plants.find(
        (p) => p.plot === input.plot && p.id === input.plantId,
      );
      if (!plant)
        throw ApiErrors.notFound(
          "Este árbol ya se canjeó o no pertenece a tu jardín.",
        );
      const species = GARDEN_SPECIES.find((s) => s.id === plant.speciesId)!;
      if (minutes - plant.baselineMinutes < species.growthMinutes)
        throw ApiErrors.validation("El árbol todavía está creciendo.");
      state.bonusSeeds += species.reward;
      state.collection[species.id] = (state.collection[species.id] ?? 0) + 1;
      state.plants = state.plants.filter((p) => p.id !== plant.id);
    });
  }

  private async studyMinutes(userId: string): Promise<number> {
    const intervals = await loadStudyIntervals(
      this.db,
      userId,
      "1970-01-01",
      this.clock.now(),
    );
    // Manual adjustments, local Pomodoro time and merely leaving the app open earn no game credit.
    return Math.max(
      0,
      Math.floor(
        intervals
          .filter((i) => !i.manual)
          .reduce((sum, i) => sum + i.minutes, 0),
      ),
    );
  }

  private read(userId: string): GardenState {
    try {
      const row = this.db
        .select()
        .from(schema.userGardens)
        .where(eq(schema.userGardens.userId, userId))
        .get();
      return row
        ? {
            collaboration: this.collaboration.progress(userId),
            shared: row.shared,
            spentSeeds: row.spentSeeds,
            bonusSeeds: row.bonusSeeds,
            plants: JSON.parse(row.plants) as StoredPlant[],
            collection: JSON.parse(row.collection) as Record<string, number>,
          }
        : { shared: false, spentSeeds: 0, bonusSeeds: 0, plants: [], collection: {}, collaboration: this.collaboration.progress(userId) };
    } catch (error) {
      if (isMissingSchemaError(error))
        throw ApiErrors.featureDisabled(
          "El jardín se está preparando. Volvé en unos minutos.",
        );
      throw error;
    }
  }

  private balance(state: GardenState, minutes: number): number {
    return (
      GARDEN_STARTER_SEEDS +
      Math.floor(minutes / GARDEN_MINUTES_PER_SEED) +
      state.bonusSeeds -
      state.spentSeeds + state.collaboration.seeds
    );
  }

  private dto(state: GardenState, minutes: number): GardenDto {
    return {
      collaboration: state.collaboration,
      shared: true,
      seeds: this.balance(state, minutes),
      studyMinutes: minutes,
      nextSeedMinutes:
        GARDEN_MINUTES_PER_SEED - (minutes % GARDEN_MINUTES_PER_SEED),
      collection: state.collection,
      plants: state.plants.map((plant): GardenPlant => {
        const species = GARDEN_SPECIES.find((s) => s.id === plant.speciesId)!;
        const studiedMinutes = Math.max(0, minutes - plant.baselineMinutes);
        const progress = Math.min(1, studiedMinutes / species.growthMinutes);
        return {
          id: plant.id,
          plot: plant.plot,
          speciesId: plant.speciesId,
          plantedAt: plant.plantedAt,
          studiedMinutes,
          progress,
          stage:
            progress >= 1
              ? "mature"
              : progress >= 0.4
                ? "young"
                : progress >= 0.1
                  ? "sprout"
                  : "seed",
        };
      }),
    };
  }

  private mutate(
    userId: string,
    minutes: number,
    change: (state: GardenState) => void,
  ): GardenDto {
    // Read, validate balance/ownership and write synchronously in the same SQLite transaction.
    return this.db.transaction((tx) => {
      const state = this.read(userId);
      change(state);
      const values = {
        shared: state.shared,
        spentSeeds: state.spentSeeds,
        bonusSeeds: state.bonusSeeds,
        plants: JSON.stringify(state.plants),
        collection: JSON.stringify(state.collection),
        updatedAt: this.clock.now(),
      };
      tx.insert(schema.userGardens)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: schema.userGardens.userId, set: values })
        .run();
      return this.dto(state, minutes);
    });
  }
}
