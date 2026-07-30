const Company            = require('../../models/Company');
const TenantSubscription = require('../../models/TenantSubscription');
const Employee           = require('../../models/Employee');
const AppError           = require('../../utils/AppError');
const { computeTenantStatus, daysUntilExpiry } = require('../admin/tenantStatus');
const path     = require('path');
const fs       = require('fs');

// Normalize legacy workWeek values (old DB: 'monday' → new: 'MON')
const LEGACY_DAY_MAP = {
  monday: 'MON', tuesday: 'TUE', wednesday: 'WED',
  thursday: 'THU', friday: 'FRI', saturday: 'SAT', sunday: 'SUN',
};
const normalizeWorkWeek = (days) =>
  [...new Set(days.map((d) => LEGACY_DAY_MAP[d.toLowerCase()] ?? d.toUpperCase().slice(0, 3)))];

// ─── Get company settings ──────────────────────────────────────────────────────
const getCompany = async (companyId) => {
  const company = await Company.findById(companyId).lean();
  if (!company) throw new AppError('Company not found.', 404);
  return company;
};

// ─── Get subscription / plan details (for the tenant's own admins) ─────────────
const getSubscription = async (companyId) => {
  const company = await Company.findById(companyId).select('isActive name').lean();
  if (!company) throw new AppError('Company not found.', 404);

  const sub = await TenantSubscription.findOne({ company_id: companyId })
    .populate('plan_id')
    .lean();

  const activeEmployees = await Employee.countDocuments({ company_id: companyId, status: 'active' });
  const plan = sub?.plan_id || null;

  return {
    status:             computeTenantStatus(company, sub),
    subscriptionStatus: sub?.status ?? null,
    startDate:          sub?.startDate ?? null,
    expiryDate:         sub?.expiryDate ?? null,
    daysUntilExpiry:    daysUntilExpiry(sub),
    plan: plan
      ? {
          name:         plan.name,
          description:  plan.description,
          price:        plan.price,
          currency:     plan.currency,
          billingCycle: plan.billingCycle,
          maxEmployees: plan.maxEmployees,
          features:     plan.features || [],
        }
      : null,
    usage: {
      activeEmployees,
      maxEmployees: plan?.maxEmployees ?? null, // null = unlimited
    },
  };
};

// ─── Update company settings ───────────────────────────────────────────────────
const updateCompany = async (companyId, body) => {
  const allowed = ['name', 'website', 'phone', 'llpin', 'gstin', 'address', 'city', 'state', 'pincode', 'settings'];
  const update  = {};

  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  // Handle nested settings patch without overwriting other settings fields
  if (body.settings) {
    // Normalize workWeek to uppercase 3-letter codes before saving
    if (Array.isArray(body.settings.workWeek)) {
      body.settings.workWeek = normalizeWorkWeek(body.settings.workWeek);
    }
    const flat = {};
    for (const [k, v] of Object.entries(body.settings)) {
      flat[`settings.${k}`] = v;
    }
    // Handle geofencing nested fields
    if (body.settings.geofencing) {
      delete flat['settings.geofencing'];
      for (const [k, v] of Object.entries(body.settings.geofencing)) {
        flat[`settings.geofencing.${k}`] = v;
      }
    }
    // Handle payslip nested fields individually so a partial patch never wipes
    // sibling fields (e.g. signatureImage, managed by the upload endpoint).
    if (body.settings.payslip) {
      delete flat['settings.payslip'];
      for (const [k, v] of Object.entries(body.settings.payslip)) {
        flat[`settings.payslip.${k}`] = v;
      }
    }
    delete update.settings;
    Object.assign(update, flat);
  }

  const company = await Company.findByIdAndUpdate(
    companyId,
    { $set: update },
    { new: true, runValidators: true }
  ).lean();

  if (!company) throw new AppError('Company not found.', 404);
  return company;
};

