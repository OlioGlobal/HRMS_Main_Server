const SalaryGrade = require('../../models/SalaryGrade');
const AppError    = require('../../utils/AppError');

// ─── List ─────────────────────────────────────────────────────────────────────
const listGrades = async (companyId) => {
  return SalaryGrade.find({ company_id: companyId, isActive: true })
    .populate('components.component_id', 'name type calcType percentOf')
    .sort({ createdAt: -1 })
    .lean();
};

// ─── Get One ──────────────────────────────────────────────────────────────────
const getGrade = async (companyId, id) => {
  const grade = await SalaryGrade.findOne({ _id: id, company_id: companyId })
    .populate('components.component_id', 'name type calcType percentOf')
    .lean();
  if (!grade) throw new AppError('Salary grade not found.', 404);
  return grade;
};

// ─── Create ───────────────────────────────────────────────────────────────────
const createGrade = async (companyId, body) => {
  const grade = await SalaryGrade.create({ ...body, company_id: companyId });
  return grade.toObject();
};

// ─── Update ───────────────────────────────────────────────────────────────────
const updateGrade = async (companyId, id, body) => {
  const grade = await SalaryGrade.findOne({ _id: id, company_id: companyId });
  if (!grade) throw new AppError('Salary grade not found.', 404);

  Object.assign(grade, body);
  await grade.save();
  return grade.toObject();
};

// ─── Delete (soft) ────────────────────────────────────────────────────────────
const deleteGrade = async (companyId, id) => {
  const grade = await SalaryGrade.findOne({ _id: id, company_id: companyId });
  if (!grade) throw new AppError('Salary grade not found.', 404);

  grade.isActive = false;
  await grade.save();
  return grade.toObject();
};

module.exports = {
  listGrades,
  getGrade,
  createGrade,
  updateGrade,
  deleteGrade,
};
