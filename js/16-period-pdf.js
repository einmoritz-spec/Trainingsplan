/* =========================================================================================
   ZEITRAUM-EXPORTE ALS PDF (Woche / Monat, Training und Ernährung)

   Zweck: Eine Datei, die man z. B. an einen Gesundheits-Assistenten weiterreichen kann, damit
   dieser die Einheiten bzw. Mahlzeiten in eine Health-App überträgt. Die PDFs sind deshalb
   bewusst als LESBARE PROTOKOLLE aufgebaut (Datum, Uhrzeit, Dauer, kcal, Sätze bzw. Mahlzeiten
   mit Mengen und Makros) statt als reine Zusammenfassung — ein Assistent kann daraus jeden
   einzelnen Eintrag übernehmen.

   HINWEIS (gilt wie schon bei ftExportDaySnapshotPdf(), 15b-food-day.js): Google Health Connect
   nimmt keine PDFs als strukturierte Messwerte entgegen. Die Datei ist zum Weitergeben und
   manuellen/assistierten Übertragen gedacht, nicht als automatischer Datenimport.

   Aufgerufen wird alles über openPeriodExportPopup() — angebunden an den PDF-Button unter
   jedem Monat der Trainings-Monatsübersicht (monthOverviewBlockHTML(), 05-calendar.js) und der
   Essenstracker-Monatsübersicht (ftMonthBlockHTML(), 15b-food-day.js). Von dort aus wählt man
   "Ganzer Monat" oder eine einzelne Kalenderwoche.

   Nutzt dieselben jsPDF-Bauhelfer wie die bestehenden Exporte (ensureJsPdfLoaded, pdfSafeText,
   pdfCardBox, downloadBlob aus 12-session-summary.js / 04-utils.js), damit Optik, Zeichensatz-
   Behandlung (WinAnsi) und Lazy-Load identisch bleiben.
   ========================================================================================= */

