const express      = require('express');
const router       = express.Router();
const ctrl         = require('../../controllers/team/team.controller');
const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { createTeamValidator, updateTeamValidator } = require('../../validators/team/team.validator');

router.get('/',
  authenticate, authorize('teams', 'view'),
  ctrl.listTeams
);

router.get('/:id',
  authenticate, authorize('teams', 'view'),
  ctrl.getTeam
);

router.post('/',
  authenticate, authorize('teams', 'create'),
  createTeamValidator,
  ctrl.createTeam
);

router.patch('/:id',
  authenticate, authorize('teams', 'update'),
  updateTeamValidator,
  ctrl.updateTeam
);

router.delete('/:id',
  authenticate, authorize('teams', 'delete'),
  ctrl.deleteTeam
);

module.exports = router;
