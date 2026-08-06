/* ---------------------------------------------------
   STATS (Gesamtwerte)
--------------------------------------------------- */
function totalTrainingSeconds(){
  return sessions.reduce((a,s)=> a + s.durationSec, 0);
}
function totalVolumeKg(){
  return sessions.reduce((a,s)=>
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
// 'month'/'year' sind ein ROLLIERENDES Zeitfenster (letzte 30/365 Tage, siehe
// statsPeriodToDays() weiter unten — derselbe Zeitraum-Filter wie beim Zeit-Donut auf
// demselben Screen), KEIN Kalendermonat/-jahr-Bucket. Innerhalb des Fensters bekommt jede
// Einheit ihren eigenen Punkt (vorher wurden alle Einheiten desselben Kalendermonats zu
// einem einzigen Punkt summiert — bei z. B. 3 Einheiten im selben Monat blieb dadurch nur
// 1 Punkt übrig und der Trend verschwand, obwohl der Hinweistext "ab der zweiten geloggten
// Einheit" etwas anderes verspricht).
function aggregateSessions(getValue, period){
  const days = statsPeriodToDays(period);
  const cutoff = days ? Date.now() - days * 86400000 : null;
  const sorted = sessions
    .filter(s => !cutoff || new Date(s.date).getTime() >= cutoff)
    .slice()
    .sort((a,b) => new Date(a.date) - new Date(b.date));
  if (period === 'total'){
    let running = 0;
    return sorted.map(s => { running += getValue(s); return { label: shortDate(s.date), value: running }; });
  }
  return sorted.map(s => ({ label: shortDate(s.date), value: getValue(s) }));
}

// Wie aggregateSessions(), aber NUR für die Muskelgruppen-Diagramme: Eine Session darf nur
// dann einen Datenpunkt für eine Muskelgruppe liefern, wenn diese Gruppe in der Session
// tatsächlich vorkam — sonst würde eine Session ohne z. B. Beinübungen als "0 kg"-Punkt in
// den Beine-Verlauf einfließen. Ein solcher Nullpunkt sieht in der Line-Chart wie ein
// Einbruch aus (und verfälscht das Delta in chartAccordionHTML, z. B. "-8.983 kg", obwohl die
// Gruppe einfach nicht trainiert wurde) statt korrekt als "keine Daten" behandelt zu werden.
// Maßgeblich ist NUR, ob die Muskelgruppe in der Session vorkam — nicht, ob dabei Gewicht
// bewegt wurde (reine Körpergewichtsübungen zählen als "trainiert", auch mit 0 kg Volumen).
function sessionTrainsGroup(s, group){
  return s.entries.some(e => {
    const planEx = plan.exercises.find(x => x.id === e.exerciseId);
    if (((planEx && planEx.muscleGroup) || 'Sonstige') !== group) return false;
    // Reicht nicht, dass der Eintrag existiert — er muss auch mindestens einen tatsächlich
    // ausgefüllten Satz haben (gleiche hasData-Prüfung wie computeExerciseMetrics()), sonst
    // zählt eine leere/übersprungene Übung im Session-Eintrag fälschlich als "trainiert" und
    // erzeugt einen 0-kg-Ausreißer im Muskelgruppen-Verlauf (siehe Rücken-Bug: Punkt sackt auf
    // 0 kg ab, obwohl die Gruppe an dem Tag schlicht nicht ausgeführt wurde).
    return computeExerciseMetrics(e, planEx).hasData;
  });
}
function aggregateSessionsForGroup(group, getValue, period){
  const days = statsPeriodToDays(period);
  const cutoff = days ? Date.now() - days * 86400000 : null;
  const sorted = sessions
    .filter(s => (!cutoff || new Date(s.date).getTime() >= cutoff) && sessionTrainsGroup(s, group))
    .slice()
    .sort((a,b) => new Date(a.date) - new Date(b.date));
  if (period === 'total'){
    let running = 0;
    return sorted.map(s => { running += getValue(s); return { label: shortDate(s.date), value: running }; });
  }
  return sorted.map(s => ({ label: shortDate(s.date), value: getValue(s) }));
}

let statsPeriod = 'month';
const PERIOD_LABELS = { month: 'Monat', year: 'Jahr', total: 'Insgesamt' };

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

  app.innerHTML = `
    <div class="back-row" style="margin-top:0;"><button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button></div>
    <div class="progress-summary" style="margin-top:18px;">
      <span>${sessions.length} ${sessions.length === 1 ? 'Einheit' : 'Einheiten'} gesamt</span>
      <span>Gesamt: ${totalLabel}</span>
    </div>
    <div class="period-row">
      ${Object.keys(PERIOD_LABELS).map(p => `
        <button class="period-btn ${statsPeriod === p ? 'active' : ''}" data-period="${p}">${PERIOD_LABELS[p]}</button>
      `).join('')}
    </div>
    ${chartAccordionHTML(statsChartOpen, 'main', title, chartPoints, color, formatter, buildLineChart(chartPoints, color, formatter))}
    ${widgetHTML}
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
  return sessions
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

  const priorSessions = sessions
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
function buildLineChart(points, color, valueFormatter){
  const fmt = valueFormatter || (v => v);
  if (!points.length) return '<div class="chart-empty">Noch keine Daten — nach der ersten geloggten Einheit erscheint hier der Verlauf.</div>';
  // Mit nur einem Punkt lässt sich kein Trend zeigen — der Punkt würde (Skala startet bei 0)
  // meist ganz oben im Diagramm landen und darunter nur gähnende Leere lassen. Ein kurzer
  // Hinweis statt eines fast leeren Achsenkreuzes ist an dieser Stelle klarer.
  if (points.length === 1) return '<div class="chart-empty">Noch zu wenig Daten für einen Verlauf — ab der zweiten geloggten Einheit erscheint hier der Trend.</div>';
  const w = 560, h = 150, padL = 8, padR = 8, padT = 20, padB = 24;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const values = points.map(p => p.value);
  const maxV = Math.max(...values);
  const minV = Math.min(0, Math.min(...values));
  const range = (maxV - minV) || 1;
  const stepX = points.length > 1 ? innerW/(points.length - 1) : 0;
  const coords = points.map((p,i) => ({
    x: padL + stepX*i,
    y: padT + innerH - ((p.value - minV)/range)*innerH,
    ...p
  }));
  const path = coords.map((c,i) => (i===0?'M':'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' ');
  const dots = coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="${color}"/>`).join('');
  const everyN = Math.max(1, Math.ceil(coords.length/6));
  // Erste/letzte Beschriftung an der Achse ausrichten statt zentriert auf den Punkt — sonst
  // ragt die Hälfte des Textes über den linken/rechten Rand der Zeichenfläche hinaus und wird
  // dort abgeschnitten (sichtbar z. B. beim allerersten Datum ganz links).
  const xLabels = coords.map((c,i) => {
    if (!(i % everyN === 0 || i === coords.length-1)) return '';
    const anchor = i === 0 ? 'start' : (i === coords.length-1 ? 'end' : 'middle');
    return `<text class="chart-label" x="${c.x.toFixed(1)}" y="${h-6}" text-anchor="${anchor}">${c.label}</text>`;
  }).join('');
  // Genau wie bei xLabels: erste/letzte Wert-Beschriftung an der Achse ausrichten statt
  // zentriert auf den Punkt — sonst ragt bei text-anchor:middle die Hälfte der Zahl über den
  // linken/rechten Rand der Zeichenfläche hinaus und wird dort abgeschnitten (sichtbar z. B.
  // als "18.606" → ".606" ganz links oder "3.140" → "3.14" ganz rechts im Diagramm).
  const valueLabels = coords.map((c,i) => {
    const anchor = i === 0 ? 'start' : (i === coords.length-1 ? 'end' : 'middle');
    return `<text class="chart-label" style="fill:${color};font-weight:700" x="${c.x.toFixed(1)}" y="${(c.y-8).toFixed(1)}" text-anchor="${anchor}">${fmt(c.value)}</text>`;
  }).join('');
  // Zwei dezente Hilfslinien zusätzlich zur Grundlinie, damit sich Werte grob einordnen lassen,
  // auch ohne an jedem einzelnen Punkt die Beschriftung lesen zu müssen.
  const gridLines = [0.33, 0.66].map(f =>
    `<line class="chart-grid" x1="${padL}" y1="${(padT+innerH*f).toFixed(1)}" x2="${w-padR}" y2="${(padT+innerH*f).toFixed(1)}"/>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="Verlaufsdiagramm">
    ${gridLines}
    <line class="chart-axis" x1="${padL}" y1="${padT+innerH}" x2="${w-padR}" y2="${padT+innerH}"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>
    ${dots}${valueLabels}${xLabels}
  </svg>`;
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

/* ---------- Interaktiver Donut mit Übungs-Drilldown (Muskelgruppen-Verteilung) ----------
   Nutzt dieselbe Geometrie wie buildPieChart (Größe 220, Außenradius 100, Innenradius 62),
   baut die Segmente aber als einzeln antippbare <path>-Elemente mit data-group, damit ein
   Klick per direkter DOM-Manipulation (siehe applyMuscleDonutSelection()) animiert werden
   kann — ein kompletter innerHTML-Neuaufbau würde jede CSS-Transition sofort abbrechen. */
const DONUT_SIZE = 220, DONUT_OUTER_R = 100, DONUT_INNER_R = 62, DONUT_CX = 110, DONUT_CY = 110, DONUT_GAP_DEG = 2.5;
function donutToRad(a){ return (a * Math.PI) / 180; }
function donutPoint(r, a){ return [DONUT_CX + r * Math.cos(donutToRad(a)), DONUT_CY + r * Math.sin(donutToRad(a))]; }
// Baut den Pfad für EIN Ringsegment zwischen zwei Winkeln — bei einem (fast) vollen Kreis
// (einziges Segment) in zwei Halbkreis-Teilpfade aufgeteilt, da ein 360°-Arc mit identischem
// Start-/Endpunkt sonst laut SVG-Spec komplett wegfällt (siehe buildPieChart weiter oben).
function donutArcPath(startAngle, endAngle){
  if (endAngle - startAngle >= 359.99){
    const mid = startAngle + (endAngle - startAngle) / 2;
    return donutArcPath(startAngle, mid) + ' ' + donutArcPath(mid, endAngle);
  }
  const large = (endAngle - startAngle) > 180 ? 1 : 0;
  const [x1o,y1o] = donutPoint(DONUT_OUTER_R, startAngle);
  const [x2o,y2o] = donutPoint(DONUT_OUTER_R, endAngle);
  const [x2i,y2i] = donutPoint(DONUT_INNER_R, endAngle);
  const [x1i,y1i] = donutPoint(DONUT_INNER_R, startAngle);
  return `M${x1o.toFixed(2)},${y1o.toFixed(2)} A${DONUT_OUTER_R},${DONUT_OUTER_R} 0 ${large} 1 ${x2o.toFixed(2)},${y2o.toFixed(2)} L${x2i.toFixed(2)},${y2i.toFixed(2)} A${DONUT_INNER_R},${DONUT_INNER_R} 0 ${large} 0 ${x1i.toFixed(2)},${y1i.toFixed(2)} Z`;
}
// Berechnet Start-/Endwinkel je Segment (inkl. Lücke) — wird sowohl beim ersten Aufbau als
// auch beim Aufteilen des angetippten Segments in Übungs-Unterabschnitte gebraucht, damit
// beide exakt dieselbe Position/Reihenfolge zugrunde legen.
function donutAngleRanges(segments){
  const total = segments.reduce((a,s) => a + s.value, 0);
  const visible = segments.filter(s => s.value > 0);
  if (!total || !visible.length) return [];
  let angle = -90;
  return visible.map(s => {
    const fraction = s.value / total;
    const rawStart = angle, rawEnd = angle + fraction * 360;
    angle = rawEnd;
    const startAngle = visible.length > 1 ? rawStart + DONUT_GAP_DEG/2 : rawStart;
    const endAngle = visible.length > 1 ? rawEnd - DONUT_GAP_DEG/2 : rawEnd;
    return { label: s.label, value: s.value, color: s.color, startAngle, endAngle };
  });
}
// Hellere/dunklere Abstufung der Muskelgruppen-Farbe für die Übungs-Unterabschnitte, damit sie
// erkennbar zur ausgewählten Muskelgruppe gehören, aber untereinander unterscheidbar bleiben.
function shadeMuscleColor(hex, index){
  const { h, s, v } = hexToHsv(hex);
  const dir = index % 2 === 0 ? 1 : -1;
  const magnitude = Math.ceil((index + 1) / 2);
  const newV = Math.min(94, Math.max(32, v + dir * magnitude * 13));
  const newS = Math.max(30, s - Math.min(index, 5) * 5);
  return hsvToHex(h, newS, newV);
}
function buildInteractiveDonut(segments, displaySize, metric, centerValue, centerLabel){
  const total = segments.reduce((a,s) => a + s.value, 0);
  if (!total) return '<div class="chart-empty">Noch keine Daten — nach den ersten geloggten Sätzen erscheint hier die Verteilung.</div>';
  const renderSize = displaySize || DONUT_SIZE;
  const ranges = donutAngleRanges(segments);
  const paths = ranges.map(r =>
    `<path class="donut-seg" data-group="${r.label}" data-metric="${metric}" fill="${r.color}" d="${donutArcPath(r.startAngle, r.endAngle)}"/>`
  ).join('');
  const centerHTML = `
    <g class="pie-center-group" id="pieCenterDefault-${metric}">
      <text x="${DONUT_CX}" y="${DONUT_CY - 4}" text-anchor="middle" class="pie-center-value">${centerValue}</text>
      <text x="${DONUT_CX}" y="${DONUT_CY + 16}" text-anchor="middle" class="pie-center-label">${centerLabel || ''}</text>
    </g>
    <g class="pie-center-group pie-center-hidden" id="pieCenterSelected-${metric}">
      <text x="${DONUT_CX}" y="${DONUT_CY - 4}" text-anchor="middle" class="pie-center-value" id="pieCenterSelectedValue-${metric}"></text>
      <text x="${DONUT_CX}" y="${DONUT_CY + 16}" text-anchor="middle" class="pie-center-label" id="pieCenterSelectedLabel-${metric}"></text>
    </g>
  `;
  return `<svg viewBox="0 0 ${DONUT_SIZE} ${DONUT_SIZE}" width="${renderSize}" height="${renderSize}" role="img" aria-label="Muskelgruppen-Verteilung" id="donutSvg-${metric}">${paths}${centerHTML}</svg>`;
}
// Ermittelt pro Übung die Sätze/das bewegte Gewicht innerhalb EINER Muskelgruppe — Grundlage
// für die Unterabschnitte im Donut sowie die Übungs-Übersicht darunter, wenn eine Muskelgruppe
// angetippt wird. Gleiche Zähl-/Ausschlusslogik wie computeMuscleGroupSetCounts()/
// computeMuscleGroupVolumeSums(), nur nach Übungsname statt Muskelgruppe aufgeschlüsselt.
function computeExerciseBreakdownForGroup(group, periodDays){
  const cutoff = periodDays ? Date.now() - periodDays * 86400000 : null;
  const map = {};
  sessions.forEach(s => {
    if (cutoff && new Date(s.date).getTime() < cutoff) return;
    s.entries.forEach(e => {
      const planEx = plan.exercises.find(x => x.id === e.exerciseId);
      const g = (planEx && planEx.muscleGroup) || 'Sonstige';
      if (g !== group) return;
      const validCount = e.type === 'time'
        ? (e.sets || []).filter(st => st.seconds !== null && st.seconds !== undefined).length
        : (e.sets || []).filter(st => st.reps !== null && st.reps !== undefined).length;
      const vol = (e.sets || []).reduce((a,st) => a + ((st.reps && st.weight) ? st.reps*effectiveSetWeight(planEx, st.weight) : 0), 0);
      if (!map[e.name]) map[e.name] = { name: e.name, sets: 0, volume: 0 };
      map[e.name].sets += validCount;
      map[e.name].volume += vol;
    });
  });
  return Object.values(map);
}

function sessionsPerMonth(){
  const buckets = new Map();
  sessions.slice().sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(s => {
    const d = new Date(s.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = d.toLocaleDateString('de-DE', { month: 'short' });
    const sortKey = d.getFullYear()*100 + d.getMonth();
    if (!buckets.has(key)) buckets.set(key, { label, count: 0, sortKey });
    buckets.get(key).count++;
  });
  return [...buckets.values()].sort((a,b) => a.sortKey - b.sortKey);
}

let workoutsFilterYear = 'all';
let workoutsFilterCategory = 'all';
let workoutsMonthOpen = new Set();
// Wird nur beim ALLERERSTEN Aufbau der Übersicht (pro Betreten des Screens) auf true gesetzt,
// nachdem die Standard-Klapplogik (siehe renderWorkoutsOverview) einmalig angewendet wurde.
// Verhindert den früheren Bug: ohne dieses Flag wurde bei jedem Neu-Rendern erneut geprüft
// "ist workoutsMonthOpen leer? dann aktuellsten Monat öffnen" — dadurch ließ sich der einzig
// offene Monat nie zuklappen, weil das Leeren des Sets ihn im selben Zug wieder befüllt hat.
let workoutsMonthOpenInitialized = false;
// Jahre, die als eine gemeinsame "Jahres-Kachel" zusammengefasst dargestellt werden (siehe
// Auto-Zusammenfass-Logik weiter unten) — einzeln wieder aufklappbar zur vollen Monatsansicht.
let workoutsYearCollapsed = new Set();

// Ermittelt für eine Kachel (Modus), ob sie einer der 5 festen Übungs-Klassifikationen
// (oberkoerper/unterkoerper/push/pull/legs) zugeordnet ist — modePoolFilter() liefert exakt
// eine davon oder 'all' (z. B. bei Ganzkörper oder einer Custom-Kategorie ohne engere
// Einschränkung). Wird gebraucht, um "Frei"-Einheiten anhand ihrer Übungen den passenden
// Kachel-Filtern zuzuordnen (siehe sessionMatchesFilter()).
function workoutsFilterClassKey(mode){
  const pf = modePoolFilter(mode);
  return pf === 'all' ? null : pf;
}
// Baut die Filter-Optionen NICHT mehr aus einer festen Liste (Oberkörper/Unterkörper/Push/Pull/
// Legs), sondern aus den tatsächlich in der Historie vorkommenden Kacheln (session.mode) — mit
// deren AKTUELLEM Anzeigenamen (modeDisplayLabel, berücksichtigt Umbenennungen und Custom-
// Kategorien). Kacheln, mit denen noch nie trainiert wurde, tauchen dadurch gar nicht erst auf.
// "Frei" bekommt nur dann eine eigene Option, wenn tatsächlich schon frei trainiert wurde — und
// steht (unabhängig von der sonstigen Kachel-Reihenfolge) IMMER ganz unten, mit eigener
// Bezeichnung "Freies Training" statt des rohen Kachel-Namens "frei" (MODE_LABELS kennt "frei"
// gar nicht, modeDisplayLabel() würde sonst nur die rohe id zurückgeben).
function workoutsFilterOptions(allSessions){
  const usedModes = [...new Set(allSessions.map(s => s.mode))];
  const order = allStartTileIds();
  const tileOptions = usedModes
    .filter(m => m !== 'frei')
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map(mode => ({ id: mode, label: modeDisplayLabel(mode) }));
  const options = [{ id: 'all', label: 'Alle' }, ...tileOptions];
  if (usedModes.includes('frei')) options.push({ id: 'frei', label: 'Freies Training' });
  return options;
}
// Prüft, ob eine Session zum gewählten Kachel-Filter passt: direkt, wenn die Session über genau
// diese Kachel gestartet wurde — ODER, falls die Session über "Frei" lief, zusätzlich anhand
// ihrer Übungen (mindestens eine Übung muss der Übungs-Klassifikation der gewählten Kachel
// angehören, siehe workoutsFilterClassKey()). Eine Ganzkörper-/Custom-Kachel ohne feste
// Klassifikation (classKey null) bekommt dadurch KEINE Frei-Einheiten zugelost — nur die 5
// festen Klassifikationen (oberkoerper/unterkoerper/push/pull/legs) sind dafür eindeutig genug.
function sessionMatchesFilter(session, filterId){
  if (filterId === 'all') return true;
  if (session.mode === filterId) return true;
  if (session.mode !== 'frei' || filterId === 'frei') return false;
  const classKey = workoutsFilterClassKey(filterId);
  if (!classKey) return false;
  return session.entries.some(e => {
    const planEx = plan.exercises.find(x => x.id === e.exerciseId);
    if (!planEx) return false;
    if (classKey === 'oberkoerper' || classKey === 'unterkoerper') return planEx.category === classKey;
    return planEx.bodyPart === classKey;
  });
}

function renderWorkoutsOverview(){
  const allSorted = sessions.slice().reverse();

  const years = [...new Set(allSorted.map(s => new Date(s.date).getFullYear()))].sort((a,b) => b-a);

  const filtered = allSorted.filter(s => {
    if (workoutsFilterYear !== 'all' && new Date(s.date).getFullYear() !== workoutsFilterYear) return false;
    if (!sessionMatchesFilter(s, workoutsFilterCategory)) return false;
    return true;
  });

  // Zweistufige Gruppierung: Jahr → Monat (statt nur Monat), damit sich ganze Jahre
  // zusammenfassen lassen (siehe workoutsYearCollapsed weiter unten).
  const yearGroups = [];
  filtered.forEach(s => {
    const year = new Date(s.date).getFullYear();
    let yg = yearGroups.find(yg => yg.year === year);
    if (!yg){ yg = { year, months: [] }; yearGroups.push(yg); }
    const label = monthLabel(s.date);
    let mg = yg.months.find(mg => mg.label === label);
    if (!mg){ mg = { label, sessions: [] }; yg.months.push(mg); }
    mg.sessions.push(s);
  });
  yearGroups.sort((a,b) => b.year - a.year);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthLabel = monthLabel(now.toISOString());

  // Einmalige Standardauswahl beim ersten Aufbau dieses Screens (siehe
  // workoutsMonthOpenInitialized): nur der jeweils aktuellste/neueste Monat startet
  // aufgeklappt, alle älteren Monate sind automatisch eingeklappt — und alle Jahre außer
  // dem aktuellen (bzw. dem neuesten vorhandenen, falls noch nie im laufenden Jahr trainiert
  // wurde) starten als zusammengefasste Jahres-Kachel. Ab dann übernimmt ausschließlich die
  // manuelle Klapp-Wahl der Person — kein erneutes automatisches Ein-/Zuklappen mehr, auch
  // nicht beim Umschalten der Filter, damit ein bewusst geöffneter älterer Monat offen bleibt.
  if (!workoutsMonthOpenInitialized && yearGroups.length){
    const newestYear = yearGroups[0].year;
    const newestMonthLabel = yearGroups[0].months[0] && yearGroups[0].months[0].label;
    if (newestMonthLabel) workoutsMonthOpen.add(newestMonthLabel);
    years.forEach(y => { if (y !== newestYear) workoutsYearCollapsed.add(y); });
    workoutsMonthOpenInitialized = true;
  }

  const workoutsFilterOptionsList = workoutsFilterOptions(allSorted);

  const bodyHTML = yearGroups.map(yg => {
    const totalSessions = yg.months.reduce((a,m) => a + m.sessions.length, 0);
    const monthsHTML = yg.months.map(mg => {
      const isOpen = workoutsMonthOpen.has(mg.label);
      return `
        <div class="muscle-group">
          <button class="muscle-group-header" data-month="${mg.label.replace(/"/g,'&quot;')}" type="button">
            <span class="mg-name">${mg.label}</span>
            <span class="mg-meta">${mg.sessions.length} Einheit${mg.sessions.length === 1 ? '' : 'en'} <span class="mg-arrow">${isOpen ? '▾' : '▸'}</span></span>
          </button>
          <div class="muscle-group-body" style="display:${isOpen ? 'block' : 'none'}">
            ${mg.sessions.map(historyRowHTML).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Nur wirklich VOLLSTÄNDIG abgeschlossene Kalenderjahre (Jahr < aktuelles Jahr) bekommen
    // eine eigene Jahres-Klammer zum Zusammenfassen — das laufende Jahr zeigt seine Monate
    // direkt, ohne umschließenden "2026"-Akkordeon-Kopf (der wäre bis Jahresende ohnehin immer
    // aufgeklappt und damit reine Redundanz), analog zur Monatsübersicht (yearAccordionHTML).
    if (yg.year >= currentYear) return monthsHTML;

    const yearIsCollapsed = workoutsYearCollapsed.has(yg.year);
    return `
      <button class="workouts-year-header" data-year="${yg.year}" type="button">
        <span class="mg-name">${yg.year}</span>
        <span class="mg-meta">${totalSessions} Einheit${totalSessions === 1 ? '' : 'en'} <span class="mg-arrow">${yearIsCollapsed ? '▸' : '▾'}</span></span>
      </button>
      <div class="workouts-year-body" style="display:${yearIsCollapsed ? 'none' : 'block'}">
        ${monthsHTML}
      </div>
    `;
  }).join('');

  app.innerHTML = `
    <div class="brand"><h1>Workouts</h1></div>
    <div class="back-row"><button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button></div>

    <div class="workouts-filter-row">
      <select class="workouts-filter-select" id="workoutsYearFilter">
        <option value="all" ${workoutsFilterYear === 'all' ? 'selected' : ''}>Alle Jahre</option>
        ${years.map(y => `<option value="${y}" ${workoutsFilterYear === y ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
      <select class="workouts-filter-select" id="workoutsCategoryFilter">
        ${workoutsFilterOptionsList.map(o => `<option value="${o.id}" ${workoutsFilterCategory === o.id ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
    </div>

    ${bodyHTML || `<div class="history-empty">${filtered.length === 0 && allSorted.length > 0 ? 'Keine Einheiten für diese Filter.' : 'Noch keine Einheit protokolliert.'}</div>`}
  `;

  document.getElementById('btnBack').onclick = () => history.back();
  document.getElementById('workoutsYearFilter').onchange = (e) => {
    workoutsFilterYear = e.target.value === 'all' ? 'all' : Number(e.target.value);
    renderWorkoutsOverview();
  };
  document.getElementById('workoutsCategoryFilter').onchange = (e) => {
    workoutsFilterCategory = e.target.value;
    renderWorkoutsOverview();
  };
  app.querySelectorAll('[data-month]').forEach(btn => {
    btn.onclick = () => {
      const m = btn.dataset.month;
      if (workoutsMonthOpen.has(m)) workoutsMonthOpen.delete(m); else workoutsMonthOpen.add(m);
      renderWorkoutsOverview();
    };
  });
  app.querySelectorAll('[data-year]').forEach(btn => {
    btn.onclick = () => {
      const y = Number(btn.dataset.year);
      if (workoutsYearCollapsed.has(y)) workoutsYearCollapsed.delete(y); else workoutsYearCollapsed.add(y);
      renderWorkoutsOverview();
    };
  });
  app.querySelectorAll('.history-row').forEach(row => {
    row.onclick = () => goSessionDetail(row.dataset.id);
  });
  wireHistoryLongPress();
}

let progressGroupOpen = new Set();

// Zählt protokollierte (also tatsächlich ausgefüllte) Sätze pro Muskelgruppe über alle
// Sessions — optional gefiltert auf die letzten periodDays Tage. Kardio-Übungen zählen
// bewusst nicht mit (keine "Muskelgruppe" im eigentlichen Sinn, siehe MUSCLE_GROUP_ORDER).
// Wie computeMuscleGroupSetCounts(), aber statt eines rollierenden periodDays-Fensters für
// eine beliebig übergebene Liste von Sessions (z. B. genau die Einheiten eines Kalendermonats
// im Monatsbericht, siehe computeMonthReportData) — gleiche Zähllogik, nur die Datenquelle
// unterscheidet sich.
function computeMuscleGroupSetCountsForSessions(sessionList){
  const counts = {};
  sessionList.forEach(s => {
    s.entries.forEach(e => {
      const planEx = plan.exercises.find(x => x.id === e.exerciseId);
      const g = (planEx && planEx.muscleGroup) || 'Sonstige';
      if (g === 'Kardio') return;
      const validCount = e.type === 'time'
        ? (e.sets || []).filter(st => st.seconds !== null && st.seconds !== undefined).length
        : (e.sets || []).filter(st => st.reps !== null && st.reps !== undefined).length;
      counts[g] = (counts[g] || 0) + validCount;
    });
  });
  return counts;
}
function computeMuscleGroupSetCounts(periodDays){
  const cutoff = periodDays ? Date.now() - periodDays * 86400000 : null;
  const counts = {};
  sessions.forEach(s => {
    if (cutoff && new Date(s.date).getTime() < cutoff) return;
    s.entries.forEach(e => {
      const planEx = plan.exercises.find(x => x.id === e.exerciseId);
      const g = (planEx && planEx.muscleGroup) || 'Sonstige';
      if (g === 'Kardio') return;
      // Bei Wiederholungs-Übungen zählt nur die Wdh.-Zahl als "gemacht" — bei
      // Eigenkörpergewicht-Übungen ohne Gewichtsfeld (z. B. Situps, noWeight: true) bleibt
      // weight für immer leer, ein zusätzlicher weight-Check würde solche Sätze hier fälschlich
      // ausschließen (siehe Bug-Report: "Bauch" fehlte trotz protokollierter Situps).
      const validCount = e.type === 'time'
        ? (e.sets || []).filter(st => st.seconds !== null && st.seconds !== undefined).length
        : (e.sets || []).filter(st => st.reps !== null && st.reps !== undefined).length;
      counts[g] = (counts[g] || 0) + validCount;
    });
  });
  return counts;
}

let muscleBalancePeriod = 'month';
// Aktuell aufgeklapptes Muskelgruppen-Segment im Donut ({ metric: 'sets'|'volume', group }) —
// jeweils nur EIN Segment über beide Diagramme hinweg gleichzeitig offen, damit Zustand und
// die gemeinsame Übungs-Übersicht darunter einfach bleiben. Wird beim Verlassen des Screens
// über resetAllAccordions() zurückgesetzt.
let muscleBalanceDrilldown = null;
// Referenz auf den aktuell registrierten document-Klick-Handler, der die aufgeklappte
// Übungs-Übersicht schließt, wenn irgendwo außerhalb geklickt wird — wird bei jedem
// renderMuscleBalance()-Aufruf zuerst entfernt und neu registriert, damit sich beim
// Zeitraum-Wechsel (kompletter Re-Render) keine mehrfachen Listener aufsummieren.
let muscleBalanceOutsideClickHandler = null;

// Bewegtes Gewicht (kg) pro Muskelgruppe — dieselbe Ausschluss-Logik wie totalVolumeKg():
// Sätze ohne reps/weight (Zeit-/Kardio-Übungen, noWeight-Übungen wie Situps ohne
// eingetragenes Zusatzgewicht) tragen automatisch 0 bei, ganz ohne Sonderfall-Code dafür.
function computeMuscleGroupVolumeSums(periodDays){
  const cutoff = periodDays ? Date.now() - periodDays * 86400000 : null;
  const sums = {};
  sessions.forEach(s => {
    if (cutoff && new Date(s.date).getTime() < cutoff) return;
    s.entries.forEach(e => {
      const planEx = plan.exercises.find(x => x.id === e.exerciseId);
      const g = (planEx && planEx.muscleGroup) || 'Sonstige';
      if (g === 'Kardio') return;
      const vol = (e.sets || []).reduce((a,st) => a + ((st.reps && st.weight) ? st.reps * effectiveSetWeight(planEx, st.weight) : 0), 0);
      if (vol > 0) sums[g] = (sums[g] || 0) + vol;
    });
  });
  return sums;
}
// Getrackte Übungszeit (siehe accrueExerciseTime()/timeSpentSec) je Muskelgruppe — anders als
// computeMuscleGroupSetCounts()/-VolumeSums() wird Kardio hier NICHT ausgeschlossen, da auch
// Kardio-Geräte reale Zeit auf dem Bildschirm brauchen und für "wo geht meine Trainingszeit
// hin" genauso zählen wie Kraftübungen.
function computeMuscleGroupTimeSums(periodDays){
  const cutoff = periodDays ? Date.now() - periodDays * 86400000 : null;
  const sums = {};
  sessions.forEach(s => {
    if (cutoff && new Date(s.date).getTime() < cutoff) return;
    s.entries.forEach(e => {
      const sec = e.timeSpentSec || 0;
      if (!sec) return;
      const planEx = plan.exercises.find(x => x.id === e.exerciseId);
      const g = (planEx && planEx.muscleGroup) || 'Sonstige';
      sums[g] = (sums[g] || 0) + sec;
    });
  });
  return sums;
}
// Übungs-Aufschlüsselung für den Zeit-Donut (analog computeExerciseBreakdownForGroup(), aber
// mit Gesamtzeit UND daraus abgeleitetem Durchschnitt pro Einheit, in der die Übung vorkam —
// die eigentlich gewünschte Kennzahl "wie lange brauche ich im Schnitt für Übung X").
function computeExerciseTimeBreakdownForGroup(group, periodDays){
  const cutoff = periodDays ? Date.now() - periodDays * 86400000 : null;
  const map = {};
  sessions.forEach(s => {
    if (cutoff && new Date(s.date).getTime() < cutoff) return;
    s.entries.forEach(e => {
      const sec = e.timeSpentSec || 0;
      if (!sec) return;
      const planEx = plan.exercises.find(x => x.id === e.exerciseId);
      const g = (planEx && planEx.muscleGroup) || 'Sonstige';
      if (g !== group) return;
      if (!map[e.name]) map[e.name] = { name: e.name, totalSec: 0, count: 0 };
      map[e.name].totalSec += sec;
      map[e.name].count += 1;
    });
  });
  return Object.values(map).map(m => ({ ...m, avgSec: m.count ? Math.round(m.totalSec / m.count) : 0 }));
}
// Muskelgruppen, in denen mindestens eine geloggte Übung überhaupt ein Gewichtsfeld hatte
// (also weder ein reiner Zeit-Satz wie Plank noch eine noWeight-Übung wie Situps war) — nur
// für diese Gruppen wird in der Legende "· X kg" mitangezeigt. Bei reinen Eigenkörpergewichts-
// bzw. Zeit-Übungen gab es gar kein Gewichtsfeld zum Ausfüllen; "0 kg" wäre dort irreführend,
// da nie 0 kg eingetragen wurden, sondern schlicht nichts eingetragen werden konnte.
function computeMuscleGroupsWithWeightField(periodDays){
  const cutoff = periodDays ? Date.now() - periodDays * 86400000 : null;
  const groups = new Set();
  sessions.forEach(s => {
    if (cutoff && new Date(s.date).getTime() < cutoff) return;
    s.entries.forEach(e => {
      if (e.type === 'time') return; // Zeit-Sätze haben nie ein Gewichtsfeld
      const planEx = plan.exercises.find(x => x.id === e.exerciseId);
      if (planEx && planEx.noWeight) return; // reines Eigenkörpergewicht ohne Gewichtsfeld
      const g = (planEx && planEx.muscleGroup) || 'Sonstige';
      if (g === 'Kardio') return;
      if ((e.sets || []).length) groups.add(g);
    });
  });
  return groups;
}
function renderMuscleBalance(){
  const periodDaysMap = { all: null, month: 30, quarter: 90 };
  const counts = computeMuscleGroupSetCounts(periodDaysMap[muscleBalancePeriod]);
  const totalSets = Object.values(counts).reduce((a,v) => a+v, 0);
  const setGroups = MUSCLE_GROUP_ORDER.filter(g => g !== 'Kardio' && counts[g]);
  const setSegments = setGroups.map(g => ({ label: g, value: counts[g], color: muscleGroupColor(g) }));

  const sums = computeMuscleGroupVolumeSums(periodDaysMap[muscleBalancePeriod]);
  const totalVolume = Object.values(sums).reduce((a,v) => a+v, 0);
  const volumeGroups = MUSCLE_GROUP_ORDER.filter(g => g !== 'Kardio' && sums[g]);
  const volumeSegments = volumeGroups.map(g => ({ label: g, value: sums[g], color: muscleGroupColor(g) }));

  // Eine gemeinsame Legende reicht (dieselben Muskelgruppen-Farben gelten für beide
  // Diagramme) — der Swatch zeigt jetzt statt einer reinen Farbfläche den Prozentanteil an
  // den GESAMTEN Sätzen (passend zum "Nach Sätzen"-Diagramm), in der jeweiligen
  // Muskelgruppen-Farbe eingefärbt statt sie nur als Fläche zu zeigen — bleibt dabei weiterhin
  // antippbar, um die Farbe zu ändern. Die Werte daneben zeigen weiterhin BEIDE Kennzahlen
  // (Sätze und kg) nebeneinander, damit klar bleibt, was zu welchem Diagramm gehört.
  const weightCapableGroups = computeMuscleGroupsWithWeightField(periodDaysMap[muscleBalancePeriod]);
  const legendGroups = MUSCLE_GROUP_ORDER.filter(g => g !== 'Kardio' && (counts[g] || sums[g]));
  const legendHTML = legendGroups.map(g => {
    const pct = totalSets ? Math.round((counts[g] || 0) / totalSets * 100) : 0;
    const volPct = totalVolume ? Math.round((sums[g] || 0) / totalVolume * 100) : 0;
    return `
    <div class="muscle-balance-legend-row">
      <button class="muscle-balance-swatch" data-mg-color="${g}" style="color:${muscleGroupColor(g)};" aria-label="Farbe für ${g} ändern (aktuell ${pct}% der Sätze, ${volPct}% des Gewichts)">${pct}%</button>
      <span class="muscle-balance-legend-label">${g}</span>
      <div class="muscle-balance-legend-values">
        <span class="muscle-balance-legend-value">${counts[g] || 0} Sätze</span>
        ${weightCapableGroups.has(g) ? `<span class="muscle-balance-legend-value muscle-balance-legend-subpct">${Math.round(sums[g] || 0).toLocaleString('de-DE')} kg · ${volPct}%</span>` : ''}
      </div>
    </div>
  `;
  }).join('');

  app.innerHTML = `
    <div class="back-row" style="margin-top:0;">
      <button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>
    <div class="period-row" style="margin:14px 0 12px;">
      <button class="period-btn ${muscleBalancePeriod === 'month' ? 'active' : ''}" data-mgperiod="month">30 Tage</button>
      <button class="period-btn ${muscleBalancePeriod === 'quarter' ? 'active' : ''}" data-mgperiod="quarter">90 Tage</button>
      <button class="period-btn ${muscleBalancePeriod === 'all' ? 'active' : ''}" data-mgperiod="all">Insgesamt</button>
    </div>
    <div class="muscle-balance-charts-row">
      <div class="muscle-balance-chart-col">
        <div class="section-label">Nach Sätzen</div>
        <div class="muscle-balance-chart-wrap">${buildInteractiveDonut(setSegments, 130, 'sets', totalSets.toLocaleString('de-DE'), 'Sätze')}</div>
        ${!totalSets ? '<div class="history-empty">Noch keine Daten.</div>' : ''}
      </div>
      <div class="muscle-balance-chart-col">
        <div class="section-label">Nach Gewicht (kg)</div>
        <div class="muscle-balance-chart-wrap">${buildInteractiveDonut(volumeSegments, 130, 'volume', Math.round(totalVolume).toLocaleString('de-DE'), 'kg')}</div>
        ${!totalVolume ? '<div class="history-empty">Noch keine Daten.</div>' : ''}
      </div>
    </div>
    <div class="muscle-balance-breakdown" id="exerciseBreakdown" style="display:none;">
      <div class="muscle-balance-breakdown-header">
        <span class="muscle-balance-breakdown-title" id="breakdownTitle"></span>
        <button class="muscle-balance-breakdown-close" id="breakdownClose" aria-label="Übungs-Übersicht schließen">✕</button>
      </div>
      <div class="muscle-balance-legend" id="breakdownList"></div>
    </div>
    <div class="muscle-balance-legend" id="mainLegend" style="margin-top:16px;">${legendHTML}</div>
  `;

  // Wandelt einen Klick auf ein Donut-Segment (Muskelgruppe) oder einen bereits geöffneten
  // Übungs-Unterabschnitt in den neuen Auswahlzustand um — Auswahl EINES Segments schließt
  // automatisch ein evtl. vorher offenes anderes, erneutes Antippen (auch eines Unterabschnitts
  // derselben Gruppe) klappt wieder zu.
  function toggleMuscleDonutSelection(metric, group){
    const isSame = muscleBalanceDrilldown && muscleBalanceDrilldown.metric === metric && muscleBalanceDrilldown.group === group;
    muscleBalanceDrilldown = isSame ? null : { metric, group };
    applyMuscleDonutSelection();
  }

  // Setzt beide Donuts + die Übungs-Übersicht anhand von muscleBalanceDrilldown neu — per
  // direkter DOM-Manipulation statt komplettem innerHTML-Neuaufbau, damit die CSS-Transitions
  // (Ein-/Ausgrauen, Center-Text-Wechsel, wachsende Unterabschnitte, Übersicht-Einblendung)
  // tatsächlich animiert ablaufen, statt bei jedem Tap abrupt zu springen.
  function applyMuscleDonutSelection(){
    const anySelected = !!muscleBalanceDrilldown;
    [['sets', setSegments, totalSets], ['volume', volumeSegments, totalVolume]].forEach(([metric, segments, metricTotal]) => {
      const svg = document.getElementById('donutSvg-' + metric);
      if (!svg) return;
      const ranges = donutAngleRanges(segments);
      const selected = (muscleBalanceDrilldown && muscleBalanceDrilldown.metric === metric) ? muscleBalanceDrilldown.group : null;
      // Läuft die Auswahl im JEWEILS ANDEREN Diagramm, wird dieses hier komplett ausgegraut
      // (Werte spielen dann keine Rolle mehr) statt nur die einzelnen Segmente zu dimmen.
      const chartWrap = svg.closest('.muscle-balance-chart-wrap');
      if (chartWrap) chartWrap.classList.toggle('donut-chart-dim', anySelected && !selected);

      svg.querySelectorAll('.donut-subseg').forEach(el => el.remove());
      ranges.forEach(r => {
        const path = Array.from(svg.querySelectorAll('.donut-seg:not(.donut-subseg)')).find(p => p.dataset.group === r.label);
        if (!path) return;
        path.classList.toggle('donut-seg-hidden', selected === r.label);
        path.classList.toggle('donut-seg-dim', !!selected && selected !== r.label);
      });

      const defaultCenter = document.getElementById('pieCenterDefault-' + metric);
      const selectedCenter = document.getElementById('pieCenterSelected-' + metric);
      if (defaultCenter) defaultCenter.classList.toggle('pie-center-hidden', !!selected);
      if (selectedCenter) selectedCenter.classList.toggle('pie-center-hidden', !selected);

      if (!selected) return;
      const range = ranges.find(r => r.label === selected);
      if (!range) return;

      const periodDays = periodDaysMap[muscleBalancePeriod];
      const breakdown = computeExerciseBreakdownForGroup(selected, periodDays)
        .map(e => ({ name: e.name, value: metric === 'sets' ? e.sets : e.volume }))
        .filter(e => e.value > 0)
        .sort((a,b) => b.value - a.value);
      const subTotal = breakdown.reduce((a,e) => a + e.value, 0);
      let a = range.startAngle;
      const gapDeg = breakdown.length > 1 ? 1.4 : 0;
      breakdown.forEach((ex, i) => {
        const fraction = subTotal ? ex.value / subTotal : 0;
        const rawEnd = a + fraction * (range.endAngle - range.startAngle);
        const startA = a + (i > 0 ? gapDeg/2 : 0);
        const endA = rawEnd - (i < breakdown.length - 1 ? gapDeg/2 : 0);
        a = rawEnd;
        const subPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        subPath.setAttribute('d', donutArcPath(startA, endA));
        subPath.setAttribute('fill', shadeMuscleColor(range.color, i));
        subPath.setAttribute('class', 'donut-seg donut-subseg');
        subPath.style.transitionDelay = (i * 35) + 'ms';
        subPath.onclick = () => toggleMuscleDonutSelection(metric, selected);
        svg.appendChild(subPath);
      });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        svg.querySelectorAll('.donut-subseg').forEach(el => el.classList.add('donut-subseg-in'));
      }));

      const selValueEl = document.getElementById('pieCenterSelectedValue-' + metric);
      const selLabelEl = document.getElementById('pieCenterSelectedLabel-' + metric);
      if (selValueEl && selLabelEl){
        const pct = metricTotal ? Math.round(range.value / metricTotal * 100) : 0;
        selValueEl.textContent = pct + '%';
        selLabelEl.textContent = selected;
      }
    });

    const mainLegend = document.getElementById('mainLegend');
    if (mainLegend) mainLegend.classList.toggle('dimmed', anySelected);

    const panel = document.getElementById('exerciseBreakdown');
    if (!panel) return;
    if (!muscleBalanceDrilldown){
      panel.classList.remove('open');
      setTimeout(() => { if (!muscleBalanceDrilldown) panel.style.display = 'none'; }, 260);
      return;
    }
    const { metric, group } = muscleBalanceDrilldown;
    const periodDays = periodDaysMap[muscleBalancePeriod];
    const breakdown = computeExerciseBreakdownForGroup(group, periodDays)
      .map(e => ({ name: e.name, value: metric === 'sets' ? e.sets : e.volume }))
      .filter(e => e.value > 0)
      .sort((a,b) => b.value - a.value);
    const subTotal = breakdown.reduce((a,e) => a + e.value, 0);
    const rows = breakdown.map((ex, i) => {
      const pct = subTotal ? Math.round(ex.value / subTotal * 100) : 0;
      const valueLabel = metric === 'sets' ? `${ex.value} Sätze` : `${Math.round(ex.value).toLocaleString('de-DE')} kg`;
      return `
        <div class="muscle-balance-legend-row">
          <span class="muscle-balance-swatch-static" style="color:${shadeMuscleColor(muscleGroupColor(group), i)};">${pct}%</span>
          <span class="muscle-balance-legend-label">${exerciseNameHTML(ex.name)}</span>
          <span class="muscle-balance-legend-value">${valueLabel}</span>
        </div>
      `;
    }).join('');
    document.getElementById('breakdownTitle').textContent = `${group} – nach Übungen (${metric === 'sets' ? 'Sätze' : 'Gewicht'})`;
    document.getElementById('breakdownList').innerHTML = rows || '<div class="history-empty">Keine Daten.</div>';
    panel.style.display = 'block';
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('open')));
  }

  document.getElementById('btnBack').onclick = () => history.back();
  app.querySelectorAll('[data-mgperiod]').forEach(btn => {
    btn.onclick = () => {
      muscleBalancePeriod = btn.dataset.mgperiod;
      muscleBalanceDrilldown = null;
      renderMuscleBalance();
    };
  });
  app.querySelectorAll('[data-mg-color]').forEach(btn => {
    btn.onclick = () => openMuscleGroupColorPicker(btn.dataset.mgColor);
  });
  app.querySelectorAll('.donut-seg[data-metric]').forEach(path => {
    path.onclick = () => toggleMuscleDonutSelection(path.dataset.metric, path.dataset.group);
  });
  const breakdownCloseBtn = document.getElementById('breakdownClose');
  if (breakdownCloseBtn) breakdownCloseBtn.onclick = () => { muscleBalanceDrilldown = null; applyMuscleDonutSelection(); };

  // Klick irgendwo außerhalb der aufgeklappten Übungs-Übersicht (und außerhalb der
  // Donut-Segmente/Legenden-Zeilen, die ihre eigene Toggle-Logik haben) schließt sie
  // ebenfalls — nicht nur der explizite ✕-Button.
  if (muscleBalanceOutsideClickHandler) document.removeEventListener('click', muscleBalanceOutsideClickHandler, true);
  muscleBalanceOutsideClickHandler = (ev) => {
    if (!muscleBalanceDrilldown) return;
    if (ev.target.closest('#exerciseBreakdown, .donut-seg, .muscle-balance-legend-row, [data-mg-color]')) return;
    muscleBalanceDrilldown = null;
    applyMuscleDonutSelection();
  };
  document.addEventListener('click', muscleBalanceOutsideClickHandler, true);

  // Stellt eine evtl. schon aktive Auswahl sofort wieder her (z. B. nach einem Neu-Rendern
  // durch einen Farbwechsel während eine Muskelgruppe gerade aufgeklappt ist) — ohne diesen
  // Aufruf bliebe der Donut nach so einem Neuaufbau wieder im unausgewählten Ausgangszustand.
  applyMuscleDonutSelection();
}

// Analog zu muscleBalanceDrilldown, aber ohne "metric" — hier gibt es nur EIN Diagramm
// (Zeit), daher reicht die Muskelgruppe allein als Auswahlzustand.
let timeBalanceDrilldown = null;
let timeBalanceOutsideClickHandler = null;
function fmtDurationCompact(sec){
  return sec >= 60 ? fmtDuration(sec) : `${sec}s`;
}
// Wandelt den Zeitraum-Wert des "Trainingszeit"-Screens (statsPeriod: 'month'/'year'/'total',
// dieselben Buttons wie beim Liniendiagramm oben auf dem Screen) in einen Cutoff in Tagen um —
// der Muskelgruppen-Zeit-Donut teilt sich bewusst DENSELBEN Zeitraum-Filter statt eigener
// 30/90-Tage-Buttons, damit auf dem Screen nur EIN Zeitraum-Konzept existiert.
function statsPeriodToDays(period){
  if (period === 'month') return 30;
  if (period === 'year') return 365;
  return null; // 'total'
}
// Baut die Muskelgruppen-Zeit-Donut-Sektion (Diagramm + Legende + Übungs-Übersicht) als
// zusätzliche Anzeige INNERHALB von renderStatsChart('time') — nutzt exakt dieselbe Donut-/
// Drilldown-Mechanik wie renderMuscleBalance() (buildInteractiveDonut, donutAngleRanges,
// shadeMuscleColor, Ein-/Ausgrauen bei Auswahl, Übungs-Übersicht darunter), aber ohne eigenen
// Zeitraum-Filter (siehe statsPeriodToDays() oben) und ohne eigenen Screen/Zurück-Button, da
// sie Teil des bestehenden Trainingszeit-Screens ist, dessen andere Diagramme unverändert
// erhalten bleiben.
function timeDonutSectionHTML(periodDays){
  const sums = computeMuscleGroupTimeSums(periodDays);
  const totalSec = Object.values(sums).reduce((a,v) => a+v, 0);
  const groups = MUSCLE_GROUP_ORDER.filter(g => sums[g]);
  Object.keys(sums).forEach(g => { if (!groups.includes(g)) groups.push(g); }); // z.B. "Sonstige"
  const segments = groups.map(g => ({ label: g, value: sums[g], color: muscleGroupColor(g) }));

  const legendHTML = groups.map(g => {
    const pct = totalSec ? Math.round(sums[g] / totalSec * 100) : 0;
    return `
    <div class="muscle-balance-legend-row">
      <button class="muscle-balance-swatch" data-mg-color="${g}" style="color:${muscleGroupColor(g)};" aria-label="Farbe für ${g} ändern (aktuell ${pct}% der Trainingszeit)">${pct}%</button>
      <span class="muscle-balance-legend-label">${g}</span>
      <div class="muscle-balance-legend-values">
        <span class="muscle-balance-legend-value">${fmtDurationCompact(sums[g])}</span>
      </div>
    </div>
  `;
  }).join('');

  return `
    <div class="section-label" style="margin-top:18px;">Nach Muskelgruppe (Zeit)</div>
    <div class="muscle-balance-charts-row">
      <div class="muscle-balance-chart-col" style="margin:0 auto;">
        <div class="muscle-balance-chart-wrap">${buildInteractiveDonut(segments, 170, 'time', fmtDurationCompact(totalSec), 'Zeit')}</div>
        ${!totalSec ? '<div class="history-empty">Noch keine Daten.</div>' : ''}
      </div>
    </div>
    <div class="muscle-balance-breakdown" id="exerciseBreakdown" style="display:none;">
      <div class="muscle-balance-breakdown-header">
        <span class="muscle-balance-breakdown-title" id="breakdownTitle"></span>
        <button class="muscle-balance-breakdown-close" id="breakdownClose" aria-label="Übungs-Übersicht schließen">✕</button>
      </div>
      <div class="muscle-balance-legend" id="breakdownList"></div>
    </div>
    <div class="muscle-balance-legend" id="mainLegend" style="margin-top:16px;">${legendHTML}</div>
  `;
}
// Bindet die Interaktion der obigen Sektion — wird von renderStatsChart('time') NACH dem
// Setzen von app.innerHTML aufgerufen, "onPeriodChanged" ist dabei einfach ein erneuter Aufruf
// von renderStatsChart('time') (gleiches Muster wie die period-btn-Handler dort), da der
// Zeitraum jetzt gemeinsam mit dem Liniendiagramm oben gesteuert wird.
function wireTimeDonutSection(periodDays, rerender){
  const sums = computeMuscleGroupTimeSums(periodDays);
  const totalSec = Object.values(sums).reduce((a,v) => a+v, 0);
  const groups = MUSCLE_GROUP_ORDER.filter(g => sums[g]);
  Object.keys(sums).forEach(g => { if (!groups.includes(g)) groups.push(g); });
  const segments = groups.map(g => ({ label: g, value: sums[g], color: muscleGroupColor(g) }));

  function toggleTimeDonutSelection(group){
    timeBalanceDrilldown = (timeBalanceDrilldown === group) ? null : group;
    applyTimeDonutSelection();
  }

  function applyTimeDonutSelection(){
    const svg = document.getElementById('donutSvg-time');
    if (!svg) return;
    const ranges = donutAngleRanges(segments);
    const selected = timeBalanceDrilldown;

    svg.querySelectorAll('.donut-subseg').forEach(el => el.remove());
    ranges.forEach(r => {
      const path = Array.from(svg.querySelectorAll('.donut-seg:not(.donut-subseg)')).find(p => p.dataset.group === r.label);
      if (!path) return;
      path.classList.toggle('donut-seg-hidden', selected === r.label);
      path.classList.toggle('donut-seg-dim', !!selected && selected !== r.label);
    });

    const defaultCenter = document.getElementById('pieCenterDefault-time');
    const selectedCenter = document.getElementById('pieCenterSelected-time');
    if (defaultCenter) defaultCenter.classList.toggle('pie-center-hidden', !!selected);
    if (selectedCenter) selectedCenter.classList.toggle('pie-center-hidden', !selected);
    const mainLegend = document.getElementById('mainLegend');
    if (mainLegend) mainLegend.classList.toggle('dimmed', !!selected);

    const panel = document.getElementById('exerciseBreakdown');
    if (!selected){
      if (panel) panel.classList.remove('open');
      setTimeout(() => { if (!timeBalanceDrilldown && panel) panel.style.display = 'none'; }, 250);
      return;
    }
    const range = ranges.find(r => r.label === selected);
    if (!range) return;

    // Sortiert nach GESAMTZEIT (wie die anderen Donuts), die Übungs-Übersicht selbst zeigt
    // pro Zeile zusätzlich die DURCHSCHNITTLICHE Dauer je Einheit (die eigentlich gewünschte
    // Kennzahl "wie lange brauche ich im Schnitt für Übung X").
    const breakdown = computeExerciseTimeBreakdownForGroup(selected, periodDays)
      .filter(e => e.totalSec > 0)
      .sort((a,b) => b.totalSec - a.totalSec);
    const subTotal = breakdown.reduce((a,e) => a + e.totalSec, 0);
    let a = range.startAngle;
    const gapDeg = breakdown.length > 1 ? 1.4 : 0;
    breakdown.forEach((ex, i) => {
      const fraction = subTotal ? ex.totalSec / subTotal : 0;
      const rawEnd = a + fraction * (range.endAngle - range.startAngle);
      const startA = a + (i > 0 ? gapDeg/2 : 0);
      const endA = rawEnd - (i < breakdown.length - 1 ? gapDeg/2 : 0);
      a = rawEnd;
      const subPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      subPath.setAttribute('d', donutArcPath(startA, endA));
      subPath.setAttribute('fill', shadeMuscleColor(range.color, i));
      subPath.setAttribute('class', 'donut-seg donut-subseg');
      subPath.style.transitionDelay = (i * 35) + 'ms';
      subPath.onclick = () => toggleTimeDonutSelection(selected);
      svg.appendChild(subPath);
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      svg.querySelectorAll('.donut-subseg').forEach(el => el.classList.add('donut-subseg-in'));
    }));

    const selValueEl = document.getElementById('pieCenterSelectedValue-time');
    const selLabelEl = document.getElementById('pieCenterSelectedLabel-time');
    if (selValueEl && selLabelEl){
      const pct = totalSec ? Math.round(range.value / totalSec * 100) : 0;
      selValueEl.textContent = pct + '%';
      selLabelEl.textContent = selected;
    }

    const rows = breakdown.map((ex, i) => {
      const pct = subTotal ? Math.round(ex.totalSec / subTotal * 100) : 0;
      return `
        <div class="muscle-balance-legend-row">
          <span class="muscle-balance-swatch-static" style="color:${shadeMuscleColor(range.color, i)};">${pct}%</span>
          <span class="muscle-balance-legend-label">${exerciseNameHTML(ex.name)}</span>
          <span class="muscle-balance-legend-value">Ø ${fmtDurationCompact(ex.avgSec)} · ${ex.count}x</span>
        </div>
      `;
    }).join('');
    document.getElementById('breakdownTitle').textContent = `${selected} – nach Übungen (Zeit)`;
    document.getElementById('breakdownList').innerHTML = rows || '<div class="history-empty">Keine Daten.</div>';
    if (panel){
      panel.style.display = 'block';
      requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('open')));
    }
  }

  app.querySelectorAll('[data-mg-color]').forEach(btn => {
    btn.onclick = () => openMuscleGroupColorPicker(btn.dataset.mgColor);
  });
  app.querySelectorAll('.donut-seg[data-metric="time"]').forEach(path => {
    path.onclick = () => toggleTimeDonutSelection(path.dataset.group);
  });
  const breakdownCloseBtn = document.getElementById('breakdownClose');
  if (breakdownCloseBtn) breakdownCloseBtn.onclick = () => { timeBalanceDrilldown = null; applyTimeDonutSelection(); };

  if (timeBalanceOutsideClickHandler) document.removeEventListener('click', timeBalanceOutsideClickHandler, true);
  timeBalanceOutsideClickHandler = (ev) => {
    if (!timeBalanceDrilldown) return;
    if (ev.target.closest('#exerciseBreakdown, .donut-seg, .muscle-balance-legend-row, [data-mg-color]')) return;
    timeBalanceDrilldown = null;
    applyTimeDonutSelection();
  };
  document.addEventListener('click', timeBalanceOutsideClickHandler, true);

  applyTimeDonutSelection();
}

function renderProgressList(){
  const names = [...new Set([
    ...plan.exercises.map(e => e.name),
    ...sessions.flatMap(s => s.entries.map(e => e.name))
  ])].filter(name => exerciseHistory(name).length > 0);

  const groups = {};
  names.forEach(name => {
    const ex = plan.exercises.find(e => e.name === name);
    const g = (ex && ex.muscleGroup) || 'Sonstige';
    (groups[g] = groups[g] || []).push(name);
  });
  const orderedGroups = MUSCLE_GROUP_ORDER.filter(g => groups[g]);
  Object.keys(groups).forEach(g => { if (!orderedGroups.includes(g)) orderedGroups.push(g); });

  const rows = orderedGroups.map(g => {
    const groupNames = groups[g];
    const isOpen = progressGroupOpen.has(g);
    const itemsHTML = groupNames.map(name => {
      const hist = exerciseHistory(name);
      const last = hist[hist.length - 1];
      const meta = `${hist.length} x · zuletzt ${last.isTime ? fmtSec(last.maxSeconds) : last.maxWeight + ' kg'}`;
      return `
        <div class="progress-row" data-name="${name}" role="button" tabindex="0">
          <div>
            <div class="progress-name">${exerciseNameHTML(name)}</div>
            <div class="progress-meta">${meta}</div>
          </div>
          <span class="progress-chevron">›</span>
        </div>`;
    }).join('');
    return `
      <div class="muscle-group">
        <button class="muscle-group-header" data-group="${g}" type="button">
          <span class="mg-name">${g}</span>
          <span class="mg-meta">${groupNames.length} Übung${groupNames.length === 1 ? '' : 'en'} <span class="mg-arrow">${isOpen ? '▾' : '▸'}</span></span>
        </button>
        <div class="muscle-group-body" style="display:${isOpen ? 'block' : 'none'}">
          ${itemsHTML}
        </div>
      </div>
    `;
  }).join('');

  app.innerHTML = `
    <div class="back-row" style="margin-top:0;">
      <button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>
    <div class="stats-row" style="margin-top:18px;">
      <div class="stat-card" id="cardTimeStats" role="button" tabindex="0">
        <div class="stat-value-row"><span class="stat-value">${fmtDuration(totalTrainingSeconds())}</span></div>
        <div class="stat-label">Trainingszeit gesamt</div>
      </div>
      <div class="stat-card" id="cardWeightStats" role="button" tabindex="0">
        <div class="stat-value-row">
          <span class="stat-value">${totalVolumeKg().toLocaleString('de-DE')}</span>
          <span class="stat-unit">kg</span>
        </div>
        <div class="stat-label">Bewegtes Gewicht gesamt</div>
      </div>
    </div>
    <button class="btn btn-ghost" id="cardMuscleBalance" style="margin-bottom:18px; text-align:left; display:flex; align-items:center; justify-content:space-between;">
      <span>Muskelgruppen-Verteilung</span><span class="progress-chevron">›</span>
    </button>
    ${rows || '<div class="history-empty">Noch keine Übung mit protokollierten Daten.</div>'}
    <button class="btn btn-ghost btn-icon-label" id="btnProgressExportPdf" style="margin-top:18px;">
      <svg class="btn-icon-label-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"></path><path d="M5 13v-8a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-6.5"></path><path d="M3 19h9"></path><path d="M9 16l3 3l-3 3"></path></svg>
      Als PDF exportieren
    </button>
  `;

  document.getElementById('btnBack').onclick = () => history.back();
  document.getElementById('cardTimeStats').onclick = () => goStatsChart('time');
  document.getElementById('cardWeightStats').onclick = () => goStatsChart('weight');
  document.getElementById('cardMuscleBalance').onclick = () => goMuscleBalance();
  document.getElementById('btnProgressExportPdf').onclick = () => {
    let blob = null;
    try{ blob = buildProgressPdfBlob(); }catch(err){ blob = null; }
    if (blob){
      downloadBlob(blob, `trainingsplan-fortschritt-${new Date().toISOString().slice(0,10)}.pdf`);
    } else {
      alert('PDF-Export ist gerade nicht verfügbar (Bibliothek konnte nicht geladen werden). Bitte Internetverbindung prüfen und erneut versuchen.');
    }
  };
  app.querySelectorAll('.muscle-group-header').forEach(btn => {
    btn.onclick = () => {
      const g = btn.dataset.group;
      if (progressGroupOpen.has(g)) progressGroupOpen.delete(g); else progressGroupOpen.add(g);
      renderProgressList();
    };
  });
  app.querySelectorAll('.progress-row').forEach(row => {
    row.onclick = () => goProgressDetail(row.dataset.name);
  });
}

let exerciseProgressPeriod = 'month';

let exerciseProgressChartOpen = new Set();
// ---------- Statistik-Liste der Übungsdetailseite: entfernbar + per Drag umsortierbar ----------
// Standardreihenfolge der Statistik-Akkordeons — getrennt nach Kraft-/Gewichtsübungen ("weight")
// und Zeit-Übungen wie Plank ("time", siehe isTime-Zweig in renderExerciseProgress()).
const DEFAULT_PROGRESS_STAT_ORDER = {
  weight: ['maxWeight', 'cumulativeVolume', 'volume', 'volumeMax', 'volumeAvg', 'rm10Max', 'rm10Avg', 'rm1Max', 'rm1Avg', 'repsMax', 'repsAvg'],
  time: ['maxTime', 'totalTime']
};
// Generische Anzeigenamen der Statistiken — zentrale Quelle, damit dieselben Bezeichnungen sowohl
// in den Einstellungen (globale Grundauswahl) als auch im Bearbeiten-Popup einzelner Übungen
// (Override) verwendet werden.
const PROGRESS_STAT_LABELS = {
  weight: {
    maxWeight: 'Maximalgewicht je Einheit', cumulativeVolume: 'Bewegtes Gewicht (kumulativ)',
    volume: 'Trainingsvolumen je Einheit', volumeMax: 'Volumen Max (bester Satz)',
    volumeAvg: 'Volumen Ø', rm10Max: '10RM Max (geschätzt)', rm10Avg: '10RM Ø (geschätzt)',
    rm1Max: '1RM Max (geschätzt)', rm1Avg: '1RM Ø (geschätzt)', repsMax: 'Wdh Max je Einheit', repsAvg: 'Wdh Ø je Einheit'
  },
  time: {
    maxTime: 'Längste Haltezeit/Zeit je Einheit', totalTime: 'Gesamte Haltezeit/Zeit je Einheit'
  }
};
// Aktuell gültige Reihenfolge (gespeichert + per Drag angepasst, siehe wireProgressStatsReorder()),
// ergänzt um evtl. neue Statistik-Schlüssel, die darin noch fehlen (am Ende angehängt) — analog
// zu fullGroupOrder() für die Muskelgruppen-Reihenfolge im Übungs-Editor.
function progressStatsOrder(type){
  const stored = plan.progressStatsOrder && Array.isArray(plan.progressStatsOrder[type]) ? plan.progressStatsOrder[type] : null;
  const base = (stored && stored.length) ? stored.slice() : DEFAULT_PROGRESS_STAT_ORDER[type].slice();
  DEFAULT_PROGRESS_STAT_ORDER[type].forEach(k => { if (!base.includes(k)) base.push(k); });
  return base;
}
// Globale Grundauswahl (in den Einstellungen festgelegt) — gilt für ALLE Übungen dieser Art.
function progressStatsHidden(type){
  return (plan.progressStatsHidden && Array.isArray(plan.progressStatsHidden[type])) ? plan.progressStatsHidden[type] : [];
}
async function setProgressStatsOrder(type, order){
  plan.progressStatsOrder = plan.progressStatsOrder || {};
  plan.progressStatsOrder[type] = order;
  await saveJSON('plan', plan);
}
async function setProgressStatsHidden(type, hidden){
  plan.progressStatsHidden = plan.progressStatsHidden || {};
  plan.progressStatsHidden[type] = hidden;
  await saveJSON('plan', plan);
}
// Pro-Übung-Override (Bearbeiten-Popup auf der Übungsdetailseite): weicht NUR für diese eine
// Übung von der globalen Grundauswahl (Einstellungen) ab — anders als zuvor nicht mehr rein
// additiv (nur zusätzlich ausblenden), sondern in beide Richtungen: kann global sichtbare
// Statistiken für diese Übung abschalten UND global ausgeblendete für diese Übung wieder
// einschalten. Gespeichert als { [statKey]: true|false } — nur explizit umgeschaltete Keys
// stehen drin, alles andere folgt weiterhin der globalen Grundauswahl.
function progressStatsExerciseOverride(name){
  return (plan.progressStatsOverride && plan.progressStatsOverride[name]) ? plan.progressStatsOverride[name] : {};
}
async function setProgressStatsExerciseOverride(name, overrideObj){
  plan.progressStatsOverride = plan.progressStatsOverride || {};
  plan.progressStatsOverride[name] = overrideObj;
  await saveJSON('plan', plan);
}
// Effektive Sichtbarkeit einer Statistik für eine bestimmte Übung: Override (falls für diesen
// Key explizit gesetzt) schlägt die globale Grundauswahl.
function progressStatVisibleForExercise(type, name, key){
  const override = progressStatsExerciseOverride(name);
  if (Object.prototype.hasOwnProperty.call(override, key)) return !!override[key];
  return !progressStatsHidden(type).includes(key);
}


// Öffnet ein Popup mit ALLEN Statistiken dieser Übungsart (auch den in den Einstellungen global
// ausgeblendeten) als kompakte Checkbox-Liste — hier lässt sich NUR für diese eine Übung von der
// globalen Grundauswahl abweichen, in beide Richtungen: global sichtbare abschalten UND global
// ausgeblendete für diese Übung wieder einschalten (plan.progressStatsOverride, siehe
// progressStatVisibleForExercise()). Kein max-height:none mehr auf dem Modal (wie zuvor) — bei
// bis zu 11 Zeilen (Gewichtsübungen) muss der Standard-Scrollbereich
// (.new-exercise-modal-body{overflow-y:auto}, siehe CSS) greifen können, sonst ragt die Liste
// unscrollbar über den Bildschirmrand hinaus.
function openProgressStatsEditPrompt(type, order, labels, exerciseName, onToggle){
  const existing = document.getElementById('progressStatsEditOverlay');
  if (existing) existing.remove();

  const rowsHTML = order.map(key => {
    const isVisible = progressStatVisibleForExercise(type, exerciseName, key);
    return `
      <button class="stat-toggle-row ${isVisible ? 'checked' : ''}" data-stat-toggle="${key}" type="button" role="switch" aria-checked="${isVisible}">
        <span class="stat-toggle-check">✓</span>
        <span>${labels[key] || key}</span>
      </button>
    `;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'progressStatsEditOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">Statistiken auswählen</div>
        <button class="add-exercise-modal-close" id="progressStatsEditClose" aria-label="Schließen">✕</button>
      </div>
      <div class="new-exercise-modal-body">
        <div class="history-empty" style="margin-bottom:2px; padding:0 2px; text-align:left; background:none; border:none;">
          <span style="font-size:11px; color:var(--muted);">Gilt nur für diese Übung. Die Grundauswahl für alle Übungen legst du in den Einstellungen fest.</span>
        </div>
        ${rowsHTML}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(remove);

  function remove(){ const el = document.getElementById('progressStatsEditOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); };
  document.getElementById('progressStatsEditClose').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
  overlay.querySelectorAll('[data-stat-toggle]').forEach(btn => {
    btn.onclick = async () => {
      const key = btn.dataset.statToggle;
      const willBeOn = !btn.classList.contains('checked');
      const override = { ...progressStatsExerciseOverride(exerciseName), [key]: willBeOn };
      await setProgressStatsExerciseOverride(exerciseName, override);
      btn.classList.toggle('checked', willBeOn);
      btn.setAttribute('aria-checked', String(willBeOn));
      onToggle();
    };
  });
}

// Long-Press-Drag zum Umsortieren der Statistik-Akkordeons (analog wireMuscleGroupReorder(),
// siehe dort für die Basis-Choreografie: 350ms halten armiert den Drag, danach per
// window-weiten Pointer-Listenern weiterziehen; kurzes Antippen klappt stattdessen auf/zu).
// Scrollen während des Wartens auf den Long-Press läuft über manuelles window.scrollBy() (NICHT
// über natives touch-action:pan-y — das wurde hier zwischenzeitlich versucht für butterweiches
// Momentum-Scrollen, aber touch-action:pan-y erlaubt dem Browser, direkt im Compositor-Thread zu
// scrollen OHNE auf JavaScript zu warten; dadurch konnte er mitten im bereits laufenden Drag
// plötzlich doch die Kontrolle übernehmen — die Seite sprang weg, teils bis zum Pull-to-refresh
// am oberen Rand, komplett unabhängig davon, ob onMove() noch preventDefault() aufruft. touch-
// action:none zwingt den Browser, jede Bewegung zuerst durch JS laufen zu lassen — Drag-
// Zuverlässigkeit geht hier klar vor nativer Scroll-Anmutung).
// WICHTIG: opts.rerender darf NUR den Inhalt von containerSelector selbst neu aufbauen (z. B.
// container.innerHTML = ...), NICHT die komplette Seite (app.innerHTML) — sonst wird das hier
// oben per document.querySelector() eingefangene container-Element beim Armieren des Drags
// (rerender() läuft synchron beim Öffnen aller Akkordeons) durch ein neues, unverbundenes
// Element ersetzt und alle folgenden Pointer-Updates greifen ins Leere (Ursache für "Drag &
// Drop funktioniert nicht").
function wireProgressStatsReorder(containerSelector, opts){
  const LONG_PRESS_MS = 350;
  const MOVE_CANCEL_PX = 18;
  const container = document.querySelector(containerSelector);
  if (!container) return;

  container.querySelectorAll(':scope > .muscle-group > .muscle-group-header').forEach(header => {
    const key = header.dataset.group;
    let pressTimer = null, pointerId = null;
    let startX = 0, startY = 0, lastX = 0, lastY = 0;
    let mode = 'pending';
    let fromIndex = -1, targetIndex = -1, rowHeight = 0, dragEl = null, visibleOrder = null;

    const cleanupListeners = () => {
      clearTimeout(pressTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const dyStep = ev.clientY - lastY;
      lastX = ev.clientX; lastY = ev.clientY;

      if (mode === 'pending'){
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX){
          mode = 'scrolling';
          clearTimeout(pressTimer);
          window.scrollBy(0, -dyStep);
        }
        return;
      }
      if (mode === 'scrolling'){ window.scrollBy(0, -dyStep); return; }
      if (mode !== 'dragging' || !dragEl) return;
      ev.preventDefault();
      const dy = ev.clientY - startY;
      dragEl.style.transform = `translateY(${dy}px) scale(1.01)`;
      dragEl.style.boxShadow = '0 8px 16px rgba(0,0,0,0.4)';
      const shift = Math.round(dy / rowHeight);
      const newTarget = Math.max(0, Math.min(visibleOrder.length - 1, fromIndex + shift));
      if (newTarget !== targetIndex){
        targetIndex = newTarget;
        const groupEls = Array.from(container.querySelectorAll(':scope > .muscle-group'));
        groupEls.forEach((t, i) => {
          if (t === dragEl) return;
          let offset = 0;
          if (fromIndex < targetIndex && i > fromIndex && i <= targetIndex) offset = -rowHeight;
          else if (fromIndex > targetIndex && i < fromIndex && i >= targetIndex) offset = rowHeight;
          t.style.transform = offset ? `translateY(${offset}px)` : '';
        });
      }
    };

    const onUp = (ev) => {
      if (ev.pointerId !== pointerId) return;
      cleanupListeners();
      if (mode === 'dragging' && dragEl){
        const groupEls = Array.from(container.querySelectorAll(':scope > .muscle-group'));
        groupEls.forEach(t => { t.style.transform=''; t.style.transition=''; t.style.boxShadow=''; t.style.zIndex=''; });
        if (targetIndex !== fromIndex && visibleOrder){
          const arr = visibleOrder.slice();
          const [moved] = arr.splice(fromIndex, 1);
          arr.splice(targetIndex, 0, moved);
          opts.commitOrder(arr);
        } else {
          opts.rerender();
        }
      } else if (mode !== 'scrolling'){
        if (opts.openSet.has(key)) opts.openSet.delete(key); else opts.openSet.add(key);
        opts.rerender();
      }
    };
    const onCancel = (ev) => { if (ev.pointerId !== pointerId) return; cleanupListeners(); };

    header.addEventListener('pointerdown', (e) => {
      pointerId = e.pointerId;
      startX = e.clientX; startY = e.clientY; lastX = startX; lastY = startY;
      mode = 'pending'; fromIndex = -1; targetIndex = -1; dragEl = null; visibleOrder = null;

      pressTimer = setTimeout(() => {
        if (mode !== 'pending') return;
        opts.openSet.clear();
        opts.rerender();
        const freshHeader = container.querySelector(`.muscle-group-header[data-group="${CSS.escape(key)}"]`);
        dragEl = freshHeader ? freshHeader.closest('.muscle-group') : null;
        if (!dragEl) return;
        visibleOrder = Array.from(container.querySelectorAll(':scope > .muscle-group'))
          .map(g => g.querySelector('.muscle-group-header').dataset.group);
        fromIndex = visibleOrder.indexOf(key);
        targetIndex = fromIndex;
        mode = 'dragging';
        dragEl.style.transition = 'none';
        dragEl.style.zIndex = 5;
        rowHeight = dragEl.getBoundingClientRect().height + 10;
        Array.from(container.querySelectorAll(':scope > .muscle-group')).forEach(t => { if (t !== dragEl) t.style.transition = 'transform .18s ease'; });
        if (navigator.vibrate) navigator.vibrate(10);
      }, LONG_PRESS_MS);

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    });
  });
}

function renderExerciseProgress(name){
  const hist = exerciseHistory(name);
  const planExForName = plan.exercises.find(e => e.name === name);
  const isTime = hist.length ? hist[0].isTime : (planExForName?.type === 'time');
  const period = exerciseProgressPeriod;
  const agg = (key) => aggregateHistoryPoints(hist.map(h => ({ date: h.date, value: h[key] })), period)
    .map(p => ({ label: p.label || shortDate(p.date), value: p.value }));

  // chartsMap enthält bewusst Bau-Funktionen statt fertigem HTML: chartAccordionHTML() liest
  // isOpen live aus exerciseProgressChartOpen aus, daher müssen die Akkordeons bei jedem
  // Auf-/Zuklappen bzw. Umsortieren frisch aufgebaut werden (siehe statsListHTML() unten) statt
  // eine beim ersten Render eingefrorene HTML-Zeichenkette wiederzuverwenden.
  let summaryLine, chartsMap, statType, labels;
  if (isTime){
    statType = 'time';
    const points = agg('maxSeconds');
    const totalPoints = agg('totalSeconds');
    const best = hist.length ? Math.max(...hist.map(h => h.maxSeconds)) : 0;
    summaryLine = `Bestwert: ${fmtSec(best)}`;
    labels = PROGRESS_STAT_LABELS.time;
    chartsMap = {
      maxTime: () => chartAccordionHTML(exerciseProgressChartOpen, 'maxTime', labels.maxTime, points, cssVar('--accent'), fmtSec, buildLineChart(points, cssVar('--accent'), fmtSec)),
      totalTime: () => chartAccordionHTML(exerciseProgressChartOpen, 'totalTime', labels.totalTime, totalPoints, cssVar('--accent'), fmtSec, buildLineChart(totalPoints, cssVar('--accent'), fmtSec))
    };
  } else {
    statType = 'weight';
    // Bei reinen Körpergewichtsübungen (noWeight ODER bodyweightExercise) OHNE jemals
    // eingetragenes Zusatzgewicht ergeben Gewicht-/Volumen-/RM-Werte keinen Sinn (wären nur
    // das konstante Körpergewicht) — dann werden nur die Wdh-Statistiken angezeigt. Sobald
    // irgendwann Zusatzgewicht eingetragen wurde, gelten wieder alle Statistiken normal.
    const bodyweightType = !!(planExForName && (planExForName.noWeight || planExForName.bodyweightExercise));
    const usesExtraWeight = !bodyweightType || hist.some(h => h.extraWeightMax > 0);
    const repsMaxPoints = agg('repsMax');
    const repsAvgPoints = agg('repsAvg').map(p => ({ ...p, value: Math.round(p.value * 10) / 10 }));
    labels = PROGRESS_STAT_LABELS.weight;
    chartsMap = {
      repsMax: () => chartAccordionHTML(exerciseProgressChartOpen, 'repsMax', labels.repsMax, repsMaxPoints, cssVar('--accent'), v => v.toLocaleString('de-DE'), buildLineChart(repsMaxPoints, cssVar('--accent'))),
      repsAvg: () => chartAccordionHTML(exerciseProgressChartOpen, 'repsAvg', labels.repsAvg, repsAvgPoints, cssVar('--accent'), v => v.toLocaleString('de-DE'), buildLineChart(repsAvgPoints, cssVar('--accent')))
    };
    if (usesExtraWeight){
      const weightPoints = agg('maxWeight');
      const volumePoints = agg('volume');
      const volumeMaxPoints = agg('volumeMax');
      const volumeAvgPoints = agg('volumeAvg').map(p => ({ ...p, value: Math.round(p.value * 10) / 10 }));
      const rm10MaxPoints = agg('rm10Max').map(p => ({ ...p, value: Math.round(p.value * 10) / 10 }));
      const rm10AvgPoints = agg('rm10Avg').map(p => ({ ...p, value: Math.round(p.value * 10) / 10 }));
      const rm1MaxPoints = agg('rm1Max').map(p => ({ ...p, value: Math.round(p.value * 10) / 10 }));
      const rm1AvgPoints = agg('rm1Avg').map(p => ({ ...p, value: Math.round(p.value * 10) / 10 }));
      // Läuft die aggregierten Volumen-Punkte einfach kumulativ auf — zeigt das INSGESAMT mit
      // dieser Übung bewegte Gewicht als stetig wachsende Linie, statt (wie volumePoints) nur
      // das Volumen der jeweils einzelnen Einheit/Periode.
      let runningTotal = 0;
      const cumulativeVolumePoints = volumePoints.map(p => { runningTotal += p.value; return { ...p, value: Math.round(runningTotal) }; });
      Object.assign(chartsMap, {
        maxWeight: () => chartAccordionHTML(exerciseProgressChartOpen, 'maxWeight', labels.maxWeight, weightPoints, cssVar('--accent'), v => v.toLocaleString('de-DE') + ' kg', buildLineChart(weightPoints, cssVar('--accent'))),
        cumulativeVolume: () => chartAccordionHTML(exerciseProgressChartOpen, 'cumulativeVolume', labels.cumulativeVolume, cumulativeVolumePoints, cssVar('--accent'), v => v.toLocaleString('de-DE') + ' kg', buildLineChart(cumulativeVolumePoints, cssVar('--accent'))),
        volume: () => chartAccordionHTML(exerciseProgressChartOpen, 'volume', labels.volume, volumePoints, cssVar('--accent'), v => v.toLocaleString('de-DE') + ' kg', buildLineChart(volumePoints, cssVar('--accent'))),
        volumeMax: () => chartAccordionHTML(exerciseProgressChartOpen, 'volumeMax', labels.volumeMax, volumeMaxPoints, cssVar('--accent'), v => v.toLocaleString('de-DE') + ' kg', buildLineChart(volumeMaxPoints, cssVar('--accent'))),
        volumeAvg: () => chartAccordionHTML(exerciseProgressChartOpen, 'volumeAvg', labels.volumeAvg, volumeAvgPoints, cssVar('--accent'), v => v.toLocaleString('de-DE') + ' kg', buildLineChart(volumeAvgPoints, cssVar('--accent'))),
        rm10Max: () => chartAccordionHTML(exerciseProgressChartOpen, 'rm10Max', labels.rm10Max, rm10MaxPoints, cssVar('--accent'), v => v.toLocaleString('de-DE') + ' kg', buildLineChart(rm10MaxPoints, cssVar('--accent'))),
        rm10Avg: () => chartAccordionHTML(exerciseProgressChartOpen, 'rm10Avg', labels.rm10Avg, rm10AvgPoints, cssVar('--accent'), v => v.toLocaleString('de-DE') + ' kg', buildLineChart(rm10AvgPoints, cssVar('--accent'))),
        rm1Max: () => chartAccordionHTML(exerciseProgressChartOpen, 'rm1Max', labels.rm1Max, rm1MaxPoints, cssVar('--accent'), v => v.toLocaleString('de-DE') + ' kg', buildLineChart(rm1MaxPoints, cssVar('--accent'))),
        rm1Avg: () => chartAccordionHTML(exerciseProgressChartOpen, 'rm1Avg', labels.rm1Avg, rm1AvgPoints, cssVar('--accent'), v => v.toLocaleString('de-DE') + ' kg', buildLineChart(rm1AvgPoints, cssVar('--accent')))
      });
      const best = hist.length ? Math.max(...hist.map(h => h.maxWeight)) : 0;
      summaryLine = `Bestwert: ${best} kg`;
    } else {
      const bestReps = hist.length ? Math.max(...hist.map(h => h.repsMax)) : 0;
      summaryLine = `Bestwert: ${bestReps} Wdh`;
    }
  }

  let order = progressStatsOrder(statType);
  // Baut nur den Inhalt von #exerciseStatsList frisch auf (nicht die ganze Seite) — wichtig für
  // wireProgressStatsReorder(), siehe Kommentar dort. Berücksichtigt sowohl die globale
  // Grundauswahl (Einstellungen) als auch den Pro-Übung-Override (openProgressStatsEditPrompt).
  function statsListHTML(){
    const visible = order.filter(k => chartsMap[k] && progressStatVisibleForExercise(statType, name, k));
    return visible.map(k => chartsMap[k]()).join('');
  }

  app.innerHTML = `
    <div class="brand">
      <h1>${exerciseNameHTML(name)}</h1>
    </div>
    <div class="back-row">
      <button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>
    <div class="progress-summary">
      <span>${hist.length} Einheiten</span>
      <span>${summaryLine}</span>
    </div>
    <div class="period-row">
      ${Object.keys(PERIOD_LABELS).map(p => `
        <button class="period-btn ${period === p ? 'active' : ''}" data-period="${p}">${PERIOD_LABELS[p]}</button>
      `).join('')}
    </div>
    <div id="exerciseStatsList">${statsListHTML()}</div>
    <button class="progress-stat-editbtn" id="progressStatsEditBtn" type="button" aria-label="Statistiken auswählen"><img src="${ICON_EDIT}" alt=""></button>
  `;

  document.getElementById('btnBack').onclick = () => history.back();
  app.querySelectorAll('.period-btn').forEach(btn => {
    btn.onclick = () => {
      exerciseProgressPeriod = btn.dataset.period;
      renderExerciseProgress(name);
    };
  });

  function refreshStatsList(){
    const el = document.getElementById('exerciseStatsList');
    if (!el) return;
    el.innerHTML = statsListHTML();
    wireStatsReorder();
  }
  function wireStatsReorder(){
    wireProgressStatsReorder('#exerciseStatsList', {
      openSet: exerciseProgressChartOpen,
      rerender: refreshStatsList,
      commitOrder: async (newVisibleOrder) => {
        order = [...newVisibleOrder, ...order.filter(k => !newVisibleOrder.includes(k))];
        await setProgressStatsOrder(statType, order);
        refreshStatsList();
      }
    });
  }
  wireStatsReorder();

  document.getElementById('progressStatsEditBtn').onclick = () => {
    openProgressStatsEditPrompt(statType, order, labels, name, refreshStatsList);
  };
}

