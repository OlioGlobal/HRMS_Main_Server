const express      = require('express');
const router       = express.Router();
const ctrl         = require('../../controllers/employee/employee.controller');
const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const {
  createEmployeeValidator,
  updateEmployeeValidator,
  changeStatusValidator,
} = require('../../validators/employee/employee.validator');

// List + Create
router.get('/',
  authenticate, authorize('employees', 'view'),
  ctrl.listEmployees
);

router.post('/',
  authenticate, authorize('employees', 'create'),
  createEmployeeValidator,
  ctrl.createEmployee
);

// Single employee
router.get('/:id',
  authenticate, authorize('employees', 'view'),
  ctrl.getEmployee
);

router.patch('/:id',
  authenticate, authorize('employees', 'update'),
  updateEmployeeValidator,
  ctrl.updateEmployee
);

router.patch('/:id/status',
  authenticate, authorize('employees', 'update'),
  changeStatusValidator,
  ctrl.changeStatus
);

router.delete('/:id',
  authenticate, authorize('employees', 'delete'),
  ctrl.deleteEmployee
);

// Probation
router.patch('/:id/probation',
  authenticate, authorize('employees', 'update'),
  ctrl.updateProbation
);

// Reportees
router.get('/:id/reportees',
  authenticate, authorize('employees', 'view'),
  ctrl.getReportees
);

// Enable portal access
router.post('/:id/enable-portal',
  authenticate, authorize('employees', 'update'),
  ctrl.enablePortalAccess
);

// Auto-assign next employee ID if missing
router.post('/:id/assign-employee-id',
  authenticate, authorize('employees', 'update'),
  ctrl.assignEmployeeId
);

// HR verify candidate personal details
router.patch('/:id/verify-personal-details',
  authenticate, authorize('employees', 'update'),
  ctrl.verifyPersonalDetails
);

module.exports = router;
