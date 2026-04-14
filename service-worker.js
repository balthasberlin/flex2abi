/**
 * Flex2Abi – Service Worker
 * Cacht statische Dateien für schnellen Start und Offline-Grundfunktionalität.
 * Strategie: Network-First für API-Calls, Cache-First für statische Assets.
 */

const CACHE_NAME = 'flex2abi-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './login.html',
    './style.css',
    './config.js',
    './audio-engine.js',
    './ai-service.js',
    './storage-service.js',
    './ui-renderer.js',
    './ui-actions.js',
    './app.js',
    './icons/icon-512.png',
    './manifest.json'
];

// Install: Statische Dateien cachen
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: Alte Caches aufräumen
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => 
            Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch: Network-First für API-Calls, Cache-First für statische Assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API-Calls (Supabase, Gemini, Groq) → immer Netzwerk
    if (url.hostname !== location.hostname) {
        event.respondWith(
            fetch(event.request).catch(() => {
                // Offline-Fallback für APIs: nichts cachen
                return new Response(JSON.stringify({ error: 'Offline – keine Verbindung.' }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 503
                });
            })
        );
        return;
    }

    // Statische Dateien → Cache-First, dann Netzwerk
    event.respondWith(
        caches.match(event.request).then(cached => {
            const networkFetch = fetch(event.request).then(response => {
                // Erfolgreiche Antwort im Cache aktualisieren
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => cached); // Offline → aus Cache

            return cached || networkFetch;
        })
    );
});
