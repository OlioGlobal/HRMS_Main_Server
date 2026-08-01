/**
 * Refresh notification email/in-app templates for EXISTING companies.
 *
 * The seeder only runs on new signups, so companies created before the email redesign
 * keep the old templates. This script re-applies the current default templates and the
 * new `consolidateEmail` config to every company's system rules — WITHOUT touching each
 * rule's isEnabled / channels / recipients / runTime (a company's own settings).
 *
 * Usage (from backend/):
 *   node scripts/updateNotificationTemplates.js --dry        # preview, no writes
 *   node scripts/updateNotificationTemplates.js              # apply
 *   DOTENV_CONFIG_PATH=.env.production node -r dotenv/config scripts/updateNotificationTemplates.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const Company          = require('../src/models/Company');
const NotificationRule = require('../src/models/NotificationRule');
const { DEFAULT_RULES } = require('../src/seeders/notificationRules.seeder');

const DRY = process.argv.includes('--dry');
const mask = (uri = '') => uri.replace(/\/\/([^:]+):[^@]+@/, '//$1:****@');

const defaultsBySlug = new Map(DEFAULT_RULES.map((r) => [r.slug, r]));

(async () => {
  console.log(`Mongo URI:  ${mask(process.env.MONGO_URI || '(unset!)')}`);
  console.log(`Mode:       ${DRY ? 'DRY RUN (no writes)' : 'APPLY'}`);
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME || 'hrms' });
  console.log(`Mongo:      connected, db=${mongoose.connection.name}\n`);

  const companies = await Company.find({}).select('name').sort({ name: 1 }).lean();
  let totalUpdated = 0;

  for (const co of companies) {
    const rules = await NotificationRule.find({ company_id: co._id }).lean();
    let updated = 0;

    for (const rule of rules) {
      const def = defaultsBySlug.get(rule.slug);
      if (!def) continue; // custom / unknown rule — leave untouched

      const set = {
        'templates.email.subject': def.templates.email.subject,
        'templates.email.body':    def.templates.email.body,
        'templates.inApp.title':   def.templates.inApp.title,
        'templates.inApp.body':    def.templates.inApp.body,
      };

      // Only seed consolidateEmail when the company hasn't chosen a value yet —
      // never override an admin's explicit toggle.
      if (rule.config?.consolidateEmail === undefined && def.config?.consolidateEmail !== undefined) {
        set['config.consolidateEmail'] = def.config.consolidateEmail;
      }

      if (!DRY) {
        await NotificationRule.updateOne({ _id: rule._id }, { $set: set });
      }
      updated++;
    }

    totalUpdated += updated;
    console.log(`  ${(co.name || co._id).toString().padEnd(30)} ${updated} rule(s) ${DRY ? 'would be' : ''} updated`);
  }

  console.log(`\n${DRY ? 'Would update' : 'Updated'} ${totalUpdated} rule(s) across ${companies.length} company(ies).`);
  if (DRY) console.log('Re-run without --dry to apply.');

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
