/* ---------------------------------------------------
   15d-food-stats.js
   ---------------------------------------------------
   Essenstracker: Statistik-Seite (renderFoodStats, über Tippen auf die
   kcal-Zahl in der Tagesansicht erreichbar) — Balkendiagramm, interaktiver
   Makro-Donut mit Lebensmittel-Aufschlüsselung, Ziel-Erreichung, Ø kcal
   nach Wochentag, Tracking-Serien, Monatsübersicht.

   Teil des Splits von 15-food-tracker.js — siehe Kopfkommentar in
   15a-food-core.js für die Gesamtübersicht und Beweggründe.

   ftDayTotalsForISO()/ftAllDayTotals()/ftComputeMonthStats() liegen NICHT
   mehr hier, sondern in 15a-food-core.js (dort auch von 05-calendar.js für
   den Trainingskalender benötigt) — diese Datei ruft sie ganz normal auf.

   Bewusst so weit wie möglich auf die bestehenden, bereits generischen
   Chart-/Donut-Bauhelfer der Trainingsplan-Statistiken aufgesetzt statt sie
   neu zu schreiben, damit sich der Screen optisch/funktional konsistent
   "genauso wie in der Trainingsapp" anfühlt:
   - buildBarChart()/chartAccordionHTML() (08a-stats-progress-charts.js)
   - buildInteractiveDonut()/donutAngleRanges()/donutArcPath() (08b) für den
     Makro-Donut mit Drilldown — eigene, food-spezifische Auswahl-/
     Aufschlüsselungslogik (ftApplyMacroDonutSelection), aber exakt dieselben
     CSS-Klassen (.donut-seg, .muscle-balance-legend-Familie, .pie-center-Familie) wie beim
     Muskelgruppen-Donut, kein eigenes CSS nötig
   - .month-report-card/.month-report-stat-grid (05-calendar.js/CSS) für die
     Monatsübersicht, die unter "Monat" zusätzlich erscheint
   - weekBucket()/monthShortLabel() (08a) für die Quartal-/Jahres-Bucketing
--------------------------------------------------- */

/* ---------------------------------------------------
   Statistiken (renderFoodStats, über Tippen auf die kcal-Zahl erreichbar,
   siehe ftStatsBtn in renderFoodTracker())
   ---------------------------------------------------
   Bewusst so weit wie möglich auf die bestehenden, bereits generischen
   Chart-/Donut-Bauhelfer der Trainingsplan-Statistiken aufgesetzt statt sie
   neu zu schreiben, damit sich der Screen optisch/funktional konsistent
   "genauso wie in der Trainingsapp" anfühlt:
   - buildBarChart()/chartAccordionHTML() (08a-stats-progress-charts.js)
   - buildInteractiveDonut()/donutAngleRanges()/donutArcPath() (08b) für den
     Makro-Donut mit Drilldown — eigene, food-spezifische Auswahl-/
     Aufschlüsselungslogik (ftApplyMacroDonutSelection), aber exakt dieselben
     CSS-Klassen (.donut-seg, .muscle-balance-legend-Familie, .pie-center-Familie) wie beim
     Muskelgruppen-Donut, kein eigenes CSS nötig
   - .month-report-card/.month-report-stat-grid (05-calendar.js/CSS) für die
     Monatsübersicht, die unter "Monat" zusätzlich erscheint
   - weekBucket()/monthShortLabel() (08a) für die Quartal-/Jahres-Bucketing
--------------------------------------------------- */
function ftPeriodToDays(period){
  if (period === 'day') return 1;
  if (period === 'week') return 7;
  if (period === 'month') return 30;
  if (period === 'quarter') return 90;
  return 365; // 'year'
}
const FT_PERIOD_LABELS = { day: 'Tag', week: 'Woche', month: 'Monat', quarter: 'Quartal', year: 'Jahr' };
let ftStatsPeriod = 'week';
let ftMacroDrilldown = null;
let ftMacroOutsideClickHandler = null;
// Ob die "+N weitere"-Sammelzeile in der Makro-Aufschlüsselung (ftWireMacroDonut()) gerade
// zur vollen Liste aufgeklappt ist — bei jedem neu angetippten Makro-Segment (toggle()) wieder
// zurückgesetzt, damit man nicht versehentlich mit einer bereits aufgeklappten Liste in ein
// anderes Makro wechselt.
let ftBreakdownExpanded = false;

// ftDayTotalsForISO()/ftAllDayTotals() sind nach 15a-food-core.js gewandert (dort auch von
// 05-calendar.js für den Trainingskalender genutzt) — hier nur noch die reine Zeitraum-
// Filterung darüber.
function ftDayTotalsInPeriod(periodDays){
  const todayIso = ftTodayISO();
  const cutoffIso = ftAddDays(todayIso, -(periodDays - 1));
  // Obere Grenze (<= heute) ist genauso wichtig wie die untere: ohne sie rutschen künftig
  // datierte Einträge (z. B. im Kalender vorausgeplante/verschobene Tage) in JEDEN Zeitraum
  // mit rein, auch in "Tag" (dort ist cutoffIso = heute, ohne Obergrenze also "heute und alles
  // danach"). Das verwässert besonders die Ø-Bildung (ftMacroKcalSegments()/actualPeriodKcal
  // in renderFoodStats()) unbemerkt, weil ftDayTotalsInPeriod(1)[0] (sortiert aufsteigend)
  // weiterhin korrekt den heutigen Tag als ERSTEN Treffer liefert — der Durchschnitt über ALLE
  // Treffer aber zusätzliche, gar nicht zum Zeitraum gehörende Tage mit einrechnet.
  return ftAllDayTotals().filter(d => d.date >= cutoffIso && d.date <= todayIso);
}

