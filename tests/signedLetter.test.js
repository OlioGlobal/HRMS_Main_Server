
// Integration tests for the offer sign → upload → HR review → move-forward flow.
// Runs against a local MongoDB; if none is reachable the DB tests self-skip.
const test     = require('node:test');
const assert   = require('node:assert');
const mongoose = require('mongoose');

// Dummy encryption key so requiring services that touch encryption never throws
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);

// ── Stub B2 so uploads/presign don't hit the network ──
// Services use `const r2 = require('utils/r2')` (namespace), so mutating the
// shared module object is seen by them.
const r2 = require('../src/utils/r2');
r2.uploadToB2    = async (key) => key;
r2.getDownloadUrl = async (key) => `https://signed.example/${key}`;

const Company         = require('../src/models/Company');
const Employee        = require('../src/models/Employee');
const GeneratedLetter = require('../src/models/GeneratedLetter');
const preboardingSvc  = require('../src/services/preboarding/preboarding.service');
const lettersSvc      = require('../src/services/letters/generatedLetter.service');
const candidatesSvc   = require('../src/services/hiring/candidates.service');
const { closeBrowser } = require('../src/utils/pdf');

const TOKEN  = `test-token-${Date.now()}`;
const USER_ID = new mongoose.Types.ObjectId();

let connected = false;
let company, employee, letter;

const makeFile = () => ({
  originalname: 'signed-offer.pdf',
  buffer:       Buffer.from('%PDF-1.4 fake signed content'),
  size:         1024,
  mimetype:     'application/pdf',
});

test.before(async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/hrms_signed_test', { serverSelectionTimeoutMS: 3000 });
    connected = true;

    company = await Company.create({
      name:  'Signed Test Co',
      slug:  `signed-test-${Date.now()}`,
      email: `signed-${Date.now()}@test.dev`,
    });

    employee = await Employee.create({
      company_id:             company._id,
      firstName:              'Riya',
      lastName:               'Sharma',
      personalEmail:          'riya@example.com',
      status:                 'pre_join',
      designation_id:         new mongoose.Types.ObjectId(),
      department_id:          new mongoose.Types.ObjectId(),
      joiningDate:            new Date(),
      preBoardingToken:       TOKEN,
      preBoardingTokenExpiry: new Date(Date.now() + 86400000),
    });

    letter = await GeneratedLetter.create({
      company_id:         company._id,
      employee_id:        employee._id,
      letterType:         'offer_letter',
      resolvedContent:    '<html><body>Offer</body></html>',
      requiresAcceptance: true,
      status:             'sent',
    });
  } catch (e) {
    console.warn('[signedLetter.test] MongoDB unavailable — skipping DB tests:', e.message);
  }
});

test.after(async () => {
  if (connected) {
    if (company)  await Company.deleteOne({ _id: company._id });
    if (employee) await Employee.deleteOne({ _id: employee._id });
    await GeneratedLetter.deleteMany({ company_id: company?._id });
    await mongoose.disconnect();
  }
  await closeBrowser();
});

test('candidate uploads a signed copy → status becomes signed_uploaded', async (t) => {
  if (!connected) return t.skip('no MongoDB');

  const result = await preboardingSvc.uploadSignedLetter(TOKEN, letter._id, makeFile());

  assert.strictEqual(result.status, 'signed_uploaded');
  assert.ok(result.signedFileKey, 'signedFileKey should be set');
  assert.strictEqual(result.signedFileName, 'signed-offer.pdf');
  assert.ok(result.signedUploadedAt, 'signedUploadedAt should be set');
});

test('activation is blocked while the offer is only signed_uploaded (pending review)', async (t) => {
  if (!connected) return t.skip('no MongoDB');

  await assert.rejects(
    () => candidatesSvc.activate(company._id, employee._id, {}),
    /pending HR review/i,
    'should block activation until HR confirms',
  );
});

test('HR approves the signed copy → accepted + candidate advances to offered', async (t) => {
  if (!connected) return t.skip('no MongoDB');

  const reviewed = await lettersSvc.reviewSignedLetter(company._id, letter._id, USER_ID, { action: 'approve' });
  assert.strictEqual(reviewed.status, 'accepted');
  assert.ok(reviewed.reviewedAt, 'reviewedAt should be set');

  const emp = await Employee.findById(employee._id).lean();
  assert.strictEqual(emp.status, 'offered', 'pre_join candidate should move to offered');
});

test('HR reject sends it back to sent with a review note + refreshed token', async (t) => {
  if (!connected) return t.skip('no MongoDB');

  // Put the letter back into review state
  await GeneratedLetter.updateOne({ _id: letter._id }, { $set: { status: 'signed_uploaded' } });

  const reviewed = await lettersSvc.reviewSignedLetter(company._id, letter._id, USER_ID, {
    action: 'reject',
    note:   'Signature missing on page 2',
  });

  assert.strictEqual(reviewed.status, 'sent');
  assert.match(reviewed.reviewNote, /page 2/);

  const emp = await Employee.findById(employee._id).lean();
  assert.notStrictEqual(emp.preBoardingToken, TOKEN, 'token should be refreshed on reject');
});

test('reviewing a letter that is not pending review is rejected', async (t) => {
  if (!connected) return t.skip('no MongoDB');

  // Currently status is 'sent' (from previous reject), not signed_uploaded
  await assert.rejects(
    () => lettersSvc.reviewSignedLetter(company._id, letter._id, USER_ID, { action: 'approve' }),
    /No signed copy is pending review/i,
  );
});

test('invalid review action is rejected', async (t) => {
  if (!connected) return t.skip('no MongoDB');

  await assert.rejects(
    () => lettersSvc.reviewSignedLetter(company._id, letter._id, USER_ID, { action: 'bogus' }),
    /approve.*reject/i,
  );
});
