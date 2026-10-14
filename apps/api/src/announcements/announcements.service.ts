import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { AnnouncementDto, announcementSchema } from "@sala/contracts";
import type { z } from "zod";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";

export type AnnouncementInput = z.infer<typeof announcementSchema>;

@Injectable()
export class AnnouncementsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Announcements visible right now for a room: global (roomId null) + room-specific, active and in window. */
  async listActive(roomId: string, now: Date = new Date()): Promise<AnnouncementDto[]> {
    const rows = await this.db
      .select()
      .from(schema.announcements)
      .where(
        and(
          eq(schema.announcements.active, true),
          or(isNull(schema.announcements.roomId), eq(schema.announcements.roomId, roomId)),
          lte(schema.announcements.startsAt, now),
          or(isNull(schema.announcements.endsAt), gte(schema.announcements.endsAt, now)),
        ),
      )
      .orderBy(desc(schema.announcements.startsAt));
    return rows.map(toDto);
  }

  /** All announcements (incl. inactive/expired), newest first — for the admin CRUD list. */
  async listAll(): Promise<AnnouncementDto[]> {
    const rows = await this.db.select().from(schema.announcements).orderBy(desc(schema.announcements.createdAt));
    return rows.map(toDto);
  }

  async create(input: AnnouncementInput, createdBy: string): Promise<AnnouncementDto> {
    const [row] = await this.db
      .insert(schema.announcements)
      .values({
        roomId: input.roomId ?? null,
        title: input.title,
        body: input.body,
        active: input.active ?? true,
        startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        createdBy,
      })
      .returning();
    if (!row) throw new Error("Failed to create announcement");
    return toDto(row);
  }

  async update(id: string, input: Partial<AnnouncementInput>): Promise<AnnouncementDto> {
    const [existing] = await this.db.select().from(schema.announcements).where(eq(schema.announcements.id, id)).limit(1);
    if (!existing) throw ApiErrors.notFound("Anuncio no encontrado.");

    const [row] = await this.db
      .update(schema.announcements)
      .set({
        ...(input.roomId !== undefined ? { roomId: input.roomId } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.startsAt !== undefined ? { startsAt: new Date(input.startsAt) } : {}),
        ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.announcements.id, id))
      .returning();
    if (!row) throw new Error("Failed to update announcement");
    return toDto(row);
  }

  async remove(id: string): Promise<string | null> {
    const [row] = await this.db.delete(schema.announcements).where(eq(schema.announcements.id, id)).returning();
    return row?.roomId ?? null;
  }
}

function toDto(row: typeof schema.announcements.$inferSelect): AnnouncementDto {
  return {
    id: row.id,
    roomId: row.roomId,
    title: row.title,
    body: row.body,
    startsAt: new Date(row.startsAt).toISOString(),
    endsAt: row.endsAt ? new Date(row.endsAt).toISOString() : null,
    active: row.active,
  };
}
