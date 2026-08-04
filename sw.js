/*
 * Service Worker für "Trainingsplan"
 * NEU – im Originalcode war kein Service Worker registriert.
 * Strategie: Cache-first für den App-Shell (HTML/CSS/JS/Icons), damit die App
 * nach dem ersten Laden auch offline startet. Alle Pfade sind relativ, damit
 * das auch unter einem GitHub-Pages-Projektpfad (https://user.github.io/repo/)
 * funktioniert.
 */

const CACHE_NAME = 'trainingsplan-cache-v1';

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

// Fetch: Cache-first, mit Netzwerk-Fallback und Nachcachen neuer Antworten.
// Bei Navigationsanfragen ohne Netzverbindung wird auf index.html zurückgefallen
// (Single-Page-App-Verhalten offline).
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return undefined;
        });
    })
  );
});
