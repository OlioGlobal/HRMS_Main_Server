const SalaryGrade      = require('../../models/SalaryGrade');
const Employee         = require('../../models/Employee');
const Company          = require('../../models/Company');
const AppError         = require('../../utils/AppError');
const { buildPayslipHtml } = require('../../utils/payslipTemplate');
const { htmlToPdfBuffer }  = require('../../utils/pdf');
const { sendEmail }        = require('../../utils/email');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Grade → percentage breakdown ─────────────────────────────────────────────
// Salary grades store earnings as a mix of calc types (fixed / percentage of
// another component / percentOfCTC) plus a balancing Special Allowance. The
// manual slip only needs a clean *structure* — component names and the % each
// takes of gross earnings — with NO real amounts.
//
// We evaluate the grade's earnings at a neutral reference CTC, mirroring the
// grade editor's three-pass resolution, then express each earning as a % of the
// resulting gross. Percentages are normalised to total exactly 100. Deduction
// components are ignored (the manual tool takes deductions from HR directly).
//
// The reference CTC is arbitrary and never leaves this function — the output is
// percentages only, so no salary is derived, stored, or returned.
const REFERENCE_MONTHLY = 100000; // neutral basis; cancels out into percentages

const gradeToComponents = (grade) => {
  const earnings = (grade.components || []).filter(
    (gc) => gc.component_id && gc.component_id.type === 'earning'
  );
  if (!earnings.length) {
    throw new AppError('This grade has no earning components to build a breakdown from.', 400);
  }

  const resolved = {}; // component_id -> monthly amount at REFERENCE_MONTHLY

  // Pass 1: percentOfCTC
  for (const gc of earnings) {
    if (gc.calcType === 'percentOfCTC') {
      resolved[gc.component_id._id] = Math.round((REFERENCE_MONTHLY * (Number(gc.value) || 0)) / 100);
    }
  }
  // Pass 2: fixed
  for (const gc of earnings) {
    if (gc.calcType === 'fixed') {
      resolved[gc.component_id._id] = Number(gc.value) || 0;
    }
  }
  // Pass 3: percentage of another component
  for (const gc of earnings) {
    if (gc.calcType === 'percentage') {
      const base = gc.component_id.percentOf
        ? (resolved[String(gc.component_id.percentOf)] || 0)
        : 0;
      resolved[gc.component_id._id] = Math.round((base * (Number(gc.value) || 0)) / 100);
    }
  }

  let gross = earnings.reduce((acc, gc) => acc + (resolved[gc.component_id._id] || 0), 0);

  // percentOfCTC grades leave a balancing "Special Allowance" remainder.
  const hasPercentOfCTC = earnings.some((gc) => gc.calcType === 'percentOfCTC');
  const lines = earnings.map((gc) => ({ name: gc.component_id.name, amount: resolved[gc.component_id._id] || 0 }));
  if (hasPercentOfCTC && gross < REFERENCE_MONTHLY) {
    lines.push({ name: 'Special Allowance', amount: REFERENCE_MONTHLY - gross });
    gross = REFERENCE_MONTHLY;
  }

  if (gross <= 0) {
    throw new AppError('This grade resolves to a zero breakdown — check its component values.', 400);
  }

  // Express each line as a % of gross, then normalise the largest to make 100.
  const components = lines.map((l) => ({ name: l.name, percentage: (l.amount / gross) * 100 }));
  const rounded = components.map((c) => ({ name: c.name, percentage: Math.round(c.percentage * 100) / 100 }));
  const sum = rounded.reduce((a, c) => a + c.percentage, 0);
  const diff = Math.round((100 - sum) * 100) / 100;
  if (diff !== 0 && rounded.length) {
    let maxIdx = 0;
    for (let i = 1; i < rounded.length; i++) if (rounded[i].percentage > rounded[maxIdx].percentage) maxIdx = i;
    rounded[maxIdx].percentage = Math.round((rounded[maxIdx].percentage + diff) * 100) / 100;
  }
  return rounded;
};

// Deduction component NAMES from the grade (no amounts — HR types those). Used
// to prefill the manual slip's deduction rows.
const gradeDeductionNames = (grade) =>
  (grade.components || [])
    .filter((gc) => gc.component_id && gc.component_id.type === 'deduction')
    .map((gc) => gc.component_id.name);

// Fetch a grade (populated) and reduce it to a percentage breakdown + the names
// of its deduction components (so the UI can prefill deduction lines).
const getGradeBreakdown = async (companyId, gradeId) => {
  const grade = await SalaryGrade.findOne({ _id: gradeId, company_id: companyId })
    .populate('components.component_id', 'name type calcType percentOf')
    .lean();
  if (!grade) throw new AppError('Salary grade not found.', 404);
  return {
    gradeId:    grade._id,
    name:       grade.name,
    components: gradeToComponents(grade),
    deductionNames: gradeDeductionNames(grade),
  };
};

// List grades (id + name only — no amounts) for the picker.
const listGradeOptions = async (companyId) => {
  const grades = await SalaryGrade.find({ company_id: companyId, isActive: true })
    .select('name')
    .sort({ name: 1 })
    .lean();
  return grades.map((g) => ({ _id: g._id, name: g.name }));
};

