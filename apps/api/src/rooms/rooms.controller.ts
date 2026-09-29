import { Controller, Get, Header, Headers, Inject, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { RoomsService } from "./rooms.service.js";
import { etagMatches, roomMapEtag } from "./map-etag.js";

@Controller("rooms")
export class RoomsController {
  constructor(@Inject(RoomsService) private readonly rooms: RoomsService) {}

  @Get()
  list() {
    return this.rooms.listRooms();
  }

  @Get(":idOrSlug")
  get(@Param("idOrSlug") idOrSlug: string) {
    return this.rooms.getRoom(idOrSlug);
  }

  /** Always revalidated (`no-cache`): an unchanged map costs a tiny 304 instead of the full JSON. */
  @Get(":idOrSlug/map")
  @Header("Cache-Control", "no-cache")
  async getMap(
    @Param("idOrSlug") idOrSlug: string,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const map = await this.rooms.getRoomMap(idOrSlug);
    const etag = roomMapEtag(map);
    res.setHeader("ETag", etag);
    if (etagMatches(ifNoneMatch, etag)) {
      res.status(304);
      return;
    }
    return map;
  }
}
