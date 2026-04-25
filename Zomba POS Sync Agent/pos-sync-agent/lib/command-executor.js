const sql = require('mssql');
const priceUpdates = require('./price-updates');
const productNameUpdates = require('./product-name-updates');
const stockUpdates = require('./stock-updates');
const invoiceWriteback = require('./invoice-writeback');
const { buildConfig } = require('./config');

function formatGrnDatePart(value) {
  var date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error('NON_RETRYABLE: CREATE_PENDING_STOCK_INTAKE payload has invalid grnDate');
  }
  return '' + date.getFullYear() + (date.getMonth() + 1) + date.getDate();
}

function buildGrnForSequence(datePart, seq) {
  var seqStr = String(seq);
  while (seqStr.length < 3) seqStr = '0' + seqStr;
  return 'GRN_' + datePart + '-' + seqStr;
}

function normalizeGrn(value) {
  return String(value || '').trim().toUpperCase();
}

function isValidGrnForDate(grnNo, datePart) {
  return new RegExp('^GRN_' + datePart + '-(\\d{3})$').test(normalizeGrn(grnNo));
}

async function acquireGrnAllocationLock(transaction, datePart) {
  var request = new sql.Request(transaction);
  request.input('resource', sql.NVarChar(255), 'CREATE_PENDING_STOCK_INTAKE_GRN_' + datePart);

  var result = await request.query([
    'DECLARE @lockResult int;',
    'EXEC @lockResult = sp_getapplock',
    '  @Resource = @resource,',
    '  @LockMode = \'Exclusive\',',
    '  @LockOwner = \'Transaction\',',
    '  @LockTimeout = 10000;',
    'SELECT @lockResult AS lockResult;',
  ].join('\n'));

  var lockResult = Number(result.recordset && result.recordset[0] && result.recordset[0].lockResult);
  if (!isFinite(lockResult) || lockResult < 0) {
    throw new Error('NON_RETRYABLE: Unable to reserve a GRN slot for this intake date. Please try again.');
  }
}

async function fetchExistingGrnsForDate(transaction, datePart) {
  var prefix = 'GRN_' + datePart + '-%';
  var request = new sql.Request(transaction);
  request.input('prefix', sql.NVarChar(50), prefix);

  var result = await request.query([
    'SELECT GRNNo FROM [POS].[dbo].[stocks_temp] WHERE GRNNo LIKE @prefix',
    'UNION',
    'SELECT GRNNo FROM [POS].[dbo].[stocks] WHERE GRNNo LIKE @prefix',
  ].join('\n'));

  var set = {};
  var rows = result.recordset || [];
  for (var i = 0; i < rows.length; i++) {
    var g = normalizeGrn(rows[i].GRNNo);
    if (g) set[g] = true;
  }
  return set;
}

async function ensureGrnIsStillAvailable(transaction, grnNo) {
  var request = new sql.Request(transaction);
  request.input('grnNo', sql.NVarChar(50), grnNo);

  var result = await request.query([
    'SELECT TOP 1 GRNNo FROM (',
    '  SELECT GRNNo FROM [POS].[dbo].[stocks_temp] WHERE GRNNo = @grnNo',
    '  UNION ALL',
    '  SELECT GRNNo FROM [POS].[dbo].[stocks] WHERE GRNNo = @grnNo',
    ') existing',
  ].join('\n'));

  return Array.isArray(result.recordset) && result.recordset.length > 0;
}

async function resolveFinalGrn(transaction, parsedGrnDate, requestedGrn, manualGrnOverride) {
  var datePart = formatGrnDatePart(parsedGrnDate);
  await acquireGrnAllocationLock(transaction, datePart);

  var normalizedRequestedGrn = normalizeGrn(requestedGrn);
  if (normalizedRequestedGrn && !isValidGrnForDate(normalizedRequestedGrn, datePart)) {
    throw new Error('NON_RETRYABLE: GRN ' + normalizedRequestedGrn + ' is invalid for intake date ' + datePart + '. Use format GRN_' + datePart + '-###.');
  }

  var existingGrns = await fetchExistingGrnsForDate(transaction, datePart);

  if (manualGrnOverride) {
    if (!normalizedRequestedGrn) {
      throw new Error('NON_RETRYABLE: Manual GRN override was selected but no GRN was provided.');
    }
    if (existingGrns[normalizedRequestedGrn]) {
      throw new Error('NON_RETRYABLE: Manual GRN ' + normalizedRequestedGrn + ' already exists in POS. Use a different GRN or switch back to auto-generated GRN.');
    }
    return {
      requestedGrn: normalizedRequestedGrn,
      finalGrn: normalizedRequestedGrn,
      grnWasRegenerated: false,
      generatedFromDuplicate: false,
      datePart: datePart,
    };
  }

  for (var seq = 1; seq <= 999; seq++) {
    var candidate = buildGrnForSequence(datePart, seq);
    if (!existingGrns[candidate]) {
      return {
        requestedGrn: normalizedRequestedGrn || candidate,
        finalGrn: candidate,
        grnWasRegenerated: Boolean(normalizedRequestedGrn) && normalizedRequestedGrn !== candidate,
        generatedFromDuplicate: Boolean(normalizedRequestedGrn) && Boolean(existingGrns[normalizedRequestedGrn]),
        datePart: datePart,
      };
    }
  }

  throw new Error('NON_RETRYABLE: Unable to generate a unique GRN for this intake date. Please try again.');
}

