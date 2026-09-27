'use strict';
/* Rendert die Lebensmittel-Ergebniszeilen (.result-row) mit den echten CSS-Regeln aus
   css/styles.css und den Namen aus dem gemeldeten Screenshot, um die Ausrichtung der
   Löschen-Buttons zu prüfen. */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');

function ruleBlock(selector){
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*\\}', 'g');
  const found = css.match(re);
  if (!found) throw new Error('Regel nicht gefunden: ' + selector);
  return found.join('\n');
}

const rules = [
  '.result-row',
  '.result-row:last-child',
  '.result-main',
  '.result-name',
  '.result-sub',
  '.result-star',
  '.result-star svg',
].map(ruleBlock).join('\n');

const trash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';
const star = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 2.5-7.5L3 9h7z"/></svg>';

// Namen exakt aus dem gemeldeten Screenshot — bewusst stark unterschiedlich lang, weil genau
// das den Fehler sichtbar machte (Löschen-Button wanderte mit der Textbreite).
const customFoods = [
  ['Müsli (low sugar, Köln)', '181.5 kcal/100g'],
  ['Laugen Knäckebrot', '413 kcal/100g'],
  ['Thunfisch (deutschesee)', '96 kcal/100g'],
  ['Sesam Sauce', '384 kcal/100g'],
  ['Reishunger (Szechuan)', '618 kcal/100g'],
  ['Maki Mix Lachs Avocado', '156 kcal/100g'],
  ['Ein extrem langer Lebensmittelname der abgeschnitten werden muss', '999 kcal/100g'],
];

// Basislisten-Treffer (nicht löschbar) — müssen dieselbe Sternspalte treffen.
const baseFoods = [
  ['Spicy Chicken Sauce', 'Heinz · 444 kcal/100g'],
  ['Hot sauce carbonarq flavour', '346.3 kcal/100g'],
  ['Gurke', 'Gemüse · 15 kcal/100g'],
];

const row = (name, sub, withTrash) => `
  <div class="result-row">
    <div class="result-main"><div class="result-name">${name}</div><div class="result-sub">${sub}</div></div>
    ${withTrash
      ? `<button class="result-star" data-del-food="x" title="Löschen">${trash}</button>`
      : `<button class="result-star" style="visibility:hidden;" aria-hidden="true" tabindex="-1">${trash}</button>`}
    <button class="result-star" data-fav-id="x">${star}</button>
  </div>`;

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{ --border:#2e2e30; --text:#f2f0eb; --muted:#8e8e93; --carbs:#d9a441; }
  *{ box-sizing:border-box; }
  body{ margin:0; padding:12px; background:#0d0d0f; color:var(--text);
        font-family:Inter, system-ui, sans-serif; }
  ${rules}
  .panel{ border:1px solid var(--border); border-radius:14px; padding:0 16px; margin-bottom:14px; }
</style></head>
<body>
  <div class="panel">${baseFoods.map(([n,s]) => row(n,s,false)).join('')}</div>
  <div class="panel">${customFoods.map(([n,s]) => row(n,s,true)).join('')}</div>
</body></html>`;

fs.writeFileSync(path.join(__dirname, 'result-row-preview.html'), html);
console.log('geschrieben: tests/result-row-preview.html');
