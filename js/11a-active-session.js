/* ---------------------------------------------------
   11a-active-session.js
   ---------------------------------------------------
   Teil 1/3 der ehemals einzelnen 11-active-session.js (2124 Zeilen, an der
   Größengrenze für vollständige Datei-Downloads). Rein aus Dateigröße
   aufgeteilt, OHNE inhaltliche Änderung — Funktionsgrenzen sind exakt
   erhalten, nur auf drei Dateien verteilt. Ausführungsreihenfolge bleibt
   zwingend 11a → 11b → 11c (siehe <script>-Reihenfolge in index.html und
   APP_SHELL in sw.js).
   Inhalt dieses Teils: Session-Aufbau (buildEntry/startSession/repeatSession),
   Pause-Timer, Supersätze, Performance-Vorschläge sowie das Thumb-Drag der
   Übungsleiste.
--------------------------------------------------- */
// importedSets: optional — Sätze (mit reps/weight bzw. seconds) aus einer importierten
// Trainingsdatei, die statt des normalen "Letztes Mal"-Gedächtnisses als Vorbelegung dienen
// sollen (siehe openImportWeightsPrompt/startSession). null/undefined = normales Verhalten.
function buildEntry(ex, importedSets){
  const type = ex.type === 'time' ? 'time' : 'reps';
  // Kardio-Übungen (Laufband, Rudern, …) laufen immer mit genau einem Satz — anders als bei
  // Kraftübungen ist "mehrere Sätze" hier nicht das übliche Modell, ein einzelner
  // Zeitabschnitt pro Einheit reicht. Egal was in ex.sets/der Historie/beim Import steht,
  // wird hier immer auf 1 Satz gekürzt.
  const isCardio = type === 'time' && !!ex.cardioMachine;
  if (importedSets && importedSets.length){
    return {
      exerciseId: ex.id,
      name: ex.name,
      type,
      target: type === 'time'
        ? { sets: ex.sets, secondsMin: ex.secondsMin, secondsMax: ex.secondsMax }
        : { sets: ex.sets, repsMin: ex.repsMin, repsMax: ex.repsMax, weight: ex.weight },
      referenceHistory: null, // keine eigene "Letztes Mal"-Referenz nötig, die importierten Werte stehen ja schon direkt im Feld
      sets: (isCardio ? importedSets.slice(0, 1) : importedSets).map(s => ({ ...s, done: false }))
    };
  }
  const storedHistory = lastPerformance[ex.id];
  // Neue Struktur: Array der letzten bis zu 3 Sessions (jeweils ein Array von Sätzen — siehe
  // endSession()). Alte Struktur (nur die letzte Session als flaches Array von Sätzen) wird
  // mitunterstützt.
  const history = Array.isArray(storedHistory) && storedHistory.length && Array.isArray(storedHistory[0])
    ? storedHistory
    : (Array.isArray(storedHistory) && storedHistory.length ? [storedHistory] : []);
  const remembered = history[0] || null;
  const setCount = isCardio ? 1 : ex.sets;
  const defaultSets = type === 'time'
    ? Array.from({length: setCount}, () => ({ seconds: null, done: false }))
    : Array.from({length: setCount}, () => ({ reps: null, weight: ex.weight || null, done: false }));
  const rememberedSets = (remembered && remembered.length) ? (isCardio ? remembered.slice(0, 1) : remembered) : null;
  return {
    exerciseId: ex.id,
    name: ex.name,
    type,
    target: type === 'time'
      ? { sets: ex.sets, secondsMin: ex.secondsMin, secondsMax: ex.secondsMax }
      : { sets: ex.sets, repsMin: ex.repsMin, repsMax: ex.repsMax, weight: ex.weight },
    // Referenz für die Anzeige "Letztes Mal": nur die letzte Session, auch wenn
    // lastPerformance intern bis zu 3 vorhält (siehe endSession()).
    referenceHistory: history.length ? history.slice(0, 1).map(sets => (isCardio ? sets.slice(0, 1) : sets).map(s => ({ ...s }))) : null,
    sets: rememberedSets ? rememberedSets.map(s => ({ ...s, done: false })) : defaultSets
  };
}

// importedSession: optional — falls gesetzt, werden die darin enthaltenen Sätze pro Übung
// als Vorbelegung genutzt (siehe buildEntry) statt des normalen "Letztes Mal"-Verhaltens.
// "mode"/"variant": der Kachel-Modus, mit dem das Training gestartet wurde (z. B.
// 'oberkoerper', 'push', 'ganzkoerper', eine eigene Kategorie-ID, oder 'frei' für die freie
// Übungsauswahl bzw. unbekannt/null bei Import). Wird auf der aktiven Session gespeichert
// und in renderActive() genutzt, um im "Übung hinzufügen"-Dialog die zum laufenden Training
// passenden Muskelgruppen-Akkordeons direkt aufgeklappt zu zeigen (siehe defaultOpenAddExerciseGroups()).
function startSession(exerciseList, importedSession, mode, variant){
  clearInterval(restInterval);
  restState = null;
  addExerciseOpen = false;
  addExerciseGroupOpen = new Set();
  active = {
    startedAt: Date.now(),
    pausedAt: null,
    currentIndex: 0,
    mode: mode || null,
    modeVariant: variant || null,
    entries: exerciseList.map(ex => {
      const importedEntry = importedSession && importedSession.entries.find(e => e.exerciseId === ex.id);
      return buildEntry(ex, importedEntry ? importedEntry.sets : null);
    })
  };
  applyStoredSupersetsToActive();
  pushView('active');
  renderActive();
  timerHandle = setInterval(updateTimerDisplay, 1000);
  requestTrainingWakeLock();
  persistActiveSession();
  // Berechtigung erst hier anfragen (siehe ensureTrainingNotificationPermission()) und danach
  // sofort die erste Benachrichtigung setzen. Absichtlich NICHT awaited, damit sich der
  // Trainingsstart nicht hinter einem Berechtigungsdialog verzögert.
  ensureTrainingNotificationPermission().then(ok => { if (ok) syncActiveTrainingNotification(true); });
}

// Startet ein neues Training mit denselben Übungen wie eine vergangene Einheit.
// Übungen, die inzwischen aus dem Plan gelöscht wurden, werden übersprungen.
function repeatSession(session){
  const exerciseList = session.entries
    .map(e => plan.exercises.find(x => x.id === e.exerciseId))
    .filter(Boolean);
  if (!exerciseList.length){
    alert('Keine der Übungen aus dieser Einheit ist noch in deinem Plan vorhanden.');
    return;
  }
  if (active){
    if (!confirm('Es läuft bereits ein Training. Dieses verwerfen und die alte Einheit erneut starten?')) return;
    clearInterval(timerHandle);
    clearInterval(restInterval);
    restState = null;
    active = null;
    releaseTrainingWakeLock();
    persistActiveSession();
  }
  startSession(exerciseList);
}

function updateTimerDisplay(){
  const el = document.getElementById('plateTime');
  if (active){
    const now = active.pausedAt || Date.now();
    const sec = Math.floor((now - active.startedAt)/1000);
    if (el) el.textContent = fmtDuration(sec);
    const miniTimeEl = document.getElementById('miniPlayerTime');
    const miniPlayerEl = document.getElementById('miniPlayer');
    if (miniTimeEl && miniPlayerEl && miniPlayerEl.style.display !== 'none'){
      miniTimeEl.textContent = fmtDuration(sec);
    }
  }
}

/* ---------------------------------------------------
   Sperrbildschirm-/Statusleisten-Benachrichtigung bei laufendem Training
--------------------------------------------------- */
// Zeigt, solange ein Training läuft, eine Benachrichtigung mit der aktuellen Übung an; ein Tap
// darauf holt die App in die Trainingsansicht (Gegenstück: notificationclick in sw.js).
//
// BEWUSST OHNE Zeitangabe (Nutzer-Feedback): Die Trainingszeit kann auf dem Sperrbildschirm
// nicht sekündlich mitticken — Android friert die Seite dort ein, und die Web-Notifications-API
// kennt kein Chronometer-Feld wie native Android-Benachrichtigungen. Ein eingeblendeter Wert
// wäre daher immer nur der Stand vom letzten Moment, in dem die Seite laufen durfte, und würde
// nach längerem gesperrtem Bildschirm wie eine kaputte, stehengebliebene Uhr wirken. Ohne
// Zeitangabe entsteht dieser Eindruck gar nicht erst.
const TRAINING_NOTIFICATION_TAG = 'training-active';
// Merkt sich Titel+Text der zuletzt GEZEIGTEN Benachrichtigung — ohne Zeitangabe (siehe unten)
// ändert sich der Inhalt nur noch bei Übungswechsel oder Pause/Fortsetzen, nicht mehr bei jedem
// abgehakten Satz. showActiveTrainingNotification() wird trotzdem bei jeder Zustandsänderung
// aufgerufen (über persistActiveSession()), schreibt die Benachrichtigung aber nur neu, wenn
// sich der sichtbare Inhalt tatsächlich geändert hat.
let lastShownTrainingNotification = null;

function notificationsUsable(){
  return typeof Notification !== 'undefined'
    && Notification.permission === 'granted'
    && 'serviceWorker' in navigator;
}

