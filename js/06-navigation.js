/* ---------------------------------------------------
   NAVIGATION (Android-/Browser-Zurück-Taste)
--------------------------------------------------- */
function pushView(view, params){
  resetAllAccordions();
  history.pushState({ view, params: params || {} }, '', '');
  updateMiniPlayer();
}
function replaceView(view, params){
  history.replaceState({ view, params: params || {} }, '', '');
  updateMiniPlayer();
}

// Dauerhaftes Mini-Banner (#miniPlayer, siehe CSS/Markup): sichtbar, sobald ein Training
// läuft (active gesetzt) UND man sich NICHT auf der aktiven Trainingsseite selbst befindet.
// Wird nach jeder Navigation (pushView/replaceView, s.o.) sowie jede Sekunde vom laufenden
// Timer (updateTimerDisplay) aktualisiert, damit Zeit/Übungsname im Banner immer aktuell
// sind, auch während man sich anderswo in der App bewegt (Übungen bearbeiten, Einstellungen
// ändern etc.) — die eigentliche Trainings-Session (active/timerHandle) läuft davon völlig
// unabhängig einfach im Hintergrund weiter.
let miniPlayerWired = false;
function wireMiniPlayerOnce(){
  if (miniPlayerWired) return;
  miniPlayerWired = true;
  const arrowEl = document.getElementById('miniPlayerArrow');
  if (arrowEl) arrowEl.innerHTML = `<img src="${ICON_CHEVRON_RIGHT}" alt="">`;
  const openBtn = document.getElementById('miniPlayerOpenBtn');
  if (openBtn) openBtn.onclick = () => {
    if (!active) return;
    pushView('active');
    renderActive();
  };
  const cancelBtn = document.getElementById('miniPlayerCancelBtn');
  if (cancelBtn) cancelBtn.onclick = () => cancelActiveSession();
}
function updateMiniPlayer(){
  const el = document.getElementById('miniPlayer');
  if (!el) return;
  wireMiniPlayerOnce();
  const currentView = (history.state && history.state.view) || 'home';
  if (!active || currentView === 'active'){
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';
  const now = active.pausedAt || Date.now();
  const sec = Math.floor((now - active.startedAt)/1000);
  const timeEl = document.getElementById('miniPlayerTime');
  if (timeEl) timeEl.textContent = fmtDuration(sec);
  const entry = active.entries[active.currentIndex];
  const exEl = document.getElementById('miniPlayerExercise');
  if (exEl) exEl.textContent = entry ? entry.name : '';
}

// Bricht das laufende Training komplett ab (nicht "beenden"/speichern, sondern verwerfen) —
// nach Bestätigung erreichbar sowohl über das rote X im Mini-Banner (siehe oben) als auch
// früher über die Zurück-Taste; seit Einführung des Mini-Banners verlässt die Zurück-Taste
// das Training nur noch, ohne es abzubrechen (siehe popstate-Handler), daher ist dies jetzt
// der einzige Weg, eine Einheit wirklich zu verwerfen. Gleiches Undo-Toast-Muster wie überall
// sonst in der App (z. B. Satz entfernen).
function cancelActiveSession(){
  if (!active) return;
  if (!confirm('Training wirklich abbrechen? Die Einheit wird nicht in deinem Verlauf gespeichert.')) return;
  clearInterval(timerHandle);
  clearInterval(restInterval);
  restState = null;
  const discarded = active;
  const wasOnActiveView = (history.state && history.state.view) === 'active';
  active = null;
  releaseTrainingWakeLock();
  persistActiveSession();
  if (wasOnActiveView){
    replaceView('home');
    renderHome();
  } else {
    updateMiniPlayer();
  }
  showUndoToast('Training verworfen.', () => {
    active = discarded;
    requestTrainingWakeLock();
    persistActiveSession();
    timerHandle = setInterval(updateTimerDisplay, 1000);
    updateMiniPlayer();
  });
}
function goHome(push){
  if (push !== false) pushView('home');
  renderHome();
}
function goPlan(push){
  if (push !== false) pushView('plan');
  renderPlanEditor();
}
function goSettings(push){
  if (push !== false) pushView('settings');
  renderSettings();
}
function goProgressList(push){
  if (push !== false) pushView('progressList');
  renderProgressList();
}
function goMuscleBalance(push){
  if (push !== false) pushView('muscleBalance');
  renderMuscleBalance();
}
function goIntensityStats(push){
  if (push !== false) pushView('intensityStats');
  renderIntensityStats();
}
function goKcalStats(push){
  if (push !== false) pushView('kcalStats');
  renderKcalStats();
}
function goProgressDetail(name, push){
  if (push !== false) pushView('progressDetail', { name });
  renderExerciseProgress(name);
}
function goSessionDetail(id, push){
  if (push !== false) pushView('sessionDetail', { id });
  renderSessionDetail(id);
}
function goStartSelect(push){
  if (push !== false) pushView('startSelect');
  renderStartSelect();
}
function goFreeSelect(push){
  if (push !== false) pushView('freeSelect');
  renderFreeSelect();
}
function goModeEdit(mode, push, startTab){
  if (push !== false) pushView('modeEdit', { mode, startTab });
  renderModeEdit(mode, startTab);
}
function goStatsChart(metric, push){
  if (push !== false) pushView('statsChart', { metric });
  renderStatsChart(metric);
}
// Fehlte bisher komplett: renderBodyWeightChart() (08a-stats-progress-charts.js) war schon
// lange fertig implementiert, aber ohne diese Navigations-Wrapper-Funktion nie erreichbar —
// der Verlauf-Button neben "Körpergewicht" in den Einstellungen (10-plan-settings.js) rief
// goBodyWeightChart() auf, das nirgendwo definiert war. Der globale Error-Handler
// (14-app-init.js) fing den dadurch entstehenden ReferenceError ab und zeigte nur die kleine
// "Kleiner Fehler"-Meldung, ohne dass etwas passierte. Gleiches Muster wie goStatsChart() etc.
// oben: pushView merkt sich den View-Namen im History-State, renderViewByState() (unten in
// dieser Datei) braucht dafür den passenden case-Zweig, sonst würde Android-/Browser-Zurück
// auf diese Seite nicht funktionieren.
function goBodyWeightChart(push){
  if (push !== false) pushView('bodyWeightChart');
  renderBodyWeightChart();
}
function goWorkoutsOverview(push){
  if (push !== false) pushView('workoutsOverview');
  renderWorkoutsOverview();
}
function goMonthOverview(push){
  if (push !== false) pushView('monthOverview');
  // Essenstracker-Daten (ftDays) müssen geladen sein, BEVOR die Monatsübersicht rendert —
  // sie zeigt jetzt auch Ernährungs-Infos je Tag/Monat (siehe monthOverviewDayMarker()/
  // monthOverviewBlockHTML(), 05-calendar.js). initFoodTracker() ist idempotent (lädt nur
  // beim allerersten Aufruf wirklich, siehe foodTrackerLoaded-Flag), kostet bei bereits
  // geladenen Daten also nichts.
  initFoodTracker().then(renderMonthOverview);
}
function goYearHeatmap(push){
  if (push !== false) pushView('yearHeatmap');
  initFoodTracker().then(renderYearHeatmap); // Tages-Popup zeigt auch Ernährungs-Infos, siehe goMonthOverview()
}
function goMonthReport(year, month, push){
  if (push !== false) pushView('monthReport', { year, month });
  // Essenstracker-Daten müssen geladen sein, BEVOR der Monatsbericht rendert — er zeigt jetzt
  // zusätzlich eine Ernährungs-Karte (Ø kcal/Makros) für denselben Monat, siehe
  // renderMonthReport() (05-calendar.js). initFoodTracker() ist idempotent.
  initFoodTracker().then(() => renderMonthReport(year, month));
}
function goExerciseSessionDetail(sessionId, exerciseId, push){
  if (push !== false) pushView('exerciseSessionDetail', { sessionId, exerciseId });
  renderExerciseSessionDetail(sessionId, exerciseId);
}
function goSessionSummary(session, push){
  if (push !== false) pushView('sessionSummary', { id: session.id });
  renderSessionSummary(session);
}

// Generisches System, damit Popups/Overlays (Übung hinzufügen, Kategorie-Einstellungen,
// Körpergewicht-Prompt, Reset-Bestätigung, History-Kontextmenü, Undo-Toast etc.) auf
// Android/Chrome korrekt auf die Zurück-Taste reagieren: STATT dass Zurück direkt die
// darunterliegende Seite verlässt (z. B. von "Training starten" zur Startseite springt,
// obwohl nur das Popup gemeint war), pusht jedes geöffnete Overlay einen eigenen
// History-Eintrag. Der globale popstate-Handler erkennt daran, dass ein Overlay offen war,
// und schließt nur dieses (per registrierter closeFn) statt die View zu wechseln.
let overlayCloseStack = [];
// Zählt, wie viele der zuletzt ausgelösten history.back()-Aufrufe von popOverlayStateIfOpen()
// selbst stammen (Overlay schließt sich über eigenen Button/Klick auf Hintergrund, nicht über
// die Hardware-Zurück-Taste). Ein Zähler statt eines einzelnen Flags, weil sich auch mehrere
// verschachtelte Popups in einem Rutsch schließen können (z. B. Farbwähler-Sub-Popup UND das
// dahinterliegende Kategorie-Popup direkt nacheinander per close(); closeParent();) — dann
// laufen mehrere history.back()-Aufrufe kurz hintereinander und es treffen entsprechend
// mehrere popstate-Events ein, die alle als "nur Overlay-Selbstschließung" erkannt werden
// müssen. Ohne dieses Tracking sieht der popstate-Handler beim letzten Event einen bereits
// leeren overlayCloseStack, hält es fälschlich für eine echte Zurück-Navigation und rendert
// die darunterliegende Seite komplett neu — wodurch z. B. der Aufklapp-Zustand der
// Muskelgruppen-Akkordeons im Übungen-Editor verloren ging, obwohl nur ein Popup wie
// "Übung bearbeiten" per "Fertig"/"✕" geschlossen wurde.
let overlaySelfClosingCount = 0;
function pushOverlayState(closeFn){
  overlayCloseStack.push(closeFn);
  history.pushState({ view: '__overlay__', params: {} }, '', '');
}
// Von Overlays selbst aufzurufen, wenn sie sich über ihren eigenen Schließen-Button/Klick
// auf den Hintergrund schließen (nicht über die Zurück-Taste) — nimmt den zuvor gepushten
// History-Eintrag wieder zurück, damit sich kein "Geister-Zurück" ansammelt. Ein Stack statt
// einer einzelnen Variable, da sonst zwei kurz hintereinander/verschachtelt geöffnete
// Overlays (z. B. Eingabefeld-"change" + Button-"click" derselben Bestätigung) sich
// gegenseitig überschreiben konnten — ein zusätzliches history.back() landete dann auf der
// falschen View darunter (siehe Bug: "Eigene Pause"-Popup bestätigen löste fälschlich den
// "Training wirklich verlassen"-Dialog aus).
function popOverlayStateIfOpen(){
  if (overlayCloseStack.length){
    overlayCloseStack.pop();
    overlaySelfClosingCount += 1;
    history.back();
  }
}
// Klappt alle Akkordeon-Abschnitte app-weit wieder zu, sobald irgendeine Seiten-Navigation
// stattfindet (Vorwärts über eine der go*()-Funktionen oder Zurück/Vorwärts per popstate).
// Innerhalb einer Seite wird beim Auf-/Zuklappen dagegen NICHT über pushView() navigiert,
// sondern per lokalem renderRows()/renderSettings()-Refresh gerendert — daher bleibt das
// Aufklappen während der Nutzung einer Seite unangetastet, und nur ein echtes Verlassen der
// Seite (vor oder zurück) setzt die Sets zurück, sodass beim nächsten Öffnen alles zu ist.
function resetAllAccordions(){
  settingsSectionOpen = new Set();
  workoutsMonthOpen = new Set();
  workoutsYearCollapsed = new Set();
  workoutsMonthOpenInitialized = false;
  homeVerlaufOpen = false;
  homeMealsOpen = false;
  progressGroupOpen = new Set();
  planGroupOpen = new Set();
  statsChartOpen = new Set();
  exerciseProgressChartOpen = new Set();
  muscleBalanceDrilldown = null;
  timeBalanceDrilldown = null;
}

// Rendert die zu einem State-Objekt ({ view, params }) gehörende Seite — genutzt vom
// popstate-Handler (Zurück/Vorwärts) UND von init() beim (Neu-)Laden der App, damit ein
// versehentliches Browser-Aktualisieren auf derselben Seite bleibt statt immer auf die
// Startseite zurückzuspringen (history.state überlebt einen Reload für den aktuellen
// Verlaufseintrag, siehe pushView()/replaceView()). Unbekannte/fehlende Views (z. B. ein
// zum Reload-Zeitpunkt gerade offenes Popup, dessen "__overlay__"-Marker keine echte Seite
// referenziert) fallen bewusst auf die Startseite zurück.
function renderViewByState(state){
  // Essenstracker-Bildschirme wenden ihr eigenes Farbschema selbst an (ftApplyTheme(), jeweils
  // als erste Zeile in renderFoodTracker()/renderFoodStats()/renderFtAddFood()/
  // renderFtMonthOverview()) — für ALLE anderen Views hier zentral das allgemeine Theme
  // wiederherstellen, falls zuvor im Essenstracker ein davon abweichendes eigenes Farbschema
  // aktiv war (jeder Rücksprung aus dem Essenstracker läuft über den Zurück-Pfeil/
  // history.back() und landet hier). monthOverview/monthReport gehören NICHT zu den
  // Essenstracker-eigenen Views (siehe deren Kommentar bei initFoodTracker()-Aufruf unten) —
  // das sind Trainings-Kalenderseiten, die lediglich zusätzlich Essenstracker-Daten laden.
  const FOOD_TRACKER_VIEWS = new Set(['foodTracker', 'foodStats', 'foodAddMeal', 'foodAutoMealBuilder', 'foodCalendar']);
  if (!FOOD_TRACKER_VIEWS.has(state.view)) applyTheme();
  switch(state.view){
    case 'plan': renderPlanEditor(); break;
    case 'settings': renderSettings(); break;
    case 'progressList': renderProgressList(); break;
    case 'muscleBalance': renderMuscleBalance(); break;
    case 'intensityStats': renderIntensityStats(); break;
    case 'kcalStats': renderKcalStats(); break;
    case 'progressDetail': renderExerciseProgress(state.params.name); break;
    case 'sessionDetail': renderSessionDetail(state.params.id); break;
    case 'sessionSummary': {
      const s = sessions.find(x => x.id === state.params.id);
      if (s) renderSessionSummary(s); else renderHome();
      break;
    }
    case 'startSelect': renderStartSelect(); break;
    case 'freeSelect': renderFreeSelect(); break;
    case 'modeEdit': renderModeEdit(state.params.mode, state.params.startTab); break;
    case 'statsChart': renderStatsChart(state.params.metric); break;
    case 'bodyWeightChart': renderBodyWeightChart(); break;
    case 'workoutsOverview': renderWorkoutsOverview(); break;
    case 'monthOverview': initFoodTracker().then(renderMonthOverview); break;
    case 'yearHeatmap': initFoodTracker().then(renderYearHeatmap); break;
    case 'monthReport': initFoodTracker().then(() => renderMonthReport(state.params.year, state.params.month)); break;
    case 'exerciseSessionDetail': renderExerciseSessionDetail(state.params.sessionId, state.params.exerciseId); break;
    case 'foodTracker': initFoodTracker().then(renderFoodTracker); break;
    case 'foodStats': initFoodTracker().then(renderFoodStats); break;
    case 'foodAddMeal': initFoodTracker().then(() => renderFtAddFood(state.params.meal)); break;
    case 'foodAutoMealBuilder': initFoodTracker().then(() => {
      // Beim direkten Ansprung dieser Route (Reload/Vorwärts-Navigation) gibt es keine
      // gesammelten Items aus einer laufenden Sitzung mehr — startet daher bewusst mit einer
      // leeren Sammlung statt mit einem Fehler, exakt wie ein neu geöffnetes Formular.
      ftAutoMealBuilder = { meal: state.params.meal, items: [] };
      renderFtAddFood(state.params.meal);
    }); break;
    case 'foodCalendar': initFoodTracker().then(renderFtMonthOverview); break;
    case 'active': if (active) renderActive(); else renderHome(); break;
    default: renderHome();
  }
}

window.addEventListener('popstate', (event) => {
  // Falls gerade ein Overlay/Popup offen ist, schließt die Zurück-Taste NUR dieses Overlay
  // und lässt die eigentliche View (z. B. "Training starten" mit den vier Kreisen)
  // unverändert im Hintergrund stehen — sonst würde Zurück fälschlich die ganze Seite
  // verlassen, obwohl nur das Popup gemeint war. resetAllAccordions() darf hier deshalb NICHT
  // pauschal laufen: das bloße Schließen eines Popups (z. B. "Übung bearbeiten") ist keine
  // echte Seiten-Navigation und soll den Aufklapp-Zustand der dahinterliegenden Liste
  // (z. B. welche Muskelgruppe gerade offen ist) unangetastet lassen.
  if (overlayCloseStack.length){
    const fn = overlayCloseStack.pop();
    fn();
    return;
  }
  // Hat sich das Overlay gerade selbst geschlossen (Button "Fertig"/"✕"/Klick auf Hintergrund
  // statt Hardware-Zurück-Taste), wurde der Stack-Eintrag von popOverlayStateIfOpen() bereits
  // VOR diesem history.back() gepoppt — der obige Zweig greift dann nicht mehr. In diesem Fall
  // ist die aktuelle View bereits korrekt (das Overlay wurde vom Aufrufer schon entfernt), es
  // ist also keine echte Seiten-Navigation und weder resetAllAccordions() noch ein
  // Neu-Rendern der Seite nötig — das würde sonst z. B. den Aufklapp-Zustand der
  // Muskelgruppen-Akkordeons im Übungen-Editor unnötig zurücksetzen.
  if (overlaySelfClosingCount > 0){
    overlaySelfClosingCount -= 1;
    return;
  }
  resetAllAccordions();
  const state = event.state || { view: 'home', params: {} };
  renderViewByState(state);
  updateMiniPlayer();
});

