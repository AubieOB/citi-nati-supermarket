const PDFDocument = require('pdfkit');

function toMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
}

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

async function generateEmergencyReceiptPDF(sale) {
  if (!sale) {
    throw new Error('Sale data is required');
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', (err) => {
        reject(err);
      });

      // Header
      doc.fontSize(18).font('Helvetica-Bold').text('CITI-NATI SUPERMARKET', { align: 'center' });
      doc.fontSize(14).font('Helvetica').text('Emergency Sale Receipt', { align: 'center' });
      doc.moveDown(0.5);

      // Divider
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);

      // Sale info
      doc.fontSize(10).font('Helvetica');
      doc.text(`Ref: ${String(sale.saleRef || sale.sale_ref || '-').trim()}`, { align: 'left' });
      doc.text(`Date: ${formatDateTime(sale.createdAt || sale.created_at)}`, { align: 'left' });
      doc.text(`Cashier: ${String(sale.cashierName || sale.cashier_name || '-').trim()}`, { align: 'left' });
      doc.text(`Payment: ${String(sale.paymentMethod || sale.payment_method || 'CASH').trim()}`, { align: 'left' });
      doc.moveDown(0.5);

      // Divider
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);

      // Items table header
      doc.fontSize(9).font('Helvetica-Bold');
      const tableTop = doc.y;
      const col1 = 50;
      const col2 = 130;
      const col3 = 300;
      const col4 = 400;
      const col5 = 480;
      const col6 = 530;

      doc.text('#', col1, tableTop);
      doc.text('Code', col2, tableTop);
      doc.text('Item', col3, tableTop);
      doc.text('Qty', col4, tableTop);
      doc.text('Price', col5, tableTop);
      doc.text('Total', col6, tableTop);

      // Item lines
      doc.font('Helvetica').fontSize(9);
      let tableY = tableTop + 18;
      const items = Array.isArray(sale.items) ? sale.items : [];

      for (let idx = 0; idx < items.length; idx += 1) {
        const item = items[idx];
        const rowHeight = 20;

        if (tableY > 700) {
          doc.addPage();
          tableY = 40;
        }

        doc.text(String(idx + 1), col1, tableY);
        doc.text(String(item.productCode || item.product_code || '-').slice(0, 20), col2, tableY);
        doc.text(String(item.productName || item.product_name || '-').slice(0, 40), col3, tableY);
        doc.text(String(item.qty || 0), col4, tableY);
        doc.text(toMoney(item.unitPrice || item.unit_price).toFixed(2), col5, tableY);
        doc.text(toMoney(item.lineTotal || item.line_total).toFixed(2), col6, tableY);

        tableY += rowHeight;
      }

      doc.moveDown(0.5);
      if (doc.y > 700) {
        doc.addPage();
      }

      // Divider
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);

      // Totals
      doc.fontSize(10).font('Helvetica');
      const totalLabelCol = 350;
      const totalValueCol = 520;

      doc.text('Subtotal:', totalLabelCol, doc.y);
      doc.text(toMoney(sale.subtotal).toFixed(2), totalValueCol, doc.y - doc.currentLineHeight(), { width: 30, align: 'right' });
      doc.moveDown();

      doc.text('Discount:', totalLabelCol, doc.y);
      doc.text(toMoney(sale.discount).toFixed(2), totalValueCol, doc.y - doc.currentLineHeight(), { width: 30, align: 'right' });
      doc.moveDown();

      doc.font('Helvetica-Bold').fontSize(11);
      doc.text('Total:', totalLabelCol, doc.y);
      doc.text(toMoney(sale.total).toFixed(2), totalValueCol, doc.y - doc.currentLineHeight(), { width: 30, align: 'right' });
      doc.moveDown();

      doc.font('Helvetica').fontSize(10);
      doc.text('Tendered:', totalLabelCol, doc.y);
      doc.text(toMoney(sale.tenderedAmount || sale.tendered_amount).toFixed(2), totalValueCol, doc.y - doc.currentLineHeight(), { width: 30, align: 'right' });
      doc.moveDown();

      doc.text('Change:', totalLabelCol, doc.y);
      doc.text(toMoney(sale.changeAmount || sale.change_amount).toFixed(2), totalValueCol, doc.y - doc.currentLineHeight(), { width: 30, align: 'right' });
      doc.moveDown(0.5);

      // Divider
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);

      // Status
      const syncNote = sale.syncStatus === 'synced_to_pos' ? 'Synced to POS' : 'Pending POS Sync';
      doc.fontSize(11).font('Helvetica-Bold').text(syncNote.toUpperCase(), { align: 'center' });
      doc.fontSize(12).text('THANK YOU', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generateEmergencyReceiptPDF,
};
