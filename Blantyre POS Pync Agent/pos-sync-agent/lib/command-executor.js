const sql = require('mssql');
const priceUpdates = require('./price-updates');
const productNameUpdates = require('./product-name-updates');
const stockUpdates = require('./stock-updates');
const invoiceWriteback = require('./invoice-writeback');

async function executeUpdatePrice(pool, payload) {
  const productCode = payload.productCode;
  const locationCode = payload.locationCode || process.env.POS_LOCATION_CODE || 'SH';
  const priceTypeCode = payload.priceTypeCode || null;
  const newPrice = Number(payload.newPrice);

  console.log('[PRICE] UPDATE_PRICE payload:', {
    productCode,
    locationCode,
    priceTypeCode,
    newPrice,
  });

  if (!productCode) {
    throw new Error('NON_RETRYABLE: UPDATE_PRICE payload missing productCode');
  }

  if (!Number.isFinite(newPrice) || newPrice < 0) {
    throw new Error('NON_RETRYABLE: UPDATE_PRICE payload has invalid newPrice');
  }

  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const request = new sql.Request(transaction);
    const updateSummary = await priceUpdates.updateStandardPrice(
      request,
      productCode,
      newPrice,
      locationCode,
      priceTypeCode
    );

    await transaction.commit();

    return {
      message: 'Price write executed in productprices',
      ...updateSummary,
      globalPricesLogged: true,
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackErr) {
      console.error('[POS COMMAND EXECUTOR ERROR] rollback failed:', rollbackErr.message);
    }
    throw error;
  }
}

function isLikelyNonRetryableProductNameError(message) {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('permission')
    || text.includes('denied')
    || text.includes('invalid column')
    || text.includes('invalid object')
    || text.includes('schema')
    || text.includes('does not exist')
    || text.includes('missing productcode')
    || text.includes('exceeds max length')
  );
}

async function executeUpdateProductName(pool, payload, commandId) {
  const productCode = payload.productCode;
  const newName = String(payload.newName || '').trim();

  console.log('[PRODUCT NAME] UPDATE_PRODUCT_NAME payload:', {
    commandId,
    productCode,
    oldName: payload.oldName || null,
    newName,
    branchCode: payload.branchCode || null,
    locationCode: payload.locationCode || null,
    updatedBy: payload.updatedBy || null,
  });

  if (!productCode) {
    throw new Error('NON_RETRYABLE: UPDATE_PRODUCT_NAME payload missing productCode');
  }

  if (!newName) {
    throw new Error('NON_RETRYABLE: UPDATE_PRODUCT_NAME payload missing newName');
  }

  if (newName.length > 120) {
    throw new Error('NON_RETRYABLE: UPDATE_PRODUCT_NAME newName exceeds max length 120');
  }

  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const request = new sql.Request(transaction);
    const resultSummary = await productNameUpdates.updateProductName(request, payload);

    await transaction.commit();

    return {
      message: 'Product name write-back executed successfully',
      ...resultSummary,
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackErr) {
      console.error('[POS COMMAND EXECUTOR ERROR] rollback failed:', rollbackErr.message);
    }

    if (String(error.message || '').startsWith('NON_RETRYABLE:') || isLikelyNonRetryableProductNameError(error.message)) {
      throw new Error(`NON_RETRYABLE: ${String(error.message || '').replace(/^NON_RETRYABLE:\s*/, '')}`);
    }

    throw error;
  }
}

function isLikelyNonRetryableStockError(message) {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('permission')
    || text.includes('denied')
    || text.includes('invalid column')
    || text.includes('invalid object')
    || text.includes('schema')
    || text.includes('unsupported')
    || text.includes('insufficient stock')
    || text.includes('missing')
  );
}

