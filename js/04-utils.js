/* ---------------------------------------------------
   Utils
--------------------------------------------------- */
// Diagnose-Stempel: wird unten in den Einstellungen angezeigt (renderSettings()) und macht
// sichtbar, welche Code-Version wirklich läuft. Bei einer PWA bedient der Service Worker
// (sw.js, Cache-First) nach einem Update oft noch mehrere Starts lang die ALTE Fassung —
// ohne diesen Stempel ist "der Fix wirkt nicht" nicht von "der Fix ist nie angekommen" zu
// unterscheiden. Bei jeder Änderung zusammen mit CACHE_NAME in sw.js erhöhen.
const BUILD_STAMP = '56';
/* ---------------------------------------------------
   Wake Lock (Bildschirm bei laufendem Training nicht abschalten)
   ---------------------------------------------------
   Die Screen-Wake-Lock-API gibt den Lock automatisch frei, sobald das Dokument nicht mehr
   sichtbar ist (App in den Hintergrund, Bildschirm sperrt sich) — bei bloßem Wechsel auf eine
   ANDERE Ansicht INNERHALB der App (z. B. übers Mini-Banner zur Startseite) bleibt er dagegen
   bestehen, da das Dokument sichtbar bleibt. Ein `visibilitychange`-Listener fordert ihn beim
   Zurückkehren in den Vordergrund automatisch erneut an, falls noch/wieder ein Training läuft
   (aktiv gehalten unabhängig vom Pausenstatus — auch während der Trainingspause soll der
   Bildschirm nicht einschlafen). Nicht unterstützende Browser/Geräte (kein `navigator.wakeLock`)
   scheitern still, ohne die App zu beeinträchtigen.
--------------------------------------------------- */
async function requestTrainingWakeLock(){
  if (!('wakeLock' in navigator)) return;
  if (!plan || plan.wakeLockEnabled !== true) return; // Standard aus, siehe Einstellungen → Training
  try{
    trainingWakeLock = await navigator.wakeLock.request('screen');
    trainingWakeLock.addEventListener('release', () => { trainingWakeLock = null; });
  }catch(err){
    trainingWakeLock = null; // z. B. Akkusparmodus oder Tab im Hintergrund — kein harter Fehler
  }
}
function releaseTrainingWakeLock(){
  if (trainingWakeLock){
    trainingWakeLock.release().catch(() => {});
    trainingWakeLock = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && active && !trainingWakeLock){
    requestTrainingWakeLock();
  }
});
/* ---------------------------------------------------
   Geschätzter Kalorienverbrauch (MET-basiert)
   ---------------------------------------------------
   Grobe Schätzung nach der Standardformel kcal/min = MET × 3,5 × Körpergewicht(kg) / 200 (siehe
   z. B. Compendium of Physical Activities). MET-Werte sind bewusst konservative Mittelwerte für
   "typisches" Training MIT Satzpausen (nicht Dauerbelastung) — eine echte Schätzung bräuchte
   Herzfrequenz-/Aktivitätstracking, das diese App nicht hat. Verstanden als grobe Orientierung,
   nicht als medizinisch/sportwissenschaftlich exakter Wert. Über plan.kcalEstimateEnabled in den
   Einstellungen ein-/ausschaltbar (Standard AUS, da es sich um eine Schätzung mit spürbaren
   Unsicherheiten handelt) — bei AUS liefert estimateSessionKcal() überall konsequent null zurück, an ALLEN
   Anzeigestellen (Trainingsdetail, Zusammenfassungs-PDF, Essenstracker-Snapshot) verschwindet
   die Anzeige dann einfach, ganz ohne eigene Prüfung an jeder einzelnen Stelle.
   Als Trainingsdauer je Übung wird e.timeSpentSec verwendet (siehe accrueExerciseTime(), zählt
   die Zeit, die die Übungskarte im aktiven Training geöffnet war — inkl. Satzpausen dieser
   Übung, was für eine Durchschnittsbetrachtung über die ganze Übung hinweg passt). Ältere, vor
   Einführung dieses Trackings gespeicherte Einheiten haben kein timeSpentSec (0/undefined) —
   für solche Einträge wird ersatzweise die Gesamtdauer der Einheit gleichmäßig auf alle Übungen
   ohne eigenen Zeitwert verteilt, damit auch alte Trainings eine (gröbere) Schätzung bekommen.
   Ist die RPE-Erfassung aktiv (rpeEnabled()) UND für eine Übung ein RPE-Wert eingetragen, fließt
   die tatsächlich empfundene Anstrengung zusätzlich als kleiner Auf-/Abschlag auf den MET-Wert
   dieser Übung ein (siehe rpeIntensityFactor()) — bei gleicher Dauer verbraucht ein als RPE 10
   (Muskelversagen) empfundener Satz mehr als derselbe Satz bei RPE 6 (noch deutlich Reserve).
   Ohne eingetragenen RPE-Wert (oder RPE-Erfassung aus) bleibt der MET-Wert unverändert wie
   bisher — reiner Bonus bei vorhandenen Daten, kein geschätzter Ersatzwert.
   Optional außerdem Geschlecht und Körpergröße (siehe bodyCompositionKcalFactor()) — beides
   nur ein kleiner, gedeckelter Korrekturfaktor obendrauf, kein dominierender Bestandteil der
   Formel (Körpergewicht bleibt der mit Abstand größte Faktor).
--------------------------------------------------- */
function kcalEstimateEnabled(){
  return plan && plan.kcalEstimateEnabled === true;
}
const MET_STRENGTH = 5.0;       // Krafttraining allgemein (freie Gewichte/Maschinen), Mittelwert moderat–intensiv inkl. Satzpausen
const MET_BODYWEIGHT = 4.0;     // Eigengewichtsübungen (Liegestütze, Klimmzüge etc.), moderat inkl. Satzpausen
const MET_CARDIO_MACHINE = {
  stepper: 5.0,       // Crosstrainer, moderat
  fahrrad: 6.0,        // Fahrradergometer, moderat (Widerstandsstufe wird bewusst nicht mit einberechnet — zu grobe Datenlage)
  rudern: 7.0,          // Rudergerät, moderat
  stairmaster: 9.0      // Stairmaster, intensiv
};
// Laufband: MET anhand des eingetragenen Tempos (km/h) — grobe Stufen angelehnt an die
// gängigen Compendium-Werte für Gehen/Laufen auf dem Laufband. Ohne eingetragenes Tempo (z. B.
// nur Zeit erfasst) Rückfall auf einen mittleren Jogging-Wert.
function estimateLaufbandMET(speedKmh){
  if (speedKmh == null || speedKmh <= 0) return 7.0;
  if (speedKmh < 4) return 2.0;
  if (speedKmh < 5.5) return 3.0;
  if (speedKmh < 6.5) return 3.5;
  if (speedKmh < 8) return 6.0;
  if (speedKmh < 9.5) return 8.0;
  if (speedKmh < 11) return 9.8;
  if (speedKmh < 12.5) return 11.0;
  if (speedKmh < 14.5) return 11.8;
  return 12.8;
}
function metForEntry(entry, planEx){
  if (planEx && planEx.cardioMachine){
    if (planEx.cardioMachine === 'laufband'){
      const speed = entry.sets && entry.sets[0] ? entry.sets[0].speed : null;
      return estimateLaufbandMET(speed);
    }
    return MET_CARDIO_MACHINE[planEx.cardioMachine] ?? 6.0;
  }
  if (planEx && (planEx.bodyweightExercise || planEx.noWeight)) return MET_BODYWEIGHT;
  return MET_STRENGTH;
}
// Faktor zwischen 0,85 (RPE_MIN, noch deutlich Reserve) und 1,15 (RPE_MAX, Muskelversagen),
// linear um 1,0 bei RPE_NEUTRAL (Mitte des Bereichs) — bewusst ein moderater Ausschlag (±15%):
// die Übung/Bewegung selbst bestimmt den Großteil des Verbrauchs (das steckt schon im MET-Wert),
// die empfundene Anstrengung verschiebt ihn nur zusätzlich leicht nach oben oder unten.
function rpeIntensityFactor(avgRpe){
  if (avgRpe == null) return 1;
  return 1 + (avgRpe - RPE_NEUTRAL) * (0.15 / ((RPE_MAX - RPE_MIN) / 2));
}
// Zusätzlicher, bewusst kleiner Korrekturfaktor aus Geschlecht (plan.bodySex) und BMI (aus
// plan.bodyHeightCm + Körpergewicht) — beides rein optional, ohne Angabe bleibt der Faktor bei
// genau 1 (unverändertes Verhalten wie vor dieser Erweiterung).
// Geschlecht: Frauen haben im Bevölkerungsdurchschnitt bei gleichem Gewicht einen etwas
// niedrigeren Grundumsatz (mehr Fett-, weniger Muskelanteil im Schnitt) — ein fester, moderater
// Abschlag von 8%, keine individuelle Aussage.
// BMI: bewusst NUR ein kleiner Ausschlag (±5%, gedeckelt) statt eines starken Faktors — BMI
// unterscheidet nicht zwischen Muskel- und Fettanteil (ein muskulöser Mensch mit hohem Gewicht
// bei normaler Größe hat einen hohen BMI, verbrennt aber tendenziell MEHR statt weniger), ist
// also nur eine sehr grobe Krücke. Referenzwert 22 (Mitte des als "normal" geltenden Bereichs).
function bodyCompositionKcalFactor(bw, heightCm, sex){
  let factor = 1;
  if (sex === 'female') factor *= 0.92;
  if (heightCm && bw){
    const heightM = heightCm / 100;
    const bmi = bw / (heightM * heightM);
    const bmiAdjustment = Math.max(-0.05, Math.min(0.05, (22 - bmi) * 0.005));
    factor *= (1 + bmiAdjustment);
  }
  return factor;
}
// Gibt die geschätzten kcal für eine gespeicherte Session zurück, oder null, wenn die Funktion
// in den Einstellungen deaktiviert ist oder kein Körpergewicht hinterlegt ist (die Formel
// braucht es zwingend, ein geratener Standardwert wäre hier eher irreführend als hilfreich —
// siehe auch die bestehende needsBodyWeightWarning-Logik im aktiven Training).
function estimateSessionKcal(session){
  const breakdown = estimateSessionKcalBreakdown(session);
  if (!breakdown) return null;
  return Math.round(breakdown.reduce((a, b) => a + b.kcal, 0));
}
// Wie estimateSessionKcal(), aber pro Übung statt nur als Gesamtsumme — Grundlage für
// Auswertungen, die wissen müssen, WOHER die kcal kommen (z. B. Verbrauch je Muskelgruppe oder
// je Trainingsart, siehe computeKcalByMuscleGroup()/computeKcalPerMinuteByCategory() weiter
// unten). estimateSessionKcal() selbst summiert nur noch das Ergebnis davon, damit die
// eigentliche MET-/Faktor-Rechnung an genau einer Stelle steht.
function estimateSessionKcalBreakdown(session){
  if (!kcalEstimateEnabled()) return null;
  const bw = plan && plan.bodyWeight;
  if (!bw || !session || !session.entries || !session.entries.length) return null;
  const bodyFactor = bodyCompositionKcalFactor(bw, plan.bodyHeightCm, plan.bodySex);
  const entriesWithoutOwnTime = session.entries.filter(e => !e.timeSpentSec);
  const fallbackSecPerEntry = entriesWithoutOwnTime.length
    ? (session.durationSec || 0) / entriesWithoutOwnTime.length
    : 0;
  const out = [];
  session.entries.forEach(e => {
    const planEx = plan.exercises.find(x => x.id === e.exerciseId);
    const sec = e.timeSpentSec || fallbackSecPerEntry;
    if (!sec) return;
    const met = metForEntry(e, planEx);
    const rpeFactor = rpeEnabled() ? rpeIntensityFactor(avgRpeForSessions([{ entries: [e] }])) : 1;
    const kcal = met * rpeFactor * bodyFactor * 3.5 * bw / 200 * (sec / 60);
    out.push({ entry: e, planEx, sec, kcal });
  });
  return out;
}
// Kategorie-Label für "kcal pro Minute je Trainingsart" — dieselbe Unterscheidung, die auch
// metForEntry() für die MET-Wahl trifft (Kardiogerät/Eigengewicht/Krafttraining), nur als
// sprechender Text statt als Rechenwert.
function kcalCategoryLabel(planEx){
  if (planEx && planEx.cardioMachine){
    return planEx.cardioMachine === 'laufband' ? 'Laufband' : (CARDIO_MACHINES[planEx.cardioMachine]?.label || 'Kardiogerät');
  }
  if (planEx && (planEx.bodyweightExercise || planEx.noWeight)) return 'Eigengewicht';
  return 'Krafttraining';
}
// kcal pro Minute je Trainingsart, gemittelt über alle Übungen einer Kategorie im Zeitraum —
// sagt aus, wie "dicht" eine Trainingsart im Schnitt ist, unabhängig von der Gesamtdauer.
function computeKcalPerMinuteByCategory(sessionList){
  const buckets = {};
  (sessionList || []).forEach(s => {
    const breakdown = estimateSessionKcalBreakdown(s);
    if (!breakdown) return;
    breakdown.forEach(({ entry, planEx, sec, kcal }) => {
      const label = kcalCategoryLabel(planEx);
      if (!buckets[label]) buckets[label] = { kcal: 0, sec: 0 };
      buckets[label].kcal += kcal;
      buckets[label].sec += sec;
    });
  });
  return Object.entries(buckets)
    .map(([label, b]) => ({ label, perMinute: Math.round((b.kcal / (b.sec / 60)) * 10) / 10 }))
    .sort((a, b) => b.perMinute - a.perMinute);
}
// Geschätzter Verbrauch je Muskelgruppe im Zeitraum (Summe, nicht Ø) — Kardiogeräte fallen
// unter die eigene Kategorie "Kardio" (schon Teil von MUSCLE_GROUP_ORDER), nicht unter die
// Muskelgruppe des jeweiligen Geräte-Übungseintrags.
function computeKcalByMuscleGroup(sessionList){
  const buckets = {};
  (sessionList || []).forEach(s => {
    const breakdown = estimateSessionKcalBreakdown(s);
    if (!breakdown) return;
    breakdown.forEach(({ planEx, kcal }) => {
      const group = (planEx && planEx.cardioMachine) ? 'Kardio' : ((planEx && planEx.muscleGroup) || 'Sonstige');
      buckets[group] = (buckets[group] || 0) + kcal;
    });
  });
  const total = Object.values(buckets).reduce((a, v) => a + v, 0);
  return MUSCLE_GROUP_ORDER.filter(g => buckets[g] > 0).map(g => ({
    group: g, kcal: Math.round(buckets[g]), pct: total ? Math.round(buckets[g] / total * 100) : 0,
  }));
}

