/**
 * One-time migration script — encrypts existing plain-text salary and bank details in MongoDB.
 *
 * Run AFTER deploying all service-layer encryption changes and verifying they work with new records.
 * Take a MongoDB backup before running on production.
 *
 * Usage:
 *   node backend/src/scripts/encryptExistingData.js
 *
 * Safe to re-run — already-encrypted values are detected and skipped.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');

// ─── Validate key before doing anything ──────────────────────────────────────
const encKey = process.env.ENCRYPTION_KEY;
if (!encKey || !/^[0-9a-fA-F]{64}$/.test(encKey)) {
  console.error('❌ ENCRYPTION_KEY missing or invalid. Set it in backend/.env before running.');
  process.exit(1);
}

const {
  encrypt,
  isEncrypted,
  encryptBankDetails,
  PAYROLL_NUMERIC_FIELDS,
} = require('../utils/encryption');

// ─── Minimal schemas (avoid loading the full app / seeders) ──────────────────

const salarySnapshotComponentSchema = new mongoose.Schema(
  { component_id: mongoose.Schema.Types.ObjectId, name: String, type: String, calcType: String, value: Number, monthlyAmount: mongoose.Schema.Types.Mixed },
  { _id: false }
);

const EmployeeSalary = mongoose.models.EmployeeSalary || mongoose.model('EmployeeSalary', new mongoose.Schema({
  ctcMonthly:  mongoose.Schema.Types.Mixed,
  ctcAnnual:   mongoose.Schema.Types.Mixed,
  components:  { type: [salarySnapshotComponentSchema], default: [] },
}, { strict: false }));

const componentLineSchema = new mongoose.Schema(
  { component_id: mongoose.Schema.Types.ObjectId, name: String, calcType: String, value: Number, amount: mongoose.Schema.Types.Mixed },
  { _id: false }
);

const PayrollRecord = mongoose.models.PayrollRecord || mongoose.model('PayrollRecord', new mongoose.Schema({
  ctcMonthly:             mongoose.Schema.Types.Mixed,
  grossEarnings:          mongoose.Schema.Types.Mixed,
  netPay:                 mongoose.Schema.Types.Mixed,
  totalDeductions:        mongoose.Schema.Types.Mixed,
  overtimeAmount:         mongoose.Schema.Types.Mixed,
  reimbursementTotal:     mongoose.Schema.Types.Mixed,
  perDaySalary:           mongoose.Schema.Types.Mixed,
  perHourSalary:          mongoose.Schema.Types.Mixed,
  lwpDeductionAmount:     mongoose.Schema.Types.Mixed,
  absentDeductionAmount:  mongoose.Schema.Types.Mixed,
  halfDayDeductionAmount: mongoose.Schema.Types.Mixed,
  lateDeductionAmount:    mongoose.Schema.Types.Mixed,
  earnings:   { type: [componentLineSchema], default: [] },
  deductions: { type: [componentLineSchema], default: [] },
}, { strict: false }));

const Employee = mongoose.models.Employee || mongoose.model('Employee', new mongoose.Schema({
  bankDetails: {
    bankName:      String,
    accountNumber: mongoose.Schema.Types.Mixed,
    ifscCode:      mongoose.Schema.Types.Mixed,
    accountType:   String,
  },
}, { strict: false }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const encryptIfPlain = (value) => {
  if (value == null) return { value, changed: false };
  if (isEncrypted(value)) return { value, changed: false };
  return { value: encrypt(value), changed: true };
};

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

// ─── Migrate EmployeeSalary ───────────────────────────────────────────────────

async function migrateEmployeeSalary() {
  log('── EmployeeSalary: starting...');
  const cursor = EmployeeSalary.find({}).lean().cursor();

  let processed = 0, skipped = 0, failed = 0;

  for await (const doc of cursor) {
    try {
      const update = {};

      const ctcM = encryptIfPlain(doc.ctcMonthly);
      const ctcA = encryptIfPlain(doc.ctcAnnual);
      if (ctcM.changed) update.ctcMonthly = ctcM.value;
      if (ctcA.changed) update.ctcAnnual  = ctcA.value;

      let componentsChanged = false;
      const encComponents = (doc.components || []).map((c) => {
        const r = encryptIfPlain(c.monthlyAmount);
        if (r.changed) componentsChanged = true;
        return { ...c, monthlyAmount: r.value };
      });
      if (componentsChanged) update.components = encComponents;

      if (Object.keys(update).length === 0) { skipped++; continue; }

      await EmployeeSalary.updateOne({ _id: doc._id }, { $set: update });
      processed++;
    } catch (err) {
      failed++;
      console.error(`  ❌ EmployeeSalary ${doc._id}: ${err.message}`);
    }
  }

  log(`── EmployeeSalary done: ${processed} encrypted, ${skipped} skipped, ${failed} failed`);
}

// ─── Migrate PayrollRecord ────────────────────────────────────────────────────

async function migratePayrollRecord() {
  log('── PayrollRecord: starting...');
  const cursor = PayrollRecord.find({}).lean().cursor();

  let processed = 0, skipped = 0, failed = 0;

  for await (const doc of cursor) {
    try {
      const update = {};

      for (const field of PAYROLL_NUMERIC_FIELDS) {
        const r = encryptIfPlain(doc[field]);
        if (r.changed) update[field] = r.value;
      }

      let earningsChanged = false;
      const encEarnings = (doc.earnings || []).map((e) => {
        const r = encryptIfPlain(e.amount);
        if (r.changed) earningsChanged = true;
        return { ...e, amount: r.value };
      });
      if (earningsChanged) update.earnings = encEarnings;

      let deductionsChanged = false;
      const encDeductions = (doc.deductions || []).map((d) => {
        const r = encryptIfPlain(d.amount);
        if (r.changed) deductionsChanged = true;
        return { ...d, amount: r.value };
      });
      if (deductionsChanged) update.deductions = encDeductions;

      if (Object.keys(update).length === 0) { skipped++; continue; }

      await PayrollRecord.updateOne({ _id: doc._id }, { $set: update });
      processed++;
    } catch (err) {
      failed++;
      console.error(`  ❌ PayrollRecord ${doc._id}: ${err.message}`);
    }
  }

  log(`── PayrollRecord done: ${processed} encrypted, ${skipped} skipped, ${failed} failed`);
}

// ─── Migrate Employee bankDetails ─────────────────────────────────────────────

async function migrateEmployeeBankDetails() {
  log('── Employee bankDetails: starting...');
  const cursor = Employee.find({
    $or: [
      { 'bankDetails.accountNumber': { $ne: null } },
      { 'bankDetails.ifscCode': { $ne: null } },
    ],
  }).lean().cursor();

  let processed = 0, skipped = 0, failed = 0;

  for await (const doc of cursor) {
    try {
      const bd = doc.bankDetails;
      if (!bd) { skipped++; continue; }

      const accR  = encryptIfPlain(bd.accountNumber);
      const ifscR = encryptIfPlain(bd.ifscCode);

      if (!accR.changed && !ifscR.changed) { skipped++; continue; }

      await Employee.updateOne(
        { _id: doc._id },
        {
          $set: {
            'bankDetails.accountNumber': accR.value,
            'bankDetails.ifscCode':      ifscR.value,
          },
        }
      );
      processed++;
    } catch (err) {
      failed++;
      console.error(`  ❌ Employee ${doc._id}: ${err.message}`);
    }
  }

  log(`── Employee bankDetails done: ${processed} encrypted, ${skipped} skipped, ${failed} failed`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('=== Encryption migration starting ===');
  log('Connecting to MongoDB...');

  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.DB_NAME || 'hrms',
  });
  log('Connected.');

  await migrateEmployeeSalary();
  await migratePayrollRecord();
  await migrateEmployeeBankDetails();

  log('=== Migration complete ===');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
