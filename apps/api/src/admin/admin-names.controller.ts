import { Controller, Delete, Inject, Param, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../users/admin.guard.js";
import { UuidParamPipe } from "../common/uuid-param.pipe.js";
import { TableNamesService } from "../table-names/table-names.service.js";

@Controller("admin/names")
@UseGuards(AdminGuard)
export class AdminNamesController {
  constructor(@Inject(TableNamesService) private readonly tableNames: TableNamesService) {}

  @Delete(":proposalId")
  deleteProposal(@Param("proposalId", UuidParamPipe) proposalId: string) {
    return this.tableNames.adminDeleteProposal(proposalId);
  }

  @Delete("tables/:tableId/nickname")
  clearNickname(@Param("tableId", UuidParamPipe) tableId: string) {
    return this.tableNames.adminClearNickname(tableId);
  }
}
