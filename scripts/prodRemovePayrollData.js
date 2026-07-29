/**
 * PROD cleanup: remove ALL payroll data (payroll runs + per-employee records).
 * Use to clear test/draft payroll. Destructive — dry-run by default.
 *
 *   Dry run:  MONGO_URI="<prod-uri>" node scripts/prodRemovePayrollData.js
 *   Apply:    MONGO_URI="<prod-uri>" node scripts/prodRemovePayrollData.js --apply
 */
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const URI   = process.env.MONGO_URI;

(async () => {
  if (!URI) { console.error('Set MONGO_URI.'); process.exit(1); }
  console.log(`\n=== Remove payroll data (${APPLY ? 'APPLY' : 'DRY RUN'}) ===\n`);

  await mongoose.connect(URI);
  const Runs    = mongoose.connection.collection('payrollruns');
  const Records = mongoose.connection.collection('payrollrecords');

  const runs    = await Runs.find({}, { projection: { month: 1, year: 1, status: 1 } }).toArray();
  const recCount = await Records.countDocuments({});

  console.log(`payroll runs:    ${runs.length}`);
  runs.forEach(r => console.log(`   - ${r.month}/${r.year} — status ${r.status} (${r._id})`));
  console.log(`payroll records: ${recCount}`);

  if (APPLY) {
    const dr = await Runs.deleteMany({});
    const drec = await Records.deleteMany({});
    console.log(`\nDeleted → runs: ${dr.deletedCount} | records: ${drec.deletedCount}`);
  } else {
    console.log('\nRe-run with --apply to delete the above.');
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
