/* ---------------------------------------------------
   HOME
--------------------------------------------------- */
let historyExpanded = false;
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

function historyRowHTML(s){
  const totalSets = s.entries.reduce((a,e)=>a+e.sets.length,0);
  // Kleiner, unauffälliger Hinweis bei Einheiten, die über die "Frei"-Kachel liefen — vor allem
  // relevant, wenn diese Zeile gerade wegen sessionMatchesFilter()'s Cross-Listing unter einem
  // ANDEREN Kachel-Filter (z. B. "Push") auftaucht, aber auch sonst eine nützliche Info.
  const freiTag = s.mode === 'frei' ? `<span class="history-free-tag">frei</span>` : '';
  return `
    <div class="history-row" data-id="${s.id}" role="button" tabindex="0" style="-webkit-user-select:none; user-select:none; -webkit-touch-callout:none; touch-action:manipulation;">
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

function renderHome(){
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
  const historyHTML = `
    <button class="section-label section-label-link" id="btnHistoryLabel" type="button"><img class="section-label-icon" src="${ICON_HISTORY}" alt="">Verlauf</button>
    <div class="history">
      ${recentHTML || '<div class="history-empty">Noch keine Einheit protokolliert.</div>'}
    </div>
    ${toggleHTML}
  `;

  const isHistoryFirst = homeLayoutMode() === 'historyFirst';
  const historyFirstBlockHTML = `${historyHTML}<div style="margin-top:26px;">${navRowHTML}</div><div style="margin-top:14px;">${startBtnHTML}</div>`;
  const bodyHTML = isHistoryFirst
    ? `<div class="home-thumb-spacer"></div><div class="home-thumb-block">${historyFirstBlockHTML}</div>`
    : `${navRowHTML}<div style="margin:0 0 22px;">${startBtnHTML}</div>${historyHTML}`;

  app.innerHTML = `
    <div class="${isHistoryFirst ? 'home-thumb-wrap' : ''}">
      <div class="brand" style="margin-bottom:${isHistoryFirst ? '20px' : '14px'};">
        <h1>Trainingsplan</h1>
      </div>
      ${isWeekStripEnabled() ? weekStripHTML() : ''}
      ${bodyHTML}
    </div>
  `;

  document.getElementById('btnStart').onclick = () => goStartSelect();
  document.getElementById('btnPlan').onclick = () => goPlan();
  document.getElementById('btnProgress').onclick = () => goProgressList();
  document.getElementById('btnSettings').onclick = () => goSettings();
  document.getElementById('btnHistoryLabel').onclick = () => goWorkoutsOverview();
  wireWeekStrip();
  if (document.getElementById('btnHistoryToggle')){
    document.getElementById('btnHistoryToggle').onclick = () => goWorkoutsOverview();
  }
  app.querySelectorAll('.history-row').forEach(row=>{
    row.onclick = () => goSessionDetail(row.dataset.id);
  });
  wireHistoryLongPress();
  wireStartButtonLongPress();
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

