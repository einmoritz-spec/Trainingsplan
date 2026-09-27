'use strict';
/* Rendert die Kopfkarte des Monatsberichts mit den echten CSS-Regeln aus css/styles.css
   und den Werten aus dem gemeldeten Screenshot, um den Überlauf vorher/nachher zu prüfen. */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');

// Wir ziehen nur den relevanten Regelblock heraus, damit die Testseite unabhängig vom
// restlichen App-Layout ist.
function ruleBlock(selector){
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*\\}', 'g');
  const found = css.match(re);
  if (!found) throw new Error('Regel nicht gefunden: ' + selector);
  return found.join('\n');
}

const rules = [
  '.month-report-card',
  '.month-report-stat-grid',
  '.month-report-stat-cell',
  '.month-report-stat-value',
  '.month-report-stat-label',
  '.month-report-stat-delta',
  '.month-report-stat-delta.up',
].map(ruleBlock).join('\n');

// Werte exakt aus dem gemeldeten Screenshot (September-Bericht).
const html = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{
    --surface:#1c1c1e; --border:#2e2e30; --text:#f2f0eb; --muted:#8e8e93;
    --accent-2:#e05a4f; --radius:14px;
  }
  *{ box-sizing:border-box; }
  body{ margin:0; padding:12px; background:#0d0d0f; font-family:Inter, system-ui, sans-serif; }
  ${rules}
  /* Markiert sichtbar, wenn Inhalt aus der Karte läuft. */
  .month-report-card{ outline:1px dashed #555; }
</style></head>
<body>
  <div class="month-report-card">
    <div class="month-report-stat-grid">
      <div class="month-report-stat-cell">
        <div class="month-report-stat-value">11<span class="month-report-stat-delta down">−4</span></div>
        <div class="month-report-stat-label">Workouts</div>
      </div>
      <div class="month-report-stat-cell">
        <div class="month-report-stat-value">1:10:15</div>
        <div class="month-report-stat-label">Ø Dauer</div>
      </div>
      <div class="month-report-stat-cell">
        <div class="month-report-stat-value">141.754 kg<span class="month-report-stat-delta up">+1.508 kg</span></div>
        <div class="month-report-stat-label">Gesamtvolumen</div>
      </div>
      <div class="month-report-stat-cell">
        <div class="month-report-stat-value" style="color:#d9c74a;">228</div>
        <div class="month-report-stat-label">Neue Rekorde</div>
      </div>
    </div>
  </div>

  <!-- Extremfall: siebenstelliges Volumen, um die Robustheit zu prüfen -->
  <div class="month-report-card">
    <div class="month-report-stat-grid">
      <div class="month-report-stat-cell">
        <div class="month-report-stat-value">128<span class="month-report-stat-delta up">+12</span></div>
        <div class="month-report-stat-label">Workouts</div>
      </div>
      <div class="month-report-stat-cell">
        <div class="month-report-stat-value">12:10:15</div>
        <div class="month-report-stat-label">Ø Dauer</div>
      </div>
      <div class="month-report-stat-cell">
        <div class="month-report-stat-value">1.418.754 kg<span class="month-report-stat-delta up">+141.508 kg</span></div>
        <div class="month-report-stat-label">Gesamtvolumen</div>
      </div>
      <div class="month-report-stat-cell">
        <div class="month-report-stat-value" style="color:#d9c74a;">1228</div>
        <div class="month-report-stat-label">Neue Rekorde</div>
      </div>
    </div>
  </div>
</body></html>`;

fs.writeFileSync(path.join(__dirname, 'stat-card-preview.html'), html);
console.log('geschrieben: tests/stat-card-preview.html');
