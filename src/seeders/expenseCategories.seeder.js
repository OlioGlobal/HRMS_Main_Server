const ExpenseCategory = require('../models/ExpenseCategory');

const DEFAULT_CATEGORIES = [
  {
    name:            'Travel',
    description:     'Travel-related expenses including cab, flight, train, and fuel.',
    perClaimLimit:   5000,
    monthlyLimit:    15000,
    requiresReceipt: true,
  },
  {
    name:            'Food & Meals',
    description:     'Food and meal expenses during work or travel.',
    perClaimLimit:   1000,
    monthlyLimit:    5000,
    requiresReceipt: true,
  },
  {
    name:            'Accommodation',
    description:     'Hotel or stay expenses during work travel.',
    perClaimLimit:   10000,
    monthlyLimit:    20000,
    requiresReceipt: true,
  },
  {
    name:            'Training & Education',
    description:     'Courses, certifications, and training material expenses.',
    perClaimLimit:   50000,
    monthlyLimit:    50000,
    requiresReceipt: true,
  },
  {
    name:            'Office Supplies',
    description:     'Stationery, peripherals, and other office supply purchases.',
    perClaimLimit:   5000,
    monthlyLimit:    10000,
    requiresReceipt: true,
  },
  {
    name:            'Other',
    description:     'Miscellaneous expenses that do not fit into other categories.',
    perClaimLimit:   null,
    monthlyLimit:    null,
    requiresReceipt: false,
  },
];

/**
 * Seed default expense categories for a company (called during signup).
 * Idempotent — duplicates silently skipped via unique index on { company_id, name }.
 */
const seedDefaultExpenseCategories = async (companyId) => {
  const existingCount = await ExpenseCategory.countDocuments({ company_id: companyId });
  if (existingCount > 0) return;

  const docs = DEFAULT_CATEGORIES.map((cat) => ({
    company_id: companyId,
    isActive:   true,
    ...cat,
  }));

  try {
    const result = await ExpenseCategory.insertMany(docs, { ordered: false, rawResult: true });
    const inserted = result.insertedCount ?? 0;
    if (inserted > 0) {
      console.log(`[ExpenseCategories] ${inserted} default categories seeded for company ${companyId}.`);
    }
  } catch (err) {
    if (err.code === 11000 || err.name === 'MongoBulkWriteError') {
      const inserted = err.insertedDocs?.length ?? 0;
      if (inserted > 0) {
        console.log(`[ExpenseCategories] ${inserted} default categories seeded for company ${companyId} (some duplicates skipped).`);
      }
    } else {
      throw err;
    }
  }
};

module.exports = { seedDefaultExpenseCategories, DEFAULT_CATEGORIES };
