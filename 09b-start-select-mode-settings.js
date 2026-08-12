/* ---------------------------------------------------
   09b-start-select-mode-settings.js
   ---------------------------------------------------
   Teil 2/3 der ehemals einzelnen 09-start-select.js — reiner Dateigrößen-
   Split ohne inhaltliche Änderung, siehe Kopf von 09a-start-select.js.
   Läuft nach 09a, vor 09c.
   Inhalt: Modus-Einstellungen-Popup (Farbe/Übungspool je Modus), "Kategorie
   hinzufügen/Import"-Dialog, sowie der Assistent zum nachträglichen
   Erfassen vergangener Einheiten.
--------------------------------------------------- */
// reuseHistoryEntry: true, wenn dieses Popup direkt aus einem Unter-Popup heraus wieder
// geöffnet wird, das KEINEN eigenen History-Eintrag gepusht, sondern nur den obersten
// Zurück-Handler ersetzt hatte (Rahmenfarbe-Swatches, HSV-Farbwähler — siehe
// openModeSettingsColorPickerPrompt() unten und openAccentColorPickerPrompt() in
// 10-plan-settings.js). Der History-Eintrag von vorhin existiert dann noch; ein weiterer
// pushState() würde History-Tiefe und overlayCloseStack auseinanderlaufen lassen — Folge
// war ein toter Zurück-Pfeil und, weil der aktuelle Eintrag ein '__overlay__'-Marker blieb,
// ein Sprung auf die Startseite beim Aktualisieren der Seite.
function openModeSettingsPrompt(mode, reuseHistoryEntry){
  const existing = document.getElementById('modeSettingsOverlay');
  if (existing) existing.remove();

  const isFrei = mode === 'frei';

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'modeSettingsOverlay';
  document.body.appendChild(overlay);
  if (reuseHistoryEntry && overlayCloseStack.length) overlayCloseStack[overlayCloseStack.length - 1] = remove;
  else pushOverlayState(remove);

  function remove(){ const el = document.getElementById('modeSettingsOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); };

  function render(){
    const currentLabel = isFrei ? 'Frei' : modeDisplayLabel(mode);
    const currentFilter = modePoolFilter(mode);
    const tileColor = currentTileColor(mode);

    const nameAndPoolHTML = isFrei ? '' : `
      <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:6px;">Name</label>
      <input type="text" id="modeSettingsNameInput" value="${currentLabel.replace(/"/g,'&quot;')}" placeholder="${MODE_LABELS[mode] || mode}" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:16px; margin-bottom:16px;">

      <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:6px;">Übungen zur Auswahl</label>
      <button class="muscle-group-header" id="modeSettingsFilterToggle" type="button" style="margin-bottom:0;">
        <span class="mg-name" style="font-family:inherit; font-size:14px; letter-spacing:normal;">${POOL_FILTER_LABELS[currentFilter] || 'Alle Übungen'}</span>
        <span class="mg-meta">▸</span>
      </button>

      <div class="muscle-group-header settings-static-row" style="margin-top:16px; margin-bottom:0;">
        <span class="mg-name" style="font-family:inherit; font-size:14px; letter-spacing:normal;">A/B-Training</span>
        <button class="toggle-switch ${isSplitCollapsed(mode) ? '' : 'on'}" id="modeSettingsSplitToggle" type="button" role="switch" aria-checked="${!isSplitCollapsed(mode)}" aria-label="A/B-Training">
          <span class="toggle-knob"></span>
        </button>
      </div>
    `;

    // Rahmenfarbe: statt eines inline aufklappenden Swatch-Grids (das im Popup nicht auf den
    // Bildschirm passte) öffnet der Button jetzt ein eigenes, darüber liegendes Popup — Tap auf
    // eine Farbe wählt sofort und schließt dieses Sub-Popup wieder automatisch.
    const colorHTML = `
      <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:6px; margin-top:${isFrei ? '0' : '16px'};">Rahmenfarbe</label>
      <button class="muscle-group-header" id="modeColorToggle" type="button" style="margin-bottom:0;">
        <span class="mg-name" style="display:flex; align-items:center; gap:10px; font-family:inherit; font-size:14px; letter-spacing:normal;">
          <span style="width:20px; height:20px; border-radius:7px; background:${tileColor ? tileColor.hex : 'transparent'}; border:1px solid var(--border); display:inline-block; flex-shrink:0;"></span>
          ${tileColor ? tileColor.name : 'Standard'}
        </span>
        <span class="mg-meta">▸</span>
      </button>
    `;

    overlay.innerHTML = `
      <div class="add-exercise-modal" style="max-height:none;">
        <div class="add-exercise-modal-header">
          <div class="add-exercise-modal-title">${isFrei ? 'Frei' : 'Kategorie bearbeiten'}</div>
          <button class="add-exercise-modal-close" id="modeSettingsClose" aria-label="Abbrechen">✕</button>
        </div>
        <div class="new-exercise-modal-body">
          ${nameAndPoolHTML}
          ${colorHTML}
        </div>
        <div class="add-exercise-modal-header" style="border-top:1px solid var(--border); border-bottom:none; gap:10px;">
          <button class="btn btn-ghost" id="modeSettingsCancel" style="flex:1;">Abbrechen</button>
          <button class="btn btn-primary" id="modeSettingsSave" style="flex:1;">${isFrei ? 'Schließen' : 'Speichern'}</button>
        </div>
        ${isFrei ? '' : `
        <div class="add-exercise-modal-header" style="border-top:1px solid var(--border); border-bottom:none; padding-top:0;">
          <button class="btn btn-ghost" id="modeSettingsRemoveTile" style="width:100%; color:var(--accent-2); border-color:var(--accent-2);">Kachel entfernen</button>
        </div>
        `}
      </div>
    `;
    wire();
  }

  function wire(){
    document.getElementById('modeSettingsClose').onclick = close;
    document.getElementById('modeSettingsCancel').onclick = close;
    overlay.onclick = (ev) => { if (ev.target === overlay) close(); };

    const filterToggle = document.getElementById('modeSettingsFilterToggle');
    if (filterToggle) filterToggle.onclick = () => openModeSettingsPoolPickerPrompt(mode, render);

    document.getElementById('modeColorToggle').onclick = () => openModeSettingsColorPickerPrompt(mode, render);

    const splitToggle = document.getElementById('modeSettingsSplitToggle');
    if (splitToggle) splitToggle.onclick = async () => {
      if (!plan.modeSettings) plan.modeSettings = {};
      if (!plan.modeSettings[mode]) plan.modeSettings[mode] = {};
      // Beim Deaktivieren wird die B-Liste (plan.modeLists[mode].B) bewusst NICHT gelöscht —
      // sie bleibt einfach ungenutzt gespeichert, bis A/B wieder aktiviert wird. Bewusst KEIN
      // close()/reopen hier (kein zweiter history.back()/pushState-Zyklus) — das Popup bleibt
      // die ganze Zeit über dasselbe Overlay-Element mit genau einem History-Eintrag, nur der
      // Inhalt wird per render() neu aufgebaut (gleiches Prinzip wie renderTabs()/renderRows()
      // anderswo in der App), sonst würde der globale popstate-Handler das Popup fälschlich
      // mitschließen (siehe Bug-Report zu verschachtelten Overlays).
      plan.modeSettings[mode].splitDisabled = !isSplitCollapsed(mode);
      await saveJSON('plan', plan);
      renderStartSelect();
      render();
    };

    const removeTileBtn = document.getElementById('modeSettingsRemoveTile');
    if (removeTileBtn) removeTileBtn.onclick = async () => {
      // Eine komplett leere "Training starten"-Seite kann nicht mehr entstehen, da die
      // "Frei"-Kachel fest ist und sich nicht entfernen lässt — hier lassen sich nur die drei
      // Modus-Kacheln (Oberkörper/Unterkörper/Ganzkörper) sowie Custom-Kategorien ausblenden,
      // notfalls auch alle gleichzeitig. Custom-Kategorien werden dabei komplett aus
      // plan.customCategories entfernt (nicht nur ausgeblendet) — sonst würde der begrenzte
      // Custom-Slot (siehe MAX_CUSTOM_CATEGORIES) dauerhaft belegt bleiben, ohne dass die
      // Kachel je wieder auftauchen könnte.
      const isCustom = customCategories().some(c => c.id === mode);
      if (isCustom){
        plan.customCategories = customCategories().filter(c => c.id !== mode);
        if (plan.modeLists) delete plan.modeLists[mode];
        if (plan.modeSettings) delete plan.modeSettings[mode];
        if (plan.startTileHidden) delete plan.startTileHidden[mode];
      } else {
        if (!plan.startTileHidden) plan.startTileHidden = {};
        plan.startTileHidden[mode] = true;
      }
      await saveJSON('plan', plan);
      close();
      renderStartSelect();
    };
    document.getElementById('modeSettingsSave').onclick = async () => {
      if (!isFrei){
        const nameInput = document.getElementById('modeSettingsNameInput');
        if (!plan.modeSettings) plan.modeSettings = {};
        if (!plan.modeSettings[mode]) plan.modeSettings[mode] = {};
        plan.modeSettings[mode].label = nameInput.value.trim();
        await saveJSON('plan', plan);
      }
      close();
      renderStartSelect();
    };
  }

  render();
}

// Eigenes Popup für die Rahmenfarben-Wahl im openModeSettingsPrompt()-Popup — öffnet sich
// oberhalb des Kategorie-Popups (statt inline aufzuklappen, wo das Swatch-Grid nicht auf den
// Bildschirm passte). Tap auf eine Farbe wählt sofort, speichert und schließt beide Popups
// wieder (identisches Sofort-Verhalten wie zuvor). Long-Press auf einen Favoriten entfernt ihn
// nur aus den Favoriten, das Popup bleibt dabei offen und baut sich neu auf.
function openModeSettingsColorPickerPrompt(mode, refreshParent){
  const existing = document.getElementById('modeColorPickerOverlay');
  if (existing) existing.remove();

  const tileColor = currentTileColor(mode);
  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'modeColorPickerOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal" style="max-height:none;">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">Rahmenfarbe</div>
        <button class="add-exercise-modal-close" id="modeColorPickerClose" aria-label="Abbrechen">✕</button>
      </div>
      <div class="new-exercise-modal-body">
        <div class="accent-swatch-grid" id="modeColorSwatchGrid">
          <button class="accent-swatch ${!tileColor ? 'selected' : ''}" data-tile-color-id="default" style="background:var(--surface-2); border:1px dashed var(--border); display:flex; align-items:center; justify-content:center; font-size:15px; color:var(--muted);" aria-label="Standard">✕</button>
          ${allAccentSwatches().map(c => `
            <button class="accent-swatch ${tileColor && tileColor.id === c.id ? 'selected' : ''}" data-tile-color-id="${c.id}" data-tile-color-hex="${c.hex}" data-favorite="${c.isFavorite ? '1' : ''}" style="background:${c.hex};" aria-label="${c.name}"></button>
          `).join('')}
        </div>
        <button class="accent-custom-btn" id="modeColorCustomBtn" type="button" style="margin-top:12px;">
          <img class="accent-custom-btn-icon" src="${ICON_COLORWHEEL}" alt="">
          Eigene Farbe wählen
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // WICHTIG: hier bewusst KEIN pushOverlayState() — dieses Popup liegt über dem noch offenen
  // Kategorie-Popup (openModeSettingsPrompt), dessen History-Eintrag bleibt bestehen. Nur der
  // oberste Zurück-Handler wird vorübergehend ersetzt (gleiches Muster wie beim Übung-
  // austauschen-Picker) und beim Schließen wieder hergestellt, statt selbst zu navigieren.
  const parentCloseFn = overlayCloseStack.length ? overlayCloseStack[overlayCloseStack.length - 1] : null;
  function remove(){ const el = document.getElementById('modeColorPickerOverlay'); if (el) el.remove(); }
  function close(){
    remove();
    if (parentCloseFn){
      if (overlayCloseStack.length) overlayCloseStack[overlayCloseStack.length - 1] = parentCloseFn;
      else overlayCloseStack.push(parentCloseFn);
    }
  }
  if (overlayCloseStack.length) overlayCloseStack[overlayCloseStack.length - 1] = close;
  else overlayCloseStack.push(close);

  document.getElementById('modeColorPickerClose').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };

  const colorCustomBtn = document.getElementById('modeColorCustomBtn');
  if (colorCustomBtn) colorCustomBtn.onclick = () => {
    // Weiterhin ohne eigenen History-Eintrag: overlayCloseStack[oberster Eintrag] wird direkt
    // an openAccentColorPickerPrompt() übergeben (der HSV-Vollbild-Farbwähler ersetzt ihn dort
    // wiederum selbst, siehe dort) — dieses Swatch-Popup entfernt sich dafür nur aus dem DOM,
    // ohne den Stack anzufassen.
    remove();
    const modeSettingsEl = document.getElementById('modeSettingsOverlay');
    if (modeSettingsEl) modeSettingsEl.remove(); // Kategorie-Popup nur visuell ausblenden,
                                                   // dessen History-Eintrag bleibt erhalten
    openAccentColorPickerPrompt(mode);
  };

  const LONG_PRESS_MS = 450;
  const MOVE_CANCEL_PX = 10;
  document.querySelectorAll('#modeColorSwatchGrid .accent-swatch').forEach(btn => {
    let pressTimer = null;
    let startX = 0, startY = 0, longPressFired = false;
    const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null; };
    const isFavorite = btn.dataset.favorite === '1';
    const isDefault = btn.dataset.tileColorId === 'default';

    btn.onclick = async () => {
      if (longPressFired){ longPressFired = false; return; }
      if (!plan.modeSettings) plan.modeSettings = {};
      if (!plan.modeSettings[mode]) plan.modeSettings[mode] = {};
      if (isDefault){
        delete plan.modeSettings[mode].tileColorId;
        delete plan.modeSettings[mode].tileColorHex;
      } else {
        plan.modeSettings[mode].tileColorId = btn.dataset.tileColorId;
      }
      await saveJSON('plan', plan);
      close();
      refreshParent();
      renderStartSelect();
    };

    if (!isFavorite) return; // nur Favoriten sind entfernbar per Long-Press

    btn.addEventListener('contextmenu', (ev) => ev.preventDefault());
    btn.addEventListener('touchstart', (ev) => {
      longPressFired = false;
      const t = ev.touches[0];
      startX = t.clientX; startY = t.clientY;
      pressTimer = setTimeout(async () => {
        longPressFired = true;
        if (navigator.vibrate) navigator.vibrate(15);
        if (!confirm('Diesen Favoriten entfernen?')) { longPressFired = false; return; }
        plan.favoriteAccentColors = favoriteAccentColors().filter(h => h !== btn.dataset.tileColorHex);
        await saveJSON('plan', plan);
        openModeSettingsColorPickerPrompt(mode, refreshParent);
      }, LONG_PRESS_MS);
    }, { passive: true });
    btn.addEventListener('touchmove', (ev) => {
      const t = ev.touches[0];
      if (Math.abs(t.clientX - startX) > MOVE_CANCEL_PX || Math.abs(t.clientY - startY) > MOVE_CANCEL_PX) cancelPress();
    }, { passive: true });
    btn.addEventListener('touchend', cancelPress);
    btn.addEventListener('touchcancel', cancelPress);
  });
}