// ---------------------------------------------------------------------------------------
// Datums-Helfer (bewusst lokal: die App hat keine gemeinsame Wochen-Utility, und die
// Essenstracker-Varianten arbeiten mit ISO-Strings, der Trainingsteil mit Date-Objekten)
// ---------------------------------------------------------------------------------------
function periodISO(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function periodMondayOf(date){
  const x = new Date(date);
  x.setHours(0,0,0,0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Montag als Wochenstart, wie im Wochenstreifen
  return x;
}
// ISO-8601-Kalenderwoche (Woche 1 = die mit dem ersten Donnerstag des Jahres) — dieselbe
// Zählung, die Kalender-Apps und Health-Apps in Deutschland verwenden.
function periodIsoWeekNumber(date){
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
}
// Alle Kalenderwochen, die mindestens einen Tag des Monats enthalten. Die Wochen werden NICHT
// am Monatsrand abgeschnitten: Eine Woche als Trainings-/Ernährungseinheit ergibt nur komplett
// Sinn (Mo–So), und für die Health-App ist der volle Wochenverlauf die nützlichere Angabe.
function periodWeeksInMonth(year, month){
  const lastDay = new Date(year, month + 1, 0);
  const weeks = [];
  let cursor = periodMondayOf(new Date(year, month, 1));
  while (cursor <= lastDay){
    const to = new Date(cursor);
    to.setDate(cursor.getDate() + 6);
    weeks.push({ from: new Date(cursor), to });
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}
function periodShortDate(d){
  return d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
}
function periodLongDate(d){
  return d.toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' });
}
function periodRangeLabel(from, to){
  return `${periodShortDate(from)}–${to.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })}`;
}
// Alle Tage eines Zeitraums als ISO-Strings, chronologisch.
function periodDayList(from, to){
  const out = [];
  const cur = new Date(from);
  cur.setHours(0,0,0,0);
  while (cur <= to){
    out.push(periodISO(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Auswahl-Popup: "Ganzer Monat" oder einzelne Woche
// kind: 'training' | 'food'
// ---------------------------------------------------------------------------------------
function openPeriodExportPopup(kind, year, month){
  const existing = document.getElementById('periodExportOverlay');
  if (existing) existing.remove();

  const monthLabel = `${MONTH_NAMES_DE[month]} ${year}`;
  const weeks = periodWeeksInMonth(year, month);
  const weekBtns = weeks.map((w, i) => `
    <button class="wizard-choice" type="button" data-period-week="${i}">
      KW ${periodIsoWeekNumber(w.from)} · ${periodShortDate(w.from)}–${periodShortDate(w.to)}
    </button>
  `).join('');

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'periodExportOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal" style="max-height:none;">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">${kind === 'food' ? 'Ernährung' : 'Trainings'} als PDF</div>
        <div class="add-exercise-modal-header-icons">
          <button class="add-exercise-modal-close" id="periodExportClose" aria-label="Schließen">✕</button>
        </div>
      </div>
      <div class="new-exercise-modal-body">
        <div class="ft-section-label">Zeitraum</div>
        <button class="wizard-choice" type="button" data-period-month="1">Ganzer Monat · ${monthLabel}</button>
        <div class="ft-section-label">Einzelne Woche</div>
        ${weekBtns}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(remove);

  function remove(){ const el = document.getElementById('periodExportOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); };
  document.getElementById('periodExportClose').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };

  const run = (from, to, label, fileSuffix) => {
    close();
    if (kind === 'food') exportFoodPeriodPdf(from, to, label, fileSuffix);
    else exportTrainingPeriodPdf(from, to, label, fileSuffix);
  };

  overlay.querySelector('[data-period-month]').onclick = () => {
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 0);
    run(from, to, monthLabel, `${year}-${String(month+1).padStart(2,'0')}`);
  };
  overlay.querySelectorAll('[data-period-week]').forEach(btn => {
    btn.onclick = () => {
      const w = weeks[Number(btn.dataset.periodWeek)];
      const kw = periodIsoWeekNumber(w.from);
      run(w.from, w.to, `KW ${kw} · ${periodRangeLabel(w.from, w.to)}`, `${w.from.getFullYear()}-KW${String(kw).padStart(2,'0')}`);
    };
  });
}

// ---------------------------------------------------------------------------------------
// Gemeinsames PDF-Grundgerüst (Kopfzeile, Seitenumbruch-Helfer)
// ---------------------------------------------------------------------------------------
function periodPdfStart(title, subtitle){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ctx = {
    doc,
    marginX: 16,
    pageWidth: 210 - 32,
    pageBottom: 282,
    y: 20,
  };
  ctx.ensureSpace = (need) => { if (ctx.y + need > ctx.pageBottom){ doc.addPage(); ctx.y = 20; } };
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(20);
  doc.text(pdfSafeText(title), ctx.marginX, ctx.y);
  ctx.y += 9;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(60);
  doc.text(pdfSafeText(subtitle), ctx.marginX, ctx.y);
  ctx.y += 10;
  doc.setDrawColor(210);
  doc.line(ctx.marginX, ctx.y, 210 - ctx.marginX, ctx.y);
  ctx.y += 8;
  return ctx;
}
// Kennzahlen-Kasten im Stil der bestehenden PDFs (gleiche Optik wie im Tages-Snapshot).
function periodPdfSummaryBox(ctx, parts){
  const { doc, marginX, pageWidth } = ctx;
  const boxH = 16;
  ctx.ensureSpace(boxH + 4);
  pdfCardBox(doc, marginX, ctx.y, pageWidth, boxH);
  const colW = pageWidth / parts.length;
  parts.forEach((p, i) => {
    const cx = marginX + colW * i + colW / 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(30);
    doc.text(pdfSafeText(String(p.value)), cx, ctx.y + 8, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(130);
    doc.text(pdfSafeText(p.label), cx, ctx.y + 12.5, { align: 'center' });
  });
  ctx.y += boxH + 8;
}
function periodPdfDayHeading(ctx, text, rightText){
  const { doc, marginX } = ctx;
  ctx.ensureSpace(12);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(20);
  doc.text(pdfSafeText(text), marginX, ctx.y);
  if (rightText){
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120);
    doc.text(pdfSafeText(rightText), 210 - marginX, ctx.y, { align: 'right' });
  }
  ctx.y += 2;
  doc.setDrawColor(225);
  doc.line(marginX, ctx.y, 210 - marginX, ctx.y);
  ctx.y += 5;
}
function periodPdfFinish(ctx, fileName){
  // Fußzeile auf jeder Seite: Herkunft der Datei, damit beim Weiterreichen klar ist, worum es
  // sich handelt und wann der Stand erzeugt wurde.
  const { doc } = ctx;
  const total = doc.internal.getNumberOfPages();
  const stamp = new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
  for (let i = 1; i <= total; i++){
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(150);
    doc.text(pdfSafeText(`Trainingsplan-App · erstellt am ${stamp}`), 16, 289);
    doc.text(pdfSafeText(`Seite ${i} / ${total}`), 194, 289, { align: 'right' });
  }
  downloadBlob(doc.output('blob'), fileName);
  ftToast('PDF erstellt');
}
async function periodPdfReady(){
  await ensureJsPdfLoaded();
  if (!window.jspdf || !window.jspdf.jsPDF){ ftToast('PDF-Erstellung nicht verfügbar'); return false; }
  return true;
}

// ---------------------------------------------------------------------------------------
// TRAINING: alle Einheiten eines Zeitraums
// ---------------------------------------------------------------------------------------
function periodSessionsInRange(from, to){
  const start = new Date(from); start.setHours(0,0,0,0);
  const end = new Date(to); end.setHours(23,59,59,999);
  return (typeof sessions !== 'undefined' ? sessions : [])
    .filter(s => { const d = new Date(s.date); return d >= start && d <= end; })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}
async function exportTrainingPeriodPdf(from, to, rangeLabel, fileSuffix){
  if (!(await periodPdfReady())) return;
  const list = periodSessionsInRange(from, to);
  const ctx = periodPdfStart('Trainingsprotokoll', `${rangeLabel} · ${periodRangeLabel(from, to)}`);
  const { doc, marginX, pageWidth } = ctx;

  const totalSec = list.reduce((s, x) => s + (x.durationSec || 0), 0);
  const totalKcal = list.reduce((s, x) => s + (estimateSessionKcal(x) || 0), 0);
  const summary = [
    { label: 'Einheiten', value: list.length },
    { label: 'Gesamtdauer', value: fmtDuration(totalSec) },
    { label: 'kcal gesamt', value: totalKcal ? `≈ ${totalKcal}` : '—' },
  ];
  // Ø Intensität nur, wenn die RPE-Erfassung überhaupt aktiv ist — sonst stünde dort dauerhaft
  // ein Platzhalter, der den Kasten nur verwässert.
  if (typeof rpeEnabled === 'function' && rpeEnabled()){
    const avg = (typeof avgRpeForSessions === 'function') ? avgRpeForSessions(list) : null;
    summary.push({ label: 'Ø Intensität', value: avg != null ? fmtRpe(avg) : '—' });
  }
  periodPdfSummaryBox(ctx, summary);

  if (!list.length){
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(150);
    doc.text(pdfSafeText('In diesem Zeitraum wurde kein Training protokolliert.'), marginX, ctx.y);
    periodPdfFinish(ctx, `trainings-${fileSuffix}.pdf`);
    return;
  }

  list.forEach(session => {
    const started = new Date(session.date);
    const timeLabel = started.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const kcal = estimateSessionKcal(session);
    // Uhrzeit und Dauer stehen bewusst in der Kopfzeile jeder Einheit: Genau diese beiden
    // Angaben braucht eine Health-App, um eine Trainingseinheit anzulegen.
    periodPdfDayHeading(
      ctx,
      `${periodLongDate(started)} · ${timeLabel} Uhr`,
      `${fmtDuration(session.durationSec)}${kcal != null ? ` · ≈ ${kcal} kcal` : ''}`
    );

    ctx.ensureSpace(8);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(40);
    doc.text(pdfSafeText(modeDisplayLabel(session.mode)), marginX, ctx.y);
    if (session.excludeFromStats){
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(150);
      const reason = (typeof SESSION_EXCLUSION_LABELS !== 'undefined' && SESSION_EXCLUSION_LABELS[session.exclusionReason]) || 'Aus Statistik ausgeschlossen';
      doc.text(pdfSafeText(reason), 210 - marginX, ctx.y, { align: 'right' });
    }
    ctx.y += 5.5;

    (session.entries || []).forEach(e => {
      const planEx = plan.exercises.find(x => x.id === e.exerciseId);
      const setsText = formatSetsLine(e, planEx) || '—';
      ctx.ensureSpace(6);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70);
      const lines = doc.splitTextToSize(pdfSafeText(`${e.name}: ${setsText}`), pageWidth - 4);
      doc.text(lines, marginX + 2, ctx.y);
      ctx.y += lines.length * 4.2 + 1.5;
    });
    ctx.y += 5;
  });

  periodPdfFinish(ctx, `trainings-${fileSuffix}.pdf`);
}

// ---------------------------------------------------------------------------------------
// ERNÄHRUNG: alle Tage eines Zeitraums
// ---------------------------------------------------------------------------------------
async function exportFoodPeriodPdf(from, to, rangeLabel, fileSuffix){
  if (!(await periodPdfReady())) return;
  const isoDays = periodDayList(from, to);
  const ctx = periodPdfStart('Ernährungsprotokoll', `${rangeLabel} · ${periodRangeLabel(from, to)}`);
  const { doc, marginX, pageWidth } = ctx;

  // Nur Tage mit Einträgen zählen in die Durchschnitte — sonst zöge ein nicht protokollierter
  // Tag den Schnitt rechnerisch nach unten, obwohl schlicht nichts erfasst wurde.
  const tracked = isoDays.map(iso => ({ iso, totals: ftDayTotalsForISO(iso) })).filter(d => d.totals);
  const sum = tracked.reduce((acc, d) => {
    acc.kcal += d.totals.kcal; acc.p += d.totals.p; acc.c += d.totals.c; acc.f += d.totals.f;
    return acc;
  }, { kcal:0, p:0, c:0, f:0 });
  const days = tracked.length || 1;
  periodPdfSummaryBox(ctx, [
    { label: 'Tage protokolliert', value: `${tracked.length} / ${isoDays.length}` },
    { label: 'Ø kcal/Tag', value: Math.round(sum.kcal / days) },
    { label: 'Ø Protein', value: `${Math.round(sum.p / days)} g` },
    { label: 'Ø Kohlenhydrate', value: `${Math.round(sum.c / days)} g` },
    { label: 'Ø Fett', value: `${Math.round(sum.f / days)} g` },
  ]);

  if (!tracked.length){
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(150);
    doc.text(pdfSafeText('In diesem Zeitraum wurde nichts protokolliert.'), marginX, ctx.y);
    periodPdfFinish(ctx, `ernaehrung-${fileSuffix}.pdf`);
    return;
  }

  tracked.forEach(({ iso, totals }) => {
    const d = ftParseISO(iso);
    periodPdfDayHeading(
      ctx,
      periodLongDate(d),
      `${totals.kcal} kcal · P ${totals.p} g · KH ${totals.c} g · F ${totals.f} g`
    );

    // ftDays direkt lesen statt über ftGetDay(): Letzteres legt fehlende Tage an und würde beim
    // Export ungewollt leere Einträge in den Datenbestand schreiben.
    const day = (typeof ftDays !== 'undefined' && ftDays[iso]) || {};
    FT_MEAL_KEYS.forEach(mealKey => {
      const entries = day[mealKey] || [];
      if (!entries.length) return;
      ctx.ensureSpace(8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(60);
      doc.text(pdfSafeText(`${FT_MEAL_LABELS[mealKey]} · ${ftMealTotal(iso, mealKey)} kcal`), marginX + 1, ctx.y);
      ctx.y += 4.6;
      entries.forEach(e => {
        ctx.ensureSpace(6);
        const qty = e.kind === 'mealGroup'
          ? `${ftPortionLabel(e.portion)} Portion`
          : (e.kind === 'manual' ? 'manuell' : (e.unitMode === 'piece' ? `${ftFormatNum(e.pieceCount)} × ${e.pieceLabel}` : `${e.amountG} g`));
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(80);
        const line = doc.splitTextToSize(pdfSafeText(`${e.name} — ${qty}`), pageWidth - 42);
        doc.text(line, marginX + 3, ctx.y);
        doc.setFontSize(8.8); doc.setTextColor(110);
        doc.text(
          pdfSafeText(`${Math.round(e.kcal)} kcal · P ${Math.round(e.p)} g · KH ${Math.round(e.c)} g · F ${Math.round(e.f)} g`),
          210 - marginX, ctx.y, { align: 'right' }
        );
        ctx.y += line.length * 4 + 1.2;
      });
      ctx.y += 2;
    });
    ctx.y += 3;
  });

  periodPdfFinish(ctx, `ernaehrung-${fileSuffix}.pdf`);
}
