/* ---------------------------------------------------
   11c-active-session-rest.js
   ---------------------------------------------------
   Teil 3/3 der ehemals einzelnen 11-active-session.js — reiner Dateigrößen-
   Split ohne inhaltliche Änderung, siehe Kopf von 11a-active-session.js.
   Läuft nach 11a/11b.
   Inhalt: Pausen-Timer-Ring (start/tick/end), Sound/Benachrichtigung bei
   Pausenende, Prüfung auf unvollständig abgehakte Sätze, sowie endSession().
--------------------------------------------------- */
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