// Ø kcal-Zufuhr an Trainingstagen vs. Ruhetagen im Zeitraum (siehe "Kalorienverbrauch"-Statistik-
// Screen, 08c-stats-progress-list.js) — braucht nur die reine Ja/Nein-Info "war an diesem Tag
// eine Einheit protokolliert" aus dem globalen sessions-Array, unabhängig vom geschätzten
// Trainings-Verbrauch selbst. Zeigt, ob an Trainingstagen tatsächlich mehr gegessen wird.
function computeTrainingVsRestDayIntake(periodDays){
  const days = ftDayTotalsInPeriod(periodDays);
  if (!days.length) return null;
  const trainingDates = new Set(sessions.map(s => (s.date || '').slice(0, 10)));
  const trainingDays = days.filter(d => trainingDates.has(d.date));
  const restDays = days.filter(d => !trainingDates.has(d.date));
  const avg = list => list.length ? Math.round(list.reduce((a,d) => a + d.kcal, 0) / list.length) : null;
  return {
    trainingAvg: avg(trainingDays), trainingCount: trainingDays.length,
    restAvg: avg(restDays), restCount: restDays.length,
  };
}

// Balkendiagramm-Punkte je nach Zeitraum: Woche/Monat zeigen JEDEN Tag einzeln (auch ohne
// Eintrag als 0-Balken, damit Lücken im Tracking sichtbar bleiben, nicht nur die geloggten
// Tage aneinandergereiht), Quartal/Jahr bündeln zu Kalenderwochen bzw. -monaten (sonst bei
// 90/365 Tagen unlesbar dicht) — Punktwert dort jeweils Ø kcal PRO GELOGGTEM Tag im Bucket,
// damit die Skala über alle vier Zeiträume hinweg vergleichbar bleibt ("wie viel kcal an
// einem typischen Tag"), statt bei größeren Buckets plötzlich eine Summe zu zeigen.
function ftBucketedKcalPoints(period){
  if (period === 'week' || period === 'month'){
    const n = ftPeriodToDays(period);
    const all = ftAllDayTotals();
    const todayIso = ftTodayISO();
    const points = [];
    for (let i = n - 1; i >= 0; i--){
      const iso = ftAddDays(todayIso, -i);
      const found = all.find(d => d.date === iso);
      const d = ftParseISO(iso);
      const label = period === 'week' ? d.toLocaleDateString('de-DE', { weekday:'short' }) : shortDate(iso);
      points.push({ label, value: found ? Math.round(found.kcal) : 0, date: iso });
    }
    return points;
  }
  const periodDays = ftPeriodToDays(period);
  const inRange = ftDayTotalsInPeriod(periodDays);
  const buckets = new Map();
  inRange.forEach(d => {
    const dateObj = ftParseISO(d.date);
    let key, label, sortKey;
    if (period === 'quarter'){
      const wb = weekBucket(dateObj);
      key = wb.key; label = wb.label; sortKey = wb.sortKey;
    } else {
      key = dateObj.getFullYear() + '-' + dateObj.getMonth();
      label = monthShortLabel(dateObj);
      sortKey = dateObj.getFullYear()*100 + dateObj.getMonth();
    }
    if (!buckets.has(key)) buckets.set(key, { label, sortKey, sum: 0, count: 0 });
    const b = buckets.get(key);
    b.sum += d.kcal; b.count += 1;
  });
  return [...buckets.values()].sort((a,b) => a.sortKey - b.sortKey)
    .map(b => ({ label: b.label, value: Math.round(b.sum / b.count) }));
}

