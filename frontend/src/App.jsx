import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { api, getStoredUser, getAuthToken, setAuthToken, setStoredUser, checkIsAdmin } from './api';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import TodayTab from './components/TodayTab';
import DashboardTab from './components/DashboardTab';
import TimetableTab from './components/TimetableTab';
import ForecastTab from './components/ForecastTab';
import OfflineBanner from './components/OfflineBanner';
import LiquidNavbar from './components/LiquidNavbar';
import AppLaunchExperience from './components/AppLaunchExperience';
import { registerServiceWorker } from './notifications';
import { checkForAppUpdate, installAppUpdate, CURRENT_APP_VERSION } from './updateChecker';
import BrandLogo from './components/BrandLogo';

const SettingsModal = lazy(() => import('./components/SettingsModal'));
const NotificationPromptModal = lazy(() => import('./components/NotificationPromptModal'));
const AdminModal = lazy(() => import('./components/AdminModal'));

export default function App() {
  const [user, setUser] = useState(() => getStoredUser());
  const [hasUpdate, setHasUpdate] = useState(() => {
    try {
      return localStorage.getItem('apy_has_update_badge') === 'true';
    } catch {
      return false;
    }
  });
  const [updateInfo, setUpdateInfo] = useState(() => {
    try {
      const cached = localStorage.getItem('apy_update_check_cache');
      return cached ? JSON.parse(cached)?.data : null;
    } catch {
      return null;
    }
  });
  const [summary, setSummary] = useState(() => {
    try {
      const cached = localStorage.getItem('apy_summary_cache');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (['today', 'dashboard', 'timetable', 'forecast'].includes(tabParam)) {
        return tabParam;
      }
    } catch {}
    return 'today';
  });
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('profile');
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const headerLogoRef = useRef(null);
  const attendanceTargetRef = useRef(null);
  const todayAttendanceRef = attendanceTargetRef;
  const [hasPlayedIntro, setHasPlayedIntro] = useState(() => {
    try {
      return sessionStorage.getItem('apy_intro_played') === 'true';
    } catch {
      return false;
    }
  });

  const [introStage, setIntroStage] = useState(() => {
    try {
      if (sessionStorage.getItem('apy_intro_played') === 'true') {
        return 'complete';
      }
    } catch {}
    return 'logo-center';
  });

  // Continuous unified intro timeline for authenticated users
  useEffect(() => {
    if (!user || hasPlayedIntro) {
      setIntroStage('complete');
      return;
    }

    const isReduced = typeof window !== 'undefined' && 
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isReduced) {
      setIntroStage('complete');
      setHasPlayedIntro(true);
      return;
    }

    // Sequence:
    // 0ms: 'logo-center' (Logo + ATT PER Y in center)
    // 450ms: 'glide-to-header' (Logo + ATT PER Y physically glide into real header)
    // 1200ms: 'attendance-large' (Attendance visualization appears large in center)
    // 2700ms: 'attendance-shrink' (Large visualization smoothly shrinks into Today layout)
    // 3500ms: 'complete' (Permanent interactive Today component)

    const t1 = setTimeout(() => setIntroStage('glide-to-header'), 450);
    const t2 = setTimeout(() => setIntroStage('attendance-large'), 1200);
    const t3 = setTimeout(() => setIntroStage('attendance-shrink'), 2700);
    const t4 = setTimeout(() => {
      setIntroStage('complete');
      setHasPlayedIntro(true);
      try {
        sessionStorage.setItem('apy_intro_played', 'true');
      } catch {}
    }, 3500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [user, hasPlayedIntro]);

  useEffect(() => {
    // 1. Initialize background service worker
    registerServiceWorker();

    // 2. Initialize user session & check notification prompt eligibility
    initSession();

    // 3. Direct URL / Query deep-linking to Admin Modal (?tab=admin or ?admin=true or #admin)
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'admin' || params.get('admin') === 'true' || params.get('admin') === '1' || window.location.hash === '#admin') {
        setShowAdminModal(true);
      }
    } catch {}

    // 4. Silent, non-blocking update check
    checkForAppUpdate().then((res) => {
      if (res?.hasUpdate) {
        setHasUpdate(true);
        setUpdateInfo(res);
      }
    }).catch(() => {});

    // Sync device version
    api.syncUserDevice('web', CURRENT_APP_VERSION).catch(() => {});

    // Listen for auth expiration events
    const handleAuthExpired = () => {
      setUser(null);
      setAuthToken(null);
      setStoredUser(null);
    };
    window.addEventListener('apy_auth_expired', handleAuthExpired);
    return () => window.removeEventListener('apy_auth_expired', handleAuthExpired);
  }, []);

  // 3. Live in-app reminder scheduler for active browser tabs & PWAs
  useEffect(() => {
    if (!user) return;
    const firedMinutes = new Set();

    const checkReminders = async () => {
      try {
        if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
          return;
        }

        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const currentTimeStr = `${hours}:${minutes}`;

        if (firedMinutes.has(currentTimeStr)) return;

        const config = await api.getNotificationConfig().catch(() => null);
        if (!config || !config.enabled || !Array.isArray(config.active_times)) return;

        const matchingTime = config.active_times.find(t => t.time_of_day === currentTimeStr);
        if (matchingTime) {
          firedMinutes.add(currentTimeStr);
          try {
            if ('serviceWorker' in navigator) {
              const reg = await navigator.serviceWorker.ready;
              reg.showNotification('Attendance Tracker ⏰', {
                body: 'Did you attend your classes today? Tap to record your attendance.',
                icon: '/favicon.svg',
                badge: '/favicon.svg',
                tag: `attendance-reminder-${currentTimeStr}`,
                renotify: true,
                data: { url: '/?tab=today' }
              });
            } else {
              new Notification('Attendance Tracker ⏰', {
                body: 'Did you attend your classes today? Tap to record your attendance.',
                icon: '/favicon.svg'
              });
            }
          } catch (notifErr) {
            new Notification('Attendance Tracker ⏰', {
              body: 'Did you attend your classes today? Tap to record your attendance.',
              icon: '/favicon.svg'
            });
          }
        }
      } catch (e) {
        // Non-blocking catch
      }
    };

    checkReminders();
    const interval = setInterval(checkReminders, 10000);
    return () => clearInterval(interval);
  }, [user]);

  const checkNotificationPromptEligibility = async () => {
    try {
      const dismissed = localStorage.getItem('apy_notif_prompt_dismissed');
      if (dismissed) return;

      const config = await api.getNotificationConfig();
      if (!config.has_preferences) {
        // First-time user without reminder configuration -> show prompt
        setShowNotifPrompt(true);
      }
    } catch (e) {
      // Quietly ignore if offline or network failure
    }
  };

  const initSession = async () => {
    // Immediate dismissal: never block UI on remote requests
    setLoading(false);

    const token = getAuthToken();
    if (!token) return;

    try {
      // Parallelize profile verification & summary fetching in background
      const [userData, summaryData] = await Promise.all([
        api.getMe().catch(() => null),
        api.getSummary().catch(() => null)
      ]);

      if (userData && userData.user) {
        const u = {
          ...userData.user,
          is_admin: checkIsAdmin(userData.user)
        };
        setUser(u);
        setStoredUser(u);
        if (summaryData) {
          setSummary(summaryData);
          try {
            localStorage.setItem('apy_summary_cache', JSON.stringify(summaryData));
          } catch {}
        }
        checkNotificationPromptEligibility();
      }
    } catch (err) {
      // Ignore transient errors; user continues using cached credentials
    }
  };

  const handleAttendanceUpdated = (freshSummary) => {
    if (freshSummary) {
      setSummary(freshSummary);
      try {
        localStorage.setItem('apy_summary_cache', JSON.stringify(freshSummary));
      } catch {}
    } else {
      loadSummary();
    }
  };

  const loadSummary = async () => {
    try {
      const data = await api.getSummary();
      setSummary(data);
      try {
        localStorage.setItem('apy_summary_cache', JSON.stringify(data));
      } catch {}
    } catch (err) {
      console.error(err);
    }
  };

  const handleAuthSuccess = (authenticatedUser) => {
    const u = {
      ...authenticatedUser,
      is_admin: checkIsAdmin(authenticatedUser)
    };
    setUser(u);
    setStoredUser(u);
    loadSummary();
    checkNotificationPromptEligibility();
    if (checkIsAdmin(u)) {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('admin') === 'true' || params.get('tab') === 'admin' || window.location.hash === '#admin') {
          setShowAdminModal(true);
        }
      } catch {}
    }
  };

  const handleLogout = () => {
    try {
      api.logout();
    } catch {}
    setAuthToken(null);
    setStoredUser(null);
    setUser(null);
    setSummary(null);
    setActiveTab('today');
    setShowNotifPrompt(false);
    setHasPlayedIntro(false);
    setIntroStage('logo-center');
    try {
      sessionStorage.removeItem('apy_intro_played');
    } catch {}
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--ink)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
            <BrandLogo size={56} />
          </div>
          <div className="font-serif" style={{ fontSize: '1.15rem', fontWeight: 700 }}>
            <span style={{ color: '#c5a059' }}>ATT</span> <span style={{ color: 'var(--brand-forest)' }}>PER Y</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>Academic Ledger</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-viewport">
      <OfflineBanner />
      {!user ? (
        <AuthModal onAuthSuccess={handleAuthSuccess} />
      ) : (
        <>
          <Header
            user={user}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onOpenSettings={() => {
              setSettingsTab('profile');
              setShowSettings(true);
            }}
            onOpenReminders={() => {
              setSettingsTab('reminders');
              setShowSettings(true);
            }}
            onOpenAdmin={() => setShowAdminModal(true)}
            onLogout={handleLogout}
            hasUpdate={hasUpdate}
            brandLogoRef={headerLogoRef}
            introStage={introStage}
          />

          {/* Real-time Update Notification Banner for Previous Versions */}
          {hasUpdate && updateInfo && (
            <aside 
              aria-label="App update available"
              className="update-notification-banner"
              style={{
                background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                borderBottom: '1px solid rgba(245, 158, 11, 0.4)',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                position: 'relative',
                zIndex: 35
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <span style={{ fontSize: '20px' }}>🚀</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#f8fafc', fontSize: '12.5px', fontWeight: 700, lineHeight: 1.2 }}>
                    New APY Update (v{updateInfo.latestVersion || '1.4.1'})
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Tap to update and install latest enhancements
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (updateInfo.apkUrl) {
                    installAppUpdate(updateInfo.apkUrl);
                  } else {
                    setSettingsTab('about');
                    setShowSettings(true);
                  }
                }}
                style={{
                  background: 'linear-gradient(135deg, #d97706, #b45309)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(217, 119, 6, 0.35)',
                  flexShrink: 0
                }}
              >
                Update Now
              </button>
            </aside>
          )}

          <main>
            {activeTab === 'today' && (
              <TodayTab
                user={user}
                summary={summary}
                onAttendanceUpdated={handleAttendanceUpdated}
                introStage={introStage}
                attendanceTargetRef={attendanceTargetRef}
              />
            )}

            {activeTab === 'dashboard' && (
              <DashboardTab
                summary={summary}
                user={user}
              />
            )}

            {activeTab === 'timetable' && (
              <TimetableTab
                user={user}
                onTimetableUpdated={loadSummary}
              />
            )}

            {activeTab === 'forecast' && (
              <ForecastTab
                user={user}
              />
            )}
          </main>

          {/* Floating Liquid-Glass Bottom Navigation Bar */}
          <LiquidNavbar
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            isAdmin={checkIsAdmin(user)}
            onOpenAdmin={() => setShowAdminModal(true)}
          />

          {/* Continuous Premium Launch Experience Overlay */}
          {!hasPlayedIntro && introStage !== 'complete' && (
            <AppLaunchExperience
              user={user}
              summary={summary}
              targetHeaderLogoRef={headerLogoRef}
              attendanceTargetRef={attendanceTargetRef}
              introStage={introStage}
              onFinish={() => {
                setHasPlayedIntro(true);
                setIntroStage('complete');
                try {
                  sessionStorage.setItem('apy_intro_played', 'true');
                } catch {}
              }}
            />
          )}

          {/* Lazy-Loaded Dialogs and Modals */}
          <Suspense fallback={null}>
            {showNotifPrompt && (
              <NotificationPromptModal
                isOpen={showNotifPrompt}
                onClose={() => setShowNotifPrompt(false)}
                onConfigUpdated={() => {
                  setShowNotifPrompt(false);
                }}
              />
            )}

            {showSettings && (
              <SettingsModal
                isOpen={showSettings}
                initialTab={settingsTab}
                onClose={() => setShowSettings(false)}
                user={user}
                onOpenAdmin={() => setShowAdminModal(true)}
                onUserUpdated={(updatedUser) => {
                  if (updatedUser) {
                    setUser(updatedUser);
                    setStoredUser(updatedUser);
                  }
                  initSession();
                }}
              />
            )}

            {checkIsAdmin(user) && showAdminModal && (
              <AdminModal
                isOpen={showAdminModal}
                onClose={() => setShowAdminModal(false)}
                currentUser={user}
              />
            )}
          </Suspense>
        </>
      )}
    </div>
  );
}
