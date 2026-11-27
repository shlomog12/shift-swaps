import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../lib/focusTrap';
import { useHebrewDates } from '../lib/hebrewSetting';
import { SYSTEM_ADMIN_LABEL } from '../lib/types';
import { useMe } from '../lib/hooks';
import { isIos, isStandalone, useInstall } from '../lib/pwa';
import { supabase } from '../lib/supabase';
import { MyPhoneSection } from './MyPhone';
import { CalendarFeedSection } from './CalendarFeed';
import { PushSection } from './PushSection';
import { ShareIosIcon } from './Icons';
import { setShareOffersEnabled, shareOffersEnabled, useFeedback } from './Feedback';
import { WhatsAppButton, inviteText } from './SwapRequests';

/** The signed-in user's details and personal settings, opened from the name in the top bar. */
export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const acting = me.actingFor;
  const { confirm, toast } = useFeedback();
  const { canInstall, install } = useInstall();
  const showInstall = !isStandalone() && (canInstall || isIos());
  const [offers, setOffers] = useState(shareOffersEnabled);
  const [hebrew, setHebrew] = useHebrewDates();
  const sheetRef = useRef<HTMLDivElement>(null);
  useFocusTrap(sheetRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function signOut() {
    if (await confirm({ title: 'להתנתק?', confirmLabel: 'התנתקות' })) supabase.auth.signOut();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-header">
          <div>
            <h2 id="profile-title">{me.profile.display_name ?? SYSTEM_ADMIN_LABEL}</h2>
            <p className="muted ltr-inline">{me.email}</p>
          </div>
          <button className="icon" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </header>
        {acting ? (
          <p className="warning-note small" role="status">
            זה הפרופיל של {acting}, כי כרגע פועלים בשם החשבון הזה. התראות לטלפון וחיבור ליומן שייכים לחשבון
            ולמכשיר שלך, ולכן לא מוצגים כאן. כדי לשנות אותם צריך קודם לצאת מ&quot;פעולה בשם&quot;.
          </p>
        ) : (
          <p className="muted small">
            {me.profile.display_name
              ? 'השם ברשימה נבחר פעם אחת. כדי לשנות אותו צריך לפנות למנהל.'
              : 'חשבון אחראי מערכת: מנהל בלי שם ברשימה, שלא משובץ למשמרות.'}
          </p>
        )}

        {showInstall && (
          <section className="profile-section">
            <h3>התקנה כאפליקציה</h3>
            <p className="muted small">אייקון במסך הבית, פתיחה במסך מלא בלי שורת הדפדפן.</p>
            {canInstall ? (
              <button
                className="primary"
                onClick={async () => {
                  if (await install()) toast('האפליקציה הותקנה');
                }}
              >
                התקנה במסך הבית
              </button>
            ) : (
              <p className="small">
                בספארי: לחיצה על כפתור השיתוף <ShareIosIcon /> ואז <strong>"הוספה למסך הבית"</strong>.
              </p>
            )}
          </section>
        )}

        {/* While acting for someone, the calendar link would be theirs (and "new link" would break their
            subscription), and notifications belong to this device and account: both stay hidden. */}
        {!acting && me.profile.display_name && <CalendarFeedSection />}
        {!me.readOnly && <MyPhoneSection />}
        {!acting && <PushSection />}

        <section className="profile-section">
          <h3>הגדרות</h3>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={offers}
              onChange={(e) => {
                setOffers(e.target.checked);
                setShareOffersEnabled(e.target.checked);
              }}
            />
            <span>
              אחרי פעולה, להציע לשלוח עדכון בוואטסאפ
              <span className="muted small"> (למשל אחרי התנדבות או אישור)</span>
            </span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={hebrew} onChange={(e) => setHebrew(e.target.checked)} />
            <span>
              הצגת תאריך עברי
              <span className="muted small"> (ביומן, ברשימות ובחלון המשמרת. חגים מסומנים תמיד)</span>
            </span>
          </label>
        </section>

        <section className="profile-section">
          <h3>הזמנה לאפליקציה</h3>
          <p className="muted small">יש בשמירה מי שעוד לא הצטרפו? אפשר לשלוח להם קישור והסבר קצר.</p>
          <WhatsAppButton text={inviteText()} label="הזמנה בוואטסאפ" />
        </section>


        <section className="profile-section">
          <button className="danger" onClick={signOut}>
            התנתקות
          </button>
          <p className="small">
            <a href="./privacy.html">מדיניות פרטיות</a>
          </p>
        </section>
      </div>
    </div>
  );
}
