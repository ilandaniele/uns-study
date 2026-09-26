import { Global, Module, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { closeDb, createDb, migrate, type Db } from "@uns/database";
import { env } from "../env.js";

export const DB = Symbol("DB");

function buildDb(): Db {
  return createDb({
    databaseUrl: env.databaseUrl || undefined,
    pgliteDir: env.pgliteDir || undefined,
  });
}

@Global()
@Module({
  providers: [{ provide: DB, useFactory: buildDb }],
  exports: [DB],
})
export class DatabaseModule implements OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Db) {}

  async onModuleInit(): Promise<void> {
    if (env.dbAutoMigrate) {
      await migrate(this.db);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await closeDb(this.db);
  }
}
