const CACHE = 'xpenseai-v3';
const CORE = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png', './styles.css', './helpers.js', './components.js', './app.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network-first for CDN scripts, cache-first for app files
  const isCDN = e.request.url.includes('unpkg.com') || e.request.url.includes('cloudflare');
  if (isCDN) {
    e.respondWith(
      fetch(e.request)
        .then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); return r; })
        .catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});
