/* ---------------------------------------------------
   START-AUSWAHL (Ganzkörper / Oberkörper / Unterkörper / Frei)
--------------------------------------------------- */
const MODE_LABELS = { ganzkoerper: 'Ganzkörper', oberkoerper: 'Oberkörper', unterkoerper: 'Unterkörper' };
// Anzeigename für den aktuell gewählten Übungspool-Filter im ausklappbaren Auswahl-Header
// (siehe openModeSettingsPrompt) — zeigt standardmäßig nur die aktuelle Wahl kompakt an,
// statt sofort alle 6 Radio-Optionen aufgeklappt zu zeigen.
const POOL_FILTER_LABELS = {
  oberkoerper: 'Nur Oberkörper-Übungen',
  unterkoerper: 'Nur Unterkörper-Übungen',
  all: 'Alle Übungen',
  push: 'Nur Push-Übungen',
  pull: 'Nur Pull-Übungen',
  legs: 'Nur Legs-Übungen'
};

// Liefert den aktuell gültigen Anzeigenamen für einen Modus — entweder den individuell
// über das Long-Press-Menü vergebenen Namen (plan.modeSettings[mode].label, z. B. "Push"
// statt "Oberkörper") oder, falls keiner gesetzt ist, den Standardnamen aus MODE_LABELS.
// Alle vier möglichen Kacheln bei "Training starten", in ihrer festen Standard-Reihenfolge.
// plan.startTileHidden ist ein Set-artiges Objekt ({ [id]: true }), das steuert, welche davon
// aktuell ausgeblendet sind (per Long-Press-Popup entfernbar, siehe openTileRemovePrompt()
// und wieder hinzufügbar über Long-Press auf eine freie Stelle, siehe openAddTilePrompt()).
const START_TILE_IDS = ['oberkoerper', 'unterkoerper', 'ganzkoerper', 'frei'];
// Bis zu 2 zusätzliche, frei benennbare Kategorien (analog zu Oberkörper/Unterkörper: Name +
// A/B-Auswahl + Übungspool-Filter) — in plan.customCategories als Array aus { id, label }
// gespeichert, id ist eine generierte, stabile Kennung (z. B. "custom-abc123"). Zusammen mit
// den 3 festen Split-Modi (oberkoerper/unterkoerper/ganzkoerper) + der festen "Frei"-Kachel
// ergibt das maximal 3 + 2 + 1 = 6 Kacheln bei "Training starten" — Standard bleiben aber
// weiterhin nur die 4 ursprünglichen Kacheln, die 2 zusätzlichen Slots sind rein optional
// über "+ Kategorie hinzufügen" (siehe openAddTilePrompt) nutzbar.
const MAX_CUSTOM_CATEGORIES = 2;
function customCategories(){
  return Array.isArray(plan.customCategories) ? plan.customCategories : [];
}
// Alle Kachel-IDs, die aktuell existieren könnten — anders als START_TILE_IDS (feste Liste)
// wird das bei jedem Aufruf neu aus den vorhandenen Custom-Kategorien zusammengesetzt.
function allStartTileIds(){
  return [...START_TILE_IDS.filter(id => id !== 'frei'), ...customCategories().map(c => c.id), 'frei'];
}
// Ob eine Kachel-ID zu den "Split"-Kacheln gehört (Name + A/B-Auswahl + Stift-Symbol) — das
// gilt für alle 3 festen Modi UND jede Custom-Kategorie, aber nicht für "Frei".
function isSplitTile(id){
  return id === 'ganzkoerper' || id === 'oberkoerper' || id === 'unterkoerper' || customCategories().some(c => c.id === id);
}

// Ob bei einer Split-Kachel A/B deaktiviert wurde (siehe openModeSettingsPrompt) — die
// Kachel zeigt dann nur noch einen einzigen großen Start-Button (immer Split A) statt der
// beiden A/B-Buttons, das Stift-Symbol bleibt separat zum Bearbeiten. Die B-Liste
// (plan.modeLists[mode].B) bleibt dabei unangetastet gespeichert, falls A/B später wieder
// aktiviert wird.
function isSplitCollapsed(mode){
  return !!(plan.modeSettings && plan.modeSettings[mode] && plan.modeSettings[mode].splitDisabled);
}

function isStartTileHidden(id){
  return !!(plan.startTileHidden && plan.startTileHidden[id]);
}
function visibleStartTiles(){
  return allStartTileIds().filter(id => !isStartTileHidden(id));
}

function modeDisplayLabel(mode){
  const custom = plan.modeSettings && plan.modeSettings[mode] && plan.modeSettings[mode].label;
  if (custom && custom.trim()) return custom.trim();
  const customCat = customCategories().find(c => c.id === mode);
  if (customCat) return customCat.label;
  return MODE_LABELS[mode] || mode;
}

// Liefert den Übungspool-Filter für einen Modus: 'oberkoerper', 'unterkoerper', 'push',
// 'pull', 'legs' oder 'all'. Standardmäßig (kein modeSettings-Eintrag) entspricht das dem
// bisherigen Verhalten — Oberkörper/Unterkörper zeigen nur Übungen der jeweils eigenen
// category, Ganzkörper zeigt von jeher alle. Über das Long-Press-Menü lässt sich das pro
// Modus frei umstellen, inkl. der Push/Pull/Legs-Klassifizierung (ex.bodyPart) als
// alternative Aufteilung zu Ober-/Unterkörper.
function modePoolFilter(mode){
  const custom = plan.modeSettings && plan.modeSettings[mode] && plan.modeSettings[mode].poolFilter;
  const valid = new Set(['oberkoerper', 'unterkoerper', 'push', 'pull', 'legs', 'all']);
  if (valid.has(custom)) return custom;
  return (mode === 'oberkoerper' || mode === 'unterkoerper') ? mode : 'all';
}

// ---------- Split-Tracking (Einstellungen → "Trainings-Split") ----------
// plan.splitMode steuert, nach welcher Rotation die App den nächsten fälligen A/B-Zweig
// erkennt und auf der Startseite farbig markiert (siehe computeNextSplitStep()):
//  - null/undefined: aus, keine Markierung
//  - 'okuk':  Oberkörper/Unterkörper im Wechsel: OK-A, UK-A, OK-B, UK-B, danach wieder OK-A
//  - 'gkgk':  Ganzkörper im Wechsel: GK-A, GK-B
//  - 'ppl':   Push/Pull/Legs im Wechsel (Reihenfolge Push→Pull→Legs), jeweils A dann B —
//             dazu wird unter allen sichtbaren Split-Kacheln (feste Modi + eigene
//             Kategorien) nach Namen gesucht, die "push"/"pull"/"legs" enthalten. Es reicht,
//             wenn mindestens 2 davon existieren (z. B. nur Push+Pull); fehlende werden
//             einfach übersprungen und später automatisch ergänzt, sobald die Kachel
//             angelegt wird. Ohne mindestens 2 passende Kacheln liefert die Rotation null.
const SPLIT_MODE_LABELS = { okuk: 'Oberkörper / Unterkörper', ppl: 'Push / Pull / Legs', gkgk: 'Ganzkörper' };

function findSplitTileIdByLabel(needle){
  const id = allStartTileIds().find(x => isSplitTile(x) && modeDisplayLabel(x).toLowerCase().includes(needle));
  return id || null;
}

// Liefert die geordnete Abfolge von { mode, variant } für den aktuell gewählten Split, oder
// null, falls kein Split aktiv ist bzw. (bei "ppl") die nötigen Kacheln fehlen.
function buildSplitSequence(){
  const splitMode = plan.splitMode;
  if (splitMode === 'okuk'){
    return [
      { mode: 'oberkoerper', variant: 'A' }, { mode: 'unterkoerper', variant: 'A' },
      { mode: 'oberkoerper', variant: 'B' }, { mode: 'unterkoerper', variant: 'B' }
    ];
  }
  if (splitMode === 'gkgk'){
    return [{ mode: 'ganzkoerper', variant: 'A' }, { mode: 'ganzkoerper', variant: 'B' }];
  }
  if (splitMode === 'ppl'){
    // Nutzt nur die Kacheln, die es tatsächlich gibt — z. B. schon mit Push+Pull allein
    // (ohne Legs), damit die Rotation nicht erst ab drei angelegten Kacheln startet. Sobald
    // eine weitere Kachel (z. B. Legs) hinzukommt, wird sie automatisch mit einbezogen.
    const found = ['push', 'pull', 'legs']
      .map(needle => findSplitTileIdByLabel(needle))
      .filter(Boolean);
    if (found.length < 2) return null;
    return [
      ...found.map(mode => ({ mode, variant: 'A' })),
      ...found.map(mode => ({ mode, variant: 'B' }))
    ];
  }
  return null;
}

