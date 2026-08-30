import React from 'react';
import { Settings, LogOut, CalendarCheck, LayoutDashboard, Calendar, Sparkles, Bell } from 'lucide-react';

export default function Header({ user, activeTab, onSelectTab, onOpenSettings, onOpenReminders, onLogout }) {
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
      </div>

      <div className="header-actions">
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
