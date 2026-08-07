/* ---------------------------------------------------
   ACTIVE SESSION
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
  persistActiveSession();
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
   Schlägt automatisch eine kleine Steigerung vor, sobald man eine Übung öffnet, deren
   vorausgefüllter erster Satz (siehe buildEntry()) schon 2x in Folge (bzw. bei assistierten
   Übungen 3x in Folge, siehe checkPerformanceSuggestion()) exakt gleich war.
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
    eligible.sort((a, b) => (lastShown[a] || '').localeCompare(lastShown[b] || ''));
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

// Berechnet aus einem aktuellen (weight, reps) eine "nicht zu große" Steigerung:
// - Ist die Wdh.-Zahl noch unter 12, wird zuerst die Wdh.-Zahl erhöht (max. +2, gedeckelt
//   bei 12) und das Gewicht bleibt gleich (z. B. 8x → 10x gleiches Gewicht).
// - Ist die Wdh.-Zahl schon bei 12 angekommen (bzw. eine Wdh.-Steigerung würde nichts mehr
//   bringen), wird stattdessen das Gewicht angepasst (2,5 kg ist an den meisten
//   Geräten/Hanteln nicht sauber einstellbar, daher 5 kg-Schritte) und die Wdh.-Zahl dafür
//   um 2 gesenkt (nie unter 6 Wdh.).
//   "direction" steuert dabei die Richtung der Gewichtsänderung: 1 = Gewicht erhöhen
//   (normale Übungen), -1 = Gewicht senken (assistierte Übungen wie die Klimmzugmaschine,
//   wo weniger Unterstützungsgewicht = mehr Eigenleistung = die eigentliche Steigerung ist).
function computeProgressionSuggestion(weight, reps, direction, planEx){
  if (weight == null || reps == null || !isFinite(weight) || !isFinite(reps) || reps <= 0) return null;
  if (direction !== -1 && weight <= 0) return null; // 0 kg lässt sich bei normalen Übungen nicht sinnvoll weiter steigern
  if (reps < 12){
    const newReps = Math.min(12, reps + 2);
    if (newReps > reps) return { weight, reps: newReps };
  }
  const step = weightStepFor(planEx);
  const newWeight = direction === -1 ? Math.max(0, weight - step) : weight + step;
  if (direction === -1 && newWeight === weight) return null; // Unterstützungsgewicht ist schon bei 0, keine weitere Steigerung möglich
  return { weight: newWeight, reps: Math.max(6, reps - 2) };
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

// Wie viele vorangegangene Einheiten mit identischem Volumen nötig sind, bevor ein
// Steigerungs-Vorschlag erscheint — abhängig vom frei einstellbaren Schwellwert
// (plan.performanceThreshold, Zahlenfeld in den Einstellungen, Standard: 3 = ab dem 3. Mal).
// Assistierte Übungen (z. B. Klimmzugmaschine) brauchen dabei weiterhin einen Treffer mehr als
// normale Übungen.
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
  const requiredMatches = requiredMatchesFor(assisted);
  const history = lastPerformance[exerciseId];
  if (!Array.isArray(history) || history.length < requiredMatches) return null;
  for (let i = 0; i < requiredMatches; i++){
    const s = Array.isArray(history[i]) ? history[i][si] : null;
    if (!s || s.weight !== weight || s.reps !== reps) return null;
  }
  return computeProgressionSuggestion(weight, reps, assisted ? -1 : 1, planEx);
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

        // Vermisst die aktuelle (noch unverzerrte) Position jeder Einheit in Viewport-
        // Koordinaten — Basis für die präzise Ziel-Erkennung in updateDragTarget().
        const measureUnits = () => unitEls.map(el => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { left: r.left, width: r.width, center: r.left + r.width / 2 };
        });

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

        // Kernstück des Umsortierens: bestimmt anhand der tatsächlichen (gemessenen) Position
        // jeder Einheit, welcher Platz gerade am nächsten an der gezogenen Kachel liegt (statt
        // wie vorher grob nach einer festen Schrittweite zu runden) — das Ziel wechselt dadurch
        // exakt dort, wo man optisch hinzieht, und lässt sich so auch gezielt zwischen zwei
        // bestimmte Übungen schieben. `clientX` kommt entweder von einem echten pointermove
        // oder — beim automatischen Scrollen ohne Fingerbewegung — vom zuletzt bekannten `lastX`.
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

          const draggedCenterNow = fromMetric.center + dx;
          let newTarget = fromUnitIdx;
          let bestDist = Infinity;
          unitMetrics.forEach((m, i) => {
            if (!m) return;
            const centerNow = m.center - scrollDelta;
            const dist = Math.abs(draggedCenterNow - centerNow);
            if (dist < bestDist){ bestDist = dist; newTarget = i; }
          });
          targetUnitIdx = newTarget;

          // Andere Kacheln rutschen nur soweit sie zwischen Start- und aktueller Zielposition
          // liegen, um Platz für die gezogene Einheit zu machen — verschoben wird dabei um deren
          // TATSÄCHLICHE gemessene Breite (statt einer pauschalen Schätzung), damit auch breitere
          // Supersatz-Kästen sauber und ohne Ruckeln einrutschen.
          const draggedWidth = fromMetric.width + GAP_PX;
          unitEls.forEach((t, i) => {
            if (!t || t === rootEl) return;
            if (i === newTarget){ t.style.transform = ''; return; }
            let offset = 0;
            if (fromUnitIdx < newTarget && i > fromUnitIdx && i < newTarget) offset = -draggedWidth;
            else if (fromUnitIdx > newTarget && i < fromUnitIdx && i > newTarget) offset = draggedWidth;
            t.style.transform = offset ? `translateX(${offset}px)` : '';
          });

          // Supersatz per Halten: nur beim Ziehen einer einzelnen (noch ungekoppelten) Übung,
          // und nur, falls die Supersatz-Funktion nicht in den Trainingstools ausgeschaltet
          // wurde (siehe supersetsFeatureEnabled()). Ziel darf entweder eine andere einzelne
          // Übung (→ neue 2er-Gruppe) ODER eine bestehende, noch nicht volle Gruppe sein (→ wird
          // auf bis zu SUPERSET_MAX_SIZE erweitert, die gezogene Übung landet dabei immer als
          // letztes Mitglied — siehe createSuperset()). Bleibt das Ziel ≥SUPERSET_HOLD_MS gleich,
          // wird es erst grau, dann in Akzentfarbe markiert (bereit zum Verknüpfen beim Loslassen).
          const targetUnit = units[newTarget];
          const targetUnitSize = targetUnit ? (targetUnit.endIndex - targetUnit.startIndex + 1) : 0;
          const targetEligible = canCreateSuperset && newTarget !== fromUnitIdx
            && targetUnit && targetUnitSize < SUPERSET_MAX_SIZE;
          if (targetEligible){
            if (newTarget !== hoverTarget){
              clearSupersetHover();
              hoverTarget = newTarget;
              highlightEl = unitEls[newTarget];
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
          finish();
          if (finalMode === 'dragging'){
            if (canCreateSuperset && finalSupersetArmed && finalTargetUnitIdx !== fromUnitIdx){
              // Losgelassen, während das Ziel ≥SUPERSET_HOLD_MS markiert war: die beiden
              // Übungen zu einem Supersatz verknüpfen statt normal umzusortieren.
              createSuperset(unit.startIndex, units[finalTargetUnitIdx].startIndex);
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
function renderActive(){
  accrueExerciseTime();
  persistActiveSession();
  // Der Übungs-Bilderleiste (.thumb-strip) wird bei JEDEM renderActive() komplett neu aus dem
  // Template gebaut (app.innerHTML = ...) — ein frisches DOM-Element hat scrollLeft standardmäßig
  // wieder 0, wodurch die Leiste bei jedem Re-Render (Übung abhaken, Übung starten, Umsortieren,
  // Timer-Tick, etc.) sichtbar an den Anfang zurückspringt, auch wenn man selbst gar nicht
  // gewischt hat. Fix: Scroll-Position VOR dem Neuaufbau merken und danach 1:1 wiederherstellen —
  // die Leiste bewegt sich dadurch wirklich nur noch, wenn die Person selbst wischt (kein
  // automatisches Zurück- oder Vorspringen mehr).
  const prevStripEl = app.querySelector('.thumb-strip');
  const prevStripScrollLeft = prevStripEl ? prevStripEl.scrollLeft : null;
  if (active.currentIndex >= active.entries.length) active.currentIndex = Math.max(0, active.entries.length - 1);
  const ei = active.currentIndex;
  const entry = active.entries[ei];
  const currentPlanEx = entry ? plan.exercises.find(x => x.id === entry.exerciseId) : null;

  // Ein noch offener Performancemodus-Vorschlag gehört immer zur Übung, bei der er ausgelöst
  // wurde — wechselt man währenddessen die Übung (Kachel-Leiste), verwirft sich der Vorschlag
  // stillschweigend (die zugrunde liegenden Satz-Werte bleiben dabei unverändert).
  if (perfSuggestion && (perfSuggestion.entryIndex !== ei || !entry || perfSuggestion.setIndex >= entry.sets.length)){
    perfSuggestion = null;
  }
  maybeShowPerfSuggestion(entry, ei, currentPlanEx);

  const renderThumbButtonHTML = (e, i) => {
    const planEx = plan.exercises.find(x => x.id === e.exerciseId);
    const img = planEx && planEx.imageData;
    return `
    <button class="thumb ${i === ei ? 'active' : ''} ${isEntryDone(e) ? 'done' : ''}" data-thumb="${i}" aria-label="${e.name}">
      <span class="thumb-media">
        ${img ? `<img class="thumb-img" src="${img}" alt="">` : `<span class="thumb-initials">${initials(e.name)}</span>`}
      </span>
      ${isEntryDone(e) ? '<span class="thumb-check">✓</span>' : ''}
    </button>
  `;
  };
  const thumbUnits = computeThumbUnits();
  const thumbsHTML = thumbUnits.map(u => {
    if (u.startIndex === u.endIndex){
      return renderThumbButtonHTML(active.entries[u.startIndex], u.startIndex);
    }
    const isGroupActive = (ei >= u.startIndex && ei <= u.endIndex);
    let memberThumbsHTML = '';
    for (let idx = u.startIndex; idx <= u.endIndex; idx++){
      memberThumbsHTML += renderThumbButtonHTML(active.entries[idx], idx);
    }
    return `
    <div class="thumb-superset-group ${isGroupActive ? 'thumb-superset-group-active' : ''}">
      <span class="thumb-superset-label">Supersatz</span>
      ${memberThumbsHTML}
    </div>
  `;
  }).join('') + `<button class="thumb thumb-add" id="thumbAdd" aria-label="Übung hinzufügen">+</button>`;

  const addedIds = new Set(active.entries.map(x => x.exerciseId));
  const available = plan.exercises.filter(x => !addedIds.has(x.id));
  const availableGroups = {};
  available.forEach(x => {
    const g = x.muscleGroup || 'Sonstige';
    (availableGroups[g] = availableGroups[g] || []).push(x);
  });
  const orderedAvailableGroups = MUSCLE_GROUP_ORDER.filter(g => availableGroups[g] && availableGroups[g].length);
  Object.keys(availableGroups).forEach(g => { if (!orderedAvailableGroups.includes(g)) orderedAvailableGroups.push(g); });
  const defaultOpenGroups = defaultOpenAddExerciseGroups(availableGroups);

  const addExerciseHTML = !addExerciseOpen ? '' : `
    <div class="add-exercise-overlay" id="addExerciseOverlay">
      <div class="add-exercise-modal">
        <div class="add-exercise-modal-header">
          <div class="add-exercise-modal-title">Übung hinzufügen</div>
          <button class="add-exercise-modal-close" id="btnCloseAddExercise" aria-label="Schließen">✕</button>
        </div>
        <div class="add-exercise-modal-body">
          <input type="text" id="addExerciseSearch" class="plan-search" placeholder="Übung oder Muskel suchen…" style="margin-bottom:14px;">
          ${available.length ? orderedAvailableGroups.map(g => {
            const items = availableGroups[g];
            // Jede Muskelgruppe ist ein vollwertiges Akkordeon (konsistent mit dem Rest der
            // App), unabhängig von der Anzahl Übungen — vorher blieben kleine Gruppen (≤5
            // Übungen) als reine flache Liste ohne Auf-/Zuklapp-Kopf stehen, was optisch aus
            // dem Design fiel.
            // XOR aus Mode-Standard und manuellem Toggle: eine Gruppe, die laut Modus
            // standardmäßig offen ist, klappt beim Antippen trotzdem normal zu (und
            // umgekehrt) — addExerciseGroupOpen hält dabei weiterhin nur die "vom Standard
            // abweichenden" Gruppen fest, siehe defaultOpenAddExerciseGroups().
            const isOpen = defaultOpenGroups.has(g) !== addExerciseGroupOpen.has(g);
            const itemsHTML = items.map(x => `
              <div class="add-exercise-row" data-addex="${x.id}" role="button" tabindex="0">
                ${x.imageData ? `<img class="add-exercise-thumb" src="${x.imageData}" alt="">` : `<span class="add-exercise-thumb-fallback">${initials(x.name)}</span>`}
                <div class="add-exercise-mid">
                  <div class="add-exercise-name">${exerciseNameHTML(x.name)}</div>
                  <div class="add-exercise-meta">${x.mainMuscle || x.muscleGroup || ''}</div>
                </div>
                <span class="add-exercise-plus">+</span>
              </div>
            `).join('');
            return `
              <button class="muscle-group-header" data-addexgroup="${g}" type="button">
                <span class="mg-name">${g}</span>
                <span class="mg-meta">${items.length} Übungen <span class="mg-arrow">${isOpen ? '▾' : '▸'}</span></span>
              </button>
              <div class="muscle-group-body" style="display:${isOpen ? 'block' : 'none'}">
                ${itemsHTML}
              </div>
            `;
          }).join('') : '<div class="history-empty">Alle Übungen aus dem Plan sind bereits in dieser Einheit.</div>'}
        </div>
      </div>
    </div>
  `;

  const setsHeaderHTML = entry ? (entry.type === 'time' ? `
    <div class="sets-header sets-header-time">
      <span class="sets-header-cell"></span>
      <span class="sets-header-cell">${currentPlanEx && currentPlanEx.cardioMachine ? '' : 'Sek.'}</span>
      <span class="sets-header-cell"></span>
      <span class="sets-header-cell"></span>
    </div>
  ` : `
    <div class="sets-header">
      <span class="sets-header-cell"></span>
      <span class="sets-header-cell">KG</span>
      <span class="sets-header-cell">WDH</span>
      <button class="sets-header-cell sets-header-cell-toggle" id="btnToggleSetMetric" type="button">${activeSetMetricMode === 'vol' ? 'VOL' : activeSetMetricMode === '10rm' ? '10RM' : '1RM'}</button>
      <span class="sets-header-cell"></span>
      <span class="sets-header-cell"></span>
    </div>
  `) : '';

  const setsHTML = entry ? entry.sets.map((set, si) => {
    const isSuggestSet = !!(perfSuggestion && perfSuggestion.entryIndex === ei && perfSuggestion.setIndex === si);
    return entry.type === 'time' ? `
    <div class="set-row set-row-time ${set.done ? 'set-done' : ''} ${isSuggestSet ? 'perf-suggest-active' : ''}" data-set="${si}">
      <span class="set-idx">${isSuggestSet ? `<svg class="perf-suggest-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20V4"></path><path d="M5 11l7-7 7 7"></path></svg>` : si+1}</span>
      ${isSuggestSet ? `
      <input type="number" inputmode="numeric" enterkeyhint="done" id="perfSuggestSeconds" value="${perfSuggestion.seconds}" aria-label="Sekunden">
      ` : currentPlanEx && currentPlanEx.cardioMachine ? `
      <div class="mmss-field-row">
        <div class="set-mmss">
          <input type="number" inputmode="numeric" enterkeyhint="done" placeholder="Min" min="0" value="${set.seconds != null ? Math.floor(set.seconds / 60) : ''}" data-mmss="min">
          <span class="set-mmss-sep">:</span>
          <input type="number" inputmode="numeric" enterkeyhint="done" placeholder="Sek" min="0" max="59" value="${set.seconds != null ? String(set.seconds % 60).padStart(2,'0') : ''}" data-mmss="sec">
        </div>
        <button type="button" class="seconds-timer-btn" data-start-timer="${si}" aria-label="Stoppuhr für Satz ${si+1} starten">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l3 2"></path><path d="M9 2h6"></path></svg>
        </button>
      </div>
      ` : `
      <div class="seconds-field-row">
        <input type="number" inputmode="numeric" enterkeyhint="done" placeholder="Sekunden" value="${set.seconds ?? ''}" data-field="seconds">
        <button type="button" class="seconds-timer-btn" data-start-timer="${si}" aria-label="Stoppuhr für Satz ${si+1} starten">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l3 2"></path><path d="M9 2h6"></path></svg>
        </button>
      </div>
      `}
      ${isSuggestSet ? `
      <button class="perf-suggest-row-confirm" id="perfSuggestConfirm" type="button" aria-label="Vorschlag übernehmen">✓</button>
      <button class="perf-suggest-row-reject" id="perfSuggestReject" type="button" aria-label="Vorschlag ablehnen">✕</button>
      ` : `
      <button class="set-check ${set.done ? 'checked' : ''}" data-checkset="${si}" aria-label="Satz ${si+1} erledigt">✓</button>
      ${currentPlanEx && currentPlanEx.cardioMachine ? '' : `<button class="icon-x" data-removeset="${si}" aria-label="Satz ${si+1} entfernen">✕</button>`}
      `}
    </div>
    ${cardioFieldsFor(currentPlanEx).length ? `
    <div class="set-cardio-extra" data-set="${si}">
      ${cardioFieldsFor(currentPlanEx).map(f => `
        <div class="set-cardio-field">
          <label>${f.label}</label>
          <input type="number" inputmode="decimal" enterkeyhint="done" step="${f.step}" min="${f.min ?? 0}" ${f.max !== undefined ? `max="${f.max}"` : ''} value="${set[f.key] ?? ''}" data-field="${f.key}">
        </div>
      `).join('')}
      ${currentPlanEx.cardioMachine === 'laufband' ? `
        <div class="set-cardio-distance" id="cardioDistance${si}">${cardioDistanceKm(currentPlanEx, set) != null ? `≈ ${cardioDistanceKm(currentPlanEx, set).toLocaleString('de-DE')} km` : ''}</div>
      ` : ''}
    </div>` : ''}
  ` : `
    <div class="set-row ${set.done ? 'set-done' : ''} ${isSuggestSet ? 'perf-suggest-active' : ''}" data-set="${si}">
      <span class="set-idx">${isSuggestSet ? `<svg class="perf-suggest-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20V4"></path><path d="M5 11l7-7 7 7"></path></svg>` : (set.warmup ? 'WU' : si+1)}</span>
      <input type="number" inputmode="decimal" enterkeyhint="done" placeholder="${currentPlanEx && currentPlanEx.bodyweightExercise ? '+kg' : 'kg'}" step="0.5" value="${isSuggestSet ? perfSuggestion.weight : (currentPlanEx && currentPlanEx.noWeight ? '' : (set.weight ?? ''))}" ${isSuggestSet ? 'id="perfSuggestWeight"' : 'data-field="weight"'} class="${currentPlanEx && currentPlanEx.bodyweightExercise && !isSuggestSet ? 'weight-input-optional' : ''}" ${currentPlanEx && currentPlanEx.noWeight && !isSuggestSet ? 'disabled' : ''}>
      <input type="number" inputmode="numeric" enterkeyhint="done" placeholder="Wdh" value="${isSuggestSet ? perfSuggestion.reps : (set.reps ?? '')}" ${isSuggestSet ? 'id="perfSuggestReps"' : 'data-field="reps"'}>
      <span class="set-vol">${isSuggestSet ? '' : ((currentPlanEx && currentPlanEx.noWeight) ? '–' : (setMetricValue(set.reps, set.weight, currentPlanEx, activeSetMetricMode) ?? '–'))}</span>
      ${isSuggestSet ? `
      <button class="perf-suggest-row-confirm" id="perfSuggestConfirm" type="button" aria-label="Vorschlag übernehmen">✓</button>
      <button class="perf-suggest-row-reject" id="perfSuggestReject" type="button" aria-label="Vorschlag ablehnen">✕</button>
      ` : `
      <button class="set-check ${set.done ? 'checked' : ''}" data-checkset="${si}" aria-label="Satz ${si+1} erledigt">✓</button>
      <button class="icon-x" data-removeset="${si}" aria-label="Satz ${si+1} entfernen">✕</button>
      `}
    </div>
  `;
  }).join('') : '';

  const referenceHTML = (entry && entry.referenceHistory && entry.referenceHistory.length) ? `
    <div class="reference-block">
      ${entry.referenceHistory.map(sets => `
        <div class="reference-group">
          <div class="reference-title">Letztes Mal</div>
          ${sets.map((r,i) => `
            <div class="reference-row">
              <span>#${i+1}</span>
              <span>${entry.type === 'time' ? fmtSec(r.seconds) : `${r.weight ?? '–'}kg × ${r.reps ?? '–'}`}</span>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  ` : '';

  const needsBodyWeightWarning = !!(currentPlanEx && (currentPlanEx.assisted || currentPlanEx.bodyweightExercise) && !plan.bodyWeight);
  const bodyWeightWarningHTML = needsBodyWeightWarning ? `
    <div class="reference-block" style="border-color:var(--accent-2); margin-bottom:12px; display:flex; align-items:flex-start; gap:8px;">
      <img class="bodyweight-warning-icon" src="${ICON_WARNING}" alt="">
      <span>Kein Körpergewicht hinterlegt — VOL zeigt aktuell nur das eingestellte Gerätegewicht statt des tatsächlich bewegten Gewichts. Trag dein Körpergewicht im Übungen-Tab ein, damit es korrekt berechnet wird.</span>
    </div>
  ` : '';

  const exerciseCardHTML = !entry ? '<div class="history-empty">Keine Übungen in dieser Einheit.</div>' : `
    <div class="exercise-card">
      ${bodyWeightWarningHTML}
      <div class="exercise-title-row">
        <div class="exercise-title">${exerciseNameHTML(entry.name)}</div>
        <button class="icon-x" id="btnRemoveExercise" aria-label="${entry.name} aus dieser Einheit entfernen">✕</button>
      </div>
      <div class="sets" id="currentSets">
        ${setsHeaderHTML}
        ${setsHTML}
      </div>
      <div class="add-set-row ${entry.type === 'time' ? 'set-row-time' : ''}" ${currentPlanEx && currentPlanEx.cardioMachine ? 'style="display:none;"' : ''}>
        <button class="add-set" id="btnAddSet" aria-label="Satz hinzufügen">+</button>
        ${currentPlanEx ? `
        <button class="note-btn" id="btnExerciseNote" aria-label="Notiz zu ${entry.name}">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
        </button>
        ` : ''}
        <button class="check-all-btn" id="btnCheckAllExercise" aria-label="Ganze Übung abhaken">✓</button>
      </div>
      ${currentPlanEx && currentPlanEx.note ? `<div class="exercise-note-display">${currentPlanEx.note}</div>` : ''}
      ${referenceHTML}
    </div>
  `;

  // Performancemodus-Vorschlag wird NICHT mehr als eigenes, separat positioniertes Popup
  // gerendert (das driftete beim Scrollen von der eigentlichen Zeile weg, siehe setsHTML
  // unten) — stattdessen verwandelt sich die betroffene Satz-Zeile selbst per
  // "perf-suggest-active"-Klasse in die Vorschlags-Ansicht. Dadurch ist sie automatisch immer
  // exakt an der richtigen Stelle "verankert", auch beim Scrollen, ohne eigene Positionierung.
  const isCardioSuggestion = !!(perfSuggestion && perfSuggestion.seconds !== undefined);

  app.innerHTML = `
    <div class="active-header-row">
      <button class="active-back-btn" id="btnActiveBack" type="button" aria-label="Zur Startseite (Training läuft weiter)">
        <img src="${ICON_CHEVRON_RIGHT}" alt="">
      </button>
      ${plan.trainingToolsEnabled === true ? `
      <button class="active-tools-btn" id="btnActiveTools" type="button" aria-label="Trainingstools">⚙</button>
      ` : `<span></span>`}
    </div>
    <div class="time-box ${restState ? 'resting' : ''}" id="plateEl" style="margin-top:18px;">
      <div class="time-box-time-row" id="plateTimeRow">
        <div class="time-box-time ${active.pausedAt ? 'time-paused' : ''}" id="plateTime">00:00</div>
        <span class="time-box-pause-icon" id="platePauseIcon" style="display:${active.pausedAt ? 'block' : 'none'};" aria-label="Trainingszeit pausiert"></span>
      </div>
      <div class="time-box-rest" id="plateRest">
        <span class="time-box-rest-label">Pause</span>
        <span class="time-box-rest-time" id="plateRestTime">00:00</span>
      </div>
      <svg class="time-box-ring" id="restRing" preserveAspectRatio="none">
        <rect id="restRingRect"></rect>
      </svg>
    </div>
    <div class="rest-row">
      <button class="rest-btn" data-rest="30">30s</button>
      <button class="rest-btn" data-rest="60">60s</button>
      <button class="rest-btn" data-rest="90">90s</button>
    </div>
    <div class="thumb-strip">${thumbsHTML}</div>
    ${exerciseCardHTML}
    ${addExerciseHTML}
    <div style="height:70px"></div>
    <div class="bottom-bar">
      <div class="bottom-bar-inner">
        <button class="btn btn-primary" id="btnEnd">Training beenden</button>
      </div>
    </div>
  `;

  // Gemerkte Scroll-Position der Bilderleiste wiederherstellen (siehe Kommentar oben in
  // renderActive()) — direkt nach dem Neuaufbau, bevor wireThumbDrag() die Klick-/Drag-Handler
  // erneut bindet, damit kein sichtbares Zurückspringen zwischen Aufbau und Wiederherstellung
  // aufblitzt.
  const newStripEl = app.querySelector('.thumb-strip');
  if (newStripEl && prevStripScrollLeft !== null) newStripEl.scrollLeft = prevStripScrollLeft;

  updateTimerDisplay();
  document.getElementById('btnActiveBack').onclick = () => {
    // Führt zur Startseite, OHNE das Training zu beenden/verwerfen — läuft im Hintergrund
    // einfach weiter (gleiches Verhalten wie die Zurück-Taste, nur als expliziter Button).
    goHome();
  };
  const btnActiveToolsEl = document.getElementById('btnActiveTools');
  if (btnActiveToolsEl) btnActiveToolsEl.onclick = () => openTrainingToolsPrompt(entry, currentPlanEx);
  if (restState){
    // Passiert dem Ring UND dem Pause-Label/der Restzeit-Anzeige (#plateRest) — beide
    // erhalten ihre "visible"-Klasse normalerweise nur einmalig in startRest() und stehen
    // NICHT im Render-Template selbst (siehe dortiger Kommentar). Wird renderActive() erneut
    // aufgerufen, während bereits eine Pause läuft (z. B. weil ein Satz ab-/wieder angehakt
    // oder ein Popup geschlossen wurde), baut das die komplette Box frisch aus dem Template
    // auf — scheduleRestRingSetup() übernimmt hier sowohl die sofortige Wiederherstellung als
    // auch die spätere Nachkorrektur, falls die neue Box gerade noch in einer Größen-
    // Transition steckt (siehe dortiger Kommentar).
    requestAnimationFrame(scheduleRestRingSetup);
  }
  highlightRestButtons();

  wireThumbDrag();
  const thumbAddBtn = document.getElementById('thumbAdd');
  if (thumbAddBtn) thumbAddBtn.onclick = () => {
    addExerciseOpen = !addExerciseOpen;
    renderActive();
  };
  const addExerciseOverlay = document.getElementById('addExerciseOverlay');
  if (addExerciseOverlay){
    addExerciseOverlay.onclick = (ev) => {
      if (ev.target === addExerciseOverlay){
        addExerciseOpen = false;
        renderActive();
      }
    };
    const closeBtn = document.getElementById('btnCloseAddExercise');
    if (closeBtn) closeBtn.onclick = () => {
      addExerciseOpen = false;
      renderActive();
    };
    addExerciseOverlay.querySelectorAll('[data-addexgroup]').forEach(btn => {
      btn.onclick = () => {
        const g = btn.dataset.addexgroup;
        if (addExerciseGroupOpen.has(g)) addExerciseGroupOpen.delete(g); else addExerciseGroupOpen.add(g);
        renderActive();
      };
    });
    // Live-Filterung rein per DOM-Anzeige (kein renderActive()!), damit die virtuelle
    // Tastatur bei jedem getippten Zeichen nicht durch einen kompletten Neu-Render den Fokus
    // verliert. Merkt sich den ursprünglichen Auf-/Zugeklappt-Zustand jeder Gruppe einmalig
    // (data-original-display) und stellt ihn wieder her, sobald das Suchfeld geleert wird —
    // während der Suche werden Treffergruppen zusätzlich zwangsweise aufgeklappt.
    const addExerciseSearchInput = document.getElementById('addExerciseSearch');
    if (addExerciseSearchInput){
      addExerciseOverlay.querySelectorAll('.muscle-group-body').forEach(body => {
        if (body.dataset.originalDisplay === undefined) body.dataset.originalDisplay = body.style.display;
      });
      addExerciseSearchInput.oninput = () => {
        const q = addExerciseSearchInput.value.trim().toLowerCase();
        addExerciseOverlay.querySelectorAll('.muscle-group').forEach(groupEl => {
          const body = groupEl.querySelector('.muscle-group-body');
          let anyVisible = false;
          body.querySelectorAll('.add-exercise-row').forEach(row => {
            const name = (row.querySelector('.add-exercise-name')?.textContent || '').toLowerCase();
            const meta = (row.querySelector('.add-exercise-meta')?.textContent || '').toLowerCase();
            const match = !q || name.includes(q) || meta.includes(q);
            row.style.display = match ? '' : 'none';
            if (match) anyVisible = true;
          });
          groupEl.style.display = anyVisible ? '' : 'none';
          body.style.display = q ? (anyVisible ? 'block' : 'none') : body.dataset.originalDisplay;
        });
      };
    }
  }

  if (entry){
    // Aktualisiert die Live-Distanzanzeige (≈ X km) beim Laufband anhand der GERADE
    // getippten Werte (nicht erst nach dem Speichern) — liest Minuten/Sekunden und Tempo
    // direkt aus dem DOM, da diese über zwei getrennte Zeilen (.set-row/.set-cardio-extra)
    // verteilt sind.
    function refreshCardioDistanceDisplay(si){
      if (!currentPlanEx || currentPlanEx.cardioMachine !== 'laufband') return;
      const distEl = document.getElementById(`cardioDistance${si}`);
      if (!distEl) return;
      const setRow = document.querySelector(`#currentSets .set-row[data-set="${si}"]`);
      const extraRow = document.querySelector(`#currentSets .set-cardio-extra[data-set="${si}"]`);
      const minEl = setRow && setRow.querySelector('[data-mmss="min"]');
      const secEl = setRow && setRow.querySelector('[data-mmss="sec"]');
      const speedEl = extraRow && extraRow.querySelector('[data-field="speed"]');
      const min = minEl && minEl.value !== '' ? Number(minEl.value) : 0;
      const sec = secEl && secEl.value !== '' ? Number(secEl.value) : 0;
      const speed = speedEl && speedEl.value !== '' ? Number(speedEl.value) : null;
      const hasTime = !!((minEl && minEl.value !== '') || (secEl && secEl.value !== ''));
      const dist = (speed != null && hasTime) ? Math.round(speed * ((min*60+sec)/3600) * 100)/100 : null;
      distEl.textContent = dist != null ? `≈ ${dist.toLocaleString('de-DE')} km` : '';
    }

    document.getElementById('currentSets').querySelectorAll('.set-row, .set-cardio-extra').forEach(row => {
      const si = Number(row.dataset.set);
      row.querySelectorAll('input[data-field]').forEach(input => {
        input.onkeydown = (ev) => {
          if (ev.key === 'Enter'){
            ev.preventDefault();
            // Statt immer nur die Tastatur zu schließen: springt zum NÄCHSTEN Eingabefeld
            // derselben Zeile (z. B. kg → Wdh), aber NUR wenn dieses noch leer ist — steht
            // dort schon ein Wert (z. B. aus der Übernahme vom vorherigen Satz), bleibt
            // "Bestätigen" wie gewohnt beim Schließen der Tastatur (kein ungewolltes
            // Überspringen eines bereits ausgefüllten Feldes). input.blur() löst über den
            // bestehenden onchange-Handler renderActive() aus, das die komplette Sätze-Liste
            // neu aufbaut — das Zielfeld muss deshalb ERST NACH diesem Neuaufbau frisch aus
            // dem DOM geholt werden, ein vorher gemerkter Knoten wäre danach bereits verwaist.
            const fieldsInRow = Array.from(row.querySelectorAll('input[data-field]'));
            const idx = fieldsInRow.indexOf(input);
            const nextInput = fieldsInRow[idx + 1];
            const nextField = (nextInput && nextInput.value === '' && !nextInput.disabled) ? nextInput.dataset.field : null;
            input.blur(); // löst onchange aus (Wert übernehmen, speichern, neu rendern)
            if (nextField){
              const freshNext = document.querySelector(`#currentSets input[data-field="${nextField}"][data-si="${si}"]`);
              if (freshNext) freshNext.focus();
            }
          }
        };
        input.onchange = () => {
          const val = input.value === '' ? null : Number(input.value);
          const field = input.dataset.field;
          // Trägt den Wert direkt beim Eintragen (kein Abhaken nötig) in diesen Satz ein
          // und schreibt ihn wie beim Abhaken automatisch in alle direkt folgenden, noch
          // leeren bzw. nur automatisch befüllten Sätze fort (applySetValueAndPropagate).
          applySetValueAndPropagate(entry, si, { [field]: val });
          persistActiveSession();
          renderActive();
        };
        if (entry.type !== 'time'){
          input.oninput = () => {
            const s = entry.sets[si];
            const reps = input.dataset.field === 'reps' ? (input.value === '' ? null : Number(input.value)) : s.reps;
            const weight = input.dataset.field === 'weight' ? (input.value === '' ? null : Number(input.value)) : s.weight;
            const volEl = row.querySelector('.set-vol');
            if (volEl) volEl.textContent = setMetricValue(reps, weight, currentPlanEx, activeSetMetricMode) ?? '–';
          };
        } else if (input.dataset.field === 'speed'){
          input.oninput = () => refreshCardioDistanceDisplay(si);
        }
      });
      // Kardio: Minuten + Sekunden werden getrennt eingegeben, aber weiterhin als eine
      // gemeinsame Sekundenzahl in set.seconds gespeichert — dieselbe Datengrundlage wie bei
      // allen anderen Zeit-Übungen (Verlauf, Rekorde, PDF etc. bleiben dadurch unverändert).
      const minEl = row.querySelector('[data-mmss="min"]');
      const secEl = row.querySelector('[data-mmss="sec"]');
      if (minEl && secEl){
        const commit = () => {
          const min = minEl.value === '' ? 0 : Number(minEl.value);
          const sec = secEl.value === '' ? 0 : Number(secEl.value);
          const seconds = (minEl.value === '' && secEl.value === '') ? null : (min * 60 + sec);
          // Wie bei Gewicht/Wdh: Dauer direkt beim Eintragen in Folge-Sätze übernehmen.
          applySetValueAndPropagate(entry, si, { seconds });
          persistActiveSession();
          renderActive();
        };
        [minEl, secEl].forEach(el => {
          el.onkeydown = (ev) => { if (ev.key === 'Enter'){ ev.preventDefault(); el.blur(); } };
          el.onchange = commit;
          el.oninput = () => refreshCardioDistanceDisplay(si);
        });
        const cardioTimerBtn = row.querySelector('.mmss-field-row .seconds-timer-btn');
        if (cardioTimerBtn) cardioTimerBtn.onclick = () => {
          openPlankTimerOverlay((sec) => {
            minEl.value = Math.floor(sec / 60);
            secEl.value = String(sec % 60).padStart(2, '0');
            applySetValueAndPropagate(entry, si, { seconds: sec });
            autoCheckSetAfterTimer(entry, ei, si);
            persistActiveSession();
            renderActive();
          });
        };
      }
      if (entry.type === 'time' && !(minEl && secEl)){
        const secondsInput = row.querySelector('[data-field="seconds"]');
        const timerBtn = row.querySelector('.seconds-timer-btn');
        if (timerBtn && secondsInput){
          timerBtn.onclick = () => {
            openPlankTimerOverlay((sec) => {
              applySetValueAndPropagate(entry, si, { seconds: sec });
              autoCheckSetAfterTimer(entry, ei, si);
              persistActiveSession();
              renderActive();
            });
          };
        }
      }
    });

    app.querySelectorAll('[data-checkset]').forEach(btn => {
      btn.onclick = () => {
        const si = Number(btn.dataset.checkset);
        const wasDone = entry.sets[si].done;
        entry.sets[si].done = !wasDone;
        if (!wasDone){
          // Satz wurde gerade abgehakt: komplett leere Folge-Sätze automatisch
          // mit denselben Werten (kg + Wdh bzw. Sekunden) vorausfüllen, damit man
          // bei gleichbleibendem Gewicht/Wdh nicht jeden Satz neu eintippen muss.
          applySetValueAndPropagate(entry, si, entry.type === 'time'
            ? { seconds: entry.sets[si].seconds, ...Object.fromEntries(cardioFieldsFor(currentPlanEx).map(f => [f.key, entry.sets[si][f.key]])) }
            : { reps: entry.sets[si].reps, weight: entry.sets[si].weight });
        }
        if (!wasDone){
          afterSetChecked(entry, ei);
          // Standard-Pausetimer (siehe openTrainingToolsPrompt(), Einstellungen →
          // Trainingstools → "Standard-Pausetimer"): startet automatisch eine Pause
          // in der hinterlegten Länge, sobald ein Satz abgehakt wird — genau wie ein
          // manueller Tap auf einen der 30/60/90s-Buttons, nur ohne dass man selbst
          // draufdrücken muss. Nur wenn eine Dauer hinterlegt ist (Standard: keine).
          if (plan.trainingToolsEnabled === true && plan.defaultRestSeconds) startRest(plan.defaultRestSeconds);
        }
        renderActive();
      };
    });

    app.querySelectorAll('[data-removeset]').forEach(btn => {
      btn.onclick = () => {
        const si = Number(btn.dataset.removeset);
        const removedSet = entry.sets[si];
        // Nur nachfragen/Undo anbieten, wenn im Satz schon etwas eingetragen war — ein
        // leerer, noch unbenutzter Satz lässt sich weiterhin ohne Rückfrage entfernen.
        const hasData = entry.type === 'time'
          ? (removedSet.seconds !== null && removedSet.seconds !== undefined)
          : ((removedSet.reps !== null && removedSet.reps !== undefined) || (removedSet.weight !== null && removedSet.weight !== undefined));
        entry.sets.splice(si, 1);
        if (perfSuggestion && perfSuggestion.entryIndex === ei && perfSuggestion.setIndex >= si) perfSuggestion = null;
        renderActive();
        if (hasData){
          showUndoToast(`Satz ${si + 1} entfernt.`, () => {
            entry.sets.splice(si, 0, removedSet);
            renderActive();
          });
        }
      };
    });

    document.getElementById('btnAddSet').onclick = () => {
      // autoFilled:true, da die Werte hier nur von "last" übernommen wurden, nicht vom
      // Nutzer selbst eingetippt — ein neuer Satz soll genauso überschreibbar bleiben wie
      // ein leerer, damit applySetValueAndPropagate() ihn beim Abhaken eines VORHERIGEN
      // Satzes weiterhin korrekt mit dessen (ggf. gerade bearbeiteten) Werten befüllt.
      if (entry.type === 'time'){
        const last = entry.sets[entry.sets.length - 1];
        const newSet = { seconds: (last && last.seconds) || null, done: false, autoFilled: true };
        cardioFieldsFor(currentPlanEx).forEach(f => { newSet[f.key] = (last && last[f.key]) ?? null; });
        entry.sets.push(newSet);
      } else {
        const last = entry.sets[entry.sets.length - 1];
        entry.sets.push({
          reps: (last && last.reps) || null,
          weight: (last && last.weight) || entry.target.weight || null,
          done: false,
          autoFilled: true
        });
      }
      renderActive();
    };

    document.getElementById('btnCheckAllExercise').onclick = () => {
      entry.sets.forEach(s => s.done = true);
      afterSetChecked(entry, ei);
      renderActive();
    };

    const btnExerciseNoteEl = document.getElementById('btnExerciseNote');
    if (btnExerciseNoteEl) btnExerciseNoteEl.onclick = () => {
      openExerciseNotePrompt(currentPlanEx, entry.name);
    };

    document.getElementById('btnRemoveExercise').onclick = () => {
      const removedIndex = ei;
      const removedEntry = active.entries[ei];
      active.entries.splice(ei, 1);
      if (active.currentIndex >= active.entries.length) active.currentIndex = Math.max(0, active.entries.length - 1);
      perfSuggestion = null;
      renderActive();
      showUndoToast(`"${removedEntry.name}" entfernt.`, () => {
        active.entries.splice(removedIndex, 0, removedEntry);
        active.currentIndex = removedIndex;
        renderActive();
      });
    };

    // Performancemodus-Vorschlag: die betroffene Zeile zeigt sich seit setsHTML oben bereits
    // selbst als Vorschlags-Ansicht (Klasse "perf-suggest-active") — hier nur noch Annehmen/
    // Ablehnen verkabeln, keine eigene Positionierung mehr nötig (siehe setsHTML-Kommentar).
    // Der Vorschlag erscheint automatisch (siehe maybeShowPerfSuggestion()), bevor der Satz
    // überhaupt abgehakt wurde: Annehmen/Ablehnen markiert den Satz daher nicht als erledigt
    // und springt auch nicht zur nächsten Übung.
    if (perfSuggestion && perfSuggestion.entryIndex === ei){
      const dismiss = () => {
        entry._perfSuggestionDismissed = true; // in dieser Trainingseinheit nicht nochmal automatisch zeigen
        promoteNextPerfSuggestionSlot(); // ungenutzter Kontingent-Platz rückt an die nächste Übung nach
        perfSuggestion = null;
        renderActive();
      };
      const rejectBtn = document.getElementById('perfSuggestReject');
      if (rejectBtn) rejectBtn.onclick = dismiss;
      const confirmBtn = document.getElementById('perfSuggestConfirm');
      if (confirmBtn) confirmBtn.onclick = () => {
        if (isCardioSuggestion){
          const sEl = document.getElementById('perfSuggestSeconds');
          const newSeconds = sEl && sEl.value !== '' ? Number(sEl.value) : perfSuggestion.seconds;
          applyPerfTimeSuggestionAndPropagate(entry, perfSuggestion.setIndex, newSeconds);
        } else {
          const wEl = document.getElementById('perfSuggestWeight');
          const rEl = document.getElementById('perfSuggestReps');
          const newWeight = wEl && wEl.value !== '' ? Number(wEl.value) : perfSuggestion.weight;
          const newReps = rEl && rEl.value !== '' ? Number(rEl.value) : perfSuggestion.reps;
          applyPerfSuggestionAndPropagate(entry, perfSuggestion.setIndex, { weight: newWeight, reps: newReps });
        }
        entry._perfSuggestionDismissed = true;
        perfSuggestion = null;
        renderActive();
      };
    }
  }

  app.querySelectorAll('[data-addex]').forEach(row => {
    row.onclick = () => {
      const ex = plan.exercises.find(x => x.id === row.dataset.addex);
      if (ex){
        const newEntry = buildEntry(ex);
        // Ist Warm-up für die Einheit aktiv (active.warmupEnabled, siehe
        // openTrainingToolsPrompt()), bekommt auch eine nachträglich hinzugefügte Übung
        // direkt ihren Warm-up-Satz mit, statt dass man den Schalter erneut betätigen müsste.
        if (active.warmupEnabled) applyWarmupToEntry(newEntry, ex);
        active.entries.push(newEntry);
        active.currentIndex = active.entries.length - 1;
        addExerciseOpen = false;
        renderActive();
      }
    };
  });

  document.getElementById('btnEnd').onclick = () => {
    const isLastExercise = ei === active.entries.length - 1;
    if (!isLastExercise && !confirm('Training wirklich beenden? Du bist noch nicht bei der letzten Übung.')) return;
    const problems = findIncompleteDoneSets();
    if (problems.length){
      openIncompleteSetsPrompt(problems, () => endSession());
      return;
    }
    endSession();
  };
  const toggleSetMetricBtn = document.getElementById('btnToggleSetMetric');
  if (toggleSetMetricBtn){
    toggleSetMetricBtn.onclick = () => {
      // Rotiert bei jedem Tap durch VOL → 10RM → 1RM → VOL … und merkt sich die Wahl auch
      // für die restliche Trainingseinheit (nicht nur für diese eine Übung).
      activeSetMetricMode = activeSetMetricMode === 'vol' ? '10rm' : activeSetMetricMode === '10rm' ? '1rm' : 'vol';
      renderActive();
    };
  }
  // Normaler Tap startet die feste Pausenzeit wie gehabt; Long-Press auf einen der drei
  // Buttons öffnet stattdessen ein Popup für eine frei eingegebene Pausendauer (siehe
  // openCustomRestPrompt()) — gleiches Long-Press-Muster wie z. B. bei den Akzentfarben-
  // Favoriten (wireAccentSwatchInteractions()): ein als Long-Press gewerteter Druck
  // unterdrückt den nachfolgenden Klick.
  (function wireRestButtonLongPress(){
    const LONG_PRESS_MS = 450;
    const MOVE_CANCEL_PX = 12;
    app.querySelectorAll('.rest-btn').forEach(btn => {
      let pressTimer = null;
      let startX = 0, startY = 0, longPressFired = false;
      const cancel = () => { clearTimeout(pressTimer); pressTimer = null; };

      btn.onclick = () => {
        if (longPressFired){ longPressFired = false; return; }
        startRest(Number(btn.dataset.rest));
      };

      btn.addEventListener('contextmenu', (ev) => ev.preventDefault());
      btn.addEventListener('touchstart', (ev) => {
        longPressFired = false;
        const t = ev.touches[0];
        startX = t.clientX; startY = t.clientY;
        pressTimer = setTimeout(() => {
          longPressFired = true;
          if (navigator.vibrate) navigator.vibrate(15);
          openCustomRestPrompt();
        }, LONG_PRESS_MS);
      }, { passive: true });
      btn.addEventListener('touchmove', (ev) => {
        const t = ev.touches[0];
        if (Math.abs(t.clientX - startX) > MOVE_CANCEL_PX || Math.abs(t.clientY - startY) > MOVE_CANCEL_PX) cancel();
      }, { passive: true });
      btn.addEventListener('touchend', cancel);
      btn.addEventListener('touchcancel', cancel);
    });
  })();
  document.getElementById('plateEl').onclick = () => {
    if (restState){
      clearInterval(restInterval);
      restInterval = null;
      endRest(false);
    } else {
      toggleSessionPause();
    }
  };
}

/* ---------------------------------------------------
   REST TIMER (Pausenzeiten mit Balken-Fortschritt)
--------------------------------------------------- */
let restState = null;   // { endTime, duration }
let restInterval = null;
let restNotifyTimeout = null;

