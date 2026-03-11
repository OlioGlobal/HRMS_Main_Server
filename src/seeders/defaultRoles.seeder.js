const Permission     = require('../models/Permission');
const Role           = require('../models/Role');
const RolePermission = require('../models/RolePermission');

// ─── Role definitions ──────────────────────────────────────────────────────────
// Each entry: { name, description, level, allPermissions?, permissions? }
// permissions: [{ key: 'module:action', scope: 'global'|'department'|'team'|'self' }]
const ROLE_DEFINITIONS = {
  'super-admin': {
    name:            'Super Admin',
    description:     'Full access to all system features',
    level:           1,
    allPermissions:  true, // gets every permission at global scope
  },

  'hr-manager': {
    name:        'HR Manager',
    description: 'Manage all HR operations and employee lifecycle',
    level:       2,
    permissions: [
      // Dashboard
      { key: 'dashboard:view', scope: 'global' },
      // Company — view only (cannot change company settings)
      { key: 'company:view', scope: 'global' },
      // Org structure — full CRUD
      { key: 'locations:view',        scope: 'global' },
      { key: 'locations:create',      scope: 'global' },
      { key: 'locations:update',      scope: 'global' },
      { key: 'locations:delete',      scope: 'global' },
      { key: 'departments:view',      scope: 'global' },
      { key: 'departments:create',    scope: 'global' },
      { key: 'departments:update',    scope: 'global' },
      { key: 'departments:delete',    scope: 'global' },
      { key: 'teams:view',            scope: 'global' },
      { key: 'teams:create',          scope: 'global' },
      { key: 'teams:update',          scope: 'global' },
      { key: 'teams:delete',          scope: 'global' },
      { key: 'designations:view',     scope: 'global' },
      { key: 'designations:create',   scope: 'global' },
      { key: 'designations:update',   scope: 'global' },
      { key: 'designations:delete',   scope: 'global' },
      // Employees — full management
      { key: 'employees:view',        scope: 'global' },
      { key: 'employees:create',      scope: 'global' },
      { key: 'employees:update',      scope: 'global' },
      { key: 'employees:delete',      scope: 'global' },
      { key: 'employees:export',      scope: 'global' },
      { key: 'employees:bulk_import', scope: 'global' },
      // Onboarding / Offboarding
      { key: 'onboarding:view',       scope: 'global' },
      { key: 'onboarding:create',     scope: 'global' },
      { key: 'onboarding:update',     scope: 'global' },
      { key: 'onboarding:delete',     scope: 'global' },
      { key: 'offboarding:view',      scope: 'global' },
      { key: 'offboarding:create',    scope: 'global' },
      { key: 'offboarding:update',    scope: 'global' },
      { key: 'offboarding:delete',    scope: 'global' },
      // Work Policies
      { key: 'work_policies:view',    scope: 'global' },
      { key: 'work_policies:create',  scope: 'global' },
      { key: 'work_policies:update',  scope: 'global' },
      { key: 'work_policies:delete',  scope: 'global' },
      { key: 'work_policies:assign',  scope: 'global' },
      // Attendance
      { key: 'attendance:view',       scope: 'global' },
      { key: 'attendance:create',     scope: 'global' },
      { key: 'attendance:update',     scope: 'global' },
      { key: 'attendance:delete',     scope: 'global' },
      { key: 'attendance:export',     scope: 'global' },
      // Attendance Regularization
      { key: 'attendance_regularization:view',    scope: 'global' },
      { key: 'attendance_regularization:create',  scope: 'global' },
      { key: 'attendance_regularization:approve', scope: 'global' },
      { key: 'attendance_regularization:reject',  scope: 'global' },
      // Leave
      { key: 'leave_types:view',      scope: 'global' },
      { key: 'leave_types:create',    scope: 'global' },
      { key: 'leave_types:update',    scope: 'global' },
      { key: 'leave_types:delete',    scope: 'global' },
      { key: 'leave_policies:view',   scope: 'global' },
      { key: 'leave_policies:create', scope: 'global' },
      { key: 'leave_policies:update', scope: 'global' },
      { key: 'leave_policies:delete', scope: 'global' },
      { key: 'leave_templates:view',   scope: 'global' },
      { key: 'leave_templates:create', scope: 'global' },
      { key: 'leave_templates:update', scope: 'global' },
      { key: 'leave_templates:delete', scope: 'global' },
      { key: 'leave_templates:assign', scope: 'global' },
      { key: 'leave_requests:view',    scope: 'global' },
      { key: 'leave_requests:create',  scope: 'global' },
      { key: 'leave_requests:update',  scope: 'global' },
      { key: 'leave_requests:delete',  scope: 'global' },
      { key: 'leave_requests:approve', scope: 'global' },
      { key: 'leave_requests:reject',  scope: 'global' },
      { key: 'leave_balances:view',    scope: 'global' },
      { key: 'leave_balances:update',  scope: 'global' },
      { key: 'holidays:view',          scope: 'global' },
      { key: 'holidays:create',        scope: 'global' },
      { key: 'holidays:update',        scope: 'global' },
      { key: 'holidays:delete',        scope: 'global' },
      // Salary & Payroll — full access
      { key: 'salary_components:view',   scope: 'global' },
      { key: 'salary_components:create', scope: 'global' },
      { key: 'salary_components:update', scope: 'global' },
      { key: 'salary_components:delete', scope: 'global' },
      { key: 'salary_grades:view',       scope: 'global' },
      { key: 'salary_grades:create',     scope: 'global' },
      { key: 'salary_grades:update',     scope: 'global' },
      { key: 'salary_grades:delete',     scope: 'global' },
      { key: 'salary_templates:view',    scope: 'global' },
      { key: 'salary_templates:create',  scope: 'global' },
      { key: 'salary_templates:update',  scope: 'global' },
      { key: 'salary_templates:delete',  scope: 'global' },
      { key: 'employee_salary:view',     scope: 'global' },
      { key: 'employee_salary:create',   scope: 'global' },
      { key: 'employee_salary:update',   scope: 'global' },
      { key: 'payroll:view',             scope: 'global' },
      { key: 'payroll:create',           scope: 'global' },
      { key: 'payroll:update',           scope: 'global' },
      { key: 'payroll:delete',           scope: 'global' },
      { key: 'payroll:approve',          scope: 'global' },
      { key: 'payroll:export',           scope: 'global' },
      { key: 'payslips:view',            scope: 'global' },
      { key: 'payslips:export',          scope: 'global' },
      // Performance
      { key: 'appraisals:view',    scope: 'global' },
      { key: 'appraisals:create',  scope: 'global' },
      { key: 'appraisals:update',  scope: 'global' },
      { key: 'appraisals:delete',  scope: 'global' },
      { key: 'appraisals:approve', scope: 'global' },
      { key: 'kra:view',           scope: 'global' },
      { key: 'kra:create',         scope: 'global' },
      { key: 'kra:update',         scope: 'global' },
      { key: 'kra:delete',         scope: 'global' },
      { key: 'goals:view',         scope: 'global' },
      { key: 'goals:create',       scope: 'global' },
      { key: 'goals:update',       scope: 'global' },
      { key: 'goals:delete',       scope: 'global' },
      // Documents
      { key: 'documents:view',   scope: 'global' },
      { key: 'documents:create', scope: 'global' },
      { key: 'documents:update', scope: 'global' },
      { key: 'documents:delete', scope: 'global' },
      { key: 'documents:export', scope: 'global' },
      // Notifications
      { key: 'notifications:view',   scope: 'global' },
      { key: 'notifications:create', scope: 'global' },
      { key: 'notifications:delete', scope: 'global' },
      // Reports
      { key: 'reports:view',   scope: 'global' },
      { key: 'reports:export', scope: 'global' },
      // Roles — manage but not delete system roles
      { key: 'roles:view',   scope: 'global' },
      { key: 'roles:create', scope: 'global' },
      { key: 'roles:update', scope: 'global' },
      { key: 'roles:assign', scope: 'global' },
      // Settings — view only
      { key: 'settings:view', scope: 'global' },
    ],
  },

  'hr-staff': {
    name:        'HR Staff',
    description: 'Day-to-day HR operations — employee management and leave/attendance processing',
    level:       3,
    permissions: [
      { key: 'dashboard:view',         scope: 'global' },
      // Org structure — view only
      { key: 'locations:view',         scope: 'global' },
      { key: 'departments:view',       scope: 'global' },
      { key: 'teams:view',             scope: 'global' },
      { key: 'designations:view',      scope: 'global' },
      // Employees — create/update, no delete
      { key: 'employees:view',         scope: 'global' },
      { key: 'employees:create',       scope: 'global' },
      { key: 'employees:update',       scope: 'global' },
      { key: 'employees:export',       scope: 'global' },
      // Onboarding / Offboarding
      { key: 'onboarding:view',        scope: 'global' },
      { key: 'onboarding:create',      scope: 'global' },
      { key: 'onboarding:update',      scope: 'global' },
      { key: 'offboarding:view',       scope: 'global' },
      { key: 'offboarding:create',     scope: 'global' },
      { key: 'offboarding:update',     scope: 'global' },
      // Work Policies — view and assign only
      { key: 'work_policies:view',     scope: 'global' },
      { key: 'work_policies:assign',   scope: 'global' },
      // Attendance — manage records
      { key: 'attendance:view',        scope: 'global' },
      { key: 'attendance:create',      scope: 'global' },
      { key: 'attendance:update',      scope: 'global' },
      { key: 'attendance:export',      scope: 'global' },
      // Attendance Regularization — approve/reject
      { key: 'attendance_regularization:view',    scope: 'global' },
      { key: 'attendance_regularization:approve', scope: 'global' },
      { key: 'attendance_regularization:reject',  scope: 'global' },
      // Leave — approve/reject requests, view config
      { key: 'leave_types:view',       scope: 'global' },
      { key: 'leave_policies:view',    scope: 'global' },
      { key: 'leave_templates:view',   scope: 'global' },
      { key: 'leave_templates:assign', scope: 'global' },
      { key: 'leave_requests:view',    scope: 'global' },
      { key: 'leave_requests:approve', scope: 'global' },
      { key: 'leave_requests:reject',  scope: 'global' },
      { key: 'leave_balances:view',    scope: 'global' },
      { key: 'holidays:view',          scope: 'global' },
      // Salary & Payroll — view only
      { key: 'salary_components:view', scope: 'global' },
      { key: 'salary_grades:view',     scope: 'global' },
      { key: 'salary_templates:view',  scope: 'global' },
      { key: 'employee_salary:view',   scope: 'global' },
      { key: 'payroll:view',           scope: 'global' },
      { key: 'payslips:view',          scope: 'global' },
      // Performance — view only
      { key: 'appraisals:view',        scope: 'global' },
      { key: 'kra:view',               scope: 'global' },
      { key: 'goals:view',             scope: 'global' },
      // Documents
      { key: 'documents:view',         scope: 'global' },
      { key: 'documents:create',       scope: 'global' },
      { key: 'documents:update',       scope: 'global' },
      { key: 'documents:export',       scope: 'global' },
      // Notifications — view only
      { key: 'notifications:view',     scope: 'global' },
      // Reports
      { key: 'reports:view',           scope: 'global' },
      { key: 'reports:export',         scope: 'global' },
    ],
  },

  'manager': {
    name:        'Manager',
    description: 'Team or department manager — monitor and approve for direct reports',
    level:       4,
    permissions: [
      { key: 'dashboard:view',                    scope: 'self'   },
      // View own team's employees
      { key: 'employees:view',                    scope: 'team'   },
      // Attendance — view team
      { key: 'attendance:view',                   scope: 'team'   },
      // Regularization — approve for team
      { key: 'attendance_regularization:view',    scope: 'team'   },
      { key: 'attendance_regularization:approve', scope: 'team'   },
      { key: 'attendance_regularization:reject',  scope: 'team'   },
      // Leave requests — approve for team
      { key: 'leave_requests:view',               scope: 'team'   },
      { key: 'leave_requests:approve',            scope: 'team'   },
      { key: 'leave_requests:reject',             scope: 'team'   },
      { key: 'leave_balances:view',               scope: 'team'   },
      { key: 'holidays:view',                     scope: 'global' },
      // Performance — manage team
      { key: 'appraisals:view',                   scope: 'team'   },
      { key: 'appraisals:create',                 scope: 'team'   },
      { key: 'appraisals:update',                 scope: 'team'   },
      { key: 'kra:view',                          scope: 'team'   },
      { key: 'kra:create',                        scope: 'team'   },
      { key: 'kra:update',                        scope: 'team'   },
      { key: 'goals:view',                        scope: 'team'   },
      { key: 'goals:create',                      scope: 'team'   },
      { key: 'goals:update',                      scope: 'team'   },
      // Documents — view team docs
      { key: 'documents:view',                    scope: 'team'   },
      // Notifications
      { key: 'notifications:view',                scope: 'self'   },
      // Reports — own team
      { key: 'reports:view',                      scope: 'team'   },
    ],
  },

  'employee': {
    name:        'Employee',
    description: 'Standard employee — access own data only',
    level:       5,
    permissions: [
      { key: 'dashboard:view',                   scope: 'self' },
      // Own profile
      { key: 'employees:view',                   scope: 'self' },
      // Own attendance
      { key: 'attendance:view',                  scope: 'self' },
      // Regularization — submit own
      { key: 'attendance_regularization:view',   scope: 'self' },
      { key: 'attendance_regularization:create', scope: 'self' },
      // Leave — own requests
      { key: 'leave_requests:view',              scope: 'self' },
      { key: 'leave_requests:create',            scope: 'self' },
      { key: 'leave_requests:update',            scope: 'self' },
      { key: 'leave_requests:delete',            scope: 'self' },
      { key: 'leave_balances:view',              scope: 'self' },
      { key: 'holidays:view',                    scope: 'global' },
      // Own payslips
      { key: 'payslips:view',                    scope: 'self' },
      { key: 'payslips:export',                  scope: 'self' },
      // Performance — own
      { key: 'appraisals:view',                  scope: 'self' },
      { key: 'goals:view',                       scope: 'self' },
      { key: 'goals:create',                     scope: 'self' },
      { key: 'goals:update',                     scope: 'self' },
      { key: 'kra:view',                         scope: 'self' },
      // Documents — own
      { key: 'documents:view',                   scope: 'self' },
      { key: 'documents:create',                 scope: 'self' },
      { key: 'documents:delete',                 scope: 'self' },
      { key: 'documents:export',                 scope: 'self' },
      // Notifications
      { key: 'notifications:view',               scope: 'self' },
    ],
  },
};