// Fragt die Berechtigung an — bewusst NICHT beim App-Start, sondern erst beim ersten
// Trainingsstart: dort ist der Zusammenhang für den Nutzer offensichtlich, ein Prompt direkt
// beim Öffnen der App wirkt dagegen willkürlich und wird meist abgelehnt. Ein einmal
// abgelehnter Zustand ('denied') wird respektiert und nicht erneut angefragt.
async function ensureTrainingNotificationPermission(){
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch (e){
    return false;
  }
}

function currentTrainingExerciseName(){
  if (!active || !Array.isArray(active.entries)) return null;
  const entry = active.entries[active.currentIndex];
  return entry ? entry.name : null;
}

// KEINE Zeitangabe in der Benachrichtigung (bewusste Entscheidung, siehe Nutzer-Feedback):
// ein Wert wie "Stand: 12:34" wirkt nach dem Sperren des Bildschirms schnell wie eine
// eingefrorene, kaputte Stoppuhr, weil die Seite dort nicht weiterlaufen darf (siehe
// Erklärung oben) — ohne Zeitangabe entsteht dieser falsche Eindruck gar nicht erst. Zeigt
// stattdessen nur die aktuelle Übung, aktualisiert sich also nur bei echtem Übungswechsel.
async function showActiveTrainingNotification(force){
  if (!active || !notificationsUsable()) return;
  const title = active.pausedAt ? 'Training pausiert' : 'Training läuft';
  const exName = currentTrainingExerciseName();
  const body = exName || 'Zum Training zurückkehren';
  const signature = title + '|' + body;
  if (!force && signature === lastShownTrainingNotification) return;
  lastShownTrainingNotification = signature;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      tag: TRAINING_NOTIFICATION_TAG, // gleicher Tag = ERSETZT die vorhandene statt eine zweite anzulegen
      renotify: false,                // kein erneutes Vibrieren/Ton bei jedem Update
      silent: true,
      requireInteraction: true,       // wird auf Android ignoriert, hilft aber am Desktop gegen Auto-Ausblenden
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-192.png',
      data: { startedAt: active.startedAt }
    });
  } catch (e){
    // Benachrichtigungen sind ein reines Extra — schlägt es fehl (kein SW, Gerät verweigert),
    // läuft das Training vollkommen unbeeinträchtigt weiter.
  }
}

async function clearActiveTrainingNotification(){
  lastShownTrainingNotification = null; // nächstes Training mit gleicher erster Übung soll wieder anzeigen, nicht als "unverändert" übersprungen werden
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const list = await reg.getNotifications({ tag: TRAINING_NOTIFICATION_TAG });
    list.forEach(n => n.close());
  } catch (e){ /* siehe oben: reines Extra */ }
}

// Zentraler Aufhänger: nach jeder relevanten Zustandsänderung aufrufen. Bei !active wird
// aufgeräumt, damit nach Trainingsende/-abbruch keine verwaiste Benachrichtigung hängen bleibt.
function syncActiveTrainingNotification(force){
  if (active) showActiveTrainingNotification(force);
  else clearActiveTrainingNotification();
}

// Pausiert bzw. setzt die normal weiterlaufende Trainingszeit fort — nur relevant, solange
// gerade KEIN Pausen-Timer läuft (während einer Pause zeigt die Box ohnehin den Pausen-
// Countdown statt der Trainingszeit, siehe CSS .time-box.resting .time-box-time). Beim
// Fortsetzen wird active.startedAt um die pausierte Dauer nach vorne verschoben, damit die
// Trainingszeit exakt an der Stelle weiterläuft, an der sie pausiert wurde.
function toggleSessionPause(){
  if (!active || restState) return;
  if (active.pausedAt){
    active.startedAt += Date.now() - active.pausedAt;
    active.pausedAt = null;
    // Übungs-Zeittracking (siehe accrueExerciseTime()) nutzt dieselbe Uhr — beim Fortsetzen
    // den Startpunkt der aktuell offenen Übung auf JETZT vorziehen, sonst würde die Pausen-
    // dauer selbst versehentlich als "Übung geöffnet" mitgezählt.
    active.timeTrackOpenedAt = Date.now();
  } else {
    // Vor dem Pausieren die bis hierhin vergangene Zeit der offenen Übung noch einbuchen
    // (accrueExerciseTime() selbst würde ab jetzt dank active.pausedAt ohnehin nicht mehr
    // weiterzählen, aber ohne diesen Aufruf bliebe die Zeit bis zum Pausieren ungespeichert,
    // bis der nächste renderActive()-Aufruf zufällig danach kommt).
    accrueExerciseTime();
    active.pausedAt = Date.now();
  }
  persistActiveSession();
  updateTimerDisplay();
  const icon = document.getElementById('platePauseIcon');
  if (icon) icon.style.display = active.pausedAt ? 'block' : 'none';
  const timeEl = document.getElementById('plateTime');
  if (timeEl) timeEl.classList.toggle('time-paused', !!active.pausedAt);
}

