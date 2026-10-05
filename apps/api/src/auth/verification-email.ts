import type { ResendClient, ResendMessage } from "../email/resend.client.js";
import { escapeHtml } from "../email/email-render.js";

/** `url` is Better Auth's own verification link (it hits the API, then redirects to the callbackURL). */
export function composeVerificationEmail(input: { from: string; to: string; name: string; url: string }): ResendMessage {
  const greeting = input.name ? `Hola ${input.name},` : "Hola,";
  const text = [
    greeting,
    "",
    "Confirmá tu email de Sala de Estudio entrando a este link (vence en 24 horas):",
    input.url,
    "",
    "Si no creaste una cuenta, ignorá este mail.",
  ].join("\n");
  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    "<p>Confirmá tu email de Sala de Estudio entrando a este link (vence en 24 horas):</p>",
    `<p><a href="${escapeHtml(input.url)}">${escapeHtml(input.url)}</a></p>`,
    "<p>Si no creaste una cuenta, ignorá este mail.</p>",
  ].join("");
  return { from: input.from, to: [input.to], subject: "Confirmá tu email", text, html, headers: {} };
}

export type SendVerificationEmail = (data: { user: { email: string; name?: string | null }; url: string; token: string }) => Promise<void>;

/**
 * Builds Better Auth's `sendVerificationEmail`, or `null` when email isn't configured (feature off).
 * Returns immediately and sends in the background (errors are logged, never thrown).
 */
export function createVerificationEmailSender(
  client: Pick<ResendClient, "sendBatch"> | null,
  opts: { from: string },
): SendVerificationEmail | null {
  if (!client || !opts.from) return null;
  return async ({ user, url }) => {
    const msg = composeVerificationEmail({ from: opts.from, to: user.email, name: user.name ?? "", url });
    void client.sendBatch([msg]).catch((err: unknown) => {
      console.error("[auth] verification email failed:", err instanceof Error ? err.message : "unknown error");
    });
  };
}