/* ---------------------------------------------------
   Weitere RPE-Auswertungen (Trainingslast, Ermüdungskurve, Muskelgruppen, härteste Übungen,
   Effizienz) — reine Datenfunktionen, Darstellung siehe renderIntensityStats() (08c-stats-
   progress-list.js). Alle arbeiten auf einer bereits nach Zeitraum gefilterten sessionList.
--------------------------------------------------- */
// sRPE-Trainingslast (Session-RPE × Dauer in Minuten) — etablierte, einfache Kennzahl für die
// Gesamtbelastung einer Einheit (nicht nur "wie hart", sondern "wie viel harte Arbeit
// insgesamt"). null, wenn kein RPE oder keine Dauer vorliegt.
function sessionTrainingLoad(session){
  const avg = avgRpeForSessions([session]);
  if (avg == null || !session.durationSec) return null;
  return Math.round(avg * (session.durationSec / 60));
}
// Wöchentliche Trainingslast (Summe der sRPE-Werte aller Einheiten dieser Woche) für die
// letzten `weeks` Wochen bis heute, älteste zuerst. Jede Woche startet Montag.
function computeWeeklyTrainingLoad(sessionList, weeks){
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Montag = 0
  const thisMonday = new Date(now); thisMonday.setHours(0,0,0,0); thisMonday.setDate(now.getDate() - day);
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--){
    const start = new Date(thisMonday); start.setDate(thisMonday.getDate() - i * 7);
    const end = new Date(start); end.setDate(start.getDate() + 7);
    buckets.push({ start, end, load: 0 });
  }
  (sessionList || []).forEach(s => {
    const load = sessionTrainingLoad(s);
    if (load == null) return;
    const d = new Date(s.date);
    const b = buckets.find(b => d >= b.start && d < b.end);
    if (b) b.load += load;
  });
  return buckets.map(b => ({ label: `${b.start.getDate()}.${b.start.getMonth()+1}.`, value: Math.round(b.load), date: b.start.toISOString() }));
}
// Ø RPE nach Position des Satzes INNERHALB einer Übung (1. Satz, 2. Satz, …) über alle Einträge
// im Zeitraum hinweg — zeigt, ob die Anstrengung über eine Übung hinweg typischerweise ansteigt
// (normal) oder schon früh hoch ist (evtl. zu wenig Aufwärmen/zu ambitionierter Einstieg). Nur
// Positionen mit mindestens ein paar Datenpunkten werden gezeigt, sonst wäre "Satz 6" nach nur
// einer einzigen Übung mit 6 Sätzen ein Wert ohne jede Aussagekraft.
function computeRpeFatigueBySetIndex(sessionList){
  const buckets = {};
  (sessionList || []).forEach(s => (s.entries || []).forEach(e => (e.sets || []).forEach((st, i) => {
    if (typeof st.rpe !== 'number') return;
    if (!buckets[i]) buckets[i] = { sum: 0, count: 0 };
    buckets[i].sum += st.rpe; buckets[i].count++;
  })));
  const maxIdx = Math.max(-1, ...Object.keys(buckets).map(Number));
  const points = [];
  for (let i = 0; i <= maxIdx; i++){
    if (!buckets[i] || buckets[i].count < 3) continue;
    points.push({ label: 'Satz ' + (i + 1), value: Math.round((buckets[i].sum / buckets[i].count) * 10) / 10 });
  }
  return points;
}
// Ø RPE je Muskelgruppe im Zeitraum, absteigend nach Anstrengung sortiert.
function computeRpeByMuscleGroup(sessionList){
  const buckets = {};
  (sessionList || []).forEach(s => (s.entries || []).forEach(e => {
    const planEx = plan.exercises.find(x => x.id === e.exerciseId);
    const group = (planEx && planEx.cardioMachine) ? 'Kardio' : ((planEx && planEx.muscleGroup) || 'Sonstige');
    (e.sets || []).forEach(st => {
      if (typeof st.rpe !== 'number') return;
      if (!buckets[group]) buckets[group] = { sum: 0, count: 0 };
      buckets[group].sum += st.rpe; buckets[group].count++;
    });
  }));
  return Object.entries(buckets)
    .map(([group, b]) => ({ group, avg: Math.round((b.sum / b.count) * 10) / 10, count: b.count }))
    .sort((a, b) => b.avg - a.avg);
}
// Übungen mit der höchsten Ø-Anstrengung im Zeitraum — nur Übungen mit mindestens `minSets`
// erfassten RPE-Werten (Standard 3), damit nicht eine einzelne, zufällig hart empfundene
// Übung mit nur einem Satz das Ranking anführt.
function computeHardestExercises(sessionList, minSets){
  const threshold = minSets || 3;
  const buckets = {};
  (sessionList || []).forEach(s => (s.entries || []).forEach(e => {
    (e.sets || []).forEach(st => {
      if (typeof st.rpe !== 'number') return;
      if (!buckets[e.name]) buckets[e.name] = { sum: 0, count: 0 };
      buckets[e.name].sum += st.rpe; buckets[e.name].count++;
    });
  }));
  return Object.entries(buckets)
    .filter(([, b]) => b.count >= threshold)
    .map(([name, b]) => ({ name, avg: Math.round((b.sum / b.count) * 10) / 10, count: b.count }))
    .sort((a, b) => b.avg - a.avg);
}
// Bewegtes Gewicht (kg) einer Session, unabhängig von Rekorden/Anzeigefiltern — reiner
// Rohwert Wdh × Gewicht über alle Sätze, Basis für den Effizienz-Trend unten.
function sessionVolumeKgRaw(session){
  let vol = 0;
  (session.entries || []).forEach(e => (e.sets || []).forEach(st => {
    if (typeof st.reps === 'number' && typeof st.weight === 'number') vol += st.reps * st.weight;
  }));
  return vol;
}
// Effizienz-Trend: bewegtes Gewicht PRO RPE-Punkt, je Einheit — steigt dieser Wert über die
// Zeit, bewegt man bei gleicher empfundener Anstrengung mehr Gewicht (echter Fortschritt,
// unabhängig von reiner Zunahme der Trainingshärte). Nur Einheiten mit sowohl Volumen als auch
// erfasstem RPE fließen ein.
function computeEfficiencyPoints(sessionList){
  return (sessionList || [])
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(s => {
      const avg = avgRpeForSessions([s]);
      const vol = sessionVolumeKgRaw(s);
      if (avg == null || !vol) return null;
      return { label: shortDate(s.date), value: Math.round(vol / avg), date: s.date };
    })
    .filter(Boolean);
}

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

