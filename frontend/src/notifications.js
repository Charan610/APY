import { api } from './api';

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
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Web Push / Service Worker not supported in this browser.');
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

export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function requestNotificationPermissionAndSubscribe(vapidPublicKey) {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported by your current browser.');
  }

  // 1. Resolve VAPID key if not provided
  let keyToUse = vapidPublicKey;
  if (!keyToUse) {
    const config = await api.getNotificationConfig();
    keyToUse = config?.vapid_public_key;
  }

  if (!keyToUse || typeof keyToUse !== 'string' || keyToUse.length < 20) {
    throw new Error('Server VAPID public key could not be retrieved. Please check connection and try again.');
  }

  // 2. Request browser notification permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied' ? 'Notification permission was denied in browser settings. Please allow notifications for this site.' : 'Notification permission was not granted.');
  }

  // 3. Register / retrieve service worker registration
  const registration = await registerServiceWorker();
  if (!registration) {
    throw new Error('Could not initialize service worker for push notifications.');
  }

  // 4. Subscribe to push manager with VAPID key
  const convertedKey = urlBase64ToUint8Array(keyToUse);
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey
    });
  }

  const subJson = subscription.toJSON();
  return {
    endpoint: subJson.endpoint,
    keys: {
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth
    }
  };
}

export async function unsubscribeFromPush() {
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
