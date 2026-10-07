import React, { useRef, useState, useEffect } from 'react';
import { CalendarCheck, LayoutDashboard, Calendar, Sparkles, ShieldCheck } from 'lucide-react';

export default function LiquidNavbar({ activeTab, onSelectTab, isAdmin, onOpenAdmin }) {
  const containerRef = useRef(null);
  const [bubbleStyle, setBubbleStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const tabRefs = useRef({});

  const navItems = [
    { id: 'today', label: 'Today', icon: CalendarCheck },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'timetable', label: 'Timetable', icon: Calendar },
    { id: 'forecast', label: 'Forecast', icon: Sparkles },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: ShieldCheck, isAdminAction: true }] : [])
  ];

  const updateBubblePosition = () => {
    const activeEl = tabRefs.current[activeTab];
    const container = containerRef.current;
    if (activeEl && container) {
      const containerRect = container.getBoundingClientRect();
      const elRect = activeEl.getBoundingClientRect();
      const left = elRect.left - containerRect.left;
      const width = elRect.width;
      setBubbleStyle({
        left: `${left}px`,
        width: `${width}px`,
        opacity: 1
      });
    }
  };

  useEffect(() => {
    updateBubblePosition();
    window.addEventListener('resize', updateBubblePosition);
    return () => window.removeEventListener('resize', updateBubblePosition);
  }, [activeTab, isAdmin]);

  return (
    <nav className="liquid-nav-container" aria-label="Main Navigation">
      <div className="liquid-nav-track" ref={containerRef}>
        {/* Floating Liquid Glass Bubble Pill */}
        <div
          className="liquid-nav-bubble"
          style={{
            transform: `translateX(${bubbleStyle.left})`,
            width: bubbleStyle.width,
            opacity: bubbleStyle.opacity,
            left: 0
          }}
        />

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              ref={(el) => { tabRefs.current[item.id] = el; }}
              type="button"
              className={`liquid-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => {
                if (item.isAdminAction && onOpenAdmin) {
                  onOpenAdmin();
                } else {
                  onSelectTab(item.id);
                }
              }}
              title={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={19} strokeWidth={isActive ? 2.5 : 2} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
