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
  if (copyPrevBtn) copyPrevBtn.onclick = ftCopyPreviousDay;
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

// Übernimmt alle Einträge des Tages VOR dem gerade angezeigten in den aktuellen Tag (Button
// nur sichtbar, wenn der aktuelle Tag noch komplett leer ist, siehe renderFoodTracker()) —
// erspart das erneute manuelle Zusammensuchen bei ähnlichem Tagesablauf. Jeder Eintrag
// bekommt eine FRISCHE id/ts (statt die des Originaleintrags zu übernehmen), damit z. B.
// Löschen eines kopierten Eintrags nicht versehentlich mit dem Original am Vortag kollidiert.
function ftCopyPreviousDay(){
  const dateIso = ftCurrentDate;
  const prevIso = ftAddDays(dateIso, -1);
  const prevDay = ftDays[prevIso];
  if(!prevDay) return;
  const day = ftGetDay(dateIso);
  let count = 0;
  FT_MEAL_KEYS.forEach(meal => {
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
    FT_MEAL_KEYS.forEach(meal => { d[meal] = []; });
    ftSaveDays(dateIso);
    if(ftCurrentDate === dateIso) renderFoodTracker();
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
      </div>
    </div>
  `);
  document.getElementById('ftSettingsClose').onclick = ftCloseOverlay;
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

// Essenstracker-Nutzdaten als reines Objekt (ohne Hüllen-Metadaten wie version/exportedAt) —
// von ZWEI Stellen genutzt, damit beide exakt dasselbe Format schreiben/lesen:
// 1. ftExportData() unten (eigenständiger Essenstracker-Export in den Essenstracker-
//    Einstellungen, weiterhin separat möglich).
// 2. Der allgemeine "Exportieren"-Button in den Trainings-Einstellungen (renderSettings(),
//    10-plan-settings.js) sowie exportAllDataToFile() (04-utils.js) — betten das Ergebnis
//    hier als "food"-Feld in ihr gemeinsames Backup ein, damit EIN Export/Import beides
//    abdeckt, ohne dass an zwei Stellen leicht unterschiedliche Kopien der Feldliste gepflegt
//    werden müssen.