/* ---------------------------------------------------
   Übungsbilder für den PDF-Export: WebP-Datei → Base64-Daten-URI
   ---------------------------------------------------
   Seit der Umstellung von app-data.js auf externe WebP-Dateien (siehe assets/exercises/,
   Task "Bilder als eigene Dateien statt Base64") ist planEx.imageData für die
   Standard-Übungsbibliothek KEIN Data-URI mehr, sondern ein relativer Pfad
  (z. B. "assets/exercises/e1.webp") — funktioniert unverändert direkt als <img src="...">,
   ABER jsPDF.addImage() (siehe buildFullSummaryPdfBlob(), 12-session-summary.js) kann nur
   mit Binärdaten/Base64 umgehen, nicht mit einer URL. Individuelle, vom Nutzer selbst
   hochgeladene Übungsbilder (siehe downscaleImageFile(), 10-plan-settings.js) bleiben davon
   unberührt weiterhin waschechte Data-URIs und brauchen hier gar nichts.

   preloadPdfImageDataUrls() holt VOR dem eigentlichen PDF-Aufbau alle betroffenen
   Bild-Dateien einmalig per fetch() (läuft dank Service-Worker-Cache auch offline) und
   wandelt sie in Base64 um; das Ergebnis wird pro Pfad gecacht, ein PDF-Export braucht
   also nur beim allerersten Mal pro Bild einen echten Netzwerk-/Cache-Zugriff.
   resolvePdfImageSrc()/pdfImageFormatFor() lesen synchron aus diesem Cache — die
   eigentliche PDF-Aufbaulogik in 12-session-summary.js bleibt dadurch unverändert synchron,
   nur die Aufrufer holen VORHER per await den Cache befüllt.
--------------------------------------------------- */
const pdfImageDataUrlCache = new Map();
async function preloadPdfImageDataUrls(exerciseIds){
  const targets = Array.from(new Set(exerciseIds || []))
    .map(id => plan.exercises.find(x => x.id === id))
    .filter(ex => ex && typeof ex.imageData === 'string' && ex.imageData.length &&
      !ex.imageData.startsWith('data:') && !pdfImageDataUrlCache.has(ex.imageData));
  await Promise.all(targets.map(async (ex) => {
    try{
      const res = await fetch(ex.imageData);
      if (!res.ok) return;
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      pdfImageDataUrlCache.set(ex.imageData, dataUrl);
    }catch(err){ /* Bild bleibt im PDF einfach weg, siehe resolvePdfImageSrc() */ }
  }));
}
// Liefert den fürs PDF nutzbaren Bild-String: Data-URI bleibt Data-URI (eigene Bilder),
// ein Pfad wird gegen den oben befüllten Cache aufgelöst — ohne Treffer (Bild noch nicht
// geladen/Fehler) liefert die Funktion null, der Aufrufer überspringt das Bild dann wie
// bisher bei jedem ungültigen imageData.
function resolvePdfImageSrc(src){
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  return pdfImageDataUrlCache.get(src) || null;
}
// jsPDF braucht das Bildformat explizit (kein verlässliches Auto-Erkennen bei allen
// Formaten) — aus dem Mime-Typ des Data-URI-Präfixes abgeleitet, damit sowohl die alten
// JPEG-Bilder (individuelle Uploads) als auch die neuen WebP-Standardbilder funktionieren.
function pdfImageFormatFor(dataUrl){
  const m = /^data:image\/(\w+);/.exec(dataUrl || '');
  const type = m ? m[1].toUpperCase() : 'JPEG';
  return type === 'JPG' ? 'JPEG' : type;
}

