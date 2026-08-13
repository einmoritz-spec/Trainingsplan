/* ---------------------------------------------------
   15c-food-add.js
   ---------------------------------------------------
   Essenstracker: "Lebensmittel hinzufügen"-Seite (Suche, Favoriten,
   Zuletzt genutzt, gespeicherte Mahlzeiten), Mengen-Modal, Eintrag-CRUD,
   eigenes Lebensmittel anlegen, Mahlzeit speichern/anwenden, Barcode-
   Scanner.

   Teil des Splits von 15-food-tracker.js — siehe Kopfkommentar in
   15a-food-core.js für die Gesamtübersicht und Beweggründe.

   Setzt voraus, dass 15a-food-core.js (State, Suche, OFF-Netzwerk,
   Overlay-/Toast-Helfer, Icons) und 15b-food-day.js (renderFoodTracker,
   für die Rückkehr zur Tagesansicht) bereits geladen sind.
--------------------------------------------------- */

/* ============ Seite: Lebensmittel hinzufügen ============
   War früher ein Bottom-Sheet-Overlay über der Tagesansicht — jetzt eine eigene, vollwertige
   Seite (wie renderFoodStats() etc.), aus zwei Gründen:
   1. Ein Bottom-Sheet mit eigener visualViewport-Höhenberechnung (siehe ftApplyOverlayViewport)
      bleibt auf Android/iOS störanfällig, sobald die Tastatur ein-/ausblendet (leichtes
      Nachfedern/Springen) — eine normale Seite dagegen nutzt den ganz gewöhnlichen
      Dokumentfluss, den der Browser für Tastatur-Ein-/Ausblenden nativ und zuverlässig
      handhabt, exakt wie bei jeder anderen Texteingabe-Seite der App.
   2. Als eigene Seite lässt sich unmöglich "im Hintergrund weiterscrollen" (kein Hintergrund
      mehr vorhanden, der Inhalt IST die Seite) — das Scroll-Lock/Viewport-Gefrickel für diesen
      Anwendungsfall entfällt komplett.
   Das Suchfeld wird bewusst NICHT mehr automatisch fokussiert (kein autofocus/`.focus()` beim
   Öffnen) — die Seite startet im normalen Such-losen "Durchstöbern"-Zustand (Favoriten/Zuletzt/
   Eigene/Gespeicherte Mahlzeiten, siehe ftRenderDefaultResults()), die Tastatur öffnet sich erst
   nach einem echten Tap auf das Suchfeld selbst, wie bei jedem gewöhnlichen Eingabefeld. */
let ftAddSheetMeal = null;
let ftAddSheetSearchToken = 0;
// "Eigene Lebensmittel" und "Gespeicherte Mahlzeiten" starten standardmäßig eingeklappt (siehe
// ftRenderDefaultResults() unten) — im Gegensatz zu "Favoriten"/"Zuletzt in ..." wachsen diese
// beiden Listen mit der Zeit potenziell stark an und sind seltener der direkte Einstieg (man
// tippt meist ein bereits kürzlich genutztes Lebensmittel an). Nur MANUELLES Auf-/Zuklappen
// wird hier gemerkt (kein Zeit-Default wie bei den Mahlzeiten-Akkordeons in 15b-food-day.js) —
// bleibt für die Dauer der Sitzung erhalten, damit ein einmal geöffneter Abschnitt beim Tippen/
// Favorisieren nicht bei jedem Re-Render wieder zuklappt.
let ftAddSheetOpenSections = {};

function goFtAddFood(meal, push){
  if (push !== false) pushView('foodAddMeal', { meal });
  renderFtAddFood(meal);
}

function renderFtAddFood(meal){
  ftApplyTheme();
  ftAddSheetMeal = meal;
  app.innerHTML = `
    <div class="back-row" style="margin-top:0;">
      <button class="back-btn-icon" id="ftAddBackBtn" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>
    <div class="brand" style="margin-bottom:14px;"><h1 style="font-size:22px;">${FT_MEAL_LABELS[meal]}</h1></div>
    <div class="search-wrap">
      <input class="search-input" id="ftFoodSearchInput" placeholder="Lebensmittel suchen …" autocomplete="off">
      <button class="icon-btn" id="ftScanBtn" title="Barcode scannen">${ftIconBarcode()}</button>
    </div>
    <div id="ftSearchResults"></div>
  `;
  document.getElementById('ftAddBackBtn').onclick = () => history.back();
  document.getElementById('ftScanBtn').onclick = ftOpenScanner;
  const input = document.getElementById('ftFoodSearchInput');
  let searchDebounceTimer = null;
  input.addEventListener('input', ()=>{
    clearTimeout(searchDebounceTimer);
    const value = input.value;
    if(!value.trim()){ ftHandleSearchInput(value); return; } // sofort zurück zur Startansicht
    ftShowLocalResultsOnly(value); // Basisliste/Eigene sofort, kein Warten
    searchDebounceTimer = setTimeout(()=>ftHandleSearchInput(value), 350);
  });
  ftRenderDefaultResults();
}

