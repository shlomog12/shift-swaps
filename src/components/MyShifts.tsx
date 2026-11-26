import { formatDate, hasStarted, nightShortLabel, slotTime } from '../lib/dates';
import { useMe, useQuery } from '../lib/hooks';
import { loadMyOffers, loadUpcomingShifts } from '../lib/queries';
import type { SwapOffer } from '../lib/types';
import { ShiftListItem } from './Board';

const STATUS_TEXT: Record<SwapOffer['status'], string> = {
  pending: 'ממתין לאישור',
  accepted: 'אושר – המשמרת שלך',
  declined: 'לא אושר',
  cancelled: 'בוטל',
};

export function MyShifts() {
  const me = useMe();
  const shifts = useQuery(loadUpcomingShifts, []);
  const offers = useQuery(() => loadMyOffers(me.profile.id), [me.profile.id]);

  const mine = (shifts.data ?? []).filter((s) => me.isMine(s.assignee) && !hasStarted(s.night, s.slot));

  return (
    <div className="page">
      <h2>המשמרות הקרובות שלי</h2>
      {shifts.error && <p className="error">{shifts.error}</p>}
      {shifts.loading && !shifts.data && <p className="muted">טוען...</p>}
      {shifts.data && mine.length === 0 && <p className="empty">אין לך משמרות קרובות.</p>}
      <ul className="list">
        {mine.map((s) => (
          <ShiftListItem key={`${s.night}/${s.slot}`} shift={s} note={s.swap_requested ? 'מבקש/ת חילוף' : undefined} />
        ))}
      </ul>

      <h2>ההתנדבויות שלי</h2>
      {offers.data && offers.data.length === 0 && <p className="empty">עוד לא התנדבת לחילוף.</p>}
      <ul className="list">
        {(offers.data ?? []).map((o) => (
          <li key={o.id}>
            <button className="list-item" onClick={() => me.openShift(o.night, o.slot)}>
              <span className="list-main">
                <strong>
                  {formatDate(o.night)} · {slotTime(o.night, o.slot)}
                </strong>
                <span className="muted small">
                  {nightShortLabel(o.night)} · במקום {o.requester}
                </span>
              </span>
              <span className={`list-side status-${o.status}`}>{STATUS_TEXT[o.status]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
