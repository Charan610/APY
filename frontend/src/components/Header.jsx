import React from 'react';
import { Settings, LogOut, CalendarCheck, LayoutDashboard, Calendar, Sparkles, Bell, ShieldCheck } from 'lucide-react';

export default function Header({ user, activeTab, onSelectTab, onOpenSettings, onOpenReminders, onOpenAdmin, onLogout }) {
  const isAdmin = Boolean(
    user?.is_admin ||
    (user?.register_number && ['25B91A05D8', '23B91A05C0'].includes(user.register_number.trim().toUpperCase()))
  );

  return (
    <header className="ledger-header">
      <div className="brand-section">
        <div className="brand-crest">₹</div>
        <div>
          <div className="brand-heading font-serif">ATT PER Y</div>
          <div className="brand-subline">
            {user ? `${user.branch || 'CSE'} — Sec ${user.section_label || 'C'} · ${user.register_number}` : 'CSE Department'}
          </div>
        </div>
      </div>

      {/* Desktop Navigation Links (Visible on PC / Tablet) */}
      <div className="desktop-nav-links">
        <button
          type="button"
          className={`desktop-tab-btn ${activeTab === 'today' ? 'active' : ''}`}
          onClick={() => onSelectTab('today')}
        >
          <CalendarCheck size={16} />
          <span>Today</span>
        </button>

        <button
          type="button"
          className={`desktop-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => onSelectTab('dashboard')}
        >
          <LayoutDashboard size={16} />
          <span>Dashboard</span>
        </button>

        <button
          type="button"
          className={`desktop-tab-btn ${activeTab === 'timetable' ? 'active' : ''}`}
          onClick={() => onSelectTab('timetable')}
        >
          <Calendar size={16} />
          <span>Timetable</span>
        </button>

        <button
          type="button"
          className={`desktop-tab-btn ${activeTab === 'forecast' ? 'active' : ''}`}
          onClick={() => onSelectTab('forecast')}
        >
          <Sparkles size={16} />
          <span>Forecast</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            className="desktop-tab-btn"
            onClick={onOpenAdmin}
            style={{
              color: 'var(--accent-gold, #d97706)',
              fontWeight: 700,
              background: 'var(--accent-gold-bg, rgba(217, 119, 6, 0.08))',
              border: '1px solid var(--accent-gold, #d97706)'
            }}
          >
            <ShieldCheck size={16} />
            <span>Admin</span>
          </button>
        )}
      </div>

      <div className="header-actions">
        {isAdmin && (
          <button
            type="button"
            className="btn-icon"
            onClick={onOpenAdmin}
            title="Admin PIN Reset Panel"
            style={{
              color: 'var(--accent-gold, #d97706)',
              background: 'var(--accent-gold-bg, rgba(217, 119, 6, 0.15))',
              borderColor: 'var(--accent-gold, #d97706)',
              borderWidth: '1.5px'
            }}
          >
            <ShieldCheck size={19} />
          </button>
        )}
        <button
          type="button"
          className="btn-icon"
          onClick={onOpenReminders}
          title="Daily Attendance Reminders"
          style={{ position: 'relative' }}
        >
          <Bell size={18} />
          <span style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: 'var(--accent-gold)'
          }} />
        </button>
        <button type="button" className="btn-icon" onClick={onOpenSettings} title="Settings & Baseline">
          <Settings size={18} />
        </button>
        <button type="button" className="btn-icon" onClick={onLogout} title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
