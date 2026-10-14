'use strict';
// Independent operator test store. Never imports Citi-Nati's server, Prisma, payments or POS.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { createHash, createHmac, timingSafeEqual, randomUUID } = require('node:crypto');
const { createClient, IntegrationError } = require('./client.cjs');
const digest = value => createHash('sha256').update(value).digest('hex');
function same(a, b) { const x = Buffer.from(a || ''), y = Buffer.from(b || ''); return x.length === y.length && timingSafeEqual(x, y); }
function createStore(config) {
  const isolated = config.testTenantConfirmed === true, existing = config.existingDevelopmentTenantConfirmed === true;
  if (config.enabled !== true || isolated === existing) throw new Error('Confirm exactly one approved ERP test context before enabling this store.');
  if (existing) { const target = new URL(config.baseUrl); if (!config.localTest || config.siteOrigin || target.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(target.hostname) || !config.tenantName || config.tenantName.length > 200) throw new Error('An existing development tenant requires explicit identity and private loopback transport.'); }
  if (!config.password || config.password.length < 16 || !config.signingSecret || config.signingSecret.length < 32) throw new Error('Set separate operator and notification secrets.');
  if (config.siteOrigin) { const origin = new URL(config.siteOrigin); if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || origin.protocol !== 'https:') throw new Error('Configure the exact HTTPS test website origin.'); }
  const client = createClient(config), dir = path.resolve(config.dataDir || path.join(__dirname, 'data'));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, 'process.lock'), lockFd = fs.openSync(lock, 'wx', 0o600); fs.writeFileSync(lockFd, String(process.pid));
  let chain = Promise.resolve();
  const exclusive = work => { const result = chain.then(work); chain = result.catch(() => undefined); return result; };
  const file = (kind, key) => path.join(dir, kind + '-' + digest(key) + '.json');
  const load = (kind, key) => { const name = file(kind, key); return fs.existsSync(name) ? JSON.parse(fs.readFileSync(name, 'utf8')) : null; };
  const save = (kind, key, value) => { const target = file(kind, key), temporary = target + '.' + randomUUID() + '.tmp'; const fd = fs.openSync(temporary, 'wx', 0o600); try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } fs.renameSync(temporary, target); if (process.platform !== 'win32') { const directory = fs.openSync(dir, 'r'); try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); } } };
  const read = async req => { const chunks = []; let bytes = 0; for await (const chunk of req) { bytes += chunk.length; if (bytes > 65536) throw new IntegrationError(413, 'The request is too large.'); chunks.push(chunk); } return Buffer.concat(chunks); };
  const object = async req => { const value = JSON.parse((await read(req)).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new IntegrationError(400, 'Check the request details.'); return value; };
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const staticFiles = { '/': ['index.html', 'text/html'], '/store.js': ['store.js', 'text/javascript'], '/store.css': ['store.css', 'text/css'], '/brand.css': ['../citi-nati-frontend/src/styles/global.css', 'text/css'], '/brand-logo.png': ['../citi-nati-frontend/src/assets/citi-nati-full-logo.png', 'image/png'] };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'");
    try {
      const host = String(req.headers.host || ''), allowed = config.siteOrigin ? new URL(config.siteOrigin).host : '127.0.0.1:' + server.address().port;
      if (host !== allowed) throw new IntegrationError(403, 'Use the configured test website address.');
      const origin = config.siteOrigin || 'http://' + allowed;
      if (req.headers.origin && req.headers.origin !== origin) throw new IntegrationError(403, 'This request must come from the test website.');
      const route = new URL(req.url, origin).pathname;
      if (route === '/api/erp-test/notifications' && req.method === 'POST') {
        const raw = await read(req), timestamp = String(req.headers['x-aubieone-timestamp'] || ''), id = String(req.headers['x-aubieone-event-id'] || '');
        if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new IntegrationError(401, 'Notification authentication failed.');
        const signature = 'sha256=' + createHmac('sha256', config.signingSecret).update(timestamp + '.').update(raw).digest('hex');
        if (!same(req.headers['x-aubieone-signature'], signature)) throw new IntegrationError(401, 'Notification authentication failed.');
        const event = JSON.parse(raw.toString('utf8'));
        if (event.id !== id || !['connection.test', 'catalog.changed', 'order.status', 'order.fulfillment'].includes(event.type) || !event.data || typeof event.data !== 'object') throw new IntegrationError(400, 'Invalid notification.');
        await exclusive(async () => { const prior = load('event', id), hash = digest(raw); if (prior && prior.hash !== hash) throw new IntegrationError(409, 'Notification identifier conflicts with previous evidence.'); if (!prior) save('event', id, { hash, id, type: event.type, receivedAt: new Date().toISOString(), externalReference: typeof event.data.externalReference === 'string' ? event.data.externalReference : null }); });
        return json(res, 200, { received: true }); // Durable acknowledgement only. Never changes payments, stock or customer order status.
      }
      const auth = 'Basic ' + Buffer.from((config.username || 'tester') + ':' + config.password).toString('base64');
      if (!same(req.headers.authorization, auth)) { res.setHeader('WWW-Authenticate', 'Basic realm="Citi-Nati isolated ERP test", charset="UTF-8"'); return json(res, 401, { message: 'Sign in with the test operator account.' }); }
      if (route === '/api/erp-test/context' && req.method === 'GET') return json(res, 200, { kind: existing ? 'EXISTING_DEVELOPMENT_TENANT' : 'ISOLATED_TEST_TENANT', tenantName: config.tenantName || null });
      if (req.method === 'GET' && staticFiles[route]) { const [name, type] = staticFiles[route]; res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); return res.end(fs.readFileSync(path.resolve(__dirname, name))); }
      if (route === '/api/erp-test/catalog' && req.method === 'GET') return json(res, 200, await client.catalog());
      if (route === '/api/erp-test/connect' && req.method === 'POST') { const body = await object(req); if (Object.keys(body).length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(body.challenge || '')) throw new IntegrationError(400, 'Enter the issued connection challenge.'); return json(res, 200, await client.prove(body.challenge)); }
      if (route === '/api/erp-test/orders' && req.method === 'POST') {
        const body = await object(req);
        if (Object.keys(body).some(k => !['key', 'name', 'email', 'deliveryAddress', 'items'].includes(k)) || !/^[0-9a-f-]{36}$/i.test(body.key || '') || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200 || !/^[^\s@]+@[^\s@]+\.invalid$/i.test(body.email || '') || typeof body.deliveryAddress !== 'string' || !body.deliveryAddress.trim() || body.deliveryAddress.length > 1000 || !Array.isArray(body.items) || !body.items.length || body.items.length > 100 || body.items.some(i => !i || typeof i !== 'object' || Array.isArray(i) || Object.keys(i).some(k => !['productId', 'quantity'].includes(k)) || typeof i.productId !== 'string' || !i.productId || i.productId.length > 100 || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 100000)) throw new IntegrationError(400, 'Use sample details, an .invalid email address and whole product quantities.');
        const result = await exclusive(async () => {
          const fingerprint = digest(JSON.stringify(body)); let attempt = load('order', body.key);
          if (attempt && attempt.fingerprint !== fingerprint) throw new IntegrationError(409, 'This submission was already used for different order details.');
          if (!attempt) { const catalog = await client.catalog(); const input = { externalReference: 'citi-test-' + body.key, idempotencyKey: 'citi-test-' + body.key, customer: { externalId: 'citi-test-' + digest(body.email.toLowerCase()).slice(0,32), name: body.name.trim(), email: body.email.toLowerCase() }, deliveryAddress: body.deliveryAddress.trim(), currency: catalog.currency, items: body.items }; attempt = { fingerprint, input, state: 'PENDING' }; save('order', body.key, attempt); }
          if (attempt.state !== 'ACCEPTED') { await client.order(attempt.input); attempt.state = 'ACCEPTED'; save('order', body.key, attempt); }
          return client.status(attempt.input.externalReference);
        });
        return json(res, 201, result);
      }
      if (route.startsWith('/api/erp-test/orders/') && req.method === 'GET') { const key = route.slice('/api/erp-test/orders/'.length), attempt = load('order', key); if (!attempt) throw new IntegrationError(404, 'Test order not found.'); return json(res, 200, await client.status(attempt.input.externalReference)); }
      return json(res, 404, { message: 'Page not found.' });
    } catch (error) { return json(res, error instanceof IntegrationError ? error.status : error instanceof SyntaxError ? 400 : 503, { message: error instanceof IntegrationError ? error.message : error instanceof SyntaxError ? 'Check the request details.' : 'The request could not be confirmed. Retry the same submission.' }); }
  });
  server.on('close', () => { fs.closeSync(lockFd); fs.unlinkSync(lock); });
  return server;
}
function start() {
  const env = process.env;
  const port = Number(env.CITI_ERP_TEST_PORT || 5081); if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose an unused test port between 1024 and 65535.');
  const server = createStore({ enabled: env.CITI_ERP_TEST_ENABLED === 'true', testTenantConfirmed: env.CITI_ERP_TEST_TENANT_CONFIRMED === 'ISOLATED_TEST_ONLY', existingDevelopmentTenantConfirmed: env.CITI_ERP_TEST_TENANT_CONFIRMED === 'EXISTING_DEVELOPMENT_TENANT_TEST', tenantName: env.ERP_TEST_TENANT_NAME, baseUrl: env.ERP_TEST_BASE_URL, credential: env.ERP_TEST_CREDENTIAL, signingSecret: env.ERP_TEST_SIGNING_SECRET, username: env.ERP_TEST_OPERATOR, password: env.ERP_TEST_OPERATOR_PASSWORD, siteOrigin: env.CITI_ERP_TEST_ORIGIN, localTest: env.NODE_ENV === 'test', dataDir: env.CITI_ERP_TEST_DATA_DIR });
  server.listen(port, '127.0.0.1', () => console.log('Citi-Nati isolated test store listening on loopback port ' + port));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
if (require.main === module) { try { start(); } catch { console.error('Test store configuration needs review. Live website startup and database configuration are not used.'); process.exitCode = 1; } }
module.exports = { createStore };