function ftRenderDefaultResults(){
  const box = document.getElementById('ftSearchResults');
  const meal = ftAddSheetMeal;
  const favFoods = ftFavorites.map(ftGetFoodById).filter(Boolean);
  const recentIds = ftRecent[meal] || [];
  const recentFoods = recentIds.map(ftGetFoodById).filter(Boolean);
  const customList = ftCustomFoods;
  let html = '';
  if(favFoods.length) html += ftSection('Favoriten', favFoods);
  if(recentFoods.length) html += ftSection('Zuletzt in ' + FT_MEAL_LABELS[meal].toLowerCase(), recentFoods);
  if(customList.length) html += ftAccordionSection('custom', 'Eigene Lebensmittel', customList.map(ftResultRowHTML).join(''), customList.length);
  html += ftAccordionSection('saved', 'Gespeicherte Mahlzeiten', ftSavedMealsListHTML(), ftSavedMeals.length);
  html += `<button class="ft-btn-ghost" id="ftNewCustomFoodBtn">+ Eigenes Lebensmittel anlegen</button>`;
  box.innerHTML = html || `<div class="no-results">Noch keine Favoriten oder zuletzt genutzten Lebensmittel.</div>` + `<button class="ft-btn-ghost" id="ftNewCustomFoodBtn">+ Eigenes Lebensmittel anlegen</button>`;
  ftWireResultRows(box);
  ftWireAccordionToggles(box);
  const newBtn = document.getElementById('ftNewCustomFoodBtn');
  // Bugfix: newBtn.onclick = ftOpenCustomFoodForm (direkte Referenz) hätte dem Handler den
  // Klick-Event als ersten Parameter übergeben — ftOpenCustomFoodForm(prefillBarcode) hätte
  // das MouseEvent-Objekt fälschlich als "prefillBarcode" interpretiert (truthy!), wodurch der
  // Titel fälschlich "Produkt nicht gefunden" gezeigt und ein kaputter Barcode-Wert am neuen
  // Lebensmittel hinterlegt worden wäre. Wrapper-Funktion ruft stattdessen ohne Argument auf.
  if(newBtn) newBtn.onclick = () => ftOpenCustomFoodForm();
}
// Eingeklapptes Akkordeon für Listen, die nicht ständig offen herumstehen müssen (siehe
// ftAddSheetOpenSections oben) — bewusst dasselbe .muscle-group-Muster wie auf der Startseite
// (homeMealsAccordionBodyHTML() etc., 07-home.js), damit es sich stimmig ins übrige Design
// einfügt statt eine dritte eigene Akkordeon-Optik einzuführen.
function ftAccordionSection(key, label, bodyHTML, count){
  const open = !!ftAddSheetOpenSections[key];
  return `
    <div class="muscle-group" style="margin-top:16px;" data-accordion-key="${key}">
      <button class="muscle-group-header" type="button" data-accordion-toggle="${key}">
        <span class="mg-name">${label}</span>
        <span class="mg-meta">${count ? `<span>${count}</span>` : ''}<span class="mg-arrow">${open ? '▾' : '▸'}</span></span>
      </button>
      <div class="muscle-group-body" style="display:${open ? 'block' : 'none'};">${bodyHTML}</div>
    </div>
  `;
}
function ftWireAccordionToggles(box){
  box.querySelectorAll('[data-accordion-toggle]').forEach(btn=>{
    btn.onclick = ()=>{
      const key = btn.dataset.accordionToggle;
      ftAddSheetOpenSections[key] = !ftAddSheetOpenSections[key];
      ftRenderCurrentResults();
    };
  });
}
function ftSavedMealsListHTML(){
  if(!ftSavedMeals.length) return `<div class="no-results">Keine gespeicherten Mahlzeiten.</div>`;
  return ftSavedMeals.map(m=>`
    <div class="result-row" data-saved-meal="${m.id}">
      <div class="result-main"><div class="result-name">${ftEscapeHTML(m.name)}</div><div class="result-sub">${m.items.length} Positionen</div></div>
      <button class="result-star" data-del-meal="${m.id}" title="Löschen">${ftIconTrash()}</button>
    </div>
  `).join('');
}
function ftSection(label, foods){
  return `<div class="ft-section-label">${label}</div>` + foods.map(ftResultRowHTML).join('');
}
function ftResultRowHTML(food){
  const isFav = ftFavorites.includes(food.id);
  const isCustom = food.id.startsWith('c_');
  let context = '';
  if(food.brand) context = food.brand;
  else if(food.cat && FOOD_CATEGORIES[food.cat]) context = FOOD_CATEGORIES[food.cat];
  const sub = context ? `${context} · ${food.kcal} kcal/100g` : `${food.kcal} kcal/100g`;
  return `
    <div class="result-row" data-food-id="${food.id}">
      <div class="result-main"><div class="result-name">${ftEscapeHTML(food.name)}</div><div class="result-sub">${sub}</div></div>
      ${isCustom ? `<button class="result-star" data-del-food="${food.id}" title="Löschen">${ftIconTrash()}</button>` : ''}
      <button class="result-star" data-fav-id="${food.id}">${ftIconStar(isFav)}</button>
    </div>
  `;
}
function ftWireResultRows(box){
  box.querySelectorAll('.result-row[data-food-id]').forEach(row=>{
    row.addEventListener('click', (ev)=>{
      if(ev.target.closest('[data-fav-id], [data-del-food]')) return;
      ftOpenQuantityModal(ftGetFoodById(row.dataset.foodId));
    });
  });
  box.querySelectorAll('[data-fav-id]').forEach(btn=>{
    btn.onclick = (ev)=>{
      ev.stopPropagation();
      ftToggleFavorite(btn.dataset.favId);
      ftRenderCurrentResults();
    };
  });
  box.querySelectorAll('[data-del-food]').forEach(btn=>{
    btn.onclick = (ev)=>{
      ev.stopPropagation();
      ftDeleteCustomFood(btn.dataset.delFood);
    };
  });
  box.querySelectorAll('[data-del-meal]').forEach(btn=>{
    btn.onclick = (ev)=>{
      ev.stopPropagation();
      ftDeleteSavedMeal(btn.dataset.delMeal);
    };
  });
  box.querySelectorAll('[data-saved-meal]').forEach(row=>{
    row.addEventListener('click', (ev)=>{
      if(ev.target.closest('[data-del-meal]')) return;
      ftApplySavedMeal(row.dataset.savedMeal);
    });
  });
}
function ftDeleteCustomFood(id){
  const food = ftCustomFoods.find(f=>f.id===id);
  if(!food) return;
  if(!confirm(`„${food.name}" wirklich löschen?`)) return;
  ftCustomFoods = ftCustomFoods.filter(f=>f.id!==id);
  ftSave('customFoods', ftCustomFoods);
  ftFavorites = ftFavorites.filter(f=>f!==id);
  ftSave('favorites', ftFavorites);
  ftRenderCurrentResults();
  ftToast('Gelöscht');
}
function ftDeleteSavedMeal(id){
  const meal = ftSavedMeals.find(m=>m.id===id);
  if(!meal) return;
  if(!confirm(`Mahlzeit „${meal.name}" wirklich löschen?`)) return;
  ftSavedMeals = ftSavedMeals.filter(m=>m.id!==id);
  ftSave('savedMeals', ftSavedMeals);
  // Zeigte diese gespeicherte Mahlzeit gerade auf einen Auto-Eintrag (Einstellungen ›
  // "Automatisch täglich eintragen"), muss die Referenz mit weg — sonst bliebe eine verwaiste
  // ID in ftAutoMeals hängen, die ftApplyAutoMealsForNewDay() zwar sauber ignoriert (kein
  // Crash), aber ftSettingsBodyHTML() würde das zugehörige Dropdown dann fälschlich als "Kein
  // Auto-Eintrag" anzeigen, obwohl im Speicher noch die alte ID steht.
  let autoMealsChanged = false;
  FT_MEAL_KEYS.forEach(m => { if (ftAutoMeals[m] === id) { ftAutoMeals[m] = null; autoMealsChanged = true; } });
  if (autoMealsChanged) ftSave('autoMeals', ftAutoMeals);
  ftRenderCurrentResults();
  ftToast('Gelöscht');
}
function ftToggleFavorite(id){
  if(ftFavorites.includes(id)) ftFavorites = ftFavorites.filter(f=>f!==id);
  else {
    ftFavorites.push(id);
    // Ein favorisiertes Online-Ergebnis muss dauerhaft gespeichert werden (siehe
    // ftPersistOffFoodIfNeeded(), 15a-food-core.js) — sonst würde der Favorit nach dem
    // nächsten App-Start ins Leere zeigen, da ftOffMemCache (nur der flüchtige Treffer-Cache)
    // nicht über einen Neustart hinweg erhalten bleibt.
    ftPersistOffFoodIfNeeded(ftGetFoodById(id));
  }
  ftSave('favorites', ftFavorites);
}
let ftLastQuery = '';
function ftRenderCurrentResults(){
  const input = document.getElementById('ftFoodSearchInput');
  if(input && input.value.trim()) ftHandleSearchInput(input.value);
  else ftRenderDefaultResults();
}

function ftLocalResultsHTML(q){
  const {custom, base} = ftSearchLocal(q);
  let html = '';
  if(custom.length) html += ftSection('Eigene Lebensmittel', custom);
  if(base.length) html += ftSection('Basisliste', base);
  if(!custom.length && !base.length) html += `<div class="no-results">Keine Treffer in deiner Liste.</div>`;
  return html;
}
function ftShowLocalResultsOnly(q){
  const box = document.getElementById('ftSearchResults');
  if(!box) return;
  box.innerHTML = ftLocalResultsHTML(q) + `<div class="ft-section-label">Online-Datenbank</div><div class="loading-row">Tippe weiter oder warte kurz …</div>`;
  ftWireResultRows(box);
}

