const axios = require('axios');

function getClientConfig() {
  const baseURL = process.env.LIVE_SERVER_URL;
  const posSecret = process.env.POS_SECRET;
  const agentId = process.env.POS_AGENT_ID || 'shop-main-agent';

  if (!baseURL) {
    throw new Error('LIVE_SERVER_URL is required for command polling');
  }

  if (!posSecret) {
    throw new Error('POS_SECRET is required for command polling');
  }

  return { baseURL, posSecret, agentId };
}

function createClient() {
  const { baseURL, posSecret, agentId } = getClientConfig();

  return axios.create({
    baseURL,
    timeout: parseInt(process.env.COMMAND_POLL_TIMEOUT_MS || '15000', 10),
    headers: {
      'Content-Type': 'application/json',
      'x-pos-secret': posSecret,
      'x-agent-id': agentId,
    },
  });
}

async function pollCommands(limit = 10) {
  const client = createClient();
  const response = await client.post('/api/pos-commands/poll', { limit });
  return response.data?.commands || [];
}

async function completeCommand(id, resultSummary = {}) {
  const client = createClient();
  const response = await client.post(`/api/pos-commands/${id}/complete`, { resultSummary });
  return response.data;
}

async function failCommand(id, errorMessage, retryable = true) {
  const client = createClient();
  const response = await client.post(`/api/pos-commands/${id}/fail`, {
    errorMessage,
    retryable,
  });
  return response.data;
}

async function pollPendingEmergencySales(limit = 10) {
  const client = createClient();
  const response = await client.get('/api/pos-sync/pending-emergency-sales', {
    params: { limit },
  });
  return response.data?.sales || [];
}

async function ackEmergencySaleSynced(payload = {}) {
  const client = createClient();
  const response = await client.post('/api/pos-sync/ack-emergency-sale-synced', payload);
  return response.data;
}

async function ackEmergencySaleFailed(payload = {}) {
  const client = createClient();
  const response = await client.post('/api/pos-sync/ack-emergency-sale-failed', payload);
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
