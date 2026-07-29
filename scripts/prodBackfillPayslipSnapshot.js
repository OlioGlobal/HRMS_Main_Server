/**
 * PROD backfill: freeze the payslip config onto EXISTING payroll runs that were
 * created before the snapshot feature. New runs snapshot automatically; this
 * captures the company's current settings.payslip onto older runs so that a later
 * config edit can't re-style already-issued payslips.
 *
 * Snapshot = the company's CURRENT payslip config (the historical config at the
 * exact time each run was processed isn't recoverable — freezing at "now" is the
 * safe, correct one-time fix).
 *
 *   Dry run:  MONGO_URI="<prod-uri>" node scripts/prodBackfillPayslipSnapshot.js
 *   Apply:    MONGO_URI="<prod-uri>" node scripts/prodBackfillPayslipSnapshot.js --apply
 */
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const URI   = process.env.MONGO_URI;

(async () => {
  if (!URI) { console.error('Set MONGO_URI.'); process.exit(1); }
  console.log(`\n=== Backfill payslipConfigSnapshot on existing runs (${APPLY ? 'APPLY' : 'DRY RUN'}) ===\n`);

  await mongoose.connect(URI);
  const Runs      = mongoose.connection.collection('payrollruns');
  const Companies = mongoose.connection.collection('companies');

  // Cache each company's current payslip config
  const cfgByCompany = new Map();
  const cfgFor = async (companyId) => {
    const key = companyId.toString();
    if (!cfgByCompany.has(key)) {
      const c = await Companies.findOne({ _id: companyId }, { projection: { 'settings.payslip': 1 } });
      cfgByCompany.set(key, (c && c.settings && c.settings.payslip) || null);
    }
    return cfgByCompany.get(key);
  };

  const runs = await Runs.find({ $or: [{ payslipConfigSnapshot: { $exists: false } }, { payslipConfigSnapshot: null }] }).toArray();
  const total = await Runs.countDocuments({});
  console.log(`Total payroll runs: ${total} | missing snapshot: ${runs.length}\n`);

  let filled = 0, noCfg = 0;
  for (const r of runs) {
    const cfg = await cfgFor(r.company_id);
    if (!cfg) { noCfg++; continue; } // company never configured a payslip → nothing to freeze (defaults apply)
    console.log(`  ${APPLY ? '✓' : '(would set)'} run ${r._id} — ${r.month}/${r.year} — status ${r.status}`);
    filled++;
    if (APPLY) await Runs.updateOne({ _id: r._id }, { $set: { payslipConfigSnapshot: cfg } });
  }

  console.log(`\n${APPLY ? 'snapshotted' : 'would snapshot'}: ${filled} | runs with no company config (left as default): ${noCfg}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
