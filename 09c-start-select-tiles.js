/* ---------------------------------------------------
   09c-start-select-tiles.js
   ---------------------------------------------------
   Teil 3/3 der ehemals einzelnen 09-start-select.js — reiner Dateigrößen-
   Split ohne inhaltliche Änderung, siehe Kopf von 09a-start-select.js.
   Läuft nach 09a/09b.
   Inhalt: "Kachel hinzufügen"-Dialog, Aufbau eigener Modus-Varianten,
   Muskelgruppen-Reihenfolge (Drag & Drop), renderModeEdit() sowie
   renderFreeSelect() (freie Übungsauswahl).
--------------------------------------------------- */
function openAddTilePrompt(){
  const hidden = START_TILE_IDS.filter(id => id !== 'frei' && isStartTileHidden(id));
  const canCreateCustom = customCategories().length < MAX_CUSTOM_CATEGORIES;
  if (!hidden.length && !canCreateCustom){
    alert('Es sind bereits alle möglichen Kategorien vorhanden.');
    return;
  }

  // WICHTIG: Der komplette Wizard (Schritt 1 + Schritt 2) teilt sich EINEN einzigen
  // History-Eintrag (einmal pushOverlayState() beim allerersten Öffnen). Schritt 1 → 2
  // wechselt NUR den Inhalt des Overlays (removeOverlay() + neues innerHTML), OHNE dabei
  // selbst nochmal history.back()/pushState() aufzurufen — das vorherige Verhalten (jeder
  // Schritt pusht/poppt seinen eigenen Eintrag) führte zu einer Race Condition zwischen dem
  // asynchronen history.back() und dem direkt danach folgenden pushState(), wodurch der
  // History-Stack durcheinandergeriet und "Speichern" in Schritt 2 nicht mehr zuverlässig
  // zur aktualisierten Kachel-Ansicht zurückfand.
  function removeOverlay(){
    const el = document.getElementById('addTileOverlay');
    if (el) el.remove();
  }
  function closeWizard(){
    popOverlayStateIfOpen();
    removeOverlay();
  }

  function renderStep1(){
    removeOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'add-exercise-overlay centered-overlay';
    overlay.id = 'addTileOverlay';
    overlay.innerHTML = `
      <div class="add-exercise-modal" style="max-height:none;">
        <div class="add-exercise-modal-header">
          <div class="add-exercise-modal-title">Kachel hinzufügen</div>
          <button class="add-exercise-modal-close" id="addTileClose" aria-label="Abbrechen">✕</button>
        </div>
        <div class="new-exercise-modal-body">
          <div class="wizard-choice-list">
            ${hidden.map(id => `<button class="wizard-choice" data-add-tile="${id}">${modeDisplayLabel(id)}</button>`).join('')}
            ${canCreateCustom ? `<button class="wizard-choice" id="addTileCustomNew">+ Neue Kategorie erstellen</button>` : ''}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('addTileClose').onclick = closeWizard;
    const customNewBtn = document.getElementById('addTileCustomNew');
    if (customNewBtn) customNewBtn.onclick = renderStepCustomName;
    overlay.querySelectorAll('[data-add-tile]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.addTile;
        // Bei "Unterkörper" ist eine Pool-Auswahl redundant: Unterkörper- und Legs-Übungen
        // sind praktisch dieselbe Menge (siehe Push/Pull/Legs-Zuordnung), Push/Pull/Ganzkörper/
        // Oberkörper würden hier ohnehin nie sinnvoll gewählt — daher direkt mit dem
        // naheliegenden "Nur Unterkörper-Übungen"-Filter anlegen, ohne zweiten Schritt.
        if (id === 'unterkoerper'){
          if (plan.startTileHidden) delete plan.startTileHidden[id];
          if (!plan.modeSettings) plan.modeSettings = {};
          if (!plan.modeSettings[id]) plan.modeSettings[id] = {};
          plan.modeSettings[id].poolFilter = 'unterkoerper';
          await saveJSON('plan', plan);
          closeWizard();
          renderStartSelect();
          return;
        }
        renderStep2(id);
      };
    });
    overlay.onclick = (ev) => { if (ev.target === overlay) closeWizard(); };
  }

  // Zwischenschritt nur für komplett neue Custom-Kategorien: Name eingeben, bevor es mit dem
  // normalen Übungspool-Schritt (renderStep2) weitergeht. Die id wird hier bereits final
  // generiert (uid()-basiert wie überall sonst in der App) und in plan.customCategories
  // eingetragen — falls die Person danach doch abbricht, bleibt eine Kategorie ohne Pool-
  // Filter zurück, das ist unkritisch (poolFilter fällt dann auf 'all' zurück, siehe
  // modePoolFilter()).
  function renderStepCustomName(){
    removeOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'add-exercise-overlay centered-overlay';
    overlay.id = 'addTileOverlay';
    overlay.innerHTML = `
      <div class="add-exercise-modal" style="max-height:none;">
        <div class="add-exercise-modal-header">
          <div class="add-exercise-modal-title">Neue Kategorie</div>
          <button class="add-exercise-modal-close" id="addTileClose3" aria-label="Abbrechen">✕</button>
        </div>
        <div class="new-exercise-modal-body">
          <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:6px;">Name</label>
          <input type="text" id="addTileCustomNameInput" placeholder="z. B. Push, Cardio, Arme" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:16px;">
        </div>
        <div class="add-exercise-modal-header" style="border-top:1px solid var(--border); border-bottom:none; gap:10px;">
          <button class="btn btn-ghost" id="addTileBack3" style="flex:1;">‹ Zurück</button>
          <button class="btn btn-primary" id="addTileCustomNext" style="flex:1;">Weiter</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = document.getElementById('addTileCustomNameInput');
    input.focus();
    document.getElementById('addTileClose3').onclick = closeWizard;
    document.getElementById('addTileBack3').onclick = renderStep1;
    const submit = async () => {
      const name = input.value.trim();
      if (!name){ alert('Bitte einen Namen eintragen.'); return; }
      const id = 'custom-' + uid();
      if (!plan.customCategories) plan.customCategories = [];
      plan.customCategories.push({ id, label: name });
      await saveJSON('plan', plan);
      renderStep2(id);
    };
    input.onkeydown = (ev) => { if (ev.key === 'Enter'){ ev.preventDefault(); input.blur(); submit(); } };
    document.getElementById('addTileCustomNext').onclick = submit;
    overlay.onclick = (ev) => { if (ev.target === overlay) closeWizard(); };
  }

  // Zweiter Schritt: Übungspool für die neu hinzugefügte Kachel direkt mit auswählen —
  // dasselbe Optionsset wie im bestehenden Kategorie-Bearbeiten-Popup (openModeSettingsPrompt),
  // hier aber gleich beim Anlegen statt erst danach separat per Long-Press erreichbar. Bei
  // "Oberkörper" werden nur die drei tatsächlich sinnvollen Optionen gezeigt (Unterkörper/
  // Legs/Ganzkörper würden dort nie gewählt) — "Ganzkörper" und neue Custom-Kategorien
  // behalten die volle Auswahl, da dort jede Kombination denkbar ist.
  function renderStep2(id){
    removeOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'add-exercise-overlay centered-overlay';
    overlay.id = 'addTileOverlay';
    const allPoolOptions = [
      { value: 'all', label: 'Alle Übungen' },
      { value: 'oberkoerper', label: 'Nur Oberkörper-Übungen' },
      { value: 'unterkoerper', label: 'Nur Unterkörper-Übungen' },
      { value: 'push', label: 'Nur Push-Übungen' },
      { value: 'pull', label: 'Nur Pull-Übungen' },
      { value: 'legs', label: 'Nur Legs-Übungen (Beine + unterer Rücken)' },
    ];
    const poolOptions = id === 'oberkoerper'
      ? [
          { value: 'oberkoerper', label: 'Alle Oberkörper-Übungen' },
          { value: 'push', label: 'Nur Push-Übungen' },
          { value: 'pull', label: 'Nur Pull-Übungen' },
        ]
      : allPoolOptions;
    overlay.innerHTML = `
      <div class="add-exercise-modal" style="max-height:none;">
        <div class="add-exercise-modal-header">
          <div class="add-exercise-modal-title">Übungen zur Auswahl</div>
          <button class="add-exercise-modal-close" id="addTileClose2" aria-label="Abbrechen">✕</button>
        </div>
        <div class="new-exercise-modal-body">
          <div class="wizard-choice-list">
            ${poolOptions.map(o => `<button class="wizard-choice" data-add-tile-pool="${o.value}">${o.label}</button>`).join('')}
          </div>
        </div>
        <div class="add-exercise-modal-header" style="border-top:1px solid var(--border); border-bottom:none;">
          <button class="btn btn-ghost" id="addTileBack" style="width:100%;">‹ Zurück</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('addTileClose2').onclick = closeWizard;
    document.getElementById('addTileBack').onclick = renderStep1;
    overlay.querySelectorAll('[data-add-tile-pool]').forEach(btn => {
      btn.onclick = async () => {
        if (plan.startTileHidden) delete plan.startTileHidden[id];
        if (!plan.modeSettings) plan.modeSettings = {};
        if (!plan.modeSettings[id]) plan.modeSettings[id] = {};
        plan.modeSettings[id].poolFilter = btn.dataset.addTilePool;
        await saveJSON('plan', plan);
        closeWizard();
        renderStartSelect();
      };
    });
    overlay.onclick = (ev) => { if (ev.target === overlay) closeWizard(); };
  }

  pushOverlayState(closeWizard);
  renderStep1();
}

let modeEditData = null; // { A: {selected:Set, order:[]}, B: {selected:Set, order:[]} }
let modeEditTab = 'A';

function buildModeEditVariant(ids, mode){
  const poolFilter = modePoolFilter(mode);
  const isBodyPartFilter = (poolFilter === 'push' || poolFilter === 'pull' || poolFilter === 'legs');
  const pool = poolFilter === 'all'
    ? plan.exercises
    : isBodyPartFilter
      ? plan.exercises.filter(e => e.bodyPart === poolFilter)
      : plan.exercises.filter(e => e.category === poolFilter);
  const allIds = new Set(pool.map(e => e.id));
  const ungrouped = (poolFilter === 'oberkoerper' || poolFilter === 'unterkoerper' || isBodyPartFilter);
  const savedOrder = ids.filter(id => allIds.has(id));
  const groups = {};

  if (ungrouped){
    const muscleGroupIndex = g => {
      const i = MUSCLE_GROUP_ORDER.indexOf(g);
      return i === -1 ? MUSCLE_GROUP_ORDER.length : i;
    };
    const defaultSortedIds = [...pool].sort((a, b) => muscleGroupIndex(a.muscleGroup) - muscleGroupIndex(b.muscleGroup)).map(e => e.id);
    if (savedOrder.length){
      // Es existiert bereits eine eigene, ggf. quer über Muskelgruppen gemischte Reihenfolge
      // (z. B. durch Drag&Drop entstanden) — die bleibt beim erneuten Öffnen exakt erhalten,
      // statt wieder strikt nach Muskelgruppe sortiert zu werden. Noch nicht ausgewählte
      // Übungen (zum Stöbern/Hinzufügen) werden dahinter nach Muskelgruppe sortiert angehängt.
      const remaining = defaultSortedIds.filter(id => !savedOrder.includes(id));
      groups._all = [...savedOrder, ...remaining];
    } else {
      // Noch keine eigene Auswahl getroffen: die aktuelle Standard-Reihenfolge (nach
      // Muskelgruppe sortiert) dient als Ausgangspunkt.
      groups._all = defaultSortedIds;
    }
  } else {
    pool.forEach(ex => {
      const g = ex.muscleGroup || 'Sonstige';
      (groups[g] = groups[g] || []).push(ex.id);
    });
    // bereits gespeicherte Reihenfolge innerhalb jeder Muskelgruppen-Sektion respektieren
    Object.keys(groups).forEach(g => {
      groups[g].sort((a, b) => {
        const ia = savedOrder.indexOf(a), ib = savedOrder.indexOf(b);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    });
  }

  return {
    selected: new Set(savedOrder),
    groups,
    ungrouped
  };
}

let modeGroupOpen = new Set();

// Ermittelt die vollständige Reihenfolge aller Muskelgruppen für einen Modus: die zuletzt
// gespeicherte, per Drag angepasste Reihenfolge (plan.modeSettings[mode].groupOrder), ergänzt
// um eventuell neue Gruppen aus MUSCLE_GROUP_ORDER, die darin noch fehlen (am Ende angehängt).
function fullGroupOrder(mode){
  const stored = plan.modeSettings && plan.modeSettings[mode] && Array.isArray(plan.modeSettings[mode].groupOrder)
    ? plan.modeSettings[mode].groupOrder : null;
  const base = (stored && stored.length) ? stored.slice() : MUSCLE_GROUP_ORDER.slice();
  MUSCLE_GROUP_ORDER.forEach(g => { if (!base.includes(g)) base.push(g); });
  return base;
}

// Generischer Long-Press-Drag für Muskelgruppen-Akkordeons (Kopfzeilen), analog zum Muster
// von wireModeRowDrag()/wireFreeRowDrag() für einzelne Übungszeilen — nur eine Ebene höher.
// Sobald der Long-Press greift, werden ALLE Gruppen eingeklappt (einheitliche Kopfzeilenhöhe
// nötig für die Positions-Mathematik) und der Container neu gerendert; danach wird per
// window-weiten Pointer-Listenern weitergezogen (unabhängig von den beim Neu-Rendern
// ausgetauschten DOM-Knoten). Ein einfaches Antippen ohne Halten klappt die Gruppe wie gewohnt
// auf/zu. opts: { openSet: Set<string>, rerender: () => void, commitOrder: (newVisibleOrder: string[]) => void }
function wireMuscleGroupReorder(containerSelector, opts){
  const LONG_PRESS_MS = 350;
  const MOVE_CANCEL_PX = 18;
  const container = document.querySelector(containerSelector);
  if (!container) return;

  container.querySelectorAll(':scope > .muscle-group > .muscle-group-header').forEach(header => {
    const group = header.dataset.group;
    let pressTimer = null;
    let pointerId = null;
    let startX = 0, startY = 0, lastX = 0, lastY = 0;
    let mode = 'pending';
    let fromIndex = -1, targetIndex = -1;
    let rowHeight = 0;
    let dragEl = null;
    let visibleOrder = null;

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
        if (opts.openSet.has(group)) opts.openSet.delete(group); else opts.openSet.add(group);
        opts.rerender();
      }
    };
    const onCancel = (ev) => { if (ev.pointerId !== pointerId) return; cleanupListeners(); };

    header.addEventListener('pointerdown', (e) => {
      pointerId = e.pointerId;
      startX = e.clientX; startY = e.clientY;
      lastX = startX; lastY = startY;
      mode = 'pending';
      fromIndex = -1; targetIndex = -1;
      dragEl = null; visibleOrder = null;

      pressTimer = setTimeout(() => {
        if (mode !== 'pending') return;
        opts.openSet.clear();
        opts.rerender();
        const freshHeader = container.querySelector(`.muscle-group-header[data-group="${CSS.escape(group)}"]`);
        dragEl = freshHeader ? freshHeader.closest('.muscle-group') : null;
        if (!dragEl) return;
        visibleOrder = Array.from(container.querySelectorAll(':scope > .muscle-group'))
          .map(g => g.querySelector('.muscle-group-header').dataset.group);
        fromIndex = visibleOrder.indexOf(group);
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

function renderModeEdit(mode, startTab){
  const collapsed = isSplitCollapsed(mode);
  modeEditTab = (!collapsed && startTab === 'B') ? 'B' : 'A';
  modeGroupOpen = new Set();
  modeEditData = {
    A: buildModeEditVariant(getModeExerciseIds(mode, 'A'), mode),
    B: buildModeEditVariant(getModeExerciseIds(mode, 'B'), mode)
  };
  // Reihenfolge der Muskelgruppen-Akkordeons — gilt gemeinsam für Split A und B (welche
  // Muskelgruppe zuerst trainiert wird, ist eine Eigenschaft der Kategorie, nicht des
  // einzelnen Splits) und lässt sich per Long-Press-Drag auf den Akkordeon-Kopfzeilen
  // verändern (siehe wireMuscleGroupReorder unten); wird erst mit "Speichern" persistiert.
  let groupOrder = fullGroupOrder(mode);
  const label = modeDisplayLabel(mode);

  app.innerHTML = `
    <div class="brand">
      <h1>${label} bearbeiten</h1>
    </div>
    <div class="back-row">
      <button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>
    ${collapsed ? '' : `
    <div class="period-row" id="modeEditTabs">
      <button class="period-btn ${modeEditTab === 'A' ? 'active' : ''}" data-tab="A">Split A</button>
      <button class="period-btn ${modeEditTab === 'B' ? 'active' : ''}" data-tab="B">Split B</button>
    </div>
    `}
    <div id="modeEditRows"></div>
    <button class="btn btn-primary" id="btnSaveMode" style="margin-top:8px;">Speichern</button>
  `;

  function renderTabs(){
    document.querySelectorAll('#modeEditTabs .period-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === modeEditTab);
    });
  }

  function orderedGroupNames(groups){
    const ordered = groupOrder.filter(g => groups[g] && groups[g].length);
    Object.keys(groups).forEach(g => { if (groups[g] && groups[g].length && !ordered.includes(g)) ordered.push(g); });
    return ordered;
  }

  function itemRowHTML(id, g, state){
    const ex = plan.exercises.find(e => e.id === id);
    if (!ex) return '';
    const img = ex.imageData;
    const muscleLabel = ex.mainMuscle || ex.muscleGroup || '';
    return `
      <div class="free-row ${state.selected.has(id) ? 'checked' : ''}" data-id="${id}" data-group="${g}">
        <div class="free-row-check">✓</div>
        <div class="free-row-media">
          ${img ? `<img class="free-row-thumb" src="${img}" alt="">` : `<span class="free-row-thumb-fallback">${initials(ex.name)}</span>`}
        </div>
        <div class="free-row-mid">
          <div class="free-row-name">${exerciseNameHTML(ex.name)}</div>
          <div class="free-row-muscle">${muscleLabel}</div>
        </div>
      </div>
    `;
  }

  function renderRows(){
    const state = modeEditData[modeEditTab];
    const container = document.getElementById('modeEditRows');

    if (state.ungrouped){
      const ids = state.groups._all || [];
      if (!ids.length){
        container.innerHTML = '<div class="history-empty">Noch keine Übungen im Plan.</div>';
        return;
      }
      container.innerHTML = ids.map(id => itemRowHTML(id, '_all', state)).join('');
      wireModeRowDrag(state);
      return;
    }

    const groupNames = orderedGroupNames(state.groups);
    if (!groupNames.length){
      container.innerHTML = '<div class="history-empty">Noch keine Übungen im Plan.</div>';
      return;
    }
    container.innerHTML = groupNames.map(g => {
      const ids = state.groups[g];
      const isOpen = modeGroupOpen.has(g);
      const selCount = ids.filter(id => state.selected.has(id)).length;
      const itemsHTML = ids.map(id => itemRowHTML(id, g, state)).join('');
      return `
        <div class="muscle-group">
          <button class="muscle-group-header" data-group="${g}" type="button">
            <span class="mg-name">${g}</span>
            <span class="mg-meta">${selCount ? selCount + '/' : ''}${ids.length} Übung${ids.length === 1 ? '' : 'en'} <span class="mg-arrow">${isOpen ? '▾' : '▸'}</span></span>
          </button>
          <div class="muscle-group-body" style="display:${isOpen ? 'block' : 'none'}">
            ${itemsHTML}
          </div>
        </div>
      `;
    }).join('');

    wireMuscleGroupReorder('#modeEditRows', {
      openSet: modeGroupOpen,
      rerender: renderRows,
      commitOrder: (newVisibleOrder) => {
        groupOrder = [...newVisibleOrder, ...groupOrder.filter(g => !newVisibleOrder.includes(g))];
        renderRows();
      }
    });

    wireModeRowDrag(state);
  }

  function wireModeRowDrag(state){
    const LONG_PRESS_MS = 350;
    const MOVE_CANCEL_PX = 18;
    const rowStep = 68;

    document.querySelectorAll('#modeEditRows .free-row').forEach(el => {
      el.addEventListener('pointerdown', (e) => {
        const group = el.dataset.group;
        const id = el.dataset.id;
        const arr = state.groups[group];
        const fromIndex = arr.indexOf(id);
        let targetIndex = fromIndex;
        const startX = e.clientX, startY = e.clientY;
        let lastX = startX, lastY = startY;
        let mode2 = 'pending';

        const groupEls = () => Array.from(document.querySelectorAll(`#modeEditRows .free-row[data-group="${CSS.escape(group)}"]`));

        const longPressTimer = setTimeout(() => {
          if (mode2 !== 'pending') return;
          mode2 = 'armed';
          try{ el.setPointerCapture(e.pointerId); }catch(err){}
          el.style.transition = 'transform .1s ease';
          el.style.transform = 'scale(1.02)';
          if (navigator.vibrate) navigator.vibrate(10);
        }, LONG_PRESS_MS);

        const onMove = (ev) => {
          const dyStep = ev.clientY - lastY;
          const dxStep = ev.clientX - lastX;
          lastX = ev.clientX; lastY = ev.clientY;

          if (mode2 === 'pending'){
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            if (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX){
              mode2 = 'scrolling';
              clearTimeout(longPressTimer);
              window.scrollBy(0, -dyStep);
            }
            return;
          }
          if (mode2 === 'scrolling'){
            window.scrollBy(0, -dyStep);
            return;
          }
          if (mode2 === 'armed'){
            mode2 = 'dragging';
            el.style.transition = 'none';
            el.style.zIndex = 5;
            groupEls().forEach(t => { if (t !== el) t.style.transition = 'transform .18s ease'; });
          }
          ev.preventDefault();
          const dy = ev.clientY - startY;
          el.style.transform = `translateY(${dy}px) scale(1.03)`;
          el.style.boxShadow = '0 8px 16px rgba(0,0,0,0.4)';

          const shift = Math.round(dy / rowStep);
          const newTarget = Math.max(0, Math.min(arr.length - 1, fromIndex + shift));
          if (newTarget !== targetIndex){
            targetIndex = newTarget;
            groupEls().forEach((t, i) => {
              if (t === el) return;
              let offset = 0;
              if (fromIndex < targetIndex && i > fromIndex && i <= targetIndex) offset = -rowStep;
              else if (fromIndex > targetIndex && i < fromIndex && i >= targetIndex) offset = rowStep;
              t.style.transform = offset ? `translateY(${offset}px)` : '';
            });
          }
        };

        const finish = () => {
          clearTimeout(longPressTimer);
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onUp);
          el.removeEventListener('pointercancel', onCancel);
          groupEls().forEach(t => { t.style.transform = ''; t.style.transition = ''; t.style.boxShadow = ''; t.style.zIndex = ''; });
        };
        const onUp = () => {
          const finalMode = mode2;
          finish();
          if (finalMode === 'dragging' && targetIndex !== fromIndex){
            const [moved] = arr.splice(fromIndex, 1);
            arr.splice(targetIndex, 0, moved);
            renderRows();
          } else if (finalMode !== 'scrolling'){
            if (state.selected.has(id)){
              state.selected.delete(id);
            } else {
              state.selected.add(id);
            }
            renderRows();
          }
        };
        const onCancel = () => { finish(); };

        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onCancel);
      });
    });
  }
  renderRows();

  document.querySelectorAll('#modeEditTabs .period-btn').forEach(btn => {
    btn.onclick = () => {
      modeEditTab = btn.dataset.tab;
      renderTabs();
      renderRows();
    };
  });

  document.getElementById('btnBack').onclick = () => history.back();
  document.getElementById('btnSaveMode').onclick = async () => {
    if (!plan.modeLists) plan.modeLists = {};
    if (!plan.modeSettings) plan.modeSettings = {};
    if (!plan.modeSettings[mode]) plan.modeSettings[mode] = {};
    plan.modeSettings[mode].groupOrder = groupOrder;
    // Reihenfolge = die Anzeige-Reihenfolge in diesem Bearbeiten-Screen (nach der aktuellen
    // Muskelgruppen-Reihenfolge sortiert, innerhalb einer Gruppe zusätzlich per Drag manuell
    // anpassbar) — genau diese Reihenfolge soll später auch im Training gelten, nicht die
    // Reihenfolge, in der die Häkchen gesetzt wurden.
    const flatten = state => {
      if (state.ungrouped){
        return (state.groups._all || []).filter(id => state.selected.has(id));
      }
      const result = [];
      orderedGroupNames(state.groups).forEach(g => {
        (state.groups[g] || []).forEach(id => { if (state.selected.has(id)) result.push(id); });
      });
      return result;
    };
    plan.modeLists[mode] = {
      A: flatten(modeEditData.A),
      B: flatten(modeEditData.B)
    };
    await saveJSON('plan', plan);
    history.back();
  };
}

