function showFatalError(err){
  const msg = (err && err.message) ? err.message : String(err);
  const stack = (err && err.stack) ? err.stack : '';
  app.innerHTML = `
    <div class="brand"><h1>Etwas ist schiefgelaufen</h1></div>
    <div class="history-empty" style="text-align:left; white-space:pre-wrap; word-break:break-word;">
      Die App konnte nicht vollständig laden.

      Fehlermeldung:
      ${msg}

      ${stack ? '\n' + stack : ''}

      Tipp: Falls du die Datei über die Dateien-App geöffnet hast, stelle sicher,
      dass sie wirklich in Safari geöffnet wird (nicht nur als Vorschau) —
      antippen und halten, dann „Öffnen mit" → Safari wählen.
    </div>
  `;
}

/* ---------------------------------------------------
   Laufzeit-Fehler NACH dem Boot
   ---------------------------------------------------
   Vorher (Bug): window.onerror/onunhandledrejection riefen IMMER showFatalError() auf,
   die app.innerHTML komplett überschreibt. Das galt für die komplette Laufzeit der App,
   nicht nur für den Start — ein einzelner Fehler beim Chart-Rendern, im Pausen-Timer oder
   in einer abgelehnten saveJSON()-Promise hat dadurch mitten in einem laufenden Training
   den kompletten Bildschirm weggerissen (inkl. Mini-Player-Zustand), obwohl die App
   selbst meist noch funktionsfähig gewesen wäre.

   Jetzt: bootDone unterscheidet zwei Phasen.
     - VOR init(): ein Fehler bedeutet, dass die App gar nicht erst benutzbar ist —
       da bleibt der bisherige Vollbild-Fehlerbildschirm die richtige Reaktion, denn es
       gibt ohnehin keinen sinnvollen UI-Zustand, den man erhalten könnte.
     - NACH init(): app.innerHTML bleibt unangetastet. Der Fehler landet in der Konsole
       (fürs Debugging/QS) und der Nutzer bekommt einen kleinen, wegtippbaren Hinweis
       statt eines abgerissenen Trainings.
--------------------------------------------------- */
let bootDone = false;

function showRuntimeErrorToast(err){
  console.error('Laufzeitfehler (App läuft weiter):', err);
  let toast = document.getElementById('runtimeErrorToast');
  if (toast){ return; } // schon sichtbar — nicht mit jedem weiteren Fehler neu aufbauen
  toast = document.createElement('div');
  toast.id = 'runtimeErrorToast';
  toast.className = 'update-toast runtime-error-toast';
  toast.innerHTML = `
    <span class="update-toast-text">Kleiner Fehler ist aufgetreten — die App läuft weiter.</span>
    <button class="update-toast-btn" id="runtimeErrorToastClose" type="button" aria-label="Schließen">✕</button>
  `;
  document.body.appendChild(toast);
  const close = () => { toast.remove(); };
  document.getElementById('runtimeErrorToastClose').onclick = close;
  // Nach kurzer Zeit automatisch ausblenden, damit sich Hinweise bei mehreren
  // unabhängigen Fehlern nicht stapeln und der Nutzer nicht aktiv wegtippen muss.
  setTimeout(close, 6000);
}

function handleGlobalError(err){
  if (!bootDone){
    showFatalError(err);
  } else {
    showRuntimeErrorToast(err);
  }
}

window.addEventListener('error', (e) => { handleGlobalError(e.error || e.message); });
window.addEventListener('unhandledrejection', (e) => { handleGlobalError(e.reason); });

// Sobald die Seite wieder sichtbar wird (Tab in den Vordergrund geholt, Bildschirm
// entsperrt), den Pausen-Timer sofort neu auswerten statt auf den nächsten regulären
// 100ms-Tick zu warten — wichtig, weil setInterval() im Hintergrund gedrosselt/pausiert
// werden kann und die UI (Zeit-Anzeige, Ring) sonst kurzzeitig einen veralteten Stand zeigt.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && restState) tickRest();
  // Trainings-Benachrichtigung (siehe showActiveTrainingNotification() in 11a): stellt sicher,
  // dass eine Übung, die sich unmittelbar vor dem Sperren geändert hat, auch wirklich noch vor
  // dem Wechsel in den Hintergrund in der Benachrichtigung ankommt.
  if (typeof syncActiveTrainingNotification === 'function') syncActiveTrainingNotification(true);
});

