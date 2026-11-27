import { useState } from 'react';
import { api } from '../lib/api';
import { formatDate, SLOT_HOURS } from '../lib/dates';
import { useAction } from '../lib/hooks';
import { reconstructPlan, type PlanRow } from '../lib/plan';
import { loadAllAudit, loadAllShifts } from '../lib/queries';
import { useFeedback } from './Feedback';
import { SkeletonList } from './Skeleton';

interface Change extends PlanRow {
  before: string | null;
  actual: string | null;
}

const SHOWN = 150;
const MIGRATION_MISSING = 'missing';
const CHUNK = 1500;

/**
 * The original roster: what the admin planned, before swaps. Rebuilds it from the history, shows what would
 * change, and saves it only after the admin confirms.
 */
export function PlanPanel() {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [all, setAll] = useState(false);
  const { busy, error, setError, run } = useAction();
  const { confirm, toast } = useFeedback();

  async function analyze() {
    setError(null);
    setLoading(true);
    setChanges(null);
    try {
      const [shifts, history] = await Promise.all([loadAllShifts(), loadAllAudit()]);
      if (shifts.length > 0 && !shifts.some((s) => 'planned_assignee' in s)) {
        setError(MIGRATION_MISSING);
        return;
      }
      const byKey = new Map(shifts.map((s) => [`${s.night}/${s.slot}`, s]));
      const rebuilt = reconstructPlan(shifts, history);
      setChanges(
        rebuilt
          .map((r) => {
            const s = byKey.get(`${r.night}/${r.slot}`)!;
            return { ...r, before: s.planned_assignee ?? null, actual: s.assignee };
          })
          .filter((c) => c.name !== c.before),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!changes || changes.length === 0) return;
    const ok = await confirm({
      title: `לעדכן ${changes.length} משמרות בלוח המקורי?`,
      message: 'השיבוץ הנוכחי (מי עושה כל משמרת בפועל) לא משתנה. משתנה רק הלוח המקורי, שעליו נבנה הלוח הבא.',
      confirmLabel: 'שמירה בלוח המקורי',
    });
    if (!ok) return;
    const rows = changes.map(({ night, slot, name }) => ({ night, slot, name }));
    run(
      async () => {
        for (let i = 0; i < rows.length; i += CHUNK) await api.adminSetPlan(rows.slice(i, i + CHUNK));
      },
      () => {
        toast('הלוח המקורי עודכן');
        setChanges([]);
      },
    );
  }

  const shown = changes && !all ? changes.slice(0, SHOWN) : changes;

  return (
    <section className="card">
      <h2>הלוח המקורי</h2>
      <p className="muted small">
        הלוח המקורי הוא מה שנקבע בייבוא, בבניית הלוח או בעריכה שסומנה "גם בלוח המקורי". לקיחת משמרות וחילופים לא
        משנים אותו, ולכן הוא הבסיס ללוח הבא. כאן אפשר לשחזר אותו מההיסטוריה: מתחילים מהמצב הנוכחי ומבטלים, אחורה
        בזמן, כל חילוף ולקיחה עד הייבוא או הבנייה של אותו לילה.
      </p>
      <button className="primary" disabled={loading || busy} onClick={analyze}>
        שחזור מההיסטוריה (תצוגה מקדימה)
      </button>
      {loading && <SkeletonList rows={3} />}
      {error === MIGRATION_MISSING ? (
        <p className="error">
          צריך להריץ קודם ב־SQL Editor את הקובץ <span className="ltr-inline">20261206000000_planned_roster.sql</span>.
        </p>
      ) : (
        error && <p className="error">{error}</p>
      )}

      {changes && changes.length === 0 && <p className="success">הלוח המקורי כבר תואם להיסטוריה. אין מה לעדכן.</p>}
      {changes && changes.length > 0 && (
        <>
          <p className="small">
            <strong>{changes.length}</strong> משמרות יתעדכנו בלוח המקורי. שום דבר לא נשמר לפני האישור.
          </p>
          <div className="table-wrap">
            <table className="preview">
              <thead>
                <tr>
                  <th>משמרת</th>
                  <th>מקורי (משוחזר)</th>
                  <th>בפועל</th>
                </tr>
              </thead>
              <tbody>
                {shown!.map((c) => (
                  <tr key={`${c.night}/${c.slot}`}>
                    <td>
                      {formatDate(c.night)}
                      <div className="muted small">{SLOT_HOURS[c.slot]}</div>
                    </td>
                    <td className="cell-changed">
                      {c.name ?? <span className="muted">פנוי</span>}
                      <div className="muted small">היה רשום: {c.before ?? 'פנוי'}</div>
                    </td>
                    <td>{c.actual ?? <span className="muted">פנוי</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!all && changes.length > SHOWN && (
            <button className="link small" onClick={() => setAll(true)}>
              הצגת כל {changes.length} השינויים
            </button>
          )}
          <div className="row">
            <button className="primary" disabled={busy} onClick={save}>
              שמירה בלוח המקורי
            </button>
            <button disabled={busy} onClick={() => setChanges(null)}>
              ביטול
            </button>
          </div>
        </>
      )}
    </section>
  );
}
