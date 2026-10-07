import React, { useState, useEffect, useRef } from 'react';
import { Settings, LogOut, CalendarCheck, LayoutDashboard, Calendar, Sparkles, Bell, ShieldCheck } from 'lucide-react';
import { checkIsAdmin } from '../api';
import BrandLogo from './BrandLogo';

export default function Header({ 
  user, 
  activeTab, 
  onSelectTab, 
  onOpenSettings, 
  onOpenReminders, 
  onOpenAdmin, 
  onLogout, 
  hasUpdate = false, 
  brandLogoRef,
  introStage = 'complete'
}) {
  const isAdmin = checkIsAdmin(user);
  const isEarlyIntro = introStage === 'logo-center';
  const hideDuringIntro = isEarlyIntro;

  return (
    <header className="ledger-header">
      {/* Brand Section: Logo + App Name */}
      <div 
        className="brand-section"
        onClick={() => onSelectTab && onSelectTab('today')}
        role="button"
        tabIndex={0}
      >
        <div 
          className="brand-crest" 
          ref={brandLogoRef} 
          title="ATT PER Y — Academic Ledger"
          style={{
            opacity: isEarlyIntro ? 0 : 1,
            transition: 'opacity 0.35s ease'
          }}
        >
          <BrandLogo size={40} />
        </div>
        <div 
          className="brand-title-wrap"
          style={{
            opacity: isEarlyIntro ? 0 : 1,
            transition: 'opacity 0.35s ease'
          }}
        >
          <div className="brand-heading font-serif">
            <span className="brand-title-gold">ATT</span> <span className="brand-title-green">PER Y</span>
          </div>
          <div className="brand-subline">
            {user ? `${user.branch || 'CSE'} • Sec ${user.section_label || 'C'} • ${user.register_number}` : 'Academic Ledger'}
          </div>
        </div>
      </div>

      {/* Desktop Navigation Links */}
      <div 
        className="desktop-nav-links"
        style={{ 
          opacity: hideDuringIntro ? 0 : 1, 
          transition: 'opacity 0.45s ease 0.35s' 
        }}
      >
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
              color: 'var(--accent-gold-dark)',
              borderColor: 'var(--accent-gold-border)',
              background: 'var(--accent-gold-soft)'
            }}
          >
            <ShieldCheck size={16} />
            <span>Admin</span>
          </button>
        )}
      </div>

      {/* Header Actions */}
      <div 
        className="header-actions"
        style={{ 
          opacity: hideDuringIntro ? 0 : 1, 
          transition: 'opacity 0.45s ease 0.35s' 
        }}
      >
        {isAdmin && (
          <button
            type="button"
            className="btn-header-action"
            onClick={onOpenAdmin}
            title="Administrator Portal"
            style={{
              color: 'var(--accent-gold-dark)',
              background: 'var(--accent-gold-soft)',
              borderColor: 'var(--accent-gold-border)'
            }}
          >
            <ShieldCheck size={19} />
          </button>
        )}
        
        <button
          type="button"
          className="btn-header-action"
          onClick={onOpenReminders}
          title="Daily Attendance Reminders"
        >
          <Bell size={18} />
          <span style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: 'var(--accent-gold)',
            boxShadow: '0 0 4px var(--accent-gold)'
          }} />
        </button>

        <button
          type="button"
          className="btn-header-action"
          onClick={onOpenSettings}
          title="Settings & Baseline"
        >
          <Settings size={18} />
          {hasUpdate && (
            <span style={{
              position: 'absolute',
              top: '6px',
              right: '6px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'var(--bad)',
              boxShadow: '0 0 4px var(--bad)'
            }} />
          )}
        </button>

        <button
          type="button"
          className="btn-header-action"
          onClick={onLogout}
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
