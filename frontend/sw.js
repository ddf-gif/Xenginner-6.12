// Basic service worker — caches app shell for offline/PWA
const CACHE = 'lens-v1';
const ASSETS = [
    '/',
    '/css/style.css',
    '/js/ui.js',
    '/js/app.js',
    '/js/audio-capture.js',
    '/js/audio-playback.js',
    '/js/video-capture.js',
    '/js/ws-client.js',
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(r => r || fetch(e.request)).catch(() => caches.match('/'))
    );
});
