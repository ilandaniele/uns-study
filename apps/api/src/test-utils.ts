import { createDb, migrate, schema, seedInitialRoom, type Db } from "@uns/database";

export async function freshDb(): Promise<Db> {
  const db = createDb({ pgliteDir: "memory://" });
  await migrate(db, "");
  await seedInitialRoom(db);
  return db;
}

export async function insertUsers(db: Db, ids: string[], opts?: { createdAt?: Date }): Promise<void> {
  await db
    .insert(schema.user)
    .values(ids.map((id) => ({ id, name: id, email: `${id}@example.test`, ...(opts?.createdAt ? { createdAt: opts.createdAt } : {}) })));
}

export async function getRoom(db: Db) {
  const [room] = await db.select().from(schema.rooms);
  if (!room) throw new Error("seed missing room");
  return room;
}

export async function getSeats(db: Db) {
  return db.select().from(schema.seats).orderBy(schema.seats.code);
}
