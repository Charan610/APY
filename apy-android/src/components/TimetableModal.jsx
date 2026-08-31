import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Calendar, X, Clock, Edit3 } from 'lucide-react';
import TimetableBuilder from './TimetableBuilder';

const DAYS = [
  { weekday: 1, name: 'Monday' },
  { weekday: 2, name: 'Tuesday' },
  { weekday: 3, name: 'Wednesday' },
  { weekday: 4, name: 'Thursday' },
  { weekday: 5, name: 'Friday' },
  { weekday: 6, name: 'Saturday' },
];

export default function TimetableModal({ isOpen, onClose, user, onTimetableUpdated }) {
  const [timetableData, setTimetableData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && user?.section_id) {
      loadTimetable();
    }
  }, [isOpen, user?.section_id]);

  const loadTimetable = async () => {
    setLoading(true);
    try {
      const data = await api.getSectionTimetable(user.section_id);
      setTimetableData(data);
    } catch (err) {
      setError(err.message || 'Failed to load timetable');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSaveCustom = async (newBlocks) => {
    setLoading(true);
    setError('');
    setMsg('');
    try {
      await api.updateTimetable(user.section_id, { blocks: newBlocks });
      setMsg('Timetable updated successfully.');
      setIsEditing(false);
      loadTimetable();
      if (onTimetableUpdated) onTimetableUpdated();
    } catch (err) {
      setError(err.message || 'Failed to update timetable');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '780px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div className="brand-icon" style={{ width: '36px', height: '36px' }}>
              <Calendar size={18} />
            </div>
            <div>
              <h3 className="heading-ledger" style={{ fontSize: '1.25rem' }}>
                Section {user?.section_label} ({user?.branch}) Timetable
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                Effective from {timetableData?.section?.effective_from || '2026-07-20'} · Mon–Sat Schedule
              </p>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {msg && (
          <div className="alert-box alert-success">
            <span>{msg}</span>
          </div>
        )}

        {error && (
          <div className="alert-box alert-error">
            <span>{error}</span>
          </div>
        )}

        {isEditing ? (
          <div>
            <TimetableBuilder
              initialBlocks={timetableData?.blocks || []}
              onSave={handleSaveCustom}
              onCancel={() => setIsEditing(false)}
            />
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsEditing(true)}
              >
                <Edit3 size={14} /> Edit Timetable
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
              {DAYS.map((d) => {
                const blocks = timetableData?.timetable_by_day?.[d.weekday] || [];
                return (
                  <div key={d.weekday} style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                    <div style={{ fontWeight: 700, color: 'var(--copper-light)', fontSize: '0.9rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.4rem' }}>
                      {d.name}
                    </div>

                    {blocks.length === 0 ? (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>No classes</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {blocks.map((b) => (
                          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.825rem' }}>
                            <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{b.subject}</span>
                            <span className="mono-num" style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                              {b.periods} {b.periods === 1 ? 'pd' : 'pds'}
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
        )}
      </div>
    </div>
  );
}
