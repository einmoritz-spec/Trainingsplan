/* ---------------------------------------------------
   SCROLL-WHEEL ZAHLENEINGABE (Einstellungen-Schalter)
--------------------------------------------------- */
// Alternative Eingabemethode für alle Zahlenfelder in der App (Sätze, Wdh, kg, Sekunden,
// Körpergewicht, Reset-Code): statt der System-Tastatur öffnet sich ein Scroll-Rad
// (wie man es z. B. von iOS-Datumsauswahl oder Timer-Pickern kennt), fließend animiert
// per CSS scroll-snap. Wird global über einen einzigen focusin-Listener auf document
// verkabelt (siehe wireScrollWheelInputs()), damit jedes bestehende und jedes neu
// gerenderte input[type="number"] automatisch erfasst wird — keine einzelne Render-
// Funktion muss dafür angepasst werden.
let scrollWheelActiveInput = null;

// Zentrale Quelle für den aktuell gewählten alternativen Zahleneingabe-Modus: 'system'
// (normale Gerätetastatur, Standard/Fallback), 'wheel' (Scroll-Rad) oder 'keypad'
// (eigener großer Ziffernblock) — in den Einstellungen umschaltbar, siehe renderSettings().
// Beide Alternativmodi schließen sich gegenseitig aus (immer nur einer aktiv).
function numberInputMode(){
  const m = plan && plan.numberInputMode;
  if (m === 'wheel' || m === 'keypad' || m === 'combo' || m === 'system') return m;
  return 'keypad'; // Standardmäßig aktiviert, statt der normalen System-Tastatur
}
function isScrollWheelInputEnabled(){
  return numberInputMode() === 'wheel';
}
function isKeypadInputEnabled(){
  return numberInputMode() === 'keypad';
}

// Ermittelt für ein gegebenes Zahlenfeld einen sinnvollen Wertebereich und eine
// Schrittweite, damit das Rad weder zu grob (kg in 1er-Schritten bis 999) noch zu fein
// (Sätze in 0.5er-Schritten) wird. Fällt auf min/max/step-Attribute des <input> zurück,
// wo vorhanden, sonst auf plausible Defaults je nach data-field/id.
function scrollWheelRangeFor(input){
  const field = input.dataset.field || input.id || '';
  const attrMin = input.min !== '' ? Number(input.min) : null;
  const attrStep = input.step !== '' && input.step !== undefined ? Number(input.step) : null;
  let min = attrMin ?? 0;
  let max = 300;
  let step = attrStep && !isNaN(attrStep) ? attrStep : 1;

  if (/weight|kg|bodyWeight/i.test(field)){
    min = 0;
    // Trainingsgewicht (an Geräten/mit Hanteln bewegtes Gewicht) endet bei 150kg — das
    // Körpergewicht-Feld in den Einstellungen ("bodyWeight") kann dagegen durchaus darüber
    // liegen und behält den größeren Bereich.
    max = /bodyWeight/i.test(field) ? 300 : 150;
    // An Geräten/Maschinen wird das Gewicht praktisch immer in 5kg-Stufen eingestellt —
    // nur bei echten (Kurz-/Lang-)Hantel-Übungen sind feinere 0,5-2,5kg-Schritte üblich
    // (kleine Scheiben/Kurzhantel-Sätze). Erkennung anhand des Übungsnamens, da es dafür
    // aktuell kein eigenes Datenfeld gibt; ohne erkennbaren Übungsnamen (z. B. Körpergewicht-
    // Feld in den Einstellungen) gilt der 5kg-Standard.
    const exerciseName = (scrollWheelActiveExerciseName() || '').toLowerCase();
    const isDumbbellExercise = /hantel/.test(exerciseName);
    step = isDumbbellExercise ? (attrStep || 0.5) : 5;
  }
  else if (/reps|sets/i.test(field)){ min = attrMin ?? 1; max = 100; step = 1; }
  else if (/seconds/i.test(field)){ min = attrMin ?? 1; max = 600; step = 1; }
  else if (/rpe/i.test(field)){
    // Festgelegte Auswahl 6-10 in ganzen Schritten fürs Rad (kein 0,5er-Feintuning wie
    // sonst per RPE_STEP für Tastatur/Validierung) — RPE wird für dieses Feld ohnehin nie
    // per Tastatur eingegeben (siehe isRpeField()/wireAlternativeNumberInputs()), das Rad
    // ist die einzige Eingabemethode und soll darum bewusst grob/schnell wählbar bleiben.
    min = RPE_MIN; max = RPE_MAX; step = 1;
  }

  return { min, max, step };
}

// Liefert den Übungsnamen zum aktuell fokussierten Zahlenfeld, soweit ermittelbar — für die
// Hantel-Erkennung in scrollWheelRangeFor(). Sucht zuerst im aktiven Training nach dem
// Namensfeld der Übungskarte, sonst im Übungen-Editor/Popup nach dem data-field="name"-Feld
// derselben .plan-row/.exercise-card. Liefert null, wenn kein Übungskontext auffindbar ist.
function scrollWheelActiveExerciseName(){
  if (!scrollWheelActiveInput) return null;
  if (active && active.entries && active.entries[active.currentIndex]){
    return active.entries[active.currentIndex].name || null;
  }
  const card = scrollWheelActiveInput.closest('.plan-row, .new-exercise-modal-body');
  const nameField = card && card.querySelector('[data-field="name"], #wizName');
  return nameField ? nameField.value : null;
}

function formatWheelValue(v, step){
  // Bei Nachkommaschritten (z. B. 0.5 bei kg) eine Nachkommastelle zeigen, sonst ganzzahlig.
  return step % 1 !== 0 ? v.toFixed(1) : String(Math.round(v));
}

