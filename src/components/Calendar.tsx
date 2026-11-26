import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SLOT_HOURS,
  formatShortDate,
  hasStarted,
  israelToday,
  monthBounds,
  monthKey,
  monthTitle,
  nightLabel,
  shiftMonth,
} from '../lib/dates';
import { useMe, useQuery } from '../lib/hooks';
import { loadPendingOffers, loadShifts } from '../lib/queries';
import type { Shift } from '../lib/types';
import { ShiftCell } from './ShiftCell';

type Filter = 'all' | 'mine' | 'open' | 'swap';

const FILTERS: [Filter, string][] = [
  ['all', 'הכול'],
  ['mine', 'שלי'],
  ['open', 'פנויות'],
  ['swap', 'חילופים'],
];

export function offerCounts(offers: { night: string; slot: number }[] | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const o of offers ?? []) {
    const key = `${o.night}/${o.slot}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function Calendar() {
  const me = useMe();
  const today = israelToday();
  const [month, setMonth] = useState(monthKey(today));
  const [filter, setFilter] = useState<Filter>('all');
  const { from, to } = monthBounds(month);
  const shifts = useQuery(() => loadShifts(from, to), [from, to]);
  const offers = useQuery(loadPendingOffers, []);
  const counts = useMemo(() => offerCounts(offers.data), [offers.data]);
  const todayRow = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  const nights = useMemo(() => {
    const byNight = new Map<string, Partial<Record<1 | 2, Shift>>>();
    for (const s of shifts.data ?? []) {
      const matches =
        filter === 'all' ||
        (filter === 'mine' && me.isMine(s.assignee)) ||
        (filter === 'open' && !s.assignee && !hasStarted(s.night, s.slot)) ||
        (filter === 'swap' && s.swap_requested);
      if (!matches) continue;
      byNight.set(s.night, { ...byNight.get(s.night), [s.slot]: s });
    }
    return [...byNight.entries()];
  }, [shifts.data, filter, me]);

  // Bring tonight into view the first time the current month is shown.
  useEffect(() => {
    if (!scrolled.current && todayRow.current) {
      scrolled.current = true;
      todayRow.current.scrollIntoView({ block: 'center' });
    }
  }, [nights]);

  return (
    <div className="page">
      <div className="month-nav">
        <button className="icon" aria-label="החודש הקודם" onClick={() => setMonth(shiftMonth(month, -1))}>
          ›
        </button>
        <h2>{monthTitle(month)}</h2>
        <button className="icon" aria-label="החודש הבא" onClick={() => setMonth(shiftMonth(month, 1))}>
          ‹
        </button>
      </div>
      {month !== monthKey(today) && (
        <button className="link center" onClick={() => setMonth(monthKey(today))}>
          חזרה לחודש הנוכחי
        </button>
      )}

      <div className="filters">
        {FILTERS.map(([value, label]) => (
          <button key={value} className={filter === value ? 'chip selected' : 'chip'} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>

      {shifts.error && <p className="error">{shifts.error}</p>}
      {shifts.loading && !shifts.data && <p className="muted">טוען...</p>}
      {shifts.data && nights.length === 0 && (
        <p className="empty">
          {filter === 'all' ? 'אין משמרות בחודש הזה. המנהל עדיין לא הזין אותן.' : 'אין משמרות שמתאימות לסינון.'}
        </p>
      )}

      {nights.length > 0 && (
        <div className="roster">
          <div className="roster-head">
            <span>לילה</span>
            <span>{SLOT_HOURS[1]}</span>
            <span>{SLOT_HOURS[2]}</span>
          </div>
          {nights.map(([night, slots]) => (
            <div
              key={night}
              ref={night === today ? todayRow : undefined}
              className={night === today ? 'roster-row today' : 'roster-row'}
            >
              <div className="night">
                <strong>{formatShortDate(night)}</strong>
                <span className="muted small">{nightLabel(night)}</span>
              </div>
              {([1, 2] as const).map((slot) => {
                const shift = slots[slot];
                return shift ? (
                  <ShiftCell key={slot} shift={shift} offers={counts.get(`${night}/${slot}`)} />
                ) : (
                  <span key={slot} />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
