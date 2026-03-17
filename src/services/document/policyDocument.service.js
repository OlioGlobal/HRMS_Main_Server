const PolicyDocument        = require('../../models/PolicyDocument');
const PolicyAcknowledgement = require('../../models/PolicyAcknowledgement');
const DocumentAuditLog      = require('../../models/DocumentAuditLog');
const Employee              = require('../../models/Employee');
const AppError              = require('../../utils/AppError');
const { uploadToB2, getDownloadUrl, deleteFromR2, buildPolicyDocKey } = require('../../utils/r2');

// ─── Helper: log audit ──────────────────────────────────────────────────────
const _logAudit = async (data) => {
  await DocumentAuditLog.create({ ...data, sourceType: 'policy_document' });
};

// ─── List active policies (latest versions) ─────────────────────────────────
const listPolicies = async (companyId, filters = {}) => {
  const query = { company_id: companyId, isLatest: true, isActive: true };
  if (filters.category) query.category = filters.category;

  const policies = await PolicyDocument.find(query)
    .populate('uploadedBy', 'firstName lastName')
    .sort({ name: 1 })
    .lean();

  // Attach acknowledgement counts
  const enriched = await Promise.all(
    policies.map(async (p) => {
      const ackCount = await PolicyAcknowledgement.countDocuments({ policy_document_id: p._id });
      const totalActive = await Employee.countDocuments({ company_id: companyId, status: 'active' });
      return { ...p, ackCount, totalEmployees: totalActive };
    })
  );

  return enriched;
};

// ─── Get single policy ──────────────────────────────────────────────────────
const getPolicy = async (companyId, id) => {
  const policy = await PolicyDocument.findOne({ _id: id, company_id: companyId })
    .populate('uploadedBy', 'firstName lastName')
    .lean();
  if (!policy) throw new AppError('Policy not found', 404);
  return policy;
};

// ─── Create policy (multer file → B2 → save) ───────────────────────────────
const createPolicy = async (companyId, userId, data, file) => {
  // Upload to B2
  const fileKey = buildPolicyDocKey(companyId, data.category, file.originalname);
  await uploadToB2(fileKey, file.buffer, file.mimetype);

  const policy = await PolicyDocument.create({
    company_id:              companyId,
    name:                    data.name,
    category:                data.category,
    description:             data.description || null,
    fileKey,
    fileSize:                file.size,
    mimeType:                file.mimetype,
    versionNumber:           1,
    isLatest:                true,
    requiresAcknowledgement: data.requiresAcknowledgement === 'true' || data.requiresAcknowledgement === true,
    acknowledgementDeadline: data.acknowledgementDeadline || null,
    uploadedBy:              userId,
  });

  policy.policyGroupId = policy._id;
  await policy.save();

  await _logAudit({
    company_id:  companyId,
    document_id: policy._id,
    action:      'uploaded',
    performedBy: userId,
  });

  return policy;
};

// ─── Update policy metadata ─────────────────────────────────────────────────
const updatePolicy = async (companyId, id, data) => {
  const policy = await PolicyDocument.findOne({ _id: id, company_id: companyId });
  if (!policy) throw new AppError('Policy not found', 404);

  const allowed = ['name', 'category', 'description', 'requiresAcknowledgement', 'acknowledgementDeadline', 'isActive'];
  for (const key of allowed) {
    if (data[key] !== undefined) policy[key] = data[key];
  }
  await policy.save();
  return policy;
};

// ─── Upload new version ─────────────────────────────────────────────────────
const createNewVersion = async (companyId, id, userId, data, file) => {
  const current = await PolicyDocument.findOne({ _id: id, company_id: companyId, isLatest: true });
  if (!current) throw new AppError('Policy not found or is not the latest version', 404);

  // Upload to B2
  const fileKey = buildPolicyDocKey(companyId, current.category, file.originalname);
  await uploadToB2(fileKey, file.buffer, file.mimetype);

  // Mark current as not latest
  current.isLatest = false;
  await current.save();

  const newVersion = await PolicyDocument.create({
    company_id:              companyId,
    name:                    current.name,
    category:                current.category,
    description:             data.description || current.description,
    fileKey,
    fileSize:                file.size,
    mimeType:                file.mimetype,
    policyGroupId:           current.policyGroupId,
    versionNumber:           current.versionNumber + 1,
    versionNotes:            data.versionNotes || null,
    isLatest:                true,
    requiresAcknowledgement: data.requiresAcknowledgement ?? current.requiresAcknowledgement,
    acknowledgementDeadline: data.acknowledgementDeadline || null,
    uploadedBy:              userId,
  });

  await _logAudit({
    company_id:  companyId,
    document_id: newVersion._id,
    action:      'uploaded',
    performedBy: userId,
  });

  return newVersion;
};