async function executeUpdateStock(pool, payload, commandId) {
  const productCode = payload.productCode;
  const locationCode = payload.locationCode || process.env.POS_LOCATION_CODE || 'SH';
  const oldStock = Number(payload.oldStock);
  const newStock = Number(payload.newStock);
  const qtyReduction = Number(payload.qtyReduction);
  const adjustmentType = payload.adjustmentType;
  const reason = payload.reason || 'manual_admin_adjustment';

  console.log('[STOCK] UPDATE_STOCK payload:', {
    productCode,
    locationCode,
    oldStock,
    newStock,
    qtyReduction,
    adjustmentType,
    reason,
  });

  if (!productCode) {
    throw new Error('NON_RETRYABLE: UPDATE_STOCK payload missing productCode');
  }

  if (!locationCode) {
    throw new Error('NON_RETRYABLE: UPDATE_STOCK payload missing locationCode');
  }

  if (adjustmentType !== 'DECREASE') {
    throw new Error('NON_RETRYABLE: UPDATE_STOCK supports DECREASE only in Phase 2');
  }

  if (!Number.isFinite(oldStock) || !Number.isFinite(newStock)) {
    throw new Error('NON_RETRYABLE: UPDATE_STOCK payload has invalid oldStock/newStock');
  }

  if (!Number.isFinite(qtyReduction) || qtyReduction <= 0) {
    throw new Error('NON_RETRYABLE: UPDATE_STOCK payload has invalid qtyReduction');
  }

  if (newStock >= oldStock) {
    throw new Error('NON_RETRYABLE: UPDATE_STOCK requires a stock decrease (newStock < oldStock)');
  }

  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();
    const request = new sql.Request(transaction);

    const updateSummary = await stockUpdates.applyManualStockDecrease(request, {
      productCode,
      locationCode,
      oldStock,
      newStock,
      qtyReduction,
      commandId,
      reason,
    });

    await transaction.commit();
    console.log('[STOCK] adjustment committed');

    return {
      message: 'Manual stock decrease executed',
      ...updateSummary,
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackErr) {
      console.error('[POS COMMAND EXECUTOR ERROR] rollback failed:', rollbackErr.message);
    }

    if (String(error.message || '').startsWith('NON_RETRYABLE:') || isLikelyNonRetryableStockError(error.message)) {
      throw new Error(`NON_RETRYABLE: ${String(error.message || '').replace(/^NON_RETRYABLE:\s*/, '')}`);
    }

    throw error;
  }
}

function isLikelyNonRetryablePromotionError(message) {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('non_retryable')
    || text.includes('product') && text.includes('does not exist')
    || text.includes('required')
    || text.includes('invalid column')
    || text.includes('invalid object')
    || text.includes('matches current latest price')
    || text.includes('no prior price found')
    || text.includes('must be greater than 0')
  );
}

async function executeApplyPromotion(pool, payload, commandId) {
  console.log('[PROMO COMMAND] APPLY_PROMOTION start', {
    commandId,
    branchCode: payload.branchCode || null,
    requestedLocationCode: payload.requestedLocationCode || null,
    productCode: payload.productCode,
    locationCode: payload.locationCode || process.env.POS_LOCATION_CODE || 'SH',
    priceTypeCode: payload.priceTypeCode || 'RT',
    promotionalPrice: Number(payload.promotionalPrice),
    reasonCode: payload.reasonCode || 'EXPIRY_CLEARANCE',
    updatePromotionalFlag: payload.updatePromotionalFlag === true,
  });

  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();
    const request = new sql.Request(transaction);

    const resultSummary = await priceUpdates.applyPromotionalPrice(request, payload);

    await transaction.commit();
    console.log('[PROMO COMMAND] success', {
      commandId,
      action: 'APPLY_PROMOTION',
      branchCode: payload.branchCode || null,
      requestedLocationCode: payload.requestedLocationCode || null,
      productCode: payload.productCode,
      locationCode: payload.locationCode || process.env.POS_LOCATION_CODE || 'SH',
      priceTypeCode: payload.priceTypeCode || 'RT',
      promotionalPrice: Number(payload.promotionalPrice),
      priceId: resultSummary?.insertedRow?.priceId,
      writtenPriceTypes: resultSummary?.targetPriceTypes || (resultSummary?.priceTypeCode ? [resultSummary.priceTypeCode] : []),
      latestRowsAfterWrite: resultSummary?.sourceDiagnosticsAfter?.recentRows || [],
    });
    return {
      message: 'Promotion write executed in productprices',
      ...resultSummary,
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackErr) {
      console.error('[POS COMMAND EXECUTOR ERROR] rollback failed:', rollbackErr.message);
    }

    if (String(error.message || '').startsWith('NON_RETRYABLE:') || isLikelyNonRetryablePromotionError(error.message)) {
      console.error('[PROMO COMMAND ERROR] failure', {
        commandId,
        action: 'APPLY_PROMOTION',
        branchCode: payload.branchCode || null,
        requestedLocationCode: payload.requestedLocationCode || null,
        productCode: payload.productCode,
        locationCode: payload.locationCode || process.env.POS_LOCATION_CODE || 'SH',
        priceTypeCode: payload.priceTypeCode || 'RT',
        promotionalPrice: Number(payload.promotionalPrice),
        error: error.message,
      });
      throw new Error(`NON_RETRYABLE: ${String(error.message || '').replace(/^NON_RETRYABLE:\s*/, '')}`);
    }

    console.error('[PROMO COMMAND ERROR] failure', {
      commandId,
      action: 'APPLY_PROMOTION',
      branchCode: payload.branchCode || null,
      requestedLocationCode: payload.requestedLocationCode || null,
      productCode: payload.productCode,
      locationCode: payload.locationCode || process.env.POS_LOCATION_CODE || 'SH',
      priceTypeCode: payload.priceTypeCode || 'RT',
      promotionalPrice: Number(payload.promotionalPrice),
      error: error.message,
    });
    throw error;
  }
}

