import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useFocusTrap } from '../lib/focusTrap';
import { sameName, useQuery } from '../lib/hooks';
import { similarNames } from '../lib/similar';
import { LockIcon } from './Icons';
import { SkeletonChips } from './Skeleton';

/**
 * Lets an admin set a user's roster name by picking it from the roster, like users do for themselves.
 * Names that belong to someone else are locked. A name that is not on the roster yet can still be typed,
 * behind its own option, since adding new people is the admin's job.
 */
export function AdminNamePicker({
  userLabel,
  current,
  onPick,
  onClose,
}: {
  userLabel: string;
  current: string | null;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const names = useQuery(api.rosterNames, []);
  const [filter, setFilter] = useState('');
  const [typed, setTyped] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);

  // Escape closes only this window, not the user's sheet behind it (caught first, then stopped).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const all = names.data ?? [];
  const term = filter.trim();
  const visible = useMemo(() => {
    const direct = all.filter((n) => n.name.includes(term));
    if (!term || direct.length > 0) return direct;
    const like = new Set(similarNames(term, all.map((n) => n.name), 5));
    return all.filter((n) => like.has(n.name));
  }, [all, term]);
  const typedName = typed.trim();
  const typedExists = all.some((n) => sameName(n.name, typedName));

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        ref={ref}
        className="dialog name-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-name-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="admin-name-title">השם ברשימה של {userLabel}</h2>
        <input type="search" placeholder="חיפוש שם" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {names.loading && !names.data && <SkeletonChips count={6} />}
        {names.error && <p className="error">{names.error}</p>}
        <div className="name-list">
          {visible.map((n) => {
            const isCurrent = sameName(n.name, current);
            const locked = n.claimed && !isCurrent;
            return (
              <button
                key={n.name}
                className={isCurrent ? 'chip selected' : 'chip'}
                disabled={locked || isCurrent}
                title={locked ? 'השם שייך למשתמש אחר' : isCurrent ? 'השם הנוכחי' : undefined}
                onClick={() => onPick(n.name)}
              >
                {n.name}
                {locked && <LockIcon />}
                {isCurrent && ' (נוכחי)'}
              </button>
            );
          })}
          {term && visible.length === 0 && <p className="muted small">לא נמצא שם כזה ברשימה.</p>}
        </div>
        <p className="muted small">שם שכבר שייך למשתמש אחר נעול. כדי להעביר אותו, קודם מנתקים את המשתמש השני מהשם.</p>

        <details className="not-on-roster">
          <summary>שם חדש שלא מופיע בלוח</summary>
          <p className="small">למי שעוד אין לו משמרות. אחרי זה אפשר לשבץ אותו למשמרות דרך היומן.</p>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (typedName.length >= 2 && !typedExists) onPick(typedName);
            }}
          >
            <input value={typed} maxLength={60} placeholder="השם החדש" onChange={(e) => setTyped(e.target.value)} />
            <button className="primary" disabled={typedName.length < 2 || typedExists}>
              קביעה
            </button>
          </form>
          {typedExists && <p className="small">השם הזה כבר ברשימה, אפשר לבחור אותו למעלה.</p>}
        </details>

        <div className="dialog-buttons">
          <button type="button" onClick={onClose}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
