const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after } = require('node:test');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mvua-api-'));
process.env.MVUA_DATA_DIR = dataDir;
process.env.MVUA_MODERATION_BLOCKLIST = path.join(dataDir, 'blocklist.txt');
delete process.env.DATABASE_URL;
delete process.env.OPENAI_API_KEY;
const realFetch = globalThis.fetch;
const logs = [];
globalThis.fetch = async (input, options) => {
  const url = String(input);
  if (url.startsWith('http://127.0.0.1:')) return realFetch(input, options);
  if (url.includes('geocoding-api.open-meteo.com')) return new Response(JSON.stringify({ results: [{ name: 'Nyeri', admin1: 'Nyeri County', country_code: 'KE', country: 'Kenya', latitude: -0.42, longitude: 36.95, timezone: 'Africa/Nairobi' }] }), { headers: { 'content-type': 'application/json' } });
  if (url.includes('api.open-meteo.com')) return new Response(JSON.stringify({ timezone: 'Africa/Nairobi', current: { temperature_2m: 20 }, hourly: { time: ['2026-10-29T10:00'], precipitation_probability: [80], precipitation: [1] }, daily: { time: ['2026-10-29'], precipitation_sum: [1], precipitation_probability_max: [80] } }), { headers: { 'content-type': 'application/json' } });
  if (url.includes('meteo.go.ke/api/cap/rss.xml')) return new Response('<rss><channel></channel></rss>', { headers: { 'content-type': 'application/xml' } });
  throw new Error('Unexpected test network request: ' + url);
};

const { startServer } = require('../server');
let server;
let baseUrl;
before(async () => {
  server = await startServer({ port: 0, host: '127.0.0.1', runBackgroundTasks: false, logger: line => logs.push(line) });
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  globalThis.fetch = realFetch;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('search API returns normalized Kenya locations', async () => {
  const response = await fetch(baseUrl + '/api/search?q=Nyeri');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.locations[0].name, 'Nyeri');
  assert.equal(body.locations[0].county, 'Nyeri County');
});

test('weather API returns forecast and explicit no-alert state from an empty successful feed', async () => {
  const response = await fetch(baseUrl + '/api/weather?latitude=-0.42&longitude=36.95&place=Nyeri&county=Nyeri%20County');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.forecast.hourly.precipitation_probability[0], 16);
  assert.equal(body.warnings.status, 'ok');
  assert.deepEqual(body.warnings.alerts, []);
});

test('serves the bundled county boundary GeoJSON to map clients', async () => {
  const response = await fetch(baseUrl + '/kenya-counties.geojson');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.type, 'FeatureCollection');
  assert.equal(body.features.length, 47);
});

test('reports API validates submissions and returns recent reports', async () => {
  const invalid = await fetch(baseUrl + '/api/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const invalidBody = await invalid.json();
  assert.equal(invalid.status, 400);
  assert.equal(invalidBody.code, 'VALIDATION_ERROR', JSON.stringify(invalidBody));
  assert.ok(invalidBody.details.some(issue => issue.field === 'reporterKey'));

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(yesterday);
  const dateParts = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const valid = await fetch(baseUrl + '/api/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    reporterKey: '11111111-1111-4111-8111-111111111111', termsVersion: '2026-10-31-v1', latitude: -0.42, longitude: 36.95,
    place: 'Nyeri', county: 'Nyeri County', date: dateParts.year + '-' + dateParts.month + '-' + dateParts.day,
    startTime: '23:50', endTime: '23:59', severity: 'Drizzle', comment: ''
  }) });
  const validBody = await valid.json();
  assert.equal(valid.status, 201);
  assert.equal(validBody.report.verification, 'unverified');
  const listed = await fetch(baseUrl + '/api/reports?latitude=-0.42&longitude=36.95');
  const listedBody = await listed.json();
  assert.equal(listed.status, 200);
  assert.equal(listedBody.reports.length, 1);
  const mapResponse = await fetch(baseUrl + '/api/community/map');
  const mapBody = await mapResponse.json();
  assert.equal(mapResponse.status, 200);
  assert.equal(mapBody.reports.length, 1);
  assert.equal(mapBody.reports[0].county, 'Nyeri County');
  assert.equal(mapBody.reports[0].latitude, -0.42);
  assert.equal('reporterKey' in mapBody.reports[0], false);
  assert.equal('comment' in mapBody.reports[0], false);
});

test('emits structured request logs without logging query-string values', async () => {
  const response = await fetch(baseUrl + '/api/search?q=Nyeri&private=secret');
  await response.arrayBuffer();
  const entry = logs.map(line => JSON.parse(line)).find(line => line.type === 'http_request' && line.path === '/api/search');
  assert.ok(entry);
  assert.equal(entry.status, 200);
  assert.equal(typeof entry.durationMs, 'number');
  assert.equal(JSON.stringify(entry).includes('secret'), false);
});
