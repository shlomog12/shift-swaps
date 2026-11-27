import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Admin } from './components/Admin';
import { api } from './lib/api';
import { Board } from './components/Board';
import { Calendar } from './components/Calendar';
import { PhoneTip } from './components/MyPhone';
import { FeedbackProvider, useFeedback } from './components/Feedback';
import { History } from './components/History';
import { AccessPending, Login, SetupMissing } from './components/Login';
import { MyShifts } from './components/MyShifts';
import { NamePicker } from './components/NamePicker';
import { ProfileSheet } from './components/Profile';
import { CalendarIcon, EyeIcon, HistoryIcon, SettingsIcon, SwapIcon, UserIcon } from './components/Icons';
import { ShiftSheet } from './components/ShiftSheet';
import { ViewAsPicker } from './components/ViewAs';
import {
  MeContext,
  RefreshContext,
  RosterContext,
  sameName,
  useLiveRefresh,
  useQuery,
  useRefresh,
  useSession,
  type Me,
} from './lib/hooks';
import { awaitingMyDecision, incomingForMe } from './lib/attention';
import { useOnline } from './lib/pwa';
import { loadIncomingRequests, loadPendingOffers, loadProfile, loadUpcomingShifts } from './lib/queries';
import { clearSharedShift, readSharedShift } from './lib/share';
import { isConfigured, supabase } from './lib/supabase';
import { SYSTEM_ADMIN_LABEL, type Profile, type ShiftKey } from './lib/types';
import { paymentsNeedingMe } from './components/PaidSwap';
import { SkeletonPage } from './components/Skeleton';

type Tab = 'calendar' | 'board' | 'mine' | 'history' | 'admin';

const TABS: { id: Tab; label: string; icon: ReactNode; adminOnly?: boolean }[] = [
  { id: 'calendar', label: 'יומן', icon: <CalendarIcon /> },
  { id: 'board', label: 'חילופים', icon: <SwapIcon /> },
  { id: 'mine', label: 'שלי', icon: <UserIcon /> },
  { id: 'history', label: 'היסטוריה', icon: <HistoryIcon /> },
  { id: 'admin', label: 'ניהול', icon: <SettingsIcon />, adminOnly: true },
];

export function App() {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const refreshValue = useMemo(() => ({ version, refresh }), [version, refresh]);

  if (!isConfigured) return <SetupMissing />;

  return (
    <RefreshContext.Provider value={refreshValue}>
      <FeedbackProvider>
        <SignedInGate />
      </FeedbackProvider>
    </RefreshContext.Provider>
  );
}

function SignedInGate() {
  const { session, ready } = useSession();
  if (!ready) return <SkeletonPage />;
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
          <p className="error">{profile.error ?? 'לא נמצא פרופיל למשתמש הזה. כדאי להתחבר מחדש, ואם זה חוזר – לפנות למנהל.'}</p>
          <button onClick={() => supabase.auth.signOut()}>התנתקות</button>
        </div>
      </div>
    );
  }
  if (!profile.data) return <SkeletonPage />;
  if (profile.data.status !== 'approved') return <AccessPending status={profile.data.status} email={email} />;
  // Admins may have no roster name: a system manager who runs the roster but is not one of the guards.
  if (!profile.data.display_name && !profile.data.is_admin) return <NamePicker email={email} />;
  return <Shell profile={profile.data} email={email} />;
}

const ADMIN_MODE_KEY = 'admin-mode';

