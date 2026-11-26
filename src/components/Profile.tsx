import { useEffect, useState } from 'react';
import { useMe } from '../lib/hooks';
import { isIos, isStandalone, useInstall } from '../lib/pwa';
import { supabase } from '../lib/supabase';
import { AdminPhonePanel } from './AdminPhone';
import { setShareOffersEnabled, shareOffersEnabled, useFeedback } from './Feedback';
import { WhatsAppButton, inviteText } from './SwapRequests';

/** The signed-in user's details and personal settings, opened from the name in the top bar. */
export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const { confirm, toast } = useFeedback();
  const { canInstall, install } = useInstall();
  const showInstall = !isStandalone() && (canInstall || isIos());
  const [offers, setOffers] = useState(shareOffersEnabled);

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
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="profile-title" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-header">
          <div>
            <h2 id="profile-title">{me.profile.display_name}</h2>
            <p className="muted ltr-inline">{me.email}</p>
          </div>
          <button className="icon" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </header>
        <p className="muted small">
          השם ברשימה נבחר פעם אחת. כדי לשנות אותו צריך לפנות למנהל.
        </p>

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
                בספארי: לחיצה על כפתור השיתוף <span aria-hidden="true">⎙</span> ואז <strong>"הוספה למסך הבית"</strong>.
              </p>
            )}
          </section>
        )}

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
        </section>

        <section className="profile-section">
          <h3>הזמנה לאפליקציה</h3>
          <p className="muted small">יש בשמירה מי שעוד לא הצטרפו? אפשר לשלוח להם קישור והסבר קצר.</p>
          <WhatsAppButton text={inviteText()} label="הזמנה בוואטסאפ" />
        </section>

        {me.profile.is_admin && <AdminPhonePanel />}

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
