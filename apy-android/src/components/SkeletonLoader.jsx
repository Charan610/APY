import React from 'react';

export function SkeletonCard() {
  return (
    <div className="ledger-card skeleton-pulse-card" style={{ marginBottom: '1rem', minHeight: '140px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="skeleton-line" style={{ width: '40%', height: '18px', borderRadius: '4px' }} />
        <div className="skeleton-line" style={{ width: '15%', height: '14px', borderRadius: '4px' }} />
      </div>
      <div className="skeleton-line" style={{ width: '60%', height: '32px', marginBottom: '0.75rem', borderRadius: '6px' }} />
      <div className="skeleton-line" style={{ width: '100%', height: '8px', borderRadius: '4px', marginBottom: '0.75rem' }} />
      <div className="skeleton-line" style={{ width: '75%', height: '14px', borderRadius: '4px' }} />
    </div>
  );
}

export function SkeletonSubjectList({ count = 4 }) {
  return (
    <div className="subject-pc-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="ledger-card skeleton-pulse-card" style={{ marginBottom: '0.85rem', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div className="skeleton-line" style={{ width: '35%', height: '16px', borderRadius: '4px' }} />
            <div className="skeleton-line" style={{ width: '15%', height: '20px', borderRadius: '4px' }} />
          </div>
          <div className="skeleton-line" style={{ width: '100%', height: '6px', borderRadius: '4px', marginBottom: '0.5rem' }} />
          <div className="skeleton-line" style={{ width: '50%', height: '12px', borderRadius: '4px' }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTimetableGrid() {
  return (
    <div className="timetable-pc-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="skeleton-pulse-card"
          style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--rule)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem',
            minHeight: '180px'
          }}
        >
          <div className="skeleton-line" style={{ width: '50%', height: '14px', marginBottom: '1rem', borderRadius: '4px' }} />
          <div className="skeleton-line" style={{ width: '100%', height: '12px', marginBottom: '0.5rem', borderRadius: '4px' }} />
          <div className="skeleton-line" style={{ width: '80%', height: '12px', marginBottom: '0.5rem', borderRadius: '4px' }} />
          <div className="skeleton-line" style={{ width: '90%', height: '12px', borderRadius: '4px' }} />
        </div>
      ))}
    </div>
  );
}
