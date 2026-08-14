/* ---------------------------------------------------
   WOCHEN-STREIFEN (Startseite, unter "Trainingsplan", über den Buttons)
   Zeigt die aktuelle Kalenderwoche (Mo–So). An Tagen, an denen trainiert wurde,
   steckt die Datumszahl in einem gefüllten, abgerundeten Kasten in der
   Rahmenfarbe der jeweiligen Trainings-Kachel (currentTileColor(mode)) bzw. in
   der Akzentfarbe, falls für diese Kachel keine eigene Rahmenfarbe gewählt
   wurde. Der heutige Tag bekommt zusätzlich einen grauen Rahmen um denselben
   Kasten (ungefüllt, falls nicht gleichzeitig Trainingstag).
--------------------------------------------------- */
// Anzahl Wochen, die im Wochenstreifen insgesamt zur Verfügung stehen (aktuelle Woche + N
// vorherige) — 8 Wochen (~2 Monate) sind genug zum bequemen Zurückstöbern, ohne dass der
// Streifen unnötig viel DOM/Render-Arbeit für Wochen weit in der Vergangenheit leistet.
const WEEK_STRIP_PAST_WEEKS = 7;
// Baut die 7 Tageszellen EINER Woche (identisches Markup wie zuvor) — ausgelagert, damit
// weekStripHTML() dieselbe Zell-Logik für mehrere Wochen wiederverwenden kann.
function weekStripDaysHTML(monday){
  const WEEKDAY_LABELS = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  const today = new Date();
  today.setHours(0,0,0,0);
  const days = [];
  for (let i = 0; i < 7; i++){
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const sessionsOnDay = sessions.filter(s => {
      const sd = new Date(s.date);
      return sd.getFullYear() === d.getFullYear() && sd.getMonth() === d.getMonth() && sd.getDate() === d.getDate();
    });
    let color = null;
    if (sessionsOnDay.length){
      const last = sessionsOnDay[sessionsOnDay.length - 1];
      const tileColor = currentTileColor(last.mode);
      color = tileColor ? tileColor.hex : cssVar('--accent');
    }
    const isToday = d.getTime() === today.getTime();
    days.push({ label: WEEKDAY_LABELS[i], num: d.getDate(), color, isToday });
  }
  return days.map(d => {
    const textColor = d.color ? contrastTextColor(d.color) : 'var(--text)';
    const badgeStyle = d.color
      ? `background:${d.color}; color:${textColor};`
      : `background:none; color:var(--text);`;
    const ringStyle = d.isToday ? `box-shadow:0 0 0 2px var(--border);` : '';
    return `
      <div class="week-strip-day${d.isToday ? ' week-strip-day-today' : ''}">
        <div class="week-strip-label">${d.label}</div>
        <div class="week-strip-num${d.color ? ' week-strip-num-filled' : ''}" style="${badgeStyle}${ringStyle}">${d.num}</div>
      </div>
    `;
  }).join('');
}
// Horizontal scrollbarer Streifen aus mehreren Wochen (aktuelle Woche ganz rechts, wie bisher
// als einzige sichtbar, ältere Wochen nach links raus scrollbar) — jede Woche bleibt ihr
// EIGENER <button> (wie vorher der einzelne .week-strip-Button), nur jetzt als Kind eines
// überflow-x:auto-Containers mit Scroll-Snap. Dadurch übernimmt der Browser die Tap-vs-Scroll-
// Unterscheidung ganz nativ (gleiches bewährtes Muster wie die Übungs-Bilderleiste im aktiven
// Training, .thumb-strip: einzelne Buttons in einer scrollbaren Leiste lösen bei einem echten
// Wisch keinen Klick aus, nur bei einem Tap ohne nennenswerte Bewegung) — es ist also KEINE
// zusätzliche JS-Logik zur Unterscheidung von Wisch/Tap nötig. wireWeekStrip() (siehe unten)
// setzt nach dem Rendern lediglich die initiale Scroll-Position auf die aktuelle (letzte) Woche.
function weekStripHTML(){
  const today = new Date();
  today.setHours(0,0,0,0);
  const mondayOffset = (today.getDay() + 6) % 7;
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - mondayOffset);

  const weeksHTML = [];
  for (let w = WEEK_STRIP_PAST_WEEKS; w >= 0; w--){
    const monday = new Date(currentMonday);
    monday.setDate(currentMonday.getDate() - w * 7);
    const isCurrent = w === 0;
    const arrowHTML = isCurrent ? '' : `<button class="week-strip-arrow-inline" type="button" aria-label="Zur aktuellen Woche"><img src="${ICON_CHEVRON_RIGHT}" alt=""></button>`;
    weeksHTML.push(`
      <div class="week-strip-slide">
        <button class="week-strip" type="button" aria-label="Monatsübersicht öffnen">${weekStripDaysHTML(monday)}</button>
        ${arrowHTML}
      </div>
    `);
  }

  return `
    <div class="week-strip-wrap">
      <div class="week-strip-scroll" id="weekStripScroll">${weeksHTML.join('')}</div>
    </div>
  `;
}
// Nach jedem renderHome(): Klick-Handler auf ALLE Wochen im Streifen (nicht nur die aktuelle)
// und Scroll-Position ohne Animation ganz an den rechten Rand (= aktuelle Woche) setzen, damit
// der Streifen wie zuvor mit sichtbarer aktueller Woche startet — erst ein bewusstes Wischen
// nach links blättert zu älteren Wochen zurück. Der Pfeil ist (siehe weekStripHTML()) fest Teil
// jeder vergangenen Woche, es gibt also nichts mehr, das per Scroll-Listener umgeschaltet werden
// müsste — Tap auf den Pfeil scrollt animiert zurück zur aktuellen Woche, Tap auf die Woche
// selbst öffnet wie gehabt die Monatsübersicht.
function wireWeekStrip(){
  const scroller = document.getElementById('weekStripScroll');
  if (!scroller) return;
  scroller.scrollLeft = scroller.scrollWidth;
  scroller.querySelectorAll('.week-strip').forEach(btn => {
    btn.onclick = () => goMonthOverview();
  });
  scroller.querySelectorAll('.week-strip-arrow-inline').forEach(btn => {
    btn.onclick = () => scroller.scrollTo({ left: scroller.scrollWidth, behavior: 'smooth' });
  });
}

