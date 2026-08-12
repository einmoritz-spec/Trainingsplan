/* ---------------------------------------------------
   15-food-tracker.js
   ---------------------------------------------------
   Essenstracker-Feature, ursprünglich als eigenständige App gebaut (siehe
   Kommentare unten) und hier in den Trainingsplan angedockt. Das Feature
   ist standardmäßig AUSGEBLENDET (plan.foodTrackerEnabled, siehe
   isFoodTrackerEnabled()/renderSettings() in 10-plan-settings.js) —
   Button oben rechts neben "Trainingsplan" (renderHome(), 07-home.js) und
   der komplette Screen sind nur sichtbar, wenn es aktiv eingeschaltet ist.

   Beim Andocken bewusst entfernt/angepasst gegenüber der Standalone-Version:
   - EIGENES Theme-System (theme/ACCENT_COLORS/BG_NEUTRAL_COLORS/hexToHsv/
     hsvToHex/deriveSurfaceColors/applyTheme/saveTheme) komplett gestrichen —
     die App war von Anfang an bewusst mit identischer CSS-Variablen-
     Architektur gebaut (--bg/--surface/--surface-2/--border/--text/--muted/
     --accent), genau damit sie sich hier ohne Umbau an das bereits laufende
     Theme des Trainingsplans (applyTheme() in 02-state-theme.js) andocken
     lässt. Nur die zusätzlichen Makro-Farben (--protein/--carbs/--fat/
     --danger) wurden in css/styles.css mit übernommen, da es dafür im
     Trainingsplan noch keine Rollen gab. Die eigene Design-Sektion in den
     Einstellungen (Farbmodus/Akzent/Hintergrund) ist entsprechend
     weggefallen — das läuft jetzt über die normalen Trainingsplan-
     Einstellungen → Darstellung.
   - Persistenz von synchronem localStorage (load()/save()/LS) auf die
     bestehende asynchrone loadJSON()/saveJSON()-Kaskade (IndexedDB mit
     localStorage-Fallback, siehe 01-storage.js) umgestellt — eigene Keys
     ('food:days' etc.), damit es sich in dieselbe robuste Speicherstrategie
     einreiht wie der Rest der App. WICHTIG: läuft (noch) NICHT über
     window.storage/IndexedDB-Backup-Export der Einstellungen mit — eigener
     Export/Import-Button unten in diesem Screen bleibt der Weg für ein
     Essenstracker-Backup.
   - Eigenes Overlay-Grundgerüst (openOverlay()/closeOverlay(), einzelnes
     #overlays-Element in index.html) an das bestehende Android-/Browser-
     Zurück-Tasten-System angedockt (pushOverlayState()/
     popOverlayStateIfOpen()/overlayCloseStack, siehe 06-navigation.js) —
     exakt gleiches Muster wie z. B. openModeSettingsPrompt() in
     09b-start-select-mode-settings.js. Da die Standalone-App ohnehin immer
     nur EIN Overlay gleichzeitig zeigt (ein neuer openOverlay()-Aufruf
     ersetzt einen bereits offenen Sheet/Modal-Inhalt komplett, z. B.
     Mengen-Modal direkt über dem noch offenen "Hinzufügen"-Sheet), reicht
     ein einziger History-Eintrag pro Overlay-"Sitzung": openOverlay() pusht
     nur dann einen neuen Eintrag, wenn gerade noch keiner offen ist.
   - .section-label/.btn-primary/.btn-ghost in .ft-section-label/
     .ft-btn-primary/.ft-btn-ghost umbenannt (im CSS UND in allen Templates
     unten) — der Trainingsplan nutzt diese drei Klassennamen bereits selbst
     mit anderer Optik; ohne Umbenennung hätte das zuletzt geladene CSS
     (dieses hier) versehentlich AUCH die "Verlauf"-Kopfzeile, den "Training
     starten"-Button etc. auf jeder anderen Seite der App umgestylt.
   - render() → renderFoodTracker() umbenannt, Navigation über
     goFoodTracker()/case 'foodTracker' (06-navigation.js) statt eigenem
     Direktaufruf am Dateiende. Zurück-Button oben (wie renderSettings(),
     10-plan-settings.js) ruft history.back() auf statt fest goHome() —
     korrekt symmetrisch zu pushView('foodTracker') in goFoodTracker().
   - Ansonsten unverändert: kompletter Funktionsumfang (Tagesansicht mit
     Kalender-Vor-/Zurück, drei Mahlzeiten, Textsuche + Open-Food-Facts-
     Online-Suche + Barcode-Scanner, Favoriten, eigene Lebensmittel,
     gespeicherte Mahlzeiten, Mengen in Gramm oder "1 ganze(s) Stück").
--------------------------------------------------- */

