const express      = require('express');
const router       = express.Router();
const ctrl         = require('../../controllers/location/location.controller');
const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { createLocationValidator, updateLocationValidator } = require('../../validators/location/location.validator');

router.get('/',
  authenticate, authorize('locations', 'view'),
  ctrl.listLocations
);

router.get('/:id',
  authenticate, authorize('locations', 'view'),
  ctrl.getLocation
);

router.post('/',
  authenticate, authorize('locations', 'create'),
  createLocationValidator,
  ctrl.createLocation
);

router.patch('/:id',
  authenticate, authorize('locations', 'update'),
  updateLocationValidator,
  ctrl.updateLocation
);

router.delete('/:id',
  authenticate, authorize('locations', 'delete'),
  ctrl.deleteLocation
);

module.exports = router;