function Shell({ profile, email }: { profile: Profile; email: string }) {
  const { refresh } = useRefresh();
  const { confirm, toast } = useFeedback();
  const [tab, setTab] = useState<Tab>('calendar');
  // A shift shared by link (e.g. on WhatsApp) opens right away.
  const [open, setOpen] = useState<ShiftKey | null>(readSharedShift);
  const [profileOpen, setProfileOpen] = useState(false);
  const online = useOnline();
  useEffect(clearSharedShift, []);
  // Admins can switch to the regular user's view; the server still knows they are an admin.
  const [adminMode, setAdminMode] = useState(() => localStorage.getItem(ADMIN_MODE_KEY) !== 'off');
  useLiveRefresh(true, refresh);

  const system = !profile.display_name; // only admins get this far without a name
  const users = useQuery(() => (profile.is_admin ? api.adminListUsers() : Promise.resolve([])), [profile.is_admin]);
  // Any admin can act as another user: the server then runs every action as that user and records the admin
  // in the history. A roster name nobody has claimed yet can only be viewed, not acted for.
  const acting = useQuery(() => (profile.is_admin ? api.myActAs() : Promise.resolve(null)), [profile.is_admin]);
  const [viewOnly, setViewOnly] = useState<string | null>(null);
  const [pickingViewAs, setPickingViewAs] = useState(false);
  const actingUser = acting.data ? (users.data ?? []).find((u) => u.id === acting.data) : undefined;
  const viewing = actingUser?.display_name ?? (acting.data ? null : viewOnly);
  const readOnly = !actingUser && viewOnly ? viewOnly : null;
  const isAdmin = !viewing && profile.is_admin && (adminMode || system);
  const shown: Profile = viewing
    ? {
        id: actingUser?.id ?? '', // a name nobody has claimed yet: no offers or requests of their own
        display_name: viewing,
        is_admin: false,
        status: 'approved',
        created_at: actingUser?.created_at ?? profile.created_at,
      }
    : profile;
  const me: Me = useMemo(
    () => ({
      profile: { ...shown, is_admin: isAdmin },
      email: viewing ? (actingUser?.email ?? '') : email,
      isMine: (assignee) => sameName(assignee, shown.display_name),
      openShift: (night, slot) => setOpen({ night, slot }),
      readOnly,
      actingFor: viewing,
    }),
    // `shown` is rebuilt every render; these are what it is made of.
    [profile, email, isAdmin, viewing, actingUser, readOnly],
  );

  async function viewAs(name: string | null) {
    const user = name ? (users.data ?? []).find((u) => u.status === 'approved' && sameName(u.display_name, name)) : undefined;
    try {
      if (user || acting.data) await api.adminActAs(user?.id ?? null);
      setViewOnly(name && !user ? name : null);
      setTab('calendar');
      if (name) toast(user ? `מעכשיו הפעולות נעשות בשם ${name}` : `${name} עוד לא באפליקציה: תצוגה בלבד`, 'info');
      else toast('יצאת מ"פעולה בשם"', 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      refresh();
    }
  }

  // Acting as someone is kept on the server (for up to 12 hours), so it survives closing the app. When the app
  // opens already acting for someone, ask once whether to go on, so nothing is done for them by mistake.
  const askedResume = useRef(false);
  const resumedName = acting.data ? actingUser?.display_name : undefined;
  useEffect(() => {
    if (askedResume.current || acting.loading || users.loading) return;
    askedResume.current = true;
    if (!resumedName) return;
    confirm({
      title: `עדיין פועלים בשם ${resumedName}`,
      message: `"פעולה בשם" נשארה פעילה מהפעם הקודמת. כל פעולה תירשם כאילו ${resumedName} עשו אותה, עם השם שלך לצדה.`,
      confirmLabel: `המשך בשם ${resumedName}`,
      cancelLabel: 'יציאה מ"פעולה בשם"',
    }).then((goOn) => {
      if (!goOn) viewAs(null);
    });
    // Only the first load decides; later changes come from the admin's own choices.
  }, [acting.loading, users.loading, resumedName]);

  function toggleAdminMode() {
    const next = !adminMode;
    setAdminMode(next);
    localStorage.setItem(ADMIN_MODE_KEY, next ? 'on' : 'off');
    toast(next ? 'עברת למצב מנהל' : 'עברת למצב משתמש: כך האפליקציה נראית למשתמש רגיל', 'info');
  }

  const upcoming = useQuery(loadUpcomingShifts, []);
  const pendingOffers = useQuery(loadPendingOffers, []);
  const incoming = useQuery(() => loadIncomingRequests(shown.display_name ?? ''), [shown.display_name]);
  // Before the paid-swaps migration the function does not exist: no payments.
  const payments = useQuery(() => api.myPayments().catch(() => []), [shown.id]);
  const phones = useQuery(api.memberPhones, []);
  const roster = useMemo(
    () => ({ upcoming, pendingOffers, incoming, payments, phones }),
    [upcoming, pendingOffers, incoming, payments, phones],
  );
  const decisionCount = useMemo(() => {
    const shifts = upcoming.data ?? [];
    return (
      awaitingMyDecision(shifts, pendingOffers.data ?? [], me.isMine).length +
      incomingForMe(shifts, incoming.data ?? [], me.isMine).length +
      paymentsNeedingMe(payments.data ?? [], me)
    );
  }, [upcoming.data, pendingOffers.data, incoming.data, payments.data, me]);

  const tabs = TABS.filter((t) => (!t.adminOnly || isAdmin) && !(system && !viewing && t.id === 'mine'));
  const pendingCount = isAdmin ? (users.data ?? []).filter((u) => u.status === 'pending').length : 0;
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'calendar';

  return (
    <MeContext.Provider value={me}>
    <RosterContext.Provider value={roster}>
      <header className={isAdmin ? 'top-bar admin-mode' : 'top-bar'}>
        <span className="app-title">משמרות וחילופים</span>
        <span className="user">
          {profile.is_admin && !system && !viewing && (
            <button
              className={isAdmin ? 'mode-toggle admin' : 'mode-toggle'}
              onClick={toggleAdminMode}
              aria-label={isAdmin ? 'כרגע במצב מנהל. מעבר למצב משתמש' : 'כרגע במצב משתמש. מעבר למצב מנהל'}
            >
              <SwapIcon size={15} />
              {isAdmin ? 'מעבר למצב משתמש' : 'מעבר למצב מנהל'}
            </button>
          )}
          {isAdmin && (
            <button
              className="mode-toggle icon-only"
              onClick={() => setPickingViewAs(true)}
              aria-label="כניסה בשם משתמש"
              title="כניסה בשם משתמש"
            >
              <EyeIcon size={17} />
            </button>
          )}
          <button className="user-button" onClick={() => setProfileOpen(true)} aria-label="פרופיל והגדרות">
            <UserIcon size={18} /> {profile.display_name ?? SYSTEM_ADMIN_LABEL}
          </button>
        </span>
      </header>

      {viewing && (
        <div className="view-as-bar" role="status">
          <span>
            {readOnly ? (
              <>
                תצוגה בלבד: <strong>{viewing}</strong> עוד לא באפליקציה
              </>
            ) : (
              <>
                פעולה בשם <strong>{viewing}</strong>: כל פעולה תירשם בהיסטוריה כ&quot;
                {profile.display_name ?? SYSTEM_ADMIN_LABEL} בשם {viewing}&quot;. נגמר מעצמו אחרי 12 שעות.
              </>
            )}
          </span>
          <span className="view-as-buttons">
            <button className="small" onClick={() => setPickingViewAs(true)}>
              החלפה
            </button>
            <button className="small" onClick={() => viewAs(null)}>
              יציאה
            </button>
          </span>
        </div>
      )}

      {!online && (
        <div className="offline-bar" role="status">
          אין חיבור לאינטרנט. המידע עשוי להיות לא מעודכן, ואי אפשר לבצע פעולות עד שהחיבור יחזור.
        </div>
      )}

      <main>
        {!viewing && <PhoneTip />}
        {activeTab === 'calendar' && <Calendar />}
        {activeTab === 'board' && <Board />}
        {activeTab === 'mine' && <MyShifts />}
        {activeTab === 'history' && <History />}
        {activeTab === 'admin' && <Admin />}
      </main>

      <nav className="tab-bar">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={t.id === activeTab ? 'active' : undefined}
            aria-current={t.id === activeTab ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
            {t.id === 'admin' && pendingCount > 0 && <b className="tab-badge">{pendingCount}</b>}
            {t.id === 'mine' && decisionCount > 0 && (
              <b className="tab-badge" aria-label={`${decisionCount} ממתינים להחלטה שלך`}>
                {decisionCount}
              </b>
            )}
          </button>
        ))}
      </nav>

      {pickingViewAs && (
        <ViewAsPicker
          current={viewing}
          onPick={(name) => {
            setPickingViewAs(false);
            viewAs(name);
          }}
          onClose={() => setPickingViewAs(false)}
        />
      )}
      {profileOpen && <ProfileSheet onClose={() => setProfileOpen(false)} />}
      {open && <ShiftSheet key={`${open.night}/${open.slot}`} target={open} onClose={() => setOpen(null)} />}
    </RosterContext.Provider>
    </MeContext.Provider>
  );
}
