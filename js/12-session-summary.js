/* ---------------------------------------------------
   ABSCHLUSS-SCREEN NACH TRAINING
--------------------------------------------------- */
function computeWeekStreak(){
  if (!sessions.length) return 0;
  const weekKeys = new Set(sessions.map(s => weekBucket(new Date(s.date)).key));
  let streak = 0;
  let d = new Date();
  while (true){
    const key = weekBucket(d).key;
    if (weekKeys.has(key)){
      streak++;
      d.setDate(d.getDate() - 7);
    } else break;
  }
  return streak;
}

function computeSessionTrends(session){
  const priorSessions = sessions
    .filter(s => s.id !== session.id && new Date(s.date) < new Date(session.date))
    .sort((a,b) => new Date(b.date) - new Date(a.date)); // neueste zuerst

  return session.entries.map(e => {
    const isTime = e.type === 'time';
    let prevEntry = null;
    for (const s of priorSessions){
      const match = s.entries.find(x => x.exerciseId === e.exerciseId);
      if (match && match.sets && match.sets.length){ prevEntry = match; break; }
    }
    let currVol = null, prevVol = null;
    const planEx = plan.exercises.find(x => x.id === e.exerciseId);
    const lowerIsBetter = !!(planEx && planEx.assisted);
    if (isTime){
      const currVals = e.sets.map(s => s.seconds).filter(v => v !== null && v !== undefined);
      currVol = currVals.length ? currVals.reduce((a,v) => a + v, 0) : null;
      if (prevEntry){
        const prevVals = prevEntry.sets.map(s => s.seconds).filter(v => v !== null && v !== undefined);
        prevVol = prevVals.length ? prevVals.reduce((a,v) => a + v, 0) : null;
      }
    } else {
      const currValid = e.sets.filter(s => s.reps !== null && s.reps !== undefined && s.weight !== null && s.weight !== undefined);
      currVol = currValid.length ? currValid.reduce((a,s) => a + s.reps*effectiveSetWeight(planEx, s.weight), 0) : null;
      if (prevEntry){
        const prevValid = prevEntry.sets.filter(s => s.reps !== null && s.reps !== undefined && s.weight !== null && s.weight !== undefined);
        prevVol = prevValid.length ? prevValid.reduce((a,s) => a + s.reps*effectiveSetWeight(planEx, s.weight), 0) : null;
      }
    }
    let trend = 'new';
    if (prevVol !== null && currVol !== null){
      // Hinweis: currVol/prevVol basieren bei Nicht-Zeit-Übungen auf effectiveSetWeight(),
      // das assisted-Übungen bereits so normalisiert, dass höher immer besser ist — daher
      // hier KEINE zusätzliche Umkehrung über lowerIsBetter mehr (sonst doppelt verkehrt).
      if (currVol > prevVol) trend = 'up';
      else if (currVol < prevVol) trend = 'down';
      else trend = 'same';
    }
    return { exerciseId: e.exerciseId, name: e.name, isTime, currVol, prevVol, trend, sets: e.sets, lowerIsBetter };
  });
}

// Ermittelt pro Übung dieser Session (inkl. Zeit-Übungen wie Plank, siehe computeExerciseMetrics),
// wie viele Kennzahlen einen neuen Allzeitrekord (records) bzw. eine Steigerung zum letzten
// Mal (improved) darstellen (siehe computeExerciseMetricComparison). Eine Übung gilt als
// Highlight, sobald records > 0 oder improved > 0 ist — unabhängig davon, ob sie zum ersten
// Mal protokolliert wurde.
function computeExerciseHighlights(session){
  const highlights = [];
  let starCount = 0;
  let improvedCount = 0;
  session.entries.forEach(e => {
    const result = computeExerciseMetricComparison(session, e.exerciseId);
    if (result && result.current.hasData){
      const records = countAllTimeRecords(result.comparison);
      // Eine Kennzahl zählt nur dann als "verbessert" (grün), wenn sie NICHT bereits
      // ein Allzeitrekord ist (gelb) — ein Allzeitrekord ist per Definition immer auch
      // eine Verbesserung, soll aber nicht doppelt gezählt/angezeigt werden.
      const improved = Object.values(result.comparison).filter(m => m.lastPct !== null && m.allTimePct === null && !m.isNewAllTime).length;
      // isNew: Übung wurde noch nie zuvor protokolliert (keine der Kennzahlen hat einen
      // "echten" Allzeitrekord-Prozentwert, aber es gibt trotzdem Rekorde durch isNewAllTime).
      const isNew = !result.hasHistory && records > 0;
      starCount += records;
      improvedCount += improved;
      if (records > 0 || improved > 0){
        highlights.push({ exerciseId: e.exerciseId, name: e.name, sets: e.sets, records, improved, isNew, isTime: e.type === 'time' });
      }
    }
  });
  return { highlights, starCount, improvedCount };
}

