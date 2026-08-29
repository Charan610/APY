import React, { useState, useEffect } from 'react';
import { api, setAuthToken, setStoredUser } from '../api';
import TimetableBuilder from './TimetableBuilder';
import { User, Lock, BookOpen, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function AuthModal({ onAuthSuccess }) {
  const DEFAULT_SECTIONS = [
    { id: 1, branch: 'CSE', section_label: 'A', weekly_periods: 26 },
    { id: 2, branch: 'CSE', section_label: 'B', weekly_periods: 26 },
    { id: 3, branch: 'CSE', section_label: 'C', weekly_periods: 26 },
    { id: 4, branch: 'CSE', section_label: 'D', weekly_periods: 26 },
    { id: 5, branch: 'CSE', section_label: 'E', weekly_periods: 26 }
  ];

  const [mode, setMode] = useState('login');
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Form State
  const [regNo, setRegNo] = useState('');
  const [pin, setPin] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('1');

  // Custom section onboarding
  const [isCustomSection, setIsCustomSection] = useState(false);
  const [customBranch, setCustomBranch] = useState('CSE');
  const [customSectionLabel, setCustomSectionLabel] = useState('');
  const [customBlocks, setCustomBlocks] = useState([]);

  // Baseline
  const [baselineAttended, setBaselineAttended] = useState('');
  const [baselineTotal, setBaselineTotal] = useState('');
  const [baselineDate, setBaselineDate] = useState('2026-08-24');

  useEffect(() => {
    loadSections();
  }, []);

  const loadSections = async () => {
    try {
      const data = await api.getSections();
      if (data.sections && data.sections.length > 0) {
        setSections(data.sections);
      }
    } catch (err) {
      console.error('API sections notice:', err);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!regNo.trim() || !pin.trim()) {
      setError('Please enter register number and PIN.');
      return;
    }

    setLoading(true);
    try {
      const data = await api.login({
        register_number: regNo.trim(),
        pin: pin.trim()
      });
      setAuthToken(data.token);
      setStoredUser(data.user);
      onAuthSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Login failed. Please check register number / PIN.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (!regNo.trim()) {
      setError('Please enter your register number.');
      return;
    }
    if (!pin.trim() || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      setError('PIN must be 4 to 6 digits.');
      return;
    }

    if (isCustomSection) {
      if (!customBranch.trim() || !customSectionLabel.trim()) {
        setError('Please enter branch and section label.');
        return;
      }
      if (customBlocks.length === 0) {
        setError('Please configure timetable blocks for your custom section.');
        return;
      }
    } else if (!selectedSectionId) {
      setError('Please pick a section.');
      return;
    }

    const bAtt = parseInt(baselineAttended) || 0;
    const bTot = parseInt(baselineTotal) || 0;
    if (bTot < bAtt) {
      setError('Baseline total cannot be less than attended.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        register_number: regNo.trim(),
        pin: pin.trim(),
        baseline_attended: bAtt,
        baseline_total: bTot,
        baseline_date: bTot > 0 ? baselineDate : null
      };

      if (isCustomSection) {
        payload.custom_branch = customBranch.trim().toUpperCase();
        payload.custom_section_label = customSectionLabel.trim().toUpperCase();
        payload.custom_blocks = customBlocks;
      } else {
        payload.section_id = parseInt(selectedSectionId);
      }

      const data = await api.register(payload);
      setAuthToken(data.token);
      setStoredUser(data.user);
      onAuthSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog" style={{ maxWidth: isCustomSection && mode === 'register' ? '640px' : '440px' }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div className="brand-crest" style={{ margin: '0 auto 0.75rem', width: '48px', height: '48px', fontSize: '1.5rem' }}>
            <span>₹</span>
          </div>
          <h2 className="heading-ledger" style={{ fontSize: '1.35rem' }}>CSE Attendance Register</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
            Academic Ledger & Bunk Forecaster
          </p>
        </div>

        {/* Mode Switcher */}
        <div style={{ display: 'flex', background: 'var(--surface-alt)', padding: '3px', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', border: '1px solid var(--rule)' }}>
          <button
            type="button"
            className={`btn ${mode === 'login' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, border: 'none', padding: '0.45rem' }}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`btn ${mode === 'register' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, border: 'none', padding: '0.45rem' }}
            onClick={() => { setMode('register'); setError(''); }}
          >
            New Student
          </button>
        </div>

        {error && (
          <div className="alert-callout error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin}>
            <div className="form-field">
              <label className="form-label">College Register Number</label>
              <input
                type="text"
                className="form-control mono"
                placeholder="e.g. 23B91A05C0"
                value={regNo}
                onChange={(e) => setRegNo(e.target.value.toUpperCase())}
                autoFocus
                required
              />
              <div style={{ fontSize: '0.725rem', color: 'var(--ink-soft)', marginTop: '0.25rem' }}>
                Tester seed: <strong>23B91A05C0</strong> (PIN: 1234)
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">Security PIN (4–6 Digits)</label>
              <input
                type="password"
                className="form-control mono"
                placeholder="••••"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
              {loading ? 'Authenticating...' : 'Access My Attendance Register'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <div className="form-field">
              <label className="form-label">College Register Number</label>
              <input
                type="text"
                className="form-control mono"
                placeholder="e.g. 23B91A0501"
                value={regNo}
                onChange={(e) => setRegNo(e.target.value.toUpperCase())}
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label">Set 4–6 Digit PIN</label>
              <input
                type="password"
                className="form-control mono"
                placeholder="4 to 6 digits"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
              />
            </div>

            {/* Branch & Section Picker */}
            <div className="form-field">
              <label className="form-label">Branch</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem', marginBottom: '0.65rem' }}>
                {['CSE', 'AIDS', 'ECE', 'IT'].map((b) => (
                  <button
                    key={b}
                    type="button"
                    className={`btn ${customBranch === b ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    style={{ padding: '0.4rem 0.2rem', fontSize: '0.75rem' }}
                    onClick={() => {
                      setCustomBranch(b);
                      if (b === 'CSE') {
                        setIsCustomSection(false);
                      } else {
                        setIsCustomSection(true);
                      }
                    }}
                  >
                    {b}
                  </button>
                ))}
              </div>

              {customBranch === 'CSE' && !isCustomSection ? (
                <div>
                  <label className="form-label">CSE Section (Pre-Seeded)</label>
                  <select
                    className="form-control mono"
                    value={selectedSectionId}
                    onChange={(e) => setSelectedSectionId(e.target.value)}
                  >
                    {sections.filter(s => s.branch === 'CSE').map((s) => (
                      <option key={s.id} value={s.id}>
                        CSE — Section {s.section_label} ({s.weekly_periods} periods/wk)
                      </option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.3rem' }}>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: 'var(--ink)', fontSize: '0.725rem', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => setIsCustomSection(true)}
                    >
                      + Custom CSE Section
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--rule)', padding: '0.85rem', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label className="form-label">Branch Name</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. AIDS, ECE"
                        value={customBranch}
                        onChange={(e) => setCustomBranch(e.target.value.toUpperCase())}
                      />
                    </div>
                    <div>
                      <label className="form-label">Section Name / Letter</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. A, B, 1"
                        value={customSectionLabel}
                        onChange={(e) => setCustomSectionLabel(e.target.value.toUpperCase())}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginBottom: '0.65rem' }}>
                    Define timetable now (or edit anytime later in the <strong>Timetable</strong> tab):
                  </div>

                  <TimetableBuilder
                    onSave={(blocks) => setCustomBlocks(blocks)}
                    showHeader={false}
                  />
                  {customBlocks.length > 0 && (
                    <div style={{ marginTop: '0.5rem', color: 'var(--good)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <CheckCircle2 size={13} /> {customBlocks.length} periods configured for {customBranch}-{customSectionLabel || 'Section'}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Optional Baseline */}
            <div style={{ borderTop: '1px dashed var(--rule)', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ink-soft)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                Prior Baseline (Optional)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label className="form-label">Attended</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control mono"
                    placeholder="193"
                    value={baselineAttended}
                    onChange={(e) => setBaselineAttended(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Total</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control mono"
                    placeholder="262"
                    value={baselineTotal}
                    onChange={(e) => setBaselineTotal(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1.25rem' }} disabled={loading}>
              {loading ? 'Creating Account...' : 'Complete Registration'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
