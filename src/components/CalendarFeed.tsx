import { useState } from 'react';
import { api } from '../lib/api';
import { feedUrl, googleSubscribeUrl, webcalUrl } from '../lib/calendar';
import { useAction } from '../lib/hooks';
import { supabaseUrl } from '../lib/supabase';
import { useFeedback } from './Feedback';

/** Profile section: subscribe to my shifts in Google Calendar or on an iPhone, and replace the link. */
export function CalendarFeedSection() {
  const [token, setToken] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const { confirm, toast } = useFeedback();
  const feed = token ? feedUrl(supabaseUrl, token) : null;

  async function copy() {
    if (!feed) return;
    try {
      await navigator.clipboard.writeText(feed);
      toast('הקישור הועתק');
    } catch {
      window.prompt('העתקת הקישור:', feed);
    }
  }

  async function reset() {
    const ok = await confirm({
      title: 'ליצור קישור חדש?',
      message:
        'הקישור הנוכחי יפסיק לעבוד מיד, גם אצל מי שקיבל אותו ממך. צריך יהיה להוסיף את היומן מחדש בכל מקום שבו הוא מופיע.',
      confirmLabel: 'יצירת קישור חדש',
      danger: true,
    });
    if (ok) run(() => api.resetCalendarToken().then(setToken), () => toast('נוצר קישור חדש'));
  }

  return (
    <section className="profile-section">
      <h3>המשמרות שלי ביומן</h3>
      <p className="muted small">
        יומן נפרד בגוגל קלנדר או באייפון, שמתעדכן לבד כשמשמרת שלך מתחלפת. מגדירים פעם אחת.
      </p>

      {!feed ? (
        <button className="primary" disabled={busy} onClick={() => run(() => api.myCalendarToken().then(setToken))}>
          חיבור המשמרות ליומן
        </button>
      ) : (
        <>
          <div className="calendar-links">
            <a className="button primary" href={googleSubscribeUrl(feed)} target="_blank" rel="noopener noreferrer">
              הוספה ליומן גוגל
            </a>
            <a className="button" href={webcalUrl(feed)}>
              הוספה ליומן באייפון
            </a>
            <button onClick={copy}>העתקת הקישור</button>
          </div>
          <ul className="small calendar-notes">
            <li>
              <strong>עדכון:</strong> גוגל מרענן יומנים כאלה כל כמה שעות, ולפעמים רק אחרי יממה. לחילוף של הלילה כדאי
              להוסיף את המשמרת גם מהכפתור "הוספה ליומן גוגל" שבחלון המשמרת.
            </li>
            <li>
              <strong>שיתוף עם בני משפחה:</strong> בגוגל קלנדר, בהגדרות היומן "שמירות" ← שיתוף עם אנשים מסוימים. אפשר
              גם לשלוח להם את הקישור.
            </li>
            <li>
              <strong>פרטיות:</strong> כל מי שמחזיק בקישור רואה את המשמרות שלך (תאריכים ושעות בלבד). אם הוא הגיע
              למישהו שלא צריך, אפשר ליצור קישור חדש.
            </li>
          </ul>
          <button className="link small danger" disabled={busy} onClick={reset}>
            יצירת קישור חדש (הישן יפסיק לעבוד)
          </button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
