/**
 * Seed Script: Create designations + employees for Olio Global on PROD
 * Run: node scripts/seedOlioEmployees.js
 */

require('dotenv').config({ path: '.env.production' });
const mongoose = require('mongoose');

const Company     = require('../src/models/Company');
const Designation = require('../src/models/Designation');
const Employee    = require('../src/models/Employee');

// ─── Designations to create ──────────────────────────────────────────────────
// name → level mapping (intern | junior | mid | senior | lead | manager | director | executive)
const DESIGNATION_MAP = [
  { name: 'SDE',                                          level: 'mid'      },
  { name: 'Junior Developer',                             level: 'junior'   },
  { name: 'Senior Developer',                             level: 'senior'   },
  { name: 'Project Lead & UI Developer',                  level: 'lead'     },
  { name: 'Account Manager',                              level: 'mid'      },
  { name: 'Design Executive',                             level: 'mid'      },
  { name: 'Operations Head & SEO Manager',                level: 'manager'  },
  { name: 'SEM Manager',                                  level: 'manager'  },
  { name: 'SEM Executive',                                level: 'junior'   },
  { name: 'SEO Executive',                                level: 'junior'   },
  { name: 'SEO Intern',                                   level: 'intern'   },
  { name: 'UI UX Designer',                               level: 'mid'      },
  { name: 'Junior UI/UX Designer',                        level: 'junior'   },
  { name: 'Sales Executive',                              level: 'junior'   },
  { name: 'HR',                                           level: 'mid'      },
  { name: 'Jr Associate in HR and Admin',                 level: 'junior'   },
  { name: 'Social Media Manager',                         level: 'mid'      },
  { name: 'Video Editor',                                 level: 'junior'   },
  { name: 'Video Editor Intern',                          level: 'intern'   },
  { name: 'Video Production',                             level: 'mid'      },
  { name: 'Content Writer',                               level: 'junior'   },
  { name: 'Graphic Designer',                             level: 'junior'   },
  { name: 'Business Development Consultant',              level: 'mid'      },
  { name: 'Performance Marketing Associate',              level: 'junior'   },
  { name: 'Client Growth Associate (Client Servicing)',   level: 'junior'   },
  { name: 'Product Manager',                              level: 'manager'  },
];

