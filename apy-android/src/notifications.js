import { api, getStoredUser, getAuthToken } from './api';
import { createReminderController, REMINDER_CHANNEL, UPDATE_CHANNEL, ownsReminder } from './nativeReminders';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export function isNative() {
  return Capacitor.isNativePlatform();
}

export function urlBase64ToUint8Array(base64String) {
  if (!base64String || typeof base64String !== 'string') {
    throw new Error('VAPID public key must be a valid base64 string.');
  }
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker() {
  if (isNative()) return null;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    if (registration) {
      registration.update();
    }
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}

export async function unsubscribeFromPush() {
  if (isNative()) {
    await clearNativeReminders();
    return 'android-native';
  }
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      return endpoint;
    }
  } catch (e) {
    console.error('Error unsubscribing:', e);
  }
  return null;
}

export function isPushSupported() {
  if (isNative()) return true;
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getNotificationPermission() {
  if (isNative()) {
    try {
      const status = await LocalNotifications.checkPermissions();
      return status.display === 'granted' ? 'granted' : status.display === 'denied' ? 'denied' : 'default';
    } catch (e) {
      return 'default';
    }
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function initNotificationChannel() {
  if (!isNative()) return;
  try {
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL,
      name: 'Attendance Reminders',
      description: 'Daily alerts to log attendance and stay above 75%',
      importance: 5, // High / Max
      visibility: 1, // Public
      sound: 'apy_reminder.wav',
      vibration: true,
      lights: true,
      lightColor: '#D97706'
    });
    await LocalNotifications.createChannel({
      id: UPDATE_CHANNEL,
      name: 'App Updates',
      description: 'Alerts when a new version of the APY APK is available to install',
      importance: 5, // High / Max
      visibility: 1, // Public
      sound: 'apy_reminder.wav',
      vibration: true,
      lights: true,
      lightColor: '#2563EB'
    });
  } catch (e) {
    // Android 23–25 has per-notification sound, without channel APIs.
    if (e.code === 'UNAVAILABLE') return;
    throw new Error(`Could not initialize notification channels: ${e.message}`);
  }
}

export async function pushNativeUpdateNotification(updateInfo) {
  if (!isNative() || !updateInfo) return;
  try {
    const version = updateInfo.latestVersion || updateInfo.tag?.replace(/^v/i, '') || 'New';
    const apkUrl = updateInfo.apkUrl;

    // Guard: only fire notification once per new version
    const lastNotified = localStorage.getItem('apy_last_notified_version');
    if (lastNotified === version) return;

    await initNotificationChannel();

    await LocalNotifications.schedule({
      notifications: [
        {
          id: 9901,
          title: `🚀 APY Update Available (v${version})`,
          body: `A new version of APY is ready to install! Tap here to download and update now.`,
          channelId: UPDATE_CHANNEL,
          schedule: { at: new Date(Date.now() + 800) },
          sound: 'apy_reminder.wav',
          actionTypeId: 'OPEN_UPDATE',
          extra: {
            type: 'apk_update',
            version: version,
            url: apkUrl
          }
        }
      ]
    });

    localStorage.setItem('apy_last_notified_version', version);
    console.log(`[Push Notification] Fired native APK update notification for v${version}`);
  } catch (err) {
    console.warn('Failed to schedule native update notification:', err);
  }
}


export async function requestNotificationPermissionAndSubscribe(vapidPublicKey) {
  if (isNative()) {
    const reminderSession = captureNativeReminderSession();
    try {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') {
        throw new Error('Notification permission was not granted on your device. Please allow notifications in Android Settings for APY.');
      }
      await initNotificationChannel();
      assertNativeReminderSession(reminderSession);
      // Local alarms need no remote push registration. Keep compatibility with
      // the existing backend, which requires real browser subscription keys.
      return { endpoint: 'android-native', keys: {} };
    } catch (err) {
      throw err;
    }
  }

  // Web Browser Flow
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported by your current browser.');
  }

  let keyToUse = vapidPublicKey;
  if (!keyToUse) {
    const config = await api.getNotificationConfig();
    keyToUse = config?.vapid_public_key;
  }

  if (!keyToUse || typeof keyToUse !== 'string' || keyToUse.length < 20) {
    throw new Error('Server VAPID public key could not be retrieved. Please check connection and try again.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied' ? 'Notification permission was denied in browser settings.' : 'Notification permission was not granted.');
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    const convertedKey = urlBase64ToUint8Array(keyToUse);

    try {
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) await existingSub.unsubscribe();
    } catch (e) {}

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey
    });

    const subJson = subscription.toJSON();
    return {
      endpoint: subJson.endpoint,
      keys: {
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth
      }
    };
  } catch (e) {
    throw new Error('Could not initialize service worker for push notifications.');
  }
}

