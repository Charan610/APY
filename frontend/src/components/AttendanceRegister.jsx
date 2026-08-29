import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Check, X, Coffee, ChevronLeft, ChevronRight, CheckCheck, Sparkles, Lock, AlertCircle } from 'lucide-react';

export default function AttendanceRegister({ user, onAttendanceUpdated }) {
  const [currentDate, setCurrentDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  
  const [timetableByDay, setTimetableByDay] = useState({});
  const [dailyLogs, setDailyLogs] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];

  // Calculate 7-day edit window boundaries
  const todayDateObj = new Date();
  const minDateObj = new Date();
  minDateObj.setDate(todayDateObj.getDate() - 7);
  const minDateStr = minDateObj.toISOString().split('T')[0];

  const isDateEditable = currentDate >= minDateStr && currentDate <= todayStr;

  useEffect(() => {
    if (user?.section_id) {
      loadTimetable();
      loadLogs();
    }
  }, [user?.section_id]);

  const loadTimetable = async () => {
    try {
      const data = await api.getSectionTimetable(user.section_id);
      setTimetableByDay(data.timetable_by_day || {});
    } catch (err) {
      console.error('Failed to load timetable', err);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      // Load logs for current window
      const data = await api.getLogs();
      setDailyLogs(data.logs_by_date || {});
    } catch (err) {
      console.error('Failed to load daily logs', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to generate the week pill items (last 7 days + today)
  const getWeekDays = () => {
    const days = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date();
      d.setDate(todayDateObj.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      days.push({
        dateStr: iso,
        dayName: dayNames[d.getDay()],
        dayNum: d.getDate(),
        isToday: iso === todayStr,
        isSunday: d.getDay() === 0,
        hasLogs: Boolean(dailyLogs[iso]?.length)
      });
    }
    return days;
  };

  const handleDateChange = (dStr) => {
    setCurrentDate(dStr);
    setNotification('');
  };

  const shiftDate = (offset) => {
    const cur = new Date(currentDate);
    cur.setDate(cur.getDate() + offset);
    const iso = cur.toISOString().split('T')[0];
    handleDateChange(iso);
  };

  // Determine weekday for current selected date (DB weekday: 0=Sun..6=Sat)
  const currentWeekday = new Date(currentDate).getDay();
  const currentBlocks = timetableByDay[currentWeekday] || [];
  const isSunday = currentWeekday === 0;

  // Find status for a given block from loaded dailyLogs
  const getBlockStatus = (blockId) => {
    const dayEntries = dailyLogs[currentDate] || [];
    const entry = dayEntries.find(e => e.block_id === blockId);
    return entry ? entry.status : null;
  };

  const handleSetBlockStatus = async (blockId, newStatus) => {
    if (!isDateEditable) return;

    // Optimistically update dailyLogs state
    const currentDayEntries = [...(dailyLogs[currentDate] || [])];
    const existingIndex = currentDayEntries.findIndex(e => e.block_id === blockId);
    
    if (existingIndex >= 0) {
      currentDayEntries[existingIndex] = { ...currentDayEntries[existingIndex], status: newStatus };
    } else {
      currentDayEntries.push({ block_id: blockId, status: newStatus });
    }

    setDailyLogs(prev => ({
      ...prev,
      [currentDate]: currentDayEntries
    }));

    // Auto-save entry to backend
    try {
      setSaving(true);
      await api.markAttendance(currentDate, [
        { block_id: blockId, status: newStatus }
      ]);
      setNotification(`Saved ${newStatus.toUpperCase()}`);
      setTimeout(() => setNotification(''), 2000);
      onAttendanceUpdated();
    } catch (err) {
      alert(err.message || 'Failed to save attendance');
      loadLogs();
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAll = async (status) => {
    if (!isDateEditable || currentBlocks.length === 0) return;

    const entries = currentBlocks.map(b => ({
      block_id: b.id,
      status: status
    }));

    // Optimistic update
    setDailyLogs(prev => ({
      ...prev,
      [currentDate]: entries
    }));

    try {
      setSaving(true);
      await api.markAttendance(currentDate, entries);
      setNotification(`Marked all ${status.toUpperCase()}`);
      setTimeout(() => setNotification(''), 2500);
      onAttendanceUpdated();
    } catch (err) {
      alert(err.message || 'Failed to mark all');
      loadLogs();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="register-section">
      <div className="register-header">
        <div>
          <h2 className="heading-ledger" style={{ fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span>Period Ledger Register</span>
            {saving && <span style={{ fontSize: '0.75rem', color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>Saving...</span>}
            {notification && <span style={{ fontSize: '0.75rem', color: 'var(--teal)', background: 'var(--teal-glow)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{notification}</span>}
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
            Section {user?.section_label} ({user?.branch}) · 7-Day Server Window Enforced
          </p>
        </div>

        {/* Date Navigator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="date-navigator">
            <button
              type="button"
              className="btn btn-secondary btn-icon btn-sm"
              onClick={() => shiftDate(-1)}
              title="Previous Day"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="date-display-current">
              <span className="date-weekday">
                {new Date(currentDate).toLocaleDateString('en-US', { weekday: 'long' })}
              </span>
              <span className="date-val mono-num">
                {currentDate}
              </span>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-icon btn-sm"
              onClick={() => shiftDate(1)}
              disabled={currentDate >= todayStr}
              title="Next Day"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Week Selector Ribbon */}
      <div className="week-pills">
        {getWeekDays().map(d => (
          <div
            key={d.dateStr}
            className={`day-pill ${currentDate === d.dateStr ? 'active' : ''} ${d.isSunday ? 'sunday' : ''}`}
            onClick={() => handleDateChange(d.dateStr)}
          >
            <div className="day-pill-name">{d.dayName}</div>
            <div className="day-pill-num">{d.dayNum}</div>
            <div className="day-pill-status">
              {d.isToday ? (
                <span style={{ color: 'var(--teal)' }}>Today</span>
              ) : d.isSunday ? (
                <span>Holiday</span>
              ) : d.hasLogs ? (
                <span style={{ color: 'var(--success)' }}>Logged</span>
              ) : (
                <span>Unmarked</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit window check */}
      {!isDateEditable && (
        <div className="alert-box alert-error" style={{ marginTop: '1rem' }}>
          <Lock size={18} />
          <span>
            This date ({currentDate}) is locked. As per college spec, attendance entries can only be marked or updated for the last 7 days.
          </span>
        </div>
      )}

      {/* Quick Action Bar for current day */}
      {isDateEditable && !isSunday && currentBlocks.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1rem' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleMarkAll('present')}
            disabled={saving}
          >
            <CheckCheck size={14} color="var(--teal)" /> Mark All Present
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleMarkAll('holiday')}
            disabled={saving}
          >
            <Coffee size={14} color="var(--holiday)" /> Mark Day as Holiday
          </button>
        </div>
      )}

      {/* Timetable Blocks List */}
      {isSunday ? (
        <div style={{ padding: '2.5rem', textAlign: 'center', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', marginTop: '1rem', border: '1px dashed var(--border-ledger)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>☕</div>
          <h3 className="heading-ledger" style={{ fontSize: '1.2rem', color: 'var(--holiday)' }}>Sunday — College Holiday</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
            Sundays are hardcoded non-instructional days and do not count towards attendance statistics.
          </p>
        </div>
      ) : currentBlocks.length === 0 ? (
        <div style={{ padding: '2.5rem', textAlign: 'center', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', marginTop: '1rem', color: 'var(--text-dim)' }}>
          No scheduled periods for {new Date(currentDate).toLocaleDateString('en-US', { weekday: 'long' })} in Section {user?.section_label}.
        </div>
      ) : (
        <table className="period-table">
          <tbody>
            {currentBlocks.map((block) => {
              const status = getBlockStatus(block.id);
              return (
                <tr key={block.id} className="period-row">
                  <td className="period-cell" style={{ width: '90px' }}>
                    <span className="period-num">#{block.order_index}</span>
                  </td>
                  <td className="period-cell">
                    <span className="period-subject-name">{block.subject}</span>
                    <span className="period-weight-tag mono-num">
                      [{block.periods} {block.periods === 1 ? 'Period' : 'Periods'}]
                    </span>
                  </td>
                  <td className="period-cell" style={{ textAlign: 'right', width: '280px' }}>
                    <div className="status-toggle-group">
                      <button
                        type="button"
                        className={`status-btn ${status === 'present' ? 'selected-present' : ''}`}
                        onClick={() => handleSetBlockStatus(block.id, 'present')}
                        disabled={!isDateEditable || saving}
                      >
                        Present
                      </button>
                      <button
                        type="button"
                        className={`status-btn ${status === 'absent' ? 'selected-absent' : ''}`}
                        onClick={() => handleSetBlockStatus(block.id, 'absent')}
                        disabled={!isDateEditable || saving}
                      >
                        Absent
                      </button>
                      <button
                        type="button"
                        className={`status-btn ${status === 'holiday' ? 'selected-holiday' : ''}`}
                        onClick={() => handleSetBlockStatus(block.id, 'holiday')}
                        disabled={!isDateEditable || saving}
                      >
                        Holiday
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