// Tap auf die Trainings-Benachrichtigung: der Service Worker holt das bestehende Fenster in den
// Vordergrund und schickt diese Nachricht (siehe notificationclick in sw.js). Wir wechseln dann
// selbst in die Trainingsansicht — ein reines focus() würde nur den zuletzt offenen Bildschirm
// zeigen, nicht zwingend das laufende Training.
if ('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'open-active-training' && active){
      pushView('active');
      renderActive();
    }
  });
}

// Kaltstart über die Benachrichtigung (kein Fenster war mehr offen, siehe openWindow() in
// sw.js): Der Parameter ?resume=training signalisiert, direkt zur wiederhergestellten
// Trainingsansicht zu springen statt auf der Startseite zu landen. Läuft NACH init(), da die
// Session erst dort aus dem Speicher wiederhergestellt wird.
function handleResumeTrainingParam(){
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('resume') !== 'training' || !active) return;
    pushView('active');
    renderActive();
  } catch (e){ /* Parameter ist reiner Komfort — Fehler darf den Start nicht blockieren */ }
}

// Homescreen-Shortcuts (siehe "shortcuts" in manifest.json): langes Drücken auf das App-Icon
// zeigt Direkteinstiege, die die App mit ?shortcut=… starten. Läuft NACH init(), da plan/
// sessions/Essenstracker-Daten erst dort geladen werden.
//   - shortcut=training: startet direkt die laut Split-Rotation als Nächstes anstehende
//     Einheit (computeNextSplitStep(), 09a-start-select.js — z. B. Unterkörper A, wenn zuletzt
//     Oberkörper A trainiert wurde). Ist kein Split aktiv oder die Rotation noch nicht
//     bestimmbar (keine passende Einheit in der Historie), landet man auf der normalen
//     Trainingsauswahl statt willkürlich irgendetwas zu starten. Läuft bereits ein Training,
//     wird es NICHT überschrieben — dann geht es einfach in die laufende Einheit.
//   - shortcut=breakfast|lunch|dinner: direkt in den Essen-hinzufügen-Flow der jeweiligen
//     Mahlzeit für HEUTE (nicht für den zuletzt im Essenstracker offenen Tag).
async function handleShortcutParam(){
  try {
    const params = new URLSearchParams(location.search);
    const shortcut = params.get('shortcut');
    if (!shortcut) return;

    if (shortcut === 'training'){
      if (active){ pushView('active'); renderActive(); return; }
      const step = computeNextSplitStep();
      const list = step ? getModeExercises(step.mode, step.variant) : [];
      if (step && list.length){
        startSession(list, null, step.mode, step.variant);
      } else {
        goStartSelect(); // kein Split aktiv/eingerichtet — normale Auswahl zeigen
      }
      return;
    }

    const MEAL_SHORTCUTS = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner' };
    const meal = MEAL_SHORTCUTS[shortcut];
    if (meal){
      if (!isFoodTrackerEnabled()) return; // Feature aus — dann bleibt die Startseite stehen
      await initFoodTracker();
      ftCurrentDate = ftTodayISO(); // bewusst immer heute, unabhängig vom zuletzt offenen Tag
      goFtAddFood(meal);
    }
  } catch (e){ /* Shortcuts sind reiner Komfort — Fehler dürfen den Start nicht blockieren */ }
}

wireAlternativeNumberInputs();
wireViewportAwareOverlays();
try{
  // Das Import-Banner erst NACH init() einblenden: sein Button ruft goSettings() auf, was
  // ohne geladenen plan/sessions-State ins Leere liefe.
  init().then(() => {
    bootDone = true;
    showPostHardUpdateBanner();
    handleResumeTrainingParam();
    handleShortcutParam();
    // Falls beim Start noch eine Session aus dem Speicher wiederhergestellt wurde (App wurde
    // z. B. vom System beendet), die Benachrichtigung wieder aufbauen bzw. eine verwaiste von
    // einem bereits beendeten Training entfernen.
    if (typeof syncActiveTrainingNotification === 'function') syncActiveTrainingNotification(true);
  }).catch(showFatalError);
}catch(err){
  showFatalError(err);
}
