import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SLOT_HOURS,
  SLOT_NAME,
  addDays,
  dayOfMonth,
  formatDate,
  formatShortDate,
  hasStarted,
  israelToday,
  monthGridBounds,
  monthKey,
  monthTitle,
  nightLabel,
  nightShortLabel,
  shiftMonth,
  slotTime,
} from '../lib/dates';
import { useMe, useQuery, useRoster, type Me } from '../lib/hooks';
import { loadShifts } from '../lib/queries';
import type { Shift } from '../lib/types';
import { RosterShare } from './RosterShare';
import { ShiftCell, shiftClasses } from './ShiftCell';
import { DecisionsCard, NextShiftCard } from './Summary';
import { SkeletonGrid, SkeletonList } from './Skeleton';

type Filter = 'all' | 'mine' | 'open' | 'swap';
type View = 'month' | 'list';
type NightShifts = Partial<Record<1 | 2, Shift>>;

const FILTERS: [Filter, string][] = [
  ['all', 'הכול'],
  ['mine', 'שלי'],
  ['open', 'פנויות'],
  ['swap', 'חילופים'],
];

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const VIEW_STORAGE_KEY = 'calendar-view';

export function offerCounts(offers: { night: string; slot: number }[] | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const o of offers ?? []) {
    const key = `${o.night}/${o.slot}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function matchesFilter(shift: Shift, filter: Filter, me: Me): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'mine':
      return me.isMine(shift.assignee);
    case 'open':
      return !shift.assignee && !hasStarted(shift.night, shift.slot);
    case 'swap':
      return shift.swap_requested;
  }
}

function initialView(): View {
  return localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'month';
}

export function Calendar() {
  const today = israelToday();
  const [month, setMonth] = useState(monthKey(today));
  const [view, setView] = useState<View>(initialView);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string>(today);
  const { from, to } = monthGridBounds(month);
  const shifts = useQuery(() => loadShifts(from, to), [from, to]);
  const offers = useRoster().pendingOffers;
  const counts = useMemo(() => offerCounts(offers.data), [offers.data]);

  const byNight = useMemo(() => {
    const map = new Map<string, NightShifts>();
    for (const s of shifts.data ?? []) map.set(s.night, { ...map.get(s.night), [s.slot]: s });
    return map;
  }, [shifts.data]);

  function changeView(next: View) {
    setView(next);
    localStorage.setItem(VIEW_STORAGE_KEY, next);
  }

  function goToMonth(key: string) {
    setMonth(key);
    setSelected(key === monthKey(today) ? today : `${key}-01`);
  }

  return (
    <div className="page">
      <NextShiftCard />
      <DecisionsCard />

      <div className="month-nav">
        <button className="icon" aria-label="החודש הקודם" onClick={() => goToMonth(shiftMonth(month, -1))}>
          ›
        </button>
        <h2>{monthTitle(month)}</h2>
        <button className="icon" aria-label="החודש הבא" onClick={() => goToMonth(shiftMonth(month, 1))}>
          ‹
        </button>
      </div>

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="תצוגה">
          <button className={view === 'month' ? 'selected' : undefined} onClick={() => changeView('month')}>
            יומן
          </button>
          <button className={view === 'list' ? 'selected' : undefined} onClick={() => changeView('list')}>
            רשימה
          </button>
        </div>
        {month !== monthKey(today) && (
          <button className="link" onClick={() => goToMonth(monthKey(today))}>
            היום
          </button>
        )}
      </div>
      <RosterShare month={month} shifts={shifts.data} />

      <div className="filters">
        {FILTERS.map(([value, label]) => (
          <button key={value} className={filter === value ? 'chip selected' : 'chip'} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>

      {shifts.error && <p className="error">{shifts.error}</p>}
      {shifts.loading && !shifts.data && (view === 'month' ? <SkeletonGrid /> : <SkeletonList rows={6} />)}

      {shifts.data && view === 'month' && (
        <>
          <Legend month={month} />
          <MonthGrid
            month={month}
            from={from}
            to={to}
            today={today}
            selected={selected}
            byNight={byNight}
            filter={filter}
            onSelect={setSelected}
          />
          <DayDetails night={selected} shifts={byNight.get(selected)} counts={counts} />
        </>
      )}

      {shifts.data && view === 'list' && (
        <RosterList month={month} today={today} byNight={byNight} filter={filter} counts={counts} />
      )}
    </div>
  );
}

interface GridProps {
  month: string;
  from: string;
  to: string;
  today: string;
  selected: string;
  byNight: Map<string, NightShifts>;
  filter: Filter;
  onSelect: (night: string) => void;
}

function MonthGrid({ month, from, to, today, selected, byNight, filter, onSelect }: GridProps) {
  const me = useMe();
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);

  return (
    <div className="month-grid" role="grid" aria-label={monthTitle(month)}>
      {WEEKDAYS.map((name) => (
        <div key={name} className="weekday" role="columnheader">
          {name}
        </div>
      ))}
      {days.map((day) => {
        const night = byNight.get(day);
        const classes = ['day'];
        if (monthKey(day) !== month) classes.push('other-month');
        if (day === today) classes.push('today');
        if (day === selected) classes.push('selected');
        // The cell selects the day; each name inside opens its shift directly.
        return (
          <div key={day} className={classes.join(' ')} role="gridcell" onClick={() => onSelect(day)}>
            <button
              className="day-number"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(day);
              }}
              aria-label={`${formatDate(day)}, ${nightLabel(day)}`}
              aria-pressed={day === selected}
            >
              {dayOfMonth(day)}
            </button>
            {([1, 2] as const).map((slot) => {
              const shift = night?.[slot];
              if (!shift) return null;
              const mine = me.isMine(shift.assignee);
              const chipClasses = shiftClasses(shift, mine).replace('shift-cell', 'day-chip');
              const dim = matchesFilter(shift, filter, me) ? '' : ' dim';
              const name = shift.assignee ?? 'פנוי';
              return (
                <button
                  key={slot}
                  className={chipClasses + dim}
                  title={name}
                  aria-label={`${SLOT_HOURS[slot]} ${name}${shift.swap_requested ? ', בקשת חילוף' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(day);
                    me.openShift(shift.night, shift.slot);
                  }}
                >
                  {shift.swap_requested && (
                    <span className="chip-glyph" aria-hidden="true">
                      ⇄
                    </span>
                  )}
                  {name}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const NOTE_KEY = 'midnight-note-seen';

