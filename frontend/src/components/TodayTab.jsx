import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Check, X, Coffee, ChevronLeft, ChevronRight, CheckCheck, Lock, UserX } from 'lucide-react';

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

  const maxDateObj = new Date();
  maxDateObj.setDate(todayObj.getDate() + 7);
  const maxDateStr = maxDateObj.toISOString().split('T')[0];

  const isCoveredByBaseline = Boolean(user?.baseline_date && currentDate <= user.baseline_date);
  const isDateEditable = currentDate >= minDateStr && currentDate <= maxDateStr && !isCoveredByBaseline;

  useEffect(() => {
    if (user?.section_id) {
      loadInitialData();
    }
  }, [user?.section_id]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [ttData, logsData] = await Promise.all([
        api.getSectionTimetable(user.section_id).catch(() => ({})),
        api.getLogs().catch(() => ({}))
      ]);
      setTimetableByDay(ttData.timetable_by_day || {});
      setDailyLogs(logsData.logs_by_date || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      const data = await api.getLogs();
      setDailyLogs(data.logs_by_date || {});
    } catch (err) {
      console.error(err);
    }
  };

  const getWeekDays = () => {
    const days = [];
    // Show from 2 days back up to next 7 days (including next Saturday)
    for (let i = -2; i <= 7; i++) {
      const d = new Date();
      d.setDate(todayObj.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const isPastBaseline = Boolean(user?.baseline_date && iso <= user.baseline_date);
      days.push({
        dateStr: iso,
        dayName: dayNames[d.getDay()],
        dayNum: d.getDate(),
        isToday: iso === todayStr,
        isSunday: d.getDay() === 0,
        isPastBaseline,
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

  const handleSetBlockStatus = async (blockId, clickedStatus) => {
    if (!isDateEditable) return;

    const currentStatus = getBlockStatus(blockId);
    // Toggle: if clicking the currently active status, unmark it
    const targetStatus = (currentStatus === clickedStatus) ? 'unmarked' : clickedStatus;

    // Instant optimistic UI update (0ms lag)
    const currentEntries = [...(dailyLogs[currentDate] || [])];
    const idx = currentEntries.findIndex(e => e.block_id === blockId);
    if (targetStatus === 'unmarked') {
      if (idx >= 0) currentEntries.splice(idx, 1);
    } else {
      if (idx >= 0) {
        currentEntries[idx] = { ...currentEntries[idx], status: targetStatus };
      } else {
        currentEntries.push({ block_id: blockId, status: targetStatus });
      }
    }

    setDailyLogs(prev => ({ ...prev, [currentDate]: currentEntries }));
    setFeedback(targetStatus === 'unmarked' ? 'Unmarked' : `Saved ${targetStatus.toUpperCase()}`);
    setTimeout(() => setFeedback(''), 1500);

    // Non-blocking background save
    try {
      await api.markAttendance(currentDate, [{ block_id: blockId, status: targetStatus }]);
      onAttendanceUpdated();
    } catch (err) {
      console.error('Failed to save attendance:', err);
      loadLogs();
    }
  };

  const handleMarkAll = async (status) => {
    if (!isDateEditable || currentBlocks.length === 0) return;

    const entries = currentBlocks.map(b => ({ block_id: b.id, status }));
    setDailyLogs(prev => ({ ...prev, [currentDate]: entries }));
    setFeedback(`Marked All ${status.toUpperCase()}`);
    setTimeout(() => setFeedback(''), 1500);

    try {
      setSaving(true);
      await api.markAttendance(currentDate, entries);
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
            <div className={`ribbon-status-dot ${d.isSunday ? 'holiday' : d.isPastBaseline ? 'baseline' : d.hasLogs ? 'logged' : ''}`} />
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
              Section {user?.section_label} · {feedback || (saving ? 'Saving...' : isCoveredByBaseline ? 'Included in Baseline Cutoff' : 'Active Schedule Window')}
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
              disabled={currentDate >= maxDateStr}
              title="Next Day"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Baseline / Edit window check */}
        {isCoveredByBaseline ? (
          <div className="alert-callout error" style={{ background: 'var(--surface-alt)', border: '1px solid var(--rule)', color: 'var(--ink)' }}>
            <Lock size={16} color="var(--accent-gold)" />
            <span>
              <strong>Included in Historical Baseline:</strong> Periods up to & including <strong>{user.baseline_date}</strong> are already counted in your baseline figures ({user.baseline_attended}/{user.baseline_total}). Daily logging starts after this date.
            </span>
          </div>
        ) : !isDateEditable ? (
          <div className="alert-callout error">
            <Lock size={16} />
            <span>This date is outside the active 7-day window. Editing is locked.</span>
          </div>
        ) : null}

        {/* Action helper buttons */}
        {isDateEditable && !isSunday && currentBlocks.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleMarkAll('present')} disabled={saving}>
              <CheckCheck size={14} color="var(--good)" /> All Present
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleMarkAll('absent')} disabled={saving}>
              <UserX size={14} color="var(--bad)" /> All Absent
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
