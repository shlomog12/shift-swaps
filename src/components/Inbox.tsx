import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/dates';
import { useFocusTrap } from '../lib/focusTrap';
import { useMe, useQuery, useRefresh } from '../lib/hooks';
import { shiftFromUrl } from '../lib/share';
import type { AppNotification } from '../lib/types';
import { BellIcon } from './Icons';
import { SkeletonList } from './Skeleton';

/** The latest inbox entries; null before the inbox migration (the bell is then hidden). */
export function useInbox() {
  return useQuery(api.myNotifications, []);
}

/** The bell in the top bar, with the number of unread entries. */
export function InboxButton({ items, onOpen }: { items: AppNotification[]; onOpen: () => void }) {
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <button
      className="mode-toggle icon-only inbox-button"
      onClick={onOpen}
      aria-label={unread > 0 ? `הודעות, ${unread} חדשות` : 'הודעות'}
      title="הודעות"
    >
      <BellIcon size={18} />
      {unread > 0 && (
        <b className="inbox-badge" aria-hidden="true">
          {unread > 9 ? '9+' : unread}
        </b>
      )}
    </button>
  );
}

/** The inbox: every notice the app sent, newest first. Opening it marks them read. */
export function InboxSheet({ items, onClose }: { items: AppNotification[] | undefined; onClose: () => void }) {
  const me = useMe();
  const { refresh } = useRefresh();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  // What was unread when the sheet opened stays marked as new until it closes.
  const fresh = useRef(new Set((items ?? []).filter((n) => !n.read_at).map((n) => n.id)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (fresh.current.size === 0) return;
    api.markNotificationsRead().then(refresh, () => undefined);
  }, [refresh]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-header">
          <div>
            <h2 id="inbox-title">הודעות</h2>
            <p className="muted small">
              כל מה שנשלח {me.actingFor ? `ל${me.actingFor}` : 'אליך'}: התנדבויות, הצעות, אישורים, תשלומים
              ותזכורות. נשמר 60 יום.
            </p>
          </div>
          <button className="icon" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </header>
        {!items && <SkeletonList rows={4} />}
        {items && items.length === 0 && <p className="empty">אין הודעות עדיין.</p>}
        <ul className="inbox-list">
          {(items ?? []).map((n) => {
            const shift = shiftFromUrl(n.url);
            const content = (
              <>
                <span className="inbox-title">
                  {fresh.current.has(n.id) && <span className="tag swap">חדש</span>} {n.title}
                </span>
                <span className="small">{n.body}</span>
                <span className="muted small">{formatDateTime(n.created_at)}</span>
              </>
            );
            return (
              <li key={n.id} className={fresh.current.has(n.id) ? 'unread' : undefined}>
                {shift ? (
                  <button
                    className="list-item inbox-item"
                    onClick={() => {
                      onClose();
                      me.openShift(shift.night, shift.slot);
                    }}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="inbox-item">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