function renderSessionSummary(session){
  const sessionNumber = sessions.length;
  const streak = computeWeekStreak();
  const { highlights: exerciseHighlights, starCount, improvedCount } = computeExerciseHighlights(session);
  const sessionAvgRpe = rpeEnabled() ? avgRpeForSessions([session]) : null;
  const sessionKcal = estimateSessionKcal(session);
  const durationDisplay = fmtDuration(session.durationSec);
  // Ab 1h wird aus "MM:SS" ein "H:MM:SS" — spürbar breiter, daher kleinere Schrift in der Pill
  // (siehe .summary-pill-value-long), damit die Ziffern nicht über die Trennlinie laufen.
  const durationValueClass = `summary-pill-value${session.durationSec >= 3600 ? ' summary-pill-value-long' : ''}`;
  // Wie viele Kennzahlen zeigt die Leiste tatsächlich? Dauer und Serie sind immer dabei, der
  // Rest nur bei vorhandenen Werten bzw. aktivierter Einstellung (RPE/kcal). Ab 5 Feldern wird
  // es auf schmalen Bildschirmen zu gedrängt (Zahlen liefen sichtbar in die Trennlinien und die
  // Labels umbrachen zweizeilig ineinander) — dann greift .summary-pill-compact: kleinere
  // Zahlen/Icons und alle grauen Labels ausgeblendet AUSSER "≈ kcal" (die einzige Zahl, die
  // ohne Beschriftung nicht selbsterklärend wäre; Serie/Rekorde/Verbessert haben ihr Icon,
  // Dauer ihr Doppelpunkt-Format, RPE seine Farbe).
  const pillItemCount = 2 + (starCount > 0 ? 1 : 0) + (improvedCount > 0 ? 1 : 0)
    + (sessionAvgRpe != null ? 1 : 0) + (sessionKcal != null ? 1 : 0);

  const rowsHTML = exerciseHighlights.map(h => {
    const planEx = plan.exercises.find(x => x.id === h.exerciseId);
    const img = planEx && planEx.imageData;
    const setsLine = h.isTime ? h.sets.map(s => fmtSec(s.seconds)).join(' · ') : h.sets.map(s => `${s.reps}×${s.weight ?? 0}kg`).join(' · ');
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
    ${starCount > 0 ? `
    <div class="summary-badge" style="margin-top:8px;">
      <div class="summary-badge-number"><img class="summary-badge-icon-img" src="${ICON_RECORD}" alt="">${starCount}</div>
      <div class="summary-badge-label">Allzeitrekorde</div>
    </div>` : `
    <div class="summary-badge" style="margin-top:8px;">
      <div class="summary-badge-number">${sessionNumber}.</div>
      <div class="summary-badge-label">Einheit</div>
    </div>`}
    <div class="summary-print-meta">${fmtDate(session.date)}</div>
    <div class="summary-pill${pillItemCount >= 5 ? ' summary-pill-compact' : ''}">
      <div class="summary-pill-item">
        <div class="summary-pill-top"><span class="${durationValueClass}">${durationDisplay}</span></div>
        <div class="summary-pill-label">Dauer</div>
      </div>
      <div class="summary-pill-divider"></div>
      <div class="summary-pill-item">
        <div class="summary-pill-top"><img class="summary-pill-icon-img" src="${ICON_FLAME}" alt=""><span class="summary-pill-value">${streak === 1 ? 'W1' : streak + 'W'}</span></div>
        <div class="summary-pill-label">am Stück</div>
      </div>
      ${starCount > 0 ? `
      <div class="summary-pill-divider"></div>
      <div class="summary-pill-item">
        <div class="summary-pill-top"><img class="summary-pill-icon-img" src="${ICON_RECORD}" alt=""><span class="summary-pill-value">${starCount}</span></div>
        <div class="summary-pill-label">Rekorde</div>
      </div>` : ''}
      ${improvedCount > 0 ? `
      <div class="summary-pill-divider"></div>
      <div class="summary-pill-item">
        <div class="summary-pill-top"><img class="summary-pill-icon-img" src="${ICON_IMPROVEMENT}" alt=""><span class="summary-pill-value">${improvedCount}</span></div>
        <div class="summary-pill-label">Verbessert</div>
      </div>` : ''}
      ${sessionAvgRpe != null ? `
      <div class="summary-pill-divider"></div>
      <div class="summary-pill-item">
        <div class="summary-pill-top"><span class="summary-pill-value" style="color:${intensityBandForRpe(sessionAvgRpe).color};">${fmtRpe(sessionAvgRpe)}</span></div>
        <div class="summary-pill-label">Ø Intensität</div>
      </div>` : ''}
      ${sessionKcal != null ? `
      <div class="summary-pill-divider"></div>
      <div class="summary-pill-item">
        <div class="summary-pill-top"><span class="summary-pill-value">${sessionKcal.toLocaleString('de-DE')}</span></div>
        <div class="summary-pill-label summary-pill-label-keep">≈ kcal</div>
      </div>` : ''}
    </div>
    ${rowsHTML ? `
    <div class="section-label">Erfolge</div>
    <div class="summary-list">
      ${rowsHTML}
    </div>` : ''}
    <div class="summary-actions no-print">
      <button class="btn btn-ghost" id="btnSummaryShare">Teilen</button>
      <button class="btn btn-ghost" id="btnSummaryPdf">Als PDF</button>
    </div>
    <button class="btn btn-primary no-print" id="btnSummaryDone" style="margin-top:10px;">Fertig</button>
  `;

  app.querySelectorAll('.summary-row[data-exerciseid]').forEach(row => {
    row.onclick = () => goExerciseSessionDetail(session.id, row.dataset.exerciseid);
  });

  document.getElementById('btnSummaryDone').onclick = () => {
    // replaceView statt goHome(): der Zusammenfassungs-History-Eintrag wird durch "home"
    // ersetzt, nicht zusätzlich einer draufgelegt — sonst würde ein nachfolgendes
    // Zurück-Drücken wieder zur bereits abgeschlossenen Zusammenfassung zurückführen.
    replaceView('home');
    renderHome();
  };
  document.getElementById('btnSummaryPdf').onclick = async () => {
    const dateStub = (session.date || '').slice(0,10);
    await ensureJsPdfLoaded();
    await preloadPdfImageDataUrls(session.entries.map(e => e.exerciseId));
    let blob = null;
    try{ blob = buildFullSummaryPdfBlob(session, { sessionNumber, streak, highlights: exerciseHighlights }); }catch(err){ blob = null; }
    if (blob){
      downloadBlob(blob, `trainingsplan-zusammenfassung-${dateStub}.pdf`);
    } else {
      window.print();
    }
  };
  document.getElementById('btnSummaryShare').onclick = () => shareSession(session, { sessionNumber, streak });
}

function pdfSafeText(str){
  // jsPDFs Standardschriften (Helvetica etc.) können nur WinAnsi/Latin-1 darstellen —
  // Emojis und Pfeile/Sonderzeichen außerhalb davon führen sonst zu Zeichensalat im PDF.
  return String(str)
    .replace(/💪/g, '')
    .replace(/🔥/g, '')
    .replace(/▲/g, '(verbessert)')
    .replace(/✨/g, '(Neu)')
    .replace(/→/g, '->')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function hexToRgbArr(hex){
  const clean = String(hex).replace('#', '');
  return [parseInt(clean.slice(0,2), 16) || 0, parseInt(clean.slice(2,4), 16) || 0, parseInt(clean.slice(4,6), 16) || 0];
}

// Zeichnet einen Rahmen (abgerundetes Rechteck, kein Fill) um einen PDF-Abschnitt — entspricht
// der Karten-Optik (Hintergrund/Rahmen), die jedes Diagramm in der App umgibt; vorher hatten
// die PDF-Diagramme gar keinen Rahmen und wirkten freischwebend.
function pdfCardBox(doc, x, y, w, h){
  doc.setDrawColor(222); doc.setLineWidth(0.35);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, 'S');
}
// Zeichnet einen Donut-Ring direkt mit jsPDF-Bordmitteln (kein Canvas/SVG verfügbar) — JEDES
// Segment als EIN einziges gefülltes Polygon (Außenbogen vor, Innenbogen zurück) statt vieler
// einzelner Dreiecke wie zuvor: die alte Dreiecks-Variante erzeugte in der PDF-Darstellung
// sichtbare helle Nahtlinien zwischen den Dreiecken (Sonnenrad-Optik) — ein durchgehendes
// Polygon pro Segment hat keine internen Kanten mehr. Kleine Lücke zwischen den Segmenten und
// zentrale Beschriftung (Gesamtzahl + Label) analog zum Donut in der App.
function pdfDrawDonutChart(doc, cx, cy, outerR, innerR, segments, centerValue, centerLabel){
  const visible = segments.filter(s => s.value > 0);
  const total = visible.reduce((a,s) => a + s.value, 0);
  if (!total) return;
  let angle = -90;
  const gapDeg = visible.length > 1 ? 2.5 : 0;
  visible.forEach(seg => {
    const sweep = (seg.value / total) * 360;
    const startA = angle + gapDeg/2;
    const endA = angle + sweep - gapDeg/2;
    angle += sweep;
    if (endA <= startA) return;
    const steps = Math.max(2, Math.ceil((endA - startA) / 4));
    const pts = [];
    for (let i = 0; i <= steps; i++){
      const a = (startA + (endA - startA) * i / steps) * Math.PI / 180;
      pts.push([cx + outerR * Math.cos(a), cy + outerR * Math.sin(a)]);
    }
    for (let i = steps; i >= 0; i--){
      const a = (startA + (endA - startA) * i / steps) * Math.PI / 180;
      pts.push([cx + innerR * Math.cos(a), cy + innerR * Math.sin(a)]);
    }
    const deltas = [];
    for (let i = 1; i < pts.length; i++) deltas.push([pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]]);
    const [r,g,b] = hexToRgbArr(seg.color);
    doc.setFillColor(r, g, b);
    doc.lines(deltas, pts[0][0], pts[0][1], [1,1], 'F', true);
  });
  if (centerValue != null){
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30);
    doc.text(pdfSafeText(String(centerValue)), cx, cy - 0.5, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(140);
    doc.text(pdfSafeText(String(centerLabel || '')), cx, cy + 3.5, { align: 'center' });
  }
}
// Größeres Verlaufsdiagramm mit Grundlinie, zwei dezenten Gitterlinien, Punkten sowie
// Datums-Beschriftung an den Rändern und dem hervorgehobenen letzten Wert oben rechts —
// die PDF-Entsprechung der Hauptdiagramme (Bewegtes Gewicht/Trainingszeit) in der App, die im
// Export bisher komplett fehlten (nur die kleinen Muskelgruppen-Sparklines waren enthalten).
function pdfDrawLineChart(doc, x, y, w, h, points, colorHex, valueFormatter){
  const fmt = valueFormatter || (v => v);
  const [r,g,b] = hexToRgbArr(colorHex);
  if (!points.length || points.length < 2){
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(150);
    doc.text(pdfSafeText(points.length ? 'Noch zu wenig Daten für einen Verlauf.' : 'Keine Daten für diesen Zeitraum.'), x, y + h/2);
    return;
  }
  const padB = 5;
  const chartH = h - padB;
  const values = points.map(p => p.value);
  const maxV = Math.max(...values, 0);
  const minV = Math.min(0, ...values);
  const range = (maxV - minV) || 1;
  doc.setDrawColor(235); doc.setLineWidth(0.2);
  [0.33, 0.66].forEach(f => doc.line(x, y + chartH*f, x + w, y + chartH*f));
  doc.setDrawColor(205);
  doc.line(x, y + chartH, x + w, y + chartH);
  const coords = points.map((p,i) => ({
    x: x + (points.length > 1 ? (i/(points.length-1))*w : 0),
    y: y + chartH - ((p.value - minV)/range)*chartH,
    ...p
  }));
  doc.setDrawColor(r, g, b); doc.setLineWidth(0.7);
  for (let i = 1; i < coords.length; i++) doc.line(coords[i-1].x, coords[i-1].y, coords[i].x, coords[i].y);
  doc.setFillColor(r, g, b);
  coords.forEach(c => doc.circle(c.x, c.y, 0.8, 'F'));
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(140);
  doc.text(pdfSafeText(coords[0].label), x, y + h);
  doc.text(pdfSafeText(coords[coords.length-1].label), x + w, y + h, { align: 'right' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(r, g, b);
  doc.text(pdfSafeText(fmt(values[values.length-1])), x + w, y - 2, { align: 'right' });
}
// Kleine, achsenlose Verlaufslinie (Sparkline) in einer bestimmten Farbe innerhalb eines
// festen Rechtecks (x,y,w,h) — für die kompakten Pro-Muskelgruppe-Mini-Charts im PDF.
function pdfDrawSparkline(doc, x, y, w, h, points, colorHex){
  if (!points.length) return;
  const values = points.map(p => p.value);
  const maxV = Math.max(...values, 0);
  const minV = Math.min(0, ...values);
  const range = (maxV - minV) || 1;
  const [r,g,b] = hexToRgbArr(colorHex);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.6);
  let prevX = null, prevY = null;
  points.forEach((p, i) => {
    const px = x + (points.length > 1 ? (i / (points.length - 1)) * w : 0);
    const py = y + h - ((p.value - minV) / range) * h;
    if (prevX !== null) doc.line(prevX, prevY, px, py);
    prevX = px; prevY = py;
  });
}

function buildFullSummaryPdfBlob(session, opts){
  if (!window.jspdf || !window.jspdf.jsPDF) return null;
  opts = opts || {};
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marginX = 16;
  const pageWidth = 210 - marginX * 2;
  const pageBottom = 282;
  let y = 20;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text(pdfSafeText('Trainingsplan — Zusammenfassung'), marginX, y);
  y += 9;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(60);
  let metaLine = `${fmtDate(session.date)}  ·  Dauer ${fmtDuration(session.durationSec)}`;
  const summaryKcal = estimateSessionKcal(session);
  if (summaryKcal != null) metaLine += `  ·  ≈ ${summaryKcal} kcal`;
  if (opts.sessionNumber) metaLine += `  ·  Einheit Nr. ${opts.sessionNumber}`;
  if (opts.streak) metaLine += `  ·  ${opts.streak} ${opts.streak === 1 ? 'Woche' : 'Wochen'} am Stück`;
  doc.text(pdfSafeText(metaLine), marginX, y);
  y += 10;
  doc.setDrawColor(210);
  doc.line(marginX, y, 210 - marginX, y);
  y += 8;

  // Erfolge pro Übung nachschlagen (records/isNewAllTime > lastPct — sich gegenseitig
  // ausschließend, wie in der Zusammenfassung auf dem Bildschirm), damit jede Übung ihre
  // kompakte Markierung bekommt (Neu / Nx Rekord / Nx verbessert), ohne dass für Übungen
  // ohne jegliche Kennzahlen (z. B. Zeit-Übungen) etwas falsch angezeigt wird.
  const highlightMap = {};
  if (opts.highlights){
    opts.highlights.forEach(h => { highlightMap[h.exerciseId] = h; });
  }

  session.entries.forEach(e => {
    const imgSize = 20;
    const textX = marginX + imgSize + 4;
    const maxTextWidth = 210 - textX - marginX;

    const planEx = plan.exercises.find(x => x.id === e.exerciseId);
    const setsText = formatSetsLine(e, planEx);

    const h = highlightMap[e.exerciseId];
    let badgeText = '';
    if (h && h.isNew) badgeText = 'Neu';
    else if (h && h.records > 0) badgeText = h.records > 1 ? `${h.records}x Rekord` : 'Rekord';
    else if (h && h.improved > 0) badgeText = h.improved > 1 ? `${h.improved}x verbessert` : 'verbessert';

    // Übungsnotiz (planEx.note) nur anzeigen, wenn per opts.includeNotes ausdrücklich
    // gewünscht — beim Speichern der PDF ja, beim Teilen bewusst nicht (die Notiz ist eine
    // persönliche Geräteeinstellung, kein Teil der eigentlichen Trainings-Zusammenfassung).
    const noteText = (opts.includeNotes && planEx && planEx.note) ? planEx.note : '';

    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    const nameLines = doc.splitTextToSize(pdfSafeText(e.name), maxTextWidth);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const bodyLines = doc.splitTextToSize(pdfSafeText(setsText || '—'), maxTextWidth);
    const noteLines = noteText ? doc.splitTextToSize(pdfSafeText(`Notiz: ${noteText}`), maxTextWidth) : [];
    const textBlockH = nameLines.length * 5 + bodyLines.length * 4.2 + (badgeText ? 4.5 : 0) + (noteLines.length ? noteLines.length * 4.2 + 1.5 : 0) + 4;
    const blockH = Math.max(textBlockH, imgSize + 6);

    if (y + blockH > pageBottom){
      doc.addPage();
      y = 20;
    }

    if (planEx && planEx.imageData){
      const imgSrc = resolvePdfImageSrc(planEx.imageData);
      if (imgSrc){
        try{ doc.addImage(imgSrc, pdfImageFormatFor(imgSrc), marginX, y, imgSize, imgSize); }catch(err){ /* Bild überspringen, falls ungültig */ }
      }
    }

    let ty = y + 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20);
    doc.text(nameLines, textX, ty);
    ty += nameLines.length * 5;
    if (badgeText){
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      const isGold = badgeText === 'Neu' || badgeText.includes('Rekord');
      if (isGold) doc.setTextColor(180, 140, 30); else doc.setTextColor(90, 170, 90);
      doc.text(pdfSafeText(badgeText), textX, ty);
      ty += 4.5;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110);
    doc.text(bodyLines, textX, ty);
    ty += bodyLines.length * 4.2;
    if (noteLines.length){
      ty += 1.5;
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(140);
      doc.text(noteLines, textX, ty);
      ty += noteLines.length * 4.2;
    }

    y += Math.max(blockH, ty - y + 3);
    doc.setDrawColor(230);
    doc.line(marginX, y - 3, 210 - marginX, y - 3);
  });

  return doc.output('blob');
}

// Zeigt einen kurzen Toast mit Rückgängig-Option (z. B. nach dem Löschen einer Einheit).
// Die eigentliche Aktion ist zu diesem Zeitpunkt bereits ausgeführt — onUndo macht sie
// rückgängig, wird der Toast ignoriert (Zeitablauf oder manuelles Wegtippen andernorts),
// bleibt die Aktion endgültig. Es kann immer nur ein Toast gleichzeitig sichtbar sein; ein
// neuer Aufruf ersetzt einen evtl. noch sichtbaren alten Toast sofort (inkl. dessen Timer).
let undoToastTimeout = null;
function showUndoToast(message, onUndo){
  const existing = document.getElementById('undoToast');
  if (existing) existing.remove();
  if (undoToastTimeout) clearTimeout(undoToastTimeout);

  const toast = document.createElement('div');
  toast.className = 'undo-toast';
  toast.id = 'undoToast';
  toast.innerHTML = `
    <span class="undo-toast-text">${message}</span>
    <button class="undo-toast-btn" id="undoToastBtn">Rückgängig</button>
  `;
  document.body.appendChild(toast);

  const remove = () => { const el = document.getElementById('undoToast'); if (el) el.remove(); };
  document.getElementById('undoToastBtn').onclick = () => {
    clearTimeout(undoToastTimeout);
    remove();
    onUndo();
  };
  undoToastTimeout = setTimeout(remove, 5000);
}

// Kurze reine Bestätigungsmeldung OBEN am Bildschirmrand (kein Rückgängig-Button nötig, z. B.
// "Erfolgreich hinzugefügt: X") — bewusst eine eigene, einfachere Variante statt showUndoToast()
// zu missbrauchen (die IMMER einen Rückgängig-Button zeigt und unten sitzt). Blendet sich nach
// kurzer Zeit von selbst wieder aus.
let topToastTimeout = null;
function showTopToast(message){
  const existing = document.getElementById('topToast');
  if (existing) existing.remove();
  if (topToastTimeout) clearTimeout(topToastTimeout);

  const toast = document.createElement('div');
  toast.className = 'top-toast';
  toast.id = 'topToast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  const remove = () => {
    const el = document.getElementById('topToast');
    if (!el) return;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  };
  topToastTimeout = setTimeout(remove, 2200);
}

// Kompakter PDF-Export aller "Fortschritt"-Statistiken auf einen Blick — nutzt bewusst den
// AKTUELL gewählten Zeitraum (statsPeriod: Insgesamt/Woche/Monat/Jahr, dieselbe Auswahl wie
// im "Bewegtes Gewicht"/"Trainingszeit"-Screen), damit "das, was gerade ausgewählt ist" auch
// im Export landet. Übernimmt dieselben Muskelgruppen-Farben (muscleGroupColor()) wie überall
// sonst in der App, damit Bildschirm und PDF zueinander passen.
function buildProgressPdfBlob(){
  if (!window.jspdf || !window.jspdf.jsPDF) return null;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marginX = 14;
  const pageW = 210, pageH = 297;
  const contentW = pageW - marginX*2;
  let y = 16;

  const periodDaysMap = { total: null, week: 7, month: 30, year: 365 };
  const periodDays = periodDaysMap[statsPeriod] ?? null;
  const periodLabel = PERIOD_LABELS[statsPeriod] || 'Insgesamt';

  // Springt auf eine neue Seite, wenn der nächste Abschnitt (Höhe h) nicht mehr auf die
  // aktuelle Seite passt — verhindert, dass Kartenrahmen mitten über einen Seitenumbruch laufen.
  function ensureSpace(h){
    if (y + h > pageH - 14){ doc.addPage(); y = 16; }
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(20);
  doc.text(pdfSafeText('Trainingsplan — Statistiken'), marginX, y);
  y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100);
  doc.text(pdfSafeText(`Zeitraum: ${periodLabel} · erstellt am ${new Date().toLocaleDateString('de-DE')}`), marginX, y);
  y += 5;
  doc.setDrawColor(210);
  doc.line(marginX, y, pageW - marginX, y);
  y += 8;

  // ---------- Übersicht ----------
  {
    const boxH = 32;
    ensureSpace(boxH);
    pdfCardBox(doc, marginX, y, contentW, boxH);
    let ty = y + 7;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20);
    doc.text(pdfSafeText('Übersicht (gesamt)'), marginX + 5, ty);
    ty += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(70);
    doc.text(pdfSafeText(`${sessions.length} ${sessions.length === 1 ? 'Einheit' : 'Einheiten'} protokolliert`), marginX + 5, ty); ty += 5.2;
    doc.text(pdfSafeText(`Trainingszeit gesamt: ${fmtDuration(totalTrainingSeconds())}`), marginX + 5, ty); ty += 5.2;
    doc.text(pdfSafeText(`Bewegtes Gewicht gesamt: ${totalVolumeKg().toLocaleString('de-DE')} kg`), marginX + 5, ty);
    y += boxH + 8;
  }

  // ---------- Hauptdiagramme (Bewegtes Gewicht & Trainingszeit) — bisher im Export komplett
  // gefehlt, obwohl es genau die beiden Diagramme oben auf dem Statistik-Screen sind. ----------
  function drawLineChartSection(title, points, colorHex, formatter){
    const boxH = 46;
    ensureSpace(boxH);
    pdfCardBox(doc, marginX, y, contentW, boxH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20);
    doc.text(pdfSafeText(`${title} — ${periodLabel}`), marginX + 5, y + 7);
    pdfDrawLineChart(doc, marginX + 5, y + 12, contentW - 10, boxH - 20, points, colorHex, formatter);
    y += boxH + 8;
  }

  const volumePoints = aggregateSessions(s => sessionVolumeKg(s), statsPeriod).map(p => ({ label: p.label, value: p.value }));
  const timePoints = aggregateSessions(s => s.durationSec, statsPeriod).map(p => ({ label: p.label, value: p.value }));
  drawLineChartSection('Bewegtes Gewicht', volumePoints, cssVar('--accent-3') || '#6f9bd1', v => v.toLocaleString('de-DE') + ' kg');
  drawLineChartSection('Trainingszeit', timePoints, cssVar('--accent') || '#d9c74a', fmtDuration);

  // ---------- Muskelgruppen-Verteilung: zwei Donuts (statt der alten nahtlosen Kuchen-Optik) ----------
  const counts = computeMuscleGroupSetCounts(periodDays);
  const setGroups = MUSCLE_GROUP_ORDER.filter(g => g !== 'Kardio' && counts[g]);
  const setTotal = setGroups.reduce((a,g) => a + counts[g], 0);
  const sums = computeMuscleGroupVolumeSums(periodDays);
  const volGroups = MUSCLE_GROUP_ORDER.filter(g => g !== 'Kardio' && sums[g]);
  const volTotal = volGroups.reduce((a,g) => a + sums[g], 0);

  function drawDonutSection(title, groups, valuesMap, totalVal, unit, centerValue, centerLabel){
    const legendLineH = 5.2;
    const boxH = Math.max(46, 14 + groups.length * legendLineH + 6);
    ensureSpace(boxH);
    pdfCardBox(doc, marginX, y, contentW, boxH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20);
    doc.text(pdfSafeText(`${title} — ${periodLabel}`), marginX + 5, y + 7);
    const chartCy = y + 8 + 16;
    const cx = marginX + 5 + 16, outerR = 15, innerR = 9;
    if (totalVal > 0){
      pdfDrawDonutChart(doc, cx, chartCy, outerR, innerR, groups.map(g => ({ value: valuesMap[g], color: muscleGroupColor(g) })), centerValue, centerLabel);
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(150);
      doc.text(pdfSafeText('Keine Daten für diesen Zeitraum.'), marginX + 5, chartCy);
    }
    let ly = y + 11;
    const legendX = marginX + 43;
    groups.forEach(g => {
      const [r,gg,b] = hexToRgbArr(muscleGroupColor(g));
      doc.setFillColor(r, gg, b);
      doc.roundedRect(legendX, ly - 3, 3.4, 3.4, 0.6, 0.6, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60);
      const pct = totalVal ? Math.round(valuesMap[g] / totalVal * 100) : 0;
      const valText = unit === 'kg' ? `${Math.round(valuesMap[g]).toLocaleString('de-DE')} kg` : `${valuesMap[g]} Sätze`;
      doc.text(pdfSafeText(`${g} — ${valText} (${pct}%)`), legendX + 5, ly);
      ly += legendLineH;
    });
    y += boxH + 8;
  }

  drawDonutSection('Nach Sätzen', setGroups, counts, setTotal, 'sets', setTotal.toLocaleString('de-DE'), 'Sätze');
  drawDonutSection('Nach bewegtem Gewicht (kg)', volGroups, sums, volTotal, 'kg', Math.round(volTotal).toLocaleString('de-DE'), 'kg');

  // ---------- Bewegtes Gewicht je Muskelgruppe (Mini-Charts, jetzt jeweils in einer eigenen
  // Karte statt frei auf der Seite schwebend) ----------
  function sessionVolumeKgForGroupPdf(s, group){
    return s.entries.reduce((a,e) => {
      const planEx = plan.exercises.find(x => x.id === e.exerciseId);
      if (((planEx && planEx.muscleGroup) || 'Sonstige') !== group) return a;
      return a + e.sets.reduce((a2,st) => a2 + ((st.reps && st.weight) ? st.reps*effectiveSetWeight(planEx, st.weight) : 0), 0);
    }, 0);
  }
  const sparkGroups = MUSCLE_GROUP_ORDER.filter(g => g !== 'Kardio').filter(g => {
    const pts = aggregateSessions(s => sessionVolumeKgForGroupPdf(s, g), statsPeriod);
    return pts.reduce((a,p) => a + p.value, 0) > 0;
  });
  if (sparkGroups.length){
    ensureSpace(14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20);
    doc.text(pdfSafeText(`Bewegtes Gewicht je Muskelgruppe — ${periodLabel}`), marginX, y);
    y += 7;
    const colGap = 6;
    const colW = (contentW - colGap) / 2;
    const cardH = 24;
    let col = 0, rowY = y;
    sparkGroups.forEach(g => {
      if (col === 0){
        if (rowY + cardH > pageH - 14){ doc.addPage(); rowY = 16; }
        y = rowY;
      }
      const gPoints = aggregateSessions(s => sessionVolumeKgForGroupPdf(s, g), statsPeriod).map(p => ({ label: p.label, value: p.value }));
      const gTotal = gPoints.reduce((a,p) => a + p.value, 0);
      const x = marginX + col * (colW + colGap);
      pdfCardBox(doc, x, rowY, colW, cardH);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(20);
      doc.text(pdfSafeText(`${g} — ${Math.round(gTotal).toLocaleString('de-DE')} kg`), x + 4, rowY + 6);
      pdfDrawSparkline(doc, x + 4, rowY + 9, colW - 8, 11, gPoints, muscleGroupColor(g));
      col = col === 0 ? 1 : 0;
      if (col === 0) rowY += cardH + 4;
    });
  }

  return doc.output('blob');
}

function downloadBlob(blob, fileName){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function shareSession(session, opts){
  opts = opts || {};
  const { highlights } = computeExerciseHighlights(session);
  const dateStub = (session.date || '').slice(0,10);

  // Immer die vollständige Zusammenfassung (alle Übungen in Reihenfolge, mit kompakten
  // Erfolgs-Markierungen) — sowohl fürs native Teilen als auch als Download-Fallback,
  // entspricht genau dem, was auch auf dem Bildschirm zu sehen ist.
  await ensureJsPdfLoaded();
  await preloadPdfImageDataUrls(session.entries.map(e => e.exerciseId));
  let fullBlob = null;
  try{ fullBlob = buildFullSummaryPdfBlob(session, { ...opts, highlights }); }catch(err){ fullBlob = null; }
  if (fullBlob){
    try{
      const file = new File([fullBlob], `trainingsplan-zusammenfassung-${dateStub}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })){
        await navigator.share({ files: [file], title: 'Trainingseinheit' });
        return;
      }
    }catch(err){
      return; // Nutzer hat den Teilen-Dialog abgebrochen — kein Fehler
    }
    downloadBlob(fullBlob, `trainingsplan-zusammenfassung-${dateStub}.pdf`);
    return;
  }

  // Letzter Fallback ohne PDF (z. B. jsPDF nicht geladen): Text teilen
  const lines = [];
  lines.push(`💪 Trainingseinheit`);
  lines.push(`${fmtDate(session.date)} · Dauer ${fmtDuration(session.durationSec)}`);
  lines.push('');
  session.entries.forEach(e => {
    const planEx = plan.exercises.find(x => x.id === e.exerciseId);
    const setsText = formatSetsLine(e, planEx);
    lines.push(`${e.name}: ${setsText || '—'}`);
  });
  const text = lines.join('\n');

  if (navigator.share){
    try{ await navigator.share({ title: 'Trainingseinheit', text }); }
    catch(err){ /* Nutzer hat abgebrochen — kein Fehler */ }
    return;
  }
  try{
    await navigator.clipboard.writeText(text);
    alert('Teilen wird auf diesem Gerät nicht direkt unterstützt — die Zusammenfassung wurde stattdessen in die Zwischenablage kopiert.');
  }catch(err){
    alert('Teilen wird auf diesem Gerät leider nicht unterstützt.');
  }
}

