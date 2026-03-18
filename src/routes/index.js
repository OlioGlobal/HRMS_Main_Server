const express   = require('express');
const router    = express.Router();

const authRoutes        = require('./auth/auth.routes');
const roleRoutes        = require('./roles/role.routes');
const permissionRoutes  = require('./permissions/permission.routes');
const companyRoutes     = require('./company/company.routes');
const locationRoutes    = require('./location/location.routes');
const departmentRoutes  = require('./department/department.routes');
const teamRoutes        = require('./team/team.routes');
const workPolicyRoutes  = require('./workPolicy/workPolicy.routes');
const employeeRoutes    = require('./employee/employee.routes');
const salaryRoutes      = require('./salary/salary.routes');
const designationRoutes = require('./designation/designation.routes');
const holidayRoutes     = require('./holiday/holiday.routes');
const leaveRoutes       = require('./leave/leave.routes');
const attendanceRoutes  = require('./attendance/attendance.routes');
const payrollRoutes     = require('./payroll/payroll.routes');
const appraisalRoutes   = require('./appraisal/appraisal.routes');
const documentRoutes    = require('./document/document.routes');
const boardingRoutes    = require('./onboarding/onboarding.routes');
const dashboardRoutes   = require('./dashboard/dashboard.routes');

// ─── Mount All Routes ──────────────────────────────────────────────────────────
router.use('/auth',          authRoutes);
router.use('/roles',         roleRoutes);
router.use('/permissions',   permissionRoutes);
router.use('/company',       companyRoutes);
router.use('/locations',     locationRoutes);
router.use('/departments',   departmentRoutes);
router.use('/teams',         teamRoutes);
router.use('/work-policies', workPolicyRoutes);
router.use('/employees',     employeeRoutes);
router.use('/salary',        salaryRoutes);
router.use('/designations',  designationRoutes);
router.use('/holidays',      holidayRoutes);
router.use('/leave',         leaveRoutes);
router.use('/attendance',    attendanceRoutes);
router.use('/payroll',       payrollRoutes);
router.use('/appraisal',    appraisalRoutes);
router.use('/documents',    documentRoutes);
router.use('/boarding',     boardingRoutes);
router.use('/dashboard',   dashboardRoutes);

module.exports = router;
