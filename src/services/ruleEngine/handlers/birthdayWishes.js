const Employee = require('../../../models/Employee');
const User = require('../../../models/User');
const Department = require('../../../models/Department');
const { fullName } = require('./helpers');

const slug = 'birthday-wishes';

/**
 * Find employees whose birthday is today.
 * Recipients: employee (greeting), manager (reminder).
 */
const findRecipients = async (companyId, contextData, config) => {
  try {
    const today = new Date();
    const month = today.getMonth() + 1; // 1-based
    const day = today.getDate();

    const employees = await Employee.find({
      company_id: companyId,
      status: 'active',
      dateOfBirth: { $exists: true, $ne: null },
      $expr: {
        $and: [
          { $eq: [{ $month: '$dateOfBirth' }, month] },
          { $eq: [{ $dayOfMonth: '$dateOfBirth' }, day] },
        ],
      },
    })
      .populate('user_id', '_id email firstName lastName')
      .populate('reportingManager_id', '_id user_id firstName lastName')
      .populate('department_id', '_id name')
      .lean();

    if (!employees.length) return [];

    // Get ALL active employees with portal access (for notifying everyone)
    const allEmployees = await Employee.find({
      company_id: companyId,
      status: 'active',
      user_id: { $ne: null },
    }).select('_id user_id firstName lastName').lean();

    const recipients = [];
    const addedUserIds = new Set();

    for (const emp of employees) {
      const employeeName = fullName(emp);
      const department = emp.department_id?.name || 'N/A';
      const actionUrl = `/dashboard/employees/${emp._id}`;

      const variables = {
        employeeName,
        employeeId: emp.employeeId,
        department,
      };

      // Notify ALL employees about this birthday
      for (const other of allEmployees) {
        if (!other.user_id) continue;
        const uid = other.user_id.toString();
        // Prevent duplicate if same person has birthday and is also in allEmployees
        const dedupKey = `${uid}-${emp._id}`;
        if (addedUserIds.has(dedupKey)) continue;
        addedUserIds.add(dedupKey);

        const isBirthdayPerson = uid === emp.user_id?._id?.toString();
        recipients.push({
          userId: uid,
          recipientType: isBirthdayPerson ? 'employee' : 'manager',
          variables: {
            ...variables,
            recipientName: `${other.firstName} ${other.lastName}`,
            isBirthdayPerson,
          },
          actionUrl,
        });
      }
    }

    return recipients;
  } catch (err) {
    console.error(`[RuleEngine] ${slug} handler error:`, err.message);
    return [];
  }
};

module.exports = { slug, findRecipients };