async function ftHandleSearchInput(q){
  ftLastQuery = q;
  const box = document.getElementById('ftSearchResults');
  if(!q.trim()){ ftRenderDefaultResults(); return; }
  box.innerHTML = ftLocalResultsHTML(q) + `<div class="ft-section-label">Online-Datenbank</div><div class="loading-row" id="ftOffLoadingRow">Suche läuft …</div>`;
  ftWireResultRows(box);

  const token = ++ftAddSheetSearchToken;
  const { results: offResults, reason } = await ftOffSearch(q);
  if(token !== ftAddSheetSearchToken || ftLastQuery !== q) return; // veraltete Antwort
  const loadingRow = document.getElementById('ftOffLoadingRow');
  if(!loadingRow) return;
  if(offResults.length){
    // Gleiches Prinzip wie ftRankFoods() für die lokalen Treffer: schon getrackte Online-
    // Ergebnisse zuerst, nach Häufigkeit sortiert.
    const sorted = offResults.slice().sort((a,b) => (ftFoodUsageCount[b.id]||0) - (ftFoodUsageCount[a.id]||0));
    loadingRow.outerHTML = sorted.map(ftResultRowHTML).join('');
  } else if(reason === 'offline'){
    // Echtes "kein Internet" (navigator.onLine meldet false, siehe ftOffSearch()).
    loadingRow.outerHTML = `<div class="no-results">Offline — nur lokale Treffer verfügbar.</div>`;
  } else if(reason === 'unreachable'){
    // Anfrage kam nicht durch, OBWOHL der Browser eine Verbindung meldet (z. B. CORS-Hänger,
    // kurzzeitiger API-Ausfall, DNS-Filterung einzelner Subdomains) — das fälschlich als
    // "Offline" zu bezeichnen, hätte den Nutzer nur auf die falsche Fährte geschickt, wenn
    // seine Internetverbindung nachweislich in Ordnung war.
    loadingRow.outerHTML = `<div class="no-results">Online-Datenbank gerade nicht erreichbar — nur lokale Treffer.</div>`;
  } else {
    loadingRow.outerHTML = `<div class="no-results">Keine Online-Treffer.</div>`;
  }
  ftWireResultRows(box);
}

/* ============ Mengen-Modal ============ */
// Siehe Verwendung in ftOpenQuantityModal(): merkt sich beim Fokussieren eines Mengenfelds
// dessen aktuellen Wert und leert das Feld sofort, damit direkt losgetippt werden kann statt
// erst die Vorbelegung markieren/löschen zu müssen. Bleibt das Feld beim Verlassen leer (kein
// neuer Wert eingegeben), wird der gemerkte Wert wiederhergestellt.
function ftWireClearOnFocus(input, onRestore){
  let rememberedValue = input.value;
  input.addEventListener('focus', () => {
    rememberedValue = input.value;
    input.value = '';
  });
  input.addEventListener('blur', () => {
    if (input.value.trim() === ''){
      input.value = rememberedValue;
      if (onRestore) onRestore();
    }
  });
}

