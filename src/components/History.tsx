import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { SLOT_HOURS, formatDate, israelToday } from '../lib/dates';
import { dayHeading, historyCategory, involvesMe, israelDay, type HistoryCategory } from '../lib/historyView';
import { useMe, useQuery } from '../lib/hooks';
import { loadAudit } from '../lib/queries';
import type { AuditEntry } from '../lib/types';
import { SkeletonList } from './Skeleton';

const PAGE = 200;

function text(value: unknown, empty = 'פנוי'): string {
  return value === null || value === undefined || value === '' ? empty : String(value);
}

/** ' – "note"' when the action carried a note. */
function quote(note: unknown): string {
  return typeof note === 'string' && note ? ` – "${note}"` : '';
}

function describe(e: AuditEntry): string {
  const d = e.details;
  switch (e.action) {
    case 'take':
      return 'לקיחת משמרת פנויה';
    case 'request_swap':
      return `בקשת חילוף (${text(d.assignee)})${quote(d.note)}`;
    case 'cancel_swap_request':
      return `ביטול בקשת חילוף (${text(d.assignee)})`;
    case 'offer':
      return `התנדבות לקחת את המשמרת של ${text(d.requester)}${quote(d.note)}`;
    case 'withdraw_offer':
      return `ביטול התנדבות (במקום ${text(d.requester)})`;
    case 'swap':
      return `אישור חילוף: ${text(d.from)} ← ${text(d.to)}`;
    case 'send_swap_request':
      return d.give_night
        ? `הצעת החלפה ל${text(d.owner)} (בתמורה ל־${formatDate(String(d.give_night))})${quote(d.note)}`
        : `הצעה ל${text(d.owner)} לקחת את המשמרת, בלי תמורה${quote(d.note)}`;
    case 'withdraw_swap_request':
      return `ביטול הצעת החלפה ל${text(d.owner)}`;
    case 'accept_swap_request':
      return d.give_night
        ? `אישור החלפה: ${text(d.from)} ← ${text(d.to)} (ובתמורה ${formatDate(String(d.give_night))})`
        : `אישור מסירה: ${text(d.from)} ← ${text(d.to)}`;
    case 'decline_swap_request':
      return `דחיית הצעת ההחלפה של ${text(d.requester)}`;
    case 'decline_offer':
      return `דחיית ההתנדבות של ${text(d.volunteer)}`;
    case 'admin_set':
      return `שינוי מנהל: ${text(d.from)} ← ${text(d.to)}`;
    case 'import':
      return `ייבוא ${text(d.nights)} לילות (${text(d.changed)} שינויים) ${text(d.from, '')}–${text(d.to, '')}`;
    case 'add_nights':
      return `יצירת לילות ${text(d.from, '')}–${text(d.to, '')} (${text(d.created)} משמרות)`;
    case 'delete_nights':
      return `מחיקת לילות ${text(d.from, '')}–${text(d.to, '')} (${text(d.deleted)} משמרות)`;
    case 'claim_name':
      return d.from ? `שינוי שם ברשימה: ${text(d.from)} ← ${text(d.to)}` : `בחירת שם ברשימה: ${text(d.to)}`;
    case 'approve_user':
      return `אישור משתמש: ${text(d.user)}`;
    case 'reject_user':
      return `חסימת משתמש: ${text(d.user)}`;
    case 'unapprove_user':
      return `החזרת משתמש להמתנה: ${text(d.user)}`;
    case 'grant_admin':
      return `הוספת מנהל: ${text(d.user)}`;
    case 'revoke_admin':
      return `הסרת מנהל: ${text(d.user)}`;
    case 'delete_user':
      return `מחיקת משתמש: ${text(d.user)}`;
    case 'admin_clear_user_name':
      return `ניתוק משתמש מהשם: ${text(d.from, '—')} (${text(d.user)})`;
    case 'admin_rename_user':
      return `שינוי שם משתמש: ${text(d.from, '—')} ← ${text(d.to, '—')}`;
    default:
      return e.action;
  }
}

type Show = 'all' | 'mine' | HistoryCategory;

const SHOW: [Show, string][] = [
  ['all', 'הכול'],
  ['mine', 'קשור אליי'],
  ['swaps', 'חילופים'],
  ['shifts', 'שיבוצים'],
  ['users', 'משתמשים'],
];

function timeOf(timestamp: string): string {
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }).format(
    new Date(timestamp),
  );
}

export function History() {
  const me = useMe();
  const [limit, setLimit] = useState(PAGE);
  const [filter, setFilter] = useState('');
  const [show, setShow] = useState<Show>('all');
  const entries = useQuery(() => loadAudit(limit), [limit]);
  // Admins also see the Google account behind every action.
  const users = useQuery(
    () => (me.profile.is_admin ? api.adminListUsers() : Promise.resolve([])),
    [me.profile.is_admin],
  );
  const emails = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.email])), [users.data]);

  const days = useMemo(() => {
    const term = filter.trim();
    const rows = (entries.data ?? [])
      .filter((e) =>
        show === 'all'
          ? true
          : show === 'mine'
            ? involvesMe(e, me.profile.id, me.profile.display_name)
            : historyCategory(e.action) === show,
      )
      .map((e) => ({
        entry: e,
        description: describe(e),
        shift: e.night ? `${formatDate(e.night)}${e.slot ? ` ${SLOT_HOURS[e.slot]}` : ''}` : '',
      }))
      .filter(
        (r) =>
          !term ||
          r.description.includes(term) ||
          r.shift.includes(term) ||
          (r.entry.actor_name ?? '').includes(term),
      );
    const grouped = new Map<string, typeof rows>();
    for (const r of rows) {
      const day = israelDay(r.entry.at);
      grouped.set(day, [...(grouped.get(day) ?? []), r]);
    }
    return [...grouped];
  }, [entries.data, filter, show, me.profile.id, me.profile.display_name]);

  const today = israelToday();
  // Users only see the "users" filter when they are admins; for others it would only hold name choices.
  const options = SHOW.filter(([value]) => value !== 'users' || me.profile.is_admin);

  return (
    <div className="page">
      <h2>היסטוריה</h2>
      <div className="filters history-filters" role="group" aria-label="סינון">
        {options.map(([value, label]) => (
          <button
            key={value}
            className={show === value ? 'chip selected' : 'chip'}
            aria-pressed={show === value}
            onClick={() => setShow(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <input type="search" placeholder="חיפוש לפי שם או תאריך" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {entries.error && <p className="error">{entries.error}</p>}
      {entries.loading && !entries.data && <SkeletonList rows={6} tall />}
      {entries.data && days.length === 0 && <p className="empty">אין פעולות שמתאימות לסינון.</p>}
      {days.map(([day, rows]) => (
        <section key={day} className="history-day">
          <h3 className="week-heading">{dayHeading(day, today)}</h3>
          <ul className="history">
            {rows.map(({ entry, description, shift }) => (
              <li key={entry.id}>
                <div className="history-top">
                  <strong>{entry.actor_name ?? 'משתמש ללא שם'}</strong>
                  {entry.actor_id && emails.get(entry.actor_id) && (
                    <span className="muted small ltr-inline"> ({emails.get(entry.actor_id)})</span>
                  )}
                  <span className="muted small history-time">{timeOf(entry.at)}</span>
                </div>
                <div>
                  {description}
                  {shift && <span className="muted"> · {shift}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {entries.data && entries.data.length === limit && (
        <button className="link center" onClick={() => setLimit(limit + PAGE)}>
          הצגת פעולות קודמות
        </button>
      )}
    </div>
  );
}
