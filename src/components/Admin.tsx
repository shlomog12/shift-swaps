import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { addDays, formatDate, formatDateRange, formatDateTime, israelToday } from '../lib/dates';
import { sameName, useAction, useMe, useQuery } from '../lib/hooks';
import { parseSheet, type ImportResult } from '../lib/importSheet';
import { loadShifts } from '../lib/queries';
import { appLink } from '../lib/share';
import { SYSTEM_ADMIN_LABEL, type AdminUser, type Shift } from '../lib/types';
import { useFocusTrap } from '../lib/focusTrap';
import { useFeedback } from './Feedback';
import { PreviewTable, rowState, type RowState } from './ImportPreview';
import { AdminNamePicker } from './AdminNamePicker';
import { MoreIcon } from './Icons';
import { ContinuationPanel } from './ContinuationPanel';
import { PlanPanel } from './PlanPanel';
import { OpenSoonAlert, ReportsPanel } from './Reports';
import { SkeletonList } from './Skeleton';

type AdminTab = 'users' | 'reports' | 'nights' | 'import';

const ADMIN_TAB_KEY = 'admin-tab';

export function Admin() {
  const [tab, setTab] = useState<AdminTab>(() => (sessionStorage.getItem(ADMIN_TAB_KEY) as AdminTab) || 'users');
  const users = useQuery(api.adminListUsers, []);
  const pending = (users.data ?? []).filter((u) => u.status === 'pending').length;

  function choose(next: AdminTab) {
    setTab(next);
    sessionStorage.setItem(ADMIN_TAB_KEY, next);
  }

  const tabs: [AdminTab, string][] = [
    ['users', 'משתמשים'],
    ['reports', 'דוחות'],
    ['nights', 'בניית לוח'],
    ['import', 'ייבוא'],
  ];

  return (
    <div className="page">
      <OpenSoonAlert />
      <div className="segmented admin-tabs" role="tablist" aria-label="ניהול">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'selected' : undefined}
            onClick={() => choose(id)}
          >
            {label}
            {id === 'users' && pending > 0 && <b className="inline-badge">{pending}</b>}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'users' && (
          <>
            <PendingPanel />
            <UsersPanel />
          </>
        )}
        {tab === 'reports' && <ReportsPanel />}
        {tab === 'nights' && (
          <>
            <PlanPanel />
            <ContinuationPanel />
            <NightsPanel />
          </>
        )}
        {tab === 'import' && <ImportPanel />}
      </div>
    </div>
  );
}

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
      () => api.adminImport(changed).then((count) => toast(count === 1 ? 'הייבוא הסתיים: משמרת אחת עודכנה' : `הייבוא הסתיים: ${count} משמרות עודכנו`)),
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
            {preview.rows.length} לילות ({formatDateRange(preview.rows[0].night, preview.rows[preview.rows.length - 1].night, true)}).{' '}
            {changedCount} חדשים או משתנים.
            {preview.skipped.length > 0 && ` ${preview.skipped.length} שורות ללא תאריך דולגו.`}
          </p>
          {preview.duplicates.length > 0 && (
            <p className="error small">
              תאריכים כפולים (נלקחה השורה האחרונה): {preview.duplicates.map(formatDate).join(', ')}
            </p>
          )}
          <PreviewTable rows={preview.rows} existing={preview.existing} />
        </>
      )}
    </section>
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
            run(() => api.adminAddNights(from, to).then((n) => toast(n === 1 ? 'נוצרה משמרת חדשה אחת' : `נוצרו ${n} משמרות חדשות`)))
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
            if (ok) run(() => api.adminDeleteNights(from, to).then((n) => toast(n === 1 ? 'נמחקה משמרת אחת' : `נמחקו ${n} משמרות`)));
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
  const { confirm, toast, shareOffer } = useFeedback();

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
    return ok;
  }

  async function block(u: AdminUser) {
    const ok = await confirm({
      title: `לחסום את ${userLabel(u)}?`,
      message: 'המשתמש לא יוכל להיכנס, והשם ברשימה ישתחרר. המשמרות נשארות על השם.',
      confirmLabel: 'חסימה',
      danger: true,
    });
    if (ok) run(() => api.adminSetStatus(u.id, 'rejected'), () => toast('המשתמש נחסם'));
    return ok;
  }

  function approve(u: AdminUser) {
    run(
      () => api.adminSetStatus(u.id, 'approved'),
      () => {
        toast('המשתמש אושר');
        const name = u.google_name ?? '';
        shareOffer({
          message: 'אפשר להודיע על האישור בוואטסאפ',
          text:
            `היי${name ? ` ${name}` : ''}, אישרתי אותך באפליקציית המשמרות. ` +
            `אפשר להיכנס ולבחור את השם שלך ברשימה:\n${appLink()}`,
          label: 'הודעה בוואטסאפ',
        });
      },
    );
  }

  /** Approves and makes an admin at once: a system manager, who needs no roster name. */
  async function approveAsSystem(u: AdminUser) {
    const ok = await confirm({
      title: `לאשר את ${userLabel(u)} כאחראי מערכת?`,
      message: (
        <>
          <p className="ltr-inline">{u.email}</p>
          <p>
            אחראי מערכת הוא מנהל בלי שם ברשימת השמירה: מנהל את השבצ"ק, מאשר משתמשים ומשבץ למשמרות, אבל לא משובץ
            בעצמו. אם הוא גם שומר, עדיף לאשר רגיל, ואחרי שבחר שם להפוך אותו למנהל.
          </p>
        </>
      ),
      confirmLabel: 'אישור כאחראי מערכת',
    });
    if (ok) run(() => api.adminSetAdmin(u.id, true), () => toast('אושר כאחראי מערכת'));
  }

  return { busy, error, run, confirm, toast, remove, block, approve, approveAsSystem };
}

