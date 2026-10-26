/** Preserve the selection and never split an emoji at the UTF-16 message limit. */
export function insertComposerEmoji(value: string, emoji: string, start: number, end: number, maxLength: number) {
  const next = value.slice(0, start) + emoji + value.slice(end);
  return next.length <= maxLength ? { value: next, caret: start + emoji.length } : { value, caret: end };
}
