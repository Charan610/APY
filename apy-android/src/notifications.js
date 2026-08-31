import { api } from './api';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';

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
    await navigator.serviceWorker.ready;
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}

export async function unsubscribeFromPush() {
  if (isNative()) {
    try {
      await LocalNotifications.removeAllPendingNotifications();
    } catch (e) {}
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
      id: 'apy_attendance_reminders',
      name: 'Attendance Reminders',
      description: 'Daily alerts to log attendance and stay above 75%',
      importance: 5, // High / Max
      visibility: 1, // Public
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#D97706'
    });
  } catch (e) {
    console.warn('Channel creation notice:', e);
  }
}

export async function requestNotificationPermissionAndSubscribe(vapidPublicKey) {
  if (isNative()) {
    try {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') {
        throw new Error('Notification permission was not granted on your device. Please allow notifications in Android Settings for APY.');
      }
      await initNotificationChannel();

      // Also request push permissions for remote sync if available
      try {
        await PushNotifications.requestPermissions();
        await PushNotifications.register();
      } catch (pe) {
        console.warn('Push register notice:', pe);
      }

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

export async function scheduleNativeReminders(timesList = []) {
  if (!isNative()) return;
  try {
    await initNotificationChannel();
    
    // Cancel all previously scheduled APY alarms
    const pending = await LocalNotifications.getPending();
    if (pending?.notifications?.length) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map(n => ({ id: n.id }))
      });
    }

    if (!timesList || timesList.length === 0) return;

    const notificationsToSchedule = [];
    let idCounter = 100;

    for (const item of timesList) {
      const [hourStr, minStr] = item.time_of_day.split(':');
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minStr, 10);
      if (isNaN(hour) || isNaN(minute)) continue;

      idCounter += 1;
      const label = item.label || (hour < 12 ? 'Morning Check' : hour < 15 ? 'Midday Check' : 'End of Day');

      notificationsToSchedule.push({
        id: idCounter,
        title: `🎓 APY: ${label}`,
        body: `Time to mark your class periods! Tap to record attendance and protect your 75% target.`,
        channelId: 'apy_attendance_reminders',
        schedule: {
          on: {
            hour: hour,
            minute: minute
          },
          allowWhileIdle: true
        },
        sound: 'default',
        extra: {
          time: item.time_of_day,
          type: 'attendance_reminder'
        }
      });
    }

    if (notificationsToSchedule.length > 0) {
      await LocalNotifications.schedule({ notifications: notificationsToSchedule });
      console.log(`Scheduled ${notificationsToSchedule.length} native attendance reminder alarms on Android!`);
    }
  } catch (err) {
    console.error('Error scheduling native reminders:', err);
  }
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
            body: '🔔 Push & local notifications are working perfectly on your Android device!',
            channelId: 'apy_attendance_reminders',
            schedule: {
              at: new Date(Date.now() + 800), // Fire in 0.8 seconds
              allowWhileIdle: true
            },
            sound: 'default',
            actionTypeId: 'OPEN_APP'
          }
        ]
      });
      return { status: 'success', message: 'Test notification triggered on your phone!' };
    } catch (e) {
      throw new Error(`Android native notification failed: ${e.message}`);
    }
  }

  // Web Browser fallback
  return api.sendTestNotification();
}

export async function ensureActivePushSubscription(vapidPublicKey) {
  if (isNative()) {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') {
      throw new Error('Notification permission is disabled in Android settings for APY.');
    }
    await initNotificationChannel();
    return { endpoint: 'android-native', keys: {} };
  }

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
