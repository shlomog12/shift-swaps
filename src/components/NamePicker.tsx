import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAction, useQuery } from '../lib/hooks';
import { similarNames } from '../lib/similar';
import { supabase } from '../lib/supabase';
import type { RosterName } from '../lib/types';
import { useFeedback } from './Feedback';
import { LockIcon } from './Icons';
import { AskAdmins } from './Login';

/**
 * First sign-in: pick your name from the roster. Only names already on the roster can be picked (the
 * database enforces it too); someone who is not on it yet asks an admin to add them.
 */
export function NamePicker({ email }: { email: string }) {
  const names = useQuery(api.rosterNames, []);
  const [filter, setFilter] = useState('');
  const { busy, error, run } = useAction();
  const { confirm } = useFeedback();

  const all = names.data ?? [];
  const byName = useMemo(() => new Map(all.map((n) => [n.name, n])), [all]);
  // The search also finds names spelled a little differently ("דנאלי" finds "דניאלי").
  const term = filter.trim();
  const direct = useMemo(() => all.filter((n) => n.name.includes(term)), [all, term]);
  const similar = useMemo(
    () =>
      term && direct.length === 0 ? similarNames(term, all.map((n) => n.name), 5).map((name) => byName.get(name)!) : [],
    [all, byName, direct, term],
  );
  const visible = term && direct.length === 0 ? similar : direct;

  async function choose(name: string) {
    const ok = await confirm({
      title: `השם שלך ברשימה הוא "${name}"?`,
      message: 'כל המשמרות שרשומות על השם הזה יסומנו כשלך. הבחירה היא חד־פעמית, ושינוי אחר כך רק דרך מנהל.',
      confirmLabel: 'כן, זה השם שלי',
      cancelLabel: 'חזרה',
    });
    if (ok) run(() => api.claimName(name));
  }

  return (
    <div className="center-page">
      <div className="card name-picker">
        <h1>מי אני ברשימה?</h1>
        <p>בחירת השם שלך מתוך לוח המשמרות. כל המשמרות שרשומות על השם הזה יסומנו כשלך.</p>
        <input type="search" placeholder="חיפוש שם" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {names.loading && !names.data && <p className="muted">טוען...</p>}
        {names.error && <p className="error">{names.error}</p>}
        {term && direct.length === 0 && similar.length > 0 && <p className="small did-you-mean-label">התכוונת ל…?</p>}
        <div className="name-list">
          {visible.map((n) => (
            <NameChip key={n.name} name={n} busy={busy} onChoose={choose} />
          ))}
          {term && visible.length === 0 && <p className="muted small">לא נמצא שם כזה ברשימה.</p>}
        </div>
        <p className="muted small">שם שכבר שייך למישהו אחר נעול. אם זה השם שלך, או שבחרת בטעות, אפשר לפנות למנהל.</p>
        {error && <p className="error">{error}</p>}

        <details className="not-on-roster">
          <summary>השם שלי לא מופיע ברשימה</summary>
          <p className="small">
            אפשר לבחור רק שם שכבר מופיע בלוח המשמרות. מנהל יכול להוסיף אותך: לשבץ אותך למשמרת, או לקבוע את השם שלך
            ישירות.
          </p>
          <AskAdmins
            intro="הודעה למנהל בוואטסאפ:"
            text={`היי, השם שלי לא מופיע ברשימה באפליקציית המשמרות (נרשמתי עם ${email}). אפשר להוסיף אותי?`}
          />
        </details>

        <button className="link" onClick={() => supabase.auth.signOut()}>
          התנתקות
        </button>
      </div>
    </div>
  );
}

function NameChip({ name, busy, onChoose }: { name: RosterName; busy: boolean; onChoose: (name: string) => void }) {
  return (
    <button
      className="chip"
      disabled={busy || name.claimed}
      title={name.claimed ? 'השם כבר שייך למשתמש אחר' : undefined}
      onClick={() => onChoose(name.name)}
    >
      {name.name}
      {name.claimed && <LockIcon />}
    </button>
  );
}
