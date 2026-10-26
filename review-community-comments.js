const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const file = path.join(__dirname, 'data', 'community-reports.json');
const reports = JSON.parse(fs.readFileSync(file, 'utf8'));
const pending = reports.filter(report => report.commentStatus === 'pending' && report.heldComment);
if (!pending.length) { console.log('No comments are awaiting review.'); process.exit(0); }
const rl = readline.createInterface({ input: stdin, output: stdout });
try {
  for (const report of pending) {
    console.log(`\n${report.place}${report.county ? ', ' + report.county : ''} · ${report.severity} · ${report.date} ${report.startTime}–${report.endTime}`);
    console.log(`Reason: ${report.moderation?.reason || 'review required'}`);
    console.log(report.heldComment);
    const choice = (await rl.question('[a] approve comment, [r] reject comment, [s] skip, [q] quit: ')).trim().toLowerCase();
    if (choice === 'q') break;
    if (choice === 'a') {
      report.comment = report.heldComment;
      report.commentStatus = 'approved';
      report.moderation = { status: 'approved_by_reviewer', reviewedAt: new Date().toISOString() };
      delete report.heldComment;
    } else if (choice === 'r') {
      report.comment = '';
      report.commentStatus = 'rejected';
      report.moderation = { status: 'rejected_by_reviewer', reviewedAt: new Date().toISOString() };
      delete report.heldComment;
    } else if (choice === 's') {
      continue;
    } else {
      console.log('No change; enter a, r, s, or q next time.');
    }
  }
  const temp = file + '.review.tmp';
  fs.writeFileSync(temp, JSON.stringify(reports.slice(-5000)), 'utf8');
  fs.renameSync(temp, file);
} finally { rl.close(); }
