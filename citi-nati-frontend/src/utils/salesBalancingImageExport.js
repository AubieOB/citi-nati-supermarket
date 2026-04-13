import html2canvas from 'html2canvas';
import logo from '../assets/citi-nati-logo.png.png';

const BRAND = {
  purple: '#5B4B8A',
  green: '#2D8659',
  red: '#B91C1C',
  orange: '#B45309',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  background: '#F8FAFC',
};

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const titleCase = (value) => String(value || '')
  .replace(/[_-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, (ch) => ch.toUpperCase());

const resultColor = (status) => {
  if (status === 'shortage') return '#B91C1C';
  if (status === 'overage') return '#B45309';
  return '#166534';
};

export async function exportSalesBalancingReportImage({
  record,
  companyName = 'Citi-Nati Supermarket',
  title = 'Sales Balancing Report',
  format = 'png', // 'png' or 'jpg'
} = {}) {
  if (!record) return;

  const status = String(record.resultStatus || 'balanced').toLowerCase();
  const generated = new Date().toLocaleString('en-GB');

  // Create a temporary container that won't be visible
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: -9999px;
    width: 800px;
    background: white;
    padding: 40px;
    font-family: Arial, sans-serif;
    color: ${BRAND.text};
    z-index: -1;
  `;

  // Header section
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 32px;
    border-bottom: 2px solid ${BRAND.border};
    padding-bottom: 20px;
  `;

  const logoImg = document.createElement('img');
  logoImg.src = logo;
  logoImg.style.cssText = 'height: 60px; width: auto;';
  header.appendChild(logoImg);

  const headerTitle = document.createElement('div');
  headerTitle.style.cssText = 'flex: 1;';
  headerTitle.innerHTML = `
    <div style="font-size: 24px; font-weight: bold; margin-bottom: 4px;">
      <span style="color: ${BRAND.purple};">Citi-</span><span style="color: ${BRAND.green};">Nati Supermarket</span>
    </div>
    <div style="font-size: 14px; font-weight: bold; color: ${BRAND.text}; margin-top: 4px;">${title}</div>
    <div style="font-size: 11px; color: ${BRAND.muted}; margin-top: 6px;">Generated: ${generated}</div>
  `;
  header.appendChild(headerTitle);

  const preparedInfo = document.createElement('div');
  preparedInfo.style.cssText = `
    text-align: right;
    font-size: 11px;
    color: ${BRAND.muted};
  `;
  preparedInfo.innerHTML = `
    <div>Prepared by: <strong>${record.preparedBy || '-'}</strong></div>
  `;
  header.appendChild(preparedInfo);

  container.appendChild(header);

  // Info section
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
    font-size: 13px;
    border-bottom: 1px solid ${BRAND.border};
  `;
  infoTitle.textContent = 'Balancing Details';
  infoSection.appendChild(infoTitle);

  const infoRows = [
    ['Date', record.balancingDate ? new Date(record.balancingDate).toLocaleDateString('en-GB') : '-'],
    ['Branch / Location', record.locationName || record.locationCode || '-'],
    ['Reference', record.referenceTitle || '-'],
    ['Cashier / Session', record.cashierReference || record.shiftReference || '-'],
    ['Status', titleCase(record.status || 'draft')],
  ];

  const infoTable = document.createElement('table');
  infoTable.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
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

  // Payment Methods section
  const paymentSection = document.createElement('div');
  paymentSection.style.cssText = `
    margin-bottom: 28px;
    border: 1px solid ${BRAND.border};
    border-radius: 8px;
    overflow: hidden;
  `;

  const paymentTitle = document.createElement('div');
  paymentTitle.style.cssText = `
    background-color: ${BRAND.green};
    color: white;
    padding: 12px 16px;
    font-weight: bold;
    font-size: 13px;
  `;
  paymentTitle.textContent = 'Payment Methods';
  paymentSection.appendChild(paymentTitle);

  const paymentRows = [
    ['Cash', money(record.cashAmount)],
    ['Airtel Money', money(record.airtelMoneyAmount)],
    ['TNM Mpamba', money(record.tnmMpambaAmount)],
    ['POS / Card Machine', money(record.posCardAmount)],
    ['M0626 / Bank Transfer', money(record.bankTransferAmount)],
    ['Other', money(record.otherAmount)],
  ];

  const paymentTable = document.createElement('table');
  paymentTable.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  `;

  paymentRows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.style.cssText = `border-bottom: 1px solid ${BRAND.border};`;
    if (idx % 2 === 0) tr.style.backgroundColor = BRAND.background;

    const td1 = document.createElement('td');
    td1.style.cssText = 'padding: 10px 16px; font-weight: 500;';
    td1.textContent = row[0];

    const td2 = document.createElement('td');
    td2.style.cssText = 'padding: 10px 16px; text-align: right; font-weight: 600;';
    td2.textContent = row[1];

    tr.appendChild(td1);
    tr.appendChild(td2);
    paymentTable.appendChild(tr);
  });

  // Total row
  const totalRow = document.createElement('tr');
  totalRow.style.cssText = `
    background-color: ${BRAND.background};
    font-weight: bold;
    font-size: 13px;
  `;

  const totalTd1 = document.createElement('td');
  totalTd1.style.cssText = 'padding: 12px 16px;';
  totalTd1.textContent = 'Total Actual Entered';

  const totalTd2 = document.createElement('td');
  totalTd2.style.cssText = 'padding: 12px 16px; text-align: right;';
  totalTd2.textContent = money(record.totalActualAmount);

  totalRow.appendChild(totalTd1);
  totalRow.appendChild(totalTd2);
  paymentTable.appendChild(totalRow);

  paymentSection.appendChild(paymentTable);
  container.appendChild(paymentSection);

  // Summary section
  const summarySection = document.createElement('div');
  summarySection.style.cssText = `
    background-color: ${BRAND.background};
    border: 1px solid ${BRAND.border};
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 28px;
  `;

  summarySection.innerHTML = `
    <div style="display: grid; gap: 8px; font-size: 13px;">
      <div style="display: flex; justify-content: space-between;">
        <span style="font-weight: bold;">Expected System Sales:</span>
        <span>${money(record.expectedSystemSales)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="font-weight: bold;">Actual Total Entered:</span>
        <span>${money(record.totalActualAmount)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 1px solid ${BRAND.border}; color: ${resultColor(status)}; font-weight: bold; font-size: 14px;">
        <span>Difference (${titleCase(status)}):</span>
        <span>${money(record.differenceAmount)}</span>
      </div>
    </div>
  `;

  container.appendChild(summarySection);

  // Notes section
  if (record.notes && String(record.notes).trim().length) {
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
      font-size: 12px;
      margin-bottom: 8px;
      color: ${BRAND.text};
    `;
    notesTitle.textContent = 'Notes / Comments';
    notesSection.appendChild(notesTitle);

    const notesContent = document.createElement('div');
    notesContent.style.cssText = `
      font-size: 12px;
      line-height: 1.6;
      color: ${BRAND.muted};
      white-space: pre-wrap;
      word-wrap: break-word;
    `;
    notesContent.textContent = String(record.notes).trim();
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

    const safeDate = record.balancingDate ? new Date(record.balancingDate).toISOString().slice(0, 10) : 'report';
    const safeBranch = String(record.locationCode || record.locationName || 'branch').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `sales-balancing-${safeBranch}-${safeDate}.${format}`;

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
