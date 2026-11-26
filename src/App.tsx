import { useCallback, useMemo, useState } from 'react';
import { Admin } from './components/Admin';
import { Board } from './components/Board';
import { Calendar } from './components/Calendar';
import { History } from './components/History';
import { Login, SetupMissing } from './components/Login';
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
import { loadProfile } from './lib/queries';
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
  const [renaming, setRenaming] = useState(false);

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

  if (!profile.data.display_name || renaming) {
    return (
      <NamePicker
        currentName={profile.data.display_name}
        onDone={() => setRenaming(false)}
        onCancel={profile.data.display_name ? () => setRenaming(false) : undefined}
      />
    );
  }

  return <Shell profile={profile.data} email={email} onRename={() => setRenaming(true)} />;
}

function Shell({ profile, email, onRename }: { profile: Profile; email: string; onRename: () => void }) {
  const { refresh } = useRefresh();
  const [tab, setTab] = useState<Tab>('calendar');
  const [open, setOpen] = useState<ShiftKey | null>(null);
  useLiveRefresh(true, refresh);

  const me: Me = useMemo(
    () => ({
      profile,
      email,
      isMine: (assignee) => sameName(assignee, profile.display_name),
      openShift: (night, slot) => setOpen({ night, slot }),
    }),
    [profile, email],
  );

  const tabs = TABS.filter((t) => !t.adminOnly || profile.is_admin);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'calendar';

  return (
    <MeContext.Provider value={me}>
      <header className="top-bar">
        <span className="app-title">משמרות וחילופים</span>
        <span className="user">
          <button className="link" onClick={onRename} title="שינוי השם ברשימה">
            {profile.display_name}
          </button>
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
          </button>
        ))}
      </nav>

      {open && <ShiftSheet key={`${open.night}/${open.slot}`} target={open} onClose={() => setOpen(null)} />}
    </MeContext.Provider>
  );
}
