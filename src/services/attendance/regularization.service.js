const mongoose               = require('mongoose');
const RegularizationRequest  = require('../../models/RegularizationRequest');
const AttendanceRecord       = require('../../models/AttendanceRecord');
const Employee               = require('../../models/Employee');
const Location               = require('../../models/Location');
const Company                = require('../../models/Company');
const WorkPolicy             = require('../../models/WorkPolicy');
const AppError               = require('../../utils/AppError');
const { calculateAttendanceStatus } = require('../../utils/calculateAttendanceStatus');

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

// ─── Submit regularization request ────────────────────────────────────────────

const submit = async (companyId, userId, body) => {
  const employee = await Employee.findOne({ user_id: userId, company_id: companyId }).lean();
  if (!employee) throw new AppError('No employee profile linked to your account.', 400);

  const record = await AttendanceRecord.findOne({
    _id: body.attendanceId,
    company_id: companyId,
    employee_id: employee._id,
  });
  if (!record) throw new AppError('Attendance record not found.', 404);

  // Check if pending request already exists for this record
  const existing = await RegularizationRequest.findOne({
    attendance_id: record._id,
    employee_id: employee._id,
    status: 'pending',
  });
  if (existing) throw new AppError('A pending request already exists for this record.', 400);

  // Validate missed type vs requested times
  if ((body.missedType === 'clock_in' || body.missedType === 'both') && !body.requestedClockIn) {
    throw new AppError('Requested clock-in time is required.', 400);
  }
  if ((body.missedType === 'clock_out' || body.missedType === 'both') && !body.requestedClockOut) {
    throw new AppError('Requested clock-out time is required.', 400);
  }

  const request = await RegularizationRequest.create({
    company_id:       companyId,
    employee_id:      employee._id,
    attendance_id:    record._id,
    date:             record.date,
    missedType:       body.missedType,
    requestedClockIn:  body.requestedClockIn ? new Date(body.requestedClockIn) : null,
    requestedClockOut: body.requestedClockOut ? new Date(body.requestedClockOut) : null,
    reason:           body.reason,
  });

  return request.toObject();
};

// ─── My regularization requests ───────────────────────────────────────────────

const getMyRequests = async (companyId, userId, { page = 1, limit = 20 } = {}) => {
  const employee = await Employee.findOne({ user_id: userId, company_id: companyId }).lean();
  if (!employee) throw new AppError('No employee profile linked to your account.', 400);

  const filter = { company_id: companyId, employee_id: employee._id };
  const total = await RegularizationRequest.countDocuments(filter);
  const requests = await RegularizationRequest.find(filter)
    .populate('attendance_id', 'date clockInTime clockOutTime status')
    .populate('reviewedBy', 'firstName lastName')
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  return { requests, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) };
};

// ─── List all regularization requests (HR view, scope-filtered) ──────────────