/* ---------------------------------------------------
   RPE (Rate of Perceived Exertion) — optionale Erfassung pro Satz
   ---------------------------------------------------
   Standardmäßig AUS (siehe rpeEnabled()): eine zusätzliche Eingabe pro Satz ist ein Mehraufwand,
   den nicht jeder will. plan.rpeEnabled wird nur über den Schalter in den Einstellungen gesetzt
   (renderSettings(), 10-plan-settings.js). Ist er aus, tauchen weder die RPE-Eingabefelder in
   der aktiven Einheit auf (siehe 11b-active-session-render.js), noch fließt RPE in die
   Performancemodus-Vorschläge ein (siehe checkPerformanceSuggestion(), 11a-active-session.js) —
   das Verhalten ist dann exakt wie vorher.
--------------------------------------------------- */
/* ---------------------------------------------------
   Einheiten aus den Statistiken ausschließen ("Anderes Gym"/"Verletzt")
   ---------------------------------------------------
   Per Long-Press auf ein Training in der Kalenderübersicht (siehe wireDayPopupSessionPress()/
   openSessionExclusionPrompt(), 05-calendar.js) markierbar: session.excludeFromStats + ein
   Grund (session.exclusionReason, 'gym' oder 'injured'). Zweck: ein Training in einem fremden
   Gym (andere Geräte/Gewichtsraster) oder unter Verletzung (bewusst reduziertes Gewicht) soll
   NICHT als echter Rückschritt/Fortschritt in die persönliche Statistik einfließen — zählt aber
   weiterhin ganz normal als Trainingstag (Kalender-Punkt, Workouts-Zähler, Serie/Streak,
   Verlaufsliste bleiben komplett unberührt, siehe jeweilige Kommentare an den Aufrufstellen).
   sessionsForStats() ist die zentrale Filterfunktion — ÜBERALL dort verwendet, wo aus
   sessions echte Kennzahlen abgeleitet werden (bewegtes Gewicht, Trainingszeit-Charts,
   Muskelgruppen-Verteilung, RPE-Auswertungen, Rekorde, "letztes Mal"/Steigerungsvorschläge,
   Kalorienschätzung) — NICHT dort, wo es nur um "ist an dem Tag trainiert worden" geht
   (Kalenderpunkte, Wochen-/Monats-Workout-Zähler, Serie, Verlaufsliste, Split-Rotation).
--------------------------------------------------- */
function sessionsForStats(list){
  return (list || sessions).filter(s => !s.excludeFromStats);
}
const SESSION_EXCLUSION_LABELS = { gym: 'Anderes Gym', injured: 'Verletzt' };

