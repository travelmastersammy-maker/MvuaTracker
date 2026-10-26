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
const cache = new Map();
const TTL = { forecast: 15 * 60 * 1000, alerts: 5 * 60 * 1000, search: 60 * 60 * 1000 };
const REPORT_DIR = path.join(__dirname, 'data');
const REPORT_FILE = path.join(REPORT_DIR, 'community-reports.json');
const MODERATION_BLOCKLIST_FILE = path.join(__dirname, 'moderation-blocklist.txt');
const REPORT_MAX_AGE = 24 * 60 * 60 * 1000;
const REPORT_RADIUS_KM = 30;
const REPORT_SEVERITIES = new Set(['No rain', 'Drizzle', 'Slight shower', 'Medium rain', 'Heavy rain', 'Storm / thunderstorm']);
fs.mkdirSync(REPORT_DIR, { recursive: true });
if (!fs.existsSync(REPORT_FILE)) fs.writeFileSync(REPORT_FILE, '[]', 'utf8');
if (!fs.existsSync(MODERATION_BLOCKLIST_FILE)) fs.writeFileSync(MODERATION_BLOCKLIST_FILE, '# Add one vulgar, derogatory, unsafe, or spam phrase per line. Lines starting with # are ignored.\n', 'utf8');

function cached(key, ttl) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.savedAt < ttl) return entry.value;
  return null;
}
function saveCache(key, value) { cache.set(key, { value, savedAt: Date.now() }); return value; }
function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
function decodeXml(value = '') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
}
function xmlValue(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<(?:(?:cap):)?${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:cap):)?${escaped}\\s*>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}
function stripMarkup(text) { return decodeXml(text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function normalizeArea(value = '') {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\bcounty\b/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function hasAreaPhrase(haystack, phrase) {
  const normalizedPhrase = normalizeArea(phrase);
  return Boolean(normalizedPhrase) && ` ${normalizeArea(haystack)} `.includes(` ${normalizedPhrase} `);
}
const COUNTY_REGIONS = {
  Coast: ['Mombasa', 'Kilifi', 'Kwale', 'Lamu', 'Tana River'],
  'North Eastern': ['Garissa', 'Wajir', 'Mandera'],
  Northern: ['Turkana', 'Marsabit', 'Samburu', 'Isiolo', 'Wajir', 'Mandera', 'Garissa'],
  Central: ['Nyeri', 'Kirinyaga', 'Murang’a', 'Kiambu', 'Nyandarua'],
  Eastern: ['Meru', 'Tharaka-Nithi', 'Embu', 'Kitui', 'Machakos', 'Makueni', 'Isiolo'],
  Western: ['Bungoma', 'Busia', 'Kakamega', 'Vihiga', 'Trans Nzoia'],
  'Lake Victoria Basin': ['Kisumu', 'Siaya', 'Homa Bay', 'Migori', 'Busia'],
  'Rift Valley': ['Nakuru', 'Kericho', 'Bomet', 'Narok', 'Kajiado', 'Uasin Gishu', 'Elgeyo-Marakwet', 'Nandi', 'Baringo', 'Laikipia', 'Samburu', 'Turkana', 'West Pokot', 'Trans Nzoia']
};
const NATIONWIDE = /\b(?:nationwide|countrywide|all counties|every county|across the country|throughout the country|across the whole country|throughout kenya|all of kenya|entire country|most parts of (?:the )?country|most parts of kenya)\b/i;
function inferredExpiry(description, published) {
  const match = String(description || '').match(/\b(?:to|through|until|till|ending(?: on)?|valid(?: until| through| to)?)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s*(\d{4})?\b/i);
  if (!match) return NaN;
  const issueTime = Date.parse(published || '');
  const year = match[3] || (Number.isFinite(issueTime) ? String(new Date(issueTime).getUTCFullYear()) : '');
  if (!year) return NaN;
  const day = match[1].padStart(2, '0');
  const date = Date.parse(`${day} ${match[2]} ${year} 23:59:59 GMT+0300`);
  return date;
}
function alertAffectsLocation(alert, place, county) {
  const allText = `${alert.title} ${alert.description} ${alert.area} ${alert.event}`;
  if (NATIONWIDE.test(allText)) return true;
  const locationTerms = [place, county].filter(Boolean);
  if (locationTerms.some(term => hasAreaPhrase(allText, term))) return true;
  const normalizedCounty = normalizeArea(county);
  if (!normalizedCounty) return false;
  for (const [region, counties] of Object.entries(COUNTY_REGIONS)) {
    if (counties.some(name => normalizeArea(name) === normalizedCounty) && hasAreaPhrase(allText, region)) return true;
  }
  return false;
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
function loadCommunityReports() {
  try { const parsed = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8')); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}
function saveCommunityReports(reports) {
  const temp = REPORT_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(reports.slice(-5000)), 'utf8');
  fs.renameSync(temp, REPORT_FILE);
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
function kenyaDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function distanceKm(lat1, lon1, lat2, lon2) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1), dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function validReportDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const selected = Date.parse(`${date}T12:00:00+03:00`), today = Date.parse(`${kenyaDateString()}T12:00:00+03:00`);
  return Number.isFinite(selected) && selected <= today && selected >= today - 7 * 24 * 60 * 60 * 1000;
}
function normalizeModerationText(value) {
  return String(value || '').normalize('NFKC').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
function getModerationBlocklist() {
  try {
    return fs.readFileSync(MODERATION_BLOCKLIST_FILE, 'utf8').split(/\r?\n/)
      .map(line => line.replace(/#.*/, '').trim()).filter(Boolean).map(normalizeModerationText).filter(Boolean);
  } catch { return []; }
}
function localCommentFlags(comment) {
  const normalized = normalizeModerationText(comment);
  const blocklisted = getModerationBlocklist().some(term => ` ${normalized} `.includes(` ${term} `));
  const hasEmail = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(comment);
  const digits = String(comment).replace(/\D/g, '');
  const hasKenyanPhone = /(?:254)?(?:7\d|1\d)\d{7}/.test(digits);
  const hasUrl = /\b(?:https?:\/\/|www\.)\S+/i.test(comment);
  const reasons = [];
  if (blocklisted) reasons.push('blocklisted_term');
  if (hasEmail || hasKenyanPhone) reasons.push('possible_personal_contact');
  if (hasUrl) reasons.push('external_link');
  return reasons;
}
async function moderateComment(comment) {
  if (!comment) return { status: 'approved', reason: 'no_comment', categories: [], checkedAt: new Date().toISOString() };
  const localReasons = localCommentFlags(comment);
  if (localReasons.length) return { status: 'pending', reason: localReasons.join(','), categories: [], checkedAt: new Date().toISOString() };
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { status: 'pending', reason: 'moderation_not_configured', categories: [], checkedAt: new Date().toISOString() };
  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: comment }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Moderation API returned HTTP ${response.status}`);
    const result = (await response.json()).results?.[0];
    if (!result) throw new Error('Moderation API returned no result.');
    const categories = Object.entries(result.categories || {}).filter(([, flagged]) => flagged).map(([name]) => name);
    const flagged = Boolean(result.flagged) || categories.length > 0;
    return { status: flagged ? 'pending' : 'approved', reason: flagged ? 'classifier_flagged' : 'classifier_clear', categories, model: 'omni-moderation-latest', checkedAt: new Date().toISOString() };
  } catch {
    return { status: 'pending', reason: 'moderation_service_unavailable', categories: [], model: 'omni-moderation-latest', checkedAt: new Date().toISOString() };
  }
}

async function createCommunityReport(req, res) {
  const body = await readRequestJson(req);
  const latitude = Number(body.latitude), longitude = Number(body.longitude);
  const date = String(body.date || ''), startTime = String(body.startTime || ''), endTime = String(body.endTime || '');
  const place = String(body.place || '').trim().slice(0, 100), county = String(body.county || '').trim().slice(0, 100);
  const severity = String(body.severity || ''), comment = String(body.comment || '').trim();
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -5.5 || latitude > 5.5 || longitude < 33.5 || longitude > 42.5) return send(res, 400, { error: 'Select a location in Kenya from the search results.' });
  if (!place || !validReportDate(date)) return send(res, 400, { error: 'Choose a Kenyan location and a date within the last seven days.' });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || startTime >= endTime) return send(res, 400, { error: 'Choose a valid same-day time range, with the end after the start.' });
  if (!REPORT_SEVERITIES.has(severity)) return send(res, 400, { error: 'Choose a rainfall severity.' });
  if (comment.length > 280) return send(res, 400, { error: 'Comments must be 280 characters or fewer.' });
  const now = new Date();
  const observedStart = new Date(`${date}T${startTime}:00+03:00`);
  const observedEnd = new Date(`${date}T${endTime}:00+03:00`);
  if (observedEnd.getTime() > now.getTime()) return send(res, 400, { error: 'The report period cannot end in the future.' });
  const moderation = await moderateComment(comment);
  const report = { id: randomUUID(), place, county, latitude, longitude, date, startTime, endTime, observedStart: observedStart.toISOString(), observedEnd: observedEnd.toISOString(), severity, comment: moderation.status === 'approved' ? comment : '', commentStatus: moderation.status, reportedAt: now.toISOString(), verification: 'unverified', moderation };
  if (moderation.status === 'pending') report.heldComment = comment;
  const reports = loadCommunityReports(); reports.push(report); saveCommunityReports(reports);
  const { heldComment, moderation: internalModeration, ...publicReport } = report;
  return send(res, 201, { report: { ...publicReport, distanceKm: 0 } });
}
function getCommunityReports(latitude, longitude) {
  const now = Date.now(), cutoff = now - REPORT_MAX_AGE;
  return loadCommunityReports().map(report => {
    const { heldComment, moderation, ...publicReport } = report;
    return { ...publicReport, distanceKm: distanceKm(latitude, longitude, report.latitude, report.longitude) };
  }).filter(report => report.distanceKm <= REPORT_RADIUS_KM && Date.parse(report.observedEnd) >= cutoff && Date.parse(report.observedEnd) <= now)
    .sort((a, b) => Date.parse(b.reportedAt) - Date.parse(a.reportedAt)).slice(0, 20);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/reports' && req.method === 'POST') {
    try { return await createCommunityReport(req, res); }
    catch (error) { if (!res.headersSent) return send(res, error.message === 'Report is too large.' ? 413 : 400, { error: error.message || 'Could not save the report.' }); }
  }
  if (url.pathname === '/api/reports' && req.method === 'GET') {
    const latitude = Number(url.searchParams.get('latitude')), longitude = Number(url.searchParams.get('longitude'));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -5.5 || latitude > 5.5 || longitude < 33.5 || longitude > 42.5) return send(res, 400, { error: 'A valid Kenyan location is required.' });
    return send(res, 200, { reports: getCommunityReports(latitude, longitude), fetchedAt: new Date().toISOString(), radiusKm: REPORT_RADIUS_KM, maxAgeHours: 24 });
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
          latitude: String(latitude), longitude: String(longitude), timezone: 'Africa/Nairobi', forecast_days: '7',
          current: 'temperature_2m,precipitation,weather_code',
          hourly: 'precipitation_probability,precipitation,rain,showers',
          daily: 'precipitation_sum,precipitation_probability_max,weather_code'
        });
        forecast = saveCache(key, await getJson(`https://api.open-meteo.com/v1/forecast?${params}`));
      }
      let warnings;
      try { warnings = await getKmdAlerts(place, county); }
      catch (error) { warnings = { status: 'unavailable', source: 'Kenya Meteorological Department', sourceUrl: 'https://meteo.go.ke/weather-warnings/', fetchedAt: new Date().toISOString(), error: error.message, alerts: [] }; }
      return send(res, 200, {
        location: { name: place, county, latitude, longitude, timezone: forecast.timezone || 'Africa/Nairobi' },
        forecast: { current: forecast.current, hourly: forecast.hourly, daily: forecast.daily, fetchedAt: new Date().toISOString(), source: 'Open-Meteo · forecast model blend', sourceUrl: 'https://open-meteo.com/en/docs' },
        warnings
      });
    } catch (error) { return send(res, 502, { error: `Forecast is unavailable: ${error.message}` }); }
  }
  if (url.pathname === '/api/health') return send(res, 200, { status: 'ok', service: 'MvuaTracker API', time: new Date().toISOString(), moderationConfigured: Boolean(process.env.OPENAI_API_KEY) });
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
  const reports = loadCommunityReports();
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
  if (changed) saveCommunityReports(reports);
}

http.createServer((req, res) => { route(req, res).catch(error => send(res, 500, { error: 'Unexpected server error.' })); })
  .listen(PORT, '0.0.0.0', () => {
    console.log(`MvuaTracker is ready at http://localhost:${PORT}`);
    rescreenPendingComments().catch(() => console.error('Could not re-screen pending comments.'));
  });



