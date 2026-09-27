'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions } = require('./extract.js');

const { weekBucket } = loadFunctions('08a-stats-progress-charts.js', ['weekBucket']);

// weekBucket() wird für die Wochen-Buckets in Monatsbericht/-übersicht genutzt — im sw.js-
// Changelog als "Wochen-Bucket-Fix Monatsbericht/-übersicht" erwähnter Bug-Bereich (v8). Diese
// Tests fixieren das aktuelle Verhalten als Referenzwerte, damit eine künftige Änderung an der
// Formel hier auffällt, statt erst wieder über einen Bug-Report entdeckt zu werden.
test('weekBucket: 1. Januar liegt in KW 1', () => {
  const b = weekBucket(new Date(2026, 0, 1));
  assert.equal(b.key, '2026-W1');
  assert.equal(b.label, 'KW 1');
});

test('weekBucket: Datum in der Jahresmitte', () => {
  const b = weekBucket(new Date(2026, 0, 15));
  assert.equal(b.key, '2026-W3');
});

test('weekBucket: 31. Dezember liegt in der letzten Kalenderwoche des Jahres', () => {
  const b = weekBucket(new Date(2026, 11, 31));
  assert.equal(b.key, '2026-W53');
});

test('weekBucket: sortKey ist über Jahresgrenzen hinweg monoton aufsteigend', () => {
  const earlier = weekBucket(new Date(2026, 11, 31));
  const later = weekBucket(new Date(2027, 0, 5));
  assert.ok(later.sortKey > earlier.sortKey, 'Anfang 2027 muss nach Ende 2026 einsortiert werden');
});

test('weekBucket: gleiche Kalenderwoche liefert denselben key, unterschiedliche eine andere', () => {
  // Referenz (siehe Kommentar oben): in diesem Wochenmodell endet die Woche mit KW 38 am
  // Samstag, 19.9.2026 — der Sonntag danach (20.9.) fällt bereits in KW 39.
  const monday = weekBucket(new Date(2026, 8, 14));
  const saturdaySameWeek = weekBucket(new Date(2026, 8, 19));
  const sundayNextWeek = weekBucket(new Date(2026, 8, 20));
  assert.equal(monday.key, saturdaySameWeek.key);
  assert.notEqual(monday.key, sundayNextWeek.key);
});
