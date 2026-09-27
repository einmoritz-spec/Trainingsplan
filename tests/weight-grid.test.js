'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions } = require('./extract.js');

const { weightStepFor, weightBaseFor, roundToWeightGrid } = loadFunctions(
  '02-state-theme.js',
  ['weightStepFor', 'weightBaseFor', 'roundToWeightGrid']
);

test('weightStepFor: nutzt den auf der Übung hinterlegten Schritt', () => {
  assert.equal(weightStepFor({ weightStep: 8 }), 8);
});

test('weightStepFor: fällt auf 5kg zurück, wenn weightStep fehlt/0/negativ ist', () => {
  assert.equal(weightStepFor({}), 5);
  assert.equal(weightStepFor(null), 5);
  assert.equal(weightStepFor({ weightStep: 0 }), 5);
  assert.equal(weightStepFor({ weightStep: -5 }), 5);
});

test('weightBaseFor: nutzt die hinterlegte Basis, auch wenn sie 0 ist', () => {
  assert.equal(weightBaseFor({ weightBase: 5 }), 5);
  assert.equal(weightBaseFor({ weightBase: 0 }), 0);
});

test('weightBaseFor: fällt auf 0 zurück, wenn weightBase fehlt', () => {
  assert.equal(weightBaseFor({}), 0);
  assert.equal(weightBaseFor(null), 0);
});

// Regressionstest für den in sw.js (v8/Gewichts-Raster-Migration) dokumentierten Bug: die
// Beinpresse hat ein Raster von 5-13-21-29-...(Schritt 8, Basis 5). Fehlte weightStep an der
// Übung (z. B. bei einem Bestandsplan ohne die Migration), fiel weightStepFor() fälschlich auf
// den 5kg-Standardschritt zurück und roundToWeightGrid() schlug von 53kg aus 58kg statt 61kg vor.
test('roundToWeightGrid: Beinpresse-Raster (Schritt 8, Basis 5) — Regression für 53→61kg-Bug', () => {
  const beinpresse = { weightStep: 8, weightBase: 5 };
  // Rasterpunkte: 5, 13, 21, 29, 37, 45, 53, 61, 69, ...
  assert.equal(roundToWeightGrid(53, beinpresse, 'round'), 53, 'exakter Rasterpunkt bleibt unverändert');
  assert.equal(roundToWeightGrid(57, beinpresse, 'round'), 61, 'näher an 61 als an 53 → rundet auf 61, NICHT auf 58 (5kg-Fallback)');
  assert.equal(roundToWeightGrid(56, beinpresse, 'round'), 53, 'näher an 53 als an 61');
  assert.equal(roundToWeightGrid(57, beinpresse, 'floor'), 53, 'floor rundet immer abwärts zum vorherigen Rasterpunkt');

  // Zum Vergleich: dieselben Werte mit dem fälschlich zurückfallenden 5kg-Standardschritt
  // (Übung ohne weightStep, wie im Bug-Report) landen auf einem völlig anderen Raster.
  const ohneRaster = {};
  assert.equal(roundToWeightGrid(57, ohneRaster, 'round'), 55, 'ohne eigenes Raster: normales 5kg-Runden');
});

test('roundToWeightGrid: Standard-Übung ohne eigenes Raster rundet in 5kg-Schritten ab 0', () => {
  const standard = {};
  assert.equal(roundToWeightGrid(0, standard, 'round'), 0);
  assert.equal(roundToWeightGrid(52, standard, 'round'), 50);
  assert.equal(roundToWeightGrid(53, standard, 'round'), 55);
  assert.equal(roundToWeightGrid(-3, standard, 'round'), -5);
});
