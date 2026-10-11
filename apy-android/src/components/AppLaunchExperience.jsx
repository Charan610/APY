import React, { useState, useEffect, useRef } from 'react';
import BrandLogo from './BrandLogo';

/**
 * Standard cubic-bezier solvers:
 * - easeEntrance: cubic-bezier(0.22, 1, 0.36, 1) — Apple deceleration curve
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

const easeEntrance = createCubicBezierSolver(0.18, 1, 0.3, 1);
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
    w: typeof window !== 'undefined' ? window.innerWidth : 390,
    h: typeof window !== 'undefined' ? window.innerHeight : 844
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

  // Measure Header and Widget destination targets dynamically
  const [destLogo, setDestLogo] = useState({ x: 16, y: 14, size: 40 });
  const [destTitle, setDestTitle] = useState({ x: 66, y: 14, w: 120, h: 24 });
  const [destWidget, setDestWidget] = useState({
    cx: 280,
    cy: 160,
    w: 140,
    h: 52
  });

  useEffect(() => {
    const measure = () => {
      if (brandLogoRef?.current) {
        const r = brandLogoRef.current.getBoundingClientRect();
        if (r.width > 0) {
          setDestLogo({ x: r.left, y: r.top, size: r.width });
        }
      }
      if (brandTitleRef?.current) {
        const r = brandTitleRef.current.getBoundingClientRect();
        if (r.width > 0) {
          setDestTitle({ x: r.left, y: r.top, w: r.width, h: r.height });
        }
      }
      if (attendanceTargetRef?.current) {
        const r = attendanceTargetRef.current.getBoundingClientRect();
        if (r.width > 0) {
          setDestWidget({
            cx: r.left + r.width / 2,
            cy: r.top + r.height / 2,
            w: r.width,
            h: r.height
          });
        }
      }
    };
    measure();
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [brandLogoRef, brandTitleRef, attendanceTargetRef]);

  // Single timeline clock via requestAnimationFrame (Total duration = 3200ms)
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
    const TOTAL_DURATION = 3200; // ms

    function tick(timestamp) {
      if (!startTime) startTime = timestamp;
      const speed = (typeof window !== 'undefined' && window.__APY_ANIM_SPEED) 
        ? window.__APY_ANIM_SPEED 
        : 1.0;
      const elapsed = (timestamp - startTime) * speed;
      setElapsedMs(elapsed);

      // Trigger Brand Landed at 1350ms (when logo reaches header)
      if (elapsed >= 1350 && !brandLandedTriggeredRef.current) {
        brandLandedTriggeredRef.current = true;
        if (onBrandLandedRef.current) onBrandLandedRef.current();
      }

      // Trigger Widget Revealed at 3000ms (during final morph into today card)
      if (elapsed >= 3000 && !widgetRevealedTriggeredRef.current) {
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
  // STAGE 1 & 2: BRAND LOGO & TITLE ANIMATION (0 to 1350ms)
  // - 0 to 600ms: App logo & text appear centered
  // - 600 to 1350ms: Animated and glide to the top of the app, settle at top
  // =========================================================================
  const logoStart = {
    x: W / 2 - 32,
    y: H / 2 - 46,
    size: 64
  };
  const titleStart = {
    x: W / 2,
    y: H / 2 + 28
  };

  const showBrandFlight = elapsedMs < 1350;
  let logoStyle = {};
  let titleStyle = {};

  if (showBrandFlight) {
    if (elapsedMs < 600) {
      // Stage 1 (0 to 600ms): Centered Entrance Fade & Scale
      const p = Math.min(elapsedMs / 600, 1);
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
      // Stage 2 (600 to 1350ms): Glide to Header and Settle at Top
      const p = Math.min((elapsedMs - 600) / 750, 1);
      const eased = easeEntrance(p);

      // Logo glides to destLogo at top of app
      const curLogoX = logoStart.x + (destLogo.x - logoStart.x) * eased;
      const curLogoY = logoStart.y + (destLogo.y - logoStart.y) * eased;
      const logoScale = 1.0 + ((destLogo.size / logoStart.size) - 1.0) * eased;
      const curLogoSize = logoStart.size * logoScale;

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

      // Title glides smoothly from directly underneath the logo to beside the logo at top
      const titleStartW = 120;
      const titleStartH = 26;
      const startRelX = (curLogoSize - titleStartW) / 2;
      const startRelY = curLogoSize + 14;
      const endRelX = curLogoSize + 10;
      const endRelY = Math.max(0, (curLogoSize - (destTitle.h || 24)) / 2);

      const curTitleLeft = curLogoX + startRelX + (endRelX - startRelX) * eased;
      const curTitleTop = curLogoY + startRelY + (endRelY - startRelY) * eased;
      const titleScale = 1.0 + ((Math.max(18, destTitle.h) / titleStartH) - 1.0) * eased;

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
  // STAGE 3 & 4: ATTENDANCE RING & COUNT-UP (1350 to 3200ms)
  // =========================================================================
  const showAttendanceHero = elapsedMs >= 1350 && elapsedMs < 3200;

  // Real Attendance Calculation
  let countProgress = 0;
  if (elapsedMs >= 1450) {
    const rawT = Math.min((elapsedMs - 1450) / 1100, 1);
    countProgress = easeOutCubic(rawT);
  }
  const currentPct = targetPct * countProgress;

  // 180px Square Coordinate System
  const ringSize = 180;
  const strokeWidth = 5.5;
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * Math.min(100, Math.max(0, currentPct))) / 100;
  const ringColor = targetPct >= 75 ? 'var(--good)' : 'var(--bad)';

  let heroContainerStyle = {};
  if (showAttendanceHero) {
    if (elapsedMs < 1700) {
      // Entrance Fade & Scale: 1350 to 1700ms
      const p = Math.min((elapsedMs - 1350) / 350, 1);
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
    } else if (elapsedMs < 2650) {
      // Settled Center Display & Count-up: 1700 to 2650ms
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
      // Morph towards Today attendance widget card: 2650 to 3200ms
      const p = Math.min((elapsedMs - 2650) / 550, 1);
      const eased = easeEntrance(p);

      const startCx = W / 2;
      const startCy = H / 2;
      const curCx = startCx + (destWidget.cx - startCx) * eased;
      const curCy = startCy + (destWidget.cy - startCy) * eased;

      const targetScale = Math.min(0.42, Math.max(0.24, destWidget.h / 240));
      const curScale = 1.0 + (targetScale - 1.0) * eased;
      const fadeOutOpacity = p > 0.65 ? Math.max(0, 1 - (p - 0.65) / 0.35) : 1;

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

  // Scrim Background Opacity: Opaque parchment 0 to 1350ms, then fades out softly
  let scrimOpacity = 1;
  if (elapsedMs >= 1350) {
    const p = Math.min((elapsedMs - 1350) / 450, 1);
    scrimOpacity = Math.max(0, 1 - p);
  }

  return (
    <>
      {/* Background Portal Scrim (Clean parchment while logo is flying, then softly reveals dashboard) */}
      {scrimOpacity > 0 && (
        <div
          className="intro-scrim-layer"
          style={{
            position: 'fixed',
            inset: 0,
            background: '#fbf8f1',
            opacity: scrimOpacity,
            zIndex: 99990,
            pointerEvents: 'none'
          }}
        />
      )}

      {/* FLYING BRAND CREST (Animates smoothly and settles at the top of the app) */}
      {showBrandFlight && (
        <div className="flight-logo-crest" style={logoStyle}>
          <BrandLogo size={logoStart.size} />
        </div>
      )}

      {/* FLYING BRAND TITLE (Glides from vertical stack to horizontal beside logo at top) */}
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

      {/* HERO ATTENDANCE VISUALIZATION (Centered Digits, Progress Ring, Count-up) */}
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
          {/* Label strictly ABOVE the ring */}
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
            <svg
              width={ringSize}
              height={ringSize}
              viewBox={`0 0 ${ringSize} ${ringSize}`}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
              <circle
                className="attendance-ring-progress"
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                stroke="rgba(197, 160, 89, 0.22)"
                strokeWidth="4"
                fill="none"
              />

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

              <path
                className="heartbeat-wave-path"
                d="M 48 130 H 68 L 76 124 L 82 136 L 91 108 L 101 139 L 108 126 H 132"
                stroke="var(--accent-gold)"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                style={{
                  opacity: countProgress > 0 ? 0.95 : 0,
                  transition: 'opacity 0.3s ease'
                }}
              />
            </svg>

            {/* Mathematically Centered Percentage Digits */}
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
                className={`font-serif attendance-percentage-val${elapsedMs >= 1450 ? ' is-heartbeating' : ''}`}
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

          {/* Metadata strictly BELOW the ring */}
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