// Ob der animierte Fortschrittsring um den Timer während der Pause angezeigt wird — in den
// Einstellungen abschaltbar (siehe renderSettings()). Standardmäßig an, außer explizit
// deaktiviert.
function restRingEnabled(){
  return plan.showRestRing !== false;
}

function startRest(seconds){
  clearInterval(restInterval);
  clearTimeout(restNotifyTimeout);
  restNotifiedAlready = false;
  restState = { endTime: Date.now() + seconds*1000, duration: seconds };
  // Berechtigung für Browser-Benachrichtigungen erst beim tatsächlichen Nutzen des
  // Pausen-Timers anfragen (nicht schon beim App-Start) — nur so kann endRest() später
  // per Notification API eine System-Benachrichtigung zeigen, wenn die Pause abläuft,
  // während die App im Hintergrund/nicht sichtbar ist (reiner In-App-Ton/-Anzeige reicht
  // in dem Fall nicht, da man die Seite ja gerade nicht anschaut).
  if (window.Notification && Notification.permission === 'default'){
    Notification.requestPermission();
  }
  // Eigener, vom UI-Countdown-Interval UNABHÄNGIGER Timeout, der die Benachrichtigung genau
  // zur Zielzeit auslöst — wichtig, weil mobile Browser setInterval() im Hintergrund-Tab
  // drosseln oder ganz pausieren können, wodurch der normale tickRest()-Ablauf (der die
  // Benachrichtigung sonst mit auslösen würde) verspätet oder gar nicht mehr feuert.
  restNotifyTimeout = setTimeout(() => {
    if (restState) showRestEndNotification();
  }, seconds * 1000);
  const rest = document.getElementById('plateRest');
  const ring = document.getElementById('restRing');
  const box = document.getElementById('plateEl');
  if (rest) rest.classList.add('visible');
  if (box) box.classList.add('resting');
  // Ring erst NACH dem Hinzufügen von .resting einblenden (per rAF verzögert), da sich die
  // Box-Größe durch die zusätzliche Pause-Zeile ändert (mehr Padding) — setupRestRing()
  // braucht die finale, bereits vergrößerte Größe, um Umfang/viewBox korrekt zu berechnen.
  // scheduleRestRingSetup() übernimmt danach zusätzlich die Nachkorrektur, sobald die
  // Padding-Transition (.25s, siehe .time-box{transition:...}) WIRKLICH fertig ist — siehe
  // dortiger Kommentar, warum eine einzelne rAF-Messung allein kurz einen falsch
  // dimensionierten Rahmen zeigen konnte.
  requestAnimationFrame(() => {
    scheduleRestRingSetup();
    highlightRestButtons();
    restInterval = setInterval(tickRest, 100);
    tickRest();
  });
}