// Ermittelt, welcher { mode, variant }-Schritt laut Rotation als Nächstes ansteht: sucht in
// der kompletten Trainingshistorie (nach Datum absteigend) die zuletzt durchgeführte Einheit,
// deren mode/modeVariant zur aktuellen Split-Sequenz passt, und gibt den darauffolgenden
// Schritt zurück. Gibt es noch KEINE passende Einheit (z. B. direkt nach dem Aktivieren des
// Splits), wird bewusst nichts markiert — man kann frei mit A, B, Oberkörper oder
// Unterkörper anfangen; erst danach greift die Rotation. Gibt außerdem null zurück, wenn
// kein Split aktiv/konfigurierbar ist.
function computeNextSplitStep(){
  const seq = buildSplitSequence();
  if (!seq || !seq.length) return null;
  const sorted = sessions.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const lastMatch = sorted.find(s => seq.some(step => step.mode === s.mode && step.variant === s.modeVariant));
  if (!lastMatch) return null;
  const idx = seq.findIndex(step => step.mode === lastMatch.mode && step.variant === lastMatch.modeVariant);
  return seq[(idx + 1) % seq.length];
}

function getModeExerciseIds(mode, variant){
  const stored = plan.modeLists && plan.modeLists[mode];
  if (stored && typeof stored === 'object' && !Array.isArray(stored)){
    const key = variant || 'A';
    return Array.isArray(stored[key]) ? stored[key] : [];
  }
  if (Array.isArray(stored)) return variant === 'B' ? [] : stored;
  if (variant === 'B') return [];
  if (mode === 'ganzkoerper') return plan.exercises.map(e => e.id);
  return plan.exercises.filter(e => e.category === mode).map(e => e.id);
}
function getModeExercises(mode, variant){
  const ids = getModeExerciseIds(mode, variant);
  const byId = new Map(plan.exercises.map(e => [e.id, e]));
  // Die gespeicherte ID-Reihenfolge ist 1:1 maßgeblich für die Trainingsreihenfolge — sie
  // entspricht exakt der zuletzt im Bearbeiten-Screen angezeigten/gespeicherten Reihenfolge
  // (inkl. per Drag&Drop frei angeordneter Übungen, die absichtlich von der reinen
  // Muskelgruppen-Sortierung abweichen können). Keine zusätzliche Sortierung hier, sonst
  // würde eine manuell per Drag angepasste Reihenfolge beim Trainingsstart wieder verworfen.
  return ids.map(id => byId.get(id)).filter(Boolean);
}

// Liefert die Namen der Muskelgruppen, die im "Übung hinzufügen"-Dialog während eines
// laufenden Trainings standardmäßig aufgeklappt sein sollen: alle Gruppen, die mindestens
// eine Übung enthalten, die zum Modus gehört, mit dem das aktuelle Training gestartet wurde
// (active.mode/active.modeVariant, siehe startSession()) — z. B. bei einem "Push"-Training
// automatisch die Gruppen mit Push-Übungen. Bei freier Auswahl ("frei") oder wenn kein Modus
// bekannt ist (z. B. importiertes Training), bleibt alles wie gewohnt eingeklappt.
function defaultOpenAddExerciseGroups(availableGroups){
  const result = new Set();
  if (!active || !active.mode || active.mode === 'frei') return result;
  const modeIds = new Set(getModeExerciseIds(active.mode, active.modeVariant));
  if (!modeIds.size) return result;
  Object.keys(availableGroups).forEach(g => {
    if (availableGroups[g].some(x => modeIds.has(x.id))) result.add(g);
  });
  return result;
}

