import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Check, X, Coffee, ChevronLeft, ChevronRight, CheckCheck, Lock } from 'lucide-react';

export default function TodayTab({ user, onAttendanceUpdated }) {
  const [currentDate, setCurrentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [timetableByDay, setTimetableByDay] = useState({});
  const [dailyLogs, setDailyLogs] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];
  const todayObj = new Date();
  const minDateObj = new Date();
  minDateObj.setDate(todayObj.getDate() - 7);
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
      console.error(err);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getLogs();
      setDailyLogs(data.logs_by_date || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getWeekDays = () => {
    const days = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date();
      d.setDate(todayObj.getDate() - i);
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

  const shiftDate = (offset) => {
    const cur = new Date(currentDate);
    cur.setDate(cur.getDate() + offset);
    const iso = cur.toISOString().split('T')[0];
    setCurrentDate(iso);
    setFeedback('');
  };

  const currentWeekday = new Date(currentDate).getDay();
  const currentBlocks = timetableByDay[currentWeekday] || [];
  const isSunday = currentWeekday === 0;

  const getBlockStatus = (blockId) => {
    const entries = dailyLogs[currentDate] || [];
    const match = entries.find(e => e.block_id === blockId);
    return match ? match.status : null;
  };

  const handleSetBlockStatus = async (blockId, newStatus) => {
    if (!isDateEditable) return;

    const currentEntries = [...(dailyLogs[currentDate] || [])];
    const idx = currentEntries.findIndex(e => e.block_id === blockId);
    if (idx >= 0) {
      currentEntries[idx] = { ...currentEntries[idx], status: newStatus };
    } else {
      currentEntries.push({ block_id: blockId, status: newStatus });
    }

    setDailyLogs(prev => ({ ...prev, [currentDate]: currentEntries }));

    try {
      setSaving(true);
      await api.markAttendance(currentDate, [{ block_id: blockId, status: newStatus }]);
      setFeedback(`Saved ${newStatus.toUpperCase()}`);
      setTimeout(() => setFeedback(''), 2000);
      onAttendanceUpdated();
    } catch (err) {
      alert(err.message || 'Failed to save');
      loadLogs();
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAll = async (status) => {
    if (!isDateEditable || currentBlocks.length === 0) return;

    const entries = currentBlocks.map(b => ({ block_id: b.id, status }));
    setDailyLogs(prev => ({ ...prev, [currentDate]: entries }));

    try {
      setSaving(true);
      await api.markAttendance(currentDate, entries);
      setFeedback(`Marked All ${status.toUpperCase()}`);
      setTimeout(() => setFeedback(''), 2000);
      onAttendanceUpdated();
    } catch (err) {
      alert(err.message || 'Failed to mark all');
      loadLogs();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Week Navigator Ribbon */}
      <div className="week-navigator-ribbon">
        {getWeekDays().map((d) => (
          <div
            key={d.dateStr}
            className={`ribbon-day-cell ${currentDate === d.dateStr ? 'active' : ''}`}
            onClick={() => { setCurrentDate(d.dateStr); setFeedback(''); }}
          >
            <div className="ribbon-day-label">{d.dayName}</div>
            <div className="ribbon-day-num">{d.dayNum}</div>
            <div className={`ribbon-status-dot ${d.isSunday ? 'holiday' : d.hasLogs ? 'logged' : ''}`} />
          </div>
        ))}
      </div>

      {/* Main Ledger Register Card */}
      <div className="ledger-card">
        <div className="card-header-ruled">
          <div>
            <div className="card-header-title">
              <span>{new Date(currentDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
              {currentDate === todayStr && <span className="card-header-badge good">Today</span>}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
              Section {user?.section_label} · {feedback || (saving ? 'Saving...' : '7-Day Edit Window')}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button type="button" className="btn-icon" onClick={() => shiftDate(-1)} title="Previous Day">
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="btn-icon"
              onClick={() => shiftDate(1)}
              disabled={currentDate >= todayStr}
              title="Next Day"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Edit window check */}
        {!isDateEditable && (
          <div className="alert-callout error">
            <Lock size={16} />
            <span>This date is outside the 7-day window. Editing is locked.</span>
          </div>
        )}

        {/* Action helper buttons */}
        {isDateEditable && !isSunday && currentBlocks.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '0.85rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleMarkAll('present')} disabled={saving}>
              <CheckCheck size={14} color="var(--good)" /> All Present
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleMarkAll('holiday')} disabled={saving}>
              <Coffee size={14} color="var(--accent-gold)" /> Day Holiday
            </button>
          </div>
        )}

        {/* Periods List */}
        {isSunday ? (
          <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>☕</div>
            <h4 className="heading-ledger" style={{ color: 'var(--accent-gold)', fontSize: '1.05rem' }}>Sunday — College Holiday</h4>
            <p style={{ fontSize: '0.775rem', color: 'var(--ink-soft)', marginTop: '0.2rem' }}>
              Sundays are fixed holidays and do not count in attendance totals.
            </p>
          </div>
        ) : currentBlocks.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
            No scheduled periods for {new Date(currentDate).toLocaleDateString('en-US', { weekday: 'long' })}.
          </div>
        ) : (
          <div>
            {currentBlocks.map((block) => {
              const status = getBlockStatus(block.id);
              return (
                <div key={block.id} className="period-ledger-block">
                  <div className="block-title-box">
                    <span className="block-index-badge">#{block.order_index}</span>
                    <div>
                      <div className="block-name">{block.subject}</div>
                      <div className="block-weight">
                        {block.periods} {block.periods === 1 ? 'Period' : 'Periods'}
                        {block.subject.includes('LAB') && <span style={{ color: 'var(--accent-gold)', marginLeft: '4px', fontWeight: 600 }}>[Lab]</span>}
                      </div>
                    </div>
                  </div>

                  <div className="status-pill-group">
                    <button
                      type="button"
                      className={`status-pill-btn ${status === 'present' ? 'active-present' : ''}`}
                      onClick={() => handleSetBlockStatus(block.id, 'present')}
                      disabled={!isDateEditable || saving}
                    >
                      P
                    </button>
                    <button
                      type="button"
                      className={`status-pill-btn ${status === 'absent' ? 'active-absent' : ''}`}
                      onClick={() => handleSetBlockStatus(block.id, 'absent')}
                      disabled={!isDateEditable || saving}
                    >
                      A
                    </button>
                    <button
                      type="button"
                      className={`status-pill-btn ${status === 'holiday' ? 'active-holiday' : ''}`}
                      onClick={() => handleSetBlockStatus(block.id, 'holiday')}
                      disabled={!isDateEditable || saving}
                    >
                      H
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
