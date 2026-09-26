import { describe, expect, it } from "vitest";
import { parseQrContext } from "../qr-context";

describe("parseQrContext", () => {
  it("returns nulls when there is no query string", () => {
    expect(parseQrContext(new URLSearchParams())).toEqual({ highlightTableCode: null, qrToken: null });
  });

  it("surfaces the table code without requiring source=qr", () => {
    expect(parseQrContext(new URLSearchParams("table=M01"))).toEqual({
      highlightTableCode: "M01",
      qrToken: null,
    });
  });

  it("only surfaces the qr token when source=qr is present", () => {
    expect(parseQrContext(new URLSearchParams("table=M01&qr=abc123"))).toEqual({
      highlightTableCode: "M01",
      qrToken: null,
    });
  });

  it("surfaces both table and token for a full QR-scan URL", () => {
    expect(parseQrContext(new URLSearchParams("table=M01&source=qr&qr=abc123"))).toEqual({
      highlightTableCode: "M01",
      qrToken: "abc123",
    });
  });

  it("treats blank values as absent", () => {
    expect(parseQrContext(new URLSearchParams("table=&source=qr&qr="))).toEqual({
      highlightTableCode: null,
      qrToken: null,
    });
  });
});
