const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

function toMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
}

function safeText(value, fallback = '-') {
  const text = String(value == null ? '' : value).trim();
  return text || fallback;
}

function padRight(value, width) {
  const text = String(value || '');
  if (text.length >= width) return text.slice(0, width);
  return `${text}${' '.repeat(width - text.length)}`;
}

function padLeft(value, width) {
  const text = String(value || '');
  if (text.length >= width) return text.slice(text.length - width);
  return `${' '.repeat(width - text.length)}${text}`;
}

function center(value, width) {
  const text = String(value || '');
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  const right = width - text.length - left;
  return `${' '.repeat(left)}${text}${' '.repeat(right)}`;
}

function truncate(value, width) {
  const text = String(value || '');
  return text.length > width ? text.slice(0, width) : text;
}

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function buildReceiptText(receipt, options = {}) {
  const width = Number.isFinite(Number(options.paperWidthChars))
    ? Math.max(32, Math.min(64, Number(options.paperWidthChars)))
    : 48;

  const divider = '-'.repeat(width);
  const lines = [];

  lines.push(center('CITI-NATI SUPERMARKET', width));
  lines.push(center('EMERGENCY SALE RECEIPT', width));
  lines.push(divider);
  lines.push(`Ref: ${safeText(receipt.sale_ref, '-')}`);
  lines.push(`Date: ${formatDateTime(receipt.created_at)}`);
  lines.push(`Cashier: ${safeText(receipt.cashier_name, '-')}`);
  lines.push(`Pay: ${safeText(receipt.payment_method, 'CASH')}`);
  lines.push(divider);

  const items = Array.isArray(receipt.items) ? receipt.items : [];
  for (const item of items) {
    const name = truncate(safeText(item.product_name, 'ITEM'), width);
    const code = truncate(safeText(item.product_code, '-'), 14);
    const qty = padLeft(Number(item.qty || 0), 4);
    const unit = padLeft(toMoney(item.unit_price).toFixed(2), 10);
    const total = padLeft(toMoney(item.line_total).toFixed(2), 10);

    lines.push(name);
    lines.push(`${padRight(code, 14)} ${qty} x ${unit} ${total}`);
  }

  lines.push(divider);

  const writeTotal = (label, value) => {
    const amount = toMoney(value).toFixed(2);
    const left = padRight(label, Math.max(1, width - amount.length));
    lines.push(`${left}${amount}`);
  };

  writeTotal('Subtotal', receipt.subtotal);
  writeTotal('Discount', receipt.discount);
  writeTotal('Total', receipt.total);
  writeTotal('Tendered', receipt.tendered_amount);
  writeTotal('Change', receipt.change_amount);

  const note = safeText(receipt.note, 'Pending POS Sync');
  lines.push(divider);
  lines.push(center(note.toUpperCase(), width));
  lines.push(center('THANK YOU', width));
  lines.push('');

  return `${lines.join('\r\n')}\r\n`;
}

function printTextToWindowsPrinter(content, printerName) {
  const tempName = `thermal-receipt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.txt`;
  const tempPath = path.join(os.tmpdir(), tempName);
  fs.writeFileSync(tempPath, content, 'utf8');

  const escapedPath = tempPath.replace(/'/g, "''");
  const escapedPrinterName = String(printerName || '').replace(/'/g, "''");
  const outPrinterExpr = escapedPrinterName
    ? `Out-Printer -Name '${escapedPrinterName}'`
    : 'Out-Printer';

  const script = `Get-Content -LiteralPath '${escapedPath}' | ${outPrinterExpr}; Remove-Item -LiteralPath '${escapedPath}' -Force`;

  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], (error, stdout, stderr) => {
      if (error) {
        try {
          fs.unlinkSync(tempPath);
        } catch (_cleanupErr) {
          // Ignore temp cleanup failures when the print command already failed.
        }
        reject(new Error(stderr || stdout || error.message));
        return;
      }

      resolve({
        printerName: printerName || null,
        tempPath,
      });
    });
  });
}

async function printReceipt(receipt, options = {}) {
  if (!receipt || typeof receipt !== 'object') {
    throw new Error('NON_RETRYABLE: Thermal receipt payload is missing');
  }

  const copies = Math.max(1, Math.min(3, Number.parseInt(options.copies || 1, 10) || 1));
  const printerName = safeText(options.printerName, '');
  const content = buildReceiptText(receipt, options);

  for (let copy = 0; copy < copies; copy += 1) {
    await printTextToWindowsPrinter(content, printerName);
  }

  return {
    message: 'Thermal receipt sent to Windows print spooler',
    printerName: printerName || null,
    copies,
  };
}

module.exports = {
  buildReceiptText,
  printReceipt,
};
