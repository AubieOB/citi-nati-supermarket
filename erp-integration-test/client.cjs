'use strict';
class IntegrationError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function createClient({ baseUrl, credential, localTest = false }) {
  const url = new URL(baseUrl);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(localTest && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw new Error('Use the approved HTTPS test ERP address. Loopback HTTP is available only in local test mode.');
  if (!credential || credential.length < 32) throw new Error('Configure a separate test-tenant website credential.');
  const root = url.toString().replace(/\/$/, '') + '/api/storefront/v1';
  const request = async (route, body) => {
    let response, envelope;
    try {
      response = await fetch(root + route, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(12000), headers: { Authorization: 'Bearer ' + credential, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (Number(response.headers.get('content-length') || 0) > 1024 * 1024) throw new Error('Oversized ERP response');
      const reader = response.body.getReader(); let total = 0; const chunks = [];
      for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > 1024 * 1024) { await reader.cancel(); throw new Error('Oversized ERP response'); } chunks.push(Buffer.from(value)); }
      envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { throw new IntegrationError(503, 'The test ERP could not be reached. Retry the same request.'); }
    if (!response.ok) {
      const messages = { 400: 'Check the selected products and order details.', 404: 'The selected published product or order is unavailable.', 409: 'The order conflicts with current availability or an earlier submission. Review it before retrying.', 429: 'Too many requests. Please wait a minute and retry.' };
      throw new IntegrationError(messages[response.status] ? response.status : 503, messages[response.status] || 'Website authorization or ERP access needs administrator review.');
    }
    if (envelope.data === undefined) throw new IntegrationError(503, 'The ERP response could not be confirmed.');
    return envelope.data;
  };
  return { prove: challenge => request('/connection/test', { challenge }), catalog: () => request('/catalog'), order: input => request('/orders', input), status: reference => request('/orders/' + encodeURIComponent(reference)) };
}
module.exports = { createClient, IntegrationError };
