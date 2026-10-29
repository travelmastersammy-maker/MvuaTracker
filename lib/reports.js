const fs = require('node:fs');
const path = require('node:path');

function createCommunityStore({ pool, reportsFile, flagsFile, retentionDays = 30 }) {
  const REPORT_RETENTION_MS = retentionDays * 24 * 60 * 60 * 1000;
  fs.mkdirSync(path.dirname(reportsFile), { recursive: true });
  if (!pool && !fs.existsSync(reportsFile)) fs.writeFileSync(reportsFile, '[]', 'utf8');
  if (!pool && !fs.existsSync(flagsFile)) fs.writeFileSync(flagsFile, '[]', 'utf8');
async function initCommunityStorage() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS community_reports (
      id uuid PRIMARY KEY,
      reporter_key text NOT NULL,
      latitude double precision NOT NULL,
      longitude double precision NOT NULL,
      reported_at timestamptz NOT NULL,
      payload jsonb NOT NULL
    );
    CREATE INDEX IF NOT EXISTS community_reports_geo_time_idx ON community_reports (reported_at DESC);
    CREATE INDEX IF NOT EXISTS community_reports_reporter_idx ON community_reports (reporter_key);
    CREATE TABLE IF NOT EXISTS community_flags (
      id uuid PRIMARY KEY,
      type text NOT NULL,
      target_key text NOT NULL,
      target_report_id uuid NOT NULL REFERENCES community_reports(id) ON DELETE CASCADE,
      actor_key uuid NOT NULL,
      reason text NOT NULL,
      created_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'received',
      UNIQUE (type, target_report_id, actor_key)
    );
  `);
}
async function loadCommunityReports() {
  if (pool) {
    const { rows } = await pool.query('SELECT payload FROM community_reports ORDER BY reported_at DESC LIMIT 5000');
    return rows.map(row => row.payload);
  }
  try { const parsed = JSON.parse(fs.readFileSync(reportsFile, 'utf8')); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}
async function saveCommunityReports(reports) {
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const report of reports.slice(-5000)) {
        await client.query(`INSERT INTO community_reports (id, reporter_key, latitude, longitude, reported_at, payload)
          VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, $6::jsonb)
          ON CONFLICT (id) DO UPDATE SET reporter_key=EXCLUDED.reporter_key, latitude=EXCLUDED.latitude,
            longitude=EXCLUDED.longitude, reported_at=EXCLUDED.reported_at, payload=EXCLUDED.payload`,
        [report.id, report.reporterKey || `legacy:${report.id}`, report.latitude, report.longitude, report.reportedAt, JSON.stringify(report)]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return;
  }
  const temp = reportsFile + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(reports.slice(-5000)), 'utf8');
  fs.renameSync(temp, reportsFile);
}
async function loadCommunityFlags() {
  if (pool) {
    const { rows } = await pool.query('SELECT id, type, target_key AS "targetKey", target_report_id AS "targetReportId", actor_key AS "actorKey", reason, created_at AS "createdAt", status FROM community_flags ORDER BY created_at DESC LIMIT 20000');
    return rows;
  }
  try { const parsed = JSON.parse(fs.readFileSync(flagsFile, 'utf8')); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
async function saveCommunityFlags(flags) {
  if (pool) {
    const recent = flags.slice(-20000);
    for (const flag of recent) await pool.query(`INSERT INTO community_flags (id, type, target_key, target_report_id, actor_key, reason, created_at, status)
      VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6, $7::timestamptz, $8)
      ON CONFLICT (type, target_report_id, actor_key) DO NOTHING`,
    [flag.id, flag.type, flag.targetKey, flag.targetReportId, flag.actorKey, flag.reason, flag.createdAt, flag.status || 'received']);
    return;
  }
  const temp = flagsFile + '.tmp'; fs.writeFileSync(temp, JSON.stringify(flags.slice(-20000)), 'utf8'); fs.renameSync(temp, flagsFile);
}
async function purgeExpiredCommunityData(now = Date.now()) {
  const cutoff = new Date(now - REPORT_RETENTION_MS);
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const expiredFlags = await client.query('DELETE FROM community_flags WHERE created_at < $1 RETURNING id', [cutoff]);
      const expiredReports = await client.query('DELETE FROM community_reports WHERE reported_at < $1 RETURNING id', [cutoff]);
      await client.query('COMMIT');
      return { reports: expiredReports.rowCount, flags: expiredFlags.rowCount };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const reports = await loadCommunityReports();
  const retainedReports = reports.filter(report => Number.isFinite(Date.parse(report.reportedAt)) && Date.parse(report.reportedAt) >= cutoff.getTime());
  const retainedIds = new Set(retainedReports.map(report => report.id));
  const flags = await loadCommunityFlags();
  const retainedFlags = flags.filter(flag => Number.isFinite(Date.parse(flag.createdAt)) && Date.parse(flag.createdAt) >= cutoff.getTime() && retainedIds.has(flag.targetReportId));
  const deleted = { reports: reports.length - retainedReports.length, flags: flags.length - retainedFlags.length };
  if (deleted.reports) await saveCommunityReports(retainedReports);
  if (deleted.flags) await saveCommunityFlags(retainedFlags);
  return deleted;
}

  return { initCommunityStorage, loadCommunityReports, saveCommunityReports, loadCommunityFlags, saveCommunityFlags, purgeExpiredCommunityData };
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
function validReportDate(date, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const selected = Date.parse(`${date}T12:00:00+03:00`), today = Date.parse(`${kenyaDateString(now)}T12:00:00+03:00`);
  return Number.isFinite(selected) && selected <= today && selected >= today - 7 * 24 * 60 * 60 * 1000;
}


function validateCommunityReport(body, { termsVersion, now = new Date() } = {}) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const issues = [];
  const issue = (field, code, message) => issues.push({ field, code, message });
  const reporterKey = String(input.reporterKey || '');
  if (!/^[a-f0-9-]{36}$/i.test(reporterKey)) issue('reporterKey', 'invalid_reporter_key', 'A valid installation reporter key is required.');
  if (input.termsVersion !== termsVersion) issue('termsVersion', 'terms_required', 'Please review and accept the current Community Guidelines before posting.');
  const latitude = Number(input.latitude), longitude = Number(input.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -5.5 || latitude > 5.5 || longitude < 33.5 || longitude > 42.5) issue('location', 'invalid_location', 'Select a location in Kenya from the search results.');
  if (!String(input.place || '').trim() || !validReportDate(String(input.date || ''), now)) issue('date', 'invalid_date_or_place', 'Choose a Kenyan location and a date within the last seven days.');
  const startTime = String(input.startTime || ''), endTime = String(input.endTime || '');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || startTime >= endTime) issue('timeRange', 'invalid_time_range', 'Choose a valid same-day time range, with the end after the start.');
  if (!new Set(['No rain', 'Drizzle', 'Slight shower', 'Medium rain', 'Heavy rain', 'Storm / thunderstorm']).has(String(input.severity || ''))) issue('severity', 'invalid_severity', 'Choose a rainfall severity.');
  if (String(input.comment || '').trim().length > 280) issue('comment', 'comment_too_long', 'Comments must be 280 characters or fewer.');
  const date = String(input.date || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
    const observedEnd = new Date(date + 'T' + endTime + ':00+03:00');
    if (Number.isFinite(observedEnd.getTime()) && observedEnd > now) issue('timeRange', 'future_observation', 'The report period cannot end in the future.');
  }
  return issues;
}

function filterCommunityReports(reports, latitude, longitude, { now = Date.now(), maxAgeMs = 24 * 60 * 60 * 1000, radiusKm = 30 } = {}) {
  const cutoff = now - maxAgeMs;
  return reports.map(report => {
    const publicReport = { ...report };
    delete publicReport.heldComment;
    delete publicReport.moderation;
    return { ...publicReport, reporterKey: report.reporterKey || ('legacy:' + report.id), distanceKm: distanceKm(latitude, longitude, report.latitude, report.longitude) };
  }).filter(report => !report.hidden && report.distanceKm <= radiusKm && Date.parse(report.observedEnd) >= cutoff && Date.parse(report.observedEnd) <= now)
    .sort((a, b) => Date.parse(b.reportedAt) - Date.parse(a.reportedAt)).slice(0, 20);
}

module.exports = { createCommunityStore, kenyaDateString, distanceKm, validReportDate, validateCommunityReport, filterCommunityReports };
