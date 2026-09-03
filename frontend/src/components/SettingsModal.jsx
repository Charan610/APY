import React, { useState, useEffect } from 'react';
import { api, getApiBase, setApiBase, checkIsAdmin } from '../api';
import {
  requestNotificationPermissionAndSubscribe,
  ensureActivePushSubscription,
  isPushSupported,
  getNotificationPermission,
  isNative,
  scheduleNativeReminders,
  sendNativeTestNotification
} from '../notifications';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  X,
  Info,
  ExternalLink,
  School,
  Bell,
  Clock,
  Plus,
  Trash2,
  Send,
  AlertTriangle,
  KeyRound,
  Lock,
  ShieldCheck,
  Server,
  Share2,
  Download,
  Activity,
  Check,
  Copy
} from 'lucide-react';

const GithubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

const InstagramIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const DEFAULT_SECTIONS = [
  { id: 1, branch: 'CSE', section_label: 'A', weekly_periods: 34 },
  { id: 2, branch: 'CSE', section_label: 'B', weekly_periods: 34 },
  { id: 3, branch: 'CSE', section_label: 'C', weekly_periods: 34 },
  { id: 4, branch: 'CSE', section_label: 'D', weekly_periods: 34 },
  { id: 5, branch: 'CSE', section_label: 'E', weekly_periods: 34 }
];

