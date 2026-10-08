import { describe, expect, it } from "vitest";
import { safeNextPath } from "../safe-next";

const origin = "https://saladeestudio.test";

describe("safeNextPath", () => {
  it("keeps same-origin relative paths with query and hash", () => {
    expect(safeNextPath("/salas/108?x=1#mapa", origin)).toBe("/salas/108?x=1#mapa");
    expect(safeNextPath("/", origin)).toBe("/");
  });

  it("rejects missing, absolute and protocol-relative targets", () => {
    expect(safeNextPath(null, origin)).toBeNull();
    expect(safeNextPath("", origin)).toBeNull();
    expect(safeNextPath("https://evil.com", origin)).toBeNull();
    expect(safeNextPath("//evil.com", origin)).toBeNull();
    expect(safeNextPath("/\\evil.com", origin)).toBeNull();
    expect(safeNextPath("/\t/evil.com", origin)).toBeNull();
  });

  it("rejects dot-segment paths that normalize to a protocol-relative URL", () => {
    expect(safeNextPath("/.//evil.com", origin)).toBeNull();
    expect(safeNextPath("/a/..//evil.com", origin)).toBeNull();
    expect(safeNextPath("/%2e//evil.com", origin)).toBeNull();
  });
});