let freeGroups = null;
let freeGroupOpen = new Set();

function renderFreeSelect(){
  freeSelected = new Set();
  freeGroupOpen = new Set();
  let freeSearchQuery = '';
  const groups = {};
  plan.exercises.forEach(ex => {
    const g = ex.muscleGroup || 'Sonstige';
    (groups[g] = groups[g] || []).push(ex.id);
  });
  freeGroups = groups;
  // Reihenfolge der Muskelgruppen-Akkordeons für diese Auswahl — per Long-Press-Drag auf den
  // Kopfzeilen veränderbar (siehe wireMuscleGroupReorder); gilt nur für dieses eine freie
  // Training und startet immer wieder bei der Standardreihenfolge (kein Speichern über
  // einzelne "Frei"-Trainings hinweg nötig, wie bei der Übungsauswahl selbst auch).
  let freeGroupOrder = MUSCLE_GROUP_ORDER.slice();

  app.innerHTML = `
    <div class="brand">
      <h1>Übungen wählen</h1>
    </div>
    <div class="back-row">
      <button class="back-btn-icon" id="btnBack" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>
    <input type="text" id="freeSearch" class="plan-search" placeholder="Übung oder Muskel suchen…" style="margin-bottom:14px;">
    <div id="freeRows"></div>
    <button class="btn btn-primary" id="btnGo" style="margin-top:8px;">Los geht's</button>
  `;

  function matchesFreeSearch(ex){
    if (!freeSearchQuery.trim()) return true;
    const hay = `${ex.name} ${ex.mainMuscle || ''} ${ex.muscleGroup || ''}`.toLowerCase();
    return hay.includes(freeSearchQuery.trim().toLowerCase());
  }

  function orderedGroupNames(){
    const ordered = freeGroupOrder.filter(g => freeGroups[g]);
    Object.keys(freeGroups).forEach(g => { if (!ordered.includes(g)) ordered.push(g); });
    return ordered;
  }

  function renderRows(){
    const container = document.getElementById('freeRows');
    const q = freeSearchQuery.trim();
    const groupNames = orderedGroupNames()
      .map(g => ({ g, ids: freeGroups[g].filter(id => { const ex = plan.exercises.find(e => e.id === id); return ex && matchesFreeSearch(ex); }) }))
      .filter(({ ids }) => ids.length);
    if (!groupNames.length){
      container.innerHTML = `<div class="history-empty">${q ? 'Keine Übungen gefunden.' : 'Noch keine Übungen im Plan.'}</div>`;
      return;
    }
    container.innerHTML = groupNames.map(({ g, ids }) => {
      const isOpen = q ? true : freeGroupOpen.has(g);
      const selCount = ids.filter(id => freeSelected.has(id)).length;
      const itemsHTML = ids.map(id => {
        const ex = plan.exercises.find(e => e.id === id);
        if (!ex) return '';
        const img = ex.imageData;
        const muscleLabel = ex.mainMuscle || ex.muscleGroup || '';
        return `
          <div class="free-row ${freeSelected.has(id) ? 'checked' : ''}" data-id="${id}" data-group="${g}">
            <div class="free-row-check">✓</div>
            <div class="free-row-media">
              ${img ? `<img class="free-row-thumb" src="${img}" alt="">` : `<span class="free-row-thumb-fallback">${initials(ex.name)}</span>`}
            </div>
            <div class="free-row-mid">
              <div class="free-row-name">${exerciseNameHTML(ex.name)}</div>
              <div class="free-row-muscle">${muscleLabel}</div>
            </div>
          </div>
        `;
      }).join('');
      return `
        <div class="muscle-group">
          <button class="muscle-group-header" data-group="${g}" type="button">
            <span class="mg-name">${g}</span>
            <span class="mg-meta">${selCount ? selCount + '/' : ''}${ids.length} Übung${ids.length === 1 ? '' : 'en'} <span class="mg-arrow">${isOpen ? '▾' : '▸'}</span></span>
          </button>
          <div class="muscle-group-body" style="display:${isOpen ? 'block' : 'none'}">
            ${itemsHTML}
          </div>
        </div>
      `;
    }).join('');

    wireMuscleGroupReorder('#freeRows', {
      openSet: freeGroupOpen,
      rerender: renderRows,
      commitOrder: (newVisibleOrder) => {
        freeGroupOrder = [...newVisibleOrder, ...freeGroupOrder.filter(g => !newVisibleOrder.includes(g))];
        renderRows();
      }
    });

    wireFreeRowDrag();
  }

  function wireFreeRowDrag(){
    const LONG_PRESS_MS = 350;
    const MOVE_CANCEL_PX = 18;
    const rowStep = 68; // Zeilenhöhe (60px) + Abstand (8px), muss zur CSS-Lücke passen

    document.querySelectorAll('.free-row').forEach(el => {
      el.addEventListener('pointerdown', (e) => {
        const group = el.dataset.group;
        const id = el.dataset.id;
        const arr = freeGroups[group];
        const fromIndex = arr.indexOf(id);
        let targetIndex = fromIndex;
        const startX = e.clientX, startY = e.clientY;
        let lastX = startX, lastY = startY;
        let mode = 'pending'; // pending -> armed -> dragging, oder pending -> scrolling

        const groupEls = () => Array.from(document.querySelectorAll(`.free-row[data-group="${CSS.escape(group)}"]`));

        const longPressTimer = setTimeout(() => {
          if (mode !== 'pending') return;
          mode = 'armed';
          try{ el.setPointerCapture(e.pointerId); }catch(err){}
          el.style.transition = 'transform .1s ease';
          el.style.transform = 'scale(1.02)';
          if (navigator.vibrate) navigator.vibrate(10);
        }, LONG_PRESS_MS);

        const onMove = (ev) => {
          const dyStep = ev.clientY - lastY;
          const dxStep = ev.clientX - lastX;
          lastX = ev.clientX; lastY = ev.clientY;

          if (mode === 'pending'){
            // Solange die Zeile noch nicht "gehalten" wird (Long-Press-Schwelle nicht
            // erreicht), lässt touch-action:pan-y auf .free-row den Browser das vertikale
            // Scrollen bereits selbst nativ übernehmen (inkl. Momentum) — hier wird nur noch
            // erkannt, WANN sich die Geste als Scrollen entpuppt, um den Drag-Timer abzubrechen.
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            if (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX){
              mode = 'scrolling';
              clearTimeout(longPressTimer);
            }
            return;
          }
          if (mode === 'scrolling'){
            // Native Fortsetzung des Scrollens durch den Browser selbst (touch-action:pan-y) —
            // hier ist nichts mehr zu tun.
            return;
          }
          if (mode === 'armed'){
            mode = 'dragging';
            el.style.transition = 'none';
            el.style.zIndex = 5;
            groupEls().forEach(t => { if (t !== el) t.style.transition = 'transform .18s ease'; });
          }
          ev.preventDefault();
          const dy = ev.clientY - startY;
          el.style.transform = `translateY(${dy}px) scale(1.03)`;
          el.style.boxShadow = '0 8px 16px rgba(0,0,0,0.4)';

          const shift = Math.round(dy / rowStep);
          const newTarget = Math.max(0, Math.min(arr.length - 1, fromIndex + shift));
          if (newTarget !== targetIndex){
            targetIndex = newTarget;
            groupEls().forEach((t, i) => {
              if (t === el) return;
              let offset = 0;
              if (fromIndex < targetIndex && i > fromIndex && i <= targetIndex) offset = -rowStep;
              else if (fromIndex > targetIndex && i < fromIndex && i >= targetIndex) offset = rowStep;
              t.style.transform = offset ? `translateY(${offset}px)` : '';
            });
          }
        };

        const finish = () => {
          clearTimeout(longPressTimer);
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onUp);
          el.removeEventListener('pointercancel', onCancel);
          groupEls().forEach(t => { t.style.transform = ''; t.style.transition = ''; t.style.boxShadow = ''; t.style.zIndex = ''; });
        };
        const onUp = () => {
          const finalMode = mode;
          finish();
          if (finalMode === 'dragging' && targetIndex !== fromIndex){
            const [moved] = arr.splice(fromIndex, 1);
            arr.splice(targetIndex, 0, moved);
            renderRows();
          } else if (finalMode !== 'scrolling'){
            if (freeSelected.has(id)) freeSelected.delete(id); else freeSelected.add(id);
            renderRows();
          }
        };
        const onCancel = () => { finish(); };

        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onCancel);
      });
    });
  }
  renderRows();

  document.getElementById('freeSearch').oninput = (e) => {
    freeSearchQuery = e.target.value;
    renderRows();
  };
  document.getElementById('btnBack').onclick = () => history.back();
  document.getElementById('btnGo').onclick = () => {
    const orderedIds = orderedGroupNames().flatMap(g => freeGroups[g]);
    const list = orderedIds.filter(id => freeSelected.has(id)).map(id => plan.exercises.find(e => e.id === id));
    if (!list.length){ alert('Bitte mindestens eine Übung auswählen.'); return; }
    startSession(list, null, 'frei');
  };
}

