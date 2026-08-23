/* ---------------------------------------------------
   08a-stats-progress-charts.js
   ---------------------------------------------------
   Teil 1/3 der ehemals einzelnen 08-stats-progress.js (2171 Zeilen, an der
   Größengrenze für vollständige Datei-Downloads). Rein aus Dateigröße
   aufgeteilt, OHNE inhaltliche Änderung — Funktionsgrenzen sind exakt
   erhalten, nur auf drei Dateien verteilt. Ausführungsreihenfolge bleibt
   zwingend 08a → 08b → 08c (siehe <script>-Reihenfolge in index.html und
   APP_SHELL in sw.js).
   Inhalt dieses Teils: STATS-Gesamtwerte/Aggregation, Übungshistorie/
   Rekorde/Metriken, sowie die Chart-Bauhelfer (Linie/Balken/Kreis), die auch
   von 08b/08c weiterverwendet werden.
--------------------------------------------------- */
function totalTrainingSeconds(){
  // sessionsForStats(): als "Anderes Gym"/"Verletzt" markierte Einheiten (siehe 04-utils.js)
  // fließen hier nicht ein — diese Gesamtwerte sind echte Statistik, kein reiner
  // Trainingstag-Zähler.
  return sessionsForStats().reduce((a,s)=> a + s.durationSec, 0);
}
function totalVolumeKg(){
  return sessionsForStats().reduce((a,s)=>
    a + s.entries.reduce((a2,e)=>{
      const planEx = plan.exercises.find(x => x.id === e.exerciseId);
      return a2 + e.sets.reduce((a3,st)=> a3 + ((st.reps && st.weight) ? st.reps*effectiveSetWeight(planEx, st.weight) : 0), 0);
    }, 0)
  , 0);
}
function shortDate(iso){
  return new Date(iso).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
}
// Formatiert die Satzliste einer Übung als kompakten Text (für PDF-Export und Teilen).
// Bei Übungen ohne relevantes Gewicht — noWeight (z. B. Situps, Beinheben) oder
// bodyweightExercise ohne zusätzliches Zusatzgewicht in JEDEM Satz — wird nur die Wdh-Zahl
// gezeigt (z. B. "12 Wdh"), nicht "12×0kg". Ist bei einer bodyweightExercise in einem Satz
// tatsächlich ein Zusatzgewicht eingetragen (z. B. Gewichtsweste), wird das weiterhin mit
// angezeigt — nur der Fall "kein Gewicht eingetragen" wird ohne "×0kg" dargestellt.
function formatSetsLine(entry, planEx){
  if (entry.type === 'time'){
    return entry.sets.map(s => fmtSec(s.seconds)).join(' · ');
  }
  const isBodyweightType = !!(planEx && (planEx.noWeight || planEx.bodyweightExercise));
  return entry.sets.map(s => {
    if (isBodyweightType && !s.weight){
      return `${s.reps} Wdh`;
    }
    return `${s.reps}×${s.weight ?? 0}kg`;
  }).join(' · ');
}

