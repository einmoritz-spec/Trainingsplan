'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions } = require('./extract.js');

// setVolumeKg ruft effectiveSetWeight() auf, muss also zusammen mit dieser geladen werden
// (siehe Kommentar in extract.js zu Funktionen, die sich gegenseitig referenzieren).
const { setVolumeKg } = loadFunctions('04-utils.js', ['effectiveSetWeight', 'setVolumeKg']);

function withBodyWeight(bw, fn){
  global.plan = { bodyWeight: bw };
  try { fn(); } finally { delete global.plan; }
}

test('setVolumeKg: normale (beidseitige) Übung — keine Verdopplung', () => {
  withBodyWeight(80, () => {
    assert.equal(setVolumeKg({}, 10, 60), 600);
  });
});

test('setVolumeKg: fehlende Wdh oder fehlendes Gewicht ergibt 0, kein Crash', () => {
  withBodyWeight(80, () => {
    assert.equal(setVolumeKg({}, 0, 60), 0);
    assert.equal(setVolumeKg({}, 10, 0), 0);
    assert.equal(setVolumeKg({}, null, null), 0);
  });
});

// Ausfallschritte (Kurzhanteln): 10 Wdh links UND 10 Wdh rechts im selben Satz — die
// eingetragenen 10 Wdh × 20kg stehen nur für EINE Seite, die Gesamtarbeit ist doppelt so hoch.
test('setVolumeKg: einseitige Übung verdoppelt das Volumen', () => {
  withBodyWeight(80, () => {
    assert.equal(setVolumeKg({ unilateral: true }, 10, 20), 400, '10×20kg wäre 200 — tatsächlich beide Seiten, also 400');
  });
});

// Kombiniert mit Körpergewichts-Anteil (z. B. eine zukünftige einseitige Körpergewichtsübung) —
// erst Körpergewicht addieren, DANN verdoppeln, damit die Reihenfolge nicht zu falschen
// Ergebnissen führt.
test('setVolumeKg: Verdopplung greift NACH effectiveSetWeight (bodyweightExercise + unilateral kombiniert)', () => {
  withBodyWeight(80, () => {
    const planEx = { bodyweightExercise: true, bodyWeightFactor: 0.5, unilateral: true };
    // effectiveSetWeight = 80*0.5 + 5 = 45; Volumen = 10 * 45 = 450; verdoppelt = 900.
    assert.equal(setVolumeKg(planEx, 10, 5), 900);
  });
});

test('setVolumeKg: kein planEx (undefined) verdoppelt nicht und crasht nicht', () => {
  withBodyWeight(80, () => {
    assert.equal(setVolumeKg(undefined, 10, 60), 600);
    assert.equal(setVolumeKg(null, 10, 60), 600);
  });
});
