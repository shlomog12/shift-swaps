import { useMemo } from 'react';
import { awaitingMyDecision, nextShift } from '../lib/attention';
import { SLOT_HOURS, formatDate, hasStarted, nightLabel, nightShortLabel, startsInLabel } from '../lib/dates';
import { useMe, useRoster } from '../lib/hooks';

/** Swap requests on my shifts that have volunteers waiting for my answer. */
export function DecisionsCard() {
  const me = useMe();
  const { upcoming, pendingOffers } = useRoster();
  const decisions = useMemo(
    () => awaitingMyDecision(upcoming.data ?? [], pendingOffers.data ?? [], me.isMine),
    [upcoming.data, pendingOffers.data, me],
  );

  if (decisions.length === 0) return null;

  return (
    <section className="card attention-card">
      <h2>ממתין להחלטה שלך ({decisions.length})</h2>
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
  const openCount = useMemo(
    () => (shifts ?? []).filter((s) => !s.assignee && !hasStarted(s.night, s.slot)).length,
    [shifts],
  );

  if (!shifts) return null;

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
