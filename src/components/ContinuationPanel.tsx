import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { alignedStart, generateContinuation, type PeopleChange } from '../lib/continuation';
import { addDays, dayName, daysBetween, formatDateRange } from '../lib/dates';
import { useAction, useQuery } from '../lib/hooks';
import type { ImportRow } from '../lib/importSheet';
import { loadAllShifts, loadShifts } from '../lib/queries';
import type { Shift } from '../lib/types';
import { useFeedback } from './Feedback';
import { PreviewTable, rowState } from './ImportPreview';
import { SkeletonList } from './Skeleton';

const IMPORT_CHUNK = 1000;

const planned = (s: Shift) => ('planned_assignee' in s ? (s.planned_assignee ?? null) : s.assignee);

function counts(names: (string | null)[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const n of names) if (n) out.set(n, (out.get(n) ?? 0) + 1);
  return out;
}

/**
 * Builds the next roster from the original one: same order, optionally the same weekday and first/second
 * shifts swapped, with people replaced, leaving or joining. Shows a preview before anything is saved.
 */
export function ContinuationPanel() {
  const all = useQuery(loadAllShifts, []);
  const names = useQuery(api.rosterNames, []);
  const lastNight = useMemo(() => (all.data ?? []).reduce((m, s) => (s.night > m ? s.night : m), ''), [all.data]);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [start, setStart] = useState('');
  const [keepWeekday, setKeepWeekday] = useState(true);
  const [swapSlots, setSwapSlots] = useState(false);
  const [changes, setChanges] = useState<PeopleChange[]>([]);
  const [preview, setPreview] = useState<{ rows: ImportRow[]; existing: Map<string, Shift> } | null>(null);
  const { busy, error, setError, run } = useAction();
  const { confirm, toast } = useFeedback();

  // Defaults once the roster is loaded: the last three months as the source, starting the day after.
  useEffect(() => {
    if (!lastNight || to) return;
    setTo(lastNight);
    setFrom(addDays(lastNight, -90));
    setStart(addDays(lastNight, 1));
  }, [lastNight, to]);

  const effectiveStart = from && start ? (keepWeekday ? alignedStart(start, from) : start) : '';
  const length = from && to ? daysBetween(from, to) + 1 : 0;
  const end = effectiveStart && length > 0 ? addDays(effectiveStart, length - 1) : '';
  const sourceShifts = useMemo(
    () => (all.data ?? []).filter((s) => from && to && s.night >= from && s.night <= to),
    [all.data, from, to],
  );
  const sourceNames = useMemo(
    () => [...counts(sourceShifts.map(planned)).keys()].sort((a, b) => a.localeCompare(b, 'he')),
    [sourceShifts],
  );

  function update(i: number, change: PeopleChange) {
    setChanges(changes.map((c, j) => (j === i ? change : c)));
    setPreview(null);
  }

  async function showPreview() {
    setError(null);
    const bad = changes.find(
      (c) => (c.kind === 'replace' && (!c.from || !c.to.trim())) || (c.kind !== 'replace' && !('name' in c && c.name.trim())),
    );
    if (bad) {
      setError('יש שינוי אנשים שלא מולא עד הסוף.');
      return;
    }
    const rows = generateContinuation(all.data ?? [], {
      from,
      to,
      start: effectiveStart,
      swapSlots,
      changes: changes.map((c) =>
        c.kind === 'replace' ? { ...c, to: c.to.trim() } : { ...c, name: c.name.trim() },
      ),
    });
    if (rows.length === 0) {
      setError('אין משמרות בטווח שנבחר.');
      return;
    }
    try {
      const existingShifts = await loadShifts(rows[0].night, rows[rows.length - 1].night);
      setPreview({ rows, existing: new Map(existingShifts.map((s) => [`${s.night}/${s.slot}`, s])) });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function create() {
    if (!preview) return;
    const toWrite = preview.rows.filter((r) => rowState(r, preview.existing) !== 'same');
    const replacing = preview.rows.filter((r) => rowState(r, preview.existing) === 'changed').length;
    const ok = await confirm({
      title: `ליצור לוח של ${preview.rows.length} לילות?`,
      message:
        `${formatDateRange(preview.rows[0].night, preview.rows[preview.rows.length - 1].night, true)}. ` +
        'הלוח נשמר גם כשיבוץ וגם כלוח המקורי.' +
        (replacing > 0 ? ` ${replacing} לילות כבר קיימים ויוחלפו, ובקשות חילוף עליהם יבוטלו.` : ''),
      confirmLabel: 'יצירת הלוח',
    });
    if (!ok) return;
    run(
      async () => {
        for (let i = 0; i < toWrite.length; i += IMPORT_CHUNK) await api.adminImport(toWrite.slice(i, i + IMPORT_CHUNK));
      },
      () => {
        toast(`הלוח נוצר: ${preview.rows.length} לילות`);
        setPreview(null);
      },
    );
  }

  const before = useMemo(() => counts(sourceShifts.map(planned)), [sourceShifts]);
  const after = useMemo(
    () => (preview ? counts(preview.rows.flatMap((r) => [r.slot1, r.slot2])) : null),
    [preview],
  );
  const people = after
    ? [...new Set([...before.keys(), ...after.keys()])].sort(
        (a, b) => (after.get(b) ?? 0) - (after.get(a) ?? 0) || a.localeCompare(b, 'he'),
      )
    : [];

  return (
    <section className="card">
      <h2>יצירת לוח המשך</h2>
      <p className="muted small">
        בונה את התקופה הבאה מתוך <strong>הלוח המקורי</strong> של תקופה קיימת (לא מהחילופים): אותו סדר, באותם מרווחים.
        אחרי התצוגה המקדימה הלוח נשמר כמו ייבוא.
      </p>
      {all.loading && !all.data && <SkeletonList rows={2} />}
      {all.error && <p className="error">{all.error}</p>}

      {all.data && (
        <>
          <h3>מאיזו תקופה</h3>
          <div className="row wrap">
            <label>
              מתאריך{' '}
              <input type="date" value={from} onChange={(e) => (setFrom(e.target.value), setPreview(null))} />
            </label>
            <label>
              עד תאריך <input type="date" value={to} onChange={(e) => (setTo(e.target.value), setPreview(null))} />
            </label>
          </div>
          <p className="small muted">
            {length > 0 ? `${length} לילות, ${sourceNames.length} אנשים בלוח המקורי.` : 'בחירת טווח.'}
          </p>

          <h3>הלוח החדש</h3>
          <label>
            מתחיל ב <input type="date" value={start} onChange={(e) => (setStart(e.target.value), setPreview(null))} />
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={keepWeekday} onChange={(e) => (setKeepWeekday(e.target.checked), setPreview(null))} />
            <span>לשמור על אותו יום בשבוע (מי שהיה ביום שני יישאר ביום שני)</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={swapSlots} onChange={(e) => (setSwapSlots(e.target.checked), setPreview(null))} />
            <span>החלפת משמרת ראשונה ושנייה (מי שהיה ב־00:00 יעבור ל־03:00, ולהפך)</span>
          </label>
          {end && (
            <p className="small">
              הלוח החדש: <strong>{formatDateRange(effectiveStart, end, true)}</strong> (מיום {dayName(effectiveStart)}).
            </p>
          )}

          <h3>שינויים באנשים</h3>
          {changes.length === 0 && <p className="muted small">אין שינויים: כולם ממשיכים כמו במקור.</p>}
          <datalist id="continuation-names">
            {(names.data ?? []).map((n) => (
              <option key={n.name} value={n.name} />
            ))}
          </datalist>
          <ul className="people-changes">
            {changes.map((c, i) => (
              <li key={i}>
                {c.kind === 'replace' && (
                  <>
                    <span className="small">החלפה:</span>
                    <select value={c.from} onChange={(e) => update(i, { ...c, from: e.target.value })}>
                      <option value="">מי</option>
                      {sourceNames.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                    <span>←</span>
                    <input
                      list="continuation-names"
                      value={c.to}
                      placeholder="שם חדש"
                      onChange={(e) => update(i, { ...c, to: e.target.value })}
                    />
                  </>
                )}
                {c.kind === 'remove' && (
                  <>
                    <span className="small">עזיבה:</span>
                    <select value={c.name} onChange={(e) => update(i, { ...c, name: e.target.value })}>
                      <option value="">מי</option>
                      {sourceNames.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                    <select
                      value={c.spread ? 'spread' : 'open'}
                      onChange={(e) => update(i, { ...c, spread: e.target.value === 'spread' })}
                    >
                      <option value="open">המשמרות נשארות פנויות</option>
                      <option value="spread">לחלק בין כולם</option>
                    </select>
                  </>
                )}
                {c.kind === 'add' && (
                  <>
                    <span className="small">הצטרפות:</span>
                    <input
                      list="continuation-names"
                      value={c.name}
                      placeholder="שם"
                      onChange={(e) => update(i, { ...c, name: e.target.value })}
                    />
                    <span className="muted small">חלק שווה מהמשמרות, ממי שיש הכי הרבה</span>
                  </>
                )}
                <button
                  className="icon small-icon"
                  aria-label="הסרת השינוי"
                  onClick={() => (setChanges(changes.filter((_, j) => j !== i)), setPreview(null))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="row wrap">
            <button className="small" onClick={() => setChanges([...changes, { kind: 'replace', from: '', to: '' }])}>
              + החלפת אדם
            </button>
            <button className="small" onClick={() => setChanges([...changes, { kind: 'remove', name: '', spread: true }])}>
              + מישהו עזב
            </button>
            <button className="small" onClick={() => setChanges([...changes, { kind: 'add', name: '' }])}>
              + מישהו הצטרף
            </button>
          </div>

          <div className="row">
            <button className="primary" disabled={!end || busy} onClick={showPreview}>
              תצוגה מקדימה
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </>
      )}

      {preview && after && (
        <>
          <h3>תצוגה מקדימה</h3>
          <div className="table-wrap">
            <table className="preview">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>במקור</th>
                  <th>בלוח החדש</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p} className={(before.get(p) ?? 0) !== (after.get(p) ?? 0) ? 'state-changed' : undefined}>
                    <td>{p}</td>
                    <td>{before.get(p) ?? 0}</td>
                    <td>
                      <strong>{after.get(p) ?? 0}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">
            משמרות פנויות בלוח החדש:{' '}
            {preview.rows.reduce((n, r) => n + (r.slot1 ? 0 : 1) + (r.slot2 ? 0 : 1), 0)}.
          </p>
          <PreviewTable rows={preview.rows} existing={preview.existing} />
          <div className="row">
            <button className="primary" disabled={busy} onClick={create}>
              יצירת הלוח ({preview.rows.length} לילות)
            </button>
            <button disabled={busy} onClick={() => setPreview(null)}>
              ביטול
            </button>
          </div>
        </>
      )}
    </section>
  );
}