// Zeigt die System-Benachrichtigung genau einmal pro Pause — sowohl vom unabhängigen
// setTimeout (startRest) als auch vom normalen tickRest()-Ablauf aufrufbar, je nachdem
// welcher zuerst feuert; das notifiedForThisRest-Flag verhindert eine doppelte Anzeige,
// falls beide kurz hintereinander auslösen.
let restNotifiedAlready = false;
function showRestEndNotification(){
  if (restNotifiedAlready) return;
  restNotifiedAlready = true;
  if (document.hidden && window.Notification && Notification.permission === 'granted'){
    try{
      const n = new Notification('Pause beendet 💪', {
        body: 'Weiter geht\'s mit dem nächsten Satz.',
        icon: ICON_HISTORY,
        tag: 'trainingsplan-rest-timer',
        renotify: true,
      });
      n.onclick = () => { window.focus(); n.close(); };
    }catch(err){ /* Notification nicht verfügbar (z. B. iOS Safari) — kein Problem, Ton reicht dann als Fallback */ }
  }
}

// Richtet den Pausen-Fortschrittsring ein UND korrigiert ihn ein zweites Mal, sobald die
// Größenänderung der Box (padding-Transition beim Wechsel in/aus "resting", siehe
// .time-box{transition:...}) tatsächlich fertig ist. Eine einzelne Messung direkt nach dem
// Hinzufügen der Klasse liefert noch die Größe MITTEN in der .25s-Transition — das war die
// Ursache dafür, dass der Rahmen kurz sichtbar "falsch" aussah und sich dann von selbst
// korrigierte. Statt das nur zu erraten (fester Timeout), wird zusätzlich echt auf das Ende
// der Transition gewartet ('transitionend'); ein Timeout bleibt als Sicherheitsnetz für Fälle
// ohne tatsächliche Transition (z. B. Box wurde direkt mit "resting" neu aus dem Template
// gebaut, siehe renderActive(), oder reduzierte Bewegung ist aktiv). Von startRest() UND von
// renderActive() (jeder Re-Render während einer laufenden Pause, z. B. durch Ab-/Anhaken eines
// Satzes) genutzt, damit der Ring in beiden Fällen gleich zuverlässig korrekt aussieht.
function scheduleRestRingSetup(){
  setupRestRing();
  const ring = document.getElementById('restRing');
  if (ring && restRingEnabled()) ring.classList.add('visible');
  const rest = document.getElementById('plateRest');
  if (rest) rest.classList.add('visible');
  tickRest();

  const box = document.getElementById('plateEl');
  if (!box) return;
  let corrected = false;
  const correct = () => {
    if (corrected) return;
    corrected = true;
    box.removeEventListener('transitionend', onTransitionEnd);
    if (!restState) return; // Pause ist inzwischen zu Ende / abgebrochen worden
    setupRestRing();
    tickRest();
  };
  const onTransitionEnd = (ev) => { if (ev.target === box && ev.propertyName === 'padding') correct(); };
  box.addEventListener('transitionend', onTransitionEnd);
  setTimeout(correct, 300); // Sicherheitsnetz, falls transitionend ausbleibt
}

