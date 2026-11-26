import { useState } from 'react';
import { api } from '../lib/api';
import { SLOT_NAME, formatDate, formatDateTime, hasStarted, nightLabel, slotTime } from '../lib/dates';
import { useAction, useMe, useQuery } from '../lib/hooks';
import { loadShift, loadShiftOffers, loadShiftRequests } from '../lib/queries';
import type { ShiftKey, SwapOffer } from '../lib/types';
import { IncomingRequest, REQUEST_STATUS, RequestForm, giveText } from './SwapRequests';

const OFFER_STATUS: Record<SwapOffer['status'], string> = {
  pending: 'ממתין לאישור',
  accepted: 'אושר',
  declined: 'לא אושר',
  cancelled: 'בוטל',
};

export function ShiftSheet({ target, onClose }: { target: ShiftKey; onClose: () => void }) {
  const me = useMe();
  const { night, slot } = target;
  const shift = useQuery(() => loadShift(night, slot), [night, slot]);
  const offers = useQuery(() => loadShiftOffers(night, slot), [night, slot]);
  const requests = useQuery(() => loadShiftRequests(night, slot), [night, slot]);
  const [asking, setAsking] = useState(false);
  const { busy, error, run } = useAction();

  const s = shift.data;
  const started = hasStarted(night, slot);
  const mine = s ? me.isMine(s.assignee) : false;
  const isAdmin = me.profile.is_admin;
  const pending = (offers.data ?? []).filter((o) => o.status === 'pending');
  const myOffer = pending.find((o) => o.volunteer_id === me.profile.id);
  const canDecide = mine || isAdmin;
  const pendingRequests = (requests.data ?? []).filter((r) => r.status === 'pending' && r.owner === s?.assignee);
  const myRequest = pendingRequests.find((r) => r.requester_id === me.profile.id);
  const pastRequests = (requests.data ?? []).filter((r) => r.status !== 'pending');

  function confirmThen(message: string, action: () => Promise<unknown>) {
    if (window.confirm(message)) run(action);
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-header">
          <div>
            <h2>
              {formatDate(night)} · משמרת {SLOT_NAME[slot]}
            </h2>
            <p className="muted">
              {nightLabel(night)} · {slotTime(night, slot)}
            </p>
          </div>
          <button className="icon" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </header>

        {shift.loading && !s && <p className="muted">טוען...</p>}
        {shift.error && <p className="error">{shift.error}</p>}
        {!shift.loading && !s && !shift.error && <p>המשמרת לא קיימת (אולי נמחקה).</p>}

        {s && (
          <>
            <div className="sheet-status">
              <span className="big-name">{s.assignee ?? 'פנוי'}</span>
              {mine && <span className="tag mine">שלך</span>}
              {s.swap_requested && <span className="tag swap">מבקש חילוף</span>}
              {started && <span className="tag">עברה</span>}
            </div>

            <div className="actions">
              {!started && !s.assignee && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => confirmThen('לקחת את המשמרת?', () => api.takeShift(night, slot))}
                >
                  אני לוקח/ת את המשמרת
                </button>
              )}

              {!started && s.assignee && canDecide && !s.swap_requested && (
                <button className="warn" disabled={busy} onClick={() => run(() => api.requestSwap(night, slot))}>
                  {mine ? 'אני מבקש/ת חילוף' : `סמן ש${s.assignee} מבקש/ת חילוף`}
                </button>
              )}

              {s.swap_requested && canDecide && (
                <button
                  disabled={busy}
                  onClick={() =>
                    confirmThen('לבטל את בקשת החילוף? ההתנדבויות יבוטלו.', () => api.cancelSwapRequest(night, slot))
                  }
                >
                  ביטול בקשת החילוף
                </button>
              )}

              {!started && s.swap_requested && !mine && !myOffer && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    confirmThen(`להתנדב לקחת את המשמרת של ${s.assignee}?`, () => api.offerSwap(night, slot))
                  }
                >
                  אני מתנדב/ת לקחת את המשמרת
                </button>
              )}

              {myOffer && (
                <button disabled={busy} onClick={() => run(() => api.withdrawOffer(myOffer.id))}>
                  ביטול ההתנדבות שלי
                </button>
              )}

              {!started && s.assignee && !mine && !myRequest && !asking && (
                <button disabled={busy} onClick={() => setAsking(true)}>
                  בקשת חילוף מ{s.assignee}
                </button>
              )}
            </div>

            {asking && !myRequest && s.assignee && (
              <RequestForm target={target} owner={s.assignee} onDone={() => setAsking(false)} />
            )}

            {myRequest && (
              <section className="my-request">
                <p>
                  שלחת ל{s.assignee} בקשת חילוף ({giveText(myRequest)}). {REQUEST_STATUS.pending}.
                </p>
                <button disabled={busy} onClick={() => run(() => api.withdrawSwapRequest(myRequest.id))}>
                  ביטול הבקשה שלי
                </button>
              </section>
            )}

            {canDecide && !started && pendingRequests.length > 0 && (
              <section>
                <h3>בקשות חילוף{mine ? ' אליך' : ''}</h3>
                <ul className="offers">
                  {pendingRequests.map((r) => (
                    <IncomingRequest key={r.id} request={r} />
                  ))}
                </ul>
              </section>
            )}

            {s.swap_requested && (
              <section>
                <h3>מתנדבים</h3>
                {pending.length === 0 && <p className="muted">עדיין אין מתנדבים. הבקשה מופיעה בלוח החילופים.</p>}
                <ul className="offers">
                  {pending.map((o) => (
                    <li key={o.id}>
                      <span>
                        <strong>{o.volunteer}</strong>
                        <span className="muted small"> · {formatDateTime(o.created_at)}</span>
                      </span>
                      {canDecide && !started && (
                        <span className="row">
                          <button
                            className="primary small"
                            disabled={busy}
                            onClick={() =>
                              confirmThen(`למסור את המשמרת ל${o.volunteer}?`, () => api.acceptOffer(o.id))
                            }
                          >
                            אישור
                          </button>
                          <button className="small" disabled={busy} onClick={() => run(() => api.declineOffer(o.id))}>
                            דחייה
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(offers.data ?? []).some((o) => o.status !== 'pending') && (
              <details>
                <summary className="muted small">התנדבויות קודמות</summary>
                <ul className="offers past-offers">
                  {(offers.data ?? [])
                    .filter((o) => o.status !== 'pending')
                    .map((o) => (
                      <li key={o.id} className="small">
                        {o.volunteer} → {o.requester}: {OFFER_STATUS[o.status]}
                      </li>
                    ))}
                </ul>
              </details>
            )}

            {pastRequests.length > 0 && (
              <details>
                <summary className="muted small">בקשות חילוף קודמות</summary>
                <ul className="offers past-offers">
                  {pastRequests.map((r) => (
                    <li key={r.id} className="small">
                      {r.requester} → {r.owner} ({giveText(r)}): {REQUEST_STATUS[r.status]}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {isAdmin && <AdminAssign key={s.assignee ?? ''} night={night} slot={slot} current={s.assignee} />}
          </>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function AdminAssign({ night, slot, current }: ShiftKey & { current: string | null }) {
  const [name, setName] = useState(current ?? '');
  const names = useQuery(api.rosterNames, []);
  const { busy, error, run } = useAction();

  return (
    <section className="admin-box">
      <h3>עריכת מנהל</h3>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => api.adminSetAssignee(night, slot, name.trim() || null));
        }}
      >
        <input list="roster-names" value={name} placeholder="שם (ריק = פנוי)" onChange={(e) => setName(e.target.value)} />
        <datalist id="roster-names">
          {(names.data ?? []).map((n) => (
            <option key={n.name} value={n.name} />
          ))}
        </datalist>
        <button className="primary" disabled={busy || name.trim() === (current ?? '')}>
          שמירה
        </button>
      </form>
      {current && (
        <button
          className="link danger"
          disabled={busy}
          onClick={() => window.confirm('לפנות את המשמרת?') && run(() => api.adminSetAssignee(night, slot, null))}
        >
          פינוי המשמרת
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
