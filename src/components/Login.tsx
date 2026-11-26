import { useState } from 'react';
import { supabase } from '../lib/supabase';

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
