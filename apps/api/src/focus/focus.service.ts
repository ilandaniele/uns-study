import { eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { FocusCommandRequest, FocusSnapshot, FocusSyncDto } from "@sala/contracts";
import { DEFAULT_SETTINGS, applySettings, initialState, pause, recordCompletions, resetAll, resetPhase, selectPhase, skip, start, tick } from "@sala/contracts/focus-timer";
import { ApiException } from "../common/api-error.js";
import type { Clock } from "../platform/clock.js";
import type { RealtimeHub } from "../realtime/realtime-hub.js";

const defaults = (): FocusSnapshot => ({ settings: DEFAULT_SETTINGS, timer: initialState(DEFAULT_SETTINGS), stats: { days: {} } });
const dayFormat = new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"});

export class FocusService {
  constructor(private readonly db: Db, private readonly clock: Clock, private readonly hub: RealtimeHub) {}

  get(userId: string): FocusSyncDto {
    return this.change(userId);
  }

  command(userId: string, input: FocusCommandRequest): FocusSyncDto {
    return this.change(userId, input);
  }

  pauseForAbsence(userId: string): void {
    const row = this.db.select().from(schema.userFocus).where(eq(schema.userFocus.userId, userId)).get();
    if (row && (JSON.parse(row.state) as FocusSnapshot).timer.status === "running") this.change(userId, { version: row.version, command: { action: "pause" } });
  }

  private change(userId: string, input?: FocusCommandRequest): FocusSyncDto {
    const now = this.clock.now().getTime();
    let changed = false;
    const result = this.db.transaction(tx => {
      const row = tx.select().from(schema.userFocus).where(eq(schema.userFocus.userId, userId)).get();
      const version = row?.version ?? 0;
      if (input && input.version !== version) throw new ApiException("VALIDATION_ERROR", "El reloj cambió en otro dispositivo. Actualizamos la sesión; volvé a intentar la acción.", 409);
      if (!row && !input) return { state: null, version: 0, serverNow: now };
      let state: FocusSnapshot = row ? JSON.parse(row.state) as FocusSnapshot : defaults();
      const command = input?.command;
      if (command?.action === "initialize") {
        if (row) throw new ApiException("VALIDATION_ERROR", "La cuenta ya tiene un reloj sincronizado.", 409);
        state = {...command.state,timer:{...command.state.timer}};
        // Imports are personal history only, never verified study credit. Clamp a stale/skewed clock.
        if (state.timer.status === "running") state.timer.endsAt = Math.min(state.timer.endsAt ?? now, now + 180 * 60000);
      }
      const settled = tick(state.timer, state.settings, now);
      state = { ...state, timer: settled.state, stats: recordCompletions(state.stats, settled.completed,epoch=>dayFormat.format(new Date(epoch))) };
      if (command) switch (command.action) {
        case "start": state.timer = start(state.timer, now); break;
        case "pause": state.timer = pause(state.timer, now); break;
        case "resetPhase": state.timer = resetPhase(state.timer, state.settings); break;
        case "resetAll": state.timer = resetAll(state.settings); break;
        case "skip": state.timer = skip(state.timer, state.settings, now); break;
        case "selectPhase": state.timer = selectPhase(state.timer, command.phase, state.settings); break;
        case "setSettings": state.settings = command.settings; state.timer = applySettings(state.timer, command.settings); break;
      }
      const serialized = JSON.stringify(state);
      changed = serialized !== row?.state;
      const nextVersion = version + (changed ? 1 : 0);
      if (changed) tx.insert(schema.userFocus).values({ userId, state: serialized, version: nextVersion, updatedAt: new Date(now) })
        .onConflictDoUpdate({ target: schema.userFocus.userId, set: { state: serialized, version: nextVersion, updatedAt: new Date(now) } }).run();
      return { state, version: nextVersion, serverNow: now };
    });
    // No timer, task text, history or identity is ever broadcast to the room.
    if (changed) this.hub.publishToUser(userId, "focus:changed", { version: result.version });
    return result;
  }
}
