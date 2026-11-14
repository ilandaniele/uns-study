import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RoomDto } from "@sala/contracts";
import { RoomClosedNotice } from "./RoomClosedNotice";

const room: RoomDto = { id: "principal", slug: "principal", name: "Sala", description: null,
  timezone: "America/Argentina/Buenos_Aires", operatingHours: {
    open: false, opensAt: "2026-11-14T11:00:00Z", closesAt: "2026-11-15T01:00:00Z", nextOpensAt: "2026-11-15T11:00:00Z",
  } };

describe("public closure notice", () => {
  it("announces closure and the confirmed opening in the room's timezone", () => {
    const html = renderToStaticMarkup(<RoomClosedNotice room={room}/>);
    expect(html).toContain("La sala está cerrada");
    expect(html).toContain("08:00");
    expect(html).toMatch(/datetime="2026-11-15T11:00:00Z"/i);
  });
  it("does not promise 08:00 during an indefinite UNS closure", () => {
    const html = renderToStaticMarkup(<RoomClosedNotice room={{ ...room, operatingHours: { ...room.operatingHours!, nextOpensAt: null,
      closure: { id: "c1", title: "Disposición de la UNS", body: "Mantenimiento confirmado.", endsAt: null } } }}/>);
    expect(html).toContain("Mantenimiento confirmado.");
    expect(html).toContain("Hasta nuevo aviso");
    expect(html).not.toContain("08:00");
  });
  it("shows nothing during opening hours or before receiving room state", () => {
    expect(renderToStaticMarkup(<RoomClosedNotice room={{ ...room, operatingHours: { ...room.operatingHours!, open: true } }}/>)).toBe("");
    expect(renderToStaticMarkup(<RoomClosedNotice room={{ ...room, operatingHours: undefined }}/>)).toBe("");
  });
});