// Eigenes Popup für die Wahl des Übungspools im openModeSettingsPrompt()-Popup — aus demselben
// Grund wie bei der Rahmenfarbe als eigenes Popup statt inline aufklappender Radio-Liste.
// Auswahl greift sofort (inkl. eines parallel geänderten Namens) und schließt beide Popups.
function openModeSettingsPoolPickerPrompt(mode, refreshParent){
  const existing = document.getElementById('modePoolPickerOverlay');
  if (existing) existing.remove();

  const currentFilter = modePoolFilter(mode);
  const poolOptions = [
    { value: 'oberkoerper', label: 'Nur Oberkörper-Übungen' },
    { value: 'unterkoerper', label: 'Nur Unterkörper-Übungen' },
    { value: 'all', label: 'Alle Übungen' },
    { value: 'push', label: 'Nur Push-Übungen' },
    { value: 'pull', label: 'Nur Pull-Übungen' },
    { value: 'legs', label: 'Nur Legs-Übungen (Beine + unterer Rücken)' },
  ];
  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'modePoolPickerOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal" style="max-height:none;">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">Übungen zur Auswahl</div>
        <button class="add-exercise-modal-close" id="modePoolPickerClose" aria-label="Abbrechen">✕</button>
      </div>
      <div class="new-exercise-modal-body">
        <div class="wizard-choice-list">
          ${poolOptions.map(o => `<button class="wizard-choice" data-mode-pool="${o.value}">${o.value === currentFilter ? '✓ ' : ''}${o.label}</button>`).join('')}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Kein eigener History-Eintrag (siehe openModeSettingsColorPickerPrompt) — liegt über dem
  // noch offenen Kategorie-Popup, nur der oberste Zurück-Handler wird vorübergehend ersetzt.
  const parentCloseFn = overlayCloseStack.length ? overlayCloseStack[overlayCloseStack.length - 1] : null;
  function remove(){ const el = document.getElementById('modePoolPickerOverlay'); if (el) el.remove(); }
  function close(){
    remove();
    if (parentCloseFn){
      if (overlayCloseStack.length) overlayCloseStack[overlayCloseStack.length - 1] = parentCloseFn;
      else overlayCloseStack.push(parentCloseFn);
    }
  }
  if (overlayCloseStack.length) overlayCloseStack[overlayCloseStack.length - 1] = close;
  else overlayCloseStack.push(close);

  document.getElementById('modePoolPickerClose').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };

  overlay.querySelectorAll('[data-mode-pool]').forEach(btn => {
    btn.onclick = async () => {
      const nameInput = document.getElementById('modeSettingsNameInput');
      if (!plan.modeSettings) plan.modeSettings = {};
      if (!plan.modeSettings[mode]) plan.modeSettings[mode] = {};
      if (nameInput) plan.modeSettings[mode].label = nameInput.value.trim();
      plan.modeSettings[mode].poolFilter = btn.dataset.modePool;
      await saveJSON('plan', plan);
      close();
      refreshParent();
      renderStartSelect();
    };
  });
}

