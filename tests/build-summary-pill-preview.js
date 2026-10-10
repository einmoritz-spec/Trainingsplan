'use strict';
/* Rendert Abschluss-Badge + Stat-Pill mit den echten CSS-Regeln (css/styles.css) und den Werten
   aus dem gemeldeten Screenshot. Aufruf: node tests/build-summary-pill-preview.js <ausgabe.html> */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
const data = fs.readFileSync(path.join(root, 'js', 'data', 'app-data.js'), 'utf8');
const icon = n => data.match(new RegExp("const " + n + " = '([^']+)'"))[1];
const themeVars = css.match(/:root\s*\{[^}]*\}/)[0];
const rules = css.split('@media print')[0].match(/\.summary-(pill|badge)[^{]*\{[^}]*\}/g).join('\n');
const item = (inner, label) => `<div class="summary-pill-item"><div class="summary-pill-top">${inner}</div><div class="summary-pill-label">${label}</div></div>`;
const div = '<div class="summary-pill-divider"></div>';
const img = n => `<img class="summary-pill-icon-img" src="${icon(n)}" alt="">`;
const pill = `<div class="summary-pill summary-pill-compact">
 ${item('<span class="summary-pill-value summary-pill-value-long">1:05:10</span>', 'Dauer')}${div}
 ${item(img('ICON_FLAME') + '<span class="summary-pill-value">10W</span>', 'am Stück')}${div}
 ${item(img('ICON_RECORD') + '<span class="summary-pill-value">13</span>', 'Rekorde')}${div}
 ${item(img('ICON_IMPROVEMENT') + '<span class="summary-pill-value">9</span>', 'Verbessert')}${div}
 ${item('<span class="summary-pill-value" style="color:#e8a33d">8.9</span>', 'Ø Intensität')}${div}
 ${item('<span class="summary-pill-value">460</span><span class="summary-pill-unit">kcal</span>', '≈ kcal')}
</div>`;
const badge = `<div class="summary-badge"><div class="summary-badge-number"><img class="summary-badge-icon-img" src="${icon('ICON_RECORD')}" alt="">13</div><div class="summary-badge-label">Allzeitrekorde</div></div>`;
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${themeVars}*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--bg,#0d0d0f);color:var(--text);font-family:Inter,system-ui,sans-serif}${rules}</style>
${badge}${pill}`;
fs.writeFileSync(process.argv[2], html);
