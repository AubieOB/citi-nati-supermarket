'use strict';
const node = id => document.getElementById(id);
let catalog, pending;
const message = (text, error = false) => { node('message').textContent = text; node('message').dataset.error = String(error); };
async function request(route, body) {
  const r = await fetch('/api/erp-test/' + route, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await r.json(); if (!r.ok) throw new Error(result.message || 'The request could not be confirmed.'); return result;
}
function displayOrder(order) {
  node('order-panel').hidden = false; node('order').replaceChildren();
  for (const [label, value] of [['Website reference', order.externalReference], ['ERP reference', order.reference], ['Order status', order.status], ['Payment status', order.paymentStatus], ['Fulfillment', order.fulfillmentStatus], ['Currency', order.currency], ['Total', order.total], ['Pricing', order.pricingVerified ? 'Validated by ERP' : 'Awaiting ERP validation']]) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value ?? 'Awaiting ERP processing'; node('order').append(dt, dd); }
}
async function reload() {
  catalog = await request('catalog'); node('products').replaceChildren();
  node('pricing').textContent = 'Currency: ' + catalog.currency + '. Catalog prices exclude tax; ERP validates the final order total.';
  for (const product of catalog.products) {
    const card = document.createElement('article'); card.className = 'test-product';
    const h = document.createElement('h3'); h.textContent = product.name; card.append(h);
    if (product.imageUrl) { try { const u = new URL(product.imageUrl); if (u.protocol === 'https:') { const img = document.createElement('img'); img.src = u.href; img.alt = product.name; card.append(img); } } catch {} }
    const price = document.createElement('p'); price.textContent = new Intl.NumberFormat(undefined, { style: 'currency', currency: catalog.currency }).format(Number(product.unitPrice)); card.append(price);
    const stock = document.createElement('p'); stock.textContent = 'Available: ' + product.availableQuantity; card.append(stock);
    const label = document.createElement('label'); label.textContent = 'Quantity'; const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = String(Math.max(0, Math.floor(product.availableQuantity))); input.step = '1'; input.value = '0'; input.dataset.product = product.id; label.append(input); card.append(label); node('products').append(card);
  }
  if (!catalog.products.length) node('products').textContent = 'Publish sample products in ERP Websites, then refresh this catalog.';
  message('Published test catalog loaded.');
}
async function work(button, fn) { button.disabled = true; try { await fn(); } catch (e) { message(e.message || 'Please retry the request.', true); } finally { button.disabled = false; } }
node('reload').addEventListener('click', () => work(node('reload'), reload));
node('connection').addEventListener('submit', e => { e.preventDefault(); const button = e.currentTarget.querySelector('button'); work(button, async () => { await request('connect', { challenge: node('challenge').value }); node('challenge').value = ''; message('Connection confirmed. Activate the connection in ERP, then refresh products.'); }); });
node('checkout').addEventListener('submit', e => { e.preventDefault(); work(node('submit'), async () => {
  if (!pending) { const items = [...document.querySelectorAll('[data-product]')].filter(i => Number(i.value) > 0).map(i => ({ productId: i.dataset.product, quantity: Number(i.value) })); if (!items.length) throw new Error('Choose at least one product quantity.'); pending = { key: crypto.randomUUID(), name: node('name').value, email: node('email').value, deliveryAddress: node('address').value, items }; }
  const result = await request('orders', pending); displayOrder(result); message('Test order received by ERP. Payment remains subject to Finance evidence.'); node('submit').textContent = 'Retry Same Test Order';
}); });
node('refresh-order').addEventListener('click', () => work(node('refresh-order'), async () => { if (!pending) throw new Error('Submit a test order first.'); displayOrder(await request('orders/' + pending.key)); message('Current ERP status loaded.'); }));
work(node('reload'), reload);
