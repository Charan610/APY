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
  Database,
  Cpu,
  Code,
  BookOpen,
  Calendar,
  Layers,
  ChevronRight as ChevronIcon
} from 'lucide-react';

function TodayAttendanceWidget({ overallPct, attendedCount, absentCount }) {
  const compactRadius = 19;
  const compactCircumference = 2 * Math.PI * compactRadius;
  const strokeDashoffset = compactCircumference - (compactCircumference * Math.min(100, Math.max(0, overallPct))) / 100;

  return (
    <div
      className={`today-attendance-widget ${overallPct < 75 ? 'bad' : 'good'}`}
      title={`Overall Attendance: ${overallPct.toFixed(1)}%`}
    >
      <div className="widget-main-row">
        <div className="gauge-ring-wrap">
          <svg className="gauge-ring-svg" width="48" height="48" viewBox="0 0 48 48">
            <circle className="gauge-track" cx="24" cy="24" r={compactRadius} strokeWidth="3.5" />
            <circle
              className="gauge-fill"
              cx="24"
              cy="24"
              r={compactRadius}
              strokeWidth="3.5"
              strokeDasharray={compactCircumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform="rotate(-90 24 24)"
            />
          </svg>
          <div className="gauge-pct-center">
            <span className="gauge-pct-num">
              {overallPct.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="gauge-info">
          <span className="gauge-label">Attendance</span>
          <span className="gauge-counts">
            <strong className="text-good">{attendedCount}P</strong> • <strong className="text-bad">{absentCount}A</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function TodayTab({ 
  user, 
  summary, 
  onAttendanceUpdated, 
  isWidgetVisible = true, 
  attendanceTargetRef 
}) {
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
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [undoAction, setUndoAction] = useState(null);
  const [dayRemarks, setDayRemarks] = useState('');
  const [showRemarkInput, setShowRemarkInput] = useState(false);
  const [pastAttendanceDrafts, setPastAttendanceDrafts] = useState({});

  const todayStr = new Date().toISOString().split('T')[0];
  const todayObj = new Date();
  
  const minDateObj = new Date();
  minDateObj.setDate(todayObj.getDate() - 7);
  const minDateStr = minDateObj.toISOString().split('T')[0];

  const maxDateObj = new Date();
  maxDateObj.setDate(todayObj.getDate() + 7);
  const maxDateStr = maxDateObj.toISOString().split('T')[0];

  const isCoveredByBaseline = Boolean(user?.baseline_date && currentDate <= user.baseline_date);
  const isPastDate = currentDate < todayStr;
  const hasPastAttendanceRecord = isPastDate && Boolean(dailyLogs[currentDate]?.length);
  const isDateEditable = currentDate >= minDateStr && currentDate <= maxDateStr && !isCoveredByBaseline && !hasPastAttendanceRecord;

  const overall = summary?.overall || { percentage: 0, attended: 0, total: 0 };
  const overallPct = overall.percentage || 0;
  const attendedCount = overall.attended || 0;
  const absentCount = Math.max(0, (overall.total || 0) - attendedCount);

  useEffect(() => {
    if (user?.section_id) {
      loadInitialData();
    }
  }, [user?.section_id]);

  useEffect(() => {
    if (currentDate < todayStr) {
      setDayRemarks('');
      setShowRemarkInput(false);
      return;
    }
    const entries = dailyLogs[currentDate] || [];
    const existingNote = entries.find(e => e.notes)?.notes || '';
    setDayRemarks(existingNote);
    setShowRemarkInput(Boolean(existingNote));
  }, [currentDate, dailyLogs, todayStr]);

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
      console.error('Initial data load error:', err);
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

  // Helper icon for subject
  const getSubjectIcon = (subjectName = '') => {
    const s = subjectName.toUpperCase();
    if (s.includes('DBMS') || s.includes('DATABASE') || s.includes('SQL')) return Database;
    if (s.includes('DLCO') || s.includes('COA') || s.includes('CHIP') || s.includes('HARDWARE')) return Cpu;
    if (s.includes('LAB') || s.includes('JAVA') || s.includes('PYTHON') || s.includes('CPP') || s.includes('DSA')) return Code;
    if (s.includes('FLAT') || s.includes('MATH') || s.includes('STAT')) return BookOpen;
    return Layers;
  };

  const getWeekDays = () => {
    const days = [];
    for (let i = -7; i <= 7; i++) {
      const d = new Date();
      d.setDate(todayObj.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
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

  // Periods and subjects count for today
  const totalPeriodsToday = useMemo(() => {
    return currentBlocks.reduce((sum, b) => sum + (b.periods || 0), 0);
  }, [currentBlocks]);

  const uniqueSubjectsToday = useMemo(() => {
    return new Set(currentBlocks.map(b => b.subject)).size;
  }, [currentBlocks]);

  const getBlockStatus = (blockId) => {
    const entries = isPastDate
      ? (pastAttendanceDrafts[currentDate] || [])
      : (dailyLogs[currentDate] || []);
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

    if (isPastDate) {
      const draft = [...(pastAttendanceDrafts[currentDate] || [])];
      const idx = draft.findIndex(e => e.block_id === blockId);
      if (targetStatus === 'unmarked') {
        if (idx >= 0) draft.splice(idx, 1);
      } else if (idx >= 0) {
        draft[idx] = { ...draft[idx], status: targetStatus };
      } else {
        draft.push({ block_id: blockId, status: targetStatus });
      }
      setPastAttendanceDrafts(prev => ({ ...prev, [currentDate]: draft }));
      setFeedback(targetStatus === 'unmarked' ? 'Selection cleared' : `${targetStatus.toUpperCase()} selected — save to lock`);
      return;
    }

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

    queueBackgroundSync(currentDate, currentEntries);
  };

  const handleMarkAll = (status) => {
    if (!isDateEditable || currentBlocks.length === 0) return;

    if (isPastDate) {
      if (status === 'holiday') return;
      setPastAttendanceDrafts(prev => ({
        ...prev,
        [currentDate]: currentBlocks.map(block => ({ block_id: block.id, status }))
      }));
      setUndoAction(null);
      setFeedback(`All periods selected ${status.toUpperCase()} — save to lock`);
      return;
    }

    const prevEntries = dailyLogs[currentDate] ? [...dailyLogs[currentDate]] : [];
    setUndoAction({ date: currentDate, entries: prevEntries });

    const entries = currentBlocks.map(b => ({ 
      block_id: b.id, 
      status, 
      notes: dayRemarks || null 
    }));

    setDailyLogs(prev => ({ ...prev, [currentDate]: entries }));
    setFeedback(`Marked All ${status.toUpperCase()}`);
    setTimeout(() => setFeedback(''), 2000);

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

    queueBackgroundSync(currentDate, entries);
  };

  const handleSavePastAttendance = async () => {
    if (!isPastDate || !isDateEditable || isSunday || currentBlocks.length === 0) return;
    const draft = pastAttendanceDrafts[currentDate] || [];
    const entries = currentBlocks.map(block => {
      const selected = draft.find(entry => entry.block_id === block.id);
      return selected ? { block_id: block.id, status: selected.status, notes: null } : null;
    });

    if (entries.some(entry => !entry || !['present', 'absent'].includes(entry.status))) {
      setFeedback('Choose Present or Absent for each scheduled period before saving.');
      return;
    }

    setSaving(true);
    try {
      const result = await api.markAttendance(currentDate, entries);
      const savedEntries = entries.map(entry => ({ ...entry }));
      setDailyLogs(prev => ({ ...prev, [currentDate]: savedEntries }));
      setPastAttendanceDrafts(prev => {
        const next = { ...prev };
        delete next[currentDate];
        return next;
      });
      try {
        const cached = JSON.parse(localStorage.getItem('apy_logs_cache') || '{}');
        cached[currentDate] = savedEntries;
        localStorage.setItem('apy_logs_cache', JSON.stringify(cached));
      } catch {}
      if (result?.summary && onAttendanceUpdated) onAttendanceUpdated(result.summary);
      setFeedback('Past attendance saved and locked.');
    } catch (err) {
      setFeedback(err.message || 'Could not save past attendance. Refresh and check existing records.');
      loadInitialData();
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = () => {
    if (isPastDate || !undoAction || undoAction.date !== currentDate) return;
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

  const formattedDate = useMemo(() => {
    const d = new Date(currentDate);
    return {
      weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
      monthDay: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };
  }, [currentDate]);

  return (
    <div className="today-tab-content">
      {/* 1. Horizontal Week Navigator Ribbon */}
      <div className="week-navigator-ribbon" role="tablist" aria-label="Select Date">
        {getWeekDays().map((d) => (
          <button
            key={d.dateStr}
            type="button"
            className={`ribbon-day-cell ${currentDate === d.dateStr ? 'active' : ''}`}
            onClick={() => { setCurrentDate(d.dateStr); setFeedback(''); setUndoAction(null); }}
            title={d.dateStr}
          >
            <span className="ribbon-day-label">{d.dayName}</span>
            <span className="ribbon-day-num">{d.dayNum}</span>
            <span className={`ribbon-status-dot ${d.isSunday ? 'holiday' : d.isPastBaseline ? 'baseline' : d.hasLogs ? 'logged' : ''}`} />
          </button>
        ))}
      </div>

      {/* 2. Hero Date & Streak Card Banner */}
      <div className="today-hero-banner">
        <div className="today-hero-left">
          <span className="today-hero-weekday">{formattedDate.weekday}</span>
          <div className="today-hero-date-row">
            <span className="today-hero-date">{formattedDate.monthDay}</span>
            {currentDate === todayStr && <span className="today-hero-badge">TODAY</span>}
          </div>
          <div className="today-hero-subline">
            <span>Section {user?.section_label || 'C'}</span>
            <span>•</span>
            <span>{feedback || (saving ? 'Saving...' : isCoveredByBaseline ? 'Baseline Cutoff' : 'Active Schedule Window')}</span>
          </div>
        </div>

        {/* Right side: Permanent Attendance Widget + Streak Card */}
        <div className="today-hero-right">
          <div 
            ref={attendanceTargetRef} 
            style={{ 
              opacity: isWidgetVisible ? 1 : 0, 
              transition: 'opacity 0.25s ease' 
            }}
          >
            <TodayAttendanceWidget
              overallPct={overallPct}
              attendedCount={attendedCount}
              absentCount={absentCount}
            />
          </div>

          {/* Streak Hero Card */}
          <div className="today-streak-card" title="Attendance streak of consecutive 100% days">
            <div className="streak-flame-badge">
              <Flame size={18} fill="var(--accent-gold)" />
            </div>
            <div>
              <div className="streak-number">{streakDays > 0 ? `${streakDays}D` : '0D'}</div>
              <div className="streak-label">Streak</div>
            </div>
          </div>
        </div>
      </div>

      {/* Baseline / Lock Alerts */}
      {isCoveredByBaseline ? (
        <div className="alert-callout error" style={{ background: 'var(--surface-alt)', border: '1px solid var(--rule)', color: 'var(--ink)' }}>
          <Lock size={16} color="var(--accent-gold)" />
          <span>
            <strong>Included in Historical Baseline:</strong> Periods up to & including <strong>{user.baseline_date}</strong> are counted in baseline figures. Daily logging starts after this cutoff.
          </span>
        </div>
      ) : hasPastAttendanceRecord ? (
        <div className="alert-callout error">
          <Lock size={16} />
          <span>Past attendance is already recorded for this date and is locked against editing.</span>
        </div>
      ) : !isDateEditable ? (
        <div className="alert-callout error">
          <Lock size={16} />
          <span>This date is outside the active 7-day schedule window. Editing is locked.</span>
        </div>
      ) : null}

      {isPastDate && isDateEditable && !isSunday && currentBlocks.length > 0 && (
        <div className="alert-callout" style={{ background: 'var(--surface-alt)', border: '1px solid var(--rule)', color: 'var(--ink)' }}>
          <Calendar size={16} color="var(--accent-gold-dark)" />
          <span>Select Present or Absent for each scheduled period, then save once. Saved past attendance cannot be changed.</span>
        </div>
      )}

      {/* 3. Quick Action Cards (4 Cards Grid matching reference) */}
      {isDateEditable && !isSunday && currentBlocks.length > 0 && (
        <div className="quick-actions-grid">
          {/* Card 1: Remarks */}
          {!isPastDate && <div
            className="quick-action-card"
            onClick={() => setShowRemarkInput(prev => !prev)}
            title="Add On-Duty / Medical / Fest notes"
          >
            <div className="quick-action-top">
              <div className="quick-action-icon-circle" style={{ background: 'var(--surface-alt)', color: 'var(--ink)' }}>
                <FileText size={15} />
              </div>
              <ChevronIcon size={14} color="var(--ink-soft)" />
            </div>
            <div>
              <div className="quick-action-title">Remarks</div>
              <div className="quick-action-sub">{dayRemarks ? 'Note Active' : 'OD / Medical / Fest'}</div>
            </div>
          </div>}

          {/* Card 2: All Present */}
          <div 
            className="quick-action-card all-present"
            onClick={() => handleMarkAll('present')}
            title="Mark all periods present"
          >
            <div className="quick-action-top">
              <div className="quick-action-icon-circle" style={{ background: 'var(--good-soft)', color: 'var(--good)' }}>
                <CheckCheck size={15} />
              </div>
              <ChevronIcon size={14} color="var(--ink-soft)" />
            </div>
            <div>
              <div className="quick-action-title">All Present</div>
              <div className="quick-action-sub">Mark all subjects</div>
            </div>
          </div>

          {/* Card 3: All Absent */}
          <div 
            className="quick-action-card all-absent"
            onClick={() => handleMarkAll('absent')}
            title="Mark all periods absent"
          >
            <div className="quick-action-top">
              <div className="quick-action-icon-circle" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>
                <UserX size={15} />
              </div>
              <ChevronIcon size={14} color="var(--ink-soft)" />
            </div>
            <div>
              <div className="quick-action-title">All Absent</div>
              <div className="quick-action-sub">Mark all subjects</div>
            </div>
          </div>

          {/* Card 4: Day Holiday */}
          {!isPastDate && <div
            className="quick-action-card holiday"
            onClick={() => handleMarkAll('holiday')}
            title="Mark day as holiday"
          >
            <div className="quick-action-top">
              <div className="quick-action-icon-circle" style={{ background: 'var(--accent-gold-soft)', color: 'var(--accent-gold-dark)' }}>
                <Calendar size={15} />
              </div>
              <ChevronIcon size={14} color="var(--ink-soft)" />
            </div>
            <div>
              <div className="quick-action-title">Day Holiday</div>
              <div className="quick-action-sub">No attendance</div>
            </div>
          </div>}
        </div>
      )}

      {isPastDate && isDateEditable && !isSunday && currentBlocks.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSavePastAttendance}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Past Attendance'}
          </button>
        </div>
      )}

      {/* Undo Action Pill (if available) */}
      {undoAction && !isPastDate && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleUndo}
            style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <RotateCcw size={13} />
            <span>Revert last change</span>
          </button>
        </div>
      )}

      {/* Day Remarks Input Box */}
      {showRemarkInput && isDateEditable && !isSunday && !isPastDate && (
        <div style={{ background: 'var(--surface-alt)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', border: '1px solid var(--rule)' }}>
          <FileText size={16} color="var(--accent-gold)" />
          <input
            type="text"
            className="input-text"
            placeholder="e.g. On-Duty (OD) for NSS / Technical Symposium / Medical certificate"
            value={dayRemarks}
            onChange={(e) => setDayRemarks(e.target.value)}
            onBlur={handleSaveRemarks}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRemarks(); }}
            style={{ fontSize: '0.8rem', flex: 1, padding: '0.35rem 0.6rem', background: '#FFFFFF' }}
            autoFocus
          />
        </div>
      )}

      {/* 4. Section Headline: "Subjects Today" */}
      <div className="section-headline-row">
        <h3 className="section-headline">Subjects Today</h3>
        {!isSunday && currentBlocks.length > 0 && (
          <span className="section-counter-badge">
            {uniqueSubjectsToday} Subjects • {totalPeriodsToday} Periods
          </span>
        )}
      </div>

      {/* 5. Subject Cards List */}
      {isSunday ? (
        <div className="ledger-card" style={{ padding: '2.5rem 1.5rem', textAlign: 'center', background: 'var(--surface)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>☕</div>
          <h4 className="heading-ledger" style={{ color: 'var(--accent-gold-dark)', fontSize: '1.2rem' }}>
            Sunday — College Holiday
          </h4>
          <p style={{ fontSize: '0.825rem', color: 'var(--ink-soft)', marginTop: '0.35rem' }}>
            Sundays are fixed institutional holidays and are never factored into attendance totals.
          </p>
        </div>
      ) : currentBlocks.length === 0 ? (
        <div className="ledger-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
          No scheduled periods for {formattedDate.weekday}.
        </div>
      ) : (
        <div>
          {currentBlocks.map((block) => {
            const status = getBlockStatus(block.id);
            const presentImpact = getBlockImpact(block.periods, 'present');
            const absentImpact = getBlockImpact(block.periods, 'absent');
            const isLab = block.subject.toUpperCase().includes('LAB');
            const Icon = getSubjectIcon(block.subject);

            // Fetch subject's real calculated percentage from summary
            const subjectStats = summary?.subjects?.[block.subject];
            const subjectPct = subjectStats?.percentage !== undefined ? subjectStats.percentage : null;

            return (
              <div 
                key={block.id} 
                className={`subject-item-card ${!isLab ? 'is-theory' : ''} ${status === 'absent' ? 'is-marked-absent' : ''}`}
              >
                <div className="subject-card-left">
                  <div className="subject-icon-box">
                    <Icon size={20} strokeWidth={2} />
                  </div>

                  <div className="subject-info">
                    <div className="subject-name-row">
                      <span className="subject-title-text">{block.subject}</span>
                      <span className="subject-type-pill">{isLab ? 'Lab' : 'Theory'}</span>
                    </div>

                    <div className="subject-periods-text">
                      #{block.order_index} • {block.periods} {block.periods === 1 ? 'Period' : 'Periods'}
                    </div>

                    {/* Real attendance progress bar if available */}
                    {subjectPct !== null && (
                      <div className="subject-mini-progress">
                        <div 
                          className={`subject-mini-fill ${subjectPct < 75 ? 'bad' : ''}`}
                          style={{ width: `${Math.min(100, Math.max(0, subjectPct))}%` }}
                        />
                      </div>
                    )}

                    {/* Real-time period impact badges */}
                    {presentImpact && absentImpact && (
                      <div className="subject-impact-row">
                        <span className="impact-badge-pos">● Present: {presentImpact.formatted}</span>
                        <span className="impact-badge-neg">● Absent: {absentImpact.formatted}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Action Buttons: [PRESENT] [ABSENT] */}
                <div className="subject-actions-group">
                  <button
                    type="button"
                    className={`btn-status-action ${status === 'present' ? 'is-present' : ''}`}
                    onClick={() => handleSetBlockStatus(block.id, 'present')}
                    disabled={!isDateEditable}
                    title={isPastDate ? 'Select Present, then save the past date' : 'Mark Present'}
                  >
                    <Check size={14} strokeWidth={3} />
                    <span>PRESENT</span>
                  </button>

                  <button
                    type="button"
                    className={`btn-status-action ${status === 'absent' ? 'is-absent' : ''}`}
                    onClick={() => handleSetBlockStatus(block.id, 'absent')}
                    disabled={!isDateEditable}
                    title={isPastDate ? 'Select Absent, then save the past date' : 'Mark Absent'}
                  >
                    <X size={14} strokeWidth={3} />
                    <span>ABSENT</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
