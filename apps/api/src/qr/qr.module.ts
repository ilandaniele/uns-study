import { Global, Module } from "@nestjs/common";
import { RoomsModule } from "../rooms/rooms.module.js";
import { QrService } from "./qr.service.js";
import { AdminQrController, QrResolveController } from "./qr.controller.js";

@Global()
@Module({
  imports: [RoomsModule],
  controllers: [AdminQrController, QrResolveController],
  providers: [QrService],
  exports: [QrService],
})
export class QrModule {}
