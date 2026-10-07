import { Global, Inject, Module, type BeforeApplicationShutdown } from "@nestjs/common";
import { RoomRealtimeGateway } from "./room-realtime.gateway.js";
import { RealtimeTokenController } from "./realtime-token.controller.js";
import { RoomsModule } from "../rooms/rooms.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { flushBackground } from "../common/background.js";

/** Upper bound on draining in-flight work at shutdown; Fly's `kill_timeout` is 15 s. */
export const SHUTDOWN_DRAIN_TIMEOUT_MS = 10_000;

/** Awaits `flushBackground()` and `gateway.flushPending()`, giving up (without throwing) after `timeoutMs`. */
export async function drainOnShutdown(gateway: Pick<RoomRealtimeGateway, "flushPending">, timeoutMs = SHUTDOWN_DRAIN_TIMEOUT_MS): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.error(JSON.stringify({ evt: "shutdown_drain_timeout", timeoutMs }));
      resolve();
    }, timeoutMs);
  });
  const drain = Promise.all([flushBackground(), gateway.flushPending()]).then(
    () => undefined,
    (err: unknown) => console.error(JSON.stringify({ evt: "shutdown_drain_error", msg: err instanceof Error ? err.message : String(err) })),
  );
  try {
    await Promise.race([drain, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

@Global()
@Module({
  imports: [RoomsModule, AuthModule, NotificationsModule],
  controllers: [RealtimeTokenController],
  providers: [RoomRealtimeGateway],
  exports: [RoomRealtimeGateway],
})
export class RealtimeModule implements BeforeApplicationShutdown {
  constructor(@Inject(RoomRealtimeGateway) private readonly gateway: RoomRealtimeGateway) {}

  // Runs before DatabaseModule closes the pool (onApplicationShutdown), so queued security events
  // and coalesced seat summaries can still hit the DB.
  async beforeApplicationShutdown(): Promise<void> {
    await drainOnShutdown(this.gateway);
  }
}
