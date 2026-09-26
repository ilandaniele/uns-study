import { Global, Module } from "@nestjs/common";
import type { Db } from "@uns/database";
import { DB } from "../database/database.module.js";
import { buildAuth, type Auth } from "./auth.instance.js";
import { AUTH } from "./auth.tokens.js";
import { MeController } from "./me.controller.js";
import { CheckInsModule } from "../checkins/checkins.module.js";

@Global()
@Module({
  imports: [CheckInsModule],
  controllers: [MeController],
  providers: [{ provide: AUTH, useFactory: (db: Db) => buildAuth(db), inject: [DB] }],
  exports: [AUTH],
})
export class AuthModule {}

export { AUTH };
export type { Auth };
