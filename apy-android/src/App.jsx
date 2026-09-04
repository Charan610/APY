import React, { useState, useEffect } from 'react';
import { api, getStoredUser, setAuthToken, setStoredUser, checkIsAdmin } from './api';
import { nativeStorage } from './nativeStorage';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import TodayTab from './components/TodayTab';
import DashboardTab from './components/DashboardTab';
import TimetableTab from './components/TimetableTab';
import ForecastTab from './components/ForecastTab';
import SettingsModal from './components/SettingsModal';
import NotificationPromptModal from './components/NotificationPromptModal';
import AdminModal from './components/AdminModal';
import { registerServiceWorker } from './notifications';
import { CalendarCheck, LayoutDashboard, Calendar, Sparkles, ShieldCheck, GraduationCap } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export default function App() {
  const [user, setUser] = useState(() => getStoredUser());
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
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('profile');
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);

  // 1. Initialize Capacitor native controls & persistent session
  useEffect(() => {
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

      // 2. Fetch fresh profile & summary in parallel
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
      } else if (!storedUser) {
        setUser(null);
        setAuthToken(null);
        setStoredUser(null);
        try { localStorage.removeItem('apy_summary_cache'); } catch {}
      }
    } catch (err) {
      // Keep existing stored user on transient network errors
    } finally {
      setLoading(false);
      try {
        await SplashScreen.hide();
      } catch (e) {}
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
    setActiveTab('today');
    setShowNotifPrompt(false);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--ink)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div className="brand-crest" style={{ animation: 'pulse 1.5s ease-in-out infinite', width: '52px', height: '52px' }}>
            <GraduationCap size={28} className="brand-icon-glyph" />
          </div>
          <div className="font-serif" style={{ fontSize: '1.05rem', fontWeight: 600 }}>ATT PER Y</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>Starting Native Engine...</div>
        </div>
      </div>
    );
  }

  const isAdmin = checkIsAdmin(user);

  return (
    <div className="app-viewport" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}>
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
          />

          <main>
            {activeTab === 'today' && (
              <TodayTab
                user={user}
                onAttendanceUpdated={handleAttendanceUpdated}
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

          {/* Persistent Bottom Tab Bar */}
          <nav className="bottom-tab-bar">
            <button
              type="button"
              className={`tab-btn ${activeTab === 'today' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('today')}
            >
              <CalendarCheck size={18} />
              <span>Today</span>
              {activeTab === 'today' && <div className="tab-indicator" />}
            </button>

            <button
              type="button"
              className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('dashboard')}
            >
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
              {activeTab === 'dashboard' && <div className="tab-indicator" />}
            </button>

            <button
              type="button"
              className={`tab-btn ${activeTab === 'timetable' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('timetable')}
            >
              <Calendar size={18} />
              <span>Timetable</span>
              {activeTab === 'timetable' && <div className="tab-indicator" />}
            </button>

            <button
              type="button"
              className={`tab-btn ${activeTab === 'forecast' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('forecast')}
            >
              <Sparkles size={18} />
              <span>Forecast</span>
              {activeTab === 'forecast' && <div className="tab-indicator" />}
            </button>

            {isAdmin && (
              <button
                type="button"
                className="tab-btn"
                onClick={() => {
                  triggerHaptic();
                  setShowAdminModal(true);
                }}
                style={{ color: 'var(--accent-gold, #d97706)', fontWeight: 700 }}
              >
                <ShieldCheck size={18} />
                <span>Admin</span>
              </button>
            )}
          </nav>

          {/* Post-Login One-Time Reminder Prompt */}
          <NotificationPromptModal
            isOpen={showNotifPrompt}
            onClose={() => setShowNotifPrompt(false)}
            onConfigUpdated={() => {
              setShowNotifPrompt(false);
            }}
          />

          {/* Settings Modal */}
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

          {/* Admin Modal (Restricted to Authorized Admins) */}
          {isAdmin && (
            <AdminModal
              isOpen={showAdminModal}
              onClose={() => setShowAdminModal(false)}
              currentUser={user}
            />
          )}
        </>
      )}
    </div>
  );
}
