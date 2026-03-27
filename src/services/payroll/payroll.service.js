const mongoose      = require('mongoose');
const PayrollRun    = require('../../models/PayrollRun');
const PayrollRecord = require('../../models/PayrollRecord');
const Employee      = require('../../models/Employee');
const AppError      = require('../../utils/AppError');
const eventBus      = require('../../utils/eventBus');
const { calculatePayrollRecord } = require('./calculatePayroll.service');

const toOid = (id) => new mongoose.Types.ObjectId(id);

// ─── Initiate a new payroll run ─────────────────────────────────────────────
const initiateRun = async (companyId, month, year, userId) => {
  // Gate 1: Check for existing run
  const existing = await PayrollRun.findOne({ company_id: companyId, month, year });

  if (existing) {
    if (existing.status === 'draft' || existing.status === 'review') {
      throw new AppError(`A payroll run for ${month}/${year} already exists in "${existing.status}" status. Resume or delete it first.`, 409);
    }
    if (existing.status === 'approved' || existing.status === 'paid') {
      throw new AppError(`Payroll for ${month}/${year} is already ${existing.status}.`, 409);
    }
    if (existing.status === 'processing') {
      throw new AppError(`Payroll for ${month}/${year} is currently processing. Please wait.`, 409);
    }
  }

  const run = await PayrollRun.create({
    company_id: companyId,
    month,
    year,
    status: 'draft',
    initiatedBy: userId,
  });

  return run;
};

// ─── Process payroll (calculate all employees) ─────────────────────────────
const processRun = async (runId, companyId) => {
  const run = await PayrollRun.findOne({ _id: runId, company_id: companyId });
  if (!run) throw new AppError('Payroll run not found.', 404);
  if (run.status !== 'draft' && run.status !== 'review') {
    throw new AppError(`Cannot process a run in "${run.status}" status.`, 400);
  }

  // Set to processing
  run.status = 'processing';
  await run.save();

  try {
    // Delete non-edited records (preserve manual edits on recalculate)
    // Edited + skipped records are kept as-is
    const preservedRecords = await PayrollRecord.find({
      payrollRun_id: runId,
      status: { $in: ['edited', 'skipped'] },
    }).lean();
    const preservedEmpIds = new Set(preservedRecords.map(r => r.employee_id.toString()));

    await PayrollRecord.deleteMany({
      payrollRun_id: runId,
      status: { $nin: ['edited', 'skipped'] },
    });

    // Get all active employees
    const employees = await Employee.find({
      company_id: companyId,
      status: { $in: ['active', 'notice'] },
    }).lean();

    const records = [];
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNetPay = 0;
    let warningCount = 0;

    for (const emp of employees) {
      // Skip employees whose records were manually edited or skipped
      if (preservedEmpIds.has(emp._id.toString())) continue;

      const recordData = await calculatePayrollRecord(emp, run.month, run.year, companyId);
      if (!recordData) continue; // skip — future joiner, not in this month

      recordData.payrollRun_id = runId;
      records.push(recordData);

      totalGross      += recordData.grossEarnings;
      totalDeductions += recordData.totalDeductions;
      totalNetPay     += recordData.netPay;
      if (recordData.status === 'warning') warningCount++;
    }

    // Bulk insert new records
    if (records.length > 0) {
      await PayrollRecord.insertMany(records);
    }

    // Include preserved records in totals
    for (const pr of preservedRecords) {
      if (pr.status === 'skipped') continue;
      totalGross      += pr.grossEarnings;
      totalDeductions += pr.totalDeductions;
      totalNetPay     += pr.netPay;
    }
    const allCount = records.length + preservedRecords.length;

    // Update run summary
    run.status          = 'review';
    run.totalEmployees  = allCount;
    run.totalGross      = Math.round(totalGross * 100) / 100;
    run.totalDeductions = Math.round(totalDeductions * 100) / 100;
    run.totalNetPay     = Math.round(totalNetPay * 100) / 100;
    run.warnings        = warningCount;
    await run.save();

    return run;
  } catch (err) {
    // Revert to draft on failure
    run.status = 'draft';
    await run.save();
    throw err;
  }
};

// ─── Approve payroll ────────────────────────────────────────────────────────
const approveRun = async (runId, companyId, userId) => {
  const run = await PayrollRun.findOne({ _id: runId, company_id: companyId });
  if (!run) throw new AppError('Payroll run not found.', 404);
  if (run.status !== 'review') {
    throw new AppError(`Can only approve a run in "review" status. Current: "${run.status}".`, 400);
  }

  // Check for blocking warnings — employees with zero-pay critical issues must be skipped first
  const BLOCKING_WARNINGS = [
    'No salary assigned',
    'No work policy assigned and no default policy found',
    'Zero working days in period',
  ];
  const blockingRecords = await PayrollRecord.find({
    payrollRun_id: runId,
    status: 'warning',
    warnings: { $in: BLOCKING_WARNINGS },
  }).countDocuments();

  if (blockingRecords > 0) {
    throw new AppError(
      `${blockingRecords} employee(s) have critical issues (no salary/policy). Skip them or resolve first.`,
      400
    );
  }

  run.status     = 'approved';
  run.approvedBy = userId;
  run.approvedAt = new Date();
  run.lockedAt   = new Date();
  await run.save();

  // TODO: Credit comp-off leave balances for employees with compOffHoursEarned > 0

  return run;
};

