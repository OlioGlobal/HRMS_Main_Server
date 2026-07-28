const Employee      = require('../../models/Employee');
const EmployeeSalary = require('../../models/EmployeeSalary');
const WorkPolicy    = require('../../models/WorkPolicy');
const LeaveTemplate = require('../../models/LeaveTemplate');
const LeaveBalance  = require('../../models/LeaveBalance');
const LeaveType     = require('../../models/LeaveType');
const Company       = require('../../models/Company');
const Department    = require('../../models/Department');
const Designation   = require('../../models/Designation');
const Location      = require('../../models/Location');
const { decryptSalaryDoc } = require('../../utils/encryption');
const { format }    = require('date-fns');

const _fmt = (date) => date ? format(new Date(date), 'dd MMMM yyyy') : '';
const _money = (n) => n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '';
const _days  = (arr) => Array.isArray(arr) ? arr.join(', ') : '';

/**
 * Resolves all auto-variables for a given employee.
 * Returns a flat key-value map used to compile Handlebars templates.
 *
 * Variable namespaces:
 *   employee.*   — personal + job details
 *   company.*    — company profile
 *   salary.*     — latest active salary
 *   policy.*     — assigned work policy
 *   leave.*      — leave balance summary
 *   meta.*       — today, generatedDate etc.
 */