// Berechnet Größe und Umfang des SVG-Rahmens anhand der tatsächlichen, aktuell gerenderten
// Box-Maße (inkl. der bei "resting" vergrößerten Padding) und merkt sich den Gesamtumfang
// in einem data-Attribut, damit tickRest() daraus den passenden stroke-dashoffset ableiten
// kann, ohne bei jedem Tick neu zu messen.
function setupRestRing(){
  const box = document.getElementById('plateEl');
  const ring = document.getElementById('restRing');
  const rect = document.getElementById('restRingRect');
  if (!box || !ring || !rect) return;
  // Größe direkt vom Ring selbst lesen (nicht von der Box): der Ring ist per CSS bewusst
  // 2px größer als die Box gerendert (inset:-1px, width/height:calc(100% + 2px)), damit der
  // Rahmen minimal außerhalb des normalen Box-Randes läuft. Ein viewBox mit den (kleineren)
  // Box-Maßen ließ das SVG beim Rendern unmerklich strecken, da width/height-Attribut und
  // tatsächliche gerenderte Größe nicht mehr übereinstimmten — das war die Ursache für den
  // bisher leicht "unsauberen" Rand, besonders sichtbar in den abgerundeten Ecken.
  const w = ring.clientWidth, h = ring.clientHeight;
  if (!w || !h) return;
  ring.setAttribute('viewBox', `0 0 ${w} ${h}`);
  ring.setAttribute('width', w);
  ring.setAttribute('height', h);
  const strokeWidth = 2.5;
  rect.setAttribute('x', strokeWidth / 2);
  rect.setAttribute('y', strokeWidth / 2);
  rect.setAttribute('width', w - strokeWidth);
  rect.setAttribute('height', h - strokeWidth);
  // Eckenradius statt eines fest verdrahteten Werts jetzt aus der tatsächlichen CSS-Rundung
  // der Box abgeleitet (+1px, weil der Ring per inset:-1px eine Ecke außerhalb der Box
  // zeichnet, − halbe Strichbreite, weil der Pfad mittig auf dem Strich läuft statt auf
  // dessen Außenkante) — bleibt dadurch automatisch korrekt, auch falls .time-box seine
  // Rundung mal ändert.
  const boxRadius = parseFloat(getComputedStyle(box).borderRadius) || 18;
  const r = Math.max(0, boxRadius + 1 - strokeWidth / 2);
  rect.setAttribute('rx', r);
  rect.setAttribute('ry', r);
  // Umfang NICHT mehr selbst per Formel berechnet, sondern direkt vom SVG-Element erfragt
  // (rect.getTotalLength()) — der eigentliche Grund für den bisher "unsauberen" Rand: die
  // handgerechnete Formel (2×(Breite+Höhe) − 8×Radius + 2×π×Radius) approximiert die vier
  // Viertelkreis-Ecken nur near genug, weicht aber minimal von dem ab, was der Browser beim
  // Rendern des <rect rx> tatsächlich als Pfadlänge zugrunde legt. Diese kleine Differenz
  // reichte aus, damit Anfang und Ende des Konturstrichs (beide liegen am selben Punkt, direkt
  // nach der oberen linken Ecke, wo der <rect>-Pfad per Spezifikation startet) nicht exakt
  // aufeinandertrafen — sichtbar als winziger Versatz genau an dieser Ecke. getTotalLength()
  // liefert die vom Browser selbst gemessene, exakte Pfadlänge, wodurch Start und Ende
  // garantiert lückenlos ineinander übergehen.
  const perimeter = rect.getTotalLength();
  rect.style.strokeDasharray = `${perimeter}`;
  rect.dataset.perimeter = perimeter;
}