function fmtSec(sec){
  if (sec === null || sec === undefined) return '—';
  const m = Math.floor(sec/60), s = sec%60;
  return m > 0 ? `${m}:${String(s).padStart(2,'0')}` : `${s}s`;
}
function sessionVolumeKg(s){
  return s.entries.reduce((a,e) => {
    const planEx = plan.exercises.find(x => x.id === e.exerciseId);
    return a + e.sets.reduce((a2,st) => a2 + ((st.reps && st.weight) ? st.reps*effectiveSetWeight(planEx, st.weight) : 0), 0);
  }, 0);
}
function weekBucket(d){
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return { key: `${d.getFullYear()}-W${week}`, label: `KW ${week}`, sortKey: d.getFullYear()*100 + week };
}
// Ab wie vielen Punkten der 'total'-Verlauf (siehe aggregateSessions()/
// aggregateSessionsForGroup() unten) statt eines Punkts PRO EINHEIT auf einen Punkt PRO
// KALENDERMONAT umgestellt wird. Unterhalb der Schwelle bleibt die bisherige feingranulare
// Darstellung (ein Punkt je Einheit) erhalten, weil sie dort noch gut lesbar ist. Oberhalb
// würde buildLineChart() (viele hundert Punkte bei jahrelanger Nutzung) nur noch eine
// verwaschene Strichcode-Linie ohne erkennbaren Trend zeichnen.
const TOTAL_BUCKET_THRESHOLD = 60;
const MONTH_SHORT_NAMES = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
function monthShortLabel(d){
  return `${MONTH_SHORT_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}
// Baut aus chronologisch sortierten Sessions eine kumulative Verlaufslinie, aber mit
// höchstens einem Punkt pro Kalendermonat (Wert = Summe/"running" bis EINSCHLIESSLICH des
// jeweiligen Monats) statt einem Punkt pro einzelner Einheit. Der kumulative Charakter
// bleibt dabei erhalten — nur die Auflösung der X-Achse wird gröber.
function bucketedCumulativePoints(sorted, getValue){
  let running = 0;
  const byMonth = new Map();
  sorted.forEach(s => {
    running += getValue(s);
    const d = new Date(s.date);
    const mk = d.getFullYear() * 100 + d.getMonth();
    byMonth.set(mk, { label: monthShortLabel(d), value: running, date: s.date });
  });
  return Array.from(byMonth.values());
}
// 'month'/'year' sind ein ROLLIERENDES Zeitfenster (letzte 30/365 Tage, siehe
// statsPeriodToDays() weiter unten — derselbe Zeitraum-Filter wie beim Zeit-Donut auf
// demselben Screen), KEIN Kalendermonat/-jahr-Bucket. Innerhalb des Fensters bekommt jede
// Einheit ihren eigenen Punkt (vorher wurden alle Einheiten desselben Kalendermonats zu
// einem einzigen Punkt summiert — bei z. B. 3 Einheiten im selben Monat blieb dadurch nur
// 1 Punkt übrig und der Trend verschwand, obwohl der Hinweistext "ab der zweiten geloggten
// Einheit" etwas anderes verspricht). Bei 'total' UND mehr als TOTAL_BUCKET_THRESHOLD
// Einheiten wird dagegen bewusst auf Monats-Buckets umgeschaltet (siehe
// bucketedCumulativePoints() oben) — sonst wird die Linie bei jahrelanger Nutzung
// unlesbar dicht.
function aggregateSessions(getValue, period){
  const days = statsPeriodToDays(period);
  const cutoff = days ? Date.now() - days * 86400000 : null;
  const sorted = sessionsForStats()
    .filter(s => !cutoff || new Date(s.date).getTime() >= cutoff)
    .slice()
    .sort((a,b) => new Date(a.date) - new Date(b.date));
  if (period === 'total'){
    if (sorted.length > TOTAL_BUCKET_THRESHOLD) return bucketedCumulativePoints(sorted, getValue);
    let running = 0;
    return sorted.map(s => { running += getValue(s); return { label: shortDate(s.date), value: running, date: s.date }; });
  }
  return sorted.map(s => ({ label: shortDate(s.date), value: getValue(s), date: s.date }));
}

// Wie aggregateSessions(), aber NUR für die Muskelgruppen-Diagramme: Eine Session darf nur
// dann einen Datenpunkt für eine Muskelgruppe liefern, wenn diese Gruppe in der Session
// tatsächlich mit Gewicht trainiert wurde — sonst würde eine Session ohne z. B. Beinübungen als
// "0 kg"-Punkt in den Beine-Verlauf einfließen. Ein solcher Nullpunkt sieht in der Line-Chart
// wie ein Einbruch aus (und verfälscht das Delta in chartAccordionHTML, z. B. "-8.983 kg",
// obwohl die Gruppe einfach nicht trainiert wurde) statt korrekt als "keine Daten" behandelt zu
// werden. Maßgeblich ist, ob die Muskelgruppe in der Session mit einem Satz vorkam, der
// TATSÄCHLICH Gewicht bewegt hat (reps UND weight gesetzt) — reine Körpergewichtsübungen ohne
// Gewichtseingabe (z. B. Rückenstrecker an einem sonst reinen Beintag) zählen bewusst NICHT als
// "Gruppe trainiert", sonst erzeugt genau so ein Satz einen echten 0-kg-Punkt im Verlauf der
// Gruppe, der wie ein Trainingseinbruch aussieht, obwohl an dem Tag schlicht kein Gewicht für
// diese Gruppe bewegt wurde. Solche Sessions werden stattdessen ganz aus dem Verlauf dieser
// Gruppe ausgeklammert.
function sessionTrainsGroup(s, group){
  return s.entries.some(e => {
    const planEx = plan.exercises.find(x => x.id === e.exerciseId);
    if (((planEx && planEx.muscleGroup) || 'Sonstige') !== group) return false;
    return (e.sets || []).some(st => st.reps && st.weight);
  });
}
function aggregateSessionsForGroup(group, getValue, period){
  const days = statsPeriodToDays(period);
  const cutoff = days ? Date.now() - days * 86400000 : null;
  const sorted = sessionsForStats()
    .filter(s => (!cutoff || new Date(s.date).getTime() >= cutoff) && sessionTrainsGroup(s, group))
    .slice()
    .sort((a,b) => new Date(a.date) - new Date(b.date));
  if (period === 'total'){
    if (sorted.length > TOTAL_BUCKET_THRESHOLD) return bucketedCumulativePoints(sorted, getValue);
    let running = 0;
    return sorted.map(s => { running += getValue(s); return { label: shortDate(s.date), value: running, date: s.date }; });
  }
  return sorted.map(s => ({ label: shortDate(s.date), value: getValue(s), date: s.date }));
}

let statsPeriod = 'month';
// 'quarter' (90 Tage) schließt dieselbe Lücke wie beim bereits vorhandenen 90-Tage-Zeitraum
// der Muskelbalance (siehe muscleBalancePeriod weiter unten) — ein rollierendes Fenster
// zwischen "Monat" und "Jahr" für den mittelfristigen Verlauf.
const PERIOD_LABELS = { month: 'Monat', quarter: 'Quartal', year: 'Jahr', total: 'Insgesamt' };

// Filtert eine Liste von {date, value}-Punkten nach Periode (analog aggregateSessions(),
// aber für beliebige Datenpunkte statt konkret für Sessions). 'month'/'year' sind — wie bei
// aggregateSessions() — ein rollierendes 30-/365-Tage-Fenster (statsPeriodToDays()), kein
// Kalendermonat/-jahr-Bucket: jeder Punkt (= eine Einheit, in der die Übung vorkam) bleibt
// einzeln erhalten, nur außerhalb des Fensters liegende Punkte fallen weg. Bei 'total' bleibt
// die Liste unverändert (kein Zeitfenster).
function aggregateHistoryPoints(points, period){
  const days = statsPeriodToDays(period);
  if (!days) return points;
  const cutoff = Date.now() - days * 86400000;
  return points.filter(p => new Date(p.date).getTime() >= cutoff);
}

let statsChartOpen = new Set();
function renderStatsChart(metric){
  const isTime = metric === 'time';
  const title = isTime ? 'Trainingszeit' : 'Bewegtes Gewicht';
  const color = isTime ? cssVar('--accent') : cssVar('--accent-3');
  const getValue = isTime ? (s => s.durationSec) : (s => sessionVolumeKg(s));
  const points = aggregateSessions(getValue, statsPeriod);
  const chartPoints = points.map(p => ({ label: p.label, value: p.value }));
  const formatter = isTime ? fmtDuration : (v => v.toLocaleString('de-DE'));
  const totalValue = points.reduce((a,p) => a + p.value, 0);
  const totalLabel = isTime ? fmtDuration(totalValue) : totalValue.toLocaleString('de-DE') + ' kg';

  const showWeeklyWidget = statsPeriod === 'month';
  const nowForWidget = new Date();
  const widgetPoints = showWeeklyWidget
    ? monthWeeklyTrainingPoints(nowForWidget.getFullYear(), nowForWidget.getMonth())
    : sessionsPerMonth().map(m => ({ label: m.label, value: m.count }));
  const widgetHTML = !isTime ? '' : `
    <div class="training-widget">
      <button class="training-widget-history-btn" id="btnWorkouts" type="button" aria-label="Verlauf"><img src="${ICON_HISTORY}" alt=""></button>
      <div class="training-widget-header">
        <h3>${showWeeklyWidget ? 'Einheiten pro Woche' : 'Einheiten pro Monat'}</h3>
      </div>
      ${buildBarChart(widgetPoints, cssVar('--accent'), true)}
    </div>
  `;

  // Bei "Bewegtes Gewicht" zusätzlich ein eigenes Diagramm PRO Muskelgruppe darunter (zum
  // Scrollen) — dieselbe Ausschluss-Logik wie sessionVolumeKg()/totalVolumeKg() (Sätze ohne
  // reps/weight tragen automatisch 0 bei), Kardio-Übungen ohne echtes Gewicht bleiben außen vor.
  function sessionVolumeKgForGroup(s, group){
    return s.entries.reduce((a,e) => {
      const planEx = plan.exercises.find(x => x.id === e.exerciseId);
      if (((planEx && planEx.muscleGroup) || 'Sonstige') !== group) return a;
      return a + e.sets.reduce((a2,st) => a2 + ((st.reps && st.weight) ? st.reps*effectiveSetWeight(planEx, st.weight) : 0), 0);
    }, 0);
  }
  const groupChartsHTML = isTime ? '' : MUSCLE_GROUP_ORDER.filter(g => g !== 'Kardio').map(g => {
    const groupPoints = aggregateSessionsForGroup(g, s => sessionVolumeKgForGroup(s, g), statsPeriod);
    const groupTotal = groupPoints.reduce((a,p) => a + p.value, 0);
    if (!groupTotal) return ''; // Muskelgruppen ganz ohne protokolliertes Gewicht werden nicht mit angezeigt
    return chartAccordionHTML(statsChartOpen, `group-${g}`, g, groupPoints, muscleGroupColor(g), v => v.toLocaleString('de-DE') + ' kg',
      buildLineChart(groupPoints, muscleGroupColor(g), v => v.toLocaleString('de-DE')));
  }).join('');

  // Körpergewichtstrend zusätzlich innerhalb von "Bewegtes Gewicht" (nicht bei "Trainingszeit"):
  // teilt sich bewusst denselben Zeitraum-Filter (statsPeriod) wie der Rest des Screens statt
  // eines eigenen — gleiches Prinzip wie schon beim Zeit-Donut im Trainingszeit-Screen (siehe
  // dortiger Kommentar). Nur sichtbar, wenn überhaupt Körpergewichts-Einträge vorliegen
  // (plan.bodyWeightLog, siehe logBodyWeight()/renderBodyWeightChart()) — sonst bliebe nur ein
  // leeres Akkordeon stehen, das niemand aufklappen würde.
  const bodyWeightLog = Array.isArray(plan.bodyWeightLog) ? plan.bodyWeightLog : [];
  const bodyWeightFormatter = v => formatGermanNumber(Math.round(v * 10) / 10) + ' kg';
  const bodyWeightPoints = (isTime || !bodyWeightLog.length) ? [] : aggregateHistoryPoints(bodyWeightLog, statsPeriod)
    .map(e => ({ label: shortDate(e.date), value: e.weight, date: e.date }));
  const bodyWeightTrendHTML = (isTime || !bodyWeightLog.length) ? '' : chartAccordionHTML(statsChartOpen, 'bodyweight', 'Körpergewicht', bodyWeightPoints, cssVar('--accent-3'), bodyWeightFormatter,
    buildLineChart(bodyWeightPoints, cssVar('--accent-3'), bodyWeightFormatter));
  // Konsistent mit der gefilterten Summe direkt daneben (totalLabel, aus dem oben bereits
  // gefilterten chartPoints/aggregateSessions() abgeleitet) — als "Anderes Gym"/"Verletzt"
  // markierte Einheiten zählen hier ebenfalls nicht mit, siehe sessionsForStats().
  const statsSessionCount = sessionsForStats().length;

  app.innerHTML = `
    <div class="back-row" style="margin-top:0;"><button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button></div>
    <div class="progress-summary" style="margin-top:18px;">
      <span>${statsSessionCount} ${statsSessionCount === 1 ? 'Einheit' : 'Einheiten'} gesamt</span>
      <span>Gesamt: ${totalLabel}</span>
    </div>
    <div class="period-row">
      ${Object.keys(PERIOD_LABELS).map(p => `
        <button class="period-btn ${statsPeriod === p ? 'active' : ''}" data-period="${p}">${PERIOD_LABELS[p]}</button>
      `).join('')}
    </div>
    ${chartAccordionHTML(statsChartOpen, 'main', title, chartPoints, color, formatter, buildLineChart(chartPoints, color, formatter))}
    ${widgetHTML}
    ${bodyWeightTrendHTML}
    ${groupChartsHTML ? `<div class="section-label" style="margin-top:18px;">Nach Muskelgruppe</div>${groupChartsHTML}` : ''}
    ${isTime ? timeDonutSectionHTML(statsPeriodToDays(statsPeriod)) : ''}
  `;

  document.getElementById('btnBack').onclick = () => history.back();
  if (document.getElementById('btnWorkouts')){
    document.getElementById('btnWorkouts').onclick = () => goWorkoutsOverview();
  }
  app.querySelectorAll('.period-btn').forEach(btn => {
    btn.onclick = () => {
      statsPeriod = btn.dataset.period;
      renderStatsChart(metric);
    };
  });
  app.querySelectorAll('[data-chartacc]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.chartacc;
      if (statsChartOpen.has(key)) statsChartOpen.delete(key); else statsChartOpen.add(key);
      renderStatsChart(metric);
    };
  });
  if (isTime) wireTimeDonutSection(statsPeriodToDays(statsPeriod));
  wireLineCharts(app);
}

// Körpergewichts-VERLAUF (plan.bodyWeightLog, siehe logBodyWeight() in 04-utils.js und die
// Migration in 02-state-theme.js) — eigener, simpler Screen mit genau einem Diagramm (anders
// als renderStatsChart()/renderExerciseProgress() mit mehreren auf-/zuklappbaren Diagrammen),
// da es hier nur eine einzige Kennzahl gibt. Nutzt bewusst dieselben PERIOD_LABELS/
// aggregateHistoryPoints() wie der Übungsfortschritt, damit sich "Monat/Quartal/Jahr/
// Insgesamt" app-weit einheitlich verhält.
let bodyWeightChartPeriod = 'month';
function renderBodyWeightChart(){
  const log = Array.isArray(plan.bodyWeightLog) ? plan.bodyWeightLog : [];
  const points = aggregateHistoryPoints(log, bodyWeightChartPeriod)
    .map(e => ({ label: shortDate(e.date), value: e.weight, date: e.date }));
  const formatter = v => formatGermanNumber(Math.round(v * 10) / 10) + ' kg';
  const current = log.length ? log[log.length - 1].weight : null;
  const summaryLine = current != null ? `Aktuell: ${formatGermanNumber(current)} kg` : 'Noch kein Wert erfasst';

  app.innerHTML = `
    <div class="brand"><h1>Körpergewicht</h1></div>
    <div class="back-row"><button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button></div>
    <div class="progress-summary">
      <span>${log.length} ${log.length === 1 ? 'Eintrag' : 'Einträge'}</span>
      <span>${summaryLine}</span>
    </div>
    <div class="period-row">
      ${Object.keys(PERIOD_LABELS).map(p => `
        <button class="period-btn ${bodyWeightChartPeriod === p ? 'active' : ''}" data-period="${p}">${PERIOD_LABELS[p]}</button>
      `).join('')}
    </div>
    ${buildLineChart(points, cssVar('--accent-3'), formatter)}
    <button class="btn btn-ghost" id="btnLogBodyWeight" type="button" style="width:100%; margin-top:14px;">Neuen Wert eintragen</button>
  `;

  document.getElementById('btnBack').onclick = () => history.back();
  app.querySelectorAll('.period-btn').forEach(btn => {
    btn.onclick = () => {
      bodyWeightChartPeriod = btn.dataset.period;
      renderBodyWeightChart();
    };
  });
  document.getElementById('btnLogBodyWeight').onclick = () => openBodyWeightPrompt(() => renderBodyWeightChart());
  wireLineCharts(app);
}

/* ---------------------------------------------------
   PROGRESS (Übungsliste + Diagramme)
--------------------------------------------------- */
function exerciseHistory(name){
  const planEx = plan.exercises.find(e => e.name === name);
  const isTime = planEx && planEx.type === 'time';
  // Bei Körpergewichtsübungen (noWeight/bodyweightExercise) reicht ein Wdh-Wert, damit ein Satz
  // in die Historie einfließt — vorher verlangte der Filter zwingend AUCH ein Gewicht (st.weight
  // truthy), wodurch komplette Sätze ohne Zusatzgewicht (der Normalfall bei reinem Körper-
  // gewicht) nie in Rekorden/Statistiken auftauchten.
  const bodyweightType = !!(planEx && (planEx.noWeight || planEx.bodyweightExercise));
  // sessionsForStats(): eine als "Anderes Gym"/"Verletzt" markierte Einheit darf hier weder
  // als Rekord noch als Vergleichsbasis für die nächste Einheit auftauchen.
  return sessionsForStats()
    .filter(s => s.entries.some(e => e.name === name && e.sets.some(st => isTime ? st.seconds : (st.reps && (bodyweightType || st.weight)))))
    .map(s => {
      const e = s.entries.find(e => e.name === name);
      if (isTime){
        const valid = e.sets.filter(st => st.seconds);
        return {
          date: s.date,
          isTime: true,
          maxSeconds: Math.max(...valid.map(st => st.seconds)),
          totalSeconds: valid.reduce((a,st) => a + st.seconds, 0)
        };
      }
      const m = computeExerciseMetrics(e, planEx);
      return {
        date: s.date,
        isTime: false,
        maxWeight: m.hasData ? m.weightMax : 0,
        extraWeightMax: m.hasData ? m.extraWeightMax : 0,
        volume: m.hasData ? m.volume : 0,
        volumeMax: m.hasData ? m.volumeMax : 0,
        volumeAvg: m.hasData ? m.volumeAvg : 0,
        rm10Max: m.hasData ? m.rm10Max : 0,
        rm10Avg: m.hasData ? m.rm10Avg : 0,
        rm1Max: m.hasData ? m.rm1Max : 0,
        rm1Avg: m.hasData ? m.rm1Avg : 0,
        weightAvg: m.hasData ? m.weightAvg : 0,
        repsMax: m.hasData ? m.repsMax : 0,
        repsAvg: m.hasData ? m.repsAvg : 0
      };
    })
    .sort((a,b) => new Date(a.date) - new Date(b.date));
}

// Epley-Formel: geschätztes 1RM aus Gewicht und Wiederholungen eines Satzes.
function estimate1RM(weight, reps){
  if (!weight || !reps) return 0;
  return weight * (1 + reps / 30);
}

// Geschätztes Gewicht für exakt 10 Wiederholungen (10RM), aus dem geschätzten 1RM
// zurückgerechnet (gleiche Epley-Formel, nach dem Zielgewicht aufgelöst).
function estimate10RM(weight, reps){
  const oneRM = estimate1RM(weight, reps);
  if (!oneRM) return 0;
  return oneRM / (1 + 10 / 30);
}

// Liefert für einen einzelnen Satz (im aktiven Training) den Wert für die letzte Spalte,
// abhängig vom aktuell gewählten Anzeige-Modus (activeSetMetricMode) — Volumen dieses
// Satzes, oder das aus Wdh+Gewicht dieses Satzes geschätzte 1RM/10RM.
function setMetricValue(reps, weight, planEx, mode){
  if (!reps || !weight) return null;
  const effWeight = effectiveSetWeight(planEx, weight);
  if (mode === '1rm') return Math.round(estimate1RM(effWeight, reps));
  if (mode === '10rm') return Math.round(estimate10RM(effWeight, reps));
  return Math.round(reps * effWeight);
}

// Berechnet alle Kennzahlen für eine Übung innerhalb einer bestimmten Session
// (Sätze, Volumen, Volumen Max/Ø, 10RM Max/Ø, Gewicht Max/Ø, Wdh Max/Ø).
// planEx wird für effectiveSetWeight (unterstützte/Eigenkörpergewicht-Übungen) gebraucht.
function computeExerciseMetrics(entry, planEx){
  // Zeit-Übungen (z. B. Plank) haben keine reps/weight, sondern seconds pro Satz — eigener
  // Zweig mit den dafür sinnvollen Kennzahlen (längste Haltezeit / Ø-Haltezeit statt
  // Volumen/Gewicht/1RM), damit auch sie als Erfolg (Allzeitrekord/Verbesserung) in
  // computeExerciseHighlights() auftauchen können, statt komplett übersprungen zu werden.
  if (entry.type === 'time'){
    const validTimeSets = (entry.sets || []).filter(s => s.seconds !== null && s.seconds !== undefined);
    if (!validTimeSets.length){
      return { setsCount: entry.sets ? entry.sets.length : 0, hasData: false };
    }
    const setSeconds = validTimeSets.map(s => s.seconds);
    const avgT = arr => arr.reduce((a,v) => a+v, 0) / arr.length;
    return {
      setsCount: entry.sets.length,
      hasData: true,
      secondsMax: Math.max(...setSeconds),
      secondsAvg: avgT(setSeconds),
      secondsTotal: setSeconds.reduce((a,v) => a+v, 0)
    };
  }
  // Bei reinen Körpergewichtsübungen (planEx.noWeight — Feld ist gesperrt — ODER
  // planEx.bodyweightExercise mit optionalem Zusatzgewicht) reicht ein eingetragener Wdh-Wert
  // aus, das Gewicht-Feld darf leer/null bleiben (KEIN Ausschluss aus der Statistik mehr, siehe
  // Bug-Report: Sätze ohne Gewicht fielen bisher komplett aus jeder Auswertung raus).
  const bodyweightType = !!(planEx && (planEx.noWeight || planEx.bodyweightExercise));
  const validSets = (entry.sets || []).filter(s => s.reps !== null && s.reps !== undefined
    && (bodyweightType || (s.weight !== null && s.weight !== undefined)));
  if (!validSets.length){
    return { setsCount: entry.sets ? entry.sets.length : 0, hasData: false };
  }
  const setVolumes = validSets.map(s => s.reps * effectiveSetWeight(planEx, s.weight));
  const setWeights = validSets.map(s => effectiveSetWeight(planEx, s.weight));
  // Rohes eingetragenes Zusatzgewicht (NICHT effectiveSetWeight, das bei bodyweightExercise
  // bereits das Körpergewicht mit einrechnet) — dient nur dazu, zu erkennen, ob überhaupt
  // jemals ein Zusatzgewicht eingetragen wurde (siehe exerciseUsesExtraWeight()/
  // renderExerciseProgress()), um Gewicht-basierte Statistiken bei reinem Körpergewicht
  // ohne Zusatzgewicht auszublenden.
  const setExtraWeights = validSets.map(s => s.weight || 0);
  const setReps = validSets.map(s => s.reps);
  const set1RMs = validSets.map(s => estimate1RM(effectiveSetWeight(planEx, s.weight), s.reps));
  const set10RMs = validSets.map(s => estimate10RM(effectiveSetWeight(planEx, s.weight), s.reps));
  const avg = arr => arr.reduce((a,v) => a+v, 0) / arr.length;
  return {
    setsCount: entry.sets.length,
    hasData: true,
    volume: setVolumes.reduce((a,v) => a+v, 0),
    volumeMax: Math.max(...setVolumes),
    volumeAvg: avg(setVolumes),
    rm10Max: Math.max(...set10RMs),
    rm10Avg: avg(set10RMs),
    rm1Max: Math.max(...set1RMs),
    rm1Avg: avg(set1RMs),
    weightMax: Math.max(...setWeights),
    weightAvg: avg(setWeights),
    extraWeightMax: Math.max(...setExtraWeights),
    repsMax: Math.max(...setReps),
    repsAvg: avg(setReps),
    repsTotal: setReps.reduce((a,v) => a+v, 0)
  };
}

// Vergleicht die Metriken einer Session gegen den bisherigen Allzeitrekord (aus allen
// vorherigen Sessions dieser Übung) sowie gegen die direkt vorherige Session, und liefert
// pro Kennzahl die Prozent-Steigerung (falls vorhanden). Wird für die Übungsdetailseite
// in der Zusammenfassung gebraucht (gelb = vs. Allzeitrekord, grün = vs. letztes Mal).
function computeExerciseMetricComparison(session, exerciseId){
  const planEx = plan.exercises.find(x => x.id === exerciseId);
  const entry = session.entries.find(e => e.exerciseId === exerciseId);
  if (!entry) return null;
  const current = computeExerciseMetrics(entry, planEx);

  // sessionsForStats(): eine als "Anderes Gym"/"Verletzt" markierte Einheit darf nicht als
  // Vergleichsbasis für "letztes Mal"/Rekorde einer ANDEREN Einheit dienen (siehe 04-utils.js).
  const priorSessions = sessionsForStats()
    .filter(s => s.id !== session.id && new Date(s.date) < new Date(session.date))
    .sort((a,b) => new Date(b.date) - new Date(a.date)); // neueste zuerst

  const priorMetrics = [];
  let prevEntryMetrics = null;
  priorSessions.forEach(s => {
    const match = s.entries.find(x => x.exerciseId === exerciseId);
    if (match && match.sets && match.sets.length){
      const m = computeExerciseMetrics(match, planEx);
      if (m.hasData){
        priorMetrics.push(m);
        if (!prevEntryMetrics) prevEntryMetrics = m; // erste gefundene = direkt vorherige Einheit
      }
    }
  });

  // Hinweis: effectiveSetWeight() normalisiert unterstützte Übungen (assisted) bereits so,
  // dass ein höherer Wert immer besser ist (Körpergewicht - Gerätegewicht). Volume/Gewicht/
  // 10RM basieren alle auf effectiveSetWeight, brauchen also KEINE zusätzliche Umkehrung mehr.
  // Nur repsMax/repsAvg sind unabhängig davon ohnehin "höher = besser". Es gibt daher aktuell
  // keine Kennzahl, bei der "niedriger = besser" gelten müsste — lowerIsBetter bleibt nur noch
  // als Info-Flag erhalten (z. B. für den "weniger Unterstützung nötig"-Hinweistext).
  // Zeit-Übungen (Plank etc.) haben stattdessen secondsMax/secondsAvg als Kennzahlen —
  // länger halten ist ebenso "besser" wie mehr Gewicht/Wdh bei Kraftübungen.
  // Bei reinen Körpergewichtsübungen (noWeight ODER bodyweightExercise) OHNE jemals genutztes
  // Zusatzgewicht ergeben Gewicht-/Volumen-/RM-Kennzahlen keinen Sinn (das "Gewicht" wäre nur
  // das konstante Körpergewicht) — dann zählen nur Wdh-Kennzahlen als Erfolge/Rekorde. Sobald
  // irgendwann Zusatzgewicht eingetragen wurde (aktuell ODER in der Vergangenheit), gelten
  // wieder alle Kennzahlen wie bei einer normalen Gewichtsübung.
  const bodyweightType = !!(planEx && (planEx.noWeight || planEx.bodyweightExercise));
  const usesExtraWeight = !bodyweightType
    || (current.hasData && current.extraWeightMax > 0)
    || priorMetrics.some(m => m.extraWeightMax > 0);
  const METRIC_KEYS = entry.type === 'time'
    ? ['secondsMax', 'secondsAvg']
    : (usesExtraWeight
        ? ['volume', 'volumeMax', 'volumeAvg', 'rm10Max', 'rm10Avg', 'rm1Max', 'rm1Avg', 'weightMax', 'weightAvg', 'repsMax', 'repsAvg']
        : ['repsMax', 'repsAvg']);

  function pctGain(curr, best){
    if (curr === null || curr === undefined || best === null || best === undefined || best === 0) return null;
    const improved = curr > best;
    if (!improved) return null;
    const diff = curr - best;
    return Math.round((diff / best) * 100);
  }

  const comparison = {};
  METRIC_KEYS.forEach(key => {
    const curr = current.hasData ? current[key] : null;
    const allTimeBest = priorMetrics.length ? Math.max(...priorMetrics.map(m => m[key])) : null;
    const prevVal = prevEntryMetrics ? prevEntryMetrics[key] : null;
    // Gab es noch nie zuvor Daten zu dieser Übung, ist jeder aktuelle Wert automatisch ein
    // neuer Allzeitrekord (isNewAllTime), auch ohne Prozent-Vergleichswert (allTimePct bleibt
    // in dem Fall null, da kein Vorherwert für eine Prozentangabe existiert).
    const isNewAllTime = allTimeBest === null && curr !== null && curr !== undefined;
    comparison[key] = {
      value: curr,
      allTimePct: allTimeBest !== null ? pctGain(curr, allTimeBest) : null,
      lastPct: prevVal !== null ? pctGain(curr, prevVal) : null,
      isNewAllTime
    };
  });

  return { current, comparison, lowerIsBetter: !!(planEx && planEx.assisted), hasHistory: priorMetrics.length > 0 };
}

const METRIC_LABELS = {
  volume: 'Volumen',
  volumeMax: 'Volumen Max',
  volumeAvg: 'Volumen Ø',
  rm10Max: '10RM Max',
  rm10Avg: '10RM Ø',
  rm1Max: '1RM Max',
  rm1Avg: '1RM Ø',
  weightMax: 'Gewicht Max',
  weightAvg: 'Gewicht Ø',
  repsMax: 'Wdh Max',
  repsAvg: 'Wdh Ø',
  secondsMax: 'Haltezeit Max',
  secondsAvg: 'Haltezeit Ø'
};
const METRIC_UNITS = {
  volume: 'kg', volumeMax: 'kg', volumeAvg: 'kg',
  rm10Max: 'kg', rm10Avg: 'kg', rm1Max: 'kg', rm1Avg: 'kg', weightMax: 'kg', weightAvg: 'kg',
  repsMax: 'Wdh', repsAvg: 'Wdh'
};

function fmtMetricValue(key, value){
  if (value === null || value === undefined) return '—';
  // Haltezeit-Kennzahlen als mm:ss statt als Dezimalzahl mit Einheit darstellen (fmtSec
  // rundet dabei automatisch auf ganze Sekunden).
  if (key === 'secondsMax' || key === 'secondsAvg') return fmtSec(Math.round(value));
  const rounded = Math.round(value * 10) / 10;
  const shown = Number.isInteger(rounded) ? rounded : rounded.toFixed(1);
  return `${shown} ${METRIC_UNITS[key]}`;
}

// Zählt, wie viele Kennzahlen bei dieser Session neue Allzeitrekorde waren — das ist
// der "Stern"-Wert, der in der Zusammenfassung pro Übung bzw. Session angezeigt wird.
// Zählt sowohl echte Steigerungen gegenüber einem bisherigen Bestwert (allTimePct !== null)
// als auch Kennzahlen einer Übung, die noch nie zuvor protokolliert wurde (isNewAllTime) —
// auch ein erstmalig protokollierter Wert ist per Definition der aktuelle Allzeitrekord.
function countAllTimeRecords(comparison){
  return Object.values(comparison).filter(m => m.allTimePct !== null || m.isNewAllTime).length;
}

function renderExerciseSessionDetail(sessionId, exerciseId){
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return goHome(false);
  const entry = session.entries.find(e => e.exerciseId === exerciseId);
  const planEx = plan.exercises.find(x => x.id === exerciseId);
  const name = entry ? entry.name : (planEx ? planEx.name : 'Übung');
  const img = planEx && planEx.imageData;

  const result = entry ? computeExerciseMetricComparison(session, exerciseId) : null;
  const isTime = entry && entry.type === 'time';

  let bodyHTML;
  if (!entry || !result || !result.current.hasData){
    bodyHTML = `<div class="metric-card"><div class="metric-empty-note">Für diese Übung liegen für diese Einheit keine auswertbaren Daten vor.</div></div>`;
  } else {
    const { current, comparison } = result;
    // Zeit-Übungen zeigen nur secondsMax/secondsAvg (siehe computeExerciseMetrics()), alle
    // anderen Übungen die üblichen Volumen/Gewicht/10RM/Wdh-Kennzahlen — comparison enthält
    // je nach entry.type ohnehin nur die jeweils relevanten Keys (METRIC_KEYS in
    // computeExerciseMetricComparison), Object.keys(comparison) filtert das hier passend mit.
    const isCardioEntry = !!(planEx && planEx.cardioMachine);
    const metricLabel = key => isCardioEntry && (key === 'secondsMax' || key === 'secondsAvg')
      ? (key === 'secondsMax' ? 'Zeit Max' : 'Zeit Ø')
      : METRIC_LABELS[key];
    const metricKeys = Object.keys(comparison)
      .filter(key => METRIC_LABELS[key])
      // Bei Kardio-Übungen (immer genau 1 Satz, siehe buildEntry()) ist eine "Ø"-Zeit
      // identisch mit dem Max-Wert und daher eine sinnlose Zusatzzeile — wird dort ausgeblendet.
      .filter(key => !(isCardioEntry && key === 'secondsAvg'));
    const rowsHTML = `
      <div class="metric-row"><span>Sätze</span><span class="metric-row-value">${current.setsCount} Sätze</span></div>
      ${metricKeys.map(key => {
        const m = comparison[key];
        const badges = [];
        if (m.allTimePct !== null) badges.push(`<span class="metric-badge metric-badge-alltime">+${m.allTimePct}%</span>`);
        else if (m.isNewAllTime) badges.push(`<span class="metric-badge metric-badge-alltime">Neu</span>`);
        if (m.lastPct !== null) badges.push(`<span class="metric-badge metric-badge-last">+${m.lastPct}%</span>`);
        return `
          <div class="metric-row">
            <span>${metricLabel(key)}${badges.length ? `<span class="metric-row-badges">${badges.join('')}</span>` : ''}</span>
            <span class="metric-row-value">${fmtMetricValue(key, m.value)}</span>
          </div>
        `;
      }).join('')}
    `;
    bodyHTML = `<div class="metric-card">${rowsHTML}</div>`;
  }

  app.innerHTML = `
    <div class="brand"><h1>Übungsdetail</h1></div>
    <div class="back-row"><button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button></div>
    <div class="metric-card-header">
      ${img ? `<img class="metric-card-thumb" src="${img}" alt="">` : `<span class="metric-card-thumb-fallback">${initials(name)}</span>`}
      <div>
        <div class="metric-card-title">${name}</div>
        <div class="metric-card-subtitle">${fmtDate(session.date)}${planEx && planEx.mainMuscle ? ' · ' + planEx.mainMuscle : ''}</div>
      </div>
    </div>
    ${bodyHTML}
  `;

  document.getElementById('btnBack').onclick = () => history.back();
}


// Baut Titel + eine groß hervorgehobene Zahl in der Diagrammfarbe darunter (der letzte/
// aktuellste Datenpunkt) — die kleinen Wert-Beschriftungen direkt an den Punkten im Diagramm
// selbst sind auf dem Handy schwer lesbar, diese Zeile macht den wichtigsten Wert auf einen
// Blick erkennbar, ohne die Punktbeschriftungen deshalb zu entfernen. Zusätzlich ein kleines
// Trend-Delta gegenüber dem VORHERIGEN Datenpunkt (z. B. "+2,5 kg"/"−0:15"), grün bei Anstieg,
// in der Warnfarbe bei Rückgang — nutzt denselben Formatter wie der Hauptwert, daher passend
// zur jeweiligen Einheit (kg, Sekunden als mm:ss, reine Zahl). Bleibt aus, wenn es (noch) keinen
// Vorgänger-Punkt gibt oder sich der Wert nicht verändert hat.
// Kompaktes, zugeklapptes Akkordeon für ein einzelnes Diagramm — exakt dasselbe schmale
// Kopfzeilen-Muster wie in den Einstellungen (settingsAccordionSection()): Titel links, der
// hervorgehobene letzte Wert (in der Diagrammfarbe) + Pfeil rechts, auch im zugeklappten
// Zustand sichtbar — Diagramme selbst nehmen so keinen Platz weg, bis man sie antippt.
function chartAccordionHTML(openSet, key, title, points, color, formatter, chartSVG){
  const isOpen = openSet.has(key);
  const fmt = formatter || (v => v);
  const last = points.length ? points[points.length - 1].value : null;
  const prev = points.length > 1 ? points[points.length - 2].value : null;
  let deltaHTML = '';
  if (last !== null && prev !== null && last !== prev){
    const delta = last - prev;
    const deltaColor = delta > 0 ? '#7cc576' : 'var(--accent-2)';
    const sign = delta > 0 ? '+' : '−';
    deltaHTML = `<span style="font-family:'JetBrains Mono', monospace; font-size:11px; font-weight:700; color:${deltaColor}; margin-left:5px;">${sign}${fmt(Math.abs(delta))}</span>`;
  }
  return `
    <div class="muscle-group" style="margin-top:10px;">
      <button class="muscle-group-header" data-chartacc="${key}" data-group="${key}" type="button">
        <span class="mg-name">${title}</span>
        <span class="mg-meta">${last !== null ? `<span style="font-family:'JetBrains Mono', monospace; font-weight:700; color:${color};">${fmt(last)}</span>${deltaHTML}` : ''} <span class="mg-arrow">${isOpen ? '▾' : '▸'}</span></span>
      </button>
      <div class="muscle-group-body" style="display:${isOpen ? 'block' : 'none'}">
        ${chartSVG}
      </div>
    </div>
  `;
}
function chartTitleHTML(title, points, color, formatter){
  const fmt = formatter || (v => v);
  const last = points.length ? points[points.length - 1].value : null;
  return `
    <div class="chart-title">${title}</div>
    ${last !== null ? `<div class="chart-title-value" style="color:${color};">${fmt(last)}</div>` : ''}
  `;
}
// Ab welcher rechnerischen Breite (siehe wideW unten) ein Diagramm NICHT mehr in die
// Standard-Fläche (BASE_W, bisher fest 560) gequetscht, sondern breiter gerendert und in
// einen horizontal scrollbaren Streifen (.line-chart-scroll) gepackt wird — swipen statt
// echtem Pinch-Zoom, das auf einem Vanilla-JS-Screen ohne Library ungleich aufwendiger und
// fehleranfälliger wäre (Multitouch-Gesten, Momentum, Re-Aggregation je Zoomstufe). Ergibt
// sich automatisch aus der Punktzahl (WIDE_POINT_GAP Mindestabstand pro Punkt) statt eines
// festen Punktzahl-Schwellwerts — bei wenigen Punkten bleibt das bisherige Verhalten (100%
// responsive, füllt die Kartenbreite) unverändert erhalten.
const CHART_BASE_W = 560;
const WIDE_POINT_GAP = 46;
function buildLineChart(points, color, valueFormatter, yMinOverride){
  const fmt = valueFormatter || (v => v);
  if (!points.length) return '<div class="chart-empty">Noch keine Daten — nach der ersten geloggten Einheit erscheint hier der Verlauf.</div>';
  // Mit nur einem Punkt lässt sich kein Trend zeigen — der Punkt würde (Skala startet bei 0)
  // meist ganz oben im Diagramm landen und darunter nur gähnende Leere lassen. Ein kurzer
  // Hinweis statt eines fast leeren Achsenkreuzes ist an dieser Stelle klarer.
  if (points.length === 1) return '<div class="chart-empty">Noch zu wenig Daten für einen Verlauf — ab der zweiten geloggten Einheit erscheint hier der Trend.</div>';

  const h = 150, padL = 10, padR = 10, padT = 32, padB = 24;
  const wideW = padL + padR + WIDE_POINT_GAP * (points.length - 1);
  const isWide = wideW > CHART_BASE_W;
  const w = isWide ? wideW : CHART_BASE_W;
  const innerW = w - padL - padR, innerH = h - padT - padB;

  const values = points.map(p => p.value);
  const maxV = Math.max(...values);
  // Feste untere Achsengrenze bei 0, wie gehabt — AUSSER ein Aufrufer übergibt explizit einen
  // eigenen Wert (yMinOverride, z. B. die Trainingsintensität: RPE bewegt sich nur zwischen
  // 6 und 10, bei einer festen 0-Grenze würde die eigentlich interessante Schwankung auf einen
  // schmalen Streifen ganz oben zusammengequetscht). Für alle bisherigen Aufrufer (Zeit,
  // bewegtes Gewicht, Körpergewicht, Muskelgruppen) ändert sich dadurch nichts.
  const minV = yMinOverride != null ? Math.min(yMinOverride, Math.min(...values)) : Math.min(0, Math.min(...values));
  const range = (maxV - minV) || 1;

  // Zeitproportionale X-Achse: Punkte werden entlang ihres tatsächlichen Datums verteilt statt
  // gleichmäßig nach Index — ein zweimonatiges Trainingsloch zeigt sich dadurch auch wirklich
  // als Lücke in der Linie, statt optisch genauso eng wie tägliche Einheiten zusammenzurücken.
  // Fällt bei fehlenden/ungültigen Daten (z. B. falls ein Aufrufer kein .date mitgibt) robust
  // auf den bisherigen gleichmäßigen Index-Abstand zurück, statt kaputtzugehen.
  const times = points.map(p => p.date ? new Date(p.date).getTime() : NaN);
  const hasValidDates = times.every(t => !isNaN(t));
  const minT = hasValidDates ? Math.min(...times) : 0;
  const timeRange = hasValidDates ? (Math.max(...times) - minT) : 0;
  const stepX = innerW / (points.length - 1);
  const xFor = (i) => (hasValidDates && timeRange > 0) ? padL + ((times[i] - minT) / timeRange) * innerW : padL + stepX * i;

  const coords = points.map((p,i) => ({
    x: xFor(i),
    y: padT + innerH - ((p.value - minV)/range)*innerH,
    ...p
  }));
  const path = coords.map((c,i) => (i===0?'M':'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' ');

  // Trendlinie (einfache lineare Regression, Methode der kleinsten Quadrate über die bereits
  // berechneten x-Koordinaten/Werte) — gestrichelt und dezent in --muted statt der Diagramm-
  // farbe, damit sie sich klar von der eigentlichen Werte-Linie abhebt, aber nicht dominiert.
  // Erst ab 3 Punkten sinnvoll (bei 2 Punkten deckt sie sich ohnehin exakt mit der Linie selbst
  // und zeigt nichts Zusätzliches). Rein auf den sichtbaren x/y-Koordinaten gerechnet (nicht
  // nochmal auf Rohdaten), das entspricht optisch exakt dem, was im Diagramm zu sehen ist.
  let trendPath = '';
  if (coords.length >= 3){
    const n = coords.length;
    const sumX = coords.reduce((a,c) => a + c.x, 0);
    const sumY = coords.reduce((a,c) => a + c.y, 0);
    const sumXY = coords.reduce((a,c) => a + c.x*c.y, 0);
    const sumXX = coords.reduce((a,c) => a + c.x*c.x, 0);
    const denom = (n*sumXX - sumX*sumX);
    if (denom !== 0){
      const slope = (n*sumXY - sumX*sumY) / denom;
      const intercept = (sumY - slope*sumX) / n;
      const x1 = coords[0].x, x2 = coords[n-1].x;
      const y1 = slope*x1 + intercept, y2 = slope*x2 + intercept;
      trendPath = `<line class="chart-trend" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    }
  }


  // Tap-Tooltip statt fester Wertelabels über JEDEM Punkt: Bei vielen Punkten überlappten sich
  // die alten Dauerlabels ohnehin nur noch, und der letzte Wert steht bereits im Akkordeon-Kopf
  // (chartAccordionHTML()). Jeder Punkt bekommt eine unsichtbar große Tap-Fläche (r=12, sonst
  // auf einem Touchscreen kaum zuverlässig zu treffen) über dem sichtbaren kleinen Punkt, dazu
  // eine standardmäßig versteckte Tooltip-Box (.chart-tt) mit Datum+Wert — Position/Kippen an
  // den Rändern wird HIER beim Bauen fix vorausberechnet, wireLineCharts() blendet beim Tap nur
  // noch ein/aus, ohne selbst Koordinaten ausrechnen zu müssen.
  const dots = coords.map((c,i) =>
    `<circle class="chart-dot" data-dot="${i}" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="12" fill="transparent"/>` +
    `<circle class="chart-dot-visible" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="${color}"/>`
  ).join('');
  const tooltips = coords.map((c,i) => {
    const dateLabel = c.date ? new Date(c.date).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }) : c.label;
    const valueLabel = String(fmt(c.value));
    const boxW = Math.max(56, 8 * valueLabel.length, 8 * dateLabel.length);
    const boxX = Math.min(Math.max(c.x - boxW/2, padL), w - padR - boxW);
    const flipDown = (c.y - padT) < 36;
    const boxY = flipDown ? c.y + 10 : c.y - 42;
    return `
      <g class="chart-tt" data-tt="${i}" style="display:none;">
        <rect x="${boxX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="30" rx="6" class="chart-tt-bg"/>
        <text x="${(boxX+boxW/2).toFixed(1)}" y="${(boxY+13).toFixed(1)}" text-anchor="middle" class="chart-tt-value" style="fill:${color};">${valueLabel}</text>
        <text x="${(boxX+boxW/2).toFixed(1)}" y="${(boxY+25).toFixed(1)}" text-anchor="middle" class="chart-tt-date">${dateLabel}</text>
      </g>`;
  }).join('');

  const everyN = Math.max(1, Math.ceil(coords.length/(isWide ? 10 : 6)));
  // Erste/letzte Beschriftung an der Achse ausrichten statt zentriert auf den Punkt — sonst
  // ragt die Hälfte des Textes über den linken/rechten Rand der Zeichenfläche hinaus und wird
  // dort abgeschnitten (sichtbar z. B. beim allerersten Datum ganz links).
  const xLabels = coords.map((c,i) => {
    if (!(i % everyN === 0 || i === coords.length-1)) return '';
    const anchor = i === 0 ? 'start' : (i === coords.length-1 ? 'end' : 'middle');
    return `<text class="chart-label" x="${c.x.toFixed(1)}" y="${h-6}" text-anchor="${anchor}">${c.label}</text>`;
  }).join('');
  // Zwei dezente Hilfslinien zusätzlich zur Grundlinie, damit sich Werte grob einordnen lassen,
  // auch ohne an jedem einzelnen Punkt die Beschriftung lesen zu müssen.
  const gridLines = [0.33, 0.66].map(f =>
    `<line class="chart-grid" x1="${padL}" y1="${(padT+innerH*f).toFixed(1)}" x2="${w-padR}" y2="${(padT+innerH*f).toFixed(1)}"/>`).join('');

  const svg = `<svg viewBox="0 0 ${w} ${h}" width="${isWide ? w : '100%'}" height="${h}" role="img" aria-label="Verlaufsdiagramm, Punkte antippen für Details" data-wide="${isWide ? '1' : '0'}">
    ${gridLines}
    <line class="chart-axis" x1="${padL}" y1="${padT+innerH}" x2="${w-padR}" y2="${padT+innerH}"/>
    ${trendPath}
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>
    ${dots}${tooltips}${xLabels}
  </svg>`;
  // Im Breit-Modus (isWide) in einen scrollbaren Streifen packen — man wischt nach links in die
  // Vergangenheit; wireLineCharts() scrollt beim Rendern automatisch ans rechte Ende
  // (aktuellstes Datum), damit man nicht erst manuell dorthin scrollen muss.
  return isWide ? `<div class="line-chart-scroll">${svg}</div>` : svg;
}

