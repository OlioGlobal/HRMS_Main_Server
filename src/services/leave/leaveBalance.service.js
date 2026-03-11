const mongoose     = require('mongoose');
const LeaveBalance = require('../../models/LeaveBalance');
const AppError     = require('../../utils/AppError');

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

// ─── List balances for one employee ─────────────────────────────────────────
const getEmployeeBalances = async (companyId, employeeId, year) => {
  const filter = { company_id: companyId, employee_id: employeeId };
  if (year) filter.year = Number(year);

  return LeaveBalance.find(filter)
    .populate('leaveType_id', 'name code type daysPerYear allowHalfDay minDaysNotice maxDaysAtOnce requiresDocument countWeekends countHolidays')
    .lean({ virtuals: true });
};

// ─── List all balances (HR view) ────────────────────────────────────────────
const listAllBalances = async (companyId, { year, leaveType, department, page = 1, limit = 50 } = {}) => {
  const match = { company_id: toObjectId(companyId) };
  if (year) match.year = Number(year);
  if (leaveType) match.leaveType_id = toObjectId(leaveType);

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
    { $match: { 'employee.isActive': true, ...(department ? { 'employee.department_id': toObjectId(department) } : {}) } },
    {
      $lookup: {
        from: 'leavetypes',
        localField: 'leaveType_id',
        foreignField: '_id',
        as: 'leaveType',
      },
    },
    { $unwind: '$leaveType' },
    {
      $addFields: {
        remaining: {
          $subtract: [
            { $add: ['$allocated', '$carryForward', '$adjustment'] },
            { $add: ['$used', '$pending'] },
          ],
        },
      },
    },
    { $sort: { 'employee.firstName': 1, 'leaveType.name': 1 } },
    { $skip: (Number(page) - 1) * Number(limit) },
    { $limit: Number(limit) },
    {
      $project: {
        _id: 1,
        employee_id: 1,
        'employee.firstName': 1,
        'employee.lastName': 1,
        'employee.employeeId': 1,
        'employee.department_id': 1,
        leaveType_id: 1,
        'leaveType.name': 1,
        'leaveType.code': 1,
        year: 1,
        allocated: 1,
        carryForward: 1,
        used: 1,
        pending: 1,
        adjustment: 1,
        adjustmentNote: 1,
        remaining: 1,
      },
    },
  ];

  return LeaveBalance.aggregate(pipeline);
};

// ─── Manual adjustment ──────────────────────────────────────────────────────
const adjustBalance = async (companyId, balanceId, { adjustment, adjustmentNote }) => {
  const doc = await LeaveBalance.findOne({ _id: balanceId, company_id: companyId });
  if (!doc) throw new AppError('Leave balance not found.', 404);

  doc.adjustment     = (doc.adjustment || 0) + adjustment;
  doc.adjustmentNote = adjustmentNote || doc.adjustmentNote;
  await doc.save();

  return doc.toObject({ virtuals: true });
};

module.exports = {
  getEmployeeBalances,
  listAllBalances,
  adjustBalance,
};