let ftQtyContext = null; // {food}
// opts (optional) erlaubt die Wiederverwendung dieses Dialogs außerhalb des normalen
// Tages-Eintrags-Flows — z.B. beim Bearbeiten der ZUTATEN einer gespeicherten Mahlzeit-
// Vorlage (siehe ftOpenEditSavedMealSheet(), 15b-food-day.js): opts.onSave(amountG, mode,
// pieceCount) ersetzt dann das Standard-ftAddEntryToMeal()/ftUpdateEntryInMeal(), opts.onDelete
// ersetzt das Standard-ftRemoveEntry(). Ohne opts verhält sich alles exakt wie zuvor.
function ftOpenQuantityModal(food, editCtx, opts){
  if(!food) return;
  const { onSave, onDelete } = opts || {};
  ftQtyContext = {food};
  const hasPiece = !!food.piece;
  const isEdit = !!editCtx;
  // Vorbelegung: beim Bearbeiten eines bestehenden Eintrags dessen Menge, sonst — falls
  // dieses Lebensmittel schon einmal hinzugefügt wurde — die zuletzt dafür verwendete Menge
  // (ftLastAmounts, siehe ftRememberAmount()) statt starr 100 g/1 Stück. "piece" nur
  // übernehmen, wenn dieses Lebensmittel überhaupt eine Stück-Option hat.
  const remembered = !isEdit ? ftLastAmounts[food.id] : null;
  const rememberedMode = remembered && remembered.unitMode === 'piece' && hasPiece ? 'piece' : (remembered ? 'g' : null);
  const startMode = isEdit ? (editCtx.unitMode === 'piece' ? 'piece' : 'g') : (rememberedMode || 'g');
  const startG = isEdit ? (editCtx.unitMode === 'g' ? editCtx.amountG : 100)
    : (rememberedMode === 'g' ? remembered.amountG : 100);
  const startPiece = isEdit ? (editCtx.unitMode === 'piece' ? editCtx.pieceCount : 1)
    : (rememberedMode === 'piece' ? remembered.pieceCount : 1);
  ftOpenOverlay(`
    <div class="modal" id="ftQtyModal">
      <div class="modal-head"><div class="modal-title">${ftEscapeHTML(food.name)}</div><button class="sheet-close" id="ftQtyClose">${ftIconX()}</button></div>
      <div class="modal-body">
        ${hasPiece ? `
        <div class="unit-toggle">
          <button id="ftUnitG">Gramm</button>
          <button id="ftUnitPiece">${ftEscapeHTML(food.piece.label.replace(/^1\s*/,''))}</button>
        </div>` : ''}
        <div id="ftQtyGramBlock" class="${startMode==='g' ? '' : 'hidden'}">
          <div class="qty-row">
            <button class="qty-btn" id="ftGMinus">–</button>
            <input class="qty-input" id="ftGInput" type="number" inputmode="decimal" value="${startG}">
            <button class="qty-btn" id="ftGPlus">+</button>
          </div>
        </div>
        <div id="ftQtyPieceBlock" class="${startMode==='piece' ? '' : 'hidden'}">
          <div class="qty-row">
            <button class="qty-btn" id="ftPMinus">–</button>
            <input class="qty-input" id="ftPInput" type="number" inputmode="decimal" step="0.5" value="${startPiece}">
            <button class="qty-btn" id="ftPPlus">+</button>
          </div>
        </div>
        <div class="qty-preview" id="ftQtyPreview"></div>
        <button class="ft-btn-primary" id="ftQtyAddBtn">${isEdit ? 'Aktualisieren' : 'Hinzufügen'}</button>
        ${isEdit ? `<button class="ft-btn-ghost" id="ftQtyDeleteBtn" style="color:var(--danger); border-color:var(--danger)">Eintrag löschen</button>` : ''}
      </div>
    </div>
  `, {type:'modal'});
  document.getElementById('ftQtyClose').onclick = ftCloseOverlay;
  if(hasPiece){
    document.getElementById(startMode==='g' ? 'ftUnitG' : 'ftUnitPiece').classList.add('active');
  }
  const gInput = document.getElementById('ftGInput');
  const pInput = document.getElementById('ftPInput');
  let mode = startMode;
  function updatePreview(){
    const amountG = mode==='g' ? (parseFloat(gInput.value)||0) : (parseFloat(pInput.value)||0) * food.piece.g;
    const factor = amountG/100;
    const kcal = Math.round(food.kcal*factor);
    const p = Math.round(food.p*factor*10)/10;
    const c = Math.round(food.c*factor*10)/10;
    const f = Math.round(food.f*factor*10)/10;
    // Ballaststoffe/Zucker/Salz nur einblenden, wenn für DIESES Lebensmittel überhaupt Werte
    // hinterlegt sind (siehe ftNormalizeOFF()/ftOpenCustomFoodForm()) — bewusst als
    // zusätzliche, kleine/unauffällige Zeile UNTER kcal/Makros statt gleichrangig daneben,
    // da diese Werte für die meisten Lebensmittel (v. a. die Basisliste) gar nicht vorliegen.
    const extraParts = [];
    if (food.fiber !== undefined) extraParts.push(`Ballaststoffe ${Math.round(food.fiber*factor*10)/10}g`);
    if (food.sugar !== undefined) extraParts.push(`Zucker ${Math.round(food.sugar*factor*10)/10}g`);
    if (food.salt !== undefined) extraParts.push(`Salz ${Math.round(food.salt*factor*100)/100}g`);
    document.getElementById('ftQtyPreview').innerHTML = `
      <div class="qty-preview-kcal">${kcal} kcal</div>
      <div class="qty-preview-macros"><span>P ${p}g</span><span>K ${c}g</span><span>F ${f}g</span></div>
      ${extraParts.length ? `<div class="qty-preview-extra">${extraParts.join(' · ')}</div>` : ''}
    `;
  }
  gInput.addEventListener('input', updatePreview);
  pInput.addEventListener('input', updatePreview);
  // Feld beim Antippen leeren statt den vorbelegten Wert (100 g bzw. 1 Stück) stehen zu
  // lassen — sonst müsste man ihn erst mühsam markieren/löschen, bevor man selbst tippen
  // kann. Wird das Feld leer verlassen (kein neuer Wert eingegeben), springt es beim
  // Verlassen auf den zuletzt gültigen Wert zurück, damit die Vorschau/das Hinzufügen
  // nicht plötzlich auf 0 stehen.
  ftWireClearOnFocus(gInput, updatePreview);
  ftWireClearOnFocus(pInput, updatePreview);
  document.getElementById('ftGMinus').onclick = ()=>{ gInput.value = Math.max(0,(parseFloat(gInput.value)||0)-10); updatePreview(); };
  document.getElementById('ftGPlus').onclick = ()=>{ gInput.value = (parseFloat(gInput.value)||0)+10; updatePreview(); };
  if(hasPiece){
    document.getElementById('ftPMinus').onclick = ()=>{ pInput.value = Math.max(0,(parseFloat(pInput.value)||0)-0.5); updatePreview(); };
    document.getElementById('ftPPlus').onclick = ()=>{ pInput.value = (parseFloat(pInput.value)||0)+0.5; updatePreview(); };
    document.getElementById('ftUnitG').onclick = ()=>{
      mode='g'; document.getElementById('ftUnitG').classList.add('active'); document.getElementById('ftUnitPiece').classList.remove('active');
      document.getElementById('ftQtyGramBlock').classList.remove('hidden'); document.getElementById('ftQtyPieceBlock').classList.add('hidden');
      updatePreview();
    };
    document.getElementById('ftUnitPiece').onclick = ()=>{
      mode='piece'; document.getElementById('ftUnitPiece').classList.add('active'); document.getElementById('ftUnitG').classList.remove('active');
      document.getElementById('ftQtyPieceBlock').classList.remove('hidden'); document.getElementById('ftQtyGramBlock').classList.add('hidden');
      updatePreview();
    };
  }
  updatePreview();
  document.getElementById('ftQtyAddBtn').onclick = ()=>{
    const amountG = mode==='g' ? (parseFloat(gInput.value)||0) : (parseFloat(pInput.value)||0) * food.piece.g;
    if(amountG<=0){ ftToast('Bitte eine Menge angeben'); return; }
    const pieceCount = mode==='piece' ? (parseFloat(pInput.value)||0) : null;
    if(onSave){
      onSave(amountG, mode, pieceCount);
    } else if(isEdit){
      ftUpdateEntryInMeal(editCtx.meal, editCtx.entryId, food, amountG, mode, pieceCount);
    } else {
      ftAddEntryToMeal(food, amountG, mode, pieceCount);
    }
    ftCloseOverlay();
  };
  if(isEdit){
    document.getElementById('ftQtyDeleteBtn').onclick = ()=>{
      ftCloseOverlay();
      if(onDelete) onDelete(); else ftRemoveEntry(editCtx.meal, editCtx.entryId);
    };
  }
}

function ftOpenEditEntryModal(meal, entryId){
  const entry = ftGetDay(ftCurrentDate)[meal].find(e=>e.id===entryId);
  if(!entry) return;
  const food = ftGetFoodById(entry.sourceFoodId);
  if(!food){ ftToast('Lebensmittel nicht mehr verfügbar — nur Löschen möglich'); return; }
  ftOpenQuantityModal(food, {
    meal, entryId,
    amountG: entry.amountG,
    unitMode: entry.unitMode,
    pieceCount: entry.pieceCount,
  });
}

function ftUpdateEntryInMeal(meal, entryId, food, amountG, mode, pieceCount){
  const day = ftGetDay(ftCurrentDate);
  const entry = day[meal].find(e=>e.id===entryId);
  if(!entry) return;
  // Ein online gefundenes Lebensmittel muss beim Bearbeiten genauso dauerhaft gespeichert
  // werden wie beim erstmaligen Hinzufügen (siehe ftAddEntryToMeal() unten) — theoretisch
  // könnte "food" hier aus einem noch nicht persistierten ftOffMemCache-Treffer stammen, falls
  // der Eintrag in derselben Sitzung über einen frischen Suchtreffer bearbeitet wurde.
  ftPersistOffFoodIfNeeded(food);
  const factor = amountG/100;
  entry.kcal = food.kcal*factor; entry.p = food.p*factor; entry.c = food.c*factor; entry.f = food.f*factor;
  // fiber/sugar/salt (Ballaststoffe/Zucker/Salz) sind OPTIONALE Zusatzwerte — nicht jedes
  // Lebensmittel (v. a. die kuratierte Basisliste) hat sie hinterlegt, siehe food-data.js.
  // Fehlen sie am Lebensmittel, wird der Eintrag hier bewusst NICHT auf 0 gesetzt, sondern
  // bleibt undefined — sonst würde ein Update eines Eintrags mit z. B. 3g Ballaststoffen
  // (ursprünglich von OpenFoodFacts übernommen) diese beim Bearbeiten fälschlich auf 0
  // zurücksetzen, nur weil "food" hier evtl. aus einem anderen Kontext ohne diese Felder kommt.
  if (food.fiber !== undefined) entry.fiber = food.fiber*factor; else delete entry.fiber;
  if (food.sugar !== undefined) entry.sugar = food.sugar*factor; else delete entry.sugar;
  if (food.salt !== undefined) entry.salt = food.salt*factor; else delete entry.salt;
  entry.amountG = Math.round(amountG);
  entry.unitMode = mode;
  entry.pieceCount = pieceCount;
  ftSaveDays(ftCurrentDate);
  ftRememberAmount(food.id, mode, amountG, pieceCount);
  renderFoodTracker();
}