// Blendet nach dem Rendern einer Seite die Tap-Tooltips aller enthaltenen Kurvendiagramme ein/
// aus und scrollt breite (isWide, siehe buildLineChart()) Diagramme initial ans rechte Ende
// (aktuellstes Datum). Muss nach JEDEM app.innerHTML-Aufbau erneut laufen, der Kurvendiagramme
// enthalten kann (renderStatsChart(), renderExerciseProgress(), renderBodyWeightChart()) — auch
// nach dem Auf-/Zuklappen eines Akkordeons, da dessen Body dabei komplett neu gerendert wird.
function wireLineCharts(container){
  container.querySelectorAll('svg[data-wide="1"]').forEach(svg => {
    const wrap = svg.closest('.line-chart-scroll');
    if (wrap) wrap.scrollLeft = wrap.scrollWidth;
  });
  container.querySelectorAll('.chart-dot').forEach(dot => {
    dot.onclick = () => {
      const svg = dot.closest('svg');
      const idx = dot.dataset.dot;
      const alreadyOpen = dot.classList.contains('chart-dot-active');
      svg.querySelectorAll('.chart-tt').forEach(tt => { tt.style.display = 'none'; });
      svg.querySelectorAll('.chart-dot').forEach(d => d.classList.remove('chart-dot-active'));
      if (!alreadyOpen){
        const tt = svg.querySelector(`.chart-tt[data-tt="${idx}"]`);
        if (tt) tt.style.display = 'block';
        dot.classList.add('chart-dot-active');
      }
    };
  });
}

