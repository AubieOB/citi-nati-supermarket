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

export async function exportQuotationReportImage({
  quotation,
  title = 'Quotation',
  format = 'png',
} = {}) {
  if (!quotation) return;

  const generated = new Date().toLocaleString('en-GB');
  const vatEnabled = quotation?.vatEnabled !== false;
  const vatRate = Number(quotation?.configuredVatRatePercent || quotation?.vatRatePercent || 0);
  const clientName = quotation?.clientName || '-';

  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: -9999px;
    width: 820px;
    background: white;
    padding: 40px;
    font-family: Arial, sans-serif;
    color: ${BRAND.text};
    z-index: -1;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 16px;
    border-bottom: 2px solid ${BRAND.border};
    padding-bottom: 16px;
  `;

  const logoImg = document.createElement('img');
  logoImg.src = logo;
  logoImg.style.cssText = 'height: 74px; width: auto;';
  header.appendChild(logoImg);

  const headerTitle = document.createElement('div');
  headerTitle.style.cssText = 'flex: 1; min-width: 0;';
  headerTitle.innerHTML = `
    <div style="font-size: 35px; font-weight: bold; margin-bottom: 4px; white-space: nowrap; line-height: 1.1;">
      <span style="color: ${BRAND.purple};">Citi-</span><span style="color: ${BRAND.green};">Nati Supermarket</span>
    </div>
    <div style="font-size: 25px; font-weight: bold; color: ${BRAND.text}; margin-top: 4px; white-space: nowrap; line-height: 1.15;">${title}</div>
    <div style="font-size: 15px; color: ${BRAND.muted}; margin-top: 6px;">Generated on: ${generated}</div>
  `;
  header.appendChild(headerTitle);

  container.appendChild(header);

  const infoSection = document.createElement('div');
  infoSection.style.cssText = `
    margin-bottom: 28px;
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
  infoTitle.textContent = 'Quotation Details';
  infoSection.appendChild(infoTitle);

  const infoRows = [
    ['Reference', quotation.quotationRef || '-'],
    ['Client', clientName],
    ['Date', quotation.createdAt ? new Date(quotation.createdAt).toLocaleDateString('en-GB') : '-'],
    ['Valid Until', quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString('en-GB') : 'N/A'],
    ['Prepared By', quotation.createdBy || '-'],
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
      width: 35%;
      background-color: ${idx % 2 === 0 ? 'white' : BRAND.background};
    `;
    td1.textContent = row[0];

    const td2 = document.createElement('td');
    td2.style.cssText = `
      padding: 10px 16px;
      width: 65%;
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
    margin-bottom: 28px;
    border: 1px solid ${BRAND.border};
    border-radius: 8px;
    overflow: hidden;
  `;

  const itemsTitle = document.createElement('div');
  itemsTitle.style.cssText = `
    background-color: ${BRAND.purple};
    color: white;
    padding: 12px 16px;
    font-weight: bold;
    font-size: 23px;
  `;
  itemsTitle.textContent = 'Items';
  itemsSection.appendChild(itemsTitle);

  const itemsTable = document.createElement('table');
  itemsTable.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 18px;
  `;

  const headerRow = document.createElement('tr');
  headerRow.style.cssText = `border-bottom: 1px solid ${BRAND.border}; background: ${BRAND.background};`;
  [['#', '12%'], ['Description', '46%'], ['Qty', '12%'], ['Unit Price', '15%'], ['Total', '15%']].forEach(([label, width]) => {
    const th = document.createElement('th');
    th.style.cssText = `padding: 10px 12px; text-align: left; font-weight: 700; color: ${BRAND.text}; width: ${width};`;
    th.textContent = label;
    if (label === 'Qty') th.style.textAlign = 'center';
    if (label === 'Unit Price' || label === 'Total') th.style.textAlign = 'right';
    headerRow.appendChild(th);
  });
  itemsTable.appendChild(headerRow);

  (quotation.items || []).forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.style.cssText = `border-bottom: 1px solid ${BRAND.border}; background: ${idx % 2 === 0 ? 'white' : BRAND.background};`;

    const numberCell = document.createElement('td');
    numberCell.style.cssText = 'padding: 10px 12px; color: #475569;';
    numberCell.textContent = String(idx + 1);
    tr.appendChild(numberCell);

    const descCell = document.createElement('td');
    descCell.style.cssText = 'padding: 10px 12px;';
    descCell.innerHTML = `<div style="font-weight: 600;">${item.productName || '-'}</div>${item.description ? `<div style="font-size: 14px; color: ${BRAND.muted}; margin-top: 2px;">${item.description}</div>` : ''}`;
    tr.appendChild(descCell);

    const qtyCell = document.createElement('td');
    qtyCell.style.cssText = 'padding: 10px 12px; text-align: center;';
    qtyCell.textContent = String(item.qty || 0);
    tr.appendChild(qtyCell);

    const unitCell = document.createElement('td');
    unitCell.style.cssText = 'padding: 10px 12px; text-align: right; font-weight: 600;';
    unitCell.textContent = money(item.unitPrice);
    tr.appendChild(unitCell);

    const totalCell = document.createElement('td');
    totalCell.style.cssText = `padding: 10px 12px; text-align: right; font-weight: 700; color: ${BRAND.green};`;
    totalCell.textContent = money(item.lineTotal);
    tr.appendChild(totalCell);

    itemsTable.appendChild(tr);
  });

  const subtotalRow = document.createElement('tr');
  subtotalRow.style.cssText = `background: ${BRAND.background}; border-top: 1px solid ${BRAND.border};`;
  subtotalRow.innerHTML = `
    <td colspan="4" style="padding: 10px 12px; text-align: right; font-weight: 700;">Subtotal</td>
    <td style="padding: 10px 12px; text-align: right; font-weight: 700;">${money(quotation.subtotal)}</td>
  `;
  itemsTable.appendChild(subtotalRow);

  if (Number(quotation.discount || 0) > 0) {
    const discountRow = document.createElement('tr');
    discountRow.style.cssText = 'background: #fef2f2;';
    discountRow.innerHTML = `
      <td colspan="4" style="padding: 10px 12px; text-align: right; font-weight: 700; color: ${BRAND.red};">Discount</td>
      <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: ${BRAND.red};">-${money(quotation.discount)}</td>
    `;
    itemsTable.appendChild(discountRow);
  }

  const vatRow = document.createElement('tr');
  vatRow.style.cssText = 'background: #fff7ed;';
  vatRow.innerHTML = `
    <td colspan="4" style="padding: 10px 12px; text-align: right; font-weight: 700; color: ${BRAND.red};">${vatEnabled ? `VAT (${vatRate.toFixed(1)}%, included)` : 'VAT (disabled)'}</td>
    <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: ${BRAND.red};">${money(quotation.vatAmount)}</td>
  `;
  itemsTable.appendChild(vatRow);

  const grandTotalRow = document.createElement('tr');
  grandTotalRow.style.cssText = `background: ${BRAND.purple};`;
  grandTotalRow.innerHTML = `
    <td colspan="4" style="padding: 12px; text-align: right; font-weight: 800; color: white;">GRAND TOTAL</td>
    <td style="padding: 12px; text-align: right; font-weight: 800; color: white;">${money(quotation.total)}</td>
  `;
  itemsTable.appendChild(grandTotalRow);

  itemsSection.appendChild(itemsTable);
  container.appendChild(itemsSection);

  if (quotation.notes && String(quotation.notes).trim().length) {
    const notesSection = document.createElement('div');
    notesSection.style.cssText = `
      border: 1px solid ${BRAND.border};
      border-radius: 8px;
      padding: 16px;
      background-color: #FFFBEB;
    `;

    const notesTitle = document.createElement('div');
    notesTitle.style.cssText = `
      font-weight: bold;
      font-size: 22px;
      margin-bottom: 8px;
      color: ${BRAND.text};
    `;
    notesTitle.textContent = 'Notes';
    notesSection.appendChild(notesTitle);

    const notesContent = document.createElement('div');
    notesContent.style.cssText = `
      font-size: 19px;
      line-height: 1.6;
      color: ${BRAND.muted};
      white-space: pre-wrap;
      word-wrap: break-word;
    `;
    notesContent.textContent = String(quotation.notes).trim();
    notesSection.appendChild(notesContent);

    container.appendChild(notesSection);
  }

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      allowTaint: true,
    });

    const safeDate = quotation.createdAt ? new Date(quotation.createdAt).toISOString().slice(0, 10) : 'quotation';
    const safeRef = String(quotation.quotationRef || clientName || 'quotation').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `quotation-${safeRef}-${safeDate}.${format}`;

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
    console.error('Error generating image:', error);
    throw error;
  } finally {
    document.body.removeChild(container);
  }
}