// Merkt sich die zuletzt für dieses Lebensmittel verwendete Menge (siehe Vorbelegung in
// ftOpenQuantityModal()) — wird bei jedem Hinzufügen/Bearbeiten eines Eintrags aktualisiert,
// die zuletzt eingegebene Menge zählt also, nicht die allererste.
function ftRememberAmount(foodId, unitMode, amountG, pieceCount){
  ftLastAmounts[foodId] = { unitMode, amountG: Math.round(amountG), pieceCount };
  ftSave('lastAmounts', ftLastAmounts);
}

function ftAddEntryToMeal(food, amountG, mode, pieceCount){
  // Ein online gefundenes Lebensmittel wird erst JETZT, beim tatsächlichen Hinzufügen, aus dem
  // rein flüchtigen Suchtreffer-Cache in den persistenten Cache übernommen (siehe
  // ftPersistOffFoodIfNeeded(), 15a-food-core.js) — vorher lag es nur in ftOffMemCache.
  ftPersistOffFoodIfNeeded(food);
  const factor = amountG/100;
  const entry = {
    id: 'e_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
    name: food.brand ? `${food.name} (${food.brand})` : food.name,
    sourceFoodId: food.id,
    kcal: food.kcal*factor, p: food.p*factor, c: food.c*factor, f: food.f*factor,
    amountG: Math.round(amountG),
    unitMode: mode,
    pieceLabel: food.piece ? food.piece.label.replace(/^1\s*/,'') : null,
    pieceCount: pieceCount,
    ts: Date.now(),
  };
  // Ballaststoffe/Zucker/Salz nur übernehmen, wenn das Lebensmittel sie überhaupt hinterlegt
  // hat (siehe Kommentar in ftUpdateEntryInMeal()) — sonst fehlt das Feld am Eintrag komplett,
  // statt fälschlich 0 zu suggerieren.
  if (food.fiber !== undefined) entry.fiber = food.fiber*factor;
  if (food.sugar !== undefined) entry.sugar = food.sugar*factor;
  if (food.salt !== undefined) entry.salt = food.salt*factor;
  const day = ftGetDay(ftCurrentDate);
  day[ftAddSheetMeal].push(entry);
  ftSaveDays(ftCurrentDate);
  ftUpdateRecent(ftAddSheetMeal, food.id);
  ftRememberAmount(food.id, mode, amountG, pieceCount);
  ftBumpUsageCount(food.id);
  // Bleibt auf der "Lebensmittel hinzufügen"-Seite (statt wie früher beim Sheet-Overlay
  // automatisch zur Tagesansicht zurückzukehren) — so lässt sich direkt das nächste
  // Lebensmittel für dieselbe Mahlzeit hinzufügen, ohne die Seite jedes Mal neu öffnen zu
  // müssen. Suchfeld wird geleert und die Standardliste (jetzt mit dem frischen "Zuletzt"-
  // Eintrag) neu aufgebaut; die Tagesansicht selbst aktualisiert sich automatisch, sobald man
  // über den Zurück-Pfeil dorthin zurückkehrt (renderFoodTracker() liest ftDays neu ein).
  const input = document.getElementById('ftFoodSearchInput');
  if (input) input.value = '';
  ftRenderDefaultResults();
  ftToast('Hinzugefügt');
}
function ftUpdateRecent(meal, foodId){
  let list = ftRecent[meal] || [];
  list = list.filter(id=>id!==foodId);
  list.unshift(foodId);
  ftRecent[meal] = list.slice(0,8);
  ftSave('recent', ftRecent);
}

/* ============ Eigenes Lebensmittel ============
   Optionaler Parameter prefillBarcode: wird gesetzt, wenn dieses Formular aus einem nicht in
   der Online-Datenbank gefundenen ODER wegen einer fehlgeschlagenen Anfrage nicht abfragbaren
   Scan heraus geöffnet wurde (siehe ftHandleScannedCode()) — der Barcode wird dann am
   gespeicherten Lebensmittel hinterlegt (food.barcode), damit derselbe Code beim nächsten Scan
   sofort wiedererkannt wird, ohne die Werte erneut eingeben zu müssen. Dritter optionaler
   Parameter failReason ('offline'|'unreachable', nur relevant wenn prefillBarcode gesetzt ist)
   steuert NUR den angezeigten Hinweistext: bei 'offline' steht wirklich kein Internet zur
   Verfügung (navigator.onLine meldet false); bei 'unreachable' kam die Anfrage aus einem
   anderen Grund nicht durch (z. B. kurzzeitiger API-Ausfall), OBWOHL eine Verbindung besteht —
   das fälschlich als "kein Internet" zu bezeichnen, würde den Nutzer nur auf die falsche
   Fährte schicken. */
