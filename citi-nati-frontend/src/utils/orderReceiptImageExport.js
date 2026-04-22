import html2canvas from 'html2canvas';
import logo from '../assets/citi-nati-logo.png.png';

const BRAND = {
  purple: '#5B4B8A',
  green: '#2D8659',
  red: '#B91C1C',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  background: '#F8FAFC',
};

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const safeText = (value, fallback = '-') => {
  const text = value == null ? '' : String(value).trim();
  return text.length ? text : fallback;
};

export async function exportOrderReceiptImage({
  order,
  title = 'Order Receipt',
  format = 'png',
} = {}) {
  if (!order) return;

  const generated = new Date().toLocaleString('en-GB');
  const orderDate = order.createdAt
    ? new Date(order.createdAt).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : '-';

  const items = Array.isArray(order.items) ? order.items : [];
  const computedSubtotal = items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
  const subtotal = Number(order.subtotalAmount ?? computedSubtotal);
  const deliveryFee = Number(order.deliveryFeeAmount ?? 0);
  const total = Number(order.finalTotalAmount ?? order.total ?? (subtotal + deliveryFee));

  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: -9999px;
    width: 900px;
    background: white;
    padding: 42px;
    font-family: Arial, sans-serif;
    color: ${BRAND.text};
    z-index: -1;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 18px;
    border-bottom: 2px solid ${BRAND.border};
    padding-bottom: 18px;
  `;

  const logoImg = document.createElement('img');
  logoImg.src = logo;
  logoImg.style.cssText = 'height: 76px; width: auto;';
  header.appendChild(logoImg);

  const headerTitle = document.createElement('div');
  headerTitle.style.cssText = 'flex: 1; min-width: 0;';
  headerTitle.innerHTML = `
    <div style="font-size: 36px; font-weight: bold; margin-bottom: 4px; white-space: nowrap; line-height: 1.1;">
      <span style="color: ${BRAND.purple};">Citi-</span><span style="color: ${BRAND.green};">Nati Supermarket</span>
    </div>
    <div style="font-size: 27px; font-weight: bold; color: ${BRAND.text}; margin-top: 4px; white-space: nowrap; line-height: 1.15;">${title}</div>
    <div style="font-size: 15px; color: ${BRAND.muted}; margin-top: 6px;">Generated on: ${generated}</div>
  `;
  header.appendChild(headerTitle);
  container.appendChild(header);

  const infoSection = document.createElement('div');
  infoSection.style.cssText = `
    margin-bottom: 26px;
    border: 1px solid ${BRAND.border};
    border-radius: 8px;
    overflow: hidden;
  `;

  const infoTitle = document.createElement('div');
  infoTitle.style.cssText = `
    background-color: ${BRAND.background};
    padding: 12px 16px;
    font-weight: bold;
    font-size: 23px;
    border-bottom: 1px solid ${BRAND.border};
  `;
  infoTitle.textContent = 'Receipt Details';
  infoSection.appendChild(infoTitle);

  const infoRows = [
    ['Order ID', `#${safeText(order.id, 'N/A')}`],
    ['Order Date', orderDate],
    ['Order Status', safeText(order.status)],
    ['Payment Status', safeText(order.paymentStatus)],
    ['Customer', safeText(order.user?.name || order.customerName || order.userName)],
  ];

  const infoTable = document.createElement('table');
  infoTable.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 20px;
  `;

  infoRows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.style.cssText = idx < infoRows.length - 1 ? `border-bottom: 1px solid ${BRAND.border};` : '';

    const td1 = document.createElement('td');
    td1.style.cssText = `
      padding: 10px 16px;
      font-weight: bold;
      width: 34%;
      background-color: ${idx % 2 === 0 ? 'white' : BRAND.background};
    `;
    td1.textContent = row[0];

    const td2 = document.createElement('td');
    td2.style.cssText = `
      padding: 10px 16px;
      width: 66%;
      background-color: ${idx % 2 === 0 ? 'white' : BRAND.background};
    `;
    td2.textContent = row[1];

    tr.appendChild(td1);
    tr.appendChild(td2);
    infoTable.appendChild(tr);
  });

  infoSection.appendChild(infoTable);
  container.appendChild(infoSection);

  const itemsSection = document.createElement('div');
  itemsSection.style.cssText = `
    margin-bottom: 26px;
    border: 1px solid ${BRAND.border};
    border-radius: 8px;
    overflow: hidden;
  `;

  const itemsTitle = document.createElement('div');
  itemsTitle.style.cssText = `
    background-color: ${BRAND.green};
    color: white;
    padding: 12px 16px;
    font-weight: bold;
    font-size: 23px;
  `;
  itemsTitle.textContent = `Items (${items.length})`;
  itemsSection.appendChild(itemsTitle);

  const itemsTable = document.createElement('table');
  itemsTable.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 18px;
  `;

  const headerRow = document.createElement('tr');
  headerRow.style.cssText = `border-bottom: 1px solid ${BRAND.border}; background: ${BRAND.background};`;
  [['#', '8%'], ['Description', '45%'], ['Qty', '12%'], ['Unit Price', '17%'], ['Total', '18%']].forEach(([label, width]) => {
    const th = document.createElement('th');
    th.style.cssText = `padding: 11px 12px; text-align: left; font-weight: 700; color: ${BRAND.text}; width: ${width};`;
    th.textContent = label;
    if (label === 'Qty') th.style.textAlign = 'center';
    if (label === 'Unit Price' || label === 'Total') th.style.textAlign = 'right';
    headerRow.appendChild(th);
  });
  itemsTable.appendChild(headerRow);

  items.forEach((item, idx) => {
    const qty = Number(item.quantity || 0);
    const unitPrice = Number(item.price || 0);
    const lineTotal = qty * unitPrice;

    const tr = document.createElement('tr');
    tr.style.cssText = `border-bottom: 1px solid ${BRAND.border}; background: ${idx % 2 === 0 ? 'white' : BRAND.background};`;

    const numberCell = document.createElement('td');
    numberCell.style.cssText = 'padding: 10px 12px; color: #475569;';
    numberCell.textContent = String(idx + 1);
    tr.appendChild(numberCell);

    const descCell = document.createElement('td');
    descCell.style.cssText = 'padding: 10px 12px;';
    descCell.innerHTML = `<div style="font-weight: 600;">${safeText(item.product?.name || item.productName, 'Product')}</div>`;
    tr.appendChild(descCell);

    const qtyCell = document.createElement('td');
    qtyCell.style.cssText = 'padding: 10px 12px; text-align: center;';
    qtyCell.textContent = String(qty);
    tr.appendChild(qtyCell);

    const unitCell = document.createElement('td');
    unitCell.style.cssText = 'padding: 10px 12px; text-align: right; font-weight: 600;';
    unitCell.textContent = money(unitPrice);
    tr.appendChild(unitCell);

    const totalCell = document.createElement('td');
    totalCell.style.cssText = `padding: 10px 12px; text-align: right; font-weight: 700; color: ${BRAND.green};`;
    totalCell.textContent = money(lineTotal);
    tr.appendChild(totalCell);

    itemsTable.appendChild(tr);
  });

  const subtotalRow = document.createElement('tr');
  subtotalRow.style.cssText = `background: ${BRAND.background}; border-top: 1px solid ${BRAND.border};`;
  subtotalRow.innerHTML = `
    <td colspan="4" style="padding: 10px 12px; text-align: right; font-weight: 700;">Subtotal</td>
    <td style="padding: 10px 12px; text-align: right; font-weight: 700;">${money(subtotal)}</td>
  `;
  itemsTable.appendChild(subtotalRow);

  const deliveryRow = document.createElement('tr');
  deliveryRow.style.cssText = 'background: #f0f9f6;';
  deliveryRow.innerHTML = `
    <td colspan="4" style="padding: 10px 12px; text-align: right; font-weight: 700;">Delivery Fee</td>
    <td style="padding: 10px 12px; text-align: right; font-weight: 700;">${money(deliveryFee)}</td>
  `;
  itemsTable.appendChild(deliveryRow);

  const grandTotalRow = document.createElement('tr');
  grandTotalRow.style.cssText = `background: ${BRAND.purple};`;
  grandTotalRow.innerHTML = `
    <td colspan="4" style="padding: 12px; text-align: right; font-weight: 800; color: white; font-size: 20px;">TOTAL</td>
    <td style="padding: 12px; text-align: right; font-weight: 800; color: white; font-size: 20px;">${money(total)}</td>
  `;
  itemsTable.appendChild(grandTotalRow);

  itemsSection.appendChild(itemsTable);
  container.appendChild(itemsSection);

  const addressCard = document.createElement('div');
  addressCard.style.cssText = `
    border: 1px solid ${BRAND.border};
    border-radius: 8px;
    padding: 16px;
    background-color: #FFFBEB;
    margin-bottom: 20px;
  `;
  addressCard.innerHTML = `
    <div style="font-weight: bold; font-size: 22px; margin-bottom: 8px; color: ${BRAND.text};">Delivery Address</div>
    <div style="font-size: 18px; line-height: 1.6; color: ${BRAND.muted}; white-space: pre-wrap; word-wrap: break-word;">
      ${safeText(order.deliveryAddress)}${order.houseNumber ? `<br>${safeText(order.houseNumber, '')}` : ''}
    </div>
  `;
  container.appendChild(addressCard);

  const statusCard = document.createElement('div');
  const statusColor = String(order.paymentStatus || '').toUpperCase() === 'PAID' ? BRAND.green : BRAND.red;
  statusCard.style.cssText = `
    border: 1px solid ${BRAND.border};
    border-left: 6px solid ${statusColor};
    border-radius: 8px;
    padding: 14px 16px;
    background-color: #ffffff;
  `;
  statusCard.innerHTML = `
    <div style="font-size: 18px; color: ${BRAND.text}; line-height: 1.5;">
      Thank you for shopping with Citi-Nati. Your order is currently <strong>${safeText(order.status)}</strong> and payment is <strong style="color:${statusColor}">${safeText(order.paymentStatus)}</strong>.
    </div>
  `;
  container.appendChild(statusCard);

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 3,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      allowTaint: true,
    });

    const safeDate = order.createdAt ? new Date(order.createdAt).toISOString().slice(0, 10) : 'receipt';
    const safeId = String(order.id || 'order').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `receipt-order-${safeId}-${safeDate}.${format}`;

    if (format === 'png') {
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = filename;
      link.click();
    } else if (format === 'jpg') {
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.download = filename;
      link.click();
    }
  } catch (error) {
    console.error('Error generating receipt image:', error);
    throw error;
  } finally {
    document.body.removeChild(container);
  }
}