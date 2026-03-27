const mongoose        = require('mongoose');
const Reimbursement   = require('../../models/Reimbursement');
const ExpenseCategory = require('../../models/ExpenseCategory');
const Employee        = require('../../models/Employee');
const AppError        = require('../../utils/AppError');
const eventBus        = require('../../utils/eventBus');
const { uploadToB2, getDownloadUrl: getB2DownloadUrl, deleteFromR2 } = require('../../utils/r2');

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

// ─── Build B2 file key for receipt ──────────────────────────────────────────
const buildReceiptKey = (companyId, employeeId, fileName) => {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `companies/${companyId}/reimbursements/${employeeId}/${Date.now()}_${safe}`;
};

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY CRUD
// ═══════════════════════════════════════════════════════════════════════════════

const listCategories = async (companyId) => {
  return ExpenseCategory.find({ company_id: companyId, isActive: true })
    .sort({ name: 1 })
    .lean();
};

const createCategory = async (companyId, body) => {
  return ExpenseCategory.create({
    company_id: companyId,
    ...body,
  });
};

const updateCategory = async (companyId, id, body) => {
  const category = await ExpenseCategory.findOne({ _id: id, company_id: companyId });
  if (!category) throw new AppError('Expense category not found.', 404);

  Object.assign(category, body);
  await category.save();
  return category;
};

