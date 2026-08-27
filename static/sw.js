// Minimal service worker - required for the app to qualify as an
// installable PWA (which Bubblewrap then wraps into an Android APK).
// Not doing heavy offline caching here since this app is real-time
// and needs a live connection anyway.

self.addEventListener("install", (event) => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
    // Pass-through: always fetch from network, no offline caching.
    event.respondWith(fetch(event.request));
});
