/**
 * Invoice Write-Back Module
 * Handles insertion of invoice headers and details into POS database
 * Manages LastCashSaleNo sequencing and transaction integrity
 */

const sql = require('mssql');

/**
 * Get next CashSaleNo from LastCashSaleNo table
 * @param {sql.Request} request - SQL request object within a transaction
 * @returns {Promise<number>} Next CashSaleNo
 */
async function getNextCashSaleNo(request) {
  try {
    // Read current LastCashSaleNo
    const result = await request.query(`SELECT TOP 1 LastCashSaleNo FROM POS.dbo.LastCashSaleNo`);

    if (!result.recordset || result.recordset.length === 0) {
      throw new Error('LastCashSaleNo table is empty. Initialize it with a starting value.');
    }

    const currentNo = result.recordset[0].LastCashSaleNo;
    const nextNo = currentNo + 1;

    console.log(`[INVOICE] Next CashSaleNo: ${nextNo} (current: ${currentNo})`);
    return nextNo;
  } catch (error) {
    console.error('[INVOICE] Error reading LastCashSaleNo:', error.message);
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
    const query = `
      UPDATE POS.dbo.LastCashSaleNo
      SET LastCashSaleNo = @CashSaleNo
    `;

    request.input('CashSaleNo', sql.Int, newCashSaleNo);
    await request.query(query);

    console.log(`[INVOICE] ✅ Updated LastCashSaleNo to ${newCashSaleNo}`);
  } catch (error) {
    console.error('[INVOICE] Error updating LastCashSaleNo:', error.message);
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
      repCode,
    } = invoiceHeader;

    const query = `
      INSERT INTO POS.dbo.invoice (
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
        RepCode,
        UploadStatus
      )
      VALUES (
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
        @RepCode,
        0
      );
      SELECT SCOPE_IDENTITY() AS InvoiceCode;
    `;

    request.input('CashSaleNo', sql.Int, cashSaleNo);
    request.input('InvoiceDate', sql.DateTime, invoiceDate);
    request.input('InvoiceTime', sql.VarChar(10), invoiceTime);
    request.input('CustomerCode', sql.VarChar(50), customerCode);
    request.input('LocationCode', sql.VarChar(10), locationCode);
    request.input('GrossSale', sql.Decimal(18, 2), grossSale);
    request.input('VAT', sql.Decimal(18, 2), vat);
    request.input('Discount', sql.Decimal(18, 2), discount);
    request.input('NetSale', sql.Decimal(18, 2), netSale);
    request.input('PayMethod1', sql.VarChar(50), payMethod1 || 'CASH');
    request.input('TenAmt1', sql.Decimal(18, 2), tenAmt1 || 0);
    request.input('PayMethod2', sql.VarChar(50), payMethod2 || null);
    request.input('TenAmt2', sql.Decimal(18, 2), tenAmt2 || 0);
    request.input('UserName', sql.VarChar(50), userName || 'WEBSITE');
    request.input('PriceTypeCode', sql.VarChar(10), priceTypeCode || '1');
    request.input('RepCode', sql.VarChar(10), repCode || null);

    const result = await request.query(query);

    if (!result.recordset || result.recordset.length === 0) {
      throw new Error('Failed to get InvoiceCode from insert');
    }

    const invoiceCode = result.recordset[0].InvoiceCode;
    console.log(`[INVOICE] ✅ Inserted invoice header. InvoiceCode: ${invoiceCode}, CashSaleNo: ${cashSaleNo}`);

    return invoiceCode;
  } catch (error) {
    console.error('[INVOICE] Error inserting invoice header:', error.message);
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

    for (const item of items) {
      // Skip hidden products
      if (item.isHidden === true) {
        console.log(`[INVOICE DETAIL] ⚠️ Skipping hidden product: ${item.productCode}`);
        continue;
      }

      const {
        productCode,
        productName,
        qty,
        unitPrice,
        bulkPrice,
        discount,
        discountAmount,
        taxRate,
        taxAmount,
      } = item;

      // Calculate amount if not provided
      const amount = item.amount || (qty * unitPrice) - (discountAmount || 0);

      const query = `
        INSERT INTO POS.dbo.invoicedetails (
          InvoiceCode,
          ProductCode,
          ProductName,
          Qty,
          UnitPrice,
          BulkPrice,
          Discount,
          DiscountAmount,
          Amount,
          TaxRate,
          TaxAmount,
          LocationCode,
          UploadStatus
        )
        VALUES (
          @InvoiceCode,
          @ProductCode,
          @ProductName,
          @Qty,
          @UnitPrice,
          @BulkPrice,
          @Discount,
          @DiscountAmount,
          @Amount,
          @TaxRate,
          @TaxAmount,
          @LocationCode,
          0
        )
      `;

      request.input('InvoiceCode', sql.Int, invoiceCode);
      request.input('ProductCode', sql.VarChar(50), productCode);
      request.input('ProductName', sql.VarChar(255), productName);
      request.input('Qty', sql.Decimal(18, 2), qty);
      request.input('UnitPrice', sql.Decimal(18, 2), unitPrice);
      request.input('BulkPrice', sql.Decimal(18, 2), bulkPrice || 0);
      request.input('Discount', sql.Decimal(18, 2), discount || 0);
      request.input('DiscountAmount', sql.Decimal(18, 2), discountAmount || 0);
      request.input('Amount', sql.Decimal(18, 2), amount);
      request.input('TaxRate', sql.Decimal(18, 4), taxRate || 0);
      request.input('TaxAmount', sql.Decimal(18, 2), taxAmount || 0);
      request.input('LocationCode', sql.VarChar(10), locationCode);

      await request.query(query);
      insertedCount++;

      console.log(`[INVOICE DETAIL] ✅ Inserted detail: ${productCode} x${qty} @ ${unitPrice}`);
    }

    console.log(`[INVOICE DETAIL] ✅ Total items inserted: ${insertedCount}`);
    return insertedCount;
  } catch (error) {
    console.error('[INVOICE DETAIL] Error inserting invoice details:', error.message);
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
    console.log('[INVOICE WRITEBACK] Starting invoice write-back...');

    // Get next CashSaleNo
    const nextCashSaleNo = await getNextCashSaleNo(request);

    // Prepare invoice header with calculated CashSaleNo
    const invoiceHeader = {
      ...invoiceData,
      cashSaleNo: nextCashSaleNo,
    };

    // Insert header
    const invoiceCode = await insertInvoiceHeader(request, invoiceHeader);

    // Insert details
    const itemCount = await insertInvoiceDetails(
      request,
      invoiceCode,
      invoiceData.items,
      invoiceData.locationCode
    );

    // Update LastCashSaleNo
    await updateLastCashSaleNo(request, nextCashSaleNo);

    console.log(`[INVOICE WRITEBACK] ✅ Invoice write-back complete. InvoiceCode: ${invoiceCode}, Items: ${itemCount}`);

    return {
      success: true,
      invoiceCode,
      cashSaleNo: nextCashSaleNo,
      itemCount,
    };
  } catch (error) {
    console.error('[INVOICE WRITEBACK] Error in write-back:', error.message);
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