// Importiert eine einzelne, zuvor über exportSingleSession() exportierte Trainingseinheit
// und startet direkt ein neues Training mit genau denselben Übungen (in derselben
// Reihenfolge) — analog zu repeatSession(), aber die Übungsliste kommt aus der Datei statt
// aus dem lokalen Verlauf. Übungen, die im aktuellen Plan noch fehlen (z. B. Import auf
// einem anderen Gerät), werden aus den mitgelieferten Übungsdefinitionen ergänzt (Abgleich
// über id, nichts Bestehendes wird überschrieben — gleiches Prinzip wie die
// DEFAULT_PLAN-Migration in init()). Übungen ganz ohne mitgelieferte Definition und ohne
// Treffer im aktuellen Plan werden übersprungen.
async function importSingleSessionFile(file){
  const reader = new FileReader();
  reader.onload = async () => {
    try{
      const data = JSON.parse(reader.result);
      if (!data.session || !Array.isArray(data.session.entries)){
        alert('Diese Datei sieht nicht wie ein exportiertes Training dieser App aus.');
        return;
      }
      const importedExercises = Array.isArray(data.exercises) ? data.exercises : [];
      let planChanged = false;
      importedExercises.forEach(ex => {
        if (ex && ex.id && !plan.exercises.some(p => p.id === ex.id)){
          plan.exercises.push({ ...ex });
          planChanged = true;
        }
      });
      if (planChanged) await saveJSON('plan', plan);

      const exerciseList = data.session.entries
        .map(e => plan.exercises.find(x => x.id === e.exerciseId))
        .filter(Boolean);
      if (!exerciseList.length){
        alert('Keine der Übungen aus dieser Datei konnte zugeordnet werden.');
        return;
      }
      if (exerciseList.length < data.session.entries.length){
        if (!confirm(`${data.session.entries.length - exerciseList.length} Übung(en) aus der Datei fehlen im Plan und werden übersprungen. Trotzdem starten?`)) return;
      }
      if (active){
        if (!confirm('Es läuft bereits ein Training. Dieses verwerfen und das importierte Training starten?')) return;
        clearInterval(timerHandle);
        clearInterval(restInterval);
        restState = null;
        active = null;
        persistActiveSession();
      }
      openImportWeightsPrompt(data.session, exerciseList);
    }catch(err){
      alert('Datei konnte nicht gelesen werden: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// Fragt vor dem eigentlichen Start des importierten Trainings, ob die in der Datei
// enthaltenen Gewichte/Wiederholungen (bzw. Sekunden bei Zeit-Übungen) mit übernommen werden
// sollen. "Ohne Gewichte" nutzt stattdessen das gewohnte Standardverhalten von buildEntry()
// (Vorbelegung aus dem lokalen "Letztes Mal"-Gedächtnis dieses Geräts, sonst leere Felder) —
// z. B. sinnvoll, wenn die Datei von einer anderen Person stammt oder man selbst seitdem
// deutlich stärker/schwächer geworden ist und lieber die eigenen aktuellen Werte einträgt.
function openImportWeightsPrompt(importedSession, exerciseList){
  const existing = document.getElementById('importWeightsOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'importWeightsOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal" style="max-height:none;">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">Gewichte übernehmen?</div>
        <button class="add-exercise-modal-close" id="importWeightsClose" aria-label="Abbrechen">✕</button>
      </div>
      <div class="new-exercise-modal-body">
        <label class="justify-text" style="display:block; font-size:13px; color:var(--muted); margin-bottom:16px;">
          Sollen die protokollierten Gewichte aus der Datei direkt übernommen werden?
        </label>
        <div class="wizard-choice-list">
          <button class="wizard-choice" data-import-weights="yes">Mit Gewichten aus der Datei</button>
          <button class="wizard-choice" data-import-weights="no">Ohne Gewichte, letztes Mal</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(close);

  function close(){
    popOverlayStateIfOpen();
    const el = document.getElementById('importWeightsOverlay');
    if (el) el.remove();
  }
  document.getElementById('importWeightsClose').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
  overlay.querySelectorAll('[data-import-weights]').forEach(btn => {
    btn.onclick = () => {
      const withWeights = btn.dataset.importWeights === 'yes';
      close();
      startSession(exerciseList, withWeights ? importedSession : null);
    };
  });
}

function renderStartSelect(){
  const visible = visibleStartTiles(); // z. B. ['oberkoerper','unterkoerper','ganzkoerper','frei'] minus ausgeblendete, plus evtl. Custom-Kategorien
  const modes = visible.filter(id => id !== 'frei');
  const showFrei = visible.includes('frei');

  const nextSplitStep = computeNextSplitStep();
  const cellsHTML = modes.map(mode => {
    const label = modeDisplayLabel(mode);
    const tileColor = currentTileColor(mode);
    const borderStyle = tileColor ? `border-color:${tileColor.hex};` : '';
    if (isSplitTile(mode)){
      if (isSplitCollapsed(mode)){
        return `
          <div class="start-cell" data-editmode="${mode}">
            <button class="start-option" data-mode="${mode}" data-variant="A" style="${borderStyle}">${label}</button>
            <button class="start-edit-btn" data-editmode="${mode}" aria-label="${label}-Übungen bearbeiten">✎</button>
          </div>
        `;
      }
      const isNext = (v) => nextSplitStep && nextSplitStep.mode === mode && nextSplitStep.variant === v;
      return `
        <div class="start-cell start-cell-split" data-editmode="${mode}" style="${borderStyle}">
          <div class="split-cell-top">
            <span class="split-cell-label">${label}</span>
          </div>
          <div class="split-cell-row">
            <button class="split-cell-btn ${isNext('A') ? 'split-next' : ''}" data-mode="${mode}" data-variant="A">A</button>
            <button class="split-cell-btn ${isNext('B') ? 'split-next' : ''}" data-mode="${mode}" data-variant="B">B</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="start-cell" data-editmode="${mode}">
        <button class="start-option" data-mode="${mode}" style="${borderStyle}">${label}</button>
        <button class="start-edit-btn" data-editmode="${mode}" aria-label="${label}-Übungen bearbeiten">✎</button>
      </div>
    `;
  }).join('');

  const freiTileColor = currentTileColor('frei');
  const freiHTML = showFrei ? `
    <div class="start-cell" data-tile-id="frei" data-editmode="frei">
      <button class="start-option frei" data-mode="frei" aria-label="Freie Auswahl" style="${freiTileColor ? `border-color:${freiTileColor.hex}; color:${freiTileColor.hex};` : ''}">Frei</button>
    </div>
  ` : '';

  // Layout je nach Anzahl sichtbarer Kacheln: bei geradzahliger Anzahl (2, 4, 6) sauberes
  // 2-Spalten-Raster; bei ungerader Anzahl (1, 3, 5) füllt die letzte Kachel die komplette
  // Zeile breit aus, statt neben einer Lücke halb leer zu stehen (siehe .start-grid.count-*).
  const totalCount = visible.length;
  const gridClass = totalCount === 1 ? 'count-1' : (totalCount % 2 === 1) ? 'count-odd' : (totalCount === 2 ? 'count-2' : '');

  app.innerHTML = `
    <div class="start-select-wrap">
      <div class="back-row" style="margin-top:0;">
        <button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
      </div>
      <div class="start-grid ${gridClass}" id="startGrid" style="margin-top:18px;">
        ${cellsHTML}
        ${freiHTML}
      </div>
      <div class="add-category-row">
        <button class="add-category-btn-small" id="btnAddCategory" aria-label="Kategorie hinzufügen oder Training importieren">+</button>
      </div>
      <div class="start-select-spacer"></div>
    </div>
    <input type="file" id="importSessionFile" accept="application/json,.json" style="display:none;">
  `;

  document.getElementById('btnBack').onclick = () => history.back();
  document.getElementById('btnAddCategory').onclick = () => openAddCategoryOrImportPrompt();
  document.getElementById('importSessionFile').onchange = (e) => {
    const file = e.target.files[0];
    if (file) importSingleSessionFile(file);
    e.target.value = '';
  };
  app.querySelectorAll('.start-option[data-mode]').forEach(btn => {
    btn.onclick = () => {
      const mode = btn.dataset.mode;
      if (mode === 'frei'){ goFreeSelect(); return; }
      const variant = btn.dataset.variant || undefined;
      const list = getModeExercises(mode, variant);
      if (!list.length){
        alert(`Für „${modeDisplayLabel(mode)}" sind aktuell keine Übungen hinterlegt. Über das Stift-Symbol kannst du welche festlegen.`);
        return;
      }
      startSession(list, null, mode, variant);
    };
  });
  app.querySelectorAll('.split-cell-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const mode = btn.dataset.mode, variant = btn.dataset.variant;
      const list = getModeExercises(mode, variant);
      if (!list.length){
        // Split noch nicht eingerichtet: direkt zum Bearbeiten auf dem passenden Tab
        goModeEdit(mode, true, variant);
        return;
      }
      startSession(list, null, mode, variant);
    };
  });
  app.querySelectorAll('.start-edit-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      goModeEdit(btn.dataset.editmode);
    };
  });
  app.querySelectorAll('.start-cell-split').forEach(cell => {
    cell.onclick = () => goModeEdit(cell.dataset.editmode);
  });
  wireModeLongPress();
  wireEmptyGridLongPress();
}

// Long-Press auf eine freie Fläche UNTERHALB/NEBEN dem Kachel-Raster (nicht auf eine Kachel
// selbst) öffnet das "Kachel hinzufügen"-Popup, sofern mindestens eine Kachel aktuell
// ausgeblendet ist. Der Long-Press-Bereich ist bewusst der Rest des Grid-Containers, der
// nicht von einer .start-cell eingenommen wird (leerer Raum bei <4 sichtbaren Kacheln).
function wireEmptyGridLongPress(){
  const hasHiddenStandardTile = START_TILE_IDS.some(id => id !== 'frei' && isStartTileHidden(id));
  const canCreateCustom = customCategories().length < MAX_CUSTOM_CATEGORIES;
  if (!hasHiddenStandardTile && !canCreateCustom) return; // nichts zum Hinzufügen da
  const grid = document.getElementById('startGrid');
  if (!grid) return;
  const LONG_PRESS_MS = 450;
  const MOVE_CANCEL_PX = 10;
  let pressTimer = null;
  let startX = 0, startY = 0;

  const isOnCell = (target) => !!target.closest('.start-cell');
  const cancel = () => { clearTimeout(pressTimer); pressTimer = null; };

  grid.addEventListener('touchstart', (ev) => {
    if (isOnCell(ev.target)) return; // Klick landete auf einer bestehenden Kachel, nicht auf leerer Fläche
    const t = ev.touches[0];
    startX = t.clientX; startY = t.clientY;
    pressTimer = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(15);
      openAddTilePrompt();
    }, LONG_PRESS_MS);
  }, { passive: true });
  grid.addEventListener('touchmove', (ev) => {
    const t = ev.touches[0];
    if (Math.abs(t.clientX - startX) > MOVE_CANCEL_PX || Math.abs(t.clientY - startY) > MOVE_CANCEL_PX) cancel();
  }, { passive: true });
  grid.addEventListener('touchend', cancel);
  grid.addEventListener('touchcancel', cancel);
}

// Long-Press auf einen Modus-Kreis (Split-Karte oder Ganzkörper-Kreis, nicht "Frei") öffnet
// ein Popup zum Umbenennen der Kategorie (z. B. "Oberkörper" → "Push") und zur Auswahl,
// aus welchem Übungspool beim Bearbeiten der A/B-Liste ausgewählt werden kann (nur
// Oberkörper-, nur Unterkörper- oder alle Übungen) — siehe openModeSettingsPrompt().
function wireModeLongPress(){
  const LONG_PRESS_MS = 450;
  const MOVE_CANCEL_PX = 10;
  const targets = [...document.querySelectorAll('.start-cell[data-editmode]')];
  targets.forEach(el => {
    const mode = el.dataset.editmode || el.dataset.mode;
    if (!mode) return;
    let pressTimer = null;
    let startX = 0, startY = 0, longPressFired = false;
    const cancel = () => { clearTimeout(pressTimer); pressTimer = null; };

    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
    el.addEventListener('selectstart', (ev) => ev.preventDefault());

    el.addEventListener('touchstart', (ev) => {
      longPressFired = false;
      const t = ev.touches[0];
      startX = t.clientX; startY = t.clientY;
      pressTimer = setTimeout(() => {
        longPressFired = true;
        if (navigator.vibrate) navigator.vibrate(15);
        openModeSettingsPrompt(mode);
      }, LONG_PRESS_MS);
    }, { passive: true });
    el.addEventListener('touchmove', (ev) => {
      const t = ev.touches[0];
      if (Math.abs(t.clientX - startX) > MOVE_CANCEL_PX || Math.abs(t.clientY - startY) > MOVE_CANCEL_PX) cancel();
    }, { passive: true });
    el.addEventListener('touchend', cancel);
    el.addEventListener('touchcancel', cancel);

    el.addEventListener('mousedown', () => {
      longPressFired = false;
      pressTimer = setTimeout(() => {
        longPressFired = true;
        openModeSettingsPrompt(mode);
      }, LONG_PRESS_MS);
    });
    el.addEventListener('mouseup', cancel);
    el.addEventListener('mouseleave', cancel);

    el.addEventListener('click', (ev) => {
      if (longPressFired){ ev.preventDefault(); ev.stopPropagation(); longPressFired = false; }
    }, true);
  });
}

