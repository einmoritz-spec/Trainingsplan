'use strict';
/* ---------------------------------------------------------------------------
   extract.js — lädt einzelne, reine Funktionen direkt aus den echten js/*.js-
   Quelldateien für Tests, OHNE die gesamte Datei auszuführen.

   Warum nicht einfach require('../js/04-utils.js')?
   Die App-Dateien sind klassische <script>-Tags, die sich einen globalen
   Browser-Scope teilen (kein module.exports, kein import) und module-Level
   Code enthalten, der `document`/`window`/`navigator` voraussetzt (Event-
   Listener, DOM-Zugriffe beim Laden, IndexedDB-Setup, ...). Ein Node-Prozess
   ohne Browser-Umgebung stürzt beim einfachen Einlesen dieser Dateien ab.

   Diese Funktion sucht stattdessen NUR die angeforderten Funktionsdefinitionen
   per Klammer-Zählung aus dem Quelltext heraus (kein Build-Schritt, keine
   Kopie von Hand — die Tests laufen dadurch immer gegen den AKTUELLEN Code)
   und wertet sie isoliert aus. Das funktioniert für reine Funktionen (keine
   Abhängigkeit von window/document/anderen globalen App-Variablen wie `plan`
   oder `sessions`) — genau die Kategorie, die sich am ehesten für Unit-Tests
   eignet und in der sich Rundungs-/Berechnungsfehler bisher am schwersten von
   Hand nachvollziehen ließen (siehe sw.js-Changelog: "53kg → 58kg statt 61kg").

   Referenziert eine extrahierte Funktion eine ANDERE Funktion aus derselben
   Datei (z. B. estimate10RM() ruft estimate1RM() auf), einfach beide Namen in
   `names` aufführen — sie werden zusammen in denselben isolierten Scope
   geladen und können sich gegenseitig sehen.
--------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');

const JS_DIR = path.join(__dirname, '..', 'js');

function extractFunctionSource(src, name){
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  if (start === -1){
    throw new Error(`Funktion "${name}" nicht gefunden — Name/Datei geändert? (gesucht: "${marker}")`);
  }
  const braceStart = src.indexOf('{', start);
  if (braceStart === -1) throw new Error(`Kein Funktionskörper für "${name}" gefunden.`);
  let depth = 0;
  let i = braceStart;
  for (; i < src.length; i++){
    if (src[i] === '{') depth++;
    else if (src[i] === '}'){
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error(`Unbalancierte Klammern beim Extrahieren von "${name}".`);
  return src.slice(start, i + 1);
}

// Lädt die genannten Funktionen aus js/<fileName> und gibt ein Objekt
// { funktionsname: function } zurück, isoliert in einem eigenen Scope (per
// `new Function` — kein Zugriff auf Node-Globals wie require/module, genau
// wie im Browser-Scope der App, nur ohne window/document).
function loadFunctions(fileName, names){
  const filePath = path.join(JS_DIR, fileName);
  const src = fs.readFileSync(filePath, 'utf8');
  const bodies = names.map(name => extractFunctionSource(src, name));
  const exportLines = names.map(name => `__exports.${name} = ${name};`).join('\n');
  const wrapped = `${bodies.join('\n\n')}\n${exportLines}`;
  const factory = new Function('__exports', wrapped);
  const exportsObj = {};
  factory(exportsObj);
  return exportsObj;
}

module.exports = { loadFunctions, extractFunctionSource };