let addExerciseOpen = false;
let addExerciseGroupOpen = new Set();
// Für die beiden gleichnamigen Hüft-Übungen "Adduktoren"/"Abduktoren" (gleiches Gerät,
// entgegengesetzte Bewegungsrichtung) wird überall, wo der Übungsname als sichtbarer Text
// erscheint, ein kleiner, dezent gefärbter Zusatz direkt dahinter angezeigt — Attribute wie
// aria-label und editierbare Namensfelder bleiben davon bewusst unberührt.
const EXERCISE_NAME_HINTS = { 'Adduktoren': '(von außen)', 'Abduktoren': '(von innen)' };
// Für Übungen, deren Zusatz direkt Teil des gespeicherten Namens ist (z. B. "Brustflys
// (von oben)"/"Brustflys (von unten)" — zwei gleichnamige Übungen an unterschiedlichen
// Geräten/Zugrichtungen, ähnlich wie Adduktoren/Abduktoren oben), wird eine abschließende
// Klammer im Namen automatisch klein und dezent gefärbt dargestellt, statt über die feste
// EXERCISE_NAME_HINTS-Zuordnung (die nur bei identischem Namen für beide Varianten
// funktionieren würde).
const NAME_TRAILING_PAREN = /^(.*\S)\s+(\([^)]+\))$/;
function exerciseNameHTML(name){
  const hint = EXERCISE_NAME_HINTS[name];
  if (hint) return `${name} <span class="exercise-name-hint">${hint}</span>`;
  const m = name.match(NAME_TRAILING_PAREN);
  if (m) return `${m[1]} <span class="exercise-name-hint">${m[2]}</span>`;
  return name;
}
function initials(name){
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0,2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
function isEntryDone(entry){
  return entry.sets.length > 0 && entry.sets.every(s => s.done);
}
function advanceToNextExercise(){
  if (active.currentIndex < active.entries.length - 1) active.currentIndex++;
}

/* ---------------------------------------------------
   SUPERSATZ (siehe wireThumbDrag() für die Drag&Drop-Verknüpfung im Kachel-Wechsler)
   Eine Kopplung wird als GRUPPE von 2 oder 3 Übungs-IDs gehalten (SUPERSET_MAX_SIZE), in genau
   der Reihenfolge, in der sie zusammengezogen wurden — eine neu hinzugezogene Übung landet
   dabei immer als LETZTES Element der Gruppe, egal auf welches bestehende Mitglied man sie
   zieht: active.supersetPairs für die laufende Einheit UND — dauerhaft — plan.supersetPairs,
   damit dieselbe Kopplung automatisch wieder greift, sobald künftig dieselben Übungen erneut
   gemeinsam in einem Training vorkommen (siehe applyStoredSupersetsToActive(), aufgerufen in
   startSession()). Eine Übung kann dabei immer nur Teil genau EINER Gruppe sein.
   (Feldname supersetPairs ist historisch gewachsen und hält jetzt Gruppen statt reiner Paare —
   ältere gespeicherte 2er-Paare sind einfach 2-elementige Gruppen und funktionieren unverändert
   weiter, keine Migration nötig.)
--------------------------------------------------- */
const SUPERSET_MAX_SIZE = 3;
// Globaler Schalter fürs Verknüpfen zu Supersätzen im laufenden Training (siehe
// openTrainingToolsPrompt() in 02-state-theme.js → Abschnitt "Supersätze") — standardmäßig
// an, außer explizit deaktiviert. Betrifft NUR das Neu-Verknüpfen per Ziehen&Halten (siehe
// wireThumbDrag()) UND das automatische Wiederherstellen gespeicherter Kopplungen beim
// Trainingsstart (siehe applyStoredSupersetsToActive()) — bereits während einer laufenden
// Einheit bestehende Gruppen werden durch bloßes Ausschalten NICHT rückwirkend aufgelöst.
function supersetsFeatureEnabled(){
  return plan.supersetsEnabled !== false;
}
function findSupersetGroupIds(exerciseId){
  if (!active || !Array.isArray(active.supersetPairs)) return null;
  return active.supersetPairs.find(g => g.includes(exerciseId)) || null;
}
// Rückwärtskompatibler Helper für Stellen, die nur wissen müssen, OB überhaupt eine Kopplung
// besteht (und irgendein anderes Gruppenmitglied als Referenz brauchen), unabhängig von der
// Gruppengröße.
function findSupersetPartnerExerciseId(exerciseId){
  const group = findSupersetGroupIds(exerciseId);
  return group ? (group.find(id => id !== exerciseId) || null) : null;
}
// Liefert die aktuelle Kachel-Struktur der laufenden Einheit: jede Einheit ist entweder eine
// einzelne Übung ({startIndex===endIndex}) oder eine direkt benachbarte, gekoppelte
// Supersatz-Gruppe aus 2 oder 3 Übungen ({startIndex, endIndex=startIndex+Gruppengröße-1}).
// Wird sowohl fürs Rendern als auch fürs Drag&Drop (wireThumbDrag()) genutzt, damit beide
// exakt dieselbe Gruppierung sehen.
function computeThumbUnits(){
  const units = [];
  let i = 0;
  while (i < active.entries.length){
    const e = active.entries[i];
    const group = findSupersetGroupIds(e.exerciseId);
    let consumed = 1;
    if (group && group.length > 1 && group[0] === e.exerciseId){
      let ok = true;
      for (let k = 1; k < group.length; k++){
        const next = active.entries[i + k];
        if (!next || next.exerciseId !== group[k]) { ok = false; break; }
      }
      if (ok) consumed = group.length;
    }
    units.push({ startIndex: i, endIndex: i + consumed - 1 });
    i += consumed;
  }
  return units;
}
// Löst die bestehende Gruppe der übergebenen Übung komplett auf, sowohl in der laufenden
// Einheit als auch dauerhaft im Plan (ohne zu speichern — siehe persistSupersetPairsToPlan()).
// Wird gebraucht, bevor eine Übung mit neuen Partnern verknüpft wird.
function removeSupersetPairsInvolving(exerciseId){
  if (active && Array.isArray(active.supersetPairs)){
    active.supersetPairs = active.supersetPairs.filter(g => !g.includes(exerciseId));
  }
  if (Array.isArray(plan.supersetPairs)){
    plan.supersetPairs = plan.supersetPairs.filter(g => !g.includes(exerciseId));
  }
}
function persistSupersetPairsToPlan(){
  if (!active || !Array.isArray(active.supersetPairs)) return;
  plan.supersetPairs = plan.supersetPairs || [];
  active.supersetPairs.forEach(g => {
    // alte, überlappende Gruppen-Version(en) ersetzen statt zu duplizieren
    plan.supersetPairs = plan.supersetPairs.filter(pg => !pg.some(id => g.includes(id)));
    plan.supersetPairs.push(g.slice());
  });
  saveJSON('plan', plan).catch(() => {});
}
// Löst eine Gruppe dauerhaft und in der laufenden Einheit komplett auf (alle Mitglieder werden
// wieder einzeln) — Nutzer-Aktion über "Supersatz aufheben" (Long-Press auf eine der Kacheln,
// siehe wireThumbDrag()), gilt identisch für 2er- und 3er-Gruppen.
function unlinkSupersetGroup(exerciseId){
  const group = findSupersetGroupIds(exerciseId);
  if (!group) return;
  if (active && Array.isArray(active.supersetPairs)){
    active.supersetPairs = active.supersetPairs.filter(g => g !== group);
  }
  if (Array.isArray(plan.supersetPairs)){
    plan.supersetPairs = plan.supersetPairs.filter(pg => !pg.some(id => group.includes(id)));
  }
  saveJSON('plan', plan).catch(() => {});
}
// Verknüpft eine bisher ungekoppelte Übung der laufenden Einheit mit einer Zielübung ODER
// -Gruppe zu einem Supersatz (Drag einer Kachel auf eine andere/eine Gruppe, ≥SUPERSET_HOLD_MS
// gehalten — siehe wireThumbDrag()). Die gezogene Übung wird dabei immer als LETZTES Mitglied
// angehängt (ans Ende des Gruppen-Blocks physisch verschoben), unabhängig davon, auf welches
// bestehende Mitglied genau gezogen wurde. Gruppen wachsen so bis maximal SUPERSET_MAX_SIZE.
function createSuperset(fromEntryIndex, targetEntryIndex){
  const fromEntry = active.entries[fromEntryIndex];
  const targetEntry = active.entries[targetEntryIndex];
  if (!fromEntry || !targetEntry || fromEntry === targetEntry) return;
  const existingTargetGroup = findSupersetGroupIds(targetEntry.exerciseId);
  const groupIds = existingTargetGroup ? existingTargetGroup.slice() : [targetEntry.exerciseId];
  if (groupIds.length >= SUPERSET_MAX_SIZE) return; // Ziel-Gruppe ist bereits voll

  removeSupersetPairsInvolving(fromEntry.exerciseId);
  groupIds.push(fromEntry.exerciseId);

  active.entries.splice(active.entries.indexOf(fromEntry), 1);
  let lastGroupMemberIndex = -1;
  groupIds.slice(0, -1).forEach(id => {
    const idx = active.entries.findIndex(e => e.exerciseId === id);
    if (idx > lastGroupMemberIndex) lastGroupMemberIndex = idx;
  });
  active.entries.splice(lastGroupMemberIndex + 1, 0, fromEntry);

  removeSupersetPairsInvolving(targetEntry.exerciseId); // alte (kürzere) Gruppen-Version entfernen
  active.supersetPairs = active.supersetPairs || [];
  active.supersetPairs.push(groupIds);
  active.currentIndex = active.entries.indexOf(targetEntry);
  persistSupersetPairsToPlan();
  if (navigator.vibrate) navigator.vibrate([15, 40, 15]);
}
// Wird beim Start einer neuen Einheit (siehe startSession()) aufgerufen: übernimmt dauerhaft
// gespeicherte Gruppen aus plan.supersetPairs für die heutigen Übungen, sofern ALLE gekoppelten
// Übungen heute dabei sind — und rückt sie dafür nötigenfalls direkt nebeneinander, in der
// gespeicherten Reihenfolge.
function applyStoredSupersetsToActive(){
  active.supersetPairs = [];
  if (!Array.isArray(plan.supersetPairs) || !supersetsFeatureEnabled()) return;
  plan.supersetPairs.forEach(group => {
    const entries = group.map(id => active.entries.find(e => e.exerciseId === id));
    if (entries.some(e => !e)) return; // nicht alle Mitglieder heute Teil der Einheit
    const firstIdx = active.entries.indexOf(entries[0]);
    let insertAt = firstIdx + 1;
    for (let k = 1; k < entries.length; k++){
      const e = entries[k];
      const curIdx = active.entries.indexOf(e);
      if (curIdx !== insertAt){
        active.entries.splice(curIdx, 1);
        active.entries.splice(insertAt, 0, e);
      }
      insertAt++;
    }
    active.supersetPairs.push(group.slice());
  });
}
// Wird nach jedem Abhaken (nicht beim Entfernen des Häkchens) statt des simplen
// advanceToNextExercise() aufgerufen: bei einer Supersatz-Übung springt der Fokus reihum zur
// nächsten noch nicht fertigen Übung der Gruppe (bei 2 Mitgliedern also alternierend, bei 3
// rotierend) — erst wenn ALLE Mitglieder der Gruppe fertig sind, geht es normal zur nächsten
// Übung danach weiter.
function afterSetChecked(entry, ei){
  const group = findSupersetGroupIds(entry.exerciseId);
  if (group){
    const memberIndices = group
      .map(id => active.entries.findIndex(e => e.exerciseId === id))
      .filter(idx => idx !== -1)
      .sort((a, b) => a - b);
    const posInGroup = memberIndices.indexOf(ei);
    for (let step = 1; step <= memberIndices.length; step++){
      const candidateIdx = memberIndices[(posInGroup + step) % memberIndices.length];
      const candidateEntry = active.entries[candidateIdx];
      if (candidateIdx !== ei && candidateEntry && !isEntryDone(candidateEntry)){
        active.currentIndex = candidateIdx;
        return;
      }
    }
    if (memberIndices.every(idx => isEntryDone(active.entries[idx]))){
      const afterIndex = memberIndices[memberIndices.length - 1];
      if (afterIndex < active.entries.length - 1) active.currentIndex = afterIndex + 1;
    }
    return;
  }
  if (isEntryDone(entry)) advanceToNextExercise();
}
// Hakt einen Satz automatisch ab, wenn seine Zeit über die Stoppuhr (openPlankTimerOverlay,
// Plank/isometrische Übungen UND Kardio-Maschinen) eingetragen wurde — die Sekunden stehen ja
// bereits fest, ein zusätzliches manuelles Abhaken wäre doppelte Arbeit. Nutzt danach exakt
// dieselbe Folgelogik wie ein normales Abhaken per Häkchen-Button (Supersatz-Weiterschalten,
// automatischer Standard-Pausetimer).
function autoCheckSetAfterTimer(entry, ei, si){
  if (entry.sets[si].done) return;
  entry.sets[si].done = true;
  afterSetChecked(entry, ei);
  if (plan.trainingToolsEnabled === true && plan.defaultRestSeconds) startRest(plan.defaultRestSeconds);
}

/* ---------------------------------------------------
   PERFORMANCEMODUS (siehe renderSettings() für den Ein/Aus-Schalter)
   Schlägt automatisch eine kleine Steigerung vor, sobald man eine Übung öffnet.
   Kraftübungen: doppelte Progression (siehe checkPerformanceSuggestion()) — solange auch nur
   ein Satz der letzten Einheit unter dem oberen Rand des Wdh.-Zielbereichs der Übung
   (ex.repsMin/repsMax) liegt, gibt es keinen Vorschlag; erst wenn WIRKLICH ALLE Sätze dort
   angekommen sind, wird der nächste Gewichtsschritt vorgeschlagen, mit dem Wdh.-Ziel zurück auf
   den unteren Rand. Kardio-Übungen: weiterhin stagnationsbasiert (siehe
   checkCardioPerfSuggestion()) — "+30 Sekunden", sobald dieselbe Dauer mehrfach in Folge stand.
--------------------------------------------------- */
// Popup-Zustand: null oder { entryIndex, setIndex, weight, reps } — siehe renderActive().
let perfSuggestion = null;

// Begrenzt Steigerungs-Vorschläge auf höchstens den in den Einstellungen frei wählbaren
// Prozentsatz (plan.performancePercentage, siehe currentPerfPercentage()) der Übungen EINER
// Trainingseinheit, statt (wie zuvor) für jede passende Übung einen anzubieten — bei zwei identischen Einheiten
// in Folge hätte das sonst quasi "die ganze Einheit auf einmal" gesteigert, was zu krass ist.
// Aus allen diese Einheit betreffenden, grundsätzlich passenden Übungen (siehe
// checkPerformanceSuggestion()/checkCardioPerfSuggestion()) werden gezielt die bevorzugt, die
// am längsten her keinen Vorschlag mehr bekommen haben (plan.perfSuggestionLastShown) — so
// verteilen sich die Vorschläge über mehrere Einheiten hinweg auf unterschiedliche Übungen,
// statt immer dieselben (z. B. die ersten paar in der Reihenfolge) zu treffen. Die Auswahl
// wird einmal pro aktiver Einheit berechnet und für deren Dauer zwischengespeichert
// (sessionKey = active.startedAt, damit ein Wechsel auf eine andere Einheit sie neu bildet).
let perfSuggestionQuota = null;
// Liefert den zuletzt geloggten RPE-Wert einer Übung an einer bestimmten Satz-Position, oder
// null, wenn keiner eingetragen wurde (z. B. RPE-Erfassung war zu dem Zeitpunkt noch aus,
// oder das Feld wurde übersprungen). Nutzt dieselbe Historie wie checkPerformanceSuggestion().
function lastLoggedRpeFor(exerciseId, si){
  const history = lastPerformance[exerciseId];
  const lastSet = Array.isArray(history) && Array.isArray(history[0]) ? history[0][si] : null;
  return (lastSet && typeof lastSet.rpe === 'number') ? lastSet.rpe : null;
}

function computePerfSuggestionQuota(){
  const sessionKey = active && active.startedAt;
  if (perfSuggestionQuota && perfSuggestionQuota.sessionKey === sessionKey) return perfSuggestionQuota.allowedIds;
  const allowedIds = new Set();
  let eligible = [];
  let cap = 1;
  if (active && active.entries && active.entries.length){
    active.entries.forEach(entry => {
      if (!entry || !entry.exerciseId) return;
      const set = entry.sets[0];
      if (!set) return;
      const planEx = plan.exercises.find(e => e.id === entry.exerciseId);
      let isEligible = false;
      if (entry.type === 'time'){
        if (planEx && planEx.cardioMachine) isEligible = !!checkCardioPerfSuggestion(entry.exerciseId, 0, set.seconds);
      } else {
        isEligible = !!checkPerformanceSuggestion(entry.exerciseId, 0, set.weight, set.reps, planEx);
      }
      if (isEligible) eligible.push(entry.exerciseId);
    });
    cap = Math.max(1, Math.round(active.entries.length * (currentPerfPercentage() / 100)));
    const lastShown = plan.perfSuggestionLastShown || {};
    // Sortierung des Kontingents: bei aktiver RPE-Erfassung (siehe rpeEnabled(), 04-utils.js)
    // rücken Übungen mit NIEDRIGEM zuletzt geloggtem RPE (= gefühlt noch leicht, hat Luft nach
    // oben) an die vorderste Stelle der Warteschlange — sie bekommen das begrenzte Kontingent
    // also bevorzugt zugeteilt. Übungen OHNE eingetragenen RPE-Wert werden bewusst neutral
    // behandelt (RPE_NEUTRAL, die Mitte des Wertebereichs): sie werden dadurch weder
    // bevorzugt noch benachteiligt, sondern bleiben normal im Rennen ums Kontingent — nur wer
    // tatsächlich einen niedrigen RPE-Wert eingetragen hat, springt nach vorn. Innerhalb
    // gleicher RPE-Priorität (inkl. "alle neutral", wenn RPE aus ist oder für keine der
    // Übungen ein Wert vorliegt) entscheidet weiterhin die bisherige Fairness-Rotation nach
    // zuletzt gezeigtem Vorschlag (älteste/nie gezeigte zuerst).
    const rpeSortEnabled = rpeEnabled();
    eligible.sort((a, b) => {
      if (rpeSortEnabled){
        const rpeA = lastLoggedRpeFor(a, 0) ?? RPE_NEUTRAL;
        const rpeB = lastLoggedRpeFor(b, 0) ?? RPE_NEUTRAL;
        if (rpeA !== rpeB) return rpeA - rpeB;
      }
      return (lastShown[a] || '').localeCompare(lastShown[b] || '');
    });
    eligible.slice(0, cap).forEach(id => allowedIds.add(id));
  }
  perfSuggestionQuota = { sessionKey, allowedIds, eligibleSorted: eligible, nextPromoteIndex: cap };
  return allowedIds;
}
// Wird aufgerufen, wenn ein Vorschlag ABGELEHNT wurde: die betroffene Übung hatte ihre Chance
// (siehe entry._perfSuggestionDismissed, verhindert ein erneutes Angebot bei ihr), aber ihr
// Platz im ~20%-Kontingent dieser Einheit war damit "ungenutzt" — statt ihn verfallen zu
// lassen, rückt die nächste, laut Rotation als Nächstes fällige noch nicht berücksichtigte
// Übung nach. So kann in dieser Einheit bei einer anderen Übung noch ein Vorschlag auftauchen,
// der ohne die Ablehnung sonst nicht gekommen wäre.
function promoteNextPerfSuggestionSlot(){
  const q = perfSuggestionQuota;
  if (!q || q.sessionKey !== (active && active.startedAt)) return;
  if (q.nextPromoteIndex >= q.eligibleSorted.length) return; // niemand mehr zum Nachrücken übrig
  q.allowedIds.add(q.eligibleSorted[q.nextPromoteIndex]);
  q.nextPromoteIndex++;
}
// Merkt sich, wann eine Übung zuletzt einen Performancemodus-Vorschlag bekommen hat — auch
// wenn er abgelehnt wurde, denn "an der Reihe war" sie trotzdem schon (siehe
// computePerfSuggestionQuota()). Nicht kritisch für den Ablauf, daher ohne await gespeichert.
function markPerfSuggestionShown(exerciseId){
  if (!plan.perfSuggestionLastShown) plan.perfSuggestionLastShown = {};
  plan.perfSuggestionLastShown[exerciseId] = new Date().toISOString();
  saveJSON('plan', plan);
}

// Zeigt den Performancemodus-Vorschlag automatisch an, sobald man in einer Übung ist —
// ganz ohne vorher irgendwo klicken zu müssen. Grundlage ist der bereits vorausgefüllte
// erste Satz (die "gemerkten" Werte vom letzten Mal, siehe buildEntry()), verglichen mit
// checkPerformanceSuggestion(). Wird pro Trainingseinheit nur einmal pro Übung angeboten:
// nach Ablehnen (rotes X / Klick daneben) merkt sich der Eintrag "_perfSuggestionDismissed",
// damit der Vorschlag nicht bei jedem Rerender erneut aufploppt.
function maybeShowPerfSuggestion(entry, ei, currentPlanEx){
  if (!plan.performanceMode || !entry) return;
  if (perfSuggestion) return; // es ist schon ein Vorschlag offen
  if (entry._perfSuggestionDismissed) return;
  if (!computePerfSuggestionQuota().has(entry.exerciseId)) return; // außerhalb des einstellbaren Prozent-Kontingents dieser Einheit
  const si = 0;
  const set = entry.sets[si];
  if (!set || set.done) return;
  if (entry.type === 'time'){
    // Reine Zeit-Übungen ohne Kardiogerät (z. B. Plank) bekommen bewusst keinen
    // automatischen Vorschlag — nur Kardiogeräte schlagen "30 Sekunden länger" vor.
    if (!currentPlanEx || !currentPlanEx.cardioMachine) return;
    const suggestion = checkCardioPerfSuggestion(entry.exerciseId, si, set.seconds);
    if (suggestion){
      perfSuggestion = { entryIndex: ei, setIndex: si, seconds: suggestion.seconds };
      markPerfSuggestionShown(entry.exerciseId);
    }
    return;
  }
  const suggestion = checkPerformanceSuggestion(entry.exerciseId, si, set.weight, set.reps, currentPlanEx);
  if (suggestion){
    perfSuggestion = { entryIndex: ei, setIndex: si, weight: suggestion.weight, reps: suggestion.reps };
    markPerfSuggestionShown(entry.exerciseId);
  }
}

// Wird speziell beim Bestätigen eines Performancemodus-Vorschlags genutzt (siehe unten in
// renderActive()).
// Angenommener Performance-Vorschlag (perfSuggestConfirm) hebt Gewicht/Wdh. bzw. Dauer
// nicht nur im vorgeschlagenen Satz an, sondern überschreibt AUCH alle weiteren Sätze der
// Übung bedingungslos mit dem neuen Wert — unabhängig davon, was dort vorher stand (anders
// als applySetValueAndPropagate() unten, die nur wirklich leere Folge-Sätze vorausfüllt).
// Eine angenommene Steigerung soll für die ganze Übung gelten, nicht nur für einen Satz.
function applyPerfSuggestionAndPropagate(entry, si, values){
  Object.assign(entry.sets[si], values);
  for (let j = si + 1; j < entry.sets.length; j++){
    entry.sets[j].weight = values.weight;
    entry.sets[j].reps = values.reps;
  }
}

// Kardio-Pendant zu applyPerfSuggestionAndPropagate(): hebt die Sekunden im vorgeschlagenen
// Satz an und überschreibt sie bedingungslos auch in allen weiteren Sätzen der Übung.
function applyPerfTimeSuggestionAndPropagate(entry, si, newSeconds){
  entry.sets[si].seconds = newSeconds;
  for (let j = si + 1; j < entry.sets.length; j++){
    entry.sets[j].seconds = newSeconds;
  }
}

// Trägt weight/reps (bzw. seconds) in Satz "si" ein und schreibt den Wert dabei nach unten in
// die jeweils gleiche Spalte der folgenden Sätze fort — aber wirklich NUR in Felder, die dort
// noch komplett leer sind (kein Platzhalter, keine Zahl, egal ob die vorher schon einmal
// automatisch oder manuell gesetzt wurde). Sobald ein Feld irgendeinen Wert enthält, gilt es
// als belegt: die Fortschreibung stoppt dort für genau dieses Feld, andere Felder (z. B. Wdh.,
// während nur das Gewicht blockiert) laufen davon unabhängig weiter. Jedes Feld wird also für
// sich genommen behandelt, nicht der ganze Satz auf einmal.
function applySetValueAndPropagate(entry, si, values){
  Object.assign(entry.sets[si], values);
  const doneSet = entry.sets[si];
  Object.keys(values).forEach(key => {
    for (let j = si + 1; j < entry.sets.length; j++){
      const nextSet = entry.sets[j];
      const fieldEmpty = nextSet[key] === null || nextSet[key] === undefined;
      if (!fieldEmpty) break; // sobald irgendein Wert im Feld steht, hier stoppen — egal woher er kam
      nextSet[key] = doneSet[key];
    }
  });
}

// Berechnet aus einem Gewicht das nächste tatsächlich einstellbare Rastergewicht (siehe
// weightStepFor()/weightBaseFor(), z. B. Beinpresse 5-13-21-29..., weightBase 5 / weightStep 8)
// in die angegebene Richtung: direction 1 = Gewicht erhöhen (normale Übungen), -1 = Gewicht
// senken (assistierte Übungen wie die Klimmzugmaschine, wo weniger Unterstützungsgewicht = mehr
// Eigenleistung = die eigentliche Steigerung ist). "weight + step" würde bei nicht rasterkonform
// gespeicherten Werten (z. B. manuell eingetragen) auf einen am Gerät gar nicht einstellbaren
// Wert landen — stattdessen immer der nächste Rasterwert STRIKT ober- bzw. unterhalb.
function nextGridWeight(weight, direction, planEx){
  const step = weightStepFor(planEx);
  const base = weightBaseFor(planEx);
  const n = (weight - base) / step;
  const newWeight = direction === -1
    ? Math.max(Math.min(0, base), base + (Math.ceil(n) - 1) * step)
    : base + (Math.floor(n) + 1) * step;
  if (direction === -1 && newWeight >= weight) return null; // Unterstützungsgewicht ist schon am Minimum, keine weitere Steigerung möglich
  return newWeight;
}

// Wdh.-Zielbereich einer Übung (ex.repsMin/repsMax, siehe Übungen-Editor) — Fallback 8-12 für
// den unwahrscheinlichen Fall, dass an einer Übung (noch) keine eigenen Werte hinterlegt sind.
function repsRangeFor(planEx){
  const min = (planEx && Number.isFinite(planEx.repsMin)) ? planEx.repsMin : 8;
  const maxRaw = (planEx && Number.isFinite(planEx.repsMax)) ? planEx.repsMax : 12;
  return { min, max: Math.max(min, maxRaw) };
}


// Prüft, ob für die gerade abgehakte Kombination (exerciseId, Satz-Position si, weight, reps)
// ein Steigerungs-Vorschlag angezeigt werden soll. Bei normalen Übungen reicht es, wenn die
// beiden letzten gespeicherten Einheiten an dieser Satz-Position dieselbe Kombination hatten;
// bei assistierten Übungen (z. B. Klimmzugmaschine, ex.assisted) müssen es die letzten DREI
// Einheiten sein, bevor eine (dort umgekehrte) Steigerung vorgeschlagen wird.
// Wird ein Vorschlag abgelehnt, bleiben die Werte unverändert — beim nächsten Training mit
// dieser Übung tauchen dieselben "Treffer" in der Historie also wieder auf und der
// Vorschlag erscheint erneut, ganz ohne eigene "schon abgelehnt"-Markierung in der Historie
// selbst (siehe aber entry._perfSuggestionDismissed für die aktuelle Trainingseinheit).
// Höchste jemals benötigte Anzahl an Vergleichs-Einheiten (siehe requiredMatchesFor()) — legt
// fest, wie viele vergangene Einheiten pro Übung in lastPerformance aufgehoben werden. Muss
// mindestens dem höchstmöglichen Eingabewert (perfThresholdInput, max. 20) minus 1, plus 1
// (assistiert) entsprechen.
const PERF_HISTORY_DEPTH = 20;

// Wie viele vorangegangene Einheiten mit identischer Dauer nötig sind, bevor bei einer
// Kardio-Übung ein Steigerungs-Vorschlag erscheint — abhängig vom frei einstellbaren
// Schwellwert (plan.performanceThreshold, Zahlenfeld in den Einstellungen, Standard: 3 = ab
// dem 3. Mal). Gilt NUR für Kardio-Übungen (checkCardioPerfSuggestion()) — Kraftübungen nutzen
// seit der Umstellung auf doppelte Progression stattdessen den Wdh.-Zielbereich der Übung
// (siehe checkPerformanceSuggestion()), unabhängig von diesem Schwellwert.
// Liest den frei einstellbaren Prozentsatz für das Performancemodus-Kontingent
// (plan.performancePercentage, Schieberegler in den Einstellungen, Standard: 20%,
// gültige Werte 10-100 in 10er-Schritten) — siehe computePerfSuggestionQuota().
function currentPerfPercentage(){
  const v = plan && plan.performancePercentage;
  if (Number.isInteger(v) && v >= 10 && v <= 100 && v % 10 === 0) return v;
  return 20;
}

function requiredMatchesFor(assisted){
  const threshold = Number.isInteger(plan.performanceThreshold) && plan.performanceThreshold >= 2 ? plan.performanceThreshold : 3;
  const base = threshold - 1;
  return assisted ? base + 1 : base;
}

function checkPerformanceSuggestion(exerciseId, si, weight, reps, planEx){
  if (weight == null || reps == null) return null;
  const assisted = !!(planEx && planEx.assisted);
  const { min: repsMin, max: repsMax } = repsRangeFor(planEx);
  const history = lastPerformance[exerciseId];
  // Doppelte Progression: erst wenn WIRKLICH JEDER Satz der letzten protokollierten Einheit
  // (nicht nur der erste) den oberen Rand des Wdh.-Zielbereichs erreicht hat — UND dabei
  // durchgehend dasselbe Gewicht genutzt wurde (sonst lässt sich "eine Stufe höher" nicht sauber
  // ableiten) — gilt die aktuelle Gewichtsstufe als ausgereizt. Erst dann wird der nächste
  // Gewichtsschritt vorgeschlagen, mit dem Wdh.-Ziel zurück auf den unteren Rand des Bereichs.
  // Liegt auch nur ein Satz noch darunter, gibt es KEINEN Vorschlag — dort soll beim gleichen
  // Gewicht einfach an den Wiederholungen weitergearbeitet werden, ganz ohne Popup dafür.
  const lastSets = Array.isArray(history) && Array.isArray(history[0]) ? history[0] : null;
  if (!lastSets || !lastSets.length) return null;
  const baseWeight = lastSets[0].weight;
  if (baseWeight == null) return null;
  const allAtTop = lastSets.every(s => s && s.weight === baseWeight && s.reps != null && s.reps >= repsMax);
  if (!allAtTop) return null;
  // RPE-bewusste Bremse (nur wirksam, wenn RPE-Erfassung aktiv ist, siehe rpeEnabled() in
  // 04-utils.js): war der letzte Satz der letzten Einheit bereits sehr hart
  // (RPE >= RPE_HIGH_THRESHOLD, praktisch Muskelversagen/kurz davor), auch wenn formal alle
  // Sätze den oberen Rand erreicht haben, ist das eher die aktuelle Belastungsgrenze als
  // Spielraum für mehr Gewicht — eine Steigerung würde hier eher zu Formverlust/
  // Verletzungsrisiko führen als zu echtem Fortschritt. Fehlt der RPE-Wert, bleibt das
  // Verhalten unverändert — die Bremse greift nur bei einem tatsächlich eingetragenen, hohen Wert.
  if (rpeEnabled()){
    const lastSet = lastSets[lastSets.length - 1];
    if (lastSet && typeof lastSet.rpe === 'number' && lastSet.rpe >= RPE_HIGH_THRESHOLD) return null;
  }
  const newWeight = nextGridWeight(baseWeight, assisted ? -1 : 1, planEx);
  if (newWeight == null) return null;
  return { weight: newWeight, reps: repsMin };
}

// Kardio-Pendant zu checkPerformanceSuggestion(): schlägt "30 Sekunden länger" vor, sobald
// dieselbe Dauer an dieser Satz-Position in den letzten requiredMatchesFor(false) Einheiten
// identisch war (Level-abhängig, siehe requiredMatchesFor()) — bewusst ohne Berücksichtigung
// von Neigung/Tempo/Widerstand (die bleiben beim Vorschlag unverändert, nur die Sekunden
// werden im Popup vorausgefüllt).
function checkCardioPerfSuggestion(exerciseId, si, seconds){
  if (seconds == null) return null;
  const requiredMatches = requiredMatchesFor(false);
  const history = lastPerformance[exerciseId];
  if (!Array.isArray(history) || history.length < requiredMatches) return null;
  for (let i = 0; i < requiredMatches; i++){
    const s = Array.isArray(history[i]) ? history[i][si] : null;
    if (!s || s.seconds !== seconds) return null;
  }
  return { seconds: seconds + 30 };
}
// Simuliert natives, flüssig ausklingendes Momentum-Scrolling (wie in den meisten Apps),
// nachdem der Finger losgelassen wurde. Wird gebraucht, weil touch-action:none auf den
// Kacheln natives Scrollen unterbindet und wir es deshalb per JS nachbilden müssen.
function applyScrollMomentum(axis, initialVelocity, stripEl){
  // initialVelocity ist in px/ms; zu kleine Werte lohnen keine Animation.
  if (!axis || Math.abs(initialVelocity) < 0.02) return;
  let velocity = Math.max(-3, Math.min(3, initialVelocity)); // px/ms, gedeckelt
  const friction = 0.95; // Abklingfaktor pro Frame (~60fps)
  let lastTs = null;

  function step(ts){
    if (lastTs === null) lastTs = ts;
    const dt = Math.min(32, ts - lastTs); // Frame-Zeit deckeln gegen Ausreißer
    lastTs = ts;
    const delta = velocity * dt;
    if (axis === 'x'){
      if (stripEl) stripEl.scrollLeft += delta;
    } else {
      window.scrollBy(0, delta);
    }
    velocity *= Math.pow(friction, dt / 16.67);
    if (Math.abs(velocity) > 0.02){
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}

// Verschiebt eine ganze Drag-Einheit (eine einzelne Übung ODER ein Supersatz-Paar als Block,
// siehe computeThumbUnits()) an die Stelle einer Ziel-Einheit — über Objekt-Referenzen statt
// roher Indizes, damit das auch nach dem Entfernen der verschobenen Einträge noch korrekt
// funktioniert. Gibt die verschobenen Entries zurück (1 oder 2, in ihrer Reihenfolge).
function moveThumbUnitTo(units, fromUnitIdx, toUnitIdx){
  const fromUnit = units[fromUnitIdx];
  const targetUnit = units[toUnitIdx];
  const forward = toUnitIdx > fromUnitIdx;
  const boundaryEntry = forward ? active.entries[targetUnit.endIndex] : active.entries[targetUnit.startIndex];
  const count = fromUnit.endIndex - fromUnit.startIndex + 1;
  const moved = active.entries.splice(fromUnit.startIndex, count);
  const boundaryIndex = active.entries.indexOf(boundaryEntry);
  const insertAt = forward ? boundaryIndex + 1 : boundaryIndex;
  active.entries.splice(insertAt, 0, ...moved);
  return moved;
}

function wireThumbDrag(){
  const strip = app.querySelector('.thumb-strip');
  const units = computeThumbUnits();
  // Wurzel-Element pro Einheit: bei einer einzelnen Übung die Kachel selbst, bei einem
  // Supersatz-Paar der gemeinsame Rahmen-Container (dessen Transform bewegt beide Kacheln
  // darin automatisch gemeinsam — genau das "als zusammenhängende Übung verschieben").
  const unitEls = units.map(u => {
    const firstThumb = app.querySelector(`.thumb[data-thumb="${u.startIndex}"]`);
    if (u.startIndex === u.endIndex) return firstThumb;
    return firstThumb ? firstThumb.closest('.thumb-superset-group') : null;
  });
  const GAP_PX = 10; // Abstand zwischen den Kacheln (siehe .thumb-strip{gap:10px} in styles.css)
  const LONG_PRESS_MS = 350;
  const MOVE_CANCEL_PX = 8;
  const SUPERSET_HOLD_MS = 900; // "eine Weile halten" = 0,9 Sekunden (vorher 0,7s — bewusst
                                 // etwas länger, damit ein normales Umsortieren nicht mehr so
                                 // leicht aus Versehen als Supersatz-Verknüpfung endet).
  const UNLINK_HOLD_MS = 1200; // Supersatz auflösen: 1,2 Sekunden halten ohne zu ziehen
  const EDGE_SCROLL_PX = 56;   // Randzone der Leiste, ab der beim Ziehen automatisch gescrollt wird
  const EDGE_SCROLL_MAX_SPEED = 16; // px pro Frame direkt an der Kante, linear abnehmend zur Zonenmitte

  units.forEach((unit, unitIdx) => {
    const rootEl = unitEls[unitIdx];
    if (!rootEl) return;
    const canCreateSuperset = unit.startIndex === unit.endIndex && supersetsFeatureEnabled();
    // Bei einem Supersatz-Paar löst das Greifen JEDER der beiden inneren Kacheln dieselbe
    // Drag-Geste für die GESAMTE Einheit aus.
    const grabEls = canCreateSuperset ? [rootEl] : Array.from(rootEl.querySelectorAll('.thumb[data-thumb]'));

    grabEls.forEach(grabEl => {
      grabEl.addEventListener('pointerdown', (e) => {
        const fromIndex = Number(grabEl.dataset.thumb); // konkret angefasste Kachel (für Tap/Long-Press-Ziel)
        const fromUnitIdx = unitIdx;
        let targetUnitIdx = fromUnitIdx;
        const startX = e.clientX;
        const startY = e.clientY;
        let lastX = startX;
        let lastY = startY;
        // mode: 'pending' (noch unentschieden) -> 'armed' (lang genug gehalten) -> 'dragging'
        //        oder 'pending' -> 'scrolling' (Finger hat sich zu früh bewegt)
        let mode = 'pending';
        let scrollAxis = null; // 'x' oder 'y', wird beim ersten deutlichen Ausschlag festgelegt
        let lastMoveTime = performance.now();
        let velocity = 0; // px/ms in der aktiven Scroll-Achse, für Momentum nach dem Loslassen

        // Für die Ziel-Erkennung während des Ziehens (siehe updateDragTarget()): die
        // tatsächlichen Positionen ALLER Einheiten in der Leiste, einmalig beim Start des
        // eigentlichen Drags vermessen (nicht schon bei pointerdown, da bis dahin noch gar
        // nicht feststeht, ob überhaupt gezogen wird). Dank echter, gemessener Breiten (statt
        // einer pauschalen Schätzung) bleibt die Vorschau auch bei unterschiedlich breiten
        // Supersatz-Kästen präzise — das war vorher die Hauptursache für ein "hackeliges"
        // Verschieben und dafür, dass man nicht gezielt zwischen zwei bestimmte Übungen
        // schieben konnte.
        let unitMetrics = null;
        let initialScrollLeft = strip ? strip.scrollLeft : 0;
        let autoScrollFrameId = null;

        // Supersatz-Erkennung während des Ziehens: separat von der Reihenfolge-Vorschau.
        let hoverTarget = null;
        let hoverTimer = null;
        let highlightEl = null;
        let supersetArmed = false;

        const clearSupersetHover = () => {
          clearTimeout(hoverTimer);
          if (highlightEl) highlightEl.classList.remove('thumb-superset-hover', 'thumb-superset-armed');
          highlightEl = null;
          hoverTarget = null;
          supersetArmed = false;
        };

        // Supersatz auflösen: nur relevant, wenn die angefasste Kachel gerade Teil eines
        // Supersatzes ist. Wird komplett unabhängig vom normalen 350ms-Drag-Arm über einen
        // eigenen, deutlich längeren Timer erkannt (UNLINK_HOLD_MS) — feuert automatisch
        // WÄHREND des Haltens (nicht erst beim Loslassen), solange bis dahin weder gezogen
        // noch gescrollt wurde.
        const entryAtStart = active.entries[fromIndex];
        const partnerIdAtStart = entryAtStart ? findSupersetPartnerExerciseId(entryAtStart.exerciseId) : null;
        let unlinkFired = false;
        const unlinkTimer = partnerIdAtStart ? setTimeout(() => {
          if (mode === 'dragging' || mode === 'scrolling') return;
          unlinkFired = true;
          clearTimeout(longPressTimer);
          rootEl.style.transition = '';
          rootEl.style.transform = '';
          try{ grabEl.releasePointerCapture(e.pointerId); }catch(err){}
          unlinkSupersetGroup(entryAtStart.exerciseId);
          renderActive();
        }, UNLINK_HOLD_MS) : null;

        const longPressTimer = setTimeout(() => {
          if (mode !== 'pending') return;
          mode = 'armed';
          try{ grabEl.setPointerCapture(e.pointerId); }catch(err){}
          rootEl.style.transition = 'transform .1s ease';
          rootEl.style.transform = 'scale(1.08)';
          if (navigator.vibrate) navigator.vibrate(10);
        }, LONG_PRESS_MS);

        // Vermisst Position und Breite jeder Einheit EINMALIG beim Start des eigentlichen
        // Drags — bewusst in INHALTS-Koordinaten der Leiste (also inklusive scrollLeft), damit
        // die Werte auch dann gültig bleiben, wenn die Leiste während des Ziehens automatisch
        // weiterscrollt (siehe autoScrollLoop()).
        const measureUnits = () => {
          const stripLeft = strip ? strip.getBoundingClientRect().left : 0;
          const stripScroll = strip ? strip.scrollLeft : 0;
          return unitEls.map(el => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const left = r.left - stripLeft + stripScroll;
            return { left, width: r.width, center: left + r.width / 2 };
          });
        };

        const beginDrag = () => {
          mode = 'dragging';
          clearTimeout(unlinkTimer);
          initialScrollLeft = strip ? strip.scrollLeft : 0;
          unitMetrics = measureUnits();
          rootEl.style.transition = 'none';
          rootEl.style.zIndex = 5;
          unitEls.forEach(t => { if (t && t !== rootEl) t.style.transition = 'transform .18s ease'; });
          autoScrollFrameId = requestAnimationFrame(autoScrollLoop);
        };

        // Scrollt die Leiste automatisch weiter, solange der Finger beim Ziehen nahe an ihrem
        // linken/rechten Rand steht (Geschwindigkeit wächst linear, je näher an der Kante) —
        // sonst war eine weit hinten liegende Übung beim Ziehen praktisch nicht erreichbar,
        // weil man nie weiter ziehen konnte, als der Bildschirm breit ist. Läuft unabhängig von
        // neuen pointermove-Events per rAF, damit auch ein ruhig an der Kante gehaltener Finger
        // weiterscrollt.
        const autoScrollLoop = () => {
          if (mode !== 'dragging' || !strip){ autoScrollFrameId = null; return; }
          const rect = strip.getBoundingClientRect();
          let speed = 0;
          if (lastX < rect.left + EDGE_SCROLL_PX){
            const depth = Math.min(1, (rect.left + EDGE_SCROLL_PX - lastX) / EDGE_SCROLL_PX);
            speed = -depth * EDGE_SCROLL_MAX_SPEED;
          } else if (lastX > rect.right - EDGE_SCROLL_PX){
            const depth = Math.min(1, (lastX - (rect.right - EDGE_SCROLL_PX)) / EDGE_SCROLL_PX);
            speed = depth * EDGE_SCROLL_MAX_SPEED;
          }
          if (speed !== 0){
            const before = strip.scrollLeft;
            strip.scrollLeft = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, strip.scrollLeft + speed));
            if (strip.scrollLeft !== before) updateDragTarget(lastX);
          }
          autoScrollFrameId = requestAnimationFrame(autoScrollLoop);
        };

        // Kernstück des Umsortierens ("Lücke aufziehen"):
        // Gedanklich wird die gezogene Einheit aus der Reihe HERAUSGENOMMEN — die verbleibenden
        // Einheiten rücken dadurch um deren Breite zusammen (compactedCenter unten). Aus dieser
        // gedachten, während des gesamten Ziehens UNVERÄNDERLICHEN Anordnung ergibt sich die
        // Einfügestelle schlicht als "wie viele der übrigen Einheiten liegen links von der
        // gezogenen Kachel". Weil die Bezugswerte dabei fix sind (und nicht selbst mitwandern,
        // wie es beim vorherigen "nächstes Zentrum"-Ansatz der Fall war), springt die Vorschau
        // nicht mehr zwischen zwei Positionen hin und her — genau das war das Hackelige.
        // Anschließend rücken ALLE Einheiten zwischen alter und neuer Position beiseite,
        // inklusive der Einheit an der Zielstelle selbst: dadurch entsteht an der Einfügestelle
        // eine echte, exakt passend breite Lücke, in der die gezogene Kachel sichtbar liegt.
        // `clientX` kommt entweder von einem echten pointermove oder — beim automatischen
        // Scrollen ohne Fingerbewegung — vom zuletzt bekannten `lastX`.
        const updateDragTarget = (clientX) => {
          if (!unitMetrics) return;
          const fromMetric = unitMetrics[fromUnitIdx];
          if (!fromMetric) return;
          const scrollDelta = (strip ? strip.scrollLeft : 0) - initialScrollLeft;
          const dx = clientX - startX;
          // Der Transform gleicht ein zwischenzeitliches Auto-Scrollen der Leiste mit aus,
          // damit die gezogene Kachel optisch exakt am Finger bleibt, egal wie viel im
          // Hintergrund schon gescrollt wurde.
          rootEl.style.transform = `translateX(${dx + scrollDelta}px) translateY(-6px) scale(1.1)`;
          rootEl.style.boxShadow = '0 10px 18px rgba(0,0,0,0.45)';

          // Breite, die die gezogene Einheit in der Reihe belegt (inkl. des Abstands zur
          // nächsten Kachel) — exakt um diesen Betrag rücken die anderen beiseite.
          const draggedWidth = fromMetric.width + GAP_PX;
          // Position der gezogenen Kachel in Inhalts-Koordinaten der Leiste.
          const draggedCenter = fromMetric.center + dx + scrollDelta;

          // Zentren der übrigen Einheiten in der gedachten "ohne die gezogene Einheit"-Reihe.
          const compactedCenter = (i) => unitMetrics[i].center - (i > fromUnitIdx ? draggedWidth : 0);

          let insertIdx = 0; // Position innerhalb der übrigen Einheiten, vor die eingefügt wird
          for (let i = 0; i < unitMetrics.length; i++){
            if (i === fromUnitIdx || !unitMetrics[i]) continue;
            if (compactedCenter(i) < draggedCenter) insertIdx++;
          }
          targetUnitIdx = insertIdx;

          unitEls.forEach((t, i) => {
            if (!t || i === fromUnitIdx || !unitMetrics[i]) return;
            // Laufende Nummer dieser Einheit innerhalb der übrigen (ohne die gezogene).
            const k = i < fromUnitIdx ? i : i - 1;
            let offset = 0;
            if (i < fromUnitIdx && k >= insertIdx) offset = draggedWidth;        // nach rechts, macht Platz
            else if (i > fromUnitIdx && k < insertIdx) offset = -draggedWidth;   // nach links, füllt die alte Lücke
            t.style.transform = offset ? `translateX(${offset}px)` : '';
          });

          // Supersatz per Halten: nur beim Ziehen einer einzelnen (noch ungekoppelten) Übung,
          // und nur, falls die Supersatz-Funktion nicht in den Trainingstools ausgeschaltet
          // wurde (siehe supersetsFeatureEnabled()). Anders als beim Umsortieren zählt hier
          // nicht die Lücke, sondern über WELCHER Kachel die gezogene Kachel tatsächlich liegt:
          // Ziel ist die Einheit, deren aktuell angezeigte Fläche sich am stärksten mit der
          // gezogenen überlappt. Ohne echte Überlappung (also wenn die Kachel sauber in der
          // Lücke sitzt) gibt es bewusst gar kein Ziel — Umsortieren endet dadurch nicht mehr
          // versehentlich in einer Verknüpfung, dafür muss man jetzt spürbar auf eine Kachel
          // draufziehen. Bleibt das Ziel >= SUPERSET_HOLD_MS gleich, wird es erst grau, dann in
          // Akzentfarbe markiert (bereit zum Verknüpfen beim Loslassen).
          let bestUnitIdx = null;
          if (canCreateSuperset){
            let bestOverlap = 0;
            const draggedLeft = draggedCenter - fromMetric.width / 2;
            const draggedRight = draggedCenter + fromMetric.width / 2;
            unitEls.forEach((t, i) => {
              if (i === fromUnitIdx || !unitMetrics[i]) return;
              const u = units[i];
              const size = u ? (u.endIndex - u.startIndex + 1) : 0;
              if (!u || size >= SUPERSET_MAX_SIZE) return; // Ziel-Gruppe wäre bereits voll
              const k = i < fromUnitIdx ? i : i - 1;
              let shift = 0;
              if (i < fromUnitIdx && k >= insertIdx) shift = draggedWidth;
              else if (i > fromUnitIdx && k < insertIdx) shift = -draggedWidth;
              const left = unitMetrics[i].left + shift;
              const right = left + unitMetrics[i].width;
              const overlap = Math.min(draggedRight, right) - Math.max(draggedLeft, left);
              // Mindestens die halbe Kachelbreite muss überdeckt sein, damit es als "draufgezogen" zählt.
              if (overlap > bestOverlap && overlap >= unitMetrics[i].width * 0.5){
                bestOverlap = overlap;
                bestUnitIdx = i;
              }
            });
          }
          if (bestUnitIdx !== null){
            if (bestUnitIdx !== hoverTarget){
              clearSupersetHover();
              hoverTarget = bestUnitIdx;
              highlightEl = unitEls[bestUnitIdx];
              if (highlightEl) highlightEl.classList.add('thumb-superset-hover');
              hoverTimer = setTimeout(() => {
                if (highlightEl){
                  highlightEl.classList.remove('thumb-superset-hover');
                  highlightEl.classList.add('thumb-superset-armed');
                }
                supersetArmed = true;
                if (navigator.vibrate) navigator.vibrate(15);
              }, SUPERSET_HOLD_MS);
            }
          } else if (hoverTarget !== null){
            clearSupersetHover();
          }
        };

        const onMove = (ev) => {
          const now = performance.now();
          const dt = Math.max(1, now - lastMoveTime);
          const dxStep = ev.clientX - lastX;
          const dyStep = ev.clientY - lastY;
          lastX = ev.clientX;
          lastY = ev.clientY;
          lastMoveTime = now;

          if (mode === 'pending'){
            // touch-action:none blockiert natives Scrollen auf den Kacheln komplett,
            // deshalb bilden wir das Scrollen selbst nach, solange noch nicht "gehalten" wurde.
            // Erst wenn eine Richtung eindeutig erkannt ist, wird nur noch diese eine Achse bewegt,
            // damit schräges Wischen nicht gleichzeitig die Seite hoch/runter schiebt.
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            if (!scrollAxis && (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX)){
              scrollAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
              mode = 'scrolling';
              clearTimeout(longPressTimer);
              if (scrollAxis === 'x'){ if (strip) strip.scrollLeft -= dxStep; }
              else { window.scrollBy(0, -dyStep); }
            }
            return;
          }
          if (mode === 'scrolling'){
            if (scrollAxis === 'x'){ velocity = -dxStep / dt; if (strip) strip.scrollLeft -= dxStep; }
            else { velocity = -dyStep / dt; window.scrollBy(0, -dyStep); }
            return;
          }
          if (mode === 'armed') beginDrag();

          ev.preventDefault();
          updateDragTarget(ev.clientX);
        };

        const finish = () => {
          clearTimeout(longPressTimer);
          clearTimeout(unlinkTimer);
          clearSupersetHover();
          if (autoScrollFrameId){ cancelAnimationFrame(autoScrollFrameId); autoScrollFrameId = null; }
          grabEl.removeEventListener('pointermove', onMove);
          grabEl.removeEventListener('pointerup', onUp);
          grabEl.removeEventListener('pointercancel', onCancel);
          unitEls.forEach(t => { if (!t) return; t.style.transform = ''; t.style.transition = ''; t.style.boxShadow = ''; t.style.zIndex = ''; });
        };

        const onUp = () => {
          if (unlinkFired){ finish(); return; }
          const finalMode = mode;
          const finalAxis = scrollAxis;
          const finalVelocity = velocity;
          const finalTargetUnitIdx = targetUnitIdx;
          const finalSupersetArmed = supersetArmed;
          // Ziel der Verknüpfung ist die überlappte Kachel (hoverTarget), NICHT die
          // Einfügeposition der Umsortier-Vorschau — beides ist seit der Lücken-Darstellung
          // bewusst getrennt, siehe updateDragTarget().
          const finalSupersetUnitIdx = hoverTarget;
          finish();
          if (finalMode === 'dragging'){
            if (canCreateSuperset && finalSupersetArmed && finalSupersetUnitIdx !== null && finalSupersetUnitIdx !== fromUnitIdx){
              // Losgelassen, während das Ziel ≥SUPERSET_HOLD_MS markiert war: die beiden
              // Übungen zu einem Supersatz verknüpfen statt normal umzusortieren.
              createSuperset(unit.startIndex, units[finalSupersetUnitIdx].startIndex);
              renderActive();
            } else if (finalTargetUnitIdx !== fromUnitIdx){
              // Vor Ablauf der Haltezeit losgelassen (oder ein Supersatz-Paar bewegt): ganz
              // normale Umsortierung, die Einheit wandert als Block an die neue Stelle.
              const movedEntries = moveThumbUnitTo(units, fromUnitIdx, finalTargetUnitIdx);
              active.currentIndex = active.entries.indexOf(movedEntries[0]);
              renderActive();
            } else {
              renderActive();
            }
          } else if (finalMode === 'scrolling'){
            applyScrollMomentum(finalAxis, finalVelocity, strip);
          } else if (finalMode === 'pending' && fromIndex === active.currentIndex){
            // Ein einfaches Tippen (kein Ziehen, kein Scrollen) auf die ohnehin schon aktive
            // Kachel hatte bisher keine sichtbare Wirkung (currentIndex blieb gleich) — dieser
            // Fall wird jetzt stattdessen für das Bild-Popup genutzt. Bewusst als eigener,
            // zusätzlicher Zweig statt einer Änderung an der bestehenden Drag/Scroll-Logik
            // oben, damit Long-Press-Drag zum Umsortieren garantiert unangetastet bleibt.
            const tappedEntry = active.entries[fromIndex];
            const tappedPlanEx = tappedEntry ? plan.exercises.find(x => x.id === tappedEntry.exerciseId) : null;
            if (tappedPlanEx){
              openExerciseImagePopup(tappedPlanEx);
            } else {
              active.currentIndex = fromIndex;
              renderActive();
            }
          } else {
            active.currentIndex = fromIndex;
            renderActive();
          }
        };
        const onCancel = () => { finish(); };

        grabEl.addEventListener('pointermove', onMove);
        grabEl.addEventListener('pointerup', onUp);
        grabEl.addEventListener('pointercancel', onCancel);
      });
    });
  });
}

