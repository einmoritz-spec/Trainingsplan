/* ---------------------------------------------------
   Utils
--------------------------------------------------- */
// Diagnose-Stempel: wird unten in den Einstellungen angezeigt (renderSettings()) und macht
// sichtbar, welche Code-Version wirklich läuft. Bei einer PWA bedient der Service Worker
// (sw.js, Cache-First) nach einem Update oft noch mehrere Starts lang die ALTE Fassung —
// ohne diesen Stempel ist "der Fix wirkt nicht" nicht von "der Fix ist nie angekommen" zu
// unterscheiden. Bei jeder Änderung zusammen mit CACHE_NAME in sw.js erhöhen.
const BUILD_STAMP = '31';
// Berechnet das tatsächlich bewegte Gewicht für einen Satz unter Berücksichtigung
// von unterstützten Übungen (z. B. Klimmzugmaschine: Körpergewicht - eingestelltes Gewicht)
// und reinen Eigenkörpergewicht-Übungen (z. B. Liegestütze: Körpergewicht + evtl. Zusatzgewicht).
// planEx: das Übungsobjekt aus plan.exercises (kann undefined sein), setWeight: eingetragenes Gewicht am Gerät.
// bodyWeightFactor (optional, Default 1): Bei Übungen wie Situps/Rückenstrecker wird nicht das
// GANZE Körpergewicht bewegt, sondern nur ein Teil davon (im Wesentlichen der Rumpf — Kopf, Arme
// und Oberkörper, nicht die Beine). Biomechanische Schätzungen für den bewegten Rumpfanteil bei
// solchen Übungen liegen meist bei ca. 40–65 % des Körpergewichts; 0,5 ist als grobe, aber
// deutlich realistischere Näherung hinterlegt als 100 %. Ein eingetragenes Zusatzgewicht (z. B.
// eine Hantelscheibe auf der Brust) zählt davon unabhängig immer voll, da es tatsächlich komplett
// mitbewegt wird.
function effectiveSetWeight(planEx, setWeight){
  const w = setWeight ?? 0;
  if (!planEx) return w;
  const bw = plan && plan.bodyWeight;
  if (planEx.assisted && bw){
    return Math.max(0, bw - w);
  }
  if (planEx.bodyweightExercise && bw){
    const factor = planEx.bodyWeightFactor != null ? planEx.bodyWeightFactor : 1;
    return (bw * factor) + w;
  }
  return w;
}