// ─── Version history ────────────────────────────────────────────────────────
const getVersionHistory = async (companyId, id) => {
  const policy = await PolicyDocument.findOne({ _id: id, company_id: companyId }).lean();
  if (!policy) throw new AppError('Policy not found', 404);

  const versions = await PolicyDocument.find({
    company_id:    companyId,
    policyGroupId: policy.policyGroupId,
  })
    .sort({ versionNumber: -1 })
    .lean();

  return versions;
};

// ─── Download policy ────────────────────────────────────────────────────────
const getPolicyDownloadUrl = async (companyId, id, userId) => {
  const policy = await PolicyDocument.findOne({ _id: id, company_id: companyId });
  if (!policy) throw new AppError('Policy not found', 404);

  const url = await getDownloadUrl(policy.fileKey);

  await _logAudit({
    company_id:  companyId,
    document_id: policy._id,
    action:      'downloaded',
    performedBy: userId,
  });

  return { url, policy };
};

// ─── Soft delete (deactivate) ───────────────────────────────────────────────
const deletePolicy = async (companyId, id) => {
  const policy = await PolicyDocument.findOne({ _id: id, company_id: companyId });
  if (!policy) throw new AppError('Policy not found', 404);

  policy.isActive = false;
  await policy.save();
  return { deactivated: true };
};

// ─── Acknowledge policy ─────────────────────────────────────────────────────
const acknowledgePolicy = async (companyId, policyId, employeeId, ipAddress) => {
  const policy = await PolicyDocument.findOne({ _id: policyId, company_id: companyId, isLatest: true });
  if (!policy) throw new AppError('Policy not found', 404);
  if (!policy.requiresAcknowledgement) throw new AppError('This policy does not require acknowledgement', 400);

  // Check if already acknowledged
  const existing = await PolicyAcknowledgement.findOne({ policy_document_id: policyId, employee_id: employeeId });
  if (existing) throw new AppError('Already acknowledged', 400);

  const ack = await PolicyAcknowledgement.create({
    company_id:         companyId,
    policy_document_id: policyId,
    employee_id:        employeeId,
    ipAddress,
  });

  return ack;
};

// ─── Get acknowledgement status for a policy ────────────────────────────────
const getAcknowledgements = async (companyId, policyId) => {
  const acks = await PolicyAcknowledgement.find({
    company_id:         companyId,
    policy_document_id: policyId,
  })
    .populate('employee_id', 'firstName lastName employeeId')
    .sort({ acknowledgedAt: -1 })
    .lean();

  const totalActive = await Employee.countDocuments({ company_id: companyId, status: 'active' });
  return { acknowledgements: acks, total: totalActive, acknowledged: acks.length };
};

// ─── My pending acknowledgements ────────────────────────────────────────────
// FIX #10: Skip policies whose deadline passed before employee's joining date
const getMyPendingAcknowledgements = async (companyId, employeeId) => {
  const employee = await Employee.findOne({ _id: employeeId, company_id: companyId }).lean();
  const joiningDate = employee?.joiningDate ? new Date(employee.joiningDate) : null;

  const policies = await PolicyDocument.find({
    company_id:              companyId,
    isLatest:                true,
    isActive:                true,
    requiresAcknowledgement: true,
  }).lean();

  const acked = await PolicyAcknowledgement.find({
    company_id:  companyId,
    employee_id: employeeId,
  }).distinct('policy_document_id');

  const ackedSet = new Set(acked.map((id) => id.toString()));

  const pending = policies.filter((p) => {
    if (ackedSet.has(p._id.toString())) return false;
    // Skip if deadline existed and passed before employee joined
    if (p.acknowledgementDeadline && joiningDate) {
      if (new Date(p.acknowledgementDeadline) < joiningDate) return false;
    }
    return true;
  });

  return pending;
};

module.exports = {
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  createNewVersion,
  getVersionHistory,
  getPolicyDownloadUrl,
  deletePolicy,
  acknowledgePolicy,
  getAcknowledgements,
  getMyPendingAcknowledgements,
};
