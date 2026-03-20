const { format, differenceInDays, startOfDay, endOfDay, addDays } = require('date-fns');
const AppraisalCycle = require('../../../models/AppraisalCycle');
const AppraisalRecord = require('../../../models/AppraisalRecord');
const Employee = require('../../../models/Employee');
const { findHRUsers, fullName } = require('./helpers');

const slug = 'appraisal-reminder';

/**
 * Find appraisal records with approaching deadlines.
 * Checks selfRatingDeadline and managerRatingDeadline on active cycles.
 * Recipients: employee (for self-rating), manager (for manager-rating), HR.
 */
const findRecipients = async (companyId, contextData, config) => {
  try {
    const daysBefore = config?.daysBefore ?? 3;
    const today = startOfDay(new Date());
    const rangeEnd = endOfDay(addDays(today, daysBefore));

    // Find active cycles with deadlines within the range (today → today + daysBefore)
    // This way if server was down yesterday, today's run still catches it
    const cycles = await AppraisalCycle.find({
      company_id: companyId,
      status: 'active',
      $or: [
        { selfRatingDeadline: { $gte: today, $lte: rangeEnd } },
        { managerRatingDeadline: { $gte: today, $lte: rangeEnd } },
      ],
    }).lean();

    if (!cycles.length) return [];

    const hrUserIds = await findHRUsers(companyId);
    const recipients = [];

    for (const cycle of cycles) {
      const selfDeadlineApproaching =
        cycle.selfRatingDeadline >= today && cycle.selfRatingDeadline <= rangeEnd;
      const managerDeadlineApproaching =
        cycle.managerRatingDeadline >= today && cycle.managerRatingDeadline <= rangeEnd;

      // Fetch appraisal records for this cycle
      const query = { company_id: companyId, cycle_id: cycle._id };

      if (selfDeadlineApproaching && !managerDeadlineApproaching) {
        // Only employees who haven't self-submitted yet
        query.status = { $in: ['not_started', 'goals_set', 'goals_approved'] };
      } else if (managerDeadlineApproaching && !selfDeadlineApproaching) {
        // Only managers who haven't submitted yet
        query.status = 'self_submitted';
      }
      // If both approaching, fetch all incomplete records

      const records = await AppraisalRecord.find(query)
        .select('employee_id manager_id status')
        .lean();

      if (!records.length) continue;

      // Batch fetch employees
      const allEmpIds = [
        ...new Set([
          ...records.map((r) => r.employee_id.toString()),
          ...records.filter((r) => r.manager_id).map((r) => r.manager_id.toString()),
        ]),
      ];

      const employees = await Employee.find({ _id: { $in: allEmpIds } })
        .select('_id user_id firstName lastName employeeId')
        .lean();

      const empMap = new Map(employees.map((e) => [e._id.toString(), e]));

      for (const record of records) {
        const emp = empMap.get(record.employee_id.toString());
        if (!emp) continue;

        const selfDaysLeft = differenceInDays(new Date(cycle.selfRatingDeadline), today);
        const mgrDaysLeft = differenceInDays(new Date(cycle.managerRatingDeadline), today);

        const variables = {
          employeeName: fullName(emp),
          cycleName: cycle.name,
          deadline: null,
          daysLeft: null,
        };

        const actionUrl = '/dashboard/appraisal/my';

        // Self-rating reminder
        if (
          selfDeadlineApproaching &&
          ['not_started', 'goals_set', 'goals_approved'].includes(record.status)
        ) {
          if (emp.user_id) {
            recipients.push({
              userId: emp.user_id.toString(),
              recipientType: 'employee',
              variables: { ...variables, daysLeft: selfDaysLeft, deadline: format(new Date(cycle.selfRatingDeadline), 'dd MMM yyyy') },
              actionUrl,
            });
          }
        }

        // Manager-rating reminder
        if (managerDeadlineApproaching && record.status === 'self_submitted') {
          const manager = record.manager_id
            ? empMap.get(record.manager_id.toString())
            : null;

          if (manager?.user_id) {
            recipients.push({
              userId: manager.user_id.toString(),
              recipientType: 'manager',
              actionUrl: '/dashboard/appraisal/team',
              variables: { ...variables, daysLeft: mgrDaysLeft, deadline: format(new Date(cycle.managerRatingDeadline), 'dd MMM yyyy') },
              actionUrl,
            });
          }
        }

      }

      // HR gets ONE summary notification per cycle (not per employee)
      const pendingCount = records.filter(r =>
        ['not_started', 'goals_set', 'goals_approved', 'self_submitted'].includes(r.status)
      ).length;

      if (pendingCount > 0) {
        for (const hrUserId of hrUserIds) {
          recipients.push({
            userId: hrUserId,
            recipientType: 'hr',
            variables: {
              cycleName: cycle.name,
              daysLeft: differenceInDays(new Date(cycle.selfRatingDeadline), today),
              deadline: format(new Date(cycle.selfRatingDeadline), 'dd MMM yyyy'),
              pendingCount,
              employeeName: `${pendingCount} employee(s)`,
            },
            actionUrl: '/dashboard/appraisal/cycles',
          });
        }
      }
    }

    return recipients;
  } catch (err) {
    console.error(`[RuleEngine] ${slug} handler error:`, err.message);
    return [];
  }
};

module.exports = { slug, findRecipients };