function tickRest(){
  if (!restState) return;
  const remainingMs = Math.max(0, restState.endTime - Date.now());
  const remaining = Math.ceil(remainingMs/1000);
  const restTimeEl = document.getElementById('plateRestTime');
  if (restTimeEl) restTimeEl.textContent = fmtDuration(remaining);
  const rect = document.getElementById('restRingRect');
  // Selbstheilung: fehlt die Umfang-Angabe noch (z. B. weil dieser Tick zwischen einem
  // Neu-Rendern der Box und der eigentlich zuständigen setupRestRing()-Nachkorrektur landet,
  // siehe scheduleRestRingSetup()), jetzt sofort nachholen statt den Tick stumm zu überspringen.
  if (rect && !rect.dataset.perimeter) setupRestRing();
  if (rect && rect.dataset.perimeter){
    const frac = Math.max(0, Math.min(1, remainingMs / (restState.duration*1000)));
    const perimeter = Number(rect.dataset.perimeter);
    // Der Rahmen "läuft ab" wie eine Sanduhr: bei voller Restzeit ist er komplett
    // gezeichnet (offset 0), er verschwindet mit sinkender Restzeit Stück für Stück
    // (offset wächst Richtung perimeter) — bis er bei 0 Sekunden komplett leer ist.
    // Negativer Offset kehrt die Laufrichtung um: SVG-<rect>-Pfade werden nativ im
    // Gegenuhrzeigersinn beschrieben, ein positiver Offset ließ den Rahmen daher entgegen
    // dem Uhrzeigersinn ablaufen — mit negativem Vorzeichen läuft er stattdessen im
    // Uhrzeigersinn ab, wie bei einer Analoguhr.
    rect.style.strokeDashoffset = `${-perimeter * (1 - frac)}`;
  }
  if (remainingMs <= 0){
    clearInterval(restInterval);
    restInterval = null;
    endRest(true);
  }
}

