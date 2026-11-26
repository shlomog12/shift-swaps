import { useCallback, useEffect, useMemo, useState } from 'react';
import { Admin } from './components/Admin';
import { api } from './lib/api';
import { Board } from './components/Board';
import { Calendar } from './components/Calendar';
import { History } from './components/History';
import { AccessPending, Login, SetupMissing } from './components/Login';
import { MyShifts } from './components/MyShifts';
import { NamePicker } from './components/NamePicker';
import { ShiftSheet } from './components/ShiftSheet';
import {
  MeContext,
  RefreshContext,
  sameName,
  useLiveRefresh,
  useQuery,
  useRefresh,
  useSession,
  type Me,
} from './lib/hooks';
import { hasStarted } from './lib/dates';
import { loadIncomingRequests, loadProfile } from './lib/queries';
import { clearSharedShift, readSharedShift } from './lib/share';
import { isConfigured, supabase } from './lib/supabase';
import type { Profile, ShiftKey } from './lib/types';

type Tab = 'calendar' | 'board' | 'mine' | 'history' | 'admin';

const TABS: { id: Tab; label: string; icon: string; adminOnly?: boolean }[] = [
  { id: 'calendar', label: 'יומן', icon: '📅' },
  { id: 'board', label: 'חילופים', icon: '🔁' },
  { id: 'mine', label: 'שלי', icon: '👤' },
  { id: 'history', label: 'היסטוריה', icon: '🕓' },
  { id: 'admin', label: 'ניהול', icon: '⚙️', adminOnly: true },
];

export function App() {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const refreshValue = useMemo(() => ({ version, refresh }), [version, refresh]);

  if (!isConfigured) return <SetupMissing />;

  return (
    <RefreshContext.Provider value={refreshValue}>
      <SignedInGate />
    </RefreshContext.Provider>
  );
}

function SignedInGate() {
  const { session, ready } = useSession();
  if (!ready) return <div className="center-page muted">טוען...</div>;
  if (!session) return <Login />;
  return <ProfileGate userId={session.user.id} email={session.user.email ?? ''} />;
}

function ProfileGate({ userId, email }: { userId: string; email: string }) {
  const profile = useQuery(() => loadProfile(userId), [userId]);

  const missing = !profile.loading && !profile.error && profile.data === null;
  if ((profile.error && !profile.data) || missing) {
    return (
      <div className="center-page">
        <div className="card">
          <p className="error">{profile.error ?? 'לא נמצא פרופיל למשתמש הזה. נסה להתחבר מחדש, ואם זה חוזר פנה למנהל.'}</p>
          <button onClick={() => supabase.auth.signOut()}>התנתקות</button>
        </div>
      </div>
    );
  }
  if (!profile.data) return <div className="center-page muted">טוען...</div>;
  if (profile.data.status !== 'approved') return <AccessPending status={profile.data.status} email={email} />;
  if (!profile.data.display_name) return <NamePicker />;
  return <Shell profile={profile.data} email={email} />;
}

const ADMIN_MODE_KEY = 'admin-mode';

function Shell({ profile, email }: { profile: Profile; email: string }) {
  const { refresh } = useRefresh();
  const [tab, setTab] = useState<Tab>('calendar');
  // A shift shared by link (e.g. on WhatsApp) opens right away.
  const [open, setOpen] = useState<ShiftKey | null>(readSharedShift);
  useEffect(clearSharedShift, []);
  // Admins can switch to the regular user's view; the server still knows they are an admin.
  const [adminMode, setAdminMode] = useState(() => localStorage.getItem(ADMIN_MODE_KEY) !== 'off');
  useLiveRefresh(true, refresh);

  const isAdmin = profile.is_admin && adminMode;
  const me: Me = useMemo(
    () => ({
      profile: { ...profile, is_admin: isAdmin },
      email,
      isMine: (assignee) => sameName(assignee, profile.display_name),
      openShift: (night, slot) => setOpen({ night, slot }),
    }),
    [profile, email, isAdmin],
  );

  function toggleAdminMode() {
    const next = !adminMode;
    setAdminMode(next);
    localStorage.setItem(ADMIN_MODE_KEY, next ? 'on' : 'off');
  }

  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin);
  const users = useQuery(() => (isAdmin ? api.adminListUsers() : Promise.resolve([])), [isAdmin]);
  const pendingCount = (users.data ?? []).filter((u) => u.status === 'pending').length;
  const incoming = useQuery(() => loadIncomingRequests(profile.display_name ?? ''), [profile.display_name]);
  const incomingCount = (incoming.data ?? []).filter((r) => !hasStarted(r.night, r.slot)).length;
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'calendar';

  return (
    <MeContext.Provider value={me}>
      <header className="top-bar">
        <span className="app-title">משמרות וחילופים</span>
        <span className="user">
          {profile.is_admin && (
            <button
              className={isAdmin ? 'mode-toggle admin' : 'mode-toggle'}
              onClick={toggleAdminMode}
              title="מעבר בין תצוגת מנהל לתצוגת משתמש רגיל"
            >
              {isAdmin ? 'מצב מנהל' : 'תצוגת משתמש'}
            </button>
          )}
          <span className="user-name">{profile.display_name}</span>
          <button className="link small" onClick={() => supabase.auth.signOut()}>
            התנתקות
          </button>
        </span>
      </header>

      <main>
        {activeTab === 'calendar' && <Calendar />}
        {activeTab === 'board' && <Board />}
        {activeTab === 'mine' && <MyShifts />}
        {activeTab === 'history' && <History />}
        {activeTab === 'admin' && <Admin />}
      </main>

      <nav className="tab-bar">
        {tabs.map((t) => (
          <button key={t.id} className={t.id === activeTab ? 'active' : undefined} onClick={() => setTab(t.id)}>
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
            {t.id === 'admin' && pendingCount > 0 && <b className="tab-badge">{pendingCount}</b>}
            {t.id === 'mine' && incomingCount > 0 && <b className="tab-badge">{incomingCount}</b>}
          </button>
        ))}
      </nav>

      {open && <ShiftSheet key={`${open.night}/${open.slot}`} target={open} onClose={() => setOpen(null)} />}
    </MeContext.Provider>
  );
}