function ftOpenCustomFoodForm(prefillBarcode, failReason){
  const titleByReason = { offline: 'Kein Internet', unreachable: 'Nicht erreichbar' };
  const hintByReason = {
    offline: `Keine Verbindung — Barcode ${ftEscapeHTML(prefillBarcode)} konnte nicht abgefragt werden. Trag die Werte einmalig ein, oder scanne erneut, sobald du wieder online bist.`,
    unreachable: `Barcode ${ftEscapeHTML(prefillBarcode)} konnte gerade nicht abgefragt werden (Online-Datenbank momentan nicht erreichbar). Trag die Werte einmalig ein, oder scanne später erneut.`,
  };
  ftOpenOverlay(`
    <div class="sheet" id="ftCustomSheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head"><div class="sheet-title">${prefillBarcode ? (titleByReason[failReason] || 'Produkt nicht gefunden') : 'Eigenes Lebensmittel'}</div><button class="sheet-close" id="ftCustomClose">${ftIconX()}</button></div>
      <div class="sheet-body">
        ${prefillBarcode ? `<div class="no-results" style="text-align:left; padding:0 4px 14px;">${
          hintByReason[failReason] || `Barcode ${ftEscapeHTML(prefillBarcode)} ist nicht in der Online-Datenbank hinterlegt. Trag die Werte einmalig ein — beim nächsten Scan dieses Codes erkennt die App das Produkt dann automatisch.`
        }</div>` : ''}
        <div class="field-label">Name</div>
        <input class="text-input" id="ftCfName" placeholder="z. B. Mamas Linsensuppe">
        <div class="field-label">kcal pro 100 g</div>
        <input class="text-input" id="ftCfKcal" type="number" inputmode="decimal">
        <div class="field-label">Protein (g/100g)</div>
        <input class="text-input" id="ftCfP" type="number" inputmode="decimal">
        <div class="field-label">Kohlenhydrate (g/100g)</div>
        <input class="text-input" id="ftCfC" type="number" inputmode="decimal">
        <div class="field-label">Fett (g/100g)</div>
        <input class="text-input" id="ftCfF" type="number" inputmode="decimal">
        <div class="field-label">Stückgewicht (optional, in g)</div>
        <input class="text-input" id="ftCfPieceG" type="number" inputmode="decimal" placeholder="z. B. 55">
        <button type="button" class="ft-optional-toggle" id="ftCfMoreToggle">+ Weitere Nährwerte (optional)</button>
        <div id="ftCfMoreFields" class="hidden">
          <div class="field-label">Ballaststoffe (g/100g)</div>
          <input class="text-input" id="ftCfFiber" type="number" inputmode="decimal">
          <div class="field-label">Zucker (g/100g)</div>
          <input class="text-input" id="ftCfSugar" type="number" inputmode="decimal">
          <div class="field-label">Salz (g/100g)</div>
          <input class="text-input" id="ftCfSalt" type="number" inputmode="decimal">
        </div>
        <button class="ft-btn-primary" id="ftCfSave" style="margin-top:18px">Speichern</button>
      </div>
    </div>
  `);
  document.getElementById('ftCustomClose').onclick = ftCloseOverlay;
  document.getElementById('ftCfMoreToggle').onclick = (ev) => {
    const el = document.getElementById('ftCfMoreFields');
    const nowHidden = el.classList.toggle('hidden');
    ev.currentTarget.textContent = nowHidden ? '+ Weitere Nährwerte (optional)' : '– Weitere Nährwerte ausblenden';
  };
  document.getElementById('ftCfSave').onclick = ()=>{
    const name = document.getElementById('ftCfName').value.trim();
    const kcal = parseFloat(document.getElementById('ftCfKcal').value);
    if(!name || isNaN(kcal)){ ftToast('Name und kcal sind Pflicht'); return; }
    const pieceG = parseFloat(document.getElementById('ftCfPieceG').value);
    const food = {
      id: 'c_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
      name,
      kcal,
      p: parseFloat(document.getElementById('ftCfP').value)||0,
      c: parseFloat(document.getElementById('ftCfC').value)||0,
      f: parseFloat(document.getElementById('ftCfF').value)||0,
      piece: (!isNaN(pieceG) && pieceG>0) ? {label:'1 '+name, g:pieceG} : null,
      barcode: prefillBarcode || null,
    };
    // Ballaststoffe/Zucker/Salz bleiben unausgefüllt = "nicht bekannt" (Feld fehlt komplett),
    // nicht "0" — sonst würde ein einfach leer gelassenes Feld später fälschlich als "enthält
    // 0g Zucker" gewertet, statt als "dazu liegt keine Angabe vor" (siehe ftComputeTotals()
    // etc., die fehlende Felder korrekt einfach überspringen).
    const fiber = parseFloat(document.getElementById('ftCfFiber').value);
    const sugar = parseFloat(document.getElementById('ftCfSugar').value);
    const salt = parseFloat(document.getElementById('ftCfSalt').value);
    if(!isNaN(fiber)) food.fiber = fiber;
    if(!isNaN(sugar)) food.sugar = sugar;
    if(!isNaN(salt)) food.salt = salt;
    ftCustomFoods.push(food);
    ftSave('customFoods', ftCustomFoods);
    ftOpenQuantityModal(food);
  };
}

