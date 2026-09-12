import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Calendar, Edit3, CheckCircle2, Clock, Search } from 'lucide-react';
import TimetableBuilder from './TimetableBuilder';

const DAYS = [
  { weekday: 1, name: 'Monday' },
  { weekday: 2, name: 'Tuesday' },
  { weekday: 3, name: 'Wednesday' },
  { weekday: 4, name: 'Thursday' },
  { weekday: 5, name: 'Friday' },
  { weekday: 6, name: 'Saturday' },
];

const PERIOD_SLOTS = [
  '09:00 - 09:50',
  '09:50 - 10:40',
  '10:50 - 11:40',
  '11:40 - 12:30',
  '01:20 - 02:10',
  '02:10 - 03:00',
  '03:00 - 03:50'
];

export default function TimetableTab({ user, onTimetableUpdated }) {
  const [timetableData, setTimetableData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (user?.section_id) {
      loadTimetable();
    }
  }, [user?.section_id]);

  const loadTimetable = async () => {
    setLoading(true);
    try {
      const data = await api.getSectionTimetable(user.section_id);
      setTimetableData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (blocks) => {
    try {
      await api.updateTimetable(user.section_id, { blocks });
      setMsg('Timetable updated successfully.');
      setTimeout(() => setMsg(''), 3000);
      setIsEditing(false);
      loadTimetable();
      if (onTimetableUpdated) onTimetableUpdated();
    } catch (err) {
      alert(err.message || 'Failed to update timetable');
    }
  };

  if (isEditing) {
    return (
      <div className="ledger-card">
        <div className="card-header-ruled">
          <span className="card-header-title">Edit Section Timetable</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsEditing(false)}>
            Cancel
          </button>
        </div>
        <TimetableBuilder
          initialBlocks={timetableData?.blocks || []}
          onSave={handleSave}
          onCancel={() => setIsEditing(false)}
          showHeader={false}
        />
      </div>
    );
  }

  const query = searchQuery.trim().toLowerCase();

  return (
    <div>
      <div className="ledger-card">
        <div className="card-header-ruled">
          <div>
            <div className="card-header-title">
              <span>Section {user?.section_label} ({user?.branch}) Timetable</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
              Effective w.e.f. {timetableData?.section?.effective_from || '2026-07-20'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsEditing(true)}>
              <Edit3 size={13} /> Edit Timetable
            </button>
          </div>
        </div>

        {/* Quick Search & Filter */}
        <div style={{ margin: '0.75rem 0 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '280px' }}>
            <input
              type="text"
              className="input-text"
              placeholder="Search subject (e.g., DBMS, LAB)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem 0.35rem 1.8rem', width: '100%' }}
            />
            <Search size={13} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
          </div>
          {searchQuery && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSearchQuery('')}
              style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem' }}
            >
              Clear
            </button>
          )}
        </div>

        {msg && (
          <div className="alert-callout success" style={{ marginBottom: '1rem' }}>
            <CheckCircle2 size={16} />
            <span>{msg}</span>
          </div>
        )}

        <div className="timetable-pc-grid">
          {DAYS.map((d) => {
            const blocks = timetableData?.timetable_by_day?.[d.weekday] || [];
            const dayTotalPeriods = blocks.reduce((sum, b) => sum + (b.periods || 0), 0);
            let periodCounter = 0;

            return (
              <div
                key={d.weekday}
                style={{
                  background: 'var(--surface-alt)',
                  border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 0.85rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--rule)', paddingBottom: '0.35rem', marginBottom: '0.45rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--ink)' }}>
                    {d.name}
                  </span>
                  <span className="mono-num" style={{ fontSize: '0.7rem', color: 'var(--accent-gold)' }}>
                    {dayTotalPeriods} periods
                  </span>
                </div>

                {blocks.length === 0 ? (
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', padding: '0.5rem 0' }}>No classes scheduled</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {blocks.map((b) => {
                      const isMatch = query ? b.subject.toLowerCase().includes(query) : true;
                      const slotStart = periodCounter;
                      periodCounter += b.periods;
                      const timeHint = PERIOD_SLOTS[slotStart] ? `${PERIOD_SLOTS[slotStart].split(' - ')[0]}` : '';

                      return (
                        <div 
                          key={b.id} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            fontSize: '0.8rem',
                            padding: '0.2rem 0.35rem',
                            borderRadius: 'var(--radius-sm)',
                            background: query && isMatch ? 'rgba(217, 119, 6, 0.15)' : 'transparent',
                            border: query && isMatch ? '1px solid var(--accent-gold)' : '1px solid transparent',
                            opacity: query && !isMatch ? 0.35 : 1
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                              {b.subject}
                              {b.subject.includes('LAB') && <span style={{ color: 'var(--accent-gold)', marginLeft: '4px' }}>[Lab]</span>}
                            </span>
                            {timeHint && (
                              <div style={{ fontSize: '0.68rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
                                Slot starts ~{timeHint}
                              </div>
                            )}
                          </div>
                          <span className="mono-num" style={{ color: 'var(--ink-soft)', fontSize: '0.72rem', textAlign: 'right' }}>
                            {b.periods} {b.periods === 1 ? 'period' : 'periods'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
