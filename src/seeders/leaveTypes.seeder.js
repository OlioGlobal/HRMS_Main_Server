const LeaveType = require('../models/LeaveType');

const seedDefaultLeaveTypes = async (companyId) => {
  const existing = await LeaveType.countDocuments({ company_id: companyId });
  if (existing > 0) return;

  const types = [
    {
      name: 'Casual Leave', code: 'CL', type: 'paid', daysPerYear: 12,
      resetCycle: 'fiscal_year', carryForward: false, maxCarryForwardDays: 0,
      proRateForNewJoiners: false, applicableGender: 'all',
      requiresDocument: false, minDaysNotice: 1, maxDaysAtOnce: 5,
      allowHalfDay: true,
    },
    {
      name: 'Sick Leave', code: 'SL', type: 'paid', daysPerYear: 12,
      resetCycle: 'fiscal_year', carryForward: false, maxCarryForwardDays: 0,
      proRateForNewJoiners: false, applicableGender: 'all',
      requiresDocument: true, minDaysNotice: 0, maxDaysAtOnce: 7,
      allowHalfDay: true,
    },
    {
      name: 'Annual Leave', code: 'AL', type: 'paid', daysPerYear: 18,
      resetCycle: 'fiscal_year', carryForward: true, maxCarryForwardDays: 10,
      proRateForNewJoiners: true, applicableGender: 'all',
      requiresDocument: false, minDaysNotice: 3, maxDaysAtOnce: 15,
      allowHalfDay: false,
    },
    {
      name: 'Maternity Leave', code: 'ML', type: 'paid', daysPerYear: 180,
      resetCycle: 'none', carryForward: false, maxCarryForwardDays: 0,
      proRateForNewJoiners: false, applicableGender: 'female',
      requiresDocument: true, minDaysNotice: 15, maxDaysAtOnce: 180,
      allowHalfDay: false, countWeekends: true, countHolidays: true,
    },
    {
      name: 'Paternity Leave', code: 'PL', type: 'paid', daysPerYear: 15,
      resetCycle: 'none', carryForward: false, maxCarryForwardDays: 0,
      proRateForNewJoiners: false, applicableGender: 'male',
      requiresDocument: true, minDaysNotice: 7, maxDaysAtOnce: 15,
      allowHalfDay: false,
    },
    {
      name: 'Comp Off', code: 'CO', type: 'comp_off', daysPerYear: 0,
      resetCycle: 'none', carryForward: false, maxCarryForwardDays: 0,
      proRateForNewJoiners: false, applicableGender: 'all',
      requiresDocument: false, minDaysNotice: 1, maxDaysAtOnce: 3,
      allowHalfDay: true,
    },
  ];

  await LeaveType.insertMany(
    types.map((t) => ({ ...t, company_id: companyId }))
  );
};

module.exports = { seedDefaultLeaveTypes };
