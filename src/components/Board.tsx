import { useMemo, useState, type ReactNode } from 'react';
import {
  addDays,
  formatDate,
  hasStarted,
  israelToday,
  nightLabel,
  plural,
  slotTime,
  urgencyLabel,
  weekLabel,
  weekStart,
} from '../lib/dates';
import { useMe, useRoster } from '../lib/hooks';
import type { Shift } from '../lib/types';
import { offerCounts } from './Calendar';
import { HebrewLine } from './HolidayTag';
import { NoteIcon } from './Icons';
import { WhatsAppButton, openSwapsText } from './SwapRequests';
import { SkeletonList } from './Skeleton';

export function ShiftListItem({ shift, note }: { shift: Shift; note?: string }) {
  const me = useMe();
  const mine = me.isMine(shift.assignee);
  const urgent = hasStarted(shift.night, shift.slot) ? null : urgencyLabel(shift.night, shift.slot);
  return (
    <li>
      <button
        className={`list-item${shift.swap_requested ? ' swap' : ''}${mine ? ' mine' : ''}`}
        onClick={() => me.openShift(shift.night, shift.slot)}
      >
        <span className="list-main">
          <strong>
            {formatDate(shift.night)} · {slotTime(shift.night, shift.slot)}
          </strong>
          <span className="muted small">{nightLabel(shift.night)}</span>
          <HebrewLine night={shift.night} />
          {shift.swap_requested && shift.swap_note && (
            <span className="small list-note">
              <NoteIcon size={14} /> {shift.swap_note}
            </span>
          )}
        </span>
        <span className="list-side">
          {urgent && <span className="tag urgent">{urgent}</span>}
          <span>{shift.assignee ?? 'פנוי'}</span>
          {note && <span className="small muted">{note}</span>}
        </span>
      </button>
    </li>
  );
}

/** Lists shifts under a heading per week ("השבוע", "שבוע הבא", …). Expects shifts sorted by night. */
export function ByWeek({ shifts, render }: { shifts: Shift[]; render: (s: Shift) => ReactNode }) {
  const today = israelToday();
  const weeks = new Map<string, Shift[]>();
  for (const s of shifts) {
    const start = weekStart(s.night);
    weeks.set(start, [...(weeks.get(start) ?? []), s]);
  }
  return (
    <>
      {[...weeks].map(([start, list]) => (
        <section key={start} className="week-group">
          <h3 className="week-heading">
            {weekLabel(start, today)} <span className="muted small">({list.length})</span>
          </h3>
          <ul className="list">{list.map(render)}</ul>
        </section>
      ))}
    </>
  );
}

/** Open shifts beyond this many weeks are behind "show more". */
const OPEN_WEEKS = 3;

export function Board() {
  const me = useMe();
  const { upcoming: shifts, pendingOffers: offers } = useRoster();
  const counts = useMemo(() => offerCounts(offers.data), [offers.data]);
  const [showAllOpen, setShowAllOpen] = useState(false);

  const upcoming = (shifts.data ?? []).filter((s) => !hasStarted(s.night, s.slot));
  const swaps = upcoming.filter((s) => s.swap_requested);
  const open = upcoming.filter((s) => !s.assignee);
  const cutoff = addDays(weekStart(israelToday()), OPEN_WEEKS * 7);
  const openVisible = showAllOpen ? open : open.filter((s) => s.night < cutoff);
  const openHidden = open.length - openVisible.length;
  const myOfferKeys = new Set(
    (offers.data ?? []).filter((o) => o.volunteer_id === me.profile.id).map((o) => `${o.night}/${o.slot}`),
  );

  function swapNote(s: Shift) {
    const key = `${s.night}/${s.slot}`;
    if (myOfferKeys.has(key)) return 'התנדבת – ממתין לאישור';
    const count = counts.get(key) ?? 0;
    return count === 0 ? 'אין עדיין מתנדבים' : plural(count, 'מתנדב אחד', 'מתנדבים');
  }

  return (
    <div className="page">
      <h2>בקשות חילוף</h2>
      {shifts.error && <p className="error">{shifts.error}</p>}
      {shifts.loading && !shifts.data && <SkeletonList rows={4} tall />}
      {shifts.data && swaps.length === 0 && <p className="empty">אין כרגע בקשות חילוף.</p>}
      {swaps.length > 0 && (
        <WhatsAppButton
          className="small share-all"
          text={openSwapsText(swaps)}
          label={swaps.length === 1 ? 'שיתוף הבקשה בוואטסאפ' : `שיתוף כל ${swaps.length} הבקשות בוואטסאפ`}
        />
      )}
      <ByWeek
        shifts={swaps}
        render={(s) => <ShiftListItem key={`${s.night}/${s.slot}`} shift={s} note={swapNote(s)} />}
      />

      <h2>משמרות פנויות</h2>
      {shifts.data && open.length === 0 && <p className="empty">אין משמרות פנויות.</p>}
      <ByWeek shifts={openVisible} render={(s) => <ShiftListItem key={`${s.night}/${s.slot}`} shift={s} />} />
      {openHidden > 0 && (
        <button className="link center" onClick={() => setShowAllOpen(true)}>
          {openHidden === 1 ? 'הצגת עוד משמרת פנויה אחת' : `הצגת עוד ${openHidden} משמרות פנויות`}
        </button>
      )}
    </div>
  );
}
