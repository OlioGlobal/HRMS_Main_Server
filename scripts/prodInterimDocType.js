/**
 * PROD migration: add the "Interim Offer Letter" document type to every company
 * that doesn't already have it. Idempotent (skips existing via unique slug).
 *
 *   Dry run:  MONGO_URI="<prod-uri>" node scripts/prodInterimDocType.js
 *   Apply:    MONGO_URI="<prod-uri>" node scripts/prodInterimDocType.js --apply
 */
const mongoose = require('mongoose');
const DocumentType = require('../src/models/DocumentType');
const slugify = require('../src/utils/slugify');

const APPLY = process.argv.includes('--apply');
const URI   = process.env.MONGO_URI;

(async () => {
  if (!URI) { console.error('Set MONGO_URI.'); process.exit(1); }
  console.log(`\n=== Interim Offer Letter doc type (${APPLY ? 'APPLY' : 'DRY RUN'}) ===\n`);

  await mongoose.connect(URI);
  const companies = await mongoose.connection.collection('companies').find({}, { projection: { _id: 1, name: 1 } }).toArray();
  const slug = slugify('Interim Offer Letter');

  let created = 0, skipped = 0;
  for (const c of companies) {
    const exists = await DocumentType.findOne({ company_id: c._id, slug });
    if (exists) { skipped++; continue; }
    console.log(`  ${APPLY ? '+' : '(would add)'} ${c.name}`);
    created++;
    if (APPLY) {
      await DocumentType.create({
        company_id: c._id, name: 'Interim Offer Letter', slug,
        category: 'company_issued', whoUploads: 'hr', isRequired: false,
        allowedFormats: ['pdf'], maxFileSizeMB: 10, isActive: true,
        expiryTracking: false, expiryAlertDays: 30,
      });
    }
  }

  console.log(`\n${APPLY ? 'created' : 'would create'}: ${created} | skipped (already have it): ${skipped} | companies: ${companies.length}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
