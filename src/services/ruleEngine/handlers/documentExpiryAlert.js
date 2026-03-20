const { format, startOfDay, endOfDay, addDays, differenceInDays } = require('date-fns');
const EmployeeDocument = require('../../../models/EmployeeDocument');
const Employee = require('../../../models/Employee');
const { findHRUsers, fullName } = require('./helpers');

const slug = 'document-expiry-alert';

/**
 * Find documents expiring within `config.daysBefore` days.
 * Recipients: employee (per doc) + HR (one summary).
 */
const findRecipients = async (companyId, contextData, config) => {
  try {
    const daysBefore = config?.daysBefore ?? 30;
    const today = startOfDay(new Date());
    const rangeEnd = endOfDay(addDays(today, daysBefore));

    const docs = await EmployeeDocument.find({
      company_id: companyId,
      expiryDate: { $gte: today, $lte: rangeEnd },
      status: { $ne: 'expired' },
    })
      .populate('employee_id', '_id user_id firstName lastName employeeId')
      .populate('document_type_id', '_id name')
      .lean();

    if (!docs.length) return [];

    const hrUserIds = await findHRUsers(companyId);
    const recipients = [];

    // Employee notifications — one per expiring document
    for (const doc of docs) {
      const emp = doc.employee_id;
      if (!emp) continue;

      const daysLeft = differenceInDays(new Date(doc.expiryDate), today);
      const variables = {
        employeeName: fullName(emp),
        employeeId: emp.employeeId,
        documentName: doc.document_type_id?.name || doc.name || 'Document',
        expiryDate: format(new Date(doc.expiryDate), 'dd MMM yyyy'),
        daysUntilExpiry: daysLeft,
      };

      if (emp.user_id) {
        recipients.push({
          userId: emp.user_id.toString(),
          recipientType: 'employee',
          variables,
          actionUrl: `/dashboard/employees/${emp._id}`,
        });
      }
    }

    // HR gets ONE summary notification (not per document)
    if (hrUserIds.length > 0) {
      for (const hrUserId of hrUserIds) {
        recipients.push({
          userId: hrUserId,
          recipientType: 'hr',
          variables: {
            employeeName: `${docs.length} document(s)`,
            documentName: `${docs.length} document(s) expiring soon`,
            expiryDate: format(rangeEnd, 'dd MMM yyyy'),
            daysUntilExpiry: daysBefore,
          },
          actionUrl: '/dashboard/documents/expiring',
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