/* ---------------------------------------------------
   MONATSÜBERSICHT (geöffnet per Klick auf den Wochenstreifen der Startseite)
   Zeigt fortlaufend Kalendermonate (zunächst Vormonat + aktueller Monat, beim
   Runterscrollen werden per IntersectionObserver weitere Folgemonate nachgeladen).
   Trainingstage werden wie im Wochenstreifen als gefüllte, abgerundete Kästen um
   die Datumszahl markiert (Kachel-Rahmenfarbe bzw. Akzentfarbe, heutiger Tag
   zusätzlich mit grauem Rahmen). "{Monat} Bericht"-Button unter jedem Monat öffnet
   den Monatsbericht (siehe renderMonthReport() weiter unten).
--------------------------------------------------- */
const MONTH_NAMES_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
let monthOverviewBase = null;   // { year, month } - Ankerpunkt (aktueller Monat)
let monthOverviewNextOffset = 0; // nächster noch nicht gerenderter Monats-Offset ab dem Anker
let monthOverviewObserver = null;

function goMonthOverviewMonthOffset(offset){
  const d = new Date(monthOverviewBase.year, monthOverviewBase.month + offset, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function monthOverviewDayMarker(year, month, day){
  const d = new Date(year, month, day);
  const sessionsOnDay = sessions.filter(s => {
    const sd = new Date(s.date);
    return sd.getFullYear() === d.getFullYear() && sd.getMonth() === d.getMonth() && sd.getDate() === d.getDate();
  });
  let color = null;
  if (sessionsOnDay.length){
    const last = sessionsOnDay[sessionsOnDay.length - 1];
    const tileColor = currentTileColor(last.mode);
    color = tileColor ? tileColor.hex : cssVar('--accent');
  }
  const today = new Date();
  today.setHours(0,0,0,0);
  const isToday = d.getTime() === today.getTime();
  // Essenstracker-Einträge an diesem Tag (falls schon geladen, siehe initFoodTracker()-Aufruf
  // vor renderMonthOverview()/openDayTrainingPopup() weiter unten) — eigenes "hasFood"-Flag
  // statt die Kachelfarbe zu überschreiben, da ein Trainingstag weiterhin klar per Kachelfarbe
  // erkennbar bleiben soll; ein zusätzlicher kleiner Punkt (siehe monthGridHTML()/CSS
  // .month-overview-day-num-hasfood) zeigt UNABHÄNGIG davon an, ob an diesem Tag auch Essen
  // protokolliert wurde — auch an trainingsfreien Tagen, damit reine Ernährungstage im Monat
  // ebenfalls sichtbar und antippbar sind (siehe openDayTrainingPopup()).
  const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const hasFood = typeof ftDays !== 'undefined' && !!ftDays[iso] && FT_MEAL_KEYS.some(k => (ftDays[iso][k]||[]).length);
  return { color, isToday, hasFood };
}

// Generischer Monats-Tagesraster-Baustein (Wochentag-Kopfzeile + führende Leerzellen + die
// eigentlichen Tageszahlen) — NICHT nur optisch, sondern als tatsächlich gemeinsam genutzte
// Funktion sowohl von monthOverviewBlockHTML() hier (Trainings-Monatsübersicht) als auch von
// ftMonthBlockHTML() (15-food-tracker.js, Essenstracker-Kalender) verwendet, damit beide exakt
// dieselbe Geometrie/Optik haben und nicht zwei leicht unterschiedliche Implementierungen
// auseinanderlaufen. markerFn(year,month,day) liefert {color, isToday, selected} für einen Tag
// (Trainingstage bzw. Tage mit Essens-Einträgen farbig gefüllt, "selected" umrandet den gerade
// ausgewählten Tag in Akzentfarbe). dayAttrFn(day) liefert die HTML-Attribute für den Button
// eines Tages (z. B. data-day-popup beim Training bzw. data-ft-day-select beim Essenstracker).
// allDaysClickable: beim Training bleiben nur Trainingstage antippbar (öffnen ein Popup mit den
// Trainingsdetails, siehe openDayTrainingPopup) — leere Tage haben dort keine Funktion. Beim
// Essenstracker dagegen soll JEDER Tag antippbar sein, um zu ihm zu springen, auch ohne
// bisherige Einträge, daher hier per Flag umschaltbar statt zwei fast identischer Funktionen.
function monthGridHTML(year, month, markerFn, dayAttrFn, allDaysClickable){
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Montag
  const dayLabels = ['Mo','Di','Mi','Do','Fr','Sa','So'].map(l => `<div class="month-overview-daylabel">${l}</div>`).join('');
  const blanks = Array.from({ length: firstWeekday }, () => `<div class="month-overview-day"></div>`).join('');
  const dayCells = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const marker = markerFn(year, month, day);
    const textColor = marker.color ? contrastTextColor(marker.color) : 'var(--text)';
    const badgeStyle = marker.color
      ? `background:${marker.color}; color:${textColor};`
      : `background:none; color:var(--text);`;
    const ringStyle = marker.selected
      ? `box-shadow:0 0 0 2px var(--accent);`
      : (marker.isToday ? `box-shadow:0 0 0 2px var(--border);` : '');
    // marker.hasFood (siehe monthOverviewDayMarker()) markiert unabhängig von der
    // Trainings-Kachelfarbe zusätzlich einen kleinen Punkt unter der Tageszahl, wenn an
    // diesem Tag auch im Essenstracker etwas protokolliert wurde — macht reine
    // Ernährungstage (ohne Training) im Trainingskalender sichtbar UND antippbar.
    const cls = 'month-overview-day-num'
      + (marker.color ? ' month-overview-day-num-filled' : '')
      + (marker.hasFood ? ' month-overview-day-num-hasfood' : '');
    if (marker.color || marker.hasFood || allDaysClickable){
      return `
        <div class="month-overview-day">
          <button class="${cls}" type="button" style="${badgeStyle}${ringStyle}" ${dayAttrFn(day)}>${day}</button>
        </div>
      `;
    }
    return `
      <div class="month-overview-day">
        <div class="${cls}" style="${badgeStyle}${ringStyle}">${day}</div>
      </div>
    `;
  }).join('');
  return `${dayLabels}${blanks}${dayCells}`;
}

