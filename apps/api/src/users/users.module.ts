import { Global, Module } from "@nestjs/common";
import { RestrictionService } from "./restriction.service.js";
import { RolesService } from "./roles.service.js";
import { AdminGuard, AdminOnlyGuard } from "./admin.guard.js";

@Global()
@Module({
  providers: [RestrictionService, RolesService, AdminGuard, AdminOnlyGuard],
  exports: [RestrictionService, RolesService, AdminGuard, AdminOnlyGuard],
})
export class UsersModule {}
