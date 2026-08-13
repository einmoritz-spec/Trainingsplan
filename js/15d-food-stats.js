/* ---------------------------------------------------
   15d-food-stats.js
   ---------------------------------------------------
   Essenstracker: Statistik-Seite (renderFoodStats, über Tippen auf die
   kcal-Zahl in der Tagesansicht erreichbar) — Balkendiagramm, interaktiver
   Makro-Donut mit Lebensmittel-Aufschlüsselung, Ziel-Erreichung, Ø kcal
   nach Wochentag, Tracking-Serien, Monatsübersicht.

   Teil des Splits von 15-food-tracker.js — siehe Kopfkommentar in
   15a-food-core.js für die Gesamtübersicht und Beweggründe.

   ftDayTotalsForISO()/ftAllDayTotals()/ftComputeMonthStats() liegen NICHT
   mehr hier, sondern in 15a-food-core.js (dort auch von 05-calendar.js für
   den Trainingskalender benötigt) — diese Datei ruft sie ganz normal auf.

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
// Ob die "+N weitere"-Sammelzeile in der Makro-Aufschlüsselung (ftWireMacroDonut()) gerade
// zur vollen Liste aufgeklappt ist — bei jedem neu angetippten Makro-Segment (toggle()) wieder
// zurückgesetzt, damit man nicht versehentlich mit einer bereits aufgeklappten Liste in ein
// anderes Makro wechselt.
let ftBreakdownExpanded = false;

// ftDayTotalsForISO()/ftAllDayTotals() sind nach 15a-food-core.js gewandert (dort auch von
// 05-calendar.js für den Trainingskalender genutzt) — hier nur noch die reine Zeitraum-
// Filterung darüber.
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
// Grundlage für die Aufschlüsselung, wenn ein Donut-Segment angetippt wird. Gruppierte
// Mahlzeiten-Einträge (kind:'mealGroup', siehe ftAddMealGroupEntry() in 15c-food-add.js)
// tragen NICHT als ein Klumpen unter ihrem Mahlzeit-Namen bei, sondern werden in ihre
// einzelnen Zutaten aufgelöst (mit der zum Trackzeitpunkt gewählten Portion multipliziert) —
// sonst würde z.B. "Porridge Standard" als ein einziger riesiger Posten erscheinen, obwohl
// die Aufschlüsselung ja gerade zeigen soll, WELCHE Lebensmittel wie viel beitragen.
function ftFoodMacroBreakdown(macroKey, periodDays){
  const cutoffIso = ftAddDays(ftTodayISO(), -(periodDays - 1));
  const map = {};
  const add = (name, val) => { if(val) map[name] = (map[name] || 0) + val; };
  Object.keys(ftDays).forEach(iso => {
    if (iso < cutoffIso) return;
    FT_MEAL_KEYS.forEach(k => (ftDays[iso][k]||[]).forEach(e => {
      if(e.kind === 'mealGroup'){
        (e.items||[]).forEach(i => add(i.name, (i[macroKey] || 0) * (e.portion ?? 1)));
        return;
      }
      add(e.name, e[macroKey] || 0);
    }));
  });
  return Object.entries(map).map(([name,val]) => ({ name, val }))
    .sort((a,b) => b.val - a.val);
}

// ftComputeMonthStats() ist nach 15a-food-core.js gewandert (dort auch von 05-calendar.js für
// den Trainingskalender-Monatsbericht genutzt) — renderFoodStats() unten ruft sie weiterhin
// ganz normal auf (gemeinsamer globaler Scope).

// Ø-Wert vs. Ziel je Nährwert im gewählten Zeitraum (siehe ftGoals, Einstellungen im
// Essenstracker) — nur, wenn mindestens ein Ziel gesetzt ist UND im Zeitraum überhaupt
// protokolliert wurde. Zeigt bewusst nur die tatsächlich gesetzten Ziele (nicht alle vier
// pauschal), da z. B. oft nur ein kcal-Ziel ohne feste Makro-Ziele gepflegt wird.
function ftGoalComparisonHTML(periodDays){
  if (!ftGoals.kcal && !ftGoals.p && !ftGoals.c && !ftGoals.f) return '';
  const days = ftDayTotalsInPeriod(periodDays);
  if (!days.length) return '';
  const avg = key => Math.round(days.reduce((a,d) => a+d[key], 0) / days.length);
  const rows = [];
  if (ftGoals.kcal) rows.push({ label:'kcal', val: avg('kcal'), goal: ftGoals.kcal, unit:'', color:'var(--accent)' });
  if (ftGoals.p) rows.push({ label:'Protein', val: avg('p'), goal: ftGoals.p, unit:'g', color:'var(--protein)' });
  if (ftGoals.c) rows.push({ label:'Kohlenhydrate', val: avg('c'), goal: ftGoals.c, unit:'g', color:'var(--carbs)' });
  if (ftGoals.f) rows.push({ label:'Fett', val: avg('f'), goal: ftGoals.f, unit:'g', color:'var(--fat)' });
  const rowsHTML = rows.map(r => `
    <div class="ft-goal-compare-row">
      <div class="ft-goal-compare-top">
        <span>${r.label}</span>
        <span>${r.val}${r.unit} <span class="ft-goal-of">/ ${r.goal}${r.unit}</span></span>
      </div>
      ${ftGoalBarHTML(r.val, r.goal, r.color)}
    </div>
  `).join('');
  return `
    <div class="section-label" style="margin-top:22px;">Ziel-Erreichung · Ø pro Tag</div>
    <div class="month-report-card">${rowsHTML}</div>
  `;
}

// Ø kcal je Wochentag im gewählten Zeitraum — zeigt Muster wie "am Wochenende wird spürbar
// mehr gegessen", die im reinen Zeitverlauf (chartHTML oben) leicht untergehen. Bewusst über
// ALLE Tage des Buckets gemittelt (auch wenn an einem Wochentag nur 1x im Zeitraum
// protokolliert wurde) statt eine Mindestanzahl zu verlangen — bei kurzen Zeiträumen (Woche)
// wäre sonst fast nie genug Datenbasis vorhanden.
function ftWeekdayAverageHTML(periodDays){
  const days = ftDayTotalsInPeriod(periodDays);
  if (!days.length) return '';
  const labels = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  const sums = [0,0,0,0,0,0,0], counts = [0,0,0,0,0,0,0];
  days.forEach(d => {
    const wd = (ftParseISO(d.date).getDay() + 6) % 7; // 0 = Montag
    sums[wd] += d.kcal; counts[wd]++;
  });
  const points = labels.map((l,i) => ({ label:l, value: counts[i] ? Math.round(sums[i]/counts[i]) : 0 }));
  return `
    <div class="section-label" style="margin-top:22px;">Ø kcal nach Wochentag</div>
    ${buildBarChart(points, cssVar('--accent'), true, 130)}
  `;
}

// Aktuelle und längste Tracking-Serie (aufeinanderfolgende protokollierte Tage) — bewusst über
// den GESAMTEN Datenbestand berechnet, nicht auf den gewählten Statistik-Zeitraum begrenzt,
// da eine Serie naturgemäß über Zeiträume hinweg läuft (eine Serie von 40 Tagen würde in der
// "Woche"-Ansicht sonst wie 7 aussehen). Die aktuelle Serie gilt als noch "am Leben", solange
// der letzte protokollierte Tag heute oder gestern war — bricht also nicht schon mitten am Tag
// ab, nur weil man den heutigen Tag noch nicht (fertig) eingetragen hat.
function ftTrackingStreaks(){
  const dates = ftAllDayTotals().map(d => d.date); // aufsteigend sortiert
  if (!dates.length) return { current: 0, longest: 0 };
  let longest = 1, run = 1;
  for (let i = 1; i < dates.length; i++){
    run = (ftAddDays(dates[i-1], 1) === dates[i]) ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  const today = ftTodayISO();
  const yesterday = ftAddDays(today, -1);
  const last = dates[dates.length - 1];
  let current = 0;
  if (last === today || last === yesterday){
    current = 1;
    let cursor = last;
    for (let i = dates.length - 2; i >= 0; i--){
      if (dates[i] === ftAddDays(cursor, -1)){ current++; cursor = dates[i]; } else break;
    }
  }
  return { current, longest };
}
function ftStreakHTML(){
  const { current, longest } = ftTrackingStreaks();
  if (!longest) return '';
  return `
    <div class="section-label" style="margin-top:22px;">Tracking-Serie</div>
    <div class="month-report-card">
      <div class="month-report-stat-grid">
        <div class="month-report-stat-cell">
          <div class="month-report-stat-value">${current}</div>
          <div class="month-report-stat-label">Aktuelle Serie (Tage)</div>
        </div>
        <div class="month-report-stat-cell">
          <div class="month-report-stat-value">${longest}</div>
          <div class="month-report-stat-label">Längste Serie (Tage)</div>
        </div>
      </div>
    </div>
  `;
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
    ${ftGoalComparisonHTML(periodDays)}
    ${ftWeekdayAverageHTML(periodDays)}
    ${ftStreakHTML()}
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
    ftBreakdownExpanded = false;
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
    const fullBreakdown = ftFoodMacroBreakdown(selected, periodDays);
    // subTotal bewusst aus der VOLLSTÄNDIGEN, ungefilterten Liste berechnet — die
    // Prozentangaben bleiben dadurch über verschiedene Zeiträume hinweg vergleichbar
    // (Woche/Monat/Jahr können hier stark unterschiedlich viele Lebensmittel enthalten, siehe
    // Filterung unten), statt sich künstlich zu verschieben, nur weil ein paar Mini-Beiträge
    // aus der ANZEIGE rausfallen.
    const subTotal = fullBreakdown.reduce((a,e) => a+e.val, 0);
    // Vernachlässigbare Beiträge ausblenden (auf 0% gerundet ODER nur ~1g) — bei häufig
    // protokollierten Mahlzeiten sammeln sich sonst über die Zeit viele Gewürz-/Topping-Reste
    // in Spurenmengen an, die weder im Ring noch in der Liste zusätzlichen Erkenntniswert
    // bringen, beide aber unübersichtlich aufblähen. Zusätzlich auf die 7 größten Quellen
    // gedeckelt (schon absteigend sortiert, siehe ftFoodMacroBreakdown()) — bewusst dynamisch
    // aus der jeweils aktuellen Liste ermittelt statt fest vorausgewählt, da sich die
    // häufigsten Quellen je nach Zeitraum (Woche/Monat/Jahr) stark unterscheiden können.
    const significant = fullBreakdown.filter(e => e.val >= 1.5 && (subTotal ? Math.round(e.val / subTotal * 100) : 0) > 0);
    // Antippen der "+N weitere"-Zeile klappt auf die volle significant-Liste auf (kein
    // Lebensmittel bleibt dabei verborgen) — ftBreakdownExpanded macht daraus einfach eine
    // Anzeige ohne Deckelung/Rest-Sammelposten.
    const shown = ftBreakdownExpanded ? significant : significant.slice(0, 7);
    const restVal = ftBreakdownExpanded ? 0 : significant.slice(7).reduce((a,e) => a+e.val, 0);
    const restCount = significant.length - shown.length;

    if (selectedRange && subTotal){
      let a = selectedRange.startAngle;
      // Der Ring zeigt exakt dieselben Unterabschnitte wie die Liste darunter (siehe rows
      // weiter unten) — die übrigen, nicht einzeln gezeigten Quellen fließen als EIN
      // gemeinsamer, neutral eingefärbter "Rest"-Abschnitt ein, statt einfach zu fehlen (der
      // Ring würde sonst sichtbar kleiner wirken als der Makro-Anteil tatsächlich ist).
      const arcItems = restVal > 0 ? [...shown, { name: `+${restCount} weitere`, val: restVal, isRest: true }] : shown;
      const gapDeg = arcItems.length > 1 ? 1.4 : 0;
      arcItems.forEach((e, i) => {
        const fraction = e.val / subTotal;
        const rawEnd = a + fraction * (selectedRange.endAngle - selectedRange.startAngle);
        const startA = a + (i > 0 ? gapDeg/2 : 0);
        const endA = rawEnd - (i < arcItems.length - 1 ? gapDeg/2 : 0);
        a = rawEnd;
        const subPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        subPath.setAttribute('d', donutArcPath(startA, endA));
        subPath.setAttribute('fill', e.isRest ? cssVar('--muted') : shadeMuscleColor(seg.color, i));
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

    const rows = shown.map((e, i) => {
      const pct = subTotal ? Math.round(e.val / subTotal * 100) : 0;
      return `
        <div class="muscle-balance-legend-row">
          <span class="muscle-balance-swatch-static" style="color:${shadeMuscleColor(seg.color, i)};">${pct}%</span>
          <span class="muscle-balance-legend-label">${ftEscapeHTML(e.name)}</span>
          <span class="muscle-balance-legend-value">${Math.round(e.val)} g</span>
        </div>
      `;
    }).join('');
    // "+N weitere" ist jetzt ein <button> statt eines <div> — optisch identisch zu den
    // normalen Zeilen (.muscle-balance-legend-row-more in styles.css), aber antippbar: klappt
    // die Liste auf ftBreakdownExpanded=true um und rendert neu. Nach dem Aufklappen ersetzt
    // eine "Weniger anzeigen"-Zeile diese Sammelzeile, um wieder einzuklappen.
    const restRowHTML = restVal > 0 ? `
      <button class="muscle-balance-legend-row muscle-balance-legend-row-more" id="ftBreakdownMoreBtn" type="button">
        <span class="muscle-balance-swatch-static" style="color:var(--muted);">${subTotal ? Math.round(restVal / subTotal * 100) : 0}%</span>
        <span class="muscle-balance-legend-label">+${restCount} weitere</span>
        <span class="muscle-balance-legend-value">${Math.round(restVal)} g</span>
      </button>
    ` : '';
    const lessRowHTML = (ftBreakdownExpanded && significant.length > 7) ? `
      <button class="muscle-balance-legend-row muscle-balance-legend-row-more" id="ftBreakdownLessBtn" type="button">
        <span class="muscle-balance-legend-label" style="margin-left:0;">Weniger anzeigen</span>
      </button>
    ` : '';
    document.getElementById('ftBreakdownTitle').textContent = `${seg.label} – nach Lebensmittel`;
    document.getElementById('ftBreakdownList').innerHTML = (rows + restRowHTML + lessRowHTML) || '<div class="history-empty">Keine Daten.</div>';
    const moreBtn = document.getElementById('ftBreakdownMoreBtn');
    if (moreBtn) moreBtn.onclick = () => { ftBreakdownExpanded = true; apply(); };
    const lessBtn = document.getElementById('ftBreakdownLessBtn');
    if (lessBtn) lessBtn.onclick = () => { ftBreakdownExpanded = false; apply(); };
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
