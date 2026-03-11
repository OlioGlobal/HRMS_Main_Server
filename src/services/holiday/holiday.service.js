const PublicHoliday          = require('../../models/PublicHoliday');
const EmployeeOptionalHoliday = require('../../models/EmployeeOptionalHoliday');
const Company                = require('../../models/Company');
const Employee               = require('../../models/Employee');
const AppError               = require('../../utils/AppError');

// ─── List holidays ──────────────────────────────────────────────────────────
const listHolidays = async (companyId, { year, location, type, isOptional } = {}) => {
  const filter = { company_id: companyId, isActive: true };
  if (year)       filter.year = Number(year);
  if (location)   filter.location_id = location;
  if (type)       filter.type = type;
  if (isOptional !== undefined) filter.isOptional = isOptional === 'true' || isOptional === true;

  return PublicHoliday.find(filter)
    .populate('location_id', 'name')
    .sort({ date: 1 })
    .lean();
};

// ─── Get one ────────────────────────────────────────────────────────────────
const getHoliday = async (companyId, id) => {
  const doc = await PublicHoliday.findOne({ _id: id, company_id: companyId })
    .populate('location_id', 'name')
    .lean();
  if (!doc) throw new AppError('Holiday not found.', 404);
  return doc;
};

// ─── Create ─────────────────────────────────────────────────────────────────
const createHoliday = async (companyId, body) => {
  const date = new Date(body.date);
  const doc = await PublicHoliday.create({
    ...body,
    company_id: companyId,
    year: date.getFullYear(),
  });
  return doc.toObject();
};

// ─── Bulk create (for import) ───────────────────────────────────────────────
const bulkCreateHolidays = async (companyId, holidays) => {
  const docs = holidays.map((h) => {
    const date = new Date(h.date);
    return {
      ...h,
      company_id: companyId,
      year: date.getFullYear(),
      source: h.source || 'imported',
    };
  });

  // Use ordered:false so dupes are skipped
  const result = await PublicHoliday.insertMany(docs, { ordered: false }).catch((err) => {
    if (err.code === 11000) return err.insertedDocs || [];
    throw err;
  });
  return Array.isArray(result) ? result : [result];
};

// ─── Update ─────────────────────────────────────────────────────────────────
const updateHoliday = async (companyId, id, body) => {
  const doc = await PublicHoliday.findOne({ _id: id, company_id: companyId });
  if (!doc) throw new AppError('Holiday not found.', 404);

  if (body.date) body.year = new Date(body.date).getFullYear();
  Object.assign(doc, body);
  await doc.save();
  return doc.toObject();
};

// ─── Delete ─────────────────────────────────────────────────────────────────
const deleteHoliday = async (companyId, id) => {
  const doc = await PublicHoliday.findOne({ _id: id, company_id: companyId });
  if (!doc) throw new AppError('Holiday not found.', 404);

  // Remove any optional holiday picks for this holiday
  await EmployeeOptionalHoliday.deleteMany({ holiday_id: id });
  await PublicHoliday.deleteOne({ _id: id });
};

// ─── Import from Nager.Date API ─────────────────────────────────────────────
const fetchNagerHolidays = async (countryCode, year) => {
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`;
  const response = await fetch(url);
  if (!response.ok) throw new AppError(`Failed to fetch holidays for ${countryCode}/${year}.`, 502);

  const data = await response.json();
  return data.map((h) => ({
    name: h.localName || h.name,
    date: h.date,
    type: h.global ? 'national' : 'regional',
    isOptional: false,
    source: 'imported',
    description: h.name !== h.localName ? h.name : null,
  }));
};

// ─── Optional holiday pick ──────────────────────────────────────────────────
const pickOptionalHoliday = async (companyId, employeeId, holidayId) => {
  const employee = await Employee.findOne({ _id: employeeId, company_id: companyId }).lean();
  if (!employee) throw new AppError('Employee not found.', 404);

  const holiday = await PublicHoliday.findOne({ _id: holidayId, company_id: companyId, isOptional: true, isActive: true }).lean();
  if (!holiday) throw new AppError('Optional holiday not found.', 404);

  // Check limit
  const company = await Company.findById(companyId).lean();
  const limit = company.settings?.leave?.optionalHolidayCount ?? 2;
  const picked = await EmployeeOptionalHoliday.countDocuments({
    employee_id: employeeId,
    year: holiday.year,
  });
  if (picked >= limit) {
    throw new AppError(`You can only pick ${limit} optional holidays per year.`, 400);
  }

  const doc = await EmployeeOptionalHoliday.create({
    company_id: companyId,
    employee_id: employeeId,
    holiday_id: holidayId,
    year: holiday.year,
  });
  return doc.toObject();
};

// ─── Optional holiday unpick ────────────────────────────────────────────────
const unpickOptionalHoliday = async (companyId, employeeId, holidayId) => {
  const result = await EmployeeOptionalHoliday.deleteOne({
    company_id: companyId,
    employee_id: employeeId,
    holiday_id: holidayId,
  });
  if (result.deletedCount === 0) throw new AppError('Optional holiday pick not found.', 404);
};

// ─── Get employee's picked optional holidays ────────────────────────────────
const getEmployeeOptionalHolidays = async (companyId, employeeId, year) => {
  const filter = { company_id: companyId, employee_id: employeeId };
  if (year) filter.year = Number(year);

  return EmployeeOptionalHoliday.find(filter)
    .populate('holiday_id', 'name date type')
    .lean();
};

module.exports = {
  listHolidays,
  getHoliday,
  createHoliday,
  bulkCreateHolidays,
  updateHoliday,
  deleteHoliday,
  fetchNagerHolidays,
  pickOptionalHoliday,
  unpickOptionalHoliday,
  getEmployeeOptionalHolidays,
};
