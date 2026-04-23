/**
 * Add Siddhesh Mane (CEO) + link his 12 direct reports
 */

require('dotenv').config({ path: '.env.production' });
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const Company     = require('../src/models/Company');
const Designation = require('../src/models/Designation');
const Employee    = require('../src/models/Employee');
const User        = require('../src/models/User');
const UserRole    = require('../src/models/UserRole');
const Role        = require('../src/models/Role');
const Location    = require('../src/models/Location');
const WorkPolicy  = require('../src/models/WorkPolicy');
const LeaveTemplate = require('../src/models/LeaveTemplate');

// Employees who report to Siddhesh
const SIDDHESH_REPORTS = [
  'OLIO-003', 'OLIO-004', 'OLIO-011', 'OLIO-019',
  'OLIO-033', 'OLIO-045', 'OLIO-055', 'OLIO-056',
  'OLIO-064', 'OLIO-066', 'OLIO-067', 'OLIO-070',
];

async function run() {
  console.log('Connecting to PROD…');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.\n');

  const company = await Company.findOne({ name: /olio/i }).lean();
  const cid     = company._id;

  // ── Load refs ───────────────────────────────────────────────────────────────
  const superAdminRole  = await Role.findOne({ company_id: cid, name: 'Super Admin' }).lean();
  const location        = await Location.findOne({ company_id: cid, name: /mumbai/i }).lean();
  const workPolicy      = await WorkPolicy.findOne({ company_id: cid, isDefault: true }).lean();
  const leaveTemplate   = await LeaveTemplate.findOne({ company_id: cid, isDefault: true }).lean()
                       || await LeaveTemplate.findOne({ company_id: cid }).lean();

  // ── 1. Upsert CEO designation ────────────────────────────────────────────────
  console.log('── Step 1: CEO designation ────────────────────────────────────');
  const ceoDesig = await Designation.findOneAndUpdate(
    { company_id: cid, name: 'CEO' },
    { $setOnInsert: { company_id: cid, name: 'CEO', level: 'executive', isActive: true } },
    { upsert: true, returnDocument: 'after' }
  );
  console.log(`  ✓ Designation "CEO" [executive] — ${ceoDesig._id}\n`);

  // ── 2. Create User account ───────────────────────────────────────────────────
  console.log('── Step 2: User account ───────────────────────────────────────');
  // Delete old if exists (clean slate)
  await User.deleteOne({ company_id: cid, email: 'siddesh@olioglobaladtech.com' });

  const hashedPwd = await bcrypt.hash('8082714599', 12);
  const user = await User.create({
    company_id: cid,
    firstName:  'Siddhesh',
    lastName:   'Mane',
    email:      'siddesh@olioglobaladtech.com',
    password:   hashedPwd,
    phone:      '8082714599',
    status:     'active',
  });
  console.log(`  ✓ User created: ${user.email} (${user._id})\n`);

  // ── 3. Assign Super Admin role ───────────────────────────────────────────────
  console.log('── Step 3: Assign Super Admin role ────────────────────────────');
  await UserRole.create({
    user_id:    user._id,
    role_id:    superAdminRole._id,
    company_id: cid,
    assignedBy: null,
  });
  console.log(`  ✓ Super Admin role assigned\n`);

  // ── 4. Create Employee record ────────────────────────────────────────────────
  console.log('── Step 4: Employee record ────────────────────────────────────');
  const joining    = new Date('2015-01-01');
  const probEnd    = new Date(joining);
  probEnd.setMonth(probEnd.getMonth() + 6);

  const emp = await Employee.create({
    company_id:       cid,
    employeeId:       'OLIO-001',
    firstName:        'Siddhesh',
    lastName:         'Mane',
    email:            'siddesh@olioglobaladtech.com',
    phone:            '8082714599',
    dateOfBirth:      new Date('1990-01-03'),
    gender:           'male',
    joiningDate:      joining,
    designation_id:   ceoDesig._id,
    status:           'active',
    isActive:         true,
    workMode:         'office',
    location_id:      location._id,
    workPolicy_id:    workPolicy._id,
    leaveTemplate_id: leaveTemplate ? leaveTemplate._id : null,
    probationDays:    180,
    probationEndDate: probEnd,
    probationStatus:  'confirmed',
    user_id:          user._id,
  });
  console.log(`  ✓ Employee OLIO-001 Siddhesh Mane created (${emp._id})\n`);

  // ── 5. Link 12 direct reports ────────────────────────────────────────────────
  console.log('── Step 5: Link direct reports ────────────────────────────────');
  const result = await Employee.updateMany(
    { company_id: cid, employeeId: { $in: SIDDHESH_REPORTS } },
    { $set: { reportingManager_id: emp._id } }
  );
  console.log(`  ✓ ${result.modifiedCount} employees linked to Siddhesh Mane\n`);

  console.log('══════════════════════════════════════════════════════════════');
  console.log('  OLIO-001 Siddhesh Mane (CEO) added successfully');
  console.log('  Role        : Super Admin');
  console.log('  Location    : Mumbai Main Office');
  console.log('  Work Policy : General Shift');
  console.log('  Temp passwd : 8082714599 (phone number)');
  console.log(`  Reports     : ${result.modifiedCount} employees linked`);
  console.log('══════════════════════════════════════════════════════════════');

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => {
  console.error('Fatal:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
