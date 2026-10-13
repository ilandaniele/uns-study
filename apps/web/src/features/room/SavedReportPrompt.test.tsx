import type { SeatDto } from "@sala/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SavedReportPrompt } from "./SavedReportPrompt";

const noop = () => {};

function render(seat: Partial<SeatDto>, occupant: Parameters<typeof SavedReportPrompt>[0]["occupant"] = null) {
  return renderToStaticMarkup(
    <SavedReportPrompt
      seat={{ status: "SAVED", verified: false, dispute: null, ...seat } as SeatDto}
      roomId="r1"
      occupant={occupant}
      seatLabel="Mesa 1 · Asiento 1"
      pending={false}
      onAskToFree={noop}
      onDismiss={noop}
    />,
  );
}

describe("SavedReportPrompt", () => {
  it("offers 'Pedir que lo liberen' on a just-reported saved seat", () => {
    const html = render({});
    expect(html).toContain("Listo, avisamos que está guardado.");
    expect(html).toContain("Pedir que lo liberen");
    expect(html).toContain("Solo reportar");
  });

  it("hides the ask button when a dispute is already open", () => {
    expect(render({ dispute: { id: "d1", closesAt: "2026-10-05T12:05:00.000Z" } })).not.toContain("Pedir que lo liberen");
  });

  it("keeps the report link when the occupant is identified", () => {
    const html = render({}, { userId: "u9", displayName: "Ana" } as never);
    expect(html).toContain("Reportar a Ana");
    expect(html).toContain("Pedir que lo liberen");
  });
});
