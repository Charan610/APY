import React, { useState, useEffect } from 'react';
import { api, getStoredUser, setAuthToken, setStoredUser, checkIsAdmin } from './api';
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
  const [loading, setLoading] = useState(() => !getStoredUser());
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('profile');
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);

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
      } else if (!getStoredUser()) {
        setUser(null);
        setAuthToken(null);
        setStoredUser(null);
        try { localStorage.removeItem('apy_summary_cache'); } catch {}
      }
    } catch (err) {
      if (!getStoredUser()) {
        setUser(null);
        setAuthToken(null);
        setStoredUser(null);
      }
    } finally {
      setLoading(false);
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
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--ink)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div className="brand-crest" style={{ animation: 'pulse 1.5s ease-in-out infinite', width: '48px', height: '48px' }}>
            <GraduationCap size={26} className="brand-icon-glyph" />
          </div>
          <div className="font-serif" style={{ fontSize: '1rem', fontWeight: 600 }}>Loading ATT PER Y...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-viewport">
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

          {/* Persistent Bottom Tab Bar (4 Destinations: Today · Dashboard · Timetable · Forecast) */}
          <nav className="bottom-tab-bar">
            <button
              type="button"
              className={`tab-btn ${activeTab === 'today' ? 'active' : ''}`}
              onClick={() => setActiveTab('today')}
            >
              <CalendarCheck size={18} />
              <span>Today</span>
              {activeTab === 'today' && <div className="tab-indicator" />}
            </button>

            <button
              type="button"
              className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
              {activeTab === 'dashboard' && <div className="tab-indicator" />}
            </button>

            <button
              type="button"
              className={`tab-btn ${activeTab === 'timetable' ? 'active' : ''}`}
              onClick={() => setActiveTab('timetable')}
            >
              <Calendar size={18} />
              <span>Timetable</span>
              {activeTab === 'timetable' && <div className="tab-indicator" />}
            </button>

            <button
              type="button"
              className={`tab-btn ${activeTab === 'forecast' ? 'active' : ''}`}
              onClick={() => setActiveTab('forecast')}
            >
              <Sparkles size={18} />
              <span>Forecast</span>
              {activeTab === 'forecast' && <div className="tab-indicator" />}
            </button>

            {checkIsAdmin(user) && (
              <button
                type="button"
                className="tab-btn"
                onClick={() => setShowAdminModal(true)}
                style={{ color: 'var(--accent-gold, #d97706)', fontWeight: 700 }}
                title="Open Administrator Center"
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
            onOpenAdmin={() => setShowAdminModal(true)}
            onUserUpdated={(updatedUser) => {
              if (updatedUser) {
                setUser(updatedUser);
                setStoredUser(updatedUser);
              }
              initSession();
            }}
          />

          {/* Admin Modal (Restricted to Authorized Admins) */}
          {checkIsAdmin(user) && (
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