/* ============ Mahlzeit speichern & anwenden ============ */
function ftOpenSaveMealPrompt(meal){
  ftOpenOverlay(`
    <div class="modal" id="ftSaveMealModal">
      <div class="modal-head"><div class="modal-title">Als Mahlzeit speichern</div><button class="sheet-close" id="ftSmClose">${ftIconX()}</button></div>
      <div class="modal-body">
        <div class="field-label">Name</div>
        <input class="text-input" id="ftSmName" placeholder="z. B. Porridge Standard">
        <button class="ft-btn-primary" id="ftSmSave" style="margin-top:16px">Speichern</button>
      </div>
    </div>
  `, {type:'modal'});
  document.getElementById('ftSmClose').onclick = ftCloseOverlay;
  document.getElementById('ftSmSave').onclick = ()=>{
    const name = document.getElementById('ftSmName').value.trim();
    if(!name){ ftToast('Bitte einen Namen eingeben'); return; }
    const entries = ftGetDay(ftCurrentDate)[meal];
    // Gruppierte Mahlzeiten-Einträge (kind:'mealGroup') haben kein eigenes sourceFoodId/
    // amountG — beim Speichern als (neue) Mahlzeit werden sie stattdessen in ihre einzelnen,
    // mit der getrackten Portion skalierten Zutaten aufgelöst, statt einen kaputten Eintrag
    // ohne sourceFoodId zu erzeugen. Enthält der Tag z.B. "Porridge Standard" (0,5 Portion)
    // plus eine Banane und man speichert das als neue Mahlzeit, landen beide Haferflocken-
    // Zutaten UND die Banane als eigenständige Positionen in der neuen Mahlzeit.
    const items = [];
    entries.forEach(e => {
      if(e.kind === 'mealGroup'){
        (e.items||[]).forEach(i => items.push({
          sourceFoodId: i.sourceFoodId, amountG: Math.round(i.amountG*e.portion), unitMode: i.unitMode,
          pieceCount: i.pieceCount !== null && i.pieceCount !== undefined ? i.pieceCount*e.portion : i.pieceCount,
        }));
        return;
      }
      items.push({ sourceFoodId: e.sourceFoodId, amountG: e.amountG, unitMode: e.unitMode, pieceCount: e.pieceCount });
    });
    ftSavedMeals.push({id:'m_'+Date.now(), name, items});
    ftSave('savedMeals', ftSavedMeals);
    ftCloseOverlay();
    ftToast('Mahlzeit gespeichert');
  };
}
// Löst eine gespeicherte Mahlzeit gegen die AKTUELLEN Lebensmitteldaten auf (Basis-Items mit
// eingefrorenen kcal/p/c/f für die hinterlegte Menge) — gemeinsam genutzt vom interaktiven Pfad
// (ftApplySavedMeal(), fragt danach noch nach der Portion) und vom automatischen Tages-Eintrag
// (ftApplyAutoMealsForNewDay(), 15a-food-core.js, immer Portion 1×, keine Nachfrage möglich).
function ftResolveSavedMealItems(sm){
  let missing = 0;
  const baseItems = [];
  sm.items.forEach(item => {
    const food = ftGetFoodById(item.sourceFoodId);
    if(!food){ missing++; return; }
    const factor = item.amountG/100;
    const bi = {
      sourceFoodId: food.id,
      name: food.brand ? `${food.name} (${food.brand})` : food.name,
      unitMode: item.unitMode,
      amountG: Math.round(item.amountG),
      pieceCount: item.pieceCount,
      pieceLabel: food.piece ? food.piece.label.replace(/^1\s*/,'') : null,
      kcal: food.kcal*factor, p: food.p*factor, c: food.c*factor, f: food.f*factor,
    };
    if (food.fiber !== undefined) bi.fiber = food.fiber*factor;
    if (food.sugar !== undefined) bi.sugar = food.sugar*factor;
    if (food.salt !== undefined) bi.salt = food.salt*factor;
    baseItems.push(bi);
  });
  return { baseItems, missing };
}
function ftApplySavedMeal(mealId){
  const sm = ftSavedMeals.find(m=>m.id===mealId);
  if(!sm) return;
  // Löst die Vorlage einmalig gegen die AKTUELLEN Lebensmitteldaten auf (analog zum
  // bisherigen Verhalten) — das Ergebnis wird gleich als frisches Zutaten-Snapshot in den
  // neuen gruppierten Eintrag (kind:'mealGroup') eingefroren, ändert sich also NICHT mehr
  // rückwirkend, falls sich die Nährwerte des zugrundeliegenden Lebensmittels später ändern
  // (gleiches Prinzip wie bei normalen Einträgen, siehe ftAddEntryToMeal()).
  const { baseItems, missing } = ftResolveSavedMealItems(sm);
  if(!baseItems.length){ ftToast('Zutaten dieser Mahlzeit sind nicht mehr auffindbar'); return; }
  // Vor dem eigentlichen Hinzufügen erst kurz nach der Portion fragen (0,25/0,5/0,75/1×
  // Voreinstellungen oder frei), statt immer starr die volle Vorlage zu übernehmen — siehe
  // ftOpenPortionModal() weiter unten.
  ftOpenPortionModal({
    title: sm.name,
    baseItems,
    initialPortion: 1,
    confirmLabel: 'Hinzufügen',
    onConfirm: (portion) => {
      ftAddMealGroupEntry(sm.name, sm.id, baseItems, portion);
      ftCloseOverlay();
      ftToast(missing ? `Hinzugefügt · ${missing} Zutat${missing>1?'en':''} nicht mehr auffindbar` : 'Mahlzeit hinzugefügt');
    },
  });
}
// Baut den gruppierten Mahlzeiten-Eintrag (kind:'mealGroup') OHNE ihn irgendwo einzuhängen —
// das übernimmt der jeweilige Aufrufer (ftAddMealGroupEntry() für den interaktiven Pfad,
// ftApplyAutoMealsForNewDay() für den automatischen). Items bleiben als BASIS (Portion=1)
// gespeichert; kcal/p/c/f am Eintrag selbst sind das eingefrorene, mit der Portion
// multiplizierte Endergebnis — dieselben Felder, die ftComputeTotals()/ftMealTotal()
// (15a-food-core.js) ohnehin von jedem Eintrag lesen, daher funktionieren Tagessummen etc.
// ohne jede Anpassung dort.
function ftBuildMealGroupEntry(name, savedMealId, baseItems, portion){
  const sums = ftSumItemMacros(baseItems);
  const entry = {
    id: 'g_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
    kind: 'mealGroup',
    name,
    savedMealId: savedMealId || null,
    portion,
    items: baseItems,
    kcal: sums.kcal*portion, p: sums.p*portion, c: sums.c*portion, f: sums.f*portion,
    ts: Date.now(),
  };
  if (sums.fiber !== undefined) entry.fiber = sums.fiber*portion;
  if (sums.sugar !== undefined) entry.sugar = sums.sugar*portion;
  if (sums.salt !== undefined) entry.salt = sums.salt*portion;
  baseItems.forEach(bi => {
    const food = ftGetFoodById(bi.sourceFoodId);
    if(food){ ftPersistOffFoodIfNeeded(food); ftBumpUsageCount(food.id); }
  });
  return entry;
}
function ftAddMealGroupEntry(name, savedMealId, baseItems, portion){
  const entry = ftBuildMealGroupEntry(name, savedMealId, baseItems, portion);
  ftGetDay(ftCurrentDate)[ftAddSheetMeal].push(entry);
  ftSaveDays(ftCurrentDate);
  // Wie ftAddEntryToMeal(): bleibt auf der "Lebensmittel hinzufügen"-Seite (kein Overlay mehr
  // zu schließen, seit diese Seite kein Sheet mehr ist, siehe renderFtAddFood()) und baut die
  // Ergebnisliste einfach neu auf.
  ftRenderDefaultResults();
}
// Trägt die in den Einstellungen konfigurierten Auto-Mahlzeiten (ftAutoMeals, 15a-food-core.js)
// für einen frisch entstandenen Tag ein — aufgerufen aus initFoodTracker() für "heute", NICHT
// für beliebig durchgeblätterte andere Tage (siehe dortiger Kommentar). Rein additiv: bereits
// vorhandene Einträge des Tages bleiben unangetastet, es wird nur ergänzt.
function ftApplyAutoMealsForNewDay(iso){
  let changed = false;
  const day = ftGetDay(iso);
  FT_MEAL_KEYS.forEach(meal => {
    const savedMealId = ftAutoMeals[meal];
    if(!savedMealId) return;
    const sm = ftSavedMeals.find(m=>m.id===savedMealId);
    if(!sm) return;
    const { baseItems } = ftResolveSavedMealItems(sm);
    if(!baseItems.length) return;
    day[meal].push(ftBuildMealGroupEntry(sm.name, sm.id, baseItems, 1));
    changed = true;
  });
  if(changed) ftSaveDays(iso);
}
// ftUpdateMealGroupPortion() (15b-food-day.js, Portion nachträglich ändern).
function ftSumItemMacros(items){
  const sums = {kcal:0, p:0, c:0, f:0};
  items.forEach(i => {
    sums.kcal += i.kcal; sums.p += i.p; sums.c += i.c; sums.f += i.f;
    if(i.fiber !== undefined) sums.fiber = (sums.fiber||0) + i.fiber;
    if(i.sugar !== undefined) sums.sugar = (sums.sugar||0) + i.sugar;
    if(i.salt !== undefined) sums.salt = (sums.salt||0) + i.salt;
  });
  return sums;
}
// Portions-Auswahl/-Bearbeitung für gruppierte Mahlzeiten-Einträge — EIN gemeinsamer Dialog
// für zwei Aufrufer: ftApplySavedMeal() oben (erstmaliges Hinzufügen, baseItems frisch aus den
// aktuellen Lebensmitteldaten aufgelöst) und ftOpenMealGroupDetail() (15b-food-day.js,
// nachträgliches Ändern eines bereits getrackten Eintrags, baseItems = dessen eingefrorenes
// items[]). Voreingestellte Bruchteile (1/4, 1/2, 3/4, 1×, 1,5×, 2×) plus ein frei editierbares
// Feld darunter für jeden anderen Wert — Vorschau (kcal/Makros) und Zutatenliste aktualisieren
// sich live mit der gewählten Portion.
const FT_PORTION_PRESETS = [0.25, 0.5, 0.75, 1];
function ftOpenPortionModal(opts){
  const { title, baseItems, initialPortion, confirmLabel, onConfirm, onDelete } = opts;
  const sums = ftSumItemMacros(baseItems);
  ftOpenOverlay(`
    <div class="modal" id="ftPortionModal">
      <div class="modal-head"><div class="modal-title">${ftEscapeHTML(title)}</div><button class="sheet-close" id="ftPortionClose">${ftIconX()}</button></div>
      <div class="modal-body">
        <div class="field-label" style="margin-top:0;">Portion</div>
        <div class="portion-picker" id="ftPortionPicker">
          ${FT_PORTION_PRESETS.map(p=>`<button type="button" class="portion-pill" data-portion="${p}">${ftPortionLabel(p)}</button>`).join('')}
        </div>
        <div class="qty-row">
          <button class="qty-btn" id="ftPortionMinus">–</button>
          <input class="qty-input" id="ftPortionInput" type="number" inputmode="decimal" step="0.25" value="${initialPortion}">
          <button class="qty-btn" id="ftPortionPlus">+</button>
        </div>
        <div class="qty-preview" id="ftPortionPreview"></div>
        <div class="field-label">Zutaten</div>
        <div id="ftPortionItemsList"></div>
        <button class="ft-btn-primary" id="ftPortionConfirmBtn" style="margin-top:16px;">${confirmLabel}</button>
        ${onDelete ? `<button class="ft-btn-ghost" id="ftPortionDeleteBtn" style="color:var(--danger); border-color:var(--danger)">Mahlzeit löschen</button>` : ''}
      </div>
    </div>
  `, {type:'modal'});
  document.getElementById('ftPortionClose').onclick = ftCloseOverlay;
  const input = document.getElementById('ftPortionInput');
  function highlightPreset(portion){
    document.querySelectorAll('.portion-pill').forEach(btn=>{
      btn.classList.toggle('active', Math.abs(parseFloat(btn.dataset.portion)-portion) < 0.001);
    });
  }
  function update(){
    const portion = Math.max(0.05, parseFloat(input.value)||0);
    highlightPreset(portion);
    const kcal = Math.round(sums.kcal*portion);
    const p = Math.round(sums.p*portion*10)/10;
    const c = Math.round(sums.c*portion*10)/10;
    const f = Math.round(sums.f*portion*10)/10;
    document.getElementById('ftPortionPreview').innerHTML = `
      <div class="qty-preview-kcal">${kcal} kcal</div>
      <div class="qty-preview-macros"><span>P ${p}g</span><span>K ${c}g</span><span>F ${f}g</span></div>
    `;
    document.getElementById('ftPortionItemsList').innerHTML = baseItems.map(i=>{
      const qty = i.unitMode==='piece' ? `${ftFormatNum(i.pieceCount*portion)} × ${i.pieceLabel}` : `${Math.round(i.amountG*portion)} g`;
      return `<div class="food-row-sub" style="padding:5px 2px; border-bottom:1px solid var(--border);">${ftEscapeHTML(i.name)} — ${qty} · ${Math.round(i.kcal*portion)} kcal</div>`;
    }).join('');
  }
  input.addEventListener('input', update);
  ftWireClearOnFocus(input, update);
  document.getElementById('ftPortionMinus').onclick = ()=>{ input.value = Math.max(0.05, Math.round(((parseFloat(input.value)||0)-0.25)*100)/100); update(); };
  document.getElementById('ftPortionPlus').onclick = ()=>{ input.value = Math.round(((parseFloat(input.value)||0)+0.25)*100)/100; update(); };
  document.querySelectorAll('.portion-pill').forEach(btn=>{
    btn.onclick = ()=>{ input.value = btn.dataset.portion; update(); };
  });
  update();
  document.getElementById('ftPortionConfirmBtn').onclick = ()=>{
    const portion = Math.max(0.05, parseFloat(input.value)||0);
    onConfirm(portion);
  };
  if(onDelete){
    document.getElementById('ftPortionDeleteBtn').onclick = ()=>{ ftCloseOverlay(); onDelete(); };
  }
}

