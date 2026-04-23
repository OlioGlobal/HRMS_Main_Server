const mongoose     = require('mongoose');
const LeaveRequest = require('../../models/LeaveRequest');
const LeaveBalance = require('../../models/LeaveBalance');
const LeaveType    = require('../../models/LeaveType');
const Employee     = require('../../models/Employee');
const Company      = require('../../models/Company');
const AppError     = require('../../utils/AppError');
const eventBus     = require('../../utils/eventBus');
const { calculateLeaveDays } = require('../../utils/calculateLeaveDays');
const { getLeaveYear }       = require('../../utils/getLeaveYear');

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

// ─── Apply for leave ────────────────────────────────────────────────────────
const applyLeave = async (companyId, employeeId, body) => {
  const employee = await Employee.findOne({ _id: employeeId, company_id: companyId }).lean();
  if (!employee) throw new AppError('Employee not found.', 404);

  const leaveType = await LeaveType.findOne({ _id: body.leaveType_id, company_id: companyId, isActive: true }).lean();
  if (!leaveType) throw new AppError('Leave type not found.', 404);

  const company = await Company.findById(companyId).lean();
  const weekendDays = company.settings?.leave?.weekendDays ?? ['SAT', 'SUN'];

  // ── Gender check ──
  if (leaveType.applicableGender !== 'all' && employee.gender !== leaveType.applicableGender) {
    throw new AppError(`This leave type is only for ${leaveType.applicableGender} employees.`, 400);
  }

  // ── Probation check ──
  if (leaveType.restrictDuringProbation && employee.probationEndDate) {
    const today = new Date();
    if (today < new Date(employee.probationEndDate)) {
      throw new AppError('This leave type is not available during probation period.', 400);
    }
  }

  // ── Notice period check ──
  if (leaveType.restrictDuringNotice && employee.status === 'notice') {
    throw new AppError('This leave type is not available during notice period.', 400);
  }

  // ── Half day ──
  if (body.isHalfDay && !leaveType.allowHalfDay) {
    throw new AppError('Half-day is not allowed for this leave type.', 400);
  }

  const startDate = new Date(body.startDate);
  const endDate   = new Date(body.endDate);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  if (endDate < startDate) throw new AppError('End date cannot be before start date.', 400);

  // Half-day: start === end, totalDays = 0.5
  if (body.isHalfDay && startDate.getTime() !== endDate.getTime()) {
    throw new AppError('Half-day leave must be for a single day.', 400);
  }

  // ── Notice period check ──
  if (leaveType.minDaysNotice > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((startDate - today) / (1000 * 60 * 60 * 24));
    if (diffDays < leaveType.minDaysNotice) {
      throw new AppError(`This leave requires at least ${leaveType.minDaysNotice} day(s) advance notice.`, 400);
    }
  }

  // ── Calculate total days ──
  let totalDays;
  if (body.isHalfDay) {
    totalDays = 0.5;
  } else {
    totalDays = await calculateLeaveDays(startDate, endDate, {
      companyId,
      employeeId,
      locationId: employee.location_id || null,
      weekendDays,
      countWeekends: leaveType.countWeekends,
      countHolidays: leaveType.countHolidays,
    });
  }

  if (totalDays <= 0) throw new AppError('No working days in the selected range.', 400);

  // ── Max days at once check ──
  if (totalDays > leaveType.maxDaysAtOnce) {
    throw new AppError(`Maximum ${leaveType.maxDaysAtOnce} day(s) allowed at once for this leave type.`, 400);
  }

  // ── Overlap check ──
  const overlap = await LeaveRequest.findOne({
    employee_id: employeeId,
    status: { $in: ['pending', 'approved'] },
    $or: [
      { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
    ],
  }).lean();
  if (overlap) {
    throw new AppError('You already have a leave request overlapping these dates.', 400);
  }

  // ── Balance check ──
  const fiscalYearStart = company.settings?.fiscalYearStart ?? 1;
  const balanceYear = getLeaveYear(startDate, leaveType.resetCycle, fiscalYearStart);
  const balance = await LeaveBalance.findOne({
    company_id: companyId,
    employee_id: employeeId,
    leaveType_id: leaveType._id,
    year: balanceYear,
  });

  let isLWP = false;

  if (leaveType.type === 'comp_off') {
    // Comp-off: balance must exist and have enough
    if (!balance) throw new AppError('No comp-off balance available.', 400);
    const remaining = balance.allocated + balance.carryForward + balance.adjustment - balance.used - balance.pending;
    if (remaining < totalDays) {
      throw new AppError(`Insufficient comp-off balance. Available: ${remaining}.`, 400);
    }
  } else if (balance) {
    const remaining = balance.allocated + balance.carryForward + balance.adjustment - balance.used - balance.pending;
    if (remaining < totalDays) {
      isLWP = true; // Auto-flag as Leave Without Pay
    }
  } else {
    isLWP = true; // No balance record at all
  }

  // Reserve balance (increment pending)
  if (balance && !isLWP) {
    balance.pending += totalDays;
    await balance.save();
  }

  const request = await LeaveRequest.create({
    company_id:     companyId,
    employee_id:    employeeId,
    leaveType_id:   leaveType._id,
    startDate,
    endDate,
    totalDays,
    isHalfDay:      body.isHalfDay || false,
    halfDaySession: body.isHalfDay ? (body.halfDaySession || 'morning') : null,
    reason:         body.reason || null,
    isLWP,
    balanceYear,
  });

  const result = request.toObject();
  eventBus.emit('leave.applied', { companyId, leaveRequest: result, employee });
  return result;
};

// ─── List requests for one employee (My Leaves) ────────────────────────────
const getMyLeaves = async (companyId, employeeId, { status, year, page = 1, limit = 20 } = {}) => {
  const filter = { company_id: companyId, employee_id: employeeId };
  if (status) filter.status = status;
  if (year) {
    filter.startDate = {
      $gte: new Date(`${year}-01-01`),
      $lte: new Date(`${year}-12-31`),
    };
  }

  const total = await LeaveRequest.countDocuments(filter);
  const requests = await LeaveRequest.find(filter)
    .populate('leaveType_id', 'name code type')
    .populate('reviewedBy', 'firstName lastName')
    .sort({ appliedAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  return { requests, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) };
};

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

// ─── List pending requests (Manager / HR approval queue) ────────────────────
const listPendingRequests = async (companyId, { department, page = 1, limit = 20 } = {}, scope = 'global', userId = null) => {
  const { scopeMatch, requester } = await buildScopeFilter(companyId, scope, userId);

  // Exclude the requester's own leave requests
  const excludeSelf = requester ? { employee_id: { $ne: requester._id } } : {};

  const pipeline = [
    { $match: { company_id: toObjectId(companyId), status: 'pending', ...excludeSelf } },
    {
      $lookup: {
        from: 'employees',
        localField: 'employee_id',
        foreignField: '_id',
        as: 'employee',
      },
    },
    { $unwind: '$employee' },
    ...(scopeMatch ? [{ $match: scopeMatch }] : []),
    ...(department ? [{ $match: { 'employee.department_id': toObjectId(department) } }] : []),
    {
      $lookup: {
        from: 'leavetypes',
        localField: 'leaveType_id',
        foreignField: '_id',
        as: 'leaveType',
      },
    },
    { $unwind: '$leaveType' },
    { $sort: { appliedAt: -1 } },
    { $skip: (Number(page) - 1) * Number(limit) },
    { $limit: Number(limit) },
    {
      $project: {
        _id: 1,
        'employee.firstName': 1,
        'employee.lastName': 1,
        'employee.employeeId': 1,
        'employee.department_id': 1,
        'employee._id': 1,
        'leaveType.name': 1,
        'leaveType.code': 1,
        startDate: 1,
        endDate: 1,
        totalDays: 1,
        isHalfDay: 1,
        halfDaySession: 1,
        reason: 1,
        isLWP: 1,
        status: 1,
        appliedAt: 1,
      },
    },
  ];

  return LeaveRequest.aggregate(pipeline);
};

// ─── All requests (HR view with filters) ────────────────────────────────────
const listAllRequests = async (companyId, { status, department, year, fromDate, toDate, page = 1, limit = 20 } = {}, scope = 'global', userId = null) => {
  const filter = { company_id: toObjectId(companyId) };
  if (status) filter.status = status;
  if (fromDate || toDate) {
    filter.startDate = {};
    if (fromDate) filter.startDate.$gte = new Date(fromDate);
    if (toDate)   filter.startDate.$lte = new Date(toDate);
  } else if (year) {
    filter.startDate = {
      $gte: new Date(`${year}-01-01`),
      $lte: new Date(`${year}-12-31`),
    };
  }

  const { scopeMatch, requester } = await buildScopeFilter(companyId, scope, userId);

  // Exclude the requester's own leave requests
  if (requester) filter.employee_id = { $ne: requester._id };

  const pipeline = [
    { $match: filter },
    {
      $lookup: {
        from: 'employees',
        localField: 'employee_id',
        foreignField: '_id',
        as: 'employee',
      },
    },
    { $unwind: '$employee' },
    ...(scopeMatch ? [{ $match: scopeMatch }] : []),
    ...(department ? [{ $match: { 'employee.department_id': toObjectId(department) } }] : []),
    {
      $lookup: {
        from: 'leavetypes',
        localField: 'leaveType_id',
        foreignField: '_id',
        as: 'leaveType',
      },
    },
    { $unwind: '$leaveType' },
    { $sort: { appliedAt: -1 } },
    { $skip: (Number(page) - 1) * Number(limit) },
    { $limit: Number(limit) },
  ];

  return LeaveRequest.aggregate(pipeline);
};

// ─── Approve ────────────────────────────────────────────────────────────────
const approveLeave = async (companyId, requestId, reviewerId, reviewNote) => {
  const request = await LeaveRequest.findOne({ _id: requestId, company_id: companyId });
  if (!request) throw new AppError('Leave request not found.', 404);
  if (request.status !== 'pending') throw new AppError(`Cannot approve a ${request.status} request.`, 400);

  request.status     = 'approved';
  request.reviewedBy = reviewerId;
  request.reviewedAt = new Date();
  request.reviewNote = reviewNote || null;
  await request.save();

  // Move pending → used in balance
  if (!request.isLWP) {
    const balance = await LeaveBalance.findOne({
      company_id:  companyId,
      employee_id: request.employee_id,
      leaveType_id: request.leaveType_id,
      year: request.balanceYear ?? request.startDate.getFullYear(),
    });

    if (balance) {
      balance.pending = Math.max(0, balance.pending - request.totalDays);
      balance.used   += request.totalDays;
      await balance.save();
    }
  }

  const approvedResult = request.toObject();
  eventBus.emit('leave.approved', { companyId, leaveRequest: approvedResult, employee: await Employee.findById(request.employee_id).lean() });
  return approvedResult;
};

// ─── Reject ─────────────────────────────────────────────────────────────────
const rejectLeave = async (companyId, requestId, reviewerId, reviewNote) => {
  const request = await LeaveRequest.findOne({ _id: requestId, company_id: companyId });
  if (!request) throw new AppError('Leave request not found.', 404);
  if (request.status !== 'pending') throw new AppError(`Cannot reject a ${request.status} request.`, 400);

  request.status     = 'rejected';
  request.reviewedBy = reviewerId;
  request.reviewedAt = new Date();
  request.reviewNote = reviewNote || null;
  await request.save();

  // Restore pending balance
  if (!request.isLWP) {
    const balance = await LeaveBalance.findOne({
      company_id:  companyId,
      employee_id: request.employee_id,
      leaveType_id: request.leaveType_id,
      year: request.balanceYear ?? request.startDate.getFullYear(),
    });

    if (balance) {
      balance.pending = Math.max(0, balance.pending - request.totalDays);
      await balance.save();
    }
  }

  const rejectedResult = request.toObject();
  eventBus.emit('leave.rejected', { companyId, leaveRequest: rejectedResult, employee: await Employee.findById(request.employee_id).lean() });
  return rejectedResult;
};

// ─── Cancel (by employee) ───────────────────────────────────────────────────
const cancelLeave = async (companyId, employeeId, requestId) => {
  const request = await LeaveRequest.findOne({
    _id: requestId,
    company_id: companyId,
    employee_id: employeeId,
  });
  if (!request) throw new AppError('Leave request not found.', 404);

  if (request.status === 'cancelled') throw new AppError('Already cancelled.', 400);
  if (request.status === 'rejected')  throw new AppError('Cannot cancel a rejected request.', 400);

  const wasPending  = request.status === 'pending';
  const wasApproved = request.status === 'approved';

  request.status = 'cancelled';
  await request.save();

  // Restore balance
  if (!request.isLWP) {
    const balance = await LeaveBalance.findOne({
      company_id:  companyId,
      employee_id: employeeId,
      leaveType_id: request.leaveType_id,
      year: request.balanceYear ?? request.startDate.getFullYear(),
    });

    if (balance) {
      if (wasPending) {
        balance.pending = Math.max(0, balance.pending - request.totalDays);
      } else if (wasApproved) {
        balance.used = Math.max(0, balance.used - request.totalDays);
      }
      await balance.save();
    }
  }

  const cancelledResult = request.toObject();
  eventBus.emit('leave.cancelled', { companyId, leaveRequest: cancelledResult, employee: await Employee.findById(employeeId).lean() });
  return cancelledResult;
};

module.exports = {
  applyLeave,
  getMyLeaves,
  listPendingRequests,
  listAllRequests,
  approveLeave,
  rejectLeave,
  cancelLeave,
};
