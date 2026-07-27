const mongoose           = require('mongoose');
const AttendanceRecord   = require('../../models/AttendanceRecord');
const Employee           = require('../../models/Employee');
const WorkPolicy         = require('../../models/WorkPolicy');
const Location           = require('../../models/Location');
const Company            = require('../../models/Company');
const AppError           = require('../../utils/AppError');
const { detectClockType, haversineDistance } = require('../../utils/geofence');
const { calculateAttendanceStatus } = require('../../utils/calculateAttendanceStatus');

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getWorkPolicy = async (employee) => {
  if (employee.workPolicy_id) {
    const policy = await WorkPolicy.findById(employee.workPolicy_id).lean();
    if (policy) return policy;
  }
  const def = await WorkPolicy.findOne({ company_id: employee.company_id, isDefault: true }).lean();
  if (!def) throw new AppError('No work policy assigned. Please contact HR.', 400);
  return def;
};

const snapshotPolicy = (policy) => ({
  workStart:              policy.workStart,
  workEnd:                policy.workEnd,
  graceMinutes:           policy.graceMinutes,
  lateMarkAfterMinutes:   policy.lateMarkAfterMinutes,
  halfDayThresholdHours:  policy.halfDayThresholdHours,
  absentThresholdHours:   policy.absentThresholdHours,
  overtimeThresholdHours: policy.overtimeThresholdHours,
});

/**
 * Get today's date as UTC midnight.
 */
const todayDateUTC = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

/**
 * Start of "today" in a given IANA timezone, returned as a UTC Date
 * (midnight-UTC representing that local calendar day). Attendance dates are
 * stored this way so each local day maps to exactly one record — regardless of
 * clock time. Fixes early-morning (e.g. 12:02 AM IST) clock-ins landing on the
 * previous UTC day.
 */
const dayStartInTZ = (tz = 'UTC') => {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** Normalize an employee's joining date to UTC midnight (matches how `date` is stored). */
const joinDayStartUTC = (joiningDate) => {
  if (!joiningDate) return null;
  const j = new Date(joiningDate);
  if (isNaN(j.getTime())) return null;
  return new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate()));
};

/**
 * Bucket attendance records into summary counts. Buckets are mutually exclusive.
 * A late arrival counts as `late` (via the isLate flag) even when its stored
 * status is still 'present' — e.g. clocked in late but not yet clocked out.
 */
const buildSummary = (records) => {
  const summary = {
    present: 0, late: 0, half_day: 0, absent: 0,
    on_leave: 0, holiday: 0, totalHours: 0, overtimeHours: 0,
  };
  for (const r of records) {
    summary.totalHours    += r.totalHours || 0;
    summary.overtimeHours += r.overtimeHours || 0;
    if (r.status === 'holiday')        summary.holiday++;
    else if (r.status === 'on_leave')  summary.on_leave++;
    else if (r.status === 'absent')    summary.absent++;
    else if (r.status === 'half_day')  summary.half_day++;
    else if (r.status === 'late' || r.isLate) summary.late++;
    else summary.present++;
  }
  return summary;
};

/** Day-of-week (SUN..SAT) in a given timezone. */
const weekdayInTZ = (tz = 'UTC') =>
  new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
    .format(new Date()).toUpperCase().slice(0, 3);

/**
 * Resolve the employee's timezone from their location (fallback: company timezone).
 */
const resolveTimezone = async (employee) => {
  if (employee.location_id) {
    const loc = await Location.findById(employee.location_id).select('timezone').lean();
    if (loc?.timezone) return loc.timezone;
  }
  const company = await Company.findById(employee.company_id).select('settings.timezone').lean();
  return company?.settings?.timezone || 'UTC';
};

// ─── Clock In ────────────────────────────────────────────────────────────────

