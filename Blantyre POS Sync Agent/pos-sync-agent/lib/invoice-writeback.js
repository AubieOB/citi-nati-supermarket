/**
 * Invoice Write-Back Module
 * Handles insertion of invoice headers and details into POS database
 * Manages LastCashSaleNo sequencing and transaction integrity
 */

const sql = require('mssql');
const { reduceStockOnSale } = require('./stock-updates');

function createScopedRequest(request) {
  if (request && request.transaction) {
    return new sql.Request(request.transaction);
  }

  if (request && request.parent) {
    return new sql.Request(request.parent);
  }

  return request;
}

function toSqlDate(invoiceDate, invoiceTime) {
  const safeDate = invoiceDate || new Date().toISOString().slice(0, 10);
  const safeTime = invoiceTime || new Date().toTimeString().slice(0, 8);
  const combined = new Date(`${safeDate}T${safeTime}`);
  return Number.isNaN(combined.getTime()) ? new Date() : combined;
}

function normalizeTime(invoiceTime) {
  if (typeof invoiceTime === 'string' && invoiceTime.trim()) {
    return invoiceTime.slice(0, 8);
  }
  return new Date().toTimeString().slice(0, 8);
}

async function findExistingInvoiceByRefNo(request, refNo) {
  if (!refNo) return null;

  const lookupRequest = createScopedRequest(request);
  lookupRequest.input('RefNo', sql.VarChar(255), refNo);

  const result = await lookupRequest.query(`
    SELECT TOP 1 InvoiceNo AS InvoiceCode
    FROM POS.dbo.invoice
    WHERE RefNo = @RefNo
    ORDER BY InvoiceNo DESC
  `);

  const invoiceCode = Number(result.recordset?.[0]?.InvoiceCode);
  if (!Number.isFinite(invoiceCode) || invoiceCode <= 0) {
    return null;
  }

  return invoiceCode;
}

async function countInvoiceDetails(request, invoiceCode) {
  const countRequest = createScopedRequest(request);
  countRequest.input('InvoiceCode', sql.Int, invoiceCode);
  const result = await countRequest.query(`
    SELECT COUNT(1) AS DetailCount
    FROM POS.dbo.invoicedetails
    WHERE InvoiceCode = @InvoiceCode
  `);
  return Number(result.recordset?.[0]?.DetailCount || 0);
}

/**
 * Get next CashSaleNo from LastCashSaleNo table
 * @param {sql.Request} request - SQL request object within a transaction
 * @returns {Promise<number>} Next CashSaleNo
 */
async function getNextCashSaleNo(request) {
  try {
    const selectRequest = createScopedRequest(request);
    const countResult = await selectRequest.query(`
      SELECT COUNT(1) AS [RecordCount]
      FROM dbo.LastCashSaleNo WITH (UPDLOCK, HOLDLOCK)
    `);

    const rowCount = Number(countResult.recordset?.[0]?.RecordCount || 0);
    if (rowCount !== 1) {
      throw new Error(`LastCashSaleNo table must contain exactly 1 row; found ${rowCount}`);
    }

    const result = await selectRequest.query(`
      SELECT TOP 1 *
      FROM dbo.LastCashSaleNo WITH (UPDLOCK, HOLDLOCK)
    `);

    if (!result.recordset || result.recordset.length === 0) {
      throw new Error('LastCashSaleNo table is empty. Initialize it with a starting value.');
    }

    const row = result.recordset[0];
    const counterColumn = Object.prototype.hasOwnProperty.call(row, 'LastCashSaleNo')
      ? 'LastCashSaleNo'
      : Object.prototype.hasOwnProperty.call(row, 'CashSaleNo')
        ? 'CashSaleNo'
        : null;

    if (!counterColumn) {
      throw new Error('LastCashSaleNo table is missing both LastCashSaleNo and CashSaleNo columns');
    }

    const currentNo = Number(row[counterColumn]);

    if (!Number.isFinite(currentNo)) {
      throw new Error('LastCashSaleNo value is invalid');
    }

    const nextNo = currentNo + 1;

    console.log(`[INVOICE] using ${counterColumn}=${currentNo}; next LastCashSaleNo will be ${nextNo}`);
    return {
      cashSaleNo: currentNo,
      nextLastCashSaleNo: nextNo,
      counterColumn,
    };
  } catch (error) {
    console.error('[INVOICE ERROR] Error reading LastCashSaleNo:', error.message);
    throw error;
  }
}

