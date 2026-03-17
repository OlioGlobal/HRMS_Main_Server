const DocumentAuditLog = require('../../models/DocumentAuditLog');

// ─── List audit logs (HR/Admin) ─────────────────────────────────────────────
const listAuditLogs = async (companyId, filters = {}) => {
  const query = { company_id: companyId };
  if (filters.sourceType) query.sourceType = filters.sourceType;
  if (filters.action) query.action = filters.action;
  if (filters.employee_id) query.employee_id = filters.employee_id;

  // Date range
  if (filters.from || filters.to) {
    query.createdAt = {};
    if (filters.from) query.createdAt.$gte = new Date(filters.from);
    if (filters.to)   query.createdAt.$lte = new Date(filters.to);
  }

  const page  = parseInt(filters.page, 10)  || 1;
  const limit = parseInt(filters.limit, 10) || 50;
  const skip  = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    DocumentAuditLog.find(query)
      .populate('employee_id', 'firstName lastName employeeId')
      .populate('performedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DocumentAuditLog.countDocuments(query),
  ]);

  return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
};

module.exports = { listAuditLogs };
