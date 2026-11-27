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
  monthBounds,
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
import { swipeMonthStep } from '../lib/swipe';
import { ShiftCell, shiftClasses } from './ShiftCell';
import { DecisionsCard, NextShiftCard } from './Summary';
import { SkeletonGrid, SkeletonList } from './Skeleton';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons';
import { dayMarks, hebrewDate, hebrewDay, hebrewMonthsBetween } from '../lib/hebrewDate';
import { useHebrewDates } from '../lib/hebrewSetting';
import { HebrewLine, HolidayTag } from './HolidayTag';
import { asPlanned, differsFromPlan } from '../lib/plan';

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
const PLAN_VIEW_KEY = 'plan-view';

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
  const [hebrew, setHebrew] = useHebrewDates();
  const today = israelToday();
  const [month, setMonth] = useState(monthKey(today));
  const [view, setView] = useState<View>(initialView);
  const [filter, setFilter] = useState<Filter>('all');
  // A system admin (no roster name) has no shifts of their own, so "mine" means nothing to them.
  const named = Boolean(useMe().profile.display_name);
  const [selected, setSelected] = useState<string>(today);
  const { from, to } = monthGridBounds(month);
  const shifts = useQuery(() => loadShifts(from, to), [from, to]);
  const offers = useRoster().pendingOffers;
  const counts = useMemo(() => offerCounts(offers.data), [offers.data]);

  // Admins can view the original roster (before swaps), with the shifts that changed marked.
  const me = useMe();
  const canPlan = me.profile.is_admin && (shifts.data ?? []).some((s) => 'planned_assignee' in s);
  const [planView, setPlanView] = useState(() => sessionStorage.getItem(PLAN_VIEW_KEY) === 'on');
  const showPlan = canPlan && planView;
  const shown = useMemo(() => (showPlan ? (shifts.data ?? []).map(asPlanned) : shifts.data ?? []), [shifts.data, showPlan]);
  const changedInMonth = useMemo(
    () => (showPlan ? shown.filter((s) => monthKey(s.night) === month && differsFromPlan(s)).length : 0),
    [shown, showPlan, month],
  );
  function choosePlanView(on: boolean) {
    setPlanView(on);
    sessionStorage.setItem(PLAN_VIEW_KEY, on ? 'on' : 'off');
  }

  const byNight = useMemo(() => {
    const map = new Map<string, NightShifts>();
    for (const s of shown) map.set(s.night, { ...map.get(s.night), [s.slot]: s });
    return map;
  }, [shown]);

  function changeView(next: View) {
    setView(next);
    localStorage.setItem(VIEW_STORAGE_KEY, next);
  }

  // Swiping the calendar turns the month; the slide direction follows the swipe or the arrow pressed.
  const [slide, setSlide] = useState<'' | 'next' | 'prev'>('');
  const touch = useRef<{ x: number; y: number } | null>(null);

  function step(delta: 1 | -1) {
    setSlide(delta === 1 ? 'next' : 'prev');
    goToMonth(shiftMonth(month, delta));
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
        <button className="icon" aria-label="החודש הקודם" onClick={() => step(-1)}>
          <ChevronRightIcon />
        </button>
        <h2 className="month-title">
          {monthTitle(month)}
          {hebrew && <span className="hebrew-months">{hebrewMonthsBetween(monthBounds(month).from, monthBounds(month).to)}</span>}
        </h2>
        <button className="icon" aria-label="החודש הבא" onClick={() => step(1)}>
          <ChevronLeftIcon />
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
        <button
          className={hebrew ? 'chip selected' : 'chip'}
          aria-pressed={hebrew}
          onClick={() => setHebrew(!hebrew)}
        >
          תאריך עברי
        </button>
        {canPlan && (
          <div className="segmented" role="group" aria-label="איזה לוח">
            <button className={!showPlan ? 'selected' : undefined} onClick={() => choosePlanView(false)}>
              בפועל
            </button>
            <button className={showPlan ? 'selected' : undefined} onClick={() => choosePlanView(true)}>
              מקורי
            </button>
          </div>
        )}
        {month !== monthKey(today) && (
          <button className="link" onClick={() => goToMonth(monthKey(today))}>
            היום
          </button>
        )}
      </div>
      <RosterShare month={month} shifts={shifts.data} />

      {showPlan && (
        <p className="plan-banner small" role="status">
          מוצג <strong>הלוח המקורי</strong>, לפני חילופים ולקיחות.{' '}
          {changedInMonth === 1
            ? 'משמרת אחת החודש השתנתה מאז, ומסומנת במסגרת מקווקוות.'
            : changedInMonth > 1
              ? `${changedInMonth} משמרות החודש השתנו מאז, ומסומנות במסגרת מקווקוות.`
              : 'החודש אין משמרות שהשתנו.'}
        </p>
      )}

      {view === 'list' && (
        <div className="filters">
          {FILTERS.filter(([value]) => named || value !== 'mine').map(([value, label]) => (
            <button key={value} className={filter === value ? 'chip selected' : 'chip'} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div
        key={month}
        className={slide ? `month-body slide-${slide}` : 'month-body'}
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          touch.current = null;
          if (!start) return;
          const t = e.changedTouches[0];
          const delta = swipeMonthStep(t.clientX - start.x, t.clientY - start.y);
          if (delta !== 0) step(delta);
        }}
      >
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
            onSelect={setSelected}
          />
          <DayDetails night={selected} shifts={byNight.get(selected)} counts={counts} />
        </>
      )}

      {shifts.data && view === 'list' && (
        <RosterList month={month} today={today} byNight={byNight} filter={filter} counts={counts} />
      )}
      </div>
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
  onSelect: (night: string) => void;
}

function MonthGrid({ month, from, to, today, selected, byNight, onSelect }: GridProps) {
  const me = useMe();
  const [hebrew] = useHebrewDates();
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
        const { holiday, eve, shabbat } = dayMarks(day);
        const classes = ['day'];
        if (holiday) classes.push(holiday.major ? 'holiday major' : 'holiday');
        if (shabbat === 'shabbat') classes.push('shabbat');
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
              aria-label={[formatDate(day), nightLabel(day), hebrew ? hebrewDate(day) : '', holiday?.name ?? '', eve ?? '']
                .filter(Boolean)
                .join(', ')}
              aria-pressed={day === selected}
              title={[holiday?.name, eve].filter(Boolean).join(' · ') || undefined}
            >
              {dayOfMonth(day)}
              {hebrew && <span className="hebrew-day">{hebrewDay(day)}</span>}
              {holiday && <span className="holiday-dot" aria-hidden="true" />}
              {!holiday && eve && <span className="holiday-dot eve" aria-hidden="true" />}
            </button>
            {([1, 2] as const).map((slot) => {
              const shift = night?.[slot];
              if (!shift) return null;
              const mine = me.isMine(shift.assignee);
              const chipClasses = shiftClasses(shift, mine).replace('shift-cell', 'day-chip');
              const name = shift.assignee ?? 'פנוי';
              return (
                <button
                  key={slot}
                  className={chipClasses}
                  title={differsFromPlan(shift) ? `${name} · בפועל: ${shift.actual ?? 'פנוי'}` : name}
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
  const named = Boolean(useMe().profile.display_name);
  const [showNote, setShowNote] = useState(() => localStorage.getItem(NOTE_KEY) !== 'yes');
  const example = `${month}-05`;

  function dismiss() {
    localStorage.setItem(NOTE_KEY, 'yes');
    setShowNote(false);
  }

  return (
    <>
      <div className="legend" aria-label="מקרא">
        {named && (
          <span className="legend-item">
            <span className="day-chip mine">שם</span> שלי
          </span>
        )}
        <span className="legend-item">
          <span className="day-chip open">פנוי</span> פנויה
        </span>
        <span className="legend-item">
          <span className="day-chip swap">
            <span className="chip-glyph">⇄</span>שם
          </span>{' '}
          בקשת חילוף
        </span>
        <span className="legend-item">
          <span className="legend-holiday" aria-hidden="true" /> חג או מועד
        </span>
        <span className="legend-item">
          <span className="legend-holiday eve" aria-hidden="true" /> ערב חג
        </span>
        <span className="legend-item">
          <span className="legend-shabbat" aria-hidden="true" /> שבת
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
      <HebrewLine night={night} />
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
  const [hebrew] = useHebrewDates();
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
            {hebrew && <span className="muted small">{hebrewDate(night)}</span>}
            <HolidayTag night={night} />
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
