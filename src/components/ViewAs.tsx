import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useFocusTrap } from '../lib/focusTrap';
import { sameName, useQuery } from '../lib/hooks';
import { similarNames } from '../lib/similar';
import { SkeletonChips } from './Skeleton';

/** Lets a system admin pick a roster name, to see the app the way that user sees it. */
export function ViewAsPicker({
  current,
  onPick,
  onClose,
}: {
  current: string | null;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const names = useQuery(api.rosterNames, []);
  const [filter, setFilter] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const all = names.data ?? [];
  const term = filter.trim();
  const visible = useMemo(() => {
    const direct = all.filter((n) => n.name.includes(term));
    if (!term || direct.length > 0) return direct;
    const like = new Set(similarNames(term, all.map((n) => n.name), 5));
    return all.filter((n) => like.has(n.name));
  }, [all, term]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="dialog name-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="view-as-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="view-as-title">תצוגה כמשתמש</h2>
        <p className="muted small">
          בוחרים שם, והאפליקציה תוצג כמו שהוא רואה אותה: המשמרות שלו, הבקשות וההצעות שלו. זו תצוגה בלבד, אי אפשר
          לבצע פעולות בשמו.
        </p>
        <input type="search" placeholder="חיפוש שם" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {names.loading && !names.data && <SkeletonChips count={6} />}
        {names.error && <p className="error">{names.error}</p>}
        <div className="name-list">
          {visible.map((n) => {
            const isCurrent = sameName(n.name, current);
            return (
              <button
                key={n.name}
                className={isCurrent ? 'chip selected' : 'chip'}
                disabled={isCurrent}
                title={n.claimed ? undefined : 'עוד לא באפליקציה'}
                onClick={() => onPick(n.name)}
              >
                {n.name}
                {!n.claimed && <span className="muted"> (לא באפליקציה)</span>}
              </button>
            );
          })}
          {term && visible.length === 0 && <p className="muted small">לא נמצא שם כזה ברשימה.</p>}
        </div>

        <div className="dialog-buttons">
          <button type="button" onClick={onClose}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
