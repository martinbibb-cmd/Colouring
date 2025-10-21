const CACHE = 'colouring-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './art/colouring_page_1.svg',
  './art/colouring_page_2.svg',
  './art/colouring_page_3.svg'
];

const CACHE_BUSTED_ASSETS = ASSETS.map((url) => new Request(url, { cache: 'reload' }));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CACHE_BUSTED_ASSETS)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});