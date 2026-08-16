/* ---------------------------------------------------
   08c-stats-progress-list.js
   ---------------------------------------------------
   Teil 3/3 der ehemals einzelnen 08-stats-progress.js — reiner Dateigrößen-
   Split ohne inhaltliche Änderung, siehe Kopf von 08a-stats-progress-charts.js.
   Läuft nach 08a/08b.
   Inhalt: renderProgressList(), die Sichtbarkeits-/Reihenfolge-Einstellungen
   der Progress-Kacheln, sowie renderExerciseProgress() (Detailseite je Übung).
--------------------------------------------------- */
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
    ${rpeEnabled() ? `
    <button class="btn btn-ghost" id="cardIntensityStats" style="margin-bottom:18px; text-align:left; display:flex; align-items:center; justify-content:space-between;">
      <span>Trainingsintensität (RPE)</span><span class="progress-chevron">›</span>
    </button>
    ` : ''}
    ${kcalEstimateEnabled() ? `
    <button class="btn btn-ghost" id="cardKcalStats" style="margin-bottom:18px; text-align:left; display:flex; align-items:center; justify-content:space-between;">
      <span>Kalorienverbrauch</span><span class="progress-chevron">›</span>
    </button>
    ` : ''}
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
  const cardIntensityStatsEl = document.getElementById('cardIntensityStats');
  if (cardIntensityStatsEl) cardIntensityStatsEl.onclick = () => goIntensityStats();
  const cardKcalStatsEl = document.getElementById('cardKcalStats');
  if (cardKcalStatsEl) cardKcalStatsEl.onclick = () => goKcalStats();
  document.getElementById('btnProgressExportPdf').onclick = async () => {
    await ensureJsPdfLoaded();
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
    .map(p => ({ label: p.label || shortDate(p.date), value: p.value, date: p.date }));

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
    wireLineCharts(el);
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
  wireLineCharts(app);

  document.getElementById('progressStatsEditBtn').onclick = () => {
    openProgressStatsEditPrompt(statType, order, labels, name, refreshStatsList);
  };
}

/* ---------------------------------------------------
   TRAININGSINTENSITÄT (RPE) — eigener Statistik-Screen
   ---------------------------------------------------
   Erreichbar von der Statistik-Übersicht (renderProgressList()) aus, gleich neben
   "Muskelgruppen-Verteilung" — nur sichtbar, wenn die RPE-Erfassung in den Einstellungen
   aktiv ist (rpeEnabled()), sonst gäbe es hier ohnehin nichts auszuwerten. Eigener
   Zeitraum-Zustand mit "Woche" als zusätzlicher Stufe (die anderen Zeitraum-Screens der App
   haben nur Monat/Quartal/Jahr/Insgesamt) — statsPeriodToDays() unterstützt 'week' bereits mit.
   Baut bewusst auf denselben, bereits etablierten Bausteinen auf statt eigene Optik zu
   erfinden: chartAccordionHTML/buildLineChart für den Verlauf (exakt wie Trainingszeit/
   Bewegtes Gewicht/Körpergewicht), und für die Verteilung auf die vier Intensitätsstufen
   dieselben .month-report-muscle-*-Klassen wie der gestapelte Balken in der Monatsbericht-
   Muskelgruppen-Karte (rein optisch generische Balken-/Legenden-Bausteine, keine inhaltliche
   Kopplung an Monatsberichte).
--------------------------------------------------- */
let intensityStatsPeriod = 'month';
const INTENSITY_PERIOD_LABELS = { week: 'Woche', month: 'Monat', quarter: 'Quartal', year: 'Jahr', total: 'Insgesamt' };
let intensityChartOpen = new Set();

