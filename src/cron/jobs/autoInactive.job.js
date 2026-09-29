/**
 * Auto-Inactive Cron Job
 *
 * Runs daily. For every company, finds employees who are still active/on-notice
 * and whose lastWorkingDay was at least ONE MONTH ago (in the company's
 * timezone) — a grace period for final settlement/exit formalities — and:
 *   - sets the employee status → 'inactive'
 *   - revokes portal access for the linked user (status 'inactive' + clears
 *     refresh tokens, so the session can't be refreshed once the access token
 *     expires).
 *
 * 'inactive' is reversible — HR can reactivate. The explicit offboarding-complete
 * flow (status 'terminated') stays separate and is unaffected.
 */

const Employee = require('../../models/Employee');
const User     = require('../../models/User');
const Company  = require('../../models/Company');
const { dayKey, parseCivil, todayCivil } = require('../../utils/civilDate');
const { log }  = require('../runner');

// One calendar month after a civil last-working-day (noon-UTC, timezone-stable).
const oneMonthAfter = (lastWorkingDay) => {
  const c = parseCivil(lastWorkingDay);
  const d = new Date(c);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
};

const run = async () => {
  let deactivated = 0;

  const companies = await Company.find().select('_id name settings.timezone').lean();

  for (const company of companies) {
    const tz = company.settings?.timezone || 'UTC';
    const todayKey = dayKey(todayCivil(tz));

    // Candidates: employed people with a last-working-day set.
    const candidates = await Employee.find({
      company_id: company._id,
      status: { $in: ['active', 'notice'] },
      lastWorkingDay: { $ne: null },
    }).select('_id user_id lastWorkingDay firstName lastName employeeId').lean();

    for (const emp of candidates) {
      // Deactivate only once one full month has passed since the LWD (their local
      // day). The cutoff = LWD + 1 month; skip until today is strictly past it.
      const cutoffKey = dayKey(oneMonthAfter(emp.lastWorkingDay));
      if (cutoffKey >= todayKey) continue;

      await Employee.updateOne(
        { _id: emp._id },
        { $set: { status: 'inactive', accessRevoked: true } },
      );

      // Revoke portal login for the linked user account.
      if (emp.user_id) {
        await User.updateOne(
          { _id: emp.user_id },
          { $set: { status: 'inactive', refreshTokens: [] } },
        );
      }

      deactivated++;
      log('INFO', `auto-inactive | ${company.name || company._id} | ${emp.firstName} ${emp.lastName} (${emp.employeeId || '—'}) → inactive (LWD ${dayKey(emp.lastWorkingDay)}, +1mo grace)`);
    }
  }

  return `deactivated=${deactivated}`;
};

module.exports = { run };
