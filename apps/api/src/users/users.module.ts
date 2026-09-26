import { Global, Module } from "@nestjs/common";
import { RestrictionService } from "./restriction.service.js";
import { RolesService } from "./roles.service.js";
import { AdminGuard } from "./admin.guard.js";

@Global()
@Module({
  providers: [RestrictionService, RolesService, AdminGuard],
  exports: [RestrictionService, RolesService, AdminGuard],
})
export class UsersModule {}
