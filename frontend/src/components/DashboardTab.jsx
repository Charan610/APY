import React, { useState } from 'react';
import { 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Download, 
  Award, 
  ShieldCheck, 
  ArrowUpDown,
  FileSpreadsheet,
  CalendarCheck
} from 'lucide-react';
import { api } from '../api';

export default function DashboardTab({ summary, user }) {
  const [exporting, setExporting] = useState(false);
  const [sortBy, setSortBy] = useState('default'); // 'default', 'lowest', 'highest'

  const overall = summary?.overall || {
    percentage: 0.0,
    attended: 0,
    total: 0,
    baseline_attended: 0,
    baseline_total: 0,
    logged_attended: 0,
    logged_total: 0,
    is_below_threshold: false,
    safe_to_miss: 0,
    must_attend_next: 0
  };

  const getTier = (pct) => {
    if (pct >= 85) return { label: 'Distinction (≥85%)', icon: Award, color: 'var(--good)', badgeClass: 'good' };
    if (pct >= 75) return { label: 'Safe Zone (≥75%)', icon: ShieldCheck, color: 'var(--good)', badgeClass: 'good' };
    if (pct >= 70) return { label: 'Borderline (70-74%)', icon: AlertTriangle, color: 'var(--accent-gold)', badgeClass: 'bad' };
    return { label: 'Detention Alert (<70%)', icon: ShieldAlert, color: 'var(--bad)', badgeClass: 'bad' };
  };

  const tier = getTier(overall.percentage);
  const TierIcon = tier.icon;

  let subjects = Object.values(summary?.subjects || {});
  if (sortBy === 'lowest') {
    subjects = [...subjects].sort((a, b) => a.percentage - b.percentage);
  } else if (sortBy === 'highest') {
    subjects = [...subjects].sort((a, b) => b.percentage - a.percentage);
  }

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      await api.exportCsv();
    } catch (e) {
      alert('CSV Export: ' + (e.message || 'Error downloading ledger'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      {/* Hero Overall Aggregate Card */}
      <div className="ledger-card">
        <div className="card-header-ruled">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="card-header-title">Overall Attendance Register</span>
            <span className={`card-header-badge ${tier.badgeClass}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <TierIcon size={12} />
              {tier.label}
            </span>
          </div>
          <button 
            type="button" 
            className="btn btn-secondary btn-sm" 
            onClick={handleExportCsv} 
            disabled={exporting}
            style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            title="Download CSV Attendance Ledger"
          >
            <FileSpreadsheet size={13} color="var(--accent-gold)" />
            <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>
        </div>

        <div className="hero-figure-group">
          <div>
            <div className={`hero-number ${overall.is_below_threshold ? 'below-threshold red-ink-flag' : ''}`}>
              {overall.percentage.toFixed(2)}%
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', marginTop: '0.35rem' }}>
              {overall.attended} Attended / {overall.total} Total Periods
            </div>
          </div>

          <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
            <div>Baseline: {overall.baseline_attended}/{overall.baseline_total}</div>
            <div>Logged: +{overall.logged_attended}/+{overall.logged_total}</div>
          </div>
        </div>

        {/* Progress rule */}
        <div className="progress-rule-track">
          <div
            className={`progress-rule-fill ${overall.is_below_threshold ? 'bad' : 'good'}`}
            style={{ width: `${Math.min(100, Math.max(0, overall.percentage))}%` }}
          />
        </div>

        {/* Bunk strategy callout */}
        <div className={`bunk-banner ${overall.is_below_threshold ? 'bad' : 'good'}`}>
          {overall.is_below_threshold ? (
            <>
              <ShieldAlert size={18} />
              <div>
                <strong>Must attend next {overall.must_attend_next} periods</strong> consecutively to climb back to 75%.
              </div>
            </>
          ) : (
            <>
              <CheckCircle2 size={18} />
              <div>
                <strong>Safe to miss {overall.safe_to_miss} periods</strong> while staying compliant $\ge$ 75%.
              </div>
            </>
          )}
        </div>
      </div>

      {/* Subject-Wise Ledger Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1.25rem 0 0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 className="heading-ledger" style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
          <Layers size={16} color="var(--accent-gold)" />
          <span>Subject-Wise Register</span>
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
            {subjects.length} Subjects
          </span>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="input-select"
            style={{ fontSize: '0.72rem', padding: '0.2rem 0.4rem', background: 'var(--surface-alt)' }}
          >
            <option value="default">Default Order</option>
            <option value="lowest">Lowest % First</option>
            <option value="highest">Highest % First</option>
          </select>
        </div>
      </div>

      {/* Subject-Wise Cards */}
      <div className="subject-pc-grid">
        {subjects.map((subj) => {
          const hasLogs = subj.total > 0;
          return (
            <div key={subj.subject} className="ledger-card" style={{ marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h4 style={{ fontSize: '1rem', color: 'var(--ink)', fontWeight: 700 }}>
                    {subj.subject}
                  </h4>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                    {subj.attended} / {subj.total} periods attended {subj.holiday_periods > 0 && `· ${subj.holiday_periods} hol`}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span
                    className="mono-num"
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      color: subj.is_below_threshold && hasLogs ? 'var(--bad)' : 'var(--good)'
                    }}
                  >
                    {hasLogs ? `${subj.percentage.toFixed(1)}%` : '—'}
                  </span>
                </div>
              </div>

              <div className="progress-rule-track">
                <div
                  className={`progress-rule-fill ${subj.is_below_threshold && hasLogs ? 'bad' : 'good'}`}
                  style={{ width: `${hasLogs ? Math.min(100, Math.max(0, subj.percentage)) : 0}%` }}
                />
              </div>

              {hasLogs && (
                <div style={{ marginTop: '0.6rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                  {subj.is_below_threshold ? (
                    <span style={{ color: 'var(--bad)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <AlertTriangle size={13} /> Need +{subj.must_attend_next} consecutive periods
                    </span>
                  ) : (
                    <span style={{ color: 'var(--good)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <CheckCircle2 size={13} /> Buffer: {subj.safe_to_miss} periods safe to miss
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
