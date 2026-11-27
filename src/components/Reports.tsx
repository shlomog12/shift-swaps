import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { israelToday, monthBounds, monthKey, monthTitle, shiftMonth } from '../lib/dates';
import { fairnessReport, openSoon } from '../lib/fairness';
import { asPlanned } from '../lib/plan';
import { useMe, useQuery, useRoster } from '../lib/hooks';
import { loadShifts } from '../lib/queries';
import { shiftLink } from '../lib/share';
import type { Shift } from '../lib/types';
import { ShiftListItem } from './Board';
import { SkeletonList } from './Skeleton';
import { WhatsAppButton, shiftText } from './SwapRequests';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons';

const ALERT_DAYS = 7;
const ALERT_SHOWN = 5;

/** For a group: open shifts, each with a link to take it. */
export function openShiftsText(shifts: Shift[]): string {
  const lines = shifts.map((s) => `• ${shiftText(s.night, s.slot)}\n  ${shiftLink(s.night, s.slot)}`);
  return `יש משמרות פנויות בשבוע הקרוב. מי שיכול, אפשר לקחת בקישור:\n\n${lines.join('\n')}`;
}

/** Shown at the top of the admin screen when shifts in the coming week have nobody. */
export function OpenSoonAlert() {
  const { upcoming } = useRoster();
  const open = useMemo(() => openSoon(upcoming.data ?? [], israelToday(), ALERT_DAYS), [upcoming.data]);
  const [all, setAll] = useState(false);
  if (open.length === 0) return null;
  const shown = all ? open : open.slice(0, ALERT_SHOWN);

  return (
    <section className="card attention-card" role="status">
      <h2>
        {open.length === 1 ? 'משמרת פנויה אחת' : `${open.length} משמרות פנויות`} בשבוע הקרוב
      </h2>
      <ul className="list">
        {shown.map((s) => (
          <ShiftListItem key={`${s.night}/${s.slot}`} shift={s} />
        ))}
      </ul>
      {open.length > shown.length && (
        <button className="link small" onClick={() => setAll(true)}>
          הצגת עוד {open.length - shown.length}
        </button>
      )}
      <WhatsAppButton className="small share-all" text={openShiftsText(open)} label="שיתוף המשמרות הפנויות בוואטסאפ" />
    </section>
  );
}

/** Shifts per person in a month, as bars with the average marked, so uneven loads stand out. */
export function ReportsPanel() {
  const me = useMe();
  const [month, setMonth] = useState(monthKey(israelToday()));
  const { from, to } = monthBounds(month);
  const shifts = useQuery(() => loadShifts(from, to), [from, to]);
  const names = useQuery(api.rosterNames, []);
  // "Actual" counts who does the shifts now; "original" counts the roster as the admin planned it.
  const [byPlan, setByPlan] = useState(false);
  const canPlan = (shifts.data ?? []).some((s) => 'planned_assignee' in s);
  const counted = useMemo(
    () => (byPlan && canPlan ? (shifts.data ?? []).map(asPlanned) : shifts.data ?? []),
    [shifts.data, byPlan, canPlan],
  );
  const report = useMemo(
    () => fairnessReport(counted, (names.data ?? []).filter((n) => n.claimed).map((n) => n.name)),
    [counted, names.data],
  );
  const max = Math.max(1, ...report.rows.map((r) => r.total));
  const spread = Math.max(2, report.average * 0.5);
  const avgPct = (report.average / max) * 100;

  return (
    <section className="card">
      <div className="month-nav">
        <button className="icon" aria-label="החודש הקודם" onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronRightIcon />
        </button>
        <h2>משמרות לכל אחד · {monthTitle(month)}</h2>
        <button className="icon" aria-label="החודש הבא" onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronLeftIcon />
        </button>
      </div>
      {canPlan && (
        <div className="report-toggle">
          <div className="segmented" role="group" aria-label="לפי איזה לוח">
            <button className={!byPlan ? 'selected' : undefined} onClick={() => setByPlan(false)}>
              בפועל
            </button>
            <button className={byPlan ? 'selected' : undefined} onClick={() => setByPlan(true)}>
              לפי המקור
            </button>
          </div>
        </div>
      )}
      {shifts.error && <p className="error">{shifts.error}</p>}
      {shifts.loading && !shifts.data && <SkeletonList rows={5} />}
      {shifts.data && report.rows.length === 0 && <p className="empty">אין משמרות בחודש הזה.</p>}
      {shifts.data && report.rows.length > 0 && (
        <>
          <p className="small muted">
            ממוצע: <strong className="report-strong">{report.average.toFixed(1)}</strong> משמרות לאדם (הקו המקווקו).
            {report.open === 1 && ' משמרת אחת בחודש עדיין פנויה.'}
            {report.open > 1 && ` ${report.open} משמרות בחודש עדיין פנויות.`} כולל את כל מי שבחר שם באפליקציה, גם
            בלי משמרות החודש.
          </p>
          <ul className="report" aria-label={`משמרות לכל אחד ב${monthTitle(month)}`}>
            {report.rows.map((r) => {
              const flag =
                r.total >= report.average + spread ? 'הרבה' : r.total <= report.average - spread ? 'מעט' : null;
              const mine = me.isMine(r.name);
              return (
                <li key={r.name} title={`${r.name}: ${r.total === 1 ? 'משמרת אחת' : `${r.total} משמרות`} (ראשונה ${r.first}, שנייה ${r.second})`}>
                  <span className={mine ? 'report-name mine' : 'report-name'}>
                    {r.name}
                    <span className="report-split muted">
                      ראשונה {r.first} · שנייה {r.second}
                    </span>
                  </span>
                  <span className="report-track" aria-hidden="true">
                    <span className="report-bar" style={{ width: `${(r.total / max) * 100}%` }} />
                    <span className="report-avg" style={{ insetInlineStart: `${avgPct}%` }} />
                  </span>
                  <span className="report-value">
                    <strong>{r.total}</strong>
                    {flag && <span className={`tag report-flag ${flag === 'הרבה' ? 'high' : 'low'}`}>{flag}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
