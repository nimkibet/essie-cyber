const CACHE_NAME = 'essie-cyber-v28-multi';
const ASSETS = [
    '/',
    '/login.html',
    '/pos.html',
    '/inventory.html',
    '/customers.html',
    '/users.html',
    '/admin.html',
    '/analytics.html',
    '/js/login.js',
    '/js/pos.js',
    '/js/inventory.js',
    '/js/customers.js',
    '/js/users.js',
    '/js/admin.js',
    '/js/analytics.js',
    '/js/supabaseClient.js',
    '/js/uiHelper.js',
    '/manifest.json'
];

self.addEventListener('install', (e) => {
    self.skipWaiting(); // Force new service worker to take over immediately
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    // Delete old caches immediately
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    // Stale-while-revalidate strategy for UI files to prevent infinite caching bugs
    if (e.request.url.startsWith(self.location.origin)) {
        e.respondWith(
            caches.match(e.request).then(cachedResponse => {
                const fetchPromise = fetch(e.request).then(networkResponse => {
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(e.request, networkResponse.clone());
                    });
                    return networkResponse;
                });
                return cachedResponse || fetchPromise;
            })
        );
    }
});