// Popup zum Umbenennen eines Modus (plan.modeSettings[mode].label), zur Auswahl des
// Übungspools für die A/B-Auswahl dieses Modus (plan.modeSettings[mode].poolFilter) und zur
// Wahl einer eigenen Rahmenfarbe für die Kachel (plan.modeSettings[mode].tileColorId/-Hex,
// siehe currentTileColor()). Bei "frei" (die feste Auswahl-Kachel, kein normaler Modus) gibt
// es weder Namen/Übungspool noch eine Entfernen-Option — dort zeigt das Popup nur den
// Rahmenfarben-Teil, exakt im selben Akkordeon-Stil wie "Darstellung → Akzentfarbe" in den
// Einstellungen (siehe renderSettings()).
// Farbwähler für eine einzelne Muskelgruppe (Beine, Rücken, ...) in der Muskelgruppen-
// Verteilung — exakt dasselbe Swatch-Grid-Muster wie die Kachel-Rahmenfarbe in
// openModeSettingsPrompt() (feste Palette + eigene Favoriten + "Eigene Farbe wählen"), nur
// mit SOFORTIGEM Anwenden+Schließen bei Tap auf einen Swatch (kein extra Speichern-Schritt) —
// wie ausdrücklich gewünscht, da hier (anders als beim großen Akzentfarben-Dialog) kein
// Vorschau-Bedürfnis besteht.
function openMuscleGroupColorPicker(group){
  const existing = document.getElementById('muscleGroupColorOverlay');
  if (existing) existing.remove();

  const currentHex = plan.muscleGroupColors && plan.muscleGroupColors[group];

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'muscleGroupColorOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal" style="max-height:none;">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">Farbe für ${group}</div>
        <button class="add-exercise-modal-close" id="muscleGroupColorClose" aria-label="Schließen">✕</button>
      </div>
      <div class="new-exercise-modal-body">
        <div class="accent-swatch-grid" id="muscleGroupColorSwatchGrid">
          <button class="accent-swatch ${!currentHex ? 'selected' : ''}" data-mg-color-id="default" style="background:var(--surface-2); border:1px dashed var(--border); display:flex; align-items:center; justify-content:center; font-size:15px; color:var(--muted);" aria-label="Standard">✕</button>
          ${allAccentSwatches().map(c => `
            <button class="accent-swatch ${currentHex === c.hex ? 'selected' : ''}" data-mg-color-id="${c.id}" data-mg-color-hex="${c.hex}" data-favorite="${c.isFavorite ? '1' : ''}" style="background:${c.hex};" aria-label="${c.name}"></button>
          `).join('')}
        </div>
        <button class="accent-custom-btn" id="muscleGroupColorCustomBtn" type="button" style="margin-top:12px;">
          <img class="accent-custom-btn-icon" src="${ICON_COLORWHEEL}" alt="">
          Eigene Farbe wählen
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(close);
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };

  function close(){
    popOverlayStateIfOpen();
    const el = document.getElementById('muscleGroupColorOverlay');
    if (el) el.remove();
  }
  document.getElementById('muscleGroupColorClose').onclick = close;
  document.getElementById('muscleGroupColorCustomBtn').onclick = () => openAccentColorPickerPrompt(null, group);
  wireMuscleGroupColorSwatchInteractions(group, close);
}

// Verkabelt das Swatch-Grid in openMuscleGroupColorPicker(): Tap wählt die Farbe sofort
// (inkl. Speichern + Schließen + Neuzeichnen), Long-Press auf einen Favoriten entfernt ihn
// aus plan.favoriteAccentColors — identisches Muster wie wireTileColorSwatchInteractions().
function wireMuscleGroupColorSwatchInteractions(group, close){
  const LONG_PRESS_MS = 450;
  const MOVE_CANCEL_PX = 10;
  document.querySelectorAll('#muscleGroupColorSwatchGrid .accent-swatch').forEach(btn => {
    let pressTimer = null;
    let startX = 0, startY = 0, longPressFired = false;
    const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null; };
    const isFavorite = btn.dataset.favorite === '1';
    const isDefault = btn.dataset.mgColorId === 'default';

    btn.onclick = async () => {
      if (longPressFired){ longPressFired = false; return; }
      if (!plan.muscleGroupColors) plan.muscleGroupColors = {};
      if (isDefault){
        delete plan.muscleGroupColors[group];
      } else {
        plan.muscleGroupColors[group] = btn.dataset.mgColorHex;
      }
      await saveJSON('plan', plan);
      close();
      renderMuscleBalance();
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
        plan.favoriteAccentColors = favoriteAccentColors().filter(h => h !== btn.dataset.mgColorHex);
        await saveJSON('plan', plan);
        openMuscleGroupColorPicker(group);
      }, LONG_PRESS_MS);
    }, { passive: true });
    btn.addEventListener('touchmove', (ev) => {
      const t = ev.touches[0];
      if (Math.abs(t.clientX - startX) > MOVE_CANCEL_PX || Math.abs(t.clientY - startY) > MOVE_CANCEL_PX) cancelPress();
    }, { passive: true });
    btn.addEventListener('touchend', cancelPress);
  });
}