function monthOverviewBlockHTML(year, month){
  const monthCount = sessions.filter(s => {
    const sd = new Date(s.date);
    return sd.getFullYear() === year && sd.getMonth() === month;
  }).length;

  let subtitle = `${monthCount} Workout${monthCount === 1 ? '' : 's'}`;
  if (monthCount > 0){
    // BUGFIX: "X pro Woche" wurde bisher über den GESAMTEN Monat gemittelt (Tage im Monat / 7),
    // auch über Wochen, die zum Zeitpunkt der Anzeige noch gar nicht stattgefunden haben. Im
    // laufenden Monat drückte das den Wert künstlich: 5 Einheiten, davon 4 in der ersten
    // (bereits abgeschlossenen) Woche, ergaben trotzdem nur "1 pro Woche", weil durch alle
    // 4–5 Wochen des kompletten Monats geteilt wurde. Jetzt wird nur über WOCHEN gemittelt, die
    // bereits begonnen haben (siehe monthAssignedWeeks/elapsedWeeks unten) — bei einem
    // vollständig vergangenen Monat sind das ohnehin alle zugeordneten Wochen, am Verhalten dort
    // ändert sich nichts.
    const now = new Date();
    const elapsedWeeks = monthAssignedWeeks(year, month).filter(w => w.start <= now);
    if (elapsedWeeks.length){
      const elapsedSum = elapsedWeeks.reduce((sum, w) => sum + sessionsInWeekCount(w), 0);
      const perWeek = Math.max(1, Math.round(elapsedSum / elapsedWeeks.length));
      subtitle += ` · ${perWeek} pro Woche`;
    }
  }

  // Warm-up-Sätze (set.warmup=true, siehe Trainingstools-Popup) und Deload-Einheiten
  // (session.deloadUsed, siehe endSession()) für diesen Monat zusammengezählt — nur
  // angezeigt, wenn im Monat tatsächlich mindestens eins von beidem vorkam.
  const monthSessions = sessions.filter(s => {
    const sd = new Date(s.date);
    return sd.getFullYear() === year && sd.getMonth() === month;
  });
  const monthWarmupCount = monthSessions.reduce((sum, s) => sum + (s.entries || []).reduce((esum, e) => esum + (e.sets || []).filter(st => st.warmup).length, 0), 0);
  const monthDeloadCount = monthSessions.filter(s => s.deloadUsed).length;
  const monthAvgRpe = rpeEnabled() ? avgRpeForSessions(monthSessions) : null;
  const trackingParts = [];
  if (monthWarmupCount > 0) trackingParts.push(`${monthWarmupCount} Warm-up${monthWarmupCount === 1 ? '' : 's'}`);
  if (monthDeloadCount > 0) trackingParts.push(`${monthDeloadCount} Deload${monthDeloadCount === 1 ? '' : 's'}`);
  if (monthAvgRpe != null) trackingParts.push(`Ø ${fmtRpe(monthAvgRpe)} Intensität`);
  const trackingSubtitle = trackingParts.length ? `<p class="month-overview-subtitle month-overview-tracking-subtitle">${trackingParts.join(' · ')}</p>` : '';

  const now = new Date();
  const titleYear = year !== now.getFullYear() ? ` ${year}` : '';

  const gridInner = monthGridHTML(
    year, month, monthOverviewDayMarker,
    day => `data-day-popup="${year}-${month}-${day}" aria-label="Übersicht für den ${day}.${month+1}. anzeigen"`,
    false
  );

  const reportIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"></rect><line x1="8" y1="8" x2="16" y2="8"></line><line x1="8" y1="12" x2="16" y2="12"></line><line x1="8" y1="16" x2="12" y2="16"></line></svg>`;

  return `
    <div class="month-overview-block">
      <h2 class="month-overview-title">${MONTH_NAMES_DE[month]}${titleYear}</h2>
      <p class="month-overview-subtitle">${subtitle}</p>
      ${trackingSubtitle}
      <div class="month-overview-grid">
        ${gridInner}
      </div>
      <button class="month-overview-report-btn" type="button" data-report-month="${year}-${month}">${reportIcon}${MONTH_NAMES_DE[month]} Bericht</button>
    </div>
  `;
}

function appendMonthOverviewMonth(offset){
  const list = document.getElementById('monthOverviewList');
  if (!list) return;
  const { year, month } = goMonthOverviewMonthOffset(offset);
  list.insertAdjacentHTML('beforeend', monthOverviewBlockHTML(year, month));
  const block = list.lastElementChild;
  if (block){
    block.querySelectorAll('[data-day-popup]').forEach(btn => {
      btn.onclick = () => {
        const [y, m, d] = btn.dataset.dayPopup.split('-').map(Number);
        openDayTrainingPopup(y, m, d);
      };
    });
    const reportBtn = block.querySelector('[data-report-month]');
    if (reportBtn){
      reportBtn.onclick = () => {
        const [y, m] = reportBtn.dataset.reportMonth.split('-').map(Number);
        goMonthReport(y, m);
      };
    }
  }
}

// Kompakte Zusammenfassung eines Trainingstags (Kachelname, Anzahl Übungen/Sätze/Wdh,
// Sätze- und Wdh-Zahl farblich hervorgehoben) — geöffnet per Klick auf einen markierten
// Tag in der Monatsübersicht. Bei mehreren Einheiten am selben Tag wird pro Einheit ein
// eigener Block untereinander angezeigt.
function sessionDayStats(session){
  const exercises = session.entries.length;
  const sets = session.entries.reduce((a, e) => a + e.sets.length, 0);
  const { starCount, improvedCount } = computeExerciseHighlights(session);
  return { exercises, sets, starCount, improvedCount };
}

