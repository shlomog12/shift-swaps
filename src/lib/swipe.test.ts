import { describe, expect, it } from 'vitest';
import { swipeMonthStep } from './swipe';

describe('swipe between months', () => {
  it('drag right is the next month, drag left the previous (right-to-left page)', () => {
    expect(swipeMonthStep(120, 10)).toBe(1);
    expect(swipeMonthStep(-120, 10)).toBe(-1);
  });

  it('ignores short or mostly vertical movements', () => {
    expect(swipeMonthStep(40, 0)).toBe(0);
    expect(swipeMonthStep(100, 90)).toBe(0);
  });
});