function openModeSettingsPrompt(mode){
  const existing = document.getElementById('modeSettingsOverlay');
  if (existing) existing.remove();

  const isFrei = mode === 'frei';

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'modeSettingsOverlay';
  document.body.appendChild(overlay);
  pushOverlayState(remove);

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
function openAddTilePrompt(){
  const hidden = START_TILE_IDS.filter(id => id !== 'frei' && isStartTileHidden(id));
  const canCreateCustom = customCategories().length < MAX_CUSTOM_CATEGORIES;
  if (!hidden.length && !canCreateCustom){
    alert('Es sind bereits alle möglichen Kategorien vorhanden.');
    return;
  }

  // WICHTIG: Der komplette Wizard (Schritt 1 + Schritt 2) teilt sich EINEN einzigen
  // History-Eintrag (einmal pushOverlayState() beim allerersten Öffnen). Schritt 1 → 2
  // wechselt NUR den Inhalt des Overlays (removeOverlay() + neues innerHTML), OHNE dabei
  // selbst nochmal history.back()/pushState() aufzurufen — das vorherige Verhalten (jeder
  // Schritt pusht/poppt seinen eigenen Eintrag) führte zu einer Race Condition zwischen dem
  // asynchronen history.back() und dem direkt danach folgenden pushState(), wodurch der
  // History-Stack durcheinandergeriet und "Speichern" in Schritt 2 nicht mehr zuverlässig
  // zur aktualisierten Kachel-Ansicht zurückfand.
  function removeOverlay(){
    const el = document.getElementById('addTileOverlay');
    if (el) el.remove();
  }
  function closeWizard(){
    popOverlayStateIfOpen();
    removeOverlay();
  }

  function renderStep1(){
    removeOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'add-exercise-overlay centered-overlay';
    overlay.id = 'addTileOverlay';
    overlay.innerHTML = `
      <div class="add-exercise-modal" style="max-height:none;">
        <div class="add-exercise-modal-header">
          <div class="add-exercise-modal-title">Kachel hinzufügen</div>
          <button class="add-exercise-modal-close" id="addTileClose" aria-label="Abbrechen">✕</button>
        </div>
        <div class="new-exercise-modal-body">
          <div class="wizard-choice-list">
            ${hidden.map(id => `<button class="wizard-choice" data-add-tile="${id}">${modeDisplayLabel(id)}</button>`).join('')}
            ${canCreateCustom ? `<button class="wizard-choice" id="addTileCustomNew">+ Neue Kategorie erstellen</button>` : ''}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('addTileClose').onclick = closeWizard;
    const customNewBtn = document.getElementById('addTileCustomNew');
    if (customNewBtn) customNewBtn.onclick = renderStepCustomName;
    overlay.querySelectorAll('[data-add-tile]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.addTile;
        // Bei "Unterkörper" ist eine Pool-Auswahl redundant: Unterkörper- und Legs-Übungen
        // sind praktisch dieselbe Menge (siehe Push/Pull/Legs-Zuordnung), Push/Pull/Ganzkörper/
        // Oberkörper würden hier ohnehin nie sinnvoll gewählt — daher direkt mit dem
        // naheliegenden "Nur Unterkörper-Übungen"-Filter anlegen, ohne zweiten Schritt.
        if (id === 'unterkoerper'){
          if (plan.startTileHidden) delete plan.startTileHidden[id];
          if (!plan.modeSettings) plan.modeSettings = {};
          if (!plan.modeSettings[id]) plan.modeSettings[id] = {};
          plan.modeSettings[id].poolFilter = 'unterkoerper';
          await saveJSON('plan', plan);
          closeWizard();
          renderStartSelect();
          return;
        }
        renderStep2(id);
      };
    });
    overlay.onclick = (ev) => { if (ev.target === overlay) closeWizard(); };
  }

  // Zwischenschritt nur für komplett neue Custom-Kategorien: Name eingeben, bevor es mit dem
  // normalen Übungspool-Schritt (renderStep2) weitergeht. Die id wird hier bereits final
  // generiert (uid()-basiert wie überall sonst in der App) und in plan.customCategories
  // eingetragen — falls die Person danach doch abbricht, bleibt eine Kategorie ohne Pool-
  // Filter zurück, das ist unkritisch (poolFilter fällt dann auf 'all' zurück, siehe
  // modePoolFilter()).
  function renderStepCustomName(){
    removeOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'add-exercise-overlay centered-overlay';
    overlay.id = 'addTileOverlay';
    overlay.innerHTML = `
      <div class="add-exercise-modal" style="max-height:none;">
        <div class="add-exercise-modal-header">
          <div class="add-exercise-modal-title">Neue Kategorie</div>
          <button class="add-exercise-modal-close" id="addTileClose3" aria-label="Abbrechen">✕</button>
        </div>
        <div class="new-exercise-modal-body">
          <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:6px;">Name</label>
          <input type="text" id="addTileCustomNameInput" placeholder="z. B. Push, Cardio, Arme" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:16px;">
        </div>
        <div class="add-exercise-modal-header" style="border-top:1px solid var(--border); border-bottom:none; gap:10px;">
          <button class="btn btn-ghost" id="addTileBack3" style="flex:1;">‹ Zurück</button>
          <button class="btn btn-primary" id="addTileCustomNext" style="flex:1;">Weiter</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = document.getElementById('addTileCustomNameInput');
    input.focus();
    document.getElementById('addTileClose3').onclick = closeWizard;
    document.getElementById('addTileBack3').onclick = renderStep1;
    const submit = async () => {
      const name = input.value.trim();
      if (!name){ alert('Bitte einen Namen eintragen.'); return; }
      const id = 'custom-' + uid();
      if (!plan.customCategories) plan.customCategories = [];
      plan.customCategories.push({ id, label: name });
      await saveJSON('plan', plan);
      renderStep2(id);
    };
    input.onkeydown = (ev) => { if (ev.key === 'Enter'){ ev.preventDefault(); input.blur(); submit(); } };
    document.getElementById('addTileCustomNext').onclick = submit;
    overlay.onclick = (ev) => { if (ev.target === overlay) closeWizard(); };
  }

  // Zweiter Schritt: Übungspool für die neu hinzugefügte Kachel direkt mit auswählen —
  // dasselbe Optionsset wie im bestehenden Kategorie-Bearbeiten-Popup (openModeSettingsPrompt),
  // hier aber gleich beim Anlegen statt erst danach separat per Long-Press erreichbar. Bei
  // "Oberkörper" werden nur die drei tatsächlich sinnvollen Optionen gezeigt (Unterkörper/
  // Legs/Ganzkörper würden dort nie gewählt) — "Ganzkörper" und neue Custom-Kategorien
  // behalten die volle Auswahl, da dort jede Kombination denkbar ist.
  function renderStep2(id){
    removeOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'add-exercise-overlay centered-overlay';
    overlay.id = 'addTileOverlay';
    const allPoolOptions = [
      { value: 'all', label: 'Alle Übungen' },
      { value: 'oberkoerper', label: 'Nur Oberkörper-Übungen' },
      { value: 'unterkoerper', label: 'Nur Unterkörper-Übungen' },
      { value: 'push', label: 'Nur Push-Übungen' },
      { value: 'pull', label: 'Nur Pull-Übungen' },
      { value: 'legs', label: 'Nur Legs-Übungen (Beine + unterer Rücken)' },
    ];
    const poolOptions = id === 'oberkoerper'
      ? [
          { value: 'oberkoerper', label: 'Alle Oberkörper-Übungen' },
          { value: 'push', label: 'Nur Push-Übungen' },
          { value: 'pull', label: 'Nur Pull-Übungen' },
        ]
      : allPoolOptions;
    overlay.innerHTML = `
      <div class="add-exercise-modal" style="max-height:none;">
        <div class="add-exercise-modal-header">
          <div class="add-exercise-modal-title">Übungen zur Auswahl</div>
          <button class="add-exercise-modal-close" id="addTileClose2" aria-label="Abbrechen">✕</button>
        </div>
        <div class="new-exercise-modal-body">
          <div class="wizard-choice-list">
            ${poolOptions.map(o => `<button class="wizard-choice" data-add-tile-pool="${o.value}">${o.label}</button>`).join('')}
          </div>
        </div>
        <div class="add-exercise-modal-header" style="border-top:1px solid var(--border); border-bottom:none;">
          <button class="btn btn-ghost" id="addTileBack" style="width:100%;">‹ Zurück</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('addTileClose2').onclick = closeWizard;
    document.getElementById('addTileBack').onclick = renderStep1;
    overlay.querySelectorAll('[data-add-tile-pool]').forEach(btn => {
      btn.onclick = async () => {
        if (plan.startTileHidden) delete plan.startTileHidden[id];
        if (!plan.modeSettings) plan.modeSettings = {};
        if (!plan.modeSettings[id]) plan.modeSettings[id] = {};
        plan.modeSettings[id].poolFilter = btn.dataset.addTilePool;
        await saveJSON('plan', plan);
        closeWizard();
        renderStartSelect();
      };
    });
    overlay.onclick = (ev) => { if (ev.target === overlay) closeWizard(); };
  }

  pushOverlayState(closeWizard);
  renderStep1();
}

let modeEditData = null; // { A: {selected:Set, order:[]}, B: {selected:Set, order:[]} }
let modeEditTab = 'A';

function buildModeEditVariant(ids, mode){
  const poolFilter = modePoolFilter(mode);
  const isBodyPartFilter = (poolFilter === 'push' || poolFilter === 'pull' || poolFilter === 'legs');
  const pool = poolFilter === 'all'
    ? plan.exercises
    : isBodyPartFilter
      ? plan.exercises.filter(e => e.bodyPart === poolFilter)
      : plan.exercises.filter(e => e.category === poolFilter);
  const allIds = new Set(pool.map(e => e.id));
  const ungrouped = (poolFilter === 'oberkoerper' || poolFilter === 'unterkoerper' || isBodyPartFilter);
  const savedOrder = ids.filter(id => allIds.has(id));
  const groups = {};

  if (ungrouped){
    const muscleGroupIndex = g => {
      const i = MUSCLE_GROUP_ORDER.indexOf(g);
      return i === -1 ? MUSCLE_GROUP_ORDER.length : i;
    };
    const defaultSortedIds = [...pool].sort((a, b) => muscleGroupIndex(a.muscleGroup) - muscleGroupIndex(b.muscleGroup)).map(e => e.id);
    if (savedOrder.length){
      // Es existiert bereits eine eigene, ggf. quer über Muskelgruppen gemischte Reihenfolge
      // (z. B. durch Drag&Drop entstanden) — die bleibt beim erneuten Öffnen exakt erhalten,
      // statt wieder strikt nach Muskelgruppe sortiert zu werden. Noch nicht ausgewählte
      // Übungen (zum Stöbern/Hinzufügen) werden dahinter nach Muskelgruppe sortiert angehängt.
      const remaining = defaultSortedIds.filter(id => !savedOrder.includes(id));
      groups._all = [...savedOrder, ...remaining];
    } else {
      // Noch keine eigene Auswahl getroffen: die aktuelle Standard-Reihenfolge (nach
      // Muskelgruppe sortiert) dient als Ausgangspunkt.
      groups._all = defaultSortedIds;
    }
  } else {
    pool.forEach(ex => {
      const g = ex.muscleGroup || 'Sonstige';
      (groups[g] = groups[g] || []).push(ex.id);
    });
    // bereits gespeicherte Reihenfolge innerhalb jeder Muskelgruppen-Sektion respektieren
    Object.keys(groups).forEach(g => {
      groups[g].sort((a, b) => {
        const ia = savedOrder.indexOf(a), ib = savedOrder.indexOf(b);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    });
  }

  return {
    selected: new Set(savedOrder),
    groups,
    ungrouped
  };
}

let modeGroupOpen = new Set();

// Ermittelt die vollständige Reihenfolge aller Muskelgruppen für einen Modus: die zuletzt
// gespeicherte, per Drag angepasste Reihenfolge (plan.modeSettings[mode].groupOrder), ergänzt
// um eventuell neue Gruppen aus MUSCLE_GROUP_ORDER, die darin noch fehlen (am Ende angehängt).
function fullGroupOrder(mode){
  const stored = plan.modeSettings && plan.modeSettings[mode] && Array.isArray(plan.modeSettings[mode].groupOrder)
    ? plan.modeSettings[mode].groupOrder : null;
  const base = (stored && stored.length) ? stored.slice() : MUSCLE_GROUP_ORDER.slice();
  MUSCLE_GROUP_ORDER.forEach(g => { if (!base.includes(g)) base.push(g); });
  return base;
}

// Generischer Long-Press-Drag für Muskelgruppen-Akkordeons (Kopfzeilen), analog zum Muster
// von wireModeRowDrag()/wireFreeRowDrag() für einzelne Übungszeilen — nur eine Ebene höher.
// Sobald der Long-Press greift, werden ALLE Gruppen eingeklappt (einheitliche Kopfzeilenhöhe
// nötig für die Positions-Mathematik) und der Container neu gerendert; danach wird per
// window-weiten Pointer-Listenern weitergezogen (unabhängig von den beim Neu-Rendern
// ausgetauschten DOM-Knoten). Ein einfaches Antippen ohne Halten klappt die Gruppe wie gewohnt
// auf/zu. opts: { openSet: Set<string>, rerender: () => void, commitOrder: (newVisibleOrder: string[]) => void }
function wireMuscleGroupReorder(containerSelector, opts){
  const LONG_PRESS_MS = 350;
  const MOVE_CANCEL_PX = 18;
  const container = document.querySelector(containerSelector);
  if (!container) return;

  container.querySelectorAll(':scope > .muscle-group > .muscle-group-header').forEach(header => {
    const group = header.dataset.group;
    let pressTimer = null;
    let pointerId = null;
    let startX = 0, startY = 0, lastX = 0, lastY = 0;
    let mode = 'pending';
    let fromIndex = -1, targetIndex = -1;
    let rowHeight = 0;
    let dragEl = null;
    let visibleOrder = null;

    const cleanupListeners = () => {
      clearTimeout(pressTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const dyStep = ev.clientY - lastY;
      lastX = ev.clientX; lastY = ev.clientY;

      if (mode === 'pending'){
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX){
          mode = 'scrolling';
          clearTimeout(pressTimer);
          window.scrollBy(0, -dyStep);
        }
        return;
      }
      if (mode === 'scrolling'){ window.scrollBy(0, -dyStep); return; }
      if (mode !== 'dragging' || !dragEl) return;
      ev.preventDefault();
      const dy = ev.clientY - startY;
      dragEl.style.transform = `translateY(${dy}px) scale(1.01)`;
      dragEl.style.boxShadow = '0 8px 16px rgba(0,0,0,0.4)';
      const shift = Math.round(dy / rowHeight);
      const newTarget = Math.max(0, Math.min(visibleOrder.length - 1, fromIndex + shift));
      if (newTarget !== targetIndex){
        targetIndex = newTarget;
        const groupEls = Array.from(container.querySelectorAll(':scope > .muscle-group'));
        groupEls.forEach((t, i) => {
          if (t === dragEl) return;
          let offset = 0;
          if (fromIndex < targetIndex && i > fromIndex && i <= targetIndex) offset = -rowHeight;
          else if (fromIndex > targetIndex && i < fromIndex && i >= targetIndex) offset = rowHeight;
          t.style.transform = offset ? `translateY(${offset}px)` : '';
        });
      }
    };

    const onUp = (ev) => {
      if (ev.pointerId !== pointerId) return;
      cleanupListeners();
      if (mode === 'dragging' && dragEl){
        const groupEls = Array.from(container.querySelectorAll(':scope > .muscle-group'));
        groupEls.forEach(t => { t.style.transform=''; t.style.transition=''; t.style.boxShadow=''; t.style.zIndex=''; });
        if (targetIndex !== fromIndex && visibleOrder){
          const arr = visibleOrder.slice();
          const [moved] = arr.splice(fromIndex, 1);
          arr.splice(targetIndex, 0, moved);
          opts.commitOrder(arr);
        } else {
          opts.rerender();
        }
      } else if (mode !== 'scrolling'){
        if (opts.openSet.has(group)) opts.openSet.delete(group); else opts.openSet.add(group);
        opts.rerender();
      }
    };
    const onCancel = (ev) => { if (ev.pointerId !== pointerId) return; cleanupListeners(); };

    header.addEventListener('pointerdown', (e) => {
      pointerId = e.pointerId;
      startX = e.clientX; startY = e.clientY;
      lastX = startX; lastY = startY;
      mode = 'pending';
      fromIndex = -1; targetIndex = -1;
      dragEl = null; visibleOrder = null;

      pressTimer = setTimeout(() => {
        if (mode !== 'pending') return;
        opts.openSet.clear();
        opts.rerender();
        const freshHeader = container.querySelector(`.muscle-group-header[data-group="${CSS.escape(group)}"]`);
        dragEl = freshHeader ? freshHeader.closest('.muscle-group') : null;
        if (!dragEl) return;
        visibleOrder = Array.from(container.querySelectorAll(':scope > .muscle-group'))
          .map(g => g.querySelector('.muscle-group-header').dataset.group);
        fromIndex = visibleOrder.indexOf(group);
        targetIndex = fromIndex;
        mode = 'dragging';
        dragEl.style.transition = 'none';
        dragEl.style.zIndex = 5;
        rowHeight = dragEl.getBoundingClientRect().height + 10;
        Array.from(container.querySelectorAll(':scope > .muscle-group')).forEach(t => { if (t !== dragEl) t.style.transition = 'transform .18s ease'; });
        if (navigator.vibrate) navigator.vibrate(10);
      }, LONG_PRESS_MS);

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    });
  });
}

function renderModeEdit(mode, startTab){
  const collapsed = isSplitCollapsed(mode);
  modeEditTab = (!collapsed && startTab === 'B') ? 'B' : 'A';
  modeGroupOpen = new Set();
  modeEditData = {
    A: buildModeEditVariant(getModeExerciseIds(mode, 'A'), mode),
    B: buildModeEditVariant(getModeExerciseIds(mode, 'B'), mode)
  };
  // Reihenfolge der Muskelgruppen-Akkordeons — gilt gemeinsam für Split A und B (welche
  // Muskelgruppe zuerst trainiert wird, ist eine Eigenschaft der Kategorie, nicht des
  // einzelnen Splits) und lässt sich per Long-Press-Drag auf den Akkordeon-Kopfzeilen
  // verändern (siehe wireMuscleGroupReorder unten); wird erst mit "Speichern" persistiert.
  let groupOrder = fullGroupOrder(mode);
  const label = modeDisplayLabel(mode);

  app.innerHTML = `
    <div class="brand">
      <h1>${label} bearbeiten</h1>
    </div>
    <div class="back-row">
      <button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>
    ${collapsed ? '' : `
    <div class="period-row" id="modeEditTabs">
      <button class="period-btn ${modeEditTab === 'A' ? 'active' : ''}" data-tab="A">Split A</button>
      <button class="period-btn ${modeEditTab === 'B' ? 'active' : ''}" data-tab="B">Split B</button>
    </div>
    `}
    <div id="modeEditRows"></div>
    <button class="btn btn-primary" id="btnSaveMode" style="margin-top:8px;">Speichern</button>
  `;

  function renderTabs(){
    document.querySelectorAll('#modeEditTabs .period-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === modeEditTab);
    });
  }

  function orderedGroupNames(groups){
    const ordered = groupOrder.filter(g => groups[g] && groups[g].length);
    Object.keys(groups).forEach(g => { if (groups[g] && groups[g].length && !ordered.includes(g)) ordered.push(g); });
    return ordered;
  }

  function itemRowHTML(id, g, state){
    const ex = plan.exercises.find(e => e.id === id);
    if (!ex) return '';
    const img = ex.imageData;
    const muscleLabel = ex.mainMuscle || ex.muscleGroup || '';
    return `
      <div class="free-row ${state.selected.has(id) ? 'checked' : ''}" data-id="${id}" data-group="${g}">
        <div class="free-row-check">✓</div>
        <div class="free-row-media">
          ${img ? `<img class="free-row-thumb" src="${img}" alt="">` : `<span class="free-row-thumb-fallback">${initials(ex.name)}</span>`}
        </div>
        <div class="free-row-mid">
          <div class="free-row-name">${exerciseNameHTML(ex.name)}</div>
          <div class="free-row-muscle">${muscleLabel}</div>
        </div>
      </div>
    `;
  }

  function renderRows(){
    const state = modeEditData[modeEditTab];
    const container = document.getElementById('modeEditRows');

    if (state.ungrouped){
      const ids = state.groups._all || [];
      if (!ids.length){
        container.innerHTML = '<div class="history-empty">Noch keine Übungen im Plan.</div>';
        return;
      }
      container.innerHTML = ids.map(id => itemRowHTML(id, '_all', state)).join('');
      wireModeRowDrag(state);
      return;
    }

    const groupNames = orderedGroupNames(state.groups);
    if (!groupNames.length){
      container.innerHTML = '<div class="history-empty">Noch keine Übungen im Plan.</div>';
      return;
    }
    container.innerHTML = groupNames.map(g => {
      const ids = state.groups[g];
      const isOpen = modeGroupOpen.has(g);
      const selCount = ids.filter(id => state.selected.has(id)).length;
      const itemsHTML = ids.map(id => itemRowHTML(id, g, state)).join('');
      return `
        <div class="muscle-group">
          <button class="muscle-group-header" data-group="${g}" type="button">
            <span class="mg-name">${g}</span>
            <span class="mg-meta">${selCount ? selCount + '/' : ''}${ids.length} Übung${ids.length === 1 ? '' : 'en'} <span class="mg-arrow">${isOpen ? '▾' : '▸'}</span></span>
          </button>
          <div class="muscle-group-body" style="display:${isOpen ? 'block' : 'none'}">
            ${itemsHTML}
          </div>
        </div>
      `;
    }).join('');

    wireMuscleGroupReorder('#modeEditRows', {
      openSet: modeGroupOpen,
      rerender: renderRows,
      commitOrder: (newVisibleOrder) => {
        groupOrder = [...newVisibleOrder, ...groupOrder.filter(g => !newVisibleOrder.includes(g))];
        renderRows();
      }
    });

    wireModeRowDrag(state);
  }

  function wireModeRowDrag(state){
    const LONG_PRESS_MS = 350;
    const MOVE_CANCEL_PX = 18;
    const rowStep = 68;

    document.querySelectorAll('#modeEditRows .free-row').forEach(el => {
      el.addEventListener('pointerdown', (e) => {
        const group = el.dataset.group;
        const id = el.dataset.id;
        const arr = state.groups[group];
        const fromIndex = arr.indexOf(id);
        let targetIndex = fromIndex;
        const startX = e.clientX, startY = e.clientY;
        let lastX = startX, lastY = startY;
        let mode2 = 'pending';

        const groupEls = () => Array.from(document.querySelectorAll(`#modeEditRows .free-row[data-group="${CSS.escape(group)}"]`));

        const longPressTimer = setTimeout(() => {
          if (mode2 !== 'pending') return;
          mode2 = 'armed';
          try{ el.setPointerCapture(e.pointerId); }catch(err){}
          el.style.transition = 'transform .1s ease';
          el.style.transform = 'scale(1.02)';
          if (navigator.vibrate) navigator.vibrate(10);
        }, LONG_PRESS_MS);

        const onMove = (ev) => {
          const dyStep = ev.clientY - lastY;
          const dxStep = ev.clientX - lastX;
          lastX = ev.clientX; lastY = ev.clientY;

          if (mode2 === 'pending'){
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            if (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX){
              mode2 = 'scrolling';
              clearTimeout(longPressTimer);
              window.scrollBy(0, -dyStep);
            }
            return;
          }
          if (mode2 === 'scrolling'){
            window.scrollBy(0, -dyStep);
            return;
          }
          if (mode2 === 'armed'){
            mode2 = 'dragging';
            el.style.transition = 'none';
            el.style.zIndex = 5;
            groupEls().forEach(t => { if (t !== el) t.style.transition = 'transform .18s ease'; });
          }
          ev.preventDefault();
          const dy = ev.clientY - startY;
          el.style.transform = `translateY(${dy}px) scale(1.03)`;
          el.style.boxShadow = '0 8px 16px rgba(0,0,0,0.4)';

          const shift = Math.round(dy / rowStep);
          const newTarget = Math.max(0, Math.min(arr.length - 1, fromIndex + shift));
          if (newTarget !== targetIndex){
            targetIndex = newTarget;
            groupEls().forEach((t, i) => {
              if (t === el) return;
              let offset = 0;
              if (fromIndex < targetIndex && i > fromIndex && i <= targetIndex) offset = -rowStep;
              else if (fromIndex > targetIndex && i < fromIndex && i >= targetIndex) offset = rowStep;
              t.style.transform = offset ? `translateY(${offset}px)` : '';
            });
          }
        };

        const finish = () => {
          clearTimeout(longPressTimer);
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onUp);
          el.removeEventListener('pointercancel', onCancel);
          groupEls().forEach(t => { t.style.transform = ''; t.style.transition = ''; t.style.boxShadow = ''; t.style.zIndex = ''; });
        };
        const onUp = () => {
          const finalMode = mode2;
          finish();
          if (finalMode === 'dragging' && targetIndex !== fromIndex){
            const [moved] = arr.splice(fromIndex, 1);
            arr.splice(targetIndex, 0, moved);
            renderRows();
          } else if (finalMode !== 'scrolling'){
            if (state.selected.has(id)){
              state.selected.delete(id);
            } else {
              state.selected.add(id);
            }
            renderRows();
          }
        };
        const onCancel = () => { finish(); };

        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onCancel);
      });
    });
  }
  renderRows();

  document.querySelectorAll('#modeEditTabs .period-btn').forEach(btn => {
    btn.onclick = () => {
      modeEditTab = btn.dataset.tab;
      renderTabs();
      renderRows();
    };
  });

  document.getElementById('btnBack').onclick = () => history.back();
  document.getElementById('btnSaveMode').onclick = async () => {
    if (!plan.modeLists) plan.modeLists = {};
    if (!plan.modeSettings) plan.modeSettings = {};
    if (!plan.modeSettings[mode]) plan.modeSettings[mode] = {};
    plan.modeSettings[mode].groupOrder = groupOrder;
    // Reihenfolge = die Anzeige-Reihenfolge in diesem Bearbeiten-Screen (nach der aktuellen
    // Muskelgruppen-Reihenfolge sortiert, innerhalb einer Gruppe zusätzlich per Drag manuell
    // anpassbar) — genau diese Reihenfolge soll später auch im Training gelten, nicht die
    // Reihenfolge, in der die Häkchen gesetzt wurden.
    const flatten = state => {
      if (state.ungrouped){
        return (state.groups._all || []).filter(id => state.selected.has(id));
      }
      const result = [];
      orderedGroupNames(state.groups).forEach(g => {
        (state.groups[g] || []).forEach(id => { if (state.selected.has(id)) result.push(id); });
      });
      return result;
    };
    plan.modeLists[mode] = {
      A: flatten(modeEditData.A),
      B: flatten(modeEditData.B)
    };
    await saveJSON('plan', plan);
    history.back();
  };
}

