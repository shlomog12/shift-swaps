import { useState } from 'react';
import { api } from '../lib/api';
import { SLOT_HOURS, addDays, formatDate, israelToday, nightLabel } from '../lib/dates';
import { useAction, useMe, useQuery } from '../lib/hooks';
import { parseSheet, type ImportResult, type ImportRow } from '../lib/importSheet';
import { loadShifts } from '../lib/queries';
import type { Shift } from '../lib/types';

export function Admin() {
  return (
    <div className="page">
      <ImportPanel />
      <NightsPanel />
      <UsersPanel />
    </div>
  );
}

type RowState = 'new' | 'changed' | 'same';

interface Preview extends ImportResult {
  states: Map<string, RowState>;
  existing: Map<string, Shift>;
}

function ImportPanel() {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { busy, error, setError, run } = useAction();

  async function analyze() {
    setMessage(null);
    setError(null);
    const parsed = parseSheet(text);
    if (parsed.rows.length === 0) {
      setPreview(null);
      setError('לא נמצאו שורות עם תאריך. העתק את הטבלה מהגיליון, כולל עמודת התאריך.');
      return;
    }
    const from = parsed.rows[0].night;
    const to = parsed.rows[parsed.rows.length - 1].night;
    try {
      const shifts = await loadShifts(from, to);
      const existing = new Map(shifts.map((s) => [`${s.night}/${s.slot}`, s]));
      const states = new Map<string, RowState>();
      for (const row of parsed.rows) states.set(row.night, rowState(row, existing));
      setPreview({ ...parsed, states, existing });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function doImport() {
    if (!preview) return;
    const changed = preview.rows.filter((r) => preview.states.get(r.night) !== 'same');
    if (!window.confirm(`לייבא ${changed.length} לילות שהשתנו? בקשות חילוף על משמרות שהשם בהן משתנה יבוטלו.`)) return;
    run(
      () => api.adminImport(changed).then((count) => setMessage(`הייבוא הסתיים: ${count} משמרות עודכנו.`)),
      () => {
        setPreview(null);
        setText('');
      },
    );
  }

  const changedCount = preview ? preview.rows.filter((r) => preview.states.get(r.night) !== 'same').length : 0;

  return (
    <section className="card">
      <h2>ייבוא מגוגל שיטס</h2>
      <p className="muted small">
        בגיליון: מסמנים את הטבלה (תאריך, יום, משמרת ראשונה, משמרת שנייה), מעתיקים ומדביקים כאן. שורות כותרת
        מדולגות אוטומטית. לילות שכבר קיימים מתעדכנים, ולילות שלא מופיעים בהדבקה לא משתנים.
      </p>
      <textarea
        rows={6}
        value={text}
        placeholder={'1.10.2026\tליל חמישי- רביעי בלילה\tיהושע\tדניאלי'}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
      />
      <div className="row">
        <button onClick={analyze} disabled={!text.trim() || busy}>
          תצוגה מקדימה
        </button>
        {preview && (
          <button className="primary" onClick={doImport} disabled={busy || changedCount === 0}>
            ייבוא {changedCount} לילות
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      {preview && (
        <>
          <p className="small">
            {preview.rows.length} לילות ({formatDate(preview.rows[0].night)}–
            {formatDate(preview.rows[preview.rows.length - 1].night)}). {changedCount} חדשים או משתנים.
            {preview.skipped.length > 0 && ` ${preview.skipped.length} שורות ללא תאריך דולגו.`}
          </p>
          {preview.duplicates.length > 0 && (
            <p className="error small">
              תאריכים כפולים (נלקחה השורה האחרונה): {preview.duplicates.map(formatDate).join(', ')}
            </p>
          )}
          <div className="table-wrap">
            <table className="preview">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>{SLOT_HOURS[1]}</th>
                  <th>{SLOT_HOURS[2]}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => {
                  const state = preview.states.get(row.night)!;
                  return (
                    <tr key={row.night} className={`state-${state}`}>
                      <td>
                        {formatDate(row.night)}
                        <div className="muted small">{nightLabel(row.night)}</div>
                      </td>
                      <PreviewCell value={row.slot1} old={preview.existing.get(`${row.night}/1`)} />
                      <PreviewCell value={row.slot2} old={preview.existing.get(`${row.night}/2`)} />
                      <td className="small">{state === 'new' ? 'חדש' : state === 'changed' ? 'שינוי' : 'זהה'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function rowState(row: ImportRow, existing: Map<string, Shift>): RowState {
  const first = existing.get(`${row.night}/1`);
  const second = existing.get(`${row.night}/2`);
  if (!first && !second) return 'new';
  const same = first?.assignee === row.slot1 && second?.assignee === row.slot2;
  return same ? 'same' : 'changed';
}

function PreviewCell({ value, old }: { value: string | null; old: Shift | undefined }) {
  const changed = old !== undefined && old.assignee !== value;
  return (
    <td className={changed ? 'cell-changed' : undefined}>
      {value ?? <span className="muted">פנוי</span>}
      {changed && <div className="muted small">היה: {old.assignee ?? 'פנוי'}</div>}
    </td>
  );
}

function NightsPanel() {
  const today = israelToday();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 90));
  const [message, setMessage] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  return (
    <section className="card">
      <h2>בניית לילות</h2>
      <p className="muted small">
        יוצר לילות ריקים (שתי משמרות פנויות לכל לילה) בטווח התאריכים. לילות קיימים לא משתנים. אחרי זה אפשר לשבץ
        שמות דרך היומן, או לתת לאנשים לקחת משמרות בעצמם.
      </p>
      <div className="row wrap">
        <label>
          מתאריך <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          עד תאריך <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <div className="row wrap">
        <button
          className="primary"
          disabled={busy || !from || !to}
          onClick={() =>
            run(() => api.adminAddNights(from, to).then((n) => setMessage(`נוצרו ${n} משמרות חדשות.`)))
          }
        >
          יצירת לילות ריקים
        </button>
        <button
          className="danger"
          disabled={busy || !from || !to}
          onClick={() => {
            const answer = window.prompt(
              `למחוק את כל המשמרות בין ${formatDate(from)} ל-${formatDate(to)}, כולל השיבוצים? כדי לאשר הקלד "מחק".`,
            );
            if (answer?.trim() !== 'מחק') return;
            run(() => api.adminDeleteNights(from, to).then((n) => setMessage(`נמחקו ${n} משמרות.`)));
          }}
        >
          מחיקת לילות בטווח
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
    </section>
  );
}

function UsersPanel() {
  const me = useMe();
  const users = useQuery(api.adminListUsers, []);
  const { busy, error, run } = useAction();

  function rename(userId: string, current: string | null) {
    const name = window.prompt('השם החדש ברשימה:', current ?? '');
    if (name === null || name.trim() === (current ?? '')) return;
    const renameShifts =
      current !== null && name.trim() !== '' && window.confirm(`להעביר גם את כל המשמרות של "${current}" לשם החדש?`);
    run(() => api.adminSetUserName(userId, name, renameShifts));
  }

  return (
    <section className="card">
      <h2>משתמשים ומנהלים</h2>
      {users.error && <p className="error">{users.error}</p>}
      {users.loading && !users.data && <p className="muted">טוען...</p>}
      <div className="table-wrap">
        <table className="users">
          <thead>
            <tr>
              <th>שם ברשימה</th>
              <th>חשבון</th>
              <th>מנהל</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).map((u) => (
              <tr key={u.id}>
                <td>{u.display_name ?? <span className="muted">לא נבחר</span>}</td>
                <td className="small ltr">{u.email}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={u.is_admin}
                    disabled={busy}
                    aria-label="מנהל"
                    onChange={(e) => {
                      const value = e.target.checked;
                      const who = u.display_name ?? u.email;
                      if (u.id === me.profile.id && !value && !window.confirm('להסיר את עצמך מהמנהלים?')) return;
                      if (value && !window.confirm(`להפוך את ${who} למנהל?`)) return;
                      run(() => api.adminSetAdmin(u.id, value));
                    }}
                  />
                </td>
                <td>
                  <button className="link small" disabled={busy} onClick={() => rename(u.id, u.display_name)}>
                    שינוי שם
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
