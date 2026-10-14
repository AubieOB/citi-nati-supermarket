'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { randomUUID, createHmac } = require('node:crypto');
const { spawn } = require('node:child_process');
const { createStore } = require('./server.cjs');
const { createClient } = require('./client.cjs');
async function customSiteAcceptance(f, t, foreign, prisma, send, deliverDueEvents) {
  assert.equal(process.env.NODE_ENV, 'test'); assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/financial_authority_\d+$/);
  const websiteUrl = 'https://erp-test.citinati.com', output = path.join(process.env.SALES_GROUP_OUTPUT, 'citi-site'); fs.mkdirSync(output, { recursive: true });
  const configuration = { enabled: true, testTenantConfirmed: true, baseUrl: f.base, credential: '', signingSecret: randomUUID() + randomUUID(), username: 'tester', password: randomUUID(), localTest: true, dataDir: path.join(output, 'data') };
  let server, site, headers, channel, body, rawNotification, notificationHeaders;
  const siteRequest = async (route, input, status = 200, extra = {}, authorized = true) => { const r = await fetch(site + route, { method: input === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(authorized ? headers : {}), ...extra }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) }); const value = await r.json(); assert.equal(r.status, status, route + ' ' + JSON.stringify(value)); return value; };
  const beforeJournals = await prisma.journalEntry.count({ where: { companyId: t.company.id } });
  try {
    await f.test('Citi-Nati test store: isolated startup, real ERP authorization/catalog/order/status, scope and durable identical retries', async () => {
      assert.throws(() => createStore({ enabled: false })); assert.throws(() => createClient({ baseUrl: 'http://citinati.com', credential: 'x'.repeat(40), localTest: true }));
      channel = (await send('/api/websites', t.admin.token, { name: 'Citi-Nati isolated source test', platform: 'CUSTOM', websiteUrl, scopes: ['catalog:read', 'orders:write', 'orders:read'] }, 201)).channel;
      configuration.credential = (await send(`/api/websites/${channel.id}/credentials/rotate`, t.admin.token, {})).secret;
      server = createStore(configuration); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); site = 'http://127.0.0.1:' + server.address().port; headers = { Authorization: 'Basic ' + Buffer.from('tester:' + configuration.password).toString('base64') };
      await siteRequest('/api/erp-test/catalog', undefined, 401, {}, false); await siteRequest('/api/erp-test/catalog', undefined, 503); await siteRequest('/api/erp-test/catalog', undefined, 403, { Origin: 'https://evil.example.invalid' });
      // Node fetch normalizes Host; use the HTTP client to send a real foreign Host header.
      const foreignHostStatus = await new Promise((resolve, reject) => { const request = require('node:http').get(site + '/api/erp-test/catalog', { headers: { ...headers, Host: 'evil.example.invalid' } }, response => { response.resume(); resolve(response.statusCode); }); request.on('error', reject); }); assert.equal(foreignHostStatus, 403);
      const challenge = await send(`/api/websites/${channel.id}/authorize`, t.admin.token, {});
      await siteRequest('/api/erp-test/connect', { challenge: challenge.challenge }); await send(`/api/websites/${channel.id}/activate`, t.admin.token, {});
      const pubs = await send(`/api/websites/${channel.id}/publication`, t.admin.token, { kind: 'products', isPublished: true, resourceIds: [t.products[0].id, foreign.products[0].id] }); assert.equal(pubs.results.filter(r => r.success).length, 1);
      const catalog = await siteRequest('/api/erp-test/catalog'); assert.equal(catalog.currency, t.company.currency); assert.equal(catalog.products.length, 1); assert.ok(Number(catalog.products[0].availableQuantity) >= 1);
      const key = randomUUID(); body = { key, name: 'Synthetic Citi Test Customer', email: 'citi-test@example.invalid', deliveryAddress: 'Synthetic test delivery address', items: [{ productId: catalog.products[0].id, quantity: 1 }] };
      await siteRequest('/api/erp-test/orders', { ...body, paid: true, total: 1 }, 400); await siteRequest('/api/erp-test/orders', { ...body, email: 'real@example.com' }, 400);
      const result = await siteRequest('/api/erp-test/orders', body, 201); assert.equal(result.externalReference, 'citi-test-' + key); assert.notEqual(result.paymentStatus, 'PAID'); assert.equal(result.pricingVerified, false);
      assert.deepEqual(await siteRequest('/api/erp-test/orders', body, 201), result); await siteRequest('/api/erp-test/orders', { ...body, name: 'Changed retry' }, 409); assert.deepEqual(await siteRequest('/api/erp-test/orders/' + key), result);
      assert.equal(await prisma.onlineOrder.count({ where: { channelId: channel.id } }), 1); assert.equal(await prisma.journalEntry.count({ where: { companyId: t.company.id } }), beforeJournals);
      // Simulate a lost reply after ERP acceptance: preserve the pre-submission request,
      // restart the standalone process and retry without creating a second ERP order.
      const journal = path.join(configuration.dataDir, 'order-' + require('node:crypto').createHash('sha256').update(key).digest('hex') + '.json');
      const pending = JSON.parse(fs.readFileSync(journal, 'utf8')); pending.state = 'PENDING'; fs.writeFileSync(journal, JSON.stringify(pending));
      assert.throws(() => createStore(configuration), /EEXIST/);
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
      server = createStore(configuration); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); site = 'http://127.0.0.1:' + server.address().port;
      assert.deepEqual(await siteRequest('/api/erp-test/orders', body, 201), result); assert.equal(await prisma.onlineOrder.count({ where: { channelId: channel.id } }), 1);
      for (const resource of ['/', '/store.js', '/brand.css']) { const response = await fetch(site + resource, { headers }); assert.equal(response.status, 200); assert.ok(!(await response.text()).includes(configuration.credential)); }
      const sub = await send(`/api/websites/${channel.id}/subscription`, t.admin.token, { endpointUrl: websiteUrl + '/api/erp-test/notifications', eventTypes: ['connection.test', 'catalog.changed', 'order.status', 'order.fulfillment'], isActive: true }, 200, 'PUT'); configuration.signingSecret = sub.secret;
    });
    await f.test('Citi-Nati receiver: actual ERP outbox signatures, durable acknowledgement/replay and no fabricated payment confirmation', async () => {
      const queued = await send(`/api/websites/${channel.id}/notifications/test`, t.admin.token, {});
      await deliverDueEvents({ limit: 100, transport: async request => {
        if (!request.url.startsWith(websiteUrl + '/')) throw new Error('Isolated Citi test receiver only');
        rawNotification = request.body; notificationHeaders = request.headers;
        const response = await fetch(site + '/api/erp-test/notifications', { method: 'POST', headers: request.headers, body: request.body }); return { status: response.status, body: await response.text() };
      } });
      const delivered = await prisma.websiteEventDelivery.findFirstOrThrow({ where: { eventId: queued.eventId } }); assert.equal(delivered.state, 'DELIVERED');
      // Capture the matching connection.test event, rather than other catalog/order deliveries.
      const event = await prisma.websiteEvent.findUniqueOrThrow({ where: { id: queued.eventId } });
      const raw = JSON.stringify({ id: event.id, type: event.type, createdAt: event.createdAt.toISOString(), data: event.payload });
      const timestamp = String(Math.floor(Date.now() / 1000)); const signed = content => ({ 'Content-Type': 'application/json', 'X-AubieOne-Event-Id': event.id, 'X-AubieOne-Timestamp': timestamp, 'X-AubieOne-Signature': 'sha256=' + createHmac('sha256', configuration.signingSecret).update(timestamp + '.' + content).digest('hex') });
      // The exact ERP-delivered bytes are required for an identical replay.
      const attempt = await prisma.websiteDeliveryAttempt.findFirstOrThrow({ where: { deliveryId: delivered.id }, orderBy: { createdAt: 'desc' } }); assert.equal(attempt.status, 200);
      const replay = await send(`/api/websites/${channel.id}/deliveries/${delivered.id}/replay`, t.admin.token, {}); assert.equal(replay.eventId, event.id);
      await deliverDueEvents({ limit: 100, transport: async request => { if (!request.url.startsWith(websiteUrl + '/')) throw new Error('Isolated Citi test receiver only'); const response = await fetch(site + '/api/erp-test/notifications', { method: 'POST', headers: request.headers, body: request.body }); return { status: response.status, body: await response.text() }; } });
      assert.equal((await prisma.websiteEventDelivery.findUniqueOrThrow({ where: { id: delivered.id } })).state, 'DELIVERED');
      const bad = await fetch(site + '/api/erp-test/notifications', { method: 'POST', headers: { ...signed(raw), 'X-AubieOne-Signature': 'sha256=' + '0'.repeat(64) }, body: raw }); assert.equal(bad.status, 401);
      const changed = JSON.stringify({ id: event.id, type: event.type, createdAt: event.createdAt.toISOString(), data: { ...event.payload, changed: true } }); assert.equal((await fetch(site + '/api/erp-test/notifications', { method: 'POST', headers: signed(changed), body: changed })).status, 409);
      const expired = String(Math.floor(Date.now() / 1000) - 600); const old = await fetch(site + '/api/erp-test/notifications', { method: 'POST', headers: { ...signed(raw), 'X-AubieOne-Timestamp': expired, 'X-AubieOne-Signature': 'sha256=' + createHmac('sha256', configuration.signingSecret).update(expired + '.' + raw).digest('hex') }, body: raw }); assert.equal(old.status, 401);
      const fakeId = 'test-' + randomUUID(), fake = JSON.stringify({ id: fakeId, type: 'order.status', data: { externalReference: 'citi-test-' + body.key, paymentStatus: 'PAID', amount: 999999 } }); const fakeHeaders = { ...signed(fake), 'X-AubieOne-Event-Id': fakeId };
      assert.equal((await fetch(site + '/api/erp-test/notifications', { method: 'POST', headers: fakeHeaders, body: fake })).status, 200); assert.notEqual((await siteRequest('/api/erp-test/orders/' + body.key)).paymentStatus, 'PAID');
      assert.equal(await prisma.journalEntry.count({ where: { companyId: t.company.id } }), beforeJournals);
    });
    await f.test('Citi-Nati source test store: actual browser catalog, checkout, ERP status and identical retry', async () => {
      const command = path.resolve('..', 'desktop', 'node_modules', 'electron', 'cli.js');
      const fallback = path.resolve('..', '..', 'node_modules', 'electron', 'cli.js');
      const exitCode = await new Promise((resolve, reject) => { const child = spawn(process.execPath, [fs.existsSync(command) ? command : fallback, path.join(__dirname, 'verify-browser.cjs')], { windowsHide: true, env: { ...process.env, CITI_TEST_URL: site, CITI_TEST_OPERATOR: configuration.username, CITI_TEST_PASSWORD: configuration.password, CITI_TEST_OUTPUT: output } }); child.stdout.on('data', d => process.stdout.write(d)); child.stderr.on('data', d => process.stderr.write(d)); child.once('error', reject); child.once('close', resolve); });
      assert.equal(exitCode, 0); assert.equal(await prisma.onlineOrder.count({ where: { channelId: channel.id } }), 2); assert.equal(await prisma.journalEntry.count({ where: { companyId: t.company.id } }), beforeJournals);
    });
    f.evidence.citiNatiSourceTest = { repository: 'AubieOB/citi-nati-supermarket', sourceBranch: 'codex/erp-storefront-test', sourceBase: '39b5ca79f9690347c5c90f76ee6a6273afbbc340', siteChannelId: channel.id, checks: 3, browserCases: 1, sampleOrders: 2, verification: 'Actual Citi-source isolated test store against real isolated ERP APIs; real signed outbox forwarded through test-only transport to loopback receiver', originalCheckout: 'UNCHANGED; test store imports no Citi database/payments/POS/server modules', websiteDatabaseAccess: false, liveSiteMutation: false, liveVpsVerification: 'PENDING isolated deployment, public HTTPS callback and approved test ERP access', screenshot: path.join(output, 'citi-test-store.png') };
  } finally { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } if (channel) await send(`/api/websites/${channel.id}/disable`, t.admin.token, {}); }
}
module.exports = { customSiteAcceptance };
