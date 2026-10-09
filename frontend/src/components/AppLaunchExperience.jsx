import React, { useState, useEffect, useRef } from 'react';
import BrandLogo from './BrandLogo';

/**
 * Standard cubic-bezier solvers:
 * - easeEntrance: cubic-bezier(0.22, 1, 0.36, 1) — Apple deceleration
 * - easeExit: cubic-bezier(0.4, 0, 1, 1) — clean acceleration out
 * - easeOutCubic: 1 - Math.pow(1 - t, 3)
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
const easeOutCubic = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export default function AppLaunchExperience({
  user,
  summary,
  brandLogoRef,
  brandTitleRef,
  attendanceTargetRef,
  onBrandLanded,
  onWidgetRevealed,
  onFinish
}) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [windowDimensions, setWindowDimensions] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  // Real attendance calculation computed BEFORE animation starts
  const overall = summary?.overall || { percentage: 0, attended: 0, total: 0 };
  let targetPct = Number(overall.percentage || 0);
  if (targetPct === 0 && user?.baseline_total > 0) {
    targetPct = Math.round((user.baseline_attended / user.baseline_total) * 1000) / 10;
  }
  const attendedCount = Number(overall.attended || user?.baseline_attended || 0);
  const absentCount = Math.max(0, Number(overall.total || user?.baseline_total || 0) - attendedCount);

  const brandLandedTriggeredRef = useRef(false);
  const widgetRevealedTriggeredRef = useRef(false);
  const onBrandLandedRef = useRef(onBrandLanded);
  onBrandLandedRef.current = onBrandLanded;
  const onWidgetRevealedRef = useRef(onWidgetRevealed);
  onWidgetRevealedRef.current = onWidgetRevealed;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // Track viewport dimensions on resize
  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        w: window.innerWidth,
        h: window.innerHeight
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Single timeline clock via requestAnimationFrame (Total duration = 3800ms)
  useEffect(() => {
    // Respect OS reduced-motion accessibility preference
    const isReduced = typeof window !== 'undefined' && 
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isReduced) {
      if (onBrandLandedRef.current) onBrandLandedRef.current();
      if (onWidgetRevealedRef.current) onWidgetRevealedRef.current();
      if (onFinishRef.current) onFinishRef.current();
      return;
    }

    let animId;
    let startTime = null;
    const TOTAL_DURATION = 3800; // ms at 1.0x

    function tick(timestamp) {
      if (!startTime) startTime = timestamp;
      const speed = (typeof window !== 'undefined' && window.__APY_ANIM_SPEED) 
        ? window.__APY_ANIM_SPEED 
        : 1.0;
      const elapsed = (timestamp - startTime) * speed;
      setElapsedMs(elapsed);

      // Trigger Brand Landed at 1450ms
      if (elapsed >= 1450 && !brandLandedTriggeredRef.current) {
        brandLandedTriggeredRef.current = true;
        if (onBrandLandedRef.current) onBrandLandedRef.current();
      }

      // Trigger Widget Revealed at 3650ms (during final 150ms of morph)
      if (elapsed >= 3650 && !widgetRevealedTriggeredRef.current) {
        widgetRevealedTriggeredRef.current = true;
        if (onWidgetRevealedRef.current) onWidgetRevealedRef.current();
      }

      if (elapsed < TOTAL_DURATION) {
        animId = requestAnimationFrame(tick);
      } else {
        if (!brandLandedTriggeredRef.current && onBrandLandedRef.current) onBrandLandedRef.current();
        if (!widgetRevealedTriggeredRef.current && onWidgetRevealedRef.current) onWidgetRevealedRef.current();
        if (onFinishRef.current) onFinishRef.current();
      }
    }

    animId = requestAnimationFrame(tick);
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  const W = windowDimensions.w;
  const H = windowDimensions.h;

  // =========================================================================
  // STAGE 1 & 2: BRAND LOGO & TITLE GEOMETRY & TRANSFORMS (0 to 1450ms)
  // =========================================================================
  // Initial Arrangement is Vertical at Screen Center:
  // LOGO (64x64)
  // ATT PER Y (26px font-serif)
  const logoStart = {
    x: W / 2 - 32,
    y: H / 2 - 44,
    size: 64
  };
  const titleStart = {
    x: W / 2, // centered horizontally
    y: H / 2 + 30
  };

  // Measure Real Destination Targets from Header DOM Nodes
  let targetLogoRect = null;
  let targetTitleRect = null;
  if (brandLogoRef?.current) {
    targetLogoRect = brandLogoRef.current.getBoundingClientRect();
  }
  if (brandTitleRef?.current) {
    targetTitleRect = brandTitleRef.current.getBoundingClientRect();
  }

  // Fallbacks if refs not mounted yet
  const destLogo = targetLogoRect && targetLogoRect.width > 0 ? {
    x: targetLogoRect.left,
    y: targetLogoRect.top,
    size: targetLogoRect.width
  } : {
    x: 20,
    y: 16,
    size: 40
  };

  const destTitle = targetTitleRect && targetTitleRect.width > 0 ? {
    x: targetTitleRect.left,
    y: targetTitleRect.top,
    w: targetTitleRect.width,
    h: targetTitleRect.height
  } : {
    x: destLogo.x + destLogo.size + 12,
    y: destLogo.y + 8,
    w: 120,
    h: 24
  };

  const showBrandFlight = elapsedMs < 1450;
  let logoStyle = {};
  let titleStyle = {};

  if (showBrandFlight) {
    if (elapsedMs < 700) {
      // Stage 1 (0 to 700ms): Centered Entrance Fade & Scale
      const p = Math.min(elapsedMs / 700, 1);
      const eased = easeEntrance(p);
      const scale = 0.88 + 0.12 * eased;
      const opacity = eased;

      logoStyle = {
        position: 'fixed',
        left: `${logoStart.x}px`,
        top: `${logoStart.y}px`,
        width: `${logoStart.size}px`,
        height: `${logoStart.size}px`,
        transform: `scale(${scale})`,
        opacity: opacity,
        transformOrigin: 'center center',
        zIndex: 100000,
        pointerEvents: 'none'
      };

      titleStyle = {
        position: 'fixed',
        left: `${titleStart.x}px`,
        top: `${titleStart.y}px`,
        transform: `translate(-50%, 0) scale(${scale})`,
        opacity: opacity,
        transformOrigin: 'center center',
        zIndex: 100000,
        pointerEvents: 'none'
      };
    } else {
      // Stage 2 (700 to 1450ms): FLIP Transition to Header
      const p = Math.min((elapsedMs - 700) / 750, 1);
      const eased = easeEntrance(p);

      // Logo glides to destLogo
      const curLogoX = logoStart.x + (destLogo.x - logoStart.x) * eased;
      const curLogoY = logoStart.y + (destLogo.y - logoStart.y) * eased;
      const logoScale = 1.0 + ((destLogo.size / logoStart.size) - 1.0) * eased;

      logoStyle = {
        position: 'fixed',
        left: `${curLogoX}px`,
        top: `${curLogoY}px`,
        width: `${logoStart.size}px`,
        height: `${logoStart.size}px`,
        transform: `scale(${logoScale})`,
        transformOrigin: 'top left',
        opacity: 1,
        zIndex: 100000,
        pointerEvents: 'none'
      };

      // Title glides from below logo to beside logo in header
      // Starting: center is titleStart.x, top is titleStart.y
      // Destination: left is destTitle.x, top is destTitle.y
      const curTitleLeft = (titleStart.x - 60) + (destTitle.x - (titleStart.x - 60)) * eased;
      const curTitleTop = titleStart.y + (destTitle.y - titleStart.y) * eased;
      const titleScale = 1.0 + ((Math.max(18, destTitle.h) / 26) - 1.0) * eased;

      titleStyle = {
        position: 'fixed',
        left: `${curTitleLeft}px`,
        top: `${curTitleTop}px`,
        transform: `scale(${titleScale})`,
        transformOrigin: 'top left',
        opacity: 1,
        zIndex: 100000,
        pointerEvents: 'none'
      };
    }
  }

  // =========================================================================
  // STAGE 3, 4, 5, 6: ATTENDANCE HERO & FLIP MORPH TO WIDGET (1450 to 3800ms)
  // =========================================================================
  const showAttendanceHero = elapsedMs >= 1450 && elapsedMs < 3800;

  // Real Attendance Calculation
  let countProgress = 0;
  if (elapsedMs >= 1950) {
    const rawT = Math.min((elapsedMs - 1950) / 1100, 1);
    countProgress = easeOutCubic(rawT);
  }
  const currentPct = targetPct * countProgress;

  // 180px Square Coordinate System
  const ringSize = 180;
  const strokeWidth = 5.5;
  const radius = 72; // Diameter 144px -> generous 34px radial clearance to digits
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * Math.min(100, Math.max(0, currentPct))) / 100;
  const ringColor = targetPct >= 75 ? '#255d44' : '#b91c1c';

  // Measure Real TodayAttendanceWidget Target
  let targetWidgetRect = null;
  if (attendanceTargetRef?.current) {
    targetWidgetRect = attendanceTargetRef.current.getBoundingClientRect();
  }

  const destWidget = targetWidgetRect && targetWidgetRect.width > 0 ? {
    cx: targetWidgetRect.left + targetWidgetRect.width / 2,
    cy: targetWidgetRect.top + targetWidgetRect.height / 2,
    w: targetWidgetRect.width,
    h: targetWidgetRect.height
  } : {
    cx: W - 100,
    cy: 80,
    w: 120,
    h: 52
  };

  let heroContainerStyle = {};
  if (showAttendanceHero) {
    if (elapsedMs < 1950) {
      // Entrance Fade & Scale: 1450 to 1950ms
      const p = Math.min((elapsedMs - 1450) / 500, 1);
      const eased = easeEntrance(p);
      heroContainerStyle = {
        position: 'fixed',
        left: `${W / 2}px`,
        top: `${H / 2}px`,
        transform: `translate(-50%, -50%) scale(${0.94 + 0.06 * eased})`,
        opacity: eased,
        zIndex: 99998,
        pointerEvents: 'none'
      };
    } else if (elapsedMs < 3250) {
      // Steady Hero Active & Settled Hold: 1950 to 3250ms
      heroContainerStyle = {
        position: 'fixed',
        left: `${W / 2}px`,
        top: `${H / 2}px`,
        transform: 'translate(-50%, -50%) scale(1)',
        opacity: 1,
        zIndex: 99998,
        pointerEvents: 'none'
      };
    } else {
      // Stage 6 (3250 to 3800ms): FLIP Morph to TodayAttendanceWidget
      const p = Math.min((elapsedMs - 3250) / 550, 1);
      const eased = easeEntrance(p);

      const startCx = W / 2;
      const startCy = H / 2;
      const curCx = startCx + (destWidget.cx - startCx) * eased;
      const curCy = startCy + (destWidget.cy - startCy) * eased;

      // Scale down to match widget height (52px vs 260px total card height => ~0.25 - 0.35)
      const targetScale = Math.min(0.42, Math.max(0.24, destWidget.h / 240));
      const curScale = 1.0 + (targetScale - 1.0) * eased;

      // Smoothly fade out during last 150ms of morph (from p ~ 0.72 to 1.0)
      const fadeOutOpacity = p > 0.7 ? Math.max(0, 1 - (p - 0.7) / 0.3) : 1;

      heroContainerStyle = {
        position: 'fixed',
        left: `${curCx}px`,
        top: `${curCy}px`,
        transform: `translate(-50%, -50%) scale(${curScale})`,
        opacity: fadeOutOpacity,
        zIndex: 99998,
        pointerEvents: 'none'
      };
    }
  }

  // Scrim Background Opacity: Opaque 0 to 1450ms, then fades out revealing Today page
  let scrimOpacity = 1;
  if (elapsedMs >= 1450) {
    const p = Math.min((elapsedMs - 1450) / 400, 1);
    scrimOpacity = Math.max(0, 1 - p);
  }

  return (
    <>
      {/* Background Portal Scrim (Covers dashboard initially, then reveals it smoothly) */}
      {scrimOpacity > 0 && (
        <div
          className="intro-scrim-layer"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--background, #fbf8f1)',
            opacity: scrimOpacity,
            zIndex: 99990,
            pointerEvents: 'none'
          }}
        />
      )}

      {/* FLYING BRAND CREST (Single Visible Logo during Intro) */}
      {showBrandFlight && (
        <div className="flight-logo-crest" style={logoStyle}>
          <BrandLogo size={logoStart.size} />
        </div>
      )}

      {/* FLYING BRAND WORDMARK (Glides from Vertical Stack to Horizontal Beside Logo) */}
      {showBrandFlight && (
        <div
          className="flight-brand-title font-serif"
          style={{
            ...titleStyle,
            fontSize: '26px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap'
          }}
        >
          <span className="brand-title-gold">ATT</span>{' '}
          <span className="brand-title-green">PER Y</span>
        </div>
      )}

      {/* HERO ATTENDANCE VISUALIZATION (Square Coordinate System, Centered Digits, Heartbeat) */}
      {showAttendanceHero && (
        <div
          className="intro-attendance-hero"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            ...heroContainerStyle
          }}
        >
          {/* Label strictly ABOVE the ring with >= 16px spacing */}
          <div
            className="intro-ring-label"
            style={{
              fontSize: '0.92rem',
              fontWeight: 700,
              color: '#163b2b',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: '18px',
              lineHeight: 1
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
            {/* SVG Ring & Heartbeat Wave Layer */}
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

              {/* Dynamic progress fill: draws 0 to real percentage in sync with digits */}
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

              {/* Dedicated Controlled Heartbeat Wave (Lower interior, never crosses digits) */}
              <path
                className="heartbeat-wave-path"
                d="M 52 130 C 66 126, 76 134, 90 128 C 104 122, 114 134, 128 130"
                stroke="rgba(197, 160, 89, 0.7)"
                strokeWidth="1.75"
                strokeLinecap="round"
                fill="none"
                style={{
                  opacity: countProgress > 0 ? 0.8 : 0,
                  transition: 'opacity 0.3s ease'
                }}
              />
            </svg>

            {/* Mathematically Centered Percentage Digits (Exact square center) */}
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
                className="font-serif attendance-percentage-val"
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
            className="intro-ring-counts font-mono attendance-metadata-row"
            style={{
              marginTop: '18px',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: '#5c584f',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              lineHeight: 1
            }}
          >
            <span style={{ color: '#255d44', fontWeight: 700 }}>{attendedCount} Present</span>
            <span style={{ margin: '0 8px', color: 'rgba(0,0,0,0.22)' }}>/</span>
            <span style={{ color: '#b91c1c', fontWeight: 700 }}>{absentCount} Absent</span>
          </div>
        </div>
      )}
    </>
  );
}
