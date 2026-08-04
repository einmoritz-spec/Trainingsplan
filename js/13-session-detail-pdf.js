/* ---------------------------------------------------
   SESSION DETAIL / PDF
--------------------------------------------------- */
// Exportiert eine einzelne Trainingseinheit als eigenständige JSON-Datei — inklusive der
// zugehörigen Übungsdefinitionen aus dem Plan (Name, Bild, Zielwerte etc.), damit die Datei
// auch auf einem anderen Gerät/Plan importiert werden kann, wo diese Übungen evtl. noch
// nicht existieren (siehe importSingleSessionFile()).
function exportSingleSession(session){
  const exerciseIds = new Set(session.entries.map(e => e.exerciseId));
  const exercises = plan.exercises.filter(x => exerciseIds.has(x.id));
  const payload = { type: 'trainingsplan-session', version: 1, exportedAt: new Date().toISOString(), session, exercises };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const dateStub = (session.date || '').slice(0,10);
  downloadBlob(blob, `trainingsplan-training-${dateStub}.json`);
}

// Exportiert eine Liste von Sessions (hier: alle Einheiten eines Monats) als kompakte
// .xlsx-Tabelle — eine Zeile pro Übung-je-Einheit (nicht pro Einzelsatz, sonst würde die
// Tabelle bei mehreren Sätzen pro Übung schnell unübersichtlich groß). Sätze werden als
// kompakter Text zusammengefasst (z. B. "8×60kg, 8×60kg, 6×65kg"), Kardio-Details (inkl.
// automatisch berechneter Distanz beim Laufband) landen in einer eigenen Spalte.
function renderSessionDetail(id){
  const s = sessions.find(x => x.id === id);
  if (!s) return goHome(false);
  viewingSessionId = id;

  const totalSets = s.entries.reduce((a,e)=>a+e.sets.length,0);
  const sessionHasCardio = s.entries.some(e => {
    const planEx = plan.exercises.find(x => x.id === e.exerciseId);
    return planEx && planEx.cardioMachine;
  });
  const rows = s.entries.map(e => {
    const planEx = plan.exercises.find(x => x.id === e.exerciseId);
    return e.sets.map((set, i) => `
    <tr${i === 0 ? ' class="exercise-start"' : ''}>
      <td>${i===0 ? exerciseNameHTML(e.name) : ''}</td>
      <td>${i+1}</td>
      <td>${e.type === 'time' ? fmtSec(set.seconds) : (set.reps ?? '—')}</td>
      <td>${e.type === 'time' ? '—' : (set.weight ?? '—')}</td>
      ${sessionHasCardio ? `<td>${cardioSetSummary(planEx, set) || '—'}</td>` : ''}
    </tr>
  `).join('');
  }).join('');

  // Highlights wie in der Zusammenfassung nach dem Training berechnen
  const { highlights: exerciseHighlights, starCount: sessionStarCount, improvedCount: sessionImprovedCount } = computeExerciseHighlights(s);
  const highlightsHTML = exerciseHighlights.map(h => {
    const planEx = plan.exercises.find(x => x.id === h.exerciseId);
    const img = planEx && planEx.imageData;
    const setsLine = h.isTime ? h.sets.map(s2 => fmtSec(s2.seconds)).join(' · ') : h.sets.map(s2 => `${s2.reps}×${s2.weight ?? 0}kg`).join(' · ');
    return `
      <div class="summary-row" data-exerciseid="${h.exerciseId}" role="button" tabindex="0">
        <div class="summary-row-media">
          ${img ? `<img class="summary-thumb" src="${img}" alt="">` : `<span class="summary-thumb-fallback">${initials(h.name)}</span>`}
        </div>
        <div class="summary-row-mid">
          <div class="summary-row-name">${exerciseNameHTML(h.name)}</div>
          <div class="summary-row-meta">${h.sets.length} Sätze
            ${h.records > 0 ? `<span class="summary-row-stat"><img class="summary-row-stat-icon" src="${ICON_RECORD}" alt="">${h.records}</span>` : ''}
            ${h.improved > 0 ? `<span class="summary-row-stat"><img class="summary-row-stat-icon" src="${ICON_IMPROVEMENT}" alt="">${h.improved}</span>` : ''}
          </div>
          <div class="summary-row-sets">${setsLine || '—'}</div>
        </div>
      </div>
    `;
  }).join('');

  app.innerHTML = `
    <div class="back-row no-print">
      <button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>
    <div class="detail-header">
      <h2>Trainingseinheit</h2>
      <div class="detail-stats">
        <span>${fmtDate(s.date)}</span>
        <span>${fmtDuration(s.durationSec)}</span>
        <span>${s.entries.length} Übungen · ${totalSets} Sätze</span>
      </div>
    </div>
    ${highlightsHTML ? `
    <div class="muscle-group" style="margin-bottom:14px;">
      <button class="muscle-group-header" id="btnToggleErfolge" type="button" aria-expanded="false">
        <span class="mg-name">Erfolge</span>
        <span class="mg-meta"><span class="mg-arrow" id="erfolgeArrow">▸</span></span>
      </button>
      <div class="muscle-group-body" id="erfolgeBody" style="display:none;">
        <div class="summary-list">
          ${highlightsHTML}
        </div>
      </div>
    </div>` : ''}
    <div class="muscle-group" style="margin-top:10px;">
      <button class="muscle-group-header no-print" id="btnToggleFull" type="button" aria-expanded="false">
        <span class="mg-name">Gesamtes Training anzeigen</span>
        <span class="mg-meta"><span class="mg-arrow" id="fullToggleChevron">▸</span></span>
      </button>
      <div class="muscle-group-body" id="fullTableWrap" style="display:none; padding:2px 16px 14px;">
        <div class="detail-table-wrap">
        <table class="detail-table">
          <thead><tr><th>Übung</th><th>Satz</th><th>Wdh/Zeit</th><th>kg</th>${sessionHasCardio ? '<th>Kardio</th>' : ''}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
      </div>
    </div>
    <div class="detail-actions no-print">
      <button class="btn btn-ghost" id="btnDelete">Löschen</button>
      <button class="btn btn-ghost" id="btnShare">Teilen</button>
      <button class="btn btn-ghost" id="btnPdf">Speichern</button>
    </div>
    <div class="detail-actions no-print" style="margin-top:10px;">
      <button class="btn btn-ghost" id="btnExportSession">Training exportieren</button>
    </div>
    <button class="btn btn-primary btn-repeat no-print" id="btnRepeat" style="margin-top:10px;">
      <svg class="btn-repeat-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
      Nochmal trainieren
    </button>
  `;

  const btnToggleErfolge = document.getElementById('btnToggleErfolge');
  if (btnToggleErfolge) btnToggleErfolge.onclick = () => {
    const body = document.getElementById('erfolgeBody');
    const arrow = document.getElementById('erfolgeArrow');
    const btn = document.getElementById('btnToggleErfolge');
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    arrow.textContent = isOpen ? '▸' : '▾';
    btn.setAttribute('aria-expanded', String(!isOpen));
  };

  app.querySelectorAll('.summary-row[data-exerciseid]').forEach(row => {
    row.onclick = () => goExerciseSessionDetail(s.id, row.dataset.exerciseid);
  });
  wireSessionRowLongPress(s);

  document.getElementById('btnBack').onclick = () => history.back();
  document.getElementById('btnRepeat').onclick = () => repeatSession(s);
  document.getElementById('btnToggleFull').onclick = () => {
    const wrap = document.getElementById('fullTableWrap');
    const chevron = document.getElementById('fullToggleChevron');
    const btn = document.getElementById('btnToggleFull');
    const isOpen = wrap.style.display !== 'none';
    wrap.style.display = isOpen ? 'none' : 'block';
    chevron.textContent = isOpen ? '▸' : '▾';
    btn.setAttribute('aria-expanded', String(!isOpen));
  };
  document.getElementById('btnPdf').onclick = () => {
    const dateStub = (s.date || '').slice(0,10);
    const sessionNumber = sessions.findIndex(x => x.id === s.id) + 1;
    const streak = computeWeekStreak();
    let blob = null;
    try{ blob = buildFullSummaryPdfBlob(s, { sessionNumber, streak, highlights: exerciseHighlights, includeNotes: true }); }catch(err){ blob = null; }
    if (blob){
      downloadBlob(blob, `trainingsplan-zusammenfassung-${dateStub}.pdf`);
    } else {
      window.print();
    }
  };
  document.getElementById('btnShare').onclick = () => shareSession(s, {});
  document.getElementById('btnExportSession').onclick = () => {
    exportSingleSession(s);
  };
  document.getElementById('btnDelete').onclick = async () => {
    if (!confirm('Diese Einheit wirklich löschen?')) return;
    const removedIndex = sessions.findIndex(x => x.id === id);
    const removedSession = sessions[removedIndex];
    sessions = sessions.filter(x => x.id !== id);
    rebuildLastPerformance();
    await Promise.all([deleteSessionStorage(removedSession), saveJSON('lastPerformance', lastPerformance)]);
    history.back();
    showUndoToast('Einheit gelöscht.', async () => {
      sessions.splice(removedIndex, 0, removedSession);
      rebuildLastPerformance();
      await Promise.all([saveSessionAt(removedSession, removedIndex), saveJSON('lastPerformance', lastPerformance)]);
      goSessionDetail(removedSession.id);
    });
  };
}

