const { calibrateForecastProbabilities, isOfficialThunderstormWarning } = require('./utils/rain-probability');
const { alertAffectsLocation, inferredExpiry, xmlValue, stripMarkup, decodeXml } = require('./lib/alerts');
const { createCommunityStore, validateCommunityReport, filterCommunityReports, filterMapCommunityReports } = require('./lib/reports');
const { createModerator } = require('./lib/moderation');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { URL } = require('node:url');

function loadLocalEnvironment() {
  const envFile = path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const entry = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!entry || entry[1] in process.env) continue;
    let value = entry[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[entry[1]] = value;
  }
}
loadLocalEnvironment();
const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, 'public');
const pool = process.env.DATABASE_URL
  ? new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 })
  : null;
const cache = new Map();
const TTL = { forecast: 15 * 60 * 1000, alerts: 5 * 60 * 1000, search: 60 * 60 * 1000 };
const REPORT_DIR = process.env.MVUA_DATA_DIR || path.join(__dirname, 'data');
const REPORT_FILE = path.join(REPORT_DIR, 'community-reports.json');
const COMMUNITY_FLAGS_FILE = path.join(REPORT_DIR, 'community-flags.json');
const COMMUNITY_TERMS_VERSION = '2026-10-31-v1';
const MODERATION_BLOCKLIST_FILE = process.env.MVUA_MODERATION_BLOCKLIST || path.join(__dirname, 'moderation-blocklist.txt');
const REPORT_MAX_AGE = 24 * 60 * 60 * 1000;
const REPORT_RETENTION_DAYS = 30;
const RETENTION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const REPORT_RADIUS_KM = 30;
fs.mkdirSync(path.dirname(MODERATION_BLOCKLIST_FILE), { recursive: true });
if (!fs.existsSync(MODERATION_BLOCKLIST_FILE)) fs.writeFileSync(MODERATION_BLOCKLIST_FILE, '# Add one vulgar, derogatory, unsafe, or spam phrase per line. Lines starting with # are ignored.\n', 'utf8');
const communityStore = createCommunityStore({ pool, reportsFile: REPORT_FILE, flagsFile: COMMUNITY_FLAGS_FILE, retentionDays: REPORT_RETENTION_DAYS });
const { initCommunityStorage, loadCommunityReports, saveCommunityReports, loadCommunityFlags, saveCommunityFlags, purgeExpiredCommunityData } = communityStore;
const { moderateComment } = createModerator({ blocklistFile: MODERATION_BLOCKLIST_FILE });

