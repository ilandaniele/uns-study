import { Global, Module } from "@nestjs/common";
import { RestrictionService } from "./restriction.service.js";
import { RolesService } from "./roles.service.js";
import { AliasService } from "./alias.service.js";
import { AdminGuard, AdminOnlyGuard } from "./admin.guard.js";

@Global()
@Module({
  providers: [RestrictionService, RolesService, AliasService, AdminGuard, AdminOnlyGuard],
  exports: [RestrictionService, RolesService, AliasService, AdminGuard, AdminOnlyGuard],
})
export class UsersModule {}
