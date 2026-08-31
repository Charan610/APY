import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Sparkles, TrendingUp, TrendingDown, Calendar, AlertCircle } from 'lucide-react';

export default function ForecastTab({ user }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [forecastData, setForecastData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const nextDays = Array.from({ length: 8 }).map((_, i) => {
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

  useEffect(() => {
    loadForecast(selectedDate);
  }, [selectedDate]);

  const loadForecast = async (dStr) => {
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

  return (
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
              <span>FAT — Forecast Attendance Tool</span>
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
  );
}