async function executeCreatePendingStockIntake(pool, payload, commandId) {
  var grnNo = payload.grnNo;
  var requestedGrn = payload.requestedGrn;
  var manualGrnOverride = payload.manualGrnOverride;
  var grnDate = payload.grnDate;
  var supplierCode = payload.supplierCode;
  var locationCode = payload.locationCode;
  var intakeRef = payload.intakeRef;
  var intakeId = payload.intakeId;
  var items = payload.items;

  var normalizedRequestedGrn = normalizeGrn(requestedGrn || grnNo || '');

  console.log('[INTAKE PENDING] CREATE_PENDING_STOCK_INTAKE start', {
    commandId: commandId,
    requestedGrn: normalizedRequestedGrn || null,
    manualGrnOverride: Boolean(manualGrnOverride),
    intakeRef: intakeRef,
    intakeId: intakeId,
    supplierCode: supplierCode,
    locationCode: locationCode,
    itemCount: Array.isArray(items) ? items.length : 0,
  });

  if (!supplierCode) {
    throw new Error('NON_RETRYABLE: CREATE_PENDING_STOCK_INTAKE payload missing supplierCode');
  }
  if (!locationCode) {
    throw new Error('NON_RETRYABLE: CREATE_PENDING_STOCK_INTAKE payload missing locationCode');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('NON_RETRYABLE: CREATE_PENDING_STOCK_INTAKE payload has no items');
  }

  var transaction = new sql.Transaction(pool);

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    var parsedGrnDate = grnDate ? new Date(grnDate) : new Date();
    var grnResolution = await resolveFinalGrn(
      transaction,
      parsedGrnDate,
      normalizedRequestedGrn,
      Boolean(manualGrnOverride)
    );

    if (await ensureGrnIsStillAvailable(transaction, grnResolution.finalGrn)) {
      throw new Error('NON_RETRYABLE: GRN ' + grnResolution.finalGrn + ' already exists in POS. Unable to reserve a unique GRN for this intake date. Please try again.');
    }

    var headerRequest = new sql.Request(transaction);
    headerRequest.input('grnNo', sql.NVarChar(50), grnResolution.finalGrn);
    headerRequest.input('grnDate', sql.DateTime, parsedGrnDate);
    headerRequest.input('supplierCode', sql.NVarChar(50), supplierCode);
    headerRequest.input('locationCode', sql.NVarChar(10), locationCode);

    await headerRequest.query([
      'INSERT INTO [POS].[dbo].[stocks_temp]',
      '  (GRNNo, GRNDate, SupplierCode, LocationCode, UploadStatus, OrderNumber)',
      'VALUES',
      '  (@grnNo, @grnDate, @supplierCode, @locationCode, 0, 0)',
    ].join('\n'));

    console.log('[INTAKE PENDING] stocks_temp header inserted GRN=' + grnResolution.finalGrn);

    var linesInserted = 0;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var detailRequest = new sql.Request(transaction);
      detailRequest.input('grnNo', sql.NVarChar(50), grnResolution.finalGrn);
      detailRequest.input('productCode', sql.NVarChar(50), String(item.productCode || '').trim());
      detailRequest.input('stockQty', sql.Float, Number(item.stockQty) || 0);
      detailRequest.input('unit', sql.NVarChar(20), String(item.unit || '').trim());
      detailRequest.input('costPrice', sql.Float, Number(item.costPrice) || 0);
      detailRequest.input('expiryDate', sql.DateTime, item.expiryDate ? new Date(item.expiryDate) : null);

      await detailRequest.query([
        'INSERT INTO [POS].[dbo].[stockdetails_temp]',
        '  (GRNNo, ProductCode, StockQty, Unit, StockOut, CostPrice, ExpiryDate, StartSerialNo, EndSerialNo, UploadStatus, Qty1, Qty1Out)',
        'VALUES',
        '  (@grnNo, @productCode, @stockQty, @unit, 0, @costPrice, @expiryDate, \'\', \'\', 0, 0, 0)',
      ].join('\n'));
      linesInserted++;
    }

    await transaction.commit();
    console.log('[INTAKE PENDING] transaction committed GRN=' + grnResolution.finalGrn + ' lines=' + linesInserted);

    var resultMessage = (grnResolution.grnWasRegenerated && grnResolution.generatedFromDuplicate)
      ? 'GRN ' + grnResolution.requestedGrn + ' already exists in POS. The system generated GRN ' + grnResolution.finalGrn + ' instead.'
      : 'CREATE_PENDING_STOCK_INTAKE executed successfully with GRN ' + grnResolution.finalGrn;

    return {
      message: resultMessage,
      requestedGrn: grnResolution.requestedGrn || null,
      finalGrn: grnResolution.finalGrn,
      grnNo: grnResolution.finalGrn,
      grnWasRegenerated: grnResolution.grnWasRegenerated,
      linesInserted: linesInserted,
      intakeRef: intakeRef || null,
      intakeId: intakeId || null,
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

async function executeUpdatePrice(pool, payload) {
  const config = buildConfig();
  const productCode = payload.productCode;
  const locationCode = payload.locationCode || config.posDb.locationCode;
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
  const config = buildConfig();
  const productCode = payload.productCode;
  const locationCode = payload.locationCode || config.posDb.locationCode;
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
  const config = buildConfig();
  console.log('[PROMO COMMAND] APPLY_PROMOTION start', {
    commandId,
    productCode: payload.productCode,
    locationCode: payload.locationCode || config.posDb.locationCode,
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
      locationCode: payload.locationCode || config.posDb.locationCode,
      priceTypeCode: payload.priceTypeCode || 'RT',
      promotionalPrice: Number(payload.promotionalPrice),
      priceId: (resultSummary && resultSummary.insertedRow && resultSummary.insertedRow.priceId),
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
        locationCode: payload.locationCode || config.posDb.locationCode,
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
      locationCode: payload.locationCode || config.posDb.locationCode,
      priceTypeCode: payload.priceTypeCode || 'RT',
      promotionalPrice: Number(payload.promotionalPrice),
      error: error.message,
    });
    throw error;
  }
}

