/* ---------------------------------------------------
   15b-food-day.js
   ---------------------------------------------------
   Essenstracker: Tagesansicht (renderFoodTracker), Monats-Kalender
   (Essenstracker-eigene Seite, teilt sich die Trainingskalender-Bausteine
   aus 05-calendar.js) und das Einstellungs-Sheet (Tagesziele, Export/
   Import-Buttons — die eigentliche Export-/Import-LOGIK liegt in
   15a-food-core.js, hier nur die UI).

   Teil des Splits von 15-food-tracker.js — siehe Kopfkommentar in
   15a-food-core.js für die Gesamtübersicht und Beweggründe.

   Setzt voraus, dass 15a-food-core.js bereits geladen ist (State, ftSaveDays,
   ftGetDay, Overlay-/Toast-Helfer, Icons, ftEscapeHTML, ftGoalBarHTML, ...).
--------------------------------------------------- */

/* ============ Rendering: Hauptseite ============ */
function renderFoodTracker(){
  ftApplyTheme();
  if (!ftCurrentDate) ftCurrentDate = ftTodayISO();
  const day = ftGetDay(ftCurrentDate);
  const totals = ftComputeTotals(ftCurrentDate);
  const isEmptyDay = FT_MEAL_KEYS.every(k => day[k].length === 0);
  // "Wie gestern"-Vorschlag nur, wenn der aktuell angezeigte Tag noch KOMPLETT leer ist UND
  // der Tag davor tatsächlich etwas enthält — verhindert versehentliche Doppel-Einträge, die
  // ein Klick auf einen Tag mit bereits vorhandenen Einträgen sonst erzeugen würde. Bezieht
  // sich bewusst auf den Tag VOR dem gerade angezeigten (nicht zwingend "gestern" im
  // Kalendersinn), damit es auch beim Nachtragen älterer Tage über den Kalender funktioniert.
  const prevIso = ftAddDays(ftCurrentDate, -1);
  const prevDayHasEntries = !!ftDays[prevIso] && FT_MEAL_KEYS.some(k => (ftDays[prevIso][k]||[]).length);
  const copyPrevBtnHTML = (isEmptyDay && prevDayHasEntries) ? `
    <button class="ft-copy-prev-btn" id="ftCopyPrevBtn" type="button">${ftIconRepeat()} Wie ${prevIso === ftAddDays(ftTodayISO(),-1) ? 'gestern' : 'am Vortag'} übernehmen</button>
  ` : '';
  // Ballaststoffe/Zucker/Salz bewusst NICHT in der oberen .summary-card (die bleibt schlank,
  // nur kcal + die drei Hauptmakros) — stattdessen als kleine, unauffällige Zeile ganz unten
  // nach den Mahlzeiten, und auch nur, wenn an diesem Tag überhaupt ein Lebensmittel mit
  // hinterlegten Werten dabei war (sonst stünde dort bedeutungslos "0g").
  const hasExtra = totals.fiber > 0 || totals.sugar > 0 || totals.salt > 0;
  const extraNutrientsHTML = hasExtra ? `
    <div class="ft-extra-nutrients">
      <div class="ft-extra-nutrients-label">Weitere Nährwerte heute</div>
      <div class="ft-extra-nutrients-row">
        ${totals.fiber > 0 ? `<span>Ballaststoffe <b>${totals.fiber} g</b></span>` : ''}
        ${totals.sugar > 0 ? `<span>Zucker <b>${totals.sugar} g</b></span>` : ''}
        ${totals.salt > 0 ? `<span>Salz <b>${totals.salt} g</b></span>` : ''}
      </div>
    </div>
  ` : '';
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
        <div class="kcal-value">${totals.kcal}${ftGoals.kcal ? `<span class="ft-goal-of"> / ${ftGoals.kcal}</span>` : ''}</div>
        <div class="kcal-label">kcal heute</div>
        ${ftGoalBarHTML(totals.kcal, ftGoals.kcal, 'var(--accent)')}
      </button>
      <div class="macro-row">
        <div class="macro"><div><span class="macro-dot" style="background:var(--protein)"></span><span class="macro-val">${totals.p} g${ftGoals.p ? `<span class="ft-goal-of"> / ${ftGoals.p}</span>` : ''}</span></div><div class="macro-label">Protein</div>${ftGoalBarHTML(totals.p, ftGoals.p, 'var(--protein)', true)}</div>
        <div class="macro"><div><span class="macro-dot" style="background:var(--carbs)"></span><span class="macro-val">${totals.c} g${ftGoals.c ? `<span class="ft-goal-of"> / ${ftGoals.c}</span>` : ''}</span></div><div class="macro-label">Kohlenhydrate</div>${ftGoalBarHTML(totals.c, ftGoals.c, 'var(--carbs)', true)}</div>
        <div class="macro"><div><span class="macro-dot" style="background:var(--fat)"></span><span class="macro-val">${totals.f} g${ftGoals.f ? `<span class="ft-goal-of"> / ${ftGoals.f}</span>` : ''}</span></div><div class="macro-label">Fett</div>${ftGoalBarHTML(totals.f, ftGoals.f, 'var(--fat)', true)}</div>
      </div>
    </div>
    ${copyPrevBtnHTML}
    ${FT_MEAL_KEYS.map(ftMealHTML).join('')}
    ${extraNutrientsHTML}
  `;
  document.getElementById('ftBackBtn').onclick = () => history.back();
  document.getElementById('ftStatsBtn').onclick = () => goFoodStats();
  document.getElementById('dArrowBack').onclick = ()=>{ ftCurrentDate = ftAddDays(ftCurrentDate,-1); renderFoodTracker(); };
  document.getElementById('dArrowFwd').onclick = ()=>{ ftCurrentDate = ftAddDays(ftCurrentDate,1); renderFoodTracker(); };
  document.getElementById('dLabel').onclick = () => goFoodCalendar();
  document.getElementById('settingsBtn').onclick = ftOpenSettingsSheet;
  const copyPrevBtn = document.getElementById('ftCopyPrevBtn');
  if (copyPrevBtn) copyPrevBtn.onclick = ftOpenCopyPrevDayPrompt;
  FT_MEAL_KEYS.forEach(meal=>{
    document.getElementById('addBtn_'+meal).onclick = (ev)=>{ ev.stopPropagation(); goFtAddFood(meal); };
    const headEl = document.getElementById('mealHead_'+meal);
    if (headEl) headEl.onclick = ()=>{
      const key = ftCurrentDate + '_' + meal;
      ftMealCollapseOverride[key] = !ftMealIsCollapsed(meal, ftCurrentDate);
      renderFoodTracker();
    };
    ftGetDay(ftCurrentDate)[meal].forEach(e=>{
      const delBtn = document.getElementById('del_'+e.id);
      if(delBtn) delBtn.onclick = (ev)=>{ ev.stopPropagation(); ftRemoveEntry(meal, e.id); };
    });
    document.querySelectorAll(`.food-row[data-meal="${meal}"]`).forEach(row=>{
      row.onclick = () => {
        if(row.dataset.group === '1') ftOpenMealGroupDetail(meal, row.dataset.entryId);
        else ftOpenEditEntryModal(meal, row.dataset.entryId);
      };
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

/* ============ Vergangene Mahlzeiten automatisch einklappen + aktuelle hervorheben ============
   Rein zeitbasiert (Wanduhrzeit), nur für den HEUTIGEN Tag relevant — beim Blättern zu einem
   anderen Tag über die Pfeile/den Kalender ergibt "welche Mahlzeit ist gerade dran" keinen
   Sinn, dort bleibt daher alles standardmäßig eingeklappt, ohne Hervorhebung.
   ftMealCollapseOverride hält ausschließlich MANUELLE Auf-/Zuklapp-Aktionen fest (Tap auf den
   Mahlzeiten-Kopf) und übersteuert damit den Zeit-Default für den Rest der Sitzung — tippt man
   z. B. das automatisch eingeklappte Frühstück auf, bleibt es so lange offen, bis man es selbst
   wieder zuklappt, auch wenn man das Zeitfenster längst verlassen hat. Key ist
   "datum_mahlzeit", damit beim Zurückblättern zu einem Tag, an dem man vorher manuell etwas
   umgeschaltet hat, dieser Zustand erhalten bleibt, ohne sich mit anderen Tagen zu überschneiden. */
let ftMealCollapseOverride = {};
// [von, bis] in Stunden (inklusive) — NUR innerhalb dieses Fensters ist eine Mahlzeit am
// heutigen Tag automatisch aufgeklappt UND als "aktuell" hervorgehoben. Außerhalb (auch in den
// Lücken dazwischen, z. B. 10–11 Uhr) UND an jedem anderen Tag gilt der Standard: eingeklappt.
const FT_MEAL_WINDOW = { breakfast: [7, 10], lunch: [11, 14], dinner: [15, 19.5] };
function ftMealDefaultCollapsed(meal, dateIso){
  if (meal === 'snacks') return true; // Snacks: immer eingeklappter Sammeltopf, öffnet nie automatisch
  return ftCurrentMeal(dateIso) !== meal;
}
function ftMealIsCollapsed(meal, dateIso){
  const key = dateIso + '_' + meal;
  return key in ftMealCollapseOverride ? ftMealCollapseOverride[key] : ftMealDefaultCollapsed(meal, dateIso);
}
// Welche Mahlzeit gerade "dran" ist (automatisches Aufklappen + farbige Hervorhebung) — nur für
// heute, nur innerhalb des jeweiligen Zeitfensters oben. In den Lücken dazwischen (z. B.
// 10–11 Uhr) und außerhalb aller Fenster ist keine Mahlzeit "aktuell".
function ftCurrentMeal(dateIso){
  if (dateIso !== ftTodayISO()) return null;
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  for (const meal of ['breakfast', 'lunch', 'dinner']){
    const [from, to] = FT_MEAL_WINDOW[meal];
    if (hour >= from && hour <= to) return meal;
  }
  return null;
}

// Sortiert die Einträge einer Mahlzeit nach kcal absteigend (größter Kalorienbeitrag zuerst) —
// gemeinsam genutzt von der aufgeklappten Zutatenliste UND der eingeklappten Vorschauzeile in
// ftMealHTML(), damit beide dieselbe Reihenfolge zeigen. Ties (gleiche kcal) behalten ihre
// bisherige Reihenfolge (Array.sort in modernen JS-Engines ist stabil), .slice() zuerst, damit
// das Original-Array (die eigentlichen Tagesdaten) nicht verändert wird.
function ftSortedByKcal(entries){
  return entries.slice().sort((a, b) => (b.kcal || 0) - (a.kcal || 0));
}

function ftMealHTML(meal){
  const entries = ftGetDay(ftCurrentDate)[meal];
  // "Als Mahlzeit speichern" nur, solange die Mahlzeit ausschließlich aus einzelnen
  // Lebensmitteln besteht. Steckt bereits ein gruppierter Eintrag (kind:'mealGroup', also eine
  // zuvor gespeicherte Mahlzeit) darin, wäre das Ergebnis eine Mahlzeit aus einer Mahlzeit —
  // der Speichern-Dialog (ftOpenSaveMealSheet(), 15c-food-add.js) arbeitet auf einzelnen
  // Zutaten, und eine erneute Sicherung eines schon gespeicherten Blocks bringt nichts.
  const hasMealGroup = entries.some(e => e.kind === 'mealGroup');
  // Snacks sind bewusst die Sammelstelle für einzelne, lose Kleinigkeiten zwischendurch —
  // "Als Mahlzeit speichern" passt konzeptionell nicht dazu (keine feste Kombination, die man
  // wiederholt genau so essen würde) und entfällt hier daher unabhängig vom Inhalt.
  const canSaveAsMeal = meal !== 'snacks';
  const collapsed = ftMealIsCollapsed(meal, ftCurrentDate);
  const isCurrent = ftCurrentMeal(ftCurrentDate) === meal;
  const kcalBadgeHTML = entries.length ? `<span class="meal-kcal">· ${ftMealTotal(ftCurrentDate, meal)} kcal</span>` : '';
  const headHTML = `
    <div class="meal-head" id="mealHead_${meal}">
      <div class="meal-title">${FT_MEAL_LABELS[meal]} ${kcalBadgeHTML}</div>
      <div class="meal-head-actions">
        <button class="meal-add" id="addBtn_${meal}" aria-label="${FT_MEAL_LABELS[meal]} hinzufügen">+</button>
        <span class="mg-arrow" aria-hidden="true">${collapsed ? '▸' : '▾'}</span>
      </div>
    </div>
  `;
  // EIN durchgehender Kasten für die ganze Mahlzeit, ob ein- oder ausgeklappt (.meal-section
  // selbst trägt jetzt Rahmen/Ecken/Hintergrund, siehe CSS) — vorher hatte der aufgeklappte
  // Zustand den Titel als freistehende Zeile darüber und die Zutaten in einer eigenen,
  // zusätzlich umrandeten .food-list-Box darunter, was wie zwei separate Felder mit Lücke
  // dazwischen wirkte. Kopf und Inhalt (Vorschauzeile bzw. Zutatenliste) sitzen jetzt als
  // direkte Kinder in DERSELBEN Karte; nur wenn tatsächlich Inhalt unter dem Kopf folgt, kommt
  // eine einzelne Trennlinie dazwischen (.meal-section.has-body), Zutaten selbst trennen sich
  // nur noch durch die normale .food-row-Unterstreichung — keine doppelten/verschachtelten
  // Rahmen mehr.
  if (collapsed){
    // Kompakte Vorschau statt der vollen Zutatenliste — dasselbe Muster wie das "Mahlzeiten"-
    // Akkordeon auf der Startseite (homeMealsAccordionBodyHTML(), 07-home.js): nur die ersten
    // paar Lebensmittelnamen als eine einzeilige, per Ellipsis abgeschnittene Zeile, kein
    // Lösch-/Bearbeiten-Zugriff mehr auf einzelne Einträge (dafür erst aufklappen) und kein
    // "Als Mahlzeit speichern"-Button — beides wäre in dieser platzsparenden Zeile ohnehin kaum
    // bedienbar.
    // Vorher: die ersten 3 Namen einfach zusammengehängt und den Rest per CSS text-overflow:
    // ellipsis abgeschnitten — bei längeren Namen (z. B. "ESN Designer Whey") landete der Schnitt
    // dadurch mitten im Wort ("ESN Designer Wh..."), was unsauber wirkt. Stattdessen hier in JS
    // nur so viele VOLLSTÄNDIGE Namen aneinanderreihen, wie in ein grobes Zeichen-Budget passen
    // (MAX_CHARS, an der verfügbaren Kartenbreite bei dieser Schriftgröße orientiert), und den
    // Rest als expliziten "+N weitere"-Hinweis anhängen statt eines rohen "…" — bleibt in jedem
    // Fall an einer Wortgrenze. Der erste Name wird immer gezeigt, auch wenn er allein schon das
    // Budget sprengt (sonst bliebe die Vorschau leer) — CSS text-overflow bleibt als Sicherheitsnetz
    // für genau diesen Ausnahmefall bestehen.
    // Sortiert nach kcal absteigend (größter Beitrag zuerst) statt wie vorher neueste zuerst —
    // sowohl hier in der Vorschau als auch unten in der vollen Liste (ftSortedByKcal()).
    const previewAllNames = ftSortedByKcal(entries).map(e => e.name);
    const PREVIEW_MAX_CHARS = 34;
    const shownNames = [];
    let usedChars = 0;
    for (const name of previewAllNames){
      const sepChars = shownNames.length ? 3 : 0; // " · "
      if (shownNames.length && usedChars + sepChars + name.length > PREVIEW_MAX_CHARS) break;
      shownNames.push(name);
      usedChars += sepChars + name.length;
    }
    const remainingCount = previewAllNames.length - shownNames.length;
    const previewText = shownNames.join(' · ') + (remainingCount > 0 ? ` +${remainingCount} weitere` : '');
    return `
      <div class="meal-section${isCurrent ? ' current' : ''}${entries.length ? ' has-body' : ''}" data-meal="${meal}">
        ${headHTML}
        ${entries.length ? `<div class="meal-collapsed-items">${ftEscapeHTML(previewText)}</div>` : ''}
      </div>
    `;
  }
  return `
    <div class="meal-section${isCurrent ? ' current' : ''} has-body" data-meal="${meal}">
      ${headHTML}
      <div class="food-list">
        ${entries.length ? ftSortedByKcal(entries).map(e=> e.kind==='mealGroup' ? ftMealGroupRowHTML(meal,e) : ftFoodRowHTML(meal, e)).join('') : `<div class="empty-meal">Noch nichts eingetragen</div>`}
      </div>
      ${entries.length && !hasMealGroup && canSaveAsMeal ? `<button class="save-meal-btn" id="saveMeal_${meal}">Als Mahlzeit speichern</button>` : ''}
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
// Gruppierte Mahlzeiten-Einträge (kind:'mealGroup', entstehen beim Anwenden einer
// gespeicherten Mahlzeit über ftOpenApplySavedMealPortionPrompt()/ftAddMealGroupEntry() in
// 15c-food-add.js) erscheinen als EIN Eintrag statt als eine Zeile pro Zutat — Antippen öffnet
// ftOpenMealGroupDetail() (statt der normalen Mengen-Bearbeitung) mit der vollen Zutatenliste
// und der Möglichkeit, die getrackte Portion nachträglich zu ändern. data-group="1" markiert
// die Zeile für die Klick-Weiche in renderFoodTracker() weiter unten; das "X" zum schnellen
// Löschen funktioniert unverändert über die generische ftRemoveEntry() (wirft den kompletten
// Gruppen-Eintrag inkl. aller Zutaten weg, kein Sonderfall nötig).
function ftMealGroupRowHTML(meal, e){
  const itemCount = (e.items||[]).length;
  return `
    <div class="food-row" data-entry-id="${e.id}" data-meal="${meal}" data-group="1">
      <div class="food-row-main">
        <div class="food-row-name">${ftEscapeHTML(e.name)}</div>
        <div class="food-row-sub">${ftPortionLabel(e.portion)} Portion · ${itemCount} Zutat${itemCount===1?'':'en'}</div>
      </div>
      <div class="food-row-right">
        <div class="food-row-kcal">${Math.round(e.kcal)}</div>
        <button class="food-row-del" id="del_${e.id}">${ftIconX()}</button>
      </div>
    </div>
  `;
}
// ftEscapeHTML() lebt jetzt in 15a-food-core.js (dort auch von ftToastWithUndo() gebraucht).
function ftFormatNum(n){ return (Math.round(n*2)/2).toString().replace('.', ','); }

function ftRemoveEntry(meal, entryId){
  const dateIso = ftCurrentDate;
  const day = ftGetDay(dateIso);
  const idx = day[meal].findIndex(e=>e.id===entryId);
  if(idx === -1) return;
  const [removed] = day[meal].splice(idx, 1);
  ftSaveDays(dateIso);
  renderFoodTracker();
  ftToastWithUndo('Eintrag gelöscht', ()=>{
    const d = ftGetDay(dateIso);
    const insertAt = Math.min(idx, d[meal].length);
    d[meal].splice(insertAt, 0, removed);
    ftSaveDays(dateIso);
    if(ftCurrentDate === dateIso) renderFoodTracker();
  });
}

// Öffnet die Detailansicht/Portions-Bearbeitung für einen bereits getrackten gruppierten
// Mahlzeiten-Eintrag (kind:'mealGroup', angetippt in der Tagesansicht — siehe Klick-Weiche in
// renderFoodTracker()) — nutzt denselben ftOpenPortionModal()-Dialog wie das erstmalige
// Hinzufügen (ftApplySavedMeal(), 15c-food-add.js), nur mit dem bereits eingefrorenen items[]
// des Eintrags als Basis statt frisch aus den aktuellen Lebensmitteldaten aufgelöst — eine
// spätere Nährwert-Änderung am zugrundeliegenden Lebensmittel wirkt sich also NICHT rückwirkend
// auf bereits getrackte Tage aus (gleiches Prinzip wie bei normalen Einträgen).
function ftOpenMealGroupDetail(meal, entryId){
  const entry = ftGetDay(ftCurrentDate)[meal].find(e=>e.id===entryId);
  if(!entry || entry.kind !== 'mealGroup') return;
  ftOpenPortionModal({
    title: entry.name,
    baseItems: entry.items,
    initialPortion: entry.portion,
    confirmLabel: 'Aktualisieren',
    onConfirm: (portion) => {
      ftUpdateMealGroupPortion(meal, entryId, portion);
      ftCloseOverlay();
    },
    onDelete: () => ftRemoveEntry(meal, entryId),
  });
}
function ftUpdateMealGroupPortion(meal, entryId, portion){
  const entry = ftGetDay(ftCurrentDate)[meal].find(e=>e.id===entryId);
  if(!entry) return;
  const sums = ftSumItemMacros(entry.items);
  entry.portion = portion;
  entry.kcal = sums.kcal*portion; entry.p = sums.p*portion; entry.c = sums.c*portion; entry.f = sums.f*portion;
  if (sums.fiber !== undefined) entry.fiber = sums.fiber*portion; else delete entry.fiber;
  if (sums.sugar !== undefined) entry.sugar = sums.sugar*portion; else delete entry.sugar;
  if (sums.salt !== undefined) entry.salt = sums.salt*portion; else delete entry.salt;
  ftSaveDays(ftCurrentDate);
  renderFoodTracker();
  ftToast('Aktualisiert');
}

// Übernimmt Einträge des Tages VOR dem gerade angezeigten in den aktuellen Tag (Button nur
// sichtbar, wenn der aktuelle Tag noch komplett leer ist, siehe renderFoodTracker()) — erspart
// das erneute manuelle Zusammensuchen bei ähnlichem Tagesablauf. mealKeys grenzt ein, WELCHE
// Mahlzeiten übernommen werden (Default: alle FT_MEAL_KEYS = "Alles"); der Klick auf den Button
// fragt vorher per ftOpenCopyPrevDayPrompt() nach, welche es sein sollen, falls der Vortag
// mehr als eine befüllte Mahlzeit hat. Jeder Eintrag bekommt eine FRISCHE id/ts (statt die des
// Originaleintrags zu übernehmen), damit z. B. Löschen eines kopierten Eintrags nicht
// versehentlich mit dem Original am Vortag kollidiert.
function ftCopyPreviousDay(mealKeys){
  const keys = mealKeys || FT_MEAL_KEYS;
  const dateIso = ftCurrentDate;
  const prevIso = ftAddDays(dateIso, -1);
  const prevDay = ftDays[prevIso];
  if(!prevDay) return;
  const day = ftGetDay(dateIso);
  let count = 0;
  keys.forEach(meal => {
    (prevDay[meal]||[]).forEach(e => {
      day[meal].push({ ...e, id: 'e_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), ts: Date.now() });
      count++;
    });
  });
  if(!count) return;
  ftSaveDays(dateIso);
  renderFoodTracker();
  ftToastWithUndo(`${count} Einträge übernommen`, ()=>{
    const d = ftGetDay(dateIso);
    keys.forEach(meal => { d[meal] = []; });
    ftSaveDays(dateIso);
    if(ftCurrentDate === dateIso) renderFoodTracker();
  });
}

// Fragt vor dem Übernehmen kurz nach, welche Mahlzeit(en) vom Vortag übernommen werden sollen
// (Button-Auswahl statt z.B. Checkboxen, da es nur um EINE schnelle Entscheidung geht) — nur
// die Mahlzeiten des Vortags, die tatsächlich Einträge haben, stehen dabei zur Wahl, plus
// "Alles" ganz oben, wenn mehr als eine davon befüllt ist. Ist nur GENAU eine Mahlzeit befüllt,
// entspricht "Alles" ohnehin exakt dieser einen — die Nachfrage wird dann übersprungen und
// direkt kopiert, damit ein trivialer Ein-Optionen-Dialog nicht unnötig im Weg steht.
function ftOpenCopyPrevDayPrompt(){
  const prevIso = ftAddDays(ftCurrentDate, -1);
  const prevDay = ftDays[prevIso];
  if(!prevDay) return;
  const filledMeals = FT_MEAL_KEYS.filter(k => (prevDay[k]||[]).length);
  if(filledMeals.length <= 1){ ftCopyPreviousDay(filledMeals.length ? filledMeals : undefined); return; }
  const mealBtnsHTML = filledMeals.map(k =>
    `<button class="ft-btn-ghost ft-copy-prev-choice" data-meal="${k}" type="button">${FT_MEAL_LABELS[k]}</button>`
  ).join('');
  ftOpenOverlay(`
    <div class="modal" id="ftCopyPrevModal">
      <div class="modal-head"><div class="modal-title">Was übernehmen?</div><button class="sheet-close" id="ftCopyPrevClose">${ftIconX()}</button></div>
      <div class="modal-body">
        <button class="ft-btn-primary ft-copy-prev-choice" data-meal="all" type="button" style="margin-bottom:10px;">Alles</button>
        ${mealBtnsHTML}
      </div>
    </div>
  `, {type:'modal'});
  document.getElementById('ftCopyPrevClose').onclick = ftCloseOverlay;
  document.querySelectorAll('.ft-copy-prev-choice').forEach(btn => {
    btn.onclick = () => {
      const meal = btn.dataset.meal;
      ftCloseOverlay();
      ftCopyPreviousDay(meal === 'all' ? filledMeals : [meal]);
    };
  });
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
  const hasEntries = ftDays[iso] && FT_MEAL_KEYS.some(k => (ftDays[iso][k]||[]).length);
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
  ftApplyTheme();
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

/* ============ Einstellungen: Export / Import ============
   Reine Essenstracker-Datensicherung (eigenes JSON, unabhängig vom
   allgemeinen Trainingsplan-Backup in 10-plan-settings.js — siehe
   Hinweis am Dateikopf). Die frühere Design-Sektion (Farbmodus/Akzent-/
   Hintergrundfarbe) ist entfallen, das läuft jetzt über die normalen
   Trainingsplan-Einstellungen. */
// Offene Akkordeon-Abschnitte im Essenstracker-Einstellungs-Sheet (eigenständig von der
// gleichnamigen settingsSectionOpen der allgemeinen Trainingsplan-Einstellungen, siehe
// 07-home.js/10-plan-settings.js — beide Screens sind komplett unabhängig voneinander).
// "ziele" startet aufgeklappt, damit sich am bisherigen Verhalten (Tagesziele sofort
// sichtbar) nichts ändert.
// Alle Akkordeon-Abschnitte starten standardmäßig EINGEKLAPPT (auch "Tagesziele", das früher
// eine Ausnahme war) — konsistentes Verhalten für alle vier bestehenden Abschnitte und jeden
// künftig hinzugefügten.
let ftSettingsSectionOpen = new Set();
// Auf-/zugeklappt-Zustand der beiden Farbwähler-Grids im Design-Akkordeon (Akzentfarbe/
// Hintergrund) — eigenständig von den gleichnamigen accentPickerOpen/bgPickerOpen der
// allgemeinen Einstellungen (10-plan-settings.js).
let ftAccentPickerOpen = false;
let ftBgPickerOpen = false;
// Baut Kopf+Körper eines aufklappbaren Einstellungs-Abschnitts — exakt dasselbe visuelle
// Muster wie settingsAccordionSection() in den allgemeinen Trainingsplan-Einstellungen
// (10-plan-settings.js): .muscle-group/.muscle-group-header/.muscle-group-body, ▾/▸-Pfeil,
// optionales Badge rechts neben dem Titel. Eigene Kopie statt Aufruf der dortigen Funktion,
// da beide Screens unabhängige Zustände (ftSettingsSectionOpen vs. settingsSectionOpen) und
// unterschiedliche data-Attribute zum Verkabeln brauchen.
function ftSettingsAccordionSection(key, title, bodyHTML, badge){
  const isOpen = ftSettingsSectionOpen.has(key);
  return `
    <div class="muscle-group" style="margin-top:10px;">
      <button class="muscle-group-header" data-ft-settingsgroup="${key}" type="button">
        <span class="mg-name">${title}</span>
        <span class="mg-meta">${badge ? `<span>${badge}</span>` : ''}<span class="mg-arrow">${isOpen ? '▾' : '▸'}</span></span>
      </button>
      <div class="muscle-group-body" style="display:${isOpen ? 'block' : 'none'}">
        ${bodyHTML}
      </div>
    </div>
  `;
}
function ftSavedMealsManageListHTML(){
  if(!ftSavedMeals.length) return `<div class="no-results" style="padding:14px 4px;">Keine gespeicherten Mahlzeiten.</div>`;
  return ftSavedMeals.map(m=>`
    <div class="result-row">
      <div class="result-main"><div class="result-name">${ftEscapeHTML(m.name)}</div><div class="result-sub">${m.items.length} Zutat${m.items.length===1?'':'en'}</div></div>
      <button class="result-star" data-edit-meal="${m.id}" title="Bearbeiten">${ftIconPencil()}</button>
      <button class="result-star" data-del-meal="${m.id}" title="Löschen">${ftIconTrash()}</button>
    </div>
  `).join('');
}
// Baut nur den INHALT des Settings-Sheets (die vier Akkordeon-Abschnitte) — beim Auf-/
// Zuklappen eines Abschnitts wird NUR dieser Container neu gerendert (siehe ftWireSettingsBody()
// unten), nicht das gesamte Overlay über ftOpenOverlay() neu aufgebaut. Ein kompletter
// Overlay-Neuaufbau würde die Sheet-Öffnen-Animation (siehe ftOpenOverlay()) bei jedem Klick
// auf einen Akkordeon-Kopf erneut abspielen — sichtbares Aufblitzen/Nachfedern des ganzen
// Sheets nur wegen eines aufgeklappten Abschnitts.
function ftSettingsBodyHTML(){
  const dayCount = Object.keys(ftDays).length;
  const goalsSetCount = ['kcal','p','c','f'].filter(k => ftGoals[k]).length;
  return `
    ${ftSettingsAccordionSection('ziele', 'Tagesziele', `
      <div style="padding:14px 16px;">
        <div class="field-label" style="margin-top:0;">kcal pro Tag</div>
        <input class="text-input" id="ftGoalKcal" type="number" inputmode="decimal" placeholder="z. B. 2200" value="${ftGoals.kcal ?? ''}">
        <div class="field-label">Protein (g)</div>
        <input class="text-input" id="ftGoalP" type="number" inputmode="decimal" placeholder="z. B. 150" value="${ftGoals.p ?? ''}">
        <div class="field-label">Kohlenhydrate (g)</div>
        <input class="text-input" id="ftGoalC" type="number" inputmode="decimal" placeholder="optional" value="${ftGoals.c ?? ''}">
        <div class="field-label">Fett (g)</div>
        <input class="text-input" id="ftGoalF" type="number" inputmode="decimal" placeholder="optional" value="${ftGoals.f ?? ''}">
        <button class="ft-btn-primary" id="ftGoalSaveBtn" style="margin-top:6px;">Ziele speichern</button>
      </div>
    `, goalsSetCount ? `${goalsSetCount} gesetzt` : '')}

    ${ftSettingsAccordionSection('design', 'Design', `
      <div style="padding:14px 16px;">
        <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:10px;">Farbmodus</label>
        <div class="wizard-choice-list" style="margin-bottom:18px;">
          <button class="wizard-choice ${!ftThemeOverride.themeMode ? 'selected' : ''}" data-ft-theme-mode="">Automatisch</button>
          <button class="wizard-choice ${ftThemeOverride.themeMode === 'dark' ? 'selected' : ''}" data-ft-theme-mode="dark">Dunkel</button>
          <button class="wizard-choice ${ftThemeOverride.themeMode === 'light' ? 'selected' : ''}" data-ft-theme-mode="light">Hell</button>
        </div>
        <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:10px;">Akzentfarbe</label>
        <button class="muscle-group-header" id="ftAccentPickerToggle" type="button" style="margin-bottom:${ftAccentPickerOpen ? '12px' : '0'};">
          <span class="mg-name" style="display:flex; align-items:center; gap:10px; font-family:inherit; font-size:14px; letter-spacing:normal;">
            <span style="width:20px; height:20px; border-radius:7px; background:${ftCurrentAccentColor().hex}; display:inline-block; flex-shrink:0;"></span>
            ${ftThemeOverride.accentColorId ? ftCurrentAccentColor().name : 'Automatisch (App)'}
          </span>
          <span class="mg-meta"><span class="mg-arrow">${ftAccentPickerOpen ? '▾' : '▸'}</span></span>
        </button>
        <div class="accent-swatch-grid" style="display:${ftAccentPickerOpen ? 'grid' : 'none'};">
          <button class="accent-swatch ${!ftThemeOverride.accentColorId ? 'selected' : ''}" data-ft-accent-id="" style="background:var(--surface-2); border:1px dashed var(--border); display:flex; align-items:center; justify-content:center; font-size:10.5px; color:var(--muted); font-weight:700;" aria-label="Automatisch">App</button>
          ${allAccentSwatches().map(c => `
            <button class="accent-swatch ${ftThemeOverride.accentColorId === c.id ? 'selected' : ''}" data-ft-accent-id="${c.id}" data-ft-accent-hex="${c.hex}" data-favorite="${c.isFavorite ? '1' : ''}" style="background:${c.hex};" aria-label="${c.name}"></button>
          `).join('')}
        </div>
        <button class="accent-custom-btn" id="ftAccentCustomBtn" type="button" style="display:${ftAccentPickerOpen ? 'flex' : 'none'};">
          <img class="accent-custom-btn-icon" src="${ICON_COLORWHEEL}" alt="">
          Eigene Farbe wählen
        </button>
        <label style="display:block; font-size:12px; color:var(--muted); margin:18px 0 10px;">Themes</label>
        <button class="muscle-group-header" id="ftBgPickerToggle" type="button" style="margin-bottom:${ftBgPickerOpen ? '12px' : '0'};">
          <span class="mg-name" style="display:flex; align-items:center; gap:10px; font-family:inherit; font-size:14px; letter-spacing:normal;">
            <span style="width:20px; height:20px; border-radius:7px; background:${ftCurrentBgColor() ? ftCurrentBgColor().hex : 'var(--bg)'}; border:1px solid var(--border); display:inline-block; flex-shrink:0;"></span>
            ${ftThemeOverride.bgColorId === 'default' ? 'Kein eigener Hintergrund' : ftThemeOverride.bgColorId ? ftCurrentBgColor().name : 'Automatisch (App)'}
          </span>
          <span class="mg-meta"><span class="mg-arrow">${ftBgPickerOpen ? '▾' : '▸'}</span></span>
        </button>
        <div class="accent-swatch-grid" style="display:${ftBgPickerOpen ? 'grid' : 'none'};">
          <button class="accent-swatch ${!ftThemeOverride.bgColorId ? 'selected' : ''}" data-ft-bg-id="" style="background:var(--surface-2); border:1px dashed var(--border); display:flex; align-items:center; justify-content:center; font-size:10.5px; color:var(--muted); font-weight:700;" aria-label="Automatisch">App</button>
          <button class="accent-swatch ${ftThemeOverride.bgColorId === 'default' ? 'selected' : ''}" data-ft-bg-id="default" style="background:var(--surface-2); border:1px dashed var(--border); display:flex; align-items:center; justify-content:center; font-size:15px; color:var(--muted);" aria-label="Standard">✕</button>
          ${ftBgSwatchesForCurrentMode().map(c => `
            <button class="accent-swatch ${ftThemeOverride.bgColorId === c.id ? 'selected' : ''}" data-ft-bg-id="${c.id}" data-ft-bg-hex="${c.hex}" data-favorite="${c.isFavorite ? '1' : ''}" style="background:${c.hex}; ${c.isFavorite ? '' : 'border:1px solid var(--border);'}" aria-label="${c.name}"></button>
          `).join('')}
        </div>
        <button class="accent-custom-btn" id="ftBgCustomBtn" type="button" style="display:${ftBgPickerOpen ? 'flex' : 'none'};">
          <img class="accent-custom-btn-icon" src="${ICON_COLORWHEEL}" alt="">
          Eigene Farbe wählen
        </button>
        <label style="display:block; font-size:12px; color:var(--muted); margin:18px 0 8px;">Textfarbe auf Akzentfarbe</label>
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:11px; color:var(--muted); white-space:nowrap;">Dunkler Text</span>
          <input type="range" id="ftAccentContrastSlider" min="0" max="1" step="0.01" value="${ftCurrentAccentContrastThreshold()}" style="flex:1; accent-color: var(--accent);">
          <span style="font-size:11px; color:var(--muted); white-space:nowrap;">Weißer Text</span>
        </div>
        ${Object.keys(ftThemeOverride).length ? `<button class="ft-btn-ghost" id="ftDesignResetBtn" style="margin-top:14px;">Eigenes Design zurücksetzen</button>` : ''}
      </div>
    `, Object.keys(ftThemeOverride).length ? 'Eigenes' : '')}

    ${ftSettingsAccordionSection('gespeicherteMahlzeiten', 'Gespeicherte Mahlzeiten', `
      <div style="padding:14px 16px;">
        <div id="ftManageSavedMealsList">${ftSavedMealsManageListHTML()}</div>
      </div>
    `, ftSavedMeals.length ? `${ftSavedMeals.length}` : '')}

    ${ftSettingsAccordionSection('autoMahlzeiten', 'Automatisch täglich eintragen', `
      <div style="padding:14px 16px;">
        ${FT_MEAL_KEYS.map((meal, i) => `
          <div class="field-label" style="margin-top:${i===0 ? '0' : '16px'};">${FT_MEAL_LABELS[meal]}</div>
          <select class="text-input" data-ft-automeal="${meal}">
            <option value="">Kein Auto-Eintrag</option>
            ${ftSavedMeals.map(m => `<option value="${m.id}" ${ftAutoMeals[meal] === m.id ? 'selected' : ''}>${ftEscapeHTML(m.name)}</option>`).join('')}
          </select>
          <button class="ft-btn-ghost" style="margin-top:6px; font-size:0.82rem; padding:8px 0;" data-ft-automeal-build="${meal}">+ Direkt aus Lebensmitteln zusammenstellen</button>
        `).join('')}
      </div>
    `, Object.values(ftAutoMeals).filter(Boolean).length ? `${Object.values(ftAutoMeals).filter(Boolean).length}` : '')}

    ${ftSettingsAccordionSection('datenSichern', 'Daten sichern', `
      <div style="padding:14px 16px;">
        <div class="no-results" style="text-align:left; padding:0 0 14px">
          ${dayCount} Tage · ${ftCustomFoods.length} eigene Lebensmittel · ${ftSavedMeals.length} gespeicherte Mahlzeiten · ${ftFavorites.length} Favoriten
        </div>
        <button class="ft-btn-primary" id="ftExportBtn">Daten exportieren (JSON)</button>
        <button class="ft-btn-ghost" id="ftImportBtn">Daten importieren …</button>
        <input type="file" id="ftImportFileInput" accept="application/json" class="hidden">
      </div>
    `)}

    ${ftSettingsAccordionSection('snapshot', 'Tages-Snapshot', `
      <div style="padding:14px 16px;">
        <button class="ft-btn-ghost" id="ftSnapshotBtn">Tages-Snapshot als PDF · ${ftFmtDateGerman(ftCurrentDate)}</button>
      </div>
    `)}
  `;
}
function ftOpenSettingsSheet(){
  ftOpenOverlay(`
    <div class="sheet" id="ftSettingsSheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div class="sheet-title">Einstellungen</div>
        <button class="sheet-close" id="ftSettingsClose">${ftIconX()}</button>
      </div>
      <div class="sheet-body" id="ftSettingsBodyWrap">${ftSettingsBodyHTML()}</div>
    </div>
  `);
  document.getElementById('ftSettingsClose').onclick = ftCloseOverlay;
  ftWireSettingsBody();
}
function ftWireSettingsBody(){
  const wrap = document.getElementById('ftSettingsBodyWrap');
  if(!wrap) return;
  const refresh = () => { wrap.innerHTML = ftSettingsBodyHTML(); ftWireSettingsBody(); };
  wrap.querySelectorAll('[data-ft-settingsgroup]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.ftSettingsgroup;
      if (ftSettingsSectionOpen.has(key)) ftSettingsSectionOpen.delete(key); else ftSettingsSectionOpen.add(key);
      refresh();
    };
  });
  const snapshotBtn = document.getElementById('ftSnapshotBtn');
  if(snapshotBtn) snapshotBtn.onclick = ftExportDaySnapshotPdf;
  const goalSaveBtn = document.getElementById('ftGoalSaveBtn');
  if(goalSaveBtn) goalSaveBtn.onclick = async () => {
    const readGoal = id => {
      const raw = document.getElementById(id).value.trim();
      if (!raw) return null;
      const n = parseFloat(raw);
      return (!isNaN(n) && n > 0) ? n : null;
    };
    ftGoals = { kcal: readGoal('ftGoalKcal'), p: readGoal('ftGoalP'), c: readGoal('ftGoalC'), f: readGoal('ftGoalF') };
    await ftSave('goals', ftGoals);
    ftCloseOverlay();
    renderFoodTracker();
    ftToast('Ziele gespeichert');
  };
  const exportBtn = document.getElementById('ftExportBtn');
  if(exportBtn) exportBtn.onclick = ftExportData;
  const fileInput = document.getElementById('ftImportFileInput');
  const importBtn = document.getElementById('ftImportBtn');
  if(importBtn) importBtn.onclick = ()=>fileInput.click();
  if(fileInput) fileInput.onchange = ()=>{
    const file = fileInput.files[0];
    if(file) ftImportData(file);
  };
  wrap.querySelectorAll('[data-edit-meal]').forEach(btn => {
    btn.onclick = (ev) => { ev.stopPropagation(); ftOpenEditSavedMealSheet(btn.dataset.editMeal); };
  });
  wrap.querySelectorAll('[data-del-meal]').forEach(btn => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const meal = ftSavedMeals.find(m=>m.id===btn.dataset.delMeal);
      if(!meal) return;
      if(!confirm(`Mahlzeit „${meal.name}" wirklich löschen?`)) return;
      ftSavedMeals = ftSavedMeals.filter(m=>m.id!==btn.dataset.delMeal);
      ftSave('savedMeals', ftSavedMeals);
      // Siehe ftDeleteSavedMeal() (15c-food-add.js) — dieselbe Bereinigung nötig, falls die
      // gelöschte Mahlzeit gerade als Auto-Eintrag (Abschnitt "Automatisch täglich eintragen"
      // weiter unten) hinterlegt war.
      let autoMealsChanged = false;
      FT_MEAL_KEYS.forEach(m => { if (ftAutoMeals[m] === btn.dataset.delMeal) { ftAutoMeals[m] = null; autoMealsChanged = true; } });
      if (autoMealsChanged) ftSave('autoMeals', ftAutoMeals);
      // Ganzen Body neu aufbauen statt nur die Liste (refresh() statt manuellem innerHTML-Patch)
      // — sonst würde das Auto-Mahlzeiten-Dropdown die entfernte Option weiterhin anzeigen, bis
      // der Abschnitt das nächste Mal unabhängig neu gerendert wird.
      refresh();
      ftToast('Gelöscht');
    };
  });
  wrap.querySelectorAll('[data-ft-automeal]').forEach(sel => {
    sel.onchange = () => {
      const meal = sel.dataset.ftAutomeal;
      ftAutoMeals[meal] = sel.value || null;
      ftSave('autoMeals', ftAutoMeals);
      // Nicht erst auf den nächsten App-Start warten: sofort den Rest des Monats mit der neuen
      // Auswahl auffüllen (nur dort, wo die Mahlzeit noch leer ist, siehe
      // ftApplyAutoMealsForDay()) und die Tagesansicht dahinter neu zeichnen, damit z. B. der
      // heutige Tag den Auto-Eintrag sofort zeigt, sobald man das Einstellungen-Sheet schließt.
      ftApplyAutoMealsUpcoming();
      renderFoodTracker();
    };
  });
  wrap.querySelectorAll('[data-ft-automeal-build]').forEach(btn => {
    btn.onclick = () => {
      ftCloseOverlay();
      goFtAutoMealBuilder(btn.dataset.ftAutomealBuild);
    };
  });
  ftWireDesignControls(wrap, refresh);
}