// Aggregierte Kalorien je Makro (Protein ×4, Kohlenhydrate ×4, Fett ×9) über den Zeitraum —
// Grundlage für den Donut. Als Verhältnis ist es egal, ob über Summen oder Durchschnitte
// gerechnet wird, deshalb hier einfach über alle Tage im Zeitraum aufsummiert.
// Bewusst der DURCHSCHNITT pro geloggtem Tag im Zeitraum (nicht die Summe) — soll dieselbe
// Frage beantworten wie "Ø X kcal/Tag" oben: "woraus setzt sich ein durchschnittlicher Tag in
// diesem Zeitraum zusammen". Eine reine Summe wäre über Woche/Monat/Jahr hinweg nicht
// vergleichbar (skaliert einfach mit der Anzahl geloggter Tage) und würde bei Nicht-"Tag"-
// Zeiträumen auch nicht zur direkt darüberstehenden kcal-Durchschnittszahl passen. Bei "Tag"
// (ein einzelner, evtl. bereits abgeschlossener Tag) ist Ø über 1 Tag identisch mit der Summe.
function ftMacroKcalSegments(periodDays){
  const days = ftDayTotalsInPeriod(periodDays);
  const n = days.length || 1;
  let p=0,c=0,f=0;
  days.forEach(d => { p+=d.p; c+=d.c; f+=d.f; });
  p/=n; c/=n; f/=n;
  return [
    { key:'p', label:'Protein', grams: Math.round(p), value: Math.round(p*4), color: cssVar('--protein') },
    { key:'c', label:'Kohlenhydrate', grams: Math.round(c), value: Math.round(c*4), color: cssVar('--carbs') },
    { key:'f', label:'Fett', grams: Math.round(f), value: Math.round(f*9), color: cssVar('--fat') },
  ];
}
// Welche Lebensmittel im Zeitraum am meisten zu einem Makro beigetragen haben (in Gramm) —
// Grundlage für die Aufschlüsselung, wenn ein Donut-Segment angetippt wird. Gruppierte
// Mahlzeiten-Einträge (kind:'mealGroup', siehe ftAddMealGroupEntry() in 15c-food-add.js)
// tragen NICHT als ein Klumpen unter ihrem Mahlzeit-Namen bei, sondern werden in ihre
// einzelnen Zutaten aufgelöst (mit der zum Trackzeitpunkt gewählten Portion multipliziert) —
// sonst würde z.B. "Porridge Standard" als ein einziger riesiger Posten erscheinen, obwohl
// die Aufschlüsselung ja gerade zeigen soll, WELCHE Lebensmittel wie viel beitragen.
/* ---------------------------------------------------
   Zusammenfassen ähnlicher Lebensmittel in der Makro-Aufschlüsselung
   ---------------------------------------------------
   Dieselbe Sache taucht oft unter leicht verschiedenen Namen auf — andere Sorte, andere Marke,
   mal Singular/Plural ("Isoclear Grapefruit (ESN)" / "ISOCLEAR Blue Raspberry" / "Isoclear whey
   proteine", oder Tofu/Skyr von mehreren Herstellern). Einzeln gelistet zersplittert das die
   Auswertung und keiner der Posten wirkt mehr relevant, obwohl es zusammen ein Hauptbeitrag ist.
   Verfahren (bewusst ohne feste Produktlisten, damit es auch für künftige Produkte greift):
   1. Namen in Wörter zerlegen, Marke in Klammern und Füllwörter (bio, light, natur …) verwerfen,
      grob auf Wortstämme normalisieren (deutsche Plural-/Endungsformen: "Eier" → "Ei").
   2. Zählen, in wie vielen VERSCHIEDENEN Namen jedes Wort vorkommt.
   3. Jeder Name wird über sein häufigstes Wort gruppiert. Dadurch finden sich "Knoblauch Chili
      Crunch" und "Sesam Chili Crunch" über "chili"/"crunch" zusammen, ohne dass sich Ketten
      bilden können (jeder Name bekommt genau EINEN Schlüssel, keine transitive Verschmelzung).
   4. Als Gruppenname dienen die Wörter, die ALLE Mitglieder gemeinsam haben ("Chili Crunch",
      "Isoclear", "Tofu"). Bleibt eine Gruppe einelementig, steht dort unverändert der
      Originalname — Einzelposten sehen also exakt aus wie vorher.
--------------------------------------------------- */
const FT_GROUP_STOPWORDS = new Set([
  'bio','light','natur','frisch','fettarm','mager','laktosefrei','vegan','vegetarisch',
  'gekocht','geraeuchert','geräuchert','gebraten','roh','tiefgekuehlt','tiefgekühlt',
  'der','die','das','mit','und','ohne','aus','im','in','von','zum','zur','fuer','für',
  'gr','ml','kcal','stueck','stück','packung','portion','classic','original','typ','sorte',
]);
// Generische Sammelbegriffe, die für sich allein NIEMALS eine Gruppe bilden dürfen — sie
// kommen in sehr vielen, inhaltlich völlig verschiedenen Produkten vor. Ohne diese Sperre
// landeten z. B. Proteinpudding, Proteinriegel und Proteinshake gemeinsam unter "Protein",
// oder mehrere völlig verschiedene Gerichte unter "Burger"/"Sauce"/"Nudeln" — dann sieht man
// zwar eine große Zahl, aber nicht mehr, was man eigentlich gegessen hat. Sie dürfen weiterhin
// TEIL eines Gruppennamens sein, wenn zusätzlich ein aussagekräftiges Wort geteilt wird
// (z. B. "Isoclear Whey" bleibt über "isoclear" gruppiert).
const FT_GROUP_GENERIC_WORDS = new Set([
  'protein','proteine','whey','shake','riegel','bar','drink','getraenk','getränk','pulver',
  'burger','sauce','sosse','soße','dressing','dip','nudel','pasta','reis','brot','broetchen',
  'brötchen','salat','suppe','pudding','joghurt','quark','kaese','käse','wrap','bowl','pizza',
  'snack','mix','fertig','gericht','menu','menü','vegan','veggie','fitness','high','low',
]);
function ftGroupToken(word){
  const w = word.toLowerCase().replace(/[^a-zäöüß0-9]/g, '');
  if (!w || FT_GROUP_STOPWORDS.has(w)) return null;
  if (w.length <= 2) return w;
  // Sehr grobe Stammform, reicht für Singular/Plural-Varianten desselben Produkts
  // ("Eier" → "Ei", "Tomaten" → "Tomat", "Nudeln" → "Nudel").
  if (w.length > 3 && (w.endsWith('er') || w.endsWith('en'))) return w.slice(0, -2);
  if (w.length > 3 && (w.endsWith('e') || w.endsWith('s') || w.endsWith('n'))) return w.slice(0, -1);
  return w;
}
// Die generischen Wörter müssen durch DENSELBEN Stemmer laufen wie die Produktnamen, sonst
// greift die Sperre nicht: aus "protein" wird beim Zerlegen "protei", aus "burger" "burg" —
// ein Vergleich gegen die ungestemmte Liste ginge dadurch immer ins Leere.
const FT_GROUP_GENERIC_STEMS = new Set([...FT_GROUP_GENERIC_WORDS].map(w => ftGroupToken(w)).filter(Boolean));
function ftIsGenericToken(tok){ return FT_GROUP_GENERIC_STEMS.has(tok); }
function ftGroupWordsOf(name){
  // Markenangabe in Klammern fliegt raus — sie unterscheidet gerade die Varianten, die wir
  // zusammenfassen wollen ("Tofu Geräuchert (REWE Bio)" vs. "Tofu (Alnatura)").
  const withoutBrand = name.replace(/\([^)]*\)/g, ' ');
  return withoutBrand.split(/[\s,\/&+–-]+/).filter(Boolean);
}
// Dürfen zwei Namen in dieselbe Gruppe? Bewusst STRENG, damit lieber einmal zu wenig als
// einmal falsch zusammengefasst wird (siehe Kommentar zu FT_GROUP_GENERIC_WORDS):
//   1. Es muss mindestens ein gemeinsames, NICHT generisches Wort geben.
//   2. Die gemeinsamen Wörter müssen mindestens die Hälfte des kürzeren Namens ausmachen —
//      ein einzelnes zufällig geteiltes Wort in zwei langen Namen reicht also nicht.
// Beispiele: "Isoclear Grapefruit"+"Isoclear Blue Raspberry" → ja (isoclear, 1 von 2 Wörtern).
// "Knoblauch Chili Crunch"+"Sesam Chili Crunch" → ja (2 von 3). "Protein Pudding"+"Protein
// Riegel" → NEIN (nur das generische "protein" geteilt).
function ftNamesBelongTogether(tokensA, tokensB){
  return ftGroupMatchRatio(tokensA, tokensB) > 0;
}
// Liefert 0 (passt nicht zusammen) oder den Anteil gemeinsamer Wörter am kürzeren Namen —
// dieser Wert dient zugleich als Rangfolge, wenn ein Name zu MEHREREN bestehenden Gruppen
// passen würde (siehe ftGroupNamesByKey unten).
function ftGroupMatchRatio(tokensA, tokensB){
  const setA = new Set(tokensA.map(x => x.tok));
  const setB = new Set(tokensB.map(x => x.tok));
  if (!setA.size || !setB.size) return 0;
  const shared = [...setA].filter(t => setB.has(t));
  if (!shared.length) return 0;
  if (!shared.some(t => !ftIsGenericToken(t))) return 0;
  const minSize = Math.min(setA.size, setB.size);
  const ratio = shared.length / minSize;
  return ratio >= 0.5 ? ratio : 0;
}
function ftGroupNamesByKey(names){
  const tokensByName = {};
  names.forEach(n => {
    const words = ftGroupWordsOf(n);
    tokensByName[n] = words.map(w => ({ raw: w, tok: ftGroupToken(w) })).filter(x => x.tok);
  });
  // Namen absteigend nach Beitrag verarbeiten (der Aufrufer übergibt sie bereits in dieser
  // Reihenfolge) und jeden entweder einer schon bestehenden Gruppe zuordnen, wenn er zu deren
  // ERSTEM (größtem) Mitglied passt, oder eine neue Gruppe eröffnen. Der Abgleich läuft
  // bewusst nur gegen das jeweils erste Gruppenmitglied statt gegen alle — so können sich
  // keine Ketten bilden, bei denen über Umwege am Ende alles in einem Topf landet.
  const keyByName = {};
  const groupAnchors = []; // { key, tokens }
  names.forEach(n => {
    const toks = tokensByName[n];
    // Nicht die ERSTE passende Gruppe nehmen, sondern die am besten passende — sonst landet
    // z. B. "Sesam Chili Crunch" bei "Sesam Sauce" (ein gemeinsames Wort), obwohl es viel
    // deutlicher zu "Knoblauch Chili Crunch" gehört (zwei gemeinsame Wörter).
    let best = null, bestRatio = 0;
    if (toks.length){
      groupAnchors.forEach(a => {
        const r = ftGroupMatchRatio(a.tokens, toks);
        if (r > bestRatio){ bestRatio = r; best = a; }
      });
    }
    if (best){ keyByName[n] = best.key; return; }
    const key = n.toLowerCase();
    keyByName[n] = key;
    groupAnchors.push({ key, tokens: toks });
  });
  return { keyByName, tokensByName };
}
// Anzeigename einer Gruppe: die Wörter, die alle Mitglieder gemeinsam haben, in der Schreibweise
// und Reihenfolge des ersten (größten) Mitglieds.
function ftGroupLabel(memberNames, tokensByName, fallbackKey){
  if (memberNames.length === 1) return memberNames[0];
  let common = new Set(tokensByName[memberNames[0]].map(x => x.tok));
  memberNames.slice(1).forEach(n => {
    const s = new Set(tokensByName[n].map(x => x.tok));
    common = new Set([...common].filter(t => s.has(t)));
  });
  const seen = new Set();
  const words = tokensByName[memberNames[0]]
    .filter(x => common.has(x.tok) && !seen.has(x.tok) && seen.add(x.tok))
    .map(x => x.raw.charAt(0).toUpperCase() + x.raw.slice(1).toLowerCase());
  if (words.length) return words.join(' ');
  return fallbackKey.charAt(0).toUpperCase() + fallbackKey.slice(1);
}

