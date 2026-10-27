import { APIError } from "better-auth/api";
import type { ResendClient, ResendMessage } from "../email/resend.client.js";

export const EMAIL_CODE_SECONDS = 10 * 60;

export function composeEmailCode(from: string, to: string, code: string): ResendMessage {
  // Only Better Auth's cryptographically generated numeric code may enter the template.
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid email code format");
  return {
    from, to: [to], subject: "Tu código de Sala de Estudio",
    text: `Tu código es ${code}. Vence en 10 minutos y se puede usar una sola vez.\n\nNo lo compartas. Si no lo pediste, ignorá este mensaje.`,
    html: `<p>Tu código de Sala de Estudio es:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px">${code}</p><p>Vence en 10 minutos y se puede usar una sola vez.</p><p>No lo compartas. Si no lo pediste, ignorá este mensaje.</p>`,
    headers: {},
  };
}

export function createEmailCodeSender(client: Pick<ResendClient, "sendBatch"> | null, from: string) {
  return async ({ email, otp, type }: { email: string; otp: string; type: string }) => {
    if (type !== "sign-in") throw new APIError("BAD_REQUEST", { code: "EMAIL_CODE_REQUIRED", message: "Usá el código de ingreso para verificar tu email." });
    if (!client || !from) throw new APIError("SERVICE_UNAVAILABLE", { code: "EMAIL_UNAVAILABLE", message: "El envío de códigos no está disponible. Probá más tarde o ingresá con Google." });
    try {
      // Await delivery acceptance: Workers must not drop a detached promise at request completion.
      await client.sendBatch([composeEmailCode(from, email, otp)]);
    } catch {
      // Provider errors may contain recipient data. Never log them or the code.
      console.error("[auth] email code delivery failed");
      throw new APIError("SERVICE_UNAVAILABLE", { code: "EMAIL_DELIVERY_FAILED", message: "No pudimos enviar el código. Esperá un momento y volvé a pedirlo." });
    }
  };
}