function cached(key, ttl) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.savedAt < ttl) return entry.value;
  return null;
}
function saveCache(key, value) { cache.set(key, { value, savedAt: Date.now() }); return value; }
function sendError(res, code, errorCode, message, details = []) {
  return send(res, code, { error: message, code: errorCode, details });
}
function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
async function getJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'MvuaTracker/0.1 (Kenya rain forecast prototype)' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  return response.json();
}
async function getKmdAlerts(place, county) {
  const key = 'kmd-cap-feed';
  let xml = cached(key, TTL.alerts);
  if (!xml) {
    const response = await fetch('https://meteo.go.ke/api/cap/rss.xml', {
      headers: { 'user-agent': 'MvuaTracker/0.1', accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error(`Kenya Met feed returned HTTP ${response.status}`);
    xml = saveCache(key, await response.text());
  }
  const items = [...xml.matchAll(/<(?:item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:item|entry)\s*>/gi)].map((match) => {
    const raw = match[1];
    const title = stripMarkup(xmlValue(raw, 'title'));
    const description = stripMarkup(xmlValue(raw, 'description') || xmlValue(raw, 'summary'));
    const area = stripMarkup(xmlValue(raw, 'areaDesc'));
    const event = stripMarkup(xmlValue(raw, 'event'));
    const severity = stripMarkup(xmlValue(raw, 'severity'));
    const expires = stripMarkup(xmlValue(raw, 'expires'));
    const published = stripMarkup(xmlValue(raw, 'pubDate') || xmlValue(raw, 'published') || xmlValue(raw, 'updated'));
    const linkTag = raw.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link\s*>/i);
    const linkAttr = raw.match(/<link[^>]*href=["']([^"']+)["']/i);
    const link = linkTag ? decodeXml(linkTag[1]) : (linkAttr ? decodeXml(linkAttr[1]) : 'https://meteo.go.ke/weather-warnings/');
    return { title, description, area, event, severity, expires, published, link };
  }).filter(a => a.title);

  const now = Date.now();
  const active = items.filter(a => {
    if (/\bexpired\b/i.test(a.title)) return false;
    const capExpiry = Date.parse(a.expires);
    if (Number.isFinite(capExpiry)) return capExpiry >= now;
    const textExpiry = inferredExpiry(`${a.title} ${a.description} ${a.area}`, a.published);
    if (Number.isFinite(textExpiry)) return textExpiry >= now;
    const issuedAt = Date.parse(a.published);
    return Number.isFinite(issuedAt) && now - issuedAt <= 7 * 24 * 60 * 60 * 1000;
  });
  const matched = active.filter(a => alertAffectsLocation(a, place, county));
  return { status: 'ok', source: 'Kenya Meteorological Department', sourceUrl: 'https://meteo.go.ke/weather-warnings/', feedUrl: 'https://meteo.go.ke/api/cap/rss.xml', fetchedAt: new Date().toISOString(), alerts: matched };
}
function readRequestJson(req, maxBytes = 8192) {
  return new Promise((resolve, reject) => {
    let body = ''; let size = 0; let tooLarge = false;
    req.setEncoding('utf8');
    req.on('data', chunk => { size += Buffer.byteLength(chunk); if (size > maxBytes) { tooLarge = true; return; } if (!tooLarge) body += chunk; });
    req.on('end', () => { if (tooLarge) return reject(new Error('Report is too large.')); try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON request.')); } });
    req.on('error', reject);
  });
}
async function createCommunityReport(req, res) {
  const body = await readRequestJson(req);
  const now = new Date();
  const issues = validateCommunityReport(body, { termsVersion: COMMUNITY_TERMS_VERSION, now });
  if (issues.length) return sendError(res, 400, 'VALIDATION_ERROR', issues[0].message, issues);
  const latitude = Number(body.latitude), longitude = Number(body.longitude);
  const date = String(body.date), startTime = String(body.startTime), endTime = String(body.endTime);
  const place = String(body.place).trim().slice(0, 100), county = String(body.county || '').trim().slice(0, 100);
  const severity = String(body.severity), comment = String(body.comment || '').trim();
  const reporterKey = String(body.reporterKey);
  const observedStart = new Date(date + 'T' + startTime + ':00+03:00');
  const observedEnd = new Date(date + 'T' + endTime + ':00+03:00');
  const moderation = await moderateComment(comment);
  const report = { id: randomUUID(), reporterKey, termsVersion: COMMUNITY_TERMS_VERSION, termsAcceptedAt: now.toISOString(), place, county, latitude, longitude, date, startTime, endTime, observedStart: observedStart.toISOString(), observedEnd: observedEnd.toISOString(), severity, comment: moderation.status === 'approved' ? comment : '', commentStatus: moderation.status, reportedAt: now.toISOString(), verification: 'unverified', moderation };
  if (moderation.status === 'pending') report.heldComment = comment;
  const reports = await loadCommunityReports(); reports.push(report); await saveCommunityReports(reports);
  const publicReport = { ...report };
  delete publicReport.heldComment;
  delete publicReport.moderation;
  delete publicReport.reporterKey;
  return send(res, 201, { report: { ...publicReport, distanceKm: 0 } });
}
async function getCommunityReports(latitude, longitude) {
  return filterCommunityReports(await loadCommunityReports(), latitude, longitude, { maxAgeMs: REPORT_MAX_AGE, radiusKm: REPORT_RADIUS_KM });
}
async function getMapCommunityReports() {
  return filterMapCommunityReports(await loadCommunityReports(), { maxAgeMs: REPORT_MAX_AGE });
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/reports' && req.method === 'POST') {
    try { return await createCommunityReport(req, res); }
    catch (error) {
      if (!res.headersSent) {
        const tooLarge = error.message === 'Report is too large.';
        const storageError = Boolean(error.code);
        return sendError(res, tooLarge ? 413 : storageError ? 503 : 400,
          tooLarge ? 'PAYLOAD_TOO_LARGE' : storageError ? 'STORAGE_UNAVAILABLE' : 'INVALID_REQUEST',
          storageError ? 'Community report storage is temporarily unavailable.' : error.message || 'Could not save the report.');
      }
    }
  }
  if (url.pathname === '/api/community/flags' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req);
      const actorKey = String(body.actorKey || ''), targetKey = String(body.targetKey || ''), targetReportId = String(body.targetReportId || ''), type = String(body.type || ''), reason = String(body.reason || '');
      const allowedReasons = new Set(['unsafe_weather_claim', 'abuse_or_harassment', 'vulgar_or_derogatory', 'spam', 'other']);
      if (!/^[a-f0-9-]{36}$/i.test(actorKey) || !targetKey || targetKey.length > 80 || !['content','user'].includes(type) || !allowedReasons.has(reason)) return send(res, 400, { error: 'Choose a valid report reason.' });
      const reports = await loadCommunityReports();
      const target = reports.find(report => report.id === targetReportId);
      if (!target || (type === 'user' && target.reporterKey !== targetKey)) return send(res, 404, { error: 'This community update is no longer available.' });
      if (target.reporterKey === actorKey) return send(res, 400, { error: 'You cannot report your own update.' });
      const flag = { id: randomUUID(), type, reason, targetKey, targetReportId, actorKey, createdAt: new Date().toISOString(), status: 'received' };
      let duplicate, count;
      if (pool) {
        const inserted = await pool.query(`INSERT INTO community_flags (id, type, target_key, target_report_id, actor_key, reason, created_at, status)
          VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6, $7::timestamptz, $8)
          ON CONFLICT (type, target_report_id, actor_key) DO NOTHING RETURNING id`,
        [flag.id, flag.type, flag.targetKey, flag.targetReportId, flag.actorKey, flag.reason, flag.createdAt, flag.status]);
        duplicate = inserted.rowCount === 0;
        const counted = await pool.query('SELECT COUNT(DISTINCT actor_key)::int AS count FROM community_flags WHERE type=$1 AND target_key=$2 AND target_report_id=$3::uuid', [type, targetKey, targetReportId]);
        count = counted.rows[0].count;
      } else {
        const flags = await loadCommunityFlags();
        duplicate = flags.some(item => item.type === type && item.targetKey === targetKey && item.targetReportId === targetReportId && item.actorKey === actorKey);
        if (!duplicate) flags.push(flag);
        count = new Set(flags.filter(item => item.type === type && item.targetKey === targetKey && item.targetReportId === targetReportId).map(item => item.actorKey)).size;
        await saveCommunityFlags(flags);
      }
      if (count >= 3) {
        if (type === 'content') target.hidden = true;
        else reports.forEach(report => { if (report.reporterKey === targetKey) report.hidden = true; });
        await saveCommunityReports(reports);
      }
      return send(res, 201, { received: true, duplicate, thresholdReached: count >= 3 });
    } catch (error) { if (!res.headersSent) return send(res, error.code ? 503 : 400, { error: error.code ? 'Community report storage is temporarily unavailable.' : error.message || 'Could not record your report.' }); }
  }
  if (url.pathname === '/api/reports' && req.method === 'GET') {
    const latitude = Number(url.searchParams.get('latitude')), longitude = Number(url.searchParams.get('longitude'));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -5.5 || latitude > 5.5 || longitude < 33.5 || longitude > 42.5) return send(res, 400, { error: 'A valid Kenyan location is required.' });
    return send(res, 200, { reports: await getCommunityReports(latitude, longitude), fetchedAt: new Date().toISOString(), radiusKm: REPORT_RADIUS_KM, maxAgeHours: 24 });
  }
  if (url.pathname === '/api/community/map' && req.method === 'GET') {
    return send(res, 200, { reports: await getMapCommunityReports(), fetchedAt: new Date().toISOString(), maxAgeHours: 24, coordinatePrecision: 'approximately 1 km' });
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'Use GET for this endpoint.' });
  if (url.pathname === '/api/search') {
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2) return send(res, 400, { error: 'Enter at least two letters to search.' });
    const key = `search:${q.toLowerCase()}`;
    let result = cached(key, TTL.search);
    try {
      if (!result) {
        const params = new URLSearchParams({ name: q, count: '10', language: 'en', format: 'json', countryCode: 'KE' });
        const data = await getJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
        result = saveCache(key, (data.results || []).filter(x => x.country_code === 'KE').map(x => ({
          name: x.name, county: x.admin1 || '', country: x.country || 'Kenya', latitude: x.latitude, longitude: x.longitude,
          timezone: x.timezone || 'Africa/Nairobi', elevation: x.elevation ?? null
        })));
      }
      return send(res, 200, { locations: result, source: 'Open-Meteo Geocoding · GeoNames' });
    } catch (error) { return send(res, 502, { error: `Location search is unavailable: ${error.message}` }); }
  }
  if (url.pathname === '/api/weather') {
    const latitude = Number(url.searchParams.get('latitude'));
    const longitude = Number(url.searchParams.get('longitude'));
    const place = (url.searchParams.get('place') || '').trim().slice(0, 100);
    const county = (url.searchParams.get('county') || '').trim().slice(0, 100);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -5.5 || latitude > 5.5 || longitude < 33.5 || longitude > 42.5) {
      return send(res, 400, { error: 'Choose a location inside Kenya from the search results.' });
    }
    const key = `forecast:${latitude.toFixed(3)},${longitude.toFixed(3)}`;
    let forecast = cached(key, TTL.forecast);
    try {
      if (!forecast) {
        const params = new URLSearchParams({
          latitude: String(latitude), 
          longitude: String(longitude), 
          timezone: 'Africa/Nairobi', 
          forecast_days: '7',
          // Uses Open-Meteo best_match to guarantee accurate rain probability percentages + advanced atmospheric tracking
          current: 'temperature_2m,precipitation,weather_code,cloud_cover,surface_pressure',
          hourly: 'precipitation_probability,precipitation,rain,showers,dew_point_2m,cape,cloud_cover',
          daily: 'precipitation_sum,precipitation_probability_max,weather_code,uv_index_max'
        });
        forecast = saveCache(key, await getJson(`https://api.open-meteo.com/v1/forecast?${params}`));
      }
      let warnings;
      try { warnings = await getKmdAlerts(place, county); }
      catch (error) { warnings = { status: 'unavailable', source: 'Kenya Meteorological Department', sourceUrl: 'https://meteo.go.ke/weather-warnings/', fetchedAt: new Date().toISOString(), error: error.message, alerts: [] }; }
      const officialThunderstormWarning = warnings.status === 'ok'
        && warnings.alerts.some(isOfficialThunderstormWarning);
      const displayForecast = {
        ...forecast,
        hourly: forecast.hourly ? { ...forecast.hourly } : forecast.hourly,
        daily: forecast.daily ? { ...forecast.daily } : forecast.daily
      };
      calibrateForecastProbabilities(displayForecast, officialThunderstormWarning);
      return send(res, 200, {
        location: { name: place, county, latitude, longitude, timezone: forecast.timezone || 'Africa/Nairobi' },
        forecast: { current: forecast.current, hourly: displayForecast.hourly, daily: displayForecast.daily, fetchedAt: new Date().toISOString(), source: 'Open-Meteo · rainfall-aware estimate', sourceUrl: 'https://open-meteo.com/en/docs', probabilityMethod: 'Rain probability is reduced according to forecast rainfall amount; estimates are capped at 95% unless a location-matched active KMD thunderstorm warning applies to a forecast period with rain.' },
        warnings
      });
    } catch (error) { return send(res, 502, { error: `Forecast is unavailable: ${error.message}` }); }
  }
  if (url.pathname === '/api/health') {
    if (pool) await pool.query('SELECT 1');
    return send(res, 200, { status: 'ok', service: 'MvuaTracker API', time: new Date().toISOString(), database: pool ? 'postgres' : 'local-json', moderationConfigured: Boolean(process.env.OPENAI_API_KEY), communityTermsVersion: COMMUNITY_TERMS_VERSION, communityRetentionDays: REPORT_RETENTION_DAYS });
  }
  let filePath = url.pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.resolve(PUBLIC_DIR, `.${decodeURIComponent(url.pathname)}`);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(filePath, (error, content) => {
    if (error) return send(res, 404, { error: 'Not found.' });
    const type = filePath.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
    send(res, 200, content, type);
  });
}

