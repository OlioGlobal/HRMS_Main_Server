const NotificationRule = require('../../models/NotificationRule');
const RuleExecution   = require('../../models/RuleExecution');
const AppError        = require('../../utils/AppError');

// ─── List all rules for a company ────────────────────────────────────────────
const listRules = async (companyId) => {
  const rules = await NotificationRule.find({ company_id: companyId })
    .sort({ name: 1 })
    .lean();

  if (!rules.length) return { rules: [] };

  // Attach last execution log per rule (single aggregate)
  const ruleIds = rules.map((r) => r._id);

  const lastExecs = await RuleExecution.aggregate([
    { $match: { company_id: companyId, rule_id: { $in: ruleIds } } },
    { $sort: { triggeredAt: -1 } },
    {
      $group: {
        _id:           '$rule_id',
        lastExecution: { $first: '$$ROOT' },
      },
    },
  ]);

  const execMap = {};
  for (const item of lastExecs) {
    execMap[item._id.toString()] = item.lastExecution;
  }

  const enriched = rules.map((rule) => ({
    ...rule,
    lastExecution: execMap[rule._id.toString()] || null,
  }));

  return { rules: enriched };
};

// ─── Get single rule + last 10 executions ────────────────────────────────────
const getRuleById = async (ruleId, companyId) => {
  const rule = await NotificationRule.findOne({
    _id:        ruleId,
    company_id: companyId,
  }).lean();

  if (!rule) throw new AppError('Notification rule not found.', 404);

  const executions = await RuleExecution.find({
    rule_id:    ruleId,
    company_id: companyId,
  })
    .sort({ triggeredAt: -1 })
    .limit(10)
    .lean();

  return { rule, executions };
};

// ─── Update rule (whitelist fields only) ─────────────────────────────────────
const updateRule = async (ruleId, companyId, updates) => {
  const allowedFields = ['isEnabled', 'config', 'recipients', 'channels', 'templates'];
  const sanitised = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) sanitised[key] = updates[key];
  }

  const rule = await NotificationRule.findOneAndUpdate(
    { _id: ruleId, company_id: companyId },
    sanitised,
    { new: true, runValidators: true },
  );

  if (!rule) throw new AppError('Notification rule not found.', 404);
  return { rule };
};

// ─── Paginated execution logs for one rule ───────────────────────────────────
const getRuleExecutions = async (ruleId, companyId, query = {}) => {
  const page  = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const skip  = (page - 1) * limit;

  const filter = { rule_id: ruleId, company_id: companyId };

  const [executions, total] = await Promise.all([
    RuleExecution.find(filter)
      .sort({ triggeredAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    RuleExecution.countDocuments(filter),
  ]);

  return {
    executions,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  };
};

module.exports = {
  listRules,
  getRuleById,
  updateRule,
  getRuleExecutions,
};
