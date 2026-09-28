import { describe, expect, it } from "vitest";
import { stripImageMetadata } from "./image-metadata.js";

describe("stripImageMetadata", () => {
  it("drops a JPEG APP1 (EXIF) segment but keeps APP0 and the pixel data", () => {
    const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]); // APP0, length 4, 2 bytes payload
    const exifPayload = Buffer.concat([Buffer.from("Exif\0\0"), Buffer.from("GPS 34.6S 58.4W secret")]);
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), lengthBytes(exifPayload.length + 2), exifPayload]);
    const sos = Buffer.from([0xff, 0xda, 0x00, 0x02]);
    const scanData = Buffer.from([0x01, 0x02, 0x03]);
    const eoi = Buffer.from([0xff, 0xd9]);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), app0, app1, sos, scanData, eoi]);

    const stripped = stripImageMetadata("image/jpeg", jpeg);

    expect(stripped.includes("GPS 34.6S 58.4W secret")).toBe(false);
    expect(stripped.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(stripped.includes(app0)).toBe(true);
    expect(stripped.subarray(stripped.length - scanData.length - 2, stripped.length - 2)).toEqual(scanData);
  });

  it("drops a JPEG COM segment", () => {
    const comPayload = Buffer.from("camera serial 1234-secret");
    const com = Buffer.concat([Buffer.from([0xff, JPEG_COM_MARKER]), lengthBytes(comPayload.length + 2), comPayload]);
    const sos = Buffer.from([0xff, 0xda, 0x00, 0x02]);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), com, sos, Buffer.from([0x01]), Buffer.from([0xff, 0xd9])]);

    const stripped = stripImageMetadata("image/jpeg", jpeg);
    expect(stripped.includes("camera serial 1234-secret")).toBe(false);
  });

  it("drops a PNG eXIf chunk but keeps IHDR/IDAT/IEND", () => {
    const ihdr = pngChunk("IHDR", Buffer.alloc(13));
    const exifData = Buffer.from("GPS secret location data");
    const exif = pngChunk("eXIf", exifData);
    const idat = pngChunk("IDAT", Buffer.from([1, 2, 3]));
    const iend = pngChunk("IEND", Buffer.alloc(0));
    const png = Buffer.concat([PNG_SIG, ihdr, exif, idat, iend]);

    const stripped = stripImageMetadata("image/png", png);

    expect(stripped.includes("GPS secret location data")).toBe(false);
    expect(stripped.subarray(0, 8)).toEqual(PNG_SIG);
    expect(findPngChunk(stripped, "IHDR")).not.toBeNull();
    expect(findPngChunk(stripped, "IDAT")).not.toBeNull();
    expect(findPngChunk(stripped, "IEND")).not.toBeNull();
    expect(findPngChunk(stripped, "eXIf")).toBeNull();
  });

  it("drops a PNG tEXt chunk", () => {
    const ihdr = pngChunk("IHDR", Buffer.alloc(13));
    const text = pngChunk("tEXt", Buffer.from("Comment\0secret note"));
    const iend = pngChunk("IEND", Buffer.alloc(0));
    const png = Buffer.concat([PNG_SIG, ihdr, text, iend]);

    const stripped = stripImageMetadata("image/png", png);
    expect(stripped.includes("secret note")).toBe(false);
    expect(findPngChunk(stripped, "tEXt")).toBeNull();
  });

  it("drops a WEBP EXIF chunk and clears the VP8X EXIF flag", () => {
    const vp8xPayload = Buffer.alloc(10);
    vp8xPayload[0] = 0x08; // EXIF bit set, nothing else
    const vp8x = riffChunk("VP8X", vp8xPayload);
    const vp8Data = Buffer.from([1, 2, 3, 4]);
    const vp8 = riffChunk("VP8 ", vp8Data);
    const exifData = Buffer.from("GPS secret webp exif");
    const exif = riffChunk("EXIF", exifData);
    const body = Buffer.concat([vp8x, vp8, exif]);
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), body]);
    webp.writeUInt32LE(webp.length - 8, 4);

    const stripped = stripImageMetadata("image/webp", webp);

    expect(stripped.includes("GPS secret webp exif")).toBe(false);
    const vp8xOut = findRiffChunk(stripped, "VP8X");
    expect(vp8xOut).not.toBeNull();
    expect(vp8xOut![0]! & 0x08).toBe(0);
    expect(findRiffChunk(stripped, "EXIF")).toBeNull();
    expect(findRiffChunk(stripped, "VP8 ")).not.toBeNull();
  });

  it("returns bytes unchanged when they don't parse as the declared container", () => {
    const garbage = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(stripImageMetadata("image/jpeg", garbage)).toEqual(garbage);
    expect(stripImageMetadata("image/png", garbage)).toEqual(garbage);
    expect(stripImageMetadata("image/webp", garbage)).toEqual(garbage);
  });
});

const JPEG_COM_MARKER = 0xfe;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function lengthBytes(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n, 0);
  return b;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]); // crc left as zeros, unused by our parser
}

function findPngChunk(bytes: Buffer, type: string): Buffer | null {
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const chunkType = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (chunkType === type) return bytes.subarray(dataStart, dataStart + length);
    offset = dataStart + length + 4;
  }
  return null;
}

function riffChunk(fourCC: string, data: Buffer): Buffer {
  const size = Buffer.alloc(4);
  size.writeUInt32LE(data.length, 0);
  const padding = data.length % 2 === 1 ? Buffer.from([0x00]) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(fourCC, "ascii"), size, data, padding]);
}

function findRiffChunk(bytes: Buffer, fourCC: string): Buffer | null {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const cc = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (cc === fourCC) return bytes.subarray(dataStart, dataStart + size);
    offset = dataStart + size + (size % 2);
  }
  return null;
}
