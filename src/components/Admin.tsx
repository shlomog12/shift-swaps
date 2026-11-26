import { useState } from 'react';
import { api } from '../lib/api';
import { SLOT_HOURS, addDays, formatDate, formatDateTime, israelToday, nightLabel } from '../lib/dates';
import { useAction, useMe, useQuery } from '../lib/hooks';
import { parseSheet, type ImportResult, type ImportRow } from '../lib/importSheet';
import { loadShifts } from '../lib/queries';
import type { AdminUser, Shift } from '../lib/types';
import { useFeedback } from './Feedback';

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
  const { busy, error, setError, run } = useAction();
  const { confirm, toast } = useFeedback();

  async function analyze(source: string) {
    setError(null);
    const parsed = parseSheet(source);
    if (parsed.rows.length === 0) {
      setPreview(null);
      setError('לא נמצאו שורות עם תאריך. כדאי לבדוק שהטבלה כוללת את עמודת התאריך.');
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

  async function doImport() {
    if (!preview) return;
    const changed = preview.rows.filter((r) => preview.states.get(r.night) !== 'same');
    const ok = await confirm({
      title: `לייבא ${changed.length} לילות?`,
      message: 'לילות חדשים ייווצרו ולילות שהשתנו יתעדכנו. בקשות חילוף על משמרות שהשם בהן משתנה יבוטלו.',
      confirmLabel: 'ייבוא',
    });
    if (!ok) return;
    run(
      () => api.adminImport(changed).then((count) => toast(`הייבוא הסתיים: ${count} משמרות עודכנו`)),
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
  const { busy, error, run } = useAction();
  const { confirm, toast } = useFeedback();

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
            run(() => api.adminAddNights(from, to).then((n) => toast(`נוצרו ${n} משמרות חדשות`)))
          }
        >
          יצירת לילות ריקים
        </button>
        <button
          className="danger"
          disabled={busy || !from || !to}
          onClick={async () => {
            const ok = await confirm({
              title: 'למחוק את הלילות בטווח?',
              message: `כל המשמרות בין ${formatDate(from)} ל־${formatDate(to)} יימחקו, כולל השיבוצים. אי אפשר לבטל את זה. לאישור יש להקליד "מחק".`,
              confirmLabel: 'מחיקה',
              danger: true,
              requireText: 'מחק',
            });
            if (ok) run(() => api.adminDeleteNights(from, to).then((n) => toast(`נמחקו ${n} משמרות`)));
          }}
        >
          מחיקת לילות בטווח
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function userLabel(u: AdminUser): string {
  return u.display_name ?? u.google_name ?? u.email;
}

/** Admin actions on a user, each behind an in-app confirmation and followed by a toast. */
function useUserActions() {
  const { busy, error, run } = useAction();
  const { confirm, toast } = useFeedback();

  async function remove(u: AdminUser) {
    const ok = await confirm({
      title: `למחוק את ${userLabel(u)}?`,
      message: (
        <>
          <p className="ltr-inline">{u.email}</p>
          <p>
            כאילו המשתמש מעולם לא נכנס: החשבון וההתנדבויות נמחקים, והמשמרות נשארות על השם. בכניסה הבאה יידרש אישור
            מחדש. כדי למנוע כניסה בכלל, יש להשתמש בחסימה.
          </p>
        </>
      ),
      confirmLabel: 'מחיקה',
      danger: true,
    });
    if (ok) run(() => api.adminDeleteUser(u.id), () => toast('המשתמש נמחק'));
  }

  async function block(u: AdminUser) {
    const ok = await confirm({
      title: `לחסום את ${userLabel(u)}?`,
      message: 'המשתמש לא יוכל להיכנס, והשם ברשימה ישתחרר. המשמרות נשארות על השם.',
      confirmLabel: 'חסימה',
      danger: true,
    });
    if (ok) run(() => api.adminSetStatus(u.id, 'rejected'), () => toast('המשתמש נחסם'));
  }

  function approve(u: AdminUser) {
    run(() => api.adminSetStatus(u.id, 'approved'), () => toast('המשתמש אושר'));
  }

  return { busy, error, run, confirm, toast, remove, block, approve };
}

function PendingPanel() {
  const users = useQuery(api.adminListUsers, []);
  const { busy, error, remove, block, approve } = useUserActions();
  const pending = (users.data ?? []).filter((u) => u.status === 'pending');

  if (pending.length === 0) return null;

  return (
    <section className="card pending-panel">
      <h2>ממתינים לאישור ({pending.length})</h2>
      <p className="muted small">כדאי לאשר רק אנשים מוכרים לפי השם והמייל. משתמש שלא אושר לא רואה שום מידע.</p>
      <ul className="pending-list">
        {pending.map((u) => (
          <li key={u.id}>
            <span className="list-main">
              <strong>{u.google_name ?? 'ללא שם בגוגל'}</strong>
              <span className="small ltr-inline">{u.email}</span>
              <span className="muted small">הצטרפות: {formatDateTime(u.created_at)}</span>
            </span>
            <span className="row">
              <button className="primary small" disabled={busy} onClick={() => approve(u)}>
                אישור
              </button>
              <button className="small danger" disabled={busy} onClick={() => block(u)}>
                חסימה
              </button>
              <button className="small danger" disabled={busy} onClick={() => remove(u)}>
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
  const { busy, error, run, confirm, toast, remove, block, approve } = useUserActions();
  const { ask } = useFeedback();
  const approved = (users.data ?? []).filter((u) => u.status === 'approved');
  const rejected = (users.data ?? []).filter((u) => u.status === 'rejected');

  async function rename(u: AdminUser) {
    const current = u.display_name;
    const name = await ask({
      title: `שינוי השם ברשימה של ${userLabel(u)}`,
      initial: current ?? '',
      placeholder: 'השם החדש ברשימה',
      confirmLabel: 'המשך',
    });
    if (name === null || name.trim() === (current ?? '')) return;
    const renameShifts =
      current !== null &&
      name.trim() !== '' &&
      (await confirm({
        title: 'להעביר גם את המשמרות?',
        message: `להעביר את כל המשמרות של "${current}" לשם "${name.trim()}"?`,
        confirmLabel: 'כן, להעביר',
        cancelLabel: 'לא, רק את השם',
      }));
    run(() => api.adminSetUserName(u.id, name, renameShifts), () => toast('השם עודכן'));
  }

  async function toggleAdmin(u: AdminUser, value: boolean) {
    const ok = await confirm(
      value
        ? { title: `להפוך את ${userLabel(u)} למנהל?`, message: 'מנהל יכול לערוך כל משמרת ולנהל משתמשים.', confirmLabel: 'הוספת מנהל' }
        : {
            title: u.id === me.profile.id ? 'להסיר את עצמך מהמנהלים?' : `להסיר את ${userLabel(u)} מהמנהלים?`,
            confirmLabel: 'הסרה',
            danger: true,
          },
    );
    if (ok) run(() => api.adminSetAdmin(u.id, value), () => toast(value ? 'המנהל נוסף' : 'המנהל הוסר'));
  }

  async function clearName(u: AdminUser) {
    const ok = await confirm({
      title: `לנתק את ${userLabel(u)} מהשם "${u.display_name}"?`,
      message: 'המשמרות נשארות על השם, וההתנדבויות הממתינות של המשתמש יבוטלו. בכניסה הבאה תתבקש בחירת שם מחדש.',
      confirmLabel: 'ניתוק',
      danger: true,
    });
    if (ok) run(() => api.adminSetUserName(u.id, '', false), () => toast('המשתמש נותק מהשם'));
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
                    onChange={(e) => toggleAdmin(u, e.target.checked)}
                  />
                </td>
                <td className="actions-cell">
                  <button className="link small" disabled={busy} onClick={() => rename(u)}>
                    שינוי שם
                  </button>
                  {u.display_name && (
                    <button className="link small danger" disabled={busy} onClick={() => clearName(u)}>
                      הסרת שם
                    </button>
                  )}
                  {u.id !== me.profile.id && !u.is_admin && (
                    <button className="link small danger" disabled={busy} onClick={() => block(u)}>
                      חסימה
                    </button>
                  )}
                  {u.id !== me.profile.id && !u.is_admin && (
                    <button className="link small danger" disabled={busy} onClick={() => remove(u)}>
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
                  <button className="small" disabled={busy} onClick={() => approve(u)}>
                    אישור בכל זאת
                  </button>
                  <button className="small danger" disabled={busy} onClick={() => remove(u)}>
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
