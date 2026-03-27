const mongoose    = require('mongoose');
const WFHRequest  = require('../../models/WFHRequest');
const Employee    = require('../../models/Employee');
const WorkPolicy  = require('../../models/WorkPolicy');
const AppError    = require('../../utils/AppError');
const eventBus    = require('../../utils/eventBus');

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

// ─── Apply for WFH ──────────────────────────────────────────────────────────
const applyWFH = async (companyId, employeeId, body) => {
  const employee = await Employee.findOne({ _id: employeeId, company_id: companyId }).lean();
  if (!employee) throw new AppError('Employee not found.', 404);

  const startDate = new Date(body.startDate || body.date);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(body.endDate || body.startDate || body.date);
  endDate.setHours(0, 0, 0, 0);

  if (endDate < startDate) throw new AppError('End date cannot be before start date.', 400);

  // Validate date is today or in the future
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (startDate < today) {
    throw new AppError('WFH request date must be today or in the future.', 400);
  }

  // Check for overlapping request in the date range
  const existing = await WFHRequest.findOne({
    company_id: companyId,
    employee_id: employeeId,
    status: { $in: ['pending', 'approved'] },
    $or: [
      { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
    ],
  }).lean();

  if (existing) {
    throw new AppError('You already have a WFH request that overlaps with these dates.', 400);
  }

  const request = await WFHRequest.create({
    company_id:  companyId,
    employee_id: employeeId,
    startDate,
    endDate,
    reason:      body.reason || null,
  });

  const diffDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const result = request.toObject();
  eventBus.emit('wfh.requested', { companyId, wfhRequest: { ...result, totalDays: diffDays }, employee });
  return result;
};

// ─── My WFH Requests ────────────────────────────────────────────────────────
const myRequests = async (companyId, employeeId, { status, month, year, page = 1, limit = 20 } = {}) => {
  const filter = { company_id: companyId, employee_id: employeeId };
  if (status) filter.status = status;

  if (year && month) {
    const m = Number(month);
    const y = Number(year);
    filter.startDate = {
      $gte: new Date(y, m - 1, 1),
      $lt:  new Date(y, m, 1),
    };
  } else if (year) {
    filter.startDate = {
      $gte: new Date(`${year}-01-01`),
      $lte: new Date(`${year}-12-31`),
    };
  }

  const total = await WFHRequest.countDocuments(filter);
  const requests = await WFHRequest.find(filter)
    .populate('approvedBy', 'firstName lastName')
    .sort({ startDate: -1 })
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

// ─── List WFH Requests (Manager / HR view) ──────────────────────────────────
const listRequests = async (companyId, userId, scope, { status, search, page = 1, limit = 20 } = {}) => {
  const { scopeMatch, requester } = await buildScopeFilter(companyId, scope, userId);

  const filter = { company_id: toObjectId(companyId) };
  if (status) filter.status = status;

  // Exclude the requester's own requests
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
    ...(search
      ? [
          {
            $match: {
              $or: [
                { 'employee.firstName': { $regex: search, $options: 'i' } },
                { 'employee.lastName':  { $regex: search, $options: 'i' } },
                { 'employee.employeeId': { $regex: search, $options: 'i' } },
              ],
            },
          },
        ]
      : []),
    { $sort: { startDate: -1 } },
    {
      $facet: {
        data: [
          { $skip: (Number(page) - 1) * Number(limit) },
          { $limit: Number(limit) },
          {
            $project: {
              _id: 1,
              employee_id: {
                _id: '$employee._id',
                firstName: '$employee.firstName',
                lastName: '$employee.lastName',
                employeeId: '$employee.employeeId',
              },
              startDate: 1,
              endDate: 1,
              reason: 1,
              status: 1,
              rejectedReason: 1,
              approvedBy: 1,
              approvedAt: 1,
              createdAt: 1,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const [result] = await WFHRequest.aggregate(pipeline);
  const requests = result.data || [];
  const total = result.totalCount[0]?.count || 0;

  return { requests, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) };
};

// ─── Approve ─────────────────────────────────────────────────────────────────
const approveRequest = async (companyId, requestId, userId) => {
  const request = await WFHRequest.findOne({ _id: requestId, company_id: companyId });
  if (!request) throw new AppError('WFH request not found.', 404);
  if (request.status !== 'pending') throw new AppError(`Cannot approve a ${request.status} request.`, 400);

  request.status     = 'approved';
  request.approvedBy = userId;
  request.approvedAt = new Date();
  await request.save();

  const approvedResult = request.toObject();
  const employee = await Employee.findById(request.employee_id).lean();
  eventBus.emit('wfh.approved', { companyId, wfhRequest: approvedResult, employee });
  return approvedResult;
};

// ─── Reject ──────────────────────────────────────────────────────────────────
const rejectRequest = async (companyId, requestId, userId, reason) => {
  const request = await WFHRequest.findOne({ _id: requestId, company_id: companyId });
  if (!request) throw new AppError('WFH request not found.', 404);
  if (request.status !== 'pending') throw new AppError(`Cannot reject a ${request.status} request.`, 400);

  request.status         = 'rejected';
  request.approvedBy     = userId;
  request.approvedAt     = new Date();
  request.rejectedReason = reason || null;
  await request.save();

  const rejectedResult = request.toObject();
  const employee = await Employee.findById(request.employee_id).lean();
  eventBus.emit('wfh.rejected', { companyId, wfhRequest: rejectedResult, employee });
  return rejectedResult;
};

// ─── Cancel (by employee) ────────────────────────────────────────────────────
const cancelRequest = async (companyId, requestId, employeeId) => {
  const request = await WFHRequest.findOne({
    _id: requestId,
    company_id: companyId,
    employee_id: employeeId,
  });
  if (!request) throw new AppError('WFH request not found.', 404);

  if (request.status !== 'pending') {
    throw new AppError(`Cannot cancel a ${request.status} request.`, 400);
  }

  request.status = 'cancelled';
  await request.save();

  return request.toObject();
};

// ─── Is WFH Authorized (for clock-in service) ───────────────────────────────
const isWFHAuthorized = async (companyId, employeeId, date) => {
  const employee = await Employee.findOne({ _id: employeeId, company_id: companyId })
    .select('workMode workPolicy_id')
    .lean();

  if (!employee) return { authorized: false, reason: 'Employee not found.' };

  // 1. workMode = 'wfh' → always authorized
  if (employee.workMode === 'wfh') {
    return { authorized: true, reason: 'Employee work mode is WFH.' };
  }

  // 2. workMode = 'field' → always authorized (can clock in anywhere)
  if (employee.workMode === 'field') {
    return { authorized: true, reason: 'Employee work mode is field.' };
  }

  // 3. Check work policy hybrid + wfhDays
  if (employee.workPolicy_id) {
    const policy = await WorkPolicy.findById(employee.workPolicy_id)
      .select('hybridEnabled wfhDays')
      .lean();

    if (policy && policy.hybridEnabled && policy.wfhDays?.length > 0) {
      const checkDate = new Date(date);
      const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const dayOfWeek = dayNames[checkDate.getDay()];

      if (policy.wfhDays.includes(dayOfWeek)) {
        return { authorized: true, reason: `${dayOfWeek} is a scheduled WFH day per work policy.` };
      }
    }
  }

  // 4. Check approved WFH request that covers this date
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);

  const approvedRequest = await WFHRequest.findOne({
    company_id:  companyId,
    employee_id: employeeId,
    startDate:   { $lte: checkDate },
    endDate:     { $gte: checkDate },
    status:      'approved',
  }).lean();

  if (approvedRequest) {
    return { authorized: true, reason: 'Approved WFH request exists for this date.' };
  }

  // 5. Not authorized
  return { authorized: false, reason: 'No WFH authorization for this date. Please submit a WFH request.' };
};

module.exports = {
  applyWFH,
  myRequests,
  listRequests,
  approveRequest,
  rejectRequest,
  cancelRequest,
  isWFHAuthorized,
};
