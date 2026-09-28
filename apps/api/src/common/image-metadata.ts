/**
 * Strips embedded metadata (EXIF/comments) from JPEG/PNG/WEBP bytes before they're stored or
 * forwarded anywhere — avatars and seat-verification photos alike may carry GPS coordinates,
 * device identifiers, or other incidental PII inside their metadata segments that has nothing to
 * do with the pixels themselves. Best-effort: any bytes that don't parse as a well-formed
 * container of the declared type are returned unchanged rather than corrupted.
 */

const JPEG_SOI = 0xd8;
const JPEG_EOI = 0xd9;
const JPEG_SOS = 0xda;
const JPEG_COM = 0xfe;
const JPEG_RST0 = 0xd0;
const JPEG_RST7 = 0xd7;
const JPEG_APP0 = 0xe0;
const JPEG_APP1 = 0xe1;
const JPEG_APP15 = 0xef;

/** Drops every APPn segment except APP0 (JFIF, needed for basic decoding) and every COM segment,
 *  up to the start of scan data — that's where EXIF (APP1), and any free-text comments, live. */
function stripJpeg(bytes: Buffer): Buffer {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== JPEG_SOI) return bytes;

  const out: Buffer[] = [bytes.subarray(0, 2)];
  let offset = 2;

  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      // Malformed stream — bail out and keep the remainder untouched rather than guess further.
      out.push(bytes.subarray(offset));
      return Buffer.concat(out);
    }

    let marker = bytes[offset + 1]!;
    while (marker === 0xff && offset + 2 < bytes.length) {
      // Marker bytes may be padded with extra 0xFF fill bytes before the real marker code.
      offset++;
      marker = bytes[offset + 1]!;
    }

    if (marker === JPEG_EOI) {
      out.push(bytes.subarray(offset, offset + 2));
      return Buffer.concat(out);
    }

    if (marker === JPEG_SOS) {
      // Entropy-coded scan data follows and has no further markers we can safely parse — keep it as-is.
      out.push(bytes.subarray(offset));
      return Buffer.concat(out);
    }

    if (marker >= JPEG_RST0 && marker <= JPEG_RST7) {
      out.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    if (offset + 3 >= bytes.length) {
      out.push(bytes.subarray(offset));
      return Buffer.concat(out);
    }

    const length = bytes.readUInt16BE(offset + 2);
    const segmentEnd = Math.min(offset + 2 + length, bytes.length);
    const isDroppedApp = marker >= JPEG_APP1 && marker <= JPEG_APP15;
    const isComment = marker === JPEG_COM;
    if (marker === JPEG_APP0 || (!isDroppedApp && !isComment)) {
      out.push(bytes.subarray(offset, segmentEnd));
    }
    offset = segmentEnd;
  }

  return Buffer.concat(out);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_METADATA_CHUNK_TYPES = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

/** Drops tEXt/zTXt/iTXt/eXIf/tIME chunks — text comments, EXIF, and the last-modified timestamp. */
function stripPng(bytes: Buffer): Buffer {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return bytes;

  const out: Buffer[] = [PNG_SIGNATURE];
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const chunkEnd = offset + 12 + length; // length(4) + type(4) + data(length) + crc(4)
    if (chunkEnd > bytes.length) {
      out.push(bytes.subarray(offset));
      return Buffer.concat(out);
    }
    if (!PNG_METADATA_CHUNK_TYPES.has(type)) {
      out.push(bytes.subarray(offset, chunkEnd));
    }
    offset = chunkEnd;
    if (type === "IEND") return Buffer.concat(out);
  }

  if (offset < bytes.length) out.push(bytes.subarray(offset));
  return Buffer.concat(out);
}

const WEBP_METADATA_CHUNKS = new Set(["EXIF", "XMP "]);
// VP8X flags byte (first byte of its payload): bit3 = has-EXIF, bit2 = has-XMP (container spec).
const VP8X_EXIF_BIT = 0x08;
const VP8X_XMP_BIT = 0x04;

/** Drops EXIF/XMP chunks and clears the corresponding VP8X flag bits so the container stays consistent. */
function stripWebp(bytes: Buffer): Buffer {
  if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
    return bytes;
  }

  const chunks: { fourCC: string; start: number; end: number }[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourCC = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const padded = size + (size % 2);
    const chunkEnd = offset + 8 + padded;
    if (chunkEnd > bytes.length) break;
    chunks.push({ fourCC, start: offset, end: chunkEnd });
    offset = chunkEnd;
  }
  if (chunks.length === 0) return bytes;

  const kept = chunks.filter((c) => !WEBP_METADATA_CHUNKS.has(c.fourCC));
  const body = Buffer.concat(kept.map((c) => bytes.subarray(c.start, c.end)));
  const result = Buffer.concat([bytes.subarray(0, 12), body]);
  result.writeUInt32LE(result.length - 8, 4); // fix up the RIFF size field

  let cursor = 12;
  for (const c of kept) {
    if (c.fourCC === "VP8X") {
      const flagsOffset = cursor + 8; // 4-byte fourCC + 4-byte size precede the payload
      result[flagsOffset] = result[flagsOffset]! & ~VP8X_EXIF_BIT & ~VP8X_XMP_BIT;
      break;
    }
    cursor += c.end - c.start;
  }

  return result;
}

/** Strips known metadata segments/chunks for the given (already magic-byte-validated) mime type. */
export function stripImageMetadata(mimeType: "image/jpeg" | "image/png" | "image/webp", bytes: Buffer): Buffer {
  if (mimeType === "image/jpeg") return stripJpeg(bytes);
  if (mimeType === "image/png") return stripPng(bytes);
  return stripWebp(bytes);
}
