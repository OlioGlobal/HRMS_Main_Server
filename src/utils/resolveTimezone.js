const Location = require('../models/Location');
const Company  = require('../models/Company');

/**
 * Resolve an employee's effective IANA timezone.
 * Precedence: employee's Location.timezone → Company.settings.timezone → 'UTC'.
 *
 * (WorkPolicy has no timezone field — shift times there are interpreted in the
 * employee's location timezone.)
 *
 * @param {Object} employee  lean employee doc (needs location_id, company_id)
 * @param {ObjectId|string} [companyId]  optional override for company lookup
 * @returns {Promise<string>} IANA tz, e.g. 'Asia/Kolkata'
 */
const resolveEmployeeTimezone = async (employee, companyId) => {
  const locId = employee?.location_id?._id || employee?.location_id;
  if (locId) {
    const loc = await Location.findById(locId).select('timezone').lean();
    if (loc?.timezone) return loc.timezone;
  }

  const cid = companyId || employee?.company_id;
  if (cid) {
    const company = await Company.findById(cid).select('settings.timezone').lean();
    if (company?.settings?.timezone) return company.settings.timezone;
  }

  return 'UTC';
};

module.exports = { resolveEmployeeTimezone };
