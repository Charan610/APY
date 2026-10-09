import React, { useState, useEffect, useRef } from 'react';
import BrandLogo from './BrandLogo';

/**
 * Standard cubic-bezier solvers:
 * - easeEntrance: cubic-bezier(0.22, 1, 0.36, 1) — Apple deceleration
 * - easeExit: cubic-bezier(0.4, 0, 1, 1) — clean acceleration out
 */
function createCubicBezierSolver(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  function sampleCurveX(t) { return ((ax * t + bx) * t + cx) * t; }
  function sampleCurveY(t) { return ((ay * t + by) * t + cy) * t; }
  function sampleCurveDerivativeX(t) { return (3 * ax * t + 2 * bx) * t + cx; }

  return function solve(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const x2 = sampleCurveX(t) - x;
      if (Math.abs(x2) < 1e-5) return sampleCurveY(t);
      const d2 = sampleCurveDerivativeX(t);
      if (Math.abs(d2) < 1e-5) break;
      t -= x2 / d2;
    }
    let t0 = 0, t1 = 1;
    t = x;
    while (t0 < t1) {
      const x2 = sampleCurveX(t);
      if (Math.abs(x2 - x) < 1e-5) return sampleCurveY(t);
      if (x > x2) t0 = t;
      else t1 = t;
      t = (t1 + t0) * 0.5;
    }
    return sampleCurveY(t);
  };
}

const easeEntrance = createCubicBezierSolver(0.22, 1, 0.36, 1);
const easeExit = createCubicBezierSolver(0.4, 0, 1, 1);