function endRest(playSound){
  restState = null;
  clearTimeout(restNotifyTimeout);
  const ring = document.getElementById('restRing');
  if (ring) ring.classList.remove('visible');
  const box = document.getElementById('plateEl');
  if (box) box.classList.remove('resting');
  const rest = document.getElementById('plateRest');
  if (rest) rest.classList.remove('visible');
  const restTimeEl = document.getElementById('plateRestTime');
  if (restTimeEl) restTimeEl.textContent = '';
  highlightRestButtons();
  if (playSound) playBeep();
  // Zusätzlich zum In-App-Ton eine System-Benachrichtigung zeigen, wenn die Seite gerade
  // NICHT sichtbar ist — der eigentliche Auslöser ist meist bereits der unabhängige
  // setTimeout aus startRest() (funktioniert auch bei gedrosseltem Interval im Hintergrund),
  // dieser Aufruf hier ist die Absicherung für den Normalfall (Tab sichtbar, Timer läuft
  // regulär über tickRest() ab) sowie ein Fallback, falls der Timeout ausnahmsweise nicht
  // gefeuert haben sollte.
  if (playSound) showRestEndNotification();
}

function highlightRestButtons(){
  document.querySelectorAll('.rest-btn').forEach(btn => {
    btn.classList.toggle('is-active', !!restState && Number(btn.dataset.rest) === restState.duration);
  });
}

