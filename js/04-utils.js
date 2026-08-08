/* ---------------------------------------------------
   Utils
--------------------------------------------------- */
// Berechnet das tatsächlich bewegte Gewicht für einen Satz unter Berücksichtigung
// von unterstützten Übungen (z. B. Klimmzugmaschine: Körpergewicht - eingestelltes Gewicht)
// und reinen Eigenkörpergewicht-Übungen (z. B. Liegestütze: Körpergewicht + evtl. Zusatzgewicht).
// planEx: das Übungsobjekt aus plan.exercises (kann undefined sein), setWeight: eingetragenes Gewicht am Gerät.
// bodyWeightFactor (optional, Default 1): Bei Übungen wie Situps/Rückenstrecker wird nicht das
// GANZE Körpergewicht bewegt, sondern nur ein Teil davon (im Wesentlichen der Rumpf — Kopf, Arme
// und Oberkörper, nicht die Beine). Biomechanische Schätzungen für den bewegten Rumpfanteil bei
// solchen Übungen liegen meist bei ca. 40–65 % des Körpergewichts; 0,5 ist als grobe, aber
// deutlich realistischere Näherung hinterlegt als 100 %. Ein eingetragenes Zusatzgewicht (z. B.
// eine Hantelscheibe auf der Brust) zählt davon unabhängig immer voll, da es tatsächlich komplett
// mitbewegt wird.
function effectiveSetWeight(planEx, setWeight){
  const w = setWeight ?? 0;
  if (!planEx) return w;
  const bw = plan && plan.bodyWeight;
  if (planEx.assisted && bw){
    return Math.max(0, bw - w);
  }
  if (planEx.bodyweightExercise && bw){
    const factor = planEx.bodyWeightFactor != null ? planEx.bodyWeightFactor : 1;
    return (bw * factor) + w;
  }
  return w;
}

// Zahlen-Eingabefelder, die Kommazahlen im deutschen Format (78,5 statt 78.5) annehmen
// sollen: Komma vor dem Parsen in einen Punkt umwandeln, und beim Anzeigen eines
// gespeicherten Werts umgekehrt einen Punkt durch ein Komma ersetzen.
function parseGermanNumber(str){
  if (str === null || str === undefined) return NaN;
  return Number(String(str).replace(',', '.'));
}
function formatGermanNumber(num){
  if (num === null || num === undefined || isNaN(num)) return '';
  return String(num).replace('.', ',');
}
function fmtDuration(sec){
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  const pad = n => String(n).padStart(2,'0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }) +
         ' · ' + d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

// Trägt einen neuen Körpergewichts-Wert sowohl als aktuellen Stand (plan.bodyWeight, wie
// bisher — bleibt für effectiveSetWeight()/Steckscheiben-Limit unverändert maßgeblich) als
// auch im Verlauf (plan.bodyWeightLog) ein. Pro Kalendertag wird nur EIN Eintrag geführt: ein
// zweites Eintragen am selben Tag überschreibt den bereits vorhandenen Eintrag dieses Tages
// statt einen weiteren Punkt anzuhängen — mehrere Punkte am selben Tag würden im Verlaufs-
// Chart (renderBodyWeightChart(), 08-stats-progress.js) nur als bedeutungsloses Auf-und-Ab
// erscheinen, ohne einen echten zeitlichen Verlauf abzubilden. Ruft NICHT selbst saveJSON()
// auf — das übernehmen die Aufrufer wie bisher (öffnet ihnen z. B. den Weg, mehrere
// Plan-Änderungen in einem Rutsch zu speichern).
function logBodyWeight(weight, dateISO){
  if (!plan) return;
  plan.bodyWeight = weight;
  if (!Array.isArray(plan.bodyWeightLog)) plan.bodyWeightLog = [];
  const iso = dateISO || new Date().toISOString();
  const dayKey = iso.slice(0, 10);
  const existingIdx = plan.bodyWeightLog.findIndex(e => e.date.slice(0, 10) === dayKey);
  if (existingIdx >= 0) plan.bodyWeightLog[existingIdx] = { date: iso, weight };
  else plan.bodyWeightLog.push({ date: iso, weight });
  plan.bodyWeightLog.sort((a, b) => new Date(a.date) - new Date(b.date));
}