/**
 * Update LastCashSaleNo after successful invoice insert
 * @param {sql.Request} request - SQL request object within a transaction
 * @param {number} newCashSaleNo - The CashSaleNo that was just used
 * @returns {Promise<void>}
 */
async function updateLastCashSaleNo(request, newCashSaleNo) {
  try {
    const expectedCashSaleNo = Number(newCashSaleNo) - 1;
    if (!Number.isFinite(expectedCashSaleNo)) {
      throw new Error('Expected previous CashSaleNo is invalid');
    }

    const updateRequest = createScopedRequest(request);
    const schemaResult = await updateRequest.query(`
      SELECT TOP 1 *
      FROM dbo.LastCashSaleNo
    `);
    const schemaRow = schemaResult.recordset?.[0] || {};
    const counterColumn = Object.prototype.hasOwnProperty.call(schemaRow, 'LastCashSaleNo')
      ? 'LastCashSaleNo'
      : Object.prototype.hasOwnProperty.call(schemaRow, 'CashSaleNo')
        ? 'CashSaleNo'
        : null;

    if (!counterColumn) {
      throw new Error('LastCashSaleNo table is missing both LastCashSaleNo and CashSaleNo columns');
    }

    const query = `
      UPDATE dbo.LastCashSaleNo
      SET ${counterColumn} = @CashSaleNo
      WHERE ${counterColumn} = @ExpectedCashSaleNo
    `;

    updateRequest.input('CashSaleNo', sql.Int, newCashSaleNo);
    updateRequest.input('ExpectedCashSaleNo', sql.Int, expectedCashSaleNo);
    const updateResult = await updateRequest.query(query);

    const affectedRows = Number(updateResult.rowsAffected?.[0] || 0);
    if (affectedRows !== 1) {
      throw new Error(`LastCashSaleNo compare-and-set update failed; affected rows: ${affectedRows}`);
    }

    console.log(`[INVOICE] updated ${counterColumn} to ${newCashSaleNo} (from ${expectedCashSaleNo})`);
  } catch (error) {
    console.error('[INVOICE ERROR] Error updating LastCashSaleNo:', error.message);
    throw error;
  }
}

/**
 * Insert invoice header into POS database
 * @param {sql.Request} request - SQL request object within a transaction
 * @param {Object} invoiceHeader - Invoice header data
 * @returns {Promise<number>} InvoiceCode (identity)
 */
