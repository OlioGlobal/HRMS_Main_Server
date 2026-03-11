const express      = require('express');
const router       = express.Router();
const ctrl         = require('../../controllers/department/department.controller');
const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { createDepartmentValidator, updateDepartmentValidator } = require('../../validators/department/department.validator');

router.get('/',
  authenticate, authorize('departments', 'view'),
  ctrl.listDepartments
);

router.get('/:id',
  authenticate, authorize('departments', 'view'),
  ctrl.getDepartment
);

router.post('/',
  authenticate, authorize('departments', 'create'),
  createDepartmentValidator,
  ctrl.createDepartment
);

router.patch('/:id',
  authenticate, authorize('departments', 'update'),
  updateDepartmentValidator,
  ctrl.updateDepartment
);

router.delete('/:id',
  authenticate, authorize('departments', 'delete'),
  ctrl.deleteDepartment
);

module.exports = router;