async function executeRevertPromotion(pool, payload, commandId) {
  console.log('[PROMO COMMAND] REVERT_PROMOTION start', {
    commandId,
    branchCode: payload.branchCode || null,
    requestedLocationCode: payload.requestedLocationCode || null,
    productCode: payload.productCode,
    locationCode: payload.locationCode || process.env.POS_LOCATION_CODE || 'SH',
    priceTypeCode: payload.priceTypeCode || 'RT',
    restorePrice: payload.restorePrice == null ? null : Number(payload.restorePrice),
    reasonCode: payload.reasonCode || 'EXPIRY_CLEARANCE',
    updatePromotionalFlag: payload.updatePromotionalFlag === true,
  });

  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();
    const request = new sql.Request(transaction);

    const resultSummary = await priceUpdates.revertToStandardPrice(request, payload);

    await transaction.commit();
    console.log('[PROMO COMMAND] success', {
      commandId,
      action: 'REVERT_PROMOTION',
      branchCode: payload.branchCode || null,
      requestedLocationCode: payload.requestedLocationCode || null,
      productCode: payload.productCode,
      locationCode: payload.locationCode || process.env.POS_LOCATION_CODE || 'SH',
      priceTypeCode: payload.priceTypeCode || 'RT',
      restorePrice: payload.restorePrice == null ? null : Number(payload.restorePrice),
      priceId: resultSummary?.insertedRow?.priceId,
      writtenPriceTypes: resultSummary?.targetPriceTypes || (resultSummary?.priceTypeCode ? [resultSummary.priceTypeCode] : []),
      latestRowsAfterWrite: resultSummary?.sourceDiagnosticsAfter?.recentRows || [],
    });
    return {
      message: 'Promotion revert executed in productprices',
      ...resultSummary,
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackErr) {
      console.error('[POS COMMAND EXECUTOR ERROR] rollback failed:', rollbackErr.message);
    }

    if (String(error.message || '').startsWith('NON_RETRYABLE:') || isLikelyNonRetryablePromotionError(error.message)) {
      console.error('[PROMO COMMAND ERROR] failure', {
        commandId,
        action: 'REVERT_PROMOTION',
        branchCode: payload.branchCode || null,
        requestedLocationCode: payload.requestedLocationCode || null,
        productCode: payload.productCode,
        locationCode: payload.locationCode || process.env.POS_LOCATION_CODE || 'SH',
        priceTypeCode: payload.priceTypeCode || 'RT',
        restorePrice: payload.restorePrice == null ? null : Number(payload.restorePrice),
        error: error.message,
      });
      throw new Error(`NON_RETRYABLE: ${String(error.message || '').replace(/^NON_RETRYABLE:\s*/, '')}`);
    }

    console.error('[PROMO COMMAND ERROR] failure', {
      commandId,
      action: 'REVERT_PROMOTION',
      branchCode: payload.branchCode || null,
      requestedLocationCode: payload.requestedLocationCode || null,
      productCode: payload.productCode,
      locationCode: payload.locationCode || process.env.POS_LOCATION_CODE || 'SH',
      priceTypeCode: payload.priceTypeCode || 'RT',
      restorePrice: payload.restorePrice == null ? null : Number(payload.restorePrice),
      error: error.message,
    });
    throw error;
  }
}

