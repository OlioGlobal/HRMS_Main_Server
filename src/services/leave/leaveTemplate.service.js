const LeaveTemplate = require("../../models/LeaveTemplate");
const LeaveType = require("../../models/LeaveType");
const LeaveBalance = require("../../models/LeaveBalance");
const Employee = require("../../models/Employee");
const Company = require("../../models/Company");
const AppError = require("../../utils/AppError");
const { calculateProRatedDays } = require("../../utils/calculateLeaveDays");
const { getLeaveYear } = require("../../utils/getLeaveYear");

// ─── List ─────────────────────────────────────────────────────────────────────
const listTemplates = async (companyId) => {
  return LeaveTemplate.find({ company_id: companyId, isActive: true })
    .populate("leaveTypes.leaveType_id", "name code daysPerYear type")
    .sort({ isDefault: -1, name: 1 })
    .lean();
};

// ─── Get one ──────────────────────────────────────────────────────────────────
const getTemplate = async (companyId, id) => {
  const doc = await LeaveTemplate.findOne({ _id: id, company_id: companyId })
    .populate("leaveTypes.leaveType_id", "name code daysPerYear type")
    .lean();
  if (!doc) throw new AppError("Leave template not found.", 404);
  return doc;
};

// ─── Create ───────────────────────────────────────────────────────────────────
const createTemplate = async (companyId, body) => {
  // If marking as default, unset any existing default
  if (body.isDefault) {
    await LeaveTemplate.updateMany(
      { company_id: companyId, isDefault: true },
      { isDefault: false },
    );
  }
  const doc = await LeaveTemplate.create({ ...body, company_id: companyId });
  return doc.toObject();
};

// ─── Update ───────────────────────────────────────────────────────────────────
const updateTemplate = async (companyId, id, body) => {
  const doc = await LeaveTemplate.findOne({ _id: id, company_id: companyId });
  if (!doc) throw new AppError("Leave template not found.", 404);

  if (body.isDefault) {
    await LeaveTemplate.updateMany(
      { company_id: companyId, isDefault: true, _id: { $ne: id } },
      { isDefault: false },
    );
  }

  Object.assign(doc, body);
  await doc.save();
  return doc.toObject();
};

// ─── Delete ───────────────────────────────────────────────────────────────────
const deleteTemplate = async (companyId, id) => {
  const doc = await LeaveTemplate.findOne({ _id: id, company_id: companyId });
  if (!doc) throw new AppError("Leave template not found.", 404);

  const assigned = await Employee.countDocuments({
    leaveTemplate_id: id,
    isActive: true,
  });
  if (assigned > 0) {
    throw new AppError(
      `Cannot delete — ${assigned} employee(s) are assigned this template.`,
      400,
    );
  }

  await LeaveTemplate.deleteOne({ _id: id });
};

// ─── Assign template to employee(s) → create leave balances ─────────────────
const assignTemplate = async (companyId, templateId, employeeIds) => {
  const template = await LeaveTemplate.findOne({
    _id: templateId,
    company_id: companyId,
  })
    .populate("leaveTypes.leaveType_id")
    .lean();
  if (!template) throw new AppError("Leave template not found.", 404);

  const company = await Company.findById(companyId).lean();
  const fiscalStart = company.settings?.fiscalYearStart ?? 1;
  const proRate = company.settings?.leave?.proRateNewJoiners ?? true;
  const proMethod = company.settings?.leave?.proRateMethod ?? "monthly";

  const now = new Date();

  // Current fiscal year start boundary (for pro-rate check)
  const fiscalYearBegin = new Date(
    getLeaveYear(now, "fiscal_year", fiscalStart),
    fiscalStart - 1,
    1,
  );

  const employees = await Employee.find({
    _id: { $in: employeeIds },
    company_id: companyId,
    isActive: true,
  }).lean();

  const balanceOps = [];

  for (const emp of employees) {
    // Update employee's leaveTemplate_id
    await Employee.updateOne(
      { _id: emp._id },
      { leaveTemplate_id: templateId },
    );

    for (const tlt of template.leaveTypes) {
      const lt = tlt.leaveType_id;
      if (!lt || !lt.isActive) continue;

      let allocated = tlt.daysOverride ?? lt.daysPerYear;

      // Only pro-rate if the employee joined DURING the current fiscal year
      if (proRate && lt.proRateForNewJoiners && emp.joiningDate) {
        const joinDate = new Date(emp.joiningDate);
        if (joinDate >= fiscalYearBegin) {
          allocated = calculateProRatedDays(
            emp.joiningDate,
            allocated,
            fiscalStart,
            proMethod,
          );
        }
      }

      const balanceYear = getLeaveYear(now, lt.resetCycle, fiscalStart);

      balanceOps.push({
        updateOne: {
          filter: {
            company_id: companyId,
            employee_id: emp._id,
            leaveType_id: lt._id,
            year: balanceYear,
          },
          update: {
            $setOnInsert: {
              company_id: companyId,
              employee_id: emp._id,
              leaveType_id: lt._id,
              year: balanceYear,
              allocated,
              carryForward: 0,
              used: 0,
              pending: 0,
              adjustment: 0,
            },
          },
          upsert: true,
        },
      });
    }
  }

  if (balanceOps.length) {
    await LeaveBalance.bulkWrite(balanceOps);
  }

  return { assigned: employees.length, balancesCreated: balanceOps.length };
};

module.exports = {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  assignTemplate,
};
