const LeaveType     = require('../models/LeaveType');
const LeaveTemplate = require('../models/LeaveTemplate');

const seedDefaultLeaveTemplates = async (companyId) => {
  const existing = await LeaveTemplate.countDocuments({ company_id: companyId });
  if (existing > 0) return;

  const types = await LeaveType.find({ company_id: companyId, isActive: true }).lean();
  const byCode = Object.fromEntries(types.map((t) => [t.code, t]));

  const templates = [
    {
      name: 'Full Time Template',
      description: 'Standard leave allocation for full-time employees',
      isDefault: true,
      leaveTypes: [
        { leaveType_id: byCode.CL?._id, daysOverride: null },
        { leaveType_id: byCode.SL?._id, daysOverride: null },
        { leaveType_id: byCode.AL?._id, daysOverride: null },
        { leaveType_id: byCode.ML?._id, daysOverride: null },
        { leaveType_id: byCode.PL?._id, daysOverride: null },
      ].filter((lt) => lt.leaveType_id),
    },
    {
      name: 'Intern Template',
      description: 'Reduced leave for interns',
      isDefault: false,
      leaveTypes: [
        { leaveType_id: byCode.CL?._id, daysOverride: 6 },
        { leaveType_id: byCode.SL?._id, daysOverride: 6 },
      ].filter((lt) => lt.leaveType_id),
    },
    {
      name: 'Contract Template',
      description: 'Leave allocation for contractors',
      isDefault: false,
      leaveTypes: [
        { leaveType_id: byCode.CL?._id, daysOverride: 6 },
        { leaveType_id: byCode.SL?._id, daysOverride: 6 },
        { leaveType_id: byCode.AL?._id, daysOverride: 10 },
      ].filter((lt) => lt.leaveType_id),
    },
  ];

  await LeaveTemplate.insertMany(
    templates.map((t) => ({ ...t, company_id: companyId }))
  );
};

module.exports = { seedDefaultLeaveTemplates };
