const Location   = require('../../models/Location');
const WorkPolicy = require('../../models/WorkPolicy');
const Employee   = require('../../models/Employee');
const AppError   = require('../../utils/AppError');

// ─── List all locations for a company ─────────────────────────────────────────
const listLocations = async (companyId) => {
  return Location.find({ company_id: companyId, isActive: true })
    .sort({ isHQ: -1, name: 1 })
    .lean();
};

// ─── Get single location ───────────────────────────────────────────────────────
const getLocation = async (companyId, id) => {
  const loc = await Location.findOne({ _id: id, company_id: companyId }).lean();
  if (!loc) throw new AppError('Location not found.', 404);
  return loc;
};

// ─── Create location ───────────────────────────────────────────────────────────
const createLocation = async (companyId, body) => {
  // If this is being set as HQ, unset any existing HQ
  if (body.isHQ) {
    await Location.updateMany({ company_id: companyId, isHQ: true }, { $set: { isHQ: false } });
  }

  const location = await Location.create({ ...body, company_id: companyId });
  return location.toObject();
};

// ─── Update location ───────────────────────────────────────────────────────────
const updateLocation = async (companyId, id, body) => {
  const loc = await Location.findOne({ _id: id, company_id: companyId });
  if (!loc) throw new AppError('Location not found.', 404);

  // If promoting to HQ, demote existing HQ
  if (body.isHQ && !loc.isHQ) {
    await Location.updateMany(
      { company_id: companyId, isHQ: true, _id: { $ne: id } },
      { $set: { isHQ: false } }
    );
  }

  // Handle nested geofence patch
  if (body.geofence) {
    for (const [k, v] of Object.entries(body.geofence)) {
      loc.geofence[k] = v;
    }
    delete body.geofence;
  }

  Object.assign(loc, body);
  await loc.save();
  return loc.toObject();
};

// ─── Delete location ───────────────────────────────────────────────────────────
const deleteLocation = async (companyId, id) => {
  const loc = await Location.findOne({ _id: id, company_id: companyId });
  if (!loc) throw new AppError('Location not found.', 404);

  // Block deletion if work policies are linked
  const policyCount = await WorkPolicy.countDocuments({ location_id: id, isActive: true });
  if (policyCount > 0) {
    throw new AppError(
      `Cannot delete this location — ${policyCount} work polic${policyCount > 1 ? 'ies are' : 'y is'} linked to it. Remove the policies first.`,
      400
    );
  }

  // Block deletion if employees are assigned
  const empCount = await Employee.countDocuments({ location_id: id, company_id: companyId, isActive: true });
  if (empCount > 0) {
    throw new AppError(
      `Cannot delete this location — ${empCount} employee${empCount > 1 ? 's are' : ' is'} assigned to it. Reassign them first.`,
      400
    );
  }

  // Soft delete
  loc.isActive = false;
  await loc.save();
};

module.exports = { listLocations, getLocation, createLocation, updateLocation, deleteLocation };
