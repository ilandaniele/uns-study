import type { ResendClient, ResendMessage } from "../email/resend.client.js";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** The link lands on the WEB page, which then calls Better Auth's `/reset-password` with the token. */
export function passwordResetLink(webUrl: string, token: string): string {
  return `${webUrl.replace(/\/$/, "")}/restablecer?token=${encodeURIComponent(token)}`;
}

export function composePasswordResetEmail(input: { from: string; to: string; name: string; webUrl: string; token: string }): ResendMessage {
  const link = passwordResetLink(input.webUrl, input.token);
  const greeting = input.name ? `Hola ${input.name},` : "Hola,";
  const text = [
    greeting,
    "",
    "Pediste restablecer tu contraseña de Sala de Estudio. Entrá a este link para elegir una nueva (vence en 1 hora y sirve una sola vez):",
    link,
    "",
    "Si no fuiste vos, ignorá este mail: tu contraseña no cambia.",
  ].join("\n");
  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    "<p>Pediste restablecer tu contraseña de Sala de Estudio. Entrá a este link para elegir una nueva (vence en 1 hora y sirve una sola vez):</p>",
    `<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
    "<p>Si no fuiste vos, ignorá este mail: tu contraseña no cambia.</p>",
  ].join("");
  return { from: input.from, to: [input.to], subject: "Restablecé tu contraseña", text, html, headers: {} };
}

export type SendResetPassword = (data: { user: { email: string; name?: string | null }; token: string }) => Promise<void>;

/**
 * Builds Better Auth's `sendResetPassword`, or `null` when email isn't configured (feature off).
 * The returned function returns immediately and sends in the background (errors are logged, never
 * thrown), so response timing doesn't reveal whether the email has an account.
 */
export function createPasswordResetSender(
  client: Pick<ResendClient, "sendBatch"> | null,
  opts: { from: string; webUrl: string },
): SendResetPassword | null {
  if (!client || !opts.from) return null;
  return async ({ user, token }) => {
    const msg = composePasswordResetEmail({ from: opts.from, to: user.email, name: user.name ?? "", webUrl: opts.webUrl, token });
    void client.sendBatch([msg]).catch((err: unknown) => {
      console.error("[auth] password reset email failed:", err instanceof Error ? err.message : "unknown error");
    });
  };
}