// Essenstracker-Pendant zu sessionDayStats() — Tagesgesamtwerte (kcal/Protein/Kohlenhydrate/
// Fett) für EINEN Tag, Grundlage für den Ernährungs-Block im Tages-Popup unten. Baut auf
// ftDayTotalsForISO() (15-food-tracker.js) auf statt eigener Aufsummierung, damit Training und
// Essenstracker exakt dieselbe Berechnung verwenden. ftDays ist zu diesem Zeitpunkt bereits
// geladen — siehe initFoodTracker()-Aufruf vor renderMonthOverview() (case 'monthOverview',
// 06-navigation.js) bzw. vor goMonthOverview().
function foodDayPopupBlockHTML(totals){
  const stats = [
    { value: totals.kcal, label: 'kcal', color: null },
    { value: `${totals.p} g`, label: 'Protein', color: cssVar('--protein') },
    { value: `${totals.c} g`, label: 'Kohlenhydrate', color: cssVar('--carbs') },
    { value: `${totals.f} g`, label: 'Fett', color: cssVar('--fat') },
  ];
  const statsHTML = stats.map(s => `
    <div class="day-popup-stat">
      <div class="day-popup-stat-value"${s.color ? ` style="color:${s.color};"` : ''}>${s.value}</div>
      <div class="day-popup-stat-label">${s.label}</div>
    </div>
  `).join('');
  return `
    <div class="day-popup-block">
      <div class="day-popup-tile-name">Ernährung</div>
      <div class="day-popup-stats">
        ${statsHTML}
      </div>
    </div>
  `;
}

function openDayTrainingPopup(year, month, day){
  const sessionsOnDay = sessions.filter(s => {
    const sd = new Date(s.date);
    return sd.getFullYear() === year && sd.getMonth() === month && sd.getDate() === day;
  });
  const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const foodTotals = (typeof ftDayTotalsForISO === 'function') ? ftDayTotalsForISO(iso) : null;
  // Weder Training noch Essen an diesem Tag protokolliert (z. B. Klick auf einen Tag, der nur
  // wegen allDaysClickable/marker.hasFood theoretisch antippbar wäre) — nichts zu zeigen.
  if (!sessionsOnDay.length && !foodTotals) return;

  const existing = document.getElementById('dayTrainingPopupOverlay');
  if (existing) existing.remove();

  const trainingBlocksHTML = sessionsOnDay.map(session => {
    const { exercises, sets, starCount, improvedCount } = sessionDayStats(session);
    // Nur Kennzahlen >0 anzeigen (flex:1 auf .day-popup-stat verteilt die verbleibenden
    // dadurch automatisch gleichmäßig über die Zeilenbreite).
    const stats = [
      { value: exercises, label: 'Übungen', color: null },
      { value: sets, label: 'Sätze', color: null },
      { value: starCount, label: 'Rekorde', color: '#d9c74a' },
      { value: improvedCount, label: 'Verbessert', color: '#7cc576' },
    ].filter(s => s.value > 0);
    const statsHTML = stats.map(s => `
      <div class="day-popup-stat">
        <div class="day-popup-stat-value"${s.color ? ` style="color:${s.color};"` : ''}>${s.value}</div>
        <div class="day-popup-stat-label">${s.label}</div>
      </div>
    `).join('');
    return `
      <div class="day-popup-block">
        <div class="day-popup-tile-name">${modeDisplayLabel(session.mode)}</div>
        <div class="day-popup-stats">
          ${statsHTML}
        </div>
      </div>
    `;
  });
  // An Tagen mit BEIDEM (Training und Ernährung) stehen die Blöcke untereinander, exakt wie
  // bei mehreren Trainingseinheiten am selben Tag — derselbe .day-popup-divider trennt sie.
  const blocksHTML = [...trainingBlocksHTML, ...(foodTotals ? [foodDayPopupBlockHTML(foodTotals)] : [])]
    .join('<div class="day-popup-divider"></div>');

  const titleDate = sessionsOnDay.length
    ? fmtDate(sessionsOnDay[0].date)
    : new Date(year, month, day).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });

  // "Im Verlauf öffnen" bezieht sich auf die Trainingsdetails — ergibt an einem reinen
  // Ernährungstag (keine Sessions) keinen Sinn, daher dort weggelassen.
  const historyBtnHTML = sessionsOnDay.length
    ? `<button class="day-popup-history-btn" id="dayTrainingPopupHistory" type="button" aria-label="Im Verlauf öffnen"><img src="${ICON_HISTORY}" alt=""></button>`
    : '';

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'dayTrainingPopupOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal" style="max-height:none;">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">${titleDate}</div>
        <div class="add-exercise-modal-header-icons">
          ${historyBtnHTML}
          <button class="add-exercise-modal-close" id="dayTrainingPopupClose" aria-label="Schließen">✕</button>
        </div>
      </div>
      <div class="new-exercise-modal-body">
        ${blocksHTML}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(remove);

  function remove(){ const el = document.getElementById('dayTrainingPopupOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); };
  document.getElementById('dayTrainingPopupClose').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
  // Ersetzt den beim Öffnen des Popups gepushten History-Eintrag (pushOverlayState) DIREKT
  // durch die Zielseite (history.replaceState via replaceView), statt erst per
  // popOverlayStateIfOpen() zurückzugehen und danach normal zu pushen — ein history.back()
  // gefolgt von einem sofortigen pushState() im selben Tick wäre eine Race Condition (back()
  // wird asynchron verarbeitet). So landet man von der Trainingsdetailseite (bzw.
  // Verlauf-Übersicht bei mehreren Einheiten) per Android-Zurück direkt wieder im Kalender —
  // der Seite, die VOR dem Popup offen war — statt einen zusätzlichen Schritt für das
  // inzwischen geschlossene Popup zu brauchen.
  const historyBtn = document.getElementById('dayTrainingPopupHistory');
  if (historyBtn) historyBtn.onclick = () => {
    if (overlayCloseStack[overlayCloseStack.length - 1] === remove) overlayCloseStack.pop();
    remove();
    resetAllAccordions();
    if (sessionsOnDay.length === 1){
      replaceView('sessionDetail', { id: sessionsOnDay[0].id });
      renderSessionDetail(sessionsOnDay[0].id);
    } else {
      replaceView('workoutsOverview', {});
      renderWorkoutsOverview();
    }
  };
}

// Baut ein eingeklapptes Akkordeon für ein VOLLSTÄNDIG abgeschlossenes Kalenderjahr (alle
// 12 Monate) — erscheint oben in der Monatsübersicht, aber erst sobald das jeweilige Jahr
// tatsächlich vorbei ist (year < aktuelles Jahr), und nur wenn in diesem Jahr überhaupt
// trainiert wurde. Klappt rein clientseitig auf/zu (kein Re-Render), damit der bereits per
// Infinite-Scroll geladene Monatsverlauf darunter erhalten bleibt.
function yearAccordionHTML(year){
  const monthsHTML = Array.from({ length: 12 }, (_, m) => monthOverviewBlockHTML(year, m)).join('');
  return `
    <div class="muscle-group month-overview-year-accordion">
      <button class="muscle-group-header" data-year-accordion="${year}" type="button" aria-expanded="false">
        <span class="mg-name">${year}</span>
        <span class="mg-meta"><span class="mg-arrow">▸</span></span>
      </button>
      <div class="muscle-group-body" style="display:none; padding:0;">
        ${monthsHTML}
      </div>
    </div>
  `;
}

function renderMonthOverview(){
  const now = new Date();
  monthOverviewBase = { year: now.getFullYear(), month: now.getMonth() };
  monthOverviewNextOffset = 1;

  if (monthOverviewObserver){ monthOverviewObserver.disconnect(); monthOverviewObserver = null; }

  // Vollständig abgeschlossene Jahre (mit mindestens einer Einheit) als eingeklappte
  // Akkordeons oben, älteste zuerst — nur Jahre VOR dem laufenden Jahr.
  const pastYearsWithSessions = [...new Set(
    sessions
      .map(s => new Date(s.date).getFullYear())
      .filter(y => y < now.getFullYear())
  )].sort((a, b) => a - b);
  const yearAccordionsHTML = pastYearsWithSessions.map(yearAccordionHTML).join('');

  app.innerHTML = `
    <div class="back-row month-overview-back-sticky" style="margin-top:0;">
      <button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>
    ${yearAccordionsHTML}
    <div id="monthOverviewList"></div>
    <div class="month-overview-sentinel" id="monthOverviewSentinel"></div>
  `;
  document.getElementById('btnBack').onclick = () => history.back();

  app.querySelectorAll('[data-year-accordion]').forEach(btn => {
    btn.onclick = () => {
      const body = btn.parentElement.querySelector('.muscle-group-body');
      const arrow = btn.querySelector('.mg-arrow');
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      arrow.textContent = isOpen ? '▸' : '▾';
      btn.setAttribute('aria-expanded', String(!isOpen));
    };
  });
  app.querySelectorAll('.month-overview-year-accordion [data-day-popup]').forEach(btn => {
    btn.onclick = () => {
      const [y, m, d] = btn.dataset.dayPopup.split('-').map(Number);
      openDayTrainingPopup(y, m, d);
    };
  });
  app.querySelectorAll('.month-overview-year-accordion [data-report-month]').forEach(btn => {
    btn.onclick = () => {
      const [y, m] = btn.dataset.reportMonth.split('-').map(Number);
      goMonthReport(y, m);
    };
  });

  // Start: aktueller Monat (keine Vormonate mehr — siehe Nutzerwunsch); künftige Monate
  // kommen per Infinite-Scroll hinzu. Man landet beim Öffnen also immer automatisch beim
  // gerade laufenden Monat, egal ob/wie viele abgeschlossene Jahre oben eingeklappt liegen.
  appendMonthOverviewMonth(0);

  const sentinel = document.getElementById('monthOverviewSentinel');
  monthOverviewObserver = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)){
      appendMonthOverviewMonth(monthOverviewNextOffset);
      monthOverviewNextOffset++;
    }
  }, { rootMargin: '600px 0px' });
  monthOverviewObserver.observe(sentinel);

  window.scrollTo(0, 0);
}

