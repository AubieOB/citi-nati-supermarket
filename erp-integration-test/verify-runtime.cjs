'use strict';
// Runtime-only probe: no ERP requests, Citi database, payments, PM2 or Nginx access.
const assert = require('node:assert/strict'), http = require('node:http');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { randomUUID, createHmac } = require('node:crypto');
const { createStore } = require('./server.cjs');
const { createClient } = require('./client.cjs');
async function verify() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citi-erp-runtime-'));
  const config = { enabled: true, testTenantConfirmed: true, baseUrl: 'http://127.0.0.1:1',
    localTest: true, credential: randomUUID() + randomUUID(), signingSecret: randomUUID() + randomUUID(),
    username: 'runtime-test', password: randomUUID(), dataDir };
  let server;
  const start = async () => { server = createStore(config); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); };
  const stop = async () => { if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
  const request = (route, headers = {}, body) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: route,
      method: body === undefined ? 'GET' : 'POST', headers }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    }); req.on('error', reject); req.end(body);
  });
  try {
    assert.throws(() => createStore({ enabled: false }));
    assert.throws(() => createClient({ baseUrl: 'http://example.invalid', credential: config.credential, localTest: true }));
    await start(); assert.equal(server.address().address, '127.0.0.1');
    assert.throws(() => createStore(config));
    assert.equal((await request('/')).status, 401);
    const auth = { Authorization: 'Basic ' + Buffer.from(config.username + ':' + config.password).toString('base64') };
    assert.equal((await request('/', { ...auth, Host: 'wrong.invalid' })).status, 403);
    const page = await request('/', auth);
    assert.equal(page.status, 200); assert.ok(page.headers['content-security-policy']);
    assert.ok(!page.body.includes(config.credential));
    for (const route of ['/store.js', '/store.css', '/brand.css', '/brand-logo.png']) assert.equal((await request(route, auth)).status, 200);
    const id = 'runtime-' + randomUUID(), timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ id, type: 'connection.test', data: { reference: 'synthetic-runtime-only' } });
    const headers = { 'Content-Type': 'application/json', 'x-aubieone-event-id': id, 'x-aubieone-timestamp': timestamp,
      'x-aubieone-signature': 'sha256=' + createHmac('sha256', config.signingSecret).update(timestamp + '.').update(body).digest('hex') };
    assert.equal((await request('/api/erp-test/notifications', { ...headers, 'x-aubieone-signature': 'invalid' }, body)).status, 401);
    assert.equal((await request('/api/erp-test/notifications', headers, body)).status, 200);
    assert.equal((await request('/api/erp-test/notifications', headers, body)).status, 200);
    if (process.platform !== 'win32') {
      const files = fs.readdirSync(dataDir);
      for (const file of files) assert.equal(fs.statSync(path.join(dataDir, file)).mode & 0o077, 0);
    }
    await stop(); assert.ok(!fs.existsSync(path.join(dataDir, 'process.lock')));
    await start(); assert.equal((await request('/api/erp-test/notifications', headers, body)).status, 200);
    const changed = JSON.stringify({ id, type: 'connection.test', data: { reference: 'different' } });
    const changedHeaders = { ...headers, 'x-aubieone-signature': 'sha256=' + createHmac('sha256', config.signingSecret).update(timestamp + '.').update(changed).digest('hex') };
    assert.equal((await request('/api/erp-test/notifications', changedHeaders, changed)).status, 409);
    console.log(JSON.stringify({ success: true, node: process.version, platform: process.platform,
      checks: ['disabled startup and transport boundary', 'loopback, operator authentication and static assets', 'signed durable notification retry after restart', 'exclusive journal ownership and private file permissions'],
      erpRequests: 0, websiteDatabaseAccess: false, liveWebsiteMutation: false, evidenceDirectory: dataDir }));
  } finally { await stop(); }
}
verify().catch(() => { console.error('Runtime verification failed; temporary evidence retained. No database or ERP access was performed.'); process.exitCode = 1; });
