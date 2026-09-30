/**
 * Reimbursement receipt visibility on the APPROVER side.
 *
 * Regression guard for the bug where an employee-submitted receipt was invisible
 * to the approver: listPendingApprovals' aggregation $project dropped
 * `receiptFileKey`, and the approvals UI only renders the "Download Receipt"
 * button when `claim.receiptFileKey` is present. So the button never showed.
 *
 * This test creates a submitted claim WITH a receipt and asserts the approver's
 * list endpoint returns `receiptFileKey` (and `receiptFileName`).
 *
 * Real service + local MongoDB. Self-skips if no DB is reachable.
 */
const test     = require('node:test');
const assert   = require('node:assert');
const mongoose = require('mongoose');

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);

const Company       = require('../src/models/Company');
const Employee      = require('../src/models/Employee');
const ExpenseCategory = require('../src/models/ExpenseCategory');
const Reimbursement = require('../src/models/Reimbursement');
const service       = require('../src/services/reimbursement/reimbursement.service');

let connected = false;
let co, submitter, approver, cat;

const APPROVER_USER_ID = new mongoose.Types.ObjectId();

// Prefer a local Mongo; fall back to the configured Atlas URI (into an isolated
// throwaway DB name so real data is never touched). The whole DB is dropped in
// test.after.
const TEST_DB_NAME = 'hrms_reimb_test';
const resolveTestUri = () => {
  const base = process.env.MONGO_URI;
  if (!base) return `mongodb://127.0.0.1:27017/${TEST_DB_NAME}`;
  // Insert/replace the db-name path segment before any query string.
  const [head, query] = base.split('?');
  const withDb = head.replace(/\/[^/]*$/, '/').replace(/\/?$/, '/') + TEST_DB_NAME;
  return query ? `${withDb}?${query}` : withDb;
};

test.before(async () => {
  try {
    require('dotenv').config();
    await mongoose.connect(resolveTestUri(), { serverSelectionTimeoutMS: 8000 });
    connected = true;

    co = await Company.create({
      name: 'RB Co', slug: `rb-${Date.now()}`, email: `rb-${Date.now()}@t.dev`,
      settings: { timezone: 'Asia/Kolkata' },
    });

    // Submitter (the employee raising the claim) and approver (a different
    // employee, linked to a user, who reviews). listPendingApprovals excludes
    // the requester's own claims, so these MUST be distinct people.
    submitter = await Employee.create({ company_id: co._id, firstName: 'Sub', lastName: 'Mitter', gender: 'male', status: 'active' });
    approver  = await Employee.create({ company_id: co._id, firstName: 'App', lastName: 'Rover', gender: 'male', status: 'active', user_id: APPROVER_USER_ID });

    cat = await ExpenseCategory.create({ company_id: co._id, name: 'Travel', requiresReceipt: true });
  } catch (e) {
    console.warn('[reimbursementReceipt.test] MongoDB unavailable — skipped:', e.message);
  }
});

test.after(async () => {
  if (connected) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

const dbTest = (label, fn) => test(label, async (t) => {
  if (!connected) { t.skip('no DB'); return; }
  await Reimbursement.deleteMany({ company_id: co._id });
  await fn();
});

// ─── The fix: approver's list must expose receiptFileKey ──────────────────────
dbTest('approver sees receiptFileKey + receiptFileName for a submitted claim with a receipt', async () => {
  await Reimbursement.create({
    company_id: co._id, employee_id: submitter._id, category_id: cat._id,
    description: 'Cab to client', amount: 1200, expenseDate: new Date(),
    status: 'submitted',
    receiptFileKey:  'companies/x/reimbursements/y/123_receipt.pdf',
    receiptFileName: 'receipt.pdf',
  });

  const { claims } = await service.listPendingApprovals(co._id, APPROVER_USER_ID, 'global', {});

  assert.equal(claims.length, 1, 'approver should see the one submitted claim');
  const c = claims[0];
  assert.ok('receiptFileKey' in c, 'receiptFileKey must be present in the approver response (button gate)');
  assert.equal(c.receiptFileKey, 'companies/x/reimbursements/y/123_receipt.pdf');
  assert.equal(c.receiptFileName, 'receipt.pdf');
});

// ─── A claim with no receipt → key is null/absent, button correctly hidden ────
dbTest('claim without a receipt exposes no receiptFileKey value', async () => {
  await Reimbursement.create({
    company_id: co._id, employee_id: submitter._id, category_id: cat._id,
    description: 'Misc', amount: 300, expenseDate: new Date(),
    status: 'submitted',
  });

  const { claims } = await service.listPendingApprovals(co._id, APPROVER_USER_ID, 'global', {});
  assert.equal(claims.length, 1);
  assert.ok(!claims[0].receiptFileKey, 'no receipt → falsy receiptFileKey (button hidden)');
});