// ─── Raw employee data ────────────────────────────────────────────────────────
// designationRaw is the raw string from the sheet (normalised below)
const RAW_EMPLOYEES = [
  { empId:'EMPTEST01', name:'Yash chaudhari',          email:'chaudhariyash@gmail.com',      phone:'9096842842', designationRaw:'sde',                                         dob:'2000-05-27', joining:'2025-05-06', resignation:null,         active:'No',  managerEmail:'sagar@olioglobaladtech.com',    ecName:'YASH PAR',          ecPhone:'9885236950', ecRelation:'Parent' },
  { empId:'OLIO-003',  name:'Vishwas Tupe',             email:'vishwas@olioglobaladtech.com',  phone:'7977557206', designationRaw:'Account Manager',                             dob:'1993-03-17', joining:'2016-01-15', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                ecPhone:null,         ecRelation:null },
  { empId:'OLIO-004',  name:'Sagar Gala',               email:'sagar@olioglobaladtech.com',    phone:'9028806501', designationRaw:'Project Lead & UI Developer',                 dob:'1995-01-01', joining:'2020-10-12', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                ecPhone:null,         ecRelation:null },
  { empId:'OLIO-011',  name:'Pradeep Kumar',             email:'pradeep@olioglobaladtech.com',  phone:'9057489487', designationRaw:'Senior Developer',                            dob:'2000-01-01', joining:'2022-05-27', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                ecPhone:null,         ecRelation:null },
  { empId:'OLIO-013',  name:'Manish Jadon',              email:'manish@olioglobaladtech.com',   phone:'9131732810', designationRaw:'Design Executive',                            dob:'1998-03-24', joining:'2022-03-07', resignation:null,         active:'Yes', managerEmail:'amol@olioglobaladtech.com',     ecName:null,                ecPhone:null,         ecRelation:null },
  { empId:'OLIO-019',  name:'Suraj Shinde',              email:'suraj@olioglobaladtech.com',    phone:'9890730590', designationRaw:'Operations Head & SEO Manager',               dob:'1995-12-13', joining:'2022-06-01', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:'Vishwas',           ecPhone:'7977557206', ecRelation:'Parent' },
  { empId:'OLIO-033',  name:'Kiran Navade',              email:'kiran@olioglobaladtech.com',    phone:'9595441999', designationRaw:'SEM Manager',                                 dob:'1990-08-06', joining:'2023-01-02', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                ecPhone:null,         ecRelation:null },
  { empId:'OLIO-039',  name:'Aniket Kharat',             email:'aniket@olioglobaladtech.com',   phone:'8369961422', designationRaw:'UI UX Designer',                              dob:'2000-01-01', joining:'2023-07-24', resignation:'2026-01-16', active:'No',  managerEmail:'suraj@olioglobaladtech.com',    ecName:'vishwas',           ecPhone:'9768977853', ecRelation:'Other' },
  { empId:'OLIO-045',  name:'Shaun Caldeira',            email:'shaun@olioglobaladtech.com',    phone:'7303197934', designationRaw:'Sales Executive',                             dob:'2002-02-15', joining:'2024-01-08', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                ecPhone:null,         ecRelation:null },
  { empId:'OLIO-045A', name:'Sarita Nikale',             email:'hrms@olioglobaladtech.com',     phone:'9075795181', designationRaw:'HR',                                          dob:'1989-09-18', joining:'2024-03-01', resignation:null,         active:'Yes', managerEmail:'amol@olioglobaladtech.com',     ecName:'Vishwas',           ecPhone:'7977557206', ecRelation:'Friend' },
  { empId:'OLIO-047',  name:'Charul Bandre',             email:'charul@olioglobaladtech.com',   phone:'8693065838', designationRaw:'SEO Executive',                               dob:'2001-10-03', joining:'2024-05-14', resignation:'2026-01-15', active:'No',  managerEmail:'suraj@olioglobaladtech.com',    ecName:'Vishwas',           ecPhone:'9768977853', ecRelation:'Other' },
  { empId:'OLIO-048',  name:'Shobha Narvekar',           email:'shobha@olioglobaladtech.com',   phone:'8369845715', designationRaw:'Social Media Manager',                        dob:'1998-03-10', joining:'2024-08-26', resignation:null,         active:'Yes', managerEmail:'amol@olioglobaladtech.com',     ecName:'Vishwas',           ecPhone:'7977557206', ecRelation:'Parent' },
  { empId:'OLIO-049',  name:'Himesh Bari',               email:'himesh@olioglobaladtech.com',   phone:'9673869954', designationRaw:'SEO Executive',                               dob:'2002-05-18', joining:'2024-09-02', resignation:null,         active:'Yes', managerEmail:'suraj@olioglobaladtech.com',    ecName:'Suryasan Bari',     ecPhone:'7875113897', ecRelation:'Parent' },
  { empId:'OLIO-050',  name:'Kshitij Shelar',            email:'kshitij@olioglobaladtech.com',  phone:'7666490331', designationRaw:'Video Editor',                                dob:'2002-02-23', joining:'2024-09-13', resignation:null,         active:'No',  managerEmail:'vinay@olioglobaladtech.com',    ecName:null,                ecPhone:null,         ecRelation:null },
  { empId:'OLIO-053',  name:'Vinay Lande',               email:'vinay@olioglobaladtech.com',    phone:'8805158850', designationRaw:'Video production',                            dob:'1994-10-12', joining:'2024-08-01', resignation:null,         active:'Yes', managerEmail:'amol@olioglobaladtech.com',     ecName:'Test',              ecPhone:'7894561230', ecRelation:'Parent' },
  { empId:'OLIO-055',  name:'Yash Chaudhari',            email:'yash@olioglobaladtech.com',     phone:'9096842842', designationRaw:'Junior Developer',                            dob:'2002-05-27', joining:'2024-11-27', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:'Vishwas',           ecPhone:'7977557206', ecRelation:'Other' },
  { empId:'OLIO-056',  name:'Prashant Navade',           email:'prashant@olioglobaladtech.com', phone:'8379990333', designationRaw:'SEM Executive',                               dob:'1988-09-25', joining:'2024-11-01', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                ecPhone:null,         ecRelation:null },
  { empId:'OLIO-057',  name:'Saurabh Wadhwani',          email:'saurabh@olioglobaladtech.com',  phone:'7974050304', designationRaw:'Content Writer',                              dob:'1998-03-10', joining:'2024-12-02', resignation:null,         active:'Yes', managerEmail:'suraj@olioglobaladtech.com',    ecName:'Manohar Wadhwani',  ecPhone:'9179360304', ecRelation:'Parent' },
  { empId:'OLIO-058',  name:'Divya Chopra',              email:'divya@olioglobaladtech.com',    phone:'9819697056', designationRaw:'Account Manager',                             dob:'1995-08-13', joining:'2025-06-16', resignation:null,         active:'No',  managerEmail:'suraj@olioglobaladtech.com',    ecName:null,                ecPhone:null,         ecRelation:null },
  { empId:'OLIO-060',  name:'Reshma Pawar',              email:'reshma@olioglobaladtech.com',   phone:'8169883563', designationRaw:'Graphic Designer',                            dob:'1991-08-15', joining:'2025-06-16', resignation:null,         active:'No',  managerEmail:'amol@olioglobaladtech.com',     ecName:null,                ecPhone:null,         ecRelation:null },
  { empId:'OLIO-061',  name:'Muskan Matwani',            email:'muskan@olioglobaladtech.com',   phone:'8955499661', designationRaw:'Account Manager',                             dob:'1999-10-12', joining:'2025-06-23', resignation:null,         active:'Yes', managerEmail:'suraj@olioglobaladtech.com',    ecName:null,                ecPhone:null,         ecRelation:null },
  { empId:'OLIO-062',  name:'Mitali Talegaonkar',        email:'mitali@olioglobaladtech.com',   phone:'8454957336', designationRaw:'SEO Intern',                                  dob:'2000-11-06', joining:'2025-08-06', resignation:null,         active:'Yes', managerEmail:'suraj@olioglobaladtech.com',    ecName:'mitali',            ecPhone:'8454957336', ecRelation:'Parent' },
  { empId:'OLIO-064',  name:'Khushi Pandya',             email:'hr@olioglobaladtech.com',       phone:'9920850662', designationRaw:'Jr Associate in HR and Admin',                dob:'2002-03-10', joining:'2025-09-22', resignation:null,         active:'No',  managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                ecPhone:null,         ecRelation:null },
  { empId:'OLIO-065',  name:'Tanvi More',                email:'tanvi@olioglobaladtech.com',    phone:'9322326616', designationRaw:'Client Growth Associate (Client Servicing)',  dob:'2002-08-01', joining:'2025-09-22', resignation:null,         active:'Yes', managerEmail:'amol@olioglobaladtech.com',     ecName:'Viswash',           ecPhone:'7977557206', ecRelation:'Friend' },
  { empId:'OLIO-066',  name:'Anchal Singh',              email:'anchal@olioglobaladtech.com',   phone:'8828410594', designationRaw:'Business Development Consultant',             dob:'2000-09-29', joining:'2025-10-01', resignation:null,         active:'No',  managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                ecPhone:null,         ecRelation:null },
  { empId:'OLIO-067',  name:'Manasi Kambli',             email:'manasi@olioglobaladtech.com',   phone:'8850549574', designationRaw:'Performance Marketing Associate',             dob:'1999-05-18', joining:'2025-09-30', resignation:null,         active:'No',  managerEmail:'siddhesh@olioglobaladtech.com', ecName:null,                ecPhone:null,         ecRelation:null },
  { empId:'OLIO-068',  name:'Rajesh Dattatray Nargale',  email:'rajesh@olioglobaladtech.com',   phone:'7030701652', designationRaw:'Video Editor',                                dob:'1998-12-23', joining:'2025-12-15', resignation:'2026-03-17', active:'No',  managerEmail:'vinay@olioglobaladtech.com',    ecName:'Dattatray Nargale', ecPhone:'7030701652', ecRelation:'Parent' },
  { empId:'OLIO-069',  name:'Mandar Kamble',             email:'mandar@olioglobaladtech.com',   phone:'9167883238', designationRaw:'UI UX Designer',                              dob:'1998-03-11', joining:'2026-01-08', resignation:null,         active:'Yes', managerEmail:'vanita@olioglobaladtech.com',   ecName:'VIshwas Sir',       ecPhone:'9768977853', ecRelation:'Other' },
  { empId:'OLIO-070',  name:'Vanita Gaware',             email:'vanita@olioglobaladtech.com',   phone:'9082786699', designationRaw:'Product Manager',                             dob:'1990-11-01', joining:'2026-01-08', resignation:null,         active:'Yes', managerEmail:'siddhesh@olioglobaladtech.com', ecName:'Vishwas',           ecPhone:'9768977853', ecRelation:'Other' },
  { empId:'OLIO-071',  name:'Rahul Jadhav',              email:'rahul@olioglobaladtech.com',    phone:'9870893554', designationRaw:'Junior UI/UX Designer',                       dob:'1997-03-27', joining:'2026-01-12', resignation:null,         active:'Yes', managerEmail:'vanita@olioglobaladtech.com',   ecName:'Dhanraj',           ecPhone:'9892773110', ecRelation:'Parent' },
  { empId:'OLIO-072',  name:'Ayaan Shaikh',              email:'ayaan@olioglobaladtech.com',    phone:'7304624478', designationRaw:'SEO Executive',                               dob:'2005-03-29', joining:'2026-03-23', resignation:null,         active:'Yes', managerEmail:'suraj@olioglobaladtech.com',    ecName:'Fakruddin',         ecPhone:'8850394161', ecRelation:'Parent' },
  { empId:'OLIO-073',  name:'Shripad Bodhankar',         email:'shripad@olioglobaladtech.com',  phone:'8208249727', designationRaw:'Video Editor Intern',                         dob:'1996-04-04', joining:'2026-03-24', resignation:null,         active:'Yes', managerEmail:'vinay@olioglobaladtech.com',    ecName:'Vaishnavi Bodhankar',ecPhone:'9284747211', ecRelation:'Spouse' },
];

