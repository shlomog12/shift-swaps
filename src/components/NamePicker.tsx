import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAction, useQuery } from '../lib/hooks';
import { similarNames } from '../lib/similar';
import { supabase } from '../lib/supabase';
import type { RosterName } from '../lib/types';
import { useFeedback } from './Feedback';
import { LockIcon } from './Icons';

export function NamePicker() {
  const names = useQuery(api.rosterNames, []);
  const [filter, setFilter] = useState('');
  const [custom, setCustom] = useState('');
  const { busy, error, run } = useAction();
  const { confirm } = useFeedback();

  const all = names.data ?? [];
  const byName = useMemo(() => new Map(all.map((n) => [n.name, n])), [all]);
  // The search also finds names spelled a little differently ("דנאלי" finds "דניאלי").
  const visible = useMemo(() => {
    const term = filter.trim();
    const direct = all.filter((n) => n.name.includes(term));
    if (!term || direct.length > 0) return direct;
    return similarNames(term, all.map((n) => n.name), 5).map((name) => byName.get(name)!);
  }, [all, byName, filter]);
  const typedLike = useMemo(
    () => similarNames(custom, all.map((n) => n.name)).map((name) => byName.get(name)!),
    [all, byName, custom],
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

  /** A typed name: first check whether the person meant a name already on the roster. */
  async function chooseTyped(name: string) {
    const like = typedLike.filter((n) => !n.claimed);
    if (like.length === 0) return choose(name);
    const ok = await confirm({
      title: 'יש ברשימה שם דומה',
      message: (
        <>
          <p>
            ברשימה כבר מופיע: <strong>{like.map((n) => n.name).join(', ')}</strong>.
          </p>
          <p>
            אם זה השם שלך, כדאי לבחור אותו מהרשימה. שם חדש לא יקבל את המשמרות שרשומות על השם הקיים, ואת הבחירה
            אפשר לשנות רק דרך מנהל.
          </p>
        </>
      ),
      confirmLabel: `לשמור "${name}" בכל זאת`,
      cancelLabel: 'חזרה לבחירה',
      danger: true,
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
            <NameChip key={n.name} name={n} busy={busy} onChoose={choose} />
          ))}
          {filter.trim() && visible.length === 0 && <p className="muted small">לא נמצא שם כזה ברשימה.</p>}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) chooseTyped(custom.trim());
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
        {custom.trim().length >= 2 && typedLike.length > 0 && (
          <div className="did-you-mean" role="status">
            <span className="small">התכוונת ל…?</span>
            {typedLike.map((n) => (
              <NameChip key={n.name} name={n} busy={busy} onChoose={choose} />
            ))}
          </div>
        )}
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
