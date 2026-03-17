/**
 * Document Expiry Cron Job
 *
 * Runs daily at midnight UTC.
 * - Marks documents with past expiryDate as 'expired'
 */

const EmployeeDocument = require('../../models/EmployeeDocument');

const run = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await EmployeeDocument.updateMany(
    {
      expiryDate: { $lt: today },
      status:     { $nin: ['expired'] },
    },
    { $set: { status: 'expired' } }
  );

  if (result.modifiedCount > 0) {
    console.log(`[DocumentExpiry] Marked ${result.modifiedCount} document(s) as expired.`);
  }
};

module.exports = { run };