export default function AppLaunchExperience({
  user,
  summary,
  onCrossfadeStart,
  onFinish
}) {
  const [elapsedMs, setElapsedMs] = useState(0);

  // Real attendance calculation computed BEFORE animation starts
  const overall = summary?.overall || { percentage: 0, attended: 0, total: 0 };
  let targetPct = Number(overall.percentage || 0);
  if (targetPct === 0 && user?.baseline_total > 0) {
    targetPct = Math.round((user.baseline_attended / user.baseline_total) * 1000) / 10;
  }
  const attendedCount = Number(overall.attended || user?.baseline_attended || 0);
  const absentCount = Math.max(0, Number(overall.total || user?.baseline_total || 0) - attendedCount);

  const onCrossfadeStartRef = useRef(onCrossfadeStart);
  onCrossfadeStartRef.current = onCrossfadeStart;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const crossfadeTriggeredRef = useRef(false);

  // Single timeline clock via requestAnimationFrame (Total duration = 3000ms)
  useEffect(() => {
    // Respect OS reduced-motion accessibility preference
    const isReduced = typeof window !== 'undefined' && 
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isReduced) {
      if (onCrossfadeStartRef.current) onCrossfadeStartRef.current();
      const t = setTimeout(() => {
        if (onFinishRef.current) onFinishRef.current();
      }, 200);
      return () => clearTimeout(t);
    }

    let animId;
    let startTime = null;
    const TOTAL_DURATION = 3000; // ms

    function tick(timestamp) {
      if (!startTime) startTime = timestamp;
      const speed = (typeof window !== 'undefined' && window.__APY_ANIM_SPEED) 
        ? window.__APY_ANIM_SPEED 
        : 1.0;
      const elapsed = (timestamp - startTime) * speed;
      setElapsedMs(elapsed);

      // Trigger Stage 4 dashboard cross-fade at 2600ms
      if (elapsed >= 2600 && !crossfadeTriggeredRef.current) {
        crossfadeTriggeredRef.current = true;
        if (onCrossfadeStartRef.current) onCrossfadeStartRef.current();
      }

      if (elapsed < TOTAL_DURATION) {
        animId = requestAnimationFrame(tick);
      } else {
        if (onFinishRef.current) onFinishRef.current();
      }
    }

    animId = requestAnimationFrame(tick);
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  // Timeline Segments:
  // - Stage 1 (0 to 800ms): Logo square & "ATT PER Y" fade in at center, scale 0.92 to 1
  // - Stage 2 (800 to 1200ms): Logo fades out and drifts up 12px. Fully gone before 1200ms
  // - Stage 3 (1200 to 2400ms): Clean 180px attendance ring + centered digits + labels above/below
  //   Count-up & ring draw run in sync for 1100ms (1250ms to 2350ms) using easeOutCubic
  // - Stage 4 (2400 to 3000ms): Hold 200ms (2400-2600ms), then cross-fade out (2600-3000ms)

  // Stage 1 & 2: Brand Logo & Title Calculations
  let showBrand = false;
  let brandOpacity = 0;
  let brandTransform = 'scale(0.92)';

  if (elapsedMs < 800) {
    showBrand = true;
    const t = Math.min(elapsedMs / 800, 1);
    const eased = easeEntrance(t);
    brandOpacity = eased;
    brandTransform = `scale(${0.92 + 0.08 * eased})`;
  } else if (elapsedMs >= 800 && elapsedMs < 1200) {
    showBrand = true;
    const t = Math.min((elapsedMs - 800) / 400, 1);
    const eased = easeExit(t);
    brandOpacity = Math.max(0, 1 - eased);
    brandTransform = `translateY(${-12 * eased}px) scale(1)`;
  }

  // Stage 3: Attendance Ring & Number Calculations
  let showAttendance = false;
  let attendanceOpacity = 0;
  let attendanceTransform = 'scale(1)';

  if (elapsedMs >= 1200) {
    showAttendance = true;
    if (elapsedMs < 1400) {
      // Entrance fade-in: 1200 to 1400ms
      const t = Math.min((elapsedMs - 1200) / 200, 1);
      const eased = easeEntrance(t);
      attendanceOpacity = eased;
      attendanceTransform = `scale(${0.96 + 0.04 * eased})`;
    } else {
      attendanceOpacity = 1;
      attendanceTransform = 'scale(1)';
    }
  }

  // Synchronized count-up & ring stroke draw: 1250ms to 2350ms (exact 1100ms)
  let countProgress = 0;
  if (elapsedMs >= 1250) {
    const rawT = Math.min((elapsedMs - 1250) / 1100, 1);
    // Shared easeOutCubic curve so ring and number stop at the exact same instant
    countProgress = 1 - Math.pow(1 - rawT, 3);
  }
  const currentPct = targetPct * countProgress;

  // Ring Geometry: 180px square coordinate system
  const ringSize = 180;
  const strokeWidth = 5.5;
  const radius = 72; // Diameter 144px -> generous 34px radial clearance to digits
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * Math.min(100, Math.max(0, currentPct))) / 100;
  const ringColor = targetPct >= 75 ? '#255d44' : '#b91c1c';

  // Stage 4 Cross-fade: 2600ms to 3000ms
  let overlayOpacity = 1;
  if (elapsedMs >= 2600) {
    const t = Math.min((elapsedMs - 2600) / 400, 1);
    overlayOpacity = Math.max(0, 1 - t);
  }

  return (
    <div
      className="intro-portal-viewport"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: '#fbf8f1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        opacity: overlayOpacity,
        willChange: overlayOpacity < 1 ? 'opacity' : 'auto'
      }}
    >
      {/* STAGE 1 & 2: Centered Brand Crest & Title (Never flies) */}
      {showBrand && (
        <div
          className="intro-brand-stage"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: brandOpacity,
            transform: brandTransform,
            willChange: 'transform, opacity'
          }}
        >
          <div className="brand-crest" style={{ marginBottom: '14px' }}>
            <BrandLogo size={64} />
          </div>
          <div
            className="brand-heading font-serif"
            style={{
              fontSize: '26px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap'
            }}
          >
            <span className="brand-title-gold">ATT</span>{' '}
            <span className="brand-title-green">PER Y</span>
          </div>
        </div>
      )}

      {/* STAGE 3: Centered Attendance Ring (Label above, digits inside, counts below) */}
      {showAttendance && (
        <div
          className="intro-attendance-stage"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: attendanceOpacity,
            transform: attendanceTransform,
            willChange: 'transform, opacity'
          }}
        >
          {/* Label strictly ABOVE the ring with >= 16px spacing */}
          <div
            className="intro-ring-label"
            style={{
              fontSize: '0.92rem',
              fontWeight: 700,
              color: '#163b2b',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              marginBottom: '18px'
            }}
          >
            Attendance
          </div>

          {/* 180px Square Visual Container with mathematically centered digits */}
          <div
            className="attendance-visual"
            style={{
              position: 'relative',
              width: ringSize,
              height: ringSize,
              aspectRatio: '1 / 1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {/* SVG Ring Layer */}
            <svg
              width={ringSize}
              height={ringSize}
              viewBox={`0 0 ${ringSize} ${ringSize}`}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
              {/* Subtle background guide track */}
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                stroke="rgba(197, 160, 89, 0.22)"
                strokeWidth="4"
                fill="none"
              />

              {/* Dynamic progress fill: draws 0 to real percentage */}
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                stroke={ringColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                fill="none"
              />
            </svg>

            {/* Mathematically centered percentage digits (no stroke contact) */}
            <div
              className="attendance-percentage-layer"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                pointerEvents: 'none'
              }}
            >
              <span
                className="font-serif"
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 800,
                  color: ringColor,
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {currentPct.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Metadata strictly BELOW the ring with >= 16px spacing */}
          <div
            className="intro-ring-counts font-mono"
            style={{
              marginTop: '18px',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: '#5c584f',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap'
            }}
          >
            <span style={{ color: '#255d44', fontWeight: 700 }}>{attendedCount} Present</span>
            <span style={{ margin: '0 8px', color: 'rgba(0,0,0,0.22)' }}>/</span>
            <span style={{ color: '#b91c1c', fontWeight: 700 }}>{absentCount} Absent</span>
          </div>
        </div>
      )}
    </div>
  );
}