/* ============ Persistenz ============
   Eigene loadJSON()/saveJSON()-Keys (siehe 01-storage.js), im Speicher
   ganz normal synchron gehalten wie im Rest der App (z. B. plan/sessions) —
   nur der initiale Ladevorgang (initFoodTracker()) und jedes Speichern
   selbst sind async. */
let ftDays = {};
let ftFavorites = []; // Array von Food-IDs
let ftCustomFoods = [];
let ftSavedMeals = [];
let ftRecent = { breakfast: [], lunch: [], dinner: [] };
let ftOffCache = {}; // Barcode/Online-Treffer-Code -> normalisiertes Food-Objekt
let foodTrackerLoaded = false;

async function ftSave(key, val){ await saveJSON('food:' + key, val); }

async function initFoodTracker(){
  if (foodTrackerLoaded) return;
  const [days, favorites, custom, meals, recent, offCache] = await Promise.all([
    loadJSON('food:days', {}),
    loadJSON('food:favorites', []),
    loadJSON('food:customFoods', []),
    loadJSON('food:savedMeals', []),
    loadJSON('food:recent', { breakfast: [], lunch: [], dinner: [] }),
    loadJSON('food:offCache', {}),
  ]);
  ftDays = days; ftFavorites = favorites; ftCustomFoods = custom;
  ftSavedMeals = meals; ftRecent = recent; ftOffCache = offCache;
  foodTrackerLoaded = true;
}

function goFoodTracker(push){
  if (push !== false) pushView('foodTracker');
  initFoodTracker().then(renderFoodTracker);
}

