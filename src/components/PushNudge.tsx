import { useCallback } from 'react';
import { useMe } from '../lib/hooks';
import { enablePush, pushState } from '../lib/push';
import { useFeedback } from './Feedback';

const NUDGE_KEY = 'push-nudge';
const ASK_AGAIN_DAYS = 30;

function askedRecently(): boolean {
  const at = Number(localStorage.getItem(NUDGE_KEY));
  return Number.isFinite(at) && at > 0 && Date.now() - at < ASK_AGAIN_DAYS * 86_400_000;
}

/**
 * After an action that waits for someone else's answer (volunteering, a swap offer, a swap request), offers
 * once to turn on phone notifications, when the moment makes the reason obvious. Not again for 30 days after
 * "not now"; never while acting for someone, or when notifications are on, blocked or unsupported here.
 */
export function usePushNudge() {
  const me = useMe();
  const { confirm, toast } = useFeedback();

  return useCallback(
    /** `when` completes "התראה לטלפון ___", e.g. "כשדני יענו להתנדבות". */
    async (when: string) => {
      if (me.actingFor || askedRecently()) return;
      const state = await pushState().catch(() => 'unsupported' as const);
      if (state !== 'off') return;
      localStorage.setItem(NUDGE_KEY, String(Date.now()));
      const ok = await confirm({
        title: 'לקבל התראה לטלפון?',
        message: `התראה לטלפון ${when}, וגם תזכורת בערב שלפני משמרת. בלי מייל, ואפשר לכבות בכל רגע בפרופיל.`,
        confirmLabel: 'הפעלת התראות',
        cancelLabel: 'לא עכשיו',
      });
      if (!ok) return;
      try {
        await enablePush();
        toast('ההתראות הופעלו במכשיר הזה');
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    },
    [me.actingFor, confirm, toast],
  );
}
