import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleAutoAdvance } from './useAutoAdvance';

class Page extends EventTarget {
  hidden = false;
  hide(hidden: boolean) {
    this.hidden = hidden;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}
afterEach(() => vi.useRealTimers());

describe('automatic presentation transitions', () => {
  it('advances once without requiring a click', () => {
    vi.useFakeTimers();
    const page = new Page(), advance = vi.fn();
    const cancel = scheduleAutoAdvance(advance, 900, page);
    vi.advanceTimersByTime(899);
    expect(advance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(advance).toHaveBeenCalledTimes(1);
    page.hide(true); page.hide(false);
    vi.advanceTimersByTime(1000);
    expect(advance).toHaveBeenCalledTimes(1);
    cancel();
  });
  it('does not run in a hidden tab and gives reading time again on return', () => {
    vi.useFakeTimers();
    const page = new Page(), advance = vi.fn();
    const cancel = scheduleAutoAdvance(advance, 3000, page);
    vi.advanceTimersByTime(2000);
    page.hide(true);
    vi.advanceTimersByTime(30000);
    expect(advance).not.toHaveBeenCalled();
    page.hide(false);
    vi.advanceTimersByTime(2999);
    expect(advance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(advance).toHaveBeenCalledTimes(1);
    cancel();
  });
  it('cancels on pause, save failure, unmount or opening the diary', () => {
    vi.useFakeTimers();
    const page = new Page(), advance = vi.fn();
    const cancel = scheduleAutoAdvance(advance, 900, page);
    cancel();
    page.hide(true); page.hide(false);
    vi.advanceTimersByTime(5000);
    expect(advance).not.toHaveBeenCalled();
  });
});