const deleteCategory = async (companyId, id) => {
  const category = await ExpenseCategory.findOne({ _id: id, company_id: companyId });
  if (!category) throw new AppError('Expense category not found.', 404);

  // Soft-delete if claims exist, hard-delete otherwise
  const claimCount = await Reimbursement.countDocuments({ category_id: id, company_id: companyId });
  if (claimCount > 0) {
    category.isActive = false;
    await category.save();
  } else {
    await category.deleteOne();
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// POLICY LIMIT CHECKS
// ═══════════════════════════════════════════════════════════════════════════════

const checkPolicyLimits = async (companyId, employeeId, categoryId, amount, excludeClaimId = null) => {
  const category = await ExpenseCategory.findById(categoryId).lean();
  if (!category) throw new AppError('Expense category not found.', 404);

  let policyLimitExceeded = false;

  // Per-claim limit check
  if (category.perClaimLimit !== null && amount > category.perClaimLimit) {
    policyLimitExceeded = true;
  }

  // Monthly limit check — sum all non-rejected claims this month for this employee + category
  if (category.monthlyLimit !== null) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const matchFilter = {
      company_id:  toObjectId(companyId),
      employee_id: toObjectId(employeeId),
      category_id: toObjectId(categoryId),
      status:      { $ne: 'rejected' },
      expenseDate: { $gte: monthStart, $lt: monthEnd },
    };

    // Exclude current claim if updating
    if (excludeClaimId) {
      matchFilter._id = { $ne: toObjectId(excludeClaimId) };
    }

    const [agg] = await Reimbursement.aggregate([
      { $match: matchFilter },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const currentTotal = agg?.total || 0;
    if (currentTotal + amount > category.monthlyLimit) {
      policyLimitExceeded = true;
    }
  }

  return { policyLimitExceeded, category };
};

// ═══════════════════════════════════════════════════════════════════════════════
// REIMBURSEMENT CRUD
// ═══════════════════════════════════════════════════════════════════════════════

const createClaim = async (companyId, employeeId, body, file) => {
  const { policyLimitExceeded, category } = await checkPolicyLimits(
    companyId, employeeId, body.category_id, Number(body.amount)
  );

  // Upload receipt to B2 if file provided
  let receiptFileKey  = null;
  let receiptFileName = null;

  if (file) {
    const fileKey = buildReceiptKey(companyId, employeeId, file.originalname);
    await uploadToB2(fileKey, file.buffer, file.mimetype);
    receiptFileKey  = fileKey;
    receiptFileName = file.originalname;
  } else if (category.requiresReceipt) {
    // Receipt required but not provided — still allow draft creation
    // Receipt can be uploaded later via update
  }

  const claim = await Reimbursement.create({
    company_id:         companyId,
    employee_id:        employeeId,
    category_id:        body.category_id,
    description:        body.description,
    amount:             Number(body.amount),
    expenseDate:        body.expenseDate,
    purpose:            body.purpose || null,
    receiptFileKey,
    receiptFileName,
    policyLimitExceeded,
    status:             'draft',
  });

  return claim;
};

const updateClaim = async (companyId, claimId, employeeId, body, file) => {
  const claim = await Reimbursement.findOne({
    _id:         claimId,
    company_id:  companyId,
    employee_id: employeeId,
  });

  if (!claim) throw new AppError('Reimbursement claim not found.', 404);
  if (!['draft', 'rejected'].includes(claim.status)) {
    throw new AppError('Only draft or rejected claims can be edited.', 400);
  }

  // Reset rejected claim back to draft
  if (claim.status === 'rejected') {
    claim.status = 'draft';
    claim.rejectedBy = null;
    claim.rejectedAt = null;
    claim.rejectionReason = null;
    claim.rejectedAtStage = null;
  }

  // Re-check policy limits if amount or category changed
  const newAmount   = body.amount !== undefined ? Number(body.amount) : claim.amount;
  const newCategory = body.category_id || claim.category_id.toString();

  const { policyLimitExceeded } = await checkPolicyLimits(
    companyId, employeeId, newCategory, newAmount, claimId
  );

  // Handle new receipt upload
  if (file) {
    // Delete old receipt from B2 if it exists
    if (claim.receiptFileKey) {
      try { await deleteFromR2(claim.receiptFileKey); } catch { /* ignore */ }
    }
    const fileKey = buildReceiptKey(companyId, employeeId, file.originalname);
    await uploadToB2(fileKey, file.buffer, file.mimetype);
    claim.receiptFileKey  = fileKey;
    claim.receiptFileName = file.originalname;
  }

  // Update fields
  if (body.category_id)  claim.category_id  = body.category_id;
  if (body.description)  claim.description  = body.description;
  if (body.amount !== undefined) claim.amount = Number(body.amount);
  if (body.expenseDate)  claim.expenseDate  = body.expenseDate;
  if (body.purpose !== undefined) claim.purpose = body.purpose || null;

  claim.policyLimitExceeded = policyLimitExceeded;
  await claim.save();
  return claim;
};

const deleteClaim = async (companyId, claimId, employeeId) => {
  const claim = await Reimbursement.findOne({
    _id:         claimId,
    company_id:  companyId,
    employee_id: employeeId,
  });

  if (!claim) throw new AppError('Reimbursement claim not found.', 404);
  if (claim.status !== 'draft') {
    throw new AppError('Only draft claims can be deleted.', 400);
  }

  // Delete receipt from B2 if exists
  if (claim.receiptFileKey) {
    try { await deleteFromR2(claim.receiptFileKey); } catch { /* ignore */ }
  }

  await claim.deleteOne();
};

const submitClaim = async (companyId, claimId, employeeId) => {
  const claim = await Reimbursement.findOne({
    _id:         claimId,
    company_id:  companyId,
    employee_id: employeeId,
  });

  if (!claim) throw new AppError('Reimbursement claim not found.', 404);
  if (claim.status !== 'draft') {
    throw new AppError('Only draft claims can be submitted.', 400);
  }

  claim.status = 'submitted';
  await claim.save();

  const employee = await Employee.findById(employeeId).lean();
  eventBus.emit('reimbursement.submitted', {
    companyId,
    reimbursement: claim.toObject(),
    employee,
  });

  return claim;
};

const myClaims = async (companyId, employeeId, { status, month, year, page = 1, limit = 20 } = {}) => {
  const filter = { company_id: companyId, employee_id: employeeId };

  if (status) filter.status = status;

  if (year && month) {
    const m = Number(month);
    const y = Number(year);
    filter.expenseDate = {
      $gte: new Date(y, m - 1, 1),
      $lt:  new Date(y, m, 1),
    };
  } else if (year) {
    filter.expenseDate = {
      $gte: new Date(`${year}-01-01`),
      $lte: new Date(`${year}-12-31`),
    };
  }

  const total = await Reimbursement.countDocuments(filter);
  const claims = await Reimbursement.find(filter)
    .populate('category_id', 'name')
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  return { claims, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) };
};

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVALS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Resolve scope filter for department/team ────────────────────────────────
const buildScopeFilter = async (companyId, scope, userId) => {
  const requester = await Employee.findOne({ user_id: userId, company_id: companyId }).lean();

  if (scope === 'global') return { requester };

  if (!requester) return { scopeMatch: { _id: null }, requester: null };

  let scopeMatch = null;
  if (scope === 'department' && requester.department_id) {
    scopeMatch = { 'employee.department_id': requester.department_id };
  } else if (scope === 'team' && requester.team_id) {
    scopeMatch = { 'employee.team_id': requester.team_id };
  } else {
    scopeMatch = { employee_id: requester._id };
  }

  return { scopeMatch, requester };
};

const listPendingApprovals = async (companyId, userId, scope, { status, search, page = 1, limit = 20 } = {}) => {
  const { scopeMatch, requester } = await buildScopeFilter(companyId, scope, userId);

  const filter = { company_id: toObjectId(companyId) };

  // Determine which statuses to show based on scope
  if (status) {
    filter.status = status;
  } else {
    // Default: show submitted (for managers) and manager_approved (for HR)
    filter.status = { $in: ['submitted', 'manager_approved'] };
  }

  // Exclude the requester's own claims
  if (requester) filter.employee_id = { $ne: requester._id };

  const pipeline = [
    { $match: filter },
    {
      $lookup: {
        from:         'employees',
        localField:   'employee_id',
        foreignField: '_id',
        as:           'employee',
      },
    },
    { $unwind: '$employee' },
    ...(scopeMatch ? [{ $match: scopeMatch }] : []),
    ...(search
      ? [{
          $match: {
            $or: [
              { 'employee.firstName':  { $regex: search, $options: 'i' } },
              { 'employee.lastName':   { $regex: search, $options: 'i' } },
              { 'employee.employeeId': { $regex: search, $options: 'i' } },
            ],
          },
        }]
      : []),
    {
      $lookup: {
        from:         'expensecategories',
        localField:   'category_id',
        foreignField: '_id',
        as:           'category',
      },
    },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        data: [
          { $skip: (Number(page) - 1) * Number(limit) },
          { $limit: Number(limit) },
          {
            $project: {
              _id:         1,
              employee_id: {
                _id:        '$employee._id',
                firstName:  '$employee.firstName',
                lastName:   '$employee.lastName',
                employeeId: '$employee.employeeId',
              },
              category: {
                _id:  '$category._id',
                name: '$category.name',
              },
              description:        1,
              amount:             1,
              expenseDate:        1,
              purpose:            1,
              status:             1,
              policyLimitExceeded: 1,
              receiptFileName:    1,
              managerNote:        1,
              hrNote:             1,
              rejectionReason:    1,
              rejectedAtStage:    1,
              createdAt:          1,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const [result] = await Reimbursement.aggregate(pipeline);
  const claims = result.data || [];
  const total  = result.totalCount[0]?.count || 0;

  return { claims, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) };
};

const managerApprove = async (companyId, claimId, userId, note) => {
  const claim = await Reimbursement.findOne({ _id: claimId, company_id: companyId });
  if (!claim) throw new AppError('Reimbursement claim not found.', 404);
  if (claim.status !== 'submitted') {
    throw new AppError(`Cannot manager-approve a claim in "${claim.status}" status.`, 400);
  }

  claim.status            = 'manager_approved';
  claim.managerApprovedBy = userId;
  claim.managerApprovedAt = new Date();
  claim.managerNote       = note || null;
  await claim.save();

  const employee = await Employee.findById(claim.employee_id).lean();
  eventBus.emit('reimbursement.manager_approved', {
    companyId,
    reimbursement: claim.toObject(),
    employee,
  });

  return claim;
};

const hrApprove = async (companyId, claimId, userId, body) => {
  const claim = await Reimbursement.findOne({ _id: claimId, company_id: companyId });
  if (!claim) throw new AppError('Reimbursement claim not found.', 404);
  if (claim.status !== 'manager_approved') {
    throw new AppError(`Cannot HR-approve a claim in "${claim.status}" status.`, 400);
  }

  claim.hrApprovedBy = userId;
  claim.hrApprovedAt = new Date();
  claim.hrNote       = body.note || null;
  claim.paymentMode  = body.paymentMode || 'payroll';

  if (body.paymentMode === 'immediate') {
    // Immediate payment: set to paid right away
    claim.status               = 'paid';
    claim.paidAt               = new Date();
    claim.immediatePaymentBy   = userId;
    claim.immediatePaymentRef  = body.immediatePaymentRef || null;
    claim.immediatePaymentDate = body.immediatePaymentDate || new Date();
    claim.immediatePaymentNote = body.immediatePaymentNote || null;
    await claim.save();

    const employee = await Employee.findById(claim.employee_id).lean();
    eventBus.emit('reimbursement.paid', {
      companyId,
      reimbursement: claim.toObject(),
      employee,
    });
  } else {
    // Payroll: set to hr_approved — will be picked up in next payroll run
    claim.status = 'hr_approved';
    await claim.save();

    const employee = await Employee.findById(claim.employee_id).lean();
    eventBus.emit('reimbursement.hr_approved', {
      companyId,
      reimbursement: claim.toObject(),
      employee,
    });
  }

  return claim;
};

const reject = async (companyId, claimId, userId, reason, stage) => {
  const claim = await Reimbursement.findOne({ _id: claimId, company_id: companyId });
  if (!claim) throw new AppError('Reimbursement claim not found.', 404);

  if (!['submitted', 'manager_approved'].includes(claim.status)) {
    throw new AppError(`Cannot reject a claim in "${claim.status}" status.`, 400);
  }

  // Determine rejection stage
  const rejectedAtStage = claim.status === 'submitted' ? 'manager' : 'hr';

  claim.status          = 'rejected';
  claim.rejectedBy      = userId;
  claim.rejectedAt      = new Date();
  claim.rejectionReason = reason;
  claim.rejectedAtStage = stage || rejectedAtStage;
  await claim.save();

  const employee = await Employee.findById(claim.employee_id).lean();
  eventBus.emit('reimbursement.rejected', {
    companyId,
    reimbursement: claim.toObject(),
    employee,
  });

  return claim;
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

const getMonthlySummary = async (companyId, employeeId, month, year) => {
  const m = Number(month);
  const y = Number(year);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd   = new Date(y, m, 1);

  const baseFilter = {
    company_id:  toObjectId(companyId),
    employee_id: toObjectId(employeeId),
    expenseDate: { $gte: monthStart, $lt: monthEnd },
    status:      { $ne: 'rejected' },
  };

  const [summary] = await Reimbursement.aggregate([
    { $match: baseFilter },
    {
      $group: {
        _id: null,
        totalSubmitted: {
          $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, '$amount', 0] },
        },
        totalManagerApproved: {
          $sum: { $cond: [{ $eq: ['$status', 'manager_approved'] }, '$amount', 0] },
        },
        totalHrApproved: {
          $sum: { $cond: [{ $eq: ['$status', 'hr_approved'] }, '$amount', 0] },
        },
        totalPaid: {
          $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] },
        },
        totalDraft: {
          $sum: { $cond: [{ $eq: ['$status', 'draft'] }, '$amount', 0] },
        },
        claimCount: { $sum: 1 },
      },
    },
  ]);

  return summary || {
    totalSubmitted: 0,
    totalManagerApproved: 0,
    totalHrApproved: 0,
    totalPaid: 0,
    totalDraft: 0,
    claimCount: 0,
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// PAYROLL INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all HR-approved reimbursements for an employee in a given month/year
 * that are set to paymentMode='payroll'.
 */
const getApprovedForPayroll = async (companyId, employeeId, month, year) => {
  const m = Number(month);
  const y = Number(year);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd   = new Date(y, m, 1);

  return Reimbursement.find({
    company_id:  companyId,
    employee_id: employeeId,
    status:      'hr_approved',
    paymentMode: 'payroll',
    expenseDate: { $gte: monthStart, $lt: monthEnd },
  }).lean();
};

/**
 * Mark reimbursement claims as paid by a payroll run.
 */
const markPaidByPayroll = async (claimIds, payrollRunId) => {
  if (!claimIds || claimIds.length === 0) return;

  await Reimbursement.updateMany(
    { _id: { $in: claimIds } },
    {
      $set: {
        status:        'paid',
        payrollRun_id: payrollRunId,
        paidAt:        new Date(),
      },
    }
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// RECEIPT
// ═══════════════════════════════════════════════════════════════════════════════

const getReceiptDownloadUrl = async (companyId, claimId) => {
  const claim = await Reimbursement.findOne({ _id: claimId, company_id: companyId }).lean();
  if (!claim) throw new AppError('Reimbursement claim not found.', 404);
  if (!claim.receiptFileKey) throw new AppError('No receipt attached to this claim.', 404);

  const downloadUrl = await getB2DownloadUrl(claim.receiptFileKey);
  return { downloadUrl, fileName: claim.receiptFileName };
};

module.exports = {
  // Categories
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  // Claims
  createClaim,
  updateClaim,
  deleteClaim,
  submitClaim,
  myClaims,
  // Approvals
  listPendingApprovals,
  managerApprove,
  hrApprove,
  reject,
  // Summary
  getMonthlySummary,
  // Payroll
  getApprovedForPayroll,
  markPaidByPayroll,
  // Receipt
  getReceiptDownloadUrl,
};