const clockIn = async (companyId, userId, body) => {
  const employee = await Employee.findOne({ user_id: userId, company_id: companyId }).lean();
  if (!employee) throw new AppError('No employee profile linked to your account.', 400);
  if (employee.status !== 'active') throw new AppError('Your employee profile is not active.', 400);

  const tz    = await resolveTimezone(employee);
  const today = dayStartInTZ(tz);

  // Check if already clocked in today
  const existing = await AttendanceRecord.findOne({
    company_id: companyId,
    employee_id: employee._id,
    date: today,
  });
  if (existing?.clockInTime) {
    throw new AppError('You have already clocked in today.', 400);
  }

  const policy = await getWorkPolicy(employee);

  // Check if today is a working day (in the employee's timezone)
  const dayName = weekdayInTZ(tz);
  if (!policy.workingDays.includes(dayName)) {
    throw new AppError('Today is not a working day as per your work policy.', 400);
  }

  // Detect location type
  let clockInType = body.clockInType || 'remote';
  let locationName = null;

  if (body.lat != null && body.lng != null) {
    const company = await Company.findById(companyId).lean();
    if (company.settings?.geofencing?.enabled) {
      const defaultRadius = company.settings.geofencing.defaultRadius || 100;
      const locations = await Location.find({ company_id: companyId }).lean();
      const detected = detectClockType(body.lat, body.lng, locations, defaultRadius);
      clockInType  = detected.type;
      locationName = detected.locationName;

      // Check employee home address for WFH
      if (clockInType === 'remote' && employee.addresses?.length) {
        const home = employee.addresses.find((a) => a.isPrimary)
          || employee.addresses.find((a) => a.label === 'home')
          || employee.addresses[0];
        if (home?.lat && home?.lng) {
          const homeDist = haversineDistance(body.lat, body.lng, home.lat, home.lng);
          if (homeDist <= defaultRadius) {
            clockInType = 'wfh';
            locationName = 'Home';
          }
        }
      }

      // Check WFH authorization before blocking
      if (clockInType === 'remote' || clockInType === 'wfh') {
        const { isWFHAuthorized } = require('../wfh/wfh.service');
        const wfhCheck = await isWFHAuthorized(companyId, employee._id, new Date());

        if (wfhCheck.authorized) {
          clockInType = clockInType === 'remote' ? 'wfh' : clockInType;
          locationName = locationName || 'WFH (Authorized)';
        } else {
          throw new AppError(wfhCheck.reason || 'WFH not authorized for today. Please submit a WFH request or go to your office.', 400);
        }
      }
    }
  }

  const now  = new Date();
  const snap = snapshotPolicy(policy);

  if (existing) {
    // Record was created by cron (absent/holiday/on_leave) — update it
    existing.clockInTime  = now;
    existing.clockInType  = clockInType;
    existing.clockInLat   = body.lat || null;
    existing.clockInLng   = body.lng || null;
    existing.workPolicySnapshot = snap;
    existing.status       = 'present'; // Will be recalculated on clock-out
    existing.missedClockOut = false;

    // Calculate late
    const calc = calculateAttendanceStatus(now, null, snap, today, tz);
    existing.isLate        = calc.isLate;
    existing.lateByMinutes = calc.lateByMinutes;

    await existing.save();
    return { record: existing.toObject(), locationName };
  }

  // Create new record
  const calc = calculateAttendanceStatus(now, null, snap, today, tz);

  const record = await AttendanceRecord.create({
    company_id:  companyId,
    employee_id: employee._id,
    date:        today,
    clockInTime: now,
    clockInType,
    clockInLat:  body.lat || null,
    clockInLng:  body.lng || null,
    isLate:        calc.isLate,
    lateByMinutes: calc.lateByMinutes,
    status:        'present',
    workPolicySnapshot: snap,
  });

  return { record: record.toObject(), locationName };
};

// ─── Clock Out ───────────────────────────────────────────────────────────────