// ─── Seed default roles for a company (idempotent) ────────────────────────────
const seedDefaultRoles = async (companyId) => {
  // 1. Load all permissions into a key → _id map for fast lookup
  const allPermissions = await Permission.find({}).lean();
  const permMap = {};
  for (const p of allPermissions) {
    permMap[`${p.module}:${p.action}`] = p._id;
  }

  const createdRoles = {};

  for (const [slug, def] of Object.entries(ROLE_DEFINITIONS)) {
    // Upsert role (skip if already exists for this company)
    let role = await Role.findOne({ company_id: companyId, slug });
    if (!role) {
      role = await Role.create({
        company_id:  companyId,
        name:        def.name,
        slug,
        description: def.description,
        level:       def.level,
        isSystem:    true,
        isActive:    true,
      });
    }

    // Build the role-permission documents
    let entries;
    if (def.allPermissions) {
      // Super Admin: every permission at global scope
      entries = Object.values(permMap).map((permId) => ({
        role_id:       role._id,
        permission_id: permId,
        scope:         'global',
      }));
    } else {
      entries = (def.permissions || [])
        .filter((p) => permMap[p.key]) // skip if permission key isn't in DB
        .map((p) => ({
          role_id:       role._id,
          permission_id: permMap[p.key],
          scope:         p.scope,
        }));
    }

    // Bulk insert, ignore duplicates (idempotent)
    if (entries.length > 0) {
      try {
        await RolePermission.insertMany(entries, { ordered: false });
      } catch (err) {
        if (err.code !== 11000 && err.name !== 'MongoBulkWriteError') throw err;
      }
    }

    createdRoles[slug] = role;
  }

  return createdRoles; // caller can grab createdRoles['super-admin'] etc.
};

module.exports = { seedDefaultRoles };
