import React, { useState, useMemo, memo } from 'react';
import { 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Award, 
  ShieldCheck, 
  FileSpreadsheet,
  Database,
  Cpu,
  Code,
  BookOpen
} from 'lucide-react';
import { api } from '../api';

function DashboardTabComponent({ summary, user }) {
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
    if (pct >= 85) return { label: 'Distinction (≥85%)', icon: Award, badgeClass: 'good' };
    if (pct >= 75) return { label: 'Safe Zone (≥75%)', icon: ShieldCheck, badgeClass: 'good' };
    if (pct >= 70) return { label: 'Borderline (70-74%)', icon: AlertTriangle, badgeClass: 'gold' };
    return { label: 'Detention Alert (<70%)', icon: ShieldAlert, badgeClass: 'bad' };
  };

  const tier = useMemo(() => getTier(overall.percentage), [overall.percentage]);
  const TierIcon = tier.icon;

  const getSubjectIcon = (subjectName = '') => {
    const s = subjectName.toUpperCase();
    if (s.includes('DBMS') || s.includes('DATABASE') || s.includes('SQL')) return Database;
    if (s.includes('DLCO') || s.includes('COA') || s.includes('CHIP') || s.includes('HARDWARE')) return Cpu;
    if (s.includes('LAB') || s.includes('JAVA') || s.includes('PYTHON') || s.includes('CPP') || s.includes('DSA')) return Code;
    if (s.includes('FLAT') || s.includes('MATH') || s.includes('STAT')) return BookOpen;
    return Layers;
  };

  const subjects = useMemo(() => {
    let list = Object.values(summary?.subjects || {});
    if (sortBy === 'lowest') {
      return [...list].sort((a, b) => a.percentage - b.percentage);
    } else if (sortBy === 'highest') {
      return [...list].sort((a, b) => b.percentage - a.percentage);
    }
    return list;
  }, [summary?.subjects, sortBy]);

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
      {/* 1. Overall Aggregate Hero Card */}
      <div className="ledger-card">
        <div className="card-header-ruled">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span className="card-header-title">Overall Attendance Register</span>
            <span className={`card-header-badge ${tier.badgeClass}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <TierIcon size={13} />
              {tier.label}
            </span>
          </div>
          <button 
            type="button" 
            className="btn btn-secondary btn-sm" 
            onClick={handleExportCsv} 
            disabled={exporting}
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            title="Download CSV Attendance Ledger"
          >
            <FileSpreadsheet size={14} color="var(--accent-gold-dark)" />
            <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>
        </div>

        <div className="hero-figure-group">
          <div>
            <div className={`hero-number ${overall.is_below_threshold ? 'below-threshold red-ink-flag' : ''}`}>
              {overall.percentage.toFixed(2)}%
            </div>
            <div style={{ fontSize: '0.825rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', marginTop: '0.45rem' }}>
              {overall.attended} Attended / {overall.total} Total Periods
            </div>
          </div>

          <div style={{ textAlign: 'right', fontSize: '0.775rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
            <div>Baseline: <strong>{overall.baseline_attended}/{overall.baseline_total}</strong></div>
            <div>Logged: <strong>+{overall.logged_attended}/+{overall.logged_total}</strong></div>
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
              <ShieldAlert size={20} />
              <div>
                <strong>Must attend next {overall.must_attend_next} periods</strong> consecutively to climb back to 75%.
              </div>
            </>
          ) : (
            <>
              <CheckCircle2 size={20} />
              <div>
                <strong>Safe to miss {overall.safe_to_miss} periods</strong> while maintaining compliance $\ge$ 75%.
              </div>
            </>
          )}
        </div>
      </div>

      {/* 2. Subject-Wise Ledger Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1.35rem 0 0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 className="section-headline" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', margin: 0 }}>
          <Layers size={18} color="var(--accent-gold-dark)" />
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
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
          >
            <option value="default">Default Order</option>
            <option value="lowest">Lowest % First</option>
            <option value="highest">Highest % First</option>
          </select>
        </div>
      </div>

      {/* 3. Subject-Wise Cards Grid */}
      <div className="subject-pc-grid">
        {subjects.map((subj) => {
          const hasLogs = subj.total > 0;
          const Icon = getSubjectIcon(subj.subject);

          return (
            <div 
              key={subj.subject} 
              className="ledger-card" 
              style={{ 
                marginBottom: '0.85rem',
                borderLeft: `4px solid ${subj.is_below_threshold && hasLogs ? 'var(--bad)' : 'var(--brand-forest)'}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                  <div className="subject-icon-box" style={{ width: '38px', height: '38px' }}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '1.05rem', color: 'var(--ink)', fontWeight: 700 }}>
                      {subj.subject}
                    </h4>
                    <div style={{ fontSize: '0.775rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                      {subj.attended} / {subj.total} periods attended {subj.holiday_periods > 0 && `• ${subj.holiday_periods} hol`}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span
                    className="mono-num"
                    style={{
                      fontSize: '1.35rem',
                      fontWeight: 800,
                      color: subj.is_below_threshold && hasLogs ? 'var(--bad)' : 'var(--brand-forest)'
                    }}
                  >
                    {hasLogs ? `${subj.percentage.toFixed(1)}%` : '—'}
                  </span>
                </div>
              </div>

              <div className="progress-rule-track" style={{ height: '6px', margin: '0.75rem 0 0.5rem' }}>
                <div
                  className={`progress-rule-fill ${subj.is_below_threshold && hasLogs ? 'bad' : 'good'}`}
                  style={{ width: `${hasLogs ? Math.min(100, Math.max(0, subj.percentage)) : 0}%` }}
                />
              </div>

              {hasLogs && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                  {subj.is_below_threshold ? (
                    <span style={{ color: 'var(--bad)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                      <AlertTriangle size={14} /> Need +{subj.must_attend_next} consecutive periods
                    </span>
                  ) : (
                    <span style={{ color: 'var(--good)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                      <CheckCircle2 size={14} /> Buffer: {subj.safe_to_miss} periods safe to miss
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

export default memo(DashboardTabComponent);
