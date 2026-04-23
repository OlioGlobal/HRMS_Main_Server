/**
 * User Manual Generator — Olio Workforce HRMS
 * Generates Word (.docx) + PDF for each module + one combined document
 */

const path = require('path');
const fs   = require('fs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
        BorderStyle, ShadingType, PageBreak, UnderlineType } = require('docx');

const OUT = path.join(__dirname, '..', '..', 'User_Manuals_OlioWorkforce');
['', 'modules', 'combined'].forEach(d => {
  const p = path.join(OUT, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const APP     = 'Olio Workforce';
const BASE_URL = 'https://olioworkforce.com';
const VERSION = '1.0';
const YEAR    = '2026';
const COMPANY = 'Olio Global AdTech LLP';

// ─── MODULE DATA ──────────────────────────────────────────────────────────────
const MODULES = [
  {
    id: '01', name: 'Login & Security',
    objective: 'Allow authorised employees to securely access the Olio Workforce portal.',
    purpose: 'Handles sign-in, session management, and password reset for all users.',
    benefits: [
      'Simple, one-screen login — just email and password',
      'Your session stays active while you work and renews automatically',
      'Logout from anywhere clears your session completely',
      'Password reset link sent directly to your email',
    ],
    sections: [
      {
        title: 'How to Login',
        url: `${BASE_URL}/login`,
        steps: [
          ['Open your browser and go to', `${BASE_URL}/login`],
          ['Enter your registered email address', null],
          ['Enter your password (first-time login: use your Employee ID, e.g. OLIO-055)', null],
          ['Click Sign In — you will land on your Dashboard', null],
        ],
      },
      {
        title: 'How to Logout',
        url: null,
        steps: [
          ['Click your profile picture or name in the top-right corner', null],
          ['Click Logout', null],
          ['You will be taken back to the login page', null],
        ],
      },
      {
        title: 'Forgot Password',
        url: `${BASE_URL}/forgot-password`,
        steps: [
          ['Click "Forgot Password?" on the login page', `${BASE_URL}/forgot-password`],
          ['Enter your email address and click Send Reset Link', null],
          ['Check your inbox — click the reset link (valid for 1 hour)', null],
          ['Enter and confirm your new password, then click Save', null],
        ],
      },
      {
        title: 'First-Time Login',
        url: null,
        steps: [
          ['Your temporary password is your Employee ID (e.g. OLIO-055)', null],
          ['Login with your HR email and that temporary password', null],
          ['You will be asked to set a new password — choose something strong (min. 8 characters)', null],
        ],
      },
    ],
  },

  {
    id: '02', name: 'Roles & Permissions',
    objective: 'Control what each employee can see and do in the portal.',
    purpose: 'Admins can create roles, assign permissions per module, and assign roles to employees.',
    benefits: [
      '5 ready-made roles: Super Admin, HR Manager, HR Staff, Manager, Employee',
      'Custom roles can be created for unique team structures',
      'Each permission can be scoped: Global / Department / Team / Self',
      'Changes apply immediately — no re-login needed',
    ],
    sections: [
      {
        title: 'View All Roles',
        url: `${BASE_URL}/dashboard/roles`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/roles`],
          ['All roles are listed — click any role to open it', null],
        ],
      },
      {
        title: 'Create a New Role',
        url: `${BASE_URL}/dashboard/roles`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/roles`],
          ['Click New Role', null],
          ['Enter a role name and click Save', null],
          ['The role is created with no permissions — assign them next', null],
        ],
      },
      {
        title: 'Edit Role Permissions',
        url: `${BASE_URL}/dashboard/roles`,
        steps: [
          ['Open a role from', `${BASE_URL}/dashboard/roles`],
          ['Each module is listed with actions: View, Create, Update, Delete, Export', null],
          ['Tick the actions you want to allow, then pick a scope from the dropdown', null],
          ['Click Save Permissions', null],
        ],
      },
      {
        title: 'Assign a Role to an Employee',
        url: `${BASE_URL}/dashboard/roles`,
        steps: [
          ['Open a role from', `${BASE_URL}/dashboard/roles`],
          ['Click the Assigned Users tab', null],
          ['Search for an employee and click Assign', null],
        ],
      },
    ],
  },

  {
    id: '03', name: 'Organisation Setup',
    objective: 'Set up your company structure — locations, departments, teams, and work policies.',
    purpose: 'Everything in the system (attendance, leave, payroll) is linked to your organisation structure. Set this up first.',
    benefits: [
      'Company profile with logo, fiscal year, and timezone',
      'Multiple office locations with optional geofencing for attendance',
      'Department and team hierarchy for reporting and access control',
      'Work policies define shift hours, grace time, overtime — used in attendance calculations',
    ],
    sections: [
      {
        title: 'Company Settings',
        url: `${BASE_URL}/dashboard/settings/company`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/settings/company`],
          ['Update company name, logo, fiscal year start, weekend days', null],
          ['Set your default timezone and time format (12h / 24h)', null],
          ['Click Save', null],
        ],
      },
      {
        title: 'Add / Edit Locations',
        url: `${BASE_URL}/dashboard/settings/locations`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/settings/locations`],
          ['Click Add Location — enter name, address, city, state, country', null],
          ['To enable geofence clock-in: toggle Geofencing ON, enter coordinates and radius (km)', null],
          ['Click Save', null],
        ],
      },
      {
        title: 'Add / Edit Departments',
        url: `${BASE_URL}/dashboard/settings/departments`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/settings/departments`],
          ['Click Add Department — enter name and optional parent department (for nesting)', null],
          ['Assign a department head from existing employees', null],
          ['Click Save', null],
        ],
      },
      {
        title: 'Add / Edit Teams',
        url: `${BASE_URL}/dashboard/settings/teams`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/settings/teams`],
          ['Click Add Team — enter name, pick the parent department, assign team lead', null],
          ['Click Save', null],
        ],
      },
      {
        title: 'Add / Edit Work Policies',
        url: `${BASE_URL}/dashboard/settings/work-policies`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/settings/work-policies`],
          ['Click Add Work Policy — enter name, shift type, work start/end times, working days', null],
          ['Set Grace Minutes (how late is forgiven), Late Mark After (minutes), Half-Day threshold (hours)', null],
          ['Set Absent threshold and Overtime threshold hours', null],
          ['Tick "Set as Default" if this policy should apply to all employees by default', null],
          ['Click Save', null],
        ],
      },
    ],
  },

  {
    id: '04', name: 'Employee Management',
    objective: 'Add, view, and manage all employee records in one place.',
    purpose: 'Every employee has a full profile — personal details, job info, reporting manager, portal access, and status history.',
    benefits: [
      'Employee IDs auto-generated (OLIO-001, OLIO-002, …)',
      '4-step guided form to add a new employee',
      'Portal login is separate from HR record — activate only when needed',
      'Employment status tracking: Active → Notice → Terminated',
      'View all direct reports under any employee',
    ],
    sections: [
      {
        title: 'View All Employees',
        url: `${BASE_URL}/dashboard/employees`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/employees`],
          ['Use the filters at the top to search by name, department, designation, or status', null],
          ['Click any row to open the employee profile', null],
        ],
      },
      {
        title: 'Add a New Employee',
        url: `${BASE_URL}/dashboard/employees/new`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/employees/new`],
          ['Step 1 — Personal: fill in name, email, phone, date of birth, gender, emergency contact', null],
          ['Step 2 — Job: joining date, designation, department, team, location, work policy, work mode', null],
          ['Step 3 — Portal Access: toggle ON to create a login account; temp password is shown once', null],
          ['Step 4 — Review: check all details and click Submit', null],
        ],
      },
      {
        title: 'Edit an Employee',
        url: `${BASE_URL}/dashboard/employees`,
        steps: [
          ['Open the employee profile from', `${BASE_URL}/dashboard/employees`],
          ['Click Edit on any section (Personal / Job / Emergency Contact)', null],
          ['Make your changes and click Save', null],
        ],
      },
      {
        title: 'Change Employee Status',
        url: `${BASE_URL}/dashboard/employees`,
        steps: [
          ['Open the employee profile', null],
          ['Click the status badge (Active / Notice / Inactive / Terminated)', null],
          ['For Terminated: enter the last working day', null],
          ['Click Confirm', null],
        ],
      },
      {
        title: 'View Reportees',
        url: `${BASE_URL}/dashboard/employees`,
        steps: [
          ['Open an employee profile', null],
          ['Go to the Reportees tab — all direct reports are listed', null],
          ['Click any name to open their profile', null],
        ],
      },
    ],
  },

  {
    id: '05', name: 'Designations',
    objective: 'Manage all job titles used across the organisation.',
    purpose: 'Designations define an employee\'s role level and are used in employee profiles, org charts, and payroll grades.',
    benefits: [
      'Standard list prevents duplicate or inconsistent job titles',
      '8 seniority levels: Intern → Junior → Mid → Senior → Lead → Manager → Director → Executive',
      'Shows employee count per designation for workforce planning',
    ],
    sections: [
      {
        title: 'View Designations',
        url: `${BASE_URL}/dashboard/settings/designations`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/settings/designations`],
          ['All designations are shown with level and employee count', null],
        ],
      },
      {
        title: 'Add a Designation',
        url: `${BASE_URL}/dashboard/settings/designations`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/settings/designations`],
          ['Click Add Designation', null],
          ['Enter name (e.g. Senior Developer), pick level, optionally link to a department', null],
          ['Click Save', null],
        ],
      },
      {
        title: 'Edit or Deactivate',
        url: `${BASE_URL}/dashboard/settings/designations`,
        steps: [
          ['Click the edit icon next to any designation', null],
          ['Update the name or level, or toggle Active OFF to hide it from new employee forms', null],
          ['Click Save', null],
        ],
      },
    ],
  },

  {
    id: '06', name: 'Leave Management',
    objective: 'Manage the full leave cycle — types, templates, balances, applications, and approvals.',
    purpose: 'Employees apply for leave, managers or HR approve it, and balances update automatically. All leave policies are enforced by the system.',
    benefits: [
      'System checks balance, gender rules, probation restrictions before allowing an application',
      'Auto LWP (unpaid leave) when balance runs out',
      'Pro-rated balance for employees who join mid-year',
      'Optional holidays — swap a fixed holiday for a personal one',
      'Real-time balance visible to employee and HR',
    ],
    sections: [
      {
        title: 'Manage Public Holidays',
        url: `${BASE_URL}/dashboard/settings/holidays`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/settings/holidays`],
          ['Click Add Holiday or Import from the calendar (Nager.Date)',  null],
          ['Mark a holiday as Optional if employees can exchange it', null],
          ['Set the optional holiday limit per employee in Settings → Company', null],
        ],
      },
      {
        title: 'Manage Leave Types',
        url: `${BASE_URL}/dashboard/settings/leave-types`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/settings/leave-types`],
          ['Click Add Leave Type — enter name, code (e.g. CL), kind (paid/unpaid)', null],
          ['Set days per year, reset cycle, min notice days, max days at once', null],
          ['Toggle gender restrictions or probation restrictions if needed', null],
          ['Click Save', null],
        ],
      },
      {
        title: 'Manage Leave Templates',
        url: `${BASE_URL}/dashboard/settings/leave-templates`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/settings/leave-templates`],
          ['Click Add Template — give it a name (e.g. Full Time Template)', null],
          ['Add leave types and optionally override the days for this template', null],
          ['Tick Set as Default if this applies to most employees', null],
          ['Click Save, then use Assign to attach it to employees', null],
        ],
      },
      {
        title: 'Apply for Leave (Employee)',
        url: `${BASE_URL}/dashboard/leave/apply`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/leave/apply`],
          ['Pick the leave type, from date, to date, and enter a reason', null],
          ['System shows your available balance and warns of any violations', null],
          ['Click Submit — your manager/HR gets notified', null],
        ],
      },
      {
        title: 'View My Leaves',
        url: `${BASE_URL}/dashboard/leave/my-leaves`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/leave/my-leaves`],
          ['See all your past and upcoming leave requests with status', null],
          ['Click Cancel on a pending request if you change your mind', null],
        ],
      },
      {
        title: 'Approve or Reject Leave (HR / Manager)',
        url: `${BASE_URL}/dashboard/leave/approvals`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/leave/approvals`],
          ['All pending requests are listed with employee name, leave type, dates, balance', null],
          ['Click Approve or Reject — add a note if rejecting', null],
          ['Employee is notified immediately', null],
        ],
      },
      {
        title: 'Check Leave Balances',
        url: `${BASE_URL}/dashboard/leave/balances`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/leave/balances`],
          ['Employees see their own balance for all leave types', null],
          ['HR can search by employee name to view anyone\'s balance', null],
          ['HR can manually adjust a balance — enter amount and reason', null],
        ],
      },
    ],
  },

  {
    id: '07', name: 'Attendance Management',
    objective: 'Track employee attendance automatically with clock-in/out, geofencing, and overtime.',
    purpose: 'Employees clock in and out through the portal. The system uses your work policy to calculate status (present, late, half-day, absent) and flags anomalies.',
    benefits: [
      'Location detected automatically — Office, WFH, or Remote clock-in',
      'Late, half-day, and absent status auto-calculated from your work policy',
      'Overtime hours tracked daily',
      'Missed clock-out flagged — employee can raise a regularization request',
      'Hourly cron auto-marks absent employees who never clocked in',
    ],
    sections: [
      {
        title: 'Clock In',
        url: `${BASE_URL}/dashboard/attendance/my`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/attendance/my`],
          ['Click Clock In — allow location access when prompted', null],
          ['System auto-detects: Office (within office geofence), WFH (within home geofence), Remote (outside both)', null],
          ['Your clock-in time is saved', null],
        ],
      },
      {
        title: 'Clock Out',
        url: `${BASE_URL}/dashboard/attendance/my`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/attendance/my`],
          ['Click Clock Out at the end of your day', null],
          ['System calculates total hours and overtime automatically', null],
        ],
      },
      {
        title: 'View My Attendance',
        url: `${BASE_URL}/dashboard/attendance/my`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/attendance/my`],
          ['Calendar shows each day colour-coded: Green = Present, Yellow = Late, Red = Absent, Blue = Leave', null],
          ['Click any date to see clock-in/out time and status details', null],
          ['Summary cards at the top show monthly totals', null],
        ],
      },
      {
        title: 'Raise a Regularization Request',
        url: `${BASE_URL}/dashboard/attendance/my`,
        steps: [
          ['Click on a day where clock-in or clock-out is missing', null],
          ['Click Raise Regularization', null],
          ['Select what is missing: Clock In / Clock Out / Both', null],
          ['Enter the correct time and a reason', null],
          ['Submit — HR or Manager will review it', null],
        ],
      },
      {
        title: 'Attendance Management (HR)',
        url: `${BASE_URL}/dashboard/attendance/management`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/attendance/management`],
          ['Attendance tab: filter by employee, date, department, or status to find records', null],
          ['Click any record → Override to correct time or status (enter override reason)', null],
          ['Regularization tab: review and approve/reject employee requests', null],
        ],
      },
    ],
  },

  {
    id: '08', name: 'Salary Setup',
    objective: 'Configure how employee salaries are structured before running payroll.',
    purpose: 'Define salary components (Basic, HRA, PF, etc.), group them into grades and templates, then assign to employees.',
    benefits: [
      'Reusable components avoid manual recalculation every month',
      'Grades make it easy to assign standard pay bands (e.g. Grade 3 = ₹40k–₹60k)',
      'Salary history maintained — every revision is recorded with date',
      'Feeds directly into payroll with no manual rekeying',
    ],
    sections: [
      {
        title: 'Salary Components',
        url: `${BASE_URL}/dashboard/settings/salary-components`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/settings/salary-components`],
          ['Click Add Component — enter name (e.g. Basic Pay, HRA, PF Deduction)', null],
          ['Set type: Earning or Deduction', null],
          ['Set calculation: fixed amount or percentage of another component (e.g. HRA = 40% of Basic)', null],
          ['Click Save', null],
        ],
      },
      {
        title: 'Salary Grades',
        url: `${BASE_URL}/dashboard/settings/salary-grades`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/settings/salary-grades`],
          ['Click Add Grade — enter name (e.g. Grade 3 – Mid Level), min CTC, max CTC', null],
          ['Add the components that apply to this grade', null],
          ['Click Save', null],
        ],
      },
      {
        title: 'Set Employee Salary',
        url: `${BASE_URL}/dashboard/employees`,
        steps: [
          ['Open an employee profile from', `${BASE_URL}/dashboard/employees`],
          ['Go to the Salary tab', null],
          ['Click Set Salary — pick a template and enter the CTC amount', null],
          ['System auto-calculates the component-wise breakup', null],
          ['Set the effective date and click Save', null],
        ],
      },
    ],
  },

  {
    id: '09', name: 'Payroll Processing',
    objective: 'Run and approve monthly payroll for all active employees.',
    purpose: 'HR runs payroll for a month, reviews it, gets it approved, and marks it paid. Employees can download payslips after approval.',
    benefits: [
      'One-click payroll run for the entire company',
      'LWP (unpaid leave days) auto-deducted from attendance data',
      'Approval workflow — HR runs, approver signs off, finance marks paid',
      'Payslips available instantly after approval',
      'Full payroll history with audit trail',
    ],
    sections: [
      {
        title: 'Run Payroll',
        url: `${BASE_URL}/dashboard/payroll`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/payroll`],
          ['Click Run Payroll', null],
          ['Select the month and year', null],
          ['Click Run — payroll is created for all active employees', null],
          ['Review the summary: total employees, total amount, LWP deductions', null],
        ],
      },
      {
        title: 'Process & Approve Payroll',
        url: `${BASE_URL}/dashboard/payroll`  ,
        steps: [
          ['Open the payroll run from', `${BASE_URL}/dashboard/payroll`],
          ['Review individual records — check LWP days and net pay per employee', null],
          ['Click Process to lock the run and send for approval', null],
          ['Approver goes to Payroll → opens the run → clicks Approve', null],
        ],
      },
      {
        title: 'Mark as Paid',
        url: `${BASE_URL}/dashboard/payroll`,
        steps: [
          ['After bank transfer is complete, open the approved payroll run', null],
          ['Click Mark as Paid — enter the payment date', null],
          ['Employee payslips now show status as Paid', null],
        ],
      },
      {
        title: 'View & Download Payslips (Employee)',
        url: `${BASE_URL}/dashboard/payslips`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/payslips`],
          ['Select the month from the list', null],
          ['Payslip shows: earnings, deductions, and net pay', null],
          ['Click Download to save as PDF', null],
        ],
      },
    ],
  },

  {
    id: '10', name: 'Document Management',
    objective: 'Store, verify, and track all employee documents digitally.',
    purpose: 'Employees upload their documents, HR verifies them, policy documents are shared for acknowledgement, and compliance is tracked centrally.',
    benefits: [
      'All files stored securely on cloud (Backblaze B2) — not on local servers',
      'File format and size validated on upload',
      'HR can verify, reject, or bulk-verify documents',
      'Policy documents with version control and acknowledgement deadlines',
      'Compliance dashboard shows % completion per employee',
      'Expiring documents alerts at 30, 60, 90 days',
    ],
    sections: [
      {
        title: 'Upload My Documents (Employee)',
        url: `${BASE_URL}/dashboard/documents/my`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/documents/my`],
          ['You will see a checklist of required documents with status: Pending / Uploaded / Verified / Rejected', null],
          ['Click Upload next to any document type', null],
          ['Select your file — format and size are checked automatically', null],
          ['If a document was Rejected by HR, click Re-upload to submit a new file', null],
        ],
      },
      {
        title: 'Verify Documents (HR)',
        url: `${BASE_URL}/dashboard/documents/compliance`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/documents/compliance`],
          ['Select an employee to see their document list', null],
          ['Click Verify to approve, or Reject and enter a reason', null],
          ['Use Bulk Verify to approve multiple documents at once', null],
        ],
      },
      {
        title: 'Manage Policy Documents',
        url: `${BASE_URL}/dashboard/documents/policies`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/documents/policies`],
          ['Click Upload Policy — add file, version number, and acknowledgement deadline', null],
          ['Employees get notified to read and acknowledge', null],
          ['Uploading a new version automatically invalidates old acknowledgements', null],
        ],
      },
      {
        title: 'Compliance Dashboard',
        url: `${BASE_URL}/dashboard/documents/compliance`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/documents/compliance`],
          ['See document completion % for every employee', null],
          ['Filter by department, status, or document type', null],
        ],
      },
      {
        title: 'Expiring Documents',
        url: `${BASE_URL}/dashboard/documents/expiring`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/documents/expiring`],
          ['Filter by 30 / 60 / 90 days to see what is expiring soon', null],
          ['Contact employees to renew before expiry', null],
        ],
      },
      {
        title: 'Document Types Setup',
        url: `${BASE_URL}/dashboard/settings/document-types`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/settings/document-types`],
          ['Add or edit document types: name, category, allowed formats, max file size, expiry tracking', null],
          ['Set who can upload: HR only / Employee only / Both', null],
          ['Toggle Required to make it mandatory for all employees', null],
        ],
      },
    ],
  },

  {
    id: '11', name: 'Onboarding & Offboarding',
    objective: 'Track new employee onboarding and manage employee exits in a structured way.',
    purpose: 'System automatically identifies employees who need onboarding or offboarding. HR just works through the checklist.',
    benefits: [
      'No manual list — system detects new employees automatically',
      'Onboarding checklist pulls live data from Role, Leave, Salary, Documents, and Policy modules',
      'Offboarding auto-tracks: status, last working day, experience letter, final payroll',
      'Manual checkboxes for: knowledge transfer, assets returned, exit interview, access revoked',
      'Progress bar shows % complete at a glance',
      'Direct links to each module from the checklist',
    ],
    sections: [
      {
        title: 'Onboarding Dashboard',
        url: `${BASE_URL}/dashboard/boarding`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/boarding`],
          ['Click the Onboarding tab', null],
          ['All new employees with incomplete onboarding appear automatically', null],
          ['Expand a row to see the checklist: Role Assigned ✓, Leave Template ✓, Salary Set ✓, Documents ✓, Policy Acknowledged ✓', null],
          ['Click any checklist item link to go directly to that module and complete it', null],
          ['Once all items are done, click Complete Onboarding', null],
        ],
      },
      {
        title: 'Offboarding Dashboard',
        url: `${BASE_URL}/dashboard/boarding`,
        steps: [
          ['Go to', `${BASE_URL}/dashboard/boarding`],
          ['Click the Offboarding tab', null],
          ['Employees with status "Notice" appear automatically', null],
          ['Auto-tracked items (no manual action needed): Employment Status, Last Working Day, Experience Letter, Final Payroll', null],
          ['Manually tick when done: Knowledge Transfer, Assets Returned, Exit Interview, Access Revoked', null],
          ['Click Complete Offboarding — employee status changes to Terminated', null],
        ],
      },
    ],
  },
];

// ── COLOUR PALETTE ────────────────────────────────────────────────────────────
const C = {
  navy:   '1F3864',
  blue:   '2E75B6',
  light:  'DEEAF1',
  gray:   '595959',
  white:  'FFFFFF',
  black:  '222222',
  green:  '375623',
  url:    '1155CC',
};

// ── WORD HELPERS ──────────────────────────────────────────────────────────────

function para(runs, opts = {}) {
  return new Paragraph({ children: Array.isArray(runs) ? runs : [runs], ...opts });
}
function mkRun(text, opts = {}) {
  return new TextRun({ text, font: 'Calibri', ...opts });
}
function gap(before = 200, after = 100) {
  return para(mkRun(''), { spacing: { before, after } });
}
function coverPage(title, subtitle) {
  return [
    gap(2400, 0),
    para(mkRun(APP, { bold: true, size: 64, color: C.navy }), { alignment: AlignmentType.CENTER }),
    para(mkRun('Human Resource Management System', { size: 26, color: C.blue }), { alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
    para(mkRun('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', { color: C.blue }), { alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
    para(mkRun(title, { bold: true, size: 38, color: C.navy }), { alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
    para(mkRun(subtitle, { size: 26, color: C.gray }), { alignment: AlignmentType.CENTER, spacing: { after: 800 } }),
    para(mkRun(`Version ${VERSION}  ·  ${YEAR}  ·  ${COMPANY}`, { size: 20, color: C.gray }), { alignment: AlignmentType.CENTER }),
    para(new PageBreak()),
  ];
}
function h1(text) {
  return para(mkRun(text, { bold: true, size: 30, color: C.white }), {
    shading: { type: ShadingType.CLEAR, fill: C.navy },
    spacing: { before: 400, after: 160 },
    indent:  { left: 120, right: 120 },
  });
}
function h2(text) {
  return para(mkRun(text, { bold: true, size: 24, color: C.blue }), {
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.light } },
    spacing: { before: 280, after: 120 },
  });
}
function h3(text) {
  return para(mkRun(text, { bold: true, size: 22, color: C.navy }), {
    spacing: { before: 200, after: 80 },
  });
}
function bodyPara(text) {
  return para(mkRun(text, { size: 22, color: C.black }), { spacing: { after: 100 } });
}
function bullet(text) {
  return para(
    [mkRun('▸  ', { size: 22, color: C.blue, bold: true }), mkRun(text, { size: 22, color: C.black })],
    { indent: { left: 360 }, spacing: { after: 80 } }
  );
}
function stepRow(num, text, url) {
  const runs = [
    mkRun(`${num}.  `, { bold: true, size: 22, color: C.navy }),
    mkRun(text + (url ? '  ' : ''), { size: 22, color: C.black }),
  ];
  if (url) runs.push(mkRun(url, { size: 20, color: C.url, underline: { type: UnderlineType.SINGLE } }));
  return para(runs, { indent: { left: 360 }, spacing: { after: 100 } });
}
function urlBox(url) {
  return para(
    [mkRun('🔗  Direct link: ', { bold: true, size: 20, color: C.navy }), mkRun(url, { size: 20, color: C.url, underline: { type: UnderlineType.SINGLE } })],
    { shading: { type: ShadingType.CLEAR, fill: C.light }, indent: { left: 200, right: 200 }, spacing: { before: 80, after: 120 } }
  );
}

function buildModuleBody(mod) {
  const out = [];
  out.push(h1(`Module ${mod.id}:  ${mod.name}`));
  out.push(h2('Objective'));
  out.push(bodyPara(mod.objective));
  out.push(h2('Purpose'));
  out.push(bodyPara(mod.purpose));
  out.push(h2('Key Benefits'));
  mod.benefits.forEach(b => out.push(bullet(b)));
  out.push(gap(300, 0));
  out.push(h2('How to Use'));

  for (const sec of mod.sections) {
    out.push(h3(sec.title));
    if (sec.url) out.push(urlBox(sec.url));
    sec.steps.forEach(([text, url], i) => out.push(stepRow(i + 1, text, url)));
    out.push(gap(80, 0));
  }
  return out;
}

async function writeDocx(children, filePath) {
  const doc = new Document({ creator: COMPANY, title: `${APP} User Manual`, sections: [{ children }] });
  fs.writeFileSync(filePath, await Packer.toBuffer(doc));
}

// ── PDF HELPERS ───────────────────────────────────────────────────────────────

function writePDF(mods, filePath, combinedTitle) {
  return new Promise((resolve, reject) => {
    const PW = 595.28, PH = 841.89, ML = 55, TW = 485;

    // Use large top margin so content starts below header bar
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 55, bottom: 50, left: ML, right: ML },
      bufferPages: true,
      autoFirstPage: false,
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    let onCover = true;

    // Draw header on every new page (except cover)
    doc.on('pageAdded', () => {
      if (onCover) return;
      doc.save();
      doc.rect(0, 0, PW, 44).fill('#1F3864');
      doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold')
         .text(`${APP} — User Manual`, ML, 10, { width: TW * 0.65, lineBreak: false });
      doc.fillColor('#DEEAF1').fontSize(8.5).font('Helvetica')
         .text(COMPANY, ML, 27, { width: TW * 0.65, lineBreak: false });
      doc.fillColor('#DEEAF1').fontSize(8.5)
         .text(`v${VERSION}  ·  ${YEAR}`, PW - ML - 80, 18, { width: 80, align: 'right', lineBreak: false });
      doc.restore();
    });

    function newPage() {
      doc.addPage();
    }

    function drawH1(text) {
      doc.moveDown(0.3);
      const y = doc.y;
      doc.save();
      doc.rect(ML - 8, y - 3, TW + 16, 24).fill('#1F3864');
      doc.restore();
      doc.fillColor('#FFFFFF').fontSize(12).font('Helvetica-Bold')
         .text(text, ML + 4, y + 3, { width: TW - 8, lineBreak: false });
      doc.y = y + 26;
      doc.moveDown(0.4);
      doc.fillColor('#333333').fontSize(10).font('Helvetica');
    }

    function drawH2(text) {
      doc.moveDown(0.6);
      doc.fillColor('#2E75B6').fontSize(11).font('Helvetica-Bold').text(text, { width: TW });
      doc.moveDown(0.1);
      const ly = doc.y;
      doc.save();
      doc.moveTo(ML, ly).lineTo(ML + TW, ly).strokeColor('#DEEAF1').lineWidth(1).stroke();
      doc.restore();
      doc.moveDown(0.35);
      doc.fillColor('#333333').fontSize(10).font('Helvetica');
    }

    function drawH3(text) {
      doc.moveDown(0.5);
      doc.fillColor('#1F3864').fontSize(10.5).font('Helvetica-Bold').text(text, { width: TW });
      doc.moveDown(0.2);
      doc.fillColor('#333333').fontSize(10).font('Helvetica');
    }

    function drawBody(text) {
      doc.fillColor('#333333').fontSize(10).font('Helvetica').text(text, { width: TW });
      doc.moveDown(0.25);
    }

    function drawBullet(text) {
      doc.fillColor('#2E75B6').fontSize(10).font('Helvetica-Bold')
         .text('>  ', { continued: true, width: 18 });
      doc.fillColor('#333333').font('Helvetica').text(text, { width: TW - 18 });
    }

    function drawStep(num, text, url) {
      doc.fillColor('#1F3864').fontSize(10).font('Helvetica-Bold')
         .text(`${num}.  `, { continued: true, width: 28 });
      if (url) {
        doc.fillColor('#333333').font('Helvetica').text(text + '   ', { continued: true });
        doc.fillColor('#1155CC').font('Helvetica').text(url, { width: TW - 28 });
      } else {
        doc.fillColor('#333333').font('Helvetica').text(text, { width: TW - 28 });
      }
      doc.moveDown(0.15);
    }

    function drawUrlBox(url) {
      doc.moveDown(0.2);
      const y = doc.y;
      doc.save();
      doc.rect(ML - 4, y - 2, TW + 8, 17).fill('#DEEAF1');
      doc.restore();
      doc.fillColor('#1F3864').fontSize(9).font('Helvetica-Bold')
         .text('Link: ', ML + 4, y + 2, { continued: true, lineBreak: false });
      doc.fillColor('#1155CC').font('Helvetica').text(url, { lineBreak: false });
      doc.y = y + 20;
      doc.moveDown(0.3);
    }

    // ── Cover Page ─────────────────────────────────────────────────────────
    onCover = true;
    doc.addPage({ margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    doc.rect(0, 0, PW, PH).fill('#1F3864');
    doc.fillColor('#FFFFFF').fontSize(46).font('Helvetica-Bold')
       .text(APP, ML, 175, { width: TW, align: 'center', lineBreak: false });
    doc.fillColor('#DEEAF1').fontSize(15).font('Helvetica')
       .text('Human Resource Management System', ML, 232, { width: TW, align: 'center', lineBreak: false });
    doc.moveTo(ML + 50, 263).lineTo(PW - ML - 50, 263).strokeColor('#2E75B6').lineWidth(1.5).stroke();
    const covTitle = combinedTitle || `Module ${mods[0].id}: ${mods[0].name}`;
    const covSub   = combinedTitle ? 'All Modules — Full Reference Guide' : 'User Manual';
    doc.fillColor('#FFFFFF').fontSize(21).font('Helvetica-Bold')
       .text(covTitle, ML, 280, { width: TW, align: 'center', lineBreak: false });
    doc.fillColor('#DEEAF1').fontSize(13).font('Helvetica')
       .text(covSub, ML, 314, { width: TW, align: 'center', lineBreak: false });
    doc.fillColor('#DEEAF1').fontSize(9)
       .text(`Version ${VERSION}  ·  ${YEAR}  ·  ${COMPANY}`, ML, PH - 60, { width: TW, align: 'center', lineBreak: false });

    onCover = false;

    // ── Table of Contents ─────────────────────────────────────────────────
    if (combinedTitle) {
      newPage();
      drawH1('Table of Contents');
      mods.forEach((m, i) => {
        doc.fillColor('#333333').fontSize(10.5).font('Helvetica')
           .text(`${i + 1}.   Module ${m.id}:  ${m.name}`, { indent: 10, width: TW - 10 });
        doc.moveDown(0.3);
      });
    }

    // ── Module content ────────────────────────────────────────────────────
    for (const mod of mods) {
      newPage();
      drawH1(`Module ${mod.id}:  ${mod.name}`);
      drawH2('Objective');
      drawBody(mod.objective);
      drawH2('Purpose');
      drawBody(mod.purpose);
      drawH2('Key Benefits');
      mod.benefits.forEach(b => drawBullet(b));
      doc.moveDown(0.3);
      drawH2('How to Use');
      for (const sec of mod.sections) {
        drawH3(sec.title);
        if (sec.url) drawUrlBox(sec.url);
        sec.steps.forEach(([text, url], i) => drawStep(i + 1, text, url));
      }
    }

    // ── Page numbers (skip cover = page index 0) ──────────────────────────
    const range = doc.bufferedPageRange();
    let pNum = 1;
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      if (i === range.start) continue; // skip cover
      doc.save();
      doc.moveTo(ML, PH - 34).lineTo(ML + TW, PH - 34).strokeColor('#2E75B6').lineWidth(0.5).stroke();
      doc.fillColor('#888888').fontSize(7.5).font('Helvetica')
         .text(`${APP} HRMS  ·  Confidential`, ML, PH - 26, { width: TW - 50, lineBreak: false });
      doc.text(`Page ${pNum++}`, ML, PH - 26, { width: TW, align: 'right', lineBreak: false });
      doc.restore();
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Generating Word User Manuals — ${APP}\n`);

  for (const mod of MODULES) {
    const slug     = `Module_${mod.id}_${mod.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const wordPath = path.join(OUT, 'modules', `${slug}.docx`);
    const children = [...coverPage(`Module ${mod.id}: ${mod.name}`, 'User Manual'), ...buildModuleBody(mod)];
    await writeDocx(children, wordPath);
    console.log(`  ✓ Module ${mod.id}: ${mod.name}`);
  }

  // Combined
  const allChildren = [
    ...coverPage('Complete User Manual', 'All Modules — Full Reference Guide'),
    para(mkRun('Table of Contents', { bold: true, size: 32, color: C.navy }), { spacing: { before: 200, after: 200 } }),
    ...MODULES.map((m, i) => para(
      [mkRun(`${i + 1}.  `, { bold: true, size: 22, color: C.blue }), mkRun(`Module ${m.id}: ${m.name}`, { size: 22, color: C.black })],
      { spacing: { after: 80 } }
    )),
    para(new PageBreak()),
    ...MODULES.flatMap(mod => [...buildModuleBody(mod), para(new PageBreak())]),
  ];

  const cWord = path.join(OUT, 'combined', `${APP.replace(/ /g,'_')}_Complete_User_Manual.docx`);
  await writeDocx(allChildren, cWord);

  console.log(`\n  ✓ Combined document generated`);
  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  Output: ${OUT}`);
  console.log(`  Module files : ${MODULES.length} Word documents`);
  console.log(`  Combined     : 1 Word document`);
  console.log(`  Total        : ${MODULES.length + 1} files`);
  console.log('══════════════════════════════════════════════════════');
}

if (require.main === module) {
  main().catch(err => { console.error('Error:', err.message, err.stack); process.exit(1); });
}