function openScrollWheelForInput(input){
  if (scrollWheelActiveInput === input) return;
  scrollWheelActiveInput = input;
  input.blur();

  const { min, max, step } = scrollWheelRangeFor(input);
  const values = [];
  for (let v = min; v <= max + step / 2; v += step) values.push(Math.round(v * 100) / 100);
  const wasEmpty = input.value === '';
  const current = wasEmpty ? values[0] : Number(input.value);
  let closestIndex = 0;
  let closestDiff = Infinity;
  values.forEach((v, i) => { const d = Math.abs(v - current); if (d < closestDiff){ closestDiff = d; closestIndex = i; } });
  // War das Feld ursprünglich leer (z. B. noch nie protokollierter Satz), soll ein bloßes
  // Öffnen und wieder Schließen des Rads OHNE es zu berühren nicht automatisch den
  // Startwert (üblicherweise min, z. B. "1" bei Sekunden) eintragen — erst eine tatsächliche
  // Interaktion (Ziehen, Antippen einer Zeile, Combo-Tippen) markiert touched=true und macht
  // den aktuell eingerasteten Wert beim Bestätigen verbindlich.
  let touched = !wasEmpty;

  const existing = document.getElementById('scrollWheelOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'scroll-wheel-overlay';
  overlay.id = 'scrollWheelOverlay';
  const label = input.closest('div') && input.closest('div').querySelector('label')
    ? input.closest('div').querySelector('label').textContent
    : (input.placeholder || input.getAttribute('aria-label') || 'Wert');
  const isCombo = numberInputMode() === 'combo';
  const allowDecimalCombo = step % 1 !== 0;
  overlay.innerHTML = `
    <div class="scroll-wheel-sheet">
      <div class="scroll-wheel-header">
        <span class="scroll-wheel-label">${label}</span>
      </div>
      <div class="scroll-wheel-viewport">
        <div class="scroll-wheel-highlight"></div>
        <div class="scroll-wheel-track" id="scrollWheelTrack">
          ${values.map(v => `<div class="scroll-wheel-item">${formatWheelValue(v, step)}</div>`).join('')}
        </div>
      </div>
      ${isCombo ? `
      <div class="keypad-inline">
        <div class="keypad-display-row">
          <span class="keypad-display" id="comboDisplay">&nbsp;</span>
          <button class="keypad-confirm" id="scrollWheelDone" aria-label="Übernehmen"><span class="keypad-check"></span></button>
        </div>
        <div class="keypad-grid">
          ${['1','2','3','4','5','6','7','8','9'].map(n => `<button class="keypad-key" data-key="${n}">${n}</button>`).join('')}
          <button class="keypad-key ${allowDecimalCombo ? '' : 'keypad-key-disabled'}" data-key="." ${allowDecimalCombo ? '' : 'disabled'}>,</button>
          <button class="keypad-key" data-key="0">0</button>
          <button class="keypad-key keypad-key-del" data-key="del" aria-label="Löschen"></button>
        </div>
      </div>
      ` : `<button class="btn btn-primary" id="scrollWheelDone" style="margin:12px 16px 16px;">Fertig</button>`}
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(finish);

  const track = document.getElementById('scrollWheelTrack');
  const items = track.querySelectorAll('.scroll-wheel-item');
  const itemHeight = 44;

  // ---- Eigene Touch-Physik statt browsereigenem Scroll+CSS-snap ----
  // Der native Scroll-Container ist bewusst NICHT scrollbar (overflow:hidden per CSS,
  // siehe .scroll-wheel-track) — stattdessen wird die Position (offsetY, in Pixeln)
  // komplett selbst verwaltet und per CSS-transform auf .scroll-wheel-track angewendet.
  // Das erlaubt "echtes" Momentum-Scrolling mit Reibung/Trägheit nach dem Loslassen
  // (wie man es von iOS-Pickern kennt) und exaktes Vibrationsfeedback bei jedem
  // Werte-Wechsel, was mit reinem CSS scroll-snap / scrollTo() nicht zuverlässig möglich war.
  let offsetY = -closestIndex * itemHeight; // Position des Tracks relativ zur Ruhelage
  let velocity = 0;
  let lastY = 0;
  let lastT = 0;
  let dragging = false;
  let momentumRAF = null;
  let selectedIndex = closestIndex;
  const minOffset = -(values.length - 1) * itemHeight;
  const maxOffset = 0;

  function applyOffset(){
    track.style.transform = `translateY(${offsetY}px)`;
    const idx = Math.round(-offsetY / itemHeight);
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    if (clamped !== selectedIndex){
      selectedIndex = clamped;
      if (navigator.vibrate) navigator.vibrate(6);
    }
    items.forEach((el, i) => el.classList.toggle('active', i === selectedIndex));
  }
  applyOffset();

  function settle(){
    // Nach Loslassen: sanft (per Feder-artiger Interpolation) auf den nächstgelegenen
    // Rasterwert einrasten, inklusive Begrenzung an den Rändern (kein Überscrollen ins Leere).
    const targetIndex = Math.max(0, Math.min(values.length - 1, Math.round(-offsetY / itemHeight)));
    const target = -targetIndex * itemHeight;
    cancelAnimationFrame(momentumRAF);
    const step2 = () => {
      offsetY += (target - offsetY) * 0.22;
      if (Math.abs(target - offsetY) < 0.5){
        offsetY = target;
        applyOffset();
        return;
      }
      applyOffset();
      momentumRAF = requestAnimationFrame(step2);
    };
    step2();
  }

  // Ab 50kg bremst das Rad zunehmend stärker (nur bei Gewichtsfeldern) — verhindert, dass
  // man mit Schwung aus dem niedrigen Bereich versehentlich bis an die 150kg-Obergrenze
  // durchrutscht. Der Bremsfaktor steigt linear von 1× (bei 50kg) auf 2,6× (bei 150kg) und
  // bleibt außerhalb dieses Bereichs (z. B. bei Wdh/Sätzen/Sekunden) bei 1× unverändert.
  const isWeightField = /weight|kg|bodyWeight/i.test(input.dataset.field || input.id || '');
  // RPE soll sich hart an 6 und 10 anfühlen (Nutzer-Feedback: der übliche Gummizug — leichtes
  // Nachgeben über den Rand hinaus vor dem Zurückfedern, siehe onPointerMove/runMomentum unten —
  // wirkt bei einer festen 6-10-Skala unpassend "wabbelig"). Nur für RPE deaktiviert, alle
  // anderen Felder (Gewicht, Wdh, Sekunden) behalten den Gummizug.
  const disableOverscroll = isRpeField(input);
  const brakeStartValue = 50;
  function brakeFactorAt(offset){
    if (!isWeightField) return 1;
    const idx = Math.max(0, Math.min(values.length - 1, Math.round(-offset / itemHeight)));
    const value = values[idx];
    if (value <= brakeStartValue) return 1;
    const t = Math.min(1, (value - brakeStartValue) / (max - brakeStartValue || 1));
    return 1 + t * 1.6;
  }

  function runMomentum(){
    // Trägheits-Phase nach dem Loslassen: velocity klingt exponentiell ab (Reibung), bis sie
    // vernachlässigbar klein ist, danach wird per settle() eingerastet — das erzeugt genau das
    // "Schwung nehmen"-Gefühl eines echten Scroll-Rads statt eines abrupten Stopps.
    cancelAnimationFrame(momentumRAF);
    const baseFriction = 0.94;
    const step2 = () => {
      // Stärkere Reibung im Bremsbereich: baseFriction wird durch den Bremsfaktor "verstärkt"
      // (näher an 0 gebracht), sodass velocity dort schneller abklingt.
      const brake = brakeFactorAt(offsetY);
      const friction = Math.max(0.5, 1 - (1 - baseFriction) * brake);
      velocity *= friction;
      offsetY += velocity;
      offsetY = disableOverscroll
        ? Math.max(minOffset, Math.min(maxOffset, offsetY)) // hart am Rand stoppen, siehe disableOverscroll
        : Math.max(minOffset - itemHeight, Math.min(maxOffset + itemHeight, offsetY));
      applyOffset();
      if (Math.abs(velocity) > 0.4){
        momentumRAF = requestAnimationFrame(step2);
      } else {
        settle();
      }
    };
    step2();
  }

  function onPointerDown(ev){
    dragging = true;
    touched = true;
    cancelAnimationFrame(momentumRAF);
    lastY = (ev.touches ? ev.touches[0].clientY : ev.clientY);
    lastT = performance.now();
    velocity = 0;
  }
  function onPointerMove(ev){
    if (!dragging) return;
    const y = (ev.touches ? ev.touches[0].clientY : ev.clientY);
    const now = performance.now();
    const dy = y - lastY;
    const dt = Math.max(1, now - lastT);
    // Im Bremsbereich (siehe brakeFactorAt) wird auch die direkte Fingerbewegung gedämpft,
    // nicht nur das Momentum nach dem Loslassen — sonst würde man beim Ziehen bis 150kg
    // trotzdem "durchrutschen" können, nur das Abbremsen danach wäre stärker.
    const brake = brakeFactorAt(offsetY);
    const dampedDy = dy / brake;
    velocity = dampedDy / dt * 16; // auf "Pixel pro Frame" (≈16ms) normalisiert
    offsetY += dampedDy;
    if (disableOverscroll){
      // Hartes Ende statt Gummizug: sobald der Rand erreicht ist, geht es nicht weiter — kein
      // Nachgeben, kein Zurückfedern nötig, weil es nie über den Rand hinausgeht.
      offsetY = Math.max(minOffset, Math.min(maxOffset, offsetY));
    } else if (offsetY > maxOffset){
      // Leichter Gummizug-Widerstand über die Ränder hinaus, klar begrenzt statt endlosem Scroll.
      offsetY = maxOffset + (offsetY - maxOffset) * 0.35;
    } else if (offsetY < minOffset){
      offsetY = minOffset + (offsetY - minOffset) * 0.35;
    }
    applyOffset();
    lastY = y; lastT = now;
    ev.preventDefault();
  }
  function onPointerUp(){
    if (!dragging) return;
    dragging = false;
    if (Math.abs(velocity) > 1){
      runMomentum();
    } else {
      settle();
    }
  }

  track.addEventListener('touchstart', onPointerDown, { passive: true });
  track.addEventListener('touchmove', onPointerMove, { passive: false });
  track.addEventListener('touchend', onPointerUp);
  track.addEventListener('touchcancel', onPointerUp);
  // Desktop-Fallback (Maus ziehen)
  track.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  // Tippen auf eine einzelne Zeile springt direkt zu diesem Wert (mit Feder-Einraster).
  items.forEach((el, i) => {
    el.addEventListener('click', () => {
      if (dragging) return;
      touched = true;
      animateToIndex(i);
    });
  });

  function finish(){
    popOverlayStateIfOpen();
    cancelAnimationFrame(momentumRAF);
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    const el = document.getElementById('scrollWheelOverlay');
    if (el) el.remove();
    scrollWheelActiveInput = null;
    // War das Feld ursprünglich leer und wurde das Rad nie berührt (touched === false),
    // bleibt es leer statt automatisch den Startwert (min) einzutragen — siehe touched-
    // Kommentar weiter oben. Sonst hat im kombinierten Modus direkt getippter Text Vorrang
    // vor dem Rad-Rasterwert (erlaubt Feinwerte außerhalb der Rad-Schrittweite, z. B. 63kg
    // bei einem 5kg-Raster); ist nichts getippt, gilt der zuletzt eingerastete Rad-Wert.
    if (!touched){
      // nichts zu tun — input.value bleibt unverändert (leer)
    } else {
      const typedValue = isCombo && comboValueStr !== '' ? Number(comboValueStr) : null;
      const finalValue = typedValue !== null && !isNaN(typedValue) ? typedValue : values[selectedIndex];
      if (input.value !== String(finalValue)){
        input.value = isCombo && typedValue !== null ? comboValueStr : formatWheelValue(finalValue, step);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }
  document.getElementById('scrollWheelDone').onclick = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    popOverlayStateIfOpen();
    finish();
  };
  overlay.onclick = (ev) => { if (ev.target === overlay){ popOverlayStateIfOpen(); finish(); } };

  // ---- Kombinierter Modus: Ziffernblock unter dem Rad, beide Richtungen synchronisiert ----
  let comboValueStr = '';
  if (isCombo){
    const comboDisplay = document.getElementById('comboDisplay');
    function updateComboDisplay(){ comboDisplay.innerHTML = comboValueStr || '&nbsp;'; }
    overlay.querySelectorAll('.keypad-key').forEach(btn => {
      btn.onclick = () => {
        if (btn.disabled) return;
        if (navigator.vibrate) navigator.vibrate(10);
        touched = true;
        const key = btn.dataset.key;
        if (key === 'del') comboValueStr = comboValueStr.slice(0, -1);
        else if (key === '.'){ if (!comboValueStr.includes('.')) comboValueStr = (comboValueStr || '0') + '.'; }
        else comboValueStr = (comboValueStr === '0') ? key : comboValueStr + key;
        updateComboDisplay();
        // Rad synchron zum getippten Wert mitscrollen (mit derselben Feder-Animation wie
        // beim Antippen einer Radzeile), solange der getippte Wert eine gültige Zahl ergibt.
        const typed = Number(comboValueStr);
        if (comboValueStr !== '' && !isNaN(typed)){
          let nearestIdx = 0, nearestDiff = Infinity;
          values.forEach((v, i) => { const d = Math.abs(v - typed); if (d < nearestDiff){ nearestDiff = d; nearestIdx = i; } });
          animateToIndex(nearestIdx);
        }
      };
    });
    // Rad-Bewegung synchron im Ziffernblock-Display anzeigen — wer erst am Rad dreht und
    // danach weitertippt, sieht durchgehend einen konsistenten Wert statt zweier
    // auseinanderlaufender Anzeigen.
    const originalApplyOffset = applyOffset;
    applyOffset = function(){
      originalApplyOffset();
      if (!document.activeElement || document.activeElement.tagName !== 'BUTTON'){
        comboValueStr = formatWheelValue(values[selectedIndex], step);
        updateComboDisplay();
      }
    };
    comboValueStr = formatWheelValue(values[closestIndex], step);
    updateComboDisplay();
  }

  function animateToIndex(i){
    cancelAnimationFrame(momentumRAF);
    const target = -i * itemHeight;
    const start = offsetY;
    const startT = performance.now();
    const dur = 220;
    const stepAnim = (now) => {
      const t = Math.min(1, (now - startT) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      offsetY = start + (target - start) * eased;
      applyOffset();
      if (t < 1) momentumRAF = requestAnimationFrame(stepAnim);
    };
    momentumRAF = requestAnimationFrame(stepAnim);
  }
}

// Einmalig verkabelt: fängt jeden Fokus auf ein Zahlenfeld ab (auch neu ins DOM gerenderte,
// da focusin bubblet), solange die Einstellung aktiv ist, und öffnet statt der System-
// Tastatur das Scroll-Rad. readOnly verhindert dabei zusätzlich, dass die virtuelle
// Tastatur kurz aufblitzt, bevor das Overlay erscheint.
// Hält alle offenen Popups (.add-exercise-overlay, .scroll-wheel-overlay,
// .history-context-overlay) über der virtuellen Tastatur, statt dass sie dahinter
// verschwinden. Das reine CSS-Problem: position:fixed bezieht sich auf die volle
// Fenstergröße inkl. des von der Tastatur verdeckten Bereichs — window.visualViewport
// meldet dagegen live die tatsächlich sichtbare Höhe/den sichtbaren Ausschnitt. Setzt bei
// jeder Änderung (Tastatur auf/zu, Zoom, Rotation) height/top aller offenen Overlays neu.
function wireViewportAwareOverlays(){
  const vv = window.visualViewport;
  if (!vv) return; // Fallback: älterer Browser ohne API — Overlays bleiben bei 100%/CSS-Default

  const OVERLAY_SELECTOR = '.add-exercise-overlay, .scroll-wheel-overlay, .history-context-overlay, .font-picker-overlay';

  function applyViewport(){
    const overlays = document.querySelectorAll(OVERLAY_SELECTOR);
    if (!overlays.length) return;
    const height = vv.height;
    const top = vv.offsetTop;
    overlays.forEach(el => {
      el.style.height = `${height}px`;
      el.style.top = `${top}px`;
    });
  }

  vv.addEventListener('resize', applyViewport);
  vv.addEventListener('scroll', applyViewport);
  // Neu geöffnete Overlays (per createElement + appendChild) direkt beim Einfügen ins DOM
  // erfassen, ohne dass jede einzelne Popup-Funktion das selbst aufrufen müsste.
  const observer = new MutationObserver(applyViewport);
  observer.observe(document.body, { childList: true });
}

// Eigener großer Ziffernblock (analog zum Scroll-Rad eine Alternative zur System-Tastatur,
// siehe numberInputMode()) — freie Zifferneingabe statt Scrollen, mit Vibrationsfeedback bei
// jedem Tastendruck. Layout entspricht einem klassischen Nummernblock: aktueller Eingabewert
// oben mit Bestätigen-Button daneben, darunter 1-9/Komma/0/Löschen im 3×4-Raster.
let keypadActiveInput = null;

function openKeypadForInput(input){
  if (keypadActiveInput === input) return;
  keypadActiveInput = input;
  input.blur();

  const allowDecimal = (input.step && Number(input.step) % 1 !== 0);
  // Feld startet bewusst LEER (nicht mit dem alten Wert vorbelegt), damit man direkt
  // lostippen kann, ohne vorher erst löschen zu müssen. Der ursprüngliche Wert wird nur dann
  // beibehalten, wenn beim Bestätigen nichts eingetippt wurde (siehe finish()).
  const originalValue = input.value;
  let valueStr = '';

  const existing = document.getElementById('keypadOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay';
  overlay.id = 'keypadOverlay';
  overlay.innerHTML = `
    <div class="keypad-sheet">
      <div class="keypad-display-row">
        <span class="keypad-display" id="keypadDisplay">${valueStr || '&nbsp;'}</span>
        <button class="keypad-confirm" id="keypadConfirm" aria-label="Übernehmen">
          <span class="keypad-check"></span>
        </button>
      </div>
      <div class="keypad-grid">
        ${['1','2','3','4','5','6','7','8','9'].map(n => `<button class="keypad-key" data-key="${n}">${n}</button>`).join('')}
        <button class="keypad-key ${allowDecimal ? '' : 'keypad-key-disabled'}" data-key="." ${allowDecimal ? '' : 'disabled'}>,</button>
        <button class="keypad-key" data-key="0">0</button>
        <button class="keypad-key keypad-key-del" data-key="del" aria-label="Löschen"></button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(finish);

  const display = document.getElementById('keypadDisplay');
  function updateDisplay(){ display.innerHTML = valueStr || '&nbsp;'; }

  overlay.querySelectorAll('.keypad-key').forEach(btn => {
    btn.onclick = () => {
      if (btn.disabled) return;
      if (navigator.vibrate) navigator.vibrate(10);
      const key = btn.dataset.key;
      if (key === 'del'){
        valueStr = valueStr.slice(0, -1);
      } else if (key === '.'){
        if (!valueStr.includes('.')) valueStr = (valueStr || '0') + '.';
      } else {
        // Führende Null sauber ersetzen (z. B. "0" + "5" → "5", nicht "05")
        valueStr = (valueStr === '0') ? key : valueStr + key;
      }
      updateDisplay();
    };
  });

  function finish(commit){
    popOverlayStateIfOpen();
    const el = document.getElementById('keypadOverlay');
    if (el) el.remove();
    keypadActiveInput = null;
    if (commit && valueStr !== '' && input.value !== valueStr){
      input.value = valueStr;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  document.getElementById('keypadConfirm').onclick = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    finish(true);
  };
  overlay.onclick = (ev) => { if (ev.target === overlay) finish(true); };
}

// Einmalig verkabelt: fängt jeden Fokus auf ein Zahlenfeld ab (auch neu ins DOM gerenderte,
// da focusin bubblet) und öffnet je nach gewähltem Modus (numberInputMode()) entweder das
// Scroll-Rad oder den Ziffernblock statt der System-Tastatur. Bei Modus 'system' greift
// keiner von beiden — dann verhält sich das Feld ganz normal.
// Die Körpergewicht-Felder (Einstellungen + Erstlauf-Popup) sind bewusst von Scroll-Rad/
// Ziffernblock ausgenommen — dort öffnet sich immer die normale System-Tastatur des Handys,
// unabhängig vom gewählten numberInputMode(). Anders als die kurzen Trainings-Zahlenwerte
// (kg pro Satz, Wdh, Sekunden) tippt man das eigene Körpergewicht selten und meist mit
// Nachkommastelle — da ist die gewohnte Tastatur schneller als Rad/Block.
// customRestSeconds (Eigene-Pause-Popup) ist ebenfalls ausgenommen: Das Popup ruft direkt
// nach dem Öffnen input.focus() auf. Wäre das Feld nicht ausgenommen, würde das SOFORT ein
// zweites, verschachteltes Overlay (Ziffernblock/Scroll-Rad) oben auf dem Pause-Popup öffnen
// — zwei eigene Browser-Verlaufseinträge übereinander. Bestätigt man dann zügig hintereinander
// (erst den Ziffernblock, was automatisch auch das Pause-Popup schließt), feuern zwei
// history.back()-Aufrufe sehr kurz hintereinander; mobile Chrome verschmilzt solche schnellen
// Aufrufe manchmal zu einem einzigen Zurück-Schritt, wodurch die App auf einem falschen
// Zwischenzustand landet und fälschlich den "Training verlassen?"-Dialog zeigt (siehe Bug-
// Report: Meldung erscheint nach Bestätigen der eigenen Pausenzeit). Die normale System-
// Tastatur braucht kein zusätzliches Overlay und umgeht das Problem komplett.
function isSystemKeyboardOnlyField(input){
  if (!!input && input.closest && input.closest('#sessionEntryEditorOverlay')){
    // Die kg/Wdh/Sekunden-Felder im "Übung bearbeiten"-Popup (abgeschlossene Einheit,
    // siehe openSessionEntryEditor) laufen NICHT über Scroll-Rad/Ziffernblock — dieses
    // Popup ist bereits selbst ein Overlay mit eigenem History-Eintrag (pushOverlayState);
    // ein zusätzlich verschachteltes Rad/Ziffernblock-Overlay würde beim Schließen über
    // popOverlayStateIfOpen()/history.back() denselben Bug auslösen, der schon bei
    // customRestSeconds unten dokumentiert ist (fälschliches Mitschließen des dahinter
    // liegenden Popups) — normale System-Tastatur umgeht das komplett.
    return true;
  }
  if (!!input && input.closest && input.closest('#addPastSessionOverlay')){
    // Gleicher Grund wie beim "Übung bearbeiten"-Popup direkt oberhalb: Der "Training
    // nachtragen"-Wizard (openAddPastSessionWizard) ist selbst schon ein mehrstufiges
    // Overlay mit eigenem History-Eintrag pro Schritt — ein zusätzlich verschachteltes
    // Scroll-Rad/Ziffernblock-Overlay über Dauer-/Wdh-/kg-/Sekunden-Feldern brach den
    // Verlaufsstapel und schloss den Wizard sofort wieder. Normale System-Tastatur umgeht
    // das komplett, für alle Zahlenfelder in diesem Wizard.
    return true;
  }
  return !!input && (input.id === 'bodyWeightInput' || input.id === 'bodyWeightPromptInput' || input.id === 'customRestSeconds');
}

// RPE-Felder (aktives Training, .rpe-input/data-field="rpe") bekommen IMMER das Scroll-Rad,
// unabhängig vom global gewählten numberInputMode() (auch bei 'system' oder 'keypad') — RPE
// ist eine grobe 6-10-Einschätzung, dafür ist das Rad schneller/passender als Tippen. Kommt
// aktuell nur im aktiven Training vor (nicht in den per isSystemKeyboardOnlyField() bewusst
// ausgenommenen Nachtrag-/Bearbeiten-Popups), daher unproblematisch mit deren History-Logik.
function isRpeField(input){
  return !!input && (input.dataset.field === 'rpe' || input.classList.contains('rpe-input'));
}

function wireAlternativeNumberInputs(){
  document.addEventListener('focusin', (ev) => {
    const input = ev.target;
    if (!input || input.tagName !== 'INPUT' || input.type !== 'number') return;
    if (input.closest('#scrollWheelOverlay') || input.closest('#keypadOverlay')) return;
    if (isRpeField(input)){ openScrollWheelForInput(input); return; }
    if (isSystemKeyboardOnlyField(input)) return;
    const mode = numberInputMode();
    if (mode === 'wheel' || mode === 'combo') openScrollWheelForInput(input);
    else if (mode === 'keypad') openKeypadForInput(input);
  });
  // Verhindert das kurze Aufblitzen der System-Tastatur bei Touch-Geräten: readOnly wird
  // beim Fokussieren gesetzt und direkt danach wieder entfernt, sobald das Wheel/Keypad
  // offen ist — das Feld bleibt dadurch weiterhin normal per JS beschreibbar (input.value=…).
  document.addEventListener('touchstart', (ev) => {
    const input = ev.target;
    if (!input || input.tagName !== 'INPUT' || input.type !== 'number') return;
    if (isRpeField(input)){
      input.setAttribute('readonly', 'readonly');
      setTimeout(() => input.removeAttribute('readonly'), 400);
      return;
    }
    if (numberInputMode() === 'system' || isSystemKeyboardOnlyField(input)) return;
    input.setAttribute('readonly', 'readonly');
    setTimeout(() => input.removeAttribute('readonly'), 400);
  }, true);
}

// Generisches Text-Scroll-Rad für Auswahllisten (z. B. Kategorie-Übungspool-Filter) — nutzt
// dieselbe Momentum-Touch-Physik wie das Zahlen-Scroll-Rad (openScrollWheelForInput:
// eigene transform-basierte Positionierung statt nativem Scroll, Reibung/Trägheit nach dem
// Loslassen, Vibrationsfeedback bei jedem Werte-Wechsel, Feder-Einrasten beim Antippen einer
// Zeile), aber mit beliebigen Text-Labels statt eines Zahlenbereichs und ohne die kg-
// spezifische Bremszone. `options` ist ein Array aus { value, label }, `currentValue` bestimmt
// die Startposition, `onDone(value)` wird beim Bestätigen mit dem final gewählten Wert
// aufgerufen (auch wenn nichts geändert wurde).
function openChoiceScrollWheel(title, options, currentValue, onDone){
  const existing = document.getElementById('scrollWheelOverlay');
  if (existing) existing.remove();

  let closestIndex = options.findIndex(o => o.value === currentValue);
  if (closestIndex === -1) closestIndex = 0;

  const overlay = document.createElement('div');
  overlay.className = 'scroll-wheel-overlay';
  overlay.id = 'scrollWheelOverlay';
  overlay.innerHTML = `
    <div class="scroll-wheel-sheet">
      <div class="scroll-wheel-header">
        <span class="scroll-wheel-label">${title}</span>
      </div>
      <div class="scroll-wheel-viewport">
        <div class="scroll-wheel-highlight"></div>
        <div class="scroll-wheel-track" id="scrollWheelTrack">
          ${options.map(o => `<div class="scroll-wheel-item scroll-wheel-item-text" ${o.itemStyle ? `style="${o.itemStyle}"` : ''}>${o.label}</div>`).join('')}
        </div>
      </div>
      <button class="btn btn-primary" id="scrollWheelDone" style="margin:12px 16px 16px;">Fertig</button>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(finish);

  const track = document.getElementById('scrollWheelTrack');
  const items = track.querySelectorAll('.scroll-wheel-item');
  const itemHeight = 44;

  let offsetY = -closestIndex * itemHeight;
  let velocity = 0;
  let lastY = 0;
  let lastT = 0;
  let dragging = false;
  let momentumRAF = null;
  let selectedIndex = closestIndex;
  const minOffset = -(options.length - 1) * itemHeight;
  const maxOffset = 0;

  function applyOffset(){
    track.style.transform = `translateY(${offsetY}px)`;
    const idx = Math.round(-offsetY / itemHeight);
    const clamped = Math.max(0, Math.min(options.length - 1, idx));
    if (clamped !== selectedIndex){
      selectedIndex = clamped;
      if (navigator.vibrate) navigator.vibrate(6);
    }
    items.forEach((el, i) => el.classList.toggle('active', i === selectedIndex));
  }
  applyOffset();

  function settle(){
    const targetIndex = Math.max(0, Math.min(options.length - 1, Math.round(-offsetY / itemHeight)));
    const target = -targetIndex * itemHeight;
    cancelAnimationFrame(momentumRAF);
    const step = () => {
      offsetY += (target - offsetY) * 0.22;
      if (Math.abs(target - offsetY) < 0.5){
        offsetY = target;
        applyOffset();
        return;
      }
      applyOffset();
      momentumRAF = requestAnimationFrame(step);
    };
    step();
  }

  function runMomentum(){
    cancelAnimationFrame(momentumRAF);
    const friction = 0.94;
    const step = () => {
      velocity *= friction;
      offsetY += velocity;
      offsetY = Math.max(minOffset - itemHeight, Math.min(maxOffset + itemHeight, offsetY));
      applyOffset();
      if (Math.abs(velocity) > 0.4){
        momentumRAF = requestAnimationFrame(step);
      } else {
        settle();
      }
    };
    step();
  }

  function onPointerDown(ev){
    dragging = true;
    cancelAnimationFrame(momentumRAF);
    lastY = (ev.touches ? ev.touches[0].clientY : ev.clientY);
    lastT = performance.now();
    velocity = 0;
  }
  function onPointerMove(ev){
    if (!dragging) return;
    const y = (ev.touches ? ev.touches[0].clientY : ev.clientY);
    const now = performance.now();
    const dy = y - lastY;
    const dt = Math.max(1, now - lastT);
    velocity = dy / dt * 16;
    offsetY += dy;
    if (offsetY > maxOffset) offsetY = maxOffset + (offsetY - maxOffset) * 0.35;
    if (offsetY < minOffset) offsetY = minOffset + (offsetY - minOffset) * 0.35;
    applyOffset();
    lastY = y; lastT = now;
    ev.preventDefault();
  }
  function onPointerUp(){
    if (!dragging) return;
    dragging = false;
    if (Math.abs(velocity) > 1) runMomentum(); else settle();
  }

  track.addEventListener('touchstart', onPointerDown, { passive: true });
  track.addEventListener('touchmove', onPointerMove, { passive: false });
  track.addEventListener('touchend', onPointerUp);
  track.addEventListener('touchcancel', onPointerUp);
  track.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  items.forEach((el, i) => {
    el.addEventListener('click', () => {
      if (dragging) return;
      cancelAnimationFrame(momentumRAF);
      const target = -i * itemHeight;
      const start = offsetY;
      const startT = performance.now();
      const dur = 220;
      const stepAnim = (now) => {
        const t = Math.min(1, (now - startT) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        offsetY = start + (target - start) * eased;
        applyOffset();
        if (t < 1) momentumRAF = requestAnimationFrame(stepAnim);
      };
      momentumRAF = requestAnimationFrame(stepAnim);
    });
  });

  function finish(){
    popOverlayStateIfOpen();
    cancelAnimationFrame(momentumRAF);
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    const el = document.getElementById('scrollWheelOverlay');
    if (el) el.remove();
    onDone(options[selectedIndex].value);
  }
  document.getElementById('scrollWheelDone').onclick = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    finish();
  };
  overlay.onclick = (ev) => { if (ev.target === overlay) finish(); };
}

// Schriftart-Picker (Design → Schriftart) — eigenes, schlankes Popup statt des generischen
// Scroll-Rads (siehe openChoiceScrollWheel()): Suchfeld oben filtert live nach Namen, darunter
// eine normal scrollbare Liste (kein Snap/Momentum) mit deutlich mehr sichtbarer Höhe als das
// Scroll-Rad-Sichtfenster. Tippen auf einen Eintrag wählt ihn sofort aus und schließt das
// Popup — kein zusätzlicher "Fertig"-Button nötig.
function openFontPickerSheet(){
  const existing = document.getElementById('fontPickerOverlay');
  if (existing) existing.remove();

  const allOptions = allFontOptions();
  let query = '';

  const overlay = document.createElement('div');
  overlay.className = 'font-picker-overlay';
  overlay.id = 'fontPickerOverlay';
  overlay.innerHTML = `
    <div class="font-picker-sheet">
      <div class="font-picker-header">
        <span class="font-picker-title">Schriftart</span>
      </div>
      <div class="font-picker-search-wrap">
        <input type="text" id="fontPickerSearch" class="font-picker-search" placeholder="Schriftart suchen…" enterkeyhint="search" autocomplete="off">
      </div>
      <div class="font-picker-list" id="fontPickerList"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(finish);

  function renderList(){
    const listEl = document.getElementById('fontPickerList');
    if (!listEl) return;
    const q = query.trim().toLowerCase();
    const filtered = q ? allOptions.filter(f => f.name.toLowerCase().includes(q)) : allOptions;
    if (!filtered.length){
      listEl.innerHTML = `<div class="font-picker-empty">Keine Schriftart gefunden</div>`;
      return;
    }
    const activeId = currentFontOption().id;
    listEl.innerHTML = filtered.map(f => `
      <button type="button" class="font-picker-item font-preview-item ${f.id === activeId ? 'selected' : ''}" data-font-id="${f.id}" style="font-family:${f.family};">
        <span>${f.name}</span>
        <span class="font-picker-item-check">✓</span>
      </button>
    `).join('');
    listEl.querySelectorAll('[data-font-id]').forEach(btn => {
      btn.onclick = async () => {
        if (navigator.vibrate) navigator.vibrate(8);
        plan.fontId = btn.dataset.fontId;
        await saveJSON('plan', plan);
        applyTheme();
        finish();
        renderSettings();
      };
    });
  }
  renderList();

  const searchEl = document.getElementById('fontPickerSearch');
  searchEl.oninput = () => { query = searchEl.value; renderList(); };

  function finish(){
    popOverlayStateIfOpen();
    const el = document.getElementById('fontPickerOverlay');
    if (el) el.remove();
  }
  overlay.onclick = (ev) => { if (ev.target === overlay) finish(); };
}

function openBodyWeightPrompt(onSaved){
  const existing = document.getElementById('bodyWeightPromptOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'bodyWeightPromptOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal" style="max-height:none;">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">Körpergewicht</div>
        <button class="bodyweight-prompt-close" id="bodyWeightPromptClose" aria-label="Später">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"></path><path d="M6 6l12 12"></path></svg>
        </button>
      </div>
      <div class="new-exercise-modal-body">
        <div class="bodyweight-prompt-field">
          <input type="text" inputmode="decimal" id="bodyWeightPromptInput" enterkeyhint="done" placeholder="z. B. 78,5" class="bodyweight-prompt-input">
          <span class="bodyweight-prompt-unit">kg</span>
        </div>
      </div>
      <div class="add-exercise-modal-header" style="border-top:1px solid var(--border); border-bottom:none; gap:10px;">
        <button class="btn btn-ghost" id="bodyWeightPromptSkip" style="flex:1;">Später</button>
        <button class="btn bodyweight-prompt-save" id="bodyWeightPromptSave" style="flex:1;">Speichern</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(remove);

  function remove(){ const el = document.getElementById('bodyWeightPromptOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); };
  const input = document.getElementById('bodyWeightPromptInput');
  input.focus();
  input.onkeydown = (ev) => {
    if (ev.key === 'Enter'){
      ev.preventDefault();
      input.blur();
      save();
    }
  };
  const save = async () => {
    const v = input.value === '' ? null : parseGermanNumber(input.value);
    if (v !== null && !isNaN(v) && v > 0){
      logBodyWeight(v);
      await saveJSON('plan', plan);
      close();
      if (onSaved) onSaved();
      return;
    }
    close();
  };
  document.getElementById('bodyWeightPromptSave').onclick = save;
  document.getElementById('bodyWeightPromptSkip').onclick = close;
  document.getElementById('bodyWeightPromptClose').onclick = close;
}

// Notiz zu einer einzelnen Übung (z. B. Geräteeinstellung "Sitz Stufe 5") — wird direkt am
// Plan-Übungsobjekt gespeichert (planEx.note), gilt also dauerhaft für diese Übung, nicht nur
// für die aktuelle Einheit. Gleiches tastatur-sicheres Popup-Muster wie openBodyWeightPrompt.
// Vollflächiger, mittiger Stoppuhr-Overlay für Plank/isometrische Zeit-Übungen (siehe
// .seconds-timer-btn) — startet sofort beim Öffnen, läuft groß und mittig mit unscharfem
// Hintergrund. Tippen an IRGENDEINER Stelle stoppt die Uhr und übergibt die verstrichene Zeit
// in Sekunden an applySeconds (das Feld übernimmt den Wert automatisch).
function openPlankTimerOverlay(applySeconds){
  const existingEl = document.getElementById('plankTimerOverlay');
  if (existingEl) existingEl.remove();

  const overlay = document.createElement('div');
  overlay.className = 'plank-timer-overlay';
  overlay.id = 'plankTimerOverlay';
  overlay.innerHTML = `
    <div class="plank-timer-inner">
      <div class="plank-timer-display" id="plankTimerDisplay">00:00</div>
      <div class="plank-timer-hint">Zum Stoppen irgendwo tippen</div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(remove);

  const startedAt = Date.now();
  const display = document.getElementById('plankTimerDisplay');
  function tick(){
    const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    if (display) display.textContent = fmtDuration(sec);
  }
  tick();
  const interval = setInterval(tick, 250);
  if (navigator.vibrate) navigator.vibrate(20);

  let stopped = false;
  function remove(){
    if (stopped) return; // verhindert doppeltes Auslösen, falls Tap UND Zurück-Taste kurz hintereinander feuern
    stopped = true;
    clearInterval(interval);
    const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const el = document.getElementById('plankTimerOverlay');
    if (el) el.remove();
    if (navigator.vibrate) navigator.vibrate([15, 40, 15]);
    applySeconds(sec);
  }
  overlay.onclick = () => { popOverlayStateIfOpen(); remove(); };
}

function openExerciseNotePrompt(planEx, exerciseName){
  const existing = document.getElementById('exerciseNotePromptOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'exerciseNotePromptOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal" style="max-height:none;">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">Notiz · ${exerciseNameHTML(exerciseName)}</div>
        <button class="add-exercise-modal-close" id="exerciseNotePromptClose" aria-label="Abbrechen">✕</button>
      </div>
      <div class="new-exercise-modal-body">
        <textarea id="exerciseNotePromptInput" rows="4" placeholder="z. B. Sitz Stufe 5, Griff außen" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:16px; resize:vertical; font-family:inherit;">${planEx.note || ''}</textarea>
      </div>
      <div class="add-exercise-modal-header" style="border-top:1px solid var(--border); border-bottom:none; gap:10px;">
        <button class="btn btn-ghost" id="exerciseNotePromptDelete" style="flex:1;">Löschen</button>
        <button class="btn btn-primary" id="exerciseNotePromptSave" style="flex:1;">Speichern</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(remove);

  function remove(){ const el = document.getElementById('exerciseNotePromptOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); };
  const input = document.getElementById('exerciseNotePromptInput');
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  const save = async () => {
    const v = input.value.trim();
    planEx.note = v || null;
    await saveJSON('plan', plan);
    close();
    renderActive();
  };
  document.getElementById('exerciseNotePromptSave').onclick = save;
  document.getElementById('exerciseNotePromptDelete').onclick = async () => {
    planEx.note = null;
    await saveJSON('plan', plan);
    close();
    renderActive();
  };
  document.getElementById('exerciseNotePromptClose').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
}

function persistActiveSession(){
  saveJSON('activeSession', active || null).catch(() => {});
  // Zentraler Aufhänger für die Trainings-Benachrichtigung: persistActiveSession() wird bereits
  // bei JEDER relevanten Zustandsänderung aufgerufen (Satz abgehakt, Übungswechsel, Pause,
  // Trainingsende/-abbruch mit active=null), daher genügt dieser eine Einhängepunkt statt an
  // jeder Stelle einzeln nachzuziehen. typeof-Prüfung, weil diese Datei (03) VOR der Definition
  // in 11a-active-session.js geladen wird — zur Laufzeit ist die Funktion da, aber so ist es
  // auch bei künftigen Umsortierungen der <script>-Reihenfolge unkritisch.
  if (typeof syncActiveTrainingNotification === 'function') syncActiveTrainingNotification(true);
}