function isLikelyNonRetryableInvoiceError(message) {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('permission')
    || text.includes('denied')
    || text.includes('invalid column')
    || text.includes('invalid object')
    || text.includes('cannot insert')
    || text.includes('conversion failed')
    || text.includes('string or binary data would be truncated')
    || text.includes('required')
    || text.includes('missing')
    || text.includes('unsupported')
    || text.includes('schema')
  );
}

async function executeWriteInvoice(pool, payload, commandId) {
  const orderId = payload.orderId;
  const reference = payload.reference || `WEB-REF-${commandId}`;
  const itemCount = Array.isArray(payload.items) ? payload.items.length : 0;

  console.log('[INVOICE] WRITE_INVOICE start:', {
    commandId,
    orderId,
    reference,
    itemCount,
  });

  if (!orderId) {
    throw new Error('NON_RETRYABLE: WRITE_INVOICE payload missing orderId');
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error('NON_RETRYABLE: WRITE_INVOICE payload has no items');
  }

  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();
    console.log('[INVOICE] transaction start');

    const request = new sql.Request(transaction);
    const resultSummary = await invoiceWriteback.writeBackInvoice(request, {
      ...payload,
      reference,
      commandId,
    });

    await transaction.commit();
    console.log('[INVOICE] transaction committed');

    return {
      message: 'WRITE_INVOICE executed successfully',
      ...resultSummary,
      orderId,
      reference,
    };
  } catch (error) {
    try {
      await transaction.rollback();
      console.log('[INVOICE ERROR] rollback completed');
    } catch (rollbackErr) {
      console.log('[INVOICE ERROR] rollback note (transaction already aborted by SQL Server):', rollbackErr.message);
    }

    if (String(error.message || '').startsWith('NON_RETRYABLE:') || isLikelyNonRetryableInvoiceError(error.message)) {
      throw new Error(`NON_RETRYABLE: ${String(error.message || '').replace(/^NON_RETRYABLE:\s*/, '')}`);
    }

    throw error;
  }
}