async function insertInvoiceHeader(request, invoiceHeader) {
  try {
    const {
      invoiceSerialNo,
      refNo,
      cashSaleNo,
      invoiceDate,
      invoiceTime,
      customerCode,
      locationCode,
      grossSale,
      vat,
      discount,
      netSale,
      payMethod1,
      tenAmt1,
      payMethod2,
      tenAmt2,
      userName,
      priceTypeCode,
      invoiceType,
      tillId,
    } = invoiceHeader;

    const invoiceInsertColumns = [
      'InvoiceSerialNo',
      'RefNo',
      'CashSaleNo',
      'InvoiceDate',
      'InvoiceTime',
      'CustomerCode',
      'LocationCode',
      'GrossSale',
      'VAT',
      'Discount',
      'NetSale',
      'PayMethod1',
      'TenAmt1',
      'PayMethod2',
      'TenAmt2',
      'UserName',
      'PriceTypeCode',
      'InvoiceType',
      'TillID',
    ];

    console.log('[INVOICE] invoice header columns being inserted:', invoiceInsertColumns);
    console.log('[INVOICE] InvoiceNo excluded from invoice insert because it is an identity column');

    const inspect = (label, value) => {
      const str = value === null || value === undefined ? '' : String(value);
      console.log(`[INVOICE][LEN] ${label}="${str}" length=${str.length}`);
    };
    console.log('[INVOICE] header values:', invoiceHeader);
    inspect('RefNo', refNo);
    inspect('CustomerCode', customerCode);
    inspect('LocationCode', locationCode);
    inspect('PayMethod1', payMethod1);
    inspect('PayMethod2', payMethod2);
    inspect('UserName', userName);
    inspect('PriceTypeCode', priceTypeCode);
    inspect('InvoiceType', invoiceType);

    const headerRequest = createScopedRequest(request);
    const query = `
      INSERT INTO POS.dbo.invoice (
        InvoiceSerialNo,
        RefNo,
        CashSaleNo,
        InvoiceDate,
        InvoiceTime,
        CustomerCode,
        LocationCode,
        GrossSale,
        VAT,
        Discount,
        NetSale,
        PayMethod1,
        TenAmt1,
        PayMethod2,
        TenAmt2,
        UserName,
        PriceTypeCode,
        InvoiceType,
        TillID
      )
      OUTPUT INSERTED.InvoiceNo AS InvoiceCode
      VALUES (
        @InvoiceSerialNo,
        @RefNo,
        @CashSaleNo,
        @InvoiceDate,
        @InvoiceTime,
        @CustomerCode,
        @LocationCode,
        @GrossSale,
        @VAT,
        @Discount,
        @NetSale,
        @PayMethod1,
        @TenAmt1,
        @PayMethod2,
        @TenAmt2,
        @UserName,
        @PriceTypeCode,
        @InvoiceType,
        @TillID
      )
    `;

    headerRequest.input('InvoiceSerialNo', sql.Int, invoiceSerialNo);
    headerRequest.input('RefNo', sql.VarChar(255), refNo);
    headerRequest.input('CashSaleNo', sql.Int, cashSaleNo);
    headerRequest.input('InvoiceDate', sql.DateTime, invoiceDate);
    headerRequest.input('InvoiceTime', sql.DateTime, invoiceTime);
    headerRequest.input('CustomerCode', sql.VarChar(15), customerCode);
    headerRequest.input('LocationCode', sql.VarChar(6), locationCode);
    headerRequest.input('GrossSale', sql.Decimal(18, 2), grossSale);
    headerRequest.input('VAT', sql.Decimal(18, 2), vat);
    headerRequest.input('Discount', sql.Decimal(18, 2), discount);
    headerRequest.input('NetSale', sql.Decimal(18, 2), netSale);
    headerRequest.input('PayMethod1', sql.VarChar(20), payMethod1);
    headerRequest.input('TenAmt1', sql.Decimal(18, 2), tenAmt1);
    headerRequest.input('PayMethod2', sql.VarChar(20), payMethod2);
    headerRequest.input('TenAmt2', sql.Decimal(18, 2), tenAmt2);
    headerRequest.input('UserName', sql.VarChar(20), userName);
    headerRequest.input('PriceTypeCode', sql.VarChar(5), priceTypeCode);
    headerRequest.input('InvoiceType', sql.Char(1), invoiceType);
    headerRequest.input('TillID', sql.Int, tillId);

    const result = await headerRequest.query(query);

    if (!result.recordset || result.recordset.length === 0) {
      throw new Error('Failed to get InvoiceCode from insert');
    }

    const invoiceCode = Number(result.recordset[0].InvoiceCode);
    console.log(`[INVOICE] generated InvoiceNo from identity: ${invoiceCode}`);
    console.log(`[INVOICE] inserted invoice header; InvoiceCode=${invoiceCode}; CashSaleNo=${cashSaleNo}`);

    return invoiceCode;
  } catch (error) {
    console.error('[INVOICE ERROR] Error inserting invoice header:', error.message);
    throw error;
  }
}

/**
 * Insert invoice detail lines
 * @param {sql.Request} request - SQL request object within a transaction
 * @param {number} invoiceCode - InvoiceCode from header
 * @param {Array} items - Array of invoice items with product details
 * @param {string} locationCode - Location code for the invoice
 * @returns {Promise<number>} Number of items inserted
 */