// ─── Mark as paid ───────────────────────────────────────────────────────────
const markPaid = async (runId, companyId) => {
  const run = await PayrollRun.findOne({ _id: runId, company_id: companyId });
  if (!run) throw new AppError('Payroll run not found.', 404);
  if (run.status !== 'approved') {
    throw new AppError(`Can only mark "approved" runs as paid. Current: "${run.status}".`, 400);
  }

  run.status = 'paid';
  run.paidAt = new Date();
  await run.save();

  // ── Mark reimbursements as paid ──
  const { markPaidByPayroll } = require('../reimbursement/reimbursement.service');
  const records = await PayrollRecord.find({ payrollRun_id: run._id }).lean();
  for (const rec of records) {
    if (rec.reimbursements?.length > 0) {
      const claimIds = rec.reimbursements.map(r => r.reimbursement_id);
      await markPaidByPayroll(claimIds, run._id);
    }
  }

  eventBus.emit('payroll.paid', { companyId, payrollRun: run.toObject() });
  return run;
};

// ─── List runs ──────────────────────────────────────────────────────────────
const listRuns = async (companyId, query = {}) => {
  const { year, status, page = 1, limit = 20 } = query;
  const filter = { company_id: companyId };

  if (year) filter.year = Number(year);
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);

  const [runs, total] = await Promise.all([
    PayrollRun.find(filter)
      .sort({ year: -1, month: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('initiatedBy', 'email')
      .populate('approvedBy', 'email')
      .lean(),
    PayrollRun.countDocuments(filter),
  ]);

  return { runs, total, page: Number(page), limit: Number(limit) };
};

// ─── Get single run ─────────────────────────────────────────────────────────
const getRun = async (runId, companyId) => {
  const run = await PayrollRun.findOne({ _id: runId, company_id: companyId })
    .populate('initiatedBy', 'email')
    .populate('approvedBy', 'email')
    .lean();

  if (!run) throw new AppError('Payroll run not found.', 404);
  return run;
};

// ─── Delete draft run ───────────────────────────────────────────────────────
const deleteRun = async (runId, companyId) => {
  const run = await PayrollRun.findOne({ _id: runId, company_id: companyId });
  if (!run) throw new AppError('Payroll run not found.', 404);
  if (run.status !== 'draft') {
    throw new AppError(`Can only delete runs in "draft" status. Current: "${run.status}".`, 400);
  }

  await PayrollRecord.deleteMany({ payrollRun_id: runId });
  await run.deleteOne();
};

// ─── Get records for a run ──────────────────────────────────────────────────
const getRecords = async (runId, companyId, query = {}) => {
  const { status, search, page = 1, limit = 50 } = query;

  const pipeline = [];

  pipeline.push({ $match: { payrollRun_id: toOid(runId), company_id: toOid(companyId) } });

  // Join employee
  pipeline.push({
    $lookup: {
      from: 'employees',
      localField: 'employee_id',
      foreignField: '_id',
      as: 'employee',
    },
  });
  pipeline.push({ $unwind: '$employee' });

  // Join department
  pipeline.push({
    $lookup: {
      from: 'departments',
      localField: 'employee.department_id',
      foreignField: '_id',
      as: 'department',
    },
  });
  pipeline.push({ $unwind: { path: '$department', preserveNullAndEmptyArrays: true } });

  // Join designation
  pipeline.push({
    $lookup: {
      from: 'designations',
      localField: 'employee.designation_id',
      foreignField: '_id',
      as: 'designation',
    },
  });
  pipeline.push({ $unwind: { path: '$designation', preserveNullAndEmptyArrays: true } });

  // Filters
  if (status) {
    pipeline.push({ $match: { status } });
  }

  if (search) {
    const regex = { $regex: search, $options: 'i' };
    pipeline.push({
      $match: {
        $or: [
          { 'employee.firstName': regex },
          { 'employee.lastName': regex },
          { 'employee.employeeId': regex },
        ],
      },
    });
  }

  // Sort warnings first, then by name
  pipeline.push({
    $sort: { status: 1, 'employee.firstName': 1 },
  });

  // Facet for pagination
  const skip = (Number(page) - 1) * Number(limit);
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        { $limit: Number(limit) },
        {
          $project: {
            _id: 1,
            employee: {
              _id: '$employee._id',
              employeeId: '$employee.employeeId',
              firstName: '$employee.firstName',
              lastName: '$employee.lastName',
              avatar: '$employee.avatar',
              department: { $ifNull: ['$department.name', null] },
              designation: { $ifNull: ['$designation.name', null] },
            },
            effectiveWorkingDays: 1,
            daysWorked: 1,
            halfDays: 1,
            daysAbsent: 1,
            lwpDays: 1,
            lateCount: 1,
            deductibleLateCount: 1,
            overtimeHours: 1,
            grossEarnings: 1,
            totalDeductions: 1,
            netPay: 1,
            status: 1,
            warnings: 1,
            isManualEdit: 1,
          },
        },
      ],
      total: [{ $count: 'count' }],
    },
  });

  const results = await PayrollRecord.aggregate(pipeline);
  const result = results[0] || { data: [], total: [] };

  return {
    records: result.data,
    total: result.total[0]?.count || 0,
    page: Number(page),
    limit: Number(limit),
  };
};

