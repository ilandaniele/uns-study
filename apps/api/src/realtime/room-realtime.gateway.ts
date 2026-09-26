import { Inject, Injectable } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { SocketEvents, type RoomSummary, type SeatStateChangedEvent } from "@uns/contracts";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { env } from "../env.js";

function roomChannel(roomId: string): string {
  return `room:${roomId}`;
}

const roomPayloadSchema = z.object({ roomId: z.string().uuid() });

/** Per-socket cap on how many room channels can be joined at once — a socket has no business
 *  watching more than a handful of rooms in this MVP. */
const MAX_JOINED_ROOMS_PER_SOCKET = 5;

/** Socket.IO notifications for room state. PostgreSQL remains canonical — sockets never carry coordinates. */
@Injectable()
@WebSocketGateway({ cors: { origin: env.webOrigins, credentials: true } })
export class RoomRealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(@Inject(RoomStateService) private readonly roomState: RoomStateService) {}

  handleConnection(_socket: Socket): void {
    // Anonymous connections are allowed; joining a room is opt-in via `room:join`.
  }

  @SubscribeMessage(SocketEvents.RoomJoin)
  onJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): void {
    const parsed = roomPayloadSchema.safeParse(body);
    if (!parsed.success) return;
    const channel = roomChannel(parsed.data.roomId);
    const joinedRooms = [...socket.rooms].filter((r) => r !== socket.id);
    if (joinedRooms.length >= MAX_JOINED_ROOMS_PER_SOCKET && !socket.rooms.has(channel)) return;
    socket.join(channel);
  }

  @SubscribeMessage(SocketEvents.RoomLeave)
  onLeave(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): void {
    const parsed = roomPayloadSchema.safeParse(body);
    if (!parsed.success) return;
    socket.leave(roomChannel(parsed.data.roomId));
  }

  /** Emits `seat:state-changed` per changed seat, then a refreshed `room:summary-changed`. */
  async broadcastSeatChanges(roomId: string, changes: SeatStateChange[]): Promise<void> {
    if (changes.length === 0) return;
    const channel = roomChannel(roomId);
    for (const change of changes) {
      const event: SeatStateChangedEvent = {
        roomId,
        seatId: change.seatId,
        status: change.status,
        confidence: change.confidence,
        lastUpdatedAt: change.lastUpdatedAt.toISOString(),
      };
      this.server?.to(channel).emit(SocketEvents.SeatStateChanged, event);
    }
    const summary = await this.roomState.getRoomSummary(roomId);
    this.server?.to(channel).emit(SocketEvents.RoomSummaryChanged, summary satisfies RoomSummary);
  }

  emitDailyReset(roomId: string): void {
    this.server?.to(roomChannel(roomId)).emit(SocketEvents.RoomDailyReset, { roomId });
  }
}