function playBeep(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
  }catch(e){ /* Audio nicht verfügbar, kein Problem */ }
}

// Findet abgehakte Sätze, denen trotzdem eine Pflichtangabe fehlt (Wdh bzw. bei
// gewichtsbasierten Übungen zusätzlich kg, bei Zeit-Übungen die Sekunden) — kann passieren,
// wenn ein Satz abgehakt wurde, bevor der Wert eingetippt war. Warnt vor "Training beenden",
// da genau diese Sätze sonst stillschweigend mit fehlenden Werten gespeichert würden.
function findIncompleteDoneSets(){
  const problems = [];
  active.entries.forEach(entry => {
    const planEx = plan.exercises.find(x => x.id === entry.exerciseId);
    if (entry.type === 'time'){
      entry.sets.forEach((s, si) => {
        if (s.done && !(s.seconds > 0)) problems.push({ name: entry.name, setNum: si + 1 });
      });
    } else {
      const needsWeight = !(planEx && (planEx.noWeight || planEx.bodyweightExercise));
      entry.sets.forEach((s, si) => {
        if (!s.done) return;
        const missingReps = !(s.reps > 0);
        const missingWeight = needsWeight && (s.weight === null || s.weight === undefined || s.weight === '');
        if (missingReps || missingWeight) problems.push({ name: entry.name, setNum: si + 1 });
      });
    }
  });
  return problems;
}