// ─── Get single record (full breakdown) ─────────────────────────────────────
const getRecord = async (runId, employeeId, companyId) => {
  const record = await PayrollRecord.findOne({
    payrollRun_id: runId,
    employee_id: employeeId,
    company_id: companyId,
  })
    .populate('employee_id', 'employeeId firstName lastName avatar department_id designation_id location_id')
    .lean();

  if (!record) throw new AppError('Payroll record not found.', 404);
  return record;
};

// ─── Manual edit ────────────────────────────────────────────────────────────
const editRecord = async (runId, employeeId, companyId, updates, userId) => {
  const run = await PayrollRun.findOne({ _id: runId, company_id: companyId });
  if (!run) throw new AppError('Payroll run not found.', 404);
  if (run.status !== 'review') {
    throw new AppError(`Can only edit records in "review" status. Current: "${run.status}".`, 400);
  }

  if (!updates.manualEditNote?.trim()) {
    throw new AppError('A reason/note is required for manual edits.', 400);
  }

  const record = await PayrollRecord.findOne({
    payrollRun_id: runId,
    employee_id: employeeId,
    company_id: companyId,
  });

  if (!record) throw new AppError('Payroll record not found.', 404);

  // Allow editing specific fields
  const editableFields = [
    'daysWorked', 'halfDays', 'daysAbsent', 'lwpDays', 'lateCount',
    'deductibleLateCount', 'overtimeHours',
    'lwpDeductionAmount', 'absentDeductionAmount', 'halfDayDeductionAmount',
    'lateDeductionAmount', 'overtimeAmount',
    'grossEarnings', 'totalDeductions', 'netPay',
  ];

  for (const field of editableFields) {
    if (updates[field] !== undefined) {
      record[field] = updates[field];
    }
  }

  record.isManualEdit   = true;
  record.manualEditBy   = userId;
  record.manualEditAt   = new Date();
  record.manualEditNote = updates.manualEditNote;
  record.status         = 'edited';

  await record.save();

  // Recalculate run totals
  await recalcRunTotals(runId);

  return record;
};

// ─── Skip employee from run ─────────────────────────────────────────────────
const skipRecord = async (runId, employeeId, companyId) => {
  const run = await PayrollRun.findOne({ _id: runId, company_id: companyId });
  if (!run) throw new AppError('Payroll run not found.', 404);
  if (run.status !== 'review') {
    throw new AppError(`Can only skip records in "review" status.`, 400);
  }

  const record = await PayrollRecord.findOne({
    payrollRun_id: runId,
    employee_id: employeeId,
    company_id: companyId,
  });
  if (!record) throw new AppError('Payroll record not found.', 404);

  record.status         = 'skipped';
  record.grossEarnings  = 0;
  record.totalDeductions = 0;
  record.netPay         = 0;
  await record.save();

  await recalcRunTotals(runId);

  return record;
};

// ─── Get payslips for an employee (self) ────────────────────────────────────
const getMyPayslips = async (employeeId, companyId) => {
  const records = await PayrollRecord.find({
    employee_id: employeeId,
    company_id: companyId,
    status: { $nin: ['warning', 'skipped'] },
  })
    .populate({
      path: 'payrollRun_id',
      match: { status: { $in: ['approved', 'paid'] } },
      select: 'month year status paidAt',
    })
    .sort({ year: -1, month: -1 })
    .lean();

  // Filter out records where run didn't match (not approved/paid)
  return records.filter(r => r.payrollRun_id !== null);
};

// ─── Helper: recalculate run totals ─────────────────────────────────────────
const recalcRunTotals = async (runId) => {
  const activeRecords = await PayrollRecord.find({
    payrollRun_id: runId,
    status: { $ne: 'skipped' },
  }).lean();

  const totalGross      = activeRecords.reduce((s, r) => s + r.grossEarnings, 0);
  const totalDeductions = activeRecords.reduce((s, r) => s + r.totalDeductions, 0);
  const totalNetPay     = activeRecords.reduce((s, r) => s + r.netPay, 0);
  const warningCount    = activeRecords.filter(r => r.status === 'warning').length;

  await PayrollRun.findByIdAndUpdate(runId, {
    totalEmployees:  activeRecords.length,
    totalGross:      Math.round(totalGross * 100) / 100,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    totalNetPay:     Math.round(totalNetPay * 100) / 100,
    warnings:        warningCount,
  });
};

module.exports = {
  initiateRun,
  processRun,
  approveRun,
  markPaid,
  listRuns,
  getRun,
  deleteRun,
  getRecords,
  getRecord,
  editRecord,
  skipRecord,
  getMyPayslips,
};
