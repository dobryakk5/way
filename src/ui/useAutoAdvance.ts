import { useEffect, useState } from 'react';

export function usePageVisible() {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

/** Stop presentation timers when the player leaves the page or opens another screen. */
export function scheduleAutoAdvance(onAdvance: () => void, delay: number, page: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'> = document) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fired = false;
  const schedule = () => {
    clearTimeout(timer);
    if (!page.hidden && !fired) timer = setTimeout(() => { fired = true; onAdvance(); }, delay);
  };
  page.addEventListener('visibilitychange', schedule);
  schedule();
  return () => {
    clearTimeout(timer);
    page.removeEventListener('visibilitychange', schedule);
  };
}

export function useAutoAdvance(enabled: boolean, delay: number, onAdvance: () => void) {
  useEffect(() => {
    if (enabled) return scheduleAutoAdvance(onAdvance, delay);
  }, [enabled, delay, onAdvance]);
}
