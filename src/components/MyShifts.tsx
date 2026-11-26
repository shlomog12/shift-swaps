import { formatDate, hasStarted, nightShortLabel, slotTime } from '../lib/dates';
import { useAction, useMe, useQuery, useRoster } from '../lib/hooks';
import { api } from '../lib/api';
import { loadMyOffers, loadSentRequests } from '../lib/queries';
import type { SwapOffer } from '../lib/types';
import { ShiftListItem } from './Board';
import { useFeedback } from './Feedback';
import { DecisionsCard } from './Summary';
import { REQUEST_STATUS, giveText, shiftText } from './SwapRequests';

const STATUS_TEXT: Record<SwapOffer['status'], string> = {
  pending: 'ממתין לאישור',
  accepted: 'אושר – המשמרת שלך',
  declined: 'לא אושר',
  cancelled: 'בוטל',
};

export function MyShifts() {
  const me = useMe();
  const shifts = useRoster().upcoming;
  const offers = useQuery(() => loadMyOffers(me.profile.id), [me.profile.id]);
  const sent = useQuery(() => loadSentRequests(me.profile.id), [me.profile.id]);
  const { busy, error, run } = useAction();
  const { confirm, toast } = useFeedback();

  const mine = (shifts.data ?? []).filter((s) => me.isMine(s.assignee) && !hasStarted(s.night, s.slot));

  async function withdraw(requestId: number) {
    const ok = await confirm({ title: 'לבטל את הבקשה?', confirmLabel: 'ביטול הבקשה', cancelLabel: 'השארה', danger: true });
    if (ok) run(() => api.withdrawSwapRequest(requestId), () => toast('הבקשה בוטלה'));
  }

  return (
    <div className="page">
      <DecisionsCard />
      <h2>המשמרות הקרובות שלי</h2>
      {shifts.error && <p className="error">{shifts.error}</p>}
      {shifts.loading && !shifts.data && <p className="muted">טוען...</p>}
      {shifts.data && mine.length === 0 && <p className="empty">אין לך משמרות קרובות.</p>}
      <ul className="list">
        {mine.map((s) => (
          <ShiftListItem key={`${s.night}/${s.slot}`} shift={s} note={s.swap_requested ? 'בקשת חילוף פתוחה' : undefined} />
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

      <h2>בקשות חילוף ששלחתי</h2>
      {sent.data && sent.data.length === 0 && (
        <p className="empty">עוד לא שלחת בקשות. אפשר לבקש חילוף בלחיצה על משמרת של מישהו אחר.</p>
      )}
      <ul className="list">
        {(sent.data ?? []).map((r) => (
          <li key={r.id}>
            <button className="list-item" onClick={() => me.openShift(r.night, r.slot)}>
              <span className="list-main">
                <strong>{shiftText(r.night, r.slot)}</strong>
                <span className="muted small">
                  מ{r.owner} · {giveText(r)}
                </span>
              </span>
              <span className={`list-side status-${r.status}`}>{REQUEST_STATUS[r.status]}</span>
            </button>
            {r.status === 'pending' && (
              <button className="link small" disabled={busy} onClick={() => withdraw(r.id)}>
                ביטול הבקשה
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
