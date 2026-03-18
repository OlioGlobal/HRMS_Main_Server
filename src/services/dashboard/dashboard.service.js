const mongoose              = require('mongoose');
const Employee              = require('../../models/Employee');
const AttendanceRecord      = require('../../models/AttendanceRecord');
const LeaveRequest          = require('../../models/LeaveRequest');
const LeaveBalance          = require('../../models/LeaveBalance');
const LeaveType             = require('../../models/LeaveType');
const RegularizationRequest = require('../../models/RegularizationRequest');
const PublicHoliday         = require('../../models/PublicHoliday');
const PayrollRun            = require('../../models/PayrollRun');
const EmployeeDocument      = require('../../models/EmployeeDocument');
const DocumentType          = require('../../models/DocumentType');
const Department            = require('../../models/Department');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

const startOfDay = (d = new Date()) => {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
};

const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const getDashboardStats = async (companyId, userId, scope) => {
  const today     = startOfDay();
  const in7Days   = addDays(today, 7);
  const in30Days  = addDays(today, 30);
  const past30    = addDays(today, -30);
  const past7     = addDays(today, -6); // last 7 days including today

  // ── Self-scoped (employee) ────────────────────────────────────────────────
  if (scope === 'self') {
    const employee = await Employee.findOne({ company_id: companyId, user_id: userId });
    if (!employee) {
      return {
        myAttendance: null, myLeaveBalances: [], myPendingRequests: { count: 0 },
        myDocuments: { missing: 0, pending: 0, total: 0 },
        upcomingHolidays: [], upcomingBirthdays: [],
        weekAttendance: [],
      };
    }

    const empId = employee._id;

    const [
      todayAttendance, leaveBalances, pendingLeaves, pendingRegs,
      allDocTypes, myDocs, holidays, birthdayEmployees, weekRecords,
    ] = await Promise.all([
      AttendanceRecord.findOne({ company_id: companyId, employee_id: empId, date: today }),
      LeaveBalance.find({ company_id: companyId, employee_id: empId, year: today.getFullYear() })
        .populate('leaveType_id', 'name code'),
      LeaveRequest.countDocuments({ company_id: companyId, employee_id: empId, status: 'pending' }),
      RegularizationRequest.countDocuments({ company_id: companyId, employee_id: empId, status: 'pending' }),
      DocumentType.find({ company_id: companyId, isRequired: true, isActive: true }).select('_id'),
      EmployeeDocument.find({ company_id: companyId, employee_id: empId }).select('document_type_id status'),
      PublicHoliday.find({ company_id: companyId, date: { $gte: today, $lte: in30Days }, isOptional: false })
        .sort({ date: 1 }).limit(5).select('name date'),
      _getUpcomingBirthdays(companyId, today, in7Days, 5),
      // Last 7 days attendance for mini chart
      AttendanceRecord.find({ company_id: companyId, employee_id: empId, date: { $gte: past7, $lte: today } })
        .sort({ date: 1 }).select('date totalHours status').lean(),
    ]);

    const myLeaveBalances = leaveBalances.map((b) => ({
      leaveTypeName: b.leaveType_id?.name || 'Unknown',
      code: b.leaveType_id?.code || '??',
      allocated: b.allocated + b.carryForward,
      used: b.used,
      remaining: b.allocated + b.carryForward + (b.adjustment || 0) - b.used - b.pending,
    }));

    const requiredTypeIds = new Set(allDocTypes.map((d) => d._id.toString()));
    const uploadedTypeIds = new Set(myDocs.map((d) => d.document_type_id.toString()));
    const pendingDocs = myDocs.filter((d) => d.status === 'pending').length;
    const missingDocs = [...requiredTypeIds].filter((id) => !uploadedTypeIds.has(id)).length;

    // Build week attendance for mini chart
    const weekAttendance = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i);
      const rec = weekRecords.find(r => new Date(r.date).toDateString() === d.toDateString());
      weekAttendance.push({
        date: d.toISOString(),
        hours: rec?.totalHours || 0,
        status: rec?.status || 'none',
      });
    }

    return {
      myAttendance: todayAttendance ? {
        clockInTime: todayAttendance.clockInTime, clockOutTime: todayAttendance.clockOutTime,
        totalHours: todayAttendance.totalHours, status: todayAttendance.status,
        isLate: todayAttendance.isLate, lateByMinutes: todayAttendance.lateByMinutes,
      } : null,
      myLeaveBalances,
      myPendingRequests: { count: pendingLeaves + pendingRegs },
      myDocuments: { missing: missingDocs, pending: pendingDocs, total: myDocs.length },
      upcomingHolidays: holidays.map((h) => ({ name: h.name, date: h.date })),
      upcomingBirthdays: birthdayEmployees,
      weekAttendance,
    };
  }

  // ── Team-scoped (Manager) — see own data + reportees only ────────────────
  if (scope === 'team') {
    const manager = await Employee.findOne({ company_id: companyId, user_id: userId });
    const managerId = manager?._id;

    // Get self data first (same as self scope)
    const selfData = await getDashboardStats(companyId, userId, 'self');

    // Get reportees
    const reportees = managerId
      ? await Employee.find({ company_id: companyId, reportingManager: managerId, status: { $in: ['active', 'notice'] } })
          .select('_id firstName lastName employeeId status').lean()
      : [];
    const reporteeIds = reportees.map(r => r._id);

    const [pendingLeaves, pendingRegs, teamTodayRecords, holidays] = await Promise.all([
      LeaveRequest.countDocuments({ company_id: companyId, employee_id: { $in: reporteeIds }, status: 'pending' }),
      RegularizationRequest.countDocuments({ company_id: companyId, employee_id: { $in: reporteeIds }, status: 'pending' }),
      AttendanceRecord.find({ company_id: companyId, employee_id: { $in: reporteeIds }, date: today }).select('status isLate employee_id').lean(),
      PublicHoliday.find({ company_id: companyId, date: { $gte: today, $lte: in30Days }, isOptional: false })
        .sort({ date: 1 }).limit(5).select('name date'),
    ]);

    const teamPresent = teamTodayRecords.filter(r => ['present', 'late', 'half_day'].includes(r.status)).length;
    const teamLate = teamTodayRecords.filter(r => r.isLate).length;
    const teamAbsent = teamTodayRecords.filter(r => r.status === 'absent').length;
    const teamOnLeave = teamTodayRecords.filter(r => r.status === 'on_leave').length;
    const teamNotClocked = Math.max(0, reportees.length - teamTodayRecords.length);

    return {
      ...selfData,
      pendingApprovals: { leaves: pendingLeaves, regularizations: pendingRegs, total: pendingLeaves + pendingRegs },
      teamSize: reportees.length,
      todayAttendance: {
        present: teamPresent, absent: teamAbsent, late: teamLate,
        onLeave: teamOnLeave, notClockedIn: teamNotClocked, total: reportees.length,
      },
      upcomingHolidays: holidays.map(h => ({ name: h.name, date: h.date })),
    };
  }

  // ── Global / Department scoped (HR / Admin) ─────────────────────────────

  const [
    employees, todayRecords, pendingLeaves, pendingRegs, onboardingCount,
    recentHires, birthdayEmployees, expiringDocsCount, holidays, latestPayroll,
    onLeaveToday, deptCounts, weekRecordsAll,
  ] = await Promise.all([
    Employee.find({ company_id: companyId }).select('status'),
    AttendanceRecord.find({ company_id: companyId, date: today }).select('status isLate'),
    LeaveRequest.countDocuments({ company_id: companyId, status: 'pending' }),
    RegularizationRequest.countDocuments({ company_id: companyId, status: 'pending' }),
    Employee.countDocuments({ company_id: companyId, status: 'active', onboardingCompleted: { $ne: true } }),
    Employee.find({ company_id: companyId, joiningDate: { $gte: past30 } })
      .sort({ joiningDate: -1 }).limit(5)
      .populate('department_id', 'name').populate('designation_id', 'name')
      .select('firstName lastName employeeId joiningDate department_id designation_id'),
    _getUpcomingBirthdays(companyId, today, in7Days, 5),
    EmployeeDocument.countDocuments({
      company_id: companyId, expiryDate: { $gte: today, $lte: in30Days }, status: { $ne: 'expired' },
    }),
    PublicHoliday.find({ company_id: companyId, date: { $gte: today, $lte: in30Days }, isOptional: false })
      .sort({ date: 1 }).limit(5).select('name date'),
    PayrollRun.findOne({ company_id: companyId }).sort({ year: -1, month: -1 })
      .select('month year status totalNetPay totalEmployees totalGross totalDeductions'),
    // On leave today - get names
    LeaveRequest.find({
      company_id: companyId, status: 'approved',
      startDate: { $lte: today }, endDate: { $gte: today },
    }).populate('employee_id', 'firstName lastName employeeId').select('employee_id leaveType_id startDate endDate isHalfDay').limit(10),
    // Department breakdown
    Employee.aggregate([
      { $match: { company_id: toObjectId(companyId), status: { $in: ['active', 'notice'] } } },
      { $group: { _id: '$department_id', count: { $sum: 1 } } },
    ]),
    // Weekly attendance trend (last 7 days)
    AttendanceRecord.aggregate([
      { $match: { company_id: toObjectId(companyId), date: { $gte: past7, $lte: today } } },
      { $group: { _id: '$date', present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late', 'half_day']] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        late: { $sum: { $cond: ['$isLate', 1, 0] } },
      }},
      { $sort: { _id: 1 } },
    ]),
  ]);

  // Headcount
  const headcount = { active: 0, notice: 0, terminated: 0, total: employees.length };
  for (const emp of employees) {
    if (emp.status === 'active') headcount.active++;
    else if (emp.status === 'notice') headcount.notice++;
    else if (emp.status === 'terminated') headcount.terminated++;
  }

  // Today attendance
  const activeCount = headcount.active + headcount.notice;
  const present = todayRecords.filter((r) => ['present', 'late', 'half_day'].includes(r.status)).length;
  const late = todayRecords.filter((r) => r.isLate).length;
  const onLeave = todayRecords.filter((r) => r.status === 'on_leave').length;
  const absent = todayRecords.filter((r) => r.status === 'absent').length;
  const notClockedIn = Math.max(0, activeCount - todayRecords.length);

  // Department breakdown - resolve names
  const deptIds = deptCounts.map(d => d._id).filter(Boolean);
  const depts = await Department.find({ _id: { $in: deptIds } }).select('name').lean();
  const deptMap = Object.fromEntries(depts.map(d => [d._id.toString(), d.name]));
  const departmentBreakdown = deptCounts.map(d => ({
    name: d._id ? (deptMap[d._id.toString()] || 'Unknown') : 'Unassigned',
    count: d.count,
  })).sort((a, b) => b.count - a.count);

  // On leave today formatted
  const onLeaveList = onLeaveToday.map(l => ({
    _id: l.employee_id?._id,
    firstName: l.employee_id?.firstName,
    lastName: l.employee_id?.lastName,
    employeeId: l.employee_id?.employeeId,
    isHalfDay: l.isHalfDay || false,
  })).filter(l => l._id);

  // Weekly trend
  const weeklyTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const dStr = d.toISOString().split('T')[0];
    const rec = weekRecordsAll.find(r => new Date(r._id).toISOString().split('T')[0] === dStr);
    weeklyTrend.push({
      date: d.toISOString(),
      present: rec?.present || 0,
      absent: rec?.absent || 0,
      late: rec?.late || 0,
    });
  }

  return {
    headcount,
    todayAttendance: { present, absent, late, onLeave, notClockedIn, total: activeCount },
    pendingApprovals: { leaves: pendingLeaves, regularizations: pendingRegs, total: pendingLeaves + pendingRegs },
    onboarding: { count: onboardingCount },
    recentHires: recentHires.map((e) => ({
      _id: e._id, firstName: e.firstName, lastName: e.lastName,
      employeeId: e.employeeId, joiningDate: e.joiningDate,
      department: e.department_id?.name || null,
      designation: e.designation_id?.name || null,
    })),
    upcomingBirthdays: birthdayEmployees,
    expiringDocuments: { count: expiringDocsCount },
    upcomingHolidays: holidays.map((h) => ({ name: h.name, date: h.date })),
    latestPayroll: latestPayroll ? {
      month: latestPayroll.month, year: latestPayroll.year, status: latestPayroll.status,
      totalNetPay: latestPayroll.totalNetPay, totalEmployees: latestPayroll.totalEmployees,
      totalGross: latestPayroll.totalGross, totalDeductions: latestPayroll.totalDeductions,
    } : null,
    onLeaveToday: onLeaveList,
    departmentBreakdown,
    weeklyTrend,
  };
};

