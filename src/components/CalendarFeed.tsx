import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { GOOGLE_ADD_BY_URL, feedUrl, webcalUrl } from '../lib/calendar';
import { useAction } from '../lib/hooks';
import { supabaseUrl } from '../lib/supabase';
import { useFeedback } from './Feedback';

/** Profile section: subscribe to my shifts in Google Calendar or on an iPhone, and replace the link. */
export function CalendarFeedSection() {
  const [token, setToken] = useState<string | null>(null);
  const [showGoogleSteps, setShowGoogleSteps] = useState(false);
  const linkField = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useAction();
  const { confirm, toast } = useFeedback();
  const feed = token ? feedUrl(supabaseUrl, token) : null;

  /** Copies the link; if the browser refuses, selects it in the field so it can be copied by hand. */
  async function copy(quiet = false) {
    if (!feed) return;
    try {
      await navigator.clipboard.writeText(feed);
      if (!quiet) toast('הקישור הועתק');
    } catch {
      linkField.current?.select();
      toast('לא הצלחנו להעתיק אוטומטית. אפשר לסמן את הקישור בשדה ולהעתיק', 'info');
    }
  }

  // The link opens Google's "add calendar from URL" page in the browser; the copy starts in the same tap,
  // so the link is ready to paste when the page opens.
  function openGoogle() {
    setShowGoogleSteps(true);
    void copy(true);
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
            <a
              className="button primary"
              href={GOOGLE_ADD_BY_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={openGoogle}
            >
              הוספה ליומן גוגל
            </a>
            <a className="button" href={webcalUrl(feed)}>
              הוספה ליומן באייפון
            </a>
            <button onClick={() => copy()}>העתקת הקישור</button>
          </div>
          <input
            ref={linkField}
            className="feed-link ltr"
            readOnly
            value={feed}
            aria-label="הקישור ליומן"
            onFocus={(e) => e.target.select()}
          />
          {showGoogleSteps && (
            <ol className="small google-steps">
              <li>הקישור הועתק, ונפתח דף "הוספת יומן מכתובת URL" של גוגל בדפדפן.</li>
              <li>מוודאים למעלה שזה חשבון הגוגל הנכון.</li>
              <li>
                מדביקים את הקישור בשדה <strong>"כתובת URL של היומן"</strong> ולוחצים <strong>"הוספת יומן"</strong>.
              </li>
              <li>
                בטלפון: באפליקציית Google Calendar ← הגדרות ← היומן "שמירות" ← להפעיל <strong>סנכרון</strong>.
              </li>
              <li className="muted">אם הדף נפתח באפליקציה במקום בדפדפן, אפשר לפתוח אותו בדפדפן במצב "אתר למחשב".</li>
            </ol>
          )}
          <ul className="small calendar-notes">
            <li>
              <strong>עדכון:</strong> בהוספה הראשונה ייתכן שיעברו כמה דקות עד שהמשמרות יופיעו. אחר כך גוגל מרענן
              יומנים כאלה כל כמה שעות, ולפעמים רק אחרי יממה. לחילוף של הלילה כדאי
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
