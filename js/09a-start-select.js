/* ---------------------------------------------------
   09a-start-select.js
   ---------------------------------------------------
   Teil 1/3 der ehemals einzelnen 09-start-select.js (2197 Zeilen, an der
   Größengrenze für vollständige Datei-Downloads). Rein aus Dateigröße
   aufgeteilt, OHNE inhaltliche Änderung — Funktionsgrenzen sind exakt
   erhalten, nur auf drei Dateien verteilt. Ausführungsreihenfolge bleibt
   zwingend 09a → 09b → 09c (siehe <script>-Reihenfolge in index.html und
   APP_SHELL in sw.js).
   Inhalt dieses Teils: Modus-/Kachel-Helfer, Splitplan-Sequenz, Import
   einzelner Session-Dateien, sowie renderStartSelect() inkl. Long-Press-
   Verkabelung und Muskelgruppen-Farbwahl.
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