/* ============ Barcode-Scanner ============ */
async function ftOpenScanner(){
  if(!('BarcodeDetector' in window)){
    ftOpenManualBarcodeEntry();
    return;
  }
  ftOpenOverlay(`
    <div class="modal" id="ftScanModal">
      <div class="modal-head"><div class="modal-title">Barcode scannen</div><button class="sheet-close" id="ftScanClose">${ftIconX()}</button></div>
      <div class="modal-body">
        <video id="ftScanVideo" playsinline autoplay muted style="width:100%; border-radius:12px; background:#000"></video>
        <div class="no-results" id="ftScanStatus">Kamera wird gestartet …</div>
        <button class="ft-btn-ghost" id="ftManualEntryBtn">Barcode manuell eingeben</button>
      </div>
    </div>
  `, {type:'modal'});
  document.getElementById('ftManualEntryBtn').onclick = ftOpenManualBarcodeEntry;
  const video = document.getElementById('ftScanVideo');
  let stream;
  try{
    stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    video.srcObject = stream;
  }catch(e){
    document.getElementById('ftScanStatus').textContent = 'Kamera nicht verfügbar. Bitte manuell eingeben.';
    document.getElementById('ftScanClose').onclick = ()=>{ ftStopStream(stream); ftCloseOverlay(); };
    return;
  }
  document.getElementById('ftScanClose').onclick = ()=>{ ftStopStream(stream); ftCloseOverlay(); };
  let detector;
  try{ detector = new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']}); }
  catch(e){ document.getElementById('ftScanStatus').textContent = 'Barcode-Scan wird nicht unterstützt.'; return; }
  let stopped = false;
  document.getElementById('ftScanStatus').textContent = 'Barcode ins Bild halten …';
  async function tick(){
    if(stopped) return;
    try{
      const codes = await detector.detect(video);
      if(codes.length){
        stopped = true;
        ftStopStream(stream);
        const code = codes[0].rawValue;
        ftCloseOverlay();
        await ftHandleScannedCode(code);
        return;
      }
    }catch(e){ /* ignorieren, weiter versuchen */ }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  const observer = new MutationObserver(()=>{
    if(!document.getElementById('ftScanModal')){ stopped = true; ftStopStream(stream); observer.disconnect(); }
  });
  observer.observe(ftOverlays, {childList:true});
}
function ftStopStream(stream){ if(stream) stream.getTracks().forEach(t=>t.stop()); }

function ftOpenManualBarcodeEntry(){
  ftOpenOverlay(`
    <div class="modal" id="ftManualBarcodeModal">
      <div class="modal-head"><div class="modal-title">Barcode eingeben</div><button class="sheet-close" id="ftMbClose">${ftIconX()}</button></div>
      <div class="modal-body">
        <input class="text-input" id="ftMbInput" inputmode="numeric" placeholder="z. B. 4001686107731">
        <button class="ft-btn-primary" id="ftMbSubmit" style="margin-top:14px">Suchen</button>
      </div>
    </div>
  `, {type:'modal'});
  document.getElementById('ftMbClose').onclick = ftCloseOverlay;
  document.getElementById('ftMbSubmit').onclick = async ()=>{
    const code = document.getElementById('ftMbInput').value.trim();
    if(!code) return;
    ftCloseOverlay();
    await ftHandleScannedCode(code);
  };
}
async function ftHandleScannedCode(code){
  // Zuerst gegen selbst angelegte Lebensmittel mit genau diesem Barcode prüfen (siehe
  // ftOpenCustomFoodForm() — dort wird der Code hinterlegt, wenn er beim vorigen Scan nicht
  // in der Online-Datenbank gefunden wurde) — spart bei bereits bekannten Codes den
  // Online-Umweg und erkennt sie sofort wieder.
  const known = ftCustomFoods.find(f => f.barcode === code);
  if (known){ ftOpenQuantityModal(known); return; }
  ftToast('Suche Produkt …');
  // ftOffByBarcode() (15a-food-core.js) liefert seit dem Bugfix immer {ok, ...} statt bei
  // Netzfehlern unbehandelt zu werfen — vorher blieb der Toast "Suche Produkt …" bei Offline/
  // API-Ausfall stumm stehen, ohne dass je eine Rückmeldung kam.
  const result = await ftOffByBarcode(code);
  if(!result.ok){
    // "notFound" (Barcode existiert nicht in der Datenbank), "offline" (wirklich kein Internet)
    // und "unreachable" (Anfrage kam trotz bestehender Verbindung nicht durch) bekommen
    // unterschiedliche Hinweistexte im Formular (siehe ftOpenCustomFoodForm()) — alle drei
    // öffnen aber direkt das Formular für ein eigenes Lebensmittel mit vorbelegtem Barcode,
    // statt den Nutzer nur mit einer Fehlermeldung stehen zu lassen.
    ftOpenCustomFoodForm(code, result.reason);
    return;
  }
  ftOpenQuantityModal(result.food);
}
