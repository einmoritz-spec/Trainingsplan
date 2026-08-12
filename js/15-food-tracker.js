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
// Zuletzt verwendete Menge je Lebensmittel (food.id -> {unitMode, amountG, pieceCount}) —
// beim erneuten Hinzufügen desselben Lebensmittels wird das als Vorbelegung im Mengen-Modal
// genutzt statt immer starr 100 g bzw. 1 Stück zu zeigen (siehe ftOpenQuantityModal()).
let ftLastAmounts = {};
// Wie oft ein Lebensmittel bereits hinzugefügt wurde (food.id -> Anzahl) — steuert die
// Such-Reihenfolge (siehe ftRankFoods()): häufig getrackte Lebensmittel erscheinen dort ganz
// oben, auch wenn ein anderer Treffer textlich besser zum Suchbegriff passen würde.
let ftFoodUsageCount = {};
let foodTrackerLoaded = false;

async function ftSave(key, val){ await saveJSON('food:' + key, val); }

async function initFoodTracker(){
  if (foodTrackerLoaded) return;
  const [days, favorites, custom, meals, recent, offCache, lastAmounts, usageCount] = await Promise.all([
    loadJSON('food:days', {}),
    loadJSON('food:favorites', []),
    loadJSON('food:customFoods', []),
    loadJSON('food:savedMeals', []),
    loadJSON('food:recent', { breakfast: [], lunch: [], dinner: [] }),
    loadJSON('food:offCache', {}),
    loadJSON('food:lastAmounts', {}),
    loadJSON('food:usageCount', {}),
  ]);
  ftDays = days; ftFavorites = favorites; ftCustomFoods = custom;
  ftSavedMeals = meals; ftRecent = recent; ftOffCache = offCache; ftLastAmounts = lastAmounts;
  ftFoodUsageCount = usageCount;
  foodTrackerLoaded = true;
}

// Zählt einen Treffer für die Such-Reihenfolge (ftRankFoods()) hoch — aufgerufen, sobald ein
// Lebensmittel TATSÄCHLICH einer Mahlzeit hinzugefügt wird (ftAddEntryToMeal()/
// ftApplySavedMeal()), nicht schon beim bloßen Antippen in der Ergebnisliste (Mengen-Modal
// öffnen ohne zu speichern zählt bewusst nicht als "oft genutzt").
function ftBumpUsageCount(foodId){
  ftFoodUsageCount[foodId] = (ftFoodUsageCount[foodId] || 0) + 1;
  ftSave('usageCount', ftFoodUsageCount);
}

