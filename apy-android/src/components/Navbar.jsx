import React from 'react';
import { BookOpen, Calendar, TrendingUp, Settings, LogOut, ShieldAlert, Sparkles, Database } from 'lucide-react';

export default function Navbar({ user, summary, onOpenFAT, onOpenTimetable, onOpenSettings, onLogout }) {
  const overall = summary?.overall || { percentage: 0, attended: 0, total: 0, is_below_threshold: false };

  return (
    <header className="navbar">
      <div className="brand-badge">
        <div className="brand-icon">
          <span>₹</span>
        </div>
        <div>
          <div className="brand-title font-serif">Attendance Register</div>
          <div className="brand-sub">
            {user ? `${user.branch || 'CSE'} — Sec ${user.section_label || 'C'} · ${user.register_number}` : 'CSE Department'}
          </div>
        </div>
      </div>

      {user && (
        <div className="nav-stats">
          <div className="stat-pill">
            <span className="stat-pill-label">Aggregate:</span>
            <span className={`stat-pill-value mono-num ${overall.is_below_threshold ? 'danger' : ''}`}>
              {overall.percentage.toFixed(2)}%
            </span>
          </div>

          <div className="stat-pill">
            <span className="stat-pill-label">Periods:</span>
            <span className="mono-num text-muted">
              {overall.attended} / {overall.total}
            </span>
          </div>

          {overall.is_below_threshold ? (
            <div className="stat-pill" style={{ borderColor: 'rgba(244, 63, 94, 0.4)' }}>
              <span className="stat-pill-label" style={{ color: 'var(--danger)' }}>Need:</span>
              <span className="mono-num danger" style={{ color: 'var(--danger)', fontWeight: 700 }}>
                +{overall.must_attend_next}
              </span>
            </div>
          ) : (
            <div className="stat-pill" style={{ borderColor: 'rgba(0, 229, 188, 0.4)' }}>
              <span className="stat-pill-label" style={{ color: 'var(--teal)' }}>Safe:</span>
              <span className="mono-num" style={{ color: 'var(--teal)', fontWeight: 700 }}>
                {overall.safe_to_miss}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="nav-actions">
        {user ? (
          <>
            <button className="btn btn-secondary btn-sm" onClick={onOpenFAT} title="Forecast Attendance Tool">
              <Sparkles size={16} color="var(--teal)" />
              <span>FAT Forecast</span>
            </button>

            <button className="btn btn-secondary btn-sm" onClick={onOpenTimetable} title="View Timetable">
              <Calendar size={16} />
              <span>Timetable</span>
            </button>

            <button className="btn btn-secondary btn-icon" onClick={onOpenSettings} title="Settings & Baseline">
              <Settings size={16} />
            </button>

            <button className="btn btn-danger btn-icon" onClick={onLogout} title="Logout">
              <LogOut size={16} />
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
