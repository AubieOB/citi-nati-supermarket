/**
 * Invoice Write-Back Module
 * Handles insertion of invoice headers and details into POS database
 * Manages LastCashSaleNo sequencing and transaction integrity
 */

const sql = require('mssql');

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

/**
 * Get next CashSaleNo from LastCashSaleNo table
 * @param {sql.Request} request - SQL request object within a transaction
 * @returns {Promise<number>} Next CashSaleNo
 */
async function getNextCashSaleNo(request) {
  try {
    const selectRequest = createScopedRequest(request);
    const result = await selectRequest.query(`
      SELECT TOP 1 CashSaleNo
      FROM dbo.LastCashSaleNo WITH (UPDLOCK, HOLDLOCK)
    `);

    if (!result.recordset || result.recordset.length === 0) {
      throw new Error('LastCashSaleNo table is empty. Initialize it with a starting value.');
    }

    const currentNo = Number(result.recordset[0].CashSaleNo);

    if (!Number.isFinite(currentNo)) {
      throw new Error('LastCashSaleNo value is invalid');
    }

    const nextNo = currentNo + 1;

    console.log(`[INVOICE] using CashSaleNo=${currentNo}; next LastCashSaleNo will be ${nextNo}`);
    return {
      cashSaleNo: currentNo,
      nextLastCashSaleNo: nextNo,
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
    const updateRequest = createScopedRequest(request);
    const query = `
      UPDATE dbo.LastCashSaleNo
      SET CashSaleNo = @CashSaleNo
    `;

    updateRequest.input('CashSaleNo', sql.Int, newCashSaleNo);
    await updateRequest.query(query);

    console.log(`[INVOICE] updated LastCashSaleNo to ${newCashSaleNo}`);
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
      invoiceNo,
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

    const headerRequest = createScopedRequest(request);
    const query = `
      INSERT INTO POS.dbo.invoice (
        InvoiceNo,
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
        @InvoiceNo,
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

    headerRequest.input('InvoiceNo', sql.Int, invoiceNo);
    headerRequest.input('InvoiceSerialNo', sql.Int, invoiceSerialNo);
    headerRequest.input('RefNo', sql.VarChar(255), refNo);
    headerRequest.input('CashSaleNo', sql.Int, cashSaleNo);
    headerRequest.input('InvoiceDate', sql.DateTime, invoiceDate);
    headerRequest.input('InvoiceTime', sql.VarChar(8), invoiceTime);
    headerRequest.input('CustomerCode', sql.VarChar(50), customerCode);
    headerRequest.input('LocationCode', sql.VarChar(10), locationCode);
    headerRequest.input('GrossSale', sql.Decimal(18, 2), grossSale);
    headerRequest.input('VAT', sql.Decimal(18, 2), vat);
    headerRequest.input('Discount', sql.Decimal(18, 2), discount);
    headerRequest.input('NetSale', sql.Decimal(18, 2), netSale);
    headerRequest.input('PayMethod1', sql.VarChar(20), payMethod1);
    headerRequest.input('TenAmt1', sql.Decimal(18, 2), tenAmt1);
    headerRequest.input('PayMethod2', sql.VarChar(20), payMethod2 || '');
    headerRequest.input('TenAmt2', sql.Decimal(18, 2), tenAmt2 || 0);
    headerRequest.input('UserName', sql.VarChar(50), userName);
    headerRequest.input('PriceTypeCode', sql.VarChar(10), priceTypeCode);
    headerRequest.input('InvoiceType', sql.VarChar(10), invoiceType);
    headerRequest.input('TillID', sql.VarChar(20), tillId);

    const result = await headerRequest.query(query);

    if (!result.recordset || result.recordset.length === 0) {
      throw new Error('Failed to get InvoiceCode from insert');
    }

    const invoiceCode = Number(result.recordset[0].InvoiceCode);
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
        OUTPUT INSERTED.InvDetailID AS DetailID
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

      const detailResult = await detailRequest.query(query);
      insertedCount++;

      if (detailResult.recordset && detailResult.recordset[0] && detailResult.recordset[0].DetailID) {
        detailIds.push(Number(detailResult.recordset[0].DetailID));
      }

      console.log(`[INVOICE] inserted detail row for ${productCode}; qty=${qty}`);
    }

    console.log(`[INVOICE] inserted ${insertedCount} invoice detail row(s)`);
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
      'InvoiceNo',
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

    if (!orderId) {
      throw new Error('NON_RETRYABLE: orderId is required');
    }

    if (!locationCode || !customerCode) {
      throw new Error('NON_RETRYABLE: locationCode and customerCode are required');
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('NON_RETRYABLE: items must be a non-empty array');
    }

    console.log(`[INVOICE] WRITE_INVOICE start orderId=${orderId} reference=${reference} items=${items.length}`);

    const cashSale = await getNextCashSaleNo(request);
    const cashSaleNo = cashSale.cashSaleNo;
    const nextLastCashSaleNo = cashSale.nextLastCashSaleNo;

    const safeInvoiceDate = toSqlDate(invoiceDate, invoiceTime);
    const safeInvoiceTime = normalizeTime(invoiceTime);

    const invoiceNo = cashSaleNo;
    const invoiceSerialNo = cashSaleNo;
    const refNo = reference || `WEB-ORDER-${orderId}`;

    const invoiceHeader = {
      invoiceNo,
      invoiceSerialNo,
      refNo,
      cashSaleNo,
      invoiceDate: safeInvoiceDate,
      invoiceTime: safeInvoiceTime,
      customerCode,
      locationCode,
      grossSale: Number(grossSale),
      vat: Number(vat),
      discount: Number(discount),
      netSale: Number(netSale),
      payMethod1: payMethod1 || 'CARD',
      tenAmt1: Number(tenAmt1),
      payMethod2: payMethod2 || '',
      tenAmt2: Number(tenAmt2),
      userName: userName || 'ONLINE',
      priceTypeCode: priceTypeCode || 'RT',
      invoiceType: invoiceType || 'CS',
      tillId: tillId || 'WEB',
    };

    const invoiceCode = await insertInvoiceHeader(request, invoiceHeader);
    console.log('[INVOICE] inserted invoice header');

    const detailResult = await insertInvoiceDetails(
      request,
      invoiceCode,
      items,
      locationCode
    );
    const itemCount = detailResult.insertedCount;

    await updateLastCashSaleNo(request, nextLastCashSaleNo);
    console.log('[INVOICE] updated LastCashSaleNo');

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
