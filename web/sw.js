const CACHE_NAME = 'lumen-dmx-web-v3';
const ASSETS = ['./', './index.html', './styles.css', './editor.css', './app.js', './dmx.js', './profiles.js', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil((async () => { for (const name of await caches.keys()) if (name.startsWith('lumen-dmx-web-') && name !== CACHE_NAME) await caches.delete(name); await self.clients.claim(); })()));
self.addEventListener('fetch', event => { if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return; event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request))); });
self.addEventListener('message', event => { if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting(); });
