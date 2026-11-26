import { useMemo } from 'react';
import { formatDate, hasStarted, nightLabel, plural, slotTime } from '../lib/dates';
import { useMe, useRoster } from '../lib/hooks';
import type { Shift } from '../lib/types';
import { offerCounts } from './Calendar';
import { WhatsAppButton, openSwapsText } from './SwapRequests';

export function ShiftListItem({ shift, note }: { shift: Shift; note?: string }) {
  const me = useMe();
  const mine = me.isMine(shift.assignee);
  return (
    <li>
      <button className={`list-item${shift.swap_requested ? ' swap' : ''}${mine ? ' mine' : ''}`} onClick={() => me.openShift(shift.night, shift.slot)}>
        <span className="list-main">
          <strong>
            {formatDate(shift.night)} · {slotTime(shift.night, shift.slot)}
          </strong>
          <span className="muted small">{nightLabel(shift.night)}</span>
        </span>
        <span className="list-side">
          <span>{shift.assignee ?? 'פנוי'}</span>
          {note && <span className="small muted">{note}</span>}
        </span>
      </button>
    </li>
  );
}

export function Board() {
  const me = useMe();
  const { upcoming: shifts, pendingOffers: offers } = useRoster();
  const counts = useMemo(() => offerCounts(offers.data), [offers.data]);

  const upcoming = (shifts.data ?? []).filter((s) => !hasStarted(s.night, s.slot));
  const swaps = upcoming.filter((s) => s.swap_requested);
  const open = upcoming.filter((s) => !s.assignee);
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
      {shifts.loading && !shifts.data && <p className="muted">טוען...</p>}
      {shifts.data && swaps.length === 0 && <p className="empty">אין כרגע בקשות חילוף.</p>}
      {swaps.length > 0 && (
        <WhatsAppButton
          className="small share-all"
          text={openSwapsText(swaps)}
          label={swaps.length === 1 ? 'שיתוף הבקשה בוואטסאפ' : `שיתוף כל ${swaps.length} הבקשות בוואטסאפ`}
        />
      )}
      <ul className="list">
        {swaps.map((s) => (
          <ShiftListItem key={`${s.night}/${s.slot}`} shift={s} note={swapNote(s)} />
        ))}
      </ul>

      <h2>משמרות פנויות</h2>
      {shifts.data && open.length === 0 && <p className="empty">אין משמרות פנויות.</p>}
      <ul className="list">
        {open.map((s) => (
          <ShiftListItem key={`${s.night}/${s.slot}`} shift={s} />
        ))}
      </ul>
    </div>
  );
}
