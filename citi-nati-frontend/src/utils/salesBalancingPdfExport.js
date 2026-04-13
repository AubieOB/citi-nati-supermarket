import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/citi-nati-logo.png.png';

const BRAND = {
  purple: [91, 75, 138],
  green: [45, 134, 89],
  text: [15, 23, 42],
  muted: [100, 116, 139],
  border: [226, 232, 240],
};

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const titleCase = (value) => String(value || '')
  .replace(/[_-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, (ch) => ch.toUpperCase());

const resultColor = (status) => {
  if (status === 'shortage') return [185, 28, 28];
  if (status === 'overage') return [180, 83, 9];
  return [22, 101, 52];
};

export function exportSalesBalancingReportPdf({
  record,
  companyName = 'Citi-Nati Supermarket',
  title = 'Sales Balancing Report',
} = {}) {
  if (!record) return;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - (margin * 2);
  const generated = new Date().toLocaleString('en-GB');
  const status = String(record.resultStatus || 'balanced').toLowerCase();

  try {
    doc.addImage(logo, 'PNG', margin, 10, 18, 13);
  } catch {
    // Ignore logo failures and continue with text branding.
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...BRAND.purple);
  doc.text('Citi-', margin + 22, 16);
  doc.setTextColor(...BRAND.green);
  doc.text('Nati Supermarket', margin + 35, 16);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...BRAND.text);
  doc.text(title, margin, 28);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(...BRAND.muted);
  doc.text(`Generated on: ${generated}`, pageWidth - margin, 16, { align: 'right' });
  doc.text(`Prepared by: ${record.preparedBy || '-'}`, pageWidth - margin, 21, { align: 'right' });

  doc.setDrawColor(...BRAND.border);
  doc.line(margin, 32, pageWidth - margin, 32);

  autoTable(doc, {
    startY: 36,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [['Field', 'Value']],
    body: [
      ['Date', record.balancingDate ? new Date(record.balancingDate).toLocaleDateString('en-GB') : '-'],
      ['Branch / Location', record.locationName || record.locationCode || '-'],
      ['Reference', record.referenceTitle || '-'],
      ['Cashier / Session', record.cashierReference || record.shiftReference || '-'],
      ['Status', titleCase(record.status || 'draft')],
    ],
    styles: { fontSize: 12, cellPadding: 3.2, textColor: BRAND.text, lineColor: BRAND.border, lineWidth: 0.2 },
    headStyles: { fillColor: BRAND.purple, textColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' }, 1: { cellWidth: contentWidth - 52 } },
  });

  const paymentRows = [
    ['Cash', money(record.cashAmount)],
    ['Airtel Money', money(record.airtelMoneyAmount)],
    ['TNM Mpamba', money(record.tnmMpambaAmount)],
    ['POS / Card Machine', money(record.posCardAmount)],
    ['M0626 / Bank Transfer', money(record.bankTransferAmount)],
    ['Other', money(record.otherAmount)],
  ];

  autoTable(doc, {
    startY: (doc.lastAutoTable?.finalY || 70) + 5,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [['Payment Method', 'Amount']],
    body: paymentRows,
    foot: [['Total Actual Entered', money(record.totalActualAmount)]],
    styles: { fontSize: 12, cellPadding: 3.2, textColor: BRAND.text, lineColor: BRAND.border, lineWidth: 0.2 },
    headStyles: { fillColor: BRAND.green, textColor: [255, 255, 255] },
    footStyles: { fillColor: [248, 250, 252], textColor: BRAND.text, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: contentWidth - 46 }, 1: { cellWidth: 46, halign: 'right' } },
  });

  const summaryStart = (doc.lastAutoTable?.finalY || 130) + 7;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...BRAND.border);
  doc.roundedRect(margin, summaryStart, contentWidth, 28, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND.text);
  doc.setFontSize(13);
  doc.text(`Expected System Sales: ${money(record.expectedSystemSales)}`, margin + 3, summaryStart + 8);
  doc.text(`Actual Total Entered: ${money(record.totalActualAmount)}`, margin + 3, summaryStart + 14);

  const diffLabel = `Difference: ${money(record.differenceAmount)} (${titleCase(status)})`;
  doc.setTextColor(...resultColor(status));
  doc.text(diffLabel, margin + 3, summaryStart + 20);

  doc.setTextColor(...BRAND.text);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const notesText = record.notes && String(record.notes).trim().length ? String(record.notes).trim() : 'No notes provided.';
  const noteStartY = summaryStart + 34;
  doc.setFont('helvetica', 'bold');
  doc.text('Notes / Comments', margin, noteStartY);
  doc.setFont('helvetica', 'normal');
  doc.text(notesText, margin, noteStartY + 5, { maxWidth: contentWidth, lineHeightFactor: 1.4 });

  const safeDate = record.balancingDate ? new Date(record.balancingDate).toISOString().slice(0, 10) : 'report';
  const safeBranch = String(record.locationCode || record.locationName || 'branch').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  doc.save(`sales-balancing-${safeBranch}-${safeDate}.pdf`);
}
