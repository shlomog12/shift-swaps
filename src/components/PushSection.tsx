import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, useQuery } from '../lib/hooks';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';
import { useFeedback } from './Feedback';

/** Profile: phone notifications on this device, a test, and the evening reminder before a shift. */
export function PushSection() {
  const settings = useQuery(() => api.myPushSettings().catch(() => undefined), []);
  const [state, setState] = useState<PushState | null>(null);
  const { busy, error, run } = useAction();
  const { toast } = useFeedback();

  useEffect(() => {
    pushState().then(setState, () => setState('unsupported'));
  }, []);

  // Before the notifications migration the functions do not exist: hide the section.
  if (settings.data === undefined || state === null) return null;
  const reminders = settings.data?.reminders ?? true;

  return (
    <section className="profile-section">
      <h3>התראות לטלפון</h3>
      <p className="muted small">
        התראה כשמישהו מתנדב למשמרת שלך או שולח לך הצעה, כשההתנדבות או ההצעה שלך אושרה, כשיש תשלום, ותזכורת בערב
        שלפני משמרת. בלי מייל.
      </p>

      {state === 'needs-install' && (
        <p className="warning-note small">
          באייפון ההתראות עובדות רק כשהאפליקציה מותקנת במסך הבית (אפשר להתקין למעלה, ב"התקנה כאפליקציה"). אחרי
          ההתקנה פותחים אותה מהאייקון וחוזרים לכאן.
        </p>
      )}
      {state === 'unsupported' && <p className="small">הדפדפן הזה לא תומך בהתראות. ב־Chrome זה עובד.</p>}
      {state === 'blocked' && (
        <p className="warning-note small">
          ההתראות חסומות לאתר הזה בהגדרות הדפדפן. כדי לאפשר: נעילה ליד הכתובת ← הרשאות ← התראות ← לאפשר, ואז לרענן.
        </p>
      )}

      {state === 'off' && (
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            run(enablePush, () => {
              setState('on');
              toast('ההתראות הופעלו במכשיר הזה');
            })
          }
        >
          הפעלת התראות במכשיר הזה
        </button>
      )}

      {state === 'on' && (
        <>
          <p className="success small">ההתראות פועלות במכשיר הזה.</p>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={reminders}
              disabled={busy}
              onChange={(e) => run(() => api.setPushReminders(e.target.checked))}
            />
            <span>תזכורת בערב שלפני משמרת</span>
          </label>
          <div className="row wrap">
            <button className="small" disabled={busy} onClick={() => run(api.sendTestPush, () => toast('נשלחה התראת בדיקה'))}>
              שליחת התראת בדיקה
            </button>
            <button
              className="small"
              disabled={busy}
              onClick={() =>
                run(disablePush, () => {
                  setState('off');
                  toast('ההתראות כובו במכשיר הזה');
                })
              }
            >
              כיבוי במכשיר הזה
            </button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
