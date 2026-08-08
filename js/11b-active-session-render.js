/* ---------------------------------------------------
   11b-active-session-render.js
   ---------------------------------------------------
   Teil 2/3 der ehemals einzelnen 11-active-session.js — reiner Dateigrößen-
   Split ohne inhaltliche Änderung, siehe Kopf von 11a-active-session.js.
   Läuft nach 11a, vor 11c. Enthält bewusst NUR eine einzige, sehr große
   Funktion (renderActive(), ~700 Zeilen) — die zentrale Render-Funktion der
   aktiven Trainingsseite ließ sich nicht sinnvoll weiter unterteilen, ohne
   sie selbst aufzubrechen, was das Risiko für Folgefehler deutlich erhöht
   hätte. Der Dateigrößen-Nutzen kommt hier rein aus der Trennung von 11a/11c.
--------------------------------------------------- */
function renderActive(){
  accrueExerciseTime();
  persistActiveSession();
  // Der Übungs-Bilderleiste (.thumb-strip) wird bei JEDEM renderActive() komplett neu aus dem
  // Template gebaut (app.innerHTML = ...) — ein frisches DOM-Element hat scrollLeft standardmäßig
  // wieder 0, wodurch die Leiste bei jedem Re-Render (Übung abhaken, Übung starten, Umsortieren,
  // Timer-Tick, etc.) sichtbar an den Anfang zurückspringt, auch wenn man selbst gar nicht
  // gewischt hat. Fix: Scroll-Position VOR dem Neuaufbau merken und danach 1:1 wiederherstellen —
  // die Leiste bewegt sich dadurch wirklich nur noch, wenn die Person selbst wischt (kein
  // automatisches Zurück- oder Vorspringen mehr).
  const prevStripEl = app.querySelector('.thumb-strip');
  const prevStripScrollLeft = prevStripEl ? prevStripEl.scrollLeft : null;
  if (active.currentIndex >= active.entries.length) active.currentIndex = Math.max(0, active.entries.length - 1);
  const ei = active.currentIndex;
  const entry = active.entries[ei];
  const currentPlanEx = entry ? plan.exercises.find(x => x.id === entry.exerciseId) : null;

  // Ein noch offener Performancemodus-Vorschlag gehört immer zur Übung, bei der er ausgelöst
  // wurde — wechselt man währenddessen die Übung (Kachel-Leiste), verwirft sich der Vorschlag
  // stillschweigend (die zugrunde liegenden Satz-Werte bleiben dabei unverändert).
  if (perfSuggestion && (perfSuggestion.entryIndex !== ei || !entry || perfSuggestion.setIndex >= entry.sets.length)){
    perfSuggestion = null;
  }
  maybeShowPerfSuggestion(entry, ei, currentPlanEx);

  const renderThumbButtonHTML = (e, i) => {
    const planEx = plan.exercises.find(x => x.id === e.exerciseId);
    const img = planEx && planEx.imageData;
    return `
    <button class="thumb ${i === ei ? 'active' : ''} ${isEntryDone(e) ? 'done' : ''}" data-thumb="${i}" aria-label="${e.name}">
      <span class="thumb-media">
        ${img ? `<img class="thumb-img" src="${img}" alt="">` : `<span class="thumb-initials">${initials(e.name)}</span>`}
      </span>
      ${isEntryDone(e) ? '<span class="thumb-check">✓</span>' : ''}
    </button>
  `;
  };
  const thumbUnits = computeThumbUnits();
  const thumbsHTML = thumbUnits.map(u => {
    if (u.startIndex === u.endIndex){
      return renderThumbButtonHTML(active.entries[u.startIndex], u.startIndex);
    }
    const isGroupActive = (ei >= u.startIndex && ei <= u.endIndex);
    let memberThumbsHTML = '';
    for (let idx = u.startIndex; idx <= u.endIndex; idx++){
      memberThumbsHTML += renderThumbButtonHTML(active.entries[idx], idx);
    }
    return `
    <div class="thumb-superset-group ${isGroupActive ? 'thumb-superset-group-active' : ''}">
      <span class="thumb-superset-label">Supersatz</span>
      ${memberThumbsHTML}
    </div>
  `;
  }).join('') + `<button class="thumb thumb-add" id="thumbAdd" aria-label="Übung hinzufügen">+</button>`;

  const addedIds = new Set(active.entries.map(x => x.exerciseId));
  const available = plan.exercises.filter(x => !addedIds.has(x.id));
  const availableGroups = {};
  available.forEach(x => {
    const g = x.muscleGroup || 'Sonstige';
    (availableGroups[g] = availableGroups[g] || []).push(x);
  });
  const orderedAvailableGroups = MUSCLE_GROUP_ORDER.filter(g => availableGroups[g] && availableGroups[g].length);
  Object.keys(availableGroups).forEach(g => { if (!orderedAvailableGroups.includes(g)) orderedAvailableGroups.push(g); });
  const defaultOpenGroups = defaultOpenAddExerciseGroups(availableGroups);

  const addExerciseHTML = !addExerciseOpen ? '' : `
    <div class="add-exercise-overlay" id="addExerciseOverlay">
      <div class="add-exercise-modal">
        <div class="add-exercise-modal-header">
          <div class="add-exercise-modal-title">Übung hinzufügen</div>
          <button class="add-exercise-modal-close" id="btnCloseAddExercise" aria-label="Schließen">✕</button>
        </div>
        <div class="add-exercise-modal-body">
          <input type="text" id="addExerciseSearch" class="plan-search" placeholder="Übung oder Muskel suchen…" style="margin-bottom:14px;">
          ${available.length ? orderedAvailableGroups.map(g => {
            const items = availableGroups[g];
            // Jede Muskelgruppe ist ein vollwertiges Akkordeon (konsistent mit dem Rest der
            // App), unabhängig von der Anzahl Übungen — vorher blieben kleine Gruppen (≤5
            // Übungen) als reine flache Liste ohne Auf-/Zuklapp-Kopf stehen, was optisch aus
            // dem Design fiel.
            // XOR aus Mode-Standard und manuellem Toggle: eine Gruppe, die laut Modus
            // standardmäßig offen ist, klappt beim Antippen trotzdem normal zu (und
            // umgekehrt) — addExerciseGroupOpen hält dabei weiterhin nur die "vom Standard
            // abweichenden" Gruppen fest, siehe defaultOpenAddExerciseGroups().
            const isOpen = defaultOpenGroups.has(g) !== addExerciseGroupOpen.has(g);
            const itemsHTML = items.map(x => `
              <div class="add-exercise-row" data-addex="${x.id}" role="button" tabindex="0">
                ${x.imageData ? `<img class="add-exercise-thumb" src="${x.imageData}" alt="">` : `<span class="add-exercise-thumb-fallback">${initials(x.name)}</span>`}
                <div class="add-exercise-mid">
                  <div class="add-exercise-name">${exerciseNameHTML(x.name)}</div>
                  <div class="add-exercise-meta">${x.mainMuscle || x.muscleGroup || ''}</div>
                </div>
                <span class="add-exercise-plus">+</span>
              </div>
            `).join('');
            return `
              <button class="muscle-group-header" data-addexgroup="${g}" type="button">
                <span class="mg-name">${g}</span>
                <span class="mg-meta">${items.length} Übungen <span class="mg-arrow">${isOpen ? '▾' : '▸'}</span></span>
              </button>
              <div class="muscle-group-body" style="display:${isOpen ? 'block' : 'none'}">
                ${itemsHTML}
              </div>
            `;
          }).join('') : '<div class="history-empty">Alle Übungen aus dem Plan sind bereits in dieser Einheit.</div>'}
        </div>
      </div>
    </div>
  `;

  const setsHeaderHTML = entry ? (entry.type === 'time' ? `
    <div class="sets-header sets-header-time">
      <span class="sets-header-cell"></span>
      <span class="sets-header-cell">${currentPlanEx && currentPlanEx.cardioMachine ? '' : 'Sek.'}</span>
      <span class="sets-header-cell"></span>
      <span class="sets-header-cell"></span>
    </div>
  ` : `
    <div class="sets-header">
      <span class="sets-header-cell"></span>
      <span class="sets-header-cell">KG</span>
      <span class="sets-header-cell">WDH</span>
      <button class="sets-header-cell sets-header-cell-toggle" id="btnToggleSetMetric" type="button">${activeSetMetricMode === 'vol' ? 'VOL' : activeSetMetricMode === '10rm' ? '10RM' : '1RM'}</button>
      <span class="sets-header-cell"></span>
      <span class="sets-header-cell"></span>
    </div>
  `) : '';

  const setsHTML = entry ? entry.sets.map((set, si) => {
    const isSuggestSet = !!(perfSuggestion && perfSuggestion.entryIndex === ei && perfSuggestion.setIndex === si);
    return entry.type === 'time' ? `
    <div class="set-row set-row-time ${set.done ? 'set-done' : ''} ${isSuggestSet ? 'perf-suggest-active' : ''}" data-set="${si}">
      <span class="set-idx">${isSuggestSet ? `<svg class="perf-suggest-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20V4"></path><path d="M5 11l7-7 7 7"></path></svg>` : si+1}</span>
      ${isSuggestSet ? `
      <input type="number" inputmode="numeric" enterkeyhint="done" id="perfSuggestSeconds" value="${perfSuggestion.seconds}" aria-label="Sekunden">
      ` : currentPlanEx && currentPlanEx.cardioMachine ? `
      <div class="mmss-field-row">
        <div class="set-mmss">
          <input type="number" inputmode="numeric" enterkeyhint="done" placeholder="Min" min="0" value="${set.seconds != null ? Math.floor(set.seconds / 60) : ''}" data-mmss="min">
          <span class="set-mmss-sep">:</span>
          <input type="number" inputmode="numeric" enterkeyhint="done" placeholder="Sek" min="0" max="59" value="${set.seconds != null ? String(set.seconds % 60).padStart(2,'0') : ''}" data-mmss="sec">
        </div>
        <button type="button" class="seconds-timer-btn" data-start-timer="${si}" aria-label="Stoppuhr für Satz ${si+1} starten">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l3 2"></path><path d="M9 2h6"></path></svg>
        </button>
      </div>
      ` : `
      <div class="seconds-field-row">
        <input type="number" inputmode="numeric" enterkeyhint="done" placeholder="Sekunden" value="${set.seconds ?? ''}" data-field="seconds">
        <button type="button" class="seconds-timer-btn" data-start-timer="${si}" aria-label="Stoppuhr für Satz ${si+1} starten">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l3 2"></path><path d="M9 2h6"></path></svg>
        </button>
      </div>
      `}
      ${isSuggestSet ? `
      <button class="perf-suggest-row-confirm" id="perfSuggestConfirm" type="button" aria-label="Vorschlag übernehmen">✓</button>
      <button class="perf-suggest-row-reject" id="perfSuggestReject" type="button" aria-label="Vorschlag ablehnen">✕</button>
      ` : `
      <button class="set-check ${set.done ? 'checked' : ''}" data-checkset="${si}" aria-label="Satz ${si+1} erledigt">✓</button>
      ${currentPlanEx && currentPlanEx.cardioMachine ? '' : `<button class="icon-x" data-removeset="${si}" aria-label="Satz ${si+1} entfernen">✕</button>`}
      `}
    </div>
    ${cardioFieldsFor(currentPlanEx).length ? `
    <div class="set-cardio-extra" data-set="${si}">
      ${cardioFieldsFor(currentPlanEx).map(f => `
        <div class="set-cardio-field">
          <label>${f.label}</label>
          <input type="number" inputmode="decimal" enterkeyhint="done" step="${f.step}" min="${f.min ?? 0}" ${f.max !== undefined ? `max="${f.max}"` : ''} value="${set[f.key] ?? ''}" data-field="${f.key}">
        </div>
      `).join('')}
      ${currentPlanEx.cardioMachine === 'laufband' ? `
        <div class="set-cardio-distance" id="cardioDistance${si}">${cardioDistanceKm(currentPlanEx, set) != null ? `≈ ${cardioDistanceKm(currentPlanEx, set).toLocaleString('de-DE')} km` : ''}</div>
      ` : ''}
    </div>` : ''}
  ` : `
    <div class="set-row ${set.done ? 'set-done' : ''} ${isSuggestSet ? 'perf-suggest-active' : ''}" data-set="${si}">
      <span class="set-idx">${isSuggestSet ? `<svg class="perf-suggest-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20V4"></path><path d="M5 11l7-7 7 7"></path></svg>` : (set.warmup ? 'WU' : si+1)}</span>
      <input type="number" inputmode="decimal" enterkeyhint="done" placeholder="${currentPlanEx && currentPlanEx.bodyweightExercise ? '+kg' : 'kg'}" step="0.5" value="${isSuggestSet ? perfSuggestion.weight : (currentPlanEx && currentPlanEx.noWeight ? '' : (set.weight ?? ''))}" ${isSuggestSet ? 'id="perfSuggestWeight"' : 'data-field="weight"'} class="${currentPlanEx && currentPlanEx.bodyweightExercise && !isSuggestSet ? 'weight-input-optional' : ''}" ${currentPlanEx && currentPlanEx.noWeight && !isSuggestSet ? 'disabled' : ''}>
      <input type="number" inputmode="numeric" enterkeyhint="done" placeholder="Wdh" value="${isSuggestSet ? perfSuggestion.reps : (set.reps ?? '')}" ${isSuggestSet ? 'id="perfSuggestReps"' : 'data-field="reps"'}>
      <span class="set-vol">${isSuggestSet ? '' : ((currentPlanEx && currentPlanEx.noWeight) ? '–' : (setMetricValue(set.reps, set.weight, currentPlanEx, activeSetMetricMode) ?? '–'))}</span>
      ${isSuggestSet ? `
      <button class="perf-suggest-row-confirm" id="perfSuggestConfirm" type="button" aria-label="Vorschlag übernehmen">✓</button>
      <button class="perf-suggest-row-reject" id="perfSuggestReject" type="button" aria-label="Vorschlag ablehnen">✕</button>
      ` : `
      <button class="set-check ${set.done ? 'checked' : ''}" data-checkset="${si}" aria-label="Satz ${si+1} erledigt">✓</button>
      <button class="icon-x" data-removeset="${si}" aria-label="Satz ${si+1} entfernen">✕</button>
      `}
    </div>
  `;
  }).join('') : '';

  const referenceHTML = (entry && entry.referenceHistory && entry.referenceHistory.length) ? `
    <div class="reference-block">
      ${entry.referenceHistory.map(sets => `
        <div class="reference-group">
          <div class="reference-title">Letztes Mal</div>
          ${sets.map((r,i) => `
            <div class="reference-row">
              <span>#${i+1}</span>
              <span>${entry.type === 'time' ? fmtSec(r.seconds) : `${r.weight ?? '–'}kg × ${r.reps ?? '–'}`}</span>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  ` : '';

  const needsBodyWeightWarning = !!(currentPlanEx && (currentPlanEx.assisted || currentPlanEx.bodyweightExercise) && !plan.bodyWeight);
  const bodyWeightWarningHTML = needsBodyWeightWarning ? `
    <div class="reference-block" style="border-color:var(--accent-2); margin-bottom:12px; display:flex; align-items:flex-start; gap:8px;">
      <img class="bodyweight-warning-icon" src="${ICON_WARNING}" alt="">
      <span>Kein Körpergewicht hinterlegt — VOL zeigt aktuell nur das eingestellte Gerätegewicht statt des tatsächlich bewegten Gewichts. Trag dein Körpergewicht im Übungen-Tab ein, damit es korrekt berechnet wird.</span>
    </div>
  ` : '';

  const exerciseCardHTML = !entry ? '<div class="history-empty">Keine Übungen in dieser Einheit.</div>' : `
    <div class="exercise-card">
      ${bodyWeightWarningHTML}
      <div class="exercise-title-row">
        <div class="exercise-title">${exerciseNameHTML(entry.name)}</div>
        <button class="icon-x" id="btnRemoveExercise" aria-label="${entry.name} aus dieser Einheit entfernen">✕</button>
      </div>
      <div class="sets" id="currentSets">
        ${setsHeaderHTML}
        ${setsHTML}
      </div>
      <div class="add-set-row ${entry.type === 'time' ? 'set-row-time' : ''}" ${currentPlanEx && currentPlanEx.cardioMachine ? 'style="display:none;"' : ''}>
        <button class="add-set" id="btnAddSet" aria-label="Satz hinzufügen">+</button>
        ${currentPlanEx ? `
        <button class="note-btn" id="btnExerciseNote" aria-label="Notiz zu ${entry.name}">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
        </button>
        ` : ''}
        <button class="check-all-btn" id="btnCheckAllExercise" aria-label="Ganze Übung abhaken">✓</button>
      </div>
      ${currentPlanEx && currentPlanEx.note ? `<div class="exercise-note-display">${currentPlanEx.note}</div>` : ''}
      ${referenceHTML}
    </div>
  `;

  // Performancemodus-Vorschlag wird NICHT mehr als eigenes, separat positioniertes Popup
  // gerendert (das driftete beim Scrollen von der eigentlichen Zeile weg, siehe setsHTML
  // unten) — stattdessen verwandelt sich die betroffene Satz-Zeile selbst per
  // "perf-suggest-active"-Klasse in die Vorschlags-Ansicht. Dadurch ist sie automatisch immer
  // exakt an der richtigen Stelle "verankert", auch beim Scrollen, ohne eigene Positionierung.
  const isCardioSuggestion = !!(perfSuggestion && perfSuggestion.seconds !== undefined);

  app.innerHTML = `
    <div class="active-header-row">
      <button class="active-back-btn" id="btnActiveBack" type="button" aria-label="Zur Startseite (Training läuft weiter)">
        <img src="${ICON_CHEVRON_RIGHT}" alt="">
      </button>
      ${plan.trainingToolsEnabled === true ? `
      <button class="active-tools-btn" id="btnActiveTools" type="button" aria-label="Trainingstools">⚙</button>
      ` : `<span></span>`}
    </div>
    <div class="time-box ${restState ? 'resting' : ''}" id="plateEl" style="margin-top:18px;">
      <div class="time-box-time-row" id="plateTimeRow">
        <div class="time-box-time ${active.pausedAt ? 'time-paused' : ''}" id="plateTime">00:00</div>
        <span class="time-box-pause-icon" id="platePauseIcon" style="display:${active.pausedAt ? 'block' : 'none'};" aria-label="Trainingszeit pausiert"></span>
      </div>
      <div class="time-box-rest" id="plateRest">
        <span class="time-box-rest-label">Pause</span>
        <span class="time-box-rest-time" id="plateRestTime">00:00</span>
      </div>
      <svg class="time-box-ring" id="restRing" preserveAspectRatio="none">
        <rect id="restRingRect"></rect>
      </svg>
    </div>
    <div class="rest-row">
      <button class="rest-btn" data-rest="30">30s</button>
      <button class="rest-btn" data-rest="60">60s</button>
      <button class="rest-btn" data-rest="90">90s</button>
    </div>
    <div class="thumb-strip">${thumbsHTML}</div>
    ${exerciseCardHTML}
    ${addExerciseHTML}
    <div style="height:70px"></div>
    <div class="bottom-bar">
      <div class="bottom-bar-inner">
        <button class="btn btn-primary" id="btnEnd">Training beenden</button>
      </div>
    </div>
  `;

  // Gemerkte Scroll-Position der Bilderleiste wiederherstellen (siehe Kommentar oben in
  // renderActive()) — direkt nach dem Neuaufbau, bevor wireThumbDrag() die Klick-/Drag-Handler
  // erneut bindet, damit kein sichtbares Zurückspringen zwischen Aufbau und Wiederherstellung
  // aufblitzt.
  const newStripEl = app.querySelector('.thumb-strip');
  if (newStripEl && prevStripScrollLeft !== null) newStripEl.scrollLeft = prevStripScrollLeft;

  updateTimerDisplay();
  document.getElementById('btnActiveBack').onclick = () => {
    // Führt zur Startseite, OHNE das Training zu beenden/verwerfen — läuft im Hintergrund
    // einfach weiter (gleiches Verhalten wie die Zurück-Taste, nur als expliziter Button).
    goHome();
  };
  const btnActiveToolsEl = document.getElementById('btnActiveTools');
  if (btnActiveToolsEl) btnActiveToolsEl.onclick = () => openTrainingToolsPrompt(entry, currentPlanEx);
  if (restState){
    // Passiert dem Ring UND dem Pause-Label/der Restzeit-Anzeige (#plateRest) — beide
    // erhalten ihre "visible"-Klasse normalerweise nur einmalig in startRest() und stehen
    // NICHT im Render-Template selbst (siehe dortiger Kommentar). Wird renderActive() erneut
    // aufgerufen, während bereits eine Pause läuft (z. B. weil ein Satz ab-/wieder angehakt
    // oder ein Popup geschlossen wurde), baut das die komplette Box frisch aus dem Template
    // auf — scheduleRestRingSetup() übernimmt hier sowohl die sofortige Wiederherstellung als
    // auch die spätere Nachkorrektur, falls die neue Box gerade noch in einer Größen-
    // Transition steckt (siehe dortiger Kommentar).
    requestAnimationFrame(scheduleRestRingSetup);
  }
  highlightRestButtons();

  wireThumbDrag();
  const thumbAddBtn = document.getElementById('thumbAdd');
  if (thumbAddBtn) thumbAddBtn.onclick = () => {
    addExerciseOpen = !addExerciseOpen;
    renderActive();
  };
  const addExerciseOverlay = document.getElementById('addExerciseOverlay');
  if (addExerciseOverlay){
    addExerciseOverlay.onclick = (ev) => {
      if (ev.target === addExerciseOverlay){
        addExerciseOpen = false;
        renderActive();
      }
    };
    const closeBtn = document.getElementById('btnCloseAddExercise');
    if (closeBtn) closeBtn.onclick = () => {
      addExerciseOpen = false;
      renderActive();
    };
    addExerciseOverlay.querySelectorAll('[data-addexgroup]').forEach(btn => {
      btn.onclick = () => {
        const g = btn.dataset.addexgroup;
        if (addExerciseGroupOpen.has(g)) addExerciseGroupOpen.delete(g); else addExerciseGroupOpen.add(g);
        renderActive();
      };
    });
    // Live-Filterung rein per DOM-Anzeige (kein renderActive()!), damit die virtuelle
    // Tastatur bei jedem getippten Zeichen nicht durch einen kompletten Neu-Render den Fokus
    // verliert. Merkt sich den ursprünglichen Auf-/Zugeklappt-Zustand jeder Gruppe einmalig
    // (data-original-display) und stellt ihn wieder her, sobald das Suchfeld geleert wird —
    // während der Suche werden Treffergruppen zusätzlich zwangsweise aufgeklappt.
    const addExerciseSearchInput = document.getElementById('addExerciseSearch');
    if (addExerciseSearchInput){
      addExerciseOverlay.querySelectorAll('.muscle-group-body').forEach(body => {
        if (body.dataset.originalDisplay === undefined) body.dataset.originalDisplay = body.style.display;
      });
      addExerciseSearchInput.oninput = () => {
        const q = addExerciseSearchInput.value.trim().toLowerCase();
        addExerciseOverlay.querySelectorAll('.muscle-group').forEach(groupEl => {
          const body = groupEl.querySelector('.muscle-group-body');
          let anyVisible = false;
          body.querySelectorAll('.add-exercise-row').forEach(row => {
            const name = (row.querySelector('.add-exercise-name')?.textContent || '').toLowerCase();
            const meta = (row.querySelector('.add-exercise-meta')?.textContent || '').toLowerCase();
            const match = !q || name.includes(q) || meta.includes(q);
            row.style.display = match ? '' : 'none';
            if (match) anyVisible = true;
          });
          groupEl.style.display = anyVisible ? '' : 'none';
          body.style.display = q ? (anyVisible ? 'block' : 'none') : body.dataset.originalDisplay;
        });
      };
    }
  }

  if (entry){
    // Aktualisiert die Live-Distanzanzeige (≈ X km) beim Laufband anhand der GERADE
    // getippten Werte (nicht erst nach dem Speichern) — liest Minuten/Sekunden und Tempo
    // direkt aus dem DOM, da diese über zwei getrennte Zeilen (.set-row/.set-cardio-extra)
    // verteilt sind.
    function refreshCardioDistanceDisplay(si){
      if (!currentPlanEx || currentPlanEx.cardioMachine !== 'laufband') return;
      const distEl = document.getElementById(`cardioDistance${si}`);
      if (!distEl) return;
      const setRow = document.querySelector(`#currentSets .set-row[data-set="${si}"]`);
      const extraRow = document.querySelector(`#currentSets .set-cardio-extra[data-set="${si}"]`);
      const minEl = setRow && setRow.querySelector('[data-mmss="min"]');
      const secEl = setRow && setRow.querySelector('[data-mmss="sec"]');
      const speedEl = extraRow && extraRow.querySelector('[data-field="speed"]');
      const min = minEl && minEl.value !== '' ? Number(minEl.value) : 0;
      const sec = secEl && secEl.value !== '' ? Number(secEl.value) : 0;
      const speed = speedEl && speedEl.value !== '' ? Number(speedEl.value) : null;
      const hasTime = !!((minEl && minEl.value !== '') || (secEl && secEl.value !== ''));
      const dist = (speed != null && hasTime) ? Math.round(speed * ((min*60+sec)/3600) * 100)/100 : null;
      distEl.textContent = dist != null ? `≈ ${dist.toLocaleString('de-DE')} km` : '';
    }

    document.getElementById('currentSets').querySelectorAll('.set-row, .set-cardio-extra').forEach(row => {
      const si = Number(row.dataset.set);
      row.querySelectorAll('input[data-field]').forEach(input => {
        input.onkeydown = (ev) => {
          if (ev.key === 'Enter'){
            ev.preventDefault();
            // Statt immer nur die Tastatur zu schließen: springt zum NÄCHSTEN Eingabefeld
            // derselben Zeile (z. B. kg → Wdh), aber NUR wenn dieses noch leer ist — steht
            // dort schon ein Wert (z. B. aus der Übernahme vom vorherigen Satz), bleibt
            // "Bestätigen" wie gewohnt beim Schließen der Tastatur (kein ungewolltes
            // Überspringen eines bereits ausgefüllten Feldes). input.blur() löst über den
            // bestehenden onchange-Handler renderActive() aus, das die komplette Sätze-Liste
            // neu aufbaut — das Zielfeld muss deshalb ERST NACH diesem Neuaufbau frisch aus
            // dem DOM geholt werden, ein vorher gemerkter Knoten wäre danach bereits verwaist.
            const fieldsInRow = Array.from(row.querySelectorAll('input[data-field]'));
            const idx = fieldsInRow.indexOf(input);
            const nextInput = fieldsInRow[idx + 1];
            const nextField = (nextInput && nextInput.value === '' && !nextInput.disabled) ? nextInput.dataset.field : null;
            input.blur(); // löst onchange aus (Wert übernehmen, speichern, neu rendern)
            if (nextField){
              const freshNext = document.querySelector(`#currentSets input[data-field="${nextField}"][data-si="${si}"]`);
              if (freshNext) freshNext.focus();
            }
          }
        };
        input.onchange = () => {
          const val = input.value === '' ? null : Number(input.value);
          const field = input.dataset.field;
          // Trägt den Wert direkt beim Eintragen (kein Abhaken nötig) in diesen Satz ein
          // und schreibt ihn wie beim Abhaken automatisch in alle direkt folgenden, noch
          // leeren bzw. nur automatisch befüllten Sätze fort (applySetValueAndPropagate).
          applySetValueAndPropagate(entry, si, { [field]: val });
          persistActiveSession();
          renderActive();
        };
        if (entry.type !== 'time'){
          input.oninput = () => {
            const s = entry.sets[si];
            const reps = input.dataset.field === 'reps' ? (input.value === '' ? null : Number(input.value)) : s.reps;
            const weight = input.dataset.field === 'weight' ? (input.value === '' ? null : Number(input.value)) : s.weight;
            const volEl = row.querySelector('.set-vol');
            if (volEl) volEl.textContent = setMetricValue(reps, weight, currentPlanEx, activeSetMetricMode) ?? '–';
          };
        } else if (input.dataset.field === 'speed'){
          input.oninput = () => refreshCardioDistanceDisplay(si);
        }
      });
      // Kardio: Minuten + Sekunden werden getrennt eingegeben, aber weiterhin als eine
      // gemeinsame Sekundenzahl in set.seconds gespeichert — dieselbe Datengrundlage wie bei
      // allen anderen Zeit-Übungen (Verlauf, Rekorde, PDF etc. bleiben dadurch unverändert).
      const minEl = row.querySelector('[data-mmss="min"]');
      const secEl = row.querySelector('[data-mmss="sec"]');
      if (minEl && secEl){
        const commit = () => {
          const min = minEl.value === '' ? 0 : Number(minEl.value);
          const sec = secEl.value === '' ? 0 : Number(secEl.value);
          const seconds = (minEl.value === '' && secEl.value === '') ? null : (min * 60 + sec);
          // Wie bei Gewicht/Wdh: Dauer direkt beim Eintragen in Folge-Sätze übernehmen.
          applySetValueAndPropagate(entry, si, { seconds });
          persistActiveSession();
          renderActive();
        };
        [minEl, secEl].forEach(el => {
          el.onkeydown = (ev) => { if (ev.key === 'Enter'){ ev.preventDefault(); el.blur(); } };
          el.onchange = commit;
          el.oninput = () => refreshCardioDistanceDisplay(si);
        });
        const cardioTimerBtn = row.querySelector('.mmss-field-row .seconds-timer-btn');
        if (cardioTimerBtn) cardioTimerBtn.onclick = () => {
          openPlankTimerOverlay((sec) => {
            minEl.value = Math.floor(sec / 60);
            secEl.value = String(sec % 60).padStart(2, '0');
            applySetValueAndPropagate(entry, si, { seconds: sec });
            autoCheckSetAfterTimer(entry, ei, si);
            persistActiveSession();
            renderActive();
          });
        };
      }
      if (entry.type === 'time' && !(minEl && secEl)){
        const secondsInput = row.querySelector('[data-field="seconds"]');
        const timerBtn = row.querySelector('.seconds-timer-btn');
        if (timerBtn && secondsInput){
          timerBtn.onclick = () => {
            openPlankTimerOverlay((sec) => {
              applySetValueAndPropagate(entry, si, { seconds: sec });
              autoCheckSetAfterTimer(entry, ei, si);
              persistActiveSession();
              renderActive();
            });
          };
        }
      }
    });

    app.querySelectorAll('[data-checkset]').forEach(btn => {
      btn.onclick = () => {
        const si = Number(btn.dataset.checkset);
        const wasDone = entry.sets[si].done;
        entry.sets[si].done = !wasDone;
        if (!wasDone){
          // Satz wurde gerade abgehakt: komplett leere Folge-Sätze automatisch
          // mit denselben Werten (kg + Wdh bzw. Sekunden) vorausfüllen, damit man
          // bei gleichbleibendem Gewicht/Wdh nicht jeden Satz neu eintippen muss.
          applySetValueAndPropagate(entry, si, entry.type === 'time'
            ? { seconds: entry.sets[si].seconds, ...Object.fromEntries(cardioFieldsFor(currentPlanEx).map(f => [f.key, entry.sets[si][f.key]])) }
            : { reps: entry.sets[si].reps, weight: entry.sets[si].weight });
        }
        if (!wasDone){
          afterSetChecked(entry, ei);
          // Standard-Pausetimer (siehe openTrainingToolsPrompt(), Einstellungen →
          // Trainingstools → "Standard-Pausetimer"): startet automatisch eine Pause
          // in der hinterlegten Länge, sobald ein Satz abgehakt wird — genau wie ein
          // manueller Tap auf einen der 30/60/90s-Buttons, nur ohne dass man selbst
          // draufdrücken muss. Nur wenn eine Dauer hinterlegt ist (Standard: keine).
          if (plan.trainingToolsEnabled === true && plan.defaultRestSeconds) startRest(plan.defaultRestSeconds);
        }
        renderActive();
      };
    });

    app.querySelectorAll('[data-removeset]').forEach(btn => {
      btn.onclick = () => {
        const si = Number(btn.dataset.removeset);
        const removedSet = entry.sets[si];
        // Nur nachfragen/Undo anbieten, wenn im Satz schon etwas eingetragen war — ein
        // leerer, noch unbenutzter Satz lässt sich weiterhin ohne Rückfrage entfernen.
        const hasData = entry.type === 'time'
          ? (removedSet.seconds !== null && removedSet.seconds !== undefined)
          : ((removedSet.reps !== null && removedSet.reps !== undefined) || (removedSet.weight !== null && removedSet.weight !== undefined));
        entry.sets.splice(si, 1);
        if (perfSuggestion && perfSuggestion.entryIndex === ei && perfSuggestion.setIndex >= si) perfSuggestion = null;
        renderActive();
        if (hasData){
          showUndoToast(`Satz ${si + 1} entfernt.`, () => {
            entry.sets.splice(si, 0, removedSet);
            renderActive();
          });
        }
      };
    });

    document.getElementById('btnAddSet').onclick = () => {
      // autoFilled:true, da die Werte hier nur von "last" übernommen wurden, nicht vom
      // Nutzer selbst eingetippt — ein neuer Satz soll genauso überschreibbar bleiben wie
      // ein leerer, damit applySetValueAndPropagate() ihn beim Abhaken eines VORHERIGEN
      // Satzes weiterhin korrekt mit dessen (ggf. gerade bearbeiteten) Werten befüllt.
      if (entry.type === 'time'){
        const last = entry.sets[entry.sets.length - 1];
        const newSet = { seconds: (last && last.seconds) || null, done: false, autoFilled: true };
        cardioFieldsFor(currentPlanEx).forEach(f => { newSet[f.key] = (last && last[f.key]) ?? null; });
        entry.sets.push(newSet);
      } else {
        const last = entry.sets[entry.sets.length - 1];
        entry.sets.push({
          reps: (last && last.reps) || null,
          weight: (last && last.weight) || entry.target.weight || null,
          done: false,
          autoFilled: true
        });
      }
      renderActive();
    };

    document.getElementById('btnCheckAllExercise').onclick = () => {
      entry.sets.forEach(s => s.done = true);
      afterSetChecked(entry, ei);
      renderActive();
    };

    const btnExerciseNoteEl = document.getElementById('btnExerciseNote');
    if (btnExerciseNoteEl) btnExerciseNoteEl.onclick = () => {
      openExerciseNotePrompt(currentPlanEx, entry.name);
    };

    document.getElementById('btnRemoveExercise').onclick = () => {
      const removedIndex = ei;
      const removedEntry = active.entries[ei];
      active.entries.splice(ei, 1);
      if (active.currentIndex >= active.entries.length) active.currentIndex = Math.max(0, active.entries.length - 1);
      perfSuggestion = null;
      renderActive();
      showUndoToast(`"${removedEntry.name}" entfernt.`, () => {
        active.entries.splice(removedIndex, 0, removedEntry);
        active.currentIndex = removedIndex;
        renderActive();
      });
    };

    // Performancemodus-Vorschlag: die betroffene Zeile zeigt sich seit setsHTML oben bereits
    // selbst als Vorschlags-Ansicht (Klasse "perf-suggest-active") — hier nur noch Annehmen/
    // Ablehnen verkabeln, keine eigene Positionierung mehr nötig (siehe setsHTML-Kommentar).
    // Der Vorschlag erscheint automatisch (siehe maybeShowPerfSuggestion()), bevor der Satz
    // überhaupt abgehakt wurde: Annehmen/Ablehnen markiert den Satz daher nicht als erledigt
    // und springt auch nicht zur nächsten Übung.
    if (perfSuggestion && perfSuggestion.entryIndex === ei){
      const dismiss = () => {
        entry._perfSuggestionDismissed = true; // in dieser Trainingseinheit nicht nochmal automatisch zeigen
        promoteNextPerfSuggestionSlot(); // ungenutzter Kontingent-Platz rückt an die nächste Übung nach
        perfSuggestion = null;
        renderActive();
      };
      const rejectBtn = document.getElementById('perfSuggestReject');
      if (rejectBtn) rejectBtn.onclick = dismiss;
      const confirmBtn = document.getElementById('perfSuggestConfirm');
      if (confirmBtn) confirmBtn.onclick = () => {
        if (isCardioSuggestion){
          const sEl = document.getElementById('perfSuggestSeconds');
          const newSeconds = sEl && sEl.value !== '' ? Number(sEl.value) : perfSuggestion.seconds;
          applyPerfTimeSuggestionAndPropagate(entry, perfSuggestion.setIndex, newSeconds);
        } else {
          const wEl = document.getElementById('perfSuggestWeight');
          const rEl = document.getElementById('perfSuggestReps');
          const newWeight = wEl && wEl.value !== '' ? Number(wEl.value) : perfSuggestion.weight;
          const newReps = rEl && rEl.value !== '' ? Number(rEl.value) : perfSuggestion.reps;
          applyPerfSuggestionAndPropagate(entry, perfSuggestion.setIndex, { weight: newWeight, reps: newReps });
        }
        entry._perfSuggestionDismissed = true;
        perfSuggestion = null;
        renderActive();
      };
    }
  }

  app.querySelectorAll('[data-addex]').forEach(row => {
    row.onclick = () => {
      const ex = plan.exercises.find(x => x.id === row.dataset.addex);
      if (ex){
        const newEntry = buildEntry(ex);
        // Ist Warm-up für die Einheit aktiv (active.warmupEnabled, siehe
        // openTrainingToolsPrompt()), bekommt auch eine nachträglich hinzugefügte Übung
        // direkt ihren Warm-up-Satz mit, statt dass man den Schalter erneut betätigen müsste.
        if (active.warmupEnabled) applyWarmupToEntry(newEntry, ex);
        active.entries.push(newEntry);
        active.currentIndex = active.entries.length - 1;
        addExerciseOpen = false;
        renderActive();
      }
    };
  });

  document.getElementById('btnEnd').onclick = () => {
    const isLastExercise = ei === active.entries.length - 1;
    if (!isLastExercise && !confirm('Training wirklich beenden? Du bist noch nicht bei der letzten Übung.')) return;
    const problems = findIncompleteDoneSets();
    if (problems.length){
      openIncompleteSetsPrompt(problems, () => endSession());
      return;
    }
    endSession();
  };
  const toggleSetMetricBtn = document.getElementById('btnToggleSetMetric');
  if (toggleSetMetricBtn){
    toggleSetMetricBtn.onclick = () => {
      // Rotiert bei jedem Tap durch VOL → 10RM → 1RM → VOL … und merkt sich die Wahl auch
      // für die restliche Trainingseinheit (nicht nur für diese eine Übung).
      activeSetMetricMode = activeSetMetricMode === 'vol' ? '10rm' : activeSetMetricMode === '10rm' ? '1rm' : 'vol';
      renderActive();
    };
  }
  // Normaler Tap startet die feste Pausenzeit wie gehabt; Long-Press auf einen der drei
  // Buttons öffnet stattdessen ein Popup für eine frei eingegebene Pausendauer (siehe
  // openCustomRestPrompt()) — gleiches Long-Press-Muster wie z. B. bei den Akzentfarben-
  // Favoriten (wireAccentSwatchInteractions()): ein als Long-Press gewerteter Druck
  // unterdrückt den nachfolgenden Klick.
  (function wireRestButtonLongPress(){
    const LONG_PRESS_MS = 450;
    const MOVE_CANCEL_PX = 12;
    app.querySelectorAll('.rest-btn').forEach(btn => {
      let pressTimer = null;
      let startX = 0, startY = 0, longPressFired = false;
      const cancel = () => { clearTimeout(pressTimer); pressTimer = null; };

      btn.onclick = () => {
        if (longPressFired){ longPressFired = false; return; }
        startRest(Number(btn.dataset.rest));
      };

      btn.addEventListener('contextmenu', (ev) => ev.preventDefault());
      btn.addEventListener('touchstart', (ev) => {
        longPressFired = false;
        const t = ev.touches[0];
        startX = t.clientX; startY = t.clientY;
        pressTimer = setTimeout(() => {
          longPressFired = true;
          if (navigator.vibrate) navigator.vibrate(15);
          openCustomRestPrompt();
        }, LONG_PRESS_MS);
      }, { passive: true });
      btn.addEventListener('touchmove', (ev) => {
        const t = ev.touches[0];
        if (Math.abs(t.clientX - startX) > MOVE_CANCEL_PX || Math.abs(t.clientY - startY) > MOVE_CANCEL_PX) cancel();
      }, { passive: true });
      btn.addEventListener('touchend', cancel);
      btn.addEventListener('touchcancel', cancel);
    });
  })();
  document.getElementById('plateEl').onclick = () => {
    if (restState){
      clearInterval(restInterval);
      restInterval = null;
      endRest(false);
    } else {
      toggleSessionPause();
    }
  };
}

