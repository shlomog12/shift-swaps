import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAction, useQuery } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import { useFeedback } from './Feedback';
import { LockIcon } from './Icons';

export function NamePicker() {
  const names = useQuery(api.rosterNames, []);
  const [filter, setFilter] = useState('');
  const [custom, setCustom] = useState('');
  const { busy, error, run } = useAction();
  const { confirm } = useFeedback();

  const visible = useMemo(
    () => (names.data ?? []).filter((n) => n.name.includes(filter.trim())),
    [names.data, filter],
  );

  async function choose(name: string) {
    const ok = await confirm({
      title: `השם שלך ברשימה הוא "${name}"?`,
      message: 'הבחירה היא חד־פעמית. כדי לשנות אותה אחר כך צריך לפנות למנהל.',
      confirmLabel: 'כן, זה השם שלי',
      cancelLabel: 'חזרה',
    });
    if (ok) run(() => api.claimName(name));
  }

  return (
    <div className="center-page">
      <div className="card name-picker">
        <h1>מי אני ברשימה?</h1>
        <p>
          בחירת השם שלך כפי שהוא מופיע בלוח המשמרות. כל המשמרות שרשומות על השם הזה יסומנו כשלך.
        </p>
        <input
          type="search"
          placeholder="חיפוש שם"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {names.loading && !names.data && <p className="muted">טוען...</p>}
        {names.error && <p className="error">{names.error}</p>}
        <div className="name-list">
          {visible.map((n) => (
            <button
              key={n.name}
              className="chip"
              disabled={busy || n.claimed}
              title={n.claimed ? 'השם כבר שייך למשתמש אחר' : undefined}
              onClick={() => choose(n.name)}
            >
              {n.name}
              {n.claimed && <LockIcon />}
            </button>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) choose(custom.trim());
          }}
        >
          <input
            placeholder="השם שלי לא ברשימה – הקלדה ידנית"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
          <button className="primary" disabled={busy || custom.trim().length < 2}>
            שמירה
          </button>
        </form>
        <p className="muted small">
          הבחירה היא חד־פעמית. שם שכבר שייך למישהו אחר נעול. אם זה השם שלך, או שבחרת בטעות, אפשר לפנות למנהל.
        </p>
        {error && <p className="error">{error}</p>}
        <button className="link" onClick={() => supabase.auth.signOut()}>
          התנתקות
        </button>
      </div>
    </div>
  );
}
