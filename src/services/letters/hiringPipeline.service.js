const HiringPipeline = require('../../models/HiringPipeline');
const Employee       = require('../../models/Employee');
const AppError       = require('../../utils/AppError');

const list = async (companyId) => {
  return HiringPipeline.find({ company_id: companyId, isActive: true })
    .populate('steps.template_id', 'name letterType')
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
};

const getOne = async (companyId, id) => {
  const pipeline = await HiringPipeline.findOne({ _id: id, company_id: companyId, isActive: true })
    .populate('steps.template_id', 'name letterType manualVariables')
    .lean();
  if (!pipeline) throw new AppError('Hiring pipeline not found.', 404);
  return pipeline;
};

const create = async (companyId, userId, body) => {
  const { name, steps = [], isDefault } = body;

  if (isDefault) {
    await HiringPipeline.updateMany(
      { company_id: companyId, isDefault: true },
      { $set: { isDefault: false } }
    );
  }

  const pipeline = await HiringPipeline.create({
    company_id: companyId,
    name,
    steps: _normalizeSteps(steps),
    isDefault: !!isDefault,
    createdBy: userId,
  });

  return pipeline.toObject();
};

const update = async (companyId, id, body) => {
  const pipeline = await HiringPipeline.findOne({ _id: id, company_id: companyId, isActive: true });
  if (!pipeline) throw new AppError('Hiring pipeline not found.', 404);

  if (body.name  !== undefined) pipeline.name  = body.name;
  if (body.steps !== undefined) pipeline.steps = _normalizeSteps(body.steps);

  if (body.isDefault === true) {
    await HiringPipeline.updateMany(
      { company_id: companyId, isDefault: true, _id: { $ne: id } },
      { $set: { isDefault: false } }
    );
    pipeline.isDefault = true;
  } else if (body.isDefault === false) {
    pipeline.isDefault = false;
  }

  await pipeline.save();
  return pipeline.toObject();
};

const remove = async (companyId, id) => {
  const pipeline = await HiringPipeline.findOne({ _id: id, company_id: companyId, isActive: true });
  if (!pipeline) throw new AppError('Hiring pipeline not found.', 404);

  // Block if employees are still in this pipeline
  const count = await Employee.countDocuments({ company_id: companyId, pipeline_id: id, status: { $in: ['pre_join', 'offered', 'accepted'] } });
  if (count > 0) throw new AppError(`Cannot delete — ${count} candidate(s) are currently in this pipeline.`, 400);

  pipeline.isActive = false;
  await pipeline.save();
};

const assignToEmployee = async (companyId, employeeId, pipelineId) => {
  const pipeline = await HiringPipeline.findOne({ _id: pipelineId, company_id: companyId, isActive: true }).lean();
  if (!pipeline) throw new AppError('Hiring pipeline not found.', 404);

  const employee = await Employee.findOne({ _id: employeeId, company_id: companyId });
  if (!employee) throw new AppError('Employee not found.', 404);

  employee.pipeline_id         = pipelineId;
  employee.pipelineCurrentStep = 0;
  if (employee.status === 'active') employee.status = 'pre_join';
  await employee.save();

  return employee.toObject();
};

const getDefault = async (companyId) => {
  return HiringPipeline.findOne({ company_id: companyId, isDefault: true, isActive: true })
    .populate('steps.template_id', 'name letterType manualVariables')
    .lean();
};

const _normalizeSteps = (steps) =>
  steps.map((s, i) => ({ ...s, order: s.order ?? i + 1 }))
    .sort((a, b) => a.order - b.order);

module.exports = { list, getOne, create, update, remove, assignToEmployee, getDefault };
