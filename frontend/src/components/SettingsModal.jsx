import React, { useState, useEffect } from 'react';
import { api } from '../api';
import {
  requestNotificationPermissionAndSubscribe,
  ensureActivePushSubscription,
  isPushSupported,
  getNotificationPermission
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
  Lock
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

export default function SettingsModal({ isOpen, onClose, user, onUserUpdated, initialTab = 'profile' }) {
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
      loadSections();
      loadNotificationConfig();
      setPermissionState(getNotificationPermission());
      if (user) {
        setSelectedSectionId(user.section_id || 3);
        setAttended(user.baseline_attended || 0);
        setTotal(user.baseline_total || 0);
        setBDate(user.baseline_date || '2026-08-24');
      }
    }
  }, [isOpen, user, initialTab]);

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
      setMsg('PIN changed successfully! You can now use your new PIN on your next login.');
    } catch (err) {
      setError(err.message || 'Failed to change PIN');
    } finally {
      setPinLoading(false);
    }
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

      // 1. Update Baseline
      await api.updateBaseline({
        baseline_attended: att,
        baseline_total: tot,
        baseline_date: tot > 0 ? bDate : null,
      });

      // 2. Update Section if changed
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

    await api.updateNotificationPreferences({
      enabled: enabledStatus,
      times: timesToSave
    });
  };

  const handleToggleMasterNotifications = async (enable) => {
    setError('');
    setMsg('');
    setNotifEnabled(enable);
    setNotifLoading(true);

    try {
      if (enable) {
        if (!isPushSupported()) {
          throw new Error('Web Push notifications are not supported by your current browser.');
        }

        const sub = await requestNotificationPermissionAndSubscribe(vapidPublicKey);
        await api.savePushSubscription(sub);
        setPermissionState(getNotificationPermission());
      }

      await saveCurrentReminderPreferences(enable);
      setMsg(enable ? 'Daily reminders enabled!' : 'Daily reminders paused.');
    } catch (err) {
      setNotifEnabled(!enable);
      setError(err.message || 'Failed to change notification settings');
      setPermissionState(getNotificationPermission());
    } finally {
      setNotifLoading(false);
    }
  };

  const handleSaveReminders = async () => {
    setError('');
    setMsg('');
    setNotifLoading(true);
    try {
      if (notifEnabled && permissionState !== 'granted') {
        const sub = await requestNotificationPermissionAndSubscribe(vapidPublicKey);
        await api.savePushSubscription(sub);
        setPermissionState(getNotificationPermission());
      }
      await saveCurrentReminderPreferences(notifEnabled);
      setMsg('Reminder schedule saved successfully!');
    } catch (err) {
      setError(err.message || 'Failed to save reminders');
    } finally {
      setNotifLoading(false);
    }
  };

