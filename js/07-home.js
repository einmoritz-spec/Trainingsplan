/* ---------------------------------------------------
   HOME
--------------------------------------------------- */
let historyExpanded = false;
// Akkordeon-Zustand der beiden neuen Home-Bereiche "Verlauf" und "Mahlzeiten" — nur relevant
// (und nur gerendert), wenn der Essenstracker aktiviert ist, siehe renderHome(). Beide starten
// eingeklappt, wie alle anderen Akkordeons in der App.
let homeVerlaufOpen = false;
let homeMealsOpen = false;
let accentPickerOpen = false;
let bgPickerOpen = false;
// Klappt den Bereich "Eigene Schriftarten" (hochgeladene Dateien) in Design → Schriftart auf,
// siehe renderSettings(). Der Schriftart-Picker selbst ist das Scroll-Rad (openChoiceScrollWheel),
// kein Akkordeon — dieser Flag steuert nur die Liste/Verwaltung der eigenen Uploads darunter.
let customFontsListOpen = false;
// Merkt sich, welche Abschnitte auf der Einstellungen-Seite gerade aufgeklappt sind
// (Akkordeon pro Abschnitt, siehe renderSettings()). Standardmäßig alles eingeklappt,
// exakt wie beim Muskelgruppen-Akkordeon im Übungen-Tab.
let settingsSectionOpen = new Set();

// Verkabelt Long-Press auf allen `.history-row`-Elementen im aktuell gerenderten DOM: nach
// LONG_PRESS_MS gedrückt halten öffnet ein kleines Kontextmenü mit Teilen/Löschen für die
// entsprechende Session — ohne dass man dafür erst die Detailseite öffnen muss. Ein normaler
// (kurzer) Tap/Klick navigiert weiterhin ganz normal zur Detailseite (unverändert per
// row.onclick an den beiden Aufrufstellen in renderHome()/renderWorkoutsOverview() gesetzt).
function wireHistoryLongPress(){
  const LONG_PRESS_MS = 450;
  const MOVE_CANCEL_PX = 10;
  document.querySelectorAll('.history-row').forEach(row => {
    let pressTimer = null;
    let startX = 0, startY = 0, longPressFired = false;

    const cancel = () => { clearTimeout(pressTimer); pressTimer = null; };

    // Verhindert das native Browser-Kontextmenü (Textmarkierung/„Kopieren"-Popup), das
    // sonst bei einem Long-Press auf Text konkurrierend zum eigenen Menü aufploppt.
    row.addEventListener('contextmenu', (ev) => ev.preventDefault());
    row.addEventListener('selectstart', (ev) => ev.preventDefault());

    // WICHTIG: touchstart absichtlich NICHT passive, sonst kann preventDefault() hier nicht
    // greifen — genau das war die Ursache dafür, dass Android trotz CSS user-select:none
    // bei einem Long-Press weiterhin eine eigene Wortauswahl-Geste gestartet hat (teils an
    // einer völlig anderen Bildschirmstelle als der tatsächlichen Berührung). preventDefault()
    // wird gezielt erst gerufen, sobald klar ist, dass es sich nicht um ein Scroll-Touch
    // handelt (verzögert per rAF, um normales vertikales Scrollen nicht zu blockieren).
    row.addEventListener('touchstart', (ev) => {
      longPressFired = false;
      const t = ev.touches[0];
      startX = t.clientX; startY = t.clientY;
      // Frühes preventDefault (deutlich vor Erreichen der eigentlichen Long-Press-Schwelle),
      // damit Android gar nicht erst die Chance bekommt, seine eigene Wortauswahl-Geste zu
      // starten — die setzt bei manchen Geräten/Versionen bereits ab ~300ms ein, unabhängig
      // vom hier verwendeten LONG_PRESS_MS-Timer.
      const suppressSelectionTimer = setTimeout(() => { try{ ev.preventDefault(); }catch(err){} }, 200);
      pressTimer = setTimeout(() => {
        longPressFired = true;
        ev.preventDefault();
        if (navigator.vibrate) navigator.vibrate(15);
        openHistoryContextMenu(row.dataset.id);
      }, LONG_PRESS_MS);
      const clearSuppress = () => clearTimeout(suppressSelectionTimer);
      row.addEventListener('touchend', clearSuppress, { once: true });
      row.addEventListener('touchcancel', clearSuppress, { once: true });
    }, { passive: false });
    row.addEventListener('touchmove', (ev) => {
      const t = ev.touches[0];
      if (Math.abs(t.clientX - startX) > MOVE_CANCEL_PX || Math.abs(t.clientY - startY) > MOVE_CANCEL_PX) cancel();
    }, { passive: true });
    row.addEventListener('touchend', cancel);
    row.addEventListener('touchcancel', cancel);

    // Desktop-Fallback (Maus gedrückt halten)
    row.addEventListener('mousedown', (ev) => {
      longPressFired = false;
      pressTimer = setTimeout(() => {
        longPressFired = true;
        openHistoryContextMenu(row.dataset.id);
      }, LONG_PRESS_MS);
    });
    row.addEventListener('mouseup', cancel);
    row.addEventListener('mouseleave', cancel);

    // Klick unterdrücken, wenn er aus einem gerade ausgelösten Long-Press resultiert
    row.addEventListener('click', (ev) => {
      if (longPressFired){ ev.preventDefault(); ev.stopPropagation(); longPressFired = false; }
    }, true);
  });
}