// Long-Press auf eine Übungszeile in der "Erfolge"-Liste der Trainingsdetailseite öffnet
// das Bearbeiten-Popup (openSessionEntryEditor) — ein normaler kurzer Tap navigiert
// weiterhin zur Übungs-Fortschrittsseite (siehe row.onclick oberhalb). Gleiches
// Long-Press-Muster wie wireHistoryLongPress().
function wireSessionRowLongPress(session){
  const LONG_PRESS_MS = 450;
  const MOVE_CANCEL_PX = 10;
  document.querySelectorAll('.summary-row[data-exerciseid]').forEach(row => {
    let pressTimer = null;
    let startX = 0, startY = 0, longPressFired = false;
    const cancel = () => { clearTimeout(pressTimer); pressTimer = null; };

    row.addEventListener('contextmenu', (ev) => ev.preventDefault());
    row.addEventListener('selectstart', (ev) => ev.preventDefault());

    row.addEventListener('touchstart', (ev) => {
      longPressFired = false;
      const t = ev.touches[0];
      startX = t.clientX; startY = t.clientY;
      const suppressSelectionTimer = setTimeout(() => { try{ ev.preventDefault(); }catch(err){} }, 200);
      pressTimer = setTimeout(() => {
        longPressFired = true;
        ev.preventDefault();
        if (navigator.vibrate) navigator.vibrate(15);
        openSessionEntryEditor(session, row.dataset.exerciseid);
      }, LONG_PRESS_MS);
      const clearSuppress = () => clearTimeout(suppressSelectionTimer);
      row.addEventListener('touchend', clearSuppress, { once: true });
      row.addEventListener('touchcancel', clearSuppress, { once: true });
    }, { passive: false });
    row.addEventListener('touchmove', (ev) => {
      const t = ev.touches[0];
      if (Math.abs(t.clientX - startX) > MOVE_CANCEL_PX || Math.abs(t.clientY - startY) > MOVE_CANCEL_PX) cancel();
    }, { passive: true });
    row.addEventListener('touchend', cancel);
    row.addEventListener('touchcancel', cancel);

    row.addEventListener('mousedown', () => {
      longPressFired = false;
      pressTimer = setTimeout(() => {
        longPressFired = true;
        openSessionEntryEditor(session, row.dataset.exerciseid);
      }, LONG_PRESS_MS);
    });
    row.addEventListener('mouseup', cancel);
    row.addEventListener('mouseleave', cancel);

    row.addEventListener('click', (ev) => {
      if (longPressFired){ ev.preventDefault(); ev.stopPropagation(); longPressFired = false; }
    }, true);
  });
}

