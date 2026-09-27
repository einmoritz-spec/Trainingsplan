# Unit-Tests

Deckt die reinen, gut isolierbaren Berechnungsfunktionen der App ab — genau die
Kategorie, in der sich Rundungs-/Berechnungsfehler bisher am schwersten von
Hand nachvollziehen ließen (siehe sw.js-Changelog: "53kg → 58kg statt 61kg"
beim Gewichts-Raster, "Wochen-Bucket-Fix Monatsbericht/-übersicht").

## Ausführen

```bash
npm test
# oder direkt:
node --test tests/*.test.js
```

Braucht kein npm-Install — nur Node.js (getestet mit Node 22, `node:test` ist
ab Node 18 eingebaut). Keine Test-Abhängigkeiten, kein Build-Schritt.

## Wie das funktioniert

Die App-Dateien unter `js/` sind klassische `<script>`-Tags, die sich einen
globalen Browser-Scope teilen (kein `module.exports`, kein `import`) und an
vielen Stellen `document`/`window`/`navigator`/IndexedDB voraussetzen — ein
normaler `require('../js/04-utils.js')` stürzt in Node sofort ab.

`extract.js` löst das, ohne die App-Dateien anzufassen oder Funktionen von
Hand zu kopieren: Es sucht die angeforderte(n) Funktion(en) per
Klammer-Zählung direkt aus dem **echten** Quelltext heraus und wertet sie
isoliert aus (`new Function(...)`, kein Zugriff auf Node- oder Browser-
Globals). Die Tests laufen dadurch immer gegen den aktuellen Code — ändert
sich z. B. `roundToWeightGrid()`, sehen die Tests das automatisch, ohne dass
irgendwo eine zweite Kopie der Logik gepflegt werden müsste.

```js
const { loadFunctions } = require('./extract.js');
const { roundToWeightGrid } = loadFunctions('02-state-theme.js', ['roundToWeightGrid']);
```

Ruft eine extrahierte Funktion eine andere Funktion aus derselben Datei auf
(z. B. `estimate10RM()` → `estimate1RM()`), einfach beide Namen in die Liste
aufnehmen — sie landen im selben isolierten Scope und sehen sich gegenseitig.

## Grenzen dieses Ansatzes

Funktioniert nur für **reine** Funktionen ohne Abhängigkeit von `window`/
`document`/globalen App-Variablen wie `plan` oder `sessions`. Für alles, was
DOM-Zugriffe, IndexedDB oder den globalen App-State braucht (praktisch der
gesamte Rendering-Code, `saveJSON`/`loadJSON`, `computeNextSplitStep()` u. Ä.),
bräuchte es einen echten Browser-Testlauf (z. B. Playwright) — das ist hier
bewusst nicht Teil dieses leichtgewichtigen Setups.

## Enthaltene Tests

| Datei | Testet | Aus |
|---|---|---|
| `weight-grid.test.js` | `weightStepFor`, `weightBaseFor`, `roundToWeightGrid` — inkl. Regressionstest für den dokumentierten Beinpresse-Rundungsbug | `js/02-state-theme.js` |
| `estimates.test.js` | `estimate1RM`, `estimate10RM` (Epley-Formel) | `js/08a-stats-progress-charts.js` |
| `effective-set-weight.test.js` | `effectiveSetWeight` — unterstützte/Eigenkörpergewicht-Übungen, inkl. Kniebeugen (volles Körpergewicht) und Multipresse-Gerätegewicht | `js/04-utils.js` |
| `set-volume.test.js` | `setVolumeKg` — Trainingsvolumen, inkl. Verdopplung bei einseitigen/wechselseitigen Übungen (Ausfallschritte, einarmiges Rudern/Curls) | `js/04-utils.js` |
| `formatting.test.js` | `parseGermanNumber`, `formatGermanNumber`, `fmtDuration` | `js/04-utils.js` |
| `week-bucket.test.js` | `weekBucket` (Kalenderwochen-Zuordnung für Monatsbericht/-übersicht) | `js/08a-stats-progress-charts.js` |

## Weitere Tests ergänzen

1. Neue Datei `tests/<thema>.test.js` anlegen.
2. `const { loadFunctions } = require('./extract.js');` und die gewünschten
   Funktionen aus der jeweiligen `js/*.js`-Datei laden.
3. Mit `node:test`/`node:assert` wie in den bestehenden Dateien schreiben.

Kandidaten für sinnvolle nächste Tests: `parseSetsRepsRange`-artige Parser,
`computeEfficiencyPoints()`, `intensityBandForRpe()` — alles, was reine
Eingabe→Ausgabe-Logik ohne App-State ist.