function rpeEnabled(){
  return !!(plan && plan.rpeEnabled === true);
}
// Vernünftiger RPE-Wertebereich für Krafttraining (6 = noch 4+ Wdh. Reserve, 10 = Muskelversagen).
// 0.5er-Schritte, da das die gängige Auflösung in Trainings-Apps ist.
const RPE_MIN = 6;
const RPE_MAX = 10;
const RPE_STEP = 0.5;
// Ab diesem Wert gilt ein Satz als "hart" — wird von checkPerformanceSuggestion() genutzt, um
// bei bereits hoher Anstrengung KEINE weitere Steigerung vorzuschlagen (siehe dort).
const RPE_HIGH_THRESHOLD = 9;
// Neutralwert (Mitte des RPE_MIN–RPE_MAX-Bereichs): wird verwendet, um Übungen OHNE
// eingetragenen RPE-Wert bei der Priorisierung im Performancemodus-Kontingent (siehe
// computePerfSuggestionQuota(), 11a-active-session.js) weder zu bevorzugen noch zu
// benachteiligen — sie landen weder vorne (wie ein niedriger RPE-Wert) noch hinten (wie ein
// hoher), sondern schlicht in der Mitte der nach RPE sortierten Rangfolge.
const RPE_NEUTRAL = (RPE_MIN + RPE_MAX) / 2;
function fmtRpe(rpe){
  if (rpe === null || rpe === undefined || isNaN(rpe)) return '';
  return Number.isInteger(rpe) ? String(rpe) : rpe.toFixed(1);
}

