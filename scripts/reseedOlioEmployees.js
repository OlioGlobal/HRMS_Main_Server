/**
 * Reseed Script: Delete + re-add Olio employees with
 *   - 6-month probation (probationEndDate = joiningDate + 6 months)
 *   - Portal User account (temp password = Phone number)
 *   - Employee role assigned via UserRole
 *   - Reporting manager linked properly
 * Run: node scripts/reseedOlioEmployees.js
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
const LeaveTemplate = require('../src/models/LeaveTemplate');

// ─── Designation definitions (same as before) ────────────────────────────────
const DESIGNATION_MAP = [
  { name: 'SDE',                                         level: 'mid'     },
  { name: 'Junior Developer',                            level: 'junior'  },
  { name: 'Senior Developer',                            level: 'senior'  },
  { name: 'Project Lead & UI Developer',                 level: 'lead'    },
  { name: 'Account Manager',                             level: 'mid'     },
  { name: 'Design Executive',                            level: 'mid'     },
  { name: 'Operations Head & SEO Manager',               level: 'manager' },
  { name: 'SEM Manager',                                 level: 'manager' },
  { name: 'SEM Executive',                               level: 'junior'  },
  { name: 'SEO Executive',                               level: 'junior'  },
  { name: 'SEO Intern',                                  level: 'intern'  },
  { name: 'UI UX Designer',                              level: 'mid'     },
  { name: 'Junior UI/UX Designer',                       level: 'junior'  },
  { name: 'Sales Executive',                             level: 'junior'  },
  { name: 'HR',                                          level: 'mid'     },
  { name: 'Jr Associate in HR and Admin',                level: 'junior'  },
  { name: 'Social Media Manager',                        level: 'mid'     },
  { name: 'Video Editor',                                level: 'junior'  },
  { name: 'Video Editor Intern',                         level: 'intern'  },
  { name: 'Video Production',                            level: 'mid'     },
  { name: 'Content Writer',                              level: 'junior'  },
  { name: 'Graphic Designer',                            level: 'junior'  },
  { name: 'Business Development Consultant',             level: 'mid'     },
  { name: 'Performance Marketing Associate',             level: 'junior'  },
  { name: 'Client Growth Associate (Client Servicing)',  level: 'junior'  },
  { name: 'Product Manager',                             level: 'manager' },
];

// ─── Employee data ────────────────────────────────────────────────────────────
const RAW_EMPLOYEES = [
  { empId:'EMPTEST01', name:'Yash chaudhari',         email:'chaudhariyash@gmail.com',      phone:'9096842842', designationRaw:'sde',                                        dob:'2000-05-27', joining:'2025-05-06', resignation:null,         active:'No',  managerEmail:'sagar@olioglobaladtech.com',    ecName:'YASH PAR',           ecPhone:'9885236950', ecRelation:'Parent' },
  { empId:'OLIO-003',  name:'Vishwas Tupe',            email:'vishwas@olioglobaladtech.com', phone:'7977557206', designationRaw:'Account Manager',                            dob:'1993-03-17', joining:'2016-01-15', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                 ecPhone:null,         ecRelation:null },
  { empId:'OLIO-004',  name:'Sagar Gala',              email:'sagar@olioglobaladtech.com',   phone:'9028806501', designationRaw:'Project Lead & UI Developer',                dob:'1995-01-01', joining:'2020-10-12', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                 ecPhone:null,         ecRelation:null },
  { empId:'OLIO-011',  name:'Pradeep Kumar',            email:'pradeep@olioglobaladtech.com', phone:'9057489487', designationRaw:'Senior Developer',                           dob:'2000-01-01', joining:'2022-05-27', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                 ecPhone:null,         ecRelation:null },
  { empId:'OLIO-013',  name:'Manish Jadon',             email:'manish@olioglobaladtech.com',  phone:'9131732810', designationRaw:'Design Executive',                           dob:'1998-03-24', joining:'2022-03-07', resignation:null,         active:'Yes', managerEmail:'amol@olioglobaladtech.com',     ecName:null,                 ecPhone:null,         ecRelation:null },
  { empId:'OLIO-019',  name:'Suraj Shinde',             email:'suraj@olioglobaladtech.com',   phone:'9890730590', designationRaw:'Operations Head & SEO Manager',              dob:'1995-12-13', joining:'2022-06-01', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:'Vishwas',            ecPhone:'7977557206', ecRelation:'Parent' },
  { empId:'OLIO-033',  name:'Kiran Navade',             email:'kiran@olioglobaladtech.com',   phone:'9595441999', designationRaw:'SEM Manager',                                dob:'1990-08-06', joining:'2023-01-02', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                 ecPhone:null,         ecRelation:null },
  { empId:'OLIO-039',  name:'Aniket Kharat',            email:'aniket@olioglobaladtech.com',  phone:'8369961422', designationRaw:'UI UX Designer',                             dob:'2000-01-01', joining:'2023-07-24', resignation:'2026-01-16', active:'No',  managerEmail:'suraj@olioglobaladtech.com',    ecName:'vishwas',            ecPhone:'9768977853', ecRelation:'Other' },
  { empId:'OLIO-045',  name:'Shaun Caldeira',           email:'shaun@olioglobaladtech.com',   phone:'7303197934', designationRaw:'Sales Executive',                            dob:'2002-02-15', joining:'2024-01-08', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                 ecPhone:null,         ecRelation:null },
  { empId:'OLIO-045A', name:'Sarita Nikale',            email:'hrms@olioglobaladtech.com',    phone:'9075795181', designationRaw:'HR',                                         dob:'1989-09-18', joining:'2024-03-01', resignation:null,         active:'Yes', managerEmail:'amol@olioglobaladtech.com',     ecName:'Vishwas',            ecPhone:'7977557206', ecRelation:'Friend' },
  { empId:'OLIO-047',  name:'Charul Bandre',            email:'charul@olioglobaladtech.com',  phone:'8693065838', designationRaw:'SEO Executive',                              dob:'2001-10-03', joining:'2024-05-14', resignation:'2026-01-15', active:'No',  managerEmail:'suraj@olioglobaladtech.com',    ecName:'Vishwas',            ecPhone:'9768977853', ecRelation:'Other' },
  { empId:'OLIO-048',  name:'Shobha Narvekar',          email:'shobha@olioglobaladtech.com',  phone:'8369845715', designationRaw:'Social Media Manager',                       dob:'1998-03-10', joining:'2024-08-26', resignation:null,         active:'Yes', managerEmail:'amol@olioglobaladtech.com',     ecName:'Vishwas',            ecPhone:'7977557206', ecRelation:'Parent' },
  { empId:'OLIO-049',  name:'Himesh Bari',              email:'himesh@olioglobaladtech.com',  phone:'9673869954', designationRaw:'SEO Executive',                              dob:'2002-05-18', joining:'2024-09-02', resignation:null,         active:'Yes', managerEmail:'suraj@olioglobaladtech.com',    ecName:'Suryasan Bari',      ecPhone:'7875113897', ecRelation:'Parent' },
  { empId:'OLIO-050',  name:'Kshitij Shelar',           email:'kshitij@olioglobaladtech.com', phone:'7666490331', designationRaw:'Video Editor',                               dob:'2002-02-23', joining:'2024-09-13', resignation:null,         active:'No',  managerEmail:'vinay@olioglobaladtech.com',    ecName:null,                 ecPhone:null,         ecRelation:null },
  { empId:'OLIO-053',  name:'Vinay Lande',              email:'vinay@olioglobaladtech.com',   phone:'8805158850', designationRaw:'Video production',                           dob:'1994-10-12', joining:'2024-08-01', resignation:null,         active:'Yes', managerEmail:'amol@olioglobaladtech.com',     ecName:'Test',               ecPhone:'7894561230', ecRelation:'Parent' },
  { empId:'OLIO-055',  name:'Yash Chaudhari',           email:'yash@olioglobaladtech.com',    phone:'9096842842', designationRaw:'Junior Developer',                           dob:'2002-05-27', joining:'2024-11-27', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:'Vishwas',            ecPhone:'7977557206', ecRelation:'Other' },
  { empId:'OLIO-056',  name:'Prashant Navade',          email:'prashant@olioglobaladtech.com',phone:'8379990333', designationRaw:'SEM Executive',                              dob:'1988-09-25', joining:'2024-11-01', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                 ecPhone:null,         ecRelation:null },
  { empId:'OLIO-057',  name:'Saurabh Wadhwani',         email:'saurabh@olioglobaladtech.com', phone:'7974050304', designationRaw:'Content Writer',                             dob:'1998-03-10', joining:'2024-12-02', resignation:null,         active:'Yes', managerEmail:'suraj@olioglobaladtech.com',    ecName:'Manohar Wadhwani',   ecPhone:'9179360304', ecRelation:'Parent' },
  { empId:'OLIO-058',  name:'Divya Chopra',             email:'divya@olioglobaladtech.com',   phone:'9819697056', designationRaw:'Account Manager',                            dob:'1995-08-13', joining:'2025-06-16', resignation:null,         active:'No',  managerEmail:'suraj@olioglobaladtech.com',    ecName:null,                 ecPhone:null,         ecRelation:null },
  { empId:'OLIO-060',  name:'Reshma Pawar',             email:'reshma@olioglobaladtech.com',  phone:'8169883563', designationRaw:'Graphic Designer',                           dob:'1991-08-15', joining:'2025-06-16', resignation:null,         active:'No',  managerEmail:'amol@olioglobaladtech.com',     ecName:null,                 ecPhone:null,         ecRelation:null },
  { empId:'OLIO-061',  name:'Muskan Matwani',           email:'muskan@olioglobaladtech.com',  phone:'8955499661', designationRaw:'Account Manager',                            dob:'1999-10-12', joining:'2025-06-23', resignation:null,         active:'Yes', managerEmail:'suraj@olioglobaladtech.com',    ecName:null,                 ecPhone:null,         ecRelation:null },
  { empId:'OLIO-062',  name:'Mitali Talegaonkar',       email:'mitali@olioglobaladtech.com',  phone:'8454957336', designationRaw:'SEO Intern',                                 dob:'2000-11-06', joining:'2025-08-06', resignation:null,         active:'Yes', managerEmail:'suraj@olioglobaladtech.com',    ecName:'mitali',             ecPhone:'8454957336', ecRelation:'Parent' },
  { empId:'OLIO-064',  name:'Khushi Pandya',            email:'hr@olioglobaladtech.com',      phone:'9920850662', designationRaw:'Jr Associate in HR and Admin',               dob:'2002-03-10', joining:'2025-09-22', resignation:null,         active:'No',  managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                 ecPhone:null,         ecRelation:null },
  { empId:'OLIO-065',  name:'Tanvi More',               email:'tanvi@olioglobaladtech.com',   phone:'9322326616', designationRaw:'Client Growth Associate (Client Servicing)', dob:'2002-08-01', joining:'2025-09-22', resignation:null,         active:'Yes', managerEmail:'amol@olioglobaladtech.com',     ecName:'Viswash',            ecPhone:'7977557206', ecRelation:'Friend' },
  { empId:'OLIO-066',  name:'Anchal Singh',             email:'anchal@olioglobaladtech.com',  phone:'8828410594', designationRaw:'Business Development Consultant',            dob:'2000-09-29', joining:'2025-10-01', resignation:null,         active:'No',  managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                 ecPhone:null,         ecRelation:null },
  { empId:'OLIO-067',  name:'Manasi Kambli',            email:'manasi@olioglobaladtech.com',  phone:'8850549574', designationRaw:'Performance Marketing Associate',            dob:'1999-05-18', joining:'2025-09-30', resignation:null,         active:'No',  managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                 ecPhone:null,         ecRelation:null },
  { empId:'OLIO-068',  name:'Rajesh Dattatray Nargale', email:'rajesh@olioglobaladtech.com',  phone:'7030701652', designationRaw:'Video Editor',                               dob:'1998-12-23', joining:'2025-12-15', resignation:'2026-03-17', active:'No',  managerEmail:'vinay@olioglobaladtech.com',    ecName:'Dattatray Nargale',  ecPhone:'7030701652', ecRelation:'Parent' },
  { empId:'OLIO-069',  name:'Mandar Kamble',            email:'mandar@olioglobaladtech.com',  phone:'9167883238', designationRaw:'UI UX Designer',                             dob:'1998-03-11', joining:'2026-01-08', resignation:null,         active:'Yes', managerEmail:'vanita@olioglobaladtech.com',   ecName:'VIshwas Sir',        ecPhone:'9768977853', ecRelation:'Other' },
  { empId:'OLIO-070',  name:'Vanita Gaware',            email:'vanita@olioglobaladtech.com',  phone:'9082786699', designationRaw:'Product Manager',                            dob:'1990-11-01', joining:'2026-01-08', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:'Vishwas',            ecPhone:'9768977853', ecRelation:'Other' },
  { empId:'OLIO-071',  name:'Rahul Jadhav',             email:'rahul@olioglobaladtech.com',   phone:'9870893554', designationRaw:'Junior UI/UX Designer',                      dob:'1997-03-27', joining:'2026-01-12', resignation:null,         active:'Yes', managerEmail:'vanita@olioglobaladtech.com',   ecName:'Dhanraj',            ecPhone:'9892773110', ecRelation:'Parent' },
  { empId:'OLIO-072',  name:'Ayaan Shaikh',             email:'ayaan@olioglobaladtech.com',   phone:'7304624478', designationRaw:'SEO Executive',                              dob:'2005-03-29', joining:'2026-03-23', resignation:null,         active:'Yes', managerEmail:'suraj@olioglobaladtech.com',    ecName:'Fakruddin',          ecPhone:'8850394161', ecRelation:'Parent' },
  { empId:'OLIO-073',  name:'Shripad Bodhankar',        email:'shripad@olioglobaladtech.com', phone:'8208249727', designationRaw:'Video Editor Intern',                        dob:'1996-04-04', joining:'2026-03-24', resignation:null,         active:'Yes', managerEmail:'vinay@olioglobaladtech.com',    ecName:'Vaishnavi Bodhankar',ecPhone:'9284747211', ecRelation:'Spouse' },
];

const EMP_IDS = RAW_EMPLOYEES.map(e => e.empId);

function normaliseDesig(raw) {
  const t = raw.trim().toLowerCase();
  if (t === 'sde') return 'SDE';
  if (t === 'video production') return 'Video Production';
  const match = DESIGNATION_MAP.find(d => d.name.toLowerCase() === t);
  return match ? match.name : raw.trim();
}

function resolveStatus(active, resignationDate) {
  if (active === 'Yes') return 'active';
  if (resignationDate) return 'terminated';
  return 'inactive';
}

function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.length > 1 ? parts.slice(1).join(' ') : '.' };
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// Probation status: if probationEndDate is in the past → confirmed, else ongoing
function probationStatus(joiningDate) {
  const endDate = addMonths(new Date(joiningDate), 6);
  return endDate <= new Date() ? 'confirmed' : 'ongoing';
}

async function run() {
  console.log('Connecting to PROD database…');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.\n');

  // ── 1. Find company ─────────────────────────────────────────────────────────
  const company = await Company.findOne({ name: /olio/i }).lean();
  if (!company) { console.error('Company not found.'); process.exit(1); }
  console.log(`Company: ${company.name} (${company._id})\n`);
  const companyId = company._id;

  // ── 2. Delete old employees + their users + userRoles ───────────────────────
  console.log('── Step 1: Cleanup old records ────────────────────────────────');
  const oldEmps = await Employee.find({ company_id: companyId, employeeId: { $in: EMP_IDS } }).lean();
  const oldUserIds = oldEmps.map(e => e.user_id).filter(Boolean);

  await UserRole.deleteMany({ company_id: companyId, user_id: { $in: oldUserIds } });
  await User.deleteMany({ _id: { $in: oldUserIds } });
  await Employee.deleteMany({ company_id: companyId, employeeId: { $in: EMP_IDS } });

  console.log(`  Deleted ${oldEmps.length} employees, ${oldUserIds.length} user accounts, their roles.\n`);

  // ── 3. Upsert designations ──────────────────────────────────────────────────
  console.log('── Step 2: Upsert designations ────────────────────────────────');
  const designationIdMap = {};
  for (const d of DESIGNATION_MAP) {
    const doc = await Designation.findOneAndUpdate(
      { company_id: companyId, name: d.name },
      { $setOnInsert: { company_id: companyId, name: d.name, level: d.level, isActive: true } },
      { upsert: true, returnDocument: 'after' }
    );
    designationIdMap[d.name] = doc._id;
  }
  console.log(`  ${DESIGNATION_MAP.length} designations ready.\n`);

  // ── 4. Load Employee role + default leave template ──────────────────────────
  console.log('── Step 3: Load role + leave template ─────────────────────────');
  const employeeRole = await Role.findOne({ company_id: companyId, name: 'Employee' }).lean();
  if (!employeeRole) { console.error('Employee role not found for this company!'); process.exit(1); }
  console.log(`  Role "Employee": ${employeeRole._id}`);

  const defaultTemplate = await LeaveTemplate.findOne({ company_id: companyId, isDefault: true }).lean()
    || await LeaveTemplate.findOne({ company_id: companyId }).lean();
  console.log(`  Leave template: ${defaultTemplate ? defaultTemplate.name : 'NONE (will skip)'}\n`);

  // ── 5. Check for Siddhesh Mane in DB ────────────────────────────────────────
  const siddheshUser = await User.findOne({ company_id: companyId, email: 'siddhesh@olioglobaladtech.com' }).lean();
  const siddheshEmp  = siddheshUser
    ? await Employee.findOne({ company_id: companyId, user_id: siddheshUser._id }).lean()
    : await Employee.findOne({ company_id: companyId, email: 'siddhesh@olioglobaladtech.com' }).lean();

  console.log(`── Siddhesh Mane in DB: ${siddheshEmp ? `YES (${siddheshEmp.employeeId})` : 'NOT FOUND — his reports will have no manager set'}\n`);

  // ── 6. Insert employees + create User accounts ──────────────────────────────
  console.log('── Step 4: Insert employees + portal accounts ──────────────────');

  const insertedByEmpId  = {}; // empId → { _id, user_id }
  const emailToEmpMongoId = {};

  for (const raw of RAW_EMPLOYEES) {
    const { firstName, lastName } = splitName(raw.name);
    const desigName = normaliseDesig(raw.designationRaw);
    const desigId   = designationIdMap[desigName] || null;
    const status    = resolveStatus(raw.active, raw.resignation);
    const joining   = new Date(raw.joining);
    const probEnd   = addMonths(joining, 6);
    const probStat  = probationStatus(raw.joining);

    // Create User account — temp password = phone number
    const hashedPwd = await bcrypt.hash(raw.phone, 12);
    const user = await User.create({
      company_id: companyId,
      firstName,
      lastName,
      email:  raw.email.toLowerCase(),
      password: hashedPwd,
      phone:  raw.phone || null,
      status: raw.active === 'Yes' ? 'active' : 'inactive',
    });

    // Assign Employee role
    await UserRole.create({
      user_id:    user._id,
      role_id:    employeeRole._id,
      company_id: companyId,
      assignedBy: null,
    });

    // Build employee doc
    const empDoc = await Employee.create({
      company_id:          companyId,
      employeeId:          raw.empId,
      firstName,
      lastName,
      email:               raw.email.toLowerCase(),
      phone:               raw.phone || null,
      dateOfBirth:         raw.dob ? new Date(raw.dob) : null,
      joiningDate:         joining,
      designation_id:      desigId,
      status,
      isActive:            raw.active === 'Yes',
      lastWorkingDay:      raw.resignation ? new Date(raw.resignation) : null,
      probationDays:       180,
      probationEndDate:    probEnd,
      probationStatus:     probStat,
      leaveTemplate_id:    defaultTemplate ? defaultTemplate._id : null,
      emergencyContact: {
        name:     raw.ecName     || null,
        phone:    raw.ecPhone    || null,
        relation: raw.ecRelation || null,
      },
      user_id: user._id,
    });

    insertedByEmpId[raw.empId]              = { _id: empDoc._id, userId: user._id };
    emailToEmpMongoId[raw.email.toLowerCase()] = empDoc._id;

    console.log(`  ✓ ${raw.empId.padEnd(10)} ${raw.name.padEnd(30)} [${desigName}] ${status} | probation ends ${probEnd.toISOString().slice(0,10)} (${probStat})`);
  }

  // ── 7. Link reporting managers ───────────────────────────────────────────────
  console.log('\n── Step 5: Link reporting managers ────────────────────────────');

  // Build full email → employeeId map including Siddhesh if found
  const allEmps = await Employee.find({ company_id: companyId, email: { $ne: null } }).lean();
  const emailToAllEmpId = {};
  for (const e of allEmps) {
    if (e.email) emailToAllEmpId[e.email.toLowerCase()] = e._id;
  }

  let linked = 0, missing = 0;
  for (const raw of RAW_EMPLOYEES) {
    if (!raw.managerEmail) continue;
    const managerId = emailToAllEmpId[raw.managerEmail.toLowerCase()];
    if (!managerId) {
      console.log(`  ⚠  ${raw.empId} → manager ${raw.managerEmail} not found`);
      missing++;
      continue;
    }
    const empId = insertedByEmpId[raw.empId]?._id;
    if (!empId || managerId.toString() === empId.toString()) continue;

    await Employee.updateOne({ _id: empId }, { $set: { reportingManager_id: managerId } });
    linked++;
  }
  console.log(`  Linked: ${linked} | Missing: ${missing}\n`);

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Employees inserted : ${RAW_EMPLOYEES.length}`);
  console.log(`  Portal accounts    : ${RAW_EMPLOYEES.length} (temp password = phone number)`);
  console.log(`  Role assigned      : Employee`);
  console.log(`  Probation          : 6 months from joining date`);
  console.log(`  Manager links      : ${linked} linked, ${missing} missing (Siddhesh Mane not in employee list)`);
  console.log('══════════════════════════════════════════════════════════════');

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => {
  console.error('Fatal error:', err.message);
  console.error(err);
  mongoose.disconnect();
  process.exit(1);
});
