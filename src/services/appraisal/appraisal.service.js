const AppError           = require('../../utils/AppError');
const AppraisalCycle     = require('../../models/AppraisalCycle');
const AppraisalRecord    = require('../../models/AppraisalRecord');
const AppraisalGoal      = require('../../models/AppraisalGoal');
const AppraisalTemplate  = require('../../models/AppraisalTemplate');
const Employee           = require('../../models/Employee');
const UserRole           = require('../../models/UserRole');
const Role               = require('../../models/Role');

// ═══════════════════════════════════════════════════════════════════════════════
//  CYCLES
// ═══════════════════════════════════════════════════════════════════════════════

const listCycles = async (companyId, query = {}) => {
  const filter = { company_id: companyId };
  if (query.status) filter.status = query.status;

  const cycles = await AppraisalCycle.find(filter)
    .sort({ createdAt: -1 })
    .populate('createdBy', 'firstName lastName')
    .lean();

  // Attach record counts per cycle
  for (const cycle of cycles) {
    const counts = await AppraisalRecord.aggregate([
      { $match: { cycle_id: cycle._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    cycle.recordCounts = {};
    let total = 0;
    for (const c of counts) {
      cycle.recordCounts[c._id] = c.count;
      total += c.count;
    }
    cycle.recordCounts.total = total;
  }

  return cycles;
};

const getCycle = async (companyId, cycleId) => {
  const cycle = await AppraisalCycle.findOne({ _id: cycleId, company_id: companyId })
    .populate('createdBy', 'firstName lastName')
    .populate('template_id', 'name goals')
    .lean();
  if (!cycle) throw new AppError('Appraisal cycle not found', 404);

  // Attach aggregated counts
  const counts = await AppraisalRecord.aggregate([
    { $match: { cycle_id: cycle._id } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  cycle.recordCounts = {};
  let total = 0;
  for (const c of counts) {
    cycle.recordCounts[c._id] = c.count;
    total += c.count;
  }
  cycle.recordCounts.total = total;

  return cycle;
};

const createCycle = async (companyId, userId, body) => {
  // Validate weights total 100
  if ((body.selfRatingWeight || 30) + (body.managerRatingWeight || 70) !== 100) {
    throw new AppError('Self and manager rating weights must total 100', 400);
  }

  const cycle = await AppraisalCycle.create({
    company_id: companyId,
    ...body,
    createdBy: userId,
  });

  return cycle;
};

const updateCycle = async (companyId, cycleId, body) => {
  const cycle = await AppraisalCycle.findOne({ _id: cycleId, company_id: companyId });
  if (!cycle) throw new AppError('Appraisal cycle not found', 404);

  if (cycle.status === 'completed') {
    throw new AppError('Cannot update a completed cycle', 400);
  }

  // Validate weights if provided
  const selfW = body.selfRatingWeight ?? cycle.selfRatingWeight;
  const mgrW  = body.managerRatingWeight ?? cycle.managerRatingWeight;
  if (selfW + mgrW !== 100) {
    throw new AppError('Self and manager rating weights must total 100', 400);
  }

  Object.assign(cycle, body);
  await cycle.save();
  return cycle;
};

const deleteCycle = async (companyId, cycleId) => {
  const cycle = await AppraisalCycle.findOne({ _id: cycleId, company_id: companyId });
  if (!cycle) throw new AppError('Appraisal cycle not found', 404);

  if (cycle.status !== 'draft') {
    throw new AppError('Only draft cycles can be deleted', 400);
  }

  await AppraisalGoal.deleteMany({ cycle_id: cycleId });
  await AppraisalRecord.deleteMany({ cycle_id: cycleId });
  await cycle.deleteOne();
};

const activateCycle = async (companyId, cycleId) => {
  const cycle = await AppraisalCycle.findOne({ _id: cycleId, company_id: companyId });
  if (!cycle) throw new AppError('Appraisal cycle not found', 404);
  if (cycle.status !== 'draft') throw new AppError('Only draft cycles can be activated', 400);

  // Find eligible employees
  const empFilter = {
    company_id: companyId,
    status: 'active',
    probationStatus: { $in: ['confirmed', 'waived'] },
  };

  if (cycle.applicableTo === 'department' && cycle.department_ids?.length) {
    empFilter.department_id = { $in: cycle.department_ids };
  } else if (cycle.applicableTo === 'custom' && cycle.employee_ids?.length) {
    empFilter._id = { $in: cycle.employee_ids };
  }

  const employees = await Employee.find(empFilter).lean();

  if (employees.length === 0) {
    throw new AppError('No eligible employees found for this cycle', 400);
  }

  // Load template if selected
  let templateGoals = [];
  if (cycle.template_id) {
    const template = await AppraisalTemplate.findById(cycle.template_id).lean();
    if (template?.goals?.length) templateGoals = template.goals;
  }

  // Create one AppraisalRecord per employee + auto-create goals from template
  const records = [];
  const goals = [];

  for (const emp of employees) {
    // Skip if record already exists (idempotent)
    const exists = await AppraisalRecord.findOne({ cycle_id: cycleId, employee_id: emp._id });
    if (exists) continue;

    const record = new AppraisalRecord({
      company_id:  companyId,
      cycle_id:    cycleId,
      employee_id: emp._id,
      manager_id:  emp.reportingManager_id || null,
      reviewer_id: emp.reportingManager_id || null,
      status:      templateGoals.length > 0 ? 'not_started' : 'not_started',
    });
    records.push(record);

    // Auto-create goals from template
    for (const tg of templateGoals) {
      goals.push({
        company_id:  companyId,
        cycle_id:    cycleId,
        employee_id: emp._id,
        record_id:   record._id,
        title:       tg.title,
        description: tg.description || null,
        weightage:   tg.defaultWeightage,
        goalStatus:  'draft',
      });
    }
  }

  if (records.length > 0) {
    await AppraisalRecord.insertMany(records);
  }
  if (goals.length > 0) {
    await AppraisalGoal.insertMany(goals);
  }

  cycle.status = 'active';
  await cycle.save();

  return { cycle, recordsCreated: records.length, goalsCreated: goals.length };
};

const completeCycle = async (companyId, cycleId) => {
  const cycle = await AppraisalCycle.findOne({ _id: cycleId, company_id: companyId });
  if (!cycle) throw new AppError('Appraisal cycle not found', 404);
  if (cycle.status !== 'active') throw new AppError('Only active cycles can be completed', 400);

  cycle.status = 'completed';
  await cycle.save();
  return cycle;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  RECORDS
// ═══════════════════════════════════════════════════════════════════════════════

const listRecords = async (companyId, cycleId, query = {}) => {
  const filter = { company_id: companyId, cycle_id: cycleId };
  if (query.status) filter.status = query.status;

  const records = await AppraisalRecord.find(filter)
    .populate('employee_id', 'firstName lastName employeeId department_id designation_id')
    .populate('reviewer_id', 'firstName lastName employeeId')
    .sort({ createdAt: 1 })
    .lean();

  // Attach goal counts per record
  for (const rec of records) {
    const goalCount = await AppraisalGoal.countDocuments({ record_id: rec._id });
    const approvedCount = await AppraisalGoal.countDocuments({ record_id: rec._id, goalStatus: 'approved' });
    rec.goalCount = goalCount;
    rec.approvedGoalCount = approvedCount;
  }

  return records;
};

const getRecord = async (companyId, cycleId, employeeId) => {
  const record = await AppraisalRecord.findOne({
    company_id: companyId, cycle_id: cycleId, employee_id: employeeId,
  })
    .populate('employee_id', 'firstName lastName employeeId department_id designation_id')
    .populate('reviewer_id', 'firstName lastName employeeId')
    .populate('manager_id', 'firstName lastName employeeId')
    .lean();
  if (!record) throw new AppError('Appraisal record not found', 404);

  // Attach goals
  record.goals = await AppraisalGoal.find({ record_id: record._id }).sort({ createdAt: 1 }).lean();

  return record;
};

const finalizeRecord = async (companyId, cycleId, employeeId, userId, body) => {
  const record = await AppraisalRecord.findOne({
    company_id: companyId, cycle_id: cycleId, employee_id: employeeId,
  });
  if (!record) throw new AppError('Appraisal record not found', 404);

  if (record.status !== 'manager_submitted') {
    throw new AppError('Record must be in manager_submitted status to finalize', 400);
  }

  // Calculate final rating from goals
  const cycle = await AppraisalCycle.findById(cycleId).lean();
  const goals = await AppraisalGoal.find({ record_id: record._id, goalStatus: 'approved' }).lean();

  if (goals.length === 0) throw new AppError('No approved goals found', 400);

  const finalRating = calculateFinalRating(goals, cycle);

  record.finalRating = finalRating;
  record.hrComments = body.hrComments || null;
  record.finalizedBy = userId;
  record.finalizedAt = new Date();
  record.status = 'finalized';
  await record.save();

  return record;
};

const shareRecord = async (companyId, cycleId, employeeId) => {
  const record = await AppraisalRecord.findOne({
    company_id: companyId, cycle_id: cycleId, employee_id: employeeId,
  });
  if (!record) throw new AppError('Appraisal record not found', 404);
  if (record.status !== 'finalized') throw new AppError('Record must be finalized before sharing', 400);

  record.isSharedWithEmployee = true;
  record.sharedAt = new Date();
  await record.save();

  return record;
};

const assignReviewer = async (companyId, cycleId, employeeId, reviewerId) => {
  const record = await AppraisalRecord.findOne({
    company_id: companyId, cycle_id: cycleId, employee_id: employeeId,
  });
  if (!record) throw new AppError('Appraisal record not found', 404);
  if (record.status === 'finalized') throw new AppError('Cannot change reviewer for finalized record', 400);

  record.reviewer_id = reviewerId;
  record.manager_id = reviewerId;
  await record.save();

  return record;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  MY APPRAISAL (Employee self-service)
// ═══════════════════════════════════════════════════════════════════════════════

const getMyAppraisal = async (companyId, employeeId) => {
  // Get active cycle record for this employee
  const activeCycles = await AppraisalCycle.find({ company_id: companyId, status: 'active' }).lean();

  const results = [];
  for (const cycle of activeCycles) {
    const record = await AppraisalRecord.findOne({
      cycle_id: cycle._id, employee_id: employeeId,
    })
      .populate('reviewer_id', 'firstName lastName employeeId')
      .lean();

    if (record) {
      record.goals = await AppraisalGoal.find({ record_id: record._id }).sort({ createdAt: 1 }).lean();
      record.cycle = cycle;
      results.push(record);
    }
  }

  return results;
};

const getMyHistory = async (companyId, employeeId) => {
  // Get all finalized + shared records for this employee
  const records = await AppraisalRecord.find({
    company_id: companyId,
    employee_id: employeeId,
    status: 'finalized',
    isSharedWithEmployee: true,
  })
    .populate('cycle_id', 'name type periodStart periodEnd ratingScale')
    .sort({ finalizedAt: -1 })
    .lean();

  return records;
};

const submitSelfRating = async (companyId, employeeId, cycleId, body) => {
  const record = await AppraisalRecord.findOne({
    company_id: companyId, cycle_id: cycleId, employee_id: employeeId,
  });
  if (!record) throw new AppError('Appraisal record not found', 404);

  if (!['goals_approved'].includes(record.status)) {
    throw new AppError('Goals must be approved before you can submit self rating', 400);
  }

  // Check deadline (soft — warn but allow)
  const cycle = await AppraisalCycle.findById(cycleId).lean();

  // Update goal self-ratings
  if (body.goalRatings && Array.isArray(body.goalRatings)) {
    for (const gr of body.goalRatings) {
      await AppraisalGoal.updateOne(
        { _id: gr.goalId, record_id: record._id },
        { selfRating: gr.rating, selfComment: gr.comment || null }
      );
    }
  }

  record.selfComments = body.selfComments || null;
  record.selfSubmittedAt = new Date();
  record.status = 'self_submitted';
  await record.save();

  return record;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TEAM APPRAISALS (Manager)
// ═══════════════════════════════════════════════════════════════════════════════

const getTeamAppraisals = async (companyId, reviewerEmployeeId) => {
  // Find all records where this employee is the reviewer
  const records = await AppraisalRecord.find({
    company_id: companyId,
    reviewer_id: reviewerEmployeeId,
    status: { $ne: 'finalized' },
  })
    .populate('employee_id', 'firstName lastName employeeId department_id designation_id')
    .populate('cycle_id', 'name type periodStart periodEnd reviewStart reviewEnd managerRatingDeadline ratingScale')
    .sort({ createdAt: 1 })
    .lean();

  for (const rec of records) {
    const goalCount = await AppraisalGoal.countDocuments({ record_id: rec._id });
    const approvedCount = await AppraisalGoal.countDocuments({ record_id: rec._id, goalStatus: 'approved' });
    rec.goalCount = goalCount;
    rec.approvedGoalCount = approvedCount;
  }

  return records;
};

const submitManagerRating = async (companyId, reviewerEmployeeId, cycleId, employeeId, body) => {
  const record = await AppraisalRecord.findOne({
    company_id: companyId, cycle_id: cycleId, employee_id: employeeId,
  });
  if (!record) throw new AppError('Appraisal record not found', 404);

  // Verify reviewer
  if (record.reviewer_id?.toString() !== reviewerEmployeeId.toString()) {
    throw new AppError('You are not the reviewer for this employee', 403);
  }

  if (record.status !== 'self_submitted') {
    throw new AppError('Employee must submit self rating first', 400);
  }

  // Update goal manager-ratings
  if (body.goalRatings && Array.isArray(body.goalRatings)) {
    for (const gr of body.goalRatings) {
      await AppraisalGoal.updateOne(
        { _id: gr.goalId, record_id: record._id },
        { managerRating: gr.rating, managerComment: gr.comment || null }
      );
    }
  }

  record.managerComments = body.managerComments || null;
  record.managerSubmittedAt = new Date();
  record.status = 'manager_submitted';
  await record.save();

  return record;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  GOALS
// ═══════════════════════════════════════════════════════════════════════════════

const listGoals = async (recordId) => {
  return AppraisalGoal.find({ record_id: recordId }).sort({ createdAt: 1 }).lean();
};

const createGoal = async (companyId, recordId, employeeId, body) => {
  const record = await AppraisalRecord.findOne({ _id: recordId, company_id: companyId });
  if (!record) throw new AppError('Appraisal record not found', 404);

  // Check goal limits
  const cycle = await AppraisalCycle.findById(record.cycle_id).lean();
  const existingCount = await AppraisalGoal.countDocuments({ record_id: recordId });

  if (existingCount >= (cycle.maxGoals || 10)) {
    throw new AppError(`Maximum ${cycle.maxGoals || 10} goals allowed`, 400);
  }

  const goal = await AppraisalGoal.create({
    company_id:  companyId,
    cycle_id:    record.cycle_id,
    employee_id: employeeId,
    record_id:   recordId,
    title:       body.title,
    description: body.description || null,
    weightage:   body.weightage,
    goalStatus:  'draft',
  });

  return goal;
};

const updateGoal = async (companyId, recordId, goalId, body) => {
  const goal = await AppraisalGoal.findOne({ _id: goalId, record_id: recordId, company_id: companyId });
  if (!goal) throw new AppError('Goal not found', 404);

  if (goal.goalStatus === 'approved') {
    throw new AppError('Approved goals cannot be edited', 400);
  }

  if (body.title !== undefined)       goal.title = body.title;
  if (body.description !== undefined) goal.description = body.description;
  if (body.weightage !== undefined)   goal.weightage = body.weightage;

  // If goal was rejected, reset to draft on edit
  if (goal.goalStatus === 'rejected') goal.goalStatus = 'draft';

  await goal.save();
  return goal;
};

const deleteGoal = async (companyId, recordId, goalId) => {
  const goal = await AppraisalGoal.findOne({ _id: goalId, record_id: recordId, company_id: companyId });
  if (!goal) throw new AppError('Goal not found', 404);
  if (goal.goalStatus === 'approved') throw new AppError('Approved goals cannot be deleted', 400);
  await goal.deleteOne();
};

const submitGoals = async (companyId, recordId) => {
  const record = await AppraisalRecord.findOne({ _id: recordId, company_id: companyId });
  if (!record) throw new AppError('Appraisal record not found', 404);

  const goals = await AppraisalGoal.find({ record_id: recordId });
  const cycle = await AppraisalCycle.findById(record.cycle_id).lean();

  if (goals.length < (cycle.minGoals || 1)) {
    throw new AppError(`Minimum ${cycle.minGoals || 1} goal(s) required`, 400);
  }

  // Validate weightage totals 100
  const total = goals.reduce((sum, g) => sum + g.weightage, 0);
  if (total !== 100) {
    throw new AppError(`Goal weightages must total 100% (currently ${total}%)`, 400);
  }

  // Mark all draft goals as pending_approval
  await AppraisalGoal.updateMany(
    { record_id: recordId, goalStatus: { $in: ['draft', 'rejected'] } },
    { goalStatus: 'pending_approval' }
  );

  record.status = 'goals_set';
  await record.save();

  return record;
};

const approveGoals = async (companyId, recordId, userId) => {
  const record = await AppraisalRecord.findOne({ _id: recordId, company_id: companyId });
  if (!record) throw new AppError('Appraisal record not found', 404);

  if (record.status !== 'goals_set') {
    throw new AppError('Goals must be submitted first', 400);
  }

  await AppraisalGoal.updateMany(
    { record_id: recordId, goalStatus: 'pending_approval' },
    { goalStatus: 'approved', approvedBy: userId, approvedAt: new Date() }
  );

  record.status = 'goals_approved';
  await record.save();

  return record;
};

const rejectGoals = async (companyId, recordId, body) => {
  const record = await AppraisalRecord.findOne({ _id: recordId, company_id: companyId });
  if (!record) throw new AppError('Appraisal record not found', 404);

  if (record.status !== 'goals_set') {
    throw new AppError('Goals must be submitted first', 400);
  }

  await AppraisalGoal.updateMany(
    { record_id: recordId, goalStatus: 'pending_approval' },
    { goalStatus: 'rejected', goalRejectionReason: body.reason || null }
  );

  record.status = 'not_started';
  await record.save();

  return record;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

const listTemplates = async (companyId) => {
  return AppraisalTemplate.find({ company_id: companyId, isActive: true }).sort({ name: 1 }).lean();
};

const createTemplate = async (companyId, body) => {
  return AppraisalTemplate.create({ company_id: companyId, ...body });
};

const updateTemplate = async (companyId, templateId, body) => {
  const template = await AppraisalTemplate.findOne({ _id: templateId, company_id: companyId });
  if (!template) throw new AppError('Template not found', 404);
  Object.assign(template, body);
  await template.save();
  return template;
};

const deleteTemplate = async (companyId, templateId) => {
  const template = await AppraisalTemplate.findOne({ _id: templateId, company_id: companyId });
  if (!template) throw new AppError('Template not found', 404);

  // Check if any active cycle uses this template
  const inUse = await AppraisalCycle.findOne({ company_id: companyId, template_id: templateId, status: 'active' });
  if (inUse) throw new AppError('Template is used by an active cycle', 400);

  template.isActive = false;
  await template.save();
};

// ═══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD — active appraisal info for banner
// ═══════════════════════════════════════════════════════════════════════════════

const getDashboardAppraisal = async (companyId, employeeId) => {
  const activeCycles = await AppraisalCycle.find({ company_id: companyId, status: 'active' }).lean();

  for (const cycle of activeCycles) {
    const record = await AppraisalRecord.findOne({
      cycle_id: cycle._id, employee_id: employeeId,
    }).lean();

    if (record && !['finalized'].includes(record.status)) {
      return {
        cycleName: cycle.name,
        cycleId:   cycle._id,
        status:    record.status,
        selfRatingDeadline:    cycle.selfRatingDeadline,
        managerRatingDeadline: cycle.managerRatingDeadline,
        reviewEnd:             cycle.reviewEnd,
      };
    }
  }

  return null; // no pending appraisal
};

// ═══════════════════════════════════════════════════════════════════════════════
//  REVIEWERS — employees with Manager / HR / Admin roles
// ═══════════════════════════════════════════════════════════════════════════════

const listReviewers = async (companyId) => {
  const reviewerRoles = await Role.find({
    company_id: companyId,
    name: { $in: ['Super Admin', 'HR Manager', 'HR Staff', 'Manager'] },
  }).lean();

  const roleIds = reviewerRoles.map(r => r._id);
  const userRoles = await UserRole.find({ company_id: companyId, role_id: { $in: roleIds } }).lean();
  const userIds = [...new Set(userRoles.map(ur => ur.user_id.toString()))];

  const employees = await Employee.find({
    company_id: companyId,
    user_id: { $in: userIds },
    status: 'active',
  })
    .select('firstName lastName employeeId')
    .sort({ firstName: 1 })
    .lean();

  return employees;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const calculateFinalRating = (goals, cycle) => {
  let selfGoalScore = 0;
  let managerGoalScore = 0;

  for (const goal of goals) {
    const weight = goal.weightage / 100;
    selfGoalScore    += (goal.selfRating || 0) * weight;
    managerGoalScore += (goal.managerRating || 0) * weight;
  }

  const finalRating = (
    (selfGoalScore * (cycle.selfRatingWeight || 30) / 100) +
    (managerGoalScore * (cycle.managerRatingWeight || 70) / 100)
  );

  return Math.round(finalRating * 100) / 100;
};

module.exports = {
  // Cycles
  listCycles, getCycle, createCycle, updateCycle, deleteCycle, activateCycle, completeCycle,
  // Records
  listRecords, getRecord, finalizeRecord, shareRecord, assignReviewer,
  // My Appraisal
  getMyAppraisal, getMyHistory, submitSelfRating,
  // Team
  getTeamAppraisals, submitManagerRating,
  // Goals
  listGoals, createGoal, updateGoal, deleteGoal, submitGoals, approveGoals, rejectGoals,
  // Templates
  listTemplates, createTemplate, updateTemplate, deleteTemplate,
  // Dashboard
  getDashboardAppraisal,
  // Reviewers
  listReviewers,
};
