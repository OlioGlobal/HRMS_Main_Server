/**
 * Create a "Probation Leave" type (probation-only) and assign it to all employees.
 *
 *   DST_URI='<mongodb uri>' [COMPANY_NAME='Olio'] [DAYS=3] node backend/scripts/seedProbationLeave.js
 *
 * - Idempotent: reuses an existing Probation Leave type; only adds balances that are missing.
 * - probationOnly=true  → the leave is usable ONLY during probation and hidden after (needs the
 *   probationOnly code deployed for the UI/apply gating to take effect).
 */
const { MongoClient } = require('mongodb');

const DST_URI = process.env.DST_URI;
if (!DST_URI) { console.error('Set DST_URI'); process.exit(1); }
const COMPANY_NAME = process.env.COMPANY_NAME || null;
const DAYS = Number(process.env.DAYS || 3);

(async () => {
  const c = new MongoClient(DST_URI, { serverSelectionTimeoutMS: 20000, retryWrites: true });
  await c.connect();
  const db = c.db('hrms');

  const company = COMPANY_NAME
    ? await db.collection('companies').findOne({ name: new RegExp(COMPANY_NAME, 'i') })
    : await db.collection('companies').findOne({});
  if (!company) throw new Error('Company not found.');
  const companyId = company._id;
  console.log('Company:', company.name, companyId.toString());

  // ── 1. Find or create the Probation Leave type ──
  let probType = await db.collection('leavetypes').findOne({
    company_id: companyId, $or: [{ code: 'PROB' }, { name: /probation leave/i }],
  });

  if (probType) {
    await db.collection('leavetypes').updateOne({ _id: probType._id },
      { $set: { probationOnly: true, restrictDuringProbation: false, isActive: true, daysPerYear: DAYS, updatedAt: new Date() } });
    console.log('Reusing existing Probation Leave type:', probType._id.toString());
  } else {
    // Clone an existing active leave type so all schema fields/defaults are present
    const template = await db.collection('leavetypes').findOne({ company_id: companyId, isActive: true });
    if (!template) throw new Error('No existing leave type to clone from.');
    const now = new Date();
    const doc = {
      ...template,
      name: 'Probation Leave',
      code: 'PROB',
      type: template.type || 'paid',
      daysPerYear: DAYS,
      isPaid: true,
      probationOnly: true,
      restrictDuringProbation: false,
      restrictDuringNotice: false,
      carryForward: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    delete doc._id;
    const res = await db.collection('leavetypes').insertOne(doc);
    probType = { _id: res.insertedId, ...doc };
    console.log('Created Probation Leave type:', res.insertedId.toString());
  }

  // ── 2. Determine the leave year in use ──
  const yearAgg = await db.collection('leavebalances').aggregate([
    { $match: { company_id: companyId } },
    { $group: { _id: '$year', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 },
  ]).toArray();
  const year = yearAgg[0]?._id || new Date().getUTCFullYear();
  console.log('Leave year:', year);

  // Balance shape template
  const balTemplate = await db.collection('leavebalances').findOne({ company_id: companyId });

  // ── 3. Assign a balance to every active/notice employee (skip existing) ──
  const emps = await db.collection('employees')
    .find({ company_id: companyId, status: { $in: ['active', 'notice'] } }).project({ _id: 1 }).toArray();

  let created = 0, skipped = 0;
  for (const e of emps) {
    const exists = await db.collection('leavebalances').findOne({
      company_id: companyId, employee_id: e._id, leaveType_id: probType._id, year,
    });
    if (exists) { skipped++; continue; }
    const now = new Date();
    const bal = {
      ...(balTemplate ? { ...balTemplate } : {}),
      company_id: companyId,
      employee_id: e._id,
      leaveType_id: probType._id,
      year,
      allocated: DAYS,
      carryForward: 0,
      used: 0,
      pending: 0,
      adjustment: 0,
      createdAt: now,
      updatedAt: now,
    };
    delete bal._id;
    await db.collection('leavebalances').insertOne(bal);
    created++;
  }

  console.log(`\nDone. Employees: ${emps.length} | balances created: ${created} | already had: ${skipped}`);
  console.log(`Probation Leave (${DAYS}d, probation-only) assigned.`);
  await c.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