/* ============ Helpers: Datum ============ */
function ftTodayISO(){ return ftFmtDate(new Date()); }
function ftFmtDate(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function ftParseISO(iso){ const [y,m,d] = iso.split('-').map(Number); return new Date(y, m-1, d); }
function ftAddDays(iso, n){ const d = ftParseISO(iso); d.setDate(d.getDate()+n); return ftFmtDate(d); }
function ftDateLabel(iso){
  const today = ftTodayISO();
  if(iso === today) return 'Heute';
  if(iso === ftAddDays(today, -1)) return 'Gestern';
  if(iso === ftAddDays(today, 1)) return 'Morgen';
  const d = ftParseISO(iso);
  return d.toLocaleDateString('de-DE', {weekday:'short', day:'2-digit', month:'long'});
}

let ftCurrentDate = null;
const FT_MEAL_KEYS = ['breakfast','lunch','dinner'];
const FT_MEAL_LABELS = {breakfast:'Frühstück', lunch:'Mittagessen', dinner:'Abendessen'};

function ftGetDay(iso){
  if(!ftDays[iso]) ftDays[iso] = {breakfast:[], lunch:[], dinner:[]};
  return ftDays[iso];
}

/* ============ Food-Katalog ============ */
function ftGetFoodById(id){
  if(id.startsWith('b_')) return BASE_FOODS.find(f=>f.id===id) || null;
  if(id.startsWith('c_')) return ftCustomFoods.find(f=>f.id===id) || null;
  if(id.startsWith('off_')) return ftOffCache[id] || null;
  return null;
}
function ftFoodMatchScore(food, q){
  const name = food.name.toLowerCase().replace(/-/g,' ');
  const q2 = q.replace(/-/g,' ');
  if(name === q2) return 5;                               // exakter Name
  if(new RegExp('^'+ftEscapeRegex(q2)+'\\b').test(name)) return 4; // eigenständiges erstes Wort
  if(name.startsWith(q2)) return 3;                       // Name beginnt mit Suchbegriff
  if(new RegExp('\\b'+ftEscapeRegex(q2)).test(name)) return 2; // Wortanfang im Namen
  if(name.includes(q2)) return 1;                         // irgendwo im Namen
  for(const s of (food.syn||[])){
    if(s.toLowerCase().includes(q)) return 1;            // Synonymtreffer
  }
  return 0;
}
function ftEscapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

function ftRankFoods(list, q){
  return list
    .map(f=>({f, s:ftFoodMatchScore(f,q)}))
    .filter(x=>x.s>0)
    .sort((a,b)=> b.s-a.s || a.f.name.length-b.f.name.length)
    .map(x=>x.f);
}

function ftSearchLocal(query){
  const q = query.trim().toLowerCase();
  if(!q) return {custom:[], base:[]};
  return {
    custom: ftRankFoods(ftCustomFoods, q),
    base: ftRankFoods(BASE_FOODS, q).slice(0, 40),
  };
}

const FT_OFF_HEADERS = {'User-Agent':'Essenstracker/1.0 (privat)'};

async function ftOffByBarcode(code){
  if(ftOffCache['off_'+code]) return ftOffCache['off_'+code];
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,nutriments`;
  const res = await fetch(url, {headers:FT_OFF_HEADERS});
  const data = await res.json();
  if(data.status !== 1) return null;
  const f = ftNormalizeOFF(data.product, code);
  if(f){ ftOffCache[f.id] = f; await ftSave('offCache', ftOffCache); }
  return f;
}

function ftNormalizeOFF(product, code){
  const n = product.nutriments || {};
  const kcal = n['energy-kcal_100g'];
  if(kcal === undefined || kcal === null) return null;
  return {
    id: 'off_'+code,
    name: product.product_name || 'Unbenanntes Produkt',
    brand: product.brands ? product.brands.split(',')[0].trim() : '',
    kcal: ftRound1(kcal),
    p: ftRound1(n['proteins_100g'] || 0),
    c: ftRound1(n['carbohydrates_100g'] || 0),
    f: ftRound1(n['fat_100g'] || 0),
    piece: null,
  };
}
function ftRound1(n){ return Math.round(n*10)/10; }

async function ftOffSearch(query){
  // Primär: Search-a-licious. Fallback: legacy search.pl.
  try{
    const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&langs=de&page_size=15&fields=code,product_name,brands,nutriments`;
    const res = await fetch(url, {headers:FT_OFF_HEADERS});
    if(res.ok){
      const data = await res.json();
      const hits = data.hits || data.results || [];
      const out = [];
      for(const p of hits){
        const code = p.code || p.id;
        if(!code) continue;
        const f = ftNormalizeOFF(p, code);
        if(f) out.push(f);
      }
      if(out.length) return out;
    }
  }catch(e){ /* weiter zu Fallback */ }
  try{
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=15&fields=code,product_name,brands,nutriments`;
    const res = await fetch(url, {headers:FT_OFF_HEADERS});
    const data = await res.json();
    const out = [];
    for(const p of (data.products || [])){
      const code = p.code;
      if(!code) continue;
      const f = ftNormalizeOFF(p, code);
      if(f) out.push(f);
    }
    return out;
  }catch(e){ return []; }
}

/* ============ Tagessummen ============ */
function ftComputeTotals(iso){
  const day = ftGetDay(iso);
  let kcal=0,p=0,c=0,f=0;
  for(const key of FT_MEAL_KEYS){
    for(const e of day[key]){
      kcal += e.kcal; p += e.p; c += e.c; f += e.f;
    }
  }
  return {kcal:Math.round(kcal), p:Math.round(p), c:Math.round(c), f:Math.round(f)};
}
function ftMealTotal(iso, meal){
  return Math.round(ftGetDay(iso)[meal].reduce((s,e)=>s+e.kcal,0));
}

/* ============ Rendering: Hauptseite ============ */
function renderFoodTracker(){
  if (!ftCurrentDate) ftCurrentDate = ftTodayISO();
  const day = ftGetDay(ftCurrentDate);
  const totals = ftComputeTotals(ftCurrentDate);
  app.innerHTML = `
    <div class="back-row" style="margin-top:0;">
      <button class="back-btn-icon" id="ftBackBtn" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>
    <div class="date-row">
      <button class="date-arrow" id="dArrowBack">${ftIconChevron('left')}</button>
      <button class="date-label" id="dLabel">${ftDateLabel(ftCurrentDate)}</button>
      <button class="date-arrow" id="dArrowFwd">${ftIconChevron('right')}</button>
      <button class="date-arrow settings-btn" id="settingsBtn" title="Einstellungen">${ftIconGear()}</button>
    </div>
    <div class="summary-card">
      <div class="kcal-value">${totals.kcal}</div>
      <div class="kcal-label">kcal heute</div>
      <div class="macro-row">
        <div class="macro"><div><span class="macro-dot" style="background:var(--protein)"></span><span class="macro-val">${totals.p} g</span></div><div class="macro-label">Protein</div></div>
        <div class="macro"><div><span class="macro-dot" style="background:var(--carbs)"></span><span class="macro-val">${totals.c} g</span></div><div class="macro-label">Kohlenhydrate</div></div>
        <div class="macro"><div><span class="macro-dot" style="background:var(--fat)"></span><span class="macro-val">${totals.f} g</span></div><div class="macro-label">Fett</div></div>
      </div>
    </div>
    ${FT_MEAL_KEYS.map(ftMealHTML).join('')}
  `;
  document.getElementById('ftBackBtn').onclick = () => history.back();
  document.getElementById('dArrowBack').onclick = ()=>{ ftCurrentDate = ftAddDays(ftCurrentDate,-1); renderFoodTracker(); };
  document.getElementById('dArrowFwd').onclick = ()=>{ ftCurrentDate = ftAddDays(ftCurrentDate,1); renderFoodTracker(); };
  document.getElementById('dLabel').onclick = ftOpenCalendar;
  document.getElementById('settingsBtn').onclick = ftOpenSettingsSheet;
  FT_MEAL_KEYS.forEach(meal=>{
    document.getElementById('addBtn_'+meal).onclick = ()=>ftOpenAddSheet(meal);
    ftGetDay(ftCurrentDate)[meal].forEach(e=>{
      const delBtn = document.getElementById('del_'+e.id);
      if(delBtn) delBtn.onclick = (ev)=>{ ev.stopPropagation(); ftRemoveEntry(meal, e.id); };
    });
    document.querySelectorAll(`.food-row[data-meal="${meal}"]`).forEach(row=>{
      row.onclick = ()=>ftOpenEditEntryModal(meal, row.dataset.entryId);
    });
    const saveBtn = document.getElementById('saveMeal_'+meal);
    if(saveBtn) saveBtn.onclick = ()=>ftOpenSaveMealPrompt(meal);
  });
}

function ftMealHTML(meal){
  const entries = ftGetDay(ftCurrentDate)[meal];
  return `
    <div class="meal-section">
      <div class="meal-head">
        <div class="meal-title">${FT_MEAL_LABELS[meal]} ${entries.length? `<span class="meal-kcal">· ${ftMealTotal(ftCurrentDate, meal)} kcal</span>`:''}</div>
        <button class="meal-add" id="addBtn_${meal}">+</button>
      </div>
      <div class="food-list">
        ${entries.length ? entries.slice().reverse().map(e=>ftFoodRowHTML(meal, e)).join('') : `<div class="empty-meal">Noch nichts eingetragen</div>`}
      </div>
      ${entries.length ? `<button class="save-meal-btn" id="saveMeal_${meal}">Als Mahlzeit speichern</button>` : ''}
    </div>
  `;
}
function ftFoodRowHTML(meal, e){
  const qty = e.unitMode === 'piece' ? `${ftFormatNum(e.pieceCount)} × ${e.pieceLabel}` : `${e.amountG} g`;
  return `
    <div class="food-row" data-entry-id="${e.id}" data-meal="${meal}">
      <div class="food-row-main">
        <div class="food-row-name">${ftEscapeHTML(e.name)}</div>
        <div class="food-row-sub">${qty}</div>
      </div>
      <div class="food-row-right">
        <div class="food-row-kcal">${Math.round(e.kcal)}</div>
        <button class="food-row-del" id="del_${e.id}">${ftIconX()}</button>
      </div>
    </div>
  `;
}
function ftFormatNum(n){ return (Math.round(n*2)/2).toString().replace('.', ','); }
function ftEscapeHTML(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

function ftRemoveEntry(meal, entryId){
  const dateIso = ftCurrentDate;
  const day = ftGetDay(dateIso);
  const idx = day[meal].findIndex(e=>e.id===entryId);
  if(idx === -1) return;
  const [removed] = day[meal].splice(idx, 1);
  ftSave('days', ftDays);
  renderFoodTracker();
  ftToastWithUndo('Eintrag gelöscht', ()=>{
    const d = ftGetDay(dateIso);
    const insertAt = Math.min(idx, d[meal].length);
    d[meal].splice(insertAt, 0, removed);
    ftSave('days', ftDays);
    if(ftCurrentDate === dateIso) renderFoodTracker();
  });
}

/* ============ Icons ============ */
function ftIconChevron(dir){
  const rotate = dir==='left' ? '' : 'transform="scale(-1,1)"';
  return `<svg viewBox="0 0 24 24" fill="none" ${rotate}><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function ftIconX(){ return `<svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`; }
function ftIconStar(filled){
  return `<svg viewBox="0 0 24 24" fill="${filled?'currentColor':'none'}"><path d="M12 3l2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 17l-5.6 3.1 1.4-6.3-4.8-4.3 6.4-.6L12 3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
function ftIconBarcode(){
  return `<svg viewBox="0 0 24 24" fill="none"><path d="M4 5v14M8 5v14M11 5v14M15 5v14M18 5v14M21 5v14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}
function ftIconTrash(){
  return `<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V4.5a1 1 0 011-1h4a1 1 0 011 1V7m-9 0l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function ftIconGear(){
  return `<svg viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 13.5a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V19.5a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H4.5a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H10a1.65 1.65 0 001-1.51V4.5a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V10a1.65 1.65 0 001.51 1h.09a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
function ftIconCheck(){
  return `<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* ============ Overlay-Grundgerüst ============
   Angedockt an das bestehende Zurück-Tasten-System (overlayCloseStack,
   pushOverlayState()/popOverlayStateIfOpen(), siehe 06-navigation.js) —
   siehe Erläuterung am Dateikopf. */
const ftOverlays = document.getElementById('ftOverlays');
let ftSavedScrollY = 0;
function ftLockBodyScroll(){
  ftSavedScrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = -ftSavedScrollY + 'px';
  document.body.style.left = '0';
  document.body.style.right = '0';
}
function ftUnlockBodyScroll(){
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  window.scrollTo(0, ftSavedScrollY);
}
function ftOpenOverlay(html, {type='sheet'}={}){
  const wasEmpty = !ftOverlays.querySelector('.sheet, .modal');
  ftOverlays.innerHTML = `<div class="overlay-backdrop" id="ftOvBackdrop"></div>${html}`;
  if(wasEmpty){
    ftLockBodyScroll();
    if (!overlayCloseStack.includes(ftRemoveOverlayDOM)) pushOverlayState(ftRemoveOverlayDOM);
  }
  requestAnimationFrame(()=>{
    document.getElementById('ftOvBackdrop').classList.add('open');
    const el = ftOverlays.querySelector('.sheet, .modal');
    if(el) el.classList.add('open');
  });
  document.getElementById('ftOvBackdrop').onclick = ftCloseOverlay;
}
function ftRemoveOverlayDOM(){
  const el = ftOverlays.querySelector('.sheet, .modal');
  const bd = document.getElementById('ftOvBackdrop');
  if(el) el.classList.remove('open');
  if(bd) bd.classList.remove('open');
  ftUnlockBodyScroll();
  setTimeout(()=>{ ftOverlays.innerHTML=''; }, 200);
}
function ftCloseOverlay(){
  popOverlayStateIfOpen();
  ftRemoveOverlayDOM();
}
function ftToast(msg){
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(), 250); }, 1800);
}
function ftToastWithUndo(msg, onUndo){
  const t = document.createElement('div');
  t.className = 'toast toast-undo';
  t.innerHTML = `<span>${ftEscapeHTML(msg)}</span><button class="toast-undo-btn">Rückgängig</button>`;
  document.body.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  let done = false;
  const dismiss = ()=>{ if(done) return; done = true; t.classList.remove('show'); setTimeout(()=>t.remove(), 250); };
  const timer = setTimeout(dismiss, 4500);
  t.querySelector('.toast-undo-btn').onclick = ()=>{
    if(done) return;
    clearTimeout(timer);
    done = true;
    onUndo();
    t.classList.remove('show');
    setTimeout(()=>t.remove(), 250);
  };
}

/* ============ Sheet über der Tastatur halten ============
   Das Sheet ist per bottom:0 an der Layout-Höhe verankert. Öffnet sich die
   Tastatur, schrumpft nur der sichtbare Bereich (visualViewport) — ohne
   Anpassung würde der untere Teil des Sheets hinter der Tastatur verschwinden.
   Wir schieben das Sheet um genau die Tastaturhöhe nach oben und begrenzen
   seine maximale Höhe auf den sichtbaren Bereich. */
if(window.visualViewport){
  const ftVv = window.visualViewport;
  const ftAdjustSheetForKeyboard = ()=>{
    const sheet = ftOverlays.querySelector('.sheet');
    if(!sheet) return;
    const keyboardHeight = Math.max(0, window.innerHeight - ftVv.height - ftVv.offsetTop);
    if(keyboardHeight > 60){
      sheet.style.bottom = keyboardHeight + 'px';
      sheet.style.maxHeight = (ftVv.height * 0.92) + 'px';
    } else {
      sheet.style.bottom = '';
      sheet.style.maxHeight = '';
    }
  };
  ftVv.addEventListener('resize', ftAdjustSheetForKeyboard);
  ftVv.addEventListener('scroll', ftAdjustSheetForKeyboard);
}

/* ============ Kalender ============ */
let ftCalMonth = null; // {y, m}
function ftOpenCalendar(){
  const d = ftParseISO(ftCurrentDate);
  ftCalMonth = {y:d.getFullYear(), m:d.getMonth()};
  ftOpenOverlay(`
    <div class="modal" id="ftCalModal">
      <div class="modal-head"><div class="modal-title">Kalender</div><button class="sheet-close" id="ftCalCloseBtn">${ftIconX()}</button></div>
      <div class="modal-body" id="ftCalBody"></div>
    </div>
  `, {type:'modal'});
  document.getElementById('ftCalCloseBtn').onclick = ftCloseOverlay;
  ftRenderCalendar();
}
function ftRenderCalendar(){
  const {y,m} = ftCalMonth;
  const first = new Date(y,m,1);
  const startOffset = (first.getDay()+6)%7; // Montag=0
  const daysInMonth = new Date(y,m+1,0).getDate();
  const monthLabel = first.toLocaleDateString('de-DE',{month:'long', year:'numeric'});
  const dows = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  let cells = '';
  for(let i=0;i<startOffset;i++) cells += `<div class="cal-day empty"></div>`;
  for(let day=1; day<=daysInMonth; day++){
    const iso = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const hasEntries = ftDays[iso] && FT_MEAL_KEYS.some(k=>ftDays[iso][k].length);
    const cls = ['cal-day'];
    if(iso === ftTodayISO()) cls.push('today');
    if(iso === ftCurrentDate) cls.push('selected');
    if(hasEntries) cls.push('has-entries');
    cells += `<button class="${cls.join(' ')}" data-iso="${iso}">${day}</button>`;
  }
  document.getElementById('ftCalBody').innerHTML = `
    <div class="cal-nav">
      <button class="date-arrow" id="ftCalPrev">${ftIconChevron('left')}</button>
      <div style="font-weight:600">${monthLabel}</div>
      <button class="date-arrow" id="ftCalNext">${ftIconChevron('right')}</button>
    </div>
    <div class="cal-grid">
      ${dows.map(d=>`<div class="cal-dow">${d}</div>`).join('')}
      ${cells}
    </div>
  `;
  document.getElementById('ftCalPrev').onclick = ()=>{ ftCalMonth.m--; if(ftCalMonth.m<0){ftCalMonth.m=11;ftCalMonth.y--;} ftRenderCalendar(); };
  document.getElementById('ftCalNext').onclick = ()=>{ ftCalMonth.m++; if(ftCalMonth.m>11){ftCalMonth.m=0;ftCalMonth.y++;} ftRenderCalendar(); };
  ftOverlays.querySelectorAll('.cal-day[data-iso]').forEach(btn=>{
    btn.onclick = ()=>{ ftCurrentDate = btn.dataset.iso; ftCloseOverlay(); renderFoodTracker(); };
  });
}

/* ============ Sheet: Lebensmittel hinzufügen ============ */
let ftAddSheetMeal = null;
let ftAddSheetSearchToken = 0;

function ftOpenAddSheet(meal){
  ftAddSheetMeal = meal;
  ftOpenOverlay(`
    <div class="sheet" id="ftAddSheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div class="sheet-title">${FT_MEAL_LABELS[meal]}</div>
        <button class="sheet-close" id="ftAddSheetClose">${ftIconX()}</button>
      </div>
      <div class="sheet-body">
        <div class="search-wrap">
          <input class="search-input" id="ftFoodSearchInput" placeholder="Lebensmittel suchen …" autocomplete="off">
          <button class="icon-btn" id="ftScanBtn" title="Barcode scannen">${ftIconBarcode()}</button>
        </div>
        <div id="ftSearchResults"></div>
      </div>
    </div>
  `);
  document.getElementById('ftAddSheetClose').onclick = ftCloseOverlay;
  document.getElementById('ftScanBtn').onclick = ftOpenScanner;
  const input = document.getElementById('ftFoodSearchInput');
  // Direkt beim Öffnen fokussieren, damit sofort losgetippt werden kann, ohne extra ins Feld
  // tippen zu müssen. Kurzer Timeout statt sofortigem focus(): die Sheet-Einblend-Animation
  // (siehe .sheet.open, transition .22s) läuft parallel — ein sofortiges focus() lässt die
  // Tastatur teils schon mitten in der noch laufenden Animation aufspringen und ruckelt dadurch
  // sichtbar; nach der Animation ist der Übergang sauber.
  setTimeout(() => input.focus(), 250);
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
  if(newBtn) newBtn.onclick = ftOpenCustomFoodForm;
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
  else ftFavorites.push(id);
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
  const offResults = await ftOffSearch(q);
  if(token !== ftAddSheetSearchToken || ftLastQuery !== q) return; // veraltete Antwort
  const loadingRow = document.getElementById('ftOffLoadingRow');
  if(!loadingRow) return;
  if(offResults.length){
    loadingRow.outerHTML = offResults.map(ftResultRowHTML).join('');
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
  const startMode = isEdit && editCtx.unitMode === 'piece' ? 'piece' : 'g';
  const startG = isEdit && editCtx.unitMode === 'g' ? editCtx.amountG : 100;
  const startPiece = isEdit && editCtx.unitMode === 'piece' ? editCtx.pieceCount : 1;
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
    document.getElementById('ftQtyPreview').innerHTML = `
      <div class="qty-preview-kcal">${kcal} kcal</div>
      <div class="qty-preview-macros"><span>P ${p}g</span><span>K ${c}g</span><span>F ${f}g</span></div>
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
  const factor = amountG/100;
  entry.kcal = food.kcal*factor; entry.p = food.p*factor; entry.c = food.c*factor; entry.f = food.f*factor;
  entry.amountG = Math.round(amountG);
  entry.unitMode = mode;
  entry.pieceCount = pieceCount;
  ftSave('days', ftDays);
  renderFoodTracker();
}

function ftAddEntryToMeal(food, amountG, mode, pieceCount){
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
  const day = ftGetDay(ftCurrentDate);
  day[ftAddSheetMeal].push(entry);
  ftSave('days', ftDays);
  ftUpdateRecent(ftAddSheetMeal, food.id);
  renderFoodTracker();
}
function ftUpdateRecent(meal, foodId){
  let list = ftRecent[meal] || [];
  list = list.filter(id=>id!==foodId);
  list.unshift(foodId);
  ftRecent[meal] = list.slice(0,8);
  ftSave('recent', ftRecent);
}

/* ============ Eigenes Lebensmittel ============ */
function ftOpenCustomFoodForm(){
  ftOpenOverlay(`
    <div class="sheet" id="ftCustomSheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head"><div class="sheet-title">Eigenes Lebensmittel</div><button class="sheet-close" id="ftCustomClose">${ftIconX()}</button></div>
      <div class="sheet-body">
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
        <button class="ft-btn-primary" id="ftCfSave" style="margin-top:18px">Speichern</button>
      </div>
    </div>
  `);
  document.getElementById('ftCustomClose').onclick = ftCloseOverlay;
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
    };
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
    ftGetDay(ftCurrentDate)[ftAddSheetMeal].push(entry);
    added++;
  }
  ftSave('days', ftDays);
  ftCloseOverlay();
  renderFoodTracker();
  if(added < sm.items.length) ftToast('Manche Zutaten waren nicht mehr auffindbar');
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
  ftToast('Suche Produkt …');
  const food = await ftOffByBarcode(code);
  if(!food){ ftToast('Produkt nicht gefunden'); return; }
  ftOpenQuantityModal(food);
}

/* ============ Einstellungen: Export / Import ============
   Reine Essenstracker-Datensicherung (eigenes JSON, unabhängig vom
   allgemeinen Trainingsplan-Backup in 10-plan-settings.js — siehe
   Hinweis am Dateikopf). Die frühere Design-Sektion (Farbmodus/Akzent-/
   Hintergrundfarbe) ist entfallen, das läuft jetzt über die normalen
   Trainingsplan-Einstellungen. */
function ftOpenSettingsSheet(){
  const dayCount = Object.keys(ftDays).length;
  ftOpenOverlay(`
    <div class="sheet" id="ftSettingsSheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div class="sheet-title">Einstellungen</div>
        <button class="sheet-close" id="ftSettingsClose">${ftIconX()}</button>
      </div>
      <div class="sheet-body">
        <div class="ft-section-label" style="margin-top:0;">Daten sichern</div>
        <div class="no-results" style="text-align:left; padding:0 4px 14px">
          ${dayCount} Tage · ${ftCustomFoods.length} eigene Lebensmittel · ${ftSavedMeals.length} gespeicherte Mahlzeiten · ${ftFavorites.length} Favoriten
        </div>
        <button class="ft-btn-primary" id="ftExportBtn">Daten exportieren (JSON)</button>
        <button class="ft-btn-ghost" id="ftImportBtn">Daten importieren …</button>
        <input type="file" id="ftImportFileInput" accept="application/json" class="hidden">
      </div>
    </div>
  `);
  document.getElementById('ftSettingsClose').onclick = ftCloseOverlay;
  document.getElementById('ftExportBtn').onclick = ftExportData;
  const fileInput = document.getElementById('ftImportFileInput');
  document.getElementById('ftImportBtn').onclick = ()=>fileInput.click();
  fileInput.onchange = ()=>{
    const file = fileInput.files[0];
    if(file) ftImportData(file);
  };
}

function ftExportData(){
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    days: ftDays, favorites: ftFavorites, customFoods: ftCustomFoods, savedMeals: ftSavedMeals, recent: ftRecent,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `essenstracker-backup-${ftTodayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  ftToast('Export gestartet');
}

function ftImportData(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    let parsed;
    try{ parsed = JSON.parse(reader.result); }
    catch(e){ ftToast('Datei ist kein gültiges JSON'); return; }
    if(!parsed || typeof parsed !== 'object' || !parsed.days){
      ftToast('Datei sieht nicht wie ein Essenstracker-Backup aus');
      return;
    }
    if(!confirm('Vorhandene Daten auf diesem Gerät werden durch die Backup-Datei ersetzt. Fortfahren?')) return;
    ftDays = parsed.days || {};
    ftFavorites = parsed.favorites || [];
    ftCustomFoods = parsed.customFoods || [];
    ftSavedMeals = parsed.savedMeals || [];
    ftRecent = parsed.recent || {breakfast:[], lunch:[], dinner:[]};
    ftSave('days', ftDays);
    ftSave('favorites', ftFavorites);
    ftSave('customFoods', ftCustomFoods);
    ftSave('savedMeals', ftSavedMeals);
    ftSave('recent', ftRecent);
    ftCloseOverlay();
    renderFoodTracker();
    ftToast('Import erfolgreich');
  };
  reader.readAsText(file);
}
