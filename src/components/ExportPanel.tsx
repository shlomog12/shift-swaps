import { useEffect, useState } from 'react';
import { formatDateRange, israelToday, monthBounds, monthKey } from '../lib/dates';
import { downloadText, rosterCsv } from '../lib/exportCsv';
import { useAction, useQuery } from '../lib/hooks';
import { loadAllShifts, loadShifts } from '../lib/queries';
import { useFeedback } from './Feedback';

/** Downloads the roster of a date range as a CSV file (Excel / Google Sheets, and re-importable). */
export function ExportPanel() {
  const all = useQuery(loadAllShifts, []);
  const [from, setFrom] = useState(monthBounds(monthKey(israelToday())).from);
  const [to, setTo] = useState('');
  const [planned, setPlanned] = useState(false);
  const { busy, error, setError, run } = useAction();
  const { toast } = useFeedback();
  const hasPlan = (all.data ?? []).some((s) => 'planned_assignee' in s);

  // Default end: the last night on the roster.
  useEffect(() => {
    if (to || !all.data?.length) return;
    setTo(all.data.reduce((m, s) => (s.night > m ? s.night : m), ''));
  }, [all.data, to]);

  function download() {
    setError(null);
    if (!from || !to || to < from) {
      setError('טווח התאריכים לא תקין.');
      return;
    }
    run(async () => {
      const shifts = await loadShifts(from, to);
      if (shifts.length === 0) throw new Error('אין משמרות בטווח שנבחר.');
      downloadText(rosterCsv(shifts, planned && hasPlan), `shifts_${from}_${to}${planned && hasPlan ? '_original' : ''}.csv`);
      toast('הקובץ ירד');
    });
  }

  return (
    <section className="card">
      <h2>ייצוא ל־CSV</h2>
      <p className="muted small">
        הורדת השבצ"ק כקובץ שנפתח באקסל או בגוגל שיטס: תאריך, הלילה, משמרת ראשונה ושנייה. את אותו קובץ אפשר גם
        לייבא בחזרה כאן למטה.
      </p>
      <div className="row wrap">
        <label>
          מתאריך <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          עד תאריך <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {hasPlan && (
        <div className="segmented" role="group" aria-label="איזה לוח לייצא">
          <button className={!planned ? 'selected' : undefined} onClick={() => setPlanned(false)}>
            בפועל
          </button>
          <button className={planned ? 'selected' : undefined} onClick={() => setPlanned(true)}>
            מקורי
          </button>
        </div>
      )}
      <div className="row">
        <button className="primary" disabled={busy || !from || !to} onClick={download}>
          הורדת CSV{from && to && to >= from ? ` (${formatDateRange(from, to, true)})` : ''}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