let reminderDiagnostic = { message: 'Device schedule has not been checked yet.' };
const notifyDiagnostic = diagnostic => {
  reminderDiagnostic = diagnostic;
  window.dispatchEvent(new CustomEvent('apy_native_reminder_status'));
};
const reminderController = createReminderController({
  plugin: LocalNotifications,
  initChannels: async () => {
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') throw new Error('Notifications are blocked in Android settings.');
    await initNotificationChannel();
  },
  storage: {
    getItem: key => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value)
  },
  fetchConfig: () => api.getNotificationConfig(),
  isSessionCurrent: ticket => {
    const current = captureNativeReminderSession();
    return current?.account === ticket.account && current?.token === ticket.session;
  }
});
export function captureNativeReminderSession() {
  if (!isNative()) return null;
  const user = getStoredUser();
  const account = user?.id ?? user?.register_number;
  return { account: account == null ? null : String(account), token: getAuthToken() };
}
export function assertNativeReminderSession(expected) {
  if (!isNative()) return;
  const current = captureNativeReminderSession();
  if (current.account !== expected?.account || current.token !== expected?.token) {
    throw new Error('Reminder session changed; please retry.');
  }
}
function syncReminderSession() {
  const session = captureNativeReminderSession();
  reminderController.setSession(session?.account ?? null, session?.token ?? null);
  return session;
}
async function reportNativeOperation(operation) {
  try {
    const result = await operation();
    if (result) notifyDiagnostic({ message: `${result.scheduled} daily reminder(s) scheduled on this device.`, scheduled: result.scheduled });
    return result;
  } catch (error) {
    notifyDiagnostic({ message: error.message, error: true });
    throw error;
  }
}
export async function scheduleNativeReminders(timesList = [], expectedSession = captureNativeReminderSession()) {
  if (!isNative()) return;
  const session = syncReminderSession();
  if (session.account !== expectedSession?.account || session.token !== expectedSession?.token) {
    throw new Error('Reminder session changed; please retry.');
  }
  return reportNativeOperation(() => reminderController.save({ enabled: timesList.length > 0, active_times: timesList }));
}
export async function reconcileNativeReminders() {
  if (!isNative()) return;
  syncReminderSession();
  return reportNativeOperation(() => reminderController.reconcile());
}
export async function clearNativeReminders() {
  if (!isNative()) return;
  // Invalidate immediately, before any queued device operation can finish.
  reminderController.setSession(null, null);
  return reportNativeOperation(async () => { await reminderController.clear(); return { scheduled: 0 }; });
}
export async function getNativeNotificationDiagnostics() {
  if (!isNative()) return null;
  const [permission, exact, channels, pending] = await Promise.all([
    LocalNotifications.checkPermissions(), LocalNotifications.checkExactNotificationSetting(),
    LocalNotifications.listChannels().catch(error => {
      if (error.code === 'UNAVAILABLE') return { channels: [] };
      throw error;
    }), LocalNotifications.getPending()
  ]);
  const channel = channels.channels.find(c => c.id === REMINDER_CHANNEL);
  return { ...reminderDiagnostic, display: permission.display, exact: exact.exact_alarm,
    channelBlocked: channel?.importance === 0, channelSound: channel?.sound,
    pending: pending.notifications.filter(ownsReminder).length };
}
export async function openNativeExactAlarmSettings() {
  if (!isNative()) return;
  // Only called by an explicit settings button; launch/resume never prompts.
  await LocalNotifications.changeExactNotificationSetting();
  await reconcileNativeReminders();
  return getNativeNotificationDiagnostics();
}

export async function sendNativeTestNotification() {
  if (isNative()) {
    try {
      await initNotificationChannel();
      const testId = Math.floor(Math.random() * 90000) + 1000;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: testId,
            title: '🎓 APY Test Notification',
            body: 'APY local test notification. Daily reminders are checked separately.',
            channelId: REMINDER_CHANNEL,
            schedule: {
              at: new Date(Date.now() + 800), // Fire in 0.8 seconds
              allowWhileIdle: true
            },
            sound: 'apy_reminder.wav',
            actionTypeId: 'OPEN_APP'
          }
        ]
      });
      return { status: 'success', message: 'Local test scheduled. This does not verify daily reminders while your phone sleeps.' };
    } catch (e) {
      throw new Error(`Android native notification failed: ${e.message}`);
    }
  }

  // Web Browser fallback
  return api.sendTestNotification();
}

export async function ensureActivePushSubscription(vapidPublicKey) {
  if (isNative()) return requestNotificationPermissionAndSubscribe();

  // Web Browser
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported by your current browser.');
  }

  const permission = Notification.permission;
  if (permission === 'denied') {
    throw new Error('Notifications are blocked in your browser settings.');
  }

  let keyToUse = vapidPublicKey;
  if (!keyToUse) {
    const config = await api.getNotificationConfig();
    keyToUse = config?.vapid_public_key;
  }

  if (permission !== 'granted') {
    const reqPerm = await Notification.requestPermission();
    if (reqPerm !== 'granted') throw new Error('Notification permission was not granted.');
  }

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const convertedKey = urlBase64ToUint8Array(keyToUse);
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey
    });
  }

  const subJson = subscription.toJSON();
  const subData = {
    endpoint: subJson.endpoint,
    keys: {
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth
    }
  };

  await api.savePushSubscription(subData);
  return subData;
}