// Bearbeiten einer bereits gespeicherten Übung innerhalb einer abgeschlossenen Einheit —
// per Long-Press aus der Trainingsdetailseite geöffnet. Erlaubt das Ändern von kg/Wdh
// (bzw. Sekunden) je Satz, Hinzufügen/Entfernen von Sätzen, sowie den kompletten Austausch
// der Übung gegen eine andere (danach werden kg/Wdh für die neue Übung frisch eingegeben).
// Wichtig: session.entries ist die alleinige Datenquelle für sämtliche Statistiken (Verlauf,
// Fortschrittscharts, Muskelgruppen-Verteilung, PDF-Export, Rekorde/"Allzeitrekord vs. letztes
// Mal" über lastPerformance) — es gibt keinen separaten Cache. Ein Speichern hier schreibt
// direkt in session.entries, persistiert über saveSessionAt() und baut lastPerformance neu
// auf (rebuildLastPerformance()), wodurch die Änderung automatisch überall korrekt ankommt.
function openSessionEntryEditor(session, exerciseId){
  const entryIndex = session.entries.findIndex(e => e.exerciseId === exerciseId);
  if (entryIndex < 0) return;
  // Auf einer Kopie arbeiten, damit Abbrechen (✕/Zurück/Tap daneben) nichts verändert.
  let draftEntry = JSON.parse(JSON.stringify(session.entries[entryIndex]));

  const existingOverlay = document.getElementById('sessionEntryEditorOverlay');
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'sessionEntryEditorOverlay';
  document.body.appendChild(overlay);
  pushOverlayState(remove);

  function remove(){ const el = document.getElementById('sessionEntryEditorOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); };

  function render(){
    const planEx = plan.exercises.find(x => x.id === draftEntry.exerciseId);
    const isTime = draftEntry.type === 'time';
    const noWeight = !!(planEx && planEx.noWeight);
    // Reihenfolge Wdh vor kg, passend zur Anzeige an anderer Stelle in der App (z. B.
    // "10×20kg" in der Trainingsdetail-Liste, siehe setsLine weiter unten in dieser Datei).
    const setsHTML = draftEntry.sets.map((set, si) => isTime ? `
      <div class="set-row set-row-time" data-set="${si}">
        <span class="set-idx">${si+1}</span>
        <input type="number" inputmode="numeric" enterkeyhint="done" placeholder="Sekunden" value="${set.seconds ?? ''}" data-field="seconds" data-si="${si}">
        <button class="icon-x" data-removeset="${si}" aria-label="Satz ${si+1} entfernen">✕</button>
      </div>
    ` : `
      <div class="set-row" data-set="${si}">
        <span class="set-idx">${si+1}</span>
        <input type="number" inputmode="numeric" enterkeyhint="done" placeholder="Wdh" value="${set.reps ?? ''}" data-field="reps" data-si="${si}">
        <input type="number" inputmode="decimal" enterkeyhint="done" placeholder="kg" step="0.5" value="${noWeight ? '' : (set.weight ?? '')}" data-field="weight" data-si="${si}" ${noWeight ? 'disabled' : ''}>
        <button class="icon-x" data-removeset="${si}" aria-label="Satz ${si+1} entfernen">✕</button>
      </div>
    `).join('');
    // Kleine graue Spaltenbeschriftung über den Eingabefeldern (Wdh/kg bzw. Sek.), damit
    // klar ist, welches Feld was ist — ohne sich allein auf die Platzhalter zu verlassen.
    const setsHeaderHTML = draftEntry.sets.length ? (isTime ? `
      <div class="sets-header sets-header-time">
        <span class="sets-header-cell">#</span>
        <span class="sets-header-cell">Sek.</span>
        <span class="sets-header-cell"></span>
        <span class="sets-header-cell"></span>
      </div>
    ` : `
      <div class="sets-header">
        <span class="sets-header-cell">#</span>
        <span class="sets-header-cell">Wdh</span>
        <span class="sets-header-cell">kg</span>
        <span class="sets-header-cell"></span>
        <span class="sets-header-cell"></span>
        <span class="sets-header-cell"></span>
      </div>
    `) : '';

    overlay.innerHTML = `
      <div class="add-exercise-modal" style="max-height:none;">
        <div class="add-exercise-modal-header">
          <div class="add-exercise-modal-title">${exerciseNameHTML(draftEntry.name)}</div>
          <button class="add-exercise-modal-close" id="sessionEntryEditorClose" aria-label="Abbrechen">✕</button>
        </div>
        <div class="new-exercise-modal-body">
          <button class="btn btn-ghost" id="sessionEntryEditorSwap" style="width:100%; margin-bottom:14px;">Übung austauschen</button>
          ${setsHeaderHTML}
          <div class="sets" id="sessionEntryEditorSets">${setsHTML}</div>
          <div class="add-set-row">
            <button class="add-set" id="sessionEntryEditorAddSet" aria-label="Satz hinzufügen">+</button>
          </div>
        </div>
        <div class="add-exercise-modal-header" style="border-top:1px solid var(--border); border-bottom:none; gap:10px;">
          <button class="btn btn-primary" id="sessionEntryEditorSave" style="flex:1;">Speichern</button>
        </div>
      </div>
    `;
    wire();
  }

  function wire(){
    document.getElementById('sessionEntryEditorClose').onclick = close;
    overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
    document.getElementById('sessionEntryEditorSwap').onclick = () => {
      openSessionEntryExercisePicker(draftEntry, (newEntry) => {
        draftEntry = newEntry;
        render();
      });
    };
    document.getElementById('sessionEntryEditorAddSet').onclick = () => {
      draftEntry.sets.push(draftEntry.type === 'time' ? { seconds: null, done: true } : { reps: null, weight: null, done: true });
      render();
    };
    document.querySelectorAll('#sessionEntryEditorSets [data-removeset]').forEach(btn => {
      btn.onclick = () => {
        const si = Number(btn.dataset.removeset);
        draftEntry.sets.splice(si, 1);
        render();
      };
    });
    document.querySelectorAll('#sessionEntryEditorSets input[data-field]').forEach(input => {
      input.oninput = () => {
        const si = Number(input.dataset.si);
        const field = input.dataset.field;
        draftEntry.sets[si][field] = input.value === '' ? null : Number(input.value);
      };
    });
    document.getElementById('sessionEntryEditorSave').onclick = async () => {
      const cleanedSets = draftEntry.sets.filter(s => Object.entries(s).some(([k,v]) => k !== 'done' && v !== null && v !== undefined && v !== ''));
      if (!cleanedSets.length){
        if (!confirm('Keine Sätze mehr übrig — diese Übung komplett aus der Einheit entfernen?')) return;
        session.entries.splice(entryIndex, 1);
      } else {
        session.entries[entryIndex] = {
          exerciseId: draftEntry.exerciseId,
          name: draftEntry.name,
          type: draftEntry.type,
          target: draftEntry.target,
          sets: cleanedSets.map(s => ({ ...s, done: true }))
        };
      }
      await saveSessionAt(session);
      rebuildLastPerformance();
      await saveJSON('lastPerformance', lastPerformance);
      close();
      renderSessionDetail(session.id);
    };
  }

  render();
}

// Übungsauswahl beim Austauschen einer Übung in einer bereits gespeicherten Einheit (siehe
// openSessionEntryEditor). Zeigt bewusst ALLE Planübungen (kein Ausschluss bereits in der
// Einheit vorhandener Übungen wie beim "Übung hinzufügen"-Picker im laufenden Training) —
// ein Tausch auf eine anderswo in derselben Einheit schon vorhandene Übung ist erlaubt.
// Nach Auswahl liefert onPick(newEntry) eine frische Übung mit leeren kg/Wdh-Feldern (bzw.
// Sekunden), Anzahl Sätze wird von der bisherigen Übung übernommen.
function openSessionEntryExercisePicker(draftEntry, onPick){
  const existingOverlay = document.getElementById('sessionEntrySwapOverlay');
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay';
  overlay.id = 'sessionEntrySwapOverlay';

  function listHTML(filterText){
    const q = (filterText || '').trim().toLowerCase();
    const filtered = q
      ? plan.exercises.filter(x => x.name.toLowerCase().includes(q) || (x.muscleGroup||'').toLowerCase().includes(q) || (x.mainMuscle||'').toLowerCase().includes(q))
      : plan.exercises;
    if (!filtered.length) return '<div class="history-empty">Keine Übungen gefunden.</div>';
    const groups = {};
    filtered.forEach(x => { const g = x.muscleGroup || 'Sonstige'; (groups[g] = groups[g] || []).push(x); });
    const ordered = MUSCLE_GROUP_ORDER.filter(g => groups[g] && groups[g].length);
    Object.keys(groups).forEach(g => { if (!ordered.includes(g)) ordered.push(g); });
    return ordered.map(g => `
      <div class="add-exercise-group-label">${g}</div>
      ${groups[g].map(x => `
        <div class="add-exercise-row" data-pickex="${x.id}" role="button" tabindex="0">
          ${x.imageData ? `<img class="add-exercise-thumb" src="${x.imageData}" alt="">` : `<span class="add-exercise-thumb-fallback">${initials(x.name)}</span>`}
          <div class="add-exercise-mid">
            <div class="add-exercise-name">${exerciseNameHTML(x.name)}</div>
            <div class="add-exercise-meta">${x.mainMuscle || x.muscleGroup || ''}</div>
          </div>
        </div>
      `).join('')}
    `).join('');
  }

  overlay.innerHTML = `
    <div class="add-exercise-modal">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">Übung austauschen</div>
        <button class="add-exercise-modal-close" id="sessionEntrySwapClose" aria-label="Schließen">✕</button>
      </div>
      <div class="add-exercise-modal-body">
        <input type="text" id="sessionEntrySwapSearch" class="plan-search" placeholder="Übung oder Muskel suchen…" style="margin-bottom:14px;">
        <div id="sessionEntrySwapList">${listHTML('')}</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // WICHTIG: hier bewusst KEIN pushOverlayState() — dieses Popup liegt über dem noch
  // offenen "Übung bearbeiten"-Popup (openSessionEntryEditor), dessen History-Eintrag
  // bleibt bestehen. Ein zusätzlicher eigener Eintrag würde beim Schließen dieses
  // Sub-Popups über popOverlayStateIfOpen()/history.back() den globalen popstate-Handler
  // fälschlich einen "echten Zurück"-Schritt ausführen lassen (overlayCloseStack ist dann
  // noch nicht leer, siehe Handler), wodurch das dahinterliegende Bearbeiten-Popup
  // versehentlich mitschließt. Stattdessen wird nur der oberste Zurück-Handler
  // vorübergehend ersetzt (gleiches Muster wie bei der Rahmenfarbe-Auswahl aus dem
  // Kategorie-Popup) und beim Schließen wieder auf den ursprünglichen zurückgesetzt.
  const parentCloseFn = overlayCloseStack.length ? overlayCloseStack[overlayCloseStack.length - 1] : null;
  function pickerClose(){
    remove();
    if (parentCloseFn){
      if (overlayCloseStack.length) overlayCloseStack[overlayCloseStack.length - 1] = parentCloseFn;
      else overlayCloseStack.push(parentCloseFn);
    }
  }
  if (overlayCloseStack.length) overlayCloseStack[overlayCloseStack.length - 1] = pickerClose;
  else overlayCloseStack.push(pickerClose);

  function remove(){ const el = document.getElementById('sessionEntrySwapOverlay'); if (el) el.remove(); }
  const close = pickerClose;

  function wireRows(){
    document.querySelectorAll('#sessionEntrySwapList [data-pickex]').forEach(row => {
      row.onclick = () => {
        const ex = plan.exercises.find(x => x.id === row.dataset.pickex);
        if (!ex) return;
        const newType = ex.type === 'time' ? 'time' : 'reps';
        const setCount = Math.max(1, draftEntry.sets.length || ex.sets || 3);
        // Bisherige Werte je Satz übernehmen (gleicher Index), damit man beim Austauschen
        // nicht wieder bei leeren Feldern anfängt — nur sinnvoll, wenn beide Übungen
        // denselben Typ haben (Wdh/kg <-> Wdh/kg bzw. Sekunden <-> Sekunden).
        const sameType = draftEntry.type === newType;
        const newSets = Array.from({length: setCount}, (_, idx) => {
          const prev = sameType ? (draftEntry.sets[idx] || {}) : {};
          return newType === 'time'
            ? { seconds: prev.seconds ?? null, done: true }
            : { reps: prev.reps ?? null, weight: prev.weight ?? null, done: true };
        });
        const newEntry = {
          exerciseId: ex.id,
          name: ex.name,
          type: newType,
          target: newType === 'time'
            ? { sets: ex.sets, secondsMin: ex.secondsMin, secondsMax: ex.secondsMax }
            : { sets: ex.sets, repsMin: ex.repsMin, repsMax: ex.repsMax, weight: ex.weight },
          sets: newSets
        };
        close();
        onPick(newEntry);
      };
    });
  }
  wireRows();
  document.getElementById('sessionEntrySwapSearch').oninput = (ev) => {
    document.getElementById('sessionEntrySwapList').innerHTML = listHTML(ev.target.value);
    wireRows();
  };
  document.getElementById('sessionEntrySwapClose').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
}

