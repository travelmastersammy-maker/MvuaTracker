const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeArea, alertAffectsLocation, inferredExpiry } = require('../lib/alerts');

test('normalizes Kenyan place and county names', () => {
  assert.equal(normalizeArea('Nairobi County'), 'nairobi');
  assert.equal(normalizeArea('Murang’a County'), 'murang a');
});

test('matches county and named Kenyan region alerts without coastal false positives', () => {
  const coastal = { title: 'High waves', description: 'Large waves expected along the Coast', area: '', event: 'Marine warning' };
  const central = { title: 'Heavy rain', description: 'Rain expected in the Central Highlands', area: '', event: 'Rainfall advisory' };
  const kisumu = { title: 'Rain', description: 'Lake Victoria Basin', area: '', event: 'Rain warning' };
  assert.equal(alertAffectsLocation(coastal, 'Nyeri', 'Nyeri County'), false);
  assert.equal(alertAffectsLocation(coastal, 'Mombasa', 'Mombasa County'), true);
  assert.equal(alertAffectsLocation(central, 'Nyeri', 'Nyeri County'), true);
  assert.equal(alertAffectsLocation(kisumu, 'Kisumu', 'Kisumu County'), true);
  assert.equal(alertAffectsLocation(kisumu, 'Nyeri', 'Nyeri County'), false);
});

test('infers an expiry date in Kenya time and rejects descriptions without one', () => {
  const expiry = inferredExpiry('Heavy rain expected until 31 October 2026', '29 Oct 2026 14:00 GMT');
  assert.equal(new Date(expiry).toISOString(), '2026-10-31T20:59:59.000Z');
  assert.ok(Number.isNaN(inferredExpiry('Heavy rain expected soon', '29 Oct 2026')));
});
