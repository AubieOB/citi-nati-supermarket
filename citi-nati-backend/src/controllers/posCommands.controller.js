const queueService = require('../services/posCommandQueue.service');

function isAuthorizedAgent(req) {
  const provided = req.headers['x-pos-secret'];
  const expected = process.env.POS_SECRET;
  return !!provided && !!expected && provided === expected;
}

function getAgentId(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  return req.headers['x-agent-id'] || body.agentId || 'unknown-agent';
}

async function pollCommands(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const agentId = getAgentId(req);
    const limit = req.body && req.body.limit ? req.body.limit : 10;
    const claimed = await queueService.claimPendingCommands(limit, agentId);

    return res.json({
      success: true,
      commands: claimed.map((command) => ({
        id: command.id,
        commandType: command.commandType,
        payload: command.payload,
        createdAt: command.createdAt,
      })),
    });
  } catch (error) {
    console.error('[POS COMMAND QUEUE ERROR] poll failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to poll commands' });
  }
}

async function completeCommand(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { resultSummary } = req.body;
    const agentId = getAgentId(req);

    await queueService.markCommandCompleted(id, resultSummary || {}, agentId);

    return res.json({ success: true, id, status: 'COMPLETED' });
  } catch (error) {
    console.error('[POS COMMAND QUEUE ERROR] complete failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function failCommand(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { errorMessage, retryable } = req.body;
    const agentId = getAgentId(req);

    await queueService.markCommandFailed(
      id,
      errorMessage || 'Command failed without details',
      retryable !== false,
      agentId
    );

    return res.json({ success: true, id });
  } catch (error) {
    console.error('[POS COMMAND QUEUE ERROR] fail failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function getCommand(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const command = await queueService.getCommandById(req.params.id);

    if (!command) {
      return res.status(404).json({ success: false, error: 'Command not found' });
    }

    return res.json({ success: true, command });
  } catch (error) {
    console.error('[POS COMMAND QUEUE ERROR] get command failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch command' });
  }
}

async function listCommands(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const commands = await queueService.listCommands({
      status: req.query.status,
      take: req.query.take,
      skip: req.query.skip,
    });

    return res.json({ success: true, commands });
  } catch (error) {
    console.error('[POS COMMAND QUEUE ERROR] list failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to list commands' });
  }
}

async function getCommandStats(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const stats = await queueService.getStats();
    return res.json({ success: true, stats });
  } catch (error) {
    console.error('[POS COMMAND QUEUE ERROR] stats failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
}

module.exports = {
  pollCommands,
  completeCommand,
  failCommand,
  getCommand,
  listCommands,
  getCommandStats,
};
