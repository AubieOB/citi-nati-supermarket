const sql = require('mssql');
const priceUpdates = require('./price-updates');
const stockUpdates = require('./stock-updates');

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

async function executeApplyPromotion() {
  throw new Error('APPLY_PROMOTION not implemented yet in queue flow');
}

async function executeRevertPromotion() {
  throw new Error('REVERT_PROMOTION not implemented yet in queue flow');
}

async function executeWriteInvoice() {
  throw new Error('WRITE_INVOICE not implemented yet in queue flow');
}

async function executeCommand(pool, command) {
  const { commandType, payload } = command;

  switch (commandType) {
    case 'UPDATE_PRICE':
      return executeUpdatePrice(pool, payload);
    case 'UPDATE_STOCK':
      return executeUpdateStock(pool, payload, command.id);
    case 'APPLY_PROMOTION':
      return executeApplyPromotion(pool, payload);
    case 'REVERT_PROMOTION':
      return executeRevertPromotion(pool, payload);
    case 'WRITE_INVOICE':
      return executeWriteInvoice(pool, payload);
    default:
      throw new Error(`Unsupported command type: ${commandType}`);
  }
}

module.exports = {
  executeCommand,
};
