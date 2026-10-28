export type VerifierFailure = "TIMEOUT" | "CREDENTIALS" | "QUOTA" | "MODEL" | "PROVIDER" | "RESPONSE";
export class VerifierProviderError extends Error {
  constructor(readonly failure: VerifierFailure, message: string) { super(message); }
}
export function providerFailure(error: unknown, timedOut: boolean): VerifierFailure {
  if (timedOut) return "TIMEOUT";
  if (error instanceof VerifierProviderError) return error.failure;
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : null;
  if (status === 401 || status === 403) return "CREDENTIALS";
  if (status === 429) return "QUOTA";
  if (status === 404) return "MODEL";
  if (error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")) return "RESPONSE";
  return "PROVIDER";
}
