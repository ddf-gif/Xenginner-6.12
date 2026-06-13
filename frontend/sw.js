// Service worker — auto-updating, cache-while-revalidate
const CACHE = 'lens-v2';

self.addEventListener('install', (e) => {
    self.skipWaiting(); // activate immediately
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll([
            '/', '/css/style.css', '/js/ui.js', '/js/app.js',
            '/js/audio-capture.js', '/js/audio-playback.js',
            '/js/video-capture.js', '/js/ws-client.js',
        ])).catch(() => {})
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => clients.claim())
    );
});

// Network-first, fallback to cache
self.addEventListener('fetch', (e) => {
    e.respondWith(
        fetch(e.request)
            .then(res => {
                // Update cache with fresh response
                const clone = res.clone();
                caches.open(CACHE).then(c => c.put(e.request, clone));
                return res;
            })
            .catch(() => caches.match(e.request))
    );
});
