const Company  = require('../../models/Company');
const AppError = require('../../utils/AppError');
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

module.exports = { getCompany, updateCompany, uploadLogo, removeLogo };