async function insertInvoiceDetails(request, invoiceCode, items, locationCode) {
  try {
    let insertedCount = 0;
    const detailIds = [];
    const detailInsertColumns = [
      'InvoiceCode',
      'ProductCode',
      'Qty',
      'PriceTypeCode',
      'UnitPrice',
      'Discount',
      'Amount',
      'TaxRate',
      'TaxAmount',
      'FPrice',
      'UploadStatus',
      'ProductName',
      'LocationCode',
      'CostPrice',
    ];

    console.log('[INVOICE] detail columns being inserted:', detailInsertColumns);
    console.log('[INVOICE] InvDetailID excluded from invoicedetails insert because it is an identity column');

    for (const item of items) {
      const {
        productCode,
        productName,
        qty,
        unitPrice,
        discount,
        amount,
        taxRate,
        taxAmount,
        fPrice,
        priceTypeCode,
        costPrice,
      } = item;

      const detailRequest = createScopedRequest(request);
      const resolvedAmount = Number.isFinite(Number(amount))
        ? Number(amount)
        : Number(qty) * Number(unitPrice);

      const query = `
        INSERT INTO POS.dbo.invoicedetails (
          InvoiceCode,
          ProductCode,
          Qty,
          PriceTypeCode,
          UnitPrice,
          Discount,
          Amount,
          TaxRate,
          TaxAmount,
          FPrice,
          UploadStatus,
          ProductName,
          LocationCode,
          CostPrice
        )
        VALUES (
          @InvoiceCode,
          @ProductCode,
          @Qty,
          @PriceTypeCode,
          @UnitPrice,
          @Discount,
          @Amount,
          @TaxRate,
          @TaxAmount,
          @FPrice,
          0,
          @ProductName,
          @LocationCode,
          @CostPrice
        )
      `;

      detailRequest.input('InvoiceCode', sql.Int, invoiceCode);
      detailRequest.input('ProductCode', sql.VarChar(50), productCode);
      detailRequest.input('Qty', sql.Decimal(18, 2), qty);
      detailRequest.input('PriceTypeCode', sql.VarChar(10), priceTypeCode);
      detailRequest.input('UnitPrice', sql.Decimal(18, 2), unitPrice);
      detailRequest.input('Discount', sql.Decimal(18, 2), discount || 0);
      detailRequest.input('Amount', sql.Decimal(18, 2), resolvedAmount);
      detailRequest.input('TaxRate', sql.Decimal(18, 4), taxRate || 0);
      detailRequest.input('TaxAmount', sql.Decimal(18, 2), taxAmount || 0);
      detailRequest.input('FPrice', sql.Decimal(18, 2), Number.isFinite(Number(fPrice)) ? Number(fPrice) : Number(unitPrice));
      detailRequest.input('ProductName', sql.VarChar(255), productName || productCode);
      detailRequest.input('LocationCode', sql.VarChar(10), locationCode);
      detailRequest.input('CostPrice', sql.Decimal(18, 2), Number.isFinite(Number(costPrice)) ? Number(costPrice) : 0);

      await detailRequest.query(query);
      insertedCount++;

      console.log(`[INVOICE] inserted detail row for ${productCode}; qty=${qty}`);
    }

    console.log(`[INVOICE] inserted detail count: ${insertedCount}`);
    return {
      insertedCount,
      detailIds,
    };
  } catch (error) {
    console.error('[INVOICE ERROR] Error inserting invoice details:', error.message);
    throw error;
  }
}

/**
 * Complete invoice write-back operation
 * Orchestrates header insert, detail inserts, and LastCashSaleNo update
 * @param {sql.Request} request - SQL request object within a transaction
 * @param {Object} invoiceData - Complete invoice data structure
 * @returns {Promise<Object>} Result with invoiceCode and itemCount
 */
