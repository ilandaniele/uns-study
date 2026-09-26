import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../users/admin.guard.js";
import { AdminAuditService } from "./admin-audit.service.js";

@Controller("admin/audit")
@UseGuards(AdminGuard)
export class AdminAuditController {
  constructor(@Inject(AdminAuditService) private readonly audit: AdminAuditService) {}

  @Get()
  list(@Query("cursor") cursor?: string) {
    return this.audit.list(cursor);
  }
}
