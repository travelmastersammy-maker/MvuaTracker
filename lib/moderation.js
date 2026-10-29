const fs = require('node:fs');
function createModerator({ blocklistFile, fetchImpl = globalThis.fetch, apiKey = () => process.env.OPENAI_API_KEY } = {}) {
  const MODERATION_BLOCKLIST_FILE = blocklistFile;
  const fetch = fetchImpl;
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
  const configuredApiKey = apiKey();
  if (!configuredApiKey) return { status: 'pending', reason: 'moderation_not_configured', categories: [], checkedAt: new Date().toISOString() };
  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { authorization: `Bearer ${configuredApiKey}`, 'content-type': 'application/json' },
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


  return { normalizeModerationText, localCommentFlags, moderateComment };
}

module.exports = { createModerator };
