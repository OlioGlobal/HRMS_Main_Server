const Employee       = require('../../models/Employee');
const EmployeeSalary = require('../../models/EmployeeSalary');
const WorkPolicy     = require('../../models/WorkPolicy');
const {
  getWorkingDaysInMonth,
  getWorkingDaysFrom,
  getLWPDays,
  getPaidLeaveDays,
  getAttendanceSummary,
  isMidMonthJoiner,
} = require('../../utils/payrollHelpers');

/**
 * Calculate payroll for a single employee.
 * Returns a plain object ready to save as PayrollRecord.
 */
const calculatePayrollRecord = async (employee, month, year, companyId) => {
  const warnings = [];

  // ─── 0. Skip if employee joined after this payroll month ─────────────────
  if (employee.joiningDate) {
    const joinDate = new Date(employee.joiningDate);
    const monthEnd = new Date(Date.UTC(year, month, 0)); // last day of month
    if (joinDate > monthEnd) {
      return null; // skip — employee hasn't joined yet
    }
  }

  // ─── 1. Resolve work policy ──────────────────────────────────────────────
  let workPolicy = null;
  if (employee.workPolicy_id) {
    workPolicy = await WorkPolicy.findById(
      typeof employee.workPolicy_id === 'object' ? employee.workPolicy_id._id : employee.workPolicy_id
    ).lean();
  }
  if (!workPolicy) {
    workPolicy = await WorkPolicy.findOne({ company_id: companyId, isDefault: true }).lean();
    if (!workPolicy) {
      return buildWarningRecord(employee, month, year, companyId, ['No work policy assigned and no default policy found']);
    }
    warnings.push('Using default work policy (none assigned)');
  }

  // ─── 2. Get active salary ────────────────────────────────────────────────
  const salary = await EmployeeSalary.findOne({
    company_id: companyId,
    employee_id: employee._id,
    status: 'active',
  }).lean();

  if (!salary) {
    return buildWarningRecord(employee, month, year, companyId, ['No salary assigned']);
  }

  // ─── 3. Working days ────────────────────────────────────────────────────
  const locationId = employee.location_id?._id || employee.location_id;
  const { totalWorkingDays } = await getWorkingDaysInMonth(
    month, year, workPolicy.workingDays, locationId, companyId
  );

  let effectiveWorkingDays = totalWorkingDays;

  // Pro-rate for mid-month joiner
  if (employee.joiningDate && isMidMonthJoiner(employee.joiningDate, month, year)) {
    effectiveWorkingDays = await getWorkingDaysFrom(
      employee.joiningDate, month, year, workPolicy.workingDays, locationId, companyId
    );
    warnings.push(`Mid-month joiner — pro-rated to ${effectiveWorkingDays} days`);
  }

  if (effectiveWorkingDays === 0) {
    return buildWarningRecord(employee, month, year, companyId, ['Zero working days in period']);
  }

  // ─── 4. Attendance data ──────────────────────────────────────────────────
  const attendance = await getAttendanceSummary(employee._id, month, year, workPolicy);
  if (!attendance.hasAttendanceData) {
    warnings.push('No attendance data for this month');
  }

  // ─── 5. Leave data ──────────────────────────────────────────────────────
  const lwpDays      = await getLWPDays(employee._id, month, year);
  const paidLeaveDays = await getPaidLeaveDays(employee._id, month, year);

  // ─── 6. Base calculations ───────────────────────────────────────────────
  const earningsComponents  = salary.components.filter(c => c.type === 'earning');
  const deductionComponents = salary.components.filter(c => c.type === 'deduction');

  const fullMonthlyGross = earningsComponents.reduce((sum, c) => sum + c.monthlyAmount, 0);
  // perDaySalary is always based on full month (consistent deduction rate)
  const perDaySalary  = totalWorkingDays > 0 ? fullMonthlyGross / totalWorkingDays : 0;
  const standardHours = attendance.standardHours || 8;
  const perHourSalary = standardHours > 0 ? perDaySalary / standardHours : 0;

  // Pro-rate gross for partial months (mid-month joiner)
  const grossEarnings = effectiveWorkingDays < totalWorkingDays
    ? Math.round(perDaySalary * effectiveWorkingDays * 100) / 100
    : fullMonthlyGross;

  // ─── 7. Absence deductions ──────────────────────────────────────────────
  const lwpDeductionAmount    = Math.round(perDaySalary * lwpDays * 100) / 100;
  const absentDeductionAmount = Math.round(perDaySalary * attendance.daysAbsent * 100) / 100;
  const halfDayDeductionAmount = Math.round(perDaySalary * 0.5 * attendance.halfDays * 100) / 100;

  // ─── 8. Late deduction ──────────────────────────────────────────────────
  let lateDeductionAmount = 0;
  if (workPolicy.lateDeductionEnabled && attendance.deductibleLateCount > 0) {
    if (workPolicy.lateDeductionType === 'per_occurrence') {
      lateDeductionAmount = attendance.deductibleLateCount * (workPolicy.lateDeductionAmount || 0);
    } else if (workPolicy.lateDeductionType === 'salary_based') {
      lateDeductionAmount = attendance.deductibleLateCount * perDaySalary * 0.5;
    }
    lateDeductionAmount = Math.round(lateDeductionAmount * 100) / 100;
  }

  // ─── 9. Overtime ────────────────────────────────────────────────────────
  let overtimeAmount = 0;
  let compOffHoursEarned = 0;

  if (workPolicy.overtimeEnabled && attendance.overtimeHours >= (workPolicy.overtimeMinHours || 0)) {
    const compType = workPolicy.overtimeCompensationType || 'pay';
    const rate     = workPolicy.overtimeRateMultiplier || 1;

    if (compType === 'pay' || compType === 'both') {
      overtimeAmount = Math.round(perHourSalary * attendance.overtimeHours * rate * 100) / 100;
    }
    if (compType === 'comp_off' || compType === 'both') {
      compOffHoursEarned = attendance.overtimeHours;
    }
  }

  // ─── 10. Component deductions (PF, tax, etc.) ──────────────────────────
  const componentDeductions = deductionComponents.reduce((sum, c) => sum + c.monthlyAmount, 0);

  // ─── 11. Totals ─────────────────────────────────────────────────────────
  const totalDeductions = componentDeductions + lwpDeductionAmount + absentDeductionAmount
    + halfDayDeductionAmount + lateDeductionAmount;

  let netPay = Math.round((grossEarnings + overtimeAmount - totalDeductions) * 100) / 100;

  if (netPay < 0) {
    warnings.push('Net pay is negative — capped at 0. Review deductions.');
    netPay = 0;
  }

  // ─── Build record ───────────────────────────────────────────────────────
  return {
    company_id: companyId,
    employee_id: employee._id,
    month,
    year,

    totalWorkingDays,
    effectiveWorkingDays,
    daysWorked:          attendance.daysWorked,
    halfDays:            attendance.halfDays,
    daysAbsent:          attendance.daysAbsent,
    lwpDays,
    paidLeaveDays,
    lateCount:           attendance.lateCount,
    deductibleLateCount: attendance.deductibleLateCount,
    overtimeHours:       attendance.overtimeHours,

    employeeSalary_id: salary._id,
    ctcMonthly:        salary.ctcMonthly,

    earnings: earningsComponents.map(c => ({
      component_id: c.component_id,
      name:     c.name,
      calcType: c.calcType,
      value:    c.value,
      amount:   c.monthlyAmount,
    })),
    deductions: deductionComponents.map(c => ({
      component_id: c.component_id,
      name:     c.name,
      calcType: c.calcType,
      value:    c.value,
      amount:   c.monthlyAmount,
    })),

    perDaySalary:  Math.round(perDaySalary * 100) / 100,
    perHourSalary: Math.round(perHourSalary * 100) / 100,

    lwpDeductionAmount,
    absentDeductionAmount,
    halfDayDeductionAmount,
    lateDeductionAmount,
    overtimeAmount,

    compOffHoursEarned,
    compOffCredited: false,

    grossEarnings: Math.round(grossEarnings * 100) / 100,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    netPay,

    status: warnings.length > 0 ? 'warning' : 'ready',
    warnings,
    isManualEdit: false,
  };
};

/**
 * Build a warning-only record when calculation cannot proceed.
 */
const buildWarningRecord = (employee, month, year, companyId, warnings) => ({
  company_id: companyId,
  employee_id: employee._id,
  month,
  year,
  totalWorkingDays: 0,
  effectiveWorkingDays: 0,
  daysWorked: 0, halfDays: 0, daysAbsent: 0, lwpDays: 0, paidLeaveDays: 0,
  lateCount: 0, deductibleLateCount: 0, overtimeHours: 0,
  employeeSalary_id: null,
  ctcMonthly: 0,
  earnings: [], deductions: [],
  perDaySalary: 0, perHourSalary: 0,
  lwpDeductionAmount: 0, absentDeductionAmount: 0, halfDayDeductionAmount: 0,
  lateDeductionAmount: 0, overtimeAmount: 0,
  compOffHoursEarned: 0, compOffCredited: false,
  grossEarnings: 0, totalDeductions: 0, netPay: 0,
  status: 'warning',
  warnings,
  isManualEdit: false,
});

module.exports = { calculatePayrollRecord };