function ftFoodMacroBreakdown(macroKey, periodDays){
  const todayIso = ftTodayISO();
  const cutoffIso = ftAddDays(todayIso, -(periodDays - 1));
  const map = {};
  const add = (name, val) => { if(val) map[name] = (map[name] || 0) + val; };
  Object.keys(ftDays).forEach(iso => {
    // Dieselbe obere Grenze wie in ftDayTotalsInPeriod() (15d-food-stats.js) — ohne sie zählen
    // künftig datierte Tage (z. B. vorausgeplante/verschobene Kalendereinträge) bei JEDEM
    // Zeitraum mit, auch bei "Tag", und tauchen dann fälschlich in der Lebensmittel-
    // Aufschlüsselung eines Makros auf, obwohl sie gar nicht zum gewählten Zeitraum gehören.
    if (iso < cutoffIso || iso > todayIso) return;
    FT_MEAL_KEYS.forEach(k => (ftDays[iso][k]||[]).forEach(e => {
      if(e.kind === 'mealGroup'){
        (e.items||[]).forEach(i => add(i.name, (i[macroKey] || 0) * (e.portion ?? 1)));
        return;
      }
      add(e.name, e[macroKey] || 0);
    }));
  });
  // Gleiche Produkte in verschiedenen Sorten/Marken zu einem Posten zusammenfassen (siehe
  // ausführlicher Kommentar oben). Absteigend nach Beitrag verarbeitet, damit der größte
  // Vertreter jeweils die Gruppe eröffnet und ihren Namen prägt.
  const names = Object.keys(map).sort((a,b) => map[b] - map[a]);
  const { keyByName, tokensByName } = ftGroupNamesByKey(names);
  const groups = {};
  names.forEach(n => {
    const key = keyByName[n];
    if (!groups[key]) groups[key] = { key, members: [], val: 0 };
    groups[key].members.push(n);
    groups[key].val += map[n];
  });
  return Object.values(groups).map(g => {
    g.members.sort((a,b) => map[b] - map[a]);
    return { name: ftGroupLabel(g.members, tokensByName, g.key), val: g.val, members: g.members };
  }).sort((a,b) => b.val - a.val);
}

// ftComputeMonthStats() ist nach 15a-food-core.js gewandert (dort auch von 05-calendar.js für
// den Trainingskalender-Monatsbericht genutzt) — renderFoodStats() unten ruft sie weiterhin
// ganz normal auf (gemeinsamer globaler Scope).

