import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus inside an open dialog or sheet: focus moves into it when it opens, Tab and
 * Shift+Tab cycle within it, and focus returns to where it was when it closes.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, autoFocus = true) {
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const before = document.activeElement as HTMLElement | null;
    const items = () => [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);

    if (autoFocus && !box.contains(document.activeElement)) {
      (items()[0] ?? box).focus();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !box) return;
      const list = items();
      if (list.length === 0) {
        e.preventDefault();
        box.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    }

    box.addEventListener('keydown', onKey);
    return () => {
      box.removeEventListener('keydown', onKey);
      // Return focus only if it is still inside (or lost), so a dialog opened on top keeps its own focus.
      if (before && document.contains(before) && (box.contains(document.activeElement) || document.activeElement === document.body)) {
        before.focus();
      }
    };
  }, [ref, autoFocus]);
}
