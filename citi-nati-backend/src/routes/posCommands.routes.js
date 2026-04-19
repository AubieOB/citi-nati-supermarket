const express = require('express');
const {
  pollCommands,
  completeCommand,
  failCommand,
  getCommand,
  listCommands,
  getCommandStats,
} = require('../controllers/posCommands.controller');
const { requireTrustedAgent } = require('../middleware/agentAuth.middleware');

const router = express.Router();

router.use(requireTrustedAgent);

router.post('/poll', pollCommands);
router.post('/:id/complete', completeCommand);
router.post('/:id/fail', failCommand);
router.get('/stats', getCommandStats);
router.get('/:id', getCommand);
router.get('/', listCommands);

module.exports = router;
