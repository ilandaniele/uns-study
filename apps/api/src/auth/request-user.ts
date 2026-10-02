export interface RequestUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified?: boolean;
}

/** Converts Express request headers into a standard `Headers` instance for Better Auth's API. */
export function toFetchHeaders(headers: Record<string, string | string[] | undefined>): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) result.append(key, v);
    } else {
      result.set(key, value);
    }
  }
  return result;
}