async function rescreenPendingComments() {
  if (!process.env.OPENAI_API_KEY) return;
  const reports = await loadCommunityReports();
  let changed = false;
  for (const report of reports) {
    if (report.commentStatus !== 'pending' || !report.heldComment) continue;
    const moderation = await moderateComment(report.heldComment);
    report.moderation = moderation;
    if (moderation.status === 'approved') {
      report.comment = report.heldComment;
      report.commentStatus = 'approved';
      delete report.heldComment;
      changed = true;
    }
  }
  if (changed) await saveCommunityReports(reports);
}

function logRequest(logger, req, res, durationMs) {
  const pathName = new URL(req.url, 'http://localhost').pathname;
  logger(JSON.stringify({ type: 'http_request', method: req.method, path: pathName, status: res.statusCode, durationMs }));
}

async function startServer({ port = PORT, host = '0.0.0.0', runBackgroundTasks = true, logger = console.log } = {}) {
  if (process.env.NODE_ENV === 'production' && !pool) throw new Error('DATABASE_URL must be configured in production.');
  await initCommunityStorage();
  const startupPurge = await purgeExpiredCommunityData();
  if (startupPurge.reports || startupPurge.flags) logger(JSON.stringify({ type: 'retention_cleanup', ...startupPurge }));
  const server = http.createServer((req, res) => {
    const startedAt = Date.now();
    res.once('finish', () => logRequest(logger, req, res, Date.now() - startedAt));
    route(req, res).catch(error => {
      if (!res.headersSent) sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected server error.');
      logger(JSON.stringify({ type: 'request_error', method: req.method, path: new URL(req.url, 'http://localhost').pathname, message: error.message }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  logger(JSON.stringify({ type: 'server_started', host, port: server.address().port }));
  if (runBackgroundTasks) {
    rescreenPendingComments().catch(error => logger(JSON.stringify({ type: 'comment_rescreen_error', message: error.message })));
    const retentionTimer = setInterval(() => {
      purgeExpiredCommunityData().then(result => {
        if (result.reports || result.flags) logger(JSON.stringify({ type: 'retention_cleanup', ...result }));
      }).catch(error => logger(JSON.stringify({ type: 'retention_cleanup_error', message: error.message })));
    }, RETENTION_SWEEP_INTERVAL_MS);
    retentionTimer.unref();
  }
  return server;
}

if (require.main === module) {
  startServer().catch(error => {
    console.error(JSON.stringify({ type: 'server_start_error', message: error.message }));
    process.exitCode = 1;
  });
}

module.exports = { startServer, logRequest };



