const LeaveType   = require('../../models/LeaveType');
const LeaveBalance = require('../../models/LeaveBalance');
const AppError    = require('../../utils/AppError');

// ─── List ─────────────────────────────────────────────────────────────────────
const listLeaveTypes = async (companyId) => {
  return LeaveType.find({ company_id: companyId, isActive: true })
    .sort({ name: 1 })
    .lean();
};

// ─── Get one ──────────────────────────────────────────────────────────────────
const getLeaveType = async (companyId, id) => {
  const doc = await LeaveType.findOne({ _id: id, company_id: companyId }).lean();
  if (!doc) throw new AppError('Leave type not found.', 404);
  return doc;
};

// ─── Create ───────────────────────────────────────────────────────────────────
const createLeaveType = async (companyId, body) => {
  const doc = await LeaveType.create({ ...body, company_id: companyId });
  return doc.toObject();
};

// ─── Update ───────────────────────────────────────────────────────────────────
const updateLeaveType = async (companyId, id, body) => {
  const doc = await LeaveType.findOne({ _id: id, company_id: companyId });
  if (!doc) throw new AppError('Leave type not found.', 404);

  Object.assign(doc, body);
  await doc.save();
  return doc.toObject();
};

// ─── Delete (soft — mark inactive) ───────────────────────────────────────────
const deleteLeaveType = async (companyId, id) => {
  const doc = await LeaveType.findOne({ _id: id, company_id: companyId });
  if (!doc) throw new AppError('Leave type not found.', 404);

  // Block if any active balances exist for this type
  const balCount = await LeaveBalance.countDocuments({ leaveType_id: id });
  if (balCount > 0) {
    doc.isActive = false;
    await doc.save();
    return; // soft-delete
  }

  await LeaveType.deleteOne({ _id: id });
};

module.exports = {
  listLeaveTypes,
  getLeaveType,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
};