// Zahlen-Eingabefelder, die Kommazahlen im deutschen Format (78,5 statt 78.5) annehmen
// sollen: Komma vor dem Parsen in einen Punkt umwandeln, und beim Anzeigen eines
// gespeicherten Werts umgekehrt einen Punkt durch ein Komma ersetzen.
function parseGermanNumber(str){
  if (str === null || str === undefined) return NaN;
  return Number(String(str).replace(',', '.'));
}
function formatGermanNumber(num){
  if (num === null || num === undefined || isNaN(num)) return '';
  return String(num).replace('.', ',');
}
function fmtDuration(sec){
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  const pad = n => String(n).padStart(2,'0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }) +
         ' · ' + d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

// Trägt einen neuen Körpergewichts-Wert sowohl als aktuellen Stand (plan.bodyWeight, wie
// bisher — bleibt für effectiveSetWeight()/Steckscheiben-Limit unverändert maßgeblich) als
// auch im Verlauf (plan.bodyWeightLog) ein. Pro Kalendertag wird nur EIN Eintrag geführt: ein
// zweites Eintragen am selben Tag überschreibt den bereits vorhandenen Eintrag dieses Tages
// statt einen weiteren Punkt anzuhängen — mehrere Punkte am selben Tag würden im Verlaufs-
// Chart (renderBodyWeightChart(), 08-stats-progress.js) nur als bedeutungsloses Auf-und-Ab
// erscheinen, ohne einen echten zeitlichen Verlauf abzubilden. Ruft NICHT selbst saveJSON()
// auf — das übernehmen die Aufrufer wie bisher (öffnet ihnen z. B. den Weg, mehrere
// Plan-Änderungen in einem Rutsch zu speichern).
function logBodyWeight(weight, dateISO){
  if (!plan) return;
  plan.bodyWeight = weight;
  if (!Array.isArray(plan.bodyWeightLog)) plan.bodyWeightLog = [];
  const iso = dateISO || new Date().toISOString();
  const dayKey = iso.slice(0, 10);
  const existingIdx = plan.bodyWeightLog.findIndex(e => e.date.slice(0, 10) === dayKey);
  if (existingIdx >= 0) plan.bodyWeightLog[existingIdx] = { date: iso, weight };
  else plan.bodyWeightLog.push({ date: iso, weight });
  plan.bodyWeightLog.sort((a, b) => new Date(a.date) - new Date(b.date));
}

/* ---------------------------------------------------
   Übungsbilder für den PDF-Export: WebP-Datei → Base64-Daten-URI
   ---------------------------------------------------
   Seit der Umstellung von app-data.js auf externe WebP-Dateien (siehe assets/exercises/,
   Task "Bilder als eigene Dateien statt Base64") ist planEx.imageData für die
   Standard-Übungsbibliothek KEIN Data-URI mehr, sondern ein relativer Pfad
  (z. B. "assets/exercises/e1.webp") — funktioniert unverändert direkt als <img src="...">,
   ABER jsPDF.addImage() (siehe buildFullSummaryPdfBlob(), 12-session-summary.js) kann nur
   mit Binärdaten/Base64 umgehen, nicht mit einer URL. Individuelle, vom Nutzer selbst
   hochgeladene Übungsbilder (siehe downscaleImageFile(), 10-plan-settings.js) bleiben davon
   unberührt weiterhin waschechte Data-URIs und brauchen hier gar nichts.

   preloadPdfImageDataUrls() holt VOR dem eigentlichen PDF-Aufbau alle betroffenen
   Bild-Dateien einmalig per fetch() (läuft dank Service-Worker-Cache auch offline) und
   wandelt sie in Base64 um; das Ergebnis wird pro Pfad gecacht, ein PDF-Export braucht
   also nur beim allerersten Mal pro Bild einen echten Netzwerk-/Cache-Zugriff.
   resolvePdfImageSrc()/pdfImageFormatFor() lesen synchron aus diesem Cache — die
   eigentliche PDF-Aufbaulogik in 12-session-summary.js bleibt dadurch unverändert synchron,
   nur die Aufrufer holen VORHER per await den Cache befüllt.
--------------------------------------------------- */
const pdfImageDataUrlCache = new Map();
async function preloadPdfImageDataUrls(exerciseIds){
  const targets = Array.from(new Set(exerciseIds || []))
    .map(id => plan.exercises.find(x => x.id === id))
    .filter(ex => ex && typeof ex.imageData === 'string' && ex.imageData.length &&
      !ex.imageData.startsWith('data:') && !pdfImageDataUrlCache.has(ex.imageData));
  await Promise.all(targets.map(async (ex) => {
    try{
      const res = await fetch(ex.imageData);
      if (!res.ok) return;
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      pdfImageDataUrlCache.set(ex.imageData, dataUrl);
    }catch(err){ /* Bild bleibt im PDF einfach weg, siehe resolvePdfImageSrc() */ }
  }));
}
// Liefert den fürs PDF nutzbaren Bild-String: Data-URI bleibt Data-URI (eigene Bilder),
// ein Pfad wird gegen den oben befüllten Cache aufgelöst — ohne Treffer (Bild noch nicht
// geladen/Fehler) liefert die Funktion null, der Aufrufer überspringt das Bild dann wie
// bisher bei jedem ungültigen imageData.
function resolvePdfImageSrc(src){
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  return pdfImageDataUrlCache.get(src) || null;
}
// jsPDF braucht das Bildformat explizit (kein verlässliches Auto-Erkennen bei allen
// Formaten) — aus dem Mime-Typ des Data-URI-Präfixes abgeleitet, damit sowohl die alten
// JPEG-Bilder (individuelle Uploads) als auch die neuen WebP-Standardbilder funktionieren.
function pdfImageFormatFor(dataUrl){
  const m = /^data:image\/(\w+);/.exec(dataUrl || '');
  const type = m ? m[1].toUpperCase() : 'JPEG';
  return type === 'JPG' ? 'JPEG' : type;
}

/* ---------------------------------------------------
   RPE (Rate of Perceived Exertion) — optionale Erfassung pro Satz
   ---------------------------------------------------
   Standardmäßig AUS (siehe rpeEnabled()): eine zusätzliche Eingabe pro Satz ist ein Mehraufwand,
   den nicht jeder will. plan.rpeEnabled wird nur über den Schalter in den Einstellungen gesetzt
   (renderSettings(), 10-plan-settings.js). Ist er aus, tauchen weder die RPE-Eingabefelder in
   der aktiven Einheit auf (siehe 11b-active-session-render.js), noch fließt RPE in die
   Performancemodus-Vorschläge ein (siehe checkPerformanceSuggestion(), 11a-active-session.js) —
   das Verhalten ist dann exakt wie vorher.
--------------------------------------------------- */
function rpeEnabled(){
  return !!(plan && plan.rpeEnabled === true);
}
// Vernünftiger RPE-Wertebereich für Krafttraining (6 = noch 4+ Wdh. Reserve, 10 = Muskelversagen).
// 0.5er-Schritte, da das die gängige Auflösung in Trainings-Apps ist.
const RPE_MIN = 6;
const RPE_MAX = 10;
const RPE_STEP = 0.5;
// Ab diesem Wert gilt ein Satz als "hart" — wird von checkPerformanceSuggestion() genutzt, um
// bei bereits hoher Anstrengung KEINE weitere Steigerung vorzuschlagen (siehe dort).
const RPE_HIGH_THRESHOLD = 9;
// Neutralwert (Mitte des RPE_MIN–RPE_MAX-Bereichs): wird verwendet, um Übungen OHNE
// eingetragenen RPE-Wert bei der Priorisierung im Performancemodus-Kontingent (siehe
// computePerfSuggestionQuota(), 11a-active-session.js) weder zu bevorzugen noch zu
// benachteiligen — sie landen weder vorne (wie ein niedriger RPE-Wert) noch hinten (wie ein
// hoher), sondern schlicht in der Mitte der nach RPE sortierten Rangfolge.
const RPE_NEUTRAL = (RPE_MIN + RPE_MAX) / 2;
function fmtRpe(rpe){
  if (rpe === null || rpe === undefined || isNaN(rpe)) return '';
  return Number.isInteger(rpe) ? String(rpe) : rpe.toFixed(1);
}

/* ---------------------------------------------------
   jsPDF: Lazy-Load statt statischem <script>-Tag
   ---------------------------------------------------
   Vorher: js/vendor/jspdf.umd.min.js wurde über ein <script defer> in index.html bei JEDEM
   App-Start geparst (mehrere hundert KB), obwohl es nur beim PDF-Export gebraucht wird —
   ein Feature, das die meisten Sessions nie benutzen. Das kostet reine Boot-Zeit.

   Jetzt: die Datei bleibt Teil der APP_SHELL in sw.js (Offline-Export funktioniert also
   weiterhin ohne Netz), wird aber erst beim ERSTEN tatsächlichen Export-Klick per
   dynamischem <script>-Tag nachgeladen. Der Browser bedient das dank Service-Worker-Cache
   praktisch instant aus dem Cache Storage, nur der Parse-/Ausführungs-Zeitpunkt verschiebt
   sich vom Boot auf den Bedarfsfall.

   Alle Aufrufer (buildFullSummaryPdfBlob() etc. in 12-session-summary.js) prüfen ohnehin
   bereits defensiv auf window.jspdf/window.jspdf.jsPDF — ensureJsPdfLoaded() muss davor also
   nur EINMAL awaited werden, der Rest der bestehenden Logik bleibt unverändert.
--------------------------------------------------- */
let jsPdfLoadPromise = null;
function ensureJsPdfLoaded(){
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(true);
  if (jsPdfLoadPromise) return jsPdfLoadPromise;
  jsPdfLoadPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[data-lazy="jspdf"]');
    if (existing){
      existing.addEventListener('load', () => resolve(!!(window.jspdf && window.jspdf.jsPDF)));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'js/vendor/jspdf.umd.min.js';
    script.dataset.lazy = 'jspdf';
    script.onload = () => resolve(!!(window.jspdf && window.jspdf.jsPDF));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
  return jsPdfLoadPromise;
}

/* ---------------------------------------------------
   Validierung importierter Backup-Dateien
   ---------------------------------------------------
   Vorher (Bug): der Import in renderSettings() (10-plan-settings.js) prüfte nur, ob
   data.plan existiert und data.plan.exercises ein Array ist — alles andere (sessions,
   lastPerformance, einzelne Übungs-/Session-Einträge) wurde ungeprüft übernommen. Eine
   fremde, unvollständige oder manuell verbastelte JSON-Datei landete dadurch direkt in
   IndexedDB, und der nächste App-Start konnte in showFatalError() enden (siehe
   14-app-init.js), weil z. B. renderStatsChart() oder computeMuscleGroupSetCounts() von
   Feldern ausgehen, die schlicht fehlten.

   validateFullExportPayload() prüft die Grobstruktur STRENG (bei Fehlern hier wird der
   komplette Import abgelehnt, da sonst nichts Sinnvolles mit den Daten anfangen lässt),
   filtert aber auf Ebene einzelner Einträge NUR die kaputten heraus (statt den ganzen
   Import zu verwerfen) — im gleichen Sinn wie die bestehende Storage-Kaskade in
   01-storage.js, die bei einem einzelnen fehlerhaften Key ebenfalls nicht die komplette
   restliche Migration abbricht.
--------------------------------------------------- */
function validateFullExportPayload(data){
  const errors = [];
  if (!data || typeof data !== 'object'){
    return { valid: false, errors: ['Die Datei enthält kein gültiges JSON-Objekt.'] };
  }
  if (!data.plan || typeof data.plan !== 'object'){
    errors.push('Es fehlt ein "plan"-Objekt.');
  } else if (!Array.isArray(data.plan.exercises)){
    errors.push('"plan.exercises" ist kein Array.');
  }
  if (errors.length) return { valid: false, errors };

  // Einzelne Übungen ohne id/name sind für die App unbrauchbar (id ist der Fremdschlüssel
  // aus jedem geloggten Satz) — diese werden stillschweigend aussortiert statt den kompletten
  // Import zu verwerfen, ein einzelner Ausreißer in einer sonst gültigen Datei soll nicht das
  // ganze Backup unbrauchbar machen.
  const cleanedExercises = data.plan.exercises.filter(ex =>
    ex && typeof ex === 'object' && typeof ex.id === 'string' && ex.id.length &&
    typeof ex.name === 'string' && ex.name.length
  );
  const droppedExercises = data.plan.exercises.length - cleanedExercises.length;

  let cleanedSessions = [];
  let droppedSessions = 0;
  if (data.sessions !== undefined){
    if (!Array.isArray(data.sessions)){
      errors.push('"sessions" ist vorhanden, aber kein Array.');
    } else {
      cleanedSessions = data.sessions.filter(s =>
        s && typeof s === 'object' && typeof s.id === 'string' && s.id.length &&
        typeof s.date === 'string' && !isNaN(new Date(s.date).getTime()) &&
        Array.isArray(s.entries)
      );
      droppedSessions = data.sessions.length - cleanedSessions.length;
    }
  }
  if (errors.length) return { valid: false, errors };

  let cleanedLastPerformance = {};
  if (data.lastPerformance !== undefined){
    if (typeof data.lastPerformance !== 'object' || data.lastPerformance === null || Array.isArray(data.lastPerformance)){
      errors.push('"lastPerformance" ist vorhanden, aber kein Objekt.');
    } else {
      cleanedLastPerformance = data.lastPerformance;
    }
  }
  if (errors.length) return { valid: false, errors };

  // Essenstracker-Daten (siehe ftBuildExportPayload(), 15-food-tracker.js) sind ein optionales
  // Zusatzfeld im gemeinsamen Backup — ältere Export-Dateien (vor der Zusammenlegung) und reine
  // Trainings-Exports haben es schlicht nicht, das ist kein Fehler. Hier bewusst NICHT tief
  // validiert (kein eigenes Schema je Essenstracker-Unterfeld) — ftApplyImportedData() fängt
  // fehlende/falsche Unterfelder beim Anwenden selbst mit "|| Standardwert" ab, genau wie
  // beim eigenständigen Essenstracker-Import (ftImportData()).
  let cleanedFood = null;
  if (data.food !== undefined){
    if (typeof data.food !== 'object' || data.food === null || Array.isArray(data.food)){
      errors.push('"food" ist vorhanden, aber kein Objekt.');
    } else {
      cleanedFood = data.food;
    }
  }
  if (errors.length) return { valid: false, errors };

  return {
    valid: true,
    errors: [],
    droppedExercises,
    droppedSessions,
    cleaned: {
      plan: { ...data.plan, exercises: cleanedExercises },
      sessions: cleanedSessions,
      lastPerformance: cleanedLastPerformance,
      food: cleanedFood
    }
  };
}

/* ---------------------------------------------------
   Hard-Update ("Aktualisieren"-Banner)
   ---------------------------------------------------
   Zweck: ein neues Deploy übernehmen, OHNE dass der Nutzer in den Chrome-
   Einstellungen manuell "Website-Daten löschen" muss (was nebenbei auch
   IndexedDB = alle Trainingsdaten mitlöschen würde).

   Ablauf von runHardUpdate():
     1. Backup: kompletter Datenexport wird automatisch als JSON heruntergeladen,
        BEVOR irgendetwas angefasst wird. Reine Sicherheitsnetz-Maßnahme.
     2. Service Worker abmelden (alle Registrierungen dieser Origin).
     3. Cache Storage komplett leeren (App-Shell- UND Font-Cache).
     4. HTTP-Cache des Browsers umgehen: jede App-Shell-Datei einmal mit
        {cache:'reload'} nachladen. Das ist der entscheidende Schritt — ein
        location.reload() allein würde JS/CSS je nach Cache-Control-Header von
        GitHub Pages (max-age) weiterhin aus dem Browser-Cache bedienen, obwohl
        der Service Worker längst weg ist.
     5. Neu laden. Beim Neustart registriert index.html den SW frisch, der zieht
        die App-Shell erneut vom Netz.

   Bewusst NICHT gelöscht: IndexedDB/localStorage (Trainingsdaten). Ein Reset
   wäre für ein Code-Update funktionslos; wer trotzdem auf den exportierten
   Stand zurück will, nutzt den Import-Button im Banner nach dem Neustart, der
   die Daten ohnehin komplett überschreibt.
--------------------------------------------------- */

// Marker überlebt den Reload bewusst in localStorage: Cache Storage ist zu diesem
// Zeitpunkt gelöscht, und die IndexedDB-Kaskade aus 01-storage.js ist asynchron und
// beim frühen Banner-Check noch nicht zwingend bereit.
const HARD_UPDATE_MARKER = 'eisenprotokoll:hardUpdatePending';

// Vollständiger Datenexport als Download. Inhaltlich identisch zum "Exportieren"-Button
// in den Einstellungen (siehe renderSettings(), 10-plan-settings.js), hier aber ohne
// UI-Abhängigkeit, damit runHardUpdate() ihn direkt aufrufen kann. Async, da die
// Essenstracker-Daten (siehe ftBuildExportPayload(), 15-food-tracker.js) ggf. erst per
// initFoodTracker() geladen werden müssen, falls der Essenstracker in dieser Sitzung noch
// nicht geöffnet wurde — initFoodTracker() ist idempotent, kostet bei bereits geladenen
// Daten also nichts.
async function exportAllDataToFile(filePrefix){
  await initFoodTracker();
  const nowISO = new Date().toISOString();
  const payload = { version: 1, exportedAt: nowISO, plan, sessions, lastPerformance, food: ftBuildExportPayload() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filePrefix || 'trainingsplan-export'}-${nowISO.slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return nowISO;
}

// Liste der eigenen App-Shell-Dateien, direkt aus dem DOM abgeleitet statt als zweite,
// pflegebedürftige Kopie der APP_SHELL-Liste aus sw.js. Cross-Origin-Ressourcen (Google
// Fonts) bleiben außen vor — die ändern sich nicht und ein {cache:'reload'} darauf würde
// bei fehlgeschlagenem CORS nur unnötig Fehler produzieren.
function appShellUrlsFromDocument(){
  const urls = ['./', 'index.html', 'manifest.json'];
  document.querySelectorAll('script[src]').forEach(el => {
    const src = el.getAttribute('src');
    if (src && !/^https?:/i.test(src)) urls.push(src);
  });
  document.querySelectorAll('link[rel="stylesheet"]').forEach(el => {
    const href = el.getAttribute('href');
    if (href && !/^https?:/i.test(href)) urls.push(href);
  });
  return Array.from(new Set(urls));
}

async function runHardUpdate(){
  const btn = document.getElementById('updateToastBtn');
  if (btn){ btn.disabled = true; btn.textContent = 'Lädt…'; }
  try{
    try{ await exportAllDataToFile('trainingsplan-backup-vor-update'); }catch(e){ /* Download blockiert: Update trotzdem durchziehen, Daten bleiben ja unangetastet */ }
    try{ localStorage.setItem(HARD_UPDATE_MARKER, '1'); }catch(e){ /* Banner nach dem Neustart entfällt dann, Update selbst läuft normal */ }

    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister().catch(() => {})));
    }
    if (window.caches && caches.keys){
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
    }
    await Promise.all(appShellUrlsFromDocument().map(u =>
      fetch(u, { cache: 'reload' }).catch(() => {})
    ));
  }catch(e){
    // Auch bei einem Fehler in einem der Schritte neu laden: schlimmstenfalls landet der
    // Nutzer auf dem alten Stand und kann es erneut versuchen, statt auf einem toten Banner
    // sitzen zu bleiben.
  }
  location.reload();
}

// Nach dem Neustart: kurzes Banner mit direktem Weg zum Import der eben gesicherten Datei.
// Wird einmalig gezeigt (Marker wird sofort entfernt) und nutzt dieselbe Import-Logik wie die
// Einstellungen — der Button springt dorthin und öffnet direkt den Dateiwähler, analog zur
// Backup-Erinnerung auf der Startseite (siehe renderHome(), 07-home.js).
function showPostHardUpdateBanner(){
  let pending = null;
  try{ pending = localStorage.getItem(HARD_UPDATE_MARKER); }catch(e){ return; }
  if (pending !== '1') return;
  try{ localStorage.removeItem(HARD_UPDATE_MARKER); }catch(e){ /* egal, Banner erscheint dann einmal zu viel */ }

  const toast = document.getElementById('restoreToast');
  const importBtn = document.getElementById('restoreToastBtn');
  const closeBtn = document.getElementById('restoreToastClose');
  if (!toast || !importBtn || !closeBtn) return;

  toast.style.display = 'flex';
  importBtn.onclick = () => {
    toast.style.display = 'none';
    goSettings();
    const file = document.getElementById('importFile');
    if (file) file.click();
  };
  closeBtn.onclick = () => { toast.style.display = 'none'; };
}