const clockOut = async (companyId, userId, body) => {
  const employee = await Employee.findOne({ user_id: userId, company_id: companyId }).lean();
  if (!employee) throw new AppError('No employee profile linked to your account.', 400);

  const tz    = await resolveTimezone(employee);
  const today = dayStartInTZ(tz);

  const record = await AttendanceRecord.findOne({
    company_id: companyId,
    employee_id: employee._id,
    date: today,
  });

  if (!record) throw new AppError('No clock-in record found for today.', 400);
  if (!record.clockInTime) throw new AppError('You have not clocked in today.', 400);
  if (record.clockOutTime) throw new AppError('You have already clocked out today.', 400);

  const now = new Date();

  // Detect location type for clock-out
  let clockOutType = body.clockOutType || 'remote';
  if (body.lat != null && body.lng != null) {
    const company = await Company.findById(companyId).lean();
    if (company.settings?.geofencing?.enabled) {
      const defaultRadius = company.settings.geofencing.defaultRadius || 100;
      const locations = await Location.find({ company_id: companyId }).lean();
      const detected = detectClockType(body.lat, body.lng, locations, defaultRadius);
      clockOutType = detected.type;

      // Check employee home address for WFH
      if (clockOutType === 'remote' && employee.addresses?.length) {
        const home = employee.addresses.find((a) => a.isPrimary)
          || employee.addresses.find((a) => a.label === 'home')
          || employee.addresses[0];
        if (home?.lat && home?.lng) {
          const homeDist = haversineDistance(body.lat, body.lng, home.lat, home.lng);
          if (homeDist <= defaultRadius) {
            clockOutType = 'wfh';
          }
        }
      }

      // Clock-out: if employee clocked in successfully, always allow clock out
      // Just detect the type for record keeping, don't block
    }
  }

  record.clockOutTime = now;
  record.clockOutType = clockOutType;
  record.clockOutLat  = body.lat || null;
  record.clockOutLng  = body.lng || null;
  record.missedClockOut = false;

  // Recalculate status with full data
  const snap = record.workPolicySnapshot;
  const calc = calculateAttendanceStatus(record.clockInTime, now, snap, today, tz);

  record.status        = calc.status;
  record.isLate        = calc.isLate;
  record.lateByMinutes = calc.lateByMinutes;
  record.totalHours    = calc.totalHours;
  record.overtimeHours = calc.overtimeHours;

  await record.save();
  return record.toObject();
};

// ─── Get today's record ──────────────────────────────────────────────────────

const getToday = async (companyId, userId) => {
  const employee = await Employee.findOne({ user_id: userId, company_id: companyId }).lean();
  if (!employee) throw new AppError('No employee profile linked to your account.', 400);

  const tz    = await resolveTimezone(employee);
  const today = dayStartInTZ(tz);
  const record = await AttendanceRecord.findOne({
    company_id: companyId,
    employee_id: employee._id,
    date: today,
  }).lean();

  return record || null;
};

// ─── My attendance records (month filter) ────────────────────────────────────

const getMyAttendance = async (companyId, userId, { month, year } = {}) => {
  const employee = await Employee.findOne({ user_id: userId, company_id: companyId }).lean();
  if (!employee) throw new AppError('No employee profile linked to your account.', 400);

  const filter = { company_id: companyId, employee_id: employee._id };

  if (month && year) {
    const m = Number(month) - 1;
    const y = Number(year);
    filter.date = {
      $gte: new Date(Date.UTC(y, m, 1)),
      $lt:  new Date(Date.UTC(y, m + 1, 1)),
    };
  } else if (year) {
    const y = Number(year);
    filter.date = {
      $gte: new Date(Date.UTC(y, 0, 1)),
      $lt:  new Date(Date.UTC(y + 1, 0, 1)),
    };
  }

  // Never surface attendance before the employee joined (guards against pre-join 'absent' rows)
  const joinStart = joinDayStartUTC(employee.joiningDate);
  if (joinStart) {
    filter.date = filter.date || {};
    if (!filter.date.$gte || joinStart > filter.date.$gte) filter.date.$gte = joinStart;
  }

  const records = await AttendanceRecord.find(filter).sort({ date: 1 }).lean();

  return { records, summary: buildSummary(records), employee };
};

