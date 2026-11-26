import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { SLOT_HOURS, formatDate, formatDateTime } from '../lib/dates';
import { useMe, useQuery } from '../lib/hooks';
import { loadAudit } from '../lib/queries';
import type { AuditEntry } from '../lib/types';

const PAGE = 200;

function text(value: unknown, empty = 'פנוי'): string {
  return value === null || value === undefined || value === '' ? empty : String(value);
}

function describe(e: AuditEntry): string {
  const d = e.details;
  switch (e.action) {
    case 'take':
      return 'לקח/ה משמרת פנויה';
    case 'request_swap':
      return `ביקש/ה חילוף (${text(d.assignee)})`;
    case 'cancel_swap_request':
      return `ביטל/ה בקשת חילוף (${text(d.assignee)})`;
    case 'offer':
      return `התנדב/ה לקחת את המשמרת של ${text(d.requester)}`;
    case 'withdraw_offer':
      return `ביטל/ה התנדבות (במקום ${text(d.requester)})`;
    case 'swap':
      return `אישר/ה חילוף: ${text(d.from)} ← ${text(d.to)}`;
    case 'decline_offer':
      return `דחה/תה את ההתנדבות של ${text(d.volunteer)}`;
    case 'admin_set':
      return `שינוי מנהל: ${text(d.from)} ← ${text(d.to)}`;
    case 'import':
      return `ייבוא ${text(d.nights)} לילות (${text(d.changed)} שינויים) ${text(d.from, '')}–${text(d.to, '')}`;
    case 'add_nights':
      return `יצירת לילות ${text(d.from, '')}–${text(d.to, '')} (${text(d.created)} משמרות)`;
    case 'delete_nights':
      return `מחיקת לילות ${text(d.from, '')}–${text(d.to, '')} (${text(d.deleted)} משמרות)`;
    case 'claim_name':
      return d.from ? `שינוי שם ברשימה: ${text(d.from)} ← ${text(d.to)}` : `בחר/ה שם ברשימה: ${text(d.to)}`;
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
    case 'admin_rename_user':
      return `שינוי שם משתמש: ${text(d.from, '—')} ← ${text(d.to, '—')}`;
    default:
      return e.action;
  }
}

export function History() {
  const me = useMe();
  const [limit, setLimit] = useState(PAGE);
  const [filter, setFilter] = useState('');
  const entries = useQuery(() => loadAudit(limit), [limit]);
  // Admins also see the Google account behind every action.
  const users = useQuery(
    () => (me.profile.is_admin ? api.adminListUsers() : Promise.resolve([])),
    [me.profile.is_admin],
  );
  const emails = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.email])), [users.data]);

  const rows = useMemo(() => {
    const term = filter.trim();
    return (entries.data ?? [])
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
  }, [entries.data, filter]);

  return (
    <div className="page">
      <h2>היסטוריה</h2>
      <input type="search" placeholder="סינון לפי שם או תאריך" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {entries.error && <p className="error">{entries.error}</p>}
      {entries.loading && !entries.data && <p className="muted">טוען...</p>}
      <ul className="history">
        {rows.map(({ entry, description, shift }) => (
          <li key={entry.id}>
            <div className="history-top">
              <strong>{entry.actor_name ?? 'משתמש ללא שם'}</strong>
              {entry.actor_id && emails.get(entry.actor_id) && (
                <span className="muted small"> ({emails.get(entry.actor_id)})</span>
              )}
              <span className="muted small history-time">{formatDateTime(entry.at)}</span>
            </div>
            <div>
              {description}
              {shift && <span className="muted"> · {shift}</span>}
            </div>
          </li>
        ))}
      </ul>
      {entries.data && entries.data.length === limit && (
        <button className="link center" onClick={() => setLimit(limit + PAGE)}>
          הצג עוד
        </button>
      )}
    </div>
  );
}
