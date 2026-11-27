import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useQuery, useRefresh } from '../lib/hooks';
import { appLink } from '../lib/share';
import type { UserStatus } from '../lib/types';
import { supabase } from '../lib/supabase';
import { WhatsAppButton } from './SwapRequests';

export function Login() {
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (signInError) setError(signInError.message);
  }

  return (
    <div className="center-page">
      <div className="card login">
        <img src="./icon.svg" alt="" width={72} height={72} />
        <h1>משמרות וחילופים</h1>
        <p>לוח המשמרות של השמירה: לקיחת משמרות פנויות, בקשות חילוף ואישורן.</p>
        <button className="primary big" onClick={signIn}>
          התחברות עם Google
        </button>
        <p className="muted small">כל פעולה נרשמת בהיסטוריה עם חשבון הגוגל שביצע אותה.</p>
        {error && <p className="error">{error}</p>}
        <p className="small">
          <a href="./privacy.html">מדיניות פרטיות</a>
        </p>
      </div>
    </div>
  );
}

export function SetupMissing() {
  return (
    <div className="center-page">
      <div className="card">
        <h1>חסרות הגדרות</h1>
        <p>
          לא הוגדרו <code>VITE_SUPABASE_URL</code> ו-<code>VITE_SUPABASE_ANON_KEY</code>. ראו את ההוראות בקובץ
          README.
        </p>
      </div>
    </div>
  );
}

/** Shown to users an admin has not approved yet, or has rejected. */
export function AccessPending({ status, email }: { status: Exclude<UserStatus, 'approved'>; email: string }) {
  const { refresh } = useRefresh();

  // Check again every 20 seconds, so the app opens by itself once an admin approves.
  useEffect(() => {
    if (status !== 'pending') return;
    const timer = window.setInterval(refresh, 20_000);
    return () => window.clearInterval(timer);
  }, [status, refresh]);

  return (
    <div className="center-page">
      <div className="card login">
        <img src="./icon.svg" alt="" width={72} height={72} />
        {status === 'pending' ? (
          <>
            <h1>ממתין לאישור מנהל</h1>
            <p>
              ההרשמה התבצעה עם <span className="ltr-inline">{email}</span>. המנהל קיבל הודעה, ואחרי האישור אפשר
              יהיה לבחור את השם שלך ברשימה. יישלח גם מייל כשהחשבון יאושר.
            </p>
            <AskAdmins
              intro="כדי לזרז את האישור, אפשר לשלוח למנהל הודעה בוואטסאפ:"
              text={`היי, נרשמתי לאפליקציית המשמרות עם ${email}. אפשר לאשר אותי?\n${appLink()}`}
            />
            <button className="primary" onClick={refresh}>
              בדיקה שוב
            </button>
          </>
        ) : (
          <>
            <h1>אין גישה</h1>
            <p>
              החשבון <span className="ltr-inline">{email}</span> לא אושר לשימוש באפליקציה. אם זו טעות, אפשר לפנות למנהל.
            </p>
          </>
        )}
        <p>
          <button className="link" onClick={() => supabase.auth.signOut()}>
            התנתקות / החלפת חשבון
          </button>
        </p>
      </div>
    </div>
  );
}

/** WhatsApp buttons to the admins who added a phone, so a new user can ask to be approved. */
export function AskAdmins({ intro, text }: { intro: string; text: string }) {
  const contacts = useQuery(api.adminContacts, []);
  if (!contacts.data) return null;

  return (
    <div className="ask-admins">
      <p className="small">{intro}</p>
      {contacts.data.map((c) => (
        <WhatsAppButton key={c.id} text={text.replace('היי,', `היי ${c.name},`)} phone={c.phone} label={`הודעה ל${c.name}`} />
      ))}
      {contacts.data.length === 0 && <WhatsAppButton text={text} label="הודעה למנהל בוואטסאפ" />}
    </div>
  );
}
