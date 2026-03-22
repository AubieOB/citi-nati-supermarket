const sql = require('mssql');
const priceUpdates = require('./price-updates');
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

  // Run schema alignment outside the transaction so ALTER TABLE failures
  // (e.g. pos_sync_writer lacks DDL permissions) cannot abort DML work.
  await stockUpdates.ensureProductCodeSchemaCapacity(pool);

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
      productCode: payload.productCode,
      locationCode: payload.locationCode || process.env.POS_LOCATION_CODE || 'SH',
      priceTypeCode: payload.priceTypeCode || 'RT',
      promotionalPrice: Number(payload.promotionalPrice),
      priceId: resultSummary?.insertedRow?.priceId,
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
      productCode: payload.productCode,
      locationCode: payload.locationCode || process.env.POS_LOCATION_CODE || 'SH',
      priceTypeCode: payload.priceTypeCode || 'RT',
      restorePrice: payload.restorePrice == null ? null : Number(payload.restorePrice),
      priceId: resultSummary?.insertedRow?.priceId,
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

async function executeCommand(pool, command) {
  const { commandType, payload } = command;

  switch (commandType) {
    case 'UPDATE_PRICE':
      return executeUpdatePrice(pool, payload);
    case 'UPDATE_STOCK':
      return executeUpdateStock(pool, payload, command.id);
    case 'APPLY_PROMOTION':
      return executeApplyPromotion(pool, payload, command.id);
    case 'REVERT_PROMOTION':
      return executeRevertPromotion(pool, payload, command.id);
    case 'WRITE_INVOICE':
      return executeWriteInvoice(pool, payload, command.id);
    default:
      throw new Error(`Unsupported command type: ${commandType}`);
  }
}

module.exports = {
  executeCommand,
};