/* ---------------------------------------------------
   MONATSBERICHT (geöffnet über den "{Monat} Bericht"-Button in der Monatsübersicht)
   Ganz minimalistische Zusammenfassung: Anzahl Workouts (oben links) und Ø Dauer pro
   Training (oben rechts), darunter ein schlankes Balkendiagramm mit den 4 Wochen des
   Monats (jeweils Anzahl Trainingstage in dieser Woche), darunter die 5 größten
   Steigerungen des Monats (höchster Prozentsatz ggü. der jeweils vorherigen Einheit
   derselben Übung, gemessen an Gewicht Max bzw. Haltezeit Max bei Zeit-Übungen).
--------------------------------------------------- */
// Montag 00:00 der Kalenderwoche, die "date" enthält.
function mondayWeekStart(date){
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (d.getDay() + 6) % 7; // 0 = Montag ... 6 = Sonntag
  d.setDate(d.getDate() - dow);
  return d;
}

// BUGFIX: Die Wochen eines Monats wurden bisher naiv nach Kalendertag in 4 feste Buckets
// (1–7 / 8–14 / 15–21 / 22–Monatsende) eingeteilt. Das ignoriert komplett, an welchem
// Wochentag der Monat beginnt: beginnt er z. B. an einem Samstag, liegen die ersten beiden
// Tage eigentlich noch in der letzten ECHTEN Kalenderwoche des Vormonats, wurden aber trotzdem
// als eigenes "W1" gezählt — während die tatsächlich erste volle Woche des Monats fälschlich
// mit den Vormonatstagen vermischt in "W1" auftauchte, statt für sich zu stehen.
//
// Jetzt werden echte Montag-Sonntag-Kalenderwochen verwendet und jede Woche wird MEHRHEITLICH
// zugeordnet: liegen 4 oder mehr ihrer 7 Tage in (year, month), zählt die komplette Woche für
// diesen Monat — auch die Tage, die eigentlich noch in den Nachbarmonat hineinreichen. Eine
// Woche wie "Fr. 31. – So. 6." zählt damit komplett als W1 des FOLGEMONATS (6 von 7 Tagen
// liegen dort), nicht mehr als Rest-Woche des laufenden Monats. Ergibt je nach Wochentag des
// Monatsbeginns 4 oder 5 zugeordnete Wochen statt starr 4.
function monthAssignedWeeks(year, month){
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const weeks = [];
  let weekStart = mondayWeekStart(firstDay);
  while (weekStart <= lastDay){
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    let daysInThisMonth = 0;
    for (let i = 0; i < 7; i++){
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      if (d.getFullYear() === year && d.getMonth() === month) daysInThisMonth++;
    }
    if (daysInThisMonth >= 4){
      weeks.push({ start: weekStart, end: weekEnd });
    }
    weekStart = new Date(weekStart);
    weekStart.setDate(weekStart.getDate() + 7);
  }
  return weeks;
}

