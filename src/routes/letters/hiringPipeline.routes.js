const express      = require('express');
const router       = express.Router();
const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const ctrl         = require('../../controllers/letters/hiringPipeline.controller');
const { createPipelineValidator, updatePipelineValidator, assignPipelineValidator } = require('../../validators/letters/hiringPipeline.validator');

router.get('/default',                      authenticate, authorize('hiring_pipelines', 'view'),   ctrl.getDefault);
router.get('/',                             authenticate, authorize('hiring_pipelines', 'view'),   ctrl.list);
router.get('/:id',                          authenticate, authorize('hiring_pipelines', 'view'),   ctrl.getOne);
router.post('/',                            authenticate, authorize('hiring_pipelines', 'create'), createPipelineValidator, ctrl.create);
router.patch('/:id',                        authenticate, authorize('hiring_pipelines', 'update'), updatePipelineValidator, ctrl.update);
router.delete('/:id',                       authenticate, authorize('hiring_pipelines', 'delete'), ctrl.remove);
router.post('/assign/:employeeId',          authenticate, authorize('hiring', 'update'),           assignPipelineValidator, ctrl.assignToEmployee);

module.exports = router;
