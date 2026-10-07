import React, { useState, useEffect, useRef } from 'react';
import BrandLogo from './BrandLogo';
import { ChevronRight } from 'lucide-react';

/**
 * Continuous Premium Launch Experience
 * Single source of truth driven by introStage from App.jsx:
 * 'logo-center' -> 'glide-to-header' -> 'attendance-large' -> 'attendance-shrink' -> 'complete'
 */
export default function AppLaunchExperience({
  user,
  summary,
  targetHeaderLogoRef,
  attendanceTargetRef,
  introStage = 'complete',
  onFinish
}) {
  const [logoFlyStyle, setLogoFlyStyle] = useState({});
  const [cardFlyStyle, setCardFlyStyle] = useState({});
  const [displayedPct, setDisplayedPct] = useState(0);
  const [showRingPhase, setShowRingPhase] = useState(false);
  const cardRef = useRef(null);

  // Real attendance values
  const overall = summary?.overall || { percentage: 0, attended: 0, total: 0 };
  const overallPct = overall.percentage || 0;
  const attendedCount = overall.attended || 0;
  const absentCount = Math.max(0, (overall.total || 0) - attendedCount);

  // 1. Flight to Header
  useEffect(() => {
    if (introStage === 'glide-to-header' && targetHeaderLogoRef?.current) {
      const targetRect = targetHeaderLogoRef.current.getBoundingClientRect();
      const startX = window.innerWidth / 2;
      const startY = window.innerHeight / 2 - 25;
      const targetCenterX = targetRect.left + (targetRect.width / 2);
      const targetCenterY = targetRect.top + (targetRect.height / 2);

      const deltaX = targetCenterX - startX;
      const deltaY = targetCenterY - startY;
      const scale = Math.max(0.48, Math.min(0.65, targetRect.width / 68));

      setLogoFlyStyle({
        transform: `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px)) scale(${scale})`,
        transition: 'transform 0.75s cubic-bezier(0.22, 1, 0.36, 1)'
      });
    }
  }, [introStage, targetHeaderLogoRef]);

  // 2. Flight / Shrink to Today Attendance Widget
  useEffect(() => {
    if (introStage === 'attendance-shrink' && attendanceTargetRef?.current && cardRef?.current) {
      const targetRect = attendanceTargetRef.current.getBoundingClientRect();
      const cardRect = cardRef.current.getBoundingClientRect();

      const deltaX = (targetRect.left + targetRect.width / 2) - (cardRect.left + cardRect.width / 2);
      const deltaY = (targetRect.top + targetRect.height / 2) - (cardRect.top + cardRect.height / 2);
      const scale = Math.max(0.25, Math.min(0.45, targetRect.height / cardRect.height));

      setCardFlyStyle({
        transform: `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px)) scale(${scale})`,
        opacity: 0,
        transition: 'transform 0.75s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.75s ease'
      });
    }
  }, [introStage, attendanceTargetRef]);

  // 3. Smooth counter during attendance-large
  useEffect(() => {
    if (introStage !== 'attendance-large') {
      if (introStage === 'complete' || introStage === 'attendance-shrink') {
        setDisplayedPct(overallPct);
      }
      return;
    }

    let start = null;
    const duration = 1100;
    let frameId;

    const animateCount = (timestamp) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayedPct(overallPct * eased);

      if (progress < 1) {
        frameId = requestAnimationFrame(animateCount);
      } else {
        setDisplayedPct(overallPct);
      }
    };

    frameId = requestAnimationFrame(animateCount);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [introStage, overallPct]);

  // Sequential reveal: wave draws first (0-750ms), then smoothly morphs to circular ring
  useEffect(() => {
    if (introStage === 'attendance-large') {
      setShowRingPhase(false);
      const timer = setTimeout(() => {
        setShowRingPhase(true);
      }, 750);
      return () => clearTimeout(timer);
    } else if (introStage === 'attendance-shrink' || introStage === 'complete') {
      setShowRingPhase(true);
    }
  }, [introStage]);

  if (introStage === 'complete') return null;

  const largeRadius = 66;
  const largeCircumference = 2 * Math.PI * largeRadius;
  const ringOffset = largeCircumference - (largeCircumference * Math.min(100, Math.max(0, displayedPct))) / 100;

  return (
    <div className={`continuous-intro-portal ${introStage === 'attendance-large' || introStage === 'attendance-shrink' ? 'portal-soft' : introStage === 'glide-to-header' ? 'portal-revealing' : ''}`}>
      {/* 1. Flying Logo & Title (Scenes 1 & 2) */}
      {(introStage === 'logo-center' || introStage === 'glide-to-header') && (
        <div
          className="flying-brand-cluster"
          style={introStage === 'glide-to-header' ? logoFlyStyle : {}}
        >
          <div className="flying-logo-icon">
            <BrandLogo size={68} />
          </div>
          <div className="flying-logo-title font-serif">
            <span style={{ color: '#c5a059' }}>ATT</span> <span style={{ color: 'var(--brand-forest)' }}>PER Y</span>
          </div>
        </div>
      )}

      {/* 2. Centered Attendance Hero Card (Scenes 3 & 4) */}
      {(introStage === 'attendance-large' || introStage === 'attendance-shrink') && (
        <div
          ref={cardRef}
          className="flying-attendance-card"
          style={introStage === 'attendance-shrink' ? cardFlyStyle : {}}
        >
          <div className="intro-card-header">
            <span className="intro-card-label">Attendance 75%</span>
            <ChevronRight size={16} className="intro-card-chevron" />
          </div>

          <div className="intro-card-visual-area">
            {/* SVG Background: Flowing Wave (Phase 1) THEN Circular Ring (Phase 2) */}
            <svg className="intro-card-svg" viewBox="0 0 280 180" fill="none">
              <defs>
                <linearGradient id="intro-ring-grad" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0%" stopColor="#c5a059" />
                  <stop offset="65%" stopColor="#255d44" />
                  <stop offset="100%" stopColor="#163b2b" />
                </linearGradient>
              </defs>

              {/* Golden elegant flowing wave line: draws in Phase 1, fades cleanly out in Phase 2 */}
              <path
                className="intro-pulse-trace"
                d="M 25 132 C 60 110, 95 152, 130 132 C 150 120, 175 144, 200 132 C 225 120, 245 142, 260 132"
                stroke="#c5a059"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  opacity: showRingPhase ? 0 : 1,
                  transition: 'opacity 0.35s ease'
                }}
              />

              {/* Progress ring wrapping around the percentage: reveals in Phase 2 */}
              <circle
                className="intro-ring-circle"
                cx="140"
                cy="88"
                r={largeRadius}
                stroke="url(#intro-ring-grad)"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={largeCircumference}
                strokeDashoffset={ringOffset}
                transform="rotate(-90 140 88)"
                style={{
                  opacity: showRingPhase ? 1 : 0,
                  transition: 'opacity 0.4s ease, stroke-dashoffset 0.85s cubic-bezier(0.22, 1, 0.36, 1)'
                }}
              />
            </svg>

            {/* Centered Numbers & Real Counts */}
            <div className="intro-card-numbers">
              <div className="intro-big-pct font-serif">
                {displayedPct.toFixed(1)}%
              </div>
              <div 
                className="intro-counts-sub"
                style={{
                  opacity: showRingPhase ? 1 : 0,
                  transform: showRingPhase ? 'translateY(0)' : 'translateY(6px)',
                  transition: 'opacity 0.4s ease, transform 0.4s ease'
                }}
              >
                {attendedCount} Present · {absentCount} Absent
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
