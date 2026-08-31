import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Sparkles, X, TrendingUp, TrendingDown, Calendar, AlertCircle } from 'lucide-react';

export default function ForecastModal({ isOpen, onClose }) {
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [forecastData, setForecastData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Next 7 days list
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
    if (isOpen) {
      loadForecast(selectedDate);
    }
  }, [isOpen, selectedDate]);

  const loadForecast = async (dStr) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getForecast(dStr);
      setForecastData(data);
    } catch (err) {
      setError(err.message || 'Failed to load forecast data');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div className="brand-icon" style={{ width: '36px', height: '36px', fontSize: '1rem' }}>
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="heading-ledger" style={{ fontSize: '1.25rem' }}>FAT — Forecast Attendance Tool</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                Simulate attendance outcomes before marking for the next 7 days
              </p>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Date Selector Pills */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label className="form-label">Select Future / Today Date</label>
          <div className="week-pills" style={{ padding: '0.25rem 0' }}>
            {nextDays.map((d) => (
              <div
                key={d.dateStr}
                className={`day-pill ${selectedDate === d.dateStr ? 'active' : ''} ${d.isSunday ? 'sunday' : ''}`}
                onClick={() => setSelectedDate(d.dateStr)}
              >
                <div className="day-pill-name">{d.dayName}</div>
                <div className="day-pill-num">{d.dayNum}</div>
                <div className="day-pill-status">
                  {d.isToday ? 'Today' : d.isSunday ? 'Holiday' : `+${nextDays.findIndex(x => x.dateStr === d.dateStr)}d`}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="alert-box alert-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Calculating simulation matrices...
          </div>
        ) : forecastData?.is_holiday ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-ledger)' }}>
            <h4 className="heading-ledger" style={{ color: 'var(--holiday)', fontSize: '1.1rem' }}>Sunday / Holiday</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
              No timetable blocks scheduled. Attendance percentage will not change.
            </p>
          </div>
        ) : forecastData?.blocks?.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', color: 'var(--text-dim)' }}>
            No scheduled blocks found for this date.
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span className="font-serif" style={{ fontWeight: 600, color: 'var(--copper-light)', fontSize: '0.95rem' }}>
                {forecastData?.day_name} ({selectedDate}) Period Simulations
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                Current Aggregate: {forecastData?.blocks[0]?.current_overall_pct?.toFixed(2)}%
              </span>
            </div>

            {forecastData?.blocks?.map((block) => (
              <div key={block.block_id} className="fat-card">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="period-num">#{block.order_index}</span>
                    <strong style={{ fontSize: '1rem', color: '#f1f5f9' }}>{block.subject}</strong>
                    <span className="mono-num" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      [{block.periods} {block.periods === 1 ? 'Period' : 'Periods'}]
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    Current subject score: <strong className="mono-num">{block.current_subject_pct?.toFixed(1)}%</strong>
                  </div>
                </div>

                <div className="fat-outcomes">
                  {/* If Present */}
                  <div className="fat-outcome-item">
                    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                      If Present
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--teal)' }}>
                      <TrendingUp size={14} />
                      <span className="fat-outcome-present">{block.overall_if_present?.toFixed(2)}%</span>
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                      (Subj: {block.subject_if_present?.toFixed(1)}%)
                    </span>
                  </div>

                  {/* If Absent */}
                  <div className="fat-outcome-item">
                    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                      If Absent
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--danger)' }}>
                      <TrendingDown size={14} />
                      <span className="fat-outcome-absent">{block.overall_if_absent?.toFixed(2)}%</span>
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                      (Subj: {block.subject_if_absent?.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close Tool
          </button>
        </div>
      </div>
    </div>
  );
}
