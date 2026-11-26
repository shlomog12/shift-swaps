import { useState } from 'react';
import { api } from '../lib/api';
import { SLOT_HOURS, addDays, formatDate, formatDateTime, israelToday, nightLabel } from '../lib/dates';
import { useAction, useMe, useQuery } from '../lib/hooks';
import { parseSheet, type ImportResult, type ImportRow } from '../lib/importSheet';
import { loadShifts } from '../lib/queries';
import type { AdminUser, Shift } from '../lib/types';

export function Admin() {
  return (
    <div className="page">
      <PendingPanel />
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

  async function analyze(source: string) {
    setMessage(null);
    setError(null);
    const parsed = parseSheet(source);
    if (parsed.rows.length === 0) {
      setPreview(null);
      setError('לא נמצאו שורות עם תאריך. ודא שהטבלה כוללת את עמודת התאריך.');
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

  async function loadFile(file: File) {
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
      setPreview(null);
      setError('אפשר לבחור רק קובץ CSV. בגוגל שיטס: קובץ ← הורדה ← ערכים מופרדים בפסיקים (csv.)');
      return;
    }
    const content = await file.text();
    setText(content);
    await analyze(content);
  }

  const changedCount = preview ? preview.rows.filter((r) => preview.states.get(r.night) !== 'same').length : 0;

  return (
    <section className="card">
      <h2>ייבוא מהגיליון</h2>
      <p className="muted small">
        שתי דרכים: לבחור קובץ CSV שהורד מהגיליון (קובץ ← הורדה ← ערכים מופרדים בפסיקים), או לסמן את הטבלה
        בגיליון, להעתיק ולהדביק בתיבה. העמודות: תאריך, יום, משמרת ראשונה, משמרת שנייה. שורות כותרת מדולגות
        אוטומטית. לילות שכבר קיימים מתעדכנים, ולילות שלא מופיעים בקובץ לא משתנים.
      </p>
      <label className="file-button">
        בחירת קובץ CSV
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) loadFile(file).catch((err: Error) => setError(err.message));
          }}
        />
      </label>
      <p className="muted small">או הדבקה:</p>
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
        <button onClick={() => analyze(text)} disabled={!text.trim() || busy}>
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

function userLabel(u: AdminUser): string {
  return u.display_name ?? u.google_name ?? u.email;
}

function confirmDelete(u: AdminUser): boolean {
  return window.confirm(
    `למחוק את ${u.email}? זה כאילו הוא מעולם לא נכנס: החשבון וההתנדבויות שלו נמחקים, ` +
      'והמשמרות נשארות על השם. אם ייכנס שוב, הוא יחכה לאישור כמו משתמש חדש. כדי שלא יוכל להיכנס בכלל, השתמש בחסימה.',
  );
}

function PendingPanel() {
  const users = useQuery(api.adminListUsers, []);
  const { busy, error, run } = useAction();
  const pending = (users.data ?? []).filter((u) => u.status === 'pending');

  if (pending.length === 0) return null;

  return (
    <section className="card pending-panel">
      <h2>ממתינים לאישור ({pending.length})</h2>
      <p className="muted small">אשר רק אנשים שאתה מזהה לפי השם והמייל. משתמש שלא אושר לא רואה שום מידע.</p>
      <ul className="pending-list">
        {pending.map((u) => (
          <li key={u.id}>
            <span className="list-main">
              <strong>{u.google_name ?? 'ללא שם בגוגל'}</strong>
              <span className="small ltr-inline">{u.email}</span>
              <span className="muted small">נרשם/ה {formatDateTime(u.created_at)}</span>
            </span>
            <span className="row">
              <button className="primary small" disabled={busy} onClick={() => run(() => api.adminSetStatus(u.id, 'approved'))}>
                אישור
              </button>
              <button
                className="small danger"
                disabled={busy}
                onClick={() =>
                  window.confirm(`לחסום את ${u.email}?`) && run(() => api.adminSetStatus(u.id, 'rejected'))
                }
              >
                חסימה
              </button>
              <button
                className="small danger"
                disabled={busy}
                onClick={() => confirmDelete(u) && run(() => api.adminDeleteUser(u.id))}
              >
                מחיקה
              </button>
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function UsersPanel() {
  const me = useMe();
  const users = useQuery(api.adminListUsers, []);
  const { busy, error, run } = useAction();
  const approved = (users.data ?? []).filter((u) => u.status === 'approved');
  const rejected = (users.data ?? []).filter((u) => u.status === 'rejected');

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
            {approved.map((u) => (
              <tr key={u.id}>
                <td>{u.display_name ?? <span className="muted">לא נבחר</span>}</td>
                <td className="small">
                  {u.google_name && <div>{u.google_name}</div>}
                  <div className="ltr">{u.email}</div>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={u.is_admin}
                    disabled={busy}
                    aria-label="מנהל"
                    onChange={(e) => {
                      const value = e.target.checked;
                      if (u.id === me.profile.id && !value && !window.confirm('להסיר את עצמך מהמנהלים?')) return;
                      if (value && !window.confirm(`להפוך את ${userLabel(u)} למנהל?`)) return;
                      run(() => api.adminSetAdmin(u.id, value));
                    }}
                  />
                </td>
                <td className="actions-cell">
                  <button className="link small" disabled={busy} onClick={() => rename(u.id, u.display_name)}>
                    שינוי שם
                  </button>
                  {u.display_name && (
                    <button
                      className="link small danger"
                      disabled={busy}
                      onClick={() =>
                        window.confirm(
                          `לנתק את ${u.email} מהשם "${u.display_name}"? המשמרות נשארות על השם, וההתנדבויות הממתינות שלו יבוטלו. בכניסה הבאה הוא יבחר שם מחדש.`,
                        ) && run(() => api.adminSetUserName(u.id, '', false))
                      }
                    >
                      הסרת שם
                    </button>
                  )}
                  {u.id !== me.profile.id && !u.is_admin && (
                    <button
                      className="link small danger"
                      disabled={busy}
                      onClick={() =>
                        window.confirm(
                          `לחסום את ${userLabel(u)}? הוא לא יוכל להיכנס, והשם שלו ברשימה ישתחרר. המשמרות שלו נשארות.`,
                        ) && run(() => api.adminSetStatus(u.id, 'rejected'))
                      }
                    >
                      חסימה
                    </button>
                  )}
                  {u.id !== me.profile.id && !u.is_admin && (
                    <button
                      className="link small danger"
                      disabled={busy}
                      onClick={() => confirmDelete(u) && run(() => api.adminDeleteUser(u.id))}
                    >
                      מחיקה
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rejected.length > 0 && (
        <details>
          <summary className="muted small">חסומים ({rejected.length})</summary>
          <ul className="pending-list">
            {rejected.map((u) => (
              <li key={u.id}>
                <span className="list-main">
                  <span>{u.google_name ?? 'ללא שם בגוגל'}</span>
                  <span className="small ltr-inline">{u.email}</span>
                </span>
                <span className="row">
                  <button
                    className="small"
                    disabled={busy}
                    onClick={() => run(() => api.adminSetStatus(u.id, 'approved'))}
                  >
                    אישור בכל זאת
                  </button>
                  <button
                    className="small danger"
                    disabled={busy}
                    onClick={() => confirmDelete(u) && run(() => api.adminDeleteUser(u.id))}
                  >
                    מחיקה
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