const listRequests = async (companyId, query = {}, scope = 'global', userId = null) => {
  const { status, department, fromDate, toDate, search, page = 1, limit = 20 } = query;

  const requester = await Employee.findOne({ user_id: userId, company_id: companyId }).lean();

  const match = { company_id: toObjectId(companyId) };
  if (status) match.status = status;
  if (fromDate && toDate) {
    match.date = {
      $gte: new Date(fromDate + 'T00:00:00Z'),
      $lte: new Date(toDate + 'T00:00:00Z'),
    };
  }

  // Scope filtering
  let scopeMatch = null;
  if (scope === 'department' && requester?.department_id) {
    scopeMatch = { 'employee.department_id': requester.department_id };
  } else if (scope === 'team' && requester?.team_id) {
    scopeMatch = { 'employee.team_id': requester.team_id };
  } else if (scope === 'self') {
    scopeMatch = { employee_id: requester?._id || null };
  }

  const pipeline = [
    { $match: match },
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
    ...(search ? [{
      $match: {
        $or: [
          { 'employee.firstName': { $regex: search, $options: 'i' } },
          { 'employee.lastName':  { $regex: search, $options: 'i' } },
          { 'employee.employeeId': { $regex: search, $options: 'i' } },
        ],
      },
    }] : []),
    {
      $lookup: {
        from: 'attendancerecords',
        localField: 'attendance_id',
        foreignField: '_id',
        as: 'attendance',
      },
    },
    { $unwind: { path: '$attendance', preserveNullAndEmptyArrays: true } },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        data: [
          { $skip: (Number(page) - 1) * Number(limit) },
          { $limit: Number(limit) },
          {
            $project: {
              _id: 1, date: 1, missedType: 1,
              requestedClockIn: 1, requestedClockOut: 1,
              reason: 1, status: 1, reviewNote: 1,
              createdAt: 1, reviewedAt: 1,
              'employee._id': 1, 'employee.firstName': 1, 'employee.lastName': 1,
              'employee.employeeId': 1, 'employee.department_id': 1,
              'attendance.clockInTime': 1, 'attendance.clockOutTime': 1,
              'attendance.status': 1,
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ];

  const results = await RegularizationRequest.aggregate(pipeline);
  const result  = results[0] || { data: [], total: [] };
  return {
    requests: result.data,
    total: result.total[0]?.count || 0,
    page: Number(page),
    totalPages: Math.ceil((result.total[0]?.count || 0) / Number(limit)),
  };
};

// ─── Approve ─────────────────────────────────────────────────────────────────

const approve = async (companyId, requestId, reviewerId, reviewNote) => {
  const request = await RegularizationRequest.findOne({ _id: requestId, company_id: companyId });
  if (!request) throw new AppError('Regularization request not found.', 404);
  if (request.status !== 'pending') throw new AppError(`Cannot approve a ${request.status} request.`, 400);

  request.status     = 'approved';
  request.reviewedBy = reviewerId;
  request.reviewedAt = new Date();
  request.reviewNote = reviewNote || null;
  await request.save();

  // Auto-update attendance record
  const record = await AttendanceRecord.findById(request.attendance_id);
  if (record) {
    if (request.missedType === 'clock_in' || request.missedType === 'both') {
      record.clockInTime = request.requestedClockIn;
    }
    if (request.missedType === 'clock_out' || request.missedType === 'both') {
      record.clockOutTime = request.requestedClockOut;
    }

    record.isManualOverride = true;
    record.overrideReason   = `Regularization approved: ${request.reason}`;
    record.overrideBy       = reviewerId;
    record.missedClockOut   = false;

    // Ensure workPolicySnapshot exists — rebuild from employee's policy if missing
    if (!record.workPolicySnapshot?.workStart) {
      const emp = await Employee.findById(record.employee_id).lean();
      if (emp) {
        let policy = null;
        if (emp.workPolicy_id) {
          policy = await WorkPolicy.findById(emp.workPolicy_id).lean();
        }
        if (!policy) {
          policy = await WorkPolicy.findOne({ company_id: companyId, isDefault: true }).lean();
        }
        if (policy) {
          record.workPolicySnapshot = {
            workStart:              policy.workStart,
            workEnd:                policy.workEnd,
            graceMinutes:           policy.graceMinutes,
            lateMarkAfterMinutes:   policy.lateMarkAfterMinutes,
            halfDayThresholdHours:  policy.halfDayThresholdHours,
            absentThresholdHours:   policy.absentThresholdHours,
            overtimeThresholdHours: policy.overtimeThresholdHours,
          };
        }
      }
    }

    // Recalculate status with timezone
    if (record.clockInTime && record.clockOutTime && record.workPolicySnapshot?.workStart) {
      const emp = await Employee.findById(record.employee_id).lean();
      let tz = 'UTC';
      if (emp?.location_id) {
        const loc = await Location.findById(emp.location_id).select('timezone').lean();
        if (loc?.timezone) tz = loc.timezone;
      } else if (emp) {
        const co = await Company.findById(emp.company_id).select('settings.timezone').lean();
        tz = co?.settings?.timezone || 'UTC';
      }

      const calc = calculateAttendanceStatus(
        record.clockInTime, record.clockOutTime,
        record.workPolicySnapshot, record.date, tz,
      );
      record.status        = calc.status;
      record.isLate        = calc.isLate;
      record.lateByMinutes = calc.lateByMinutes;
      record.totalHours    = calc.totalHours;
      record.overtimeHours = calc.overtimeHours;
    }

    await record.save();
  }

  return request.toObject();
};

// ─── Reject ──────────────────────────────────────────────────────────────────

const reject = async (companyId, requestId, reviewerId, reviewNote) => {
  const request = await RegularizationRequest.findOne({ _id: requestId, company_id: companyId });
  if (!request) throw new AppError('Regularization request not found.', 404);
  if (request.status !== 'pending') throw new AppError(`Cannot reject a ${request.status} request.`, 400);

  request.status     = 'rejected';
  request.reviewedBy = reviewerId;
  request.reviewedAt = new Date();
  request.reviewNote = reviewNote || null;
  await request.save();

  return request.toObject();
};

// ─── Cancel (by employee) ────────────────────────────────────────────────────

const cancel = async (companyId, userId, requestId) => {
  const employee = await Employee.findOne({ user_id: userId, company_id: companyId }).lean();
  if (!employee) throw new AppError('No employee profile linked to your account.', 400);

  const request = await RegularizationRequest.findOne({
    _id: requestId,
    company_id: companyId,
    employee_id: employee._id,
  });
  if (!request) throw new AppError('Regularization request not found.', 404);
  if (request.status !== 'pending') throw new AppError('Only pending requests can be cancelled.', 400);

  request.status = 'cancelled';
  await request.save();

  return request.toObject();
};

module.exports = {
  submit,
  getMyRequests,
  listRequests,
  approve,
  reject,
  cancel,
};