function PendingPanel() {
  const users = useQuery(api.adminListUsers, []);
  const { busy, error, remove, block, approve, approveAsSystem } = useUserActions();
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
              <button className="small" disabled={busy} onClick={() => approveAsSystem(u)}>
                כאחראי מערכת
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
  const users = useQuery(api.adminListUsers, []);
  const { busy, error, approve, remove } = useUserActions();
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const term = filter.trim().toLowerCase();
  const matches = (u: AdminUser) =>
    !term || [u.display_name, u.google_name, u.email].some((v) => v?.toLowerCase().includes(term));
  const approved = (users.data ?? []).filter((u) => u.status === 'approved' && matches(u));
  const rejected = (users.data ?? []).filter((u) => u.status === 'rejected');

  return (
    <section className="card">
      <h2>משתמשים ומנהלים</h2>
      {users.error && <p className="error">{users.error}</p>}
      {users.loading && !users.data && <SkeletonList rows={3} />}
      {(users.data ?? []).length > 6 && (
        <input type="search" placeholder="חיפוש לפי שם או מייל" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}
      <ul className="user-list">
        {approved.map((u) => (
          <li key={u.id}>
            <span className="list-main">
              <strong>
                {u.display_name ?? (u.is_admin ? SYSTEM_ADMIN_LABEL : <span className="muted">לא נבחר שם</span>)}
                {u.is_admin && <span className="tag admin-tag">מנהל</span>}
              </strong>
              {u.google_name && <span className="small">{u.google_name}</span>}
              <span className="small muted ltr-inline">{u.email}</span>
            </span>
            <button
              className="icon more-button"
              disabled={busy}
              aria-label={`פעולות על ${userLabel(u)}`}
              aria-haspopup="dialog"
              onClick={() => setSelected(u)}
            >
              <MoreIcon />
            </button>
          </li>
        ))}
        {term && approved.length === 0 && <li className="muted small">לא נמצאו משתמשים.</li>}
      </ul>

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
      {selected && <UserActionsSheet user={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

/** Everything an admin can do to one user, in a sheet; destructive actions are set apart at the bottom. */
function UserActionsSheet({ user: u, onClose }: { user: AdminUser; onClose: () => void }) {
  const me = useMe();
  const { busy, error, run, confirm, toast, remove, block } = useUserActions();
  const sheetRef = useRef<HTMLDivElement>(null);
  useFocusTrap(sheetRef);
  const self = u.id === me.profile.id;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const [picking, setPicking] = useState(false);

  /** After a name was picked in the list: optionally move the old name's shifts, then save. */
  async function rename(name: string) {
    setPicking(false);
    const current = u.display_name;
    if (sameName(name, current)) return;
    const renameShifts =
      current !== null &&
      (await confirm({
        title: 'להעביר גם את המשמרות?',
        message: `להעביר את כל המשמרות של "${current}" לשם "${name}"? בלי העברה, המשמרות נשארות רשומות על "${current}".`,
        confirmLabel: 'כן, להעביר',
        cancelLabel: 'לא, רק את השם',
      }));
    run(() => api.adminSetUserName(u.id, name, renameShifts), () => {
      toast(`השם נקבע: ${name}`);
      onClose();
    });
  }

  async function toggleAdmin() {
    const value = !u.is_admin;
    const ok = await confirm(
      value
        ? { title: `להפוך את ${userLabel(u)} למנהל?`, message: 'מנהל יכול לערוך כל משמרת ולנהל משתמשים.', confirmLabel: 'הוספת מנהל' }
        : {
            title: self ? 'להסיר את עצמך מהמנהלים?' : `להסיר את ${userLabel(u)} מהמנהלים?`,
            message: u.display_name
              ? undefined
              : 'לחשבון אין שם ברשימה, אז אחרי ההסרה הוא יתבקש לבחור שם מהרשימה כדי להמשיך להשתמש באפליקציה.',
            confirmLabel: 'הסרה',
            danger: true,
          },
    );
    if (ok)
      run(() => api.adminSetAdmin(u.id, value), () => {
        toast(value ? 'המנהל נוסף' : 'המנהל הוסר');
        onClose();
      });
  }

  async function clearName() {
    const ok = await confirm({
      title: `לנתק את ${userLabel(u)} מהשם "${u.display_name}"?`,
      message: 'המשמרות נשארות על השם, וההתנדבויות הממתינות של המשתמש יבוטלו. בכניסה הבאה תתבקש בחירת שם מחדש.',
      confirmLabel: 'ניתוק',
      danger: true,
    });
    if (ok)
      run(() => api.adminSetUserName(u.id, '', false), () => {
        toast('המשתמש נותק מהשם');
        onClose();
      });
  }

  const canBlockOrDelete = !self && !u.is_admin;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-sheet-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-header">
          <div>
            <h2 id="user-sheet-title">{u.display_name ?? (u.is_admin ? SYSTEM_ADMIN_LABEL : 'לא נבחר שם')}</h2>
            <p className="muted small">
              {u.google_name && <>{u.google_name} · </>}
              <span className="ltr-inline">{u.email}</span>
            </p>
          </div>
          <button className="icon" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="actions">
          <button disabled={busy} onClick={() => setPicking(true)}>
            {u.display_name ? 'שינוי השם ברשימה' : 'קביעת שם ברשימה'}
          </button>
          <button disabled={busy} onClick={toggleAdmin}>
            {u.is_admin ? (self ? 'הסרת עצמי מהמנהלים' : 'הסרה מהמנהלים') : 'הפיכה למנהל'}
          </button>
        </div>

        <section className="danger-zone">
          <h3>פעולות שקשה לבטל</h3>
          <div className="actions">
            {u.display_name && (
              <button className="danger" disabled={busy} onClick={clearName}>
                ניתוק מהשם ברשימה
              </button>
            )}
            {canBlockOrDelete ? (
              <>
                <button className="danger" disabled={busy} onClick={() => block(u).then((ok) => ok && onClose())}>
                  חסימה
                </button>
                <button className="danger" disabled={busy} onClick={() => remove(u).then((ok) => ok && onClose())}>
                  מחיקה
                </button>
              </>
            ) : (
              <p className="muted small">
                {self ? 'אי אפשר לחסום או למחוק את עצמך.' : 'כדי לחסום או למחוק מנהל, קודם מסירים אותו מהמנהלים.'}
              </p>
            )}
          </div>
        </section>
        {error && <p className="error">{error}</p>}
      </div>
      {picking && (
        <AdminNamePicker
          userLabel={userLabel(u)}
          current={u.display_name}
          onPick={rename}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
