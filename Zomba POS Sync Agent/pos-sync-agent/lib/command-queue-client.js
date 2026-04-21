const axios = require('axios');
const { buildConfig, getSyncMetadata } = require('./config');

function getClientConfig() {
  const config = buildConfig();
  const baseURL = config.backend.baseUrl;
  const posSecret = config.backend.apiToken;
  const agentId = config.backend.agentId;

  if (!baseURL) {
    throw new Error('BACKEND_URL (or BACKEND_BASE_URL/LIVE_SERVER_URL fallback) is required for command polling');
  }

  if (!posSecret) {
    throw new Error('BACKEND_API_TOKEN (or POS_SECRET fallback) is required for command polling');
  }

  return { baseURL, posSecret, agentId, config };
}

function createClient() {
  const { baseURL, posSecret, agentId, config } = getClientConfig();

  return axios.create({
    baseURL,
    timeout: config.backend.commandPollTimeoutMs,
    headers: {
      'Content-Type': 'application/json',
      'x-pos-secret': posSecret,
      'x-agent-id': agentId,
      'x-branch-code': config.branch.branchCode,
      'x-sync-source-code': config.branch.syncSourceCode,
    },
  });
}

function withMetadata(payload = {}) {
  const config = buildConfig();
  return {
    ...payload,
    metadata: getSyncMetadata(config),
  };
}

async function pollCommands(limit = 10) {
  const client = createClient();
  const response = await client.post('/api/pos-commands/poll', withMetadata({ limit }));
  return (response.data && response.data.commands) || [];
}

async function completeCommand(id, resultSummary = {}) {
  const client = createClient();
  const response = await client.post(`/api/pos-commands/${id}/complete`, withMetadata({ resultSummary }));
  return response.data;
}

async function failCommand(id, errorMessage, retryable = true) {
  const client = createClient();
  const response = await client.post(`/api/pos-commands/${id}/fail`, withMetadata({
    errorMessage,
    retryable,
  }));
  return response.data;
}

async function pollPendingEmergencySales(limit = 10) {
  const client = createClient();
  const response = await client.get('/api/pos-sync/pending-emergency-sales', {
    params: { limit },
  });
  return (response.data && response.data.sales) || [];
}

async function ackEmergencySaleSynced(payload = {}) {
  const client = createClient();
  const response = await client.post('/api/pos-sync/ack-emergency-sale-synced', withMetadata(payload));
  return response.data;
}

async function ackEmergencySaleFailed(payload = {}) {
  const client = createClient();
  const response = await client.post('/api/pos-sync/ack-emergency-sale-failed', withMetadata(payload));
  return response.data;
}

module.exports = {
  pollCommands,
  completeCommand,
  failCommand,
  pollPendingEmergencySales,
  ackEmergencySaleSynced,
  ackEmergencySaleFailed,
};
