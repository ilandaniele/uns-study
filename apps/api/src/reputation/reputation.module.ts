import { Global, Module } from "@nestjs/common";
import { ReputationService } from "./reputation.service.js";

@Global()
@Module({
  providers: [ReputationService],
  exports: [ReputationService],
})
export class ReputationModule {}