function renderIntensityStats(){
  if (!rpeEnabled()) return goProgressList(false); // Sicherheitsnetz, falls über Zurück/Vorwärts erreicht, während RPE inzwischen deaktiviert wurde
  const days = statsPeriodToDays(intensityStatsPeriod);
  const cutoff = days ? Date.now() - days * 86400000 : null;
  const periodSessions = sessions.filter(s => !cutoff || new Date(s.date).getTime() >= cutoff);
  const overview = computeRpeOverview(periodSessions);
  const color = cssVar('--accent-2');

  // Ein Datenpunkt pro Einheit (Durchschnitts-RPE über alle in dieser Einheit erfassten Sätze),
  // nicht pro Einzelsatz — sonst würde der Verlauf bei mehreren Sätzen je Übung unlesbar dicht
  // und würde Schwankungen INNERHALB einer Einheit (z. B. härterer letzter Satz) zeigen statt
  // der eigentlich interessanten Frage: wie hart war die Einheit insgesamt im Vergleich zu
  // anderen Einheiten.
  const chartPoints = periodSessions
    .slice()
    .sort((a,b) => new Date(a.date) - new Date(b.date))
    .map(s => {
      const v = avgRpeForSessions([s]);
      return v == null ? null : { label: shortDate(s.date), value: v, date: s.date };
    })
    .filter(Boolean);

  const bandRowsHTML = overview ? overview.bands.filter(b => b.count > 0).map(b => `
    <div class="month-report-muscle-legend-item">
      <span class="month-report-muscle-dot" style="background:${b.color};"></span>
      <span class="month-report-muscle-legend-name">${b.label}</span>
      <span class="month-report-muscle-legend-pct">${b.pct}%</span>
    </div>
  `).join('') : '';
  const bandBarHTML = overview ? overview.bands.filter(b => b.count > 0).map(b =>
    `<div class="month-report-muscle-bar-seg" style="width:${b.pct}%; background:${b.color};"></div>`
  ).join('') : '';

  // sRPE-Trainingslast: letzte 8 Wochen als Balkendiagramm, plus Warnhinweis, wenn die
  // aktuelle Woche deutlich (>30%) über dem Schnitt der 4 Wochen davor liegt — ein simpler,
  // gängiger Frühindikator für zu schnell gesteigerte Belastung. Nutzt bewusst ALLE Sessions
  // (nicht nur periodSessions), da 8 Wochen Verlauf unabhängig vom oben gewählten
  // Zeitraum-Filter immer sinnvoll ist — sonst würde "Woche" hier nur 1 Balken zeigen.
  const weeklyLoad = computeWeeklyTrainingLoad(sessions, 8);
  const last = weeklyLoad[weeklyLoad.length - 1];
  const prev4 = weeklyLoad.slice(-5, -1);
  const prev4Avg = prev4.length ? prev4.reduce((a,w) => a+w.value, 0) / prev4.length : 0;
  const loadWarning = (last && prev4Avg > 0 && last.value > prev4Avg * 1.3);
  const weeklyLoadHTML = weeklyLoad.some(w => w.value > 0) ? `
    <div class="month-report-card" style="margin-top:14px;">
      <div class="month-report-card-title">Trainingslast (sRPE)</div>
      ${buildBarChart(weeklyLoad, color, true, 120)}
      ${loadWarning ? `<div class="history-empty" style="margin-top:8px; padding:8px 4px; text-align:left; background:none; border:none;"><span style="font-size:11px; color:var(--accent-2);">Diese Woche deutlich höher als der Schnitt der letzten 4 Wochen — im Blick behalten.</span></div>` : ''}
    </div>
  ` : '';

  // Ermüdungskurve: Ø RPE nach Satz-Position innerhalb einer Übung, über den gewählten Zeitraum.
  const fatiguePoints = computeRpeFatigueBySetIndex(periodSessions);
  const fatigueHTML = fatiguePoints.length >= 2 ? `
    <div class="month-report-card" style="margin-top:14px;">
      <div class="month-report-card-title">Ermüdung im Satzverlauf</div>
      ${buildBarChart(fatiguePoints, color, true, 120)}
    </div>
  ` : '';

  // RPE je Muskelgruppe — dieselbe Legenden-Optik wie die Intensitäts-Verteilung oben, nur
  // ohne Prozent-Balken (hier ist der Ø-Wert selbst die Aussage, keine Anteile).
  const muscleRpe = computeRpeByMuscleGroup(periodSessions);
  const muscleRpeHTML = muscleRpe.length ? `
    <div class="month-report-card" style="margin-top:14px;">
      <div class="month-report-card-title">Ø Intensität je Muskelgruppe</div>
      ${muscleRpe.map(m => `
        <div class="month-report-highlight-row">
          <span class="month-report-highlight-label">${m.group}</span>
          <span class="month-report-highlight-value" style="color:${intensityBandForRpe(m.avg).color};">${fmtRpe(m.avg)}</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  // Härteste Übungen — Top 5, nur ab 3 erfassten RPE-Werten (siehe computeHardestExercises()).
  const hardest = computeHardestExercises(periodSessions, 3).slice(0, 5);
  const hardestHTML = hardest.length ? `
    <div class="month-report-card" style="margin-top:14px;">
      <div class="month-report-card-title">Härteste Übungen</div>
      ${hardest.map(h => `
        <div class="month-report-highlight-row">
          <span class="month-report-highlight-label">${h.name}</span>
          <span class="month-report-highlight-value" style="color:${intensityBandForRpe(h.avg).color};">${fmtRpe(h.avg)}</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  // Effizienz-Trend: bewegtes Gewicht pro RPE-Punkt je Einheit — der ehrlichste
  // Fortschrittsindikator aus diesen beiden Werten (mehr Gewicht bei gleicher empfundener
  // Anstrengung statt nur mehr Gewicht UND mehr Anstrengung).
  const efficiencyPoints = computeEfficiencyPoints(periodSessions);
  const efficiencyHTML = efficiencyPoints.length >= 2 ? chartAccordionHTML(
    intensityChartOpen, 'efficiency', 'Effizienz (kg je RPE-Punkt)', efficiencyPoints, color,
    v => v.toLocaleString('de-DE'), buildLineChart(efficiencyPoints, color, v => v.toLocaleString('de-DE'))
  ) : '';

  app.innerHTML = `
    <div class="back-row" style="margin-top:0;"><button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button></div>
    <div class="progress-summary" style="margin-top:18px;">
      <span>${overview ? overview.count + ' erfasste Sätze' : 'Noch keine RPE-Werte erfasst'}</span>
      ${overview ? `<span style="color:${intensityBandForRpe(overview.avg).color};">Ø ${fmtRpe(overview.avg)} · ${intensityBandForRpe(overview.avg).label}</span>` : ''}
    </div>
    <div class="period-row">
      ${Object.keys(INTENSITY_PERIOD_LABELS).map(p => `
        <button class="period-btn ${intensityStatsPeriod === p ? 'active' : ''}" data-period="${p}">${INTENSITY_PERIOD_LABELS[p]}</button>
      `).join('')}
    </div>
    ${chartAccordionHTML(intensityChartOpen, 'main', 'Verlauf je Einheit', chartPoints, color, fmtRpe, buildLineChart(chartPoints, color, fmtRpe, RPE_MIN - 0.5))}
    ${overview ? `
    <div class="month-report-card" style="margin-top:14px;">
      <div class="month-report-card-title">Verteilung</div>
      <div class="month-report-muscle-bar">${bandBarHTML}</div>
      <div class="month-report-muscle-legend">${bandRowsHTML}</div>
    </div>
    ` : `<div class="history-empty" style="margin-top:14px;">Für diesen Zeitraum liegen noch keine RPE-Werte vor.</div>`}
    ${weeklyLoadHTML}
    ${fatigueHTML}
    ${muscleRpeHTML}
    ${hardestHTML}
    ${efficiencyHTML}
  `;

  document.getElementById('btnBack').onclick = () => history.back();
  app.querySelectorAll('.period-btn').forEach(btn => {
    btn.onclick = () => {
      intensityStatsPeriod = btn.dataset.period;
      renderIntensityStats();
    };
  });
  app.querySelectorAll('[data-chartacc]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.chartacc;
      if (intensityChartOpen.has(key)) intensityChartOpen.delete(key); else intensityChartOpen.add(key);
      renderIntensityStats();
    };
  });
  wireLineCharts(app);
}