/* ---------------------------------------------------
   Trainingsintensität (RPE) — Auswertung
   ---------------------------------------------------
   Vier grobe Intensitätsstufen über den vollen RPE_MIN–RPE_MAX-Bereich (6–10) dieser App,
   angelehnt an gängige RPE-Einordnungen (6 = noch deutlich Luft, 10 = Muskelversagen). Reine
   Orientierungswerte, keine sportwissenschaftliche Norm. Grün→Gelb→Orange→Rot folgt derselben
   "leicht bis hart"-Farblogik, die auch sonst in der App verwendet wird (grün für positive
   Deltas, die bestehende Rekord-Gelbfarbe #d9c74a, --accent-2 für Warnungen/negative Deltas).
--------------------------------------------------- */
const RPE_BANDS = [
  { key: 'locker', label: 'Locker', max: 7, color: '#7cc576' },
  { key: 'moderat', label: 'Moderat', max: 8, color: '#d9c74a' },
  { key: 'intensiv', label: 'Intensiv', max: 9, color: '#e0883a' },
  { key: 'maximal', label: 'Maximal', max: RPE_MAX, color: 'var(--accent-2)' }
];
function intensityBandForRpe(rpe){
  return RPE_BANDS.find(b => rpe <= b.max) || RPE_BANDS[RPE_BANDS.length - 1];
}
// Sammelt alle eingetragenen RPE-Werte aus einer Liste von Sessions (beliebiger Ausschnitt —
// ein Monat, ein Zeitraum, eine einzelne Einheit) als flaches Array reiner Zahlen. Sätze ohne
// eingetragenen RPE-Wert (z. B. weil die Erfassung zu dem Zeitpunkt aus war) fließen nicht ein.
function collectRpeValues(sessionList){
  const values = [];
  (sessionList || []).forEach(s => {
    (s.entries || []).forEach(e => {
      (e.sets || []).forEach(st => { if (typeof st.rpe === 'number') values.push(st.rpe); });
    });
  });
  return values;
}
// Durchschnittliche Trainingsintensität (RPE) über eine Liste von Sessions, oder null, wenn in
// keiner davon ein RPE-Wert erfasst wurde.
function avgRpeForSessions(sessionList){
  const values = collectRpeValues(sessionList);
  if (!values.length) return null;
  return Math.round((values.reduce((a,v) => a+v, 0) / values.length) * 10) / 10;
}
// Vollständige Auswertung (Durchschnitt + Verteilung auf die vier Intensitätsstufen) über eine
// Liste von Sessions — Grundlage für den eigenen Statistik-Screen (siehe renderIntensityStats(),
// 08c-stats-progress-list.js). null, wenn keine RPE-Daten vorliegen.
function computeRpeOverview(sessionList){
  const values = collectRpeValues(sessionList);
  if (!values.length) return null;
  const avg = Math.round((values.reduce((a,v) => a+v, 0) / values.length) * 10) / 10;
  const bandCounts = {};
  RPE_BANDS.forEach(b => bandCounts[b.key] = 0);
  values.forEach(v => { bandCounts[intensityBandForRpe(v).key]++; });
  const bands = RPE_BANDS.map(b => ({ ...b, count: bandCounts[b.key], pct: Math.round(bandCounts[b.key] / values.length * 100) }));
  return { avg, count: values.length, bands };
}


