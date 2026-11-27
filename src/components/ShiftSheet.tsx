import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../lib/focusTrap';
import { api } from '../lib/api';
import { SLOT_NAME, formatDate, formatDateTime, hasStarted, nightLabel, slotTime } from '../lib/dates';
import { useAction, useMe, useQuery } from '../lib/hooks';
import { loadShift, loadShiftOffers, loadShiftRequests } from '../lib/queries';
import type { ShiftKey, SwapOffer } from '../lib/types';
import { googleCalendarUrl } from '../lib/calendar';
import { appLink } from '../lib/share';
import { useFeedback, type AskOptions, type ConfirmOptions } from './Feedback';
import { CalendarIcon } from './Icons';
import { HebrewLine } from './HolidayTag';
import { NoteLine } from './NoteLine';
import { SkeletonList } from './Skeleton';
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

const NOTE_MAX = 300;

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
  const sheetRef = useRef<HTMLDivElement>(null);
  useFocusTrap(sheetRef);
  const { busy, error, run } = useAction();
  const { confirm, ask, toast, shareOffer } = useFeedback();

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
  // Decided offers and requests, newest first, as one history of the shift.
  const history = [
    ...(offers.data ?? [])
      .filter((o) => o.status !== 'pending')
      .map((o) => ({
        key: `o${o.id}`,
        at: o.decided_at ?? o.created_at,
        text: `התנדבות של ${o.volunteer} במקום ${o.requester}: ${OFFER_STATUS[o.status]}`,
      })),
    ...(requests.data ?? [])
      .filter((r) => r.status !== 'pending')
      .map((r) => ({
        key: `r${r.id}`,
        at: r.decided_at ?? r.created_at,
        text: `הצעת החלפה של ${r.requester} ל${r.owner} (${giveText(r)}): ${REQUEST_STATUS[r.status]}`,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

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

  /** Like confirmThen, with an optional note field in the dialog that is passed to the action. */
  async function askThen(
    options: AskOptions,
    action: (note: string) => Promise<unknown>,
    done: string,
    closeAfter = true,
    then?: (note: string) => void,
  ) {
    const note = await ask({ maxLength: NOTE_MAX, ...options });
    if (note !== null) act(() => action(note), done, closeAfter, then && (() => then(note)));
  }

  const when = `${formatDate(night)}, ${slotTime(night, slot)}`;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shift-sheet-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-header">
          <div>
            <h2 id="shift-sheet-title">
              {formatDate(night)} · משמרת {SLOT_NAME[slot]}
            </h2>
            <p className="muted">
              {nightLabel(night)} · {slotTime(night, slot)}
            </p>
            <HebrewLine night={night} />
          </div>
          <button className="icon" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </header>

        {shift.loading && !s && <SkeletonList rows={3} />}
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
            {s.swap_requested && s.swap_note && <NoteLine note={s.swap_note} />}

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
                    askThen(
                      {
                        title: mine ? 'לפרסם בקשת חילוף?' : `לפרסם בקשת חילוף בשם ${s.assignee}?`,
                        placeholder: 'הערה (לא חובה), למשל: אפשר להחליף ביום חמישי',
                        message: (
                          <>
                            <p>{when}</p>
                            <p className="muted">
                              הבקשה תופיע בלוח החילופים וכל אחד יוכל להתנדב. המשמרת נשארת{' '}
                              {mine ? 'שלך' : `של ${s.assignee}`} עד שמתנדב יאושר.
                            </p>
                          </>
                        ),
                        confirmLabel: 'פרסום הבקשה',
                      },
                      (note) => api.requestSwap(night, slot, note),
                      'הבקשה פורסמה בלוח החילופים',
                    )
                  }
                >
                  {mine ? 'פרסום בקשת חילוף' : `פרסום בקשת חילוף בשם ${s.assignee}`}
                </button>
              )}

              {!started && s.swap_requested && !mine && !myOffer && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    askThen(
                      {
                        title: `להתנדב לקחת את המשמרת של ${s.assignee}?`,
                        placeholder: `הערה ל${s.assignee} (לא חובה)`,
                        message: (
                          <>
                            <p>{when}</p>
                            <p className="muted">המשמרת תעבור אליך רק אחרי אישור של {s.assignee}. תישלח הודעה במייל.</p>
                          </>
                        ),
                        confirmLabel: 'התנדבות',
                      },
                      (note) => api.offerSwap(night, slot, note),
                      'ההתנדבות נשלחה. תישלח הודעה במייל כשתתקבל החלטה',
                      true,
                      (note) =>
                        shareOffer({
                          message: `נשלח מייל ל${s.assignee}. אפשר גם לשלוח הודעה בוואטסאפ עם קישור לאישור`,
                          text: volunteeredText(s, note),
                          label: `הודעה ל${s.assignee}`,
                        }),
                    )
                  }
                >
                  התנדבות לקחת את המשמרת
                </button>
              )}

              {/* A direct swap offer. With an open request, volunteering already covers "nothing in return". */}
              {!started && s.assignee && !mine && !myRequest && !asking && (
                <button
                  className={s.swap_requested ? 'link' : undefined}
                  disabled={busy}
                  onClick={() => setAsking(true)}
                >
                  {s.swap_requested ? 'או: להציע משמרת שלי בתמורה' : `הצעת החלפה ל${s.assignee}`}
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

              {s.swap_requested && canDecide && (
                <button
                  disabled={busy}
                  onClick={() =>
                    confirmThen(
                      {
                        title: 'לבטל את בקשת החילוף?',
                        message: pending.length > 0 ? 'ההתנדבויות שהתקבלו יבוטלו, ותישלח על כך הודעה במייל.' : undefined,
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

              {/* Sharing comes after the main actions. */}
              {mine && !started && (
                <a
                  className="button calendar"
                  href={googleCalendarUrl(night, slot, appLink())}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <CalendarIcon size={18} /> הוספה ליומן גוגל
                </a>
              )}
              {!started && s.swap_requested && (
                <WhatsAppButton text={swapWantedText(s, mine)} label="שיתוף הבקשה בוואטסאפ" />
              )}
              {myOffer && !started && (
                <WhatsAppButton text={volunteeredText(s, myOffer.note)} label={`הודעה ל${s.assignee} על ההתנדבות`} />
              )}
            </div>

            {asking && !myRequest && s.assignee && (
              <RequestForm
                target={target}
                owner={s.assignee}
                allowNothing={!s.swap_requested}
                onDone={() => setAsking(false)}
              />
            )}

            {myRequest && (
              <section className="my-request">
                <p>
                  שלחת ל{s.assignee} הצעת החלפה ({giveText(myRequest)}). {REQUEST_STATUS.pending}.
                </p>
                <div className="row wrap">
                  <button
                    disabled={busy}
                    onClick={() =>
                      confirmThen(
                        { title: 'לבטל את ההצעה?', confirmLabel: 'ביטול ההצעה', cancelLabel: 'השארה', danger: true },
                        () => api.withdrawSwapRequest(myRequest.id),
                        'ההצעה בוטלה',
                        false,
                      )
                    }
                  >
                    ביטול ההצעה
                  </button>
                  <WhatsAppButton text={requestSentText(myRequest)} label={`הודעה ל${s.assignee}`} />
                </div>
              </section>
            )}

            {canDecide && !started && pendingRequests.length > 0 && (
              <section>
                <h3>הצעות החלפה{mine ? ' אליך' : ''}</h3>
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
                        {o.note && <NoteLine note={o.note} className="small" />}
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
                                    message: `אפשר לעדכן את ${o.volunteer} בוואטסאפ`,
                                    text: offerDecisionText(s, o.volunteer, true),
                                    label: `עדכון ל${o.volunteer}`,
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
                                    message: `אפשר לעדכן את ${o.volunteer} בוואטסאפ`,
                                    text: offerDecisionText(s, o.volunteer, false),
                                    label: `עדכון ל${o.volunteer}`,
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

            {history.length > 0 && (
              <details>
                <summary className="muted small">היסטוריית המשמרת ({history.length})</summary>
                <ul className="offers past-offers">
                  {history.map((h) => (
                    <li key={h.key} className="small">
                      {h.text} <span className="muted">· {formatDateTime(h.at)}</span>
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
