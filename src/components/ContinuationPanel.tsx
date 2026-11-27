import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { alignedStart, defaultContinuationRange, generateContinuation, type PeopleChange } from '../lib/continuation';
import { SLOT_HOURS, addDays, dayName, daysBetween, formatDate, formatDateRange, israelToday, nightLabel } from '../lib/dates';
import { useAction, useQuery } from '../lib/hooks';
import type { ImportRow } from '../lib/importSheet';
import { loadAllShifts, loadShifts } from '../lib/queries';
import type { Shift } from '../lib/types';
import { useFeedback } from './Feedback';
import { rowState } from './ImportPreview';
import { RosterNameField } from './RosterNameField';
import { SkeletonList } from './Skeleton';
import { checkName } from '../lib/rosterCheck';

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

type Show = 'all' | 'attention' | 'changed';

/** Everything the admin set up and edited, kept in this browser until the roster is created or discarded. */
interface Saved {
  savedAt: string;
  from: string;
  to: string;
  start: string;
  keepWeekday: boolean;
  swapSlots: boolean;
  changes: PeopleChange[];
  joiners: string[];
  draft: { rows: ImportRow[]; left: [string, string][] } | null;
}

const SAVED_KEY = 'continuation-draft';

function readSaved(): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? 'null') as Saved | null;
    return saved && Array.isArray(saved.changes) ? saved : null;
  } catch {
    return null;
  }
}

/**
 * Builds the next roster from the original one: same order, optionally the same weekday and first/second
 * shifts swapped, with people replaced or leaving. Nothing is assigned automatically: the preview is an
 * editable table where the admin fills a leaver's shifts and sets a newcomer's.
 */
