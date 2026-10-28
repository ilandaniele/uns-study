import type { CapturedPhoto } from "./verification";

const MAX_LONG_SIDE_PX = 1280;
const JPEG_QUALITY = 0.8;

/**
 * Draws a picked photo onto a canvas scaled down to `MAX_LONG_SIDE_PX` on its long side, then
 * exports it as JPEG (quality 0.8) — this also strips EXIF (canvas export never carries it) and
 * keeps the upload well under the API's 2MB decoded limit.
 */
export async function compressPhotoForUpload(file: File): Promise<CapturedPhoto> {
  if (file.size > 25 * 1024 * 1024) throw new Error("La foto es muy grande. Elegí una imagen de hasta 25 MB.");
  const bitmap = await decodePhoto(file);
  try {
    const scale = Math.min(1, MAX_LONG_SIDE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo procesar la foto.");
    ctx.drawImage(bitmap.source, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return { mimeType: "image/jpeg", base64 };
  } finally {
    bitmap.close();
  }
}

/** Safari may decode camera photos through <img> when createImageBitmap rejects them. */
async function decodePhoto(file: File): Promise<{ width: number; height: number; source: CanvasImageSource; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const image = await createImageBitmap(file);
      return { width: image.width, height: image.height, source: image, close: () => image.close() };
    } catch { /* Try the browser's native image decoder below. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("No pudimos abrir la foto. Probá sacarla de nuevo o elegí una imagen JPG o PNG."));
      image.src = url;
    });
    return { width: image.naturalWidth, height: image.naturalHeight, source: image, close: () => URL.revokeObjectURL(url) };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}
