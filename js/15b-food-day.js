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
    document.getElementById('addBtn_'+meal).onclick = ()=>goFtAddFood(meal);
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

function ftMealHTML(meal){
  const entries = ftGetDay(ftCurrentDate)[meal];
  return `
    <div class="meal-section">
      <div class="meal-head">
        <div class="meal-title">${FT_MEAL_LABELS[meal]} ${entries.length? `<span class="meal-kcal">· ${ftMealTotal(ftCurrentDate, meal)} kcal</span>`:''}</div>
        <button class="meal-add" id="addBtn_${meal}">+</button>
      </div>
      <div class="food-list">
        ${entries.length ? entries.slice().reverse().map(e=> e.kind==='mealGroup' ? ftMealGroupRowHTML(meal,e) : ftFoodRowHTML(meal, e)).join('') : `<div class="empty-meal">Noch nichts eingetragen</div>`}
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
        <div class="ft-section-label" style="margin-top:0;">Tagesziele</div>
        <div class="no-results" style="text-align:left; padding:0 4px 14px">
          Leer lassen, wenn kein Ziel gewünscht ist — die App zeigt dann wie gewohnt nur die
          reinen Tageswerte ohne Bezug zu einem Ziel.
        </div>
        <div class="field-label">kcal pro Tag</div>
        <input class="text-input" id="ftGoalKcal" type="number" inputmode="decimal" placeholder="z. B. 2200" value="${ftGoals.kcal ?? ''}">
        <div class="field-label">Protein (g)</div>
        <input class="text-input" id="ftGoalP" type="number" inputmode="decimal" placeholder="z. B. 150" value="${ftGoals.p ?? ''}">
        <div class="field-label">Kohlenhydrate (g)</div>
        <input class="text-input" id="ftGoalC" type="number" inputmode="decimal" placeholder="optional" value="${ftGoals.c ?? ''}">
        <div class="field-label">Fett (g)</div>
        <input class="text-input" id="ftGoalF" type="number" inputmode="decimal" placeholder="optional" value="${ftGoals.f ?? ''}">
        <button class="ft-btn-primary" id="ftGoalSaveBtn" style="margin-top:6px;">Ziele speichern</button>

        <div class="ft-section-label">Daten sichern</div>
        <div class="no-results" style="text-align:left; padding:0 4px 14px">
          ${dayCount} Tage · ${ftCustomFoods.length} eigene Lebensmittel · ${ftSavedMeals.length} gespeicherte Mahlzeiten · ${ftFavorites.length} Favoriten
        </div>
        <button class="ft-btn-primary" id="ftExportBtn">Daten exportieren (JSON)</button>
        <button class="ft-btn-ghost" id="ftImportBtn">Daten importieren …</button>
        <input type="file" id="ftImportFileInput" accept="application/json" class="hidden">

        <div class="ft-section-label">Tages-Snapshot</div>
        <div class="no-results" style="text-align:left; padding:0 4px 14px">
          PDF mit allen Mahlzeiten und Trainings von ${ftDateLabel(ftCurrentDate)} (${ftFmtDateGerman(ftCurrentDate)}) — zum Ablegen/Hochladen, z. B. in Google Health.
        </div>
        <button class="ft-btn-ghost" id="ftSnapshotBtn">Tages-Snapshot als PDF</button>
      </div>
    </div>
  `);
  document.getElementById('ftSettingsClose').onclick = ftCloseOverlay;
  document.getElementById('ftSnapshotBtn').onclick = ftExportDaySnapshotPdf;
  document.getElementById('ftGoalSaveBtn').onclick = async () => {
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
  document.getElementById('ftExportBtn').onclick = ftExportData;
  const fileInput = document.getElementById('ftImportFileInput');
  document.getElementById('ftImportBtn').onclick = ()=>fileInput.click();
  fileInput.onchange = ()=>{
    const file = fileInput.files[0];
    if(file) ftImportData(file);
  };
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
      doc.text(pdfSafeText(`Dauer ${fmtDuration(session.durationSec)}`), 210 - marginX, y, { align: 'right' });
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