// Ø-Wert vs. Ziel je Nährwert im gewählten Zeitraum (siehe ftGoals, Einstellungen im
// Essenstracker) — nur, wenn mindestens ein Ziel gesetzt ist UND im Zeitraum überhaupt
// protokolliert wurde. Zeigt bewusst nur die tatsächlich gesetzten Ziele (nicht alle vier
// pauschal), da z. B. oft nur ein kcal-Ziel ohne feste Makro-Ziele gepflegt wird.
function ftGoalComparisonHTML(periodDays){
  if (!ftGoals.kcal && !ftGoals.p && !ftGoals.c && !ftGoals.f) return '';
  const days = ftDayTotalsInPeriod(periodDays);
  if (!days.length) return '';
  const avg = key => Math.round(days.reduce((a,d) => a+d[key], 0) / days.length);
  const rows = [];
  if (ftGoals.kcal) rows.push({ label:'kcal', val: avg('kcal'), goal: ftGoals.kcal, unit:'', color:'var(--accent)' });
  if (ftGoals.p) rows.push({ label:'Protein', val: avg('p'), goal: ftGoals.p, unit:'g', color:'var(--protein)' });
  if (ftGoals.c) rows.push({ label:'Kohlenhydrate', val: avg('c'), goal: ftGoals.c, unit:'g', color:'var(--carbs)' });
  if (ftGoals.f) rows.push({ label:'Fett', val: avg('f'), goal: ftGoals.f, unit:'g', color:'var(--fat)' });
  const rowsHTML = rows.map(r => `
    <div class="ft-goal-compare-row">
      <div class="ft-goal-compare-top">
        <span>${r.label}</span>
        <span>${r.val}${r.unit} <span class="ft-goal-of">/ ${r.goal}${r.unit}</span></span>
      </div>
      ${ftGoalBarHTML(r.val, r.goal, r.color)}
    </div>
  `).join('');
  return `
    <div class="section-label" style="margin-top:22px;">${periodDays <= 1 ? 'Ziel-Erreichung' : 'Ziel-Erreichung · Ø pro Tag'}</div>
    <div class="month-report-card">${rowsHTML}</div>
  `;
}

// Ø kcal je Wochentag im gewählten Zeitraum — zeigt Muster wie "am Wochenende wird spürbar
// mehr gegessen", die im reinen Zeitverlauf (chartHTML oben) leicht untergehen. Bewusst über
// ALLE Tage des Buckets gemittelt (auch wenn an einem Wochentag nur 1x im Zeitraum
// protokolliert wurde) statt eine Mindestanzahl zu verlangen — bei kurzen Zeiträumen (Woche)
// wäre sonst fast nie genug Datenbasis vorhanden.
function ftWeekdayAverageHTML(periodDays){
  if (periodDays <= 1) return ''; // "Ø nach Wochentag" braucht mehrere Tage, um überhaupt einen Durchschnitt zu bilden
  const days = ftDayTotalsInPeriod(periodDays);
  if (!days.length) return '';
  const labels = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  const sums = [0,0,0,0,0,0,0], counts = [0,0,0,0,0,0,0];
  days.forEach(d => {
    const wd = (ftParseISO(d.date).getDay() + 6) % 7; // 0 = Montag
    sums[wd] += d.kcal; counts[wd]++;
  });
  const points = labels.map((l,i) => ({ label:l, value: counts[i] ? Math.round(sums[i]/counts[i]) : 0 }));
  return `
    <div class="section-label" style="margin-top:22px;">Ø kcal nach Wochentag</div>
    ${buildBarChart(points, cssVar('--accent'), true, 130)}
  `;
}