// Trackt, wie lange eine Übung tatsächlich GEÖFFNET war (also gerade auf dem Bildschirm zu
// sehen ist), bis alle ihre Sätze abgehakt sind — Basis für die Zeit-Statistik je Übung/
// Muskelgruppe (siehe computeMuscleGroupTimeSums()/renderExerciseTimeBalance()). Läuft
// zentral bei JEDEM renderActive()-Aufruf: vergleicht den zuletzt getrackten Index
// (active.timeTrackCurrentIndex) mit dem AKTUELLEN active.currentIndex (der von der
// aufrufenden Stelle meist schon VOR renderActive() neu gesetzt wurde) und schreibt die
// seit dem letzten Aufruf vergangene Zeit der bis dahin offenen Übung gut — dadurch muss
// nicht jede einzelne Stelle im Code, die active.currentIndex ändert (Kachel-Tap, Supersatz-
// Weiterschalten, Drag-Umsortierung, Übung hinzufügen/entfernen …), einzeln instrumentiert
// werden. Bei Supersätzen zählt so automatisch NUR die Zeit, in der genau diese Übung gerade
// angezeigt wurde, nicht die des Partners. Zählt NICHT weiter, sobald die Übung beim ÖFFNEN
// bereits fertig war (erneutes Betrachten einer abgehakten Übung soll keine Zeit addieren).
// Pausen (active.pausedAt) werden über denselben "now"-Mechanismus wie die Trainingszeit
// selbst ausgeklammert — WICHTIG: toggleSessionPause() muss dafür beim Start einer Pause
// diese Funktion selbst aufrufen (Zeit bis zur Pause einbuchen) und beim Fortsetzen
// active.timeTrackOpenedAt neu auf "jetzt" setzen, siehe dort.
function accrueExerciseTime(){
  if (!active || !Array.isArray(active.entries)) return;
  const now = active.pausedAt || Date.now();
  if (active.timeTrackOpenedAt != null && active.timeTrackCurrentIndex != null){
    const openEntry = active.entries[active.timeTrackCurrentIndex];
    if (openEntry && !active.timeTrackWasDoneAtOpen){
      const elapsedSec = Math.max(0, Math.round((now - active.timeTrackOpenedAt) / 1000));
      openEntry._timeSpentSec = (openEntry._timeSpentSec || 0) + elapsedSec;
    }
  }
  if (active.timeTrackCurrentIndex !== active.currentIndex){
    active.timeTrackCurrentIndex = active.currentIndex;
    const newEntry = active.entries[active.currentIndex];
    active.timeTrackWasDoneAtOpen = newEntry ? isEntryDone(newEntry) : true;
  }
  active.timeTrackOpenedAt = now;
}
