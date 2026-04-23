const HiringPipeline = require('../models/HiringPipeline');
const LetterTemplate = require('../models/LetterTemplate');

const seedDefaultHiringPipeline = async (companyId) => {
  const exists = await HiringPipeline.findOne({ company_id: companyId, isDefault: true });
  if (exists) return;

  const [interimTpl, appointmentTpl] = await Promise.all([
    LetterTemplate.findOne({ company_id: companyId, letterType: 'interim_offer' }).select('_id').lean(),
    LetterTemplate.findOne({ company_id: companyId, letterType: 'appointment'   }).select('_id').lean(),
  ]);

  await HiringPipeline.create({
    company_id: companyId,
    name:       'Standard Hiring',
    isDefault:  true,
    steps: [
      {
        order:       0,
        name:        'Applied',
        letterType:  'interim_offer',
        template_id: interimTpl?._id ?? null,
        // Only rough salary + basic info needed for interim offer
        requiredFields:     ['roughGross'],
        setStatusTo:        'pre_join',
        requiresAcceptance: false,
      },
      {
        order:       1,
        name:        'Offered',
        letterType:  'appointment',
        template_id: appointmentTpl?._id ?? null,
        // Before appointment letter: need proper job details + salary + leave template
        requiredFields:     [
          'designation_id',
          'department_id',
          'location_id',
          'joiningDate',
          'workPolicy_id',
          'reportingManager_id',
          'leaveTemplate_id',
          'salary',           // EmployeeSalary record must exist
        ],
        setStatusTo:        'offered',
        requiresAcceptance: true,
      },
      {
        order:       2,
        name:        'Documents',
        letterType:  'none',
        template_id: null,
        // Candidate submits docs on pre-boarding portal — HR verifies
        requiredFields:     [],
        setStatusTo:        'accepted',
        requiresAcceptance: false,
      },
      {
        order:       3,
        name:        'Ready to Join',
        letterType:  'none',
        template_id: null,
        // Employee fills own details on pre-boarding portal
        requiredFields:     [],
        setStatusTo:        'accepted',
        requiresAcceptance: false,
      },
    ],
  });
};

module.exports = { seedDefaultHiringPipeline };