// Aktuelle und längste Tracking-Serie (aufeinanderfolgende protokollierte Tage) — bewusst über
// den GESAMTEN Datenbestand berechnet, nicht auf den gewählten Statistik-Zeitraum begrenzt,
// da eine Serie naturgemäß über Zeiträume hinweg läuft (eine Serie von 40 Tagen würde in der
// "Woche"-Ansicht sonst wie 7 aussehen). Die aktuelle Serie gilt als noch "am Leben", solange
// der letzte protokollierte Tag heute oder gestern war — bricht also nicht schon mitten am Tag
// ab, nur weil man den heutigen Tag noch nicht (fertig) eingetragen hat.
function ftTrackingStreaks(){
  const dates = ftAllDayTotals().map(d => d.date); // aufsteigend sortiert
  if (!dates.length) return { current: 0, longest: 0 };
  let longest = 1, run = 1;
  for (let i = 1; i < dates.length; i++){
    run = (ftAddDays(dates[i-1], 1) === dates[i]) ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  const today = ftTodayISO();
  const yesterday = ftAddDays(today, -1);
  const last = dates[dates.length - 1];
  let current = 0;
  if (last === today || last === yesterday){
    current = 1;
    let cursor = last;
    for (let i = dates.length - 2; i >= 0; i--){
      if (dates[i] === ftAddDays(cursor, -1)){ current++; cursor = dates[i]; } else break;
    }
  }
  return { current, longest };
}
function ftStreakHTML(){
  const { current, longest } = ftTrackingStreaks();
  if (!longest) return '';
  return `
    <div class="section-label" style="margin-top:22px;">Tracking-Serie</div>
    <div class="month-report-card">
      <div class="month-report-stat-grid">
        <div class="month-report-stat-cell">
          <div class="month-report-stat-value">${current}</div>
          <div class="month-report-stat-label">Aktuelle Serie (Tage)</div>
        </div>
        <div class="month-report-stat-cell">
          <div class="month-report-stat-value">${longest}</div>
          <div class="month-report-stat-label">Längste Serie (Tage)</div>
        </div>
      </div>
    </div>
  `;
}

function renderFoodStats(){
  ftApplyTheme();
  const periodDays = ftPeriodToDays(ftStatsPeriod);
  const isDay = ftStatsPeriod === 'day';
  // Für "Tag" gibt es nur einen einzigen Wert, kein Balkendiagramm über mehrere Punkte —
  // ftBucketedKcalPoints() erst gar nicht aufrufen, sondern direkt den Tageswert nehmen.
  const points = isDay ? [] : ftBucketedKcalPoints(ftStatsPeriod);
  const loggedPoints = points.filter(p => p.value > 0);
  const todayKcal = isDay ? Math.round(ftDayTotalsInPeriod(1)[0]?.kcal || 0) : 0;
  const avgKcal = isDay ? todayKcal : (loggedPoints.length ? Math.round(loggedPoints.reduce((a,p) => a+p.value, 0) / loggedPoints.length) : 0);
  const accent = cssVar('--accent');

  const segments = ftMacroKcalSegments(periodDays);
  const totalMacroKcal = segments.reduce((a,s) => a+s.value, 0);
  // Center-Anzeige des Donuts bewusst NICHT aus den (gerundeten) Ø-Makro-Gramm zurückgerechnet
  // (p*4 + c*4 + f*9, siehe totalMacroKcal oben) — das kann leicht vom tatsächlich getrackten
  // Ø-kcal-Wert abweichen (Rundung je Eintrag/Tag). totalMacroKcal bleibt für die Segment-
  // Winkel und Prozentangaben in der Legende (die MÜSSEN sich zu den Makros addieren), die
  // große Zahl in der Mitte zeigt stattdessen den echten Ø-kcal-Wert pro geloggtem Tag — exakt
  // dieselbe Rechnung wie bei "Ø X kcal/Tag" oben, nur direkt aus den Tagessummen statt den
  // (ggf. lückenhaften) Balkendiagramm-Punkten, damit sie bei "Tag" exakt mit "X kcal heute"
  // übereinstimmt.
  const macroPeriodDays = ftDayTotalsInPeriod(periodDays);
  const actualPeriodKcal = macroPeriodDays.length
    ? Math.round(macroPeriodDays.reduce((a,d) => a+d.kcal, 0) / macroPeriodDays.length)
    : 0;
  const macroLegendHTML = segments.map(s => {
    const pct = totalMacroKcal ? Math.round(s.value / totalMacroKcal * 100) : 0;
    return `
      <div class="muscle-balance-legend-row">
        <button class="muscle-balance-swatch" data-macro="${s.key}" style="color:${s.color};" aria-label="${s.label}: ${pct}%">${pct}%</button>
        <span class="muscle-balance-legend-label">${s.label}</span>
        <div class="muscle-balance-legend-values">
          <span class="muscle-balance-legend-value">${isDay ? '' : 'Ø '}${s.grams} g</span>
        </div>
      </div>
    `;
  }).join('');

  // buildBarChart()/buildInteractiveDonut() haben eigene, trainings-spezifisch formulierte
  // Leer-Texte ("...Einheiten protokolliert"/"...geloggten Sätzen") — für den Essenstracker
  // stattdessen eigene, passende Hinweise statt der (Trainings-)Bausteine, wenn im gewählten
  // Zeitraum noch nichts eingetragen wurde.
  const hasDataInPeriod = points.some(p => p.value > 0);
  const chartHTML = isDay ? '' : (hasDataInPeriod
    ? buildBarChart(points, accent, true, 160)
    : '<div class="chart-empty">Noch keine Einträge in diesem Zeitraum.</div>');
  const donutSectionHTML = totalMacroKcal ? `
    <div class="section-label" style="margin-top:22px;">Makro-Verteilung</div>
    <div class="muscle-balance-charts-row">
      <div class="muscle-balance-chart-col" style="margin:0 auto;">
        <div class="muscle-balance-chart-wrap">${buildInteractiveDonut(segments, 190, 'food', actualPeriodKcal.toLocaleString('de-DE'), 'kcal')}</div>
      </div>
    </div>
    <div class="muscle-balance-breakdown" id="ftMacroBreakdown" style="display:none;">
      <div class="muscle-balance-breakdown-header">
        <span class="muscle-balance-breakdown-title" id="ftBreakdownTitle"></span>
        <button class="muscle-balance-breakdown-close" id="ftBreakdownClose" aria-label="Aufschlüsselung schließen">✕</button>
      </div>
      <div class="muscle-balance-legend" id="ftBreakdownList"></div>
    </div>
    <div class="muscle-balance-legend" id="ftMainLegend" style="margin-top:16px;">${macroLegendHTML}</div>
  ` : `
    <div class="section-label" style="margin-top:22px;">Makro-Verteilung</div>
    <div class="chart-empty">Noch keine Einträge in diesem Zeitraum.</div>
  `;

  const now = new Date();
  const monthStats = ftStatsPeriod === 'month' ? ftComputeMonthStats(now.getFullYear(), now.getMonth()) : null;
  const monthDeltaHTML = (monthStats && monthStats.prevAvgKcal !== null && monthStats.avgKcal !== monthStats.prevAvgKcal) ? (() => {
    const delta = monthStats.avgKcal - monthStats.prevAvgKcal;
    const sign = delta > 0 ? '+' : '−';
    return `<span class="month-report-stat-delta ${delta > 0 ? 'up' : 'down'}">${sign}${Math.abs(delta).toLocaleString('de-DE')}</span>`;
  })() : '';
  const monthOverviewHTML = monthStats ? `
    <div class="section-label" style="margin-top:18px;">${MONTH_NAMES_DE[now.getMonth()]}-Übersicht</div>
    <div class="month-report-card">
      <div class="month-report-stat-grid">
        <div class="month-report-stat-cell">
          <div class="month-report-stat-value">${monthStats.count}</div>
          <div class="month-report-stat-label">Tage protokolliert</div>
        </div>
        <div class="month-report-stat-cell">
          <div class="month-report-stat-value">${monthStats.avgKcal}${monthDeltaHTML}</div>
          <div class="month-report-stat-label">Ø kcal / Tag</div>
        </div>
        <div class="month-report-stat-cell">
          <div class="month-report-stat-value">${monthStats.avgP} / ${monthStats.avgC} / ${monthStats.avgF} g</div>
          <div class="month-report-stat-label">Ø Protein / Kohlenhydrate / Fett</div>
        </div>
        <div class="month-report-stat-cell">
          <div class="month-report-stat-value">${monthStats.highest ? monthStats.highest.kcal : '–'}</div>
          <div class="month-report-stat-label">${monthStats.highest ? 'Höchster Tag · ' + shortDate(monthStats.highest.date) : 'Höchster Tag'}</div>
        </div>
      </div>
    </div>
  ` : '';

  app.innerHTML = `
    <div class="back-row" style="margin-top:0;">
      <button class="back-btn-icon" id="ftStatsBackBtn" aria-label="Zurück"><img src="${ICON_BACK_ARROW}" alt=""></button>
    </div>
    <div class="brand" style="margin-bottom:14px;"><h1 style="font-size:22px;">Statistiken</h1></div>
    <div class="period-row">
      ${Object.keys(FT_PERIOD_LABELS).map(p => `
        <button class="period-btn ${ftStatsPeriod === p ? 'active' : ''}" data-ft-period="${p}">${FT_PERIOD_LABELS[p]}</button>
      `).join('')}
    </div>
    <div class="progress-summary">
      <span>${isDay ? `${avgKcal} kcal heute` : `Ø ${avgKcal} kcal/Tag`}</span>
    </div>
    ${chartHTML}
    ${donutSectionHTML}
    ${ftGoalComparisonHTML(periodDays)}
    ${ftWeekdayAverageHTML(periodDays)}
    ${ftStreakHTML()}
    ${monthOverviewHTML}
  `;

  document.getElementById('ftStatsBackBtn').onclick = () => history.back();
  app.querySelectorAll('[data-ft-period]').forEach(btn => {
    btn.onclick = () => {
      ftStatsPeriod = btn.dataset.ftPeriod;
      ftMacroDrilldown = null;
      renderFoodStats();
    };
  });
  if (totalMacroKcal) ftWireMacroDonut(segments, periodDays);
  wireLineCharts(app);
}

// Analog zu wireTimeDonutSection()/applyTimeDonutSelection() (08b-stats-muscle-balance.js),
// aber bewusst ohne die dortige Sub-Segment-Aufsplittung des Donuts selbst (dort: Übungen
// INNERHALB einer Muskelgruppe als eigene Arc-Abschnitte) — hier reicht die einfache Liste
// darunter, da "welche Lebensmittel" keine geometrische Unterteilung des Rings braucht.
// Ein-/Ausgrauen der übrigen Segmente, Center-Wert-Wechsel und die Legende darunter folgen
// exakt demselben Muster.
function ftWireMacroDonut(segments, periodDays){
  const ranges = donutAngleRanges(segments);

  function toggle(macroKey){
    ftMacroDrilldown = (ftMacroDrilldown === macroKey) ? null : macroKey;
    ftBreakdownExpanded = false;
    apply();
  }

  function apply(){
    const svg = document.getElementById('donutSvg-food');
    if (!svg) return;
    const selected = ftMacroDrilldown;
    const selectedRange = ranges.find(r => segments.find(s => s.label === r.label && s.key === selected));

    svg.querySelectorAll('.donut-seg:not(.donut-subseg)').forEach(path => {
      const seg = segments.find(s => s.label === path.dataset.group);
      const isSelected = seg && selected === seg.key;
      path.classList.toggle('donut-seg-hidden', isSelected);
      path.classList.toggle('donut-seg-dim', !!selected && !isSelected);
    });
    // Der ausgewählte Ring-Abschnitt selbst wird ausgeblendet (donut-seg-hidden oben) und
    // stattdessen in einzelne, nach Lebensmittel eingefärbte Unterabschnitte aufgeteilt —
    // exakt dasselbe Muster wie bei der Muskelgruppen-Verteilung (applyMuscleDonutSelection(),
    // 08b-stats-muscle-balance.js): shadeMuscleColor() für abgestufte Farbtöne derselben
    // Makro-Farbe, donutArcPath() für die Geometrie der Unterabschnitte.
    svg.querySelectorAll('.donut-subseg').forEach(el => el.remove());

    const defaultCenter = document.getElementById('pieCenterDefault-food');
    const selectedCenter = document.getElementById('pieCenterSelected-food');
    if (defaultCenter) defaultCenter.classList.toggle('pie-center-hidden', !!selected);
    if (selectedCenter) selectedCenter.classList.toggle('pie-center-hidden', !selected);
    const mainLegend = document.getElementById('ftMainLegend');
    if (mainLegend) mainLegend.classList.toggle('dimmed', !!selected);

    const panel = document.getElementById('ftMacroBreakdown');
    if (!selected){
      if (panel) panel.classList.remove('open');
      setTimeout(() => { if (!ftMacroDrilldown && panel) panel.style.display = 'none'; }, 250);
      return;
    }
    const seg = segments.find(s => s.key === selected);
    const fullBreakdown = ftFoodMacroBreakdown(selected, periodDays);
    // subTotal bewusst aus der VOLLSTÄNDIGEN, ungefilterten Liste berechnet — die
    // Prozentangaben bleiben dadurch über verschiedene Zeiträume hinweg vergleichbar
    // (Woche/Monat/Jahr können hier stark unterschiedlich viele Lebensmittel enthalten, siehe
    // Filterung unten), statt sich künstlich zu verschieben, nur weil ein paar Mini-Beiträge
    // aus der ANZEIGE rausfallen.
    const subTotal = fullBreakdown.reduce((a,e) => a+e.val, 0);
    // Vernachlässigbare Beiträge ausblenden (auf 0% gerundet ODER nur ~1g) — bei häufig
    // protokollierten Mahlzeiten sammeln sich sonst über die Zeit viele Gewürz-/Topping-Reste
    // in Spurenmengen an, die weder im Ring noch in der Liste zusätzlichen Erkenntniswert
    // bringen, beide aber unübersichtlich aufblähen. Zusätzlich auf die 7 größten Quellen
    // gedeckelt (schon absteigend sortiert, siehe ftFoodMacroBreakdown()) — bewusst dynamisch
    // aus der jeweils aktuellen Liste ermittelt statt fest vorausgewählt, da sich die
    // häufigsten Quellen je nach Zeitraum (Woche/Monat/Jahr) stark unterscheiden können.
    const significant = fullBreakdown.filter(e => e.val >= 1.5 && (subTotal ? Math.round(e.val / subTotal * 100) : 0) > 0);
    // Antippen der "+N weitere"-Zeile klappt auf die volle significant-Liste auf (kein
    // Lebensmittel bleibt dabei verborgen) — ftBreakdownExpanded macht daraus einfach eine
    // Anzeige ohne Deckelung/Rest-Sammelposten.
    const shown = ftBreakdownExpanded ? significant : significant.slice(0, 7);
    const restVal = ftBreakdownExpanded ? 0 : significant.slice(7).reduce((a,e) => a+e.val, 0);
    const restCount = significant.length - shown.length;

    if (selectedRange && subTotal){
      let a = selectedRange.startAngle;
      // Der Ring zeigt exakt dieselben Unterabschnitte wie die Liste darunter (siehe rows
      // weiter unten) — die übrigen, nicht einzeln gezeigten Quellen fließen als EIN
      // gemeinsamer, neutral eingefärbter "Rest"-Abschnitt ein, statt einfach zu fehlen (der
      // Ring würde sonst sichtbar kleiner wirken als der Makro-Anteil tatsächlich ist).
      const arcItems = restVal > 0 ? [...shown, { name: `+${restCount} weitere`, val: restVal, isRest: true }] : shown;
      const gapDeg = arcItems.length > 1 ? 1.4 : 0;
      arcItems.forEach((e, i) => {
        const fraction = e.val / subTotal;
        const rawEnd = a + fraction * (selectedRange.endAngle - selectedRange.startAngle);
        const startA = a + (i > 0 ? gapDeg/2 : 0);
        const endA = rawEnd - (i < arcItems.length - 1 ? gapDeg/2 : 0);
        a = rawEnd;
        const subPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        subPath.setAttribute('d', donutArcPath(startA, endA));
        subPath.setAttribute('fill', e.isRest ? cssVar('--muted') : shadeMuscleColor(seg.color, i));
        subPath.setAttribute('class', 'donut-seg donut-subseg');
        subPath.style.transitionDelay = (i * 35) + 'ms';
        subPath.onclick = () => toggle(selected);
        svg.appendChild(subPath);
      });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        svg.querySelectorAll('.donut-subseg').forEach(el => el.classList.add('donut-subseg-in'));
      }));
    }

    const selValueEl = document.getElementById('pieCenterSelectedValue-food');
    const selLabelEl = document.getElementById('pieCenterSelectedLabel-food');
    if (selValueEl && selLabelEl && selectedRange){
      const total = segments.reduce((a,s) => a+s.value, 0);
      const pct = total ? Math.round(selectedRange.value / total * 100) : 0;
      selValueEl.textContent = pct + '%';
      selLabelEl.textContent = seg.label;
    }

    const rows = shown.map((e, i) => {
      const pct = subTotal ? Math.round(e.val / subTotal * 100) : 0;
      // Fasst diese Zeile mehrere Produkte zusammen (z. B. verschiedene Isoclear-Sorten), werden
      // die einzelnen Namen als kleine Unterzeile mitgezeigt — sonst sieht man zwar die Summe,
      // aber nicht mehr, was tatsächlich gegessen wurde.
      const members = (e.members && e.members.length > 1) ? e.members : null;
      return `
        <div class="muscle-balance-legend-row${members ? ' ft-breakdown-row-grouped' : ''}">
          <span class="muscle-balance-swatch-static" style="color:${shadeMuscleColor(seg.color, i)};">${pct}%</span>
          <span class="muscle-balance-legend-label">
            ${ftEscapeHTML(e.name)}
            ${members ? `<span class="ft-breakdown-members">${ftEscapeHTML(members.join(' · '))}</span>` : ''}
          </span>
          <span class="muscle-balance-legend-value">${Math.round(e.val)} g</span>
        </div>
      `;
    }).join('');
    // "+N weitere" ist jetzt ein <button> statt eines <div> — optisch identisch zu den
    // normalen Zeilen (.muscle-balance-legend-row-more in styles.css), aber antippbar: klappt
    // die Liste auf ftBreakdownExpanded=true um und rendert neu. Nach dem Aufklappen ersetzt
    // eine "Weniger anzeigen"-Zeile diese Sammelzeile, um wieder einzuklappen.
    const restRowHTML = restVal > 0 ? `
      <button class="muscle-balance-legend-row muscle-balance-legend-row-more" id="ftBreakdownMoreBtn" type="button">
        <span class="muscle-balance-swatch-static" style="color:var(--muted);">${subTotal ? Math.round(restVal / subTotal * 100) : 0}%</span>
        <span class="muscle-balance-legend-label">+${restCount} weitere</span>
        <span class="muscle-balance-legend-value">${Math.round(restVal)} g</span>
      </button>
    ` : '';
    const lessRowHTML = (ftBreakdownExpanded && significant.length > 7) ? `
      <button class="muscle-balance-legend-row muscle-balance-legend-row-more" id="ftBreakdownLessBtn" type="button">
        <span class="muscle-balance-legend-label" style="margin-left:0;">Weniger anzeigen</span>
      </button>
    ` : '';
    document.getElementById('ftBreakdownTitle').textContent = `${seg.label} – nach Lebensmittel`;
    document.getElementById('ftBreakdownList').innerHTML = (rows + restRowHTML + lessRowHTML) || '<div class="history-empty">Keine Daten.</div>';
    const moreBtn = document.getElementById('ftBreakdownMoreBtn');
    if (moreBtn) moreBtn.onclick = () => { ftBreakdownExpanded = true; apply(); };
    const lessBtn = document.getElementById('ftBreakdownLessBtn');
    if (lessBtn) lessBtn.onclick = () => { ftBreakdownExpanded = false; apply(); };
    if (panel){
      panel.style.display = 'block';
      requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('open')));
    }
  }

  app.querySelectorAll('.donut-seg[data-metric="food"]').forEach(path => {
    const seg = segments.find(s => s.label === path.dataset.group);
    if (seg) path.onclick = () => toggle(seg.key);
  });
  app.querySelectorAll('[data-macro]').forEach(btn => {
    btn.onclick = () => toggle(btn.dataset.macro);
  });
  const closeBtn = document.getElementById('ftBreakdownClose');
  if (closeBtn) closeBtn.onclick = () => { ftMacroDrilldown = null; apply(); };

  if (ftMacroOutsideClickHandler) document.removeEventListener('click', ftMacroOutsideClickHandler, true);
  ftMacroOutsideClickHandler = (ev) => {
    if (!ftMacroDrilldown) return;
    if (ev.target.closest('#ftMacroBreakdown, .donut-seg, .muscle-balance-legend-row, [data-macro]')) return;
    ftMacroDrilldown = null;
    apply();
  };
  document.addEventListener('click', ftMacroOutsideClickHandler, true);

  apply();
}
