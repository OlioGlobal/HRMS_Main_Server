/**
 * Seed test employees for appraisal testing:
 *
 *   EMP003 — Rahul Verma     (Manager role,   reports to no one)
 *   EMP004 — Anita Desai     (Employee role,  reports to Rahul — EMP003)
 *   EMP005 — Karan Mehta     (Employee role,  reports to Rahul — EMP003)
 *   EMP006 — Sneha Patel     (HR Staff role,  reports to Priya — EMP002)
 *
 * All get: same dept/location/workPolicy/leaveTemplate as EMP001,
 *          salary 40k (employees) / 60k (manager) / 35k (HR staff),
 *          portal access with matching role.
 *
 * Run: node scripts/seedTestEmployees.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Employee       = require('../src/models/Employee');
const EmployeeSalary = require('../src/models/EmployeeSalary');
const LeaveTemplate  = require('../src/models/LeaveTemplate');
const LeaveBalance   = require('../src/models/LeaveBalance');
const LeaveType      = require('../src/models/LeaveType');
const User           = require('../src/models/User');
const UserRole       = require('../src/models/UserRole');
const Role           = require('../src/models/Role');
const Company        = require('../src/models/Company');

const EMPLOYEES = [
  {
    empId: 'EMP003', firstName: 'Rahul',  lastName: 'Verma',
    email: 'rahul.verma@test.com',  password: 'Rahul@1234',
    gender: 'male',   dob: '1990-03-20', phone: '9876500001',
    roleName: 'Manager', salary: 60000,
    reportingManagerEmpId: null,
  },
  {
    empId: 'EMP004', firstName: 'Anita',  lastName: 'Desai',
    email: 'anita.desai@test.com',  password: 'Anita@1234',
    gender: 'female', dob: '1995-11-08', phone: '9876500002',
    roleName: 'Employee', salary: 40000,
    reportingManagerEmpId: 'EMP003',
  },
  {
    empId: 'EMP005', firstName: 'Karan',  lastName: 'Mehta',
    email: 'karan.mehta@test.com',  password: 'Karan@1234',
    gender: 'male',   dob: '1996-06-25', phone: '9876500003',
    roleName: 'Employee', salary: 40000,
    reportingManagerEmpId: 'EMP003',
  },
  {
    empId: 'EMP006', firstName: 'Sneha',  lastName: 'Patel',
    email: 'sneha.patel@test.com',  password: 'Sneha@1234',
    gender: 'female', dob: '1994-01-12', phone: '9876500004',
    roleName: 'HR Staff', salary: 35000,
    reportingManagerEmpId: 'EMP002',
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017', {
    dbName: process.env.DB_NAME || 'hrms',
  });
  console.log('\n=== Seeding Test Employees ===\n');

  // ─── Reference data from EMP001 ──────────────────────────────────────────
  const emp1 = await Employee.findOne({ employeeId: 'EMP001' }).lean();
  if (!emp1) { console.log('EMP001 not found! Seed Vishwas first.'); await mongoose.disconnect(); return; }

  const companyId = emp1.company_id;
  const company   = await Company.findById(companyId).lean();
  const admin     = await User.findOne({ company_id: companyId }).sort({ createdAt: 1 }).lean();

  // Load leave template
  const template = await LeaveTemplate.findById(emp1.leaveTemplate_id)
    .populate('leaveTypes.leaveType_id')
    .lean();

  // Load roles
  const roles = await Role.find({ company_id: companyId }).lean();
  const roleMap = {};
  for (const r of roles) roleMap[r.name] = r;

  // Track created employees for reporting manager references
  const empMap = {};
  // Pre-load existing employees
  const existingEmps = await Employee.find({ company_id: companyId }).lean();
  for (const e of existingEmps) empMap[e.employeeId] = e;

  for (const def of EMPLOYEES) {
    // Skip if already exists
    if (empMap[def.empId]) {
      console.log(`[SKIP] ${def.empId} (${def.firstName} ${def.lastName}) already exists.`);
      continue;
    }

    console.log(`─── Creating ${def.empId}: ${def.firstName} ${def.lastName} ───`);

    // Resolve reporting manager
    let reportingManagerId = null;
    if (def.reportingManagerEmpId && empMap[def.reportingManagerEmpId]) {
      reportingManagerId = empMap[def.reportingManagerEmpId]._id;
    }

    // 1. Create Employee
    const joiningDate = new Date(Date.UTC(2023, 0, 10)); // Jan 10, 2023
    const probationDays = company.defaultProbationDays || 90;
    const probEnd = new Date(joiningDate);
    probEnd.setDate(probEnd.getDate() + probationDays);

    const employee = await Employee.create({
      company_id:       companyId,
      employeeId:       def.empId,
      firstName:        def.firstName,
      lastName:         def.lastName,
      email:            def.email,
      phone:            def.phone,
      gender:           def.gender,
      dateOfBirth:      new Date(def.dob),
      joiningDate,
      employmentType:   'full_time',
      department_id:    emp1.department_id,
      location_id:      emp1.location_id,
      designation_id:   emp1.designation_id,
      workPolicy_id:    emp1.workPolicy_id,
      leaveTemplate_id: emp1.leaveTemplate_id,
      reportingManager_id: reportingManagerId,
      probationDays,
      probationEndDate: probEnd,
      probationStatus:  probEnd <= new Date() ? 'confirmed' : 'ongoing',
      status:           'active',
    });

    empMap[def.empId] = employee;
    console.log(`  Employee created (${employee.probationStatus})`);

    // 2. Create Salary
    await EmployeeSalary.create({
      company_id:    companyId,
      employee_id:   employee._id,
      type:          'custom',
      effectiveDate: joiningDate,
      reason:        'Initial salary',
      components: [
        {
          component_id: new mongoose.Types.ObjectId('69b29ae96042f0f297a9dbf1'),
          name: 'Basic Salary', type: 'earning', calcType: 'fixed',
          value: def.salary, monthlyAmount: def.salary,
        },
        {
          component_id: new mongoose.Types.ObjectId('69b29ae96042f0f297a9dbf8'),
          name: 'Professional Tax', type: 'deduction', calcType: 'fixed',
          value: 200, monthlyAmount: 200,
        },
      ],
      ctcMonthly: def.salary,
      ctcAnnual:  def.salary * 12,
      status:     'active',
      createdBy:  admin._id,
    });
    console.log(`  Salary: Rs.${def.salary.toLocaleString()}/month`);

    // 3. Create Leave Balances
    if (template) {
      const currentYear = 2026;
      for (const lt of template.leaveTypes) {
        if (!lt.leaveType_id || !lt.leaveType_id.isActive) continue;
        const allocated = lt.daysOverride != null ? lt.daysOverride : lt.leaveType_id.daysPerYear;
        await LeaveBalance.findOneAndUpdate(
          { company_id: companyId, employee_id: employee._id, leaveType_id: lt.leaveType_id._id, year: currentYear },
          { $setOnInsert: { company_id: companyId, employee_id: employee._id, leaveType_id: lt.leaveType_id._id, year: currentYear, allocated, carryForward: 0, used: 0, pending: 0, adjustment: 0 } },
          { upsert: true, new: true }
        );
      }
      console.log(`  Leave balances created`);
    }

    // 4. Create Portal User + Role
    const user = await User.create({
      company_id: companyId,
      email:      def.email,
      password:   def.password,
      firstName:  def.firstName,
      lastName:   def.lastName,
      isActive:   true,
    });

    employee.user_id = user._id;
    await employee.save();

    const role = roleMap[def.roleName];
    if (role) {
      await UserRole.create({ company_id: companyId, user_id: user._id, role_id: role._id });
      console.log(`  Role: ${def.roleName}`);
    }

    console.log(`  Portal: ${def.email} / ${def.password}\n`);
  }

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log('=== Summary ===\n');
  console.log('EMP003  Rahul Verma    Manager     rahul.verma@test.com   / Rahul@1234');
  console.log('EMP004  Anita Desai    Employee    anita.desai@test.com   / Anita@1234    (reports to Rahul)');
  console.log('EMP005  Karan Mehta    Employee    karan.mehta@test.com   / Karan@1234    (reports to Rahul)');
  console.log('EMP006  Sneha Patel    HR Staff    sneha.patel@test.com   / Sneha@1234    (reports to Priya)');
  console.log('\nAppraisal test flow:');
  console.log('  1. Super Admin/HR creates cycle & activates');
  console.log('  2. Anita/Karan (employees) → set goals → submit');
  console.log('  3. Rahul (manager) → approve goals → submit manager rating');
  console.log('  4. HR finalizes records from cycle detail page');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
