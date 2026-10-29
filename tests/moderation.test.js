const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createModerator } = require('../lib/moderation');

test('local moderation flags configured phrases and personal contact details', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mvua-moderation-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'blocklist.txt');
  fs.writeFileSync(file, 'insult phrase');
  const moderator = createModerator({ blocklistFile: file, apiKey: () => '' });
  assert.ok(moderator.localCommentFlags('That INSULT phrase is awful').includes('blocklisted_term'));
  assert.ok(moderator.localCommentFlags('Contact me name@example.com').includes('possible_personal_contact'));
  assert.ok(moderator.localCommentFlags('See https://example.com').includes('external_link'));
});

test('comments remain pending when automated moderation is not configured', async () => {
  const moderator = createModerator({ blocklistFile: path.join(os.tmpdir(), 'mvua-empty-list-does-not-exist'), apiKey: () => '' });
  assert.equal((await moderator.moderateComment('It rained for ten minutes.')).status, 'pending');
});
