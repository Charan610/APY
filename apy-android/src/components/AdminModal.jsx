import React, { useState, useEffect } from 'react';
import { api } from '../api';
import {
  ShieldCheck,
  Search,
  KeyRound,
  Copy,
  Check,
  Clock,
  UserCheck,
  AlertTriangle,
  X,
  RefreshCw,
  Share2,
  Lock,
  Calendar,
  Layers
} from 'lucide-react';

export default function AdminModal({ isOpen, onClose, currentUser }) {
  const [activeTab, setActiveTab] = useState('reset'); // 'reset' | 'logs'
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [student, setStudent] = useState(null);
  const [matches, setMatches] = useState([]);
  
  const [confirmingTarget, setConfirmingTarget] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [newGeneratedPin, setNewGeneratedPin] = useState(null);
  const [copied, setCopied] = useState(false);
  
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [platformStats, setPlatformStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

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

  // Reset internal state on modal open
  useEffect(() => {
    if (isOpen) {
      setError('');
      setMsg('');
      setSearchQuery('');
      setStudent(null);
      setMatches([]);
      setConfirmingTarget(null);
      setNewGeneratedPin(null);
      setCopied(false);
      if (activeTab === 'logs') {
        loadLogs();
      } else if (activeTab === 'analytics') {
        loadStats();
      }
    }
  }, [isOpen, activeTab]);

  const loadStats = async () => {
    setStatsLoading(true);
    setError('');
    try {
      const res = await api.getPlatformStats();
      setPlatformStats(res);
    } catch (err) {
      setError(err.message || 'Failed to load platform stats');
    } finally {
      setStatsLoading(false);
    }
  };

  const [customPinInput, setCustomPinInput] = useState('');

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery || searchQuery.trim().length < 2) {
      setError('Please enter at least 2 characters to search.');
      return;
    }

    setSearching(true);
    setError('');
    setMsg('');
    setStudent(null);
    setMatches([]);
    setConfirmingTarget(null);
    setNewGeneratedPin(null);

    try {
      const res = await api.searchStudent(searchQuery);
      if (res.exact_match) {
        setStudent(res.exact_match);
        setMatches(res.matches || [res.exact_match]);
      } else if (res.matches && res.matches.length > 0) {
        setMatches(res.matches);
        if (res.matches.length === 1) {
          setStudent(res.matches[0]);
        }
      } else {
        setError(`No student found matching "${searchQuery.trim().toUpperCase()}".`);
      }
    } catch (err) {
      setError(err.message || 'Error searching student register');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectMatch = (stu) => {
    setStudent(stu);
    setConfirmingTarget(null);
    setNewGeneratedPin(null);
    setError('');
    setMsg('');
  };

  const handleTriggerReset = async () => {
    if (!confirmingTarget) return;
    setResetting(true);
    setError('');
    setMsg('');
    try {
      if (customPinInput && !/^\d{4,6}$/.test(customPinInput.trim())) {
        setError('Custom PIN must be 4 to 6 numeric digits.');
        setResetting(false);
        return;
      }
      const res = await api.resetStudentPin(confirmingTarget.register_number, customPinInput.trim() || null);
      setNewGeneratedPin({
        pin: res.new_pin,
        register_number: res.target_register_number,
        branch: res.branch,
        section_label: res.section_label
      });
      setConfirmingTarget(null);
      setCustomPinInput('');
      setMsg(`PIN successfully set for ${res.target_register_number}!`);
    } catch (err) {
      setError(err.message || 'Failed to reset student PIN');
    } finally {
      setResetting(false);
    }
  };

  const handleCopyPin = () => {
    if (!newGeneratedPin) return;
    navigator.clipboard.writeText(newGeneratedPin.pin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyRelayMessage = () => {
    if (!newGeneratedPin) return;
    const text = `Hi, your temporary PIN for ATT PER Y (${newGeneratedPin.register_number}) is: ${newGeneratedPin.pin}\n\nPlease sign in at the website and change your PIN immediately under Settings.`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    setError('');
    try {
      const res = await api.getAdminResetLogs(30);
      setLogs(res.logs || []);
    } catch (err) {
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLogsLoading(false);
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
          maxWidth: '560px',
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
          marginBottom: '1rem',
          borderBottom: '1px solid var(--rule)',
          paddingBottom: '0.65rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              background: 'var(--accent-gold-bg, rgba(217, 119, 6, 0.12))',
              color: 'var(--accent-gold, #d97706)',
              padding: '6px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 className="heading-ledger" style={{ fontSize: '1.15rem', margin: 0 }}>
                Administrator Center
              </h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
                Admin: <strong>{currentUser?.register_number}</strong> · Authorized Control
              </div>
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
            title="Close Admin Panel (Esc)"
          >
            <X size={16} /> Close
          </button>
        </div>

        {/* Tab Selector */}
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
            className={`btn ${activeTab === 'reset' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              flex: 1,
              padding: '0.45rem',
              fontSize: '0.78rem',
              fontWeight: activeTab === 'reset' ? 700 : 500
            }}
            onClick={() => { setActiveTab('reset'); setError(''); setMsg(''); }}
          >
            <KeyRound size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            PIN Reset
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'analytics' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              flex: 1.2,
              padding: '0.45rem',
              fontSize: '0.78rem',
              fontWeight: activeTab === 'analytics' ? 700 : 500
            }}
            onClick={() => {
              setActiveTab('analytics');
              setError('');
              setMsg('');
              loadStats();
            }}
          >
            <Layers size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            📱 App vs Web
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'logs' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              flex: 0.9,
              padding: '0.45rem',
              fontSize: '0.78rem',
              fontWeight: activeTab === 'logs' ? 700 : 500
            }}
            onClick={() => {
              setActiveTab('logs');
              setError('');
              setMsg('');
              loadLogs();
            }}
          >
            <Clock size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Audit Logs
          </button>
        </div>

        {/* Feedback Notifications */}
        {msg && (
          <div className="alert-callout success" style={{ marginBottom: '1rem' }}>
            <Check size={16} />
            <span>{msg}</span>
          </div>
        )}

        {error && (
          <div className="alert-callout error" style={{ marginBottom: '1rem' }}>
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {activeTab === 'reset' && (
          <div>
            {/* Search Input Box */}
            <form onSubmit={handleSearch} style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--ink)' }}>
                Look up Student by Register Number
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                    placeholder="e.g. 23B91A05C0"
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                      fontFamily: 'monospace',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase'
                    }}
                    autoFocus
                  />
                  <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={searching || !searchQuery.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.55rem 1rem' }}
                >
                  {searching ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={15} />}
                  <span>Search</span>
                </button>
              </div>
            </form>

            {/* Multiple Partial Matches Selector */}
            {matches.length > 0 && !student && (
              <div style={{
                background: 'var(--surface-alt)',
                border: '1px solid var(--rule)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
                marginBottom: '1.25rem'
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '0.5rem' }}>
                  Matching Registered Students ({matches.length}):
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {matches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectMatch(m)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.5rem 0.75rem',
                        background: 'var(--surface)',
                        border: '1px solid var(--rule)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.9rem' }}>
                        {m.register_number}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
                        {m.branch} - Sec {m.section_label} · {m.logged_periods || 0} periods logged
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Student Verified Identity Card */}
            {student && (
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--accent-gold, #d97706)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                marginBottom: '1.25rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <UserCheck size={18} style={{ color: 'var(--accent-gold)' }} />
                      <span style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                        {student.register_number}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginTop: '0.2rem' }}>
                      Section <strong>{student.section_label}</strong> ({student.branch})
                    </div>
                  </div>

                  <span style={{
                    fontSize: '0.72rem',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    background: 'var(--accent-gold-bg, rgba(217, 119, 6, 0.1))',
                    color: 'var(--accent-gold, #d97706)',
                    fontWeight: 700
                  }}>
                    Verified User
                  </span>
                </div>

                {/* Identity & Attendance Breakdown */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.5rem',
                  fontSize: '0.78rem',
                  background: 'var(--surface-alt)',
                  padding: '0.65rem',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '1rem',
                  border: '1px solid var(--rule)'
                }}>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>Baseline Periods: </span>
                    <strong>{student.baseline_attended || 0} / {student.baseline_total || 0}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>Logged Periods: </span>
                    <strong>{student.logged_periods || 0}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>Baseline Date: </span>
                    <span>{student.baseline_date || 'None'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>Registered: </span>
                    <span>{student.created_at ? student.created_at.split(' ')[0] : 'Live'}</span>
                  </div>
                </div>

                {/* Platforms & Recent Activity */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--surface-alt)',
                  padding: '0.5rem 0.65rem',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '1rem',
                  border: '1px solid var(--rule)',
                  fontSize: '0.76rem'
                }}>
                  <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>Active Platforms:</span>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {(student.platforms && student.platforms.length > 0) ? (
                      student.platforms.map(p => (
                        <span
                          key={p}
                          style={{
                            padding: '2px 7px',
                            borderRadius: '10px',
                            background: p === 'android' ? 'rgba(34, 197, 94, 0.15)' : p === 'ios' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                            color: p === 'android' ? '#15803d' : p === 'ios' ? '#1d4ed8' : '#7e22ce',
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                        >
                          {p === 'android' ? '📱 Android' : p === 'ios' ? '🍏 iOS' : '🌐 Web'}
                        </span>
                      ))
                    ) : (
                      <span style={{ color: 'var(--ink-soft)' }}>🌐 Web</span>
                    )}
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.75rem',
                  color: 'var(--ink-soft)',
                  marginBottom: '1rem'
                }}>
                  <Lock size={13} />
                  <span>Student passwords/PINs are stored as one-way secure hashes and cannot be viewed.</span>
                </div>

                {/* Reset Trigger Button */}
                {!confirmingTarget && !newGeneratedPin && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setConfirmingTarget(student)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      padding: '0.65rem',
                      fontWeight: 700,
                      background: 'var(--accent-gold, #d97706)',
                      borderColor: 'var(--accent-gold, #d97706)'
                    }}
                  >
                    <KeyRound size={16} />
                    <span>Reset PIN for {student.register_number}</span>
                  </button>
                )}
              </div>
            )}

            {/* Confirmation Alert Box */}
            {confirmingTarget && (
              <div style={{
                background: 'var(--surface-alt)',
                border: '1.5px solid var(--accent-gold, #d97706)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                marginBottom: '1.25rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-gold, #d97706)', fontWeight: 700, marginBottom: '0.4rem' }}>
                  <KeyRound size={18} />
                  <span>Set or Reset PIN for {confirmingTarget.register_number}</span>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--ink-soft)', margin: '0 0 0.75rem 0', lineHeight: 1.4 }}>
                  You can specify a custom 4-6 digit numeric PIN below, or leave it blank to automatically generate a secure random 6-digit PIN.
                </p>

                <div style={{ marginBottom: '0.85rem' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--ink)' }}>
                    Manual Custom PIN (Optional)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={customPinInput}
                    onChange={(e) => setCustomPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="Leave blank for random 6-digit PIN (e.g. 1234)"
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.65rem',
                      fontFamily: 'monospace',
                      letterSpacing: '2px',
                      fontSize: '0.95rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--rule)',
                      background: 'var(--surface)'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setConfirmingTarget(null); setCustomPinInput(''); }}
                    disabled={resetting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleTriggerReset}
                    disabled={resetting}
                    style={{
                      background: 'var(--accent-gold, #d97706)',
                      borderColor: 'var(--accent-gold, #d97706)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontWeight: 700
                    }}
                  >
                    {resetting ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <KeyRound size={14} />}
                    <span>{customPinInput ? `Set PIN to ${customPinInput}` : 'Generate Random PIN'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* One-Time Temporary PIN Revealed Card */}
            {newGeneratedPin && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.08) 0%, rgba(245, 158, 11, 0.04) 100%)',
                border: '2px solid var(--accent-gold, #d97706)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                marginBottom: '1.25rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, color: 'var(--accent-gold, #d97706)', marginBottom: '0.25rem' }}>
                  New Temporary PIN Generated
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--ink-soft)', marginBottom: '0.85rem' }}>
                  For student <strong>{newGeneratedPin.register_number}</strong> ({newGeneratedPin.branch} - Sec {newGeneratedPin.section_label})
                </div>

                {/* Big Monospace PIN Display */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  background: 'var(--surface)',
                  border: '2px dashed var(--accent-gold, #d97706)',
                  padding: '0.75rem 1.5rem',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '1rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
                }}>
                  <span style={{
                    fontFamily: 'monospace',
                    fontSize: '2rem',
                    fontWeight: 800,
                    letterSpacing: '6px',
                    color: 'var(--ink)'
                  }}>
                    {newGeneratedPin.pin}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleCopyPin}
                    title="Copy PIN"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.65rem' }}
                  >
                    {copied ? <Check size={14} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={14} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginBottom: '1rem', lineHeight: 1.4 }}>
                  ⚠️ <strong>One-time display</strong>: This PIN is shown once to you so you can relay it (WhatsApp, in person). It is hashed in the database and cannot be recovered later.
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleCopyRelayMessage}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <Share2 size={14} />
                    <span>Copy Full Message for WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setNewGeneratedPin(null);
                      setStudent(null);
                      setSearchQuery('');
                      setMsg('Ready for next lookup.');
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: Platform Analytics */}
        {activeTab === 'analytics' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ink)' }}>
                Web vs Android App Adoption
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadStats}
                disabled={statsLoading}
                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
              >
                <RefreshCw size={12} style={statsLoading ? { animation: 'spin 1s linear infinite' } : {}} />
                <span>Refresh</span>
              </button>
            </div>

            {statsLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
                Loading adoption statistics...
              </div>
            ) : platformStats ? (
              <div>
                {/* Metric Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.65rem', marginBottom: '1rem' }}>
                  <div style={{
                    background: 'var(--surface-alt)',
                    border: '1px solid var(--rule)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>
                      📱 Android Only
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-gold, #d97706)', marginTop: '0.2rem' }}>
                      {platformStats.unique_users?.android_only_count || 0}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--ink-soft)' }}>
                      exclusive app users
                    </div>
                  </div>

                  <div style={{
                    background: 'var(--surface-alt)',
                    border: '1px solid var(--rule)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>
                      🔄 Dual Platform
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--good, #16a34a)', marginTop: '0.2rem' }}>
                      {platformStats.unique_users?.dual_count || 0}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--ink-soft)' }}>
                      both app + web
                    </div>
                  </div>

                  <div style={{
                    background: 'var(--surface-alt)',
                    border: '1px solid var(--rule)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>
                      🌐 Web Only
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--ink)', marginTop: '0.2rem' }}>
                      {platformStats.unique_users?.web_only_count || 0}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--ink-soft)' }}>
                      browser only
                    </div>
                  </div>
                </div>

                {/* Session Breakdown */}
                <div style={{
                  background: 'var(--surface-alt)',
                  border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 0.9rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  justifyContent: 'space-around',
                  fontSize: '0.8rem'
                }}>
                  <div>
                    📱 <strong>{platformStats.sessions?.android || 0}</strong> Android logins
                  </div>
                  <div style={{ borderLeft: '1px solid var(--rule)', paddingLeft: '0.75rem' }}>
                    🌐 <strong>{platformStats.sessions?.web || 0}</strong> Web logins
                  </div>
                  <div style={{ borderLeft: '1px solid var(--rule)', paddingLeft: '0.75rem' }}>
                    📊 <strong>{platformStats.sessions?.total || 0}</strong> Total sessions
                  </div>
                </div>

                {/* Detailed Lists */}
                {platformStats.android_only_students?.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--accent-gold, #d97706)' }}>
                      📱 Students using Only Android App ({platformStats.android_only_students.length})
                    </div>
                    <div style={{
                      maxHeight: '130px',
                      overflowY: 'auto',
                      background: 'var(--surface)',
                      border: '1px solid var(--rule)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.4rem'
                    }}>
                      {platformStats.android_only_students.map(s => (
                        <div key={s.register_number} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderBottom: '1px solid var(--rule)' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{s.register_number}</span>
                          <span style={{ color: 'var(--ink-soft)' }}>Last active: {s.last_seen || 'Recently'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {platformStats.dual_students?.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--good, #16a34a)' }}>
                      🔄 Students active on both App & Web ({platformStats.dual_students.length})
                    </div>
                    <div style={{
                      maxHeight: '130px',
                      overflowY: 'auto',
                      background: 'var(--surface)',
                      border: '1px solid var(--rule)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.4rem'
                    }}>
                      {platformStats.dual_students.map(s => (
                        <div key={s.register_number} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderBottom: '1px solid var(--rule)' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{s.register_number}</span>
                          <span style={{ color: 'var(--ink-soft)' }}>Last active: {s.last_seen || 'Recently'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
                No session data recorded yet.
              </div>
            )}
          </div>
        )}

        {/* Audit History Tab */}
        {activeTab === 'logs' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink)' }}>
                Recent PIN Resets ({logs.length})
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadLogs}
                disabled={logsLoading}
                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
              >
                <RefreshCw size={12} style={logsLoading ? { animation: 'spin 1s linear infinite' } : {}} />
                <span>Refresh</span>
              </button>
            </div>

            {logsLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
                Loading audit logs...
              </div>
            ) : logs.length === 0 ? (
              <div style={{
                padding: '2rem',
                textAlign: 'center',
                background: 'var(--surface-alt)',
                borderRadius: 'var(--radius-md)',
                border: '1px dashed var(--rule)',
                color: 'var(--ink-soft)',
                fontSize: '0.85rem'
              }}>
                No PIN resets recorded yet.
              </div>
            ) : (
              <div style={{
                maxHeight: '320px',
                overflowY: 'auto',
                border: '1px solid var(--rule)',
                borderRadius: 'var(--radius-md)'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-alt)', borderBottom: '1px solid var(--rule)', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem 0.75rem' }}>Student</th>
                      <th style={{ padding: '0.5rem 0.75rem' }}>Reset By</th>
                      <th style={{ padding: '0.5rem 0.75rem' }}>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                        <td style={{ padding: '0.5rem 0.75rem', fontWeight: 700, fontFamily: 'monospace' }}>
                          {log.target_register_number}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-soft)' }}>
                          {log.reset_by_register_number}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-soft)' }}>
                          {log.reset_at}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
