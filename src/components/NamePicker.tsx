import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAction, useQuery } from '../lib/hooks';

interface Props {
  currentName: string | null;
  onDone: () => void;
  onCancel?: () => void;
}

export function NamePicker({ currentName, onDone, onCancel }: Props) {
  const names = useQuery(api.rosterNames, []);
  const [filter, setFilter] = useState('');
  const [custom, setCustom] = useState('');
  const { busy, error, run } = useAction();

  const visible = useMemo(
    () => (names.data ?? []).filter((n) => n.name.includes(filter.trim())),
    [names.data, filter],
  );

  function choose(name: string) {
    if (!window.confirm(`לאשר שהשם שלך ברשימה הוא "${name}"?`)) return;
    run(() => api.claimName(name), onDone);
  }

  return (
    <div className="center-page">
      <div className="card name-picker">
        <h1>מי אני ברשימה?</h1>
        <p>
          בחר את השם שלך כפי שהוא מופיע בלוח המשמרות. כל המשמרות שרשומות על השם הזה יסומנו כשלך.
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
              className={n.name === currentName ? 'chip selected' : 'chip'}
              disabled={busy || (n.claimed && n.name !== currentName)}
              title={n.claimed ? 'השם כבר שייך למשתמש אחר' : undefined}
              onClick={() => choose(n.name)}
            >
              {n.name}
              {n.claimed && n.name !== currentName && ' 🔒'}
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
            placeholder="השם שלי לא ברשימה – הקלד אותו"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
          <button className="primary" disabled={busy || custom.trim().length < 2}>
            שמירה
          </button>
        </form>
        <p className="muted small">שם שכבר שייך למישהו אחר נעול. אם זה השם שלך, פנה למנהל.</p>
        {error && <p className="error">{error}</p>}
        {onCancel && (
          <button className="link" onClick={onCancel}>
            ביטול
          </button>
        )}
      </div>
    </div>
  );
}
