import React, { useState, useEffect } from 'react';
import { api } from '../api';
import {
  requestNotificationPermissionAndSubscribe,
  unsubscribeFromPush,
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
  Sparkles,
  AlertTriangle,
  GraduationCap
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

export default function SettingsModal({ isOpen, onClose, user, onUserUpdated }) {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'reminders' | 'about'

  // Profile & Baseline state
  const [sections, setSections] = useState([]);
  const [selectedSectionId, setSelectedSectionId] = useState(user?.section_id || 1);
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

  useEffect(() => {
    if (isOpen) {
      loadSections();
      loadNotificationConfig();
      setPermissionState(getNotificationPermission());
      if (user) {
        setSelectedSectionId(user.section_id || 1);
        setAttended(user.baseline_attended || 0);
        setTotal(user.baseline_total || 0);
        setBDate(user.baseline_date || '2026-08-24');
      }
    }
  }, [isOpen, user]);

  const loadSections = async () => {
    try {
      const data = await api.getSections();
      if (data?.sections?.length) {
        setSections(data.sections);
      }
    } catch (e) {
      console.error('Error loading sections:', e);
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

      // If user had no saved active times yet, default prebuilts to true
      if (!config.has_preferences) {
        prebuilts['09:00'] = true;
        prebuilts['12:00'] = true;
        prebuilts['16:30'] = true;
      }

      setSelectedPrebuilts(prebuilts);
      setCustomTimes(customs.sort());
    } catch (e) {
      console.error('Error loading notification config:', e);
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
        setError('Baseline total cannot be less than attended.');
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

      setMsg('Profile, Section, and Baseline updated successfully!');
      
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

  const handleToggleMasterNotifications = async (enable) => {
    setError('');
    setMsg('');
    setNotifLoading(true);

    try {
      if (enable) {
        if (!isPushSupported()) {
          throw new Error('Web Push notifications are not supported by your current browser.');
        }

        // Request browser permission & subscribe
        const sub = await requestNotificationPermissionAndSubscribe(vapidPublicKey);
        await api.savePushSubscription(sub);
        setPermissionState(getNotificationPermission());
      }

      setNotifEnabled(enable);
      await saveCurrentReminderPreferences(enable);
      setMsg(enable ? 'Daily reminders enabled!' : 'Daily reminders paused.');
    } catch (err) {
      setError(err.message || 'Failed to change notification settings');
      setPermissionState(getNotificationPermission());
    } finally {
      setNotifLoading(false);
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

  const handleAddCustomTime = () => {
    if (!newCustomTime) return;
    if (customTimes.includes(newCustomTime)) return;
    setCustomTimes(prev => [...prev, newCustomTime].sort());
    setNewCustomTime('');
  };

  const handleRemoveCustomTime = (timeToRemove) => {
    setCustomTimes(prev => prev.filter(t => t !== timeToRemove));
  };

  const handleSendTestNotification = async () => {
    setError('');
    setMsg('');
    setTestNotifLoading(true);
    try {
      if (permissionState !== 'granted') {
        const sub = await requestNotificationPermissionAndSubscribe(vapidPublicKey);
        await api.savePushSubscription(sub);
        setPermissionState(getNotificationPermission());
      }
      const res = await api.sendTestNotification();
      setMsg(res.message || 'Test notification sent to your device!');
    } catch (err) {
      setError(err.message || 'Failed to send test notification');
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
      setMsg(`Backup snapshot created: ${res.backup_file}`);
    } catch (err) {
      setError(err.message || 'Backup failed');
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog" style={{ maxWidth: '480px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--rule)', paddingBottom: '0.65rem' }}>
          <div>
            <h3 className="heading-ledger" style={{ fontSize: '1.15rem' }}>Settings & Preferences</h3>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
              {user?.register_number} · Section <strong>{user?.section_label} ({user?.branch})</strong>
            </div>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Selector Inside Settings */}
        <div style={{ display: 'flex', background: 'var(--surface-alt)', padding: '3px', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', border: '1px solid var(--rule)' }}>
          <button
            type="button"
            className={`btn ${activeTab === 'profile' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, border: 'none', padding: '0.4rem', fontSize: '0.78rem' }}
            onClick={() => { setActiveTab('profile'); setMsg(''); setError(''); }}
          >
            Profile & Section
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'reminders' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, border: 'none', padding: '0.4rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
            onClick={() => { setActiveTab('reminders'); setMsg(''); setError(''); }}
          >
            <Bell size={13} /> Reminders
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'about' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 0.8, border: 'none', padding: '0.4rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
            onClick={() => { setActiveTab('about'); setMsg(''); setError(''); }}
          >
            <Info size={13} /> About
          </button>
        </div>

        {msg && (
          <div className="alert-callout success">
            <CheckCircle2 size={16} />
            <span>{msg}</span>
          </div>
        )}

        {error && (
          <div className="alert-callout error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Tab 1: Profile & Baseline */}
        {activeTab === 'profile' && (
          <div>
            <form onSubmit={handleSaveProfile}>
              {/* Section Change Picker */}
              <div style={{ marginBottom: '1.25rem', background: 'var(--surface-alt)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--rule)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <School size={16} color="var(--ink)" />
                  <label className="form-label" style={{ marginBottom: 0, fontWeight: 700 }}>
                    Change Class Section
                  </label>
                </div>
                <p style={{ fontSize: '0.725rem', color: 'var(--ink-soft)', marginBottom: '0.6rem' }}>
                  If you picked the wrong section during registration, switch it here. Your daily timetable will immediately update.
                </p>
                <select
                  className="form-control"
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(parseInt(e.target.value))}
                  style={{ fontWeight: 600 }}
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.branch} — Section {s.section_label} ({s.weekly_periods || 34} Periods/Week)
                    </option>
                  ))}
                </select>
              </div>

              {/* Historical Baseline Figures */}
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '0.875rem', color: 'var(--ink)', fontWeight: 700, marginBottom: '0.2rem' }}>
                  Historical Baseline Cutoff
                </h4>
                <p style={{ fontSize: '0.725rem', color: 'var(--ink-soft)', marginBottom: '0.65rem' }}>
                  Total periods attended and held prior to beginning daily register logging.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.65rem' }}>
                  <div className="form-field">
                    <label className="form-label">Attended</label>
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
                    <label className="form-label">Total Periods</label>
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

                <div className="form-field">
                  <label className="form-label">Baseline Cutoff Date</label>
                  <input
                    type="date"
                    className="form-control mono"
                    value={bDate || ''}
                    onChange={(e) => setBDate(e.target.value)}
                  />
                  <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', marginTop: '0.2rem' }}>
                    All periods on/before this date are locked into baseline figures.
                  </div>
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Saving...' : 'Save Section & Baseline Changes'}
              </button>
            </form>

            {/* Durability Backup */}
            <div style={{ borderTop: '1px solid var(--rule)', marginTop: '1.25rem', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--ink)' }}>Database Snapshot</div>
                <div style={{ fontSize: '0.725rem', color: 'var(--ink-soft)' }}>SQLite WAL online backup</div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleTriggerBackup} disabled={backupLoading}>
                <Database size={13} /> {backupLoading ? 'Backing up...' : 'Save Snapshot'}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Reminders & Notifications */}
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
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </label>
            </div>

            {/* Permission status callout if denied */}
            {permissionState === 'denied' && (
              <div className="alert-callout error" style={{ marginBottom: '1rem', fontSize: '0.75rem' }}>
                <AlertTriangle size={15} />
                <span>Notifications are blocked in your browser settings. Please allow notifications for this site to receive alerts.</span>
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
                Add Custom Reminder Time
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
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
                >
                  <Plus size={14} /> Add
                </button>
              </div>

              {customTimes.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {customTimes.map(ct => (
                    <span
                      key={ct}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.75rem',
                        padding: '0.2rem 0.5rem',
                        borderRadius: 'var(--radius-full)',
                        background: 'var(--surface-alt)',
                        border: '1px solid var(--rule)'
                      }}
                    >
                      <Clock size={12} /> {ct}
                      {notifEnabled && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomTime(ct)}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', padding: 0 }}
                        >
                          <Trash2 size={12} color="var(--bad)" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={handleSaveReminders}
                disabled={notifLoading}
              >
                {notifLoading ? 'Saving...' : 'Save Reminder Schedule'}
              </button>
            </div>

            {/* Send Test Notification Button */}
            <div style={{ borderTop: '1px solid var(--rule)', paddingTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink)' }}>Test Notification</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>Verify push alerts work on this device</div>
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

        {/* Tab 3: About */}
        {activeTab === 'about' && (
          <div>
            <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--rule)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1rem', textAlign: 'center' }}>
              <h4 className="heading-ledger" style={{ fontSize: '1.05rem', color: 'var(--ink)' }}>
                CSE Attendance Register
              </h4>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                Version <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>1.1.0</span> (Reminders Edition)
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginTop: '0.5rem', lineHeight: 1.4 }}>
                Personal multi-user attendance register, 75% threshold bunk calculator, daily Web Push reminders, and 7-day FAT forecast simulator.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {/* GitHub Repo Link */}
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
                  color: 'var(--ink)',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-alt)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface)'}
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

              {/* Instagram ID Link */}
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
                  color: 'var(--ink)',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-alt)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface)'}
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

            <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.725rem', color: 'var(--ink-soft)' }}>
              Built with FastAPI, SQLite WAL & React
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
