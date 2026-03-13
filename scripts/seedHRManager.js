/**
 * Seed HR Manager employee (EMP002) with:
 * - Employee record (HR Manager role)
 * - Salary: 50,000 CTC (Basic 50k) + PT 200 deduction
 * - Same leave template as Vishwas (Company Default)
 * - Portal access with User + HR Manager role
 *
 * Run: node scripts/seedHRManager.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

const Employee       = require('../src/models/Employee');
const EmployeeSalary = require('../src/models/EmployeeSalary');
const LeaveTemplate  = require('../src/models/LeaveTemplate');
const LeaveBalance   = require('../src/models/LeaveBalance');
const LeaveType      = require('../src/models/LeaveType');
const User           = require('../src/models/User');
const UserRole       = require('../src/models/UserRole');
const Role           = require('../src/models/Role');
const Company        = require('../src/models/Company');

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017', {
    dbName: process.env.DB_NAME || 'hrms',
  });
  console.log('\n=== Seeding HR Manager Employee ===\n');

  // ─── Company & reference data ──────────────────────────────────────────────
  const emp1 = await Employee.findOne({ employeeId: 'EMP001' }).lean();
  if (!emp1) { console.log('EMP001 not found! Seed Vishwas first.'); await mongoose.disconnect(); return; }

  const companyId = emp1.company_id;
  const company   = await Company.findById(companyId).lean();

  // Check if EMP002 already exists
  const existing = await Employee.findOne({ company_id: companyId, employeeId: 'EMP002' });
  if (existing) {
    console.log('EMP002 already exists! Skipping employee creation.');
    await mongoose.disconnect();
    return;
  }

  // ─── 1. Create Employee ────────────────────────────────────────────────────
  console.log('1. Creating employee...');

  const joiningDate = new Date(Date.UTC(2020, 5, 1)); // June 1, 2020
  const probationDays = company.defaultProbationDays || 90;
  const probEnd = new Date(joiningDate);
  probEnd.setDate(probEnd.getDate() + probationDays);

  const employee = await Employee.create({
    company_id:       companyId,
    employeeId:       'EMP002',
    firstName:        'Priya',
    lastName:         'Sharma',
    email:            'priya.sharma@test.com',
    phone:            '9876543210',
    gender:           'female',
    dateOfBirth:      new Date(Date.UTC(1992, 7, 15)), // Aug 15, 1992
    joiningDate,
    employmentType:   'full_time',
    department_id:    emp1.department_id,   // same dept as Vishwas
    location_id:      emp1.location_id,     // Mumbai
    designation_id:   emp1.designation_id,   // same designation
    workPolicy_id:    emp1.workPolicy_id,   // General Shift
    leaveTemplate_id: emp1.leaveTemplate_id, // Company Default
    reportingManager_id: null,
    probationDays,
    probationEndDate: probEnd,
    probationStatus:  probEnd <= new Date() ? 'confirmed' : 'ongoing',
    status:           'active',
  });

  console.log(`   Created: ${employee.firstName} ${employee.lastName} (${employee.employeeId})`);
  console.log(`   Probation: ${employee.probationStatus}`);

  // ─── 2. Create Salary (CTC 50,000) ────────────────────────────────────────
  console.log('2. Creating salary...');

  const admin = await User.findOne({ company_id: companyId }).sort({ createdAt: 1 }).lean();

  await EmployeeSalary.create({
    company_id:  companyId,
    employee_id: employee._id,
    type:        'custom',
    effectiveDate: joiningDate,
    reason:      'Initial salary',
    components: [
      {
        component_id: new mongoose.Types.ObjectId('69b29ae96042f0f297a9dbf1'), // Basic Salary
        name: 'Basic Salary',
        type: 'earning',
        calcType: 'fixed',
        value: 50000,
        monthlyAmount: 50000,
      },
      {
        component_id: new mongoose.Types.ObjectId('69b29ae96042f0f297a9dbf8'), // Professional Tax
        name: 'Professional Tax',
        type: 'deduction',
        calcType: 'fixed',
        value: 200,
        monthlyAmount: 200,
      },
    ],
    ctcMonthly: 50000,
    ctcAnnual:  600000,
    status:     'active',
    createdBy:  admin._id,
  });

  console.log('   CTC: Rs.50,000/month | PT: Rs.200');

  // ─── 3. Create Leave Balances (same template as Vishwas) ───────────────────
  console.log('3. Creating leave balances...');

  const template = await LeaveTemplate.findById(emp1.leaveTemplate_id)
    .populate('leaveTypes.leaveType_id')
    .lean();

  if (template) {
    const currentYear = 2026;
    for (const lt of template.leaveTypes) {
      if (!lt.leaveType_id || !lt.leaveType_id.isActive) continue;
      const allocated = lt.daysOverride != null ? lt.daysOverride : lt.leaveType_id.daysPerYear;

      await LeaveBalance.findOneAndUpdate(
        {
          company_id:  companyId,
          employee_id: employee._id,
          leaveType_id: lt.leaveType_id._id,
          year: currentYear,
        },
        {
          $setOnInsert: {
            company_id:  companyId,
            employee_id: employee._id,
            leaveType_id: lt.leaveType_id._id,
            year: currentYear,
            allocated,
            carryForward: 0,
            used: 0,
            pending: 0,
            adjustment: 0,
          },
        },
        { upsert: true, new: true }
      );
      console.log(`   ${lt.leaveType_id.code}: ${allocated} days`);
    }
  }

  // ─── 4. Create Portal User + HR Manager Role ──────────────────────────────
  console.log('4. Creating portal user...');

  const tempPassword = 'Priya@1234';

  const user = await User.create({
    company_id: companyId,
    email:      'priya.sharma@test.com',
    password:   tempPassword,
    firstName:  'Priya',
    lastName:   'Sharma',
    isActive:   true,
  });

  // Link user to employee
  employee.user_id = user._id;
  await employee.save();

  // Assign HR Manager role
  const hrManagerRole = await Role.findOne({ company_id: companyId, name: 'HR Manager' }).lean();
  if (hrManagerRole) {
    await UserRole.create({
      company_id: companyId,
      user_id:    user._id,
      role_id:    hrManagerRole._id,
    });
    console.log('   Role: HR Manager');
  }

  console.log(`   Email: priya.sharma@test.com`);
  console.log(`   Password: ${tempPassword}`);

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n=== HR Manager Created ===');
  console.log(`Employee: Priya Sharma (EMP002)`);
  console.log(`CTC: Rs.50,000/month | Deductions: PT Rs.200`);
  console.log(`Leave Template: ${template?.name || 'Company Default'}`);
  console.log(`Portal: priya.sharma@test.com / ${tempPassword}`);
  console.log(`Role: HR Manager`);
  console.log(`Status: ${employee.probationStatus}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
