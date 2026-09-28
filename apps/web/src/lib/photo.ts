import type { CapturedPhoto } from "./verification";

const MAX_LONG_SIDE_PX = 1280;
const JPEG_QUALITY = 0.8;

/**
 * Draws a picked photo onto a canvas scaled down to `MAX_LONG_SIDE_PX` on its long side, then
 * exports it as JPEG (quality 0.8) — this also strips EXIF (canvas export never carries it) and
 * keeps the upload well under the API's 2MB decoded limit.
 */
export async function compressPhotoForUpload(file: File): Promise<CapturedPhoto> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_LONG_SIDE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo procesar la foto.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return { mimeType: "image/jpeg", base64 };
  } finally {
    bitmap.close();
  }
}
