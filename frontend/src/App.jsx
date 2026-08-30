import React, { useState, useEffect } from 'react';
import { api, getStoredUser, setAuthToken, setStoredUser } from './api';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import TodayTab from './components/TodayTab';
import DashboardTab from './components/DashboardTab';
import TimetableTab from './components/TimetableTab';
import ForecastTab from './components/ForecastTab';
import SettingsModal from './components/SettingsModal';
import NotificationPromptModal from './components/NotificationPromptModal';
import { registerServiceWorker } from './notifications';
import { CalendarCheck, LayoutDashboard, Calendar, Sparkles } from 'lucide-react';

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

  useEffect(() => {
    // 1. Initialize background service worker
    registerServiceWorker();

    // 2. Initialize user session & check notification prompt eligibility
    initSession();
  }, []);

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
        setUser(userData.user);
        setStoredUser(userData.user);
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
    setUser(authenticatedUser);
    loadSummary();
    checkNotificationPromptEligibility();
  };

  const handleLogout = () => {
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
          <div className="brand-crest" style={{ animation: 'spin 2s linear infinite' }}>₹</div>
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
            onUserUpdated={() => {
              initSession();
            }}
          />
        </>
      )}
    </div>
  );
}