let freeGroups = null;
let freeGroupOpen = new Set();

function renderFreeSelect(){
  freeSelected = new Set();
  freeGroupOpen = new Set();
  let freeSearchQuery = '';
  const groups = {};
  plan.exercises.forEach(ex => {
    const g = ex.muscleGroup || 'Sonstige';
    (groups[g] = groups[g] || []).push(ex.id);
  });
  freeGroups = groups;
  // Reihenfolge der Muskelgruppen-Akkordeons für diese Auswahl — per Long-Press-Drag auf den
  // Kopfzeilen veränderbar (siehe wireMuscleGroupReorder); gilt nur für dieses eine freie
  // Training und startet immer wieder bei der Standardreihenfolge (kein Speichern über
  // einzelne "Frei"-Trainings hinweg nötig, wie bei der Übungsauswahl selbst auch).
  let freeGroupOrder = MUSCLE_GROUP_ORDER.slice();

  app.innerHTML = `
    <div class="brand">
      <h1>Übungen wählen</h1>
    </div>
    <div class="back-row">
      <button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>
    <input type="text" id="freeSearch" class="plan-search" placeholder="Übung oder Muskel suchen…" style="margin-bottom:14px;">
    <div id="freeRows"></div>
    <button class="btn btn-primary" id="btnGo" style="margin-top:8px;">Los geht's</button>
  `;

  function matchesFreeSearch(ex){
    if (!freeSearchQuery.trim()) return true;
    const hay = `${ex.name} ${ex.mainMuscle || ''} ${ex.muscleGroup || ''}`.toLowerCase();
    return hay.includes(freeSearchQuery.trim().toLowerCase());
  }

  function orderedGroupNames(){
    const ordered = freeGroupOrder.filter(g => freeGroups[g]);
    Object.keys(freeGroups).forEach(g => { if (!ordered.includes(g)) ordered.push(g); });
    return ordered;
  }

  function renderRows(){
    const container = document.getElementById('freeRows');
    const q = freeSearchQuery.trim();
    const groupNames = orderedGroupNames()
      .map(g => ({ g, ids: freeGroups[g].filter(id => { const ex = plan.exercises.find(e => e.id === id); return ex && matchesFreeSearch(ex); }) }))
      .filter(({ ids }) => ids.length);
    if (!groupNames.length){
      container.innerHTML = `<div class="history-empty">${q ? 'Keine Übungen gefunden.' : 'Noch keine Übungen im Plan.'}</div>`;
      return;
    }
    container.innerHTML = groupNames.map(({ g, ids }) => {
      const isOpen = q ? true : freeGroupOpen.has(g);
      const selCount = ids.filter(id => freeSelected.has(id)).length;
      const itemsHTML = ids.map(id => {
        const ex = plan.exercises.find(e => e.id === id);
        if (!ex) return '';
        const img = ex.imageData;
        const muscleLabel = ex.mainMuscle || ex.muscleGroup || '';
        return `
          <div class="free-row ${freeSelected.has(id) ? 'checked' : ''}" data-id="${id}" data-group="${g}">
            <div class="free-row-check">✓</div>
            <div class="free-row-media">
              ${img ? `<img class="free-row-thumb" src="${img}" alt="">` : `<span class="free-row-thumb-fallback">${initials(ex.name)}</span>`}
            </div>
            <div class="free-row-mid">
              <div class="free-row-name">${exerciseNameHTML(ex.name)}</div>
              <div class="free-row-muscle">${muscleLabel}</div>
            </div>
          </div>
        `;
      }).join('');
      return `
        <div class="muscle-group">
          <button class="muscle-group-header" data-group="${g}" type="button">
            <span class="mg-name">${g}</span>
            <span class="mg-meta">${selCount ? selCount + '/' : ''}${ids.length} Übung${ids.length === 1 ? '' : 'en'} <span class="mg-arrow">${isOpen ? '▾' : '▸'}</span></span>
          </button>
          <div class="muscle-group-body" style="display:${isOpen ? 'block' : 'none'}">
            ${itemsHTML}
          </div>
        </div>
      `;
    }).join('');

    wireMuscleGroupReorder('#freeRows', {
      openSet: freeGroupOpen,
      rerender: renderRows,
      commitOrder: (newVisibleOrder) => {
        freeGroupOrder = [...newVisibleOrder, ...freeGroupOrder.filter(g => !newVisibleOrder.includes(g))];
        renderRows();
      }
    });

    wireFreeRowDrag();
  }

  function wireFreeRowDrag(){
    const LONG_PRESS_MS = 350;
    const MOVE_CANCEL_PX = 18;
    const rowStep = 68; // Zeilenhöhe (60px) + Abstand (8px), muss zur CSS-Lücke passen

    document.querySelectorAll('.free-row').forEach(el => {
      el.addEventListener('pointerdown', (e) => {
        const group = el.dataset.group;
        const id = el.dataset.id;
        const arr = freeGroups[group];
        const fromIndex = arr.indexOf(id);
        let targetIndex = fromIndex;
        const startX = e.clientX, startY = e.clientY;
        let lastX = startX, lastY = startY;
        let mode = 'pending'; // pending -> armed -> dragging, oder pending -> scrolling

        const groupEls = () => Array.from(document.querySelectorAll(`.free-row[data-group="${CSS.escape(group)}"]`));

        const longPressTimer = setTimeout(() => {
          if (mode !== 'pending') return;
          mode = 'armed';
          try{ el.setPointerCapture(e.pointerId); }catch(err){}
          el.style.transition = 'transform .1s ease';
          el.style.transform = 'scale(1.02)';
          if (navigator.vibrate) navigator.vibrate(10);
        }, LONG_PRESS_MS);

        const onMove = (ev) => {
          const dyStep = ev.clientY - lastY;
          const dxStep = ev.clientX - lastX;
          lastX = ev.clientX; lastY = ev.clientY;

          if (mode === 'pending'){
            // Solange die Zeile noch nicht "gehalten" wird (Long-Press-Schwelle nicht
            // erreicht), lässt touch-action:pan-y auf .free-row den Browser das vertikale
            // Scrollen bereits selbst nativ übernehmen (inkl. Momentum) — hier wird nur noch
            // erkannt, WANN sich die Geste als Scrollen entpuppt, um den Drag-Timer abzubrechen.
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            if (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX){
              mode = 'scrolling';
              clearTimeout(longPressTimer);
            }
            return;
          }
          if (mode === 'scrolling'){
            // Native Fortsetzung des Scrollens durch den Browser selbst (touch-action:pan-y) —
            // hier ist nichts mehr zu tun.
            return;
          }
          if (mode === 'armed'){
            mode = 'dragging';
            el.style.transition = 'none';
            el.style.zIndex = 5;
            groupEls().forEach(t => { if (t !== el) t.style.transition = 'transform .18s ease'; });
          }
          ev.preventDefault();
          const dy = ev.clientY - startY;
          el.style.transform = `translateY(${dy}px) scale(1.03)`;
          el.style.boxShadow = '0 8px 16px rgba(0,0,0,0.4)';

          const shift = Math.round(dy / rowStep);
          const newTarget = Math.max(0, Math.min(arr.length - 1, fromIndex + shift));
          if (newTarget !== targetIndex){
            targetIndex = newTarget;
            groupEls().forEach((t, i) => {
              if (t === el) return;
              let offset = 0;
              if (fromIndex < targetIndex && i > fromIndex && i <= targetIndex) offset = -rowStep;
              else if (fromIndex > targetIndex && i < fromIndex && i >= targetIndex) offset = rowStep;
              t.style.transform = offset ? `translateY(${offset}px)` : '';
            });
          }
        };

        const finish = () => {
          clearTimeout(longPressTimer);
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onUp);
          el.removeEventListener('pointercancel', onCancel);
          groupEls().forEach(t => { t.style.transform = ''; t.style.transition = ''; t.style.boxShadow = ''; t.style.zIndex = ''; });
        };
        const onUp = () => {
          const finalMode = mode;
          finish();
          if (finalMode === 'dragging' && targetIndex !== fromIndex){
            const [moved] = arr.splice(fromIndex, 1);
            arr.splice(targetIndex, 0, moved);
            renderRows();
          } else if (finalMode !== 'scrolling'){
            if (freeSelected.has(id)) freeSelected.delete(id); else freeSelected.add(id);
            renderRows();
          }
        };
        const onCancel = () => { finish(); };

        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onCancel);
      });
    });
  }
  renderRows();

  document.getElementById('freeSearch').oninput = (e) => {
    freeSearchQuery = e.target.value;
    renderRows();
  };
  document.getElementById('btnBack').onclick = () => history.back();
  document.getElementById('btnGo').onclick = () => {
    const orderedIds = orderedGroupNames().flatMap(g => freeGroups[g]);
    const list = orderedIds.filter(id => freeSelected.has(id)).map(id => plan.exercises.find(e => e.id === id));
    if (!list.length){ alert('Bitte mindestens eine Übung auswählen.'); return; }
    startSession(list, null, 'frei');
  };
}

