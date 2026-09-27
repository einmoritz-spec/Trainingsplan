'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions } = require('./extract.js');

const { estimate1RM, estimate10RM } = loadFunctions(
  '08a-stats-progress-charts.js',
  ['estimate1RM', 'estimate10RM']
);

test('estimate1RM: 0 Gewicht oder 0 Wiederholungen ergibt 0 (keine Division durch 0/NaN)', () => {
  assert.equal(estimate1RM(0, 10), 0);
  assert.equal(estimate1RM(100, 0), 0);
});

test('estimate1RM: Epley-Formel, 1 Wiederholung entspricht ungefähr dem Gewicht selbst', () => {
  // Epley: 1RM = weight * (1 + reps/30) — bei reps=1 ergibt das absichtlich schon einen
  // leichten Aufschlag (weight * 31/30), nicht exakt weight.
  assert.equal(estimate1RM(100, 1), 100 * (31 / 30));
});

test('estimate1RM: bekannter Referenzwert (100kg x 10 Wdh)', () => {
  // 100 * (1 + 10/30) = 100 * 1.3333... = 133.33...
  assert.ok(Math.abs(estimate1RM(100, 10) - 133.333333) < 0.001);
});

test('estimate10RM: 0 Gewicht/Wiederholungen ergibt 0', () => {
  assert.equal(estimate10RM(0, 5), 0);
  assert.equal(estimate10RM(100, 0), 0);
});

test('estimate10RM: für genau 10 Wiederholungen kommt wieder ungefähr das Ausgangsgewicht heraus', () => {
  // estimate10RM leitet aus dem geschätzten 1RM zurück — bei bereits 10 Wdh muss das
  // ursprüngliche Gewicht (näherungsweise) wieder herauskommen.
  const weight = 80;
  assert.ok(Math.abs(estimate10RM(weight, 10) - weight) < 0.001);
});

test('estimate10RM: höheres geschätztes 1RM ergibt ein höheres geschätztes 10RM', () => {
  const lower = estimate10RM(80, 8);
  const higher = estimate10RM(100, 8);
  assert.ok(higher > lower);
});