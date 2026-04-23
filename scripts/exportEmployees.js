/**
 * Export all Olio employee data to Excel
 */

require('dotenv').config({ path: '.env.production' });
const mongoose   = require('mongoose');
const ExcelJS    = require('exceljs');
const path       = require('path');

const Company     = require('../src/models/Company');
const Employee    = require('../src/models/Employee');
const Designation = require('../src/models/Designation');
const Location    = require('../src/models/Location');
const WorkPolicy  = require('../src/models/WorkPolicy');
const User        = require('../src/models/User');
const UserRole    = require('../src/models/UserRole');
const Role        = require('../src/models/Role');

async function run() {
  console.log('Connecting to PROD…');
  await mongoose.connect(process.env.MONGO_URI);

  const co  = await Company.findOne({ name: /olio/i }).lean();
  const cid = co._id;

  // Load all reference data
  const designations = await Designation.find({ company_id: cid }).lean();
  const locations    = await Location.find({ company_id: cid }).lean();
  const workPolicies = await WorkPolicy.find({ company_id: cid }).lean();
  const roles        = await Role.find({ company_id: cid }).lean();
  const userRoles    = await UserRole.find({ company_id: cid }).lean();

  const desigById  = Object.fromEntries(designations.map(d => [d._id.toString(), d.name]));
  const locById    = Object.fromEntries(locations.map(l => [l._id.toString(), l.name]));
  const wpById     = Object.fromEntries(workPolicies.map(w => [w._id.toString(), w.name]));
  const roleById   = Object.fromEntries(roles.map(r => [r._id.toString(), r.name]));

  // user_id → role names
  const userRoleMap = {};
  for (const ur of userRoles) {
    const uid = ur.user_id.toString();
    if (!userRoleMap[uid]) userRoleMap[uid] = [];
    userRoleMap[uid].push(roleById[ur.role_id.toString()] || '');
  }

  // Load employees with manager
  const emps = await Employee.find({ company_id: cid, employeeId: /^OLIO-/i, status: 'active' })
    .sort({ employeeId: 1 })
    .lean();

  // empId → name for manager lookup
  const empById = Object.fromEntries(emps.map(e => [e._id.toString(), `${e.firstName} ${e.lastName}`]));

  // ── Build Excel ─────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Olio Global HRMS';
  wb.created = new Date();

  const ws = wb.addWorksheet('Employees', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Column definitions
  ws.columns = [
    { header: 'Employee ID',         key: 'empId',          width: 14 },
    { header: 'First Name',          key: 'firstName',      width: 16 },
    { header: 'Last Name',           key: 'lastName',       width: 20 },
    { header: 'Email',               key: 'email',          width: 35 },
    { header: 'Phone',               key: 'phone',          width: 14 },
    { header: 'Date of Birth',       key: 'dob',            width: 14 },
    { header: 'Gender',              key: 'gender',         width: 10 },
    { header: 'Designation',         key: 'designation',    width: 35 },
    { header: 'Joining Date',        key: 'joiningDate',    width: 14 },
    { header: 'Employment Type',     key: 'empType',        width: 16 },
    { header: 'Status',              key: 'status',         width: 12 },
    { header: 'Work Mode',           key: 'workMode',       width: 10 },
    { header: 'Location',            key: 'location',       width: 22 },
    { header: 'Work Policy',         key: 'workPolicy',     width: 18 },
    { header: 'Probation End Date',  key: 'probEnd',        width: 18 },
    { header: 'Probation Status',    key: 'probStatus',     width: 16 },
    { header: 'Reporting Manager',   key: 'manager',        width: 25 },
    { header: 'Portal Role',         key: 'role',           width: 20 },
    { header: 'Last Working Day',    key: 'lwd',            width: 16 },
    { header: 'Emergency Contact',   key: 'ecName',         width: 20 },
    { header: 'EC Phone',            key: 'ecPhone',        width: 14 },
    { header: 'EC Relation',         key: 'ecRelation',     width: 14 },
    { header: 'Address',             key: 'address',        width: 35 },
    { header: 'City',                key: 'city',           width: 18 },
    { header: 'State',               key: 'state',          width: 18 },
    { header: 'PIN Code',            key: 'zip',            width: 10 },
    { header: 'Country',             key: 'country',        width: 12 },
    { header: 'Login Email',         key: 'loginEmail',     width: 35 },
    { header: 'Temp Password',       key: 'tempPwd',        width: 14 },
  ];

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height    = 30;

  // Status colour map
  const statusColors = {
    active:     'FFD9EAD3',
    inactive:   'FFFFF2CC',
    terminated: 'FFFCE5CD',
    notice:     'FFEAD1DC',
  };

  for (const emp of emps) {
    const primaryAddr = emp.addresses?.find(a => a.isPrimary) || emp.addresses?.[0];
    const managerName = emp.reportingManager_id ? (empById[emp.reportingManager_id.toString()] || '') : '';
    const roleNames   = emp.user_id ? (userRoleMap[emp.user_id.toString()] || []).join(', ') : '';

    const row = ws.addRow({
      empId:       emp.employeeId,
      firstName:   emp.firstName,
      lastName:    emp.lastName,
      email:       emp.email || '',
      phone:       emp.phone || '',
      dob:         emp.dateOfBirth ? new Date(emp.dateOfBirth) : '',
      gender:      emp.gender || '',
      designation: emp.designation_id ? (desigById[emp.designation_id.toString()] || '') : '',
      joiningDate: new Date(emp.joiningDate),
      empType:     emp.employmentType || '',
      status:      emp.status,
      workMode:    emp.workMode || '',
      location:    emp.location_id ? (locById[emp.location_id.toString()] || '') : '',
      workPolicy:  emp.workPolicy_id ? (wpById[emp.workPolicy_id.toString()] || '') : '',
      probEnd:     emp.probationEndDate ? new Date(emp.probationEndDate) : '',
      probStatus:  emp.probationStatus || '',
      manager:     managerName,
      role:        roleNames,
      lwd:         emp.lastWorkingDay ? new Date(emp.lastWorkingDay) : '',
      ecName:      emp.emergencyContact?.name || '',
      ecPhone:     emp.emergencyContact?.phone || '',
      ecRelation:  emp.emergencyContact?.relation || '',
      address:     primaryAddr?.street || '',
      city:        primaryAddr?.city || '',
      state:       primaryAddr?.state || '',
      zip:         primaryAddr?.zip || '',
      country:     primaryAddr?.country || '',
      loginEmail:  emp.email || '',
      tempPwd:     emp.employeeId,
    });

    // Date format
    ['dob','joiningDate','probEnd','lwd'].forEach(key => {
      const cell = row.getCell(key);
      if (cell.value instanceof Date) cell.numFmt = 'dd-mmm-yyyy';
    });

    // Row colour by status
    const fillColor = statusColors[emp.status] || 'FFFFFFFF';
    row.eachCell(cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
      cell.alignment = { vertical: 'middle', wrapText: false };
      cell.border    = {
        top:    { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left:   { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right:  { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };
    });

    row.height = 18;
  }

  // Auto filter
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: ws.columns.length },
  };

  // Legend sheet
  const legend = wb.addWorksheet('Legend');
  legend.columns = [{ header: 'Status', key: 'status', width: 16 }, { header: 'Meaning', key: 'meaning', width: 40 }];
  legend.getRow(1).font = { bold: true };
  [
    ['active',     'Currently employed'],
    ['inactive',   'Not currently active (e.g. on hold / left before confirmation)'],
    ['terminated', 'Resigned / contract ended (last working day recorded)'],
    ['notice',     'Serving notice period'],
  ].forEach(([s, m]) => {
    const r = legend.addRow({ status: s, meaning: m });
    r.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColors[s] } };
  });
  legend.addRow({});
  legend.addRow({ status: 'Temp Password', meaning: 'Employee ID (e.g. OLIO-055). Ask employee to change after first login.' });

  // Save file
  const outPath = path.join(__dirname, '..', '..', 'Olio_Employees_2026.xlsx');
  await wb.xlsx.writeFile(outPath);

  console.log(`\nExcel saved to: ${outPath}`);
  console.log(`Total employees exported: ${emps.length}`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Fatal:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
