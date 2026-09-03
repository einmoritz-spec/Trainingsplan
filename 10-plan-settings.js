/* ---------------------------------------------------
   PLAN EDITOR
--------------------------------------------------- */
let planSearchQuery = '';
let planGroupOpen = new Set();

// Lädt eine Bilddatei, skaliert sie auf max. 300px Kantenlänge herunter
// und liefert sie als komprimiertes JPEG-DataURL zurück (klein genug fürs Storage).
function downscaleImageFile(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
      img.onload = () => {
        const maxDim = 300;
        let { width, height } = img;
        if (width > height && width > maxDim){
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else if (height > maxDim){
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}


// Flache Übersichtszeile im Übungen-Editor: Bild + Name + Bearbeiten-Icon-Button, der das
// vollständige Detail-Popup öffnet (siehe openPlanRowEditPopup). Alle Detail-Felder (Sätze,
// Wdh/Zeit, Körperbereich, Muskelgruppe, Push/Pull/Legs, Haken etc.) leben jetzt nur noch im
// Popup — die Übersichtsliste bleibt dadurch kompakt, auch bei vielen Übungen pro Gruppe.
// Favorisierte Übungen (Übungen-Screen + Übungsbild-Popup, siehe renderPlanEditor()/
// openExerciseImagePopup()) — reine id-Liste in plan.favoriteExerciseIds, unabhängig von den
// Farb-Favoriten (favoriteAccentColors()) weiter oben.
function favoriteExerciseIds(){
  return Array.isArray(plan.favoriteExerciseIds) ? plan.favoriteExerciseIds : [];
}
function isExerciseFavorite(id){
  return favoriteExerciseIds().includes(id);
}
async function toggleExerciseFavorite(id){
  const favs = favoriteExerciseIds().slice();
  const idx = favs.indexOf(id);
  if (idx === -1) favs.push(id); else favs.splice(idx, 1);
  plan.favoriteExerciseIds = favs;
  await saveJSON('plan', plan);
}
// Entfernt eine Übung NICHT endgültig, sondern blendet sie nur aus dem aktiven Übungsplan
// (plan.exercises) aus und legt sie stattdessen in plan.removedExercises ab — von dort taucht
// sie im "Aus Vorlagen wählen"-Picker (siehe openExerciseLibraryPicker()) wieder auf und kann
// jederzeit erneut hinzugefügt werden, mit allen ursprünglichen Werten (inkl. eigenem Bild,
// falls vorhanden). Ein zusätzlich gesetzter Favoriten-Status wird dabei mit entfernt, da eine
// ausgeblendete Übung nicht mehr in der Favoriten-Liste auftauchen soll.
async function hideExerciseFromPlan(i){
  const [ex] = plan.exercises.splice(i, 1);
  if (!ex) return;
  if (isExerciseFavorite(ex.id)) await toggleExerciseFavorite(ex.id);
  if (!Array.isArray(plan.removedExercises)) plan.removedExercises = [];
  plan.removedExercises = plan.removedExercises.filter(r => r.id !== ex.id);
  plan.removedExercises.push(ex);
  await saveJSON('plan', plan);
}
// Stern-Icon als Inline-SVG statt Bilddatei — dadurch kann die Füllung exakt der frei wählbaren
// Akzentfarbe folgen (currentColor, gleiches Prinzip wie das Repeat-Icon bei "Nochmal
// trainieren"), was mit einem gefilterten Raster-Icon bei einer beliebigen Akzentfarbe nicht
// zuverlässig möglich wäre. Gefüllt = favorisiert, nur Umriss = nicht favorisiert.
function starIconSVG(filled){
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.63 22 9.24 16.5 14.14 18.18 21 12 17.27 5.82 21 7.5 14.14 2 9.24 8.91 8.63 12 2"></polygon></svg>`;
}
function renderExerciseRowHTML(ex, i){
  return `
    <div class="plan-row" data-i="${i}">
      <div class="plan-row-media">
        ${ex.imageData ? `<img class="plan-row-thumb" src="${ex.imageData}" alt="">` : `<span class="plan-row-thumb-fallback">${initials(ex.name)}</span>`}
      </div>
      <div class="plan-row-name">${exerciseNameHTML(ex.name)}</div>
      <button type="button" class="exercise-fav-btn" data-fav="${ex.id}" aria-label="${isExerciseFavorite(ex.id) ? 'Favorit entfernen' : 'Als Favorit markieren'}">${starIconSVG(isExerciseFavorite(ex.id))}</button>
      <button type="button" class="plan-row-edit-btn" data-edit="${i}" aria-label="Bearbeiten"><img src="${ICON_EDIT}" alt=""></button>
      <button type="button" class="plan-row-delete-btn" data-hide="${i}" aria-label="Übung ausblenden">✕</button>
    </div>
  `;
}

// Baut die vollständigen Detail-Felder einer Übung (bisher Teil von renderExerciseRowHTML) —
// wird jetzt innerhalb von openPlanRowEditPopup() ins Popup gerendert statt direkt in die Liste.
function renderExerciseEditFieldsHTML(ex, i){
  const isTime = ex.type === 'time';
  const isCardioEx = isTime && !!ex.cardioMachine;
  const gridHTML = isCardioEx ? '' : isTime ? `
    <div class="plan-grid" style="grid-template-columns:1fr 1fr 1fr;">
      <div><label>Sätze</label><input type="number" min="1" value="${ex.sets}" data-field="sets"></div>
      <div><label>Sek. von</label><input type="number" min="1" value="${ex.secondsMin ?? 30}" data-field="secondsMin"></div>
      <div><label>Sek. bis</label><input type="number" min="1" value="${ex.secondsMax ?? 60}" data-field="secondsMax"></div>
    </div>` : `
    <div class="plan-grid">
      <div><label>Sätze</label><input type="number" min="1" value="${ex.sets}" data-field="sets"></div>
      <div><label>Wdh von</label><input type="number" min="1" value="${ex.repsMin}" data-field="repsMin"></div>
      <div><label>Wdh bis</label><input type="number" min="1" value="${ex.repsMax}" data-field="repsMax"></div>
      <div><label>kg</label><input type="number" min="0" step="0.5" value="${ex.weight}" data-field="weight"></div>
    </div>`;
  return `
    <div class="plan-edit-image-actions">
      <label class="btn btn-ghost btn-small plan-image-upload" style="display:inline-block; cursor:pointer;">
        ${ex.imageData ? 'Bild ändern' : 'Bild hinzufügen'}
        <input type="file" accept="image/*" data-imageupload="${i}" style="display:none;">
      </label>
      ${ex.imageData ? `<button type="button" class="btn btn-ghost btn-small" data-imageremove="${i}">Bild entfernen</button>` : ''}
    </div>
    <input type="text" value="${ex.name}" data-field="name" aria-label="Übungsname">
    ${gridHTML}
    <div class="plan-row2">
      <div>
        <label>Körperbereich</label>
        <select data-field="category">
          <option value="oberkoerper" ${ex.category !== 'unterkoerper' && ex.category !== 'kardio' ? 'selected' : ''}>Oberkörper</option>
          <option value="unterkoerper" ${ex.category === 'unterkoerper' ? 'selected' : ''}>Unterkörper</option>
          <option value="kardio" ${ex.category === 'kardio' ? 'selected' : ''}>Kardio</option>
        </select>
      </div>
      <div>
        <label>Typ</label>
        <select class="type-select" data-i="${i}">
          <option value="reps" ${!isTime ? 'selected' : ''}>Wiederh.</option>
          <option value="time" ${isTime ? 'selected' : ''}>Zeit</option>
        </select>
      </div>
    </div>
    ${isTime ? `
    <div class="plan-row2">
      <div style="flex:1;">
        <label>Kardiogerät (optional)</label>
        <select data-field="cardioMachine">
          <option value="" ${!ex.cardioMachine ? 'selected' : ''}>— Kein Kardiogerät —</option>
          ${Object.keys(CARDIO_MACHINES).map(key => `<option value="${key}" ${ex.cardioMachine === key ? 'selected' : ''}>${CARDIO_MACHINES[key].label}</option>`).join('')}
        </select>
      </div>
    </div>` : ''}
    <div class="plan-row2">
      <div>
        <label>Muskelgruppe</label>
        <select data-field="muscleGroup">
          ${MUSCLE_GROUP_ORDER.map(g => `<option value="${g}" ${ex.muscleGroup === g ? 'selected' : ''}>${g}</option>`).join('')}
        </select>
      </div>
      <div>
        <label>Muskeln (Detail)</label>
        <input type="text" value="${ex.muscles || ''}" data-field="muscles" placeholder="z. B. Latissimus, Bizeps">
      </div>
    </div>
    <div class="plan-row2">
      <div style="flex:1;">
        <label>Push / Pull / Legs</label>
        <select data-field="bodyPart">
          <option value="" ${!ex.bodyPart ? 'selected' : ''}>— keine Zuordnung —</option>
          <option value="push" ${ex.bodyPart === 'push' ? 'selected' : ''}>Push</option>
          <option value="pull" ${ex.bodyPart === 'pull' ? 'selected' : ''}>Pull</option>
          <option value="legs" ${ex.bodyPart === 'legs' ? 'selected' : ''}>Legs (inkl. unterer Rücken)</option>
        </select>
      </div>
    </div>
    ${!isTime ? `
    <div class="plan-row2">
      <div>
        <label style="display:flex; align-items:center; gap:6px; text-transform:none; font-size:12px; letter-spacing:normal;">
          <input type="checkbox" data-checkfield="assisted" ${ex.assisted ? 'checked' : ''} style="width:auto;">
          Unterstützt (z. B. Klimmzugmaschine)
        </label>
      </div>
      <div>
        <label style="display:flex; align-items:center; gap:6px; text-transform:none; font-size:12px; letter-spacing:normal;">
          <input type="checkbox" data-checkfield="bodyweightExercise" ${ex.bodyweightExercise ? 'checked' : ''} style="width:auto;">
          Eigenkörpergewicht (z. B. Klimmzüge)
        </label>
      </div>
    </div>
    ${ex.bodyweightExercise ? `
    <div class="plan-row2">
      <div>
        <label>Anteil Körpergewicht (%)</label>
        <input type="number" min="1" max="100" step="5" value="${Math.round((ex.bodyWeightFactor != null ? ex.bodyWeightFactor : 1) * 100)}" data-field="bodyWeightFactorPercent">
      </div>
    </div>
    ` : ''}` : ''}
    <button type="button" class="plan-edit-remove" data-remove="${i}">Übung entfernen</button>
  `;
}

// Zeigt das Bild einer Übung groß in einem Popup an, darunter ein Platzhalter für
// Übungs-Infos (Text wird später ergänzt). Wird sowohl vom Übungen-Editor (Klick auf das
// kleine Vorschaubild) als auch aus dem laufenden Training heraus (Klick auf das bereits
// aktive Kachelbild im Übungswechsler, siehe wireThumbDrag()) aufgerufen — beide Stellen
// übergeben einfach das jeweilige Übungsobjekt aus plan.exercises.
function openExerciseImagePopup(ex){
  if (!ex) return;
  const existing = document.getElementById('exerciseImagePopupOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'exerciseImagePopupOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal" style="max-height:88vh;">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">${exerciseNameHTML(ex.name)}</div>
        <div class="add-exercise-modal-header-icons">
          <button type="button" class="exercise-fav-btn" id="exerciseImagePopupFav" aria-label="${isExerciseFavorite(ex.id) ? 'Favorit entfernen' : 'Als Favorit markieren'}">${starIconSVG(isExerciseFavorite(ex.id))}</button>
          <button class="add-exercise-modal-close" id="exerciseImagePopupClose" aria-label="Schließen">✕</button>
        </div>
      </div>
      <div class="new-exercise-modal-body">
        ${ex.imageData
          ? `<img class="exercise-image-popup-img" src="${ex.imageData}" alt="">`
          : `<div class="exercise-image-popup-placeholder">${initials(ex.name)}</div>`}
        <div class="exercise-image-popup-info">${exerciseInfoHTML(ex)}</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(remove);

  function remove(){ const el = document.getElementById('exerciseImagePopupOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); };
  document.getElementById('exerciseImagePopupClose').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
  document.getElementById('exerciseImagePopupFav').onclick = async () => {
    await toggleExerciseFavorite(ex.id);
    const btn = document.getElementById('exerciseImagePopupFav');
    const nowFav = isExerciseFavorite(ex.id);
    btn.innerHTML = starIconSVG(nowFav);
    btn.setAttribute('aria-label', nowFav ? 'Favorit entfernen' : 'Als Favorit markieren');
  };
}

// Öffnet das Bearbeiten-Popup für eine einzelne Übung im Übungen-Editor (renderPlanEditor) —
// exakt im selben Popup-Stil wie z. B. openModeSettingsPrompt(). onSaved wird nach dem
// Schließen aufgerufen, damit der aufrufende Screen die Liste neu rendert (z. B. bei
// geändertem Namen/Muskelgruppe oder nach "Übung entfernen").
function openPlanRowEditPopup(i, onSaved){
  const existing = document.getElementById('planRowEditOverlay');
  if (existing) existing.remove();

  const ex = plan.exercises[i];
  if (!ex) return;

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'planRowEditOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal" style="max-height:88vh;">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">Übung bearbeiten</div>
        <button class="add-exercise-modal-close" id="planRowEditClose" aria-label="Schließen">✕</button>
      </div>
      <div class="new-exercise-modal-body plan-edit-modal-body" id="planRowEditBody">
        ${renderExerciseEditFieldsHTML(ex, i)}
      </div>
      <div class="add-exercise-modal-header" style="border-top:1px solid var(--border); border-bottom:none;">
        <button class="btn btn-primary" id="planRowEditDone" style="flex:1;">Fertig</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(remove);

  function remove(){ const el = document.getElementById('planRowEditOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); if (onSaved) onSaved(); };

  function collectInto(){
    const textFields = new Set(['name', 'category', 'muscles', 'muscleGroup', 'bodyPart', 'cardioMachine']);
    const body = document.getElementById('planRowEditBody');
    if (!body) return;
    body.querySelectorAll('[data-field]').forEach(input => {
      const field = input.dataset.field;
      // Sonderfall: "Anteil Körpergewicht (%)" ist ein reines UI-Feld (0-100), das intern als
      // Bruchzahl (0-1) unter bodyWeightFactor gespeichert wird, siehe effectiveSetWeight().
      if (field === 'bodyWeightFactorPercent'){
        const pct = Number(input.value);
        plan.exercises[i].bodyWeightFactor = isFinite(pct) && pct > 0 ? pct / 100 : 1;
        return;
      }
      plan.exercises[i][field] = textFields.has(field) ? input.value : Number(input.value);
    });
    body.querySelectorAll('[data-checkfield]').forEach(input => {
      plan.exercises[i][input.dataset.checkfield] = input.checked;
    });
  }

  function rerenderFields(){
    collectInto();
    const body = document.getElementById('planRowEditBody');
    body.innerHTML = renderExerciseEditFieldsHTML(plan.exercises[i], i);
    wireFields();
  }

  function wireFields(){
    const body = document.getElementById('planRowEditBody');
    const typeSelect = body.querySelector('.type-select');
    if (typeSelect) typeSelect.onchange = () => {
      collectInto();
      plan.exercises[i].type = typeSelect.value;
      if (typeSelect.value === 'time'){
        if (plan.exercises[i].secondsMin == null) plan.exercises[i].secondsMin = 30;
        if (plan.exercises[i].secondsMax == null) plan.exercises[i].secondsMax = 60;
      } else {
        if (plan.exercises[i].repsMin == null) plan.exercises[i].repsMin = 8;
        if (plan.exercises[i].repsMax == null) plan.exercises[i].repsMax = 12;
        if (plan.exercises[i].weight == null) plan.exercises[i].weight = 0;
      }
      rerenderFields();
    };
    // Checkbox "Eigenkörpergewicht" schaltet das zusätzliche "Anteil Körpergewicht (%)"-Feld
    // live ein/aus, ohne das Popup neu öffnen zu müssen.
    const bodyweightCheckbox = body.querySelector('[data-checkfield="bodyweightExercise"]');
    if (bodyweightCheckbox) bodyweightCheckbox.onchange = () => {
      collectInto();
      rerenderFields();
    };
    const imageInput = body.querySelector('[data-imageupload]');
    if (imageInput) imageInput.onchange = async () => {
      const file = imageInput.files && imageInput.files[0];
      if (!file) return;
      collectInto();
      try{
        const dataUrl = await downscaleImageFile(file);
        plan.exercises[i].imageData = dataUrl;
        rerenderFields();
      }catch(err){
        alert('Bild konnte nicht verarbeitet werden: ' + err.message);
      }
    };
    const imageRemoveBtn = body.querySelector('[data-imageremove]');
    if (imageRemoveBtn) imageRemoveBtn.onclick = () => {
      collectInto();
      delete plan.exercises[i].imageData;
      rerenderFields();
    };
    const removeBtn = body.querySelector('[data-remove]');
    if (removeBtn) removeBtn.onclick = () => {
      plan.exercises.splice(i, 1);
      close();
    };
  }

  wireFields();

  document.getElementById('planRowEditClose').onclick = () => { collectInto(); close(); };
  document.getElementById('planRowEditDone').onclick = () => { collectInto(); close(); };
  overlay.onclick = (ev) => { if (ev.target === overlay){ collectInto(); close(); } };
}

// Verkabelt das freie Farbfeld (Sättigung × Helligkeit bei wählbarem Farbton) und den
// Öffnet das "Eigene Farbe wählen"-Popup: Farbfeld (Sättigung × Helligkeit) + Hue-Streifen,
// eine Live-Vorschau samt Hex-Code, und explizite Abbrechen-/Speichern-Buttons statt der
// Farbe sofort bei jeder Fingerbewegung dauerhaft zu übernehmen. Während des Ziehens wird
// --accent nur TEMPORÄR fürs Vorschau-Gefühl gesetzt (damit man den Effekt in der übrigen
// UI schon sieht), aber erst "Speichern" schreibt sie wirklich in plan.accentColorId/
// accentCustomHex; "Abbrechen" oder Wegtippen stellt die vorherige Akzentfarbe wieder her.
// tileMode: optional — wenn gesetzt, bearbeitet dieses Popup die Rahmenfarbe der jeweiligen
// Trainings-Kachel (plan.modeSettings[tileMode].tileColorId/-Hex, siehe openModeSettingsPrompt())
// statt des globalen App-Akzents. Die Live-Vorschau setzt in diesem Fall bewusst NICHT die
// globale CSS-Variable --accent (das würde die ganze App umfärben) — die kleine
// Vorschau-Kachel im Popup selbst reicht als Rückmeldung beim Ziehen/Eintippen.
// ftMode ('accent'|'bg'|null) macht diesen Picker zusätzlich vom Essenstracker-eigenen
// Design-Akkordeon nutzbar (ftOpenSettingsSheet(), 15b-food-day.js) — schreibt dann in
// ftThemeOverride statt in plan und wendet ftApplyTheme() statt applyTheme() an. isBg bleibt
// bei ftMode==='bg' ebenfalls true (identische Grundlogik wie beim allgemeinen Hintergrund-
// Picker), daher werden isFtAccent/isFtBg als eigene Flags GENAU an den Stellen abgefragt, wo
// sich Lese-/Schreibziel unterscheiden — überall sonst (Drag-Handling, Hex-Eingabe, Favoriten-
// Stern) ist der Code komplett identisch und bleibt unverändert.
function openAccentColorPickerPrompt(tileMode, muscleGroup, onGlobalSave, bgMode, ftMode){
  const existing = document.getElementById('accentColorOverlay');
  if (existing) existing.remove();

  const isTile = !!tileMode;
  const isMuscleGroup = !!muscleGroup;
  const isFtAccent = ftMode === 'accent';
  const isFtBg = ftMode === 'bg';
  const isBg = !!bgMode || isFtBg;
  // previousBg: null bedeutet "kein eigener Hintergrund gesetzt" (Theme-Standard) — muss von
  // einer tatsächlich gewählten Farbe unterschieden werden, damit "Abbrechen" korrekt entweder
  // die vorherige eigene Farbe ODER wieder den Theme-Standard herstellt statt fälschlich Gelb.
  const previousBg = isFtBg ? ftCurrentBgColor() : isBg ? currentBgColor() : null;
  const previousAccent = isMuscleGroup ? { hex: muscleGroupColor(muscleGroup) }
    : isTile ? (currentTileColor(tileMode) || ACCENT_COLORS[0])
    : isBg ? (previousBg || { hex: cssVar('--bg') })
    : isFtAccent ? ftCurrentAccentColor()
    : currentAccentColor();
  let { h, s, v } = hexToHsv(previousAccent.hex);

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay';
  overlay.id = 'accentColorOverlay';
  overlay.innerHTML = `
    <div class="accent-picker-sheet">
      <div class="accent-picker-preview-row">
        <div class="accent-picker-preview" id="accentPickerPreview"></div>
        <input type="text" class="accent-picker-hex-input" id="accentPickerHexInput" maxlength="7" spellcheck="false" autocapitalize="off">
        <button class="accent-picker-fav-btn" id="accentPickerFavBtn" aria-label="Als Favorit speichern" type="button">
          <span class="accent-picker-fav-star"></span>
        </button>
      </div>
      <div class="accent-palette-field" id="accentPaletteField">
        <div class="accent-palette-cursor" id="accentPaletteCursor"></div>
      </div>
      <div class="accent-hue-slider" id="accentHueSlider">
        <div class="accent-hue-cursor" id="accentHueCursor"></div>
      </div>
      <div class="add-exercise-modal-header" style="border-top:none; padding:16px 0 0; gap:10px;">
        <button class="btn btn-ghost" id="accentPickerCancel" style="flex:1;">Abbrechen</button>
        <button class="btn btn-primary" id="accentPickerSave" style="flex:1;">Speichern</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  // Bei einer Kachel-Rahmenfarbe liegt bereits ein History-Eintrag vom Kategorie-Popup vor
  // (das dahinter im DOM stehen bleibt) — hier wird dessen Zurück-Handler einfach ersetzt statt
  // einen weiteren Eintrag zu pushen, sonst geriete der Zurück-Stack aus dem Gleichgewicht.
  // cancelFromBack statt cancel: der globale popstate-Handler ruft die registrierte Funktion
  // ohne Argumente auf — cancel() muss aber wissen, ob der History-Eintrag bereits von der
  // Zurück-Taste verbraucht wurde (dann darf es weder selbst zurücknavigieren noch den
  // Eintrag wiederverwenden). Siehe Kommentar an cancel().
  const cancelFromBack = () => cancel(true);
  if (isTile || isMuscleGroup){
    if (overlayCloseStack.length) overlayCloseStack[overlayCloseStack.length - 1] = cancelFromBack;
    else overlayCloseStack.push(cancelFromBack);
  }
  else pushOverlayState(cancelFromBack);

  const field = document.getElementById('accentPaletteField');
  const cursor = document.getElementById('accentPaletteCursor');
  const hueSlider = document.getElementById('accentHueSlider');
  const hueCursor = document.getElementById('accentHueCursor');
  const preview = document.getElementById('accentPickerPreview');
  const hexInput = document.getElementById('accentPickerHexInput');
  const favBtn = document.getElementById('accentPickerFavBtn');

  // true, solange die Änderung von der Palette/dem Hue-Slider kommt (dann muss das
  // Hex-Feld nur mitgeschrieben werden) — verhindert einen Rückkopplungs-Loop mit der
  // Hex-Eingabe, die ihrerseits h/s/v neu berechnet und updateVisuals() erneut aufruft.
  function updateVisuals(skipHexInput){
    const hex = hsvToHex(h, s, v);
    field.style.setProperty('--hue-hex', hsvToHex(h, 100, 100));
    hueCursor.style.setProperty('--hue-hex', hsvToHex(h, 100, 100));
    const fw = field.clientWidth, fh = field.clientHeight;
    cursor.style.left = `${(s / 100) * fw}px`;
    cursor.style.top = `${(1 - v / 100) * fh}px`;
    const hw = hueSlider.clientWidth;
    hueCursor.style.left = `${(h / 360) * hw}px`;
    preview.style.background = hex;
    if (!skipHexInput) hexInput.value = hex.toUpperCase();
    favBtn.classList.toggle('active', favoriteAccentColors().includes(hex));
    // Live-Vorschau: --accent/--bg nur im Dokument gesetzt, noch nicht gespeichert (nur beim
    // globalen Akzent bzw. der Hintergrundfarbe — bei einer Kachel-Rahmenfarbe oder
    // Muskelgruppen-Farbe bleibt die App-Vorschau unverändert).
    if (isBg){
      document.documentElement.style.setProperty('--bg', hex);
    } else if (!isTile && !isMuscleGroup){
      document.documentElement.style.setProperty('--accent', hex);
      document.documentElement.style.setProperty('--accent-contrast', isFtAccent ? ftContrastTextColor(hex) : contrastTextColor(hex));
    }
  }
  updateVisuals();

  function bindDrag(el, onMove){
    let dragging = false;
    const start = (ev) => { dragging = true; onMove(ev); ev.preventDefault(); };
    const move = (ev) => { if (dragging) onMove(ev); };
    const end = () => { dragging = false; };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
  }
  bindDrag(field, (ev) => {
    const rect = field.getBoundingClientRect();
    const t = ev.touches ? ev.touches[0] : ev;
    const x = Math.max(0, Math.min(rect.width, t.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, t.clientY - rect.top));
    s = (x / rect.width) * 100;
    v = 100 - (y / rect.height) * 100;
    updateVisuals();
  });
  bindDrag(hueSlider, (ev) => {
    const rect = hueSlider.getBoundingClientRect();
    const t = ev.touches ? ev.touches[0] : ev;
    const x = Math.max(0, Math.min(rect.width, t.clientX - rect.left));
    h = (x / rect.width) * 360;
    updateVisuals();
  });

  // Direkte Hex-Eingabe: bei jeder gültigen 6-stelligen Hex-Farbe (mit oder ohne führendes
  // #) wird sofort h/s/v neu berechnet und die Palette/der Slider springen mit — bei
  // ungültiger/unvollständiger Eingabe (z. B. während des Tippens) passiert einfach nichts,
  // bis wieder ein gültiger Wert dasteht.
  const HEX_RE = /^#?[0-9a-fA-F]{6}$/;
  hexInput.oninput = () => {
    let val = hexInput.value.trim();
    if (!val.startsWith('#')) val = '#' + val;
    if (HEX_RE.test(val)){
      ({ h, s, v } = hexToHsv(val));
      updateVisuals(true); // Hex-Feld nicht überschreiben, während die Person noch tippt
    }
  };
  hexInput.onblur = () => updateVisuals(); // beim Verlassen des Felds sauber normalisieren (z. B. Großschreibung, führendes #)

  favBtn.onclick = async () => {
    const hex = hsvToHex(h, s, v);
    const favs = favoriteAccentColors();
    if (favs.includes(hex)){
      plan.favoriteAccentColors = favs.filter(x => x !== hex);
    } else {
      plan.favoriteAccentColors = [...favs, hex];
    }
    await saveJSON('plan', plan);
    if (navigator.vibrate) navigator.vibrate(10);
    updateVisuals();
  };

  function removeOverlay(){
    const el = document.getElementById('accentColorOverlay');
    if (el) el.remove();
  }
  // BUGFIX: Bei einer Kachel-Rahmenfarbe/Muskelgruppenfarbe pusht dieser Picker oben KEINEN
  // eigenen History-Eintrag (er ersetzt nur den obersten Zurück-Handler) — dann darf er beim
  // Schließen auch keinen verbrauchen. Das frühere, bedingungslose popOverlayStateIfOpen()
  // löste ein history.back() aus, während im selben Durchlauf das darunterliegende
  // Kategorie-Popup per pushOverlayState() sofort wieder einen Eintrag pushte. Das back()
  // wird aber erst asynchron verarbeitet und traf dann auf den frisch gepushten Eintrag:
  // overlayCloseStack und History-Tiefe liefen auseinander, overlaySelfClosingCount blieb
  // stehen und schluckte den nächsten echten Zurück-Tap (toter Pfeil im Kachel-Menü), und
  // der aktuelle History-Eintrag blieb ein '__overlay__'-Marker — weshalb ein Aktualisieren
  // der Seite über renderViewByState() auf der Startseite landete ("App startet neu").
  // fromBack === true: Aufruf kommt vom popstate-Handler, der Eintrag ist bereits weg.
  function cancel(fromBack){
    if (!fromBack && !isTile && !isMuscleGroup) popOverlayStateIfOpen();
    removeOverlay();
    if (isFtBg || isFtAccent){
      // Essenstracker-eigenes Farbschema: ftThemeOverride wurde noch nicht verändert (erst
      // im Save-Handler unten), ftApplyTheme() stellt also einfach wieder exakt den Zustand
      // vor dem Öffnen des Farbwählers her — inkl. korrekt abgeleiteter Oberflächenfarben,
      // falls previousBg gesetzt war (die manuelle Teil-Rücksetzung im allgemeinen Zweig
      // unten deckt das für den Hintergrund bewusst nicht ab, siehe deren Kommentar).
      ftApplyTheme();
    } else if (isBg){
      // war vorher kein eigener Hintergrund gesetzt, Override wieder entfernen statt eine
      // Farbe zu erzwingen, sonst käme fälschlich der Startwert der Vorschau zum Tragen.
      if (previousBg) document.documentElement.style.setProperty('--bg', previousBg.hex);
      else document.documentElement.style.removeProperty('--bg');
    } else if (!isTile && !isMuscleGroup){
      document.documentElement.style.setProperty('--accent', previousAccent.hex); // Vorschau zurücksetzen
      document.documentElement.style.setProperty('--accent-contrast', contrastTextColor(previousAccent.hex));
    }
    // Vorhandenen History-Eintrag wiederverwenden statt einen zweiten zu pushen — außer der
    // Eintrag wurde gerade von der Zurück-Taste verbraucht (fromBack), dann wird neu gepusht.
    if (isTile) openModeSettingsPrompt(tileMode, !fromBack); // zurück zum Kategorie-Popup
    if (isMuscleGroup) openMuscleGroupColorPicker(muscleGroup, !fromBack); // zurück zum Swatch-Grid-Popup
  }
  document.getElementById('accentPickerCancel').onclick = cancel;
  document.getElementById('accentPickerSave').onclick = async () => {
    if (isMuscleGroup){
      if (!plan.muscleGroupColors) plan.muscleGroupColors = {};
      plan.muscleGroupColors[muscleGroup] = hsvToHex(h, s, v);
      await saveJSON('plan', plan);
      popOverlayStateIfOpen();
      removeOverlay();
      const swatchOverlay = document.getElementById('muscleGroupColorOverlay');
      if (swatchOverlay) swatchOverlay.remove();
      renderMuscleBalance();
      return;
    }
    if (isTile){
      if (!plan.modeSettings) plan.modeSettings = {};
      if (!plan.modeSettings[tileMode]) plan.modeSettings[tileMode] = {};
      plan.modeSettings[tileMode].tileColorId = 'custom';
      plan.modeSettings[tileMode].tileColorHex = hsvToHex(h, s, v);
      await saveJSON('plan', plan);
      // Kein popOverlayStateIfOpen(): dieser Picker hat für eine Kachelfarbe nie einen eigenen
      // History-Eintrag gepusht (siehe cancel() oben). Der noch offene Eintrag des
      // Kategorie-Popups wird stattdessen unten von openModeSettingsPrompt(..., true)
      // wiederverwendet.
      removeOverlay();
      // Das Kategorie-Popup dahinter wurde nie entfernt (nur überdeckt) — jetzt mit aufräumen,
      // sonst bliebe es unsichtbar im DOM hängen; danach frisch (mit der neuen Farbe) wieder
      // geöffnet statt komplett zur Kachel-Übersicht zu springen (gleiches Rücksprung-Muster
      // wie bei cancel() oben).
      const modeOverlay = document.getElementById('modeSettingsOverlay');
      if (modeOverlay) modeOverlay.remove();
      renderStartSelect();
      openModeSettingsPrompt(tileMode, true);
      return;
    }
    if (isFtBg){
      ftThemeOverride.bgColorId = 'custom';
      ftThemeOverride.bgCustomHex = hsvToHex(h, s, v);
      await ftSave('themeOverride', ftThemeOverride);
      ftApplyTheme();
      popOverlayStateIfOpen();
      removeOverlay();
      ftBgPickerOpen = true;
      ftOpenSettingsSheet();
      return;
    }
    if (isBg){
      plan.bgColorId = 'custom';
      plan.bgCustomHex = hsvToHex(h, s, v);
      await saveJSON('plan', plan);
      applyTheme();
      popOverlayStateIfOpen();
      removeOverlay();
      bgPickerOpen = true;
      renderSettings();
      return;
    }
    if (isFtAccent){
      ftThemeOverride.accentColorId = 'custom';
      ftThemeOverride.accentCustomHex = hsvToHex(h, s, v);
      await ftSave('themeOverride', ftThemeOverride);
      ftApplyTheme();
      popOverlayStateIfOpen();
      removeOverlay();
      ftAccentPickerOpen = true;
      ftOpenSettingsSheet();
      return;
    }
    plan.accentColorId = 'custom';
    plan.accentCustomHex = hsvToHex(h, s, v);
    await saveJSON('plan', plan);
    applyTheme();
    popOverlayStateIfOpen();
    removeOverlay();
    // Wurde dieser Picker NICHT von den echten Einstellungen aus geöffnet (z. B. vom
    // kompakten Akzentfarben-Popup auf der Startseite, siehe openQuickAppearancePrompt()),
    // ruft onGlobalSave() den passenden Rücksprung auf — sonst würde man nach dem Speichern
    // immer in den Einstellungen landen, egal woher man kam.
    if (onGlobalSave){
      onGlobalSave();
    } else {
      accentPickerOpen = true;
      renderSettings();
    }
  };
  overlay.onclick = (ev) => { if (ev.target === overlay) cancel(); };
}

// Verkabelt alle Swatches im Akzentfarben-Grid: normaler Tap wählt die Farbe (wie bisher),
// Long-Press auf einen FAVORITEN-Swatch (data-favorite="1", also über den Stern im
// Farbwähler-Popup hinzugefügte eigene Töne — die feste ACCENT_COLORS-Palette lässt sich
// nicht entfernen) fragt nach und entfernt ihn aus plan.favoriteAccentColors. Ein Long-Press,
// der als Entfernen gewertet wurde, unterdrückt den nachfolgenden Klick (wie beim
// History-Kontextmenü-Muster, siehe wireHistoryLongPress).
function wireAccentSwatchInteractions(){
  const LONG_PRESS_MS = 450;
  const MOVE_CANCEL_PX = 10;
  app.querySelectorAll('.accent-swatch[data-accent-id]').forEach(btn => {
    let pressTimer = null;
    let startX = 0, startY = 0, longPressFired = false;
    const cancel = () => { clearTimeout(pressTimer); pressTimer = null; };
    const isFavorite = btn.dataset.favorite === '1';

    btn.onclick = async () => {
      if (longPressFired){ longPressFired = false; return; }
      plan.accentColorId = btn.dataset.accentId;
      await saveJSON('plan', plan);
      applyTheme();
      accentPickerOpen = true; // Menü bleibt nach der Auswahl offen, statt sich zu schließen
      renderSettings();
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
        plan.favoriteAccentColors = favoriteAccentColors().filter(h => h !== btn.dataset.accentHex);
        // War genau dieser Favorit gerade aktiv ausgewählt, auf den Standard zurückfallen,
        // damit currentAccentColor() nicht auf eine nicht mehr existierende id zeigt.
        if (plan.accentColorId === btn.dataset.accentId) plan.accentColorId = ACCENT_COLORS[0].id;
        await saveJSON('plan', plan);
        applyTheme();
        accentPickerOpen = true;
        renderSettings();
      }, LONG_PRESS_MS);
    }, { passive: true });
    btn.addEventListener('touchmove', (ev) => {
      const t = ev.touches[0];
      if (Math.abs(t.clientX - startX) > MOVE_CANCEL_PX || Math.abs(t.clientY - startY) > MOVE_CANCEL_PX) cancel();
    }, { passive: true });
    btn.addEventListener('touchend', cancel);
    btn.addEventListener('touchcancel', cancel);
  });
}

// Verkabelt die Swatches im Hintergrundfarben-Grid — gleiches Muster wie
// wireAccentSwatchInteractions(), nur auf plan.bgColorId statt plan.accentColorId und mit
// zusätzlichem "Standard"-Swatch (data-bg-id="default", ohne data-bg-hex), der den eigenen
// Hintergrund wieder entfernt und zum normalen Hell-/Dunkelmodus-Standard zurückkehrt.
function wireBgSwatchInteractions(){
  const LONG_PRESS_MS = 450;
  const MOVE_CANCEL_PX = 10;
  app.querySelectorAll('.accent-swatch[data-bg-id]').forEach(btn => {
    let pressTimer = null;
    let startX = 0, startY = 0, longPressFired = false;
    const cancel = () => { clearTimeout(pressTimer); pressTimer = null; };
    const isFavorite = btn.dataset.favorite === '1';

    btn.onclick = async () => {
      if (longPressFired){ longPressFired = false; return; }
      plan.bgColorId = btn.dataset.bgId;
      await saveJSON('plan', plan);
      applyTheme();
      bgPickerOpen = true; // Menü bleibt nach der Auswahl offen, statt sich zu schließen
      renderSettings();
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
        plan.favoriteAccentColors = favoriteAccentColors().filter(h => h !== btn.dataset.bgHex);
        if (plan.bgColorId === btn.dataset.bgId) plan.bgColorId = 'default';
        await saveJSON('plan', plan);
        applyTheme();
        bgPickerOpen = true;
        renderSettings();
      }, LONG_PRESS_MS);
    }, { passive: true });
    btn.addEventListener('touchmove', (ev) => {
      const t = ev.touches[0];
      if (Math.abs(t.clientX - startX) > MOVE_CANCEL_PX || Math.abs(t.clientY - startY) > MOVE_CANCEL_PX) cancel();
    }, { passive: true });
    btn.addEventListener('touchend', cancel);
    btn.addEventListener('touchcancel', cancel);
  });
}

// Baut den Kopf + Körper eines aufklappbaren Einstellungs-Abschnitts (Akkordeon), im selben
// visuellen Stil wie das Muskelgruppen-Akkordeon im Übungen-Tab (.muscle-group-header /
// .muscle-group-body). "key" identifiziert den Abschnitt in settingsSectionOpen, "badge" ist
// ein optionaler kurzer Status-Text rechts neben dem Titel (z. B. "An"/"Aus").
function settingsAccordionSection(key, title, bodyHTML, badge){
  const isOpen = settingsSectionOpen.has(key);
  return `
    <div class="muscle-group" style="margin-top:10px;">
      <button class="muscle-group-header" data-settingsgroup="${key}" type="button">
        <span class="mg-name">${title}</span>
        <span class="mg-meta">${badge ? `<span>${badge}</span>` : ''}<span class="mg-arrow">${isOpen ? '▾' : '▸'}</span></span>
      </button>
      <div class="muscle-group-body" style="display:${isOpen ? 'block' : 'none'}">
        ${bodyHTML}
      </div>
    </div>
  `;
}

function renderSettings(){
  const perfModeOn = !!plan.performanceMode;
  const perfThreshold = Number.isInteger(plan.performanceThreshold) && plan.performanceThreshold >= 2 ? plan.performanceThreshold : 3;
  const perfPercentage = currentPerfPercentage();
  // RPE-Erfassung (siehe rpeEnabled() in 04-utils.js): Standardeinstellung ist AUS, da die
  // Eingabe pro Satz einen zusätzlichen Schritt bedeutet, den nicht jeder möchte. Wer sie
  // einschaltet, bekommt zusätzlich RPE-Felder in der aktiven Einheit UND eine RPE-bewusste
  // Performancemodus-Logik (siehe checkPerformanceSuggestion(), 11a-active-session.js).
  const rpeOn = rpeEnabled();
  const themeLabel = currentThemeMode() === 'light' ? 'Hell' : 'Dunkel';
  const darstellungBadge = `${themeLabel} · ${currentAccentColor().name}`;
  const numberModeLabels = { system: 'Normale Tastatur', wheel: 'Scroll-Rad', keypad: 'Ziffernblock', combo: 'Rad + Block' };
  const zahlBadge = numberModeLabels[numberInputMode()] || '';
  const homeOnTop = homeLayoutMode() !== 'historyFirst';
  const weekStripEnabled = isWeekStripEnabled();
  const foodTrackerEnabled = isFoodTrackerEnabled();
  const ringOn = restRingEnabled();
  // Globale Grundauswahl, welche Statistiken auf Übungsdetailseiten angezeigt werden (siehe
  // PROGRESS_STAT_LABELS/progressStatsHidden weiter oben) — pro Übungsart (Kraft/Zeit) eine
  // eigene Liste, kompaktes Checkbox-Zeilendesign (.stat-toggle-row) statt großer Toggle-Switches.
  function progressStatsSettingsRows(type){
    const ord = progressStatsOrder(type);
    const hidden = progressStatsHidden(type);
    const lbls = PROGRESS_STAT_LABELS[type];
    return ord.map(key => {
      const isVisible = !hidden.includes(key);
      return `
        <button class="stat-toggle-row ${isVisible ? 'checked' : ''}" data-progress-stat-toggle="${type}:${key}" type="button" role="switch" aria-checked="${isVisible}">
          <span class="stat-toggle-check">✓</span>
          <span>${lbls[key] || key}</span>
        </button>
      `;
    }).join('');
  }
  const progressStatsHiddenCount = progressStatsHidden('weight').length + progressStatsHidden('time').length;
  const progressStatsBadge = progressStatsHiddenCount ? `${progressStatsHiddenCount} ausgeblendet` : '';

  app.innerHTML = `
    <div class="back-row" style="margin-top:0;">
      <button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>

    <div class="section-label" style="margin-top:0;">Design</div>
    ${settingsAccordionSection('darstellung', 'Darstellung', `
      <div style="text-align:left; padding:14px 16px;">
        <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:10px;">Farbmodus</label>
        <div class="wizard-choice-list" style="margin-bottom:18px;">
          <button class="wizard-choice ${currentThemeMode() === 'dark' ? 'selected' : ''}" data-theme-mode="dark">Dunkel</button>
          <button class="wizard-choice ${currentThemeMode() === 'light' ? 'selected' : ''}" data-theme-mode="light">Hell</button>
        </div>
        <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:10px;">Akzentfarbe</label>
        <button class="muscle-group-header" id="accentPickerToggle" type="button" style="margin-bottom:${accentPickerOpen ? '12px' : '0'};">
          <span class="mg-name" style="display:flex; align-items:center; gap:10px; font-family:inherit; font-size:14px; letter-spacing:normal;">
            <span style="width:20px; height:20px; border-radius:7px; background:${currentAccentColor().hex}; display:inline-block; flex-shrink:0;"></span>
            ${currentAccentColor().name}
          </span>
          <span class="mg-meta"><span class="mg-arrow">${accentPickerOpen ? '▾' : '▸'}</span></span>
        </button>
        <div class="accent-swatch-grid" style="display:${accentPickerOpen ? 'grid' : 'none'};">
          ${allAccentSwatches().map(c => `
            <button class="accent-swatch ${currentAccentColor().id === c.id ? 'selected' : ''}" data-accent-id="${c.id}" data-accent-hex="${c.hex}" data-favorite="${c.isFavorite ? '1' : ''}" style="background:${c.hex};" aria-label="${c.name}"></button>
          `).join('')}
        </div>
        <button class="accent-custom-btn" id="accentCustomBtn" type="button" style="display:${accentPickerOpen ? 'flex' : 'none'};">
          <img class="accent-custom-btn-icon" src="${ICON_COLORWHEEL}" alt="">
          Eigene Farbe wählen
        </button>
        <label style="display:block; font-size:12px; color:var(--muted); margin:18px 0 10px;">Themes</label>
        <button class="muscle-group-header" id="bgPickerToggle" type="button" style="margin-bottom:${bgPickerOpen ? '12px' : '0'};">
          <span class="mg-name" style="display:flex; align-items:center; gap:10px; font-family:inherit; font-size:14px; letter-spacing:normal;">
            <span style="width:20px; height:20px; border-radius:7px; background:${currentBgColor() ? currentBgColor().hex : 'var(--bg)'}; border:1px solid var(--border); display:inline-block; flex-shrink:0;"></span>
            ${currentBgColor() ? currentBgColor().name : 'Standard'}
          </span>
          <span class="mg-meta"><span class="mg-arrow">${bgPickerOpen ? '▾' : '▸'}</span></span>
        </button>
        <div class="accent-swatch-grid" style="display:${bgPickerOpen ? 'grid' : 'none'};">
          <button class="accent-swatch ${!currentBgColor() ? 'selected' : ''}" data-bg-id="default" style="background:var(--surface-2); border:1px dashed var(--border); display:flex; align-items:center; justify-content:center; font-size:15px; color:var(--muted);" aria-label="Standard">✕</button>
          ${bgSwatchesForCurrentMode().map(c => `
            <button class="accent-swatch ${currentBgColor() && currentBgColor().id === c.id ? 'selected' : ''}" data-bg-id="${c.id}" data-bg-hex="${c.hex}" data-favorite="${c.isFavorite ? '1' : ''}" style="background:${c.hex}; ${c.isFavorite ? '' : 'border:1px solid var(--border);'}" aria-label="${c.name}"></button>
          `).join('')}
        </div>
        <button class="accent-custom-btn" id="bgCustomBtn" type="button" style="display:${bgPickerOpen ? 'flex' : 'none'};">
          <img class="accent-custom-btn-icon" src="${ICON_COLORWHEEL}" alt="">
          Eigene Farbe wählen
        </button>
        <label style="display:block; font-size:12px; color:var(--muted); margin:18px 0 8px;">Textfarbe auf Akzentfarbe</label>
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:11px; color:var(--muted); white-space:nowrap;">Dunkler Text</span>
          <input type="range" id="accentContrastSlider" min="0" max="1" step="0.01" value="${currentAccentContrastThreshold()}" style="flex:1; accent-color: var(--accent);">
          <span style="font-size:11px; color:var(--muted); white-space:nowrap;">Weißer Text</span>
        </div>
      </div>
    `, darstellungBadge)}

    ${settingsAccordionSection('schriftart', 'Schriftart', `
      <div style="text-align:left; padding:14px 16px;">
        <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:10px;">App-Schriftart</label>
        <button class="muscle-group-header" id="fontPickerBtn" type="button">
          <span class="mg-name" style="font-family:${currentFontOption().family}; font-size:16px; letter-spacing:normal; text-transform:none;">${currentFontOption().name}</span>
          <span class="mg-meta"><span class="mg-arrow">▸</span></span>
        </button>
        <label style="display:block; font-size:12px; color:var(--muted); margin:18px 0 10px;">Eigene Schriftarten</label>
        <button class="muscle-group-header" id="customFontsToggle" type="button" style="margin-bottom:${customFontsListOpen ? '12px' : '0'};">
          <span class="mg-name" style="font-family:inherit; font-size:14px; letter-spacing:normal; text-transform:none;">${customFonts.length ? `${customFonts.length} hochgeladen` : 'Noch keine hochgeladen'}</span>
          <span class="mg-meta"><span class="mg-arrow">${customFontsListOpen ? '▾' : '▸'}</span></span>
        </button>
        <div style="display:${customFontsListOpen ? 'block' : 'none'};">
          ${customFonts.map(f => `
            <div class="muscle-group-header settings-static-row" style="margin-top:8px;">
              <span class="mg-name font-preview-item" style="font-family:'${f.cssName}', sans-serif; font-size:15px; letter-spacing:normal; text-transform:none;">${f.name}</span>
              <button class="icon-x" data-remove-custom-font="${f.id}" aria-label="${f.name} löschen">✕</button>
            </div>
          `).join('')}
          <button class="accent-custom-btn" id="fontUploadBtn" type="button" style="margin-top:10px; justify-content:center;">
            Eigene Schriftart hochladen
          </button>
          <input type="file" id="fontUploadInput" accept=".ttf,.otf,.woff,.woff2" multiple style="display:none;">
        </div>
      </div>
    `, currentFontOption().id === 'default' ? '' : currentFontOption().name)}

    <div class="muscle-group-header settings-static-row" style="margin-top:10px;">
      <span class="mg-name">Fortschrittsring um Timer</span>
      <button class="toggle-switch ${ringOn ? 'on' : ''}" id="restRingToggle" type="button" role="switch" aria-checked="${ringOn}" aria-label="Fortschrittsring um Timer">
        <span class="toggle-knob"></span>
      </button>
    </div>

    <div class="muscle-group-header settings-static-row" style="margin-top:10px;">
      <span class="mg-name">Training oben anzeigen</span>
      <button class="toggle-switch ${homeOnTop ? 'on' : ''}" id="homeLayoutToggle" type="button" role="switch" aria-checked="${homeOnTop}" aria-label="Training oben anzeigen">
        <span class="toggle-knob"></span>
      </button>
    </div>

    <div class="section-label">Allgemein</div>
    ${settingsAccordionSection('zahleneingabe', 'Zahleneingabe', `
      <div style="text-align:left; padding:14px 16px;">
        <div class="wizard-choice-list">
          <button class="wizard-choice ${numberInputMode() === 'system' ? 'selected' : ''}" data-mode="system">Normale Tastatur</button>
          <button class="wizard-choice ${numberInputMode() === 'wheel' ? 'selected' : ''}" data-mode="wheel">Scroll-Rad</button>
          <button class="wizard-choice ${numberInputMode() === 'keypad' ? 'selected' : ''}" data-mode="keypad">Ziffernblock</button>
          <button class="wizard-choice ${numberInputMode() === 'combo' ? 'selected' : ''}" data-mode="combo">Scroll-Rad + Ziffernblock</button>
        </div>
      </div>
    `, zahlBadge)}

    <div class="muscle-group-header settings-static-row" style="margin-top:10px;">
      <span class="mg-name">Kalender</span>
      <button class="toggle-switch ${weekStripEnabled ? 'on' : ''}" id="weekStripToggle" type="button" role="switch" aria-checked="${weekStripEnabled}" aria-label="Kalender">
        <span class="toggle-knob"></span>
      </button>
    </div>

    <div class="muscle-group-header settings-static-row" style="margin-top:10px;">
      <span class="mg-name">Essenstracker</span>
      <button class="toggle-switch ${foodTrackerEnabled ? 'on' : ''}" id="foodTrackerToggle" type="button" role="switch" aria-checked="${foodTrackerEnabled}" aria-label="Essenstracker">
        <span class="toggle-knob"></span>
      </button>
    </div>

    ${settingsAccordionSection('progressStats', 'Statistiken', `
      <div style="text-align:left; padding:14px 16px;">
        <div class="section-label" style="margin:0 0 4px;">Kraft-/Gewichtsübungen</div>
        ${progressStatsSettingsRows('weight')}
        <div class="section-label" style="margin:16px 0 4px;">Zeit-Übungen</div>
        ${progressStatsSettingsRows('time')}
      </div>
    `, progressStatsBadge)}

    <div class="section-label">Training</div>
    ${settingsAccordionSection('split', 'Trainings-Split', `
      <div style="text-align:left; padding:14px 16px;">
        <label class="justify-text" style="display:block; font-size:12px; color:var(--muted); margin-bottom:10px;">
          Markiert auf der Startseite automatisch das nächste fällige A/B, basierend auf deinem zuletzt absolvierten Training. Bei „Push / Pull / Legs" müssen entsprechend benannte Kacheln existieren (lang gedrückt halten zum Umbenennen oder als neue Kategorie anlegen).
        </label>
        <div class="wizard-choice-list">
          <button class="wizard-choice ${!plan.splitMode ? 'selected' : ''}" data-split-mode="">Aus</button>
          <button class="wizard-choice ${plan.splitMode === 'okuk' ? 'selected' : ''}" data-split-mode="okuk">Oberkörper / Unterkörper</button>
          <button class="wizard-choice ${plan.splitMode === 'ppl' ? 'selected' : ''}" data-split-mode="ppl">Push / Pull / Legs</button>
          <button class="wizard-choice ${plan.splitMode === 'gkgk' ? 'selected' : ''}" data-split-mode="gkgk">Ganzkörper</button>
        </div>
      </div>
    `, plan.splitMode ? SPLIT_MODE_LABELS[plan.splitMode] : 'Aus')}

    <div class="muscle-group" style="margin-top:10px;">
      <div class="muscle-group-header settings-static-row">
        <span class="mg-name">Performancemodus</span>
        <button class="toggle-switch ${perfModeOn ? 'on' : ''}" id="perfModeToggle" type="button" role="switch" aria-checked="${perfModeOn}" aria-label="Performancemodus">
          <span class="toggle-knob"></span>
        </button>
      </div>
      <div class="muscle-group-body" style="display:${perfModeOn ? 'block' : 'none'}">
        <div style="padding:14px 16px 14px; text-align:left; font-size:14px; line-height:1.6;">
          Bei Kardio-Übungen: Steigerung vorschlagen ab <input type="number" inputmode="numeric" min="2" max="20" step="1" class="inline-plain-input" id="perfThresholdInput" enterkeyhint="done" value="${perfThreshold}"> mal gleicher Dauer.
        </div>
        <div style="padding:0 16px 14px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <input type="range" id="perfPercentageSlider" min="10" max="100" step="10" value="${perfPercentage}" style="flex:1; accent-color: var(--accent);">
            <span style="font-size:13px; color:var(--text); min-width:38px; text-align:right;" id="perfPercentageValue">${perfPercentage}%</span>
          </div>
        </div>
      </div>
    </div>

    <div class="muscle-group-header settings-static-row" style="margin-top:10px;">
      <span class="mg-name">RPE-Erfassung</span>
      <button class="toggle-switch ${rpeOn ? 'on' : ''}" id="rpeToggle" type="button" role="switch" aria-checked="${rpeOn}" aria-label="RPE-Erfassung pro Satz">
        <span class="toggle-knob"></span>
      </button>
    </div>

    <div class="muscle-group-header settings-static-row" style="margin-top:10px;">
      <span class="mg-name">Trainingstools</span>
      <button class="toggle-switch ${plan.trainingToolsEnabled === true ? 'on' : ''}" id="trainingToolsToggle" type="button" role="switch" aria-checked="${plan.trainingToolsEnabled === true}" aria-label="Trainingstools im Training anzeigen">
        <span class="toggle-knob"></span>
      </button>
    </div>

    <div class="muscle-group-header settings-static-row" style="margin-top:10px;">
      <span class="mg-name">Bildschirm anlassen</span>
      <button class="toggle-switch ${plan.wakeLockEnabled === true ? 'on' : ''}" id="wakeLockToggle" type="button" role="switch" aria-checked="${plan.wakeLockEnabled === true}" aria-label="Bildschirm während des Trainings anlassen">
        <span class="toggle-knob"></span>
      </button>
    </div>

    <div class="muscle-group-header settings-static-row" style="margin-top:10px;">
      <span class="mg-name">Trainingsbenachrichtigung</span>
      <button class="toggle-switch ${trainingNotificationEnabled() ? 'on' : ''}" id="trainingNotificationToggle" type="button" role="switch" aria-checked="${trainingNotificationEnabled()}" aria-label="Benachrichtigung mit aktueller Übung anzeigen">
        <span class="toggle-knob"></span>
      </button>
    </div>

    <div class="muscle-group-header settings-static-row" style="margin-top:10px;">
      <span class="mg-name">Geschätzter Kalorienverbrauch</span>
      <button class="toggle-switch ${kcalEstimateEnabled() ? 'on' : ''}" id="kcalEstimateToggle" type="button" role="switch" aria-checked="${kcalEstimateEnabled()}" aria-label="Geschätzten Kalorienverbrauch anzeigen">
        <span class="toggle-knob"></span>
      </button>
    </div>

    <div class="muscle-group-header settings-static-row" style="margin-top:10px;">
      <span class="mg-name">Stangengewicht</span>
      <input type="text" inputmode="decimal" class="settings-row-input" id="barWeightSettingsInput" enterkeyhint="done" placeholder="kg" value="${formatGermanNumber(barWeightKg())}">
    </div>

    <div class="section-label">Körperdaten</div>
    <div class="muscle-group-header settings-static-row" style="margin-top:0;">
      <span class="mg-name">Körpergewicht</span>
      <div class="settings-row-btns">
        <button class="progress-stat-editbtn" id="btnBodyWeightHistory" type="button" aria-label="Verlauf" style="margin:0; width:36px; height:36px;"><img src="${ICON_HISTORY}" alt=""></button>
        <input type="text" inputmode="decimal" class="settings-row-input" id="bodyWeightInput" enterkeyhint="done" placeholder="kg" value="${formatGermanNumber(plan.bodyWeight)}">
      </div>
    </div>
    <div class="muscle-group-header settings-static-row" style="margin-top:10px;">
      <span class="mg-name">Körpergröße</span>
      <input type="text" inputmode="decimal" class="settings-row-input" id="bodyHeightInput" enterkeyhint="done" placeholder="cm" value="${plan.bodyHeightCm != null ? formatGermanNumber(plan.bodyHeightCm) : ''}">
    </div>
    <div style="margin-top:14px; text-align:left;">
      <span class="mg-name" style="display:block; margin-bottom:8px;">Geschlecht</span>
      <div class="period-row" style="margin:0;">
        <button class="period-btn ${plan.bodySex === 'male' ? 'active' : ''}" data-body-sex="male">Männlich</button>
        <button class="period-btn ${plan.bodySex === 'female' ? 'active' : ''}" data-body-sex="female">Weiblich</button>
        <button class="period-btn ${!plan.bodySex ? 'active' : ''}" data-body-sex="">Keine Angabe</button>
      </div>
    </div>

    <div class="section-label">Daten</div>
    <div class="muscle-group-header settings-static-row" style="margin-top:0;">
      <div class="settings-row-btns" style="width:100%;">
        <button class="btn btn-ghost btn-small" id="btnExport" style="flex:1;">Exportieren</button>
        <button class="btn btn-ghost btn-small" id="btnImport" style="flex:1;">Importieren</button>
      </div>
    </div>
    <input type="file" id="importFile" accept="application/json" style="display:none;">

    <button class="btn btn-danger settings-reset-btn" id="btnReset" style="margin-top:10px;">App zurücksetzen</button>

    <!-- Diagnose-Stempel: zeigt, welche Code-Version wirklich läuft. Bei einer PWA mit
         Cache-First-Service-Worker (sw.js) ist sonst nicht erkennbar, ob ein neues Build
         schon aktiv ist oder noch die alte Fassung aus dem Cache bedient wird — genau das
         hat bei der Fehlersuche zur unteren Navigationsleiste Zeit gekostet. BUILD_STAMP
         wird bei jeder Änderung mit erhöht, zusammen mit CACHE_NAME in sw.js. -->
    <div style="margin-top:18px; text-align:center; color:var(--muted); font-size:11px;">
      Build ${BUILD_STAMP}
    </div>
  `;

  document.getElementById('btnBack').onclick = () => history.back();
  app.querySelectorAll('[data-settingsgroup]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.settingsgroup;
      if (settingsSectionOpen.has(key)) settingsSectionOpen.delete(key); else settingsSectionOpen.add(key);
      renderSettings();
    };
  });
  app.querySelectorAll('[data-progress-stat-toggle]').forEach(btn => {
    btn.onclick = async () => {
      const [type, key] = btn.dataset.progressStatToggle.split(':');
      const willBeOn = !btn.classList.contains('checked');
      const current = progressStatsHidden(type);
      const newHidden = willBeOn ? current.filter(k => k !== key) : [...current, key];
      await setProgressStatsHidden(type, newHidden);
      renderSettings();
    };
  });
  app.querySelectorAll('[data-theme-mode]').forEach(btn => {
    btn.onclick = async () => {
      const mode = btn.dataset.themeMode;
      plan.themeMode = mode;
      // Eine eigene Hintergrundfarbe, die zum neuen Modus nicht passt, wird verworfen: Sonst
      // blieb die App nach dem Wechsel auf "Hell" faktisch dunkel, weil die übersteuerte
      // Hintergrundfarbe den Modus-Standard weiterhin überschrieb — Text und Rahmen kamen aber
      // aus dem Hellmodus. Der Modus gewinnt also gegen eine unpassende Farbwahl; eine bereits
      // passende eigene Farbe (z.B. Warmweiß beim Wechsel Hell→Hell-Variante) bleibt erhalten.
      const bg = currentBgColor();
      if (bg && !bgFitsThemeMode(bg.hex, mode)){
        plan.bgColorId = 'default';
        delete plan.bgCustomHex;
      }
      await saveJSON('plan', plan);
      applyTheme();
      renderSettings();
    };
  });
  app.querySelectorAll('[data-split-mode]').forEach(btn => {
    btn.onclick = async () => {
      plan.splitMode = btn.dataset.splitMode || null;
      await saveJSON('plan', plan);
      renderSettings();
    };
  });
  const accentPickerToggleEl = document.getElementById('accentPickerToggle');
  if (accentPickerToggleEl) accentPickerToggleEl.onclick = (ev) => {
    ev.stopPropagation();
    accentPickerOpen = !accentPickerOpen;
    renderSettings();
  };

  // Schriftart-Picker (Design → Schriftart): eigenes Popup mit Suchfeld + scrollbarer Liste
  // statt des generischen Scroll-Rads, siehe openFontPickerSheet().
  const fontPickerBtnEl = document.getElementById('fontPickerBtn');
  if (fontPickerBtnEl) fontPickerBtnEl.onclick = () => openFontPickerSheet();
  const customFontsToggleEl = document.getElementById('customFontsToggle');
  if (customFontsToggleEl) customFontsToggleEl.onclick = (ev) => {
    ev.stopPropagation();
    customFontsListOpen = !customFontsListOpen;
    renderSettings();
  };
  const fontUploadBtnEl = document.getElementById('fontUploadBtn');
  const fontUploadInputEl = document.getElementById('fontUploadInput');
  if (fontUploadBtnEl && fontUploadInputEl) fontUploadBtnEl.onclick = () => fontUploadInputEl.click();
  if (fontUploadInputEl) fontUploadInputEl.onchange = async () => {
    const files = Array.from(fontUploadInputEl.files || []);
    if (!files.length) return;
    const FORMAT_BY_EXT = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' };
    for (const file of files){
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const formatHint = FORMAT_BY_EXT[ext];
      if (!formatHint){
        alert(`"${file.name}" wird nicht unterstützt — erlaubt sind .ttf, .otf, .woff und .woff2.`);
        continue;
      }
      // Datei als Base64-Data-URL einlesen, damit sie komplett offline funktioniert (kein
      // separater Datei-Server nötig) — siehe registerCustomFontFaces().
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      }).catch(() => null);
      if (!dataUrl) continue;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const displayName = (file.name.replace(/\.[^.]+$/, '') || 'Eigene Schrift').slice(0, 40);
      const entry = { id, name: displayName, cssName: `CustomFont-${id}`, dataUrl, formatHint };
      customFonts.push(entry);
      registerCustomFontFaces();
    }
    await saveJSON('customFonts', customFonts);
    fontUploadInputEl.value = '';
    customFontsListOpen = true;
    renderSettings();
  };
  app.querySelectorAll('[data-remove-custom-font]').forEach(btn => {
    btn.onclick = async (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.removeCustomFont;
      customFonts = customFonts.filter(f => f.id !== id);
      await saveJSON('customFonts', customFonts);
      // War die gelöschte Schrift gerade aktiv, zurück auf die App-Standardschrift springen,
      // statt auf eine jetzt nicht mehr existierende id zu verweisen.
      if (plan.fontId === `custom:${id}`){
        plan.fontId = 'default';
        await saveJSON('plan', plan);
        applyTheme();
      }
      renderSettings();
    };
  });

  wireAccentSwatchInteractions();
  const accentCustomBtn = document.getElementById('accentCustomBtn');
  if (accentCustomBtn) accentCustomBtn.onclick = (ev) => { ev.stopPropagation(); openAccentColorPickerPrompt(); };
  const bgPickerToggleEl = document.getElementById('bgPickerToggle');
  if (bgPickerToggleEl) bgPickerToggleEl.onclick = (ev) => {
    ev.stopPropagation();
    bgPickerOpen = !bgPickerOpen;
    renderSettings();
  };
  wireBgSwatchInteractions();
  const bgCustomBtn = document.getElementById('bgCustomBtn');
  if (bgCustomBtn) bgCustomBtn.onclick = (ev) => { ev.stopPropagation(); openAccentColorPickerPrompt(null, null, null, true); };
  const accentContrastSlider = document.getElementById('accentContrastSlider');
  if (accentContrastSlider){
    accentContrastSlider.oninput = () => {
      plan.accentContrastThreshold = parseFloat(accentContrastSlider.value);
      applyTheme(); // sofortige Vorschau, während gezogen wird
    };
    accentContrastSlider.onchange = async () => {
      plan.accentContrastThreshold = parseFloat(accentContrastSlider.value);
      await saveJSON('plan', plan);
    };
  }
  app.querySelectorAll('[data-mode]').forEach(btn => {
    btn.onclick = async () => {
      plan.numberInputMode = btn.dataset.mode;
      await saveJSON('plan', plan);
      renderSettings();
    };
  });

  document.getElementById('homeLayoutToggle').onclick = async () => {
    plan.homeLayoutMode = homeOnTop ? 'historyFirst' : 'default';
    await saveJSON('plan', plan);
    renderSettings();
  };

  document.getElementById('weekStripToggle').onclick = async () => {
    plan.weekStripEnabled = !weekStripEnabled;
    await saveJSON('plan', plan);
    renderSettings();
  };

  document.getElementById('foodTrackerToggle').onclick = async () => {
    plan.foodTrackerEnabled = !foodTrackerEnabled;
    await saveJSON('plan', plan);
    renderSettings();
  };

  const wakeLockToggleEl = document.getElementById('wakeLockToggle');
  if (wakeLockToggleEl) wakeLockToggleEl.onclick = async () => {
    const willBeOn = plan.wakeLockEnabled !== true;
    plan.wakeLockEnabled = willBeOn;
    // Direkt reagieren, falls gerade ein Training läuft: sofort anfordern bzw.
    // freigeben, statt erst beim nächsten Trainingsstart wirksam zu werden.
    if (active){
      if (willBeOn) requestTrainingWakeLock();
      else releaseTrainingWakeLock();
    }
    await saveJSON('plan', plan);
    renderSettings();
  };

  const trainingNotificationToggleEl = document.getElementById('trainingNotificationToggle');
  if (trainingNotificationToggleEl) trainingNotificationToggleEl.onclick = async () => {
    const wasEnabled = trainingNotificationEnabled(); // Standard AN (undefined zählt als an)
    plan.trainingNotificationEnabled = !wasEnabled;
    // Direkt reagieren, falls gerade ein Training läuft: beim Ausschalten die gerade
    // angezeigte Benachrichtigung sofort entfernen, beim Einschalten sofort neu setzen —
    // sonst würde die Änderung erst beim nächsten Trainingsstart wirksam.
    if (active){
      if (plan.trainingNotificationEnabled) syncActiveTrainingNotification(true);
      else clearActiveTrainingNotification();
    }
    await saveJSON('plan', plan);
    renderSettings();
  };

  const kcalEstimateToggleEl = document.getElementById('kcalEstimateToggle');
  if (kcalEstimateToggleEl) kcalEstimateToggleEl.onclick = async () => {
    const wasEnabled = kcalEstimateEnabled(); // Standard AUS (undefined zählt als aus)
    plan.kcalEstimateEnabled = !wasEnabled;
    await saveJSON('plan', plan);
    renderSettings();
  };

  const trainingToolsToggleEl = document.getElementById('trainingToolsToggle');
  if (trainingToolsToggleEl) trainingToolsToggleEl.onclick = async () => {
    const willBeOn = plan.trainingToolsEnabled !== true;
    plan.trainingToolsEnabled = willBeOn;
    if (!willBeOn){
      // Beim Ausblenden der Trainingstools auch alle darüber eingestellten,
      // sonst unsichtbar im Hintergrund weiterlaufenden Effekte zurücksetzen — allen
      // voran den Standard-Pausetimer (plan.defaultRestSeconds), der sonst weiterhin
      // nach jedem abgehakten Satz automatisch eine Pause starten würde, obwohl das
      // zugehörige Einstell-Popup (Zahnrad im Training) gar nicht mehr erreichbar ist.
      plan.defaultRestSeconds = null;
    }
    await saveJSON('plan', plan);
    renderSettings();
  };

  const barWeightSettingsInputEl = document.getElementById('barWeightSettingsInput');
  if (barWeightSettingsInputEl){
    const saveBarWeightSettings = async () => {
      const val = parseGermanNumber(barWeightSettingsInputEl.value);
      plan.barWeightKg = (barWeightSettingsInputEl.value && !isNaN(val) && val >= 0) ? val : BAR_WEIGHT_KG_DEFAULT;
      await saveJSON('plan', plan);
      barWeightSettingsInputEl.value = formatGermanNumber(barWeightKg());
    };
    barWeightSettingsInputEl.onkeydown = (ev) => {
      if (ev.key === 'Enter'){ ev.preventDefault(); barWeightSettingsInputEl.blur(); }
    };
    barWeightSettingsInputEl.onchange = saveBarWeightSettings;
  }


  const bodyWeightHistoryBtnEl = document.getElementById('btnBodyWeightHistory');
  if (bodyWeightHistoryBtnEl) bodyWeightHistoryBtnEl.onclick = () => goBodyWeightChart();

  const bodyWeightInputEl = document.getElementById('bodyWeightInput');
  if (bodyWeightInputEl){
    bodyWeightInputEl.onkeydown = (ev) => {
      if (ev.key === 'Enter'){
        ev.preventDefault();
        bodyWeightInputEl.blur(); // löst onchange aus und schließt die virtuelle Tastatur
      }
    };
    bodyWeightInputEl.onchange = async (e) => {
      const v = e.target.value === '' ? null : parseGermanNumber(e.target.value);
      // Ein geleertes Feld setzt nur den aktuellen Stand zurück (wie bisher) — der bereits
      // erfasste Verlauf (plan.bodyWeightLog) bleibt dabei unangetastet, da ein Leeren des
      // Feldes kein "ich hatte nie ein Gewicht" bedeutet, sondern nur "aktuell unbekannt".
      if (v === null || isNaN(v)) plan.bodyWeight = null;
      else logBodyWeight(v);
      await saveJSON('plan', plan);
    };
  }

  const bodyHeightInputEl = document.getElementById('bodyHeightInput');
  if (bodyHeightInputEl){
    bodyHeightInputEl.onkeydown = (ev) => {
      if (ev.key === 'Enter'){
        ev.preventDefault();
        bodyHeightInputEl.blur();
      }
    };
    bodyHeightInputEl.onchange = async (e) => {
      const v = e.target.value === '' ? null : parseGermanNumber(e.target.value);
      plan.bodyHeightCm = (v === null || isNaN(v)) ? null : v;
      await saveJSON('plan', plan);
    };
  }
  app.querySelectorAll('[data-body-sex]').forEach(btn => {
    btn.onclick = async () => {
      plan.bodySex = btn.dataset.bodySex || null;
      await saveJSON('plan', plan);
      renderSettings();
    };
  });

  const perfModeToggleEl = document.getElementById('perfModeToggle');
  if (perfModeToggleEl) perfModeToggleEl.onclick = async () => {
    plan.performanceMode = !plan.performanceMode;
    await saveJSON('plan', plan);
    renderSettings();
  };

  const rpeToggleEl = document.getElementById('rpeToggle');
  if (rpeToggleEl) rpeToggleEl.onclick = async () => {
    plan.rpeEnabled = !rpeEnabled();
    await saveJSON('plan', plan);
    renderSettings();
  };

  const perfThresholdInputEl = document.getElementById('perfThresholdInput');
  if (perfThresholdInputEl){
    perfThresholdInputEl.onkeydown = (ev) => {
      if (ev.key === 'Enter'){ ev.preventDefault(); perfThresholdInputEl.blur(); }
    };
    perfThresholdInputEl.onchange = async (e) => {
      let v = parseInt(e.target.value, 10);
      if (!Number.isFinite(v) || v < 2) v = 2;
      if (v > 20) v = 20;
      plan.performanceThreshold = v;
      await saveJSON('plan', plan);
      renderSettings();
    };
  }

  const perfPercentageSliderEl = document.getElementById('perfPercentageSlider');
  if (perfPercentageSliderEl){
    const perfPercentageValueEl = document.getElementById('perfPercentageValue');
    perfPercentageSliderEl.oninput = () => {
      // Auf 10er-Schritte einrasten (step=10 im Markup übernimmt das meistens schon selbst,
      // hier zusätzlich als Sicherheitsnetz) und die Prozentanzeige live mitziehen.
      const snapped = Math.round(parseInt(perfPercentageSliderEl.value, 10) / 10) * 10;
      perfPercentageSliderEl.value = snapped;
      if (perfPercentageValueEl) perfPercentageValueEl.textContent = snapped + '%';
    };
    perfPercentageSliderEl.onchange = async () => {
      const snapped = Math.round(parseInt(perfPercentageSliderEl.value, 10) / 10) * 10;
      plan.performancePercentage = snapped;
      await saveJSON('plan', plan);
    };
  }

  const restRingToggleEl = document.getElementById('restRingToggle');
  if (restRingToggleEl) restRingToggleEl.onclick = async () => {
    plan.showRestRing = !ringOn;
    await saveJSON('plan', plan);
    renderSettings();
  };

  const btnExportEl = document.getElementById('btnExport');
  if (btnExportEl) btnExportEl.onclick = async () => {
    // Essenstracker-Daten müssen geladen sein, BEVOR das Backup gebaut wird — initFoodTracker()
    // ist idempotent, falls der Essenstracker in dieser Sitzung schon offen war, lädt es nichts
    // erneut nach. Das gemeinsame Backup enthält jetzt auch die Ernährungsdaten (siehe
    // ftBuildExportPayload(), 15-food-tracker.js) — ein Export deckt beides ab, statt dass man
    // Training und Essenstracker separat sichern muss. Der eigenständige Essenstracker-Export
    // in dessen eigenen Einstellungen bleibt zusätzlich bestehen, falls nur die Ernährungsdaten
    // gebraucht werden.
    await initFoodTracker();
    const nowISO = new Date().toISOString();
    const payload = { version: 1, exportedAt: nowISO, plan, sessions, lastPerformance, food: ftBuildExportPayload() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trainingsplan-export-${nowISO.slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    // Zeitpunkt merken für die Backup-Erinnerung auf der Startseite (siehe renderHome(),
    // BACKUP_REMINDER_DAYS) — ein Download-Klick ist kein hundertprozentiger Beweis, dass die
    // Datei auch tatsächlich irgendwo gesichert wurde, aber der beste verfügbare Anhaltspunkt.
    lastExportAt = nowISO;
    await saveJSON('lastExportAt', lastExportAt);
  };
  document.getElementById('btnImport').onclick = () => {
    document.getElementById('importFile').click();
  };
  document.getElementById('importFile').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try{
        const data = JSON.parse(reader.result);
        const check = validateFullExportPayload(data);
        if (!check.valid){
          alert('Diese Datei sieht nicht wie ein gültiger Export dieser App aus:\n\n' + check.errors.join('\n'));
          return;
        }
        let warnMsg = 'Import überschreibt deine aktuellen Übungen, Einheiten und den gespeicherten Fortschritt auf diesem Gerät.';
        if (check.cleaned.food) warnMsg += ' Enthält die Datei auch Essenstracker-Daten, werden diese ebenfalls überschrieben.';
        if (check.droppedExercises > 0 || check.droppedSessions > 0){
          warnMsg += '\n\nHinweis: ' +
            (check.droppedExercises > 0 ? `${check.droppedExercises} Übung(en) ` : '') +
            (check.droppedExercises > 0 && check.droppedSessions > 0 ? 'und ' : '') +
            (check.droppedSessions > 0 ? `${check.droppedSessions} Trainingseinheit(en) ` : '') +
            'in der Datei waren unvollständig und werden übersprungen.';
        }
        warnMsg += '\n\nFortfahren?';
        if (!confirm(warnMsg)) return;
        plan = check.cleaned.plan;
        sessions = check.cleaned.sessions;
        lastPerformance = check.cleaned.lastPerformance;
        await saveJSON('plan', plan);
        await saveAllSessionsBulk(sessions);
        await saveJSON('lastPerformance', lastPerformance);
        // Essenstracker-Daten nur übernehmen, wenn die Datei welche enthält (gemeinsames
        // Backup, siehe ftBuildExportPayload()/ftApplyImportedData(), 15-food-tracker.js) —
        // ein reiner Trainings-Export (oder ein Export von vor der Zusammenlegung) hat kein
        // "food"-Feld, dann bleiben die vorhandenen Essenstracker-Daten auf diesem Gerät
        // unangetastet.
        if (check.cleaned.food) await ftApplyImportedData(check.cleaned.food);
        planSearchQuery = '';
        planGroupOpen = new Set();
        alert('Import erfolgreich.');
        renderSettings();
      }catch(err){
        alert('Datei konnte nicht gelesen werden: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  document.getElementById('btnReset').onclick = () => {
    openResetConfirmPrompt(async () => {
      clearInterval(timerHandle);
      clearInterval(restInterval);
      restState = null;
      active = null;
      releaseTrainingWakeLock();
      clearActiveTrainingNotification(); // App-Reset ruft persistActiveSession() nicht auf
      plan = JSON.parse(JSON.stringify(DEFAULT_PLAN));
      sessions = [];
      lastPerformance = {};
      lastExportAt = null;
      planSearchQuery = '';
      planGroupOpen = new Set();
      await saveJSON('plan', plan);
      await saveAllSessionsBulk(sessions);
      await saveJSON('lastPerformance', lastPerformance);
      await deleteJSON('lastExportAt');
      await saveJSON('activeSession', null);
      // Ohne diesen Aufruf blieben --accent/Hell-Dunkel-Klasse auf dem alten, vor dem Reset
      // gewählten Stand stehen — die Einstellungen zeigten zwar korrekt "Dunkel"/"Gelb" als
      // ausgewählt an (da currentThemeMode()/currentAccentColor() ja brav auf die neuen
      // DEFAULT_PLAN-Werte zurückfallen), aber erst ein erneuter Klick auf einen Swatch hätte
      // das auch tatsächlich sichtbar gemacht.
      applyTheme();
      alert('App wurde zurückgesetzt.');
      // Als eigene, neu eingereihte Aufgabe geplant (statt direkt aufgerufen): das Schließen
      // des Code-Bestätigungs-Popups vorhin hat bereits ein history.back() ausgelöst, dessen
      // "popstate"-Event noch aussteht und sonst — je nach Timing — NACH diesem Sprung zum
      // Startbildschirm feuern und die Einstellungen wieder obenauf rendern könnte. So läuft
      // dieser Sprung garantiert als letztes.
      setTimeout(() => {
        replaceView('home');
        renderHome();
      }, 0);
    });
  };
}

// Zeigt ein Popup-Formular zum Anlegen einer komplett neuen Übung — mit denselben Feldern
// wie eine bestehende Zeile im Übungen-Editor (renderExerciseRowHTML(), auf ein temporäres
// Draft-Objekt angewendet). Beim Speichern wird die fertig ausgefüllte Übung direkt in
// plan.exercises eingefügt und gespeichert; die Muskelgruppen-Zuordnung (ex.muscleGroup) ist
// dabei die einzige Stelle, die die Einsortierung in Fortschritt/Frei-Auswahl/Modus-Editor
// steuert (siehe Abschnitt 14 der Trainingsdoku) — kein zusätzlicher Schritt nötig, die
// Übung erscheint danach automatisch überall an der richtigen Stelle.
// Führt beim Anlegen einer neuen Übung nach und nach durch die wichtigsten Fragen statt
// alles auf einmal in einem langen Formular zu zeigen — bewusst weggelassen werden dabei
// Felder, die ohnehin auf sinnvollen Standardwerten bleiben (3 Sätze, 8-12 Wdh, 0 kg
// Startgewicht) oder die automatisch aus anderen Antworten abgeleitet werden (Push/Pull/
// Legs aus der Muskelgruppe, siehe MUSCLE_GROUP_TO_BODYPART; "Muskeln Detail" bleibt leer
// und mainMuscle fällt beim Speichern auf die Muskelgruppe zurück — exakt wie im alten
// Einzelformular). Das Bild ist der letzte Schritt und lässt sich überspringen ("Später"),
// die Übung wird dann ohne Bild gespeichert und kann jederzeit im Übungen-Editor nachträglich
// ein Bild bekommen.
// Picker-Popup für die Übungs-Bibliothek (EXERCISE_LIBRARY) — aufgerufen aus dem ersten
// Schritt von openNewExerciseModal() über den "Aus Vorlagen wählen"-Button neben dem
// Namensfeld. Zeigt alle Bibliotheks-Übungen, die noch nicht im eigenen plan.exercises
// stecken (nach Muskelgruppe sortiert), als ankreuzbare Checkbox-Zeilen (.stat-toggle-row,
// gleiches Muster wie die Statistik-Sichtbarkeits-Liste in den Einstellungen). Mehrfachauswahl
// per Antippen, "Weiter" fügt alle markierten Übungen direkt und vollständig (inkl. passendem
// EXERCISE_INFO-Eintrag über die ID) zu plan.exercises hinzu und speichert. onDone(count) wird
// danach mit der Anzahl hinzugefügter Übungen aufgerufen, damit der Aufrufer (der komplette
// "Übung anlegen"-Dialog) sich selbst schließen und den Übungen-Editor neu zeichnen kann.
function openExerciseLibraryPicker(onDone){
  const existingIds = new Set(plan.exercises.map(e => e.id));
  // Eigene ausgeblendete Übungen (siehe hideExerciseFromPlan()) zusammen mit der allgemeinen
  // Bibliothek anbieten — bei einer ID, die es in beiden gibt, gewinnt die eigene Version
  // (behält z. B. ein selbst hinzugefügtes Bild), daher zuerst die Bibliothek einsortieren und
  // removedExercises danach drüberschreiben.
  const byId = {};
  EXERCISE_LIBRARY.forEach(e => { if (!existingIds.has(e.id)) byId[e.id] = e; });
  (Array.isArray(plan.removedExercises) ? plan.removedExercises : []).forEach(e => {
    if (!existingIds.has(e.id)) byId[e.id] = e;
  });
  const available = Object.values(byId);
  let selected = new Set();
  let query = '';

  function filtered(){
    if (!query.trim()) return available;
    const q = query.trim().toLowerCase();
    return available.filter(e => e.name.toLowerCase().includes(q) || (e.muscleGroup || '').toLowerCase().includes(q));
  }

  function listHTML(){
    const list = filtered();
    if (!list.length) return `<div class="history-empty">Keine passenden Übungen gefunden.</div>`;
    const groups = {};
    list.forEach(e => {
      const g = e.muscleGroup || 'Sonstige';
      (groups[g] = groups[g] || []).push(e);
    });
    return MUSCLE_GROUP_ORDER.filter(g => groups[g]).map(g => `
      <div class="section-label" style="margin-top:14px;">${g}</div>
      ${groups[g].map(e => `
        <button type="button" class="stat-toggle-row ${selected.has(e.id) ? 'checked' : ''}" data-lib-id="${e.id}">
          <span class="stat-toggle-check">✓</span>
          <span>${exerciseNameHTML(e.name)}</span>
        </button>
      `).join('')}
    `).join('');
  }

  function render(isFirstRender){
    const existingOverlay = document.getElementById('exerciseLibraryOverlay');
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement('div');
    overlay.className = 'add-exercise-overlay centered-overlay';
    overlay.id = 'exerciseLibraryOverlay';
    overlay.innerHTML = `
      <div class="add-exercise-modal" style="max-height:88vh;">
        <div class="add-exercise-modal-header">
          <div class="add-exercise-modal-title">Aus Vorlagen wählen</div>
          <button class="add-exercise-modal-close" id="exLibClose" aria-label="Abbrechen">✕</button>
        </div>
        <div style="padding:14px 16px 0;">
          <input type="text" id="exLibSearch" class="plan-search" placeholder="Übung oder Muskel suchen…" value="${query.replace(/"/g,'&quot;')}">
        </div>
        <div class="new-exercise-modal-body" id="exLibBody">${listHTML()}</div>
        <div class="add-exercise-modal-header" style="border-top:1px solid var(--border); border-bottom:none;">
          <button class="btn btn-primary" id="exLibNext" style="width:100%;" ${selected.size ? '' : 'disabled'}>Weiter${selected.size ? ` (${selected.size})` : ''}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    // Nur beim allerersten Öffnen einen History-Eintrag pushen (siehe pushOverlayState()-
    // Kommentar oben). render() wird bei jedem Tastendruck im Suchfeld erneut aufgerufen, um
    // die gefilterte Liste zu aktualisieren — ein erneutes pushState() bei jedem Zeichen würde
    // den overlayCloseStack aufblähen und in der mobilen WebView den Eingabefokus/die Tastatur
    // aus dem Textfeld werfen (Bug: Buchstabe eintippen -> Fokus springt sofort wieder raus).
    if (isFirstRender) pushOverlayState(close);

    overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
    document.getElementById('exLibClose').onclick = close;

    const searchInput = document.getElementById('exLibSearch');
    searchInput.onclick = (ev) => ev.stopPropagation();
    searchInput.oninput = (ev) => {
      query = ev.target.value;
      const caret = ev.target.selectionStart;
      render();
      const newInput = document.getElementById('exLibSearch');
      newInput.focus();
      newInput.setSelectionRange(caret, caret);
    };

    overlay.querySelectorAll('[data-lib-id]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.libId;
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        const bodyEl = document.getElementById('exLibBody');
        const scrollTop = bodyEl ? bodyEl.scrollTop : 0;
        render();
        const newBodyEl = document.getElementById('exLibBody');
        if (newBodyEl) newBodyEl.scrollTop = scrollTop;
      };
    });

    document.getElementById('exLibNext').onclick = async () => {
      if (!selected.size) return;
      const toAdd = available.filter(e => selected.has(e.id));
      toAdd.forEach(e => {
        plan.exercises.push({ ...e });
        planGroupOpen.add(e.muscleGroup || 'Sonstige');
      });
      if (Array.isArray(plan.removedExercises)){
        plan.removedExercises = plan.removedExercises.filter(e => !selected.has(e.id));
      }
      await saveJSON('plan', plan);
      popOverlayStateIfOpen();
      removeOverlayEl();
      onDone(toAdd.length);
    };
  }

  function removeOverlayEl(){
    const el = document.getElementById('exerciseLibraryOverlay');
    if (el) el.remove();
  }
  function close(){
    popOverlayStateIfOpen();
    removeOverlayEl();
  }

  render(true);
}

function openNewExerciseModal(){
  const MUSCLE_GROUP_TO_BODYPART = { Beine: 'legs', Bauch: 'legs', Schultern: 'push', Brust: 'push', Rücken: 'pull' };
  let draft = { id: null, name: '', sets: 3, repsMin: 8, repsMax: 12, secondsMin: 30, secondsMax: 60, weight: 0, category: 'oberkoerper', muscleGroup: 'Sonstige', mainMuscle: '', muscles: '', type: 'reps', assisted: false, bodyweightExercise: false };
  let stepIndex = 0;
  // Zählt, wie viele History-Einträge dieser Wizard bisher selbst gepusht hat (ein Eintrag pro
  // vorwärts besuchtem Schritt, siehe render() unten) — BUGFIX: "Später · Fertig" fügte die
  // Übung zwar korrekt hinzu, poppte beim Schließen aber nur EINEN dieser Einträge
  // (popOverlayStateIfOpen() ging bisher von "ein Schritt = ein Eintrag = ein Pop" aus). Bei
  // z. B. 6 besuchten Schritten blieben so 5 "Geister"-Einträge im History-Stack zurück; das
  // eine ausgelöste history.back() traf dadurch auf den POPSTATE-HANDLER, der wegen des noch
  // nicht leeren overlayCloseStack fälschlich einen der übrig gebliebenen Schritt-Rückwärts-
  // Handler auslöste — der Wizard baute sich (mit stepIndex-1) wieder auf, obwohl er eigentlich
  // schon fertig war. Fix: closeOverlay() poppt jetzt in einer Schleife GENAU so oft wie zuvor
  // gepusht wurde (siehe unten), statt sich auf einen einzelnen Pop zu verlassen.
  let pushedStates = 0;

  // Schritt-Definitionen: jeder Schritt liefert sein Inhalts-HTML und verkabelt seine
  // Eingaben selbst. "next()" wird von den einzelnen Schritten aufgerufen, sobald genug
  // Information vorliegt (z. B. direkt nach Tippen einer Option), nicht erst über einen
  // separaten "Weiter"-Button — das hält den Ablauf zügig.
  function stepsFor(){
    const steps = [];

    steps.push({
      title: 'Wie heißt die Übung?',
      render: (body, next) => {
        body.innerHTML = `
          <input type="text" id="wizName" value="${(draft.name || '').replace(/"/g,'&quot;')}" placeholder="z. B. Kreuzheben" style="width:100%; padding:14px; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:16px;">
          <button class="btn btn-primary" id="wizNameNext" style="width:100%; margin-top:16px;">Weiter</button>
          <button class="btn btn-ghost" id="wizFromLibrary" style="width:100%; margin-top:10px;">Aus Vorlagen wählen ›</button>
        `;
        const input = body.querySelector('#wizName');
        // Kein Auto-Focus mehr hier: das ließ beim Öffnen des "Übung hinzufügen"-Dialogs sofort
        // die Tastatur aufpoppen, obwohl viele Nutzer:innen zuerst auf "Aus Vorlagen wählen ›"
        // tippen wollen. Fokus/Tastatur erscheinen jetzt erst, wenn aktiv ins Feld getippt wird.
        const submit = () => {
          if (!input.value.trim()){ alert('Bitte einen Namen eintragen.'); return; }
          draft.name = input.value.trim();
          next();
        };
        input.onkeydown = (ev) => { if (ev.key === 'Enter'){ ev.preventDefault(); input.blur(); submit(); } };
        body.querySelector('#wizNameNext').onclick = submit;
        body.querySelector('#wizFromLibrary').onclick = () => {
          openExerciseLibraryPicker((count) => {
            closeOverlay();
            if (count) renderPlanEditor();
          });
        };
      }
    });

    steps.push({
      title: 'Wie wird trainiert?',
      render: (body, next) => {
        body.innerHTML = `
          <div class="wizard-choice-list">
            <button class="wizard-choice ${draft.type === 'reps' ? 'selected' : ''}" data-val="reps">Wiederholungen</button>
            <button class="wizard-choice ${draft.type === 'time' ? 'selected' : ''}" data-val="time">Zeit (z. B. Plank)</button>
            <button class="wizard-choice ${draft.type === 'cardio' ? 'selected' : ''}" data-val="cardio">Kardio (Laufband, Rudern, …)</button>
          </div>
        `;
        body.querySelectorAll('.wizard-choice').forEach(btn => {
          btn.onclick = () => {
            draft.type = btn.dataset.val;
            if (draft.type === 'cardio'){
              draft.category = 'kardio';
              draft.muscleGroup = 'Kardio';
              draft.bodyPart = null;
              draft.secondsMin = draft.secondsMin && draft.secondsMin >= 60 ? draft.secondsMin : 300;
              draft.secondsMax = draft.secondsMax && draft.secondsMax >= 60 ? draft.secondsMax : 600;
            }
            next();
          };
        });
      }
    });

    if (draft.type === 'cardio'){
      steps.push({
        title: 'Welches Gerät?',
        render: (body, next) => {
          body.innerHTML = `
            <div class="wizard-choice-list">
              ${Object.keys(CARDIO_MACHINES).map(key => `<button class="wizard-choice ${draft.cardioMachine === key ? 'selected' : ''}" data-val="${key}">${CARDIO_MACHINES[key].label}</button>`).join('')}
            </div>
          `;
          body.querySelectorAll('.wizard-choice').forEach(btn => {
            btn.onclick = () => { draft.cardioMachine = btn.dataset.val; next(); };
          });
        }
      });
    }

    // Körperbereich und Muskelgruppe sind bei Kardio-Übungen irrelevant (Kategorie/Gruppe
    // stehen bereits fest auf 'kardio'/'Kardio', siehe Schritt "Wie wird trainiert?") — beide
    // Schritte entfallen dafür komplett, statt sie mit vorbelegten, nicht änderbaren Werten
    // trotzdem anzuzeigen.
    if (draft.type !== 'cardio'){
      steps.push({
        title: 'Körperbereich',
        render: (body, next) => {
          body.innerHTML = `
            <div class="wizard-choice-list">
              <button class="wizard-choice ${draft.category !== 'unterkoerper' ? 'selected' : ''}" data-val="oberkoerper">Oberkörper</button>
              <button class="wizard-choice ${draft.category === 'unterkoerper' ? 'selected' : ''}" data-val="unterkoerper">Unterkörper</button>
            </div>
          `;
          body.querySelectorAll('.wizard-choice').forEach(btn => {
            btn.onclick = () => { draft.category = btn.dataset.val; next(); };
          });
        }
      });

      steps.push({
        title: 'Muskelgruppe',
        render: (body, next) => {
          body.innerHTML = `
            <div class="wizard-choice-list">
              ${MUSCLE_GROUP_ORDER.filter(g => g !== 'Kardio').map(g => `<button class="wizard-choice ${draft.muscleGroup === g ? 'selected' : ''}" data-val="${g}">${g}</button>`).join('')}
            </div>
          `;
          body.querySelectorAll('.wizard-choice').forEach(btn => {
            btn.onclick = () => {
              draft.muscleGroup = btn.dataset.val;
              // Push/Pull/Legs automatisch ableiten (siehe MUSCLE_GROUP_TO_BODYPART) — für
              // "Arme" bewusst kein Automatismus (Bizeps=Pull, Trizeps=Push, nicht eindeutig),
              // bleibt dann ohne Zuordnung und lässt sich später im Übungen-Editor nachtragen.
              draft.bodyPart = MUSCLE_GROUP_TO_BODYPART[btn.dataset.val] || null;
              next();
            };
          });
        }
      });
    }

    // Nur bei Wiederholungs-Übungen relevant (Zeit- und Kardio-Übungen kennen kein Gewicht).
    if (draft.type === 'reps'){
      steps.push({
        title: 'Gewichtsart',
        render: (body, next) => {
          body.innerHTML = `
            <div class="wizard-choice-list">
              <button class="wizard-choice ${(!draft.assisted && !draft.bodyweightExercise) ? 'selected' : ''}" data-val="normal">Normales Gewicht</button>
              <button class="wizard-choice ${draft.assisted ? 'selected' : ''}" data-val="assisted">Unterstützt (z. B. Klimmzugmaschine)</button>
              <button class="wizard-choice ${draft.bodyweightExercise ? 'selected' : ''}" data-val="bodyweight">Eigenkörpergewicht (z. B. Klimmzüge)</button>
            </div>
          `;
          body.querySelectorAll('.wizard-choice').forEach(btn => {
            btn.onclick = () => {
              draft.assisted = btn.dataset.val === 'assisted';
              draft.bodyweightExercise = btn.dataset.val === 'bodyweight';
              next();
            };
          });
        }
      });
    }

    steps.push({
      title: 'Bild hinzufügen',
      subtitle: 'Optional — kannst du auch später im Übungen-Editor nachtragen.',
      render: (body, next) => {
        body.innerHTML = `
          ${draft.imageData ? `<img src="${draft.imageData}" alt="" style="width:100%; max-height:220px; object-fit:cover; border-radius:12px; margin-bottom:14px;">` : ''}
          <label class="btn btn-ghost" style="display:block; text-align:center; margin-bottom:10px;">
            ${draft.imageData ? 'Anderes Bild wählen' : 'Bild auswählen'}
            <input type="file" accept="image/*" id="wizImageInput" style="display:none;">
          </label>
          <button class="btn btn-primary" id="wizFinish" style="width:100%;">${draft.imageData ? 'Fertig' : 'Später · Fertig'}</button>
        `;
        body.querySelector('#wizImageInput').onchange = async (ev) => {
          const file = ev.target.files && ev.target.files[0];
          if (!file) return;
          try{
            draft.imageData = await downscaleImageFile(file);
            render(); // Schritt neu zeichnen, um Vorschau zu zeigen
          }catch(err){
            alert('Bild konnte nicht verarbeitet werden: ' + err.message);
          }
        };
        body.querySelector('#wizFinish').onclick = () => finish();
      }
    });

    return steps;
  }

  async function finish(){
    const newExercise = { ...draft, id: uid() };
    // Intern läuft eine Kardio-Übung als ganz normale Zeit-Übung (type:'time') mit, damit sie
    // die komplette bestehende Zeit-Infrastruktur (Satzerfassung, Rekorde, Diagramme, PDF/
    // Verlauf-Anzeige) unverändert mitnutzt — cardioMachine markiert zusätzlich, dass und mit
    // welchem Gerät zusätzliche Werte (Neigung/Tempo/Widerstand) erfasst werden sollen.
    if (newExercise.type === 'cardio'){
      newExercise.type = 'time';
      if (!newExercise.cardioMachine) newExercise.cardioMachine = 'laufband';
    }
    if (!newExercise.mainMuscle) newExercise.mainMuscle = newExercise.muscleGroup || '';
    plan.exercises.push(newExercise);
    planGroupOpen.add(newExercise.muscleGroup || 'Sonstige');
    await saveJSON('plan', plan);
    closeOverlay();
    renderPlanEditor();
    showTopToast(`Erfolgreich hinzugefügt: ${newExercise.name}`);
  }

  function closeOverlay(){
    // Genau so oft poppen, wie dieser Wizard selbst gepusht hat (siehe pushedStates oben) —
    // ein einzelner Pop reichte nur für den allerersten Schritt, bei mehreren besuchten
    // Schritten blieben sonst "Geister"-Einträge im History-Stack zurück (siehe Kommentar bei
    // pushedStates). popOverlayStateIfOpen() unterstützt mehrfaches Aufrufen in Folge bereits
    // (siehe overlaySelfClosingCount-Mechanismus), genau wie beim Schließen mehrerer
    // verschachtelter Popups an anderer Stelle in der App.
    for (let i = 0; i < pushedStates; i++){ popOverlayStateIfOpen(); }
    pushedStates = 0;
    removeOverlayEl();
  }
  function removeOverlayEl(){
    const el = document.getElementById('newExerciseOverlay');
    if (el) el.remove();
  }

  function render(fromPopState){
    const steps = stepsFor();
    if (stepIndex >= steps.length) stepIndex = steps.length - 1;
    const step = steps[stepIndex];

    const existing = document.getElementById('newExerciseOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'add-exercise-overlay centered-overlay';
    overlay.id = 'newExerciseOverlay';
    overlay.innerHTML = `
      <div class="add-exercise-modal" style="max-height:none;">
        <div class="add-exercise-modal-header">
          <div>
            <div class="wizard-progress">Schritt ${stepIndex + 1} von ${steps.length}</div>
            <div class="add-exercise-modal-title">${step.title}</div>
            ${step.subtitle ? `<div class="wizard-subtitle">${step.subtitle}</div>` : ''}
          </div>
          <button class="add-exercise-modal-close" id="newExerciseClose" aria-label="Abbrechen">✕</button>
        </div>
        <div class="new-exercise-modal-body" id="wizardBody"></div>
        ${stepIndex > 0 ? `<div class="add-exercise-modal-header" style="border-top:1px solid var(--border); border-bottom:none;">
          <button class="btn btn-ghost" id="wizBack" style="width:100%;">‹ Zurück</button>
        </div>` : ''}
      </div>
    `;
    document.body.appendChild(overlay);

    // Jeder Wizard-Schritt bekommt seinen eigenen History-Eintrag: Zurück-Taste geht damit
    // erst durch die Schritte zurück, bevor sie ganz aus dem Popup herausführt (statt beim
    // ersten Zurück-Tap direkt zur "Training starten"-Übersicht zu springen). Kommt render()
    // selbst durch einen popstate-Aufruf zustande (fromPopState), wird kein zusätzlicher
    // History-Eintrag gepusht — sonst würde jeder Zurück-Schritt gleichzeitig einen neuen
    // Vorwärts-Eintrag erzeugen.
    if (!fromPopState){
      pushOverlayState(() => {
        pushedStates -= 1;
        if (stepIndex > 0){
          stepIndex -= 1;
          render(true);
        } else {
          removeOverlayEl();
        }
      });
      pushedStates += 1;
    }

    overlay.onclick = (ev) => { if (ev.target === overlay) closeOverlay(); };
    document.getElementById('newExerciseClose').onclick = closeOverlay;
    const backBtn = document.getElementById('wizBack');
    // Ruft NUR history.back() auf, ohne selbst weiter einzugreifen — der bereits registrierte
    // popstate-Handler (siehe pushOverlayState oben) übernimmt das eigentliche Zurückschalten
    // (stepIndex verringern + neu rendern) genauso, wie es auch die Hardware-Zurück-Taste tun
    // würde. BUGFIX: vorher rief dieser Button selbst sowohl popOverlayStateIfOpen() (löst
    // asynchron history.back() aus) ALS AUCH direkt danach render() (löst SYNCHRON erneut
    // pushOverlayState()/history.pushState() aus) auf — dieselbe Race Condition zwischen
    // asynchronem back() und sofort folgendem synchronem pushState(), die schon an anderer
    // Stelle in der App dokumentiert und behoben wurde (siehe z. B. openAddTilePrompt()).
    if (backBtn) backBtn.onclick = () => { history.back(); };

    const body = document.getElementById('wizardBody');
    const next = () => { stepIndex += 1; render(); };
    step.render(body, next);
  }

  render();
}

function renderPlanEditor(){
  app.innerHTML = `
    <div class="back-row" style="margin-top:0;">
      <button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>
    <input type="text" id="planSearch" class="plan-search" placeholder="Übung oder Muskel suchen…" value="${(planSearchQuery || '').replace(/"/g,'&quot;')}" style="margin-top:18px;">
    <div id="planRowsContainer"></div>
    <button class="btn btn-ghost" id="btnAdd" style="margin:4px 0 12px;">+ Übung hinzufügen</button>
    <button class="btn btn-primary" id="btnSave" style="margin-top:4px;">Speichern</button>
  `;

  function matchesSearch(ex, q){
    if (!q) return true;
    const hay = `${ex.name} ${ex.muscles || ''} ${ex.muscleGroup || ''}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  function renderPlanRows(){
    const container = document.getElementById('planRowsContainer');
    const q = planSearchQuery.trim();
    const indexed = plan.exercises.map((ex, i) => ({ ex, i })).filter(({ ex }) => matchesSearch(ex, q));

    const groups = {};
    indexed.forEach(item => {
      const g = item.ex.muscleGroup || 'Sonstige';
      (groups[g] = groups[g] || []).push(item);
    });
    const orderedGroups = MUSCLE_GROUP_ORDER.filter(g => groups[g]);
    Object.keys(groups).forEach(g => { if (!orderedGroups.includes(g)) orderedGroups.push(g); });

    if (!orderedGroups.length){
      container.innerHTML = '<div class="history-empty">Keine Übungen gefunden.</div>';
      return;
    }

    // Favoriten-Akkordeon IMMER ganz oben, unabhängig von der Muskelgruppen-Reihenfolge —
    // reuse denselben Öffnen/Schließen-Mechanismus wie die Muskelgruppen (planGroupOpen), nur
    // mit dem Schlüssel '__favorites__' statt eines Gruppennamens. Erscheint nur, wenn es
    // überhaupt Favoriten gibt (und die aktuelle Suche mindestens einen davon trifft).
    const favItems = indexed.filter(({ ex }) => isExerciseFavorite(ex.id));
    const favOpen = q ? true : planGroupOpen.has('__favorites__');
    const favoritesHTML = favItems.length ? `
      <div class="muscle-group">
        <button class="muscle-group-header" data-group="__favorites__" type="button">
          <span class="mg-name">Favoriten</span>
          <span class="mg-meta">${favItems.length} Übung${favItems.length === 1 ? '' : 'en'} <span class="mg-arrow">${favOpen ? '▾' : '▸'}</span></span>
        </button>
        <div class="muscle-group-body" style="display:${favOpen ? 'block' : 'none'}">
          ${favItems.map(({ ex, i }) => renderExerciseRowHTML(ex, i)).join('')}
        </div>
      </div>
    ` : '';

    container.innerHTML = favoritesHTML + orderedGroups.map(g => {
      const items = groups[g];
      const isOpen = q ? true : planGroupOpen.has(g);
      return `
        <div class="muscle-group">
          <button class="muscle-group-header" data-group="${g}" type="button">
            <span class="mg-name">${g}</span>
            <span class="mg-meta">${items.length} Übung${items.length === 1 ? '' : 'en'} <span class="mg-arrow">${isOpen ? '▾' : '▸'}</span></span>
          </button>
          <div class="muscle-group-body" style="display:${isOpen ? 'block' : 'none'}">
            ${items.map(({ ex, i }) => renderExerciseRowHTML(ex, i)).join('')}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.muscle-group-header').forEach(btn => {
      btn.onclick = () => {
        const g = btn.dataset.group;
        if (planGroupOpen.has(g)) planGroupOpen.delete(g); else planGroupOpen.add(g);
        renderPlanRows();
      };
    });
    container.querySelectorAll('[data-edit]').forEach(btn => {
      btn.onclick = () => {
        const i = Number(btn.dataset.edit);
        openPlanRowEditPopup(i, renderPlanRows);
      };
    });
    container.querySelectorAll('.plan-row-media').forEach(el => {
      el.onclick = () => {
        const i = Number(el.closest('.plan-row').dataset.i);
        openExerciseImagePopup(plan.exercises[i]);
      };
    });
    container.querySelectorAll('[data-fav]').forEach(btn => {
      btn.onclick = async () => {
        await toggleExerciseFavorite(btn.dataset.fav);
        renderPlanRows();
      };
    });
    container.querySelectorAll('[data-hide]').forEach(btn => {
      btn.onclick = async () => {
        const i = Number(btn.dataset.hide);
        await hideExerciseFromPlan(i);
        renderPlanRows();
      };
    });
  }

  renderPlanRows();

  document.getElementById('planSearch').oninput = (e) => {
    planSearchQuery = e.target.value;
    renderPlanRows();
  };
  document.getElementById('btnBack').onclick = () => history.back();
  document.getElementById('btnAdd').onclick = () => {
    openNewExerciseModal();
  };
  document.getElementById('btnSave').onclick = async () => {
    await saveJSON('plan', plan);
    history.back();
  };
}