// Öffnet ein kleines Auswahl-Popup für den +-Button unter dem Kachel-Raster — bündelt die
// beiden bisher getrennten Aktionen "Kategorie hinzufügen" (openAddTilePrompt) und "Training
// importieren" (Klick auf das versteckte #importSessionFile-Feld), seit der eigene
// "Training importieren"-Button aus der io-row entfernt wurde.
function openAddCategoryOrImportPrompt(){
  const existing = document.getElementById('addCategoryOrImportOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'addCategoryOrImportOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal" style="max-height:none;">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">Hinzufügen</div>
        <button class="add-exercise-modal-close" id="addCategoryOrImportClose" aria-label="Abbrechen">✕</button>
      </div>
      <div class="new-exercise-modal-body">
        <button class="wizard-choice" id="promptAddCategory" style="width:100%; text-align:left; margin-bottom:10px;">+ Kategorie hinzufügen</button>
        <button class="wizard-choice" id="promptAddPastSession" style="width:100%; text-align:left; margin-bottom:10px; display:flex; align-items:center; gap:8px;"><svg viewBox="0 0 512 512" width="18" height="18" fill="none" stroke="currentColor" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="256" cy="256" r="230"/><path d="M266 130 L266 256 L326 296"/></svg> Training nachtragen</button>
        <button class="wizard-choice" id="promptImportSession" style="width:100%; text-align:left;">⬆ Training importieren</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(remove);

  function remove(){ const el = document.getElementById('addCategoryOrImportOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); };

  document.getElementById('addCategoryOrImportClose').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
  document.getElementById('promptAddCategory').onclick = () => { close(); openAddTilePrompt(); };
  document.getElementById('promptAddPastSession').onclick = () => {
    // Ersetzt den beim Öffnen dieses Auswahl-Popups gepushten History-Eintrag DIREKT durch
    // den Wizard (siehe openAddPastSessionWizard(replaceParentOverlay)), statt erst per
    // close() zurückzugehen und danach neu zu pushen — ein history.back() gefolgt von einem
    // sofortigen pushState() im selben Tick wäre eine Race Condition (back() wird asynchron
    // verarbeitet), wodurch der Wizard sofort wieder verschwunden wäre.
    if (overlayCloseStack[overlayCloseStack.length - 1] === remove) overlayCloseStack.pop();
    remove();
    openAddPastSessionWizard(true);
  };
  document.getElementById('promptImportSession').onclick = () => {
    close();
    document.getElementById('importSessionFile').click();
  };
}

// Mehrstufiger Wizard zum nachträglichen Erfassen einer bereits abgeschlossenen
// Trainingseinheit (für den Fall, dass während des Trainings selbst nicht mitgeloggt wurde) —
// erreichbar über den "+"-Button unter dem Kachel-Raster (siehe openAddCategoryOrImportPrompt()
// oben). Ablauf: 1) Datum/Uhrzeit/Dauer, 2) Übungen auswählen (Mehrfachauswahl wie beim
// "Aus Vorlagen wählen"-Picker, siehe openExerciseLibraryPicker()), 3) pro ausgewählter Übung
// die Sätze eintragen (gleiches Zeilen-Layout wie openSessionEntryEditor()). Baut am Ende ein
// vollwertiges Session-Objekt in derselben Form wie endSession() und speichert es direkt,
// ganz ohne den normalen aktiven-Training-Ablauf zu durchlaufen.
function openAddPastSessionWizard(replaceParentOverlay){
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const draft = {
    date: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
    time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    durationMin: 60,
    exerciseIds: [], // Auswahl-Reihenfolge = Reihenfolge der Sätze-Erfassungsschritte
    setsByExerciseId: {}
  };
  let stepIndex = 0;
  // Bei Aufruf aus dem "+"-Auswahl-Popup (replaceParentOverlay=true) übernimmt der ALLERERSTE
  // render()-Aufruf den History-Eintrag des Eltern-Popups direkt per history.replaceState,
  // statt ihn erst per close() zurückzunehmen (async) und danach neu zu pushen (sync) —
  // dieselbe Race Condition wie bei openAddTilePrompt/dayTrainingPopupHistory (siehe dort).
  let parentReplaced = !replaceParentOverlay;

  function ensureSetsFor(ex){
    if (draft.setsByExerciseId[ex.id]) return;
    const isTime = ex.type === 'time';
    const isCardio = isTime && !!ex.cardioMachine;
    const count = isCardio ? 1 : (ex.sets || 3);
    // Vorbelegung mit den Werten vom letzten Mal (lastPerformance), exakt wie beim normalen
    // Trainingsstart (siehe buildEntry()) — leere Felder wären beim Nachtragen unpraktisch,
    // da man sich sonst jeden Wert erst wieder ausdenken müsste. Gibt es keine Historie zu
    // dieser Übung, wird wie sonst auch mit leeren Feldern (bzw. ex.weight als Starthilfe)
    // begonnen. Übernimmt dabei bewusst die tatsächliche Satzanzahl vom letzten Mal statt
    // ex.sets, falls sich die Standard-Satzzahl der Übung seither geändert hat.
    const storedHistory = lastPerformance[ex.id];
    const history = Array.isArray(storedHistory) && storedHistory.length && Array.isArray(storedHistory[0])
      ? storedHistory
      : (Array.isArray(storedHistory) && storedHistory.length ? [storedHistory] : []);
    const remembered = history[0] || null;
    const rememberedSets = (remembered && remembered.length) ? (isCardio ? remembered.slice(0, 1) : remembered) : null;
    // Kardio-Zusatzfelder (Neigung/Tempo/Widerstand je nach Gerät, siehe CARDIO_MACHINES) auch
    // hier mit vorbelegen bzw. anlegen — sonst könnten sie beim Nachtragen gar nicht erfasst
    // werden, obwohl sie im normalen Training zur Übung gehören.
    const cardioFields = isCardio ? cardioFieldsFor(ex) : [];
    const buildTimeSet = (s) => {
      const set = { seconds: s ? (s.seconds ?? null) : null };
      cardioFields.forEach(f => { set[f.key] = s ? (s[f.key] ?? null) : null; });
      return set;
    };
    draft.setsByExerciseId[ex.id] = rememberedSets
      ? rememberedSets.map(s => isTime ? buildTimeSet(s) : { reps: s.reps ?? null, weight: s.weight ?? null })
      : Array.from({length: count}, () => isTime ? buildTimeSet(null) : { reps: null, weight: ex.weight || null });
  }

  function stepsFor(){
    const steps = [];

    steps.push({
      title: 'Wann war das Training?',
      render: (body, next) => {
        body.innerHTML = `
          <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:6px;">Datum</label>
          <input type="date" id="pastDate" value="${draft.date}" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:15px; margin-bottom:14px;">
          <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:6px;">Uhrzeit (Start)</label>
          <input type="time" id="pastTime" value="${draft.time}" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:15px; margin-bottom:14px;">
          <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:6px;">Dauer (Minuten)</label>
          <input type="number" inputmode="numeric" id="pastDuration" value="${draft.durationMin}" min="1" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:15px; margin-bottom:16px;">
          <button class="btn btn-primary" id="pastDateNext" style="width:100%;">Weiter</button>
        `;
        body.querySelector('#pastDateNext').onclick = () => {
          const dateVal = body.querySelector('#pastDate').value;
          const timeVal = body.querySelector('#pastTime').value;
          const durVal = parseInt(body.querySelector('#pastDuration').value, 10);
          if (!dateVal || !timeVal){ alert('Bitte Datum und Uhrzeit eintragen.'); return; }
          if (!Number.isFinite(durVal) || durVal < 1){ alert('Bitte eine gültige Dauer in Minuten eintragen.'); return; }
          draft.date = dateVal;
          draft.time = timeVal;
          draft.durationMin = durVal;
          next();
        };
      }
    });

    steps.push({
      title: 'Welche Übungen?',
      render: (body, next) => {
        let query = '';
        // Eigener Öffnen/Zustand pro Muskelgruppe für dieses Auswahl-Fenster (Akkordeon,
        // gleiches Prinzip wie im Übungen-Editor/renderPlanRows) — bei aktiver Suche werden
        // alle Treffergruppen automatisch aufgeklappt gezeigt, sonst bleiben sie zu, damit die
        // lange Gesamtliste nicht unpraktikabel wird.
        const groupOpen = new Set();
        body.innerHTML = `
          <input type="text" id="pastExSearch" class="plan-search" placeholder="Übung oder Muskel suchen…" style="margin-bottom:4px;">
          <div id="pastExList"></div>
          <button class="btn btn-primary" id="pastExNext" style="width:100%; margin-top:16px;" ${draft.exerciseIds.length ? '' : 'disabled'}>${draft.exerciseIds.length ? `Weiter (${draft.exerciseIds.length})` : 'Weiter'}</button>
        `;
        const listEl = body.querySelector('#pastExList');
        const nextBtn = body.querySelector('#pastExNext');
        const renderList = () => {
          const q = query.trim().toLowerCase();
          const list = plan.exercises.filter(ex => !q || ex.name.toLowerCase().includes(q) || (ex.muscleGroup || '').toLowerCase().includes(q));
          const groups = {};
          list.forEach(ex => { (groups[ex.muscleGroup || 'Sonstige'] = groups[ex.muscleGroup || 'Sonstige'] || []).push(ex); });
          listEl.innerHTML = MUSCLE_GROUP_ORDER.filter(g => groups[g]).map(g => {
            const items = groups[g];
            const selectedCount = items.filter(ex => draft.exerciseIds.includes(ex.id)).length;
            const isOpen = q ? true : groupOpen.has(g);
            return `
              <div class="muscle-group">
                <button class="muscle-group-header" data-past-group="${g}" type="button">
                  <span class="mg-name">${g}</span>
                  <span class="mg-meta">${selectedCount ? `${selectedCount} ausgewählt · ` : ''}${items.length} Übung${items.length === 1 ? '' : 'en'} <span class="mg-arrow">${isOpen ? '▾' : '▸'}</span></span>
                </button>
                <div class="muscle-group-body" style="display:${isOpen ? 'block' : 'none'}">
                  ${items.map(ex => `
                    <button type="button" class="stat-toggle-row ${draft.exerciseIds.includes(ex.id) ? 'checked' : ''}" data-past-ex="${ex.id}">
                      <span class="stat-toggle-check">✓</span>
                      <span>${exerciseNameHTML(ex.name)}</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('') || `<div class="history-empty">Keine passenden Übungen gefunden.</div>`;
          listEl.querySelectorAll('[data-past-group]').forEach(btn => {
            btn.onclick = () => {
              const g = btn.dataset.pastGroup;
              if (groupOpen.has(g)) groupOpen.delete(g); else groupOpen.add(g);
              renderList();
            };
          });
          listEl.querySelectorAll('[data-past-ex]').forEach(btn => {
            btn.onclick = () => {
              const id = btn.dataset.pastEx;
              const idx = draft.exerciseIds.indexOf(id);
              if (idx === -1) draft.exerciseIds.push(id); else draft.exerciseIds.splice(idx, 1);
              renderList();
              nextBtn.disabled = !draft.exerciseIds.length;
              nextBtn.textContent = draft.exerciseIds.length ? `Weiter (${draft.exerciseIds.length})` : 'Weiter';
            };
          });
        };
        body.querySelector('#pastExSearch').oninput = (ev) => { query = ev.target.value; renderList(); };
        renderList();
        nextBtn.onclick = () => {
          if (!draft.exerciseIds.length) return;
          draft.exerciseIds.forEach(id => {
            const ex = plan.exercises.find(e => e.id === id);
            if (ex) ensureSetsFor(ex);
          });
          next();
        };
      }
    });

    draft.exerciseIds.forEach((id, idx) => {
      const ex = plan.exercises.find(e => e.id === id);
      if (!ex) return;
      const isLastExercise = idx === draft.exerciseIds.length - 1;
      steps.push({
        title: ex.name,
        subtitle: `Übung ${idx + 1} von ${draft.exerciseIds.length} — Sätze eintragen`,
        render: (body, next) => {
          ensureSetsFor(ex);
          const isTime = ex.type === 'time';
          const noWeight = !!ex.noWeight;
          const isCardio = isTime && !!ex.cardioMachine;
          const cardioFields = isCardio ? cardioFieldsFor(ex) : [];
          body.innerHTML = `
            ${isTime ? `
              <div class="sets-header sets-header-time">
                <span class="sets-header-cell">#</span>
                <span class="sets-header-cell">Sek.</span>
                <span class="sets-header-cell"></span>
                <span class="sets-header-cell"></span>
              </div>` : `
              <div class="sets-header">
                <span class="sets-header-cell">#</span>
                <span class="sets-header-cell">Wdh</span>
                <span class="sets-header-cell">kg</span>
                <span class="sets-header-cell"></span>
                <span class="sets-header-cell"></span>
                <span class="sets-header-cell"></span>
              </div>`}
            <div class="sets" id="pastSets"></div>
            <div class="add-set-row" ${isCardio ? 'style="display:none;"' : ''}><button class="add-set" id="pastAddSet" aria-label="Satz hinzufügen">+</button></div>
            <button class="btn btn-primary" id="pastExerciseNext" style="width:100%; margin-top:16px;">${isLastExercise ? 'Fertig' : 'Weiter'}</button>
          `;
          const setsEl = body.querySelector('#pastSets');
          const renderSets = () => {
            const sets = draft.setsByExerciseId[ex.id];
            setsEl.innerHTML = sets.map((s, si) => isTime ? `
              <div class="set-row set-row-time" data-set="${si}">
                <span class="set-idx">${si + 1}</span>
                <input type="number" inputmode="numeric" enterkeyhint="done" placeholder="Sekunden" value="${s.seconds ?? ''}" data-field="seconds" data-si="${si}">
                <button class="icon-x" data-removeset="${si}" aria-label="Satz ${si + 1} entfernen" ${isCardio ? 'style="visibility:hidden;"' : ''}>✕</button>
              </div>
              ${cardioFields.length ? `
              <div class="set-cardio-extra" data-set="${si}">
                ${cardioFields.map(f => `
                  <div class="set-cardio-field">
                    <label>${f.label}</label>
                    <input type="number" inputmode="decimal" enterkeyhint="done" step="${f.step}" min="${f.min ?? 0}" ${f.max !== undefined ? `max="${f.max}"` : ''} value="${s[f.key] ?? ''}" data-field="${f.key}" data-si="${si}">
                  </div>
                `).join('')}
              </div>` : ''}
            ` : `
              <div class="set-row" data-set="${si}">
                <span class="set-idx">${si + 1}</span>
                <input type="number" inputmode="numeric" enterkeyhint="done" placeholder="Wdh" value="${s.reps ?? ''}" data-field="reps" data-si="${si}">
                <input type="number" inputmode="decimal" enterkeyhint="done" placeholder="kg" step="0.5" value="${noWeight ? '' : (s.weight ?? '')}" data-field="weight" data-si="${si}" ${noWeight ? 'disabled' : ''}>
                <button class="icon-x" data-removeset="${si}" aria-label="Satz ${si + 1} entfernen">✕</button>
              </div>
            `).join('');
            setsEl.querySelectorAll('[data-removeset]').forEach(btn => {
              btn.onclick = () => { sets.splice(Number(btn.dataset.removeset), 1); renderSets(); };
            });
            setsEl.querySelectorAll('input[data-field]').forEach(input => {
              // oninput: Wert sofort im Draft merken, aber OHNE Neu-Rendern — sonst würde
              // jeder Tastendruck den Fokus aus dem Feld werfen (Cursor springt raus, siehe
              // ähnliches Muster applySetValueAndPropagate() im aktiven Training). Die
              // Übernahme in die Folge-Sätze (Wdh aus Satz 1 → Satz 2 → Satz 3 usw., dasselbe
              // für kg) passiert erst onchange (Verlassen des Feldes/Enter) — genau dann wird
              // auch neu gerendert, damit die übernommenen Werte in den Folgefeldern sichtbar
              // werden.
              input.oninput = () => {
                const si = Number(input.dataset.si);
                const field = input.dataset.field;
                sets[si][field] = input.value === '' ? null : Number(input.value);
              };
              input.onchange = () => {
                const si = Number(input.dataset.si);
                const field = input.dataset.field;
                const val = input.value === '' ? null : Number(input.value);
                if (val !== null) applySetValueAndPropagate({ sets }, si, { [field]: val });
                else sets[si][field] = null;
                renderSets();
              };
            });
          };
          renderSets();
          body.querySelector('#pastAddSet').onclick = () => {
            const newSet = isTime ? { seconds: null } : { reps: null, weight: null };
            cardioFields.forEach(f => { newSet[f.key] = null; });
            draft.setsByExerciseId[ex.id].push(newSet);
            renderSets();
          };
          body.querySelector('#pastExerciseNext').onclick = () => {
            if (isLastExercise) finish(); else next();
          };
        }
      });
    });

    return steps;
  }

  async function finish(){
    const startedAt = new Date(`${draft.date}T${draft.time}:00`);
    if (isNaN(startedAt.getTime())){ alert('Ungültiges Datum/Uhrzeit.'); return; }
    const durationSec = Math.max(1, Math.round(draft.durationMin * 60));
    const entries = draft.exerciseIds.map(id => {
      const ex = plan.exercises.find(e => e.id === id);
      if (!ex) return null;
      const isTime = ex.type === 'time';
      const rawSets = draft.setsByExerciseId[id] || [];
      const cleanedSets = rawSets.filter(s => isTime ? (s.seconds !== null && s.seconds !== undefined) : (s.reps !== null || s.weight !== null));
      if (!cleanedSets.length) return null;
      return {
        exerciseId: ex.id,
        name: ex.name,
        type: ex.type,
        target: isTime
          ? { sets: ex.sets, secondsMin: ex.secondsMin, secondsMax: ex.secondsMax }
          : { sets: ex.sets, repsMin: ex.repsMin, repsMax: ex.repsMax, weight: ex.weight },
        sets: cleanedSets.map(s => ({ ...s, done: true }))
      };
    }).filter(Boolean);

    if (!entries.length){
      alert('Bitte mindestens eine Übung mit mindestens einem ausgefüllten Satz eintragen.');
      return;
    }

    const session = {
      id: uid(),
      date: startedAt.toISOString(),
      durationSec,
      mode: null,
      modeVariant: null,
      deloadUsed: false,
      entries
    };

    sessions.push(session);
    sessions.sort((a, b) => new Date(a.date) - new Date(b.date));
    await saveSessionAt(session);
    rebuildLastPerformance();
    await saveJSON('lastPerformance', lastPerformance);

    closeOverlay();
    replaceView('home');
    goSessionDetail(session.id);
  }

  function closeOverlay(){
    popOverlayStateIfOpen();
    removeOverlayEl();
  }
  function removeOverlayEl(){
    const el = document.getElementById('addPastSessionOverlay');
    if (el) el.remove();
  }

  function render(fromPopState){
    const steps = stepsFor();
    if (stepIndex >= steps.length) stepIndex = steps.length - 1;
    const step = steps[stepIndex];

    removeOverlayEl();

    const overlay = document.createElement('div');
    overlay.className = 'add-exercise-overlay centered-overlay';
    overlay.id = 'addPastSessionOverlay';
    overlay.innerHTML = `
      <div class="add-exercise-modal" style="max-height:88vh;">
        <div class="add-exercise-modal-header">
          <div>
            <div class="wizard-progress">Schritt ${stepIndex + 1} von ${steps.length}</div>
            <div class="add-exercise-modal-title">${step.title}</div>
            ${step.subtitle ? `<div class="wizard-subtitle">${step.subtitle}</div>` : ''}
          </div>
          <button class="add-exercise-modal-close" id="addPastSessionClose" aria-label="Abbrechen">✕</button>
        </div>
        <div class="new-exercise-modal-body" id="addPastSessionBody"></div>
        ${stepIndex > 0 ? `<div class="add-exercise-modal-header" style="border-top:1px solid var(--border); border-bottom:none;">
          <button class="btn btn-ghost" id="pastWizBack" style="width:100%;">‹ Zurück</button>
        </div>` : ''}
      </div>
    `;
    document.body.appendChild(overlay);

    if (!fromPopState){
      const closeFn = () => {
        if (stepIndex > 0){
          stepIndex -= 1;
          render(true);
        } else {
          removeOverlayEl();
        }
      };
      if (!parentReplaced){
        overlayCloseStack.push(closeFn);
        history.replaceState({ view: '__overlay__', params: {} }, '', '');
        parentReplaced = true;
      } else {
        pushOverlayState(closeFn);
      }
    }

    overlay.onclick = (ev) => { if (ev.target === overlay) closeOverlay(); };
    document.getElementById('addPastSessionClose').onclick = closeOverlay;
    const backBtn = document.getElementById('pastWizBack');
    if (backBtn) backBtn.onclick = () => { popOverlayStateIfOpen(); stepIndex -= 1; render(); };

    const body = document.getElementById('addPastSessionBody');
    const next = () => { stepIndex += 1; render(); };
    step.render(body, next);
  }

  render();
}

// Long-Press auf eine freie Fläche im Kachel-Raster (wenn weniger als alle Kacheln
// sichtbar sind) öffnet ein Popup, um zuvor entfernte Kacheln wieder einzublenden. "Frei"
// taucht hier nie auf, da sie fest ist und sich nicht entfernen lässt (siehe START_TILE_IDS-
// Filter unten, der 'frei' konsequent ausschließt). Bei Oberkörper/Unterkörper/Ganzkörper
// folgt danach ein zweiter Schritt zur direkten Wahl des Übungspools (Alle/Push/Pull/Legs/
// Nur Oberkörper/Nur Unterkörper) — spart den Umweg, die Kachel erst hinzuzufügen und dann
// separat per Long-Press wieder zu öffnen, um den Pool zu ändern.
