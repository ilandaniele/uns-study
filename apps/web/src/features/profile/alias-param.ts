/** Client navigations may retain URL escapes in the dynamic segment. Normalize exactly once. */
export function aliasFromParam(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}
