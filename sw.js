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
 *
 * v3: jsPDF liegt nicht mehr auf cdnjs, sondern lokal unter js/vendor/ (siehe
 * index.html) und wird wie der Rest der App-Shell vorab gecacht — der
 * PDF-Export funktioniert dadurch jetzt auch komplett offline.
 * Zusätzlich: der Cache-Filter unten akzeptierte bisher nur response.type
 * === 'basic' (= gleiche Origin). Cross-Origin-Antworten mit CORS-Headern
 * (response.type === 'cors', z. B. von Google Fonts) fielen dadurch IMMER
 * durch den Filter und wurden nie gecacht, selbst wenn sie schon einmal
 * erfolgreich geladen wurden. Google Fonts läuft daher jetzt über eine
 * eigene Cache-first-Route (siehe FONT_HOSTS unten) statt über die generische
 * Network-first-Route der App-Shell.
 * v4: reiner Cache-Versionsbump, weil 01-storage.js/02-state-theme.js/
 * 07-home.js/10-plan-settings.js sich inhaltlich geändert haben (IndexedDB-
 * Speicher, Backup-Erinnerung) — dank Network-first für JS wäre das zwar auch
 * ohne Bump beim nächsten Online-Laden angekommen, ein Versionssprung stellt
 * aber sicher, dass auch rein offline installierte Instanzen beim nächsten
 * Update-Zyklus sauber alles neu holen, sobald wieder Netz da ist.
 * v6: Versionsbump für das "Aktualisieren"-Banner (index.html, 04-utils.js). Dieser
 * Wert MUSS bei jedem Deploy hochgezählt werden — der Browser erkennt einen neuen
 * Service Worker ausschliesslich an einer byteweisen Änderung von sw.js, und ohne
 * neuen Worker erscheint das Update-Banner in der App nie.
 * v5: 08-stats-progress.js, 09-start-select.js und 11-active-session.js waren
 * an der Größengrenze für vollständige Datei-Downloads und wurden je in drei
 * Teildateien gesplittet (08a/08b/08c, 09a/09b/09c, 11a/11b/11c) — inhaltlich
 * unverändert, nur andere Dateinamen/mehr Dateien in der Precache-Liste.
 */

const CACHE_NAME = 'trainingsplan-cache-v6';
const FONT_CACHE_NAME = 'trainingsplan-fonts-v1';

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
  './js/08a-stats-progress-charts.js',
  './js/08b-stats-muscle-balance.js',
  './js/08c-stats-progress-list.js',
  './js/09a-start-select.js',
  './js/09b-start-select-mode-settings.js',
  './js/09c-start-select-tiles.js',
  './js/10-plan-settings.js',
  './js/11a-active-session.js',
  './js/11b-active-session-render.js',
  './js/11c-active-session-rest.js',
  './js/12-session-summary.js',
  './js/13-session-detail-pdf.js',
  './js/14-app-init.js',
  './js/vendor/jspdf.umd.min.js',
  './assets/icons/favicon.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-512-maskable.png'
];

// Google Fonts: eigene Domains für das CSS (googleapis.com, liefert je nach
// User-Agent unterschiedliche @font-face-Regeln) und die eigentlichen
// Font-Dateien (gstatic.com). Beide senden korrekte CORS-Header, die
// Responses kommen also mit type "cors" an (nicht "opaque") und lassen sich
// wie normale Same-Origin-Antworten cachen.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// Dateitypen, die sich praktisch nie ändern (Icons/Bilder) — für die bleibt
// cache-first sinnvoll (maximale Geschwindigkeit + Offline).
const CACHE_FIRST_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico'];
function isCacheFirstAsset(url){
  return CACHE_FIRST_EXTENSIONS.some(ext => url.pathname.endsWith(ext));
}

// Eine Antwort gilt als cachefähig, wenn sie entweder von der eigenen Origin
// kommt (type "basic") oder von einer bekannten Cross-Origin-Quelle mit
// funktionierendem CORS (type "cors", z. B. Google Fonts). "opaque"
// (Cross-Origin ohne CORS) bleibt bewusst ausgeschlossen, da sich deren
// Status/Erfolg nicht prüfen lässt — ein Fehler würde sonst als "Erfolg"
// gecacht.
function isCacheableResponse(res){
  return !!res && res.status === 200 && (res.type === 'basic' || res.type === 'cors');
}

// Installation: App-Shell vorab cachen
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Aktivierung: alte Cache-Versionen aufräumen (App-Shell- UND Font-Cache)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== FONT_CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch:
// - Google Fonts (CSS + Dateien): Cache-first in eigenem, dauerhaftem Cache —
//   ändert sich praktisch nie, muss also nicht bei jedem Laden neu vom Netz
//   geholt werden, und bleibt so garantiert offline verfügbar.
// - Icons/Bilder: Cache-first (unverändert, für Geschwindigkeit + Offline).
// - Alles andere (HTML/CSS/JS): Network-first, damit ein neues Deploy sofort
//   sichtbar wird, sobald Netz da ist — nur ohne Netz greift der zuletzt
//   gecachte Stand (Offline-Fallback, inkl. index.html bei Navigationen).
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(FONT_CACHE_NAME).then((cache) =>
        cache.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return fetch(request).then((networkResponse) => {
            if (isCacheableResponse(networkResponse)) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => cachedResponse);
        })
      )
    );
    return;
  }

  if (isCacheFirstAsset(url)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (isCacheableResponse(networkResponse)) {
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
        if (isCacheableResponse(networkResponse)) {
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
