const sql = require('mssql');
const priceUpdates = require('./price-updates');

async function executeUpdatePrice(pool, payload) {
  const productCode = payload.productCode;
  const locationCode = payload.locationCode || process.env.POS_LOCATION_CODE || 'SH';
  const priceTypeCode = payload.priceTypeCode || '1';
  const newPrice = Number(payload.newPrice);

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
    await priceUpdates.updateStandardPrice(
      request,
      productCode,
      newPrice,
      locationCode,
      priceTypeCode
    );

    await transaction.commit();

    return {
      message: 'Price updated in productprices',
      productCode,
      locationCode,
      priceTypeCode,
      newPrice,
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

async function executeUpdateStock() {
  throw new Error('UPDATE_STOCK not implemented yet in queue flow');
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
      return executeUpdateStock(pool, payload);
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