/** Colour legend, and the midnight rule: explained once, then one tap away. */
function Legend({ month }: { month: string }) {
  const [showNote, setShowNote] = useState(() => localStorage.getItem(NOTE_KEY) !== 'yes');
  const example = `${month}-05`;

  function dismiss() {
    localStorage.setItem(NOTE_KEY, 'yes');
    setShowNote(false);
  }

  return (
    <>
      <div className="legend" aria-label="מקרא">
        <span className="legend-item">
          <span className="day-chip mine">שם</span> שלי
        </span>
        <span className="legend-item">
          <span className="day-chip open">פנוי</span> פנויה
        </span>
        <span className="legend-item">
          <span className="day-chip swap">
            <span className="chip-glyph">⇄</span>שם
          </span>{' '}
          בקשת חילוף
        </span>
        {!showNote && (
          <button className="link small" onClick={() => setShowNote(true)}>
            איך לקרוא את היומן?
          </button>
        )}
      </div>
      {showNote && (
        <div className="midnight-note small">
          <p>
            <strong>כל שמירה מופיעה ביום שבו היא מתחילה, בחצות.</strong> למשל, שמירה ב־{formatShortDate(example)}{' '}
            היא בלילה שבין {formatShortDate(addDays(example, -1))} ל־{formatShortDate(example)}. בכל יום מופיעה
            המשמרת הראשונה ({SLOT_HOURS[1]}) ומתחתיה השנייה ({SLOT_HOURS[2]}).
          </p>
          <button className="small" onClick={dismiss}>
            הבנתי
          </button>
        </div>
      )}
    </>
  );
}

function DayDetails({ night, shifts, counts }: { night: string; shifts?: NightShifts; counts: Map<string, number> }) {
  return (
    <section className="day-details">
      <h3>
        {formatDate(night)} · <span className="muted">{nightLabel(night)}</span>
      </h3>
      {!shifts && <p className="muted">אין משמרות בלילה הזה.</p>}
      {shifts &&
        ([1, 2] as const).map((slot) => {
          const shift = shifts[slot];
          return (
            shift && (
              <div key={slot} className="day-detail-row">
                <span className="slot-label">
                  {SLOT_NAME[slot]}
                  <span className="muted small"> {slotTime(night, slot)}</span>
                </span>
                <ShiftCell shift={shift} offers={counts.get(`${night}/${slot}`)} />
              </div>
            )
          );
        })}
    </section>
  );
}

interface ListProps {
  month: string;
  today: string;
  byNight: Map<string, NightShifts>;
  filter: Filter;
  counts: Map<string, number>;
}

function RosterList({ month, today, byNight, filter, counts }: ListProps) {
  const me = useMe();
  const todayRow = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  const nights = useMemo(() => {
    const rows: [string, NightShifts][] = [];
    for (const [night, slots] of byNight) {
      if (monthKey(night) !== month) continue;
      const visible: NightShifts = {};
      for (const slot of [1, 2] as const) {
        const shift = slots[slot];
        if (shift && matchesFilter(shift, filter, me)) visible[slot] = shift;
      }
      if (visible[1] || visible[2]) rows.push([night, visible]);
    }
    return rows.sort(([a], [b]) => a.localeCompare(b));
  }, [byNight, month, filter, me]);

  // Bring tonight into view the first time the list is shown.
  useEffect(() => {
    if (!scrolled.current && todayRow.current) {
      scrolled.current = true;
      todayRow.current.scrollIntoView({ block: 'center' });
    }
  }, [nights]);

  if (nights.length === 0) {
    return (
      <p className="empty">
        {filter === 'all' ? 'אין משמרות בחודש הזה. המנהל עדיין לא הזין אותן.' : 'אין משמרות שמתאימות לסינון.'}
      </p>
    );
  }

  return (
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
            <span className="muted small">{nightShortLabel(night)}</span>
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
  );
}