/* ---------------------------------------------------
   KALORIENVERBRAUCH — eigener Statistik-Screen
   ---------------------------------------------------
   Erreichbar von der Statistik-Übersicht aus, direkt neben "Trainingsintensität (RPE)" — nur
   sichtbar, wenn "Geschätzter Kalorienverbrauch" in den Einstellungen aktiv ist
   (kcalEstimateEnabled()), unabhängig davon ob schon konkrete Daten vorliegen (gleiches Prinzip
   wie beim RPE-Screen: hängt rein am Einstellungs-Schalter, nicht an "gibt es schon Werte").
   Anders als bei der Intensität wird hier NICHT gemittelt, sondern aufsummiert (kcal sind eine
   verbrauchte Menge, kein Zustand) — Gesamt- und Durchschnittswert im Kopf, Verlauf je Einheit
   im Diagramm darunter. estimateSessionKcal() liefert pro Einheit bereits null zurück, wenn kein
   Körpergewicht hinterlegt ist — solche Einheiten fallen hier einfach aus dem Diagramm/der
   Summe raus, statt mit einem Fehlerwert reinzurechnen.
--------------------------------------------------- */
let kcalStatsPeriod = 'month';
const KCAL_PERIOD_LABELS = { week: 'Woche', month: 'Monat', quarter: 'Quartal', year: 'Jahr', total: 'Insgesamt' };
let kcalChartOpen = new Set();