/* ============ Design-Akkordeon: Verkabelung ============
   Farbmodus-Buttons, Akkordeon-Umschalter für die beiden Farbwähler-Grids, Swatch-Auswahl
   (inkl. Long-Press zum Entfernen eines Favoriten — gleiches Muster wie
   wireAccentSwatchInteractions()/wireBgSwatchInteractions() in 10-plan-settings.js, hier aber
   auf ftThemeOverride statt plan geschrieben und auf den Essenstracker-eigenen Sheet-Body
   ("wrap") statt auf #app verkabelt, da beide DOM-Bäume komplett getrennt sind), Custom-
   Farbwähler-Buttons (öffnen den bestehenden HSV-Farbwähler aus 10-plan-settings.js im
   ftMode='accent'/'bg', siehe openAccentColorPickerPrompt()), Kontrast-Regler,
   Zurücksetzen-Button. */
function ftWireDesignControls(wrap, refresh){
  wrap.querySelectorAll('[data-ft-theme-mode]').forEach(btn => {
    btn.onclick = async () => {
      const mode = btn.dataset.ftThemeMode;
      if (mode) ftThemeOverride.themeMode = mode; else delete ftThemeOverride.themeMode;
      await ftSave('themeOverride', ftThemeOverride);
      ftApplyTheme();
      refresh();
    };
  });
  const accentToggle = document.getElementById('ftAccentPickerToggle');
  if(accentToggle) accentToggle.onclick = (ev) => { ev.stopPropagation(); ftAccentPickerOpen = !ftAccentPickerOpen; refresh(); };
  const bgToggle = document.getElementById('ftBgPickerToggle');
  if(bgToggle) bgToggle.onclick = (ev) => { ev.stopPropagation(); ftBgPickerOpen = !ftBgPickerOpen; refresh(); };
  ftWireSwatchInteractions(wrap, '[data-ft-accent-id]', async (btn) => {
    const id = btn.dataset.ftAccentId;
    if (id){ ftThemeOverride.accentColorId = id; delete ftThemeOverride.accentCustomHex; }
    else { delete ftThemeOverride.accentColorId; delete ftThemeOverride.accentCustomHex; }
    await ftSave('themeOverride', ftThemeOverride);
    ftApplyTheme();
    ftAccentPickerOpen = true;
    refresh();
  }, async (hex) => {
    const favs = favoriteAccentColors();
    plan.favoriteAccentColors = favs.filter(h => h !== hex);
    if (ftThemeOverride.accentColorId === `fav-${hex.replace('#','')}`) delete ftThemeOverride.accentColorId;
    await saveJSON('plan', plan);
    await ftSave('themeOverride', ftThemeOverride);
    ftApplyTheme();
    ftAccentPickerOpen = true;
    refresh();
  });
  ftWireSwatchInteractions(wrap, '[data-ft-bg-id]', async (btn) => {
    const id = btn.dataset.ftBgId;
    if (id === 'default'){ ftThemeOverride.bgColorId = 'default'; delete ftThemeOverride.bgCustomHex; }
    else if (id){ ftThemeOverride.bgColorId = id; delete ftThemeOverride.bgCustomHex; }
    else { delete ftThemeOverride.bgColorId; delete ftThemeOverride.bgCustomHex; }
    await ftSave('themeOverride', ftThemeOverride);
    ftApplyTheme();
    ftBgPickerOpen = true;
    refresh();
  }, async (hex) => {
    const favs = favoriteAccentColors();
    plan.favoriteAccentColors = favs.filter(h => h !== hex);
    if (ftThemeOverride.bgColorId === `fav-${hex.replace('#','')}`) delete ftThemeOverride.bgColorId;
    await saveJSON('plan', plan);
    await ftSave('themeOverride', ftThemeOverride);
    ftApplyTheme();
    ftBgPickerOpen = true;
    refresh();
  });
  const accentCustomBtn = document.getElementById('ftAccentCustomBtn');
  if(accentCustomBtn) accentCustomBtn.onclick = (ev) => { ev.stopPropagation(); openAccentColorPickerPrompt(null, null, null, null, 'accent'); };
  const bgCustomBtn = document.getElementById('ftBgCustomBtn');
  if(bgCustomBtn) bgCustomBtn.onclick = (ev) => { ev.stopPropagation(); openAccentColorPickerPrompt(null, null, null, null, 'bg'); };
  const contrastSlider = document.getElementById('ftAccentContrastSlider');
  if(contrastSlider){
    contrastSlider.oninput = () => {
      ftThemeOverride.accentContrastThreshold = parseFloat(contrastSlider.value);
      ftApplyTheme(); // sofortige Vorschau, während gezogen wird
    };
    contrastSlider.onchange = async () => {
      ftThemeOverride.accentContrastThreshold = parseFloat(contrastSlider.value);
      await ftSave('themeOverride', ftThemeOverride);
    };
  }
  const resetBtn = document.getElementById('ftDesignResetBtn');
  if(resetBtn) resetBtn.onclick = async () => {
    ftThemeOverride = {};
    await ftSave('themeOverride', ftThemeOverride);
    ftApplyTheme();
    refresh();
  };
}
// Generischer Long-Press-zum-Favoriten-Entfernen-Helfer für ein Swatch-Grid, siehe
// ftWireDesignControls() oben — onPick(btn) für einen normalen Tap, onRemoveFavorite(hex) für
// den bestätigten Long-Press auf einen Favoriten-Swatch (data-favorite="1").
function ftWireSwatchInteractions(wrap, selector, onPick, onRemoveFavorite){
  const LONG_PRESS_MS = 450;
  const MOVE_CANCEL_PX = 10;
  wrap.querySelectorAll(`.accent-swatch${selector}`).forEach(btn => {
    let pressTimer = null;
    let startX = 0, startY = 0, longPressFired = false;
    const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null; };
    const isFavorite = btn.dataset.favorite === '1';

    btn.onclick = () => {
      if (longPressFired){ longPressFired = false; return; }
      onPick(btn);
    };

    if (!isFavorite) return;

    btn.addEventListener('contextmenu', (ev) => ev.preventDefault());
    btn.addEventListener('touchstart', (ev) => {
      longPressFired = false;
      const t = ev.touches[0];
      startX = t.clientX; startY = t.clientY;
      pressTimer = setTimeout(() => {
        longPressFired = true;
        if (navigator.vibrate) navigator.vibrate(15);
        if (!confirm('Diesen Favoriten entfernen?')) { longPressFired = false; return; }
        onRemoveFavorite(btn.dataset.ftAccentHex || btn.dataset.ftBgHex);
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

/* ============ Gespeicherte Mahlzeit bearbeiten ============
   Eigenständige Detailansicht (Modal) zum Bearbeiten einer Mahlzeit-VORLAGE (nicht eines
   bereits getrackten Tageseintrags — dafür siehe ftOpenMealGroupDetail() oben, das nur die
   Portion eines bereits eingetragenen Gruppen-Eintrags ändert). Name, Zutatenliste (Menge pro
   Zutat änderbar, Zutat entfernbar) und "+ Zutat hinzufügen" — jede Änderung wird sofort in
   ftSavedMeals gespeichert (kein Entwurf-/Abbrechen-Zustand, gleiche Sofort-Speichern-Philosophie
   wie beim Rest der App, z.B. Favoriten-Stern oder Zieleingabe). */
function ftOpenEditSavedMealSheet(mealId){
  const sm = ftSavedMeals.find(m=>m.id===mealId);
  if(!sm) return;
  ftOpenOverlay(`
    <div class="modal" id="ftEditSavedMealModal">
      <div class="modal-head"><div class="modal-title">Mahlzeit bearbeiten</div><button class="sheet-close" id="ftEsmClose">${ftIconX()}</button></div>
      <div class="modal-body">
        <div class="field-label" style="margin-top:0;">Name</div>
        <input class="text-input" id="ftEsmName" value="${ftEscapeHTML(sm.name)}">
        <div class="field-label">Zutaten</div>
        <div id="ftEsmItemsList"></div>
        <button class="ft-btn-ghost" id="ftEsmAddIngredientBtn" style="margin-top:10px;">+ Zutat hinzufügen</button>
      </div>
    </div>
  `, {type:'modal'});
  // "X" führt zurück zum Einstellungen-Sheet (dort geöffnet, "gespeicherte Mahlzeiten"
  // bleibt aufgeklappt, siehe ftSettingsSectionOpen) statt den kompletten Overlay-Stack zu
  // schließen — dasselbe einlagige-Overlay-Prinzip wie beim Picker-Close oben.
  document.getElementById('ftEsmClose').onclick = ftOpenSettingsSheet;
  const nameInput = document.getElementById('ftEsmName');
  nameInput.addEventListener('change', () => {
    const name = nameInput.value.trim();
    if(!name) { nameInput.value = sm.name; return; }
    sm.name = name;
    ftSave('savedMeals', ftSavedMeals);
  });
  ftRenderEsmItemsList(mealId);
  document.getElementById('ftEsmAddIngredientBtn').onclick = () => ftOpenAddIngredientToSavedMeal(mealId);
}
function ftEsmItemQtyText(item, food){
  if(item.unitMode === 'piece'){
    const label = food && food.piece ? food.piece.label.replace(/^1\s*/,'') : 'Stück';
    return `${ftFormatNum(item.pieceCount)} × ${label}`;
  }
  return `${item.amountG} g`;
}
function ftRenderEsmItemsList(mealId){
  const sm = ftSavedMeals.find(m=>m.id===mealId);
  const list = document.getElementById('ftEsmItemsList');
  if(!sm || !list) return;
  if(!sm.items.length){
    list.innerHTML = `<div class="no-results" style="padding:10px 4px;">Noch keine Zutaten.</div>`;
  } else {
    list.innerHTML = sm.items.map((item, idx) => {
      const food = ftGetFoodById(item.sourceFoodId);
      const name = food ? (food.brand ? `${food.name} (${food.brand})` : food.name) : 'Lebensmittel nicht mehr verfügbar';
      const qty = food ? ftEsmItemQtyText(item, food) : '—';
      return `
        <div class="food-row" data-esm-idx="${idx}">
          <div class="food-row-main">
            <div class="food-row-name">${ftEscapeHTML(name)}</div>
            <div class="food-row-sub">${qty}</div>
          </div>
          <div class="food-row-right">
            <button class="food-row-del" data-esm-del="${idx}">${ftIconX()}</button>
          </div>
        </div>
      `;
    }).join('');
  }
  list.querySelectorAll('[data-esm-del]').forEach(btn => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const idx = parseInt(btn.dataset.esmDel, 10);
      sm.items.splice(idx, 1);
      ftSave('savedMeals', ftSavedMeals);
      ftRenderEsmItemsList(mealId);
    };
  });
  list.querySelectorAll('[data-esm-idx]').forEach(row => {
    row.onclick = (ev) => {
      if(ev.target.closest('[data-esm-del]')) return;
      const idx = parseInt(row.dataset.esmIdx, 10);
      const item = sm.items[idx];
      const food = ftGetFoodById(item.sourceFoodId);
      if(!food){ ftToast('Lebensmittel nicht mehr verfügbar — nur Entfernen möglich'); return; }
      ftOpenQuantityModal(food, { amountG: item.amountG, unitMode: item.unitMode, pieceCount: item.pieceCount }, {
        onSave: (amountG, mode, pieceCount) => {
          item.amountG = Math.round(amountG);
          item.unitMode = mode;
          item.pieceCount = pieceCount;
          ftSave('savedMeals', ftSavedMeals);
        },
        onDelete: () => {
          sm.items.splice(idx, 1);
          ftSave('savedMeals', ftSavedMeals);
        },
      });
      // ftOpenOverlay() ist einlagig (ersetzt den kompletten Overlay-Inhalt statt zu stapeln,
      // siehe ftOpenOverlay()/15a-food-core.js) — das Mengen-Modal hat die Zutaten-Ansicht beim
      // Öffnen also komplett aus dem DOM entfernt, nicht nur überlagert. Nach dem Schließen
      // (egal ob gespeichert/gelöscht/abgebrochen) daher die GANZE Zutaten-Ansicht neu öffnen
      // statt nur ihre Liste zu aktualisieren — ein einfacher Poll statt eines eigenen
      // Callback-Hooks im Overlay-System, da ftCloseOverlay() keinen "danach"-Zeitpunkt nach
      // außen meldet.
      const check = setInterval(() => {
        if(!document.getElementById('ftQtyModal')){ clearInterval(check); ftOpenEditSavedMealSheet(mealId); }
      }, 150);
    };
  });
}
// Sucht ein Lebensmittel (lokal + online, wie beim normalen Hinzufügen) und fügt es beim
// Antippen NICHT einem Tageseintrag hinzu, sondern als neue Zutat zur Mahlzeit-VORLAGE —
// deutlich schlankere Ergebniszeilen als ftResultRowHTML() (kein Favoriten-Stern/Löschen-
// Button nötig, das ist hier fehl am Platz), sonst dieselbe Such-Infrastruktur
// (ftSearchLocal()/ftOffSearch()) wie auf der normalen "Lebensmittel hinzufügen"-Seite.
function ftEsmPickerRowHTML(food){
  let context = '';
  if(food.brand) context = food.brand;
  else if(food.cat && FOOD_CATEGORIES[food.cat]) context = FOOD_CATEGORIES[food.cat];
  const sub = context ? `${context} · ${food.kcal} kcal/100g` : `${food.kcal} kcal/100g`;
  return `
    <div class="result-row" data-esm-pick-id="${food.id}">
      <div class="result-main"><div class="result-name">${ftEscapeHTML(food.name)}</div><div class="result-sub">${sub}</div></div>
    </div>
  `;
}
function ftOpenAddIngredientToSavedMeal(mealId){
  ftOpenOverlay(`
    <div class="modal" id="ftEsmPickerModal">
      <div class="modal-head"><div class="modal-title">Zutat hinzufügen</div><button class="sheet-close" id="ftEsmPickerClose">${ftIconX()}</button></div>
      <div class="modal-body">
        <div class="search-wrap">
          <input class="search-input" id="ftEsmPickerInput" placeholder="Lebensmittel suchen …" autocomplete="off">
        </div>
        <div id="ftEsmPickerResults"></div>
      </div>
    </div>
  `, {type:'modal'});
  // "X" führt zurück zur Zutatenliste statt das komplette Sheet zu schließen — das
  // einlagige Overlay-System (siehe Kommentar in ftRenderEsmItemsList()) hat die
  // Zutaten-Ansicht beim Öffnen des Pickers bereits ersetzt, ftCloseOverlay() allein würde
  // also den gesamten Bearbeiten-Dialog verlassen statt nur den Picker.
  document.getElementById('ftEsmPickerClose').onclick = () => ftOpenEditSavedMealSheet(mealId);
  const input = document.getElementById('ftEsmPickerInput');
  const resultsBox = document.getElementById('ftEsmPickerResults');
  function wirePicker(){
    resultsBox.querySelectorAll('[data-esm-pick-id]').forEach(row => {
      row.onclick = () => {
        const food = ftGetFoodById(row.dataset.esmPickId);
        if(!food) return;
        ftOpenQuantityModal(food, null, {
          onSave: (amountG, mode, pieceCount) => {
            const sm = ftSavedMeals.find(m=>m.id===mealId);
            if(!sm) return;
            ftPersistOffFoodIfNeeded(food);
            sm.items.push({ sourceFoodId: food.id, amountG: Math.round(amountG), unitMode: mode, pieceCount });
            ftSave('savedMeals', ftSavedMeals);
          },
        });
        const check = setInterval(() => {
          if(!document.getElementById('ftQtyModal')){
            clearInterval(check);
            ftOpenEditSavedMealSheet(mealId); // ersetzt den Picker direkt durch die aktualisierte Zutatenliste
          }
        }, 150);
      };
    });
  }
  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value;
    if(!q.trim()){ resultsBox.innerHTML = ''; return; }
    const { custom, base } = ftSearchLocal(q);
    let html = '';
    if(custom.length) html += `<div class="ft-section-label">Eigene Lebensmittel</div>` + custom.map(ftEsmPickerRowHTML).join('');
    if(base.length) html += `<div class="ft-section-label">Basisliste</div>` + base.map(ftEsmPickerRowHTML).join('');
    resultsBox.innerHTML = html + `<div class="ft-section-label">Online-Datenbank</div><div class="loading-row">Tippe weiter oder warte kurz …</div>`;
    wirePicker();
    debounceTimer = setTimeout(async () => {
      const { results: offResults, reason } = await ftOffSearch(q);
      if(input.value !== q) return; // veraltete Antwort
      const loadingRow = resultsBox.querySelector('.loading-row');
      if(!loadingRow) return;
      if(offResults.length){
        loadingRow.outerHTML = offResults.map(ftEsmPickerRowHTML).join('');
      } else if(reason === 'offline'){
        loadingRow.outerHTML = `<div class="no-results">Offline — nur lokale Treffer verfügbar.</div>`;
      } else if(reason === 'unreachable'){
        loadingRow.outerHTML = `<div class="no-results">Online-Datenbank gerade nicht erreichbar.</div>`;
      } else {
        loadingRow.outerHTML = `<div class="no-results">Keine Online-Treffer.</div>`;
      }
      wirePicker();
    }, 350);
  });
}

function ftFmtDateGerman(iso){
  return ftParseISO(iso).toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit', year:'numeric'});
}

/* ============ Tages-Snapshot als PDF ============
   Fasst Mahlzeiten (aktuell angezeigter Tag, ftCurrentDate) UND an diesem Kalendertag
   protokollierte Trainingseinheiten (globales sessions-Array, siehe 05-calendar.js/
   openDayTrainingPopup() für dasselbe Filter-Muster: Vergleich über
   getFullYear()/getMonth()/getDate(), da session.date ein voller Zeitstempel ist) in einem
   einzigen PDF zusammen — gedacht zum manuellen Ablegen/Hochladen in andere Gesundheits-Apps
   (z. B. Google Health), die selbst keinen direkten Zugriff auf diese App haben. Nutzt bewusst
   dieselben jsPDF-Bauhelfer (pdfCardBox, pdfSafeText, ensureJsPdfLoaded, downloadBlob) wie die
   bestehenden Trainings-PDFs (12-session-summary.js), damit Optik und Robustheit (WinAnsi-
   Zeichensatz, Lazy-Load) konsistent bleiben.
   HINWEIS: Google Health Connect selbst nimmt keine PDFs als strukturierte Messwerte an — die
   Datei eignet sich zum Anhängen an einen Tagebucheintrag / manuellen Abgleich, nicht als
   automatischer Datenimport. */
function ftSessionsOnDay(iso){
  const target = ftParseISO(iso);
  return (typeof sessions !== 'undefined' ? sessions : []).filter(s => {
    const sd = new Date(s.date);
    return sd.getFullYear() === target.getFullYear() && sd.getMonth() === target.getMonth() && sd.getDate() === target.getDate();
  });
}
function ftEntryQtyText(e){
  return e.unitMode === 'piece' ? `${ftFormatNum(e.pieceCount)} × ${e.pieceLabel}` : `${e.amountG} g`;
}
async function ftExportDaySnapshotPdf(){
  const iso = ftCurrentDate;
  await ensureJsPdfLoaded();
  if (!window.jspdf || !window.jspdf.jsPDF){ ftToast('PDF-Erstellung nicht verfügbar'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marginX = 16;
  const pageWidth = 210 - marginX * 2;
  const pageBottom = 282;
  let y = 20;

  const ensureSpace = (need) => { if (y + need > pageBottom){ doc.addPage(); y = 20; } };

  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text(pdfSafeText('Tages-Snapshot'), marginX, y);
  y += 9;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(60);
  doc.text(pdfSafeText(`${ftDateLabel(iso)} · ${ftFmtDateGerman(iso)}`), marginX, y);
  y += 10;
  doc.setDrawColor(210);
  doc.line(marginX, y, 210 - marginX, y);
  y += 8;

  // ---- Essen ----
  const totals = ftComputeTotals(iso);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20);
  doc.text(pdfSafeText('Ernährung'), marginX, y);
  y += 6;
  const boxH = 16;
  ensureSpace(boxH + 4);
  pdfCardBox(doc, marginX, y, pageWidth, boxH);
  const summaryParts = [
    { label: 'kcal', value: totals.kcal },
    { label: 'Protein', value: totals.p + ' g' },
    { label: 'Kohlenhydrate', value: totals.c + ' g' },
    { label: 'Fett', value: totals.f + ' g' },
  ];
  const colW = pageWidth / summaryParts.length;
  summaryParts.forEach((p, i) => {
    const cx = marginX + colW * i + colW/2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(30);
    doc.text(pdfSafeText(String(p.value)), cx, y + 8, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(130);
    doc.text(pdfSafeText(p.label), cx, y + 12.5, { align: 'center' });
  });
  y += boxH + 8;

  const day = ftGetDay(iso);
  FT_MEAL_KEYS.forEach(mealKey => {
    const entries = day[mealKey];
    ensureSpace(10);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(20);
    const mealKcal = entries.length ? ` · ${ftMealTotal(iso, mealKey)} kcal` : '';
    doc.text(pdfSafeText(FT_MEAL_LABELS[mealKey] + mealKcal), marginX, y);
    y += 5.5;
    if (!entries.length){
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(150);
      doc.text(pdfSafeText('Nichts eingetragen'), marginX + 2, y);
      y += 6;
      return;
    }
    entries.forEach(e => {
      ensureSpace(6);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(50);
      // Gruppierte Mahlzeiten-Einträge (kind:'mealGroup') haben kein amountG/unitMode wie
      // normale Einträge (ftEntryQtyText() würde hier "undefined g" ausgeben) — stattdessen
      // die Portion in der Kopfzeile zeigen und darunter jede Zutat einzeln, skaliert mit der
      // getrackten Portion (analog zur Detailansicht in der App, siehe ftOpenMealGroupDetail()).
      const qtyText = e.kind === 'mealGroup' ? ftPortionLabel(e.portion) + ' Portion' : ftEntryQtyText(e);
      const nameLine = doc.splitTextToSize(pdfSafeText(`${e.name} — ${qtyText}`), pageWidth - 30);
      doc.text(nameLine, marginX + 2, y);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(30);
      doc.text(pdfSafeText(`${Math.round(e.kcal)} kcal`), 210 - marginX, y, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor(140);
      const macroLine = `P ${Math.round(e.p)} g · KH ${Math.round(e.c)} g · F ${Math.round(e.f)} g`;
      doc.text(pdfSafeText(macroLine), marginX + 2, y + (nameLine.length * 4.2));
      y += nameLine.length * 4.2 + 4.6;
      if(e.kind === 'mealGroup'){
        (e.items||[]).forEach(i => {
          ensureSpace(5);
          const itemQty = i.unitMode === 'piece' ? `${ftFormatNum(i.pieceCount*e.portion)} × ${i.pieceLabel}` : `${Math.round(i.amountG*e.portion)} g`;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.3); doc.setTextColor(120);
          const itemLine = doc.splitTextToSize(pdfSafeText(`· ${i.name} — ${itemQty} · ${Math.round(i.kcal*e.portion)} kcal`), pageWidth - 32);
          doc.text(itemLine, marginX + 5, y);
          y += itemLine.length * 4;
        });
        y += 1.5;
      }
    });
    y += 2;
  });

  // ---- Training ----
  y += 4;
  ensureSpace(14);
  doc.setDrawColor(210);
  doc.line(marginX, y, 210 - marginX, y);
  y += 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20);
  doc.text(pdfSafeText('Training'), marginX, y);
  y += 7;

  const daySessions = ftSessionsOnDay(iso);
  if (!daySessions.length){
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(150);
    doc.text(pdfSafeText('Kein Training an diesem Tag protokolliert.'), marginX, y);
    y += 6;
  } else {
    daySessions.forEach(session => {
      ensureSpace(12);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20);
      doc.text(pdfSafeText(modeDisplayLabel(session.mode)), marginX, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120);
      const sessionKcal = estimateSessionKcal(session);
      const durationLabel = `Dauer ${fmtDuration(session.durationSec)}` + (sessionKcal != null ? ` · ≈ ${sessionKcal} kcal` : '');
      doc.text(pdfSafeText(durationLabel), 210 - marginX, y, { align: 'right' });
      y += 5.5;
      session.entries.forEach(e => {
        const planEx = plan.exercises.find(x => x.id === e.exerciseId);
        const setsText = formatSetsLine(e, planEx) || '—';
        ensureSpace(6);
        const lines = doc.splitTextToSize(pdfSafeText(`${e.name}: ${setsText}`), pageWidth - 4);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70);
        doc.text(lines, marginX + 2, y);
        y += lines.length * 4.2 + 1.5;
      });
      y += 4;
    });
  }

  const blob = doc.output('blob');
  downloadBlob(blob, `essenstracker-snapshot-${iso}.pdf`);
  ftToast('PDF erstellt');
}

// Essenstracker-Nutzdaten als reines Objekt (ohne Hüllen-Metadaten wie version/exportedAt) —
// von ZWEI Stellen genutzt, damit beide exakt dasselbe Format schreiben/lesen:
// 1. ftExportData() unten (eigenständiger Essenstracker-Export in den Essenstracker-
//    Einstellungen, weiterhin separat möglich).
// 2. Der allgemeine "Exportieren"-Button in den Trainings-Einstellungen (renderSettings(),
//    10-plan-settings.js) sowie exportAllDataToFile() (04-utils.js) — betten das Ergebnis
//    hier als "food"-Feld in ihr gemeinsames Backup ein, damit EIN Export/Import beides
//    abdeckt, ohne dass an zwei Stellen leicht unterschiedliche Kopien der Feldliste gepflegt
//    werden müssen.
