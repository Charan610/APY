import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import {
  Sparkles,
  TrendingUp,
  Calendar,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Target,
  Share2,
  Check,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Layers
} from 'lucide-react';

const FORECAST_HORIZON_DAYS = 14;

export default function ForecastTab({ user }) {
  // Navigation mode: 'continuous' (Multi-day continuous forecast), 'snapshot' (Single-day period comparison), or 'goal' (Target Goal Calculator)
  const [viewMode, setViewMode] = useState('continuous');

  // Single-day snapshot state (existing FAT functionality)
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [forecastData, setForecastData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Continuous multi-day forecast state
  const [summary, setSummary] = useState(null);
  const [timetableByDay, setTimetableByDay] = useState({});
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);

  // Scenario selections per date: { [dateStr]: attendedPeriodCount }
  const [selectedScenarios, setSelectedScenarios] = useState({});

  // Target Goal Calculator state
  const [targetPct, setTargetPct] = useState(75);
  const [targetResult, setTargetResult] = useState(null);
  const [targetLoading, setTargetLoading] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  // 8-day ribbon for snapshot mode
  const nextDays = useMemo(() => {
    return Array.from({ length: 8 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return {
        dateStr: d.toISOString().split('T')[0],
        dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
        dayNum: d.getDate(),
        isToday: i === 0,
        isSunday: d.getDay() === 0
      };
    });
  }, []);

  // Fetch summary and timetable data on mount
  useEffect(() => {
    loadContinuousData();
  }, [user?.section_id]);

  // Load single-day snapshot data when date changes or snapshot view is opened
  useEffect(() => {
    if (viewMode === 'snapshot') {
      loadSnapshotForecast(selectedDate);
    }
  }, [viewMode, selectedDate]);

  const loadContinuousData = async () => {
    setDataLoading(true);
    try {
      const [sumRes, ttRes] = await Promise.all([
        api.getSummary().catch(() => null),
        user?.section_id ? api.getSectionTimetable(user.section_id).catch(() => null) : Promise.resolve(null)
      ]);

      if (sumRes) {
        setSummary(sumRes);
        const subjectKeys = Object.keys(sumRes.subjects || {});
        if (!selectedSubject && subjectKeys.length > 0) {
          setSelectedSubject('OVERALL');
        }
      }

      if (ttRes?.timetable_by_day) {
        setTimetableByDay(ttRes.timetable_by_day);
      }
    } catch (err) {
      console.error('Failed to load forecast base data:', err);
    } finally {
      setDataLoading(false);
    }
  };

  const loadSnapshotForecast = async (dStr) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getForecast(dStr);
      setForecastData(data);
    } catch (err) {
      setError(err.message || 'Failed to compute forecast');
    } finally {
      setLoading(false);
    }
  };

  // Collect unique subject list from attendance records and timetable
  const subjectList = useMemo(() => {
    const set = new Set();
    if (summary?.subjects) {
      Object.keys(summary.subjects).forEach((s) => set.add(s));
    }
    if (timetableByDay) {
      Object.values(timetableByDay).forEach((blocks) => {
        if (Array.isArray(blocks)) {
          blocks.forEach((b) => {
            if (b.subject) set.add(b.subject);
          });
        }
      });
    }
    const list = Array.from(set);
    return [{ key: 'OVERALL', name: 'Overall Aggregate', isOverall: true }, ...list.map((s) => ({ key: s, name: s, isOverall: false }))];
  }, [summary, timetableByDay]);

  // Current attendance statistics for the selected subject
  const currentStats = useMemo(() => {
    if (!summary) return { attended: 0, total: 0, percentage: 0, safe_to_miss: 0, must_attend_next: 0 };
    if (selectedSubject === 'OVERALL' || !selectedSubject) {
      return {
        attended: summary.overall?.attended || 0,
        total: summary.overall?.total || 0,
        percentage: summary.overall?.percentage || 0,
        safe_to_miss: summary.overall?.safe_to_miss || 0,
        must_attend_next: summary.overall?.must_attend_next || 0,
        is_below_threshold: summary.overall?.is_below_threshold || false
      };
    }
    const subjData = summary.subjects?.[selectedSubject];
    if (subjData) {
      return {
        attended: subjData.attended || 0,
        total: subjData.total || 0,
        percentage: subjData.percentage || 0,
        safe_to_miss: subjData.safe_to_miss || 0,
        must_attend_next: subjData.must_attend_next || 0,
        is_below_threshold: subjData.is_below_threshold || false
      };
    }
    return { attended: 0, total: 0, percentage: 0, safe_to_miss: 0, must_attend_next: 0 };
  }, [summary, selectedSubject]);

  // Generate continuous horizon calendar days starting from tomorrow
  const forecastDays = useMemo(() => {
    const days = [];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (let i = 1; i <= FORECAST_HORIZON_DAYS; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const weekday = d.getDay();
      const formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      let periods = 0;
      const blocks = timetableByDay[weekday] || [];

      if (weekday !== 0 && blocks.length > 0) {
        if (selectedSubject === 'OVERALL' || !selectedSubject) {
          periods = blocks.reduce((sum, b) => sum + (b.periods || 0), 0);
        } else {
          periods = blocks
            .filter((b) => b.subject === selectedSubject)
            .reduce((sum, b) => sum + (b.periods || 0), 0);
        }
      }

      days.push({
        index: i,
        dateStr,
        dayNum: d.getDate(),
        dayName: dayNames[weekday],
        shortDay: dayNames[weekday].slice(0, 3),
        formattedDate,
        isToday: false,
        isSunday: weekday === 0,
        periods,
        weekday
      });
    }

    return days;
  }, [timetableByDay, selectedSubject]);

  // Compute continuous multi-day projections sequentially across all days
  const multiDayProjections = useMemo(() => {
    let runningAttended = currentStats.attended;
    let runningTotal = currentStats.total;

    return forecastDays.map((day) => {
      const startingAttended = runningAttended;
      const startingTotal = runningTotal;
      const startingPercentage = startingTotal > 0 ? (startingAttended / startingTotal) * 100 : 0;

      const pCount = day.periods;

      if (day.isSunday || pCount === 0) {
        return {
          ...day,
          hasClasses: false,
          startingAttended,
          startingTotal,
          startingPercentage,
          resultingAttended: startingAttended,
          resultingTotal: startingTotal,
          resultingPercentage: startingPercentage,
          scenarios: [],
          selectedScenario: null
        };
      }

      const scenarios = [];
      for (let k = pCount; k >= 0; k--) {
        const projAttended = startingAttended + k;
        const projTotal = startingTotal + pCount;
        const projPercentage = projTotal > 0 ? (projAttended / projTotal) * 100 : 0;
        const delta = projPercentage - startingPercentage;

        let label = '';
        if (pCount === 1) {
          label = k === 1 ? 'Attend (1)' : 'Miss (0)';
        } else if (pCount === 2) {
          if (k === 2) label = 'Attend (2)';
          else if (k === 1) label = 'Attend 1, Miss 1';
          else label = 'Miss Both (0)';
        } else {
          if (k === pCount) label = `Attend All (${pCount})`;
          else if (k === 0) label = `Miss All (0)`;
          else label = `Attend ${k}/${pCount}`;
        }

        scenarios.push({
          k,
          label,
          projectedAttended: projAttended,
          projectedTotal: projTotal,
          projectedPercentage: projPercentage,
          delta
        });
      }

      const chosenK = selectedScenarios[day.dateStr] !== undefined
        ? selectedScenarios[day.dateStr]
        : pCount;

      const activeScenario = scenarios.find((s) => s.k === chosenK) || scenarios[0];

      runningAttended = activeScenario.projectedAttended;
      runningTotal = activeScenario.projectedTotal;

      return {
        ...day,
        hasClasses: true,
        startingAttended,
        startingTotal,
        startingPercentage,
        resultingAttended: runningAttended,
        resultingTotal: runningTotal,
        resultingPercentage: activeScenario.projectedPercentage,
        scenarios,
        selectedScenario: activeScenario
      };
    });
  }, [currentStats, forecastDays, selectedScenarios]);

  // Overall final outlook metrics
  const finalProjection = useMemo(() => {
    if (!multiDayProjections.length) return null;
    const last = multiDayProjections[multiDayProjections.length - 1];
    const netDelta = last.resultingPercentage - currentStats.percentage;
    return {
      percentage: last.resultingPercentage,
      attended: last.resultingAttended,
      total: last.resultingTotal,
      netDelta
    };
  }, [multiDayProjections, currentStats]);

  const handleSelectScenario = (dateStr, k) => {
    setSelectedScenarios((prev) => ({
      ...prev,
      [dateStr]: k
    }));
  };

  const handleSimulateAttendAll = () => {
    const nextSelections = {};
    forecastDays.forEach((day) => {
      if (day.periods > 0) {
        nextSelections[day.dateStr] = day.periods;
      }
    });
    setSelectedScenarios(nextSelections);
  };

  const handleSimulateMissAll = () => {
    const nextSelections = {};
    forecastDays.forEach((day) => {
      if (day.periods > 0) {
        nextSelections[day.dateStr] = 0;
      }
    });
    setSelectedScenarios(nextSelections);
  };

  const handleResetScenarios = () => {
    setSelectedScenarios({});
  };

  const loadTargetCalc = async (pct) => {
    setTargetLoading(true);
    try {
      const res = await api.getTargetCalculation(pct);
      setTargetResult(res);
    } catch (e) {
      console.error('Target calc error:', e);
    } finally {
      setTargetLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'goal') {
      loadTargetCalc(targetPct);
    }
  }, [viewMode, targetPct]);

  const handleShareCard = () => {
    if (!summary?.overall) return;
    const ov = summary.overall;
    const text = `📊 APY Attendance Status — ${user?.register_number || 'Student'}\n` +
      `Overall: ${ov.percentage.toFixed(2)}% (${ov.attended}/${ov.total} periods)\n` +
      `Status: ${ov.is_below_threshold ? 'Under 75% ⚠️' : 'Safe Zone ✅'}\n` +
      `${ov.is_below_threshold ? `Must Attend Next: ${ov.must_attend_next} periods` : `Safe to Miss: ${ov.safe_to_miss} periods`}\n` +
      `Check live: https://apy-i1s1.vercel.app`;
    try {
      navigator.clipboard.writeText(text);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    } catch (e) {
      console.warn(e);
    }
  };

  // Compute snapshot best/worst case aggregates
  const snapshotSummary = useMemo(() => {
    if (!forecastData?.blocks || !forecastData.blocks.length) return null;
    const blocks = forecastData.blocks;
    const currentOverall = blocks[0]?.current_overall_pct || 0;
    
    // Average or combined outcome
    const avgPresent = blocks.reduce((sum, b) => sum + (b.overall_if_present || currentOverall), 0) / blocks.length;
    const avgAbsent = blocks.reduce((sum, b) => sum + (b.overall_if_absent || currentOverall), 0) / blocks.length;
    const totalDayPeriods = blocks.reduce((sum, b) => sum + (b.periods || 0), 0);

    return {
      currentOverall,
      bestOutcome: avgPresent,
      worstOutcome: avgAbsent,
      bestDelta: avgPresent - currentOverall,
      worstDelta: avgAbsent - currentOverall,
      totalDayPeriods
    };
  }, [forecastData]);

  return (
    <div>
      {/* 1. Mode Switcher (Multi-Day | Snapshot | Goal Calc) */}
      <div className="forecast-view-switch">
        <button
          type="button"
          className={`forecast-view-btn ${viewMode === 'continuous' ? 'active' : ''}`}
          onClick={() => setViewMode('continuous')}
        >
          <TrendingUp size={15} />
          <span>Multi-Day (14D)</span>
        </button>
        <button
          type="button"
          className={`forecast-view-btn ${viewMode === 'snapshot' ? 'active' : ''}`}
          onClick={() => setViewMode('snapshot')}
        >
          <Calendar size={15} />
          <span>Snapshot (FAT)</span>
        </button>
        <button
          type="button"
          className={`forecast-view-btn ${viewMode === 'goal' ? 'active' : ''}`}
          onClick={() => setViewMode('goal')}
        >
          <Target size={15} />
          <span>Goal Calc</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleShareCard}
          style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          title="Copy formatted attendance summary"
        >
          {copiedShare ? <Check size={13} color="var(--good)" /> : <Share2 size={13} color="var(--accent-gold-dark)" />}
          <span>{copiedShare ? 'Copied' : 'Share'}</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* MODE 1: CONTINUOUS MULTI-DAY FORECASTING SYSTEM           */}
      {/* ========================================================= */}
      {viewMode === 'continuous' && (
        <div>
          {/* Dynamic Subject Selector Pills */}
          <div className="subject-pills-container">
            {subjectList.map((subj) => {
              const isActive = (selectedSubject === subj.key) || (!selectedSubject && subj.key === 'OVERALL');
              const subjPct = subj.isOverall
                ? summary?.overall?.percentage
                : summary?.subjects?.[subj.key]?.percentage;

              return (
                <button
                  key={subj.key}
                  type="button"
                  className={`subject-select-pill ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedSubject(subj.key);
                    setSelectedScenarios({});
                  }}
                >
                  <span>{subj.name}</span>
                  {subjPct !== undefined && (
                    <span className="pill-pct">{subjPct.toFixed(1)}%</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Current vs 14-Day Projected Hero Comparison Card */}
          {finalProjection && (
            <div className="forecast-hero-comparison">
              <div className="hero-stat-col">
                <span className="hero-stat-label">Current State</span>
                <div className={`hero-stat-number ${currentStats.percentage < 75 ? 'bad' : 'good'}`}>
                  {currentStats.percentage.toFixed(2)}%
                </div>
                <span className="hero-stat-sub">
                  {currentStats.attended}/{currentStats.total} periods
                </span>
              </div>

              <div className="hero-arrow-col">
                <div className={`delta-badge ${finalProjection.netDelta >= 0 ? 'pos' : 'neg'}`}>
                  {finalProjection.netDelta >= 0 ? `+${finalProjection.netDelta.toFixed(2)}%` : `${finalProjection.netDelta.toFixed(2)}%`}
                </div>
                <div className="arrow-symbol">→</div>
                <span className="horizon-sub">14-Day Outlook</span>
              </div>

              <div className="hero-stat-col" style={{ textAlign: 'right' }}>
                <span className="hero-stat-label">Projected Outcome</span>
                <div className={`hero-stat-number ${finalProjection.percentage < 75 ? 'bad' : 'good'}`}>
                  {finalProjection.percentage.toFixed(2)}%
                </div>
                <span className="hero-stat-sub">
                  {finalProjection.attended}/{finalProjection.total} periods
                </span>
              </div>
            </div>
          )}

          {/* Quick Simulation Presets Toolbar */}
          <div className="forecast-preset-bar">
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', fontWeight: 600 }}>
              Simulation Presets:
            </span>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleSimulateAttendAll}
                title="Simulate 100% attendance over upcoming 14 days"
              >
                <CheckCircle2 size={13} color="var(--good)" />
                <span>Attend All</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleSimulateMissAll}
                title="Simulate 0% attendance over upcoming 14 days"
              >
                <XCircle size={13} color="var(--bad)" />
                <span>Miss All</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleResetScenarios}
                title="Reset simulation to default"
              >
                <RotateCcw size={13} />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Sequential 14-Day Trajectory */}
          <div className="forecast-timeline">
            {multiDayProjections.map((day) => {
              if (!day.hasClasses || day.isSunday) {
                return (
                  <div key={day.dateStr} className="forecast-rest-day">
                    <span>☕ {day.shortDay}, {day.formattedDate} — {day.isSunday ? 'Institutional Holiday' : 'No periods scheduled'}</span>
                    <span>Rolls forward at <strong>{day.resultingPercentage.toFixed(2)}%</strong></span>
                  </div>
                );
              }

              return (
                <div key={day.dateStr} className="forecast-day-card">
                  {/* Clean Day Header */}
                  <div className="forecast-day-header">
                    <div>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--ink)' }}>
                        {day.shortDay}, {day.formattedDate}
                      </strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                        {day.periods} {day.periods === 1 ? 'Period' : 'Periods'} scheduled • Starts from {day.startingPercentage.toFixed(2)}%
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span
                        className="mono-num"
                        style={{
                          fontSize: '1.1rem',
                          fontWeight: 800,
                          color: day.resultingPercentage >= 75 ? 'var(--good)' : 'var(--bad)'
                        }}
                      >
                        {day.resultingPercentage.toFixed(2)}%
                      </span>
                      <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
                        {day.resultingAttended}/{day.resultingTotal}
                      </div>
                    </div>
                  </div>

                  {/* Compact Scenario Pill Buttons */}
                  <div className="scenario-pill-group">
                    {day.scenarios.map((sc) => {
                      const isSelected = day.selectedScenario?.k === sc.k;
                      const deltaText = sc.delta > 0
                        ? `+${sc.delta.toFixed(2)}%`
                        : sc.delta < 0
                        ? `${sc.delta.toFixed(2)}%`
                        : '0.00%';

                      return (
                        <button
                          key={sc.k}
                          type="button"
                          className={`scenario-pill-btn ${isSelected ? 'active' : ''}`}
                          onClick={() => handleSelectScenario(day.dateStr, sc.k)}
                        >
                          <span className="scenario-pill-label">
                            {sc.label} {isSelected && '✓'}
                          </span>
                          <span className="scenario-pill-pct">
                            {sc.projectedPercentage.toFixed(2)}%
                          </span>
                          <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', opacity: 0.85 }}>
                            {deltaText}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODE 2: ORGANIZED SINGLE-DAY SNAPSHOT (FAT TOOL)          */}
      {/* ========================================================= */}
      {viewMode === 'snapshot' && (
        <div>
          {/* Horizontal Date Ribbon */}
          <div className="week-navigator-ribbon">
            {nextDays.map((d) => (
              <button
                key={d.dateStr}
                type="button"
                className={`ribbon-day-cell ${selectedDate === d.dateStr ? 'active' : ''}`}
                onClick={() => setSelectedDate(d.dateStr)}
              >
                <span className="ribbon-day-label">{d.dayName}</span>
                <span className="ribbon-day-num">{d.dayNum}</span>
                <span className={`ribbon-status-dot ${d.isSunday ? 'holiday' : ''}`} />
              </button>
            ))}
          </div>

          <div className="ledger-card">
            {/* Header */}
            <div className="card-header-ruled">
              <div>
                <div className="card-header-title">
                  FAT — Single-Day Period Impact
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                  {forecastData?.day_name || 'Selected Day'} ({selectedDate})
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
                  Current: <strong style={{ color: 'var(--ink)' }}>{snapshotSummary?.currentOverall?.toFixed(2) || '—'}%</strong>
                </span>
              </div>
            </div>

            {error && (
              <div className="alert-callout error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {loading ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
                Calculating period outcomes...
              </div>
            ) : forecastData?.is_holiday ? (
              <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>☕</div>
                <h4 className="heading-ledger" style={{ color: 'var(--accent-gold-dark)', fontSize: '1.1rem' }}>Sunday — Holiday</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginTop: '0.2rem' }}>
                  No classes scheduled. Attendance aggregate is completely unaffected.
                </p>
              </div>
            ) : forecastData?.blocks?.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
                No periods scheduled for this date.
              </div>
            ) : (
              <div>
                {/* Day Outcome Overview (Best Case vs Worst Case) */}
                {snapshotSummary && (
                  <div className="fat-day-overview">
                    <div className="fat-overview-box good">
                      <div className="fat-overview-label">Best Case (All Present)</div>
                      <div className="fat-overview-pct">{snapshotSummary.bestOutcome.toFixed(2)}%</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--good)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        +{snapshotSummary.bestDelta.toFixed(2)}% lift across {snapshotSummary.totalDayPeriods} periods
                      </div>
                    </div>

                    <div className="fat-overview-box bad">
                      <div className="fat-overview-label">Worst Case (All Absent)</div>
                      <div className="fat-overview-pct">{snapshotSummary.worstOutcome.toFixed(2)}%</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--bad)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {snapshotSummary.worstDelta.toFixed(2)}% drop across {snapshotSummary.totalDayPeriods} periods
                      </div>
                    </div>
                  </div>
                )}

                {/* Individual Period Outcomes Breakdown */}
                <div style={{ margin: '1.25rem 0 0.65rem' }}>
                  <h4 style={{ fontSize: '0.95rem', color: 'var(--ink)', fontWeight: 700, fontFamily: 'var(--font-serif)' }}>
                    Period-by-Period Sensitivity
                  </h4>
                </div>

                <div className="forecast-pc-grid">
                  {forecastData?.blocks?.map((block) => (
                    <div key={block.block_id} className="fat-period-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span className="block-index-badge">#{block.order_index}</span>
                          <strong style={{ fontSize: '0.95rem', color: 'var(--ink)' }}>{block.subject}</strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
                            [{block.periods} {block.periods === 1 ? 'Period' : 'Periods'}]
                          </span>
                        </div>

                        <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
                          Subj: {block.current_subject_pct?.toFixed(1)}%
                        </span>
                      </div>

                      {/* Side by side comparison */}
                      <div className="fat-period-outcomes">
                        <div className="fat-outcome-pill present">
                          <div className="fat-outcome-title">If Present</div>
                          <div className="fat-outcome-main">{block.overall_if_present?.toFixed(2)}%</div>
                          <div className="fat-outcome-sub">Subject: {block.subject_if_present?.toFixed(1)}%</div>
                        </div>

                        <div className="fat-outcome-pill absent">
                          <div className="fat-outcome-title">If Absent</div>
                          <div className="fat-outcome-main">{block.overall_if_absent?.toFixed(2)}%</div>
                          <div className="fat-outcome-sub">Subject: {block.subject_if_absent?.toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODE 3: TARGET ATTENDANCE GOAL CALCULATOR                 */}
      {/* ========================================================= */}
      {viewMode === 'goal' && (
        <div className="ledger-card">
          <div className="card-header-ruled">
            <div>
              <span className="card-header-title">Target Attendance Goal Simulator</span>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
                Calculate exact periods required to reach any target percentage
              </div>
            </div>
            <span className="card-header-badge good">FAT Engine</span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            {[75, 80, 85, 90].map((pct) => (
              <button
                key={pct}
                type="button"
                className={`btn btn-sm ${targetPct === pct ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTargetPct(pct)}
              >
                Target {pct}%
              </button>
            ))}
          </div>

          {targetLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-soft)' }}>
              Calculating trajectory...
            </div>
          ) : targetResult ? (
            <div>
              <div className="hero-figure-group" style={{ margin: '0.5rem 0 1rem' }}>
                <div>
                  <div className="hero-number">
                    {targetResult.required_periods || 0}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
                    Consecutive periods needed to achieve {targetPct}%
                  </div>
                </div>

                <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
                  <div>Current: <strong>{targetResult.current_percentage?.toFixed(2)}%</strong></div>
                  <div>Estimated Date: <strong>{targetResult.target_date || 'In progress'}</strong></div>
                </div>
              </div>

              <div className={`bunk-banner ${targetResult.required_periods > 0 ? 'bad' : 'good'}`}>
                {targetResult.required_periods > 0 ? (
                  <>
                    <AlertTriangle size={18} />
                    <div>
                      You need to attend <strong>{targetResult.required_periods} periods</strong> in a row without absence to reach {targetPct}%.
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    <div>
                      You have already surpassed {targetPct}%! Buffer safe.
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
