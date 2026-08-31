import React, { useState, useEffect } from 'react';
import { api, setAuthToken, setStoredUser, getApiBase, setApiBase } from '../api';
import TimetableBuilder from './TimetableBuilder';
import { User, Lock, BookOpen, AlertCircle, CheckCircle2, GraduationCap, Server, Globe, RefreshCw, Check } from 'lucide-react';

export default function AuthModal({ onAuthSuccess }) {
  const DEFAULT_SECTIONS = [
    { id: 1, branch: 'CSE', section_label: 'A', weekly_periods: 34 },
    { id: 2, branch: 'CSE', section_label: 'B', weekly_periods: 34 },
    { id: 3, branch: 'CSE', section_label: 'C', weekly_periods: 34 },
    { id: 4, branch: 'CSE', section_label: 'D', weekly_periods: 34 },
    { id: 5, branch: 'CSE', section_label: 'E', weekly_periods: 34 }
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

  // Server URL Configuration Modal
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(() => getApiBase());
  const [testingServer, setTestingServer] = useState(false);
  const [serverTestStatus, setServerTestStatus] = useState(null); // 'success' | 'error' | null
  const [serverTestMsg, setServerTestMsg] = useState('');

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

  const handleTestAndSaveServer = async (e) => {
    e?.preventDefault();
    setTestingServer(true);
    setServerTestStatus(null);
    setServerTestMsg('');

    let targetUrl = serverUrlInput.trim();
    if (!targetUrl) {
      setServerTestStatus('error');
      setServerTestMsg('Please enter a valid URL.');
      setTestingServer(false);
      return;
    }

    if (targetUrl.endsWith('/')) targetUrl = targetUrl.slice(0, -1);
    if (!targetUrl.endsWith('/api') && !targetUrl.includes('/api/')) {
      targetUrl = `${targetUrl}/api`;
    }

    try {
      // Test connectivity
      const res = await fetch(`${targetUrl}/sections`, { method: 'GET' });
      if (res.ok) {
        setApiBase(targetUrl);
        setServerUrlInput(targetUrl);
        setServerTestStatus('success');
        setServerTestMsg('Connected successfully!');
        loadSections();
        setTimeout(() => setShowServerConfig(false), 1200);
      } else {
        setServerTestStatus('error');
        setServerTestMsg(`Server returned error status ${res.status}`);
      }
    } catch (err) {
      setServerTestStatus('error');
      setServerTestMsg(err.message || 'Cannot reach server at this address.');
    } finally {
      setTestingServer(false);
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
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!regNo.trim() || !pin.trim()) {
      setError('Please fill in register number and PIN.');
      return;
    }

    if (isCustomSection && (!customBranch.trim() || !customSectionLabel.trim())) {
      setError('Please enter branch and section name.');
      return;
    }

    if (isCustomSection && (!customBlocks || customBlocks.length === 0)) {
      setError('Please configure at least one period in the timetable.');
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
          <div className="brand-crest" style={{ margin: '0 auto 0.75rem', width: '52px', height: '52px' }}>
            <GraduationCap size={28} className="brand-icon-glyph" />
          </div>
          <h2 className="heading-ledger" style={{ fontSize: '1.35rem' }}>ATT PER Y</h2>
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
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '0.8rem' }}>
              <div>{error}</div>
              {error.toLowerCase().includes('connect') && (
                <button
                  type="button"
                  onClick={() => setShowServerConfig(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--ink)',
                    textDecoration: 'underline',
                    fontWeight: 700,
                    cursor: 'pointer',
                    marginTop: '0.35rem',
                    padding: 0,
                    fontSize: '0.775rem',
                    display: 'block'
                  }}
                >
                  ⚙️ Tap here to configure Server URL
                </button>
              )}
            </div>
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin}>
            <div className="form-field">
              <label className="form-label">College Register Number</label>
              <input
                type="text"
                className="form-control mono"
                placeholder="e.g. 25B91A05D8"
                value={regNo}
                onChange={(e) => setRegNo(e.target.value.toUpperCase())}
                autoFocus
                required
              />
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
              {loading ? 'Authenticating...' : 'Access ATT PER Y'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <div className="form-field">
              <label className="form-label">College Register Number</label>
              <input
                type="text"
                className="form-control mono"
                placeholder="e.g. 25B91A05D8"
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
            </div>

            {!isCustomSection ? (
              <div className="form-field">
                <label className="form-label">Pre-Seeded CSE Section</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.35rem' }}>
                  {sections.map((sec) => (
                    <button
                      key={sec.id}
                      type="button"
                      className={`btn ${selectedSectionId === String(sec.id) ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                      style={{ padding: '0.4rem 0.2rem', fontSize: '0.75rem' }}
                      onClick={() => setSelectedSectionId(String(sec.id))}
                    >
                      Sec {sec.section_label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ border: '1px solid var(--rule)', borderRadius: 'var(--radius-md)', padding: '0.85rem', marginBottom: '1rem', background: 'var(--surface)' }}>
                <div className="form-field">
                  <label className="form-label">Section Identifier</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. A, B, or 1"
                    maxLength={3}
                    value={customSectionLabel}
                    onChange={(e) => setCustomSectionLabel(e.target.value.toUpperCase())}
                    required
                  />
                </div>

                <div style={{ marginTop: '0.75rem' }}>
                  <label className="form-label">Build Weekly Timetable Schedule</label>
                  <TimetableBuilder
                    onChange={(blocks) => setCustomBlocks(blocks)}
                  />
                </div>
              </div>
            )}

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

        {/* Server Connection Footer */}
        <div style={{
          marginTop: '1.25rem',
          paddingTop: '0.85rem',
          borderTop: '1px solid var(--rule)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.725rem',
          color: 'var(--ink-soft)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
            <Server size={12} />
            <span style={{ fontFamily: 'var(--font-mono)' }}>{getApiBase()}</span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', fontWeight: 600 }}
            onClick={() => {
              setServerUrlInput(getApiBase());
              setServerTestStatus(null);
              setServerTestMsg('');
              setShowServerConfig(!showServerConfig);
            }}
          >
            {showServerConfig ? 'Close' : 'Change'}
          </button>
        </div>

        {/* Inline Server Config Editor */}
        {showServerConfig && (
          <form
            onSubmit={handleTestAndSaveServer}
            style={{
              marginTop: '0.75rem',
              background: 'var(--surface-alt)',
              padding: '0.85rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--rule)'
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--ink)' }}>
              Backend Server URL:
            </div>
            <input
              type="text"
              className="form-control mono"
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.65rem', marginBottom: '0.5rem' }}
              placeholder="e.g. https://your-domain.vercel.app/api or http://localhost:8000/api"
              value={serverUrlInput}
              onChange={(e) => setServerUrlInput(e.target.value)}
              required
            />
            {serverTestMsg && (
              <div style={{
                fontSize: '0.75rem',
                marginBottom: '0.5rem',
                color: serverTestStatus === 'success' ? 'var(--good, #16a34a)' : 'var(--bad, #dc2626)',
                fontWeight: 600
              }}>
                {serverTestStatus === 'success' ? '✓ ' : '✕ '} {serverTestMsg}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowServerConfig(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={testingServer}
              >
                {testingServer ? 'Testing...' : 'Test & Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
