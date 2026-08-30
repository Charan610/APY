import React, { useState } from 'react';
import { api } from '../api';
import { requestNotificationPermissionAndSubscribe, isPushSupported } from '../notifications';
import { Bell, Clock, Check, X, Sparkles, Plus, Trash2, AlertCircle } from 'lucide-react';

export default function NotificationPromptModal({ isOpen, onClose, onConfigUpdated }) {
  const [step, setStep] = useState('prompt'); // 'prompt' | 'times'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Selected prebuilt times
  const [selectedPrebuilts, setSelectedPrebuilts] = useState({
    '09:00': true,
    '12:00': true,
    '16:30': true
  });
  
  // Custom times list
  const [customTimes, setCustomTimes] = useState([]);
  const [newTimeInput, setNewTimeInput] = useState('');

  if (!isOpen) return null;

  const handleNotNow = async () => {
    // Dismiss without nagging
    try {
      localStorage.setItem('apy_notif_prompt_dismissed', 'true');
    } catch {}
    onClose();
  };

  const handleEnableClick = async () => {
    setError('');
    setLoading(true);
    try {
      if (!isPushSupported()) {
        throw new Error('Push notifications are not supported on this browser.');
      }

      // Fetch VAPID public key
      const config = await api.getNotificationConfig();
      if (!config.vapid_public_key) {
        throw new Error('VAPID public key not available on server.');
      }

      // Request browser permission & subscribe
      const subscription = await requestNotificationPermissionAndSubscribe(config.vapid_public_key);
      await api.savePushSubscription(subscription);

      // Move to time customization step
      setStep('times');
    } catch (err) {
      setError(err.message || 'Could not enable notifications.');
    } finally {
      setLoading(false);
    }
  };

  const togglePrebuilt = (timeStr) => {
    setSelectedPrebuilts(prev => ({
      ...prev,
      [timeStr]: !prev[timeStr]
    }));
  };

  const addCustomTime = () => {
    if (!newTimeInput) return;
    if (customTimes.includes(newTimeInput)) return;
    setCustomTimes(prev => [...prev, newTimeInput].sort());
    setNewTimeInput('');
  };

  const removeCustomTime = (timeToRemove) => {
    setCustomTimes(prev => prev.filter(t => t !== timeToRemove));
  };

  const handleSaveTimes = async () => {
    setError('');
    setLoading(true);
    try {
      const timesToSave = [];

      // Prebuilts
      if (selectedPrebuilts['09:00']) {
        timesToSave.push({ time_of_day: '09:00', label: 'Morning Check', is_prebuilt: true });
      }
      if (selectedPrebuilts['12:00']) {
        timesToSave.push({ time_of_day: '12:00', label: 'Midday Check', is_prebuilt: true });
      }
      if (selectedPrebuilts['16:30']) {
        timesToSave.push({ time_of_day: '16:30', label: 'End of Day Register', is_prebuilt: true });
      }

      // Custom times
      for (const ct of customTimes) {
        timesToSave.push({ time_of_day: ct, label: 'Custom Reminder', is_prebuilt: false });
      }

      await api.updateNotificationPreferences({
        enabled: true,
        times: timesToSave
      });

      try {
        localStorage.setItem('apy_notif_prompt_dismissed', 'true');
      } catch {}

      if (onConfigUpdated) onConfigUpdated();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save notification preferences.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1000 }}>
      <div className="modal-dialog" style={{ maxWidth: '420px', padding: '1.4rem' }}>
        
        {/* Header Icon */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'var(--gold-soft)',
            color: 'var(--accent-gold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Bell size={22} />
          </div>
          <button type="button" className="btn-icon" onClick={handleNotNow}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="alert-callout error" style={{ marginBottom: '1rem' }}>
            <AlertCircle size={15} />
            <span style={{ fontSize: '0.78rem' }}>{error}</span>
          </div>
        )}

        {step === 'prompt' ? (
          <div>
            <h3 className="heading-ledger" style={{ fontSize: '1.2rem', marginBottom: '0.4rem' }}>
              Daily Attendance Reminders
            </h3>
            <p style={{ fontSize: '0.825rem', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Never lose your attendance streak! Would you like a daily browser reminder to mark your periods on time?
            </p>

            <div style={{
              background: 'var(--surface-alt)',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem',
              border: '1px solid var(--rule)',
              marginBottom: '1.25rem',
              fontSize: '0.78rem',
              color: 'var(--ink-soft)'
            }}>
              <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '0.35rem' }}>
                ⏰ Default Recommended Times (IST):
              </div>
              <ul style={{ margin: '0 0 0 1.1rem', padding: 0 }}>
                <li><strong>9:00 AM</strong> — Morning class check</li>
                <li><strong>12:00 PM</strong> — Midday check</li>
                <li><strong>4:30 PM</strong> — End-of-day register sync</li>
              </ul>
              <div style={{ fontSize: '0.72rem', marginTop: '0.45rem', color: 'var(--ink-soft)' }}>
                You can customize or turn these off anytime in <strong>Settings</strong>.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={handleNotNow}
                disabled={loading}
              >
                Not Now
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1.3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                onClick={handleEnableClick}
                disabled={loading}
              >
                <Bell size={15} /> {loading ? 'Enabling...' : 'Enable Reminders'}
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Choose Times */
          <div>
            <h3 className="heading-ledger" style={{ fontSize: '1.15rem', marginBottom: '0.3rem' }}>
              Choose Reminder Times
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginBottom: '1rem' }}>
              Select when you want to receive attendance reminder alerts:
            </p>

            {/* Prebuilt Toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.6rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--rule)',
                background: selectedPrebuilts['09:00'] ? 'var(--gold-soft)' : 'var(--surface-alt)',
                cursor: 'pointer'
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--ink)' }}>9:00 AM</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>Morning Check</div>
                </div>
                <input
                  type="checkbox"
                  checked={selectedPrebuilts['09:00']}
                  onChange={() => togglePrebuilt('09:00')}
                />
              </label>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.6rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--rule)',
                background: selectedPrebuilts['12:00'] ? 'var(--gold-soft)' : 'var(--surface-alt)',
                cursor: 'pointer'
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--ink)' }}>12:00 PM</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>Midday Check</div>
                </div>
                <input
                  type="checkbox"
                  checked={selectedPrebuilts['12:00']}
                  onChange={() => togglePrebuilt('12:00')}
                />
              </label>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.6rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--rule)',
                background: selectedPrebuilts['16:30'] ? 'var(--gold-soft)' : 'var(--surface-alt)',
                cursor: 'pointer'
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--ink)' }}>4:30 PM</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>End of Day Register</div>
                </div>
                <input
                  type="checkbox"
                  checked={selectedPrebuilts['16:30']}
                  onChange={() => togglePrebuilt('16:30')}
                />
              </label>
            </div>

            {/* Custom Times */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.4rem' }}>
                Custom Time (Optional)
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                <input
                  type="time"
                  className="form-control mono"
                  value={newTimeInput}
                  onChange={(e) => setNewTimeInput(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={addCustomTime}
                  disabled={!newTimeInput}
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
                        gap: '0.3rem',
                        fontSize: '0.75rem',
                        padding: '0.2rem 0.5rem',
                        borderRadius: 'var(--radius-full)',
                        background: 'var(--surface-alt)',
                        border: '1px solid var(--rule)'
                      }}
                    >
                      <Clock size={12} /> {ct}
                      <button
                        type="button"
                        onClick={() => removeCustomTime(ct)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', padding: 0 }}
                      >
                        <Trash2 size={12} color="var(--bad)" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={handleSaveTimes}
              disabled={loading}
            >
              {loading ? 'Saving Preferences...' : 'Save & Start Reminders'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