// ─── Amount split ─────────────────────────────────────────────────────────────
// Split `gross` across the resolved components by percentage. Rounds each to a
// whole unit and absorbs the rounding remainder into the LARGEST component so
// the earnings sum back to `gross` exactly.
const splitByComponents = (gross, components) => {
  const g = Math.round(Number(gross) || 0);
  const earnings = components.map((c) => ({
    name:   c.name,
    amount: Math.round((g * Number(c.percentage)) / 100),
  }));
  const allocated = earnings.reduce((acc, e) => acc + e.amount, 0);
  const remainder = g - allocated;
  if (remainder !== 0 && earnings.length) {
    let maxIdx = 0;
    for (let i = 1; i < earnings.length; i++) {
      if (earnings[i].amount > earnings[maxIdx].amount) maxIdx = i;
    }
    earnings[maxIdx].amount += remainder;
  }
  return earnings;
};

// ─── Compute a manual slip (pure — no persistence, no logging) ────────────────
// `monthlySalary` is the true gross — the breakdown splits IT into earnings.
// Deductions subtract from the gross. NET SALARY on the slip = gross − deductions.
// `actualPaid` is an optional reference (what was really credited); if omitted it
// defaults to net. It does not change the slip's Net — it's only carried back for
// an HR-facing mismatch check.
const computeSlip = ({ monthlySalary, actualPaid, deductions, components }) => {
  const gross = Math.round(Number(monthlySalary) || 0);
  if (gross <= 0) throw new AppError('Monthly salary must be a positive amount.', 400);

  const deductionLines = (deductions || [])
    .filter((d) => d && d.name && Number(d.amount) > 0)
    .map((d) => ({ name: String(d.name).trim(), amount: Math.round(Number(d.amount)) }));

  const totalDeductions = deductionLines.reduce((acc, d) => acc + d.amount, 0);
  const netPay = gross - totalDeductions;
  if (netPay < 0) throw new AppError('Deductions exceed the monthly salary.', 400);

  const earnings = splitByComponents(gross, components);

  const paid = actualPaid == null || actualPaid === '' ? netPay : Math.round(Number(actualPaid));

  return { earnings, deductions: deductionLines, grossEarnings: gross, totalDeductions, netPay, actualPaid: paid };
};

// ─── Send a manual salary slip ────────────────────────────────────────────────
// Resolves grade breakdown + employee + company, computes the split, renders the
// PDF, emails it, then discards everything. NOTHING is written to the DB and NO
// amounts are logged.
const sendManualSlip = async (companyId, payload) => {
  const { employeeId, month, year, gradeId, monthlySalary, actualPaid, deductions, to, cc, bcc } = payload;

  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (!m || m < 1 || m > 12) throw new AppError('A valid month (1–12) is required.', 400);
  if (!y) throw new AppError('A valid year is required.', 400);

  const { components } = await getGradeBreakdown(companyId, gradeId);

  const employee = await Employee.findOne({ _id: employeeId, company_id: companyId })
    .populate('designation_id', 'name')
    .populate('department_id', 'name')
    .lean();
  if (!employee) throw new AppError('Employee not found.', 404);

  const company = await Company.findById(companyId).lean();
  if (!company) throw new AppError('Company not found.', 404);

  // Recipient: explicit override, else personal email, else work email.
  const recipient = (to && String(to).trim()) || employee.personalEmail || employee.email;
  if (!recipient) {
    throw new AppError('No recipient email — this employee has no personal or work email on file.', 400);
  }

  const { earnings, deductions: deductionLines, grossEarnings, totalDeductions, netPay: net } =
    computeSlip({ monthlySalary, actualPaid, deductions, components });

  // Synthetic "record" matching the payslip template's expected shape.
  const record = {
    month: m, year: y,
    earnings, deductions: deductionLines,
    grossEarnings, totalDeductions, netPay: net,
    hideTotalDays: true, // manual slips aren't attendance-based
  };

  const html = buildPayslipHtml({ record, employee, company });
  const pdf  = await htmlToPdfBuffer(html);

  const monthName = MONTHS[m - 1];
  const empName   = `${employee.firstName || ''} ${employee.lastName || ''}`.trim();
  const fileName  = `Salary-Slip-${monthName}-${y}-${employee.employeeId || empName}.pdf`.replace(/\s+/g, '-');

  const bodyHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6">
      <p>Dear ${empName || 'Employee'},</p>
      <p>Please find attached your salary slip for <strong>${monthName} ${y}</strong>.</p>
      <p>Regards,<br/>${company.name || 'HR Team'}</p>
    </div>`;

  const result = await sendEmail({
    to: recipient,
    cc:  (cc  || []).filter(Boolean),
    bcc: (bcc || []).filter(Boolean),
    subject: `Salary Slip - ${monthName} ${y} | ${company.name || ''}`.trim(),
    html: bodyHtml,
    attachments: [{ filename: fileName, content: pdf, contentType: 'application/pdf' }],
  });

  if (!result.success) {
    throw new AppError(`Failed to send email: ${result.error || 'unknown error'}`, 502);
  }

  // Return only non-sensitive metadata. No amounts.
  return { sentTo: recipient, ccCount: (cc || []).length, bccCount: (bcc || []).length, month: m, year: y };
};

module.exports = {
  listGradeOptions,
  getGradeBreakdown,
  sendManualSlip,
  computeSlip,
  splitByComponents,
  gradeToComponents,
};
