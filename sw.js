const CACHE = 'colouring-v2';
const BASE = new URL('./', self.registration.scope).pathname; // e.g. /Colouring/
const ASSETS = [
  'index.html','styles.css','app.js','manifest.webmanifest',
  'art/colouring_page_1.svg','art/colouring_page_2.svg','art/colouring_page_3.svg'
].map(p => BASE + p);

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
});
self.addEventListener('fetch', e=>{
  e.respondWith(caches.match(e.request).then(r=>r || fetch(e.request)));
});
