const SalaryComponent = require('../models/SalaryComponent');

/**
 * Seed default salary components for a newly created company.
 * Call this from the signup flow after company creation.
 * Idempotent — skips if components already exist for the company.
 */
const seedDefaultSalaryComponents = async (companyId) => {
  const existing = await SalaryComponent.countDocuments({ company_id: companyId });
  if (existing > 0) return;

  // Create Basic Salary first (other components reference it)
  const basic = await SalaryComponent.create({
    company_id:   companyId,
    name:         'Basic Salary',
    type:         'earning',
    calcType:     'fixed',
    defaultValue: 0,
    taxable:      true,
    statutory:    false,
    order:        1,
  });

  const components = [
    {
      name:         'HRA',
      type:         'earning',
      calcType:     'percentage',
      percentOf:    basic._id,
      defaultValue: 50,
      taxable:      true,
      statutory:    false,
      order:        2,
    },
    {
      name:         'Travel Allowance',
      type:         'earning',
      calcType:     'fixed',
      defaultValue: 0,
      taxable:      true,
      statutory:    false,
      order:        3,
    },
    {
      name:         'Medical Allowance',
      type:         'earning',
      calcType:     'fixed',
      defaultValue: 0,
      taxable:      false,
      statutory:    false,
      order:        4,
    },
    {
      name:         'PF Employee',
      type:         'deduction',
      calcType:     'percentage',
      percentOf:    basic._id,
      defaultValue: 12,
      taxable:      false,
      statutory:    true,
      order:        5,
    },
    {
      name:         'PF Employer',
      type:         'deduction',
      calcType:     'percentage',
      percentOf:    basic._id,
      defaultValue: 12,
      taxable:      false,
      statutory:    true,
      order:        6,
    },
    {
      name:         'Professional Tax',
      type:         'deduction',
      calcType:     'fixed',
      defaultValue: 200,
      taxable:      false,
      statutory:    true,
      order:        7,
    },
  ];

  await SalaryComponent.insertMany(
    components.map((c) => ({ ...c, company_id: companyId }))
  );
};

module.exports = { seedDefaultSalaryComponents };
