/*
 * Service Worker für "Trainingsplan"
 * Strategie: Network-first für den App-Shell (HTML/CSS/JS), damit Updates nach
 * einem Deploy sofort ankommen, sobald Netz verfügbar ist. Fällt nur bei
 * fehlendem Netz auf den zuletzt gecachten Stand zurück (Offline-Fähigkeit
 * bleibt erhalten). Icons/Bilder bleiben cache-first, da sie sich praktisch
 * nie ändern und so weiterhin blitzschnell laden.
 * Alle Pfade sind relativ, damit das auch unter einem GitHub-Pages-Projektpfad
 * (https://user.github.io/repo/) funktioniert.
 *
 * WICHTIG: CACHE_NAME bei jeder inhaltlichen Änderung an sw.js selbst
 * hochzählen (v2, v3, ...) — nur dann erkennt der Browser ein Update dieser
 * Datei und installiert den neuen Service Worker (der dann automatisch alle
 * App-Shell-Dateien frisch vom Netz holt). Für Änderungen an styles.css/js/*
 * ist das dank der Network-first-Strategie unten NICHT mehr nötig.
 */

const CACHE_NAME = 'trainingsplan-cache-v2';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/data/app-data.js',
  './js/01-storage.js',
  './js/02-state-theme.js',
  './js/03-input-widgets.js',
  './js/04-utils.js',
  './js/05-calendar.js',
  './js/06-navigation.js',
  './js/07-home.js',
  './js/08-stats-progress.js',
  './js/09-start-select.js',
  './js/10-plan-settings.js',
  './js/11-active-session.js',
  './js/12-session-summary.js',
  './js/13-session-detail-pdf.js',
  './js/14-app-init.js',
  './assets/icons/favicon.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

// Dateitypen, die sich praktisch nie ändern (Icons/Bilder) — für die bleibt
// cache-first sinnvoll (maximale Geschwindigkeit + Offline).
const CACHE_FIRST_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico'];
function isCacheFirstAsset(url){
  return CACHE_FIRST_EXTENSIONS.some(ext => url.pathname.endsWith(ext));
}

// Installation: App-Shell vorab cachen
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Aktivierung: alte Cache-Versionen aufräumen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch:
// - Icons/Bilder: Cache-first (unverändert, für Geschwindigkeit + Offline).
// - Alles andere (HTML/CSS/JS): Network-first, damit ein neues Deploy sofort
//   sichtbar wird, sobald Netz da ist — nur ohne Netz greift der zuletzt
//   gecachte Stand (Offline-Fallback, inkl. index.html bei Navigationen).
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isCacheFirstAsset(url)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (request.mode === 'navigate') return caches.match('./index.html');
          return undefined;
        });
      })
  );
});