// Anzahl Einheiten (Sessions), deren Datum in die Montag-Sonntag-Spanne der übergebenen Woche
// fällt — unabhängig davon, in welchem Kalendermonat der einzelne Tag liegt (siehe
// monthAssignedWeeks oben: eine Woche kann bewusst über den Monatswechsel hinausragen).
function sessionsInWeekCount(week){
  const weekEndOfDay = new Date(week.end.getFullYear(), week.end.getMonth(), week.end.getDate(), 23, 59, 59, 999);
  return sessions.filter(s => {
    const sd = new Date(s.date);
    return sd >= week.start && sd <= weekEndOfDay;
  }).length;
}

// Wochen-"Buckets" für einen Monat, jetzt anhand echter Kalenderwochen (siehe
// monthAssignedWeeks) statt starrer Tag-1–7/8–14/…-Einteilung. Gezählt wird pro Bucket die
// Anzahl EINHEITEN (Sessions), damit z. B. 3 Einheiten am selben Tag auch als 3 gezählt werden
// statt fälschlich als 1 Trainingstag. Wiederverwendet vom Monatsbericht
// (computeMonthReportData) UND vom "Einheiten pro Woche"-Widget im Fortschritt-Screen, wenn
// dort die Periode "Monat" gewählt ist.
function monthWeeklyTrainingPoints(year, month){
  return monthAssignedWeeks(year, month).map((w, i) => ({
    value: sessionsInWeekCount(w),
    label: `W${i + 1}`
  }));
}

function computeMonthReportData(year, month){
  const monthSessions = sessions.filter(s => {
    const sd = new Date(s.date);
    return sd.getFullYear() === year && sd.getMonth() === month;
  });

  const count = monthSessions.length;
  const avgDurationSec = count
    ? Math.round(monthSessions.reduce((a, s) => a + (s.durationSec || 0), 0) / count)
    : 0;

  const weeklyPoints = monthWeeklyTrainingPoints(year, month);

  // Größte Steigerungen: pro Übungs-Eintrag dieses Monats die primäre Kennzahl (Gewicht Max
  // bzw. bei Zeit-Übungen Haltezeit Max) gegen die jeweils vorherige Einheit derselben Übung
  // vergleichen (computeExerciseMetricComparison, gleiche Logik wie Zusammenfassung/Detail).
  const gains = [];
  monthSessions.forEach(session => {
    session.entries.forEach(e => {
      const result = computeExerciseMetricComparison(session, e.exerciseId);
      if (!result || !result.current.hasData) return;
      const key = e.type === 'time' ? 'secondsMax' : 'weightMax';
      const m = result.comparison[key];
      if (m && m.lastPct !== null && m.lastPct > 0){
        gains.push({ name: e.name, pct: m.lastPct, value: m.value, key, date: session.date });
      }
    });
  });
  gains.sort((a, b) => b.pct - a.pct);
  const topGains = gains.slice(0, 5);

  // Gesamtvolumen des Monats (Summe bewegtes Gewicht über alle Übungen, gleiche Logik wie
  // totalVolumeKg()/sessionVolumeKg()).
  const totalVolume = monthSessions.reduce((a, s) => a + sessionVolumeKg(s), 0);

  // Anzahl NEUER Allzeitrekorde in diesem Monat (nicht bloß Steigerungen ggü. dem letzten Mal —
  // computeExerciseHighlights().starCount zählt exakt das, siehe dortiger Kommentar).
  const recordCount = monthSessions.reduce((a, s) => a + computeExerciseHighlights(s).starCount, 0);

  // Muskelgruppen-Verteilung nach Sätzen, NUR für diesen Monat (statt des rollierenden
  // Zeitraums im Fortschritt-Tab) — absteigend sortiert für die Legende/den Balken.
  const muscleGroupCounts = computeMuscleGroupSetCountsForSessions(monthSessions);
  const muscleGroupTotal = Object.values(muscleGroupCounts).reduce((a, v) => a + v, 0);
  const muscleGroupTop = Object.entries(muscleGroupCounts).sort((a, b) => b[1] - a[1]);

  // Vergleich zum Vormonat (Einheiten- und Volumen-Delta) — hasPrevData unterscheidet "0 Einheiten
  // im Vormonat" von "Vormonat noch außerhalb der protokollierten Historie" (dann kein Delta
  // anzeigen, um keine irreführenden "+3"-Sprünge ab dem allerersten Monat zu zeigen).
  let prevYear = year, prevMonth = month - 1;
  if (prevMonth < 0){ prevMonth = 11; prevYear -= 1; }
  const prevMonthSessions = sessions.filter(s => {
    const sd = new Date(s.date);
    return sd.getFullYear() === prevYear && sd.getMonth() === prevMonth;
  });
  const earliestSessionDate = sessions.length ? new Date(sessions[0].date) : null;
  const hasPrevData = !!earliestSessionDate && (prevYear > earliestSessionDate.getFullYear() ||
    (prevYear === earliestSessionDate.getFullYear() && prevMonth >= earliestSessionDate.getMonth()));
  const countDelta = count - prevMonthSessions.length;
  const volumeDelta = Math.round(totalVolume - prevMonthSessions.reduce((a, s) => a + sessionVolumeKg(s), 0));

  // Längste zusammenhängende Trainings-Serie (aufeinanderfolgende Kalendertage) innerhalb
  // des Monats — anhand der distinct Trainingstage, nicht der Einheiten-Anzahl.
  const trainedDays = [...new Set(monthSessions.map(s => new Date(s.date).getDate()))].sort((a, b) => a - b);
  let longestStreak = 0, curStreak = 0, prevDay = null;
  trainedDays.forEach(d => {
    curStreak = (prevDay !== null && d === prevDay + 1) ? curStreak + 1 : 1;
    longestStreak = Math.max(longestStreak, curStreak);
    prevDay = d;
  });

  // Meistrainierte Übung des Monats (nach Satzanzahl).
  const exerciseSetCounts = {};
  monthSessions.forEach(s => s.entries.forEach(e => {
    exerciseSetCounts[e.name] = (exerciseSetCounts[e.name] || 0) + (e.sets ? e.sets.length : 0);
  }));
  const topExercise = Object.entries(exerciseSetCounts).sort((a, b) => b[1] - a[1])[0] || null;

  // Cardio-Gesamtzeit/-Distanz des Monats — Distanz nur dort aufsummiert, wo überhaupt eine
  // berechenbar ist (aktuell nur Laufband, siehe cardioDistanceKm()).
  let cardioSeconds = 0, cardioDistanceTotal = 0;
  monthSessions.forEach(s => s.entries.forEach(e => {
    const planEx = plan.exercises.find(x => x.id === e.exerciseId);
    if (!planEx || !planEx.cardioMachine) return;
    (e.sets || []).forEach(st => {
      if (st.seconds) cardioSeconds += st.seconds;
      const dist = cardioDistanceKm(planEx, st);
      if (dist) cardioDistanceTotal += dist;
    });
  }));

  return {
    count, avgDurationSec, weeklyPoints, topGains,
    totalVolume, recordCount,
    muscleGroupCounts, muscleGroupTotal, muscleGroupTop,
    countDelta, volumeDelta, hasPrevData,
    longestStreak, topExercise, topMuscleGroup: muscleGroupTop[0] || null,
    cardioSeconds, cardioDistanceTotal,
    avgRpe: rpeEnabled() ? avgRpeForSessions(monthSessions) : null
  };
}

