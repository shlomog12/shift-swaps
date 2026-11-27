import { useMemo } from 'react';
import { awaitingMyDecision, incomingForMe, nextShift } from '../lib/attention';
import { SLOT_HOURS, formatDate, hasStarted, nightLabel, nightShortLabel, startsInLabel } from '../lib/dates';
import { useMe, useRoster } from '../lib/hooks';
import { IncomingRequest } from './SwapRequests';

/** Swap requests on my shifts that have volunteers waiting for my answer. */
export function DecisionsCard() {
  const me = useMe();
  const { upcoming, pendingOffers, incoming } = useRoster();
  const decisions = useMemo(
    () => awaitingMyDecision(upcoming.data ?? [], pendingOffers.data ?? [], me.isMine),
    [upcoming.data, pendingOffers.data, me],
  );
  const requests = useMemo(
    () => incomingForMe(upcoming.data ?? [], incoming.data ?? [], me.isMine),
    [upcoming.data, incoming.data, me],
  );
  const total = decisions.length + requests.length;

  if (total === 0) return null;

  return (
    <section className="card attention-card">
      <h2>ממתין להחלטה שלך ({total})</h2>
      {requests.length > 0 && (
        <>
          <h3>הצעות החלפה אליך</h3>
          <ul className="offers">
            {requests.map((r) => (
              <IncomingRequest key={r.id} request={r} showShift />
            ))}
          </ul>
        </>
      )}
      {decisions.length > 0 && requests.length > 0 && <h3>מתנדבים לבקשות שלך</h3>}
      <ul className="list">
        {decisions.map(({ shift, volunteers }) => (
          <li key={`${shift.night}/${shift.slot}`}>
            <button className="list-item swap" onClick={() => me.openShift(shift.night, shift.slot)}>
              <span className="list-main">
                <strong>
                  {formatDate(shift.night)} · {SLOT_HOURS[shift.slot]}
                </strong>
                <span className="muted small">{nightShortLabel(shift.night)}</span>
                <span className="small">מתנדבים: {volunteers.join(', ')}</span>
              </span>
              <span className="list-side small nowrap">בחירה ›</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The signed-in user's next shift, at the top of the opening screen. */
export function NextShiftCard() {
  const me = useMe();
  const { upcoming } = useRoster();
  const shifts = upcoming.data;
  const next = useMemo(() => (shifts ? nextShift(shifts, me.isMine) : undefined), [shifts, me]);
  const named = Boolean(me.profile.display_name);
  const openCount = useMemo(
    () => (shifts ?? []).filter((s) => !s.assignee && !hasStarted(s.night, s.slot)).length,
    [shifts],
  );

  if (!shifts || !named) return null;

  if (!next) {
    return (
      <section className="card next-shift empty-next">
        <span className="muted">אין לך משמרות קרובות.</span>
        {openCount > 0 && <span className="small"> יש {openCount} משמרות פנויות בלשונית החילופים.</span>}
      </section>
    );
  }

  return (
    <button className="card next-shift" onClick={() => me.openShift(next.night, next.slot)}>
      <span className="next-label muted small">המשמרת הבאה שלך</span>
      <span className="next-when">{startsInLabel(next.night, next.slot)}</span>
      <span>
        {formatDate(next.night)} · {SLOT_HOURS[next.slot]}
      </span>
      <span className="muted small">{nightLabel(next.night)}</span>
      {next.swap_requested && <span className="tag swap">בקשת חילוף פתוחה</span>}
    </button>
  );
}
