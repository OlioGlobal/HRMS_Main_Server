/**
 * Create appraisal cycle + records + goals for all active employees.
 * Uses existing "General Performance Template".
 *
 * Run: node scripts/seedCycle.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const AppraisalTemplate = require('../src/models/AppraisalTemplate');
const AppraisalCycle    = require('../src/models/AppraisalCycle');
const AppraisalRecord   = require('../src/models/AppraisalRecord');
const AppraisalGoal     = require('../src/models/AppraisalGoal');
const Employee          = require('../src/models/Employee');
const User              = require('../src/models/User');

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017', {
    dbName: process.env.DB_NAME || 'hrms',
  });

  const emp1 = await Employee.findOne({ employeeId: 'EMP001' }).lean();
  const companyId = emp1.company_id;
  const admin = await User.findOne({ company_id: companyId }).sort({ createdAt: 1 }).lean();

  // Use existing template
  const template = await AppraisalTemplate.findOne({ company_id: companyId, name: 'General Performance Template' }).lean();
  if (!template) {
    console.log('No template found!');
    await mongoose.disconnect();
    return;
  }
  console.log('Using template:', template.name);

  // Create Cycle
  const cycle = await AppraisalCycle.create({
    company_id: companyId,
    name: 'FY 2025-26 Annual Review',
    type: 'annual',
    periodStart: new Date('2025-01-01'),
    periodEnd: new Date('2025-12-31'),
    reviewStart: new Date('2026-03-01'),
    reviewEnd: new Date('2026-03-31'),
    selfRatingDeadline: new Date('2026-03-20'),
    managerRatingDeadline: new Date('2026-03-28'),
    selfRatingWeight: 30,
    managerRatingWeight: 70,
    ratingScale: 5,
    minGoals: 1,
    maxGoals: 10,
    applicableTo: 'all',
    template_id: template._id,
    status: 'active',
    createdBy: admin._id,
  });
  console.log('Cycle created:', cycle.name, '(active)');

  // Create records + goals for all active employees
  const employees = await Employee.find({ company_id: companyId, status: 'active' }).lean();

  for (const emp of employees) {
    const record = await AppraisalRecord.create({
      company_id: companyId,
      cycle_id: cycle._id,
      employee_id: emp._id,
      manager_id: emp.reportingManager_id || null,
      reviewer_id: emp.reportingManager_id || null,
      status: 'not_started',
    });

    for (const g of template.goals) {
      await AppraisalGoal.create({
        company_id: companyId,
        cycle_id: cycle._id,
        employee_id: emp._id,
        record_id: record._id,
        title: g.title,
        description: g.description,
        weightage: g.defaultWeightage,
        goalStatus: 'draft',
      });
    }
    console.log('  Record + 5 goals for', emp.employeeId, emp.firstName, emp.lastName);
  }

  console.log('\nDone! Cycle is ACTIVE with', employees.length, 'records.');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
