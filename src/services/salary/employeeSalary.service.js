const EmployeeSalary  = require('../../models/EmployeeSalary');
const SalaryGrade     = require('../../models/SalaryGrade');
const SalaryComponent = require('../../models/SalaryComponent');
const AppError        = require('../../utils/AppError');

// ─── Helper: resolve components to snapshot ───────────────────────────────────
const buildSnapshot = async (companyId, components) => {
  // Fetch all active components for this company to resolve percentOf references
  const allComps = await SalaryComponent.find({ company_id: companyId, isActive: true }).lean();
  const compMap = {};
  for (const c of allComps) compMap[c._id.toString()] = c;

  // First pass: resolve fixed amounts
  const resolved = components.map((c) => {
    const def = compMap[c.component_id.toString()];
    if (!def) throw new AppError(`Component ${c.component_id} not found.`, 400);
    return {
      component_id:  def._id,
      name:          def.name,
      type:          def.type,
      calcType:      c.calcType,
      value:         c.value,
      monthlyAmount: 0,
      _percentOf:    def.percentOf ? def.percentOf.toString() : null,
    };
  });

  // Map by component_id for percentage lookups
  const resolvedMap = {};
  for (const r of resolved) resolvedMap[r.component_id.toString()] = r;

  // Second pass: calculate monthly amounts
  for (const r of resolved) {
    if (r.calcType === 'fixed') {
      r.monthlyAmount = r.value;
    } else if (r.calcType === 'percentage') {
      const base = r._percentOf ? resolvedMap[r._percentOf] : null;
      if (base) {
        r.monthlyAmount = Math.round((base.monthlyAmount * r.value) / 100);
      }
    }
  }

  // Clean up internal field
  const snapshot = resolved.map(({ _percentOf, ...rest }) => rest);

  // Calculate CTC
  const totalEarnings   = snapshot.filter((c) => c.type === 'earning').reduce((s, c) => s + c.monthlyAmount, 0);
  const totalDeductions = snapshot.filter((c) => c.type === 'deduction').reduce((s, c) => s + c.monthlyAmount, 0);
  const ctcMonthly = totalEarnings; // CTC = gross (employer cost); net = gross - deductions
  const ctcAnnual  = ctcMonthly * 12;

  return { snapshot, ctcMonthly, ctcAnnual };
};

// ─── List salary records for an employee ──────────────────────────────────────
const listForEmployee = async (companyId, employeeId) => {
  return EmployeeSalary.find({ company_id: companyId, employee_id: employeeId })
    .populate('salaryGrade_id', 'name')
    .populate('createdBy', 'firstName lastName')
    .sort({ effectiveDate: -1 })
    .lean();
};

// ─── Get active salary ────────────────────────────────────────────────────────
const getActiveSalary = async (companyId, employeeId) => {
  const salary = await EmployeeSalary.findOne({
    company_id:  companyId,
    employee_id: employeeId,
    status:      'active',
  })
    .populate('salaryGrade_id', 'name')
    .populate('createdBy', 'firstName lastName')
    .lean();
  return salary; // may be null (no salary assigned yet)
};

// ─── Assign / Revise salary ──────────────────────────────────────────────────
const assignSalary = async (companyId, employeeId, userId, body) => {
  const { type, salaryGrade_id, effectiveDate, reason, components } = body;

  let finalComponents = components;

  // If type=grade and no custom components override, pull from grade
  if (type === 'grade' && salaryGrade_id) {
    const grade = await SalaryGrade.findOne({ _id: salaryGrade_id, company_id: companyId }).lean();
    if (!grade) throw new AppError('Salary grade not found.', 404);

    // Use overridden components if provided, otherwise use grade defaults
    if (!finalComponents || finalComponents.length === 0) {
      finalComponents = grade.components.map((c) => ({
        component_id: c.component_id,
        calcType:     c.calcType,
        value:        c.value,
      }));
    }
  }

  if (!finalComponents || finalComponents.length === 0) {
    throw new AppError('At least one salary component is required.', 400);
  }

  // Build snapshot with calculated monthly amounts
  const { snapshot, ctcMonthly, ctcAnnual } = await buildSnapshot(companyId, finalComponents);

  // Supersede current active salary
  await EmployeeSalary.updateMany(
    { company_id: companyId, employee_id: employeeId, status: 'active' },
    { status: 'superseded' }
  );

  // Create new active salary record
  const salary = await EmployeeSalary.create({
    company_id:     companyId,
    employee_id:    employeeId,
    type,
    salaryGrade_id: type === 'grade' ? salaryGrade_id : null,
    effectiveDate,
    reason:         reason || null,
    components:     snapshot,
    ctcMonthly,
    ctcAnnual,
    status:         'active',
    createdBy:      userId,
  });

  return salary.toObject();
};

module.exports = {
  listForEmployee,
  getActiveSalary,
  assignSalary,
};
