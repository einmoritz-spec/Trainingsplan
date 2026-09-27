'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions } = require('./extract.js');

const { effectiveSetWeight } = loadFunctions('04-utils.js', ['effectiveSetWeight']);

// effectiveSetWeight liest den globalen `plan` (für plan.bodyWeight) — im Browser von
// 02-state-theme.js bereitgestellt, hier als einfacher Stub.
function withBodyWeight(bw, fn){
  global.plan = { bodyWeight: bw };
  try { fn(); } finally { delete global.plan; }
}

test('effectiveSetWeight: normale Übung ohne bodyweightExercise bleibt unverändert', () => {
  withBodyWeight(80, () => {
    assert.equal(effectiveSetWeight({}, 60), 60);
    assert.equal(effectiveSetWeight(null, 60), 60);
  });
});

test('effectiveSetWeight: kein eingetragenes Gewicht wird als 0 behandelt', () => {
  withBodyWeight(80, () => {
    assert.equal(effectiveSetWeight({}, null), 0);
    assert.equal(effectiveSetWeight({}, undefined), 0);
  });
});

test('effectiveSetWeight: unterstützte Übung (Klimmzugmaschine) zieht das eingestellte Gewicht ab', () => {
  withBodyWeight(80, () => {
    assert.equal(effectiveSetWeight({ assisted: true }, 20), 60);
    // Nie unter 0 (mehr Unterstützung als Körpergewicht ergibt rechnerisch keinen Sinn).
    assert.equal(effectiveSetWeight({ assisted: true }, 100), 0);
  });
});

test('effectiveSetWeight: Rückenstrecker (Rumpfanteil 50%, kein Gerätegewicht)', () => {
  withBodyWeight(80, () => {
    assert.equal(effectiveSetWeight({ bodyweightExercise: true, bodyWeightFactor: 0.5 }, 0), 40);
    assert.equal(effectiveSetWeight({ bodyweightExercise: true, bodyWeightFactor: 0.5 }, 10), 50);
  });
});

// Kniebeuge (Langhantel/Frontkniebeuge): volles Körpergewicht + das eingetragene (bereits die
// komplette Langhantel umfassende) Gewicht — kein separates machineWeightKg nötig.
test('effectiveSetWeight: Kniebeuge Langhantel addiert das volle Körpergewicht', () => {
  withBodyWeight(80, () => {
    assert.equal(effectiveSetWeight({ bodyweightExercise: true }, 60), 140);
    assert.equal(effectiveSetWeight({ bodyweightExercise: true }, 0), 80, 'auch ohne Zusatzgewicht zählt das Körpergewicht');
  });
});

// Kniebeugen (Multipresse): zusätzlich zu Körpergewicht + Zusatzgewicht noch das grobe,
// änderbare Näherungsgewicht der Geräte-Stange selbst (machineWeightKg).
test('effectiveSetWeight: Kniebeugen Multipresse addiert zusätzlich das Gerätegewicht', () => {
  withBodyWeight(80, () => {
    assert.equal(effectiveSetWeight({ bodyweightExercise: true, machineWeightKg: 15 }, 20), 115);
    assert.equal(effectiveSetWeight({ bodyweightExercise: true, machineWeightKg: 15 }, 0), 95, 'Körpergewicht + Gerätegewicht auch ohne Zusatzscheiben');
  });
});

test('effectiveSetWeight: ohne bekanntes Körpergewicht (plan.bodyWeight null) zählt nur das eingetragene Gewicht', () => {
  withBodyWeight(null, () => {
    assert.equal(effectiveSetWeight({ bodyweightExercise: true, machineWeightKg: 15 }, 20), 20);
  });
});
