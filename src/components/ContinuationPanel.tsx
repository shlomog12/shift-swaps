import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { alignedStart, generateContinuation, type PeopleChange } from '../lib/continuation';
import { SLOT_HOURS, addDays, dayName, daysBetween, formatDate, formatDateRange, nightLabel } from '../lib/dates';
import { useAction, useQuery } from '../lib/hooks';
import type { ImportRow } from '../lib/importSheet';
import { loadAllShifts, loadShifts } from '../lib/queries';
import type { Shift } from '../lib/types';
import { useFeedback } from './Feedback';
import { rowState } from './ImportPreview';
import { SkeletonList } from './Skeleton';

const IMPORT_CHUNK = 1000;
type SlotKey = 'slot1' | 'slot2';

const planned = (s: Shift) => ('planned_assignee' in s ? (s.planned_assignee ?? null) : s.assignee);
const cellKey = (night: string, slot: SlotKey) => `${night}/${slot}`;

function counts(names: (string | null)[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const n of names) if (n) out.set(n, (out.get(n) ?? 0) + 1);
  return out;
}

interface Draft {
  rows: ImportRow[];
  existing: Map<string, Shift>;
  /** Cells emptied because their person left: which name was there. */
  left: Map<string, string>;
}

/**
 * Builds the next roster from the original one: same order, optionally the same weekday and first/second
 * shifts swapped, with people replaced or leaving. Nothing is assigned automatically: the preview is an
 * editable table where the admin fills a leaver's shifts and sets a newcomer's.
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
  const [joiners, setJoiners] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
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
  const suggestions = useMemo(
    () => [...new Set([...(names.data ?? []).map((n) => n.name), ...joiners.filter(Boolean)])],
    [names.data, joiners],
  );

  function changed<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setDraft(null);
    };
  }

  async function build() {
    setError(null);
    const bad = changes.find((c) => (c.kind === 'replace' ? !c.from || !c.to.trim() : !c.name));
    if (bad) {
      setError('יש שינוי אנשים שלא מולא עד הסוף.');
      return;
    }
    const clean = changes.map((c) => (c.kind === 'replace' ? { ...c, to: c.to.trim() } : c));
    const opts = { from, to, start: effectiveStart, swapSlots };
    const rows = generateContinuation(all.data ?? [], { ...opts, changes: clean });
    if (rows.length === 0) {
      setError('אין משמרות בטווח שנבחר.');
      return;
    }
    // Which emptied cells belonged to a leaver, to mark them until the admin fills them.
    const kept = generateContinuation(all.data ?? [], { ...opts, changes: clean.filter((c) => c.kind === 'replace') });
    const leavers = new Set(clean.filter((c) => c.kind === 'remove').map((c) => c.name.toLowerCase()));
    const left = new Map<string, string>();
    kept.forEach((r, i) => {
      for (const slot of ['slot1', 'slot2'] as const) {
        const was = r[slot];
        if (was && leavers.has(was.toLowerCase()) && rows[i][slot] === null) left.set(cellKey(r.night, slot), was);
      }
    });
    try {
      const existing = await loadShifts(rows[0].night, rows[rows.length - 1].night);
      setDraft({ rows, existing: new Map(existing.map((s) => [`${s.night}/${s.slot}`, s])), left });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function setCell(i: number, slot: SlotKey, value: string) {
    if (!draft) return;
    const rows = draft.rows.map((r, j) => (j === i ? { ...r, [slot]: value.trim() === '' ? null : value } : r));
    setDraft({ ...draft, rows });
  }

  async function create() {
    if (!draft) return;
    const rows = draft.rows.map((r) => ({ ...r, slot1: r.slot1?.trim() || null, slot2: r.slot2?.trim() || null }));
    const doubled = rows.filter((r) => r.slot1 && r.slot2 && r.slot1.toLowerCase() === r.slot2.toLowerCase());
    const unfilled = [...draft.left.keys()].filter((k) => {
      const [night, slot] = k.split('/') as [string, SlotKey];
      return !rows.find((r) => r.night === night)?.[slot];
    }).length;
    const toWrite = rows.filter((r) => rowState(r, draft.existing) !== 'same');
    const replacing = rows.filter((r) => rowState(r, draft.existing) === 'changed').length;
    const ok = await confirm({
      title: `ליצור לוח של ${rows.length} לילות?`,
      message: (
        <>
          <p>
            {formatDateRange(rows[0].night, rows[rows.length - 1].night, true)}. הלוח נשמר גם כשיבוץ וגם כלוח המקורי.
          </p>
          {replacing > 0 && <p>{replacing} לילות כבר קיימים ויוחלפו, ובקשות חילוף עליהם יבוטלו.</p>}
          {unfilled > 0 && <p className="warning-note">{unfilled} משמרות של מי שעזב עדיין פנויות.</p>}
          {doubled.length > 0 && (
            <p className="warning-note">
              ב־{doubled.length} לילות אותו אדם רשום לשתי המשמרות ({doubled.map((r) => formatDate(r.night)).join(', ')}).
            </p>
          )}
        </>
      ),
      confirmLabel: 'יצירת הלוח',
    });
    if (!ok) return;
    run(
      async () => {
        for (let i = 0; i < toWrite.length; i += IMPORT_CHUNK) await api.adminImport(toWrite.slice(i, i + IMPORT_CHUNK));
      },
      () => {
        toast(`הלוח נוצר: ${rows.length} לילות`);
        setDraft(null);
      },
    );
  }

  const before = useMemo(() => counts(sourceShifts.map(planned)), [sourceShifts]);
  const after = useMemo(() => (draft ? counts(draft.rows.flatMap((r) => [r.slot1, r.slot2])) : null), [draft]);
  const people = after
    ? [...new Set([...before.keys(), ...after.keys(), ...joiners.filter(Boolean)])].sort(
        (a, b) => (after.get(b) ?? 0) - (after.get(a) ?? 0) || a.localeCompare(b, 'he'),
      )
    : [];
  const openCount = draft ? draft.rows.reduce((n, r) => n + (r.slot1 ? 0 : 1) + (r.slot2 ? 0 : 1), 0) : 0;

  return (
    <section className="card">
      <h2>יצירת לוח המשך</h2>
      <p className="muted small">
        בונה את התקופה הבאה מתוך <strong>הלוח המקורי</strong> של תקופה קיימת (לא מהחילופים): אותו סדר, באותם מרווחים.
        שום שיבוץ לא נעשה אוטומטית: בתצוגה המקדימה אפשר לערוך כל משמרת לפני השמירה.
      </p>
      {all.loading && !all.data && <SkeletonList rows={2} />}
      {all.error && <p className="error">{all.error}</p>}

      {all.data && (
        <>
          <h3>מאיזו תקופה</h3>
          <div className="row wrap">
            <label>
              מתאריך <input type="date" value={from} onChange={(e) => changed(setFrom)(e.target.value)} />
            </label>
            <label>
              עד תאריך <input type="date" value={to} onChange={(e) => changed(setTo)(e.target.value)} />
            </label>
          </div>
          <p className="small muted">
            {length > 0 ? `${length} לילות, ${sourceNames.length} אנשים בלוח המקורי.` : 'בחירת טווח.'}
          </p>

          <h3>הלוח החדש</h3>
          <label>
            מתחיל ב <input type="date" value={start} onChange={(e) => changed(setStart)(e.target.value)} />
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={keepWeekday} onChange={(e) => changed(setKeepWeekday)(e.target.checked)} />
            <span>לשמור על אותו יום בשבוע (מי שהיה ביום שני יישאר ביום שני)</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={swapSlots} onChange={(e) => changed(setSwapSlots)(e.target.checked)} />
            <span>החלפת משמרת ראשונה ושנייה (מי שהיה ב־00:00 יעבור ל־03:00, ולהפך)</span>
          </label>
          {end && (
            <p className="small">
              הלוח החדש: <strong>{formatDateRange(effectiveStart, end, true)}</strong> (מיום {dayName(effectiveStart)}).
            </p>
          )}

          <h3>שינויים באנשים</h3>
          {changes.length === 0 && joiners.length === 0 && (
            <p className="muted small">אין שינויים: כולם ממשיכים כמו במקור.</p>
          )}
          <datalist id="continuation-names">
            {suggestions.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <ul className="people-changes">
            {changes.map((c, i) => (
              <li key={`c${i}`}>
                {c.kind === 'replace' ? (
                  <>
                    <span className="small">החלפה:</span>
                    <select
                      value={c.from}
                      onChange={(e) => changed(setChanges)(changes.map((x, j) => (j === i ? { ...c, from: e.target.value } : x)))}
                    >
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
                      onChange={(e) => changed(setChanges)(changes.map((x, j) => (j === i ? { ...c, to: e.target.value } : x)))}
                    />
                  </>
                ) : (
                  <>
                    <span className="small">עזיבה:</span>
                    <select
                      value={c.name}
                      onChange={(e) => changed(setChanges)(changes.map((x, j) => (j === i ? { ...c, name: e.target.value } : x)))}
                    >
                      <option value="">מי</option>
                      {sourceNames.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                    <span className="muted small">המשמרות נשארות פנויות ומסומנות, ואת השיבוץ קובעים בטבלה</span>
                  </>
                )}
                <button
                  className="icon small-icon"
                  aria-label="הסרת השינוי"
                  onClick={() => changed(setChanges)(changes.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
            {joiners.map((name, i) => (
              <li key={`j${i}`}>
                <span className="small">הצטרפות:</span>
                <input
                  list="continuation-names"
                  value={name}
                  placeholder="שם"
                  onChange={(e) => setJoiners(joiners.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <span className="muted small">את המשמרות קובעים בטבלה בתצוגה המקדימה</span>
                <button
                  className="icon small-icon"
                  aria-label="הסרת השינוי"
                  onClick={() => setJoiners(joiners.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="row wrap">
            <button className="small" onClick={() => changed(setChanges)([...changes, { kind: 'replace', from: '', to: '' }])}>
              + החלפת אדם
            </button>
            <button className="small" onClick={() => changed(setChanges)([...changes, { kind: 'remove', name: '' }])}>
              + מישהו עזב
            </button>
            <button className="small" onClick={() => setJoiners([...joiners, ''])}>
              + מישהו הצטרף
            </button>
          </div>

          <div className="row">
            <button className="primary" disabled={!end || busy} onClick={build}>
              תצוגה מקדימה לעריכה
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </>
      )}

      {draft && after && (
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
          <p className="small">
            משמרות פנויות: <strong>{openCount}</strong>
            {draft.left.size > 0 && ' · המשמרות של מי שעזב מסומנות בצהוב'}. כל תא אפשר לערוך: בחירה מהרשימה או
            הקלדת שם (ריק = פנוי).
          </p>
          <div className="table-wrap">
            <table className="preview editable">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>{SLOT_HOURS[1]}</th>
                  <th>{SLOT_HOURS[2]}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.rows.map((row, i) => {
                  const state = rowState(row, draft.existing);
                  return (
                    <tr key={row.night} className={`state-${state}`}>
                      <td>
                        {formatDate(row.night)}
                        <div className="muted small">{nightLabel(row.night)}</div>
                      </td>
                      {(['slot1', 'slot2'] as const).map((slot) => {
                        const leaver = draft.left.get(cellKey(row.night, slot));
                        return (
                          <td key={slot} className={leaver && !row[slot] ? 'cell-left' : undefined}>
                            <input
                              list="continuation-names"
                              value={row[slot] ?? ''}
                              placeholder="פנוי"
                              aria-label={`${formatDate(row.night)} ${SLOT_HOURS[slot === 'slot1' ? 1 : 2]}`}
                              onChange={(e) => setCell(i, slot, e.target.value)}
                            />
                            {leaver && <div className="small muted">היה: {leaver} · עזיבה</div>}
                          </td>
                        );
                      })}
                      <td className="small">{state === 'new' ? 'חדש' : state === 'changed' ? 'שינוי' : 'זהה'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button className="primary" disabled={busy} onClick={create}>
              יצירת הלוח ({draft.rows.length} לילות)
            </button>
            <button disabled={busy} onClick={() => setDraft(null)}>
              ביטול
            </button>
          </div>
        </>
      )}
    </section>
  );
}
