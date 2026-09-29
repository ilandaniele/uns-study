import { Module } from "@nestjs/common";
import { RoomsModule } from "../rooms/rooms.module.js";
import { NotificationPreferencesController } from "./notification-preferences.controller.js";
import { NotificationPreferencesService } from "./notification-preferences.service.js";
import { PushSubscriptionsController, VapidPublicKeyController } from "./push-subscriptions.controller.js";
import { PushSubscriptionsService } from "./push-subscriptions.service.js";
import { PushService } from "./push.service.js";
import { NotificationService } from "./notification.service.js";

@Module({
  imports: [RoomsModule],
  controllers: [NotificationPreferencesController, PushSubscriptionsController, VapidPublicKeyController],
  providers: [NotificationPreferencesService, PushSubscriptionsService, PushService, NotificationService],
  exports: [NotificationService, PushService],
})
export class NotificationsModule {}