async function executeCreatePendingStockIntake(pool, payload, commandId) {
  const { grnNo, grnDate, supplierCode, locationCode, intakeRef, intakeId, items } = payload;

  console.log('[INTAKE PENDING] CREATE_PENDING_STOCK_INTAKE start', {
    commandId,
    grnNo,
    intakeRef,
    intakeId,
    supplierCode,
    locationCode,
    itemCount: Array.isArray(items) ? items.length : 0,
  });

  if (!grnNo) {
    throw new Error('NON_RETRYABLE: CREATE_PENDING_STOCK_INTAKE payload missing grnNo');
  }
  if (!supplierCode) {
    throw new Error('NON_RETRYABLE: CREATE_PENDING_STOCK_INTAKE payload missing supplierCode');
  }
  if (!locationCode) {
    throw new Error('NON_RETRYABLE: CREATE_PENDING_STOCK_INTAKE payload missing locationCode');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('NON_RETRYABLE: CREATE_PENDING_STOCK_INTAKE payload has no items');
  }

  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const checkRequest = new sql.Request(transaction);
    checkRequest.input('grnNo', sql.NVarChar(50), grnNo);

    // Duplicate GRN check in stocks_temp
    const dupTempResult = await checkRequest.query(
      `SELECT TOP 1 GRNNo FROM [POS].[dbo].[stocks_temp] WHERE GRNNo = @grnNo`
    );
    if (dupTempResult.recordset && dupTempResult.recordset.length > 0) {
      throw new Error(`NON_RETRYABLE: GRN ${grnNo} already exists in stocks_temp (duplicate transfer)`);
    }

    // Duplicate GRN check in live stocks
    const dupLiveResult = await checkRequest.query(
      `SELECT TOP 1 GRNNo FROM [POS].[dbo].[stocks] WHERE GRNNo = @grnNo`
    );
    if (dupLiveResult.recordset && dupLiveResult.recordset.length > 0) {
      throw new Error(`NON_RETRYABLE: GRN ${grnNo} already exists in live stocks table (already approved)`);
    }

    // Insert header into stocks_temp
    const headerRequest = new sql.Request(transaction);
    const parsedGrnDate = grnDate ? new Date(grnDate) : new Date();
    headerRequest.input('grnNo',        sql.NVarChar(50),   grnNo);
    headerRequest.input('grnDate',      sql.DateTime,       parsedGrnDate);
    headerRequest.input('supplierCode', sql.NVarChar(50),   supplierCode);
    headerRequest.input('locationCode', sql.NVarChar(10),   locationCode);

    await headerRequest.query(`
      INSERT INTO [POS].[dbo].[stocks_temp]
        (GRNNo, GRNDate, SupplierCode, LocationCode, UploadStatus, OrderNumber)
      VALUES
        (@grnNo, @grnDate, @supplierCode, @locationCode, 0, 0)
    `);

    console.log(`[INTAKE PENDING] stocks_temp header inserted GRN=${grnNo}`);

    // Insert detail lines into stockdetails_temp
    let linesInserted = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const detailRequest = new sql.Request(transaction);
      detailRequest.input('grnNo',        sql.NVarChar(50),   grnNo);
      detailRequest.input('productCode',  sql.NVarChar(50),   String(item.productCode || '').trim());
      detailRequest.input('stockQty',     sql.Float,          Number(item.stockQty) || 0);
      detailRequest.input('unit',         sql.NVarChar(20),   String(item.unit || '').trim());
      detailRequest.input('costPrice',    sql.Float,          Number(item.costPrice) || 0);
      detailRequest.input('expiryDate',   sql.DateTime,       item.expiryDate ? new Date(item.expiryDate) : null);

      await detailRequest.query(`
        INSERT INTO [POS].[dbo].[stockdetails_temp]
          (GRNNo, ProductCode, StockQty, Unit, StockOut, CostPrice, ExpiryDate, StartSerialNo, EndSerialNo, UploadStatus, Qty1, Qty1Out)
        VALUES
          (@grnNo, @productCode, @stockQty, @unit, 0, @costPrice, @expiryDate, '', '', 0, 0, 0)
      `);
      linesInserted++;
    }

    await transaction.commit();
    console.log(`[INTAKE PENDING] transaction committed GRN=${grnNo} lines=${linesInserted}`);

    return {
      message:       'CREATE_PENDING_STOCK_INTAKE executed successfully',
      grnNo,
      linesInserted,
      intakeRef:     intakeRef || null,
      intakeId:      intakeId || null,
    };
  } catch (error) {
    try {
      await transaction.rollback();
      console.log('[INTAKE PENDING ERROR] rollback completed');
    } catch (rollbackErr) {
      console.log('[INTAKE PENDING ERROR] rollback note (already aborted):', rollbackErr.message);
    }

    if (String(error.message || '').startsWith('NON_RETRYABLE:')) {
      throw error;
    }

    throw error;
  }
}

async function executeCommand(pool, command) {
  const { commandType, payload } = command;

  switch (commandType) {
    case 'UPDATE_PRICE':
      return executeUpdatePrice(pool, payload);
    case 'UPDATE_PRODUCT_NAME':
      if (process.env.ENABLE_PRODUCT_NAME_SYNC === 'false') {
        throw new Error('NON_RETRYABLE: UPDATE_PRODUCT_NAME command disabled by ENABLE_PRODUCT_NAME_SYNC=false');
      }
      return executeUpdateProductName(pool, payload, command.id);
    case 'UPDATE_STOCK':
      return executeUpdateStock(pool, payload, command.id);
    case 'APPLY_PROMOTION':
      return executeApplyPromotion(pool, payload, command.id);
    case 'REVERT_PROMOTION':
      return executeRevertPromotion(pool, payload, command.id);
    case 'WRITE_INVOICE':
      return executeWriteInvoice(pool, payload, command.id);
    case 'CREATE_PENDING_STOCK_INTAKE':
      return executeCreatePendingStockIntake(pool, payload, command.id);
    default:
      throw new Error(`Unsupported command type: ${commandType}`);
  }
}

module.exports = {
  executeCommand,
};
