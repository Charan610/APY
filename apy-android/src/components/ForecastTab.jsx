import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Layers,
  ArrowRight,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';

const FORECAST_HORIZON_DAYS = 14;

export default function ForecastTab({ user }) {
  // Navigation mode: 'continuous' (Multi-day continuous forecast) or 'snapshot' (Single-day period comparison)
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
        // Default to first subject if not already set
        const subjectKeys = Object.keys(sumRes.subjects || {});
        if (!selectedSubject && subjectKeys.length > 0) {
          setSelectedSubject(subjectKeys[0]);
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
    // Include Overall Aggregate as an option
    return [{ key: 'OVERALL', name: 'Overall Aggregate', isOverall: true }, ...list.map((s) => ({ key: s, name: s, isOverall: false }))];
  }, [summary, timetableByDay]);

  // Current attendance statistics for the selected subject
  const currentStats = useMemo(() => {
    if (!summary) return { attended: 0, total: 0, percentage: 0, safe_to_miss: 0, must_attend_next: 0 };
    if (selectedSubject === 'OVERALL') {
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
    return { attended: 0, total: 0, percentage: 0, safe_to_miss: 0, must_attend_next: 0, is_below_threshold: false };
  }, [summary, selectedSubject]);

  // Generate calendar days for forecast horizon (starting today, Sep 4, 2026)
  const forecastDays = useMemo(() => {
    const days = [];
    const baseDate = new Date(); // Local date (assumed today: September 4, 2026)

    for (let i = 0; i < FORECAST_HORIZON_DAYS; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const weekday = d.getDay(); // 0: Sun, 1: Mon, ..., 6: Sat
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const formattedDate = `${shortMonthNames[d.getMonth()]} ${d.getDate()}`;

      // Timetable lookup: blocks on this weekday for the student's section
      const blocks = timetableByDay[weekday] || [];

      // Calculate scheduled periods for the chosen subject
      let periods = 0;
      if (weekday !== 0 && blocks.length > 0) {
        if (selectedSubject === 'OVERALL') {
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
        isToday: i === 0,
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

      // If Sunday or 0 periods scheduled on this day
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

      // Generate all meaningful combinations: k = pCount down to 0
      const scenarios = [];
      for (let k = pCount; k >= 0; k--) {
        const projAttended = startingAttended + k;
        const projTotal = startingTotal + pCount;
        const projPercentage = projTotal > 0 ? (projAttended / projTotal) * 100 : 0;
        const delta = projPercentage - startingPercentage;

        let label = '';
        if (pCount === 1) {
          label = k === 1 ? 'Attend' : 'Miss';
        } else if (pCount === 2) {
          if (k === 2) label = 'Attend both';
          else if (k === 1) label = 'Attend 1, miss 1';
          else label = 'Miss both';
        } else {
          if (k === pCount) label = `Attend all (${pCount})`;
          else if (k === 0) label = `Miss all (${pCount})`;
          else label = `Attend ${k}, miss ${pCount - k}`;
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

      // Selected scenario: user override or default to "Attend all" (k = pCount)
      const chosenK = selectedScenarios[day.dateStr] !== undefined
        ? selectedScenarios[day.dateStr]
        : pCount;

      const activeScenario = scenarios.find((s) => s.k === chosenK) || scenarios[0];

      // Update running integer totals for next class day
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

  // Scenario selection handler
  const handleSelectScenario = (dateStr, k) => {
    setSelectedScenarios((prev) => ({
      ...prev,
      [dateStr]: k
    }));
  };

  // Preset: Simulate attending all upcoming periods
  const handleSimulateAttendAll = () => {
    const nextSelections = {};
    forecastDays.forEach((day) => {
      if (day.periods > 0) {
        nextSelections[day.dateStr] = day.periods;
      }
    });
    setSelectedScenarios(nextSelections);
  };

  // Preset: Simulate missing all upcoming periods
  const handleSimulateMissAll = () => {
    const nextSelections = {};
    forecastDays.forEach((day) => {
      if (day.periods > 0) {
        nextSelections[day.dateStr] = 0;
      }
    });
    setSelectedScenarios(nextSelections);
  };

  // Reset custom scenario selections
  const handleResetScenarios = () => {
    setSelectedScenarios({});
  };

  return (
    <div>
      {/* Top View Toggle: Continuous Multi-Day Forecast vs Single-Day Snapshot */}
      <div className="forecast-view-switch">
        <button
          type="button"
          className={`forecast-view-btn ${viewMode === 'continuous' ? 'active' : ''}`}
          onClick={() => setViewMode('continuous')}
        >
          <TrendingUp size={15} />
          <span>Multi-Day Forecast</span>
        </button>
        <button
          type="button"
          className={`forecast-view-btn ${viewMode === 'snapshot' ? 'active' : ''}`}
          onClick={() => setViewMode('snapshot')}
        >
          <Calendar size={15} />
          <span>Single-Day Snapshot</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* MODE 1: CONTINUOUS MULTI-DAY FORECASTING SYSTEM           */}
      {/* ========================================================= */}
      {viewMode === 'continuous' && (
        <div>
          {/* Dynamic Subject Selector Ribbon */}
          <div className="subject-pills-container">
            {subjectList.map((subj) => {
              const isActive = selectedSubject === subj.key;
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

          {/* Current Subject Attendance State Card */}
          <div className="ledger-card" style={{ marginBottom: '1rem' }}>
            <div className="card-header-ruled">
              <div className="card-header-title">
                <Sparkles size={16} color="var(--accent-gold)" />
                <span>
                  {selectedSubject === 'OVERALL'
                    ? 'Overall Academic Ledger'
                    : selectedSubject || 'Selected Subject'}
                </span>
              </div>
              <span
                className={`card-header-badge ${
                  currentStats.percentage >= 75 ? 'good' : 'bad'
                }`}
              >
                {currentStats.percentage >= 75 ? 'Above 75%' : 'Below 75%'}
              </span>
            </div>

            <div className="hero-figure-group">
              <div>
                <div
                  className={`hero-number ${
                    currentStats.percentage < 75 ? 'below-threshold' : ''
                  }`}
                >
                  {currentStats.percentage.toFixed(2)}
                  <span style={{ fontSize: '1.5rem', fontWeight: 600 }}>%</span>
                </div>
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--ink-soft)',
                    fontFamily: 'var(--font-mono)',
                    marginTop: '0.25rem'
                  }}
                >
                  {currentStats.attended} / {currentStats.total} classes attended
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                {currentStats.percentage >= 75 ? (
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--good)',
                      fontFamily: 'var(--font-mono)'
                    }}
                  >
                    <strong>Safe to bunk:</strong> {currentStats.safe_to_miss} classes
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--bad)',
                      fontFamily: 'var(--font-mono)'
                    }}
                  >
                    <strong>Must attend:</strong> {currentStats.must_attend_next} classes
                  </div>
                )}
              </div>
            </div>

            {/* Quick Simulation Presets */}
            <div className="forecast-preset-bar">
              <span
                style={{
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--ink-soft)',
                  fontWeight: 600
                }}
              >
                Simulation Presets:
              </span>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleSimulateAttendAll}
                  title="Simulate attending all upcoming classes"
                >
                  <CheckCircle2 size={13} color="var(--good)" />
                  <span>Attend All</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleSimulateMissAll}
                  title="Simulate missing all upcoming classes"
                >
                  <XCircle size={13} color="var(--bad)" />
                  <span>Miss All</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleResetScenarios}
                  title="Reset scenarios"
                >
                  <RotateCcw size={13} />
                  <span>Reset</span>
                </button>
              </div>
            </div>
          </div>

          {/* Sequential Multi-Day Timeline */}
          <div className="forecast-timeline">
            {multiDayProjections.map((day, idx) => {
              const isSelectedDayClass = day.hasClasses;

              return (
                <div
                  key={day.dateStr}
                  className={`forecast-day-card ${day.isSunday ? 'holiday' : ''}`}
                >
                  {/* Day Header */}
                  <div className="forecast-day-header">
                    <div>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--ink)' }}>
                        {day.isToday
                          ? `Today — ${day.formattedDate} (${day.shortDay})`
                          : `${day.formattedDate} (${day.shortDay})`}
                      </strong>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--ink-soft)',
                          fontFamily: 'var(--font-mono)',
                          marginTop: '0.1rem'
                        }}
                      >
                        {day.isSunday
                          ? 'Sunday — College Holiday'
                          : day.periods === 0
                          ? `No ${selectedSubject === 'OVERALL' ? 'classes' : selectedSubject} periods scheduled`
                          : `${day.periods} ${day.periods === 1 ? 'Period' : 'Periods'} scheduled`}
                      </div>
                    </div>

                    {/* Projected State Badge */}
                    <div style={{ textAlign: 'right' }}>
                      <span
                        className="mono-num"
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          color:
                            day.resultingPercentage >= 75
                              ? 'var(--good)'
                              : 'var(--bad)'
                        }}
                      >
                        {day.resultingPercentage.toFixed(2)}%
                      </span>
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--ink-soft)',
                          fontFamily: 'var(--font-mono)'
                        }}
                      >
                        {day.resultingAttended} / {day.resultingTotal}
                      </div>
                    </div>
                  </div>

                  {/* Scenarios Grid (if subject occurs on this day) */}
                  {isSelectedDayClass ? (
                    <div>
                      <div
                        style={{
                          fontSize: '0.725rem',
                          color: 'var(--ink-soft)',
                          fontFamily: 'var(--font-mono)',
                          marginBottom: '0.4rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <span>
                          Starting from previous day:{' '}
                          <strong>
                            {day.startingAttended}/{day.startingTotal} (
                            {day.startingPercentage.toFixed(2)}%)
                          </strong>
                        </span>
                        <span style={{ fontSize: '0.675rem', color: 'var(--accent-gold)' }}>
                          Tap scenario to select branch
                        </span>
                      </div>

                      <div className="forecast-scenarios-grid">
                        {day.scenarios.map((sc) => {
                          const isSelected = day.selectedScenario?.k === sc.k;
                          const deltaText =
                            sc.delta > 0
                              ? `+${sc.delta.toFixed(2)}%`
                              : sc.delta < 0
                              ? `${sc.delta.toFixed(2)}%`
                              : '0.00%';

                          return (
                            <div
                              key={sc.k}
                              className={`scenario-card ${isSelected ? 'selected' : ''}`}
                              onClick={() => handleSelectScenario(day.dateStr, sc.k)}
                            >
                              <div className="scenario-title">
                                {sc.label}
                                {isSelected && ' ✓'}
                              </div>
                              <div
                                className="scenario-pct"
                                style={{
                                  color:
                                    sc.projectedPercentage >= 75
                                      ? 'var(--good)'
                                      : 'var(--bad)'
                                }}
                              >
                                {sc.projectedPercentage.toFixed(2)}%
                              </div>
                              <div
                                className="scenario-delta"
                                style={{
                                  color:
                                    sc.delta > 0
                                      ? 'var(--good)'
                                      : sc.delta < 0
                                      ? 'var(--bad)'
                                      : 'var(--ink-soft)'
                                }}
                              >
                                {deltaText} · {sc.projectedAttended}/{sc.projectedTotal}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div
                        style={{
                          marginTop: '0.5rem',
                          fontSize: '0.725rem',
                          color: 'var(--ink-soft)',
                          fontFamily: 'var(--font-mono)',
                          background: 'var(--surface-alt)',
                          padding: '0.35rem 0.6rem',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}
                      >
                        <ArrowRight size={12} color="var(--accent-gold)" />
                        <span>
                          Selected: <strong>{day.selectedScenario?.label}</strong> →{' '}
                          <strong>{day.resultingPercentage.toFixed(2)}%</strong> ({day.resultingAttended}/{day.resultingTotal}). Next day projects from this outcome.
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--ink-soft)',
                        fontFamily: 'var(--font-mono)',
                        padding: '0.35rem 0'
                      }}
                    >
                      {day.isSunday
                        ? 'Sunday is a fixed holiday. Attendance unaffected.'
                        : `No periods for ${selectedSubject === 'OVERALL' ? 'any subject' : selectedSubject}. Attendance rolls forward unaffected.`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODE 2: EXISTING SINGLE-DAY SNAPSHOT (FAT TOOL)          */}
      {/* ========================================================= */}
      {viewMode === 'snapshot' && (
        <div>
          {/* Date Ribbon */}
          <div className="week-navigator-ribbon">
            {nextDays.map((d) => (
              <div
                key={d.dateStr}
                className={`ribbon-day-cell ${selectedDate === d.dateStr ? 'active' : ''}`}
                onClick={() => setSelectedDate(d.dateStr)}
              >
                <div className="ribbon-day-label">{d.dayName}</div>
                <div className="ribbon-day-num">{d.dayNum}</div>
                <div className={`ribbon-status-dot ${d.isSunday ? 'holiday' : ''}`} />
              </div>
            ))}
          </div>

          <div className="ledger-card">
            <div className="card-header-ruled">
              <div>
                <div className="card-header-title">
                  <Sparkles size={16} color="var(--accent-gold)" />
                  <span>FAT — Single-Day Period Simulations</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
                  {forecastData?.day_name} ({selectedDate}) Outcome Projections
                </div>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                Current: <strong style={{ color: 'var(--ink)' }}>{forecastData?.blocks?.[0]?.current_overall_pct?.toFixed(2) || '—'}%</strong>
              </div>
            </div>

            {error && (
              <div className="alert-callout error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
                Simulating period outcomes...
              </div>
            ) : forecastData?.is_holiday ? (
              <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)' }}>
                <h4 className="heading-ledger" style={{ color: 'var(--accent-gold)', fontSize: '1rem' }}>Sunday — Holiday</h4>
                <p style={{ fontSize: '0.775rem', color: 'var(--ink-soft)', marginTop: '0.2rem' }}>
                  No periods scheduled. Aggregate attendance percentage is unaffected.
                </p>
              </div>
            ) : forecastData?.blocks?.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
                No scheduled periods found for this date.
              </div>
            ) : (
              <div className="forecast-pc-grid">
                {forecastData?.blocks?.map((block) => (
                  <div
                    key={block.block_id}
                    style={{
                      background: 'var(--surface-alt)',
                      border: '1px solid var(--rule)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.85rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span className="block-index-badge">#{block.order_index}</span>
                        <strong style={{ fontSize: '0.95rem', color: 'var(--ink)' }}>{block.subject}</strong>
                        <span className="mono-num" style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
                          [{block.periods} {block.periods === 1 ? 'Period' : 'Periods'}]
                        </span>
                      </div>

                      <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
                        Subj: {block.current_subject_pct?.toFixed(1)}%
                      </span>
                    </div>

                    {/* Two-Outcome Comparison Side by Side */}
                    <div className="fat-comparison-grid">
                      <div className="fat-box present">
                        <div className="fat-box-label">If Present</div>
                        <div className="fat-box-pct">{block.overall_if_present?.toFixed(2)}%</div>
                        <div className="fat-box-sub">Subject: {block.subject_if_present?.toFixed(1)}%</div>
                      </div>

                      <div className="fat-box absent">
                        <div className="fat-box-label">If Absent</div>
                        <div className="fat-box-pct">{block.overall_if_absent?.toFixed(2)}%</div>
                        <div className="fat-box-sub">Subject: {block.subject_if_absent?.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
