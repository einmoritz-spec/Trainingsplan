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

window.addEventListener('error', (e) => { showFatalError(e.error || e.message); });
window.addEventListener('unhandledrejection', (e) => { showFatalError(e.reason); });

// Sobald die Seite wieder sichtbar wird (Tab in den Vordergrund geholt, Bildschirm
// entsperrt), den Pausen-Timer sofort neu auswerten statt auf den nächsten regulären
// 100ms-Tick zu warten — wichtig, weil setInterval() im Hintergrund gedrosselt/pausiert
// werden kann und die UI (Zeit-Anzeige, Ring) sonst kurzzeitig einen veralteten Stand zeigt.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && restState) tickRest();
});

wireAlternativeNumberInputs();
wireViewportAwareOverlays();

// Manifest-Shortcut "Training starten" (siehe manifest.json → shortcuts) landet über
// start_url "./?shortcut=start" hier. Nach dem normalen init() (das bei einer bereits
// aktiven Session ohnehin direkt zu "active" springt) zusätzlich zur Auswahlseite
// navigieren — aber nur, wenn init() nicht schon selbst eine aktive Session gerendert hat,
// sonst würde eine laufende Session durch den Shortcut überschrieben. Der Query-Parameter
// wird danach per replaceState aus der URL entfernt, damit ein simples Neuladen der Seite
// nicht erneut auf die Auswahlseite springt statt auf der zuletzt offenen Seite zu bleiben.
function handleStartShortcut(){
  const params = new URLSearchParams(location.search);
  if (params.get('shortcut') !== 'start') return;
  history.replaceState(history.state, '', location.pathname);
  if (!active) goStartSelect(true);
}

try{
  init().then(handleStartShortcut).catch(showFatalError);
}catch(err){
  showFatalError(err);
}
