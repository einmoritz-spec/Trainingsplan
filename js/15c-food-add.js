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

function goFtAddFood(meal, push){
  if (push !== false) pushView('foodAddMeal', { meal });
  renderFtAddFood(meal);
}

function renderFtAddFood(meal){
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
  if(customList.length) html += ftSection('Eigene Lebensmittel', customList);
  html += `<div class="ft-section-label">Gespeicherte Mahlzeiten</div>` + ftSavedMealsListHTML();
  html += `<button class="ft-btn-ghost" id="ftNewCustomFoodBtn">+ Eigenes Lebensmittel anlegen</button>`;
  box.innerHTML = html || `<div class="no-results">Noch keine Favoriten oder zuletzt genutzten Lebensmittel.</div>` + `<button class="ft-btn-ghost" id="ftNewCustomFoodBtn">+ Eigenes Lebensmittel anlegen</button>`;
  ftWireResultRows(box);
  const newBtn = document.getElementById('ftNewCustomFoodBtn');
  // Bugfix: newBtn.onclick = ftOpenCustomFoodForm (direkte Referenz) hätte dem Handler den
  // Klick-Event als ersten Parameter übergeben — ftOpenCustomFoodForm(prefillBarcode) hätte
  // das MouseEvent-Objekt fälschlich als "prefillBarcode" interpretiert (truthy!), wodurch der
  // Titel fälschlich "Produkt nicht gefunden" gezeigt und ein kaputter Barcode-Wert am neuen
  // Lebensmittel hinterlegt worden wäre. Wrapper-Funktion ruft stattdessen ohne Argument auf.
  if(newBtn) newBtn.onclick = () => ftOpenCustomFoodForm();
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
function ftOpenQuantityModal(food, editCtx){
  if(!food) return;
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
    if(isEdit){
      ftUpdateEntryInMeal(editCtx.meal, editCtx.entryId, food, amountG, mode, pieceCount);
    } else {
      ftAddEntryToMeal(food, amountG, mode, pieceCount);
    }
    ftCloseOverlay();
  };
  if(isEdit){
    document.getElementById('ftQtyDeleteBtn').onclick = ()=>{
      ftCloseOverlay();
      ftRemoveEntry(editCtx.meal, editCtx.entryId);
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
    const items = entries.map(e=>({
      sourceFoodId: e.sourceFoodId, amountG: e.amountG, unitMode: e.unitMode, pieceCount: e.pieceCount,
    }));
    ftSavedMeals.push({id:'m_'+Date.now(), name, items});
    ftSave('savedMeals', ftSavedMeals);
    ftCloseOverlay();
    ftToast('Mahlzeit gespeichert');
  };
}
function ftApplySavedMeal(mealId){
  const sm = ftSavedMeals.find(m=>m.id===mealId);
  if(!sm) return;
  let added = 0;
  for(const item of sm.items){
    const food = ftGetFoodById(item.sourceFoodId);
    if(!food) continue;
    const factor = item.amountG/100;
    const entry = {
      id: 'e_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      name: food.brand ? `${food.name} (${food.brand})` : food.name,
      sourceFoodId: food.id,
      kcal: food.kcal*factor, p: food.p*factor, c: food.c*factor, f: food.f*factor,
      amountG: Math.round(item.amountG),
      unitMode: item.unitMode,
      pieceLabel: food.piece ? food.piece.label.replace(/^1\s*/,'') : null,
      pieceCount: item.pieceCount,
      ts: Date.now(),
    };
    if (food.fiber !== undefined) entry.fiber = food.fiber*factor;
    if (food.sugar !== undefined) entry.sugar = food.sugar*factor;
    if (food.salt !== undefined) entry.salt = food.salt*factor;
    ftPersistOffFoodIfNeeded(food);
    ftGetDay(ftCurrentDate)[ftAddSheetMeal].push(entry);
    ftBumpUsageCount(food.id);
    added++;
  }
  ftSaveDays(ftCurrentDate);
  // Wie ftAddEntryToMeal(): bleibt auf der "Lebensmittel hinzufügen"-Seite (kein Overlay mehr
  // zu schließen, seit diese Seite kein Sheet mehr ist, siehe renderFtAddFood()) und baut die
  // Ergebnisliste einfach neu auf.
  ftRenderDefaultResults();
  ftToast(added < sm.items.length ? 'Hinzugefügt · manche Zutaten waren nicht mehr auffindbar' : 'Mahlzeit hinzugefügt');
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
