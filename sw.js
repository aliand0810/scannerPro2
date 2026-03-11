// ═══════════════════════════════════════════
//  SCAN PRO — Service Worker v1.4
//  À placer dans le MÊME dossier que scanner-articles.html
// ═══════════════════════════════════════════

const CACHE_NAME   = 'scanpro-v1.4';
const CACHE_STATIC = 'scanpro-static-v1.4';

// Ressources à mettre en cache à l'installation
const PRECACHE = [
  './',
  './scanner-articles.html',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500&family=Barlow+Condensed:wght@300;400;600;700;900&display=swap',
];

// ── INSTALL ──────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting(); // Activation immédiate
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // On fait un best-effort : si une ressource échoue, ça n'empêche pas l'install
      return Promise.allSettled(
        PRECACHE.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Précache échoué:', url, err))
        )
      );
    })
  );
});

// ── ACTIVATE ─────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== CACHE_STATIC)
          .map(k => {
            console.log('[SW] Suppression ancien cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim()) // Prendre le contrôle immédiatement
  );
});

// ── FETCH ─────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = req.url;

  // On ne traite que les GET
  if (req.method !== 'GET') return;

  // ── Bypass complet pour Google APIs (OAuth, Drive) ──
  if (
    url.includes('accounts.google.com') ||
    url.includes('googleapis.com') ||
    url.includes('gsi/client') ||
    url.includes('oauth2') ||
    url.includes('token')
  ) return;

  // ── Network-first pour Open Food Facts (données fraîches) ──
  if (url.includes('openfoodfacts.org')) {
    event.respondWith(
      fetch(req)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
          return response;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // ── Network-first pour les CDN (libs JS/CSS) — mise en cache après ──
  if (
    url.includes('cdn.jsdelivr.net') ||
    url.includes('cdnjs.cloudflare.com') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      fetch(req)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_STATIC).then(c => c.put(req, clone));
          }
          return response;
        })
        .catch(() => caches.match(req)) // Fallback vers cache si hors-ligne
    );
    return;
  }

  // ── Cache-first pour l'app shell (le fichier HTML principal) ──
  event.respondWith(
    caches.match(req).then(cached => {
      // En parallèle, on tente de mettre à jour le cache
      const networkFetch = fetch(req)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
          return response;
        })
        .catch(() => cached); // Si réseau échoue, on garde le cache

      // Retourner le cache immédiatement, ou attendre le réseau
      return cached || networkFetch;
    })
  );
});

// ── MESSAGES ─────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data === 'getVersion') {
    event.source.postMessage({ type: 'version', cache: CACHE_NAME });
  }
  if (event.data === 'clearCache') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
