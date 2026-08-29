import React, { useState } from 'react';
import { api } from '../api';
import { Database, CheckCircle2, AlertCircle, X, Info, ExternalLink } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState('baseline'); // 'baseline' | 'about'

  // Baseline state
  const [attended, setAttended] = useState(user?.baseline_attended || 0);
  const [total, setTotal] = useState(user?.baseline_total || 0);
  const [bDate, setBDate] = useState(user?.baseline_date || '2026-08-24');
  
  const [loading, setLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSaveBaseline = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');

    const att = parseInt(attended) || 0;
    const tot = parseInt(total) || 0;

    if (tot < att) {
      setError('Baseline total cannot be less than attended.');
      return;
    }

    setLoading(true);
    try {
      await api.updateBaseline({
        baseline_attended: att,
        baseline_total: tot,
        baseline_date: tot > 0 ? bDate : null
      });
      setMsg('Baseline attendance updated.');
      onUserUpdated();
    } catch (err) {
      setError(err.message || 'Failed to update baseline');
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerBackup = async () => {
    setError('');
    setMsg('');
    setBackupLoading(true);
    try {
      const res = await api.triggerBackup();
      setMsg(`Backup created: ${res.backup_file}`);
    } catch (err) {
      setError(err.message || 'Backup failed');
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--rule)', paddingBottom: '0.65rem' }}>
          <div>
            <h3 className="heading-ledger" style={{ fontSize: '1.15rem' }}>Settings & About</h3>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
              {user?.register_number} · Section {user?.section_label} ({user?.branch})
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
            className={`btn ${activeTab === 'baseline' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, border: 'none', padding: '0.4rem', fontSize: '0.8rem' }}
            onClick={() => { setActiveTab('baseline'); setMsg(''); setError(''); }}
          >
            Baseline Records
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'about' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, border: 'none', padding: '0.4rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
            onClick={() => { setActiveTab('about'); setMsg(''); setError(''); }}
          >
            <Info size={14} /> About
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

        {activeTab === 'baseline' ? (
          <div>
            <form onSubmit={handleSaveBaseline}>
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--ink)', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Historical Baseline Figures
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginBottom: '0.75rem' }}>
                  Period counts from past terms prior to daily register logging.
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
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Saving...' : 'Update Baseline Figures'}
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
        ) : (
          /* About Tab */
          <div>
            <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--rule)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1rem', textAlign: 'center' }}>
              <div className="brand-crest" style={{ margin: '0 auto 0.5rem', width: '42px', height: '42px', fontSize: '1.3rem' }}>
                ₹
              </div>
              <h3 className="heading-ledger" style={{ fontSize: '1.25rem', color: 'var(--ink)' }}>ATT PER Y</h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                Version <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>1.0.0</span> (Academic Edition)
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginTop: '0.5rem', lineHeight: 1.4 }}>
                Personal multi-user attendance register, 75% threshold bunk calculator, and 7-day FAT forecast simulator.
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
                href="https://instagram.com/itz_me_charan_610"
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
                    <div style={{ fontSize: '0.725rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>@itz_me_charan_610</div>
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
