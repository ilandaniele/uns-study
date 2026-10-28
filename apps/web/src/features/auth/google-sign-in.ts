import { safeNextPath } from "@/lib/safe-next";

export function googleSignInUrls(origin: string, next: string | null) {
  const destination = safeNextPath(next, origin) ?? "/";
  const error = new URL("/login", origin);
  error.searchParams.set("oauth", "google");
  if (destination !== "/") error.searchParams.set("next", destination);
  return { callbackURL: new URL(destination, origin).href, errorCallbackURL: error.href };
}

/** Only known codes affect the copy; never render raw OAuth/network response bodies. */
export function googleSignInError(error?: { code?: string; status?: number }): string {
  if (error?.status === 429) return "Demasiados intentos con Google. Esperá un momento y volvé a probar.";
  if (["INVALID_ORIGIN", "INVALID_CALLBACK_URL", "INVALID_REDIRECT_URL", "INVALID_ERROR_CALLBACK_URL"].includes(error?.code ?? "")) {
    return "Abrí https://saladeestudio.com.ar/login y volvé a probar con Google. También podés ingresar con un código por email.";
  }
  return "No pudimos conectar con Google. Volvé a probar o ingresá con un código por email.";
}

export function googleReturnError(code: string): { message: string; recovery: "retry" | "code" | "support" } {
  const normalized = /^[a-zA-Z0-9_]{1,80}$/.test(code) ? code.toLowerCase() : "unknown";
  if (normalized === "account_banned") return { message: "Esta cuenta está suspendida. Contactá al responsable de la app para revisar el acceso.", recovery: "support" };
  if (["account_not_linked", "email_not_verified", "unable_to_link_account", "account_already_linked_to_different_user", "email_does_not_match"].includes(normalized)) return {
    message: "No pudimos vincular esa cuenta de Google. Ingresá con un código enviado al email de tu cuenta y después volvé a probar con Google.", recovery: "code",
  };
  if (["state_mismatch", "state_not_found", "state_invalid", "state_expired", "invalid_state", "nonce_binding_missing"].includes(normalized)) return {
    message: "La verificación de Google venció o quedó en otra pestaña. Tocá «Volver a Google» para empezar de nuevo en esta ventana.", recovery: "retry",
  };
  if (normalized === "access_denied") return { message: "No se completó el acceso con Google. Podés volver a intentarlo o ingresar con un código por email.", recovery: "retry" };
  return { message: "Google no pudo completar el ingreso. Volvé a intentarlo o ingresá con un código por email.", recovery: "retry" };
}
