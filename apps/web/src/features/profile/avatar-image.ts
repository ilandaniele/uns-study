/** Output size (px) for uploaded avatars — matches the API's `user_avatars` expectations. */
export const AVATAR_OUTPUT_SIZE = 256;

export interface SquareCrop {
  sx: number;
  sy: number;
  size: number;
}

/** Center-square crop rect (in source pixels) for an image of `width` x `height`. */
export function centerSquareCrop(width: number, height: number): SquareCrop {
  const size = Math.min(width, height);
  return { sx: (width - size) / 2, sy: (height - size) / 2, size };
}

/** Strips the `data:<mime>;base64,` prefix off a canvas `toDataURL()` result. */
export function base64FromDataUrl(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex === -1 ? dataUrl : dataUrl.slice(commaIndex + 1);
}