function openHistoryContextMenu(sessionId){
  const s = sessions.find(x => x.id === sessionId);
  if (!s) return;
  const existing = document.getElementById('historyContextOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'history-context-overlay';
  overlay.id = 'historyContextOverlay';
  overlay.innerHTML = `
    <div class="history-context-menu">
      <button class="history-context-icon-btn share" id="historyContextShare" aria-label="Teilen">
        <img src="${ICON_SHARE}" alt="" draggable="false">
      </button>
      <button class="history-context-icon-btn compare" id="historyContextCompare" aria-label="Vergleichen">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v14"></path><path d="M4 13l4 4 4-4"></path><path d="M16 21V7"></path><path d="M20 11l-4-4-4 4"></path></svg>
      </button>
      <button class="history-context-icon-btn delete" id="historyContextDelete" aria-label="Löschen"></button>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(remove);

  function remove(){ const el = document.getElementById('historyContextOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); };
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
  document.getElementById('historyContextShare').onclick = () => {
    close();
    shareSession(s, {});
  };
  document.getElementById('historyContextCompare').onclick = () => {
    close();
    startSessionCompare(s);
  };
  document.getElementById('historyContextDelete').onclick = () => {
    close();
    if (!confirm('Diese Einheit wirklich löschen?')) return;
    const removedIndex = sessions.findIndex(x => x.id === sessionId);
    const removedSession = sessions[removedIndex];
    sessions = sessions.filter(x => x.id !== sessionId);
    rebuildLastPerformance();
    Promise.all([deleteSessionStorage(removedSession), saveJSON('lastPerformance', lastPerformance)]).then(() => {
      // Aktuelle Ansicht (Startseite oder Workouts-Übersicht) neu rendern, ohne die
      // Navigation zu verändern — history.back() wäre hier falsch, da man ja gerade
      // aus der Liste heraus gelöscht hat und nicht aus der Detailseite kommt.
      if (history.state && history.state.view === 'workoutsOverview') renderWorkoutsOverview();
      else renderHome();
      showUndoToast('Einheit gelöscht.', async () => {
        sessions.splice(removedIndex, 0, removedSession);
        rebuildLastPerformance();
        await Promise.all([saveSessionAt(removedSession, removedIndex), saveJSON('lastPerformance', lastPerformance)]);
        if (history.state && history.state.view === 'workoutsOverview') renderWorkoutsOverview();
        else renderHome();
      });
    });
  };
}

/* ---------------------------------------------------
   TRAININGS-VERGLEICH
   ---------------------------------------------------
   Gestartet über "Vergleichen" im Long-Press-Kontextmenü einer Verlauf-Zeile
   (openHistoryContextMenu() oben). Läuft in zwei Schritten:
   1. compareSessionA gesetzt → dauerhaftes Banner unten (wie der Mini-Player beim laufenden
      Training) + betroffene Listen (Home-Verlauf/Workouts-Übersicht) markieren ähnliche
      Einheiten farblich, alle anderen werden dezent abgeblendet (siehe historyRowHTML()).
   2. Antippen einer ZWEITEN Verlauf-Zeile (egal ob hervorgehoben oder nicht — die Markierung
      ist nur eine Hilfe, keine Einschränkung) beendet den Auswahlmodus und öffnet
      openSessionComparePrompt() mit beiden Einheiten. Antippen des X im Banner oder erneutes
      Antippen von A selbst bricht ab, ohne etwas zu öffnen.
--------------------------------------------------- */
let compareSessionA = null;
// Siehe Kommentar bei refreshVisibleHistoryLists() weiter unten — synchron von
// renderHome()/renderWorkoutsOverview() gesetzt, unabhängig vom (asynchronen) history.state.
let lastRenderedHistoryView = 'home';

// Zwei Einheiten gelten als "ähnlich", wenn sie denselben Trainings-Modus haben (z. B. beide
// "unterkoerper", unabhängig von A/B-Variante — genau das macht aus "Unterkörper A" und
// "Unterkörper B" bereits ähnliche Einheiten). Frei-Einheiten haben keinen aussagekräftigen
// Modus zum Vergleichen; dort (und als generischer Fallback) wird stattdessen die Überschneidung
// der trainierten Muskelgruppen herangezogen — ab der Hälfte gemeinsamer Gruppen gilt das als
// ähnlich genug.
function sessionsAreSimilar(a, b){
  if (!a || !b || a.id === b.id) return false;
  if (a.mode && b.mode && a.mode !== 'frei' && a.mode === b.mode) return true;
  const groupsOf = (s) => new Set(s.entries.map(e => {
    const planEx = plan.exercises.find(x => x.id === e.exerciseId);
    return (planEx && planEx.muscleGroup) || null;
  }).filter(Boolean));
  const ga = groupsOf(a), gb = groupsOf(b);
  if (!ga.size || !gb.size) return false;
  const shared = [...ga].filter(g => gb.has(g)).length;
  return shared / Math.min(ga.size, gb.size) >= 0.5;
}

function startSessionCompare(session){
  compareSessionA = session;
  renderCompareBanner();
  refreshVisibleHistoryLists();
}
function cancelSessionCompare(){
  compareSessionA = null;
  removeCompareBanner();
  refreshVisibleHistoryLists();
}
// Rendert die gerade sichtbare Liste neu, damit die Ähnlich/Abgeblendet-Markierung sofort
// erscheint bzw. beim Abbrechen wieder verschwindet — unabhängig davon, ob man sich gerade auf
// der Startseite oder in der Workouts-Übersicht befindet.
// BUGFIX: history.state.view war hier unzuverlässig — "Vergleichen" wird über
// openHistoryContextMenu() ausgelöst, dessen close() zuerst popOverlayStateIfOpen() aufruft
// (ein ASYNCHRONES history.back()) und DIREKT DANACH synchron diese Funktion. Zu diesem
// Zeitpunkt hatte das back() den History-State oft noch nicht auf "workoutsOverview"
// zurückgesetzt (stand noch auf dem zwischenzeitlich gepushten '__overlay__' des Kontext-
// menüs) — dadurch landete man beim Vergleichen-Button fälschlich auf der Startseite statt in
// der Workouts-Übersicht zu bleiben. lastRenderedHistoryView wird stattdessen SYNCHRON von
// renderHome()/renderWorkoutsOverview() selbst gesetzt, ganz unabhängig von der History-API.
function refreshVisibleHistoryLists(){
  if (lastRenderedHistoryView === 'workoutsOverview') renderWorkoutsOverview();
  else renderHome();
}

function renderCompareBanner(){
  removeCompareBanner();
  if (!compareSessionA) return;
  const el = document.createElement('div');
  el.className = 'mini-player';
  el.id = 'compareBanner';
  // Läuft gerade zusätzlich ein Training, sitzt dessen eigenes Mini-Banner bereits auf
  // bottom:0 — dann rutscht dieses hier eine Bannerhöhe weiter nach oben, statt sich zu
  // überlappen (kommt praktisch selten vor, aber schadet nicht, das abzufangen).
  if (typeof active !== 'undefined' && active) el.style.bottom = '60px';
  el.innerHTML = `
    <div class="mini-player-mid">
      <div class="mini-player-time">Vergleichen</div>
      <div class="mini-player-exercise">${modeDisplayLabel(compareSessionA.mode)} · ${fmtDate(compareSessionA.date)} — zweites Training antippen</div>
    </div>
    <button class="mini-player-cancel" id="compareBannerCancel" aria-label="Abbrechen">✕</button>
  `;
  document.body.appendChild(el);
  document.getElementById('compareBannerCancel').onclick = () => cancelSessionCompare();
}
function removeCompareBanner(){
  const el = document.getElementById('compareBanner');
  if (el) el.remove();
}
// Zusätzlich zum Banner unten (rein optisches Signal, kann beim Scrollen leicht übersehen
// werden) noch ein deutlicher Hinweis-Balken direkt IM Verlaufsscreen selbst — sowohl im
// kompakten Home-Verlauf als auch in der vollen Workouts-Übersicht (siehe beide
// renderHome()/renderWorkoutsOverview()). Muss nach jedem Rendern per
// wireCompareModePill() extra verkabelt werden, da app.innerHTML die Buttons jedes Mal
// neu erzeugt.
function compareModePillHTML(){
  if (!compareSessionA) return '';
  return `
    <div class="compare-mode-pill">
      <span>Vergleichen: ${modeDisplayLabel(compareSessionA.mode)} · ${fmtDate(compareSessionA.date)}</span>
      <button id="compareModePillCancel" type="button" aria-label="Abbrechen">✕</button>
    </div>
  `;
}
function wireCompareModePill(){
  const btn = document.getElementById('compareModePillCancel');
  if (btn) btn.onclick = () => cancelSessionCompare();
}

// Zentrale Klick-Weiche für ALLE `.history-row`-Elemente im aktuell gerenderten DOM — ersetzt
// die frühere, an beiden Aufrufstellen (renderHome()/renderWorkoutsOverview()) identisch
// duplizierte "row.onclick = () => goSessionDetail(...)"-Zeile. Im Vergleichsmodus navigiert
// ein Tap NICHT mehr zur Detailseite, sondern wählt die Zeile als zweite Einheit.
function wireHistoryRowClicks(){
  app.querySelectorAll('.history-row').forEach(row => {
    row.onclick = () => {
      if (compareSessionA){
        if (row.dataset.id === compareSessionA.id){ cancelSessionCompare(); return; }
        const b = sessions.find(x => x.id === row.dataset.id);
        if (!b) return;
        const a = compareSessionA;
        cancelSessionCompare();
        openSessionComparePrompt(a, b);
        return;
      }
      goSessionDetail(row.dataset.id);
    };
  });
}

// Bewegtes Gewicht (kg) bzw. Gesamtzeit (Sek.) je Übungsname EINER Einheit — Grundlage für den
// Übungs-für-Übungs-Vergleich in openSessionComparePrompt(). Gewicht wird bevorzugt gezeigt
// (Kraftübungen), Zeit nur als Rückfalloption für reine Zeit-/Kardio-Übungen ohne Gewichtsfeld.
function exerciseAmountsForCompare(session){
  const map = {};
  session.entries.forEach(e => {
    let volKg = 0, sec = 0;
    (e.sets || []).forEach(st => {
      if (st.reps && st.weight) volKg += st.reps * st.weight;
      if (st.seconds) sec += st.seconds;
    });
    if (!map[e.name]) map[e.name] = { volKg: 0, sec: 0 };
    map[e.name].volKg += volKg;
    map[e.name].sec += sec;
  });
  return map;
}

// Vergleichsansicht für zwei Einheiten (siehe startSessionCompare() oben) — Gesamtwerte
// nebeneinander plus eine Übung-für-Übung-Gegenüberstellung, sortiert nach dem größten
// gemeinsamen Beitrag. Nur ein einfaches Popup wie die übrigen Bestätigungs-/Auswahl-Dialoge,
// kein eigener History-Eintrag nötig (kein verschachteltes Popup dahinter, das kollidieren
// könnte) — daher hier bewusst normales pushOverlayState() statt des "Eltern-Popup"-Musters.
function openSessionComparePrompt(a, b){
  const existing = document.getElementById('sessionCompareOverlay');
  if (existing) existing.remove();

  const statRow = (label, va, vb, formatter, higherIsBetter) => {
    const fa = formatter(va), fb = formatter(vb);
    const better = (va == null || vb == null || va === vb) ? null
      : (higherIsBetter ? (va > vb ? 'a' : 'b') : (va < vb ? 'a' : 'b'));
    return `
      <div class="compare-stat-row">
        <span class="compare-stat-val ${better === 'a' ? 'compare-stat-better' : ''}">${fa ?? '–'}</span>
        <span class="compare-stat-label">${label}</span>
        <span class="compare-stat-val ${better === 'b' ? 'compare-stat-better' : ''}">${fb ?? '–'}</span>
      </div>
    `;
  };

  const volA = sessionVolumeKgRaw(a), volB = sessionVolumeKgRaw(b);
  const kcalA = estimateSessionKcal(a), kcalB = estimateSessionKcal(b);
  const rpeA = rpeEnabled() ? avgRpeForSessions([a]) : null;
  const rpeB = rpeEnabled() ? avgRpeForSessions([b]) : null;

  const statsHTML = [
    statRow('Dauer', a.durationSec, b.durationSec, v => fmtDuration(v), false),
    statRow('Bewegtes Gewicht', volA, volB, v => Math.round(v).toLocaleString('de-DE') + ' kg', true),
    (kcalA != null || kcalB != null) ? statRow('≈ kcal', kcalA, kcalB, v => v == null ? null : v.toLocaleString('de-DE'), true) : '',
    (rpeA != null || rpeB != null) ? statRow('Ø Intensität', rpeA, rpeB, v => v == null ? null : fmtRpe(v), true) : '',
  ].join('');

  // Übung-für-Übung: alle Namen aus BEIDEN Einheiten (Vereinigung), absteigend nach dem
  // größeren der beiden Beiträge sortiert — die aussagekräftigsten Vergleiche stehen oben.
  const amtA = exerciseAmountsForCompare(a), amtB = exerciseAmountsForCompare(b);
  const names = [...new Set([...Object.keys(amtA), ...Object.keys(amtB)])]
    .sort((x, y) => Math.max(amtB[y]?.volKg || amtB[y]?.sec || 0, amtA[y]?.volKg || amtA[y]?.sec || 0)
                  - Math.max(amtB[x]?.volKg || amtB[x]?.sec || 0, amtA[x]?.volKg || amtA[x]?.sec || 0));
  const formatAmount = (m) => {
    if (!m) return '–';
    if (m.volKg > 0) return Math.round(m.volKg).toLocaleString('de-DE') + ' kg';
    if (m.sec > 0) return fmtDuration(m.sec);
    return '✓';
  };
  const exerciseRowsHTML = names.map(name => {
    const ma = amtA[name], mb = amtB[name];
    const va = ma ? (ma.volKg || ma.sec || 0) : null;
    const vb = mb ? (mb.volKg || mb.sec || 0) : null;
    const better = (va == null || vb == null || va === vb) ? null : (va > vb ? 'a' : 'b');
    return `
      <div class="compare-stat-row compare-stat-row-clickable" data-compare-exercise="${ftEscapeHTML(name)}" role="button" tabindex="0">
        <span class="compare-stat-val compare-stat-val-ex ${better === 'a' ? 'compare-stat-better' : ''}">${formatAmount(ma)}</span>
        <span class="compare-stat-label compare-stat-label-ex">${ftEscapeHTML(name)} ›</span>
        <span class="compare-stat-val compare-stat-val-ex ${better === 'b' ? 'compare-stat-better' : ''}">${formatAmount(mb)}</span>
      </div>
    `;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'sessionCompareOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">Vergleich</div>
        <button class="add-exercise-modal-close" id="sessionCompareClose" aria-label="Schließen">✕</button>
      </div>
      <div class="new-exercise-modal-body">
        <div class="compare-header-row">
          <div class="compare-header-col">
            <div class="compare-header-mode">${modeDisplayLabel(a.mode)}</div>
            <div class="compare-header-date">${fmtDate(a.date)}</div>
          </div>
          <div class="compare-header-col">
            <div class="compare-header-mode">${modeDisplayLabel(b.mode)}</div>
            <div class="compare-header-date">${fmtDate(b.date)}</div>
          </div>
        </div>
        ${statsHTML}
        ${exerciseRowsHTML ? `<div class="section-label" style="margin-top:16px;">Je Übung</div>${exerciseRowsHTML}` : ''}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(remove);
  function remove(){ const el = document.getElementById('sessionCompareOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); };
  document.getElementById('sessionCompareClose').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
  overlay.querySelectorAll('[data-compare-exercise]').forEach(row => {
    row.onclick = () => openExerciseCompareDetail(a, b, row.dataset.compareExercise);
  });
}

// Satz-für-Satz-Detailvergleich EINER Übung (siehe data-compare-exercise-Zeilen oben) — liegt
// über der bereits offenen Vergleichsansicht, daher bewusst KEIN eigener pushOverlayState()
// (gleiches "obersten Zurück-Handler ersetzen"-Muster wie openSessionEntryExercisePicker()/
// openSessionExclusionPrompt(), aus demselben Grund: Race Condition zwischen dem asynchronen
// history.back() und einem sofort folgenden synchronen pushState()).
function openExerciseCompareDetail(a, b, name){
  const entryA = a.entries.find(e => e.name === name);
  const entryB = b.entries.find(e => e.name === name);
  const isTime = (entryA && entryA.type === 'time') || (entryB && entryB.type === 'time');
  const setsA = entryA ? entryA.sets : [];
  const setsB = entryB ? entryB.sets : [];
  const maxSets = Math.max(setsA.length, setsB.length);
  const fmtSet = (s) => {
    if (!s) return '–';
    if (isTime) return s.seconds != null ? fmtDuration(s.seconds) : '–';
    if (s.reps == null && s.weight == null) return '–';
    return `${s.reps ?? '–'} × ${s.weight != null ? s.weight.toLocaleString('de-DE') + ' kg' : '–'}`;
  };
  let rowsHTML = '';
  for (let i = 0; i < maxSets; i++){
    rowsHTML += `
      <div class="compare-stat-row">
        <span class="compare-stat-val">${fmtSet(setsA[i])}</span>
        <span class="compare-stat-label">Satz ${i+1}</span>
        <span class="compare-stat-val">${fmtSet(setsB[i])}</span>
      </div>
    `;
  }

  const existing = document.getElementById('exerciseCompareDetailOverlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'exerciseCompareDetailOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">${exerciseNameHTML(name)}</div>
        <button class="add-exercise-modal-close" id="exerciseCompareDetailClose" aria-label="Zurück">✕</button>
      </div>
      <div class="new-exercise-modal-body">
        <div class="compare-header-row">
          <div class="compare-header-col">
            <div class="compare-header-mode">${modeDisplayLabel(a.mode)}</div>
            <div class="compare-header-date">${fmtDate(a.date)}</div>
          </div>
          <div class="compare-header-col">
            <div class="compare-header-mode">${modeDisplayLabel(b.mode)}</div>
            <div class="compare-header-date">${fmtDate(b.date)}</div>
          </div>
        </div>
        ${rowsHTML || '<div class="history-empty">Keine Sätze protokolliert.</div>'}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const parentCloseFn = overlayCloseStack.length ? overlayCloseStack[overlayCloseStack.length - 1] : null;
  function restoreParent(){
    if (parentCloseFn){
      if (overlayCloseStack.length) overlayCloseStack[overlayCloseStack.length - 1] = parentCloseFn;
      else overlayCloseStack.push(parentCloseFn);
    }
  }
  function remove(){ const el = document.getElementById('exerciseCompareDetailOverlay'); if (el) el.remove(); }
  function close(){ remove(); restoreParent(); }
  if (overlayCloseStack.length) overlayCloseStack[overlayCloseStack.length - 1] = close;
  else overlayCloseStack.push(close);

  document.getElementById('exerciseCompareDetailClose').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
}

function historyRowHTML(s){
  const totalSets = s.entries.reduce((a,e)=>a+e.sets.length,0);
  // Kleiner, unauffälliger Hinweis bei Einheiten, die über die "Frei"-Kachel liefen — vor allem
  // relevant, wenn diese Zeile gerade wegen sessionMatchesFilter()'s Cross-Listing unter einem
  // ANDEREN Kachel-Filter (z. B. "Push") auftaucht, aber auch sonst eine nützliche Info.
  const freiTag = s.mode === 'frei' ? `<span class="history-free-tag">frei</span>` : '';
  // Während des Vergleichsmodus (siehe startSessionCompare() unten): die als Vergleichsbasis
  // gewählte Einheit selbst bekommt eine eigene Markierung, ähnliche Einheiten (gleiche
  // Trainingsart, z. B. beide "Unterkörper") werden hervorgehoben, alle anderen dezent
  // abgeblendet — so fällt sofort auf, wo ein sinnvoller zweiter Vergleichspartner steht.
  let compareClass = '';
  if (compareSessionA){
    if (compareSessionA.id === s.id) compareClass = ' history-row-compare-a';
    else if (sessionsAreSimilar(compareSessionA, s)) compareClass = ' history-row-compare-similar';
    else compareClass = ' history-row-compare-dim';
  }
  return `
    <div class="history-row${compareClass}" data-id="${s.id}" role="button" tabindex="0" style="-webkit-user-select:none; user-select:none; -webkit-touch-callout:none; touch-action:manipulation;">
      <div style="-webkit-user-select:none; user-select:none;">
        <div class="history-date" style="-webkit-user-select:none; user-select:none;">${fmtDate(s.date)}</div>
        <div class="history-meta" style="-webkit-user-select:none; user-select:none;">${s.entries.length} Übungen · ${totalSets} Sätze</div>
      </div>
      ${freiTag}
      <div class="history-meta" style="-webkit-user-select:none; user-select:none;">${fmtDuration(s.durationSec)}</div>
    </div>`;
}

function monthLabel(iso){
  const label = new Date(iso).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Steuert die Reihenfolge der Blöcke auf der Startseite: 'default' (Standard) zeigt
// Nav-Zeile → "Training starten" → Verlauf, wie bisher. 'historyFirst' dreht das um: Verlauf
// zuerst (direkt unter der Überschrift), dann Nav-Zeile, "Training starten" ganz unten —
// gedacht für Personen, die primär im Verlauf stöbern und den Start-Button seltener
// brauchen (der bleibt unten trotzdem gut mit dem Daumen erreichbar). Umschaltbar in den
// Einstellungen, siehe renderSettings().
function homeLayoutMode(){
  return (plan && plan.homeLayoutMode === 'historyFirst') ? 'historyFirst' : 'default';
}

// Ein-/Ausschalter für den Wochenstreifen ("Datumsanzeige") auf der Startseite —
// standardmäßig an, in den Einstellungen genauso schmal wie "Training oben anzeigen"
// abschaltbar (siehe renderSettings(), plan.weekStripEnabled).
function isWeekStripEnabled(){
  return !(plan && plan.weekStripEnabled === false);
}

// Ein-/Ausschalter für das Essenstracker-Feature (siehe 15-food-tracker.js) — standardmäßig
// AUS (Standard: aus, wie gewünscht), in den Einstellungen unter "Allgemein" umschaltbar
// (siehe renderSettings(), 10-plan-settings.js). Nur bei aktivem Feature erscheint der
// Gabel/Messer-Button oben rechts neben "Trainingsplan" (renderHome() unten) UND ist der
// Screen selbst über die Zurück-/Vorwärts-Navigation erreichbar (case 'foodTracker' in
// renderViewByState(), 06-navigation.js) — ausgeschaltet bleibt goFoodTracker() zwar technisch
// aufrufbar (kein hartes Verstecken der Funktion nötig), nur eben ohne Einstiegspunkt in der UI.
function isFoodTrackerEnabled(){
  return !!(plan && plan.foodTrackerEnabled);
}

// Vom Nutzer bereitgestelltes Gabel/Messer-Piktogramm (siehe messer-und-gabel.png, ersetzt die
// vorherige, per Stroke nachgezeichnete Version), als flächig gefülltes Inline-SVG nachgebaut
// statt als Bild eingebunden — dadurch lässt es sich wie die anderen SVG-Icons der App per
// fill="currentColor" einfärben (hier bewusst in der Akzentfarbe, siehe Verwendung unten in
// renderHome()).
// Ab wie vielen Tagen seit dem letzten Export (siehe lastExportAt, 02-state-theme.js / 10-plan-
// settings.js) die Backup-Erinnerung auf der Startseite erscheint.
const BACKUP_REMINDER_DAYS = 30;
function isBackupReminderDue(){
  if (!sessions.length) return false; // ohne protokollierte Einheiten gibt es nichts Wichtiges zu sichern
  if (!lastExportAt) return true; // noch nie exportiert
  const daysSince = (Date.now() - new Date(lastExportAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= BACKUP_REMINDER_DAYS;
}

// Inhalt des Mahlzeiten-Akkordeons auf der Startseite (renderHome()) — bewusst sehr kompakt
// im Vergleich zur vollen Tagesansicht im Essenstracker (ftMealHTML(), 15b-food-day.js): pro
// Mahlzeit nur eine umrandete Box mit Kopfzeile (identische .meal-title/.meal-add-Klassen wie
// im Essenstracker, siehe Screenshot-Vorlage) und darunter — falls vorhanden — alle bereits
// eingetragenen Lebensmittel als EINE kleine, einzeilige Liste statt einzelner Zeilen wie dort.
// Arbeitet immer mit dem HEUTIGEN Datum (ftTodayISO()), unabhängig vom zuletzt im
// Essenstracker angezeigten ftCurrentDate — ein schneller Überblick auf der Startseite soll
// sich nicht danach richten, welcher Tag dort zuletzt zufällig offen war.
function homeMealsAccordionBodyHTML(){
  if (!foodTrackerLoaded){
    return `<div class="loading-row">Lädt …</div>`;
  }
  const iso = ftTodayISO();
  const day = ftGetDay(iso);
  return FT_MEAL_KEYS.map(meal => {
    const entries = day[meal];
    const kcal = ftMealTotal(iso, meal);
    const itemsText = entries.map(e => e.name).join(' · ');
    return `
      <div class="home-meal-box" data-home-meal-box="${meal}">
        <div class="meal-head" style="margin-bottom:0;">
          <div class="meal-title" style="font-size:0.95rem;">${FT_MEAL_LABELS[meal]}${entries.length ? ` <span class="meal-kcal">· ${kcal} kcal</span>` : ''}</div>
          <button class="meal-add" style="width:26px; height:26px; font-size:1.1rem;" data-home-meal-add="${meal}">+</button>
        </div>
        ${entries.length ? `<div class="home-meal-box-items">${ftEscapeHTML(itemsText)}</div>` : ''}
      </div>
    `;
  }).join('');
}
function renderHome(){
  lastRenderedHistoryView = 'home';
  const allSorted = sessions.slice().reverse();
  const recent = allSorted.slice(0, 5);
  const rest = allSorted.slice(5);

  const recentHTML = recent.map(historyRowHTML).join('');

  // "Weitere Einheiten anzeigen" führt jetzt zur eigenen, filterbaren Workouts-Übersicht
  // (goWorkoutsOverview, nach Monat gruppiert + Filter nach Jahr/Kategorie) statt die Zeilen
  // direkt hier inline aufzuklappen — bei vielen Einheiten wurde das schnell unübersichtlich
  // und ließ sich nicht filtern.
  const toggleHTML = rest.length ? `
    <button class="history-toggle" id="btnHistoryToggle">
      ${rest.length} weitere Einheit${rest.length === 1 ? '' : 'en'} anzeigen ▸
    </button>
  ` : '';

  const navRowHTML = `
    <div class="nav-row">
      <button class="gear" id="btnProgress">Statistiken</button>
      <button class="gear" id="btnPlan">Übungen</button>
      <button class="gear nav-row-icon-only" id="btnSettings" aria-label="Einstellungen">⚙</button>
    </div>
  `;
  const startBtnHTML = `<button class="btn btn-primary" id="btnStart">Training starten</button>`;
  const foodOn = isFoodTrackerEnabled();
  // Bei aktiviertem Essenstracker wird "Verlauf" (das bisherige feste Trainings-Protokoll auf
  // der Startseite) zu einem einklappbaren Akkordeon — Wunsch: Trainings sollen dann nicht
  // mehr den ganzen Startbildschirm einnehmen, Platz für die neue Mahlzeiten-Übersicht
  // darunter. Ohne aktivierten Essenstracker bleibt exakt das bisherige, feste Verhalten
  // (Kopfzeile direkt klickbar → Workouts-Übersicht, Liste immer sichtbar).
  const historyBodyInnerHTML = `
    ${compareModePillHTML()}
    <div class="history">
      ${recentHTML || '<div class="history-empty">Noch keine Einheit protokolliert.</div>'}
    </div>
    ${toggleHTML}
  `;
  const historyHTML = foodOn ? `
    <div class="muscle-group" style="margin-top:0;">
      <button class="muscle-group-header" id="btnHomeHistoryToggle" type="button">
        <span class="mg-name">Verlauf</span>
        <span class="mg-meta"><span class="mg-arrow">${homeVerlaufOpen ? '▾' : '▸'}</span></span>
      </button>
      <div class="muscle-group-body" style="display:${homeVerlaufOpen ? 'block' : 'none'};">
        ${historyBodyInnerHTML}
      </div>
    </div>
  ` : `
    <button class="section-label section-label-link" id="btnHistoryLabel" type="button"><img class="section-label-icon" src="${ICON_HISTORY}" alt="">Verlauf</button>
    ${historyBodyInnerHTML}
  `;

  // Mahlzeiten-Akkordeon: kompakte Übersicht der heutigen Mahlzeiten mit "+"-Button pro
  // Mahlzeit, der direkt in denselben Hinzufügen-Flow wie im vollen Essenstracker führt
  // (goFtAddFood(), 15c-food-add.js) — siehe homeMealsAccordionBodyHTML() weiter unten für den
  // eigentlichen Inhalt. Essenstracker-Daten werden dabei bewusst erst BEIM ERSTEN Aufklappen
  // geladen (initFoodTracker(), asynchron), nicht schon beim bloßen Anzeigen der Startseite —
  // vermeidet unnötige IndexedDB-Reads, wenn der Bereich ohnehin eingeklappt bleibt.
  const mealsHTML = foodOn ? (() => {
    const todayKcal = foodTrackerLoaded ? ftComputeTotals(ftTodayISO()).kcal : 0;
    return `
    <div class="muscle-group" style="margin-top:16px;">
      <button class="muscle-group-header" id="btnHomeMealsToggle" type="button">
        <span class="mg-name">Mahlzeiten</span>
        <span class="mg-meta">${todayKcal ? `<span>${todayKcal} kcal</span>` : ''}<span class="mg-arrow">${homeMealsOpen ? '▾' : '▸'}</span></span>
      </button>
      <div class="muscle-group-body" style="display:${homeMealsOpen ? 'block' : 'none'};">
        ${homeMealsAccordionBodyHTML()}
      </div>
    </div>
  `;
  })() : '';

  const isHistoryFirst = homeLayoutMode() === 'historyFirst';
  const historyFirstBlockHTML = `${historyHTML}${mealsHTML}<div style="margin-top:26px;">${navRowHTML}</div><div style="margin-top:14px;">${startBtnHTML}</div>`;
  const bodyHTML = isHistoryFirst
    ? `<div class="home-thumb-spacer"></div><div class="home-thumb-block">${historyFirstBlockHTML}</div>`
    : `${navRowHTML}<div style="margin:0 0 22px;">${startBtnHTML}</div>${historyHTML}${mealsHTML}`;

  // Backup-Erinnerung: dezenter Hinweis, kein blockierendes Popup — alle lokalen Daten
  // (localStorage/IndexedDB) sind ein Geräteverlust oder ein "Browserdaten löschen" von einem
  // Totalverlust entfernt, ohne eigenes Backend gibt es keine andere Absicherung.
  const backupReminderHTML = isBackupReminderDue() ? `
    <div class="backup-reminder" id="backupReminder">
      <span class="backup-reminder-text">${lastExportAt ? 'Letztes Backup ist über ' + BACKUP_REMINDER_DAYS + ' Tage her.' : 'Noch kein Backup deiner Trainingsdaten erstellt.'}</span>
      <button class="backup-reminder-btn" id="btnBackupReminder" type="button">Jetzt sichern</button>
    </div>
  ` : '';

  const foodTrackerBtnHTML = foodOn ? `
    <button class="brand-food-btn" id="btnFoodTracker" aria-label="Essenstracker" title="Essenstracker"></button>
  ` : '';

  app.innerHTML = `
    <div class="${isHistoryFirst ? 'home-thumb-wrap' : ''}">
      <div class="brand" style="margin-bottom:${isHistoryFirst ? '20px' : '14px'};">
        <h1>Trainingsplan</h1>
        ${foodTrackerBtnHTML}
      </div>
      ${backupReminderHTML}
      ${isWeekStripEnabled() ? weekStripHTML() : ''}
      ${bodyHTML}
    </div>
  `;

  document.getElementById('btnStart').onclick = () => goStartSelect();
  document.getElementById('btnPlan').onclick = () => goPlan();
  document.getElementById('btnProgress').onclick = () => goProgressList();
  document.getElementById('btnSettings').onclick = () => goSettings();
  if (document.getElementById('btnHistoryLabel')) document.getElementById('btnHistoryLabel').onclick = () => goWorkoutsOverview();
  if (document.getElementById('btnHomeHistoryToggle')){
    document.getElementById('btnHomeHistoryToggle').onclick = () => { homeVerlaufOpen = !homeVerlaufOpen; renderHome(); };
  }
  if (document.getElementById('btnHomeMealsToggle')){
    document.getElementById('btnHomeMealsToggle').onclick = () => {
      homeMealsOpen = !homeMealsOpen;
      if (homeMealsOpen && !foodTrackerLoaded){
        initFoodTracker().then(() => { if (document.getElementById('btnHomeMealsToggle')) renderHome(); });
      }
      renderHome();
    };
  }
  app.querySelectorAll('[data-home-meal-add]').forEach(btn => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      ftCurrentDate = ftTodayISO();
      goFtAddFood(btn.dataset.homeMealAdd);
    };
  });
  app.querySelectorAll('.home-meal-box').forEach(box => {
    box.onclick = () => { ftCurrentDate = ftTodayISO(); goFoodTracker(); };
  });
  if (document.getElementById('btnFoodTracker')) document.getElementById('btnFoodTracker').onclick = () => goFoodTracker();
  if (document.getElementById('btnBackupReminder')){
    // Führt direkt in die Einstellungen zum Exportieren-Button statt nur die Seite zu öffnen —
    // Backup-Erinnerung soll in einem Tap zur Handlung führen, nicht nur zur Fundstelle.
    document.getElementById('btnBackupReminder').onclick = () => {
      goSettings();
      const btn = document.getElementById('btnExport');
      if (btn) btn.click();
    };
  }
  wireWeekStrip();
  if (document.getElementById('btnHistoryToggle')){
    document.getElementById('btnHistoryToggle').onclick = () => goWorkoutsOverview();
  }
  wireHistoryRowClicks();
  wireHistoryLongPress();
  wireStartButtonLongPress();
  wireCompareModePill();
}

// 3 Sekunden gedrückt halten auf "Training starten" öffnet als schneller Zugriff ein
// kompaktes Popup zur Wahl der Akzentfarbe — als Abkürzung, ohne extra über das Zahnrad in
// die vollständigen Einstellungen navigieren zu müssen. Nutzt
// dasselbe Long-Press-Muster wie wireModeLongPress()/wireHistoryLongPress(), nur mit
// deutlich längerer Schwelle, damit ein normaler Tap zum Starten eines Trainings nicht aus
// Versehen das Popup auslöst.
function wireStartButtonLongPress(){
  const btn = document.getElementById('btnStart');
  if (!btn) return;
  const LONG_PRESS_MS = 3000;
  const MOVE_CANCEL_PX = 12;
  let pressTimer = null;
  let startX = 0, startY = 0, longPressFired = false;
  const cancel = () => { clearTimeout(pressTimer); pressTimer = null; };

  btn.addEventListener('contextmenu', (ev) => ev.preventDefault());
  btn.addEventListener('touchstart', (ev) => {
    longPressFired = false;
    const t = ev.touches[0];
    startX = t.clientX; startY = t.clientY;
    pressTimer = setTimeout(() => {
      longPressFired = true;
      if (navigator.vibrate) navigator.vibrate(20);
      openQuickAppearancePrompt();
    }, LONG_PRESS_MS);
  }, { passive: true });
  btn.addEventListener('touchmove', (ev) => {
    const t = ev.touches[0];
    if (Math.abs(t.clientX - startX) > MOVE_CANCEL_PX || Math.abs(t.clientY - startY) > MOVE_CANCEL_PX) cancel();
  }, { passive: true });
  btn.addEventListener('touchend', cancel);
  btn.addEventListener('touchcancel', cancel);

  btn.addEventListener('mousedown', () => {
    longPressFired = false;
    pressTimer = setTimeout(() => {
      longPressFired = true;
      openQuickAppearancePrompt();
    }, LONG_PRESS_MS);
  });
  btn.addEventListener('mouseup', cancel);
  btn.addEventListener('mouseleave', cancel);

  btn.addEventListener('click', (ev) => {
    if (longPressFired){ ev.preventDefault(); ev.stopPropagation(); longPressFired = false; }
  }, true);
}

// Eigenständiges, kompaktes Popup zur schnellen Wahl der Akzentfarbe (inkl. Favoriten/eigene
// Farbe) — per 3 Sekunden Long-Press auf "Training starten" erreichbar (siehe
// wireStartButtonLongPress()). Bewusst nur die Farbauswahl, ohne Farbmodus/Textkontrast, damit
// das Popup auf dem Bildschirm passt statt über den unteren Rand hinauszulaufen (die anderen
// Darstellungs-Optionen bleiben weiterhin in den vollständigen Einstellungen erreichbar).
// Pusht bewusst nur EINEN History-Eintrag beim ersten Öffnen; alle Änderungen bauen das
// Popup anschließend über das lokale render() neu auf, OHNE erneut zu pushen — sonst würde
// sich bei jeder Auswahl ein weiterer Zurück-Schritt aufstauen (siehe Bug: "Eigene Farbe
// wählen" schloss sich vorher selbst durch genau so einen doppelten History-Push).
function openQuickAppearancePrompt(){
  const existing = document.getElementById('quickAppearanceOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'quickAppearanceOverlay';
  document.body.appendChild(overlay);
  pushOverlayState(close);

  function remove(){ const el = document.getElementById('quickAppearanceOverlay'); if (el) el.remove(); }
  function close(){ popOverlayStateIfOpen(); remove(); }

  function render(){
    overlay.innerHTML = `
      <div class="add-exercise-modal" style="max-height:none;">
        <div class="add-exercise-modal-header">
          <div class="add-exercise-modal-title">Akzentfarbe</div>
          <button class="add-exercise-modal-close" id="quickAppearanceClose" aria-label="Schließen">✕</button>
        </div>
        <div class="new-exercise-modal-body">
          <div class="accent-swatch-grid" id="quickAccentSwatchGrid">
            ${allAccentSwatches().map(c => `
              <button class="accent-swatch ${currentAccentColor().id === c.id ? 'selected' : ''}" data-quick-accent-id="${c.id}" data-quick-accent-hex="${c.hex}" data-favorite="${c.isFavorite ? '1' : ''}" style="background:${c.hex};" aria-label="${c.name}"></button>
            `).join('')}
          </div>
          <button class="accent-custom-btn" id="quickAccentCustomBtn" type="button" style="margin-top:12px;">
            <img class="accent-custom-btn-icon" src="${ICON_COLORWHEEL}" alt="">
            Eigene Farbe wählen
          </button>
        </div>
      </div>
    `;

    document.getElementById('quickAppearanceClose').onclick = close;
    overlay.onclick = (ev) => { if (ev.target === overlay) close(); };

    const LONG_PRESS_MS = 450;
    const MOVE_CANCEL_PX = 10;
    overlay.querySelectorAll('#quickAccentSwatchGrid .accent-swatch').forEach(btn => {
      let swatchPressTimer = null;
      let startX = 0, startY = 0, longPressFired = false;
      const cancelPress = () => { clearTimeout(swatchPressTimer); swatchPressTimer = null; };
      const isFavorite = btn.dataset.favorite === '1';

      btn.onclick = async () => {
        if (longPressFired){ longPressFired = false; return; }
        plan.accentColorId = btn.dataset.quickAccentId;
        await saveJSON('plan', plan);
        applyTheme();
        close(); // Auswahl schließt das kompakte Popup direkt, statt offen zu bleiben
      };

      if (!isFavorite) return; // nur Favoriten sind entfernbar per Long-Press

      btn.addEventListener('contextmenu', (ev) => ev.preventDefault());
      btn.addEventListener('touchstart', (ev) => {
        longPressFired = false;
        const t = ev.touches[0];
        startX = t.clientX; startY = t.clientY;
        swatchPressTimer = setTimeout(async () => {
          longPressFired = true;
          if (navigator.vibrate) navigator.vibrate(15);
          if (!confirm('Diesen Favoriten entfernen?')) { longPressFired = false; return; }
          plan.favoriteAccentColors = favoriteAccentColors().filter(h => h !== btn.dataset.quickAccentHex);
          if (plan.accentColorId === btn.dataset.quickAccentId) plan.accentColorId = ACCENT_COLORS[0].id;
          await saveJSON('plan', plan);
          applyTheme();
          render();
        }, LONG_PRESS_MS);
      }, { passive: true });
      btn.addEventListener('touchmove', (ev) => {
        const t = ev.touches[0];
        if (Math.abs(t.clientX - startX) > MOVE_CANCEL_PX || Math.abs(t.clientY - startY) > MOVE_CANCEL_PX) cancelPress();
      }, { passive: true });
      btn.addEventListener('touchend', cancelPress);
      btn.addEventListener('touchcancel', cancelPress);
    });

    const customBtn = document.getElementById('quickAccentCustomBtn');
    if (customBtn) customBtn.onclick = () => openAccentColorPickerPrompt(null, null, () => { close(); renderHome(); });
  }

  render();
}

