import { App as CapacitorApp } from '@capacitor/app';
import { isNative, reconcileNativeReminders } from './notifications';

// Return cleanup synchronously, including when listener registration resolves later.
export function startNativeReminderLifecycle() {
  if (!isNative()) return () => {};
  let stopped = false;
  let listener;
  const reconcile = () => {
    if (!stopped) reconcileNativeReminders().catch(error => console.warn('Native reminder reconciliation:', error.message));
  };
  reconcile();
  CapacitorApp.addListener('appStateChange', ({ isActive }) => { if (isActive) reconcile(); })
    .then(handle => { if (stopped) handle.remove(); else listener = handle; })
    .catch(error => console.warn('Native reminder lifecycle:', error.message));
  return () => { stopped = true; listener?.remove(); };
}
