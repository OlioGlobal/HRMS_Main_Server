const Permission = require('../models/Permission');

// ─── All system-wide permissions ───────────────────────────────────────────────
const PERMISSIONS = [
  // Dashboard
  { module: 'dashboard', action: 'view', description: 'View dashboard overview' },

  // Company
  { module: 'company', action: 'view',   description: 'View company profile and settings' },
  { module: 'company', action: 'update', description: 'Update company profile and settings' },

  // Locations
  { module: 'locations', action: 'view',   description: 'View office locations' },
  { module: 'locations', action: 'create', description: 'Add new location' },
  { module: 'locations', action: 'update', description: 'Edit location details' },
  { module: 'locations', action: 'delete', description: 'Remove location' },

  // Departments
  { module: 'departments', action: 'view',   description: 'View departments' },
  { module: 'departments', action: 'create', description: 'Create department' },
  { module: 'departments', action: 'update', description: 'Update department' },
  { module: 'departments', action: 'delete', description: 'Delete department' },

  // Teams
  { module: 'teams', action: 'view',   description: 'View teams' },
  { module: 'teams', action: 'create', description: 'Create team' },
  { module: 'teams', action: 'update', description: 'Update team' },
  { module: 'teams', action: 'delete', description: 'Delete team' },

  // Designations
  { module: 'designations', action: 'view',   description: 'View designations/job titles' },
  { module: 'designations', action: 'create', description: 'Create designation' },
  { module: 'designations', action: 'update', description: 'Update designation' },
  { module: 'designations', action: 'delete', description: 'Delete designation' },

  // Employees
  { module: 'employees', action: 'view',        description: 'View employee profiles' },
  { module: 'employees', action: 'create',      description: 'Add new employee' },
  { module: 'employees', action: 'update',      description: 'Update employee details' },
  { module: 'employees', action: 'delete',      description: 'Deactivate or delete employee' },
  { module: 'employees', action: 'export',      description: 'Export employee data' },
  { module: 'employees', action: 'bulk_import', description: 'Bulk import employees via CSV' },

  // Onboarding
  { module: 'onboarding', action: 'view',   description: 'View onboarding checklists' },
  { module: 'onboarding', action: 'create', description: 'Create onboarding checklist or task' },
  { module: 'onboarding', action: 'update', description: 'Update onboarding task' },
  { module: 'onboarding', action: 'delete', description: 'Delete onboarding task' },

  // Offboarding
  { module: 'offboarding', action: 'view',   description: 'View offboarding checklists' },
  { module: 'offboarding', action: 'create', description: 'Create offboarding checklist or task' },
  { module: 'offboarding', action: 'update', description: 'Update offboarding task' },
  { module: 'offboarding', action: 'delete', description: 'Delete offboarding task' },

  // Work Policies
  { module: 'work_policies', action: 'view',   description: 'View work and shift policies' },
  { module: 'work_policies', action: 'create', description: 'Create work policy' },
  { module: 'work_policies', action: 'update', description: 'Update work policy' },
  { module: 'work_policies', action: 'delete', description: 'Delete work policy' },
  { module: 'work_policies', action: 'assign', description: 'Assign work policy to employee' },

  // Attendance
  { module: 'attendance', action: 'view',   description: 'View attendance records' },
  { module: 'attendance', action: 'create', description: 'Mark or log attendance' },
  { module: 'attendance', action: 'update', description: 'Edit attendance record' },
  { module: 'attendance', action: 'delete', description: 'Delete attendance record' },
  { module: 'attendance', action: 'export', description: 'Export attendance reports' },

  // Attendance Regularization
  { module: 'attendance_regularization', action: 'view',    description: 'View regularization requests' },
  { module: 'attendance_regularization', action: 'create',  description: 'Submit regularization request' },
  { module: 'attendance_regularization', action: 'approve', description: 'Approve regularization request' },
  { module: 'attendance_regularization', action: 'reject',  description: 'Reject regularization request' },

  // Leave Types
  { module: 'leave_types', action: 'view',   description: 'View leave types' },
  { module: 'leave_types', action: 'create', description: 'Create leave type' },
  { module: 'leave_types', action: 'update', description: 'Update leave type' },
  { module: 'leave_types', action: 'delete', description: 'Delete leave type' },

  // Leave Policies
  { module: 'leave_policies', action: 'view',   description: 'View leave policies' },
  { module: 'leave_policies', action: 'create', description: 'Create leave policy' },
  { module: 'leave_policies', action: 'update', description: 'Update leave policy' },
  { module: 'leave_policies', action: 'delete', description: 'Delete leave policy' },

  // Leave Templates
  { module: 'leave_templates', action: 'view',   description: 'View leave templates' },
  { module: 'leave_templates', action: 'create', description: 'Create leave template' },
  { module: 'leave_templates', action: 'update', description: 'Update leave template' },
  { module: 'leave_templates', action: 'delete', description: 'Delete leave template' },
  { module: 'leave_templates', action: 'assign', description: 'Assign leave template to employee' },

  // Leave Requests
  { module: 'leave_requests', action: 'view',    description: 'View leave requests' },
  { module: 'leave_requests', action: 'create',  description: 'Submit leave request' },
  { module: 'leave_requests', action: 'update',  description: 'Edit own pending leave request' },
  { module: 'leave_requests', action: 'delete',  description: 'Cancel or delete leave request' },
  { module: 'leave_requests', action: 'approve', description: 'Approve leave request' },
  { module: 'leave_requests', action: 'reject',  description: 'Reject leave request' },

  // Leave Balances
  { module: 'leave_balances', action: 'view',   description: 'View employee leave balances' },
  { module: 'leave_balances', action: 'update', description: 'Manually adjust leave balance' },

  // Holidays
  { module: 'holidays', action: 'view',   description: 'View company holidays' },
  { module: 'holidays', action: 'create', description: 'Add holiday' },
  { module: 'holidays', action: 'update', description: 'Update holiday' },
  { module: 'holidays', action: 'delete', description: 'Delete holiday' },

  // Salary Components
  { module: 'salary_components', action: 'view',   description: 'View salary components' },
  { module: 'salary_components', action: 'create', description: 'Create salary component' },
  { module: 'salary_components', action: 'update', description: 'Update salary component' },
  { module: 'salary_components', action: 'delete', description: 'Delete salary component' },

  // Salary Grades
  { module: 'salary_grades', action: 'view',   description: 'View salary grades and bands' },
  { module: 'salary_grades', action: 'create', description: 'Create salary grade' },
  { module: 'salary_grades', action: 'update', description: 'Update salary grade' },
  { module: 'salary_grades', action: 'delete', description: 'Delete salary grade' },

  // Salary Templates
  { module: 'salary_templates', action: 'view',   description: 'View salary structures and templates' },
  { module: 'salary_templates', action: 'create', description: 'Create salary template' },
  { module: 'salary_templates', action: 'update', description: 'Update salary template' },
  { module: 'salary_templates', action: 'delete', description: 'Delete salary template' },

  // Employee Salary
  { module: 'employee_salary', action: 'view',   description: 'View employee salary details' },
  { module: 'employee_salary', action: 'create', description: 'Assign salary structure to employee' },
  { module: 'employee_salary', action: 'update', description: 'Revise employee salary' },

  // Payroll
  { module: 'payroll', action: 'view',    description: 'View payroll runs' },
  { module: 'payroll', action: 'create',  description: 'Initiate payroll run' },
  { module: 'payroll', action: 'update',  description: 'Edit payroll run' },
  { module: 'payroll', action: 'delete',  description: 'Delete payroll run' },
  { module: 'payroll', action: 'approve', description: 'Approve and finalize payroll' },
  { module: 'payroll', action: 'export',  description: 'Export payroll data' },

  // Payslips
  { module: 'payslips', action: 'view',   description: 'View payslips' },
  { module: 'payslips', action: 'export', description: 'Download or export payslips' },

  // Appraisals
  { module: 'appraisals', action: 'view',    description: 'View appraisal cycles and ratings' },
  { module: 'appraisals', action: 'create',  description: 'Create appraisal cycle' },
  { module: 'appraisals', action: 'update',  description: 'Update appraisal ratings and comments' },
  { module: 'appraisals', action: 'delete',  description: 'Delete appraisal cycle' },
  { module: 'appraisals', action: 'approve', description: 'Approve and finalize appraisal' },

  // KRA (Key Result Areas)
  { module: 'kra', action: 'view',   description: 'View KRAs' },
  { module: 'kra', action: 'create', description: 'Define KRA' },
  { module: 'kra', action: 'update', description: 'Update KRA' },
  { module: 'kra', action: 'delete', description: 'Delete KRA' },

  // Goals
  { module: 'goals', action: 'view',   description: 'View goals' },
  { module: 'goals', action: 'create', description: 'Create goal' },
  { module: 'goals', action: 'update', description: 'Update goal progress' },
  { module: 'goals', action: 'delete', description: 'Delete goal' },

  // Documents
  { module: 'documents', action: 'view',   description: 'View documents' },
  { module: 'documents', action: 'create', description: 'Upload document' },
  { module: 'documents', action: 'update', description: 'Edit document metadata' },
  { module: 'documents', action: 'delete', description: 'Delete document' },
  { module: 'documents', action: 'export', description: 'Download document' },

  // Notifications
  { module: 'notifications', action: 'view',   description: 'View notifications' },
  { module: 'notifications', action: 'create', description: 'Send or broadcast notification' },
  { module: 'notifications', action: 'delete', description: 'Delete notification' },

  // Reports
  { module: 'reports', action: 'view',   description: 'View analytics and reports' },
  { module: 'reports', action: 'export', description: 'Export reports' },

  // Roles (RBAC management)
  { module: 'roles', action: 'view',   description: 'View roles and assignments' },
  { module: 'roles', action: 'create', description: 'Create custom role' },
  { module: 'roles', action: 'update', description: 'Edit role permissions' },
  { module: 'roles', action: 'delete', description: 'Delete custom role' },
  { module: 'roles', action: 'assign', description: 'Assign or revoke role for a user' },

  // Permissions
  { module: 'permissions', action: 'view', description: 'View available system permissions' },

  // Rules (Rule Engine)
  { module: 'rules', action: 'view',   description: 'View business rules' },
  { module: 'rules', action: 'create', description: 'Create business rule' },
  { module: 'rules', action: 'update', description: 'Update business rule' },
  { module: 'rules', action: 'delete', description: 'Delete business rule' },

  // Audit Logs
  { module: 'audit_logs', action: 'view',   description: 'View system audit trail' },
  { module: 'audit_logs', action: 'export', description: 'Export audit logs' },

  // Settings
  { module: 'settings', action: 'view',   description: 'View system configuration' },
  { module: 'settings', action: 'update', description: 'Modify system configuration' },
];

// ─── Runner (idempotent — safe to call on every startup) ───────────────────────
const runPermissionsSeeder = async () => {
  try {
    const result = await Permission.insertMany(PERMISSIONS, {
      ordered:   false,
      rawResult: true,
    });
    const inserted = result.insertedCount ?? 0;
    if (inserted > 0) {
      console.log(`[Permissions] ${inserted} new permissions seeded.`);
    }
  } catch (err) {
    // MongoBulkWriteError on duplicates — expected on subsequent startups
    if (err.code === 11000 || err.name === 'MongoBulkWriteError') {
      const inserted = err.result?.nInserted ?? 0;
      if (inserted > 0) {
        console.log(`[Permissions] ${inserted} new permissions seeded (rest already existed).`);
      }
    } else {
      throw err;
    }
  }
};

module.exports = { runPermissionsSeeder, PERMISSIONS };
