import React from 'react';
import { Settings, LogOut } from 'lucide-react';

export default function Header({ user, onOpenSettings, onLogout }) {
  return (
    <header className="ledger-header">
      <div className="brand-section">
        <div className="brand-crest">₹</div>
        <div>
          <div className="brand-heading font-serif">Attendance Register</div>
          <div className="brand-subline">
            {user ? `${user.branch || 'CSE'} — Sec ${user.section_label || 'C'} · ${user.register_number}` : 'CSE Department'}
          </div>
        </div>
      </div>

      <div className="header-actions">
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