// Warn-Popup vor "Training beenden", wenn findIncompleteDoneSets() etwas findet — listet die
// betroffenen Übung/Satz-Kombinationen auf. "Ergänzen" schließt nur das Popup (zurück zum
// Training, Werte nachtragen), "Trotzdem beenden" macht mit der übergebenen proceedFn weiter.
function openIncompleteSetsPrompt(problems, proceedFn){
  const existing = document.getElementById('incompleteSetsOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'incompleteSetsOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal" style="max-height:none;">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">Angaben fehlen</div>
        <button class="add-exercise-modal-close" id="incompleteSetsClose" aria-label="Schließen">✕</button>
      </div>
      <div class="new-exercise-modal-body">
        <label class="justify-text" style="display:block; font-size:12px; color:var(--muted); margin-bottom:12px;">
          Diese abgehakten Sätze haben kein Gewicht bzw. keine Wdh eingetragen:
        </label>
        <div class="wizard-choice-list" style="margin-bottom:14px;">
          ${problems.map(p => `<div class="wizard-choice" style="cursor:default;">${exerciseNameHTML(p.name)} — Satz ${p.setNum}</div>`).join('')}
        </div>
        <button class="btn btn-primary" id="incompleteSetsFix" style="margin-bottom:10px;">Ergänzen</button>
        <button class="btn btn-ghost" id="incompleteSetsProceed">Trotzdem beenden</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(remove);

  function remove(){ const el = document.getElementById('incompleteSetsOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); };
  document.getElementById('incompleteSetsClose').onclick = close;
  document.getElementById('incompleteSetsFix').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
  document.getElementById('incompleteSetsProceed').onclick = () => { close(); proceedFn(); };
}


async function endSession(){
  accrueExerciseTime(); // letzte offene Übung bis zum Beenden noch einbuchen
  clearInterval(timerHandle);
  clearInterval(restInterval);
  restState = null;
  perfSuggestion = null;
  const durationSec = Math.floor((Date.now() - active.startedAt)/1000);
  const session = {
    id: uid(),
    date: new Date(active.startedAt).toISOString(),
    durationSec,
    // Für das Split-Tracking (siehe computeNextSplitStep()) gespeichert: mit welcher
    // Kachel/welchem A-B-Zweig diese Einheit gestartet wurde. Bei "frei" oder importierten
    // Trainings bleibt modeVariant/mode ggf. null — solche Einheiten zählen dann einfach
    // nicht für die Split-Rotation.
    mode: active.mode || null,
    modeVariant: active.modeVariant || null,
    // Deload-Kennzeichnung für die Monatsübersicht (siehe renderMonthOverview()) — ob der
    // Deload-Schalter (Trainingstools) am Ende dieser Einheit aktiv war. Warm-up-Sätze
    // brauchen dagegen KEIN eigenes Session-Feld: das set.warmup=true-Flag bleibt beim
    // Filtern unten ohnehin an den Sätzen erhalten und lässt sich später direkt daraus zählen.
    deloadUsed: !!active.deloadActive,
    entries: active.entries
      .map(e => ({
        exerciseId: e.exerciseId,
        name: e.name,
        type: e.type,
        target: e.target,
        // Nur wirklich abgehakte Sätze MIT tatsächlich eingetragenen Werten zählen — ein
        // abgehakter Satz ganz ohne jeden Wert (z. B. nur durch Auto-Vorausfüllen entstanden,
        // aber nie wirklich ausgeführt) gilt genauso als nicht existent wie ein nicht
        // abgehakter Satz, statt mit leeren Bindestrichen gespeichert zu werden.
        sets: e.sets.filter(s => s.done === true && Object.entries(s).some(([k,v]) => k !== 'done' && v !== null && v !== undefined && v !== '')),
        // Wie lange die Übung insgesamt GEÖFFNET war, bis alle Sätze abgehakt waren (siehe
        // accrueExerciseTime()) — Basis für die Zeit-Statistik je Übung/Muskelgruppe.
        timeSpentSec: e._timeSpentSec || 0
      }))
      // Übungen ganz ohne verbliebene Sätze gelten als nicht durchgeführt
      // und werden komplett verworfen (erscheinen nicht in Zusammenfassung/PDF).
      .filter(e => e.sets.length > 0)
  };
  // Wurde in der gesamten Einheit kein einziger Satz eingetragen, verhält sich "Training
  // beenden" genauso wie ein Abbruch: nichts wird gespeichert, keine Zusammenfassung, direkt
  // zurück zur Startseite (kein extra Bestätigungsdialog nötig, da es nichts zu verlieren gibt).
  if (!session.entries.length){
    const discarded = active;
    active = null;
    await saveJSON('activeSession', null);
    replaceView('home');
    renderHome();
    showUndoToast('Training verworfen.', () => {
      active = discarded;
      persistActiveSession();
      pushView('active');
      timerHandle = setInterval(updateTimerDisplay, 1000);
      renderActive();
    });
    return;
  }
  sessions.push(session);
  session.entries.forEach(e => {
    if (e.exerciseId && e.sets.length){
      const history = Array.isArray(lastPerformance[e.exerciseId]) && Array.isArray(lastPerformance[e.exerciseId][0])
        ? lastPerformance[e.exerciseId]
        : (lastPerformance[e.exerciseId] ? [lastPerformance[e.exerciseId]] : []); // alte Struktur (nur 1 Session) migrieren
      // Es werden die letzten PERF_HISTORY_DEPTH Einheiten aufgehoben (nicht nur 2): je nach
      // frei eingestelltem Schwellwert (plan.performanceThreshold, requiredMatchesFor()) und ob
      // eine Übung assistiert ist (z. B. Klimmzugmaschine), können bis zu 20 gleiche Einheiten
      // in Folge gebraucht werden, bevor eine Steigerung vorgeschlagen wird. Die "Letztes Mal"/
      // "Vorletztes Mal"-Referenzanzeige (siehe buildEntry()) nutzt weiterhin nur die ersten 2 davon.
      lastPerformance[e.exerciseId] = [e.sets.map(s => ({ ...s })), ...history].slice(0, PERF_HISTORY_DEPTH);
    }
  });
  await saveSession(session);
  await saveJSON('lastPerformance', lastPerformance);
  active = null;
  await saveJSON('activeSession', null);
  // "home" ersetzt den bisherigen History-Eintrag (das aktive Training soll beim Zurück-
  // Navigieren nicht wieder auftauchen), die Zusammenfassung bekommt danach aber ihren
  // EIGENEN History-Eintrag (pushView statt replaceView) — sonst hätte "Zurück" von einer
  // Übungs-Detailansicht aus (siehe goExerciseSessionDetail) direkt zur Startseite gesprungen
  // statt nur die Detailansicht zu schließen und zur Zusammenfassung zurückzukehren.
  replaceView('home');
  goSessionSummary(session);
}