// ─── Upload logo ───────────────────────────────────────────────────────────────
const uploadLogo = async (companyId, file) => {
  if (!file) throw new AppError('No file provided.', 400);

  const ext      = path.extname(file.originalname).toLowerCase();
  const allowed  = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];
  if (!allowed.includes(ext)) throw new AppError('Only jpg, png, webp, svg allowed.', 400);

  // Remove old logo file if it exists locally
  const existing = await Company.findById(companyId).select('logo').lean();
  if (existing?.logo && existing.logo.startsWith('/uploads/')) {
    const oldPath = path.join(process.cwd(), 'public', existing.logo);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const logoUrl = `/uploads/logos/${file.filename}`;
  const company = await Company.findByIdAndUpdate(
    companyId,
    { $set: { logo: logoUrl } },
    { new: true }
  ).lean();

  return company;
};

// ─── Remove logo ───────────────────────────────────────────────────────────────
const removeLogo = async (companyId) => {
  const existing = await Company.findById(companyId).select('logo').lean();
  if (existing?.logo && existing.logo.startsWith('/uploads/')) {
    const oldPath = path.join(process.cwd(), 'public', existing.logo);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  await Company.findByIdAndUpdate(companyId, { $set: { logo: null } });
};

// ─── Upload authorised-signatory signature ───────────────────────────────────
const uploadSignature = async (companyId, file) => {
  if (!file) throw new AppError('No file provided.', 400);

  const ext     = path.extname(file.originalname).toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];
  if (!allowed.includes(ext)) throw new AppError('Only jpg, png, webp, svg allowed.', 400);

  // Remove old signature file if it exists locally
  const existing = await Company.findById(companyId).select('settings.payslip.signatureImage').lean();
  const oldRef = existing?.settings?.payslip?.signatureImage;
  if (oldRef && oldRef.startsWith('/uploads/')) {
    const oldPath = path.join(process.cwd(), 'public', oldRef);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const url = `/uploads/signatures/${file.filename}`;
  const company = await Company.findByIdAndUpdate(
    companyId,
    { $set: { 'settings.payslip.signatureImage': url } },
    { new: true }
  ).lean();

  return company;
};

// ─── Remove signature ────────────────────────────────────────────────────────
const removeSignature = async (companyId) => {
  const existing = await Company.findById(companyId).select('settings.payslip.signatureImage').lean();
  const oldRef = existing?.settings?.payslip?.signatureImage;
  if (oldRef && oldRef.startsWith('/uploads/')) {
    const oldPath = path.join(process.cwd(), 'public', oldRef);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  await Company.findByIdAndUpdate(companyId, { $set: { 'settings.payslip.signatureImage': null } });
};

// ─── Upload payslip logo (overrides company logo on the slip) ────────────────
const uploadPayslipLogo = async (companyId, file) => {
  if (!file) throw new AppError('No file provided.', 400);

  const ext     = path.extname(file.originalname).toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];
  if (!allowed.includes(ext)) throw new AppError('Only jpg, png, webp, svg allowed.', 400);

  const existing = await Company.findById(companyId).select('settings.payslip.logo').lean();
  const oldRef = existing?.settings?.payslip?.logo;
  if (oldRef && oldRef.startsWith('/uploads/')) {
    const oldPath = path.join(process.cwd(), 'public', oldRef);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const url = `/uploads/payslip-logos/${file.filename}`;
  const company = await Company.findByIdAndUpdate(
    companyId,
    { $set: { 'settings.payslip.logo': url } },
    { new: true }
  ).lean();

  return company;
};

// ─── Remove payslip logo ─────────────────────────────────────────────────────
const removePayslipLogo = async (companyId) => {
  const existing = await Company.findById(companyId).select('settings.payslip.logo').lean();
  const oldRef = existing?.settings?.payslip?.logo;
  if (oldRef && oldRef.startsWith('/uploads/')) {
    const oldPath = path.join(process.cwd(), 'public', oldRef);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  await Company.findByIdAndUpdate(companyId, { $set: { 'settings.payslip.logo': null } });
};

module.exports = { getCompany, getSubscription, updateCompany, uploadLogo, removeLogo, uploadSignature, removeSignature, uploadPayslipLogo, removePayslipLogo };
