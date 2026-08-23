/* ---------------------------------------------------
   08b-stats-muscle-balance.js
   ---------------------------------------------------
   Teil 2/3 der ehemals einzelnen 08-stats-progress.js — reiner Dateigrößen-
   Split ohne inhaltliche Änderung, siehe Kopf von 08a-stats-progress-charts.js.
   Läuft nach 08a (nutzt buildPieChart/buildBarChart/muscleGroupColor von
   dort) und vor 08c.
   Inhalt: interaktiver Muskelgruppen-Donut mit Drilldown, Workouts-Übersicht
   (Filter/Gruppierung nach Monat), sowie renderMuscleBalance() inkl.
   Zeit-Donut-Abschnitt.
--------------------------------------------------- */
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
  // sessionsForStats(): als "Anderes Gym"/"Verletzt" markierte Einheiten fließen nicht in die
  // Muskelgruppen-Verteilung ein (siehe 04-utils.js).
  sessionsForStats().forEach(s => {
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
  // sessionsForStats(): als "Anderes Gym"/"Verletzt" markierte Einheiten fließen hier nicht ein.
  sessionsForStats().forEach(s => {
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
  // sessionsForStats(): als "Anderes Gym"/"Verletzt" markierte Einheiten fließen hier nicht ein.
  sessionsForStats().forEach(s => {
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
  // sessionsForStats(): als "Anderes Gym"/"Verletzt" markierte Einheiten fließen hier nicht ein.
  sessionsForStats().forEach(s => {
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
  // sessionsForStats(): als "Anderes Gym"/"Verletzt" markierte Einheiten fließen hier nicht ein.
  sessionsForStats().forEach(s => {
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
  // sessionsForStats(): als "Anderes Gym"/"Verletzt" markierte Einheiten fließen hier nicht ein.
  sessionsForStats().forEach(s => {
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
  if (period === 'week') return 7;
  if (period === 'month') return 30;
  if (period === 'quarter') return 90;
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