async function executeRevertPromotion(pool, payload, commandId) {
  const config = buildConfig();
  console.log('[PROMO COMMAND] REVERT_PROMOTION start', {
    commandId,
    productCode: payload.productCode,
    locationCode: payload.locationCode || config.posDb.locationCode,
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
      locationCode: payload.locationCode || config.posDb.locationCode,
      priceTypeCode: payload.priceTypeCode || 'RT',
      restorePrice: payload.restorePrice == null ? null : Number(payload.restorePrice),
      priceId: (resultSummary && resultSummary.insertedRow && resultSummary.insertedRow.priceId),
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
        locationCode: payload.locationCode || config.posDb.locationCode,
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
      locationCode: payload.locationCode || config.posDb.locationCode,
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
  const config = buildConfig();
  const { features } = config;
  const { commandType, payload } = command;

  switch (commandType) {
    case 'UPDATE_PRICE':
      if (!features.enablePriceSync) {
        throw new Error('NON_RETRYABLE: UPDATE_PRICE command disabled by ENABLE_PRICE_SYNC=false');
      }
      return executeUpdatePrice(pool, payload);
    case 'UPDATE_PRODUCT_NAME':
      if (!features.enableProductNameSync) {
        throw new Error('NON_RETRYABLE: UPDATE_PRODUCT_NAME command disabled by ENABLE_PRODUCT_NAME_SYNC=false');
      }
      return executeUpdateProductName(pool, payload, command.id);
    case 'UPDATE_STOCK':
      if (!features.enableStockWriteback || !features.enableManualStockSync) {
        throw new Error('NON_RETRYABLE: UPDATE_STOCK command disabled by stock/manual feature flags');
      }
      return executeUpdateStock(pool, payload, command.id);
    case 'APPLY_PROMOTION':
      if (!features.enablePromotionSync) {
        throw new Error('NON_RETRYABLE: APPLY_PROMOTION command disabled by ENABLE_PROMOTION_SYNC=false');
      }
      return executeApplyPromotion(pool, payload, command.id);
    case 'REVERT_PROMOTION':
      if (!features.enablePromotionSync) {
        throw new Error('NON_RETRYABLE: REVERT_PROMOTION command disabled by ENABLE_PROMOTION_SYNC=false');
      }
      return executeRevertPromotion(pool, payload, command.id);
    case 'WRITE_INVOICE':
      if (!features.enableOnlineOrderWriteback || !features.enableInvoiceWriteback) {
        throw new Error('NON_RETRYABLE: WRITE_INVOICE command disabled by writeback feature flags');
      }
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
