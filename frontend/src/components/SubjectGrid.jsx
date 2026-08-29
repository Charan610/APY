import React from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, Sparkles, BookOpen, Layers } from 'lucide-react';

export default function SubjectGrid({ summary }) {
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

  const subjects = Object.values(summary?.subjects || {});

  return (
    <div>
      {/* Top Banner / Summary */}
      <div className="summary-banner">
        {/* Overall Percentage Ledger Card */}
        <div className="ledger-card" style={{ gridColumn: 'span 1' }}>
          <div className="card-title">
            <span>Overall Aggregate</span>
            <span className={`hero-badge ${overall.is_below_threshold ? 'warn' : 'good'}`}>
              {overall.is_below_threshold ? 'Below 75%' : 'Compliant'}
            </span>
          </div>

          <div className="hero-pct-container">
            <span className={`hero-pct ${overall.is_below_threshold ? 'warn scribble-circle' : 'good'}`}>
              {overall.percentage.toFixed(2)}%
            </span>
          </div>

          <div className="bunk-status-text">
            {overall.is_below_threshold ? (
              <span style={{ color: 'var(--danger)' }}>
                Need to attend <strong>{overall.must_attend_next}</strong> periods in a row to reach 75%.
              </span>
            ) : (
              <span style={{ color: 'var(--teal)' }}>
                You can safely miss <strong>{overall.safe_to_miss}</strong> periods while staying $\ge$ 75%.
              </span>
            )}
          </div>

          <div className="progress-bar-bg">
            <div
              className={`progress-bar-fill ${overall.is_below_threshold ? 'warn' : 'good'}`}
              style={{ width: `${Math.min(100, Math.max(0, overall.percentage))}%` }}
            />
          </div>
        </div>

        {/* Total Periods Breakdown */}
        <div className="ledger-card">
          <div className="card-title">Total Periods Logged</div>
          <div style={{ margin: '0.75rem 0' }}>
            <span className="mono-num" style={{ fontSize: '2rem', fontWeight: 700, color: '#f8fafc' }}>
              {overall.attended}
            </span>
            <span className="mono-num" style={{ fontSize: '1.2rem', color: 'var(--text-dim)' }}>
              {' '}/ {overall.total}
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            Logged: +{overall.logged_attended} / +{overall.logged_total} periods
          </div>
        </div>

        {/* Baseline Records */}
        <div className="ledger-card">
          <div className="card-title">Baseline Record</div>
          <div style={{ margin: '0.75rem 0' }}>
            <span className="mono-num" style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--copper-light)' }}>
              {overall.baseline_attended}
            </span>
            <span className="mono-num" style={{ fontSize: '1.1rem', color: 'var(--text-dim)' }}>
              {' '}/ {overall.baseline_total}
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Effective: {overall.baseline_date || 'N/A'}
          </div>
        </div>

        {/* Action Strategy */}
        <div className="ledger-card">
          <div className="card-title">Bunk Strategy</div>
          <div style={{ margin: '0.75rem 0' }}>
            {overall.is_below_threshold ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)' }}>
                <ShieldAlert size={26} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }} className="mono-num">
                    +{overall.must_attend_next} Consecutive
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>To regain 75% threshold</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--teal)' }}>
                <CheckCircle2 size={26} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }} className="mono-num">
                    {overall.safe_to_miss} Periods Free
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Bunk buffer available</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Subject-Wise Ledger Breakdown */}
      <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className="heading-ledger" style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Layers size={18} color="var(--copper-light)" />
          <span>Subject-Wise Register</span>
        </h3>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {subjects.length} Subjects Tracked
        </span>
      </div>

      <div className="subject-grid">
        {subjects.map((subj) => {
          const hasLogs = subj.total > 0;
          return (
            <div key={subj.subject} className={`subject-card ${subj.is_below_threshold && hasLogs ? 'is-danger' : ''}`}>
              <div>
                <div className="subject-header">
                  <div>
                    <h4 className="subject-title">{subj.subject}</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      {subj.attended} / {subj.total} attended {subj.holiday_periods > 0 && `(${subj.holiday_periods} hol)`}
                    </span>
                  </div>

                  <div className={`subject-pct ${subj.is_below_threshold && hasLogs ? 'warn' : 'good'}`}>
                    {hasLogs ? `${subj.percentage.toFixed(1)}%` : '—'}
                  </div>
                </div>

                <div className="progress-bar-bg">
                  <div
                    className={`progress-bar-fill ${subj.is_below_threshold && hasLogs ? 'warn' : 'good'}`}
                    style={{ width: `${hasLogs ? Math.min(100, Math.max(0, subj.percentage)) : 0}%` }}
                  />
                </div>
              </div>

              {/* Bunk advice chip */}
              {hasLogs ? (
                subj.is_below_threshold ? (
                  <div className="subject-bunk-chip danger mono-num">
                    <AlertTriangle size={14} /> Must attend next <strong>{subj.must_attend_next}</strong> periods
                  </div>
                ) : (
                  <div className="subject-bunk-chip safe mono-num">
                    <CheckCircle2 size={14} /> Safe to miss <strong>{subj.safe_to_miss}</strong> periods
                  </div>
                )
              ) : (
                <div className="subject-bunk-chip" style={{ background: 'var(--bg-input)', color: 'var(--text-dim)' }}>
                  No classes logged yet
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