function formatTime12h(timeStr) {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

  const handleAddCustomTime = async () => {
    if (!newCustomTime) return;
    if (customTimes.includes(newCustomTime)) {
      setError(`Time ${formatTime12h(newCustomTime)} is already in your list.`);
      return;
    }
    const updatedCustomTimes = [...customTimes, newCustomTime].sort();
    setCustomTimes(updatedCustomTimes);
    const addedTimeStr = newCustomTime;
    setNewCustomTime('');

    try {
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
      for (const ct of updatedCustomTimes) {
        timesToSave.push({ time_of_day: ct, label: 'Custom Reminder', is_prebuilt: false });
      }

      await api.updateNotificationPreferences({
        enabled: notifEnabled,
        times: timesToSave
      });
      setMsg(`Added and saved ${formatTime12h(addedTimeStr)} to your reminder schedule!`);
    } catch (err) {
      setError('Could not auto-save new time: ' + (err.message || ''));
    }
  };

  const handleRemoveCustomTime = async (timeToRemove) => {
    const updatedCustomTimes = customTimes.filter(t => t !== timeToRemove);
    setCustomTimes(updatedCustomTimes);

    try {
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
      for (const ct of updatedCustomTimes) {
        timesToSave.push({ time_of_day: ct, label: 'Custom Reminder', is_prebuilt: false });
      }

      await api.updateNotificationPreferences({
        enabled: notifEnabled,
        times: timesToSave
      });
      setMsg(`Removed ${formatTime12h(timeToRemove)} from reminder schedule.`);
    } catch (err) {
      setError('Could not update reminder schedule: ' + (err.message || ''));
    }
  };

  const handleSendTestNotification = async () => {
    setError('');
    setMsg('');
    setTestNotifLoading(true);
    try {
      // Ensure subscription is active in PushManager and saved in database
      await ensureActivePushSubscription(vapidPublicKey);
      setPermissionState(getNotificationPermission());

      const res = await api.sendTestNotification();
      setMsg(res.message || 'Test notification sent to your device!');
    } catch (err) {
      setError(err.message || 'Failed to send test notification');
      setPermissionState(getNotificationPermission());
    } finally {
      setTestNotifLoading(false);
    }
  };

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
          maxHeight: '88vh',
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}
      >
        {/* Header with Prominent Close Button */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
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

        {/* Tab Selector Inside Settings */}
        <div style={{
          display: 'flex',
          background: 'var(--surface-alt)',
          padding: '4px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.25rem',
          border: '1px solid var(--rule)',
          gap: '4px'
        }}>
          <button
            type="button"
            className={`btn ${activeTab === 'profile' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              flex: 1,
              padding: '0.45rem',
              fontSize: '0.78rem',
              fontWeight: activeTab === 'profile' ? 700 : 500
            }}
            onClick={() => { setActiveTab('profile'); setMsg(''); setError(''); }}
          >
            <School size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Profile & Section
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'security' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              flex: 1,
              padding: '0.45rem',
              fontSize: '0.78rem',
              fontWeight: activeTab === 'security' ? 700 : 500
            }}
            onClick={() => { setActiveTab('security'); setMsg(''); setError(''); }}
          >
            <KeyRound size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Security & PIN
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'reminders' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              flex: 1,
              padding: '0.45rem',
              fontSize: '0.78rem',
              fontWeight: activeTab === 'reminders' ? 700 : 500
            }}
            onClick={() => { setActiveTab('reminders'); setMsg(''); setError(''); }}
          >
            <Bell size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Reminders
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'about' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              flex: 0.7,
              padding: '0.45rem',
              fontSize: '0.78rem',
              fontWeight: activeTab === 'about' ? 700 : 500
            }}
            onClick={() => { setActiveTab('about'); setMsg(''); setError(''); }}
          >
            <Info size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
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
              {/* Class Section Selector (High Visibility) */}
              <div style={{
                marginBottom: '1.25rem',
                background: 'var(--surface-alt)',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--accent-gold)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <School size={18} color="var(--ink)" />
                  <label className="form-label" style={{ marginBottom: 0, fontWeight: 800, fontSize: '0.85rem', color: 'var(--ink)' }}>
                    Change Class Section
                  </label>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginBottom: '0.75rem' }}>
                  Switch your section here. Your daily timetable will immediately update to match your selected section.
                </p>
                <select
                  className="form-control"
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(parseInt(e.target.value))}
                  style={{
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    padding: '0.55rem',
                    background: 'var(--surface)',
                    border: '1px solid var(--rule)'
                  }}
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.branch} — Section {s.section_label} ({s.weekly_periods || 34} Periods/Week)
                    </option>
                  ))}
                </select>
              </div>

              {/* Historical Baseline Figures */}
              <div style={{ marginBottom: '1rem', background: 'var(--surface)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--rule)' }}>
                <h4 style={{ fontSize: '0.875rem', color: 'var(--ink)', fontWeight: 700, marginBottom: '0.2rem' }}>
                  Historical Baseline Cutoff
                </h4>
                <p style={{ fontSize: '0.725rem', color: 'var(--ink-soft)', marginBottom: '0.65rem' }}>
                  Total periods attended and held prior to beginning daily register logging.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.65rem' }}>
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
                {loading ? 'Saving Changes...' : 'Save Section & Baseline Changes'}
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
                  <Bell size={16} color={notifEnabled ? 'var(--good)' : 'var(--ink-soft)'} />
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--ink)' }}>
                    Daily Attendance Reminders
                  </span>
                </div>
                <div style={{ fontSize: '0.725rem', color: 'var(--ink-soft)', marginTop: '0.15rem' }}>
                  {notifEnabled ? 'Active · Push alerts will be sent at your chosen times' : 'Disabled · No reminder pushes will be sent'}
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifEnabled}
                  onChange={(e) => handleToggleMasterNotifications(e.target.checked)}
                  disabled={notifLoading}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
              </label>
            </div>

            {/* Permission status callout if denied */}
            {permissionState === 'denied' && (
              <div className="alert-callout error" style={{ marginBottom: '1rem', fontSize: '0.75rem' }}>
                <AlertTriangle size={15} />
                <span>Notifications are blocked in browser settings. Please allow notifications for this site.</span>
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
                  background: selectedPrebuilts['09:00'] ? 'var(--gold-soft)' : 'var(--surface)',
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
                  background: selectedPrebuilts['12:00'] ? 'var(--gold-soft)' : 'var(--surface)',
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
                  background: selectedPrebuilts['16:30'] ? 'var(--gold-soft)' : 'var(--surface)',
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
                Custom Reminder Times ({customTimes.length})
              </div>

              {customTimes.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.65rem' }}>
                  {customTimes.map((ct) => (
                    <div
                      key={ct}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--rule)',
                        background: 'var(--surface-alt)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <Clock size={14} color="var(--accent-gold)" />
                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }} className="mono">{formatTime12h(ct)}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>Custom Reminder</span>
                      </div>
                      {notifEnabled && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleRemoveCustomTime(ct)}
                          style={{ padding: '0.2rem 0.5rem', color: 'var(--bad)', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '3px' }}
                          title="Remove this custom time"
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginBottom: '0.65rem', fontStyle: 'italic' }}>
                  No custom times added yet. Choose a time below and click "+ Add Time".
                </div>
              )}

              {/* Add Custom Time Input */}
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  type="time"
                  className="form-control mono"
                  value={newCustomTime}
                  disabled={!notifEnabled}
                  onChange={(e) => setNewCustomTime(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleAddCustomTime}
                  disabled={!notifEnabled || !newCustomTime}
                  style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Plus size={14} /> Add Time
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, padding: '0.6rem', fontWeight: 700 }}
                onClick={handleSaveReminders}
                disabled={notifLoading}
              >
                {notifLoading ? 'Saving...' : 'Save Reminder Schedule'}
              </button>
            </div>

            {/* Send Test Notification Button */}
            <div style={{
              borderTop: '1px solid var(--rule)',
              paddingTop: '0.85rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink)' }}>Test Notification</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>Verify push alerts on this device</div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleSendTestNotification}
                disabled={testNotifLoading}
              >
                <Send size={13} /> {testNotifLoading ? 'Sending...' : 'Send Test Alert'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Security & PIN */}
        {activeTab === 'security' && (
          <div>
            <div style={{
              background: 'var(--surface-alt)',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem',
              marginBottom: '1.25rem',
              fontSize: '0.82rem',
              color: 'var(--ink-soft)',
              lineHeight: 1.4
            }}>
              <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Lock size={15} color="var(--accent-gold)" /> Change Your Account PIN
              </div>
              Update your account PIN anytime. If an admin provided you with a temporary PIN, enter it as your Current PIN below to establish your own secret PIN.
            </div>

            <form onSubmit={handleChangePin}>
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
                    borderRadius: 'var(--radius-sm)'
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--ink)' }}>
                  New PIN (4–6 numeric digits)
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
                    borderRadius: 'var(--radius-sm)'
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
                    borderRadius: 'var(--radius-sm)'
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

        {/* TAB 4: About */}
        {activeTab === 'about' && (
          <div>
            <div style={{
              background: 'var(--surface-alt)',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              marginBottom: '1rem',
              textAlign: 'center'
            }}>
              <h4 className="heading-ledger" style={{ fontSize: '1.05rem', color: 'var(--ink)', margin: 0 }}>
                CSE Attendance Register
              </h4>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
                Version <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>1.1.0</span> (Reminders Edition)
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginTop: '0.5rem', lineHeight: 1.4 }}>
                Personal multi-user attendance register, 75% threshold bunk calculator, daily Web Push reminders, and 7-day FAT forecast simulator.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
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
                  padding: '0.75rem 0.85rem',
                  textDecoration: 'none',
                  color: 'var(--ink)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <GithubIcon />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>GitHub Repository</div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>Charan610/APY</div>
                  </div>
                </div>
                <ExternalLink size={15} color="var(--ink-soft)" />
              </a>

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
                  padding: '0.75rem 0.85rem',
                  textDecoration: 'none',
                  color: 'var(--ink)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <InstagramIcon />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Developer Instagram</div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>@charan__3_</div>
                  </div>
                </div>
                <ExternalLink size={15} color="var(--ink-soft)" />
              </a>
            </div>
          </div>
        )}

        {/* Footer Done / Close Button */}
        <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--rule)', paddingTop: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ width: '100%', padding: '0.5rem', fontWeight: 600 }}
          >
            Done / Close Modal
          </button>
        </div>
      </div>
    </div>
  );
}