function renderKcalStats(){
  if (!kcalEstimateEnabled()) return goProgressList(false); // Sicherheitsnetz, falls über Zurück/Vorwärts erreicht, während die Funktion inzwischen deaktiviert wurde
  const days = statsPeriodToDays(kcalStatsPeriod);
  const cutoff = days ? Date.now() - days * 86400000 : null;
  const periodSessions = sessions.filter(s => !cutoff || new Date(s.date).getTime() >= cutoff);
  const color = '#e08b3a'; // warmer Farbton (Energie/Feuer-Assoziation), bewusst weder --accent-3 (Gewicht) noch --accent-2 (RPE) noch die frei wählbare --accent (Zeit), damit sich die drei "neuen" Statistik-Screens optisch unterscheiden

  const chartPoints = periodSessions
    .slice()
    .sort((a,b) => new Date(a.date) - new Date(b.date))
    .map(s => {
      const v = estimateSessionKcal(s);
      return v == null ? null : { label: shortDate(s.date), value: Math.round(v), date: s.date };
    })
    .filter(Boolean);

  const totalKcal = chartPoints.reduce((a,p) => a + p.value, 0);
  const avgKcal = chartPoints.length ? Math.round(totalKcal / chartPoints.length) : null;
  const kcalFormatter = v => Math.round(v).toLocaleString('de-DE');

  // kcal pro Minute je Trainingsart — sagt, wie "dicht" eine Trainingsart im Schnitt ist,
  // unabhängig von der Gesamtdauer (z. B. Laufband vs. klassisches Krafttraining).
  const perMinute = computeKcalPerMinuteByCategory(periodSessions);
  const perMinuteHTML = perMinute.length ? `
    <div class="month-report-card" style="margin-top:14px;">
      <div class="month-report-card-title">kcal pro Minute je Trainingsart</div>
      ${perMinute.map(c => `
        <div class="month-report-highlight-row">
          <span class="month-report-highlight-label">${c.label}</span>
          <span class="month-report-highlight-value">${c.perMinute.toLocaleString('de-DE')}</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  // Verbrauch je Muskelgruppe — dieselbe Balken-/Legenden-Optik wie die RPE-Verteilung im
  // Intensitäts-Screen, hier aber als Anteil am geschätzten Gesamtverbrauch des Zeitraums.
  const muscleKcal = computeKcalByMuscleGroup(periodSessions);
  const muscleKcalHTML = muscleKcal.length ? `
    <div class="month-report-card" style="margin-top:14px;">
      <div class="month-report-card-title">Verbrauch je Muskelgruppe</div>
      <div class="month-report-muscle-bar">${muscleKcal.map(m => `<div class="month-report-muscle-bar-seg" style="width:${m.pct}%; background:${muscleGroupColor(m.group)};"></div>`).join('')}</div>
      <div class="month-report-muscle-legend">
        ${muscleKcal.map(m => `
          <div class="month-report-muscle-legend-item">
            <span class="month-report-muscle-dot" style="background:${muscleGroupColor(m.group)};"></span>
            <span class="month-report-muscle-legend-name">${m.group}</span>
            <span class="month-report-muscle-legend-pct">${m.pct}%</span>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  // Trainingstage vs. Ruhetage: Ø kcal-Zufuhr gegenübergestellt — nur wenn der Essenstracker
  // aktiv ist, sonst gibt es keine Zufuhr-Seite zum Vergleichen. Braucht keinen geschätzten
  // Trainings-Verbrauch, nur die reine Ja/Nein-Info "war das ein Trainingstag" aus sessions.
  const trainingVsRest = isFoodTrackerEnabled() ? computeTrainingVsRestDayIntake(days || 36500) : null;
  const trainingVsRestHTML = (trainingVsRest && (trainingVsRest.trainingCount > 0 || trainingVsRest.restCount > 0)) ? `
    <div class="month-report-card" style="margin-top:14px;">
      <div class="month-report-card-title">Ø Zufuhr: Trainingstage vs. Ruhetage</div>
      ${trainingVsRest.trainingAvg != null ? `
      <div class="month-report-highlight-row">
        <span class="month-report-highlight-label">Trainingstage (${trainingVsRest.trainingCount})</span>
        <span class="month-report-highlight-value">${trainingVsRest.trainingAvg.toLocaleString('de-DE')} kcal</span>
      </div>` : ''}
      ${trainingVsRest.restAvg != null ? `
      <div class="month-report-highlight-row">
        <span class="month-report-highlight-label">Ruhetage (${trainingVsRest.restCount})</span>
        <span class="month-report-highlight-value">${trainingVsRest.restAvg.toLocaleString('de-DE')} kcal</span>
      </div>` : ''}
    </div>
  ` : '';

  app.innerHTML = `
    <div class="back-row" style="margin-top:0;"><button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button></div>
    <div class="progress-summary" style="margin-top:18px;">
      <span>${chartPoints.length ? chartPoints.length + ' Einheit' + (chartPoints.length === 1 ? '' : 'en') + ' mit Schätzung' : 'Noch keine Schätzung möglich'}</span>
      ${chartPoints.length ? `<span>Gesamt: ${kcalFormatter(totalKcal)} kcal${avgKcal != null ? ` · Ø ${kcalFormatter(avgKcal)}` : ''}</span>` : ''}
    </div>
    <div class="period-row">
      ${Object.keys(KCAL_PERIOD_LABELS).map(p => `
        <button class="period-btn ${kcalStatsPeriod === p ? 'active' : ''}" data-period="${p}">${KCAL_PERIOD_LABELS[p]}</button>
      `).join('')}
    </div>
    ${chartAccordionHTML(kcalChartOpen, 'main', 'Verlauf je Einheit', chartPoints, color, v => kcalFormatter(v) + ' kcal', buildLineChart(chartPoints, color, kcalFormatter))}
    ${!chartPoints.length ? `<div class="history-empty" style="margin-top:14px;">Für diesen Zeitraum liegt noch keine Schätzung vor — dafür muss unter Einstellungen → Körperdaten ein Körpergewicht hinterlegt sein.</div>` : ''}
    ${perMinuteHTML}
    ${muscleKcalHTML}
    ${trainingVsRestHTML}
  `;

  document.getElementById('btnBack').onclick = () => history.back();
  app.querySelectorAll('.period-btn').forEach(btn => {
    btn.onclick = () => {
      kcalStatsPeriod = btn.dataset.period;
      renderKcalStats();
    };
  });
  app.querySelectorAll('[data-chartacc]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.chartacc;
      if (kcalChartOpen.has(key)) kcalChartOpen.delete(key); else kcalChartOpen.add(key);
      renderKcalStats();
    };
  });
  wireLineCharts(app);
}

