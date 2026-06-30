// Self-destructing service worker.
// This replaces the old PWA service worker. When the browser
// fetches this file as an update, it will:
// 1. Skip waiting and take control immediately
// 2. Clear all caches
// 3. Unregister itself
// After this runs once, there will be no more service worker.

self.addEventListener('install', function() {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          return caches.delete(cacheName);
        })
      );
    }).then(function() {
      return self.registration.unregister();
    }).then(function() {
      return self.clients.matchAll();
    }).then(function(clients) {
      clients.forEach(function(client) {
        client.navigate(client.url);
      });
    })
  );
});