function goFoodTracker(push){
  if (push !== false) pushView('foodTracker');
  initFoodTracker().then(renderFoodTracker);
}
function goFoodStats(push){
  if (push !== false) pushView('foodStats');
  initFoodTracker().then(renderFoodStats);
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

// Sortiert Suchtreffer nach Relevanz — Lebensmittel, die schon mindestens einmal getrackt
// wurden (ftFoodUsageCount), kommen dabei IMMER vor noch nie genutzten, sortiert nach
// Häufigkeit; erst danach entscheidet der reine Textmatch-Score. Ein oft getrackter
// "Veganer Crispy Chicken Burger" landet bei der Suche nach "Burger" so ganz oben, auch wenn
// ein anderer Treffer textlich näher am Suchbegriff läge.
function ftRankFoods(list, q){
  return list
    .map(f=>({f, s:ftFoodMatchScore(f,q), used:ftFoodUsageCount[f.id]||0}))
    .filter(x=>x.s>0)
    .sort((a,b)=> (b.used>0)-(a.used>0) || b.used-a.used || b.s-a.s || a.f.name.length-b.f.name.length)
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
  // Ergebnisse werden (wie beim Barcode-Scan, siehe ftOffByBarcode()) in ftOffCache
  // zwischengespeichert — sonst findet ftGetFoodById() sie beim späteren Antippen (Menge
  // hinzufügen, Favorit setzen) nicht wieder und die App bricht lautlos ab (Bugfix: Klick auf
  // ein Online-Suchergebnis oder dessen Stern tat bisher gar nichts).
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
      if(out.length){
        out.forEach(f => { ftOffCache[f.id] = f; });
        ftSave('offCache', ftOffCache);
        return out;
      }
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
    if(out.length){
      out.forEach(f => { ftOffCache[f.id] = f; });
      ftSave('offCache', ftOffCache);
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
      <button class="gear settings-btn" id="settingsBtn" aria-label="Einstellungen">⚙</button>
    </div>
    <div class="summary-card">
      <button class="kcal-summary-btn" id="ftStatsBtn" type="button" aria-label="Statistiken">
        <div class="kcal-value">${totals.kcal}</div>
        <div class="kcal-label">kcal heute</div>
      </button>
      <div class="macro-row">
        <div class="macro"><div><span class="macro-dot" style="background:var(--protein)"></span><span class="macro-val">${totals.p} g</span></div><div class="macro-label">Protein</div></div>
        <div class="macro"><div><span class="macro-dot" style="background:var(--carbs)"></span><span class="macro-val">${totals.c} g</span></div><div class="macro-label">Kohlenhydrate</div></div>
        <div class="macro"><div><span class="macro-dot" style="background:var(--fat)"></span><span class="macro-val">${totals.f} g</span></div><div class="macro-label">Fett</div></div>
      </div>
    </div>
    ${FT_MEAL_KEYS.map(ftMealHTML).join('')}
  `;
  document.getElementById('ftBackBtn').onclick = () => history.back();
  document.getElementById('ftStatsBtn').onclick = () => goFoodStats();
  document.getElementById('dArrowBack').onclick = ()=>{ ftCurrentDate = ftAddDays(ftCurrentDate,-1); renderFoodTracker(); };
  document.getElementById('dArrowFwd').onclick = ()=>{ ftCurrentDate = ftAddDays(ftCurrentDate,1); renderFoodTracker(); };
  document.getElementById('dLabel').onclick = () => goFoodCalendar();
  document.getElementById('settingsBtn').onclick = ftOpenSettingsSheet;
  FT_MEAL_KEYS.forEach(meal=>{
    document.getElementById('addBtn_'+meal).onclick = ()=>goFtAddFood(meal);
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
  ftWireDateSwipe();
}

// Wischen nach links/rechts wechselt den Tag — dieselbe Aktion wie die Pfeil-Buttons neben
// dem Datum. An .app statt an ein spezielles Wrapper-Element gehängt, da renderFoodTracker()
// jedesmal komplett neu rendert (app.innerHTML=...) und .app selbst als Element bestehen
// bleibt — Listener müssen also nur EINMAL sitzen und nicht bei jedem Rendern neu vergeben
// werden (removeEventListener davor verhindert, dass sich bei wiederholtem Aufruf mehrere
// Listener stapeln). Bewusst rein additiv (kein preventDefault, passive:true) — normales
// vertikales Scrollen/Antippen von Buttons bleibt dadurch unangetastet, nur ein eindeutig
// horizontaler Wisch löst zusätzlich den Tageswechsel aus. Der history.state-Check verhindert,
// dass ein Wisch auf einer GANZ ANDEREN Seite (z. B. Startseite) versehentlich den
// Essenstracker-Tag im Hintergrund verändert, obwohl der Listener global an .app hängt.
let ftSwipeStartX = null, ftSwipeStartY = null;
let ftSwipeTouchStartHandler = null, ftSwipeTouchEndHandler = null;
function ftWireDateSwipe(){
  if (ftSwipeTouchStartHandler) app.removeEventListener('touchstart', ftSwipeTouchStartHandler);
  if (ftSwipeTouchEndHandler) app.removeEventListener('touchend', ftSwipeTouchEndHandler);
  ftSwipeTouchStartHandler = (ev) => {
    if (ev.touches.length !== 1) return;
    ftSwipeStartX = ev.touches[0].clientX;
    ftSwipeStartY = ev.touches[0].clientY;
  };
  ftSwipeTouchEndHandler = (ev) => {
    if (ftSwipeStartX === null) return;
    const startX = ftSwipeStartX, startY = ftSwipeStartY;
    ftSwipeStartX = null; ftSwipeStartY = null;
    if (!history.state || history.state.view !== 'foodTracker') return;
    const t = ev.changedTouches[0];
    const dx = t.clientX - startX, dy = t.clientY - startY;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    ftCurrentDate = ftAddDays(ftCurrentDate, dx < 0 ? 1 : -1);
    renderFoodTracker();
  };
  app.addEventListener('touchstart', ftSwipeTouchStartHandler, { passive: true });
  app.addEventListener('touchend', ftSwipeTouchEndHandler, { passive: true });
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
// Generationszähler gegen einen Wettlauf, der auftritt, wenn ein neues Overlay sehr kurz nach
// dem Schließen eines vorherigen geöffnet wird (z. B. ftHandleScannedCode(): schließt sofort
// die Barcode-Eingabe und öffnet — bei einem bereits bekannten Barcode SOFORT, ohne auf eine
// Online-Antwort zu warten — direkt die Mengen-Auswahl). ftRemoveOverlayDOM() räumt den DOM
// erst zeitversetzt auf (200ms, damit die Schließen-Animation noch sichtbar ist) — ohne diesen
// Zähler hätte dieser verzögerte Aufräum-Timer das inzwischen längst neu geöffnete Overlay
// wieder gelöscht, kurz nachdem es erschien.
let ftOverlayGeneration = 0;
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
  ftOverlayGeneration++;
  const centeredClass = type === 'modal' ? ' overlay-backdrop-centered' : '';
  ftOverlays.innerHTML = `<div class="overlay-backdrop${centeredClass}" id="ftOvBackdrop">${html}</div>`;
  if(wasEmpty){
    ftLockBodyScroll();
    if (!overlayCloseStack.includes(ftRemoveOverlayDOM)) pushOverlayState(ftRemoveOverlayDOM);
  }
  ftApplyOverlayViewport();
  requestAnimationFrame(()=>{
    const bd = document.getElementById('ftOvBackdrop');
    if (bd) bd.classList.add('open');
    const el = ftOverlays.querySelector('.sheet, .modal');
    if(el) el.classList.add('open');
  });
  const bd = document.getElementById('ftOvBackdrop');
  // Nur Klicks WIRKLICH auf den Hintergrund schließen, nicht auf den Sheet-/Modal-Inhalt
  // selbst — der liegt jetzt (siehe CSS-Umbau oben) als Flex-Kind INNERHALB des Backdrops,
  // ein simples "onclick aufs Backdrop-Element" würde also bei jedem Klick irgendwo im Sheet
  // fälschlich mitschließen, da Klicks im DOM bis zum Backdrop hochblubbern.
  if (bd) bd.onclick = (ev) => { if (ev.target === bd) ftCloseOverlay(); };
}
function ftRemoveOverlayDOM(){
  const el = ftOverlays.querySelector('.sheet, .modal');
  const bd = document.getElementById('ftOvBackdrop');
  if(el) el.classList.remove('open');
  if(bd) bd.classList.remove('open');
  ftUnlockBodyScroll();
  const generationAtClose = ftOverlayGeneration;
  setTimeout(()=>{
    // Falls in der Zwischenzeit (siehe Kommentar bei ftOverlayGeneration oben) bereits ein
    // neues Overlay geöffnet wurde, NICHT löschen — das würde dessen frischen Inhalt wieder
    // entfernen, obwohl er gar nichts mit diesem Schließen-Vorgang zu tun hat.
    if (ftOverlayGeneration === generationAtClose) ftOverlays.innerHTML='';
  }, 200);
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

/* ============ Backdrop über der Tastatur halten ============
   Gleiche Technik wie wireViewportAwareOverlays() (03-input-widgets.js) für die übrigen
   Popups der App: position:fixed bezieht sich auf die volle Fenstergröße INKLUSIVE des von
   der Tastatur verdeckten Bereichs — window.visualViewport meldet dagegen live die
   tatsächlich sichtbare Höhe. Höhe/Top des Backdrops (jetzt zugleich der Flex-Wrapper für
   Sheet/Modal, siehe CSS) werden bei jeder Änderung (Tastatur auf/zu, Zoom, Rotation) neu
   gesetzt; Sheet/Modal richten sich als Flex-Kinder automatisch daran aus.
   Bewusst NICHT mehr die vorherige Eigenlösung (Sheet selbst position:fixed, bottom+max-
   height bei jedem Resize neu berechnet): die feuerte während der Tastatur-Einblendanimation
   auf Android mehrfach hintereinander mit leicht unterschiedlichen Zwischenwerten, wodurch
   das Sheet sichtbar nachfederte/wackelte, statt nur einmal glatt hochzurutschen. Die Höhe/
   Top-Technik hier ist exakt dieselbe, die für den Rest der App bereits ohne dieses Nachfedern
   läuft. */
function ftApplyOverlayViewport(){
  const vv = window.visualViewport;
  const bd = document.getElementById('ftOvBackdrop');
  if (!vv || !bd) return;
  bd.style.height = vv.height + 'px';
  bd.style.top = vv.offsetTop + 'px';
}
if (window.visualViewport){
  window.visualViewport.addEventListener('resize', ftApplyOverlayViewport);
  window.visualViewport.addEventListener('scroll', ftApplyOverlayViewport);
}

/* ============ Kalender ============
   Kein eigenes Kalender-Popup mehr — stattdessen exakt dieselbe Monatsübersicht-Seite wie
   beim Training (monthGridHTML()/monthOverviewBlockHTML() in 05-calendar.js), nur mit
   Essenstracker-eigenen Tagesmarkierungen (Tage mit Einträgen statt Trainingstage) und einem
   dritten Zustand ("selected" = der gerade im Essenstracker angezeigte Tag, Akzentfarb-Ring,
   siehe monthGridHTML()). Anders als beim Training ist hier JEDER Tag antippbar (auch ohne
   Einträge), da er direkt zum Sprung auf diesen Tag dient statt ein Detail-Popup zu öffnen —
   siehe allDaysClickable-Flag in monthGridHTML(). Navigation läuft über die normale
   pushView/history-Route (goFoodCalendar()/case 'foodCalendar', 06-navigation.js) statt über
   das Sheet/Modal-Overlay-System, damit sie sich exakt wie renderMonthOverview() verhält
   (eigene Seite mit Zurück-Pfeil, Hardware-Zurück-Taste funktioniert automatisch richtig). */
function ftMonthOverviewDayMarker(year, month, day){
  const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const hasEntries = ftDays[iso] && FT_MEAL_KEYS.some(k => ftDays[iso][k].length);
  return {
    color: hasEntries ? cssVar('--accent') : null,
    isToday: iso === ftTodayISO(),
    selected: iso === ftCurrentDate,
  };
}
function ftMonthBlockHTML(year, month){
  const monthDays = ftAllDayTotals().filter(d => {
    const dt = ftParseISO(d.date);
    return dt.getFullYear() === year && dt.getMonth() === month;
  });
  const count = monthDays.length;
  const subtitle = `${count} Tag${count === 1 ? '' : 'e'} protokolliert`;
  const now = new Date();
  const titleYear = year !== now.getFullYear() ? ` ${year}` : '';
  const gridInner = monthGridHTML(
    year, month, ftMonthOverviewDayMarker,
    day => `data-ft-day-select="${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}" aria-label="${day}.${month+1}. auswählen"`,
    true
  );
  return `
    <div class="month-overview-block">
      <h2 class="month-overview-title">${MONTH_NAMES_DE[month]}${titleYear}</h2>
      <p class="month-overview-subtitle">${subtitle}</p>
      <div class="month-overview-grid">
        ${gridInner}
      </div>
    </div>
  `;
}
// Analog zu monthOverviewBase/-NextOffset/-Observer (05-calendar.js), eigener Satz Variablen,
// da unabhängig vom Trainings-Infinite-Scroll blätterbar (man kann im Essenstracker-Kalender
// vor- und zurückblättern, während in der Trainings-Monatsübersicht nur vorwärts gescrollt
// wird — abgeschlossene Trainingsjahre stecken dort stattdessen in Akkordeons).
let ftMonthOverviewBase = null;
let ftMonthOverviewNextOffset = 0;
let ftMonthOverviewObserver = null;
function ftGoMonthOffset(offset){
  const d = new Date(ftMonthOverviewBase.year, ftMonthOverviewBase.month + offset, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
function appendFtMonthOverviewMonth(offset){
  const list = document.getElementById('ftMonthOverviewList');
  if (!list) return;
  const { year, month } = ftGoMonthOffset(offset);
  list.insertAdjacentHTML('beforeend', ftMonthBlockHTML(year, month));
  const block = list.lastElementChild;
  if (block){
    block.querySelectorAll('[data-ft-day-select]').forEach(btn => {
      btn.onclick = () => {
        ftCurrentDate = btn.dataset.ftDaySelect;
        history.back();
      };
    });
  }
}
function renderFtMonthOverview(){
  const d = ftParseISO(ftCurrentDate);
  ftMonthOverviewBase = { year: d.getFullYear(), month: d.getMonth() };
  ftMonthOverviewNextOffset = 1;
  if (ftMonthOverviewObserver){ ftMonthOverviewObserver.disconnect(); ftMonthOverviewObserver = null; }

  app.innerHTML = `
    <div class="back-row month-overview-back-sticky" style="margin-top:0;">
      <button class="back-btn-icon" id="ftCalBackBtn" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>
    <div id="ftMonthOverviewList"></div>
    <div class="month-overview-sentinel" id="ftMonthOverviewSentinel"></div>
  `;
  document.getElementById('ftCalBackBtn').onclick = () => history.back();

  // Start: der Monat des gerade im Essenstracker angezeigten Tages (nicht zwingend der
  // laufende Kalendermonat) — vorherige Monate kommen wie beim Training per Infinite-Scroll
  // hinzu, sobald man ans Ende der Liste scrollt.
  appendFtMonthOverviewMonth(0);

  const sentinel = document.getElementById('ftMonthOverviewSentinel');
  ftMonthOverviewObserver = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)){
      appendFtMonthOverviewMonth(-ftMonthOverviewNextOffset);
      ftMonthOverviewNextOffset++;
    }
  }, { rootMargin: '600px 0px' });
  ftMonthOverviewObserver.observe(sentinel);

  window.scrollTo(0, 0);
}
function goFoodCalendar(push){
  if (push !== false) pushView('foodCalendar');
  renderFtMonthOverview();
}

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
    // Gleiches Prinzip wie ftRankFoods() für die lokalen Treffer: schon getrackte Online-
    // Ergebnisse zuerst, nach Häufigkeit sortiert.
    const sorted = offResults.slice().sort((a,b) => (ftFoodUsageCount[b.id]||0) - (ftFoodUsageCount[a.id]||0));
    loadingRow.outerHTML = sorted.map(ftResultRowHTML).join('');
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
   der Online-Datenbank gefundenen Scan heraus geöffnet wurde (siehe ftHandleScannedCode()) —
   der Barcode wird dann am gespeicherten Lebensmittel hinterlegt (food.barcode), damit
   derselbe Code beim nächsten Scan sofort wiedererkannt wird, ohne die Werte erneut eingeben
   zu müssen. */
function ftOpenCustomFoodForm(prefillBarcode){
  ftOpenOverlay(`
    <div class="sheet" id="ftCustomSheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head"><div class="sheet-title">${prefillBarcode ? 'Produkt nicht gefunden' : 'Eigenes Lebensmittel'}</div><button class="sheet-close" id="ftCustomClose">${ftIconX()}</button></div>
      <div class="sheet-body">
        ${prefillBarcode ? `<div class="no-results" style="text-align:left; padding:0 4px 14px;">Barcode ${ftEscapeHTML(prefillBarcode)} ist nicht in der Online-Datenbank hinterlegt. Trag die Werte einmalig ein — beim nächsten Scan dieses Codes erkennt die App das Produkt dann automatisch.</div>` : ''}
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
      barcode: prefillBarcode || null,
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
    ftBumpUsageCount(food.id);
    added++;
  }
  ftSave('days', ftDays);
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
  const food = await ftOffByBarcode(code);
  if(!food){
    // Nicht gefunden: statt nur einer Fehlermeldung direkt das Formular für ein eigenes
    // Lebensmittel öffnen, mit dem Barcode vorbelegt — einmal Werte eintragen, danach wird
    // der Code beim nächsten Scan über den obigen Cache automatisch erkannt.
    ftOpenCustomFoodForm(code);
    return;
  }
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
    lastAmounts: ftLastAmounts, usageCount: ftFoodUsageCount,
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

async function ftImportData(file){
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
    ftLastAmounts = parsed.lastAmounts || {};
    ftFoodUsageCount = parsed.usageCount || {};
    ftSave('days', ftDays);
    ftSave('favorites', ftFavorites);
    ftSave('customFoods', ftCustomFoods);
    ftSave('savedMeals', ftSavedMeals);
    ftSave('recent', ftRecent);
    ftSave('lastAmounts', ftLastAmounts);
    ftSave('usageCount', ftFoodUsageCount);
    ftCloseOverlay();
    renderFoodTracker();
    ftToast('Import erfolgreich');
  };
  reader.readAsText(file);
}

/* ---------------------------------------------------
   Statistiken (renderFoodStats, über Tippen auf die kcal-Zahl erreichbar,
   siehe ftStatsBtn in renderFoodTracker())
   ---------------------------------------------------
   Bewusst so weit wie möglich auf die bestehenden, bereits generischen
   Chart-/Donut-Bauhelfer der Trainingsplan-Statistiken aufgesetzt statt sie
   neu zu schreiben, damit sich der Screen optisch/funktional konsistent
   "genauso wie in der Trainingsapp" anfühlt:
   - buildBarChart()/chartAccordionHTML() (08a-stats-progress-charts.js)
   - buildInteractiveDonut()/donutAngleRanges()/donutArcPath() (08b) für den
     Makro-Donut mit Drilldown — eigene, food-spezifische Auswahl-/
     Aufschlüsselungslogik (ftApplyMacroDonutSelection), aber exakt dieselben
     CSS-Klassen (.donut-seg, .muscle-balance-legend-Familie, .pie-center-Familie) wie beim
     Muskelgruppen-Donut, kein eigenes CSS nötig
   - .month-report-card/.month-report-stat-grid (05-calendar.js/CSS) für die
     Monatsübersicht, die unter "Monat" zusätzlich erscheint
   - weekBucket()/monthShortLabel() (08a) für die Quartal-/Jahres-Bucketing
--------------------------------------------------- */
function ftPeriodToDays(period){
  if (period === 'week') return 7;
  if (period === 'month') return 30;
  if (period === 'quarter') return 90;
  return 365; // 'year'
}
const FT_PERIOD_LABELS = { week: 'Woche', month: 'Monat', quarter: 'Quartal', year: 'Jahr' };
let ftStatsPeriod = 'week';
let ftMacroDrilldown = null;
let ftMacroOutsideClickHandler = null;

// Tagessummen für ALLE Tage mit mindestens einem Eintrag, aufsteigend sortiert — Grundlage
// für sowohl das Balkendiagramm als auch den Makro-Donut/die Monatsübersicht unten.
// Tagesgesamtwerte (kcal/Protein/Kohlenhydrate/Fett) für EINEN Tag — ausgelagert aus
// ftAllDayTotals() (ruft diese Funktion jetzt für jeden Tag auf, siehe unten), damit auch
// foodDayPopupBlockHTML() (05-calendar.js, Tages-Popup im Trainingskalender) exakt dieselbe
// Berechnung für einen einzelnen Tag nutzen kann, statt sie zu duplizieren. Liefert null, wenn
// an diesem Tag nichts protokolliert wurde (kein Eintrag bzw. 0 kcal).
function ftDayTotalsForISO(iso){
  const day = ftDays[iso];
  if (!day) return null;
  let kcal=0,p=0,c=0,f=0;
  FT_MEAL_KEYS.forEach(k => day[k].forEach(e => { kcal+=e.kcal; p+=e.p; c+=e.c; f+=e.f; }));
  if (!kcal) return null;
  return { kcal: Math.round(kcal), p: Math.round(p), c: Math.round(c), f: Math.round(f) };
}
function ftAllDayTotals(){
  return Object.keys(ftDays).map(iso => {
    const totals = ftDayTotalsForISO(iso);
    return totals ? { date: iso, ...totals } : null;
  }).filter(Boolean)
    .sort((a,b) => a.date.localeCompare(b.date));
}
function ftDayTotalsInPeriod(periodDays){
  const cutoffIso = ftAddDays(ftTodayISO(), -(periodDays - 1));
  return ftAllDayTotals().filter(d => d.date >= cutoffIso);
}

// Balkendiagramm-Punkte je nach Zeitraum: Woche/Monat zeigen JEDEN Tag einzeln (auch ohne
// Eintrag als 0-Balken, damit Lücken im Tracking sichtbar bleiben, nicht nur die geloggten
// Tage aneinandergereiht), Quartal/Jahr bündeln zu Kalenderwochen bzw. -monaten (sonst bei
// 90/365 Tagen unlesbar dicht) — Punktwert dort jeweils Ø kcal PRO GELOGGTEM Tag im Bucket,
// damit die Skala über alle vier Zeiträume hinweg vergleichbar bleibt ("wie viel kcal an
// einem typischen Tag"), statt bei größeren Buckets plötzlich eine Summe zu zeigen.
function ftBucketedKcalPoints(period){
  if (period === 'week' || period === 'month'){
    const n = ftPeriodToDays(period);
    const all = ftAllDayTotals();
    const todayIso = ftTodayISO();
    const points = [];
    for (let i = n - 1; i >= 0; i--){
      const iso = ftAddDays(todayIso, -i);
      const found = all.find(d => d.date === iso);
      const d = ftParseISO(iso);
      const label = period === 'week' ? d.toLocaleDateString('de-DE', { weekday:'short' }) : shortDate(iso);
      points.push({ label, value: found ? Math.round(found.kcal) : 0, date: iso });
    }
    return points;
  }
  const periodDays = ftPeriodToDays(period);
  const inRange = ftDayTotalsInPeriod(periodDays);
  const buckets = new Map();
  inRange.forEach(d => {
    const dateObj = ftParseISO(d.date);
    let key, label, sortKey;
    if (period === 'quarter'){
      const wb = weekBucket(dateObj);
      key = wb.key; label = wb.label; sortKey = wb.sortKey;
    } else {
      key = dateObj.getFullYear() + '-' + dateObj.getMonth();
      label = monthShortLabel(dateObj);
      sortKey = dateObj.getFullYear()*100 + dateObj.getMonth();
    }
    if (!buckets.has(key)) buckets.set(key, { label, sortKey, sum: 0, count: 0 });
    const b = buckets.get(key);
    b.sum += d.kcal; b.count += 1;
  });
  return [...buckets.values()].sort((a,b) => a.sortKey - b.sortKey)
    .map(b => ({ label: b.label, value: Math.round(b.sum / b.count) }));
}

// Aggregierte Kalorien je Makro (Protein ×4, Kohlenhydrate ×4, Fett ×9) über den Zeitraum —
// Grundlage für den Donut. Als Verhältnis ist es egal, ob über Summen oder Durchschnitte
// gerechnet wird, deshalb hier einfach über alle Tage im Zeitraum aufsummiert.
function ftMacroKcalSegments(periodDays){
  const days = ftDayTotalsInPeriod(periodDays);
  let p=0,c=0,f=0;
  days.forEach(d => { p+=d.p; c+=d.c; f+=d.f; });
  return [
    { key:'p', label:'Protein', grams: Math.round(p), value: Math.round(p*4), color: cssVar('--protein') },
    { key:'c', label:'Kohlenhydrate', grams: Math.round(c), value: Math.round(c*4), color: cssVar('--carbs') },
    { key:'f', label:'Fett', grams: Math.round(f), value: Math.round(f*9), color: cssVar('--fat') },
  ];
}
// Welche Lebensmittel im Zeitraum am meisten zu einem Makro beigetragen haben (in Gramm) —
// Grundlage für die Aufschlüsselung, wenn ein Donut-Segment angetippt wird.
function ftFoodMacroBreakdown(macroKey, periodDays){
  const cutoffIso = ftAddDays(ftTodayISO(), -(periodDays - 1));
  const map = {};
  Object.keys(ftDays).forEach(iso => {
    if (iso < cutoffIso) return;
    FT_MEAL_KEYS.forEach(k => ftDays[iso][k].forEach(e => {
      const val = e[macroKey] || 0;
      if (!val) return;
      map[e.name] = (map[e.name] || 0) + val;
    }));
  });
  return Object.entries(map).map(([name,val]) => ({ name, val }))
    .sort((a,b) => b.val - a.val);
}

// Food-Pendant zu computeMonthReportData()/renderMonthReport() (05-calendar.js) — deutlich
// schlanker, da hier keine Übungen/Sätze/Rekorde existieren: Tage protokolliert, Ø kcal/Makros
// pro geloggtem Tag, höchster/niedrigster Tag, Delta zum Vormonat (Ø kcal).
function ftComputeMonthStats(year, month){
  const monthDays = ftAllDayTotals().filter(d => {
    const dt = ftParseISO(d.date);
    return dt.getFullYear() === year && dt.getMonth() === month;
  });
  const count = monthDays.length;
  const avg = key => count ? Math.round(monthDays.reduce((a,d) => a + d[key], 0) / count) : 0;
  const highest = count ? monthDays.reduce((a,d) => d.kcal > a.kcal ? d : a) : null;
  const lowest = count ? monthDays.reduce((a,d) => d.kcal < a.kcal ? d : a) : null;

  let prevYear = year, prevMonth = month - 1;
  if (prevMonth < 0){ prevMonth = 11; prevYear -= 1; }
  const prevMonthDays = ftAllDayTotals().filter(d => {
    const dt = ftParseISO(d.date);
    return dt.getFullYear() === prevYear && dt.getMonth() === prevMonth;
  });
  const prevAvgKcal = prevMonthDays.length ? Math.round(prevMonthDays.reduce((a,d) => a+d.kcal, 0) / prevMonthDays.length) : null;

  return {
    count, avgKcal: avg('kcal'), avgP: avg('p'), avgC: avg('c'), avgF: avg('f'),
    highest, lowest, prevAvgKcal
  };
}

function renderFoodStats(){
  const periodDays = ftPeriodToDays(ftStatsPeriod);
  const points = ftBucketedKcalPoints(ftStatsPeriod);
  const loggedPoints = points.filter(p => p.value > 0);
  const avgKcal = loggedPoints.length ? Math.round(loggedPoints.reduce((a,p) => a+p.value, 0) / loggedPoints.length) : 0;
  const accent = cssVar('--accent');

  const segments = ftMacroKcalSegments(periodDays);
  const totalMacroKcal = segments.reduce((a,s) => a+s.value, 0);
  const macroLegendHTML = segments.map(s => {
    const pct = totalMacroKcal ? Math.round(s.value / totalMacroKcal * 100) : 0;
    return `
      <div class="muscle-balance-legend-row">
        <button class="muscle-balance-swatch" data-macro="${s.key}" style="color:${s.color};" aria-label="${s.label}: ${pct}%">${pct}%</button>
        <span class="muscle-balance-legend-label">${s.label}</span>
        <div class="muscle-balance-legend-values">
          <span class="muscle-balance-legend-value">${s.grams} g</span>
        </div>
      </div>
    `;
  }).join('');

  // buildBarChart()/buildInteractiveDonut() haben eigene, trainings-spezifisch formulierte
  // Leer-Texte ("...Einheiten protokolliert"/"...geloggten Sätzen") — für den Essenstracker
  // stattdessen eigene, passende Hinweise statt der (Trainings-)Bausteine, wenn im gewählten
  // Zeitraum noch nichts eingetragen wurde.
  const hasDataInPeriod = points.some(p => p.value > 0);
  const chartHTML = hasDataInPeriod
    ? buildBarChart(points, accent, true, 160)
    : '<div class="chart-empty">Noch keine Einträge in diesem Zeitraum.</div>';
  const donutSectionHTML = totalMacroKcal ? `
    <div class="section-label" style="margin-top:22px;">Makro-Verteilung</div>
    <div class="muscle-balance-charts-row">
      <div class="muscle-balance-chart-col" style="margin:0 auto;">
        <div class="muscle-balance-chart-wrap">${buildInteractiveDonut(segments, 190, 'food', totalMacroKcal.toLocaleString('de-DE'), 'kcal')}</div>
      </div>
    </div>
    <div class="muscle-balance-breakdown" id="ftMacroBreakdown" style="display:none;">
      <div class="muscle-balance-breakdown-header">
        <span class="muscle-balance-breakdown-title" id="ftBreakdownTitle"></span>
        <button class="muscle-balance-breakdown-close" id="ftBreakdownClose" aria-label="Aufschlüsselung schließen">✕</button>
      </div>
      <div class="muscle-balance-legend" id="ftBreakdownList"></div>
    </div>
    <div class="muscle-balance-legend" id="ftMainLegend" style="margin-top:16px;">${macroLegendHTML}</div>
  ` : `
    <div class="section-label" style="margin-top:22px;">Makro-Verteilung</div>
    <div class="chart-empty">Noch keine Einträge in diesem Zeitraum.</div>
  `;

  const now = new Date();
  const monthStats = ftStatsPeriod === 'month' ? ftComputeMonthStats(now.getFullYear(), now.getMonth()) : null;
  const monthDeltaHTML = (monthStats && monthStats.prevAvgKcal !== null && monthStats.avgKcal !== monthStats.prevAvgKcal) ? (() => {
    const delta = monthStats.avgKcal - monthStats.prevAvgKcal;
    const sign = delta > 0 ? '+' : '−';
    return `<span class="month-report-stat-delta ${delta > 0 ? 'up' : 'down'}">${sign}${Math.abs(delta).toLocaleString('de-DE')}</span>`;
  })() : '';
  const monthOverviewHTML = monthStats ? `
    <div class="section-label" style="margin-top:18px;">${MONTH_NAMES_DE[now.getMonth()]}-Übersicht</div>
    <div class="month-report-card">
      <div class="month-report-stat-grid">
        <div class="month-report-stat-cell">
          <div class="month-report-stat-value">${monthStats.count}</div>
          <div class="month-report-stat-label">Tage protokolliert</div>
        </div>
        <div class="month-report-stat-cell">
          <div class="month-report-stat-value">${monthStats.avgKcal}${monthDeltaHTML}</div>
          <div class="month-report-stat-label">Ø kcal / Tag</div>
        </div>
        <div class="month-report-stat-cell">
          <div class="month-report-stat-value">${monthStats.avgP} / ${monthStats.avgC} / ${monthStats.avgF} g</div>
          <div class="month-report-stat-label">Ø Protein / Kohlenhydrate / Fett</div>
        </div>
        <div class="month-report-stat-cell">
          <div class="month-report-stat-value">${monthStats.highest ? monthStats.highest.kcal : '–'}</div>
          <div class="month-report-stat-label">${monthStats.highest ? 'Höchster Tag · ' + shortDate(monthStats.highest.date) : 'Höchster Tag'}</div>
        </div>
      </div>
    </div>
  ` : '';

  app.innerHTML = `
    <div class="back-row" style="margin-top:0;">
      <button class="back-btn-icon" id="ftStatsBackBtn" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>
    <div class="brand" style="margin-bottom:14px;"><h1 style="font-size:22px;">Statistiken</h1></div>
    <div class="period-row">
      ${Object.keys(FT_PERIOD_LABELS).map(p => `
        <button class="period-btn ${ftStatsPeriod === p ? 'active' : ''}" data-ft-period="${p}">${FT_PERIOD_LABELS[p]}</button>
      `).join('')}
    </div>
    <div class="progress-summary">
      <span>Ø ${avgKcal} kcal/Tag</span>
    </div>
    ${chartHTML}
    ${donutSectionHTML}
    ${monthOverviewHTML}
  `;

  document.getElementById('ftStatsBackBtn').onclick = () => history.back();
  app.querySelectorAll('[data-ft-period]').forEach(btn => {
    btn.onclick = () => {
      ftStatsPeriod = btn.dataset.ftPeriod;
      ftMacroDrilldown = null;
      renderFoodStats();
    };
  });
  if (totalMacroKcal) ftWireMacroDonut(segments, periodDays);
  wireLineCharts(app);
}

// Analog zu wireTimeDonutSection()/applyTimeDonutSelection() (08b-stats-muscle-balance.js),
// aber bewusst ohne die dortige Sub-Segment-Aufsplittung des Donuts selbst (dort: Übungen
// INNERHALB einer Muskelgruppe als eigene Arc-Abschnitte) — hier reicht die einfache Liste
// darunter, da "welche Lebensmittel" keine geometrische Unterteilung des Rings braucht.
// Ein-/Ausgrauen der übrigen Segmente, Center-Wert-Wechsel und die Legende darunter folgen
// exakt demselben Muster.
function ftWireMacroDonut(segments, periodDays){
  const ranges = donutAngleRanges(segments);

  function toggle(macroKey){
    ftMacroDrilldown = (ftMacroDrilldown === macroKey) ? null : macroKey;
    apply();
  }

  function apply(){
    const svg = document.getElementById('donutSvg-food');
    if (!svg) return;
    const selected = ftMacroDrilldown;
    const selectedRange = ranges.find(r => segments.find(s => s.label === r.label && s.key === selected));

    svg.querySelectorAll('.donut-seg:not(.donut-subseg)').forEach(path => {
      const seg = segments.find(s => s.label === path.dataset.group);
      const isSelected = seg && selected === seg.key;
      path.classList.toggle('donut-seg-hidden', isSelected);
      path.classList.toggle('donut-seg-dim', !!selected && !isSelected);
    });
    // Der ausgewählte Ring-Abschnitt selbst wird ausgeblendet (donut-seg-hidden oben) und
    // stattdessen in einzelne, nach Lebensmittel eingefärbte Unterabschnitte aufgeteilt —
    // exakt dasselbe Muster wie bei der Muskelgruppen-Verteilung (applyMuscleDonutSelection(),
    // 08b-stats-muscle-balance.js): shadeMuscleColor() für abgestufte Farbtöne derselben
    // Makro-Farbe, donutArcPath() für die Geometrie der Unterabschnitte.
    svg.querySelectorAll('.donut-subseg').forEach(el => el.remove());

    const defaultCenter = document.getElementById('pieCenterDefault-food');
    const selectedCenter = document.getElementById('pieCenterSelected-food');
    if (defaultCenter) defaultCenter.classList.toggle('pie-center-hidden', !!selected);
    if (selectedCenter) selectedCenter.classList.toggle('pie-center-hidden', !selected);
    const mainLegend = document.getElementById('ftMainLegend');
    if (mainLegend) mainLegend.classList.toggle('dimmed', !!selected);

    const panel = document.getElementById('ftMacroBreakdown');
    if (!selected){
      if (panel) panel.classList.remove('open');
      setTimeout(() => { if (!ftMacroDrilldown && panel) panel.style.display = 'none'; }, 250);
      return;
    }
    const seg = segments.find(s => s.key === selected);
    const breakdown = ftFoodMacroBreakdown(selected, periodDays);
    const subTotal = breakdown.reduce((a,e) => a+e.val, 0);

    if (selectedRange && subTotal){
      let a = selectedRange.startAngle;
      const gapDeg = breakdown.length > 1 ? 1.4 : 0;
      breakdown.forEach((e, i) => {
        const fraction = e.val / subTotal;
        const rawEnd = a + fraction * (selectedRange.endAngle - selectedRange.startAngle);
        const startA = a + (i > 0 ? gapDeg/2 : 0);
        const endA = rawEnd - (i < breakdown.length - 1 ? gapDeg/2 : 0);
        a = rawEnd;
        const subPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        subPath.setAttribute('d', donutArcPath(startA, endA));
        subPath.setAttribute('fill', shadeMuscleColor(seg.color, i));
        subPath.setAttribute('class', 'donut-seg donut-subseg');
        subPath.style.transitionDelay = (i * 35) + 'ms';
        subPath.onclick = () => toggle(selected);
        svg.appendChild(subPath);
      });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        svg.querySelectorAll('.donut-subseg').forEach(el => el.classList.add('donut-subseg-in'));
      }));
    }

    const selValueEl = document.getElementById('pieCenterSelectedValue-food');
    const selLabelEl = document.getElementById('pieCenterSelectedLabel-food');
    if (selValueEl && selLabelEl && selectedRange){
      const total = segments.reduce((a,s) => a+s.value, 0);
      const pct = total ? Math.round(selectedRange.value / total * 100) : 0;
      selValueEl.textContent = pct + '%';
      selLabelEl.textContent = seg.label;
    }

    const rows = breakdown.map((e, i) => {
      const pct = subTotal ? Math.round(e.val / subTotal * 100) : 0;
      return `
        <div class="muscle-balance-legend-row">
          <span class="muscle-balance-swatch-static" style="color:${shadeMuscleColor(seg.color, i)};">${pct}%</span>
          <span class="muscle-balance-legend-label">${ftEscapeHTML(e.name)}</span>
          <span class="muscle-balance-legend-value">${Math.round(e.val)} g</span>
        </div>
      `;
    }).join('');
    document.getElementById('ftBreakdownTitle').textContent = `${seg.label} – nach Lebensmittel`;
    document.getElementById('ftBreakdownList').innerHTML = rows || '<div class="history-empty">Keine Daten.</div>';
    if (panel){
      panel.style.display = 'block';
      requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('open')));
    }
  }

  app.querySelectorAll('.donut-seg[data-metric="food"]').forEach(path => {
    const seg = segments.find(s => s.label === path.dataset.group);
    if (seg) path.onclick = () => toggle(seg.key);
  });
  app.querySelectorAll('[data-macro]').forEach(btn => {
    btn.onclick = () => toggle(btn.dataset.macro);
  });
  const closeBtn = document.getElementById('ftBreakdownClose');
  if (closeBtn) closeBtn.onclick = () => { ftMacroDrilldown = null; apply(); };

  if (ftMacroOutsideClickHandler) document.removeEventListener('click', ftMacroOutsideClickHandler, true);
  ftMacroOutsideClickHandler = (ev) => {
    if (!ftMacroDrilldown) return;
    if (ev.target.closest('#ftMacroBreakdown, .donut-seg, .muscle-balance-legend-row, [data-macro]')) return;
    ftMacroDrilldown = null;
    apply();
  };
  document.addEventListener('click', ftMacroOutsideClickHandler, true);

  apply();
}