// ─── All attendance records (HR view, scope-filtered) ────────────────────────

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

const listAttendance = async (companyId, query = {}, scope = 'global', userId = null) => {
  const { fromDate, toDate, date, department, status, search, page = 1, limit = 50 } = query;
  const { scopeMatch } = await buildScopeFilter(companyId, scope, userId);

  const match = { company_id: toObjectId(companyId) };

  // Date range filter
  if (fromDate && toDate) {
    match.date = {
      $gte: new Date(fromDate + 'T00:00:00Z'),
      $lte: new Date(toDate + 'T00:00:00Z'),
    };
  } else if (date) {
    match.date = new Date(date + 'T00:00:00Z');
  }

  if (status) match.status = status;

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
    // Only active employees
    { $match: { 'employee.status': 'active' } },
    ...(scopeMatch ? [{ $match: scopeMatch }] : []),
    ...(department ? [{ $match: { 'employee.department_id': toObjectId(department) } }] : []),
    // Search by employee name or employeeId
    ...(search ? [{
      $match: {
        $or: [
          { 'employee.firstName': { $regex: search, $options: 'i' } },
          { 'employee.lastName':  { $regex: search, $options: 'i' } },
          { 'employee.employeeId': { $regex: search, $options: 'i' } },
        ],
      },
    }] : []),
    { $sort: { date: -1, 'employee.firstName': 1 } },
    {
      $facet: {
        data: [
          { $skip: (Number(page) - 1) * Number(limit) },
          { $limit: Number(limit) },
          {
            $project: {
              _id: 1, date: 1, clockInTime: 1, clockOutTime: 1,
              clockInType: 1, clockOutType: 1, totalHours: 1, overtimeHours: 1,
              status: 1, isLate: 1, lateByMinutes: 1, isManualOverride: 1,
              missedClockOut: 1,
              'employee._id': 1, 'employee.firstName': 1, 'employee.lastName': 1,
              'employee.employeeId': 1, 'employee.department_id': 1,
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ];

  const results = await AttendanceRecord.aggregate(pipeline);
  const result  = results[0] || { data: [], total: [] };
  const records = result.data;
  const total   = result.total[0]?.count || 0;

  return {
    records,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit)),
  };
};

// ─── Monthly summary for an employee ─────────────────────────────────────────

const getMonthlySummary = async (companyId, employeeId, { month, year }) => {
  const m = Number(month) - 1;
  const y = Number(year);

  const dateFilter = { $gte: new Date(Date.UTC(y, m, 1)), $lt: new Date(Date.UTC(y, m + 1, 1)) };

  // Clamp to the employee's joining date so pre-join 'absent' rows don't show
  const emp = await Employee.findOne({ _id: employeeId, company_id: companyId }).select('joiningDate').lean();
  const joinStart = joinDayStartUTC(emp?.joiningDate);
  if (joinStart && joinStart > dateFilter.$gte) dateFilter.$gte = joinStart;

  const records = await AttendanceRecord.find({
    company_id: companyId,
    employee_id: employeeId,
    date: dateFilter,
  })
    .sort({ date: 1 })
    .lean();

  return { records, summary: buildSummary(records) };
};

// ─── HR Override ─────────────────────────────────────────────────────────────

const overrideAttendance = async (companyId, recordId, userId, body) => {
  const record = await AttendanceRecord.findOne({ _id: recordId, company_id: companyId });
  if (!record) throw new AppError('Attendance record not found.', 404);

  if (!body.reason) throw new AppError('Override reason is required.', 400);

  // Update fields if provided
  if (body.clockInTime)  record.clockInTime  = new Date(body.clockInTime);
  if (body.clockOutTime) record.clockOutTime = new Date(body.clockOutTime);
  if (body.clockInType)  record.clockInType  = body.clockInType;
  if (body.clockOutType) record.clockOutType = body.clockOutType;

  record.isManualOverride = true;
  record.overrideReason   = body.reason;
  record.overrideBy       = userId;
  record.missedClockOut   = false;

  // Recalculate total hours if both clock times present
  if (record.clockInTime && record.clockOutTime) {
    const totalMs = record.clockOutTime.getTime() - record.clockInTime.getTime();
    record.totalHours = Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100;
  }

  // If manual status provided, use it directly
  if (body.status) {
    record.status = body.status;
  } else if (record.clockInTime && record.clockOutTime) {
    // Recalculate status from policy
    const snap = record.workPolicySnapshot;
    if (snap?.workStart) {
      // Resolve timezone for this employee
      const emp = await Employee.findById(record.employee_id).lean();
      const tz  = emp ? await resolveTimezone(emp) : 'UTC';
      const calc = calculateAttendanceStatus(record.clockInTime, record.clockOutTime, snap, record.date, tz);
      record.status        = calc.status;
      record.isLate        = calc.isLate;
      record.lateByMinutes = calc.lateByMinutes;
      record.overtimeHours = calc.overtimeHours;
    }
  }

  await record.save();
  return record.toObject();
};

// ─── Detect location (for frontend preview before clock-in) ──────────────────

const detectLocation = async (companyId, userId, lat, lng) => {
  const company = await Company.findById(companyId).lean();
  const defaultRadius = company.settings?.geofencing?.defaultRadius || 100;

  if (!company.settings?.geofencing?.enabled) {
    return { type: 'remote', locationName: null, geofencingEnabled: false, zones: [] };
  }

  // Get employee + their work policy's office location
  const employee = await Employee.findOne({ user_id: userId, company_id: companyId })
    .select('addresses workPolicy_id')
    .populate({ path: 'workPolicy_id', select: 'location_id' })
    .lean();

  const zones = [];
  let officeLoc = null;

  // Determine which office to show
  if (employee?.workPolicy_id?.location_id) {
    // Employee has work policy → use that policy's office location
    officeLoc = await Location.findById(employee.workPolicy_id.location_id).lean();
  }
  if (!officeLoc) {
    // Fallback: use HQ location
    officeLoc = await Location.findOne({ company_id: companyId, isHQ: true }).lean();
  }

  // Add office zone
  if (officeLoc?.geofence?.lat && officeLoc?.geofence?.lng) {
    zones.push({
      lat: officeLoc.geofence.lat,
      lng: officeLoc.geofence.lng,
      radius: officeLoc.geofence.radius || defaultRadius,
      name: officeLoc.name,
      type: 'office',
    });
  }

  // Add employee home zone
  if (employee?.addresses?.length) {
    const home = employee.addresses.find((a) => a.isPrimary)
      || employee.addresses.find((a) => a.label === 'home')
      || employee.addresses[0];
    if (home?.lat && home?.lng) {
      zones.push({
        lat: home.lat,
        lng: home.lng,
        radius: defaultRadius,
        name: 'Home',
        type: 'home',
      });
    }
  }

  // Detect type: check office first, then home, then remote
  let type = 'remote';
  let locationName = null;

  if (officeLoc?.geofence?.lat && officeLoc?.geofence?.lng) {
    const offDist = haversineDistance(lat, lng, officeLoc.geofence.lat, officeLoc.geofence.lng);
    if (offDist <= (officeLoc.geofence.radius || defaultRadius)) {
      type = 'office';
      locationName = officeLoc.name;
    }
  }

  if (type === 'remote' && employee?.addresses?.length) {
    const home = employee.addresses.find((a) => a.isPrimary)
      || employee.addresses.find((a) => a.label === 'home')
      || employee.addresses[0];
    if (home?.lat && home?.lng) {
      const homeDist = haversineDistance(lat, lng, home.lat, home.lng);
      if (homeDist <= defaultRadius) {
        type = 'wfh';
        locationName = 'Home';
      }
    }
  }

  return { type, locationName, geofencingEnabled: true, zones };
};

module.exports = {
  clockIn,
  clockOut,
  getToday,
  getMyAttendance,
  listAttendance,
  getMonthlySummary,
  overrideAttendance,
  detectLocation,
};