// ─── Birthday helper ──────────────────────────────────────────────────────────

async function _getUpcomingBirthdays(companyId, from, to, limit) {
  const fromMonth = from.getMonth() + 1;
  const fromDay = from.getDate();
  const toMonth = to.getMonth() + 1;
  const toDay = to.getDate();

  let dateMatch;
  if (fromMonth === toMonth) {
    dateMatch = { $and: [
      { $eq: [{ $month: '$dateOfBirth' }, fromMonth] },
      { $gte: [{ $dayOfMonth: '$dateOfBirth' }, fromDay] },
      { $lte: [{ $dayOfMonth: '$dateOfBirth' }, toDay] },
    ]};
  } else {
    dateMatch = { $or: [
      { $and: [{ $eq: [{ $month: '$dateOfBirth' }, fromMonth] }, { $gte: [{ $dayOfMonth: '$dateOfBirth' }, fromDay] }] },
      { $and: [{ $eq: [{ $month: '$dateOfBirth' }, toMonth] }, { $lte: [{ $dayOfMonth: '$dateOfBirth' }, toDay] }] },
    ]};
  }

  return Employee.aggregate([
    { $match: { company_id: toObjectId(companyId), status: { $in: ['active', 'notice'] }, dateOfBirth: { $ne: null } } },
    { $addFields: { _birthMonth: { $month: '$dateOfBirth' }, _birthDay: { $dayOfMonth: '$dateOfBirth' } } },
    { $match: { $expr: dateMatch } },
    { $sort: { _birthMonth: 1, _birthDay: 1 } },
    { $limit: limit },
    { $project: { _id: 1, firstName: 1, lastName: 1, employeeId: 1, dateOfBirth: 1 } },
  ]);
}

module.exports = { getDashboardStats };
