import React, { useState } from 'react';
import { api } from '../api';
import { Settings, Database, CheckCircle2, AlertCircle, X, Shield } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose, user, onUserUpdated }) {
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--rule)', paddingBottom: '0.65rem' }}>
          <div>
            <h3 className="heading-ledger" style={{ fontSize: '1.15rem' }}>Settings & Baseline</h3>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
              {user?.register_number} · Section {user?.section_label} ({user?.branch})
            </div>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>
            <X size={18} />
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

        {/* Durability */}
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
    </div>
  );
}
