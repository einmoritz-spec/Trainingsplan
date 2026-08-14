/* ---------------------------------------------------
   15a-food-core.js
   ---------------------------------------------------
   Essenstracker: State, Persistenz, Food-Katalog/Suche, Open-Food-Facts-
   Netzwerkschicht, Tages-/Monatssummen, Overlay-Grundgerüst, Export/Import.

   Dies war früher der Kopf von 15-food-tracker.js (2083 Zeilen, eine
   einzige Datei für das komplette Feature). Aufgeteilt in vier Dateien,
   damit sie sich in die sonst konsequent gesplittete Architektur der App
   einreihen (siehe 08a/b/c, 09a/b/c, 11a/b/c):
     15a-food-core.js   – dieser Teil (State/Daten/Netzwerk, keine UI)
     15b-food-day.js    – Tagesansicht, Monats-Kalender, Einstellungs-Sheet
     15c-food-add.js    – "Lebensmittel hinzufügen"-Seite, Mengen-Modal,
                           eigenes Lebensmittel, gespeicherte Mahlzeiten,
                           Barcode-Scanner
     15d-food-stats.js  – Statistik-Seite (Balkendiagramm, Makro-Donut, ...)
   Ladereihenfolge in index.html unverändert direkt nach js/data/food-data.js
   und vor js/14-app-init.js. Alle Funktionsnamen sind identisch zur
   Vorgängerdatei geblieben (gemeinsamer globaler Scope) — externe Aufrufer
   (06-navigation.js, 07-home.js, 04-utils.js, 10-plan-settings.js,
   05-calendar.js) mussten dafür nicht angefasst werden.

   ftDayTotalsForISO()/ftAllDayTotals()/ftComputeMonthStats() wurden bewusst
   aus dem Statistik-Block hierher verschoben (nicht nach 15d) — 05-calendar.js
   (Trainings-Kalender, Tages-Popup + Monatsbericht) ruft beide für die
   Essenstracker-Werte AM SELBEN Tag auf; das ist Kernberechnung, keine
   Statistik-UI.

   State-Deklarationen (ftDays, ftGoals, ...) liegen bewusst weiterhin HIER
   und nicht in 02-state-theme.js — anders als der Rest der App (siehe
   Projektregel: globaler State nur in 02). Der Essenstracker war ursprünglich
   eine eigenständige App mit eigenem State/Storage-Unterbau (siehe Herkunfts-
   Hinweis unten) und dockt bewusst NICHT an den Trainingsplan-State an; eine
   Verschiebung nach 02 hätte keinen technischen Vorteil, nur einen großen
   Diff in einer App-weiten Kerndatei. Bewusste Ausnahme, nicht Nachlässigkeit.

   Beim ursprünglichen Andocken an den Trainingsplan bewusst entfernt/
   angepasst gegenüber der eigenständigen Standalone-Version (Details siehe
   Git-Historie): eigenes Theme-System gestrichen (nutzt die App-Theme-
   Variablen mit), Persistenz von synchronem localStorage auf die
   asynchrone loadJSON()/saveJSON()-Kaskade (01-storage.js) umgestellt,
   eigenes Overlay-Grundgerüst an das bestehende Zurück-Tasten-System
   angedockt, .section-label/.btn-primary/.btn-ghost in .ft-section-label/
   .ft-btn-primary/.ft-btn-ghost umbenannt (Kollision mit gleichnamigen
   Trainingsplan-Klassen), render() → renderFoodTracker() + eigene
   pushView()-Routen statt direktem Seitenaufruf.
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
let ftRecent = { breakfast: [], lunch: [], dinner: [], snacks: [] };
let ftOffCache = {}; // Barcode/Online-Treffer-Code -> normalisiertes Food-Objekt (PERSISTENT)
// Rein flüchtiger (nicht persistierter) Zwischenspeicher für Online-Suchtreffer, die noch nicht
// tatsächlich benutzt wurden (siehe ftOffSearch()/ftPersistOffFoodIfNeeded() weiter unten) — ein
// Treffer wandert erst von hier nach ftOffCache, sobald er wirklich einer Mahlzeit hinzugefügt,
// favorisiert oder über eine gespeicherte Mahlzeit angewendet wird. Ohne diese Zwischenstufe
// würde JEDE Texteingabe in der Suche (bis zu 15 Treffer, alle paar hundert Millisekunden) den
// kompletten Cache neu auf die Platte schreiben, obwohl die allermeisten Treffer nie angetippt
// werden. Wird bei jedem initFoodTracker()/ftApplyImportedData() geleert (session-lokal).
let ftOffMemCache = {};
// Zuletzt verwendete Menge je Lebensmittel (food.id -> {unitMode, amountG, pieceCount}) —
// beim erneuten Hinzufügen desselben Lebensmittels wird das als Vorbelegung im Mengen-Modal
// genutzt statt immer starr 100 g bzw. 1 Stück zu zeigen (siehe ftOpenQuantityModal()).
let ftLastAmounts = {};
// Wie oft ein Lebensmittel bereits hinzugefügt wurde (food.id -> Anzahl) — steuert die
// Such-Reihenfolge (siehe ftRankFoods()): häufig getrackte Lebensmittel erscheinen dort ganz
// oben, auch wenn ein anderer Treffer textlich besser zum Suchbegriff passen würde.
let ftFoodUsageCount = {};
// Tagesziele (kcal/Protein/Kohlenhydrate/Fett) — jedes Feld einzeln optional, null = "kein
// Ziel gesetzt". Ist NICHTS gesetzt, verhält sich die App exakt wie vorher (reine Zahlen ohne
// Ziel-Bezug, siehe renderFoodTracker()) — die Fortschrittsanzeige blendet sich erst ein,
// sobald mindestens ein Ziel hinterlegt ist.
let ftGoals = { kcal: null, p: null, c: null, f: null };
// Pro Mahlzeit (breakfast/lunch/dinner/snacks) optional eine feste, gespeicherte Mahlzeit
// (ftSavedMeals-ID) hinterlegt, die automatisch für den jeweiligen Tag eingetragen wird, sobald
// dieser zum ersten Mal "entsteht" (siehe ftApplyAutoMealsUpcoming() weiter unten) — für Dinge
// wie ein tägliches Standard-Frühstück (z. B. immer 250 g Skyr + 30 g Whey), die man nicht jeden
// Tag erneut von Hand eintragen möchte. null = kein Auto-Eintrag für diese Mahlzeit.
let ftAutoMeals = { breakfast: null, lunch: null, dinner: null, snacks: null };
// Eigenes, vom allgemeinen Trainingsplan-Design UNABHÄNGIGES Farbschema für den Essenstracker
// (Wunsch: "gesondert von den allgemeinen App-Einstellungen") — siehe ftOpenSettingsSheet()
// (15b-food-day.js, Akkordeon "Design") für die Bedienoberfläche und ftApplyTheme() weiter
// unten für die Anwendung. JEDES Feld ist standardmäßig undefined/fehlt = "nichts Eigenes
// eingestellt, allgemeine App-Einstellung übernehmen" (Wunsch: "sollten aber vorher immer
// erst die allgemeinen Einstellungen angewendet werden falls man nichts custom hat") — erst
// ein explizit im Essenstracker gewählter Wert überschreibt das. bgColorId==='default' ist
// dabei bewusst ein ANDERER Zustand als "gar nicht gesetzt": es bedeutet "im Essenstracker
// AUSDRÜCKLICH kein eigener Hintergrund", auch wenn die allgemeine App gerade einen eigenen
// Hintergrund hat — nur so lässt sich ein einmal geerbter Hintergrund im Essenstracker gezielt
// wieder abschalten, ohne dafür zwangsläufig eine eigene Farbe wählen zu müssen.
let ftThemeOverride = {};
let foodTrackerLoaded = false;

async function ftSave(key, val){ await saveJSON('food:' + key, val); }
// Speichert NUR den Monat, in dem `iso` liegt (siehe saveFoodDayChunk(), 01-storage.js) —
// ftDays selbst bleibt im Speicher weiterhin EIN vollständiges {iso: Tagesobjekt}-Objekt mit
// der gesamten Historie (ftGetDay() etc. unverändert), nur die Persistenz darunter ist jetzt
// nach Monaten gebündelt: ein einzelner geloggter Bissen serialisiert nicht mehr die komplette
// Ernährungshistorie neu, sondern nur noch den betroffenen Monat (typisch <100 Tage). Exakt
// dasselbe Chunk-Prinzip wie bei saveSessionAt() (01-storage.js) für den Trainingsverlauf.
async function ftSaveDays(iso){ await saveFoodDayChunk(iso, ftDays); }

async function initFoodTracker(){
  if (foodTrackerLoaded) return;
  const [days, favorites, custom, meals, recent, offCache, lastAmounts, usageCount, goals, themeOverride, autoMeals, mealCollapse] = await Promise.all([
    loadAllFoodDays(),
    loadJSON('food:favorites', []),
    loadJSON('food:customFoods', []),
    loadJSON('food:savedMeals', []),
    loadJSON('food:recent', { breakfast: [], lunch: [], dinner: [], snacks: [] }),
    loadJSON('food:offCache', {}),
    loadJSON('food:lastAmounts', {}),
    loadJSON('food:usageCount', {}),
    loadJSON('food:goals', { kcal: null, p: null, c: null, f: null }),
    loadJSON('food:themeOverride', {}),
    loadJSON('food:autoMeals', { breakfast: null, lunch: null, dinner: null, snacks: null }),
    loadJSON('food:mealCollapse', {}),
  ]);
  ftDays = days; ftFavorites = favorites; ftCustomFoods = custom;
  ftSavedMeals = meals; ftRecent = recent; ftOffCache = offCache; ftLastAmounts = lastAmounts;
  ftFoodUsageCount = usageCount; ftGoals = goals; ftThemeOverride = themeOverride || {};
  ftAutoMeals = autoMeals || { breakfast: null, lunch: null, dinner: null, snacks: null };
  ftMealCollapseOverride = mealCollapse || {};
  ftOffMemCache = {};
  foodTrackerLoaded = true;
  // Erst NACHDEM alles geladen ist (braucht ftSavedMeals, um eine Auto-Mahlzeits-ID aufzulösen)
  // den Rest des aktuellen Monats mit den konfigurierten Auto-Mahlzeiten vorausfüllen (siehe
  // ftApplyAutoMealsUpcoming(), 15c-food-add.js) — nicht nur "heute", damit man auch beim
  // Vorausblättern in der Tagesansicht schon sieht, was ansteht, statt dass es sich erst beim
  // tatsächlichen Erreichen des jeweiligen Tages einträgt.
  ftApplyAutoMealsUpcoming();
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
// "snacks" bewusst ans ENDE gehängt (nicht zwischen Mittag-/Abendessen einsortiert) — Snacks
// passieren über den ganzen Tag verteilt, eine chronologische Einsortierung wäre irreführend;
// als eigener Abschnitt am Ende sammelt er einfach alles, was nicht in eine der drei
// Hauptmahlzeiten gehört.
const FT_MEAL_KEYS = ['breakfast','lunch','dinner','snacks'];
const FT_MEAL_LABELS = {breakfast:'Frühstück', lunch:'Mittagessen', dinner:'Abendessen', snacks:'Snacks'};

// Liefert IMMER ein Tagesobjekt mit allen FT_MEAL_KEYS als Arrays — auch für Tage, die schon
// VOR Einführung einer neuen Mahlzeiten-Kategorie (z. B. "snacks") gespeichert wurden und diese
// Eigenschaft deshalb noch nicht besitzen. Ohne diese Selbstheilung würde jeder Zugriff auf
// day['snacks'] bei altem Datenbestand mit "Cannot read properties of undefined" abstürzen.
// Mutiert ftDays[iso] direkt (statt eine Kopie zurückzugeben), damit die Ergänzung fehlender
// Schlüssel auch tatsächlich hängen bleibt, nicht nur einmalig für diesen Aufruf gilt.
function ftGetDay(iso){
  if(!ftDays[iso]) ftDays[iso] = {};
  const day = ftDays[iso];
  FT_MEAL_KEYS.forEach(k => { if(!Array.isArray(day[k])) day[k] = []; });
  return day;
}

/* ============ Food-Katalog ============ */
function ftGetFoodById(id){
  if(id.startsWith('b_')) return BASE_FOODS.find(f=>f.id===id) || null;
  if(id.startsWith('c_')) return ftCustomFoods.find(f=>f.id===id) || null;
  // Erst der persistente Cache, dann der flüchtige Suchtreffer-Zwischenspeicher (siehe
  // ftOffMemCache oben) — ein gerade erst getippter Online-Suchtreffer muss sich genauso
  // öffnen/favorisieren lassen wie ein bereits benutztes Produkt.
  if(id.startsWith('off_')) return ftOffCache[id] || ftOffMemCache[id] || null;
  return null;
}
// Normalisiert für die Suche: Kleinschreibung, deutsche Umlaute/ß auf ihre Zwei-Buchstaben-
// Schreibweise (ä→ae etc.) — so findet "haehnchen" auch "Hähnchen" — und Bindestriche als
// Leerzeichen (unverändert aus der ursprünglichen Logik übernommen).
function ftNormalizeSearchText(s){
  return s.toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/-/g,' ');
}
function ftEscapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
// Generischer HTML-Escape-Helfer — hier (statt in 15b) definiert, weil er auch innerhalb
// dieser Datei gebraucht wird (ftToastWithUndo() unten), zusätzlich zu allen UI-Dateien
// (15b/15c/15d).
function ftEscapeHTML(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
// Score EINES Suchworts gegen einen (bereits normalisierten) Lebensmittelnamen — identische
// 5/4/3/2/1-Staffel wie zuvor. nameCompact (Name ohne Leerzeichen) zusätzlich geprüft, damit
// z. B. "hähnchenbrust" auch "Hähnchen, Brust" findet.
function ftTokenScore(name, nameCompact, token){
  if(name === token) return 5;                                     // exakter Name
  if(new RegExp('^'+ftEscapeRegex(token)+'\\b').test(name)) return 4; // eigenständiges erstes Wort
  if(name.startsWith(token)) return 3;                             // Name beginnt mit Suchwort
  if(new RegExp('\\b'+ftEscapeRegex(token)).test(name)) return 2;    // Wortanfang im Namen
  if(name.includes(token)) return 1;                               // irgendwo im Namen
  if(nameCompact.includes(token)) return 1;                        // ohne Leerzeichen gematcht
  return 0;
}
// Mehrwort-Suche: die Query wird in einzelne Wörter zerlegt, JEDES muss irgendwo im Namen
// (oder einem Synonym) vorkommen (UND-Verknüpfung) — "hähnchen brust" findet damit auch
// "Hähnchenbrust, paniert", was die frühere Ein-Wort-Prüfung (kompletter Query als ein
// String) komplett verfehlt hätte. Score = Summe der Einzelwort-Scores, plus ein Bonus, wenn
// die Query als zusammenhängende Phrase in genau dieser Reihenfolge im Namen steckt (hält
// exakte Mehrwort-Treffer oben). Bei genau einem Suchwort verhält sich das exakt wie zuvor.
function ftFoodMatchScore(food, q){
  const qNorm = ftNormalizeSearchText(q).trim();
  if(!qNorm) return 0;
  const tokens = qNorm.split(/\s+/).filter(Boolean);
  const nameNorm = ftNormalizeSearchText(food.name);
  const nameCompact = nameNorm.replace(/\s+/g,'');
  let total = 0;
  for(const token of tokens){
    let best = ftTokenScore(nameNorm, nameCompact, token);
    if(!best){
      for(const s of (food.syn||[])){
        if(ftNormalizeSearchText(s).includes(token)){ best = 1; break; } // Synonymtreffer
      }
    }
    if(!best) return 0; // ein nicht gefundenes Wort verwirft den ganzen Treffer
    total += best;
  }
  if(tokens.length > 1 && nameNorm.includes(qNorm)) total += 2; // Phrasen-Bonus
  return total;
}

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

// Deckelt ftOffCache auf FT_OFF_CACHE_LIMIT Einträge — ohne das würde die Datei über Jahre mit
// jedem einzelnen online abgefragten/gescannten Produkt weiterwachsen, obwohl die meisten davon
// nur einmal gebraucht werden. Alles, was noch irgendwo referenziert wird (ein Tageseintrag,
// ein Favorit, eine gespeicherte Mahlzeit, eine gemerkte Menge), gilt als GESCHÜTZT und wird nie
// geräumt — sonst würde ein alter Tageseintrag beim nächsten Öffnen plötzlich "Lebensmittel
// nicht mehr verfügbar" zeigen. Kein echtes LRU (keine Zugriffszeitstempel vorhanden); da neue
// Cache-Einträge stets ans Ende von Object.keys() angehängt werden, kommt eine simple
// "älteste ungeschützte zuerst"-Räumung in der Praxis nah genug an eine LRU heran.
const FT_OFF_CACHE_LIMIT = 300;
function ftPruneOffCache(){
  const ids = Object.keys(ftOffCache);
  if(ids.length <= FT_OFF_CACHE_LIMIT) return;
  const protectedIds = new Set();
  Object.values(ftDays).forEach(day => {
    FT_MEAL_KEYS.forEach(k => (day[k]||[]).forEach(e => {
      if(e.sourceFoodId) protectedIds.add(e.sourceFoodId);
      // Gruppierte Mahlzeiten-Einträge (kind:'mealGroup', siehe ftAddMealGroupEntry() in
      // 15c-food-add.js) haben KEIN eigenes sourceFoodId, referenzieren aber über ihre
      // items[] weiterhin einzelne Lebensmittel — ohne diesen Zweig würde ein online
      // gefundenes Lebensmittel, das nur innerhalb einer getrackten Mahlzeit vorkommt,
      // fälschlich als "nicht mehr benutzt" aus dem Cache geräumt werden.
      if(e.kind === 'mealGroup') (e.items||[]).forEach(i => { if(i.sourceFoodId) protectedIds.add(i.sourceFoodId); });
    }));
  });
  ftFavorites.forEach(id => protectedIds.add(id));
  ftSavedMeals.forEach(m => m.items.forEach(i => protectedIds.add(i.sourceFoodId)));
  Object.keys(ftLastAmounts).forEach(id => protectedIds.add(id));
  const removable = ids.filter(id => !protectedIds.has(id));
  const overflow = ids.length - FT_OFF_CACHE_LIMIT;
  removable.slice(0, overflow).forEach(id => delete ftOffCache[id]);
}
// Verschiebt ein online gefundenes Lebensmittel vom rein-flüchtigen Treffer-Cache
// (ftOffMemCache) in den PERSISTENTEN Cache (ftOffCache) — erst in dem Moment, in dem es
// TATSÄCHLICH benutzt wird (Mahlzeit hinzugefügt, Favorit gesetzt, gespeicherte Mahlzeit
// angewendet, Barcode gescannt). Aufrufer: ftOffByBarcode() unten sowie ftAddEntryToMeal()/
// ftUpdateEntryInMeal()/ftApplySavedMeal()/ftToggleFavorite() (15c-food-add.js).
function ftPersistOffFoodIfNeeded(food){
  if(!food || typeof food.id !== 'string' || !food.id.startsWith('off_')) return;
  if(ftOffCache[food.id]) return; // schon dauerhaft gespeichert
  ftOffCache[food.id] = food;
  delete ftOffMemCache[food.id];
  ftPruneOffCache();
  ftSave('offCache', ftOffCache);
}

// Liefert IMMER ein Ergebnisobjekt statt food|null — {ok:true, food} bei Erfolg,
// {ok:false, reason:'notFound'|'offline'|'unreachable'} sonst. Bugfix: die Vorgängerversion
// hatte kein try/catch um fetch()/json() — offline oder bei API-Ausfall warf der Aufruf
// unbehandelt, ftHandleScannedCode() (15c-food-add.js) fing das nicht ab und blieb stumm beim
// Toast "Suche Produkt …" hängen, ohne dass der Nutzer je eine Rückmeldung bekam.
// 'offline' vs. 'unreachable': ein fehlgeschlagener fetch() kann viele Ursachen haben, die
// NICHTS mit der eigenen Internetverbindung zu tun haben (CORS-Preflight-Fehler beim relativ
// neuen search.openfoodfacts.org-Endpunkt, DNS-Filterung einzelner Subdomains, kurzzeitiger
// API-Ausfall) — navigator.onLine ist zwar auch nur eine Heuristik (meldet nur "OS denkt, es
// gibt eine Netzwerkschnittstelle"), aber deutlich zuverlässiger als "jeder fetch()-Fehler
// bedeutet automatisch kein Internet". Nur wenn der Browser SELBST von keiner Verbindung
// ausgeht, wird 'offline' gemeldet; sonst 'unreachable' mit entsprechend vorsichtigerem Text.
// EIN automatischer Retry nach kurzer Pause (ftDelay()), bevor endgültig aufgegeben wird —
// viele Fehlschläge gegen Open-Food-Facts sind transient (kurzzeitige Überlastung, einzelne
// verworfene Anfrage) und beim zweiten Versuch bereits wieder da.
function ftDelay(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
async function ftOffByBarcodeAttempt(code){
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,nutriments`;
  const res = await fetch(url, {headers:FT_OFF_HEADERS});
  if(!res.ok) return {ok:false, reason: navigator.onLine ? 'unreachable' : 'offline'};
  const data = await res.json();
  if(data.status !== 1) return {ok:false, reason:'notFound'};
  const f = ftNormalizeOFF(data.product, code);
  if(!f) return {ok:false, reason:'notFound'};
  ftPersistOffFoodIfNeeded(f);
  return {ok:true, food:f};
}
async function ftOffByBarcode(code){
  if(ftOffCache['off_'+code]) return {ok:true, food: ftOffCache['off_'+code]};
  if(ftOffMemCache['off_'+code]) return {ok:true, food: ftOffMemCache['off_'+code]};
  let result;
  try{ result = await ftOffByBarcodeAttempt(code); }
  catch(e){ result = {ok:false, reason: navigator.onLine ? 'unreachable' : 'offline'}; }
  // 'notFound' nicht erneut versuchen — das Produkt existiert schlicht nicht in der Datenbank,
  // ein zweiter Versuch ändert daran nichts und würde nur unnötig warten lassen.
  if(result.ok || result.reason === 'notFound') return result;
  await ftDelay(700);
  try{ return await ftOffByBarcodeAttempt(code); }
  catch(e){ return {ok:false, reason: navigator.onLine ? 'unreachable' : 'offline'}; }
}

function ftNormalizeOFF(product, code){
  const n = product.nutriments || {};
  const kcal = n['energy-kcal_100g'];
  if(kcal === undefined || kcal === null) return null;
  const f = {
    id: 'off_'+code,
    name: product.product_name || 'Unbenanntes Produkt',
    brand: product.brands ? product.brands.split(',')[0].trim() : '',
    kcal: ftRound1(kcal),
    p: ftRound1(n['proteins_100g'] || 0),
    c: ftRound1(n['carbohydrates_100g'] || 0),
    f: ftRound1(n['fat_100g'] || 0),
    piece: null,
  };
  // Ballaststoffe/Zucker/Salz optional übernehmen — OpenFoodFacts liefert sie nicht für jedes
  // Produkt, daher nur setzen, wenn tatsächlich ein Wert vorhanden ist (siehe Kommentar in
  // ftAddEntryToMeal()/ftUpdateEntryInMeal() zum Unterschied "Feld fehlt" vs. "Feld ist 0").
  if(n['fiber_100g'] !== undefined && n['fiber_100g'] !== null) f.fiber = ftRound1(n['fiber_100g']);
  if(n['sugars_100g'] !== undefined && n['sugars_100g'] !== null) f.sugar = ftRound1(n['sugars_100g']);
  if(n['salt_100g'] !== undefined && n['salt_100g'] !== null) f.salt = Math.round(n['salt_100g']*100)/100;
  return f;
}
function ftRound1(n){ return Math.round(n*10)/10; }

// Liefert {results, reason}. Ergebnisse werden NUR noch in den flüchtigen ftOffMemCache
// gelegt (nicht mehr in ftOffCache/ftSave) — sonst hätte jede Texteingabe in der Suche (bis
// zu 15 Treffer, alle paar hundert Millisekunden) den kompletten persistenten Cache neu auf
// die Platte geschrieben, obwohl die allermeisten Treffer nie angetippt werden. Ein Treffer
// wird erst dauerhaft gespeichert, wenn er wirklich benutzt wird (ftPersistOffFoodIfNeeded()
// oben). ftGetFoodById() findet ihn bis dahin trotzdem zuverlässig über ftOffMemCache — der
// ursprüngliche Bugfix ("Klick auf Online-Treffer tat nichts") bleibt damit erhalten.
// `reason` ist null bei einer erfolgreich durchgeführten Suche (auch mit 0 Treffern), sonst
// 'offline' oder 'unreachable' — siehe ausführlichen Kommentar bei ftOffByBarcode() oben zum
// Unterschied: ein fetch()-Fehler bedeutet NICHT automatisch fehlendes Internet (CORS-Hänger,
// DNS-Filterung einzelner Subdomains, kurzzeitiger API-Ausfall sehen identisch aus). Erst wenn
// navigator.onLine selbst false meldet, wird ehrlich "offline" statt des vorsichtigeren
// "unreachable" gemeldet. ftHandleSearchInput() (15c-food-add.js) zeigt dafür unterschiedliche
// Hinweise, statt jeden Fetch-Fehler pauschal als "kein Internet" darzustellen.
async function ftOffSearchAttempt(query, pageSize){
  const size = pageSize || 15;
  // Primär: Search-a-licious. Fallback: legacy search.pl.
  let requestFailed = true;
  try{
    const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&langs=de&page_size=${size}&fields=code,product_name,brands,nutriments`;
    const res = await fetch(url, {headers:FT_OFF_HEADERS});
    if(res.ok){
      requestFailed = false;
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
        out.forEach(f => { ftOffMemCache[f.id] = f; });
        return {results: out, reason: null};
      }
    }
  }catch(e){ /* weiter zu Fallback */ }
  try{
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=${size}&fields=code,product_name,brands,nutriments`;
    const res = await fetch(url, {headers:FT_OFF_HEADERS});
    requestFailed = false;
    const data = await res.json();
    const out = [];
    for(const p of (data.products || [])){
      const code = p.code;
      if(!code) continue;
      const f = ftNormalizeOFF(p, code);
      if(f) out.push(f);
    }
    if(out.length) out.forEach(f => { ftOffMemCache[f.id] = f; });
    return {results: out, reason: null};
  }catch(e){
    return {results: [], reason: (requestFailed && !navigator.onLine) ? 'offline' : (requestFailed ? 'unreachable' : null)};
  }
}
// Ein Fehlschlag (reason !== null, egal ob 'offline' oder 'unreachable') wird EINMAL nach
// kurzer Pause wiederholt, bevor die Suche endgültig aufgibt — viele Fehlschläge gegen
// Open-Food-Facts sind transient und beim zweiten Versuch (wenige hundert Millisekunden
// später) bereits wieder da. Kostet nur auf dem Fehlschlag-Pfad zusätzliche Zeit, der
// erfolgreiche Regelfall bleibt genauso schnell wie zuvor.
//
// Bei MEHRWORT-Suchen (z.B. "ESN Protein") geht das direkt an Open-Food-Facts durchgereichte
// q= NICHT zuverlässig als UND-Verknüpfung über Marken-/Namensfeld hinweg auf — ein Wort allein
// (z.B. nur "ESN") liefert viele Treffer, weil es z.B. nur gegen das Markenfeld matcht, aber
// zusammen mit einem zweiten Wort ("ESN Protein") oft schlicht NICHTS mehr, weil OFF die
// gesamte Zeichenkette als EINEN Suchbegriff gegen ein einzelnes Feld prüft und "protein" dort
// nicht zwangsläufig im Produktnamen vorkommt (z.B. "ESN Designer Whey" enthält das Wort
// "Protein" gar nicht, obwohl es eindeutig ein ESN-Proteinprodukt ist). Fix: bei mehr als einem
// Wort zusätzlich zur vollen Phrase auch mit JEDEM einzelnen (ausreichend langen) Wort einzeln
// bei OFF anfragen — nicht nur dem ersten, da die Marke genauso gut am Ende stehen kann
// ("Whey Protein ESN") —, mit größerem page_size (breiterer Suchradius, da diese Ein-Wort-
// Anfragen oft sehr viele Treffer haben und der gesuchte Artikel sonst außerhalb der Top 15
// landen könnte). Die vereinigten Treffer werden anschließend LOKAL gefiltert (Name + Marke
// müssen ALLE eingegebenen Wörter enthalten) und nach Relevanz sortiert (ftOffMatchScore) statt
// einfach in OFF-Reihenfolge zu bleiben — auf maximal 4 Wortabfragen gedeckelt, damit auch bei
// langen Eingaben nicht unbegrenzt viele parallele Anfragen losgeschickt werden.
const FT_OFF_TOKEN_QUERY_CAP = 4;
const FT_OFF_TOKEN_PAGE_SIZE = 40;
// Analog zu ftFoodMatchScore() für lokale Treffer, aber gegen Name+Marke eines Online-Treffers
// statt gegen einen einzelnen Namensstring — bestimmt die Sortierung der Online-Ergebnisliste,
// damit bei mehreren Suchworten die textlich passendsten Produkte oben stehen statt einfach in
// der von OFF gelieferten Reihenfolge (die keine Rücksicht auf Mehrwort-Queries nimmt).
function ftOffMatchScore(food, tokensNorm){
  const hay = ftNormalizeSearchText(`${food.name} ${food.brand||''}`);
  const hayCompact = hay.replace(/\s+/g,'');
  let total = 0;
  for(const token of tokensNorm){
    const best = ftTokenScore(hay, hayCompact, token);
    if(!best) return 0;
    total += best;
  }
  return total;
}
async function ftOffSearch(query){
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if(tokens.length <= 1){
    const first = await ftOffSearchAttempt(query);
    if(!first.reason) return first;
    await ftDelay(700);
    return ftOffSearchAttempt(query);
  }
  const first = await ftOffMultiWordSearchAttempt(query, tokens);
  if(!first.reason) return first;
  await ftDelay(700);
  return ftOffMultiWordSearchAttempt(query, tokens);
}
async function ftOffMultiWordSearchAttempt(query, tokens){
  const tokenQueries = tokens.filter(t => t.length >= 2).slice(0, FT_OFF_TOKEN_QUERY_CAP);
  const queries = [query, ...tokenQueries].filter((q, i, arr) =>
    arr.findIndex(x => x.toLowerCase() === q.toLowerCase()) === i // Dubletten raus (z.B. Ein-Wort-Rest)
  );
  const attempts = await Promise.all(queries.map(q =>
    ftOffSearchAttempt(q, q === query ? 15 : FT_OFF_TOKEN_PAGE_SIZE)
  ));
  const merged = new Map();
  attempts.forEach(a => a.results.forEach(f => merged.set(f.id, f)));
  const tokensNorm = tokens.map(ftNormalizeSearchText);
  const filtered = [...merged.values()]
    .map(f => ({f, s: ftOffMatchScore(f, tokensNorm)}))
    .filter(x => x.s > 0)
    .sort((a,b) => b.s - a.s)
    .map(x => x.f);
  // reason nur melden, wenn wirklich NICHTS zustande kam — sind gefilterte Treffer da, ist die
  // Suche als Ganzes erfolgreich, auch wenn z.B. der Phrasen-Versuch für sich allein
  // fehlgeschlagen war und nur ein Ein-Wort-Versuch etwas geliefert hat.
  if(filtered.length) return {results: filtered, reason: null};
  const reasons = attempts.map(a => a.reason);
  const reason = reasons.includes('offline') ? 'offline' : (reasons.includes('unreachable') ? 'unreachable' : null);
  return {results: [], reason};
}

/* ============ Tagessummen ============ */
// Kleiner Fortschrittsbalken zu einem optionalen Tagesziel (siehe ftGoals, Einstellungen im
// Essenstracker) — liefert bewusst einen LEEREN String, wenn kein Ziel gesetzt ist, statt
// einen leeren/0%-Balken zu zeigen: ist gar kein Ziel hinterlegt, soll die Anzeige exakt wie
// vorher aussehen (nur die reine Zahl), nicht wie ein Fortschritt zu einem nicht vorhandenen
// Ziel. Bei Überschreiten des Ziels bleibt der Balken bei 100% stehen (kein Überlaufen über
// den Rand hinaus) — die Zahl daneben zeigt den tatsächlichen Wert ja ohnehin weiterhin an.
// Kurzes Label für eine Portionsangabe bei gruppierten Mahlzeiten-Einträgen (kind:'mealGroup',
// siehe ftAddMealGroupEntry() in 15c-food-add.js) — gängige Bruchteile als Bruch statt Dezimal
// ("1/2" statt "0,5"), alles andere als Faktor ("1,5×"). Von der Portionsauswahl (ftOpenPortion-
// Modal(), 15c) UND vom Tages-Snapshot-PDF (ftExportDaySnapshotPdf(), hier in 15b) genutzt —
// deshalb hier in 15a statt in einer der beiden Dateien, damit beide es ohne Ladereihenfolge-
// Probleme aufrufen können.
/* ============ Eigenes Design (Akkordeon "Design" in ftOpenSettingsSheet(), 15b-food-day.js)
   ============
   Effektive Getter, die IMMER zuerst ftThemeOverride prüfen und nur bei fehlendem Feld auf die
   allgemeine App-Einstellung zurückfallen (siehe Kommentar an ftThemeOverride oben) — genutzt
   sowohl vom Design-Akkordeon selbst (aktuellen Wert anzeigen) als auch von ftApplyTheme()
   (tatsächliches Setzen der CSS-Variablen). */
function ftCurrentThemeMode(){
  return ftThemeOverride.themeMode || currentThemeMode();
}
function ftCurrentAccentColor(){
  if (ftThemeOverride.accentColorId === 'custom' && ftThemeOverride.accentCustomHex){
    return { id: 'custom', name: 'Eigene Farbe', hex: ftThemeOverride.accentCustomHex };
  }
  if (ftThemeOverride.accentColorId){
    const found = allAccentSwatches().find(c => c.id === ftThemeOverride.accentColorId);
    if (found) return found;
  }
  return currentAccentColor();
}
function ftCurrentBgColor(){
  if (ftThemeOverride.bgColorId === 'custom' && ftThemeOverride.bgCustomHex){
    return { id: 'custom', name: 'Eigene Farbe', hex: ftThemeOverride.bgCustomHex };
  }
  if (ftThemeOverride.bgColorId === 'default') return null; // ausdrücklich KEIN eigener Hintergrund
  if (ftThemeOverride.bgColorId){
    const found = allBgSwatches().find(c => c.id === ftThemeOverride.bgColorId);
    if (found) return found;
  }
  return currentBgColor();
}
function ftCurrentAccentContrastThreshold(){
  const v = ftThemeOverride.accentContrastThreshold;
  return (typeof v === 'number' && v >= 0 && v <= 1) ? v : currentAccentContrastThreshold();
}
// Identisch zu bgSwatchesForCurrentMode() (02-state-theme.js), aber nach ftCurrentThemeMode()
// statt dem allgemeinen currentThemeMode() gefiltert — die Hintergrund-Palette im
// Essenstracker-Design-Akkordeon soll zum EIGENEN Hell-/Dunkelmodus passen, nicht zum
// gerade zufällig im allgemeinen Trainingsplan aktiven.
function ftBgSwatchesForCurrentMode(){
  const neutrals = ftCurrentThemeMode() === 'light' ? BG_NEUTRAL_COLORS.light : BG_NEUTRAL_COLORS.dark;
  const favs = favoriteAccentColors().map(hex => ({ id: `fav-${hex.replace('#','')}`, name: hex.toUpperCase(), hex, isFavorite: true }));
  return [...neutrals, ...favs];
}
// Identisch zu contrastTextColor() (02-state-theme.js), nur mit dem essenstracker-eigenen
// Kontrast-Schwellwert statt dem allgemeinen — kleine, bewusste Duplikation statt die
// allgemeine Funktion mit einem Parameter zu verbiegen, der überall sonst in der App nie
// gebraucht wird.
function ftContrastTextColor(hex){
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  const lin = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > ftCurrentAccentContrastThreshold() ? '#121316' : '#ffffff';
}
// Identisch zu syncStatusBarColor() (02-state-theme.js), nur mit ftCurrentThemeMode() statt
// dem allgemeinen currentThemeMode() als Fallback für die Statusleisten-Farbe ohne eigenen
// Hintergrund.
function ftSyncStatusBarColor(resolvedBgColor){
  const hex = (resolvedBgColor && resolvedBgColor.hex) || (ftCurrentThemeMode() === 'light' ? '#f5f4f1' : '#121316');
  const old = document.getElementById('metaThemeColor');
  if (!old || old.getAttribute('content') !== hex){
    if (old) old.remove();
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('id', 'metaThemeColor');
    meta.setAttribute('content', hex);
    document.head.appendChild(meta);
  }
  document.documentElement.style.colorScheme = ftCurrentThemeMode() === 'light' ? 'light' : 'dark';
}
// Essenstracker-Pendant zu applyTheme() (02-state-theme.js) — wird von JEDEM Essenstracker-
// Bildschirm-Renderer als allererstes aufgerufen (renderFoodTracker()/renderFoodStats()/
// renderFtAddFood()/renderFtMonthOverview()), damit das eigene Farbschema beim Betreten IMMER
// frisch angewendet wird, auch wenn zwischenzeitlich im allgemeinen Trainingsplan ein anderes
// Theme aktiv war. Schriftart bleibt bewusst UNANGETASTET (Nutzerwunsch: "außer Schriftart") —
// applyFontFamily() wird hier absichtlich nicht aufgerufen, die allgemeine Schriftart bleibt
// also auch im Essenstracker unverändert sichtbar. Das Zurücksetzen auf das allgemeine Theme
// beim Verlassen des Essenstrackers passiert NICHT hier, sondern zentral in
// renderViewByState() (06-navigation.js), da jeder Rücksprung (Zurück-Pfeil) über
// history.back() läuft und dort ankommt.
function ftApplyTheme(){
  document.documentElement.setAttribute('data-theme', ftCurrentThemeMode());
  const accentHex = ftCurrentAccentColor().hex;
  document.documentElement.style.setProperty('--accent', accentHex);
  document.documentElement.style.setProperty('--accent-contrast', ftContrastTextColor(accentHex));
  const bgColor = ftCurrentBgColor();
  const root = document.documentElement.style;
  if (bgColor){
    root.setProperty('--bg', bgColor.hex);
    const derived = deriveSurfaceColors(bgColor.hex);
    root.setProperty('--surface', derived.surface);
    root.setProperty('--surface-2', derived.surface2);
    root.setProperty('--border', derived.border);
  } else {
    root.removeProperty('--bg');
    root.removeProperty('--surface');
    root.removeProperty('--surface-2');
    root.removeProperty('--border');
  }
  ftSyncStatusBarColor(bgColor);
}

function ftPortionLabel(p){
  if(Math.abs(p-0.25)<0.001) return '1/4';
  if(Math.abs(p-0.5)<0.001) return '1/2';
  if(Math.abs(p-0.75)<0.001) return '3/4';
  if(Math.abs(p-1)<0.001) return '1×';
  // NICHT ftFormatNum() (rundet auf die nächsten 0,5 — gedacht für Gramm-/Stückangaben, siehe
  // dort) — das würde z.B. 0,3 fälschlich als "0,5×" anzeigen, obwohl intern korrekt mit 0,3
  // weitergerechnet wird (Bug: Anzeige und tatsächlich berechnete kcal liefen auseinander).
  // Stattdessen auf 2 Nachkommastellen runden und überflüssige Nullen abschneiden.
  const rounded = Math.round(p*100)/100;
  return rounded.toString().replace('.', ',')+'×';
}
function ftGoalBarHTML(value, goal, color, small){
  if (!goal) return '';
  const pct = Math.min(100, Math.round(value / goal * 100));
  return `<div class="ft-goal-bar${small ? ' ft-goal-bar-small' : ''}"><div class="ft-goal-bar-fill" style="width:${pct}%; background:${color};"></div></div>`;
}
function ftComputeTotals(iso){
  const day = ftGetDay(iso);
  let kcal=0,p=0,c=0,f=0,fiber=0,sugar=0,salt=0;
  for(const key of FT_MEAL_KEYS){
    for(const e of day[key]){
      kcal += e.kcal; p += e.p; c += e.c; f += e.f;
      fiber += e.fiber||0; sugar += e.sugar||0; salt += e.salt||0;
    }
  }
  return {
    kcal:Math.round(kcal), p:Math.round(p), c:Math.round(c), f:Math.round(f),
    fiber:Math.round(fiber*10)/10, sugar:Math.round(sugar*10)/10, salt:Math.round(salt*100)/100,
  };
}
function ftMealTotal(iso, meal){
  return Math.round(ftGetDay(iso)[meal].reduce((s,e)=>s+e.kcal,0));
}


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
// Stift-Icon fürs Bearbeiten einer gespeicherten Mahlzeit-Vorlage (ftOpenEditSavedMealSheet(),
// 15b-food-day.js) — neben dem bestehenden Löschen-Symbol (ftIconTrash) auf derselben Zeile.
function ftIconPencil(){
  return `<svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function ftIconRepeat(){
  return `<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M17 2l4 4-4 4M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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

/* ============ Tagessummen für andere Screens (Trainingskalender) ============
   ftDayTotalsForISO()/ftAllDayTotals()/ftComputeMonthStats() liegen bewusst hier statt in
   15d-food-stats.js (siehe Erläuterung am Dateikopf) — 05-calendar.js (Tages-Popup und
   Monatsbericht im TRAININGSkalender) ruft beide für die Essenstracker-Werte desselben Tages
   auf, unabhängig davon, ob die Essenstracker-Statistikseite je geöffnet wurde. */
function ftDayTotalsForISO(iso){
  const day = ftDays[iso];
  if (!day) return null;
  let kcal=0,p=0,c=0,f=0,fiber=0,sugar=0,salt=0;
  FT_MEAL_KEYS.forEach(k => (day[k]||[]).forEach(e => {
    kcal+=e.kcal; p+=e.p; c+=e.c; f+=e.f;
    fiber+=e.fiber||0; sugar+=e.sugar||0; salt+=e.salt||0;
  }));
  if (!kcal) return null;
  return {
    kcal: Math.round(kcal), p: Math.round(p), c: Math.round(c), f: Math.round(f),
    fiber: Math.round(fiber*10)/10, sugar: Math.round(sugar*10)/10, salt: Math.round(salt*100)/100,
  };
}
function ftAllDayTotals(){
  return Object.keys(ftDays).map(iso => {
    const totals = ftDayTotalsForISO(iso);
    return totals ? { date: iso, ...totals } : null;
  }).filter(Boolean)
    .sort((a,b) => a.date.localeCompare(b.date));
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

function ftBuildExportPayload(){
  return {
    days: ftDays, favorites: ftFavorites, customFoods: ftCustomFoods, savedMeals: ftSavedMeals,
    recent: ftRecent, lastAmounts: ftLastAmounts, usageCount: ftFoodUsageCount, goals: ftGoals,
  };
}
// Übernimmt ein per ftBuildExportPayload() (oder kompatibel) erzeugtes Essenstracker-
// Datenobjekt UND speichert es persistent — von ftImportData() (eigenständiger Essenstracker-
// Import) UND vom allgemeinen Trainings-Import (10-plan-settings.js) genutzt, wenn die
// importierte Datei ein "food"-Feld enthält.
async function ftApplyImportedData(food){
  ftDays = food.days || {};
  ftFavorites = food.favorites || [];
  ftCustomFoods = food.customFoods || [];
  ftSavedMeals = food.savedMeals || [];
  ftRecent = food.recent || {breakfast:[], lunch:[], dinner:[], snacks:[]};
  ftLastAmounts = food.lastAmounts || {};
  ftFoodUsageCount = food.usageCount || {};
  ftGoals = food.goals || { kcal: null, p: null, c: null, f: null };
  foodTrackerLoaded = true;
  await Promise.all([
    ftSave('days', ftDays),
    ftSave('favorites', ftFavorites),
    ftSave('customFoods', ftCustomFoods),
    ftSave('savedMeals', ftSavedMeals),
    ftSave('recent', ftRecent),
    ftSave('lastAmounts', ftLastAmounts),
    ftSave('usageCount', ftFoodUsageCount),
    ftSave('goals', ftGoals),
  ]);
}

function ftExportData(){
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    ...ftBuildExportPayload(),
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
  reader.onload = async ()=>{
    let parsed;
    try{ parsed = JSON.parse(reader.result); }
    catch(e){ ftToast('Datei ist kein gültiges JSON'); return; }
    if(!parsed || typeof parsed !== 'object' || !parsed.days){
      ftToast('Datei sieht nicht wie ein Essenstracker-Backup aus');
      return;
    }
    if(!confirm('Vorhandene Daten auf diesem Gerät werden durch die Backup-Datei ersetzt. Fortfahren?')) return;
    await ftApplyImportedData(parsed);
    ftCloseOverlay();
    renderFoodTracker();
    ftToast('Import erfolgreich');
  };
  reader.readAsText(file);
}
