/**
 * Update script for Olio employees:
 *  - Assign Mumbai Main Office location to all
 *  - Assign General Shift work policy to all
 *  - Set gender from names
 *  - Set workMode (wfh / field / office)
 *  - Fix roles: Sarita → HR Manager, Suraj → Super Admin
 */

require('dotenv').config({ path: '.env.production' });
const mongoose = require('mongoose');

const Company    = require('../src/models/Company');
const Employee   = require('../src/models/Employee');
const User       = require('../src/models/User');
const UserRole   = require('../src/models/UserRole');
const Location   = require('../src/models/Location');
const WorkPolicy = require('../src/models/WorkPolicy');
const Role       = require('../src/models/Role');

// ─── Work mode overrides (empId → mode) ──────────────────────────────────────
const WFH_IDS   = ['EMPTEST01', 'OLIO-011', 'OLIO-033', 'OLIO-055', 'OLIO-056', 'OLIO-057'];
const FIELD_IDS = ['OLIO-053'];

// ─── Gender by empId (inferred from names) ───────────────────────────────────
const GENDER_MAP = {
  'EMPTEST01': 'male',    // Yash chaudhari
  'OLIO-003':  'male',    // Vishwas Tupe
  'OLIO-004':  'male',    // Sagar Gala
  'OLIO-011':  'male',    // Pradeep Kumar
  'OLIO-013':  'male',    // Manish Jadon
  'OLIO-019':  'male',    // Suraj Shinde
  'OLIO-033':  'male',    // Kiran Navade
  'OLIO-039':  'male',    // Aniket Kharat
  'OLIO-045':  'male',    // Shaun Caldeira
  'OLIO-045A': 'female',  // Sarita Nikale
  'OLIO-047':  'female',  // Charul Bandre
  'OLIO-048':  'female',  // Shobha Narvekar
  'OLIO-049':  'male',    // Himesh Bari
  'OLIO-050':  'male',    // Kshitij Shelar
  'OLIO-053':  'male',    // Vinay Lande
  'OLIO-055':  'male',    // Yash Chaudhari
  'OLIO-056':  'male',    // Prashant Navade
  'OLIO-057':  'male',    // Saurabh Wadhwani
  'OLIO-058':  'female',  // Divya Chopra
  'OLIO-060':  'female',  // Reshma Pawar
  'OLIO-061':  'female',  // Muskan Matwani
  'OLIO-062':  'female',  // Mitali Talegaonkar
  'OLIO-064':  'female',  // Khushi Pandya
  'OLIO-065':  'female',  // Tanvi More
  'OLIO-066':  'female',  // Anchal Singh
  'OLIO-067':  'female',  // Manasi Kambli
  'OLIO-068':  'male',    // Rajesh Dattatray Nargale
  'OLIO-069':  'male',    // Mandar Kamble
  'OLIO-070':  'female',  // Vanita Gaware
  'OLIO-071':  'male',    // Rahul Jadhav
  'OLIO-072':  'male',    // Ayaan Shaikh
  'OLIO-073':  'male',    // Shripad Bodhankar
};

// ─── Role changes ─────────────────────────────────────────────────────────────
// empId → role name to assign (replaces Employee role)
const ROLE_OVERRIDE = {
  'OLIO-045A': 'HR Manager',  // Sarita Nikale
  'OLIO-019':  'Super Admin', // Suraj Shinde
};

const ALL_EMP_IDS = Object.keys(GENDER_MAP);

async function run() {
  console.log('Connecting to PROD…');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.\n');

  const company = await Company.findOne({ name: /olio/i }).lean();
  const cid     = company._id;
  console.log(`Company: ${company.name}\n`);

  // ── Load refs ───────────────────────────────────────────────────────────────
  const location   = await Location.findOne({ company_id: cid, name: /mumbai/i }).lean();
  const workPolicy = await WorkPolicy.findOne({ company_id: cid, isDefault: true }).lean();
  const roles      = await Role.find({ company_id: cid }).lean();
  const roleByName = Object.fromEntries(roles.map(r => [r.name, r._id]));

  console.log(`Location  : ${location.name} (${location._id})`);
  console.log(`WorkPolicy: ${workPolicy.name} (${workPolicy._id})`);
  console.log(`Roles loaded: ${roles.map(r => r.name).join(', ')}\n`);

  // ── Load all our employees ──────────────────────────────────────────────────
  const emps = await Employee.find({ company_id: cid, employeeId: { $in: ALL_EMP_IDS } }).lean();
  console.log(`Found ${emps.length} employees to update.\n`);

  // ── Step 1: Update location, workPolicy, gender, workMode ──────────────────
  console.log('── Step 1: Location / WorkPolicy / Gender / WorkMode ──────────');
  for (const emp of emps) {
    const id       = emp.employeeId;
    const gender   = GENDER_MAP[id] || null;
    const workMode = FIELD_IDS.includes(id) ? 'field' : WFH_IDS.includes(id) ? 'wfh' : 'office';

    await Employee.updateOne(
      { _id: emp._id },
      {
        $set: {
          location_id:    location._id,
          workPolicy_id:  workPolicy._id,
          gender,
          workMode,
        },
      }
    );
    console.log(`  ✓ ${id.padEnd(10)} gender=${gender.padEnd(7)} workMode=${workMode}`);
  }

  // ── Step 2: Fix roles ───────────────────────────────────────────────────────
  console.log('\n── Step 2: Role overrides ──────────────────────────────────────');
  const employeeRoleId = roleByName['Employee'];

  for (const [empId, targetRoleName] of Object.entries(ROLE_OVERRIDE)) {
    const emp = emps.find(e => e.employeeId === empId);
    if (!emp || !emp.user_id) { console.log(`  ⚠ ${empId}: no user_id, skipping`); continue; }

    const targetRoleId = roleByName[targetRoleName];
    if (!targetRoleId) { console.log(`  ⚠ Role "${targetRoleName}" not found`); continue; }

    // Remove Employee role
    await UserRole.deleteOne({ company_id: cid, user_id: emp.user_id, role_id: employeeRoleId });

    // Upsert target role
    await UserRole.updateOne(
      { company_id: cid, user_id: emp.user_id, role_id: targetRoleId },
      { $setOnInsert: { company_id: cid, user_id: emp.user_id, role_id: targetRoleId, assignedBy: null } },
      { upsert: true }
    );

    console.log(`  ✓ ${empId} (${emp.firstName} ${emp.lastName}) → ${targetRoleName}`);
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  Location assigned     : Mumbai Main Office → all ${emps.length} employees`);
  console.log(`  Work policy assigned  : General Shift → all ${emps.length} employees`);
  console.log(`  Gender set            : ${emps.length} employees`);
  console.log(`  WFH mode              : EMPTEST01, OLIO-011, OLIO-033, OLIO-055, OLIO-056, OLIO-057`);
  console.log(`  Field mode            : OLIO-053 (Vinay Lande)`);
  console.log(`  Role: HR Manager      : OLIO-045A (Sarita Nikale)`);
  console.log(`  Role: Super Admin     : OLIO-019 (Suraj Shinde)`);
  console.log('══════════════════════════════════════════════════════════════');

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => {
  console.error('Fatal:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
