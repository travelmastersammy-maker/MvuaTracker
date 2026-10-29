const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCommunityStore, validateCommunityReport, filterCommunityReports } = require('../lib/reports');

const now = new Date('2026-10-29T12:00:00+03:00');
const validPayload = {
  reporterKey: '11111111-1111-4111-8111-111111111111', termsVersion: 'terms-v1',
  latitude: -0.42, longitude: 36.95, place: 'Nyeri', date: '2026-10-28',
  startTime: '23:50', endTime: '23:59', severity: 'Drizzle', comment: ''
};

test('validates required report fields and returns field-specific issues', () => {
  const issues = validateCommunityReport({}, { termsVersion: 'terms-v1', now });
  assert.deepEqual(new Set(issues.map(issue => issue.field)), new Set(['reporterKey', 'termsVersion', 'location', 'date', 'timeRange', 'severity']));
  assert.ok(issues.every(issue => issue.code && issue.message));
});

test('accepts a valid recent Kenyan report and rejects a future observation', () => {
  assert.deepEqual(validateCommunityReport(validPayload, { termsVersion: 'terms-v1', now }), []);
  const future = { ...validPayload, date: '2026-10-29', startTime: '23:50', endTime: '23:59' };
  assert.ok(validateCommunityReport(future, { termsVersion: 'terms-v1', now }).some(issue => issue.code === 'future_observation'));
  assert.ok(validateCommunityReport({ ...validPayload, severity: 'hail' }, { termsVersion: 'terms-v1', now }).some(issue => issue.field === 'severity'));
});

test('filters nearby recent reports and omits private moderation fields', () => {
  const reports = [{ ...validPayload, id: 'r1', observedEnd: '2026-10-28T20:59:00.000Z', reportedAt: '2026-10-28T21:00:00.000Z', moderation: { status: 'approved' }, heldComment: 'secret' }];
  const visible = filterCommunityReports(reports, -0.42, 36.95, { now: Date.parse('2026-10-29T12:00:00+03:00') });
  assert.equal(visible.length, 1);
  assert.equal('moderation' in visible[0], false);
  assert.equal('heldComment' in visible[0], false);
  assert.equal(filterCommunityReports(reports, 0, 40, { now: Date.parse('2026-10-29T12:00:00+03:00') }).length, 0);
});

test('community store initializes and persists local reports and flags', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mvua-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createCommunityStore({ reportsFile: path.join(dir, 'reports.json'), flagsFile: path.join(dir, 'flags.json') });
  await store.initCommunityStorage();
  await store.saveCommunityReports([{ id: 'r1', reporterKey: 'key', reportedAt: now.toISOString() }]);
  await store.saveCommunityFlags([{ id: 'f1', targetReportId: 'r1', createdAt: now.toISOString() }]);
  assert.equal((await store.loadCommunityReports()).length, 1);
  assert.equal((await store.loadCommunityFlags()).length, 1);
});
