'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions } = require('./extract.js');

const { parseGermanNumber, formatGermanNumber, fmtDuration } = loadFunctions(
  '04-utils.js',
  ['parseGermanNumber', 'formatGermanNumber', 'fmtDuration']
);

test('parseGermanNumber: Komma als Dezimaltrennzeichen', () => {
  assert.equal(parseGermanNumber('82,5'), 82.5);
  assert.equal(parseGermanNumber('100'), 100);
});

test('parseGermanNumber: null/undefined ergibt NaN, kein Crash', () => {
  assert.ok(Number.isNaN(parseGermanNumber(null)));
  assert.ok(Number.isNaN(parseGermanNumber(undefined)));
});

test('parseGermanNumber: nicht-numerischer Text ergibt NaN', () => {
  assert.ok(Number.isNaN(parseGermanNumber('abc')));
});

test('formatGermanNumber: Punkt wird zu Komma', () => {
  assert.equal(formatGermanNumber(82.5), '82,5');
  assert.equal(formatGermanNumber(100), '100');
});

test('formatGermanNumber: null/undefined/NaN ergibt leeren String statt "null"/"NaN"', () => {
  assert.equal(formatGermanNumber(null), '');
  assert.equal(formatGermanNumber(undefined), '');
  assert.equal(formatGermanNumber(NaN), '');
});

test('parseGermanNumber + formatGermanNumber sind zueinander invers', () => {
  assert.equal(formatGermanNumber(parseGermanNumber('47,25')), '47,25');
});

test('fmtDuration: unter einer Stunde als MM:SS', () => {
  assert.equal(fmtDuration(0), '00:00');
  assert.equal(fmtDuration(65), '01:05');
  assert.equal(fmtDuration(599), '09:59');
});

test('fmtDuration: ab einer Stunde als H:MM:SS', () => {
  assert.equal(fmtDuration(3600), '1:00:00');
  assert.equal(fmtDuration(3661), '1:01:01');
  assert.equal(fmtDuration(7325), '2:02:05');
});
