'use strict';
const { app, BrowserWindow } = require('electron'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const origin = new URL(process.env.CITI_TEST_URL); assert.equal(origin.hostname, '127.0.0.1');
app.setPath('userData', path.join(process.env.CITI_TEST_OUTPUT, 'browser-profile')); app.commandLine.appendSwitch('disable-gpu');
app.on('login', (event, _contents, _request, auth, callback) => { event.preventDefault(); if (auth.host === origin.hostname && String(auth.port) === origin.port) callback(process.env.CITI_TEST_OPERATOR, process.env.CITI_TEST_PASSWORD); else callback(); });
async function wait(fn) { const deadline = Date.now() + 30000; while (Date.now() < deadline) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); } throw new Error('Test storefront UI timed out.'); }
(async () => { await app.whenReady(); const window = new BrowserWindow({ show: false, width: 1280, height: 1000, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: new URL(details.url).origin !== origin.origin }));
  const js = code => window.webContents.executeJavaScript(code); await window.loadURL(origin.href);
  await wait(() => js(`document.querySelectorAll('[data-product]').length===1`));
  assert.equal(await js(`document.body.textContent.includes('Isolated test store')`), true);
  await js(`document.getElementById('email').value='citi-browser-'+crypto.randomUUID()+'@example.invalid';document.querySelector('[data-product]').value='1';document.getElementById('submit').click()`);
  await wait(() => js(`!document.getElementById('order-panel').hidden`));
  assert.equal(await js(`document.getElementById('order').textContent.includes('Awaiting ERP validation')`), true);
  const first = await js(`document.getElementById('order').textContent`); await js(`document.getElementById('submit').click()`); await wait(() => js(`!document.getElementById('submit').disabled`)); assert.equal(await js(`document.getElementById('order').textContent`), first);
  await js(`document.getElementById('refresh-order').click()`); await wait(() => js(`document.getElementById('message').textContent==='Current ERP status loaded.'`));
  fs.writeFileSync(path.join(process.env.CITI_TEST_OUTPUT, 'citi-test-store.png'), (await window.webContents.capturePage()).toPNG());
  console.log('PASS Citi-Nati actual browser: isolated catalog, sample checkout, identical retry and ERP Finance status'); window.destroy(); app.quit();
})().catch(error => { console.error(error.message); app.exit(1); });