export function ContinuationPanel() {
  const all = useQuery(loadAllShifts, []);
  const names = useQuery(api.rosterNames, []);

  // Work in progress survives switching tabs, reloading and a dropped connection.
  const [restored] = useState(readSaved);
  const [from, setFrom] = useState(restored?.from ?? '');
  const [to, setTo] = useState(restored?.to ?? '');
  const [start, setStart] = useState(restored?.start ?? '');
  const [keepWeekday, setKeepWeekday] = useState(restored?.keepWeekday ?? true);
  const [swapSlots, setSwapSlots] = useState(restored?.swapSlots ?? false);
  const [changes, setChanges] = useState<PeopleChange[]>(restored?.changes ?? []);
  const [joiners, setJoiners] = useState<string[]>(restored?.joiners ?? []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showRestored, setShowRestored] = useState(Boolean(restored));
  // Until a saved table is back, saving would overwrite it with an empty one.
  const [restoring, setRestoring] = useState(Boolean(restored?.draft?.rows.length));
  const [show, setShow] = useState<Show>('all');
  const tableRef = useRef<HTMLDivElement>(null);
  const { busy, error, setError, run } = useAction();
  const { confirm, toast } = useFeedback();

  // A saved draft's table comes back with the current state of those nights, to mark what is new or changed.
  useEffect(() => {
    const saved = restored?.draft;
    if (!saved || saved.rows.length === 0) return;
    loadShifts(saved.rows[0].night, saved.rows[saved.rows.length - 1].night).then(
      (existing) =>
        setDraft({
          rows: saved.rows,
          existing: new Map(existing.map((s) => [`${s.night}/${s.slot}`, s])),
          left: new Map(saved.left),
        }),
      (e: Error) => setError(e.message),
    ).finally(() => setRestoring(false));
  }, [restored, setError]);

  const touched = changes.length > 0 || joiners.length > 0 || draft !== null;
  useEffect(() => {
    if (!from || !to || restoring) return;
    if (!touched) {
      localStorage.removeItem(SAVED_KEY);
      return;
    }
    const saved: Saved = {
      savedAt: new Date().toISOString(),
      from,
      to,
      start,
      keepWeekday,
      swapSlots,
      changes,
      joiners,
      draft: draft && { rows: draft.rows, left: [...draft.left] },
    };
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  }, [from, to, start, keepWeekday, swapSlots, changes, joiners, draft, touched, restoring]);

  function startOver() {
    localStorage.removeItem(SAVED_KEY);
    setChanges([]);
    setJoiners([]);
    setDraft(null);
    setShowRestored(false);
    applyDefaults();
  }

  // Defaults: from the first night nobody is on yet, three months ahead, built from the same number of days
  // right before it.
  const defaults = useMemo(() => (all.data ? defaultContinuationRange(all.data, israelToday()) : null), [all.data]);
  function applyDefaults() {
    setFrom(defaults?.from ?? '');
    setTo(defaults?.to ?? '');
    setStart(defaults?.start ?? '');
    setDraft(null);
  }
  useEffect(() => {
    if (!defaults || to) return;
    setFrom(defaults.from);
    setTo(defaults.to);
    setStart(defaults.start);
  }, [defaults, to]);
  const isDefault = Boolean(defaults && from === defaults.from && to === defaults.to && start === defaults.start);

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
  const roster = useMemo(() => (names.data ?? []).map((n) => n.name), [names.data]);
  // People declared as joining or replacing someone are expected to be new names.
  const declared = useMemo(
    () => [
      ...joiners.map((j) => j.trim()),
      ...changes.flatMap((c) => (c.kind === 'replace' ? [c.to.trim()] : [])),
    ].filter(Boolean),
    [joiners, changes],
  );
  const suggestions = useMemo(() => [...new Set([...roster, ...declared])], [roster, declared]);

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
    const unknown = [
      ...new Set(
        rows.flatMap((r) => [r.slot1, r.slot2]).filter((n): n is string => !!n && checkName(n, suggestions).status === 'new'),
      ),
    ];
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
          {unfilled > 0 && (
            <p className="warning-note">
              {unfilled === 1 ? 'משמרת אחת של מי שעזב עדיין פנויה.' : `${unfilled} משמרות של מי שעזב עדיין פנויות.`}
            </p>
          )}
          {unknown.length > 0 && (
            <p className="warning-note">
              {unknown.length === 1 ? 'שם שלא ברשימה ייווצר כשם חדש' : `${unknown.length} שמות שלא ברשימה ייווצרו כשמות חדשים`}:{' '}
              {unknown.join(', ')}. אם זו טעות הקלדה, כדאי לתקן לפני היצירה.
            </p>
          )}
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
        localStorage.removeItem(SAVED_KEY);
        setChanges([]);
        setJoiners([]);
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
  // Average shifts per person in the new roster, so a joiner's load can be set close to everyone else's.
  const average = after && after.size > 0 ? [...after.values()].reduce((a, b) => a + b, 0) / after.size : 0;

  /** A cell needs the admin: empty, a name not on the roster, or the same person in both shifts. */
  function cellNeeds(row: ImportRow, slot: SlotKey): boolean {
    const name = row[slot]?.trim();
    if (!name) return true;
    if (checkName(name, suggestions).status === 'new') return true;
    const other = row[slot === 'slot1' ? 'slot2' : 'slot1']?.trim();
    return Boolean(other && other.toLowerCase() === name.toLowerCase());
  }
  const attentionCount = draft
    ? draft.rows.reduce((n, r) => n + (cellNeeds(r, 'slot1') ? 1 : 0) + (cellNeeds(r, 'slot2') ? 1 : 0), 0)
    : 0;

  /** Focuses the next cell that needs attention after the focused one (from the top when at the end). */
  function nextCell() {
    const cells = [...(tableRef.current?.querySelectorAll<HTMLInputElement>('[data-attention="1"] input') ?? [])];
    if (cells.length === 0) return;
    const at = cells.findIndex((c) => c === document.activeElement);
    const next = cells[(at + 1) % cells.length];
    next.scrollIntoView({ block: 'center', behavior: 'smooth' });
    next.focus({ preventScroll: true });
  }

  return (
    <section className="card">
      <h2>יצירת לוח המשך</h2>
      <p className="muted small">
        בונה את התקופה הבאה מתוך <strong>הלוח המקורי</strong> של תקופה קיימת (לא מהחילופים): אותו סדר, באותם מרווחים.
        שום שיבוץ לא נעשה אוטומטית: בתצוגה המקדימה אפשר לערוך כל משמרת לפני השמירה.
      </p>
      {showRestored && restored && (
        <p className="plan-banner small" role="status">
          נטענה הטיוטה שנשמרה ב־{new Date(restored.savedAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}.{' '}
          <button className="link small" onClick={startOver}>
            התחלה מחדש
          </button>
        </p>
      )}
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
          {defaults && (
            <p className="muted small">
              {isDefault ? (
                'ברירת המחדל: מהלילה הראשון שעוד אין בו שיבוץ, לשלושה חודשים, לפי אותו מספר ימים שלפניו.'
              ) : (
                <button className="link small" onClick={applyDefaults}>
                  חזרה לברירת המחדל: מ־{formatDate(defaults.start)}, לשלושה חודשים
                </button>
              )}
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
                    <RosterNameField
                      value={c.to}
                      onChange={(v) => changed(setChanges)(changes.map((x, j) => (j === i ? { ...c, to: v } : x)))}
                      roster={roster}
                      listId="continuation-names"
                      placeholder="מי במקום"
                      label="מי מחליף"
                      expectNew
                      newNote="שם חדש: יתווסף לרשימה"
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
                <RosterNameField
                  value={name}
                  onChange={(v) => setJoiners(joiners.map((x, j) => (j === i ? v : x)))}
                  roster={roster}
                  listId="continuation-names"
                  placeholder="שם"
                  label="מי מצטרף"
                  expectNew
                  newNote="שם חדש: יתווסף לרשימה"
                />
                <span className="muted small">
                  {after && name.trim()
                    ? `שובצו בטבלה: ${after.get(name.trim()) ?? 0} · ממוצע: ${average.toFixed(1)}`
                    : 'את המשמרות קובעים בטבלה בתצוגה המקדימה'}
                </span>
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
                  <th>בלוח המקורי</th>
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
            ממוצע בלוח החדש: <strong>{average.toFixed(1)}</strong> משמרות לאדם · משמרות פנויות: <strong>{openCount}</strong>
            {draft.left.size > 0 && ' · המשמרות של מי שעזב מסומנות בצהוב'}. כל תא אפשר לערוך: בחירה מהרשימה או
            הקלדת שם (ריק = פנוי).
          </p>
          <div className="row wrap draft-tools">
            <div className="segmented" role="group" aria-label="אילו לילות להציג">
              <button className={show === 'all' ? 'selected' : undefined} onClick={() => setShow('all')}>
                הכול
              </button>
              <button className={show === 'attention' ? 'selected' : undefined} onClick={() => setShow('attention')}>
                דורשות טיפול ({attentionCount})
              </button>
              <button className={show === 'changed' ? 'selected' : undefined} onClick={() => setShow('changed')}>
                חדשים ושינויים
              </button>
            </div>
            <button className="small" disabled={attentionCount === 0} onClick={nextCell}>
              לתא הבא שדורש טיפול
            </button>
          </div>
          {show === 'attention' && attentionCount === 0 && <p className="success small">אין תאים שדורשים טיפול.</p>}
          <div className="table-wrap" ref={tableRef}>
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
                  const needs = cellNeeds(row, 'slot1') || cellNeeds(row, 'slot2');
                  if (show === 'attention' && !needs) return null;
                  if (show === 'changed' && state === 'same') return null;
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
                            <span className="cell-field" data-attention={cellNeeds(row, slot) ? '1' : '0'}>
                              <RosterNameField
                                value={row[slot] ?? ''}
                                onChange={(v) => setCell(i, slot, v)}
                                roster={suggestions}
                                listId="continuation-names"
                                placeholder="פנוי"
                                label={`${formatDate(row.night)} ${SLOT_HOURS[slot === 'slot1' ? 1 : 2]}`}
                                compact
                                newNote="לא ברשימה"
                              />
                            </span>
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
              סגירת הטבלה
            </button>
            <button className="link small danger" disabled={busy} onClick={startOver}>
              מחיקת הטיוטה
            </button>
          </div>
        </>
      )}
    </section>
  );
}