/* ---------------------------------------------------
   jsPDF: Lazy-Load statt statischem <script>-Tag
   ---------------------------------------------------
   Vorher: js/vendor/jspdf.umd.min.js wurde über ein <script defer> in index.html bei JEDEM
   App-Start geparst (mehrere hundert KB), obwohl es nur beim PDF-Export gebraucht wird —
   ein Feature, das die meisten Sessions nie benutzen. Das kostet reine Boot-Zeit.

   Jetzt: die Datei bleibt Teil der APP_SHELL in sw.js (Offline-Export funktioniert also
   weiterhin ohne Netz), wird aber erst beim ERSTEN tatsächlichen Export-Klick per
   dynamischem <script>-Tag nachgeladen. Der Browser bedient das dank Service-Worker-Cache
   praktisch instant aus dem Cache Storage, nur der Parse-/Ausführungs-Zeitpunkt verschiebt
   sich vom Boot auf den Bedarfsfall.

   Alle Aufrufer (buildFullSummaryPdfBlob() etc. in 12-session-summary.js) prüfen ohnehin
   bereits defensiv auf window.jspdf/window.jspdf.jsPDF — ensureJsPdfLoaded() muss davor also
   nur EINMAL awaited werden, der Rest der bestehenden Logik bleibt unverändert.
--------------------------------------------------- */
let jsPdfLoadPromise = null;
function ensureJsPdfLoaded(){
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(true);
  if (jsPdfLoadPromise) return jsPdfLoadPromise;
  jsPdfLoadPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[data-lazy="jspdf"]');
    if (existing){
      existing.addEventListener('load', () => resolve(!!(window.jspdf && window.jspdf.jsPDF)));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'js/vendor/jspdf.umd.min.js';
    script.dataset.lazy = 'jspdf';
    script.onload = () => resolve(!!(window.jspdf && window.jspdf.jsPDF));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
  return jsPdfLoadPromise;
}

/* ---------------------------------------------------
   Validierung importierter Backup-Dateien
   ---------------------------------------------------
   Vorher (Bug): der Import in renderSettings() (10-plan-settings.js) prüfte nur, ob
   data.plan existiert und data.plan.exercises ein Array ist — alles andere (sessions,
   lastPerformance, einzelne Übungs-/Session-Einträge) wurde ungeprüft übernommen. Eine
   fremde, unvollständige oder manuell verbastelte JSON-Datei landete dadurch direkt in
   IndexedDB, und der nächste App-Start konnte in showFatalError() enden (siehe
   14-app-init.js), weil z. B. renderStatsChart() oder computeMuscleGroupSetCounts() von
   Feldern ausgehen, die schlicht fehlten.

   validateFullExportPayload() prüft die Grobstruktur STRENG (bei Fehlern hier wird der
   komplette Import abgelehnt, da sonst nichts Sinnvolles mit den Daten anfangen lässt),
   filtert aber auf Ebene einzelner Einträge NUR die kaputten heraus (statt den ganzen
   Import zu verwerfen) — im gleichen Sinn wie die bestehende Storage-Kaskade in
   01-storage.js, die bei einem einzelnen fehlerhaften Key ebenfalls nicht die komplette
   restliche Migration abbricht.
--------------------------------------------------- */
function validateFullExportPayload(data){
  const errors = [];
  if (!data || typeof data !== 'object'){
    return { valid: false, errors: ['Die Datei enthält kein gültiges JSON-Objekt.'] };
  }
  if (!data.plan || typeof data.plan !== 'object'){
    errors.push('Es fehlt ein "plan"-Objekt.');
  } else if (!Array.isArray(data.plan.exercises)){
    errors.push('"plan.exercises" ist kein Array.');
  }
  if (errors.length) return { valid: false, errors };

  // Einzelne Übungen ohne id/name sind für die App unbrauchbar (id ist der Fremdschlüssel
  // aus jedem geloggten Satz) — diese werden stillschweigend aussortiert statt den kompletten
  // Import zu verwerfen, ein einzelner Ausreißer in einer sonst gültigen Datei soll nicht das
  // ganze Backup unbrauchbar machen.
  const cleanedExercises = data.plan.exercises.filter(ex =>
    ex && typeof ex === 'object' && typeof ex.id === 'string' && ex.id.length &&
    typeof ex.name === 'string' && ex.name.length
  );
  const droppedExercises = data.plan.exercises.length - cleanedExercises.length;

  let cleanedSessions = [];
  let droppedSessions = 0;
  if (data.sessions !== undefined){
    if (!Array.isArray(data.sessions)){
      errors.push('"sessions" ist vorhanden, aber kein Array.');
    } else {
      cleanedSessions = data.sessions.filter(s =>
        s && typeof s === 'object' && typeof s.id === 'string' && s.id.length &&
        typeof s.date === 'string' && !isNaN(new Date(s.date).getTime()) &&
        Array.isArray(s.entries)
      );
      droppedSessions = data.sessions.length - cleanedSessions.length;
    }
  }
  if (errors.length) return { valid: false, errors };

  let cleanedLastPerformance = {};
  if (data.lastPerformance !== undefined){
    if (typeof data.lastPerformance !== 'object' || data.lastPerformance === null || Array.isArray(data.lastPerformance)){
      errors.push('"lastPerformance" ist vorhanden, aber kein Objekt.');
    } else {
      cleanedLastPerformance = data.lastPerformance;
    }
  }
  if (errors.length) return { valid: false, errors };

  // Essenstracker-Daten (siehe ftBuildExportPayload(), 15-food-tracker.js) sind ein optionales
  // Zusatzfeld im gemeinsamen Backup — ältere Export-Dateien (vor der Zusammenlegung) und reine
  // Trainings-Exports haben es schlicht nicht, das ist kein Fehler. Hier bewusst NICHT tief
  // validiert (kein eigenes Schema je Essenstracker-Unterfeld) — ftApplyImportedData() fängt
  // fehlende/falsche Unterfelder beim Anwenden selbst mit "|| Standardwert" ab, genau wie
  // beim eigenständigen Essenstracker-Import (ftImportData()).
  let cleanedFood = null;
  if (data.food !== undefined){
    if (typeof data.food !== 'object' || data.food === null || Array.isArray(data.food)){
      errors.push('"food" ist vorhanden, aber kein Objekt.');
    } else {
      cleanedFood = data.food;
    }
  }
  if (errors.length) return { valid: false, errors };

  return {
    valid: true,
    errors: [],
    droppedExercises,
    droppedSessions,
    cleaned: {
      plan: { ...data.plan, exercises: cleanedExercises },
      sessions: cleanedSessions,
      lastPerformance: cleanedLastPerformance,
      food: cleanedFood
    }
  };
}

/* ---------------------------------------------------
   Hard-Update ("Aktualisieren"-Banner)
   ---------------------------------------------------
   Zweck: ein neues Deploy übernehmen, OHNE dass der Nutzer in den Chrome-
   Einstellungen manuell "Website-Daten löschen" muss (was nebenbei auch
   IndexedDB = alle Trainingsdaten mitlöschen würde).

   Ablauf von runHardUpdate():
     1. Backup: kompletter Datenexport wird automatisch als JSON heruntergeladen,
        BEVOR irgendetwas angefasst wird. Reine Sicherheitsnetz-Maßnahme.
     2. Service Worker abmelden (alle Registrierungen dieser Origin).
     3. Cache Storage komplett leeren (App-Shell- UND Font-Cache).
     4. HTTP-Cache des Browsers umgehen: jede App-Shell-Datei einmal mit
        {cache:'reload'} nachladen. Das ist der entscheidende Schritt — ein
        location.reload() allein würde JS/CSS je nach Cache-Control-Header von
        GitHub Pages (max-age) weiterhin aus dem Browser-Cache bedienen, obwohl
        der Service Worker längst weg ist.
     5. Neu laden. Beim Neustart registriert index.html den SW frisch, der zieht
        die App-Shell erneut vom Netz.

   Bewusst NICHT gelöscht: IndexedDB/localStorage (Trainingsdaten). Ein Reset
   wäre für ein Code-Update funktionslos; wer trotzdem auf den exportierten
   Stand zurück will, nutzt den Import-Button im Banner nach dem Neustart, der
   die Daten ohnehin komplett überschreibt.
--------------------------------------------------- */

// Marker überlebt den Reload bewusst in localStorage: Cache Storage ist zu diesem
// Zeitpunkt gelöscht, und die IndexedDB-Kaskade aus 01-storage.js ist asynchron und
// beim frühen Banner-Check noch nicht zwingend bereit.
const HARD_UPDATE_MARKER = 'eisenprotokoll:hardUpdatePending';

// Vollständiger Datenexport als Download. Inhaltlich identisch zum "Exportieren"-Button
// in den Einstellungen (siehe renderSettings(), 10-plan-settings.js), hier aber ohne
// UI-Abhängigkeit, damit runHardUpdate() ihn direkt aufrufen kann. Async, da die
// Essenstracker-Daten (siehe ftBuildExportPayload(), 15-food-tracker.js) ggf. erst per
// initFoodTracker() geladen werden müssen, falls der Essenstracker in dieser Sitzung noch
// nicht geöffnet wurde — initFoodTracker() ist idempotent, kostet bei bereits geladenen
// Daten also nichts.
async function exportAllDataToFile(filePrefix){
  await initFoodTracker();
  const nowISO = new Date().toISOString();
  const payload = { version: 1, exportedAt: nowISO, plan, sessions, lastPerformance, food: ftBuildExportPayload() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filePrefix || 'trainingsplan-export'}-${nowISO.slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return nowISO;
}

// Liste der eigenen App-Shell-Dateien, direkt aus dem DOM abgeleitet statt als zweite,
// pflegebedürftige Kopie der APP_SHELL-Liste aus sw.js. Cross-Origin-Ressourcen (Google
// Fonts) bleiben außen vor — die ändern sich nicht und ein {cache:'reload'} darauf würde
// bei fehlgeschlagenem CORS nur unnötig Fehler produzieren.
function appShellUrlsFromDocument(){
  const urls = ['./', 'index.html', 'manifest.json'];
  document.querySelectorAll('script[src]').forEach(el => {
    const src = el.getAttribute('src');
    if (src && !/^https?:/i.test(src)) urls.push(src);
  });
  document.querySelectorAll('link[rel="stylesheet"]').forEach(el => {
    const href = el.getAttribute('href');
    if (href && !/^https?:/i.test(href)) urls.push(href);
  });
  return Array.from(new Set(urls));
}

async function runHardUpdate(){
  const btn = document.getElementById('updateToastBtn');
  if (btn){ btn.disabled = true; btn.textContent = 'Lädt…'; }
  try{
    try{ await exportAllDataToFile('trainingsplan-backup-vor-update'); }catch(e){ /* Download blockiert: Update trotzdem durchziehen, Daten bleiben ja unangetastet */ }
    try{ localStorage.setItem(HARD_UPDATE_MARKER, '1'); }catch(e){ /* Banner nach dem Neustart entfällt dann, Update selbst läuft normal */ }

    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister().catch(() => {})));
    }
    if (window.caches && caches.keys){
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
    }
    await Promise.all(appShellUrlsFromDocument().map(u =>
      fetch(u, { cache: 'reload' }).catch(() => {})
    ));
  }catch(e){
    // Auch bei einem Fehler in einem der Schritte neu laden: schlimmstenfalls landet der
    // Nutzer auf dem alten Stand und kann es erneut versuchen, statt auf einem toten Banner
    // sitzen zu bleiben.
  }
  location.reload();
}

// Nach dem Neustart: kurzes Banner mit direktem Weg zum Import der eben gesicherten Datei.
// Wird einmalig gezeigt (Marker wird sofort entfernt) und nutzt dieselbe Import-Logik wie die
// Einstellungen — der Button springt dorthin und öffnet direkt den Dateiwähler, analog zur
// Backup-Erinnerung auf der Startseite (siehe renderHome(), 07-home.js).
function showPostHardUpdateBanner(){
  let pending = null;
  try{ pending = localStorage.getItem(HARD_UPDATE_MARKER); }catch(e){ return; }
  if (pending !== '1') return;
  try{ localStorage.removeItem(HARD_UPDATE_MARKER); }catch(e){ /* egal, Banner erscheint dann einmal zu viel */ }

  const toast = document.getElementById('restoreToast');
  const importBtn = document.getElementById('restoreToastBtn');
  const closeBtn = document.getElementById('restoreToastClose');
  if (!toast || !importBtn || !closeBtn) return;

  toast.style.display = 'flex';
  importBtn.onclick = () => {
    toast.style.display = 'none';
    goSettings();
    const file = document.getElementById('importFile');
    if (file) file.click();
  };
  closeBtn.onclick = () => { toast.style.display = 'none'; };
}
