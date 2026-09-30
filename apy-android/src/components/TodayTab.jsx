import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';
import { 
  Check, 
  X, 
  Coffee, 
  ChevronLeft, 
  ChevronRight, 
  CheckCheck, 
  Lock, 
  UserX, 
  Flame, 
  RotateCcw, 
  FileText,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

export default function TodayTab({ user, summary, onAttendanceUpdated }) {
  const [currentDate, setCurrentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [timetableByDay, setTimetableByDay] = useState(() => {
    try {
      const cached = localStorage.getItem(`apy_tt_cache_${user?.section_id || 1}`);
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });
  const [dailyLogs, setDailyLogs] = useState(() => {
    try {
      const cached = localStorage.getItem('apy_logs_cache');
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [undoAction, setUndoAction] = useState(null); // { date, previousEntries }
  const [dayRemarks, setDayRemarks] = useState('');
  const [showRemarkInput, setShowRemarkInput] = useState(false);

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

  useEffect(() => {
    // Sync current day remarks from dailyLogs
    const entries = dailyLogs[currentDate] || [];
    const existingNote = entries.find(e => e.notes)?.notes || '';
    setDayRemarks(existingNote);
    setShowRemarkInput(Boolean(existingNote));
  }, [currentDate, dailyLogs]);

  const loadInitialData = async () => {
    try {
      const [ttData, logsData] = await Promise.all([
        api.getSectionTimetable(user.section_id).catch(() => ({})),
        api.getLogs().catch(() => ({}))
      ]);
      if (ttData?.timetable_by_day) {
        setTimetableByDay(ttData.timetable_by_day);
        try { localStorage.setItem(`apy_tt_cache_${user.section_id}`, JSON.stringify(ttData.timetable_by_day)); } catch {}
      }
      if (logsData?.logs_by_date) {
        setDailyLogs(logsData.logs_by_date);
        try { localStorage.setItem('apy_logs_cache', JSON.stringify(logsData.logs_by_date)); } catch {}
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadLogs = async () => {
    try {
      const data = await api.getLogs();
      if (data?.logs_by_date) {
        setDailyLogs(data.logs_by_date);
        try { localStorage.setItem('apy_logs_cache', JSON.stringify(data.logs_by_date)); } catch {}
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Calculate clean attendance streak
  const streakDays = useMemo(() => {
    let count = 0;
    const dates = Object.keys(dailyLogs).sort().reverse();
    for (const d of dates) {
      const logs = dailyLogs[d] || [];
      if (!logs.length) continue;
      const hasAbsent = logs.some(l => l.status === 'absent');
      const hasPresent = logs.some(l => l.status === 'present');
      if (hasPresent && !hasAbsent) {
        count++;
      } else if (hasAbsent) {
        break;
      }
    }
    return count;
  }, [dailyLogs]);

  // Calculate impact of a block
  const getBlockImpact = (periods, targetStatus) => {
    const att = summary?.overall?.attended;
    const tot = summary?.overall?.total;
    if (att === undefined || tot === undefined || tot === 0) return null;
    const curPct = (att / tot) * 100;
    const newTot = tot + periods;
    const newAtt = targetStatus === 'present' ? att + periods : att;
    const newPct = (newAtt / newTot) * 100;
    const diff = newPct - curPct;
    return {
      formatted: diff >= 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`,
      isPositive: diff >= 0
    };
  };

  const getWeekDays = () => {
    const days = [];
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
    setUndoAction(null);
  };

  const currentWeekday = new Date(currentDate).getDay();
  const currentBlocks = timetableByDay[currentWeekday] || [];
  const isSunday = currentWeekday === 0;

  const getBlockStatus = (blockId) => {
    const entries = dailyLogs[currentDate] || [];
    const match = entries.find(e => e.block_id === blockId);
    return match ? match.status : null;
  };

  // Debounced, coalesced background sync queue
  const syncTimeoutRef = useRef(null);
  const inFlightRef = useRef(false);
  const pendingPayloadRef = useRef(null);

  // Optimistic summary recalculator: updates percentage and counters instantly (0ms)
  const computeOptimisticSummary = (blockChanges) => {
    if (!summary || !summary.overall) return null;
    const baseSummary = JSON.parse(JSON.stringify(summary));
    let deltaAttended = 0;
    let deltaTotal = 0;

    for (const change of blockChanges) {
      const { periods, oldStatus, newStatus, subject } = change;
      const oldAtt = oldStatus === 'present' ? periods : 0;
      const oldTot = (oldStatus === 'present' || oldStatus === 'absent') ? periods : 0;
      const newAtt = newStatus === 'present' ? periods : 0;
      const newTot = (newStatus === 'present' || newStatus === 'absent') ? periods : 0;

      const dAtt = newAtt - oldAtt;
      const dTot = newTot - oldTot;

      deltaAttended += dAtt;
      deltaTotal += dTot;

      if (subject && baseSummary.subjects && baseSummary.subjects[subject]) {
        const subj = baseSummary.subjects[subject];
        subj.attended = Math.max(0, (subj.attended || 0) + dAtt);
        subj.total = Math.max(0, (subj.total || 0) + dTot);
        const subjPct = subj.total > 0 ? Math.round((subj.attended / subj.total) * 10000) / 100 : 0;
        subj.percentage = subjPct;
        subj.is_below_threshold = subjPct < 75;
        subj.safe_to_miss = subjPct >= 75 ? Math.max(0, Math.floor((subj.attended / 0.75) - subj.total)) : 0;
        subj.must_attend_next = subjPct < 75 ? Math.max(0, Math.ceil((0.75 * subj.total - subj.attended) / 0.25)) : 0;
      }
    }

    const ov = baseSummary.overall;
    ov.attended = Math.max(0, (ov.attended || 0) + deltaAttended);
    ov.total = Math.max(0, (ov.total || 0) + deltaTotal);
    ov.logged_attended = Math.max(0, (ov.logged_attended || 0) + deltaAttended);
    ov.logged_total = Math.max(0, (ov.logged_total || 0) + deltaTotal);

    const pct = ov.total > 0 ? Math.round((ov.attended / ov.total) * 10000) / 100 : 0;
    ov.percentage = pct;
    ov.is_below_threshold = pct < 75;
    ov.safe_to_miss = pct >= 75 ? Math.max(0, Math.floor((ov.attended / 0.75) - ov.total)) : 0;
    ov.must_attend_next = pct < 75 ? Math.max(0, Math.ceil((0.75 * ov.total - ov.attended) / 0.25)) : 0;

    return baseSummary;
  };

  const queueBackgroundSync = (date, entries) => {
    // 1. Immediately cache logs to localStorage (0ms persistence)
    try {
      const currentStored = JSON.parse(localStorage.getItem('apy_logs_cache') || '{}');
      currentStored[date] = entries;
      localStorage.setItem('apy_logs_cache', JSON.stringify(currentStored));
    } catch {}

    pendingPayloadRef.current = { date, entries };
    setSaving(true);

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      while (pendingPayloadRef.current) {
        const { date: reqDate, entries: reqEntries } = pendingPayloadRef.current;
        pendingPayloadRef.current = null;
        try {
          const res = await api.markAttendance(reqDate, reqEntries);
          if (res?.summary && onAttendanceUpdated) {
            onAttendanceUpdated(res.summary);
          }
        } catch (err) {
          console.error('Background sync notice:', err);
        }
      }
      inFlightRef.current = false;
      setSaving(false);
    }, 120);
  };

  const handleSetBlockStatus = (blockId, clickedStatus) => {
    if (!isDateEditable) return;

    const block = currentBlocks.find(b => b.id === blockId);
    if (!block) return;

    const currentStatus = getBlockStatus(blockId);
    const targetStatus = (currentStatus === clickedStatus) ? 'unmarked' : clickedStatus;

    // Cache previous for undo
    const prevEntries = dailyLogs[currentDate] ? [...dailyLogs[currentDate]] : [];
    setUndoAction({ date: currentDate, entries: prevEntries });

    // 0ms Optimistic UI update
    const currentEntries = [...prevEntries];
    const idx = currentEntries.findIndex(e => e.block_id === blockId);
    if (targetStatus === 'unmarked') {
      if (idx >= 0) currentEntries.splice(idx, 1);
    } else {
      if (idx >= 0) {
        currentEntries[idx] = { ...currentEntries[idx], status: targetStatus, notes: dayRemarks || null };
      } else {
        currentEntries.push({ block_id: blockId, status: targetStatus, notes: dayRemarks || null });
      }
    }

    setDailyLogs(prev => ({ ...prev, [currentDate]: currentEntries }));
    setFeedback(targetStatus === 'unmarked' ? 'Unmarked' : `Saved ${targetStatus.toUpperCase()}`);
    setTimeout(() => setFeedback(''), 2000);

    // 0ms Optimistic Summary update
    const optimisticSummary = computeOptimisticSummary([{
      periods: block.periods,
      oldStatus: currentStatus,
      newStatus: targetStatus,
      subject: block.subject
    }]);
    if (optimisticSummary && onAttendanceUpdated) {
      onAttendanceUpdated(optimisticSummary);
    }

    // Background sync: send full updated day entries for total reliability
    queueBackgroundSync(currentDate, currentEntries);
  };

  const handleMarkAll = (status) => {
    if (!isDateEditable || currentBlocks.length === 0) return;

    const prevEntries = dailyLogs[currentDate] ? [...dailyLogs[currentDate]] : [];
    setUndoAction({ date: currentDate, entries: prevEntries });

    const entries = currentBlocks.map(b => ({ 
      block_id: b.id, 
      status, 
      notes: dayRemarks || null 
    }));

    // 0ms Optimistic state update
    setDailyLogs(prev => ({ ...prev, [currentDate]: entries }));
    setFeedback(`Marked All ${status.toUpperCase()}`);
    setTimeout(() => setFeedback(''), 2000);

    // 0ms Optimistic Summary recalculation for all blocks
    const changes = currentBlocks.map(b => {
      const match = prevEntries.find(p => p.block_id === b.id);
      return {
        periods: b.periods,
        oldStatus: match ? match.status : null,
        newStatus: status,
        subject: b.subject
      };
    });
    const optimisticSummary = computeOptimisticSummary(changes);
    if (optimisticSummary && onAttendanceUpdated) {
      onAttendanceUpdated(optimisticSummary);
    }

    // Queue non-blocking background sync
    queueBackgroundSync(currentDate, entries);
  };

  const handleUndo = () => {
    if (!undoAction || undoAction.date !== currentDate) return;
    const restored = undoAction.entries;
    const currentList = dailyLogs[currentDate] || [];

    setDailyLogs(prev => ({ ...prev, [currentDate]: restored }));
    setUndoAction(null);
    setFeedback('Reverted change');
    setTimeout(() => setFeedback(''), 1500);

    const changes = currentBlocks.map(b => {
      const oldMatch = currentList.find(c => c.block_id === b.id);
      const newMatch = restored.find(r => r.block_id === b.id);
      return {
        periods: b.periods,
        oldStatus: oldMatch ? oldMatch.status : null,
        newStatus: newMatch ? newMatch.status : 'unmarked',
        subject: b.subject
      };
    });
    const optimisticSummary = computeOptimisticSummary(changes);
    if (optimisticSummary && onAttendanceUpdated) {
      onAttendanceUpdated(optimisticSummary);
    }

    const payload = currentBlocks.map(b => {
      const match = restored.find(r => r.block_id === b.id);
      return {
        block_id: b.id,
        status: match ? match.status : 'unmarked',
        notes: match?.notes || null
      };
    });
    queueBackgroundSync(currentDate, payload);
  };

  const handleSaveRemarks = () => {
    const entries = dailyLogs[currentDate] || [];
    if (entries.length === 0) {
      setShowRemarkInput(false);
      return;
    }
    const updatedEntries = entries.map(e => ({ ...e, notes: dayRemarks }));
    setDailyLogs(prev => ({ ...prev, [currentDate]: updatedEntries }));
    setFeedback('Remarks Saved');
    setTimeout(() => setFeedback(''), 1500);

    queueBackgroundSync(currentDate, updatedEntries.map(e => ({
      block_id: e.block_id,
      status: e.status,
      notes: dayRemarks || null
    })));
  };

  return (
    <div>
      {/* Week Navigator Ribbon */}
      <div className="week-navigator-ribbon">
        {getWeekDays().map((d) => (
          <div
            key={d.dateStr}
            className={`ribbon-day-cell ${currentDate === d.dateStr ? 'active' : ''}`}
            onClick={() => { setCurrentDate(d.dateStr); setFeedback(''); setUndoAction(null); }}
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
            <div className="card-header-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>{new Date(currentDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
              {currentDate === todayStr && <span className="card-header-badge good">Today</span>}
              {streakDays > 1 && (
                <span className="card-header-badge good" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }} title="Consecutive days 100% attended">
                  <Flame size={12} color="#f59e0b" fill="#f59e0b" />
                  {streakDays}d Streak
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
              Section {user?.section_label} · {feedback || (saving ? 'Saving...' : isCoveredByBaseline ? 'Included in Baseline Cutoff' : 'Active Schedule Window')}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            {undoAction && (
              <button 
                type="button" 
                className="btn btn-secondary btn-sm" 
                onClick={handleUndo} 
                style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                title="Undo last change"
              >
                <RotateCcw size={12} />
                <span>Undo</span>
              </button>
            )}
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

        {/* Action helper buttons & Day Remarks */}
        {isDateEditable && !isSunday && currentBlocks.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              {!showRemarkInput && !dayRemarks ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowRemarkInput(true)}
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <FileText size={12} /> + Remarks (OD / Medical / Fest)
                </button>
              ) : null}
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleMarkAll('present')}>
                <CheckCheck size={14} color="var(--good)" /> All Present
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleMarkAll('absent')}>
                <UserX size={14} color="var(--bad)" /> All Absent
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleMarkAll('holiday')}>
                <Coffee size={14} color="var(--accent-gold)" /> Day Holiday
              </button>
            </div>
          </div>
        )}

        {/* Optional Day Remarks Input Box */}
        {showRemarkInput && isDateEditable && !isSunday && (
          <div style={{ background: 'var(--surface-alt)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <FileText size={14} color="var(--accent-gold)" />
            <input
              type="text"
              className="input-text"
              placeholder="e.g., On-Duty (OD) for NSS / Technical Fest / Medical Slip"
              value={dayRemarks}
              onChange={(e) => setDayRemarks(e.target.value)}
              onBlur={handleSaveRemarks}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRemarks(); }}
              style={{ fontSize: '0.75rem', flex: 1, padding: '0.25rem 0.5rem' }}
            />
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
              const presentImpact = getBlockImpact(block.periods, 'present');
              const absentImpact = getBlockImpact(block.periods, 'absent');

              return (
                <div key={block.id} className="period-ledger-block">
                  <div className="block-title-box">
                    <span className="block-index-badge">#{block.order_index}</span>
                    <div>
                      <div className="block-name">{block.subject}</div>
                      <div className="block-weight" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span>
                          {block.periods} {block.periods === 1 ? 'Period' : 'Periods'}
                          {block.subject.includes('LAB') && <span style={{ color: 'var(--accent-gold)', marginLeft: '4px', fontWeight: 600 }}>[Lab]</span>}
                        </span>

                        {/* Real-time period impact badges */}
                        {presentImpact && absentImpact && (
                          <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>
                            <span style={{ color: 'var(--good)' }}>Present: {presentImpact.formatted}</span>
                            {' · '}
                            <span style={{ color: 'var(--bad)' }}>Absent: {absentImpact.formatted}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="status-pill-group">
                    <button
                      type="button"
                      className={`status-pill-btn ${status === 'present' ? 'active-present' : ''}`}
                      onClick={() => handleSetBlockStatus(block.id, 'present')}
                      disabled={!isDateEditable}
                    >
                      PRESENT
                    </button>
                    <button
                      type="button"
                      className={`status-pill-btn ${status === 'absent' ? 'active-absent' : ''}`}
                      onClick={() => handleSetBlockStatus(block.id, 'absent')}
                      disabled={!isDateEditable}
                    >
                      ABSENT
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
