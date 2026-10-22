/** Scroll distance (px) that must accumulate in one direction before the chat bubble hides or shows. */
export const FAB_SCROLL_THRESHOLD_PX = 24;
/** Near the top or bottom of the page the bubble always shows (nothing left to scroll past). */
export const FAB_EDGE_PX = 80;

export interface FabScrollInput {
  hidden: boolean;
  /** Distance scrolled in the current direction since it last changed (positive = down). */
  travel: number;
  scrollY: number;
  maxScrollY: number;
}

/**
 * Whether the floating chat bubble should be tucked away: hide after scrolling down a bit so it
 * stops covering content, show again on any deliberate scroll up or near the page edges.
 */
export function nextFabHidden({ hidden, travel, scrollY, maxScrollY }: FabScrollInput): boolean {
  if (scrollY <= FAB_EDGE_PX || scrollY >= maxScrollY - FAB_EDGE_PX) return false;
  if (travel >= FAB_SCROLL_THRESHOLD_PX) return true;
  if (travel <= -FAB_SCROLL_THRESHOLD_PX) return false;
  return hidden;
}
