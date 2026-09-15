const CACHE_NAME = 'essie-cyber-v39-multi';
const ASSETS = [
    '/',
    '/login.html',
    '/pos.html',
    '/inventory.html',
    '/customers.html',
    '/users.html',
    '/admin.html',
    '/analytics.html',
    '/settings.html',
    '/js/login.js',
    '/js/pos.js',
    '/js/inventory.js',
    '/js/customers.js',
    '/js/users.js',
    '/js/admin.js',
    '/js/analytics.js',
    '/js/settings.js',
    '/js/supabaseClient.js',
    '/js/uiHelper.js',
    '/manifest.json'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Never intercept Supabase API calls — they need real network
    if (url.hostname.includes('supabase.co')) return;

    // For same-origin requests: cache-first for assets, network-first for HTML
    if (url.origin === self.location.origin) {
        const isHtml = e.request.headers.get('Accept')?.includes('text/html');

        if (isHtml) {
            // Network first, fall back to cache
            e.respondWith(
                fetch(e.request)
                    .then(res => {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                        return res;
                    })
                    .catch(() => caches.match(e.request))
            );
        } else {
            // Cache first (JS, CSS, images) — update in background
            e.respondWith(
                caches.match(e.request).then(cached => {
                    const network = fetch(e.request).then(res => {
                        caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
                        return res;
                    });
                    return cached || network;
                })
            );
        }
    }
});
