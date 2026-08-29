import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Calendar, Edit3, CheckCircle2 } from 'lucide-react';
import TimetableBuilder from './TimetableBuilder';

const DAYS = [
  { weekday: 1, name: 'Monday' },
  { weekday: 2, name: 'Tuesday' },
  { weekday: 3, name: 'Wednesday' },
  { weekday: 4, name: 'Thursday' },
  { weekday: 5, name: 'Friday' },
  { weekday: 6, name: 'Saturday' },
];

export default function TimetableTab({ user, onTimetableUpdated }) {
  const [timetableData, setTimetableData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

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

          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsEditing(true)}>
            <Edit3 size={13} /> Edit
          </button>
        </div>

        {msg && (
          <div className="alert-callout success">
            <CheckCircle2 size={16} />
            <span>{msg}</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {DAYS.map((d) => {
            const blocks = timetableData?.timetable_by_day?.[d.weekday] || [];
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
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--ink)', borderBottom: '1px solid var(--rule)', paddingBottom: '0.35rem', marginBottom: '0.45rem' }}>
                  {d.name}
                </div>

                {blocks.length === 0 ? (
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>No classes scheduled</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {blocks.map((b) => (
                      <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                          {b.subject}
                          {b.subject.includes('LAB') && <span style={{ color: 'var(--accent-gold)', marginLeft: '4px' }}>[Lab]</span>}
                        </span>
                        <span className="mono-num" style={{ color: 'var(--ink-soft)', fontSize: '0.75rem' }}>
                          {b.periods} {b.periods === 1 ? 'period' : 'periods'}
                        </span>
                      </div>
                    ))}
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