const resolveVariables = async (companyId, employeeId) => {
  const [employee, company] = await Promise.all([
    Employee.findOne({ _id: employeeId, company_id: companyId })
      .populate('designation_id', 'name level')
      .populate('department_id', 'name')
      .populate('location_id',   'name address city state')
      .populate('workPolicy_id')
      .populate('leaveTemplate_id', 'name')
      .populate({
        path:    'reportingManager_id',
        select:  'firstName lastName email designation_id',
        populate: { path: 'designation_id', select: 'name' },
      })
      .lean(),
    Company.findById(companyId).lean(),
  ]);

  if (!employee) return {};

  // .lean() bypasses the model's decrypt hooks, so decrypt the salary doc manually —
  // otherwise ctcMonthly/ctcAnnual/component amounts stay as 'ENC_v1:...' → Number() → NaN
  const salary = decryptSalaryDoc(
    await EmployeeSalary.findOne({ employee_id: employeeId, status: 'active' })
      .sort({ effectiveDate: -1 })
      .lean()
  );

  // ─── Leave balances ────────────────────────────────────────────────────────
  let leaveMap = {};
  let earnedBalances = []; // paid + comp_off only (unpaid excluded from "earned")
  if (employee.leaveTemplate_id) {
    const balances = await LeaveBalance.find({ employee_id: employeeId, company_id: companyId })
      .populate('leaveType_id', 'name code type')
      .lean();

    for (const b of balances) {
      const lt   = b.leaveType_id;
      const code = lt?.code?.toLowerCase() ?? '';
      const name = lt?.name ?? '';
      const allocated = b.allocated ?? 0;
      leaveMap[code] = allocated;
      leaveMap[`${code}_name`] = name;
      if (lt && lt.type !== 'unpaid') {
        earnedBalances.push({ code: lt.code, name, allocated });
      }
    }
  }
  // Dynamic totals/breakdown so the letter never contradicts itself
  const leaveTotalEarned = earnedBalances.reduce((s, b) => s + b.allocated, 0);
  const leaveBreakdown   = earnedBalances.map(b => `${b.code} – ${b.allocated} days`).join(', ');

  // ─── Reporting manager ─────────────────────────────────────────────────────
  const mgr = employee.reportingManager_id;

  // ─── Salary components flat map ─────────────────────────────────────────────
  let salaryComponents = {};
  let earningsTable = '';
  if (salary?.components?.length) {
    for (const c of salary.components) {
      const key = c.name.toLowerCase().replace(/\s+/g, '_');
      salaryComponents[key] = _money(c.monthlyAmount);
      salaryComponents[`${key}_raw`] = c.monthlyAmount;
    }

    const earnings   = salary.components.filter(c => c.type === 'earning');
    const deductions = salary.components.filter(c => c.type === 'deduction');

    const rows = [
      ...earnings.map(c => `<tr><td>${c.name}</td><td>${_money(c.monthlyAmount)}</td><td>${_pct(c.monthlyAmount, salary.ctcMonthly)}%</td></tr>`),
      `<tr style="font-weight:bold"><td>Total Gross Salary</td><td>${_money(salary.ctcMonthly)}</td><td>100%</td></tr>`,
      `<tr style="font-weight:bold"><td>Fixed CTC (Per Annum)</td><td colspan="2">${_money(salary.ctcAnnual)}</td></tr>`,
    ];
    earningsTable = `
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
        <thead><tr style="background:#f5f5f5"><th>Component</th><th>Amount (₹)</th><th>Percentage of Gross (%)</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>`;
  }

  // ─── Primary address ───────────────────────────────────────────────────────
  const primaryAddr = employee.addresses?.find(a => a.isPrimary) ?? employee.addresses?.[0] ?? {};
  const addrStr = [primaryAddr.street, primaryAddr.city, primaryAddr.state, primaryAddr.zip]
    .filter(Boolean).join(', ');

  // ─── Work policy ───────────────────────────────────────────────────────────
  const wp = employee.workPolicy_id;

  return {
    // Employee
    'employee.name':           `${employee.firstName} ${employee.lastName}`,
    'employee.firstName':      employee.firstName,
    'employee.lastName':       employee.lastName,
    'employee.id':             employee.employeeId,
    'employee.email':          employee.email ?? employee.personalEmail ?? '',
    'employee.phone':          employee.phone ?? '',
    'employee.address':        addrStr,
    'employee.gender':         employee.gender ?? '',
    'employee.dob':            _fmt(employee.dateOfBirth),
    'employee.joiningDate':    _fmt(employee.joiningDate),
    'employee.employmentType': employee.employmentType ?? '',
    'employee.probationMonths':employee.probationDays ? Math.round(employee.probationDays / 30) : '',
    // Human-readable probation phrase for letters ("3 months" / "no probation period"),
    // defaults to "3 months" when not yet set on the record.
    'employee.probationPeriod': (() => {
      const m = employee.probationDays != null ? Math.round(employee.probationDays / 30) : null;
      if (m == null) return '3 months';
      if (m === 0)   return 'no probation period';
      return `${m} month${m > 1 ? 's' : ''}`;
    })(),
    'employee.noticePeriodDays': employee.noticePeriodDays ?? '',
    'employee.workMode':       employee.workMode ?? '',

    // Designation
    'employee.designation':    employee.designation_id?.name ?? '',
    'employee.designationLevel': employee.designation_id?.level ?? '',

    // Department
    'employee.department':     employee.department_id?.name ?? '',

    // Location
    'employee.location':       employee.location_id?.name ?? '',
    'employee.officeAddress':  employee.location_id?.address
      ? [employee.location_id.address, employee.location_id.city, employee.location_id.state].filter(Boolean).join(', ')
      : '',

    // Reporting manager
    'employee.managerName':        mgr ? `${mgr.firstName} ${mgr.lastName}` : '',
    'employee.managerEmail':       mgr?.email ?? '',
    'employee.managerDesignation': mgr?.designation_id?.name ?? '',
    // Formatted one-line "Name – Designation | email", with a graceful fallback
    'employee.reportingManagerLine': mgr
      ? `${mgr.firstName} ${mgr.lastName}${mgr.designation_id?.name ? ` – ${mgr.designation_id.name}` : ''}${mgr.email ? ` | ${mgr.email}` : ''}`
      : 'To be communicated separately',

    // Company
    'company.name':    company?.name ?? '',
    'company.logo':    company?.logo ? `${process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`}${company.logo}` : '',
    'company.llpin':   company?.llpin ?? '',
    'company.gstin':   company?.gstin ?? '',
    'company.phone':   company?.phone ?? '',
    'company.email':   company?.email ?? '',
    'company.website': company?.website ?? '',
    'company.address': company?.address ?? '',
    'company.city':    company?.city ?? '',
    'company.state':   company?.state ?? '',
    'company.pincode': company?.pincode ?? '',

    // Salary — fall back to roughGross if no EmployeeSalary record exists.
    // roughGross is an ANNUAL CTC estimate (that's how the create form collects it),
    // so monthly = roughGross / 12.
    'salary.ctcMonthly':  salary ? _money(salary.ctcMonthly)  : _money(employee.roughGross != null ? Math.round(employee.roughGross / 12) : null),
    'salary.grossMonthly': salary ? _money(salary.ctcMonthly) : _money(employee.roughGross != null ? Math.round(employee.roughGross / 12) : null),
    'salary.ctcAnnual':   salary ? _money(salary.ctcAnnual)   : _money(employee.roughGross),
    'salary.ctc':         salary ? _money(salary.ctcAnnual)   : _money(employee.roughGross),
    'salary.ctcMonthlyRaw': salary ? (salary.ctcMonthly ?? '') : (employee.roughGross != null ? Math.round(employee.roughGross / 12) : ''),
    'salary.ctcAnnualRaw':  salary ? (salary.ctcAnnual  ?? '') : (employee.roughGross ?? ''),
    'salary.table': earningsTable || (employee.roughGross != null
      ? `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr style="background:#f5f5f5"><th>Component</th><th>Amount (₹)</th></tr></thead><tbody><tr><td>Gross Monthly Salary</td><td>${_money(Math.round(employee.roughGross / 12))}</td></tr><tr style="font-weight:bold"><td>Fixed CTC (Per Annum)</td><td>${_money(employee.roughGross)}</td></tr></tbody></table>`
      : ''),
    ...Object.fromEntries(Object.entries(salaryComponents).map(([k, v]) => [`salary.${k}`, v])),

    // Work Policy
    'policy.name':        wp?.name ?? '',
    'policy.workStart':   wp?.workStart ?? '',
    'policy.workEnd':     wp?.workEnd ?? '',
    'policy.workingDays': _days(wp?.workingDays),
    'policy.shiftType':   wp?.shiftType ?? '',
    'policy.graceMinutes': wp?.graceMinutes ?? '',
    'policy.halfDayThresholdHours': wp?.halfDayThresholdHours ?? '',
    'policy.overtimeThresholdHours': wp?.overtimeThresholdHours ?? '',

    // Leave — raw code-based keys (e.g. leave.al, leave.cl) + friendly aliases
    ...Object.fromEntries(Object.entries(leaveMap).map(([k, v]) => [`leave.${k}`, v])),
    'leave.annualLeaves':   leaveMap['al']  ?? '',
    'leave.casualLeaves':   leaveMap['cl']  ?? '',
    'leave.sickLeaves':     leaveMap['sl']  ?? '',
    'leave.maternityLeaves': leaveMap['ml'] ?? '',
    'leave.paternityLeaves': leaveMap['pl'] ?? '',
    // Dynamic total + breakdown built from the employee's actual paid balances
    'leave.totalEarned':    leaveTotalEarned || '',
    'leave.breakdown':      leaveBreakdown,

    // Meta
    'meta.today':         _fmt(new Date()),
    'meta.year':          new Date().getFullYear(),
  };
};

const _pct = (amount, total) => total ? Math.round((amount / total) * 100) : 0;

/**
 * Compiles a Handlebars template string with the resolved variable map.
 * Variables use dot notation: {{employee.name}}, {{salary.ctcMonthly}}
 */
const compileContent = (templateHtml, variables) => {
  const Handlebars = require('handlebars');
  // Register dot-notation safe helper
  const flatVars = {};
  for (const [key, val] of Object.entries(variables)) {
    flatVars[key.replace(/\./g, '__')] = val;
  }

  // Replace dot-notation vars with double-underscore before compiling
  let prepared = templateHtml.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const k = key.trim();
    return `{{${k.replace(/\./g, '__')}}}`;
  });

  try {
    const compiled = Handlebars.compile(prepared, { noEscape: true });
    return compiled(flatVars);
  } catch {
    return templateHtml;
  }
};

module.exports = { resolveVariables, compileContent };
