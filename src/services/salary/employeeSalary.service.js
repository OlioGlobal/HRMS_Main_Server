const EmployeeSalary  = require('../../models/EmployeeSalary');
const SalaryGrade     = require('../../models/SalaryGrade');
const SalaryComponent = require('../../models/SalaryComponent');
const AppError        = require('../../utils/AppError');

// ─── Helper: resolve components to snapshot ───────────────────────────────────
// targetCtcAnnual: optional — if provided, Basic is derived from CTC and a
//   Special Allowance balancing component is auto-added.
const buildSnapshot = async (companyId, components, targetCtcAnnual = null) => {
  const allComps = await SalaryComponent.find({ company_id: companyId, isActive: true }).lean();
  const compMap = {};
  for (const c of allComps) compMap[c._id.toString()] = c;

  const targetMonthly = targetCtcAnnual ? Math.round(targetCtcAnnual / 12) : null;

  // First pass: build resolved list
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

  const resolvedMap = {};
  for (const r of resolved) resolvedMap[r.component_id.toString()] = r;

  // Pass 1: Resolve percentOfCTC components first (they depend on CTC, not other components)
  for (const r of resolved) {
    if (r.calcType === 'percentOfCTC') {
      if (!targetMonthly) throw new AppError('Annual CTC is required when using percentage-of-CTC components.', 400);
      r.monthlyAmount = Math.round((targetMonthly * r.value) / 100);
    }
  }

  // Pass 2: Resolve fixed amounts
  for (const r of resolved) {
    if (r.monthlyAmount > 0) continue;
    if (r.calcType === 'fixed') {
      r.monthlyAmount = r.value;
    }
  }

  // Pass 3: Resolve percentage-of-component (e.g. HRA = 50% of Basic)
  for (const r of resolved) {
    if (r.monthlyAmount > 0) continue;
    if (r.calcType === 'percentage') {
      const base = r._percentOf ? resolvedMap[r._percentOf] : null;
      if (base && base.monthlyAmount > 0) {
        r.monthlyAmount = Math.round((base.monthlyAmount * r.value) / 100);
      }
    }
  }

  // Clean up internal field
  const snapshot = resolved.map(({ _percentOf, ...rest }) => rest);

  // Calculate earnings total
  const totalEarnings = snapshot.filter((c) => c.type === 'earning').reduce((s, c) => s + c.monthlyAmount, 0);

  // If target CTC provided and there's a gap, add Special Allowance as balancing
  if (targetMonthly && totalEarnings < targetMonthly) {
    const gap = targetMonthly - totalEarnings;
    if (gap > 0) {
      // Find or create Special Allowance component
      let specialComp = allComps.find((c) => c.name === 'Special Allowance' && c.type === 'earning');
      if (!specialComp) {
        specialComp = await SalaryComponent.create({
          company_id: companyId,
          name: 'Special Allowance',
          type: 'earning',
          calcType: 'fixed',
          defaultValue: 0,
          taxable: true,
          statutory: false,
          order: 99,
        });
      }
      // Only add if not already in snapshot
      const exists = snapshot.find((c) => c.component_id.toString() === specialComp._id.toString());
      if (!exists) {
        snapshot.push({
          component_id:  specialComp._id,
          name:          'Special Allowance',
          type:          'earning',
          calcType:      'fixed',
          value:         gap,
          monthlyAmount: gap,
        });
      } else {
        exists.value = gap;
        exists.monthlyAmount = gap;
      }
    }
  }

  // Final CTC calculation
  const finalEarnings   = snapshot.filter((c) => c.type === 'earning').reduce((s, c) => s + c.monthlyAmount, 0);
  const ctcMonthly = targetMonthly || finalEarnings;
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
  const { type, salaryGrade_id, effectiveDate, reason, components, ctcAnnual: targetCTC } = body;

  let finalComponents = components;
  let grade = null;

  // If type=grade and no custom components override, pull from grade
  if (type === 'grade' && salaryGrade_id) {
    grade = await SalaryGrade.findOne({ _id: salaryGrade_id, company_id: companyId }).lean();
    if (!grade) throw new AppError('Salary grade not found.', 404);

    // Validate CTC is within grade range (if range is set)
    if (targetCTC && grade.minCTC > 0 && grade.maxCTC > 0) {
      if (targetCTC < grade.minCTC || targetCTC > grade.maxCTC) {
        throw new AppError(`CTC must be between ${grade.minCTC} and ${grade.maxCTC} for this grade.`, 400);
      }
    }

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
  // Pass targetCTC so percentage-of-CTC components are auto-calculated
  const { snapshot, ctcMonthly, ctcAnnual } = await buildSnapshot(companyId, finalComponents, targetCTC > 0 ? targetCTC : null);

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
