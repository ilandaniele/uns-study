/** Only known codes affect the copy; never render raw OAuth/network response bodies. */
export function googleSignInError(error?: { code?: string; status?: number }): string {
  if (error?.status === 429) return "Demasiados intentos con Google. Esperá un momento y volvé a probar.";
  if (["INVALID_ORIGIN", "INVALID_CALLBACK_URL", "INVALID_REDIRECT_URL", "INVALID_ERROR_CALLBACK_URL"].includes(error?.code ?? "")) {
    return "Abrí https://saladeestudio.com.ar/login y volvé a probar con Google. También podés ingresar con un código por email.";
  }
  return "No pudimos conectar con Google. Volvé a probar o ingresá con un código por email.";
}
