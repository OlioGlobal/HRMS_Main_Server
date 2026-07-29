/**
 * PROD migration: bring existing letter templates in line with the new dynamic
 * variables. Idempotent, guarded, and safe to re-run.
 *
 *   Dry run (default — shows what WOULD change, writes nothing):
 *     MONGO_URI="<prod-uri>" node scripts/prodLetterTemplateMigration.js
 *
 *   Apply for real:
 *     MONGO_URI="<prod-uri>" node scripts/prodLetterTemplateMigration.js --apply
 *
 * What it changes on the `lettertemplates` collection (all companies):
 *   1. content: {{manual.probationMonths}}          -> {{employee.probationPeriod}}
 *   2. content: hardcoded "Mr. Suraj Shinde ... | suraj@olioglobaladtech.com"
 *                                                   -> {{employee.reportingManagerLine}}
 *   3. content: (AL – 15 days, CL – 6 days, SL – 7 days.) -> ({{leave.breakdown}})
 *   4. content: {{leave.annualLeaves}}              -> {{leave.totalEarned}}
 *   5. remove manualVariables entry { key: 'probationMonths' }
 *
 * NOTE: prod templates may have been edited per company, so the exact hardcoded
 * reporting-manager text may differ. Where the exact string isn't found but a
 * hardcoded "Reporting Manager" block still exists, the script LOGS a warning for
 * manual review instead of guessing.
 */
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const URI   = process.env.MONGO_URI;

const OLD_MANAGER_LINE = 'Mr. Suraj Shinde – Operations Head &amp; SEO Manager | suraj@olioglobaladtech.com';
const OLD_BREAKDOWN     = '(AL – 15 days, CL – 6 days, SL – 7 days.)';

const replaceAll = (s, find, repl) => s.split(find).join(repl);

(async () => {
  if (!URI) { console.error('Set MONGO_URI to the prod connection string.'); process.exit(1); }
  console.log(`\n=== Letter template migration (${APPLY ? 'APPLY' : 'DRY RUN'}) ===\n`);

  await mongoose.connect(URI);
  const C = mongoose.connection.collection('lettertemplates');

  const templates = await C.find({}).toArray();
  let changed = 0, skipped = 0, warnings = 0;

  for (const t of templates) {
    const id = t._id;
    const name = t.name || '(unnamed)';
    let content = t.content || '';
    const before = content;
    const notes = [];

    // 1. probation variable
    if (content.includes('{{manual.probationMonths}}')) {
      content = replaceAll(content, '{{manual.probationMonths}}', '{{employee.probationPeriod}}');
      notes.push('probation var');
    }

    // 2. reporting manager line
    if (content.includes(OLD_MANAGER_LINE)) {
      content = replaceAll(content, OLD_MANAGER_LINE, '{{employee.reportingManagerLine}}');
      notes.push('manager line');
    } else if (/Suraj Shinde/.test(content) && !content.includes('{{employee.reportingManagerLine}}')) {
      // A hardcoded manager reference exists but not the exact string we expected.
      console.warn(`  ⚠  "${name}" (${id}): hardcoded manager text differs — review manually.`);
      warnings++;
    }

    // 3. leave breakdown line
    if (content.includes(OLD_BREAKDOWN)) {
      content = replaceAll(content, OLD_BREAKDOWN, '({{leave.breakdown}})');
      notes.push('leave breakdown');
    } else if (/\(AL\s*[–-]\s*\d+\s*days/.test(content)) {
      console.warn(`  ⚠  "${name}" (${id}): hardcoded leave breakdown differs — review manually.`);
      warnings++;
    }

    // 4. total earned leaves variable
    if (content.includes('{{leave.annualLeaves}}')) {
      content = replaceAll(content, '{{leave.annualLeaves}}', '{{leave.totalEarned}}');
      notes.push('leave.totalEarned');
    }

    const contentChanged = content !== before;

    // 5. drop the obsolete manual variable
    const hasProbationVar = Array.isArray(t.manualVariables) && t.manualVariables.some(v => v && v.key === 'probationMonths');

    if (!contentChanged && !hasProbationVar) { skipped++; continue; }

    console.log(`  ✓ "${name}" (${id}) — ${[...notes, hasProbationVar ? 'drop probationMonths var' : null].filter(Boolean).join(', ')}`);
    changed++;

    if (APPLY) {
      const update = {};
      if (contentChanged) update.$set = { content };
      if (hasProbationVar) update.$pull = { manualVariables: { key: 'probationMonths' } };
      await C.updateOne({ _id: id }, update);
    }
  }

  console.log(`\n${APPLY ? 'Applied to' : 'Would change'}: ${changed} | unchanged: ${skipped} | manual-review warnings: ${warnings}`);
  if (!APPLY) console.log('\nRe-run with --apply to write these changes.');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
