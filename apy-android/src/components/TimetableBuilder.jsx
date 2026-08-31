import React, { useState } from 'react';
import { Plus, Trash2, Clock, CheckCircle } from 'lucide-react';

const DAYS = [
  { weekday: 1, name: 'Monday', short: 'Mon' },
  { weekday: 2, name: 'Tuesday', short: 'Tue' },
  { weekday: 3, name: 'Wednesday', short: 'Wed' },
  { weekday: 4, name: 'Thursday', short: 'Thu' },
  { weekday: 5, name: 'Friday', short: 'Fri' },
  { weekday: 6, name: 'Saturday', short: 'Sat' },
];

export default function TimetableBuilder({ initialBlocks = [], onSave, onCancel, showHeader = true }) {
  const [activeDay, setActiveDay] = useState(1); // 1 = Monday

  // Store blocks as { 1: [...], 2: [...], ... }
  const [blocksByDay, setBlocksByDay] = useState(() => {
    const map = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    if (Array.isArray(initialBlocks)) {
      initialBlocks.forEach(b => {
        if (map[b.weekday]) {
          map[b.weekday].push({
            subject: b.subject || '',
            periods: b.periods || 2
          });
        }
      });
    }
    return map;
  });

  const handleAddBlock = () => {
    setBlocksByDay(prev => ({
      ...prev,
      [activeDay]: [...prev[activeDay], { subject: '', periods: 2 }]
    }));
  };

  const handleUpdateBlock = (index, field, value) => {
    setBlocksByDay(prev => {
      const currentList = [...prev[activeDay]];
      currentList[index] = { ...currentList[index], [field]: value };
      return { ...prev, [activeDay]: currentList };
    });
  };

  const handleRemoveBlock = (index) => {
    setBlocksByDay(prev => ({
      ...prev,
      [activeDay]: prev[activeDay].filter((_, i) => i !== index)
    }));
  };

  const totalWeeklyPeriods = Object.values(blocksByDay).reduce(
    (acc, list) => acc + list.reduce((sum, b) => sum + (parseInt(b.periods) || 0), 0),
    0
  );

  const handleComplete = () => {
    // Flatten blocks with proper weekday & order_index
    const flattened = [];
    for (let w = 1; w <= 6; w++) {
      const list = blocksByDay[w] || [];
      list.forEach((b, idx) => {
        if (b.subject.trim()) {
          flattened.push({
            weekday: w,
            order_index: idx + 1,
            subject: b.subject.trim(),
            periods: parseInt(b.periods) || 1
          });
        }
      });
    }
    onSave(flattened);
  };

  return (
    <div className="timetable-builder">
      {showHeader && (
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 className="heading-ledger" style={{ fontSize: '1.15rem' }}>Section Timetable Builder</h3>
          <p className="form-help">
            Define subjects and period durations for Monday through Saturday. Sunday is always treated as a fixed holiday.
          </p>
        </div>
      )}

      {/* Day Tabs */}
      <div className="builder-day-tabs">
        {DAYS.map(d => {
          const count = blocksByDay[d.weekday]?.length || 0;
          return (
            <button
              key={d.weekday}
              type="button"
              className={`builder-day-tab ${activeDay === d.weekday ? 'active' : ''}`}
              onClick={() => setActiveDay(d.weekday)}
            >
              {d.short} {count > 0 && `(${count})`}
            </button>
          );
        })}
      </div>

      {/* Active Day Content */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span className="font-serif" style={{ fontWeight: 600, color: 'var(--copper-light)' }}>
            {DAYS.find(d => d.weekday === activeDay)?.name} Schedule
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddBlock}>
            <Plus size={14} /> Add Subject
          </button>
        </div>

        {blocksByDay[activeDay]?.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', color: 'var(--text-dim)' }}>
            No classes scheduled for {DAYS.find(d => d.weekday === activeDay)?.name}.
          </div>
        ) : (
          blocksByDay[activeDay].map((block, idx) => (
            <div key={idx} className="builder-block-row">
              <input
                type="text"
                className="form-input"
                placeholder="e.g. DBMS, OOPJ, PP LAB"
                value={block.subject}
                onChange={(e) => handleUpdateBlock(idx, 'subject', e.target.value)}
              />

              <select
                className="form-select mono"
                value={block.periods}
                onChange={(e) => handleUpdateBlock(idx, 'periods', parseInt(e.target.value) || 1)}
              >
                <option value={1}>1 Period</option>
                <option value={2}>2 Periods</option>
                <option value={3}>3 Periods</option>
                <option value={4}>4 Periods</option>
              </select>

              <button
                type="button"
                className="btn btn-danger btn-icon"
                onClick={() => handleRemoveBlock(idx)}
                title="Remove block"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Summary Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Total Weekly: <strong className="mono-num" style={{ color: 'var(--teal)' }}>{totalWeeklyPeriods}</strong> periods
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {onCancel && (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={handleComplete}>
            <CheckCircle size={16} /> Save Timetable
          </button>
        </div>
      </div>
    </div>
  );
}