async function writeBackInvoice(request, invoiceData) {
  try {
    console.log('[INVOICE] schema fields used (header):', [
      'InvoiceSerialNo',
      'RefNo',
      'InvoiceDate',
      'InvoiceTime',
      'CustomerCode',
      'LocationCode',
      'GrossSale',
      'VAT',
      'Discount',
      'NetSale',
      'InvoiceType',
      'TillID',
      'PayMethod1',
      'TenAmt1',
      'PayMethod2',
      'TenAmt2',
      'UserName',
      'PriceTypeCode',
      'CashSaleNo',
    ]);
    console.log('[INVOICE] schema fields used (detail):', [
      'InvoiceCode',
      'ProductCode',
      'Qty',
      'PriceTypeCode',
      'UnitPrice',
      'Discount',
      'Amount',
      'TaxRate',
      'TaxAmount',
      'FPrice',
      'UploadStatus',
      'ProductName',
      'LocationCode',
      'CostPrice',
    ]);

    const {
      orderId,
      reference,
      locationCode,
      customerCode,
      invoiceDate,
      invoiceTime,
      grossSale,
      vat,
      discount,
      netSale,
      payMethod1,
      tenAmt1,
      payMethod2,
      tenAmt2,
      userName,
      priceTypeCode,
      invoiceType,
      tillId,
      items,
    } = invoiceData;

    const selectedWebLocationCode = String(locationCode || '').trim().toUpperCase();
    const resolvedPosLocationCode = selectedWebLocationCode === 'RES'
      ? 'ST999'
      : selectedWebLocationCode;
    const writebackLocationCode = String(resolvedPosLocationCode || 'SH').slice(0, 6);

    if (!orderId) {
      throw new Error('NON_RETRYABLE: orderId is required');
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('NON_RETRYABLE: items must be a non-empty array');
    }

    console.log(`[INVOICE] WRITE_INVOICE start orderId=${orderId} reference=${reference} items=${items.length}`);
    console.log('[INVOICE] location trace', {
      selectedWebLocationCode: selectedWebLocationCode || null,
      resolvedPosLocationCode: resolvedPosLocationCode || null,
      writebackLocationCode,
    });

    const cashSale = await getNextCashSaleNo(request);
    const cashSaleNo = cashSale.cashSaleNo;
    const nextLastCashSaleNo = cashSale.nextLastCashSaleNo;

    const safeInvoiceDate = toSqlDate(invoiceDate, invoiceTime);
    const refNo = String(reference || `ORD${orderId}`).slice(0, 255);

    const existingInvoiceCode = await findExistingInvoiceByRefNo(request, refNo);
    if (existingInvoiceCode) {
      const existingItemCount = await countInvoiceDetails(request, existingInvoiceCode);
      console.log('[INVOICE] idempotent hit: existing invoice found for RefNo', {
        orderId,
        refNo,
        invoiceCode: existingInvoiceCode,
      });

      return {
        success: true,
        orderId,
        reference: refNo,
        invoiceCode: existingInvoiceCode,
        cashSaleNo: null,
        itemCount: existingItemCount,
        detailIds: [],
        alreadySynced: true,
        tablesTouched: ['dbo.invoice', 'dbo.invoicedetails'],
      };
    }

    const invoiceHeader = {
      invoiceSerialNo: Number(cashSaleNo),
      refNo,
      cashSaleNo: Number(cashSaleNo),
      invoiceDate: safeInvoiceDate,
      invoiceTime: safeInvoiceDate,
      customerCode: String('CASH').slice(0, 15),
      locationCode: writebackLocationCode,
      grossSale: Number(grossSale) || 0,
      vat: Number(vat) || 0,
      discount: Number(discount) || 0,
      netSale: Number(netSale) || 0,
      payMethod1: String('CASH').slice(0, 20),
      tenAmt1: Number(netSale) || 0,
      payMethod2: String('CHEQUE').slice(0, 20),
      tenAmt2: Number(0),
      userName: String('online').slice(0, 20),
      priceTypeCode: String('RT').slice(0, 5),
      invoiceType: String('C').slice(0, 1),
      tillId: Number(tillId) || 1,
    };

    const invoiceCode = await insertInvoiceHeader(request, invoiceHeader);
    console.log('[INVOICE] inserted invoice header');

    const detailResult = await insertInvoiceDetails(
      request,
      invoiceCode,
      items,
      writebackLocationCode
    );
    const itemCount = detailResult.insertedCount;

    // Reduce stock for each sold item
    for (const item of items) {
      const qty = Number(item.qty);
      if (Number.isFinite(qty) && qty > 0) {
        await reduceStockOnSale(request, item.productCode, writebackLocationCode, qty);
      }
    }

    await updateLastCashSaleNo(request, nextLastCashSaleNo);
    console.log(`[INVOICE] LastCashSaleNo update success: ${nextLastCashSaleNo}`);

    console.log('[INVOICE] transaction-ready summary:', {
      orderId,
      reference: refNo,
      invoiceCode,
      cashSaleNo,
      itemCount,
    });

    return {
      success: true,
      orderId,
      reference: refNo,
      invoiceCode,
      cashSaleNo,
      itemCount,
      detailIds: detailResult.detailIds,
      tablesTouched: ['dbo.LastCashSaleNo', 'dbo.invoice', 'dbo.invoicedetails'],
    };
  } catch (error) {
    console.error('[INVOICE ERROR] Error in write-back:', error.message);
    throw error;
  }
}

module.exports = {
  getNextCashSaleNo,
  updateLastCashSaleNo,
  insertInvoiceHeader,
  insertInvoiceDetails,
  writeBackInvoice,
};
