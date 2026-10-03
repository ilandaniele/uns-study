import { z } from "zod";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const decodedSize = (base64: string): number => Math.floor((base64.length * 3) / 4);

export const verifyRequestSchema = z.object({
  roomSlug: z.string().min(1).max(64),
  claimedSeatCode: z.string().min(1).max(32),
  image: z.object({
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    base64: z
      .string()
      .min(1)
      .refine((b) => decodedSize(b) <= MAX_IMAGE_BYTES, "image too large"),
  }),
  seats: z
    .array(
      z.object({
        code: z.string().min(1).max(32),
        tableCode: z.string().min(1).max(32),
        x: z.number(),
        y: z.number(),
      }),
    )
    .min(1)
    .max(500),
});

export type VerifyRequest = z.infer<typeof verifyRequestSchema>;
export type VerifySeat = VerifyRequest["seats"][number];

export interface VerifyResponse {
  seatCode: string | null;
  confidence: number;
  modelVersion: string;
}
