import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      setShowRestored(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setShowRestored(true);
      const timer = setTimeout(() => setShowRestored(false), 3000);
      return () => clearTimeout(timer);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!isOffline && !showRestored) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.45rem',
        padding: '0.45rem 1rem',
        fontSize: '0.78rem',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        letterSpacing: '0.02em',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        background: isOffline ? 'rgba(239, 68, 68, 0.92)' : 'rgba(16, 185, 129, 0.92)',
        color: '#ffffff',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)'
      }}
    >
      {isOffline ? (
        <>
          <WifiOff size={14} />
          <span>You are currently offline. Viewing cached attendance data.</span>
        </>
      ) : (
        <>
          <Wifi size={14} />
          <span>Internet connection restored. Live sync active.</span>
        </>
      )}
    </div>
  );
}
