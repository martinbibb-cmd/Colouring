const CACHE = 'colouring-v3';
const BASE = new URL('./', self.registration.scope).pathname;
const ASSETS = ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest'].map((p) => BASE + p);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)));
});
