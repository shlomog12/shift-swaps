import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { SLOT_NAME, formatDate, formatDateTime, hasStarted, nightLabel, slotTime } from '../lib/dates';
import { useAction, useMe, useQuery } from '../lib/hooks';
import { loadShift, loadShiftOffers, loadShiftRequests } from '../lib/queries';
import type { ShiftKey, SwapOffer } from '../lib/types';
import { useFeedback, type ConfirmOptions } from './Feedback';
import {
  IncomingRequest,
  REQUEST_STATUS,
  RequestForm,
  WhatsAppButton,
  giveText,
  offerDecisionText,
  requestSentText,
  swapWantedText,
  volunteeredText,
} from './SwapRequests';
import { useShareOffer } from './ShareDialog';

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
  const { confirm, toast } = useFeedback();
  const shareOffer = useShareOffer();

  // Escape closes the sheet (an open confirmation dialog handles Escape itself first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  /** Runs an action, then shows `done`, optionally closes the sheet and runs `then`. */
  function act(action: () => Promise<unknown>, done: string, closeAfter = true, then?: () => void) {
    run(action, () => {
      toast(done);
      if (closeAfter) onClose();
      then?.();
    });
  }

  async function confirmThen(
    options: ConfirmOptions,
    action: () => Promise<unknown>,
    done: string,
    closeAfter = true,
    then?: () => void,
  ) {
    if (await confirm(options)) act(action, done, closeAfter, then);
  }

  const when = `${formatDate(night)}, ${slotTime(night, slot)}`;

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
              {s.swap_requested && <span className="tag swap">בקשת חילוף פתוחה</span>}
              {started && <span className="tag">עברה</span>}
            </div>

            <div className="actions">
              {!started && !s.assignee && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    confirmThen(
                      { title: 'לקחת את המשמרת?', message: when, confirmLabel: 'כן, המשמרת שלי' },
                      () => api.takeShift(night, slot),
                      'המשמרת נרשמה על שמך',
                    )
                  }
                >
                  לקחת את המשמרת
                </button>
              )}

              {!started && s.assignee && canDecide && !s.swap_requested && (
                <button
                  className="warn"
                  disabled={busy}
                  onClick={() =>
                    confirmThen(
                      {
                        title: mine ? 'לפרסם בקשת חילוף?' : `לפרסם בקשת חילוף בשם ${s.assignee}?`,
                        message: (
                          <>
                            <p>{when}</p>
                            <p className="muted">
                              הבקשה תופיע בלוח החילופים. המשמרת נשארת {mine ? 'שלך' : `של ${s.assignee}`} עד שמתנדב
                              יאושר.
                            </p>
                          </>
                        ),
                        confirmLabel: 'פרסום הבקשה',
                      },
                      () => api.requestSwap(night, slot),
                      'הבקשה פורסמה בלוח החילופים',
                    )
                  }
                >
                  {mine ? 'בקשת חילוף' : `בקשת חילוף בשם ${s.assignee}`}
                </button>
              )}

              {s.swap_requested && canDecide && (
                <button
                  disabled={busy}
                  onClick={() =>
                    confirmThen(
                      {
                        title: 'לבטל את בקשת החילוף?',
                        message: pending.length > 0 ? 'ההתנדבויות שהתקבלו יבוטלו, והמתנדבים יקבלו על כך מייל.' : undefined,
                        confirmLabel: 'ביטול הבקשה',
                        cancelLabel: 'השארת הבקשה',
                        danger: true,
                      },
                      () => api.cancelSwapRequest(night, slot),
                      'בקשת החילוף בוטלה',
                    )
                  }
                >
                  ביטול בקשת החילוף
                </button>
              )}

              {!started && s.swap_requested && <WhatsAppButton text={swapWantedText(s, mine)} />}

              {!started && s.swap_requested && !mine && !myOffer && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    confirmThen(
                      {
                        title: `להתנדב לקחת את המשמרת של ${s.assignee}?`,
                        message: (
                          <>
                            <p>{when}</p>
                            <p className="muted">המשמרת תעבור אליך רק אחרי אישור של {s.assignee}. תישלח הודעה במייל.</p>
                          </>
                        ),
                        confirmLabel: 'התנדבות',
                      },
                      () => api.offerSwap(night, slot),
                      'ההתנדבות נשלחה. תישלח הודעה במייל כשתתקבל החלטה',
                      true,
                      () =>
                        shareOffer({
                          title: 'ההתנדבות נשלחה',
                          message: `${s.assignee} יקבלו מייל. כדי שיראו מהר יותר, אפשר לשלוח גם הודעה בוואטסאפ עם קישור לאישור.`,
                          text: volunteeredText(s),
                          label: `הודעה ל${s.assignee} בוואטסאפ`,
                        }),
                    )
                  }
                >
                  התנדבות לקחת את המשמרת
                </button>
              )}

              {myOffer && (
                <button
                  disabled={busy}
                  onClick={() =>
                    confirmThen(
                      { title: 'לבטל את ההתנדבות?', confirmLabel: 'ביטול ההתנדבות', cancelLabel: 'השארה', danger: true },
                      () => api.withdrawOffer(myOffer.id),
                      'ההתנדבות בוטלה',
                    )
                  }
                >
                  ביטול ההתנדבות שלי
                </button>
              )}

              {myOffer && !started && (
                <WhatsAppButton text={volunteeredText(s)} label={`הודעה ל${s.assignee} על ההתנדבות בוואטסאפ`} />
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
                <div className="row wrap">
                  <WhatsAppButton text={requestSentText(myRequest)} label={`שליחה ל${s.assignee} בוואטסאפ`} />
                  <button
                    disabled={busy}
                    onClick={() =>
                      confirmThen(
                        { title: 'לבטל את הבקשה?', confirmLabel: 'ביטול הבקשה', cancelLabel: 'השארה', danger: true },
                        () => api.withdrawSwapRequest(myRequest.id),
                        'הבקשה בוטלה',
                        false,
                      )
                    }
                  >
                    ביטול הבקשה שלי
                  </button>
                </div>
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
                              confirmThen(
                                {
                                  title: `למסור את המשמרת ל${o.volunteer}?`,
                                  message: (
                                    <>
                                      <p>{when}</p>
                                      <p className="muted">
                                        המשמרת תעבור ל{o.volunteer}, ושאר ההתנדבויות יבוטלו.
                                      </p>
                                    </>
                                  ),
                                  confirmLabel: 'מסירת המשמרת',
                                },
                                () => api.acceptOffer(o.id),
                                `המשמרת נמסרה ל${o.volunteer}`,
                                true,
                                () =>
                                  shareOffer({
                                    title: `המשמרת נמסרה ל${o.volunteer}`,
                                    message: `אפשר לעדכן את ${o.volunteer} בוואטסאפ.`,
                                    text: offerDecisionText(s, o.volunteer, true),
                                    label: `עדכון ל${o.volunteer} בוואטסאפ`,
                                  }),
                              )
                            }
                          >
                            אישור
                          </button>
                          <button
                            className="small"
                            disabled={busy}
                            onClick={() =>
                              confirmThen(
                                { title: `לדחות את ההתנדבות של ${o.volunteer}?`, confirmLabel: 'דחייה', danger: true },
                                () => api.declineOffer(o.id),
                                'ההתנדבות נדחתה',
                                false,
                                () =>
                                  shareOffer({
                                    title: 'ההתנדבות נדחתה',
                                    message: `אפשר לעדכן את ${o.volunteer} בוואטסאפ.`,
                                    text: offerDecisionText(s, o.volunteer, false),
                                    label: `עדכון ל${o.volunteer} בוואטסאפ`,
                                  }),
                              )
                            }
                          >
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
  const { confirm, toast } = useFeedback();

  return (
    <section className="admin-box">
      <h3>עריכת מנהל</h3>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => api.adminSetAssignee(night, slot, name.trim() || null),
            () => toast(name.trim() ? `המשמרת שובצה ל${name.trim()}` : 'המשמרת פונתה'),
          );
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
          onClick={async () => {
            const ok = await confirm({
              title: 'לפנות את המשמרת?',
              message: `המשמרת של ${current} תסומן כפנויה.`,
              confirmLabel: 'פינוי',
              danger: true,
            });
            if (ok) run(() => api.adminSetAssignee(night, slot, null), () => toast('המשמרת פונתה'));
          }}
        >
          פינוי המשמרת
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