function renderMonthReport(year, month){
  const {
    count, avgDurationSec, weeklyPoints, topGains,
    totalVolume, recordCount,
    muscleGroupTotal, muscleGroupTop,
    countDelta, volumeDelta, hasPrevData,
    longestStreak, topExercise, topMuscleGroup,
    cardioSeconds, cardioDistanceTotal, avgRpe
  } = computeMonthReportData(year, month);
  const now = new Date();
  const titleYear = year !== now.getFullYear() ? ` ${year}` : '';
  const accent = cssVar('--accent');

  // Essenstracker-Monatswerte für DENSELBEN Monat — nutzt ftComputeMonthStats() 1:1 aus
  // 15-food-tracker.js (dieselbe Berechnung wie auf der Essenstracker-Statistikseite), damit
  // hier keine zweite, evtl. abweichende Logik entsteht. Nur angezeigt, wenn im Monat auch
  // tatsächlich etwas protokolliert wurde — auf der Monatsübersicht selbst (jeder einzelne
  // Monatsblock, monthOverviewBlockHTML()) erscheint das NICHT mehr (war dort bei 12 Monaten
  // auf einmal zu viel/zu oft) — jetzt nur noch hier im Bericht, wenn man ihn gezielt öffnet.
  const foodStats = (typeof ftComputeMonthStats === 'function') ? ftComputeMonthStats(year, month) : null;
  const foodCardHTML = (foodStats && foodStats.count) ? `
    <div class="month-report-card">
      <div class="month-report-card-title">Ernährung Ø/Tag</div>
      <div class="macro-row" style="margin-top:4px; gap:16px; flex-wrap:wrap;">
        <div class="macro"><div><span class="macro-val">${foodStats.avgKcal}</span></div><div class="macro-label">kcal</div></div>
        <div class="macro"><div><span class="macro-dot" style="background:var(--protein)"></span><span class="macro-val">${foodStats.avgP} g</span></div><div class="macro-label">Protein</div></div>
        <div class="macro"><div><span class="macro-dot" style="background:var(--carbs)"></span><span class="macro-val">${foodStats.avgC} g</span></div><div class="macro-label">Kohlenhydrate</div></div>
        <div class="macro"><div><span class="macro-dot" style="background:var(--fat)"></span><span class="macro-val">${foodStats.avgF} g</span></div><div class="macro-label">Fett</div></div>
      </div>
    </div>
  ` : '';

  const deltaHTML = (delta, suffix) => {
    if (!hasPrevData || delta === 0) return '';
    const sign = delta > 0 ? '+' : '−';
    return `<span class="month-report-stat-delta ${delta > 0 ? 'up' : 'down'}">${sign}${Math.abs(delta).toLocaleString('de-DE')}${suffix || ''}</span>`;
  };

  const gainsHTML = topGains.length
    ? topGains.map(g => `
        <div class="month-report-gain-row">
          <div class="month-report-gain-name">${exerciseNameHTML(g.name)}</div>
          <div class="month-report-gain-right">
            <span class="month-report-gain-value">${fmtMetricValue(g.key, g.value)}</span>
            <span class="month-report-gain-pct">+${g.pct}%</span>
          </div>
        </div>
      `).join('')
    : `<div class="history-empty">Keine Steigerungen in diesem Monat</div>`;

  // Highlights-Karte: nur Zeilen mit tatsächlichem Inhalt anzeigen (z. B. kein Cardio-Eintrag,
  // wenn im Monat keine Kardio-Einheit absolviert wurde) — die Karte selbst entfällt komplett,
  // wenn nichts davon zutrifft (count === 0).
  const highlightRows = [];
  if (longestStreak > 1){
    highlightRows.push({ label: 'Längste Serie', value: `${longestStreak} Tage in Folge` });
  }
  if (topExercise){
    highlightRows.push({ label: 'Meistrainierte Übung', value: `${topExercise[0]} · ${topExercise[1]} Sätze` });
  }
  if (topMuscleGroup){
    const pct = muscleGroupTotal ? Math.round((topMuscleGroup[1] / muscleGroupTotal) * 100) : 0;
    highlightRows.push({ label: 'Meistrainierte Kategorie', value: `${topMuscleGroup[0]} · ${pct}%` });
  }
  if (cardioSeconds > 0){
    const distText = cardioDistanceTotal > 0 ? ` · ≈ ${cardioDistanceTotal.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km` : '';
    highlightRows.push({ label: 'Cardio', value: `${fmtDuration(cardioSeconds)}${distText}` });
  }
  if (avgRpe != null){
    const band = intensityBandForRpe(avgRpe);
    highlightRows.push({ label: 'Ø Trainingsintensität', value: `${fmtRpe(avgRpe)} RPE · ${band.label}`, valueColor: band.color });
  }
  const highlightsHTML = highlightRows.map(r => `
    <div class="month-report-highlight-row">
      <span class="month-report-highlight-label">${r.label}</span>
      <span class="month-report-highlight-value"${r.valueColor ? ` style="color:${r.valueColor};"` : ''}>${r.value}</span>
    </div>
  `).join('');

  // Muskelgruppen-Verteilung: gestapelter Balken + zweispaltige Legende, Top-Gruppen einzeln,
  // der Rest (falls vorhanden) als gemeinsames "Sonstige"-Segment in der bestehenden Sonstige-
  // Farbe, damit die Legende bei vielen Gruppen nicht ausufert. Das Limit deckt bewusst ALLE
  // festen Kategorien aus MUSCLE_GROUP_ORDER (app-data.js) ab — bei einem niedrigeren Wert
  // (früher 5) wurde z. B. "Bauch" als 6. echte Kategorie fälschlich unter "Sonstige"
  // einsortiert, obwohl die Übung ganz normal kategorisiert war. Nur eine ECHT unkategorisierte
  // Übung landet jetzt noch im "Sonstige"-Sammelsegment.
  const MAX_MUSCLE_SEGMENTS = MUSCLE_GROUP_ORDER.length;
  const topMuscleGroups = muscleGroupTop.slice(0, MAX_MUSCLE_SEGMENTS);
  const restMuscleCount = muscleGroupTop.slice(MAX_MUSCLE_SEGMENTS).reduce((a, [, v]) => a + v, 0);
  const muscleSegments = [...topMuscleGroups];
  if (restMuscleCount > 0) muscleSegments.push(['Sonstige', restMuscleCount]);
  const muscleBarHTML = muscleGroupTotal ? muscleSegments.map(([g, v]) => {
    const pct = (v / muscleGroupTotal) * 100;
    return `<div class="month-report-muscle-bar-seg" style="width:${pct}%; background:${muscleGroupColor(g)};"></div>`;
  }).join('') : '';
  const muscleLegendHTML = muscleSegments.map(([g, v]) => {
    const pct = muscleGroupTotal ? Math.round((v / muscleGroupTotal) * 100) : 0;
    return `
      <div class="month-report-muscle-legend-item">
        <span class="month-report-muscle-dot" style="background:${muscleGroupColor(g)};"></span>
        <span class="month-report-muscle-legend-name">${g}</span>
        <span class="month-report-muscle-legend-pct">${pct}%</span>
      </div>
    `;
  }).join('');

  app.innerHTML = `
    <div class="back-row" style="margin-top:0;">
      <button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>
    <h2 class="month-report-title">${MONTH_NAMES_DE[month]}${titleYear} Bericht</h2>

    <div class="month-report-card">
      <div class="month-report-stat-grid">
        <div class="month-report-stat-cell">
          <div class="month-report-stat-value">${count}${deltaHTML(countDelta)}</div>
          <div class="month-report-stat-label">Workout${count === 1 ? '' : 's'}</div>
        </div>
        <div class="month-report-stat-cell">
          <div class="month-report-stat-value">${count ? fmtDuration(avgDurationSec) : '—'}</div>
          <div class="month-report-stat-label">Ø Dauer</div>
        </div>
        <div class="month-report-stat-cell">
          <div class="month-report-stat-value">${totalVolume ? totalVolume.toLocaleString('de-DE') + ' kg' : '—'}${deltaHTML(volumeDelta, ' kg')}</div>
          <div class="month-report-stat-label">Gesamtvolumen</div>
        </div>
        <div class="month-report-stat-cell">
          <div class="month-report-stat-value"${recordCount ? ' style="color:#d9c74a;"' : ''}>${recordCount}</div>
          <div class="month-report-stat-label">Neue Rekorde</div>
        </div>
      </div>
    </div>

    <div class="month-report-card">
      <div class="month-report-card-title">Wochenverlauf</div>
      <div class="month-report-chart">${buildBarChart(weeklyPoints, accent, true, 64)}</div>
    </div>

    ${foodCardHTML}

    ${highlightRows.length ? `
      <div class="month-report-card">
        <div class="month-report-card-title">Übersicht</div>
        ${highlightsHTML}
      </div>
    ` : ''}

    ${muscleGroupTotal ? `
      <div class="month-report-card">
        <div class="month-report-card-title">Muskelgruppen</div>
        <div class="month-report-muscle-bar">${muscleBarHTML}</div>
        <div class="month-report-muscle-legend">${muscleLegendHTML}</div>
      </div>
    ` : ''}

    <div class="month-report-card">
      <div class="month-report-card-title">Größte Steigerungen</div>
      <div class="month-report-gains">${gainsHTML}</div>
    </div>
  `;

  document.getElementById('btnBack').onclick = () => history.back();
}

