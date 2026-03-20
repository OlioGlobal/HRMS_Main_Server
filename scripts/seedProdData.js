require('dotenv').config();
const mongoose = require('mongoose');
const { addDays } = require('date-fns');

const PROD_URI = 'mongodb+srv://olioclientwebsiteleads_db_user:fm94Z1SVE0bHmdtu@hrms.qtoqbwo.mongodb.net/hrms?appName=HRMS';
const companyId = '69b2fcef09ab0d0538f21b7c';

async function run() {
  await mongoose.connect(PROD_URI);
  console.log('Connected to production DB');

  const Department = require('../src/models/Department');
  const Team = require('../src/models/Team');
  const Location = require('../src/models/Location');
  const LeaveType = require('../src/models/LeaveType');
  const LeaveTemplate = require('../src/models/LeaveTemplate');
  const LeaveBalance = require('../src/models/LeaveBalance');
  const Employee = require('../src/models/Employee');
  const Company = require('../src/models/Company');
  const WorkPolicy = require('../src/models/WorkPolicy');

  // ── Fix Location geofence ──
  await Location.updateOne(
    { company_id: companyId },
    { $set: { 'geofence.lat': 19.076, 'geofence.lng': 72.8777, 'geofence.radius': 500, timezone: 'Asia/Kolkata' } }
  );
  console.log('✅ Location geofence set');

  // ── Add missing Leave Types ──
  const existingCodes = (await LeaveType.find({ company_id: companyId }).select('code').lean()).map(t => t.code);
  const missing = [
    { name: 'Casual Leave', code: 'CL', type: 'paid', daysPerYear: 12, resetCycle: 'fiscal_year', applicableGender: 'all', requiresDocument: false, minDaysNotice: 1, maxDaysAtOnce: 5, allowHalfDay: true, restrictDuringProbation: true, restrictDuringNotice: true },
    { name: 'Maternity Leave', code: 'ML', type: 'paid', daysPerYear: 180, resetCycle: 'none', applicableGender: 'female', requiresDocument: true, minDaysNotice: 15, maxDaysAtOnce: 180, allowHalfDay: false, countWeekends: true, countHolidays: true },
    { name: 'Paternity Leave', code: 'PL', type: 'paid', daysPerYear: 15, resetCycle: 'none', applicableGender: 'male', requiresDocument: true, minDaysNotice: 7, maxDaysAtOnce: 15, allowHalfDay: false, restrictDuringProbation: true, restrictDuringNotice: true },
    { name: 'Comp Off', code: 'CO', type: 'comp_off', daysPerYear: 0, resetCycle: 'none', applicableGender: 'all', requiresDocument: false, minDaysNotice: 1, maxDaysAtOnce: 3, allowHalfDay: true },
  ].filter(t => !existingCodes.includes(t.code));

  if (missing.length) {
    await LeaveType.insertMany(missing.map(t => ({ ...t, company_id: companyId })));
    console.log('✅ Added leave types:', missing.map(t => t.code).join(', '));
  } else {
    console.log('✅ Leave types already exist');
  }

  // ── Create Teams ──
  const depts = await Department.find({ company_id: companyId }).lean();
  const nexus = depts.find(d => d.name === 'Nexus');
  const maximus = depts.find(d => d.name === 'Maximus');
  const existingTeams = await Team.countDocuments({ company_id: companyId });
  if (existingTeams === 0) {
    await Team.insertMany([
      { company_id: companyId, name: 'Engineering', department_id: nexus._id },
      { company_id: companyId, name: 'Finance', department_id: maximus._id },
    ]);
    console.log('✅ Teams created');
  }

  // ── Fix Company settings ──
  await Company.updateOne({ _id: companyId }, { $set: {
    'settings.timezone': 'Asia/Kolkata',
    'settings.timeFormat': '12h',
    'settings.dateFormat': 'DD/MM/YYYY',
    'settings.geofencing.enabled': true,
    'settings.geofencing.defaultRadius': 500,
    'settings.leave.weekendDays': ['SAT', 'SUN'],
  }});
  console.log('✅ Company settings updated');

  // ── Get reference data ──
  const loc = await Location.findOne({ company_id: companyId }).lean();
  const policy = await WorkPolicy.findOne({ company_id: companyId }).lean();
  const template = await LeaveTemplate.findOne({ company_id: companyId }).lean();
  const teams = await Team.find({ company_id: companyId }).lean();
  const engTeam = teams.find(t => t.name === 'Engineering');
  const finTeam = teams.find(t => t.name === 'Finance');

  const emps = await Employee.find({ company_id: companyId }).lean();
  const empMap = {};
  emps.forEach(e => { empMap[e.employeeId] = e; });

  // ── EMP001 Yash — Developer, probation ending in 5 days, onboarding incomplete ──
  await Employee.updateOne({ _id: empMap['EMP001']._id }, {
    department_id: nexus._id,
    team_id: engTeam ? engTeam._id : undefined,
    location_id: loc._id,
    workPolicy_id: policy._id,
    leaveTemplate_id: template._id,
    probationEndDate: addDays(new Date(), 5),
    onboardingCompleted: false,
    gender: 'male',
    phone: '+919876543210',
    dateOfBirth: new Date(Date.UTC(2001, 0, 1, 12, 0, 0)),
    joiningDate: new Date('2024-11-27'),
    addresses: [{ label: 'home', street: '123 MG Road', city: 'Mumbai', state: 'Maharashtra', country: 'India', zip: '400001', lat: 19.076, lng: 72.8777, isPrimary: true }],
  });
  console.log('✅ EMP001 Yash — probation 5 days, onboarding incomplete');

  // ── EMP002 Austin — Accounting, complete ──
  await Employee.updateOne({ _id: empMap['EMP002']._id }, {
    department_id: maximus._id,
    team_id: finTeam ? finTeam._id : undefined,
    location_id: loc._id,
    workPolicy_id: policy._id,
    leaveTemplate_id: template._id,
    onboardingCompleted: true,
    gender: 'male',
    phone: '+919876543211',
    dateOfBirth: new Date(Date.UTC(1999, 0, 1, 12, 0, 0)),
    addresses: [{ label: 'home', street: '456 Park Street', city: 'Mumbai', state: 'Maharashtra', country: 'India', zip: '400002', lat: 19.0825, lng: 72.881, isPrimary: true }],
  });
  console.log('✅ EMP002 Austin — complete');

  // ── EMP003 John — HR Staff, complete ──
  await Employee.updateOne({ _id: empMap['EMP003']._id }, {
    location_id: loc._id,
    workPolicy_id: policy._id,
    leaveTemplate_id: template._id,
    onboardingCompleted: true,
    gender: 'male',
    phone: '+919876543212',
    dateOfBirth: new Date(Date.UTC(1998, 1, 20, 12, 0, 0)),
    addresses: [{ label: 'home', street: '789 Link Road', city: 'Mumbai', state: 'Maharashtra', country: 'India', zip: '400003', lat: 19.1136, lng: 72.8697, isPrimary: true }],
  });
  console.log('✅ EMP003 John — complete');

  // ── EMP004 Emma — HR Manager, add dept ──
  await Employee.updateOne({ _id: empMap['EMP004']._id }, {
    department_id: nexus._id,
    location_id: loc._id,
    workPolicy_id: policy._id,
    leaveTemplate_id: template._id,
    onboardingCompleted: true,
    gender: 'female',
    phone: '+919876543213',
    dateOfBirth: new Date(Date.UTC(1995, 4, 1, 12, 0, 0)),
    addresses: [{ label: 'home', street: '101 Colaba', city: 'Mumbai', state: 'Maharashtra', country: 'India', zip: '400005', lat: 18.9067, lng: 72.8147, isPrimary: true }],
  });
  console.log('✅ EMP004 Emma — complete');

  // ── EMP005 Suraj — Top/Manager, complete ──
  await Employee.updateOne({ _id: empMap['EMP005']._id }, {
    location_id: loc._id,
    workPolicy_id: policy._id,
    leaveTemplate_id: template._id,
    onboardingCompleted: true,
    gender: 'male',
    phone: '+919876543214',
    dateOfBirth: new Date(Date.UTC(1985, 11, 13, 12, 0, 0)),
    addresses: [{ label: 'home', street: '202 Bandra West', city: 'Mumbai', state: 'Maharashtra', country: 'India', zip: '400050', lat: 19.0596, lng: 72.8295, isPrimary: true }],
  });
  console.log('✅ EMP005 Suraj — complete');

  // ── Create leave balances for EMP001 Yash ──
  const allTypes = await LeaveType.find({ company_id: companyId, type: { $ne: 'comp_off' } }).lean();
  const yashBal = await LeaveBalance.countDocuments({ employee_id: empMap['EMP001']._id });
  if (yashBal === 0) {
    await LeaveBalance.insertMany(allTypes.map(lt => ({
      company_id: companyId, employee_id: empMap['EMP001']._id, leaveType_id: lt._id,
      year: 2026, allocated: lt.daysPerYear, used: 0, pending: 0, carryForward: 0, adjustment: 0,
    })));
    console.log('✅ EMP001 leave balances created');
  }

  // ── Summary ──
  console.log('\n=== Final Summary ===');
  const Designation = require('../src/models/Designation');
  const final = await Employee.find({ company_id: companyId })
    .populate('department_id', 'name')
    .populate('designation_id', 'name')
    .populate('reportingManager_id', 'firstName employeeId')
    .select('employeeId firstName lastName status department_id designation_id reportingManager_id probationEndDate onboardingCompleted leaveTemplate_id location_id workPolicy_id gender')
    .lean();

  for (const e of final) {
    console.log(`${e.employeeId} ${e.firstName} ${e.lastName}`);
    console.log(`  Dept: ${e.department_id?.name || 'N/A'} | Desig: ${e.designation_id?.name || 'N/A'} | Gender: ${e.gender || 'N/A'}`);
    console.log(`  Manager: ${e.reportingManager_id?.firstName || 'none'} | Location: ${e.location_id ? 'YES' : 'NO'} | Policy: ${e.workPolicy_id ? 'YES' : 'NO'} | Template: ${e.leaveTemplate_id ? 'YES' : 'NO'}`);
    console.log(`  Onboarding: ${e.onboardingCompleted ? 'DONE' : 'PENDING'} | Probation: ${e.probationEndDate ? new Date(e.probationEndDate).toISOString().split('T')[0] : 'N/A'} | Status: ${e.status}`);
    console.log('');
  }

  await mongoose.disconnect();
  console.log('✅ All done!');
}

run().catch(err => { console.error(err); process.exit(1); });
