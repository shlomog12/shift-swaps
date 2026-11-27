/** Minimum horizontal travel, in pixels, for a swipe to count. */
const MIN_SWIPE = 60;

/**
 * The month step for a finished touch: +1 (next), -1 (previous) or 0. The page is right-to-left, so like
 * turning a page in a Hebrew book, dragging to the right brings the next month and to the left the
 * previous one. Mostly vertical movements (scrolling) never count.
 */
export function swipeMonthStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < MIN_SWIPE || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx > 0 ? 1 : -1;
}
