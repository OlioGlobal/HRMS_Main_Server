const Role = require('../../../models/Role');
const UserRole = require('../../../models/UserRole');
const Location = require('../../../models/Location');

/**
 * Current hour (0-23) in the given IANA timezone.
 * Falls back to the UTC hour if the timezone string is invalid.
 */
const getLocalHour = (tz) => {
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      hour12: false,
    }).format(new Date());
    const h = parseInt(hourStr, 10) % 24; // en-US may return "24" at midnight
    return Number.isNaN(h) ? new Date().getUTCHours() : h;
  } catch {
    return new Date().getUTCHours();
  }
};

/**
 * Parse the hour out of a "HH:mm" run-time string. Returns null if unset/invalid.
 */
const runTimeHour = (runTime) => {
  if (typeof runTime !== 'string' || !runTime.includes(':')) return null;
  const h = parseInt(runTime.split(':')[0], 10);
  return Number.isNaN(h) ? null : h;
};

/**
 * Build a { locationId -> timezone } map for a company's active locations,
 * defaulting each to the company timezone when the location has none.
 */
const buildLocationTZMap = async (companyId, companyTZ) => {
  const locations = await Location.find({ company_id: companyId, isActive: true })
    .select('_id timezone')
    .lean();
  const map = new Map();
  for (const loc of locations) {
    map.set(loc._id.toString(), loc.timezone || companyTZ);
  }
  return map;
};

/**
 * Resolve an employee's timezone: their location's timezone, else the company default.
 */
const resolveEmployeeTZ = (emp, locTZMap, companyTZ) => {
  if (emp?.location_id && locTZMap.has(emp.location_id.toString())) {
    return locTZMap.get(emp.location_id.toString());
  }
  return companyTZ;
};

/**
 * Find all HR user IDs for a company (role level <= 3: Super Admin, HR Manager, HR Staff)
 */
const findHRUsers = async (companyId) => {
  const hrRoles = await Role.find({ company_id: companyId, level: { $lte: 3 } })
    .select('_id')
    .lean();

  if (!hrRoles.length) return [];

  const userRoles = await UserRole.find({
    role_id: { $in: hrRoles.map((r) => r._id) },
    company_id: companyId,
  })
    .select('user_id')
    .lean();

  const userIds = [...new Set(userRoles.map((ur) => ur.user_id.toString()))];
  return userIds;
};

/**
 * Build a full name from firstName + lastName
 */
const fullName = (doc) =>
  [doc?.firstName, doc?.lastName].filter(Boolean).join(' ') || 'Unknown';

module.exports = {
  findHRUsers,
  fullName,
  getLocalHour,
  runTimeHour,
  buildLocationTZMap,
  resolveEmployeeTZ,
};