// Normalise designation name for lookup
function normaliseDesig(raw) {
  const t = raw.trim().toLowerCase();
  if (t === 'sde') return 'SDE';
  if (t === 'video production') return 'Video Production';
  // Find matching name (case-insensitive)
  const match = DESIGNATION_MAP.find(d => d.name.toLowerCase() === t);
  return match ? match.name : raw.trim();
}

// Determine employee status
function resolveStatus(active, resignationDate) {
  if (active === 'Yes') return 'active';
  if (resignationDate) return 'terminated';
  return 'inactive';
}

// Split "First Last" or "First Mid Last"
function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0];
  const lastName  = parts.length > 1 ? parts.slice(1).join(' ') : '.';
  return { firstName, lastName };
}

async function run() {
  console.log('Connecting to PROD database…');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.\n');

  // ── 1. Find Olio Global company ─────────────────────────────────────────────
  const company = await Company.findOne({ slug: 'olio-global-adtech' })
    .lean()
    .catch(() => null)
    || await Company.findOne({ name: /olio/i }).lean();

  if (!company) {
    console.error('Could not find Olio Global company. Aborting.');
    process.exit(1);
  }
  console.log(`Company: ${company.name} (${company._id})\n`);
  const companyId = company._id;

  // ── 2. Upsert designations ──────────────────────────────────────────────────
  console.log('Creating designations…');
  const designationIdMap = {}; // name → ObjectId

  for (const d of DESIGNATION_MAP) {
    const doc = await Designation.findOneAndUpdate(
      { company_id: companyId, name: d.name },
      { $setOnInsert: { company_id: companyId, name: d.name, level: d.level, isActive: true } },
      { upsert: true, new: true }
    );
    designationIdMap[d.name] = doc._id;
    console.log(`  ✓ ${d.name} [${d.level}]`);
  }
  console.log(`\n${DESIGNATION_MAP.length} designations ready.\n`);

  // ── 3. Build email → employeeId map for manager lookups ────────────────────
  // We'll do two passes: first insert all employees without manager, then patch manager_id
  // so we handle ordering issues (manager added later in list).

  // Pre-load existing employees by email for manager resolution
  const existingByEmail = {};
  const allExisting = await Employee.find({ company_id: companyId }).lean();
  for (const e of allExisting) {
    if (e.email) existingByEmail[e.email.toLowerCase()] = e._id;
  }

  // ── 4. Upsert employees (without manager first) ─────────────────────────────
  console.log('Upserting employees…');
  const insertedIdByEmpId = {}; // empId → _id

  for (const raw of RAW_EMPLOYEES) {
    const { firstName, lastName } = splitName(raw.name);
    const desigName  = normaliseDesig(raw.designationRaw);
    const desigId    = designationIdMap[desigName] || null;
    const status     = resolveStatus(raw.active, raw.resignation);

    const payload = {
      company_id:     companyId,
      employeeId:     raw.empId,
      firstName,
      lastName,
      email:          raw.email || null,
      phone:          raw.phone || null,
      dateOfBirth:    raw.dob   ? new Date(raw.dob)   : null,
      joiningDate:    new Date(raw.joining),
      designation_id: desigId,
      status,
      isActive:       raw.active === 'Yes',
      lastWorkingDay: raw.resignation ? new Date(raw.resignation) : null,
      emergencyContact: {
        name:     raw.ecName     || null,
        phone:    raw.ecPhone    || null,
        relation: raw.ecRelation || null,
      },
    };

    const doc = await Employee.findOneAndUpdate(
      { company_id: companyId, employeeId: raw.empId },
      { $set: payload },
      { upsert: true, new: true }
    );

    insertedIdByEmpId[raw.empId] = doc._id;
    if (doc.email) existingByEmail[doc.email.toLowerCase()] = doc._id;

    console.log(`  ✓ ${raw.empId} — ${raw.name} [${desigName}] ${status}`);
  }

  // ── 5. Patch reporting managers ─────────────────────────────────────────────
  console.log('\nLinking reporting managers…');
  let linked = 0, skipped = 0;

  for (const raw of RAW_EMPLOYEES) {
    if (!raw.managerEmail) { skipped++; continue; }

    const managerId = existingByEmail[raw.managerEmail.toLowerCase()];
    if (!managerId) {
      console.log(`  ⚠ Manager not found for ${raw.empId} (${raw.managerEmail})`);
      skipped++;
      continue;
    }

    const empMongoId = insertedIdByEmpId[raw.empId];
    // Don't set self as manager
    if (managerId.toString() === empMongoId.toString()) { skipped++; continue; }

    await Employee.updateOne(
      { _id: empMongoId },
      { $set: { reportingManager_id: managerId } }
    );
    linked++;
  }
  console.log(`  Linked: ${linked}, Skipped/Missing: ${skipped}\n`);

  console.log('Done! All employees seeded successfully.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Error:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
