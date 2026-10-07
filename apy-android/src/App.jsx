import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { api, getStoredUser, getAuthToken, setAuthToken, setStoredUser, checkIsAdmin } from './api';
import { nativeStorage } from './nativeStorage';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import TodayTab from './components/TodayTab';
import DashboardTab from './components/DashboardTab';
import TimetableTab from './components/TimetableTab';
import ForecastTab from './components/ForecastTab';
import OfflineBanner from './components/OfflineBanner';
import { registerServiceWorker } from './notifications';
import LiquidNavbar from './components/LiquidNavbar';
import AppLaunchExperience from './components/AppLaunchExperience';
import BrandLogo from './components/BrandLogo';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';

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

  // Continuous unified intro timeline
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

  // 1. Initialize Capacitor native controls & persistent session
  useEffect(() => {
    // Immediate Splash Screen release for instant startup
    try {
      SplashScreen.hide();
    } catch (e) {}

    // A. Configure native status bar
    try {
      StatusBar.setBackgroundColor({ color: '#fbf8f1' });
      StatusBar.setStyle({ style: Style.Dark });
    } catch (e) {}

    // B. Register service worker if available
    registerServiceWorker();

    // C. Initialize native session
    initNativeSession();

    // D. Native Hardware Back Button Handler
    const backListener = CapApp.addListener('backButton', ({ canGoBack }) => {
      if (showSettings) {
        setShowSettings(false);
      } else if (showAdminModal) {
        setShowAdminModal(false);
      } else if (showNotifPrompt) {
        setShowNotifPrompt(false);
      } else if (activeTab !== 'today') {
        setActiveTab('today');
      } else {
        CapApp.exitApp();
      }
    });

    return () => {
      backListener.then(l => l.remove()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    // Silent, non-blocking update check on launch
    checkForAppUpdate().then((res) => {
      if (res?.hasUpdate) {
        setHasUpdate(true);
        setUpdateInfo(res);
      }
    }).catch(() => {});

    // Report client version to backend
    api.syncUserDevice('android', CURRENT_APP_VERSION).catch(() => {});

    // Listen for notification tap on Android
    let notifSub = null;
    try {
      notifSub = LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        const extra = action.notification?.extra;
        if (extra?.type === 'apk_update' && extra?.url) {
          installAppUpdate(extra.url).catch(() => {});
        }
      });
    } catch (e) {}

    // Listen for auth expiration events
    const handleAuthExpired = () => {
      setUser(null);
      setAuthToken(null);
      setStoredUser(null);
    };
    window.addEventListener('apy_auth_expired', handleAuthExpired);

    return () => {
      window.removeEventListener('apy_auth_expired', handleAuthExpired);
      if (notifSub) {
        notifSub.then(s => s?.remove?.()).catch(() => {});
      }
    };
  }, []);

  const triggerHaptic = async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {}
  };

  const handleTabSwitch = (tab) => {
    triggerHaptic();
    setActiveTab(tab);
  };

  const initNativeSession = async () => {
    try {
      // 1. Read stored token & user from native storage
      const [storedToken, storedUser] = await Promise.all([
        nativeStorage.getToken(),
        nativeStorage.getUser()
      ]);

      if (storedToken) {
        setAuthToken(storedToken);
      }
      if (storedUser) {
        setUser(storedUser);
      }
    } catch (err) {
      // Keep existing stored user on transient read errors
    } finally {
      // Immediate release: never block UI on remote requests
      setLoading(false);
      try {
        await SplashScreen.hide();
      } catch (e) {}
    }

    // 2. Fetch fresh profile & summary asynchronously in background
    const token = getAuthToken();
    if (token) {
      Promise.all([
        api.getMe().catch(() => null),
        api.getSummary().catch(() => null)
      ]).then(([userData, summaryData]) => {
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
        }
      }).catch(() => {});
    }
  };

  const handleAttendanceUpdated = (freshSummary) => {
    triggerHaptic();
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

  const checkAndPromptNotifications = async () => {
    try {
      const dismissed = localStorage.getItem('apy_notif_prompt_dismissed');
      if (!dismissed) {
        setShowNotifPrompt(true);
      }
    } catch (e) {}
  };

  const handleAuthSuccess = (authenticatedUser) => {
    const u = {
      ...authenticatedUser,
      is_admin: checkIsAdmin(authenticatedUser)
    };
    setUser(u);
    setStoredUser(u);
    loadSummary();
    setTimeout(() => {
      checkAndPromptNotifications();
    }, 800);
  };

  const handleLogout = async () => {
    triggerHaptic();
    try {
      await api.logout();
    } catch {}
    await nativeStorage.setToken(null);
    await nativeStorage.setUser(null);
    setUser(null);
    setSummary(null);
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

  const isAdmin = checkIsAdmin(user);

  return (
    <div className="app-viewport" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}>
      <OfflineBanner />
      {!user ? (
        <AuthModal onAuthSuccess={handleAuthSuccess} />
      ) : (
        <>
          <Header
            user={user}
            activeTab={activeTab}
            onSelectTab={handleTabSwitch}
            onOpenSettings={() => {
              triggerHaptic();
              setSettingsTab('profile');
              setShowSettings(true);
            }}
            onOpenReminders={() => {
              triggerHaptic();
              setSettingsTab('reminders');
              setShowSettings(true);
            }}
            onOpenAdmin={() => {
              triggerHaptic();
              setShowAdminModal(true);
            }}
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
                    New APK Update (v{updateInfo.latestVersion || '1.4.1'})
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Tap to update and install latest enhancements
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
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
            onSelectTab={handleTabSwitch}
            isAdmin={isAdmin}
            onOpenAdmin={() => {
              triggerHaptic();
              setShowAdminModal(true);
            }}
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
                onOpenAdmin={() => {
                  triggerHaptic();
                  setShowAdminModal(true);
                }}
                onUserUpdated={(updatedUser) => {
                  if (updatedUser) {
                    setUser(updatedUser);
                    setStoredUser(updatedUser);
                  }
                  initNativeSession();
                }}
              />
            )}

            {isAdmin && showAdminModal && (
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
