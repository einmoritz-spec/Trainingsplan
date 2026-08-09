/* ---------------------------------------------------
   Utils
--------------------------------------------------- */
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
// UI-Abhängigkeit, damit runHardUpdate() ihn direkt aufrufen kann.
function exportAllDataToFile(filePrefix){
  const nowISO = new Date().toISOString();
  const payload = { version: 1, exportedAt: nowISO, plan, sessions, lastPerformance };
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
    try{ exportAllDataToFile('trainingsplan-backup-vor-update'); }catch(e){ /* Download blockiert: Update trotzdem durchziehen, Daten bleiben ja unangetastet */ }
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
