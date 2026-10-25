/** Always link to Instagram itself, including for historical profiles containing a leading @. */
export function instagramHref(handle: string): string | null {
  const normalized = handle.trim().replace(/^@/, "");
  return /^[a-zA-Z0-9._]{1,30}$/.test(normalized)
    ? `https://www.instagram.com/${encodeURIComponent(normalized)}/`
    : null;
}
