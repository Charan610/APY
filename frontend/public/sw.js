// Service Worker for Attendance Register Daily Reminder Push Notifications & App-Shell Caching
const CACHE_NAME = 'apy-static-v1.4.2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and API calls
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/auth') || url.hostname.includes('api.github.com')) {
    return;
  }

  // Network-first with cache fallback for HTML navigation so updates are never trapped
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match('/index.html')))
    );
    return;
  }

  // Stale-While-Revalidate for static assets
  if (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.svg') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
            }
            return networkResponse;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {
    title: "Attendance Tracker ⏰",
    body: "Did you attend your classes today? Tap to record your attendance.",
    url: "/?tab=today",
    tag: "attendance-reminder"
  };

  if (event.data) {
    try {
      const json = event.data.json();
      data = { ...data, ...json };
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: data.tag || 'attendance-reminder',
    renotify: true,
    requireInteraction: false,
    data: {
      url: data.url || '/?tab=today'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/?tab=today';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
