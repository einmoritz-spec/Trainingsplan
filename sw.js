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
 * v11: Icon-Dateien bereinigt (icon-192.png, icon-512.png, icon-512-maskable.png) — die
 * gestrichelten Führungslinien, die versehentlich mit ins finale PNG exportiert wurden (sichtbar
 * z. B. in icon-512-maskable.png), sind entfernt. icon-512-maskable.png ist jetzt außerdem
 * echt randlos (voller Bleed bis zum Rand, keine abgerundeten Ecken mehr eingebacken — das ist
 * für "purpose: maskable" Pflicht, siehe manifest.json), icon-192.png/icon-512.png haben jetzt
 * echte Transparenz an den abgerundeten Ecken statt der vorherigen festen weißen Füllung.
 * Da sich die Bilddaten unter gleichem Dateinamen geändert haben, MUSS CACHE_NAME hier
 * hochgezählt werden — sonst bliebe der Service Worker für immer bei den alten, fehlerhaften
 * Icon-Bytes (Cache-Storage vergleicht keine Inhalte, nur ob der Precache-Schritt bereits lief).
 * v10: install() cacht die App-Shell jetzt fehlertolerant (Promise.allSettled statt
 * cache.addAll()) — vorher hätte eine einzelne fehlende/falsch benannte Datei (z. B. beim
 * Hochladen vergessen) die KOMPLETTE Installation des neuen Service Workers zum Scheitern
 * gebracht: kein Update-Banner, keine Fehlermeldung, der Nutzer sieht einfach weiterhin den
 * alten (oder im schlimmsten Fall gar keinen funktionierenden) Stand. Jetzt wird jede Datei
 * einzeln geholt; eine einzelne fehlgeschlagene Datei verhindert nicht mehr, dass der Rest
 * der App-Shell gecacht wird und das Update ankommt.
 * v9: Übungsbilder liegen nicht mehr als Base64 inline in js/data/app-data.js, sondern als
 * eigene WebP-Dateien unter assets/exercises/ (js/vendor/jspdf.umd.min.js bleibt ebenfalls
 * im Precache, wird in index.html aber nur noch bei Bedarf per <script> nachgeladen statt bei
 * jedem Start geparst, siehe ensureJsPdfLoaded() in 04-utils.js) — app-data.js schrumpft
 * dadurch von ~690 KB auf ~130 KB, was den allerersten Parse/Boot spürbar beschleunigt. Die
 * neuen Bild-Dateien werden unten in der Precache-Liste geführt, damit sie wie bisher auch
 * offline verfügbar sind (zusätzlich ohnehin cache-first dank .webp in
 * CACHE_FIRST_EXTENSIONS).
 * v8: Versionsbump (Wochen-Bucket-Fix Monatsbericht/-übersicht: 05-calendar.js).
 * v7: Versionsbump (Zurück-Stack-Fix beim Farbwähler: 09a/09b/10).
 * v6: Versionsbump für das "Aktualisieren"-Banner (index.html, 04-utils.js). Dieser
 * Wert MUSS bei jedem Deploy hochgezählt werden — der Browser erkennt einen neuen
 * Service Worker ausschliesslich an einer byteweisen Änderung von sw.js, und ohne
 * neuen Worker erscheint das Update-Banner in der App nie.
 * v5: 08-stats-progress.js, 09-start-select.js und 11-active-session.js waren
 * an der Größengrenze für vollständige Datei-Downloads und wurden je in drei
 * Teildateien gesplittet (08a/08b/08c, 09a/09b/09c, 11a/11b/11c) — inhaltlich
 * unverändert, nur andere Dateinamen/mehr Dateien in der Precache-Liste.
 */

const CACHE_NAME = 'trainingsplan-cache-v15';
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
  './assets/icons/icon-512-maskable.png',
  './assets/exercises/e1.webp',
  './assets/exercises/e2.webp',
  './assets/exercises/e3.webp',
  './assets/exercises/e4.webp',
  './assets/exercises/e5.webp',
  './assets/exercises/e6.webp',
  './assets/exercises/e7.webp',
  './assets/exercises/e8.webp',
  './assets/exercises/e9.webp',
  './assets/exercises/e10.webp',
  './assets/exercises/e11.webp',
  './assets/exercises/e12.webp',
  './assets/exercises/e13.webp',
  './assets/exercises/e14.webp',
  './assets/exercises/e15.webp',
  './assets/exercises/e16.webp',
  './assets/exercises/e17.webp',
  './assets/exercises/e18.webp',
  './assets/exercises/e19.webp',
  './assets/exercises/e20.webp',
  './assets/exercises/e21.webp',
  './assets/exercises/e26.webp',
  './assets/exercises/e28.webp',
  './assets/exercises/e30.webp',
  './assets/exercises/e35.webp',
  './assets/exercises/e38.webp',
  './assets/exercises/e41.webp',
  './assets/exercises/e45.webp',
  './assets/exercises/e47.webp',
  './assets/exercises/e52.webp',
  './assets/exercises/e53.webp',
  './assets/exercises/e54.webp',
  './assets/exercises/e60.webp',
  './assets/exercises/e61.webp',
  './assets/exercises/e62.webp',
  './assets/exercises/e66.webp',
  './assets/exercises/e69.webp',
  './assets/exercises/e71.webp',
  './assets/exercises/e72.webp',
  './assets/exercises/e73.webp',
  './assets/exercises/e76.webp',
  './assets/exercises/e77.webp',
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

// Installation: App-Shell vorab cachen.
// BEWUSST NICHT cache.addAll() (atomar: EIN 404 wirft die komplette Installation weg, der
// neue Service Worker landet dann als "redundant" — kein Update-Banner, keine Fehlermeldung,
// einfach stille Nichtinstallation). Stattdessen wird jede Datei einzeln geholt; eine
// einzelne fehlende/fehlerhafte Datei (z. B. ein vergessenes Bild beim Hochladen) verhindert
// nicht mehr, dass der Rest der App-Shell gecacht wird und das Update trotzdem ankommt.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('Precache fehlgeschlagen, wird übersprungen:', url, err);
          })
        )
      ))
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
