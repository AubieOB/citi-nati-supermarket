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

      const pageLeft = doc.page.margins.left;
      const pageRight = doc.page.width - doc.page.margins.right;
      const contentWidth = pageRight - pageLeft;

      const drawDivider = () => {
        doc.moveTo(pageLeft, doc.y).lineTo(pageRight, doc.y).stroke();
      };

      const drawAmountRow = (label, value, opts = {}) => {
        const labelX = pageRight - 235;
        const valueX = pageRight - 110;
        const rowY = doc.y;
        const fontName = opts.bold ? 'Helvetica-Bold' : 'Helvetica';
        const fontSize = opts.bold ? 11 : 10;

        doc.font(fontName).fontSize(fontSize);
        doc.text(label, labelX, rowY, { width: 120, align: 'left', lineBreak: false });
        doc.text(toMoney(value).toFixed(2), valueX, rowY, { width: 95, align: 'right', lineBreak: false });
        doc.y = rowY + 22;
      };

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
      drawDivider();
      doc.moveDown(0.5);

      // Sale info
      doc.fontSize(10).font('Helvetica');
      doc.text(`Ref: ${String(sale.saleRef || sale.sale_ref || '-').trim()}`, { align: 'left' });
      doc.text(`Date: ${formatDateTime(sale.createdAt || sale.created_at)}`, { align: 'left' });
      doc.text(`Cashier: ${String(sale.cashierName || sale.cashier_name || '-').trim()}`, { align: 'left' });
      doc.text(`Payment: ${String(sale.paymentMethod || sale.payment_method || 'CASH').trim()}`, { align: 'left' });
      doc.moveDown(0.5);

      // Divider
      drawDivider();
      doc.moveDown(0.5);

      // Items table
      const tableTop = doc.y;
      const colNoX = pageLeft + 8;
      const colCodeX = pageLeft + 40;
      const colItemX = pageLeft + 145;
      const colQtyX = pageLeft + 350;
      const colPriceX = pageLeft + 410;
      const colTotalX = pageLeft + 475;

      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('#', colNoX, tableTop, { width: 20, align: 'left', lineBreak: false });
      doc.text('Code', colCodeX, tableTop, { width: 95, align: 'left', lineBreak: false });
      doc.text('Item', colItemX, tableTop, { width: 210, align: 'left', lineBreak: false });
      doc.text('Qty', colQtyX, tableTop, { width: 45, align: 'right', lineBreak: false });
      doc.text('Price', colPriceX, tableTop, { width: 60, align: 'right', lineBreak: false });
      doc.text('Total', colTotalX, tableTop, { width: 60, align: 'right', lineBreak: false });

      let rowY = tableTop + 18;
      const items = Array.isArray(sale.items) ? sale.items : [];
      doc.font('Helvetica').fontSize(9);

      if (items.length === 0) {
        doc.text('No items', pageLeft + 8, rowY, {
          width: contentWidth - 16,
          align: 'center',
          lineBreak: false,
        });
        rowY += 22;
      } else {
        for (let idx = 0; idx < items.length; idx += 1) {
          const item = items[idx];
          const rowHeight = 18;

          if (rowY > doc.page.height - 170) {
            doc.addPage();
            rowY = doc.page.margins.top;
          }

          doc.text(String(idx + 1), colNoX, rowY, { width: 20, align: 'left', lineBreak: false });
          doc.text(String(item.productCode || item.product_code || '-').slice(0, 22), colCodeX, rowY, { width: 95, align: 'left', lineBreak: false });
          doc.text(String(item.productName || item.product_name || '-').slice(0, 44), colItemX, rowY, { width: 210, align: 'left', lineBreak: false });
          doc.text(String(item.qty || 0), colQtyX, rowY, { width: 45, align: 'right', lineBreak: false });
          doc.text(toMoney(item.unitPrice || item.unit_price).toFixed(2), colPriceX, rowY, { width: 60, align: 'right', lineBreak: false });
          doc.text(toMoney(item.lineTotal || item.line_total).toFixed(2), colTotalX, rowY, { width: 60, align: 'right', lineBreak: false });

          rowY += rowHeight;
        }
      }

      doc.y = rowY + 6;
      drawDivider();
      doc.moveDown(0.5);

      // Totals block
      drawAmountRow('Subtotal:', sale.subtotal);
      drawAmountRow('Discount:', sale.discount);
      drawAmountRow('Total:', sale.total, { bold: true });
      drawAmountRow('Tendered:', sale.tenderedAmount || sale.tendered_amount);
      drawAmountRow('Change:', sale.changeAmount || sale.change_amount);

      doc.moveDown(0.2);
      drawDivider();
      doc.moveDown(0.5);

      // Status + footer
      const syncNote = sale.syncStatus === 'synced_to_pos' ? 'SYNCED TO POS' : 'PENDING POS SYNC';
      doc.fontSize(10).font('Helvetica-Bold').text(syncNote, pageLeft, doc.y, {
        width: contentWidth,
        align: 'center',
      });
      doc.moveDown(0.2);
      doc.fontSize(12).font('Helvetica-Bold').text('THANK YOU', pageLeft, doc.y, {
        width: contentWidth,
        align: 'center',
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
