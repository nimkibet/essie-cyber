const CACHE_NAME = 'essie-cyber-v41-multi';
const SHELL_ASSETS = [
    '/login.html',
    '/pos.html',
    '/inventory.html',
    '/customers.html',
    '/users.html',
    '/admin.html',
    '/analytics.html',
    '/settings.html',
    '/offline.html',
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
        caches.open(CACHE_NAME).then(cache => {
            // Use allSettled so one 404 doesn't kill the whole cache
            return Promise.allSettled(
                SHELL_ASSETS.map(url =>
                    cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err.message))
                )
            );
        })
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Never intercept Supabase — let those fail naturally offline
    if (url.hostname.includes('supabase.co')) return;

    // Only handle same-origin
    if (url.origin !== self.location.origin) return;

    const isNavigation = e.request.mode === 'navigate';

    e.respondWith(
        caches.match(e.request).then(cached => {
            // Network fetch with background cache update
            const networkFetch = fetch(e.request).then(res => {
                if (res.ok) {
                    caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
                }
                return res;
            });

            if (isNavigation) {
                // For page navigations: try network first, fall back to cache, then offline page
                return networkFetch.catch(() =>
                    cached || caches.match('/offline.html')
                );
            } else {
                // For assets (JS/CSS): serve cached immediately if available, update in background
                return cached || networkFetch.catch(() => new Response('', { status: 408 }));
            }
        })
    );
});
