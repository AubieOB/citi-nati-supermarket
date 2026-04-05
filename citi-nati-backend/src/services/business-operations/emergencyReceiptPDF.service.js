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
        margin: 50,
        bufferPages: true,
      });

      const margin = doc.page.margins.left;
      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - margin * 2;

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', (err) => {
        reject(err);
      });

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('CITI-NATI SUPERMARKET', { align: 'center' });
      doc.fontSize(12).font('Helvetica').text('Emergency Sale Receipt', { align: 'center' });
      doc.moveDown(0.3);

      // Divider
      doc.strokeColor('#000000').lineWidth(1);
      doc.moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke();
      doc.moveDown(0.3);

      // Sale metadata
      doc.fontSize(9).font('Helvetica');
      const infoX1 = margin;
      const infoX2 = margin + contentWidth / 2;
      const metaY = doc.y;

      doc.text('Ref:', infoX1, metaY, { width: 30 });
      doc.text(String(sale.saleRef || sale.sale_ref || '-').trim(), infoX1 + 35, metaY);
      doc.text('Date:', infoX2, metaY, { width: 30 });
      doc.text(formatDateTime(sale.createdAt || sale.created_at), infoX2 + 35, metaY);

      doc.moveDown(0.2);
      const cashierY = doc.y;
      doc.text('Cashier:', infoX1, cashierY, { width: 50 });
      doc.text(String(sale.cashierName || sale.cashier_name || '-').trim(), infoX1 + 55, cashierY);
      doc.text('Payment:', infoX2, cashierY, { width: 50 });
      doc.text(String(sale.paymentMethod || sale.payment_method || 'CASH').trim(), infoX2 + 55, cashierY);
      doc.moveDown(0.4);

      // Divider
      doc.moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke();
      doc.moveDown(0.3);

      // Items table header
      doc.fontSize(9).font('Helvetica-Bold');
      const col1 = margin + 5;
      const col2 = margin + 40;
      const col3 = margin + 160;
      const col4 = margin + 365;
      const col5 = margin + 425;
      const col6 = pageWidth - margin - 70;

      const headerY = doc.y;
      doc.text('#', col1, headerY, { width: 25, align: 'center' });
      doc.text('Code', col2, headerY, { width: 110, align: 'left' });
      doc.text('Item', col3, headerY, { width: 195, align: 'left' });
      doc.text('Qty', col4, headerY, { width: 50, align: 'right' });
      doc.text('Price', col5, headerY, { width: 60, align: 'right' });
      doc.text('Total', col6, headerY, { width: 70, align: 'right' });
      doc.moveDown(0.25);

      // Items
      doc.fontSize(8).font('Helvetica');
      const items = Array.isArray(sale.items) ? sale.items : [];

      if (items.length === 0) {
        doc.text('(No items)', col1, doc.y, { width: contentWidth - 10, align: 'center' });
        doc.moveDown(0.3);
      } else {
        for (let idx = 0; idx < items.length; idx += 1) {
          const item = items[idx];
          const itemY = doc.y;

          if (itemY > doc.page.height - 150) {
            doc.addPage();
          }

          doc.text(String(idx + 1), col1, doc.y, { width: 25, align: 'center' });
          doc.text(String(item.productCode || item.product_code || '-').slice(0, 20), col2, doc.y, { width: 110, align: 'left' });
          doc.text(String(item.productName || item.product_name || '-').slice(0, 50), col3, doc.y, { width: 195, align: 'left' });
          doc.text(String(item.qty || 0), col4, doc.y, { width: 50, align: 'right' });
          doc.text(toMoney(item.unitPrice || item.unit_price).toFixed(2), col5, doc.y, { width: 60, align: 'right' });
          doc.text(toMoney(item.lineTotal || item.line_total).toFixed(2), col6, doc.y, { width: 70, align: 'right' });
          doc.moveDown(0.28);
        }
      }

      // Divider
      doc.moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke();
      doc.moveDown(0.3);

      // Totals section - clean two-column layout
      doc.fontSize(9).font('Helvetica');
      const labelCol = margin + contentWidth * 0.55;
      const valueCol = pageWidth - margin - 80;
      const lineHeight = 18;

      const drawTotal = (label, value, bold = false) => {
        const font = bold ? 'Helvetica-Bold' : 'Helvetica';
        const size = bold ? 10 : 9;
        const curY = doc.y;

        doc.font(font).fontSize(size).text(label, labelCol, curY, { align: 'left', width: 70 });
        doc.font(font).fontSize(size).text(toMoney(value).toFixed(2), valueCol, curY, { align: 'right', width: 75 });
        doc.y = curY + lineHeight;
      };

      drawTotal('Subtotal:', sale.subtotal);
      drawTotal('Discount:', sale.discount);
      drawTotal('Total:', sale.total, true);
      drawTotal('Tendered:', sale.tenderedAmount || sale.tendered_amount);
      drawTotal('Change:', sale.changeAmount || sale.change_amount);

      doc.moveDown(0.2);
      doc.moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke();
      doc.moveDown(0.3);

      // Status and footer
      const syncNote = sale.syncStatus === 'synced_to_pos' ? 'SYNCED TO POS' : 'PENDING POS SYNC';
      doc.fontSize(10).font('Helvetica-Bold').text(syncNote, margin, doc.y, {
        align: 'center',
        width: contentWidth,
      });
      doc.moveDown(0.2);
      doc.fontSize(13).font('Helvetica-Bold').text('THANK YOU', margin, doc.y, {
        align: 'center',
        width: contentWidth,
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generateEmergencyReceiptPDF,
};