export default function SettingsModal({ isOpen, onClose, user, onUserUpdated, onOpenAdmin, initialTab = 'profile' }) {
  const isAdmin = checkIsAdmin(user);
  const [activeTab, setActiveTab] = useState(initialTab || 'profile');

  // Profile & Baseline state
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [selectedSectionId, setSelectedSectionId] = useState(user?.section_id || 3);
  const [attended, setAttended] = useState(user?.baseline_attended || 0);
  const [total, setTotal] = useState(user?.baseline_total || 0);
  const [bDate, setBDate] = useState(user?.baseline_date || '2026-08-24');
  
  const [loading, setLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // Reminders state
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState('');
  const [selectedPrebuilts, setSelectedPrebuilts] = useState({
    '09:00': true,
    '12:00': true,
    '16:30': true
  });
  const [customTimes, setCustomTimes] = useState([]);
  const [newCustomTime, setNewCustomTime] = useState('');
  const [testNotifLoading, setTestNotifLoading] = useState(false);
  const [permissionState, setPermissionState] = useState('default');

  // Change PIN state
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  // Server Endpoint state
  const [serverUrl, setServerUrl] = useState(getApiBase());
  const [serverTesting, setServerTesting] = useState(false);
  const [serverTestStatus, setServerTestStatus] = useState(null); // 'ok' | 'fail'
  const [serverTestMessage, setServerTestMessage] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load configuration on open
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || 'profile');
      setMsg('');
      setError('');
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
      setServerUrl(getApiBase());
      setServerTestStatus(null);
      setServerTestMessage('');
      loadSections();
      loadNotificationConfig();
      checkPerms();
      if (user) {
        setSelectedSectionId(user.section_id || 3);
        setAttended(user.baseline_attended || 0);
        setTotal(user.baseline_total || 0);
        setBDate(user.baseline_date || '2026-08-24');
      }
    }
  }, [isOpen, user, initialTab]);

  const checkPerms = async () => {
    const p = await getNotificationPermission();
    setPermissionState(p);
  };

  const loadSections = async () => {
    try {
      const data = await api.getSections();
      if (data?.sections?.length) {
        setSections(data.sections);
      }
    } catch (e) {
      console.warn('Using default sections fallback');
    }
  };

  const loadNotificationConfig = async () => {
    try {
      const config = await api.getNotificationConfig();
      setVapidPublicKey(config.vapid_public_key || '');
      setNotifEnabled(Boolean(config.enabled));

      const activeTimes = config.active_times || [];
      const prebuilts = { '09:00': false, '12:00': false, '16:30': false };
      const customs = [];

      for (const t of activeTimes) {
        if (t.is_prebuilt && prebuilts.hasOwnProperty(t.time_of_day)) {
          prebuilts[t.time_of_day] = true;
        } else if (!t.is_prebuilt) {
          customs.push(t.time_of_day);
        }
      }

      if (!config.has_preferences) {
        prebuilts['09:00'] = true;
        prebuilts['12:00'] = true;
        prebuilts['16:30'] = true;
      }

      setSelectedPrebuilts(prebuilts);
      setCustomTimes(customs.sort());
    } catch (e) {
      console.warn('Could not load notification config:', e);
    }
  };

  // --- Profile Handlers ---
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    setLoading(true);

    try {
      const att = parseInt(attended) || 0;
      const tot = parseInt(total) || 0;

      if (tot < att) {
        setError('Baseline total periods cannot be less than attended.');
        setLoading(false);
        return;
      }

      await api.updateBaseline({
        baseline_attended: att,
        baseline_total: tot,
        baseline_date: tot > 0 ? bDate : null,
      });

      if (selectedSectionId !== user?.section_id) {
        await api.updateSection(selectedSectionId);
      }

      setMsg('Profile, Section & Baseline updated successfully!');
      
      const freshUser = await api.getMe();
      if (freshUser?.user && onUserUpdated) {
        onUserUpdated(freshUser.user);
      }
    } catch (err) {
      setError(err.message || 'Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  // --- Reminders Handlers ---
  const saveCurrentReminderPreferences = async (enabledStatus) => {
    const timesToSave = [];
    if (selectedPrebuilts['09:00']) {
      timesToSave.push({ time_of_day: '09:00', label: 'Morning Check', is_prebuilt: true });
    }
    if (selectedPrebuilts['12:00']) {
      timesToSave.push({ time_of_day: '12:00', label: 'Midday Check', is_prebuilt: true });
    }
    if (selectedPrebuilts['16:30']) {
      timesToSave.push({ time_of_day: '16:30', label: 'End of Day Register', is_prebuilt: true });
    }
    for (const ct of customTimes) {
      timesToSave.push({ time_of_day: ct, label: 'Custom Reminder', is_prebuilt: false });
    }

    await api.saveNotificationConfig({
      enabled: enabledStatus,
      times: timesToSave
    });

    if (isNative()) {
      if (enabledStatus) {
        await scheduleNativeReminders(timesToSave);
      } else {
        await scheduleNativeReminders([]);
      }
    }

    return timesToSave;
  };

  const handleToggleMasterNotifications = async (newChecked) => {
    setError('');
    setMsg('');
    setNotifLoading(true);

    try {
      if (newChecked) {
        await requestNotificationPermissionAndSubscribe(vapidPublicKey);
        await checkPerms();
        setNotifEnabled(true);
        await saveCurrentReminderPreferences(true);
        setMsg(isNative() ? 'Android daily reminders activated! Alarms scheduled on your device.' : 'Daily attendance push alerts activated!');
      } else {
        setNotifEnabled(false);
        await saveCurrentReminderPreferences(false);
        setMsg('Reminders paused.');
      }
    } catch (err) {
      setNotifEnabled(!newChecked);
      setError(err.message || 'Could not update notification settings');
      await checkPerms();
    } finally {
      setNotifLoading(false);
    }
  };

  const handleAddCustomTime = (e) => {
    e.preventDefault();
    if (!newCustomTime) return;
    if (customTimes.includes(newCustomTime)) {
      setError('This reminder time is already added.');
      return;
    }
    setCustomTimes(prev => [...prev, newCustomTime].sort());
    setNewCustomTime('');
    setError('');
  };

  const handleRemoveCustomTime = (timeToRemove) => {
    setCustomTimes(prev => prev.filter(t => t !== timeToRemove));
  };

  const handleSaveReminderPreferences = async () => {
    setError('');
    setMsg('');
    setNotifLoading(true);
    try {
      await saveCurrentReminderPreferences(notifEnabled);
      setMsg(isNative() ? 'Android notification alarms synchronized successfully!' : 'Reminder schedule saved successfully!');
    } catch (err) {
      setError('Could not update reminder schedule: ' + (err.message || ''));
    } finally {
      setNotifLoading(false);
    }
  };

  const handleSendTestNotification = async () => {
    setError('');
    setMsg('');
    setTestNotifLoading(true);
    try {
      if (isNative()) {
        const res = await sendNativeTestNotification();
        setMsg(res.message || '🔔 Notification triggered on your phone!');
      } else {
        await ensureActivePushSubscription(vapidPublicKey);
        await checkPerms();
        const res = await api.sendTestNotification();
        setMsg(res.message || 'Test notification sent to your browser!');
      }
    } catch (err) {
      setError(err.message || 'Failed to send test notification');
      await checkPerms();
    } finally {
      setTestNotifLoading(false);
    }
  };

  // --- Security & PIN Handlers ---
  const handleChangePin = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');

    if (!currentPin) {
      setError('Please enter your current PIN.');
      return;
    }
    if (!newPin || newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      setError('New PIN must be 4 to 6 numeric digits.');
      return;
    }
    if (newPin !== confirmNewPin) {
      setError('New PIN and Confirmation PIN do not match.');
      return;
    }

    setPinLoading(true);
    try {
      await api.changePin({
        current_pin: currentPin,
        new_pin: newPin
      });
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
      setMsg('PIN changed successfully! Use your new PIN on your next login.');
    } catch (err) {
      setError(err.message || 'Failed to change PIN');
    } finally {
      setPinLoading(false);
    }
  };

  // --- Server Endpoint Handlers ---
  const handleTestServer = async () => {
    setServerTesting(true);
    setServerTestStatus(null);
    setServerTestMessage('');
    const startTime = Date.now();
    try {
      let testTarget = serverUrl.trim();
      if (testTarget.endsWith('/')) testTarget = testTarget.slice(0, -1);
      if (!testTarget.endsWith('/api') && !testTarget.includes('/api/')) testTarget = `${testTarget}/api`;

      const res = await fetch(`${testTarget}/sections`, { method: 'GET' });
      const latency = Date.now() - startTime;
      if (res.ok) {
        setServerTestStatus('ok');
        setServerTestMessage(`Connected successfully (${latency}ms) · Server Live`);
      } else {
        setServerTestStatus('fail');
        setServerTestMessage(`Server returned HTTP ${res.status}`);
      }
    } catch (e) {
      setServerTestStatus('fail');
      setServerTestMessage(`Connection failed: ${e.message}`);
    } finally {
      setServerTesting(false);
    }
  };

  const handleSaveServerUrl = () => {
    if (!serverUrl) return;
    setApiBase(serverUrl);
    setMsg(`Server URL updated to: ${getApiBase()}`);
  };

  // --- Backup Handler ---
  const handleTriggerBackup = async () => {
    setError('');
    setMsg('');
    setBackupLoading(true);
    try {
      const res = await api.triggerBackup();
      setMsg(`Database snapshot saved: ${res.backup_file}`);
    } catch (err) {
      setError(err.message || 'Backup failed');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleShareApp = () => {
    const text = encodeURIComponent(
      `🎓 *APY (Attendance Ledger & Bunk Forecaster)*\nTrack college attendance, 75% bunk limit, and FAT predictions!\n\n📥 *Download APY APK:*\nhttps://github.com/Charan610/APY/raw/main/apy-android/APY.apk\n\n🌐 *Live Web:* https://apy-i1s1.vercel.app`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const handleCopyApkLink = () => {
    navigator.clipboard.writeText('https://github.com/Charan610/APY/raw/main/apy-android/APY.apk');
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="modal-dialog"
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '520px',
          width: '95%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.85rem',
          borderBottom: '1px solid var(--rule)',
          paddingBottom: '0.65rem'
        }}>
          <div>
            <h3 className="heading-ledger" style={{ fontSize: '1.2rem', margin: 0 }}>
              Settings & Preferences
            </h3>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginTop: '0.15rem' }}>
              {user?.register_number} · Section <strong>{user?.section_label || 'C'} ({user?.branch || 'CSE'})</strong>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.35rem 0.65rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title="Close Settings (Esc)"
          >
            <X size={16} /> Close
          </button>
        </div>

        {/* Admin Quick Banner */}
        {isAdmin && (
          <div style={{
            background: 'var(--accent-gold-bg, rgba(217, 119, 6, 0.12))',
            border: '1px solid var(--accent-gold, #d97706)',
            borderRadius: 'var(--radius-md)',
            padding: '0.6rem 0.85rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={18} color="var(--accent-gold, #d97706)" />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink)' }}>
                Administrator Mode
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                onClose();
                if (onOpenAdmin) onOpenAdmin();
              }}
              style={{
                fontSize: '0.72rem',
                padding: '0.3rem 0.6rem',
                background: 'var(--accent-gold, #d97706)',
                borderColor: 'var(--accent-gold, #d97706)',
                fontWeight: 700
              }}
            >
              PIN Reset Panel
            </button>
          </div>
        )}

        {/* Organized Tabs Selector */}
        <div style={{
          display: 'flex',
          background: 'var(--surface-alt)',
          padding: '4px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.25rem',
          border: '1px solid var(--rule)',
          gap: '4px',
          overflowX: 'auto'
        }}>
          <button
            type="button"
            className={`btn ${activeTab === 'profile' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              flex: 1,
              padding: '0.45rem 0.4rem',
              fontSize: '0.75rem',
              fontWeight: activeTab === 'profile' ? 700 : 500,
              whiteSpace: 'nowrap'
            }}
            onClick={() => { setActiveTab('profile'); setMsg(''); setError(''); }}
          >
            <School size={13} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
            Profile
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'reminders' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              flex: 1,
              padding: '0.45rem 0.4rem',
              fontSize: '0.75rem',
              fontWeight: activeTab === 'reminders' ? 700 : 500,
              whiteSpace: 'nowrap'
            }}
            onClick={() => { setActiveTab('reminders'); setMsg(''); setError(''); }}
          >
            <Bell size={13} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
            Reminders
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'security' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              flex: 1,
              padding: '0.45rem 0.4rem',
              fontSize: '0.75rem',
              fontWeight: activeTab === 'security' ? 700 : 500,
              whiteSpace: 'nowrap'
            }}
            onClick={() => { setActiveTab('security'); setMsg(''); setError(''); }}
          >
            <KeyRound size={13} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
            PIN & Security
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'server' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              flex: 1,
              padding: '0.45rem 0.4rem',
              fontSize: '0.75rem',
              fontWeight: activeTab === 'server' ? 700 : 500,
              whiteSpace: 'nowrap'
            }}
            onClick={() => { setActiveTab('server'); setMsg(''); setError(''); }}
          >
            <Server size={13} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
            Server
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'about' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              flex: 0.8,
              padding: '0.45rem 0.4rem',
              fontSize: '0.75rem',
              fontWeight: activeTab === 'about' ? 700 : 500,
              whiteSpace: 'nowrap'
            }}
            onClick={() => { setActiveTab('about'); setMsg(''); setError(''); }}
          >
            <Info size={13} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
            About
          </button>
        </div>

        {/* Feedback Alerts */}
        {msg && (
          <div className="alert-callout success" style={{ marginBottom: '1rem' }}>
            <CheckCircle2 size={16} />
            <span>{msg}</span>
          </div>
        )}

        {error && (
          <div className="alert-callout error" style={{ marginBottom: '1rem' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* TAB 1: Profile & Section */}
        {activeTab === 'profile' && (
          <div>
            <form onSubmit={handleSaveProfile}>
              {/* Class Section */}
              <div style={{
                marginBottom: '1.25rem',
                background: 'var(--surface-alt)',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--accent-gold)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                  <School size={18} color="var(--ink)" />
                  <label className="form-label" style={{ marginBottom: 0, fontWeight: 800, fontSize: '0.85rem', color: 'var(--ink)' }}>
                    Class Section
                  </label>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginBottom: '0.75rem' }}>
                  Switching sections automatically aligns your timetable blocks and period weighting.
                </p>
                <select
                  className="form-control"
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(parseInt(e.target.value))}
                  style={{ fontWeight: 600, fontSize: '0.9rem' }}
                >
                  {sections.map(sec => (
                    <option key={sec.id} value={sec.id}>
                      {sec.branch} - Section {sec.section_label} ({sec.weekly_periods} periods/wk)
                    </option>
                  ))}
                </select>
              </div>

              {/* Baseline Attendance */}
              <div style={{
                marginBottom: '1.25rem',
                background: 'var(--surface-alt)',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--rule)'
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--ink)', marginBottom: '0.35rem' }}>
                  Baseline Attendance Ratio
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginBottom: '0.75rem' }}>
                  Historical periods attended before daily logging commenced.
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div className="form-field">
                    <label className="form-label">Attended Periods</label>
                    <input
                      type="number"
                      min="0"
                      className="form-control mono"
                      value={attended}
                      onChange={(e) => setAttended(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Total Conducted</label>
                    <input
                      type="number"
                      min="0"
                      className="form-control mono"
                      value={total}
                      onChange={(e) => setTotal(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-field" style={{ marginBottom: 0 }}>
                  <label className="form-label">Baseline Cutoff Date</label>
                  <input
                    type="date"
                    className="form-control mono"
                    value={bDate || ''}
                    onChange={(e) => setBDate(e.target.value)}
                  />
                  <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', marginTop: '0.25rem' }}>
                    All periods on or before this date are locked into baseline figures.
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.6rem', fontWeight: 700 }}
                disabled={loading}
              >
                {loading ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </form>

            {/* Database Snapshot Backup */}
            <div style={{
              borderTop: '1px solid var(--rule)',
              marginTop: '1.25rem',
              paddingTop: '0.85rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--ink)' }}>Database Snapshot</div>
                <div style={{ fontSize: '0.725rem', color: 'var(--ink-soft)' }}>SQLite WAL online backup</div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleTriggerBackup}
                disabled={backupLoading}
              >
                <Database size={13} /> {backupLoading ? 'Backing up...' : 'Save Snapshot'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Reminders */}
        {activeTab === 'reminders' && (
          <div>
            {/* Master Switch Card */}
            <div style={{
              background: 'var(--surface-alt)',
              borderRadius: 'var(--radius-md)',
              padding: '0.9rem',
              border: '1px solid var(--rule)',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Bell size={16} color={notifEnabled ? 'var(--good, #16a34a)' : 'var(--ink-soft)'} />
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--ink)' }}>
                    Daily Attendance Alerts
                  </span>
                </div>
                <div style={{ fontSize: '0.725rem', color: 'var(--ink-soft)', marginTop: '0.15rem' }}>
                  {notifEnabled ? 'Active · Push alarms trigger at your selected times' : 'Disabled · No reminder alerts will be sent'}
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifEnabled}
                  onChange={(e) => handleToggleMasterNotifications(e.target.checked)}
                  disabled={notifLoading}
                  style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                />
              </label>
            </div>

            {/* Permission Alert */}
            {permissionState === 'denied' && (
              <div className="alert-callout error" style={{ marginBottom: '1rem', fontSize: '0.75rem' }}>
                <AlertTriangle size={15} />
                <span>Notifications are blocked in system settings. Please allow notifications for APY.</span>
              </div>
            )}

            {/* Prebuilt Time Options */}
            <div style={{ marginBottom: '1rem', opacity: notifEnabled ? 1 : 0.6 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.4rem' }}>
                Prebuilt Reminder Times (IST)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--rule)',
                  background: selectedPrebuilts['09:00'] ? 'var(--gold-soft, rgba(217, 119, 6, 0.08))' : 'var(--surface)',
                  cursor: notifEnabled ? 'pointer' : 'default'
                }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }} className="mono">09:00 AM</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', marginLeft: '0.5rem' }}>Morning Check</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedPrebuilts['09:00']}
                    disabled={!notifEnabled}
                    onChange={(e) => setSelectedPrebuilts(prev => ({ ...prev, '09:00': e.target.checked }))}
                  />
                </label>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--rule)',
                  background: selectedPrebuilts['12:00'] ? 'var(--gold-soft, rgba(217, 119, 6, 0.08))' : 'var(--surface)',
                  cursor: notifEnabled ? 'pointer' : 'default'
                }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }} className="mono">12:00 PM</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', marginLeft: '0.5rem' }}>Midday Check</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedPrebuilts['12:00']}
                    disabled={!notifEnabled}
                    onChange={(e) => setSelectedPrebuilts(prev => ({ ...prev, '12:00': e.target.checked }))}
                  />
                </label>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--rule)',
                  background: selectedPrebuilts['16:30'] ? 'var(--gold-soft, rgba(217, 119, 6, 0.08))' : 'var(--surface)',
                  cursor: notifEnabled ? 'pointer' : 'default'
                }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }} className="mono">04:30 PM</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', marginLeft: '0.5rem' }}>End of Day Register</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedPrebuilts['16:30']}
                    disabled={!notifEnabled}
                    onChange={(e) => setSelectedPrebuilts(prev => ({ ...prev, '16:30': e.target.checked }))}
                  />
                </label>
              </div>
            </div>

            {/* Custom Times */}
            <div style={{ marginBottom: '1.25rem', opacity: notifEnabled ? 1 : 0.6 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.4rem' }}>
                Custom Notification Times
              </div>

              {customTimes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.6rem' }}>
                  {customTimes.map(t => (
                    <div
                      key={t}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.45rem 0.75rem',
                        background: 'var(--surface)',
                        border: '1px solid var(--rule)',
                        borderRadius: 'var(--radius-sm)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Clock size={14} color="var(--ink-soft)" />
                        <span className="mono" style={{ fontWeight: 600, fontSize: '0.85rem' }}>{t}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomTime(t)}
                        disabled={!notifEnabled}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--bad, #dc2626)',
                          cursor: 'pointer',
                          padding: '2px'
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleAddCustomTime} style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  type="time"
                  className="form-control mono"
                  value={newCustomTime}
                  onChange={(e) => setNewCustomTime(e.target.value)}
                  disabled={!notifEnabled}
                  style={{ flex: 1, fontSize: '0.85rem', padding: '0.4rem 0.6rem' }}
                />
                <button
                  type="submit"
                  className="btn btn-secondary btn-sm"
                  disabled={!notifEnabled || !newCustomTime}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 700 }}
                >
                  <Plus size={14} /> Add Time
                </button>
              </form>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveReminderPreferences}
                disabled={notifLoading}
                style={{ width: '100%', padding: '0.6rem', fontWeight: 700 }}
              >
                {notifLoading ? 'Saving Reminders...' : 'Save Reminder Schedule'}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSendTestNotification}
                disabled={testNotifLoading}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  fontSize: '0.8rem',
                  fontWeight: 600
                }}
              >
                <Send size={13} />
                <span>{testNotifLoading ? 'Triggering...' : 'Send Test Notification to Phone'}</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: Security & PIN */}
        {activeTab === 'security' && (
          <div>
            <form onSubmit={handleChangePin}>
              <div style={{
                background: 'var(--surface-alt)',
                border: '1px solid var(--rule)',
                borderRadius: 'var(--radius-md)',
                padding: '0.85rem',
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <Lock size={18} color="var(--accent-gold, #d97706)" />
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
                  Your PIN is stored as a one-way secure hash. Choose a 4-6 digit numerical PIN you can remember easily.
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--ink)' }}>
                  Current PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter current 4-6 digit PIN"
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    fontFamily: 'monospace',
                    letterSpacing: '3px',
                    fontSize: '1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--rule)'
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--ink)' }}>
                  New PIN (4-6 Digits)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter new 4-6 digit PIN"
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    fontFamily: 'monospace',
                    letterSpacing: '3px',
                    fontSize: '1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--rule)'
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--ink)' }}>
                  Confirm New PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={confirmNewPin}
                  onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Re-enter new 4-6 digit PIN"
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    fontFamily: 'monospace',
                    letterSpacing: '3px',
                    fontSize: '1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--rule)'
                  }}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={pinLoading || !currentPin || !newPin || !confirmNewPin}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem'
                }}
              >
                <KeyRound size={16} />
                <span>{pinLoading ? 'Updating PIN...' : 'Update PIN'}</span>
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: Server Endpoint */}
        {activeTab === 'server' && (
          <div>
            <div style={{
              background: 'var(--surface-alt)',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem',
              marginBottom: '1.25rem'
            }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.3rem' }}>
                Live Backend API Server
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', lineHeight: 1.4 }}>
                This is the live endpoint the mobile app communicates with to sync your attendance and baseline data.
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--ink)' }}>
                API Base URL
              </label>
              <input
                type="text"
                className="form-control mono"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://apy-i1s1.vercel.app/api"
                style={{ fontSize: '0.82rem', padding: '0.5rem 0.65rem' }}
                required
              />
            </div>

            {serverTestStatus && (
              <div
                className={`alert-callout ${serverTestStatus === 'ok' ? 'success' : 'error'}`}
                style={{ marginBottom: '1rem', fontSize: '0.78rem' }}
              >
                {serverTestStatus === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{serverTestMessage}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleTestServer}
                disabled={serverTesting || !serverUrl}
                style={{ flex: 1, padding: '0.55rem', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
              >
                <Activity size={14} />
                <span>{serverTesting ? 'Testing...' : 'Test Connection'}</span>
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveServerUrl}
                disabled={!serverUrl}
                style={{ flex: 1, padding: '0.55rem', fontWeight: 700, fontSize: '0.8rem' }}
              >
                Save Endpoint
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: About APY */}
        {activeTab === 'about' && (
          <div>
            <div style={{
              background: 'var(--surface-alt)',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem 1rem',
              marginBottom: '1rem',
              textAlign: 'center'
            }}>
              <div style={{
                width: '54px',
                height: '54px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                border: '2px solid #d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 0.65rem',
                boxShadow: '0 4px 14px rgba(217, 119, 6, 0.25)'
              }}>
                <School size={28} color="#f59e0b" />
              </div>
              <h4 className="heading-ledger" style={{ fontSize: '1.15rem', color: 'var(--ink)', margin: 0 }}>
                APY (ATT PER Y)
              </h4>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
                Version <span style={{ color: 'var(--accent-gold, #d97706)', fontWeight: 700 }}>1.2.0</span> · Mobile Edition
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: '0.5rem', lineHeight: 1.45 }}>
                Multi-user collegiate attendance ledger, 75% bunk limit forecaster, baseline onboarding, and native daily attendance reminder alarms.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '1rem' }}>
              {/* Share on WhatsApp */}
              <button
                type="button"
                onClick={handleShareApp}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(34, 197, 94, 0.12)',
                  border: '1px solid rgba(34, 197, 94, 0.35)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.7rem 0.85rem',
                  color: '#15803d',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.82rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Share2 size={16} />
                  <span>Share APY App on WhatsApp</span>
                </div>
                <ExternalLink size={14} />
              </button>

              {/* Copy APK Download Link */}
              <button
                type="button"
                onClick={handleCopyApkLink}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--surface)',
                  border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.7rem 0.85rem',
                  cursor: 'pointer',
                  color: 'var(--ink)',
                  fontSize: '0.82rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Download size={16} color="var(--accent-gold, #d97706)" />
                  <span style={{ fontWeight: 600 }}>Download APK Link</span>
                </div>
                {copiedLink ? (
                  <span style={{ fontSize: '0.72rem', color: 'var(--good, #16a34a)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <Check size={13} /> Copied!
                  </span>
                ) : (
                  <Copy size={14} color="var(--ink-soft)" />
                )}
              </button>

              {/* GitHub Link */}
              <a
                href="https://github.com/Charan610/APY"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--surface)',
                  border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.7rem 0.85rem',
                  textDecoration: 'none',
                  color: 'var(--ink)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <GithubIcon />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>GitHub Repository</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>Charan610/APY</div>
                  </div>
                </div>
                <ExternalLink size={14} color="var(--ink-soft)" />
              </a>

              {/* Instagram Developer */}
              <a
                href="https://www.instagram.com/charan__3_/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--surface)',
                  border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.7rem 0.85rem',
                  textDecoration: 'none',
                  color: 'var(--ink)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <InstagramIcon />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>Developer Instagram</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>@charan__3_</div>
                  </div>
                </div>
                <ExternalLink size={14} color="var(--ink-soft)" />
              </a>
            </div>
          </div>
        )}

        {/* Footer Done / Close Button */}
        <div style={{ marginTop: '1.15rem', borderTop: '1px solid var(--rule)', paddingTop: '0.65rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ width: '100%', padding: '0.5rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Done / Close Modal
          </button>
        </div>
      </div>
    </div>
  );
}
