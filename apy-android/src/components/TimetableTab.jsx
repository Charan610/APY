import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Edit3, CheckCircle2, Clock, Search, Calendar, Database, Cpu, Code, BookOpen, Layers } from 'lucide-react';
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
      console.error('Failed to load timetable:', err);
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

  const getSubjectIcon = (subjectName = '') => {
    const s = subjectName.toUpperCase();
    if (s.includes('DBMS') || s.includes('DATABASE') || s.includes('SQL')) return Database;
    if (s.includes('DLCO') || s.includes('COA') || s.includes('CHIP') || s.includes('HARDWARE')) return Cpu;
    if (s.includes('LAB') || s.includes('JAVA') || s.includes('PYTHON') || s.includes('CPP') || s.includes('DSA')) return Code;
    if (s.includes('FLAT') || s.includes('MATH') || s.includes('STAT')) return BookOpen;
    return Layers;
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
              Section {user?.section_label || 'C'} ({user?.branch || 'CSE'}) Schedule
            </div>
            <div style={{ fontSize: '0.775rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
              Effective w.e.f. {timetableData?.section?.effective_from || '2026-07-20'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button 
              type="button" 
              className="btn btn-secondary btn-sm" 
              onClick={() => setIsEditing(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Edit3 size={13} />
              <span>Edit Schedule</span>
            </button>
          </div>
        </div>

        {/* Quick Search & Filter */}
        <div style={{ margin: '0.85rem 0 1.15rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
            <input
              type="text"
              className="input-text"
              placeholder="Search subject (e.g. DBMS, LAB, DLCO)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: '0.825rem', padding: '0.45rem 0.75rem 0.45rem 2.1rem', width: '100%' }}
            />
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
          </div>
          {searchQuery && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSearchQuery('')}
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
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

        {/* Days Grid */}
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
                  borderRadius: 'var(--radius-lg)',
                  padding: '0.95rem 1rem',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--rule)', paddingBottom: '0.5rem', marginBottom: '0.65rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--ink)', fontFamily: 'var(--font-serif)' }}>
                    {d.name}
                  </span>
                  <span className="mono-num" style={{ fontSize: '0.725rem', color: 'var(--accent-gold-dark)', fontWeight: 700, background: 'var(--accent-gold-soft)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-full)' }}>
                    {dayTotalPeriods} periods
                  </span>
                </div>

                {blocks.length === 0 ? (
                  <div style={{ fontSize: '0.775rem', color: 'var(--ink-soft)', padding: '0.75rem 0', textAlign: 'center' }}>
                    No classes scheduled
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {blocks.map((b) => {
                      const isMatch = query ? b.subject.toLowerCase().includes(query) : true;
                      const slotStart = periodCounter;
                      periodCounter += b.periods;
                      const timeHint = PERIOD_SLOTS[slotStart] ? `${PERIOD_SLOTS[slotStart].split(' - ')[0]}` : '';
                      const isLab = b.subject.toUpperCase().includes('LAB');
                      const Icon = getSubjectIcon(b.subject);

                      return (
                        <div 
                          key={b.id} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            fontSize: '0.825rem',
                            padding: '0.45rem 0.6rem',
                            borderRadius: 'var(--radius-md)',
                            background: query && isMatch ? 'rgba(201, 147, 59, 0.15)' : '#FFFFFF',
                            border: query && isMatch ? '1px solid var(--accent-gold)' : '1px solid var(--rule)',
                            opacity: query && !isMatch ? 0.35 : 1,
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                            <div style={{ color: isLab ? 'var(--brand-forest)' : 'var(--accent-gold-dark)' }}>
                              <Icon size={15} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span>{b.subject}</span>
                                {isLab && <span className="subject-type-pill" style={{ fontSize: '0.6rem', padding: '0.05rem 0.35rem' }}>Lab</span>}
                              </div>
                              {timeHint && (
                                <div style={{ fontSize: '0.68rem', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
                                  Slot starts ~{timeHint}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <span className="mono-num" style={{ color: 'var(--ink-soft)', fontSize: '0.75rem', fontWeight: 600, textAlign: 'right' }}>
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