function buildBarChart(points, color, showValues, height){
  if (!points.length) return '<div class="bar-chart-empty">Noch keine Einheiten protokolliert.</div>';
  const w = 560, h = height || 140;
  // Bei einer explizit kleineren Höhe (siehe Monatsbericht) auch die Innenabstände proportional
  // verkleinern, statt die für 140px ausgelegten festen 14/22px Innenabstände zu übernehmen —
  // sonst frisst allein das Padding einen Großteil der ohnehin kleinen Höhe und die Balken
  // selbst blieben winzig, obwohl der Chart als Ganzes schon kompakt sein sollte.
  const compact = h < 100;
  const padL = 6, padR = 6, padT = compact ? 6 : 14, padB = compact ? 14 : 22;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const maxV = Math.max(1, ...points.map(p => p.value));
  const n = points.length;
  const gap = n > 1 ? 6 : 0;
  const barW = Math.max(4, (innerW - gap*(n-1)) / n);
  const bars = points.map((p,i) => {
    const x = padL + i*(barW+gap);
    const barH = Math.max((p.value/maxV)*innerH, p.value > 0 ? 2 : 0);
    const y = padT + innerH - barH;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="${color}"/>`;
  }).join('');
  // Optional: Anzahl dezent (dunkelgrau, halbtransparent auf der Balkenfarbe) oben im Balken
  // einblenden — nur wenn genug Höhe dafür da ist, damit die Zahl nicht über den Rand ragt.
  const labelMinBarH = compact ? 16 : 24;
  const labelYOffset = compact ? 13 : 19;
  const valueLabels = showValues ? points.map((p,i) => {
    if (p.value <= 0) return '';
    const x = padL + i*(barW+gap) + barW/2;
    const barH = Math.max((p.value/maxV)*innerH, 2);
    const y = padT + innerH - barH;
    if (barH < labelMinBarH) return '';
    return `<text class="bar-chart-value-label" x="${x.toFixed(1)}" y="${(y+labelYOffset).toFixed(1)}" text-anchor="middle">${p.value}</text>`;
  }).join('') : '';
  const everyN = Math.max(1, Math.ceil(n/6));
  const labels = points.map((p,i) => (i % everyN === 0 || i === n-1)
    ? `<text class="chart-label" x="${(padL + i*(barW+gap) + barW/2).toFixed(1)}" y="${h-6}" text-anchor="middle">${p.label}</text>` : '').join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block;" role="img" aria-label="Einheiten pro Monat">
    <line class="chart-axis" x1="${padL}" y1="${padT+innerH}" x2="${w-padR}" y2="${padT+innerH}"/>
    ${bars}${valueLabels}${labels}
  </svg>`;
}

// Feste Farbpalette für die Muskelgruppen-Verteilung — bewusst NICHT von der frei wählbaren
// App-Akzentfarbe abhängig, damit die Kuchen-Segmente immer klar unterscheidbar bleiben.
const MUSCLE_GROUP_COLORS = {
  Beine: '#7099c2', Rücken: '#c27b70', Brust: '#c2a970', Schultern: '#70c2ad',
  Arme: '#a070c2', Bauch: '#c27099', Sonstige: '#8a8e95'
};
// Individuell gewählte Muskelgruppen-Farbe (siehe openMuscleGroupColorPicker()) hat Vorrang
// vor der festen Standardpalette — genau wie currentAccentColor()/currentTileColor() für den
// globalen Akzent bzw. die Kachel-Rahmenfarbe.
function muscleGroupColor(group){
  const custom = plan.muscleGroupColors && plan.muscleGroupColors[group];
  return custom || MUSCLE_GROUP_COLORS[group] || '#8a8e95';
}
function buildPieChart(segments, displaySize, centerValue, centerLabel){
  const total = segments.reduce((a,s) => a + s.value, 0);
  if (!total) return '<div class="chart-empty">Noch keine Daten — nach den ersten geloggten Sätzen erscheint hier die Verteilung.</div>';
  const size = 220, outerR = 100, innerR = 62, cx = size/2, cy = size/2;
  const renderSize = displaySize || size;
  const toRad = a => (a * Math.PI) / 180;
  const point = (r, a) => [cx + r * Math.cos(toRad(a)), cy + r * Math.sin(toRad(a))];
  let angle = -90; // oben beginnen
  const gapDeg = 2.5; // schmale Lücke zwischen den Segmenten statt nahtlos aneinander
  const visible = segments.filter(s => s.value > 0);
  const arcSegment = (startAngle, endAngle, color) => {
    const large = (endAngle - startAngle) > 180 ? 1 : 0;
    const [x1o,y1o] = point(outerR, startAngle);
    const [x2o,y2o] = point(outerR, endAngle);
    const [x2i,y2i] = point(innerR, endAngle);
    const [x1i,y1i] = point(innerR, startAngle);
    return `<path d="M${x1o.toFixed(2)},${y1o.toFixed(2)} A${outerR},${outerR} 0 ${large} 1 ${x2o.toFixed(2)},${y2o.toFixed(2)} L${x2i.toFixed(2)},${y2i.toFixed(2)} A${innerR},${innerR} 0 ${large} 0 ${x1i.toFixed(2)},${y1i.toFixed(2)} Z" fill="${color}"/>`;
  };
  const paths = visible.map(s => {
    const fraction = s.value / total;
    const rawStart = angle, rawEnd = angle + fraction * 360;
    angle = rawEnd;
    // Ein einziges Segment mit 100% als EIN 360°-Arc-Pfad zeichnen zu wollen, ergäbe identische
    // Start-/Endpunkte — SVG lässt einen Arc mit gleichem Start-/Endpunkt komplett weg (per
    // Spec), der Ring würde also unsichtbar bleiben; deshalb hier in zwei Halbkreise aufgeteilt,
    // die zusammen den vollen Ring lückenlos ergeben (keine Segment-Lücke in diesem Sonderfall).
    if (visible.length === 1) return arcSegment(rawStart, rawStart + 180, s.color) + arcSegment(rawStart + 180, rawEnd, s.color);
    return arcSegment(rawStart + gapDeg/2, rawEnd - gapDeg/2, s.color);
  }).join('');
  const centerHTML = (centerValue != null) ? `
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="pie-center-value">${centerValue}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="pie-center-label">${centerLabel || ''}</text>
  ` : '';
  return `<svg viewBox="0 0 ${size} ${size}" width="${renderSize}" height="${renderSize}" role="img" aria-label="Muskelgruppen-Verteilung">${paths}${centerHTML}</svg>`;
}

