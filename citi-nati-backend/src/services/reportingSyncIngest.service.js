const prisma = require('../config/prisma');
const logger = require('../utils/logger');

function toInt(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function toFloat(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeLocationId(value) {
  const rawLocationId = value;
  const normalizedLocationId =
    rawLocationId !== undefined &&
    rawLocationId !== null &&
    rawLocationId !== ''
      ? Number(rawLocationId)
      : null;
  const safeLocationId = Number.isInteger(normalizedLocationId)
    ? normalizedLocationId
    : null;

  logger.debugLog('[BACKFILL LOCATION NORMALIZATION]', {
    rawLocationId,
    normalizedLocationId,
    typeofRawLocationId: typeof rawLocationId,
    safeLocationId,
  });

  return safeLocationId;
}

function toStringOrNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toDateOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeLatestProductCost(item, batchMeta) {
  return {
    syncSourceId: batchMeta.syncSourceId,
    branchCode: batchMeta.branchCode,
    branchName: batchMeta.branchName,
    locationId: batchMeta.locationId,
    locationCode: toStringOrNull(item.locationCode),
    syncSourceCode: batchMeta.syncSourceCode,
    productCode: toStringOrNull(item.productCode),
    productName: toStringOrNull(item.productName),
    latestUnitCost: item.latestUnitCost == null ? null : toFloat(item.latestUnitCost, null),
    latestGrnNo: toStringOrNull(item.latestGrnNo),
    latestGrnReference: toStringOrNull(item.latestGrnReference),
    latestGrnDate: toDateOrNull(item.latestGrnDate),
    stockDetailId: toStringOrNull(item.stockDetailId),
    sourceUpdatedAt: toDateOrNull(item.sourceUpdatedAt),
    sourceSyncedAt: batchMeta.syncedAt,
    lastReceivedAt: new Date(),
  };
}

function normalizeInvoice(invoice, batchMeta) {
  return {
    syncSourceId: batchMeta.syncSourceId,
    branchCode: batchMeta.branchCode,
    branchName: batchMeta.branchName,
    locationId: batchMeta.locationId,
    syncSourceCode: batchMeta.syncSourceCode,
    sourceInvoiceNo: toInt(invoice.invoiceNo),
    sourceInvoiceSerialNo: toInt(invoice.invoiceSerialNo),
    sourceCashSaleNo: toInt(invoice.cashSaleNo),
    refNo: toStringOrNull(invoice.refNo),
    invoiceDate: toDateOrNull(invoice.invoiceDate),
    invoiceTime: toDateOrNull(invoice.invoiceTime),
    customerCode: toStringOrNull(invoice.customerCode),
    customerDetails: toStringOrNull(invoice.customerDetails),
    locationCode: toStringOrNull(invoice.locationCode),
    grossSale: toFloat(invoice.grossSale),
    vatAmount: toFloat(invoice.vat),
    discount: toFloat(invoice.discount),
    netSale: toFloat(invoice.netSale),
    invoiceType: toStringOrNull(invoice.invoiceType),
    tillId: toInt(invoice.tillId),
    payMethod1: toStringOrNull(invoice.payMethod1),
    tenderAmount1: toFloat(invoice.tenAmt1),
    chqNo1: toStringOrNull(invoice.chqNo1),
    payMethod2: toStringOrNull(invoice.payMethod2),
    tenderAmount2: toFloat(invoice.tenAmt2),
    chqNo2: toStringOrNull(invoice.chqNo2),
    userName: toStringOrNull(invoice.userName),
    priceTypeCode: toStringOrNull(invoice.priceTypeCode),
    repCode: toStringOrNull(invoice.repCode),
    uploadStatus: toInt(invoice.uploadStatus),
    levyAmount: toFloat(invoice.levyAmount),
    reserved: toInt(invoice.reserved),
    discountAmount: toFloat(invoice.discountAmount),
    fiscalReceiptNo: toStringOrNull(invoice.fiscalReceiptNo),
    bankCode: toStringOrNull(invoice.bankCode),
    bankName: toStringOrNull(invoice.bankName),
    bankCardHolder: toStringOrNull(invoice.bankCardHolder),
    bankCardNo: toStringOrNull(invoice.bankCardNo),
    bankCardExpiry: toStringOrNull(invoice.bankCardExpiry),
    quoteNo: toStringOrNull(invoice.quoteNo),
    sourceSyncedAt: batchMeta.syncedAt,
    lastReceivedAt: new Date(),
  };
}

function normalizeInvoiceItem(item, syncSourceCode, salesInvoiceId) {
  return {
    salesInvoiceId,
    syncSourceCode,
    sourceInvDetailId: toInt(item.invDetailId),
    sourceInvoiceCode: toInt(item.invoiceCode),
    productCode: toStringOrNull(item.productCode),
    productName: toStringOrNull(item.productName),
    qty: toFloat(item.qty),
    priceTypeCode: toStringOrNull(item.priceTypeCode),
    unitPrice: toFloat(item.unitPrice),
    bulkPrice: toFloat(item.bulkPrice),
    discount: toFloat(item.discount),
    amount: toFloat(item.amount),
    startSerialNo: toStringOrNull(item.startSerialNo),
    endSerialNo: toStringOrNull(item.endSerialNo),
    taxRate: toFloat(item.taxRate),
    taxAmount: toFloat(item.taxAmount),
    fPrice: toFloat(item.fPrice),
    uploadStatus: toInt(item.uploadStatus),
    locationCode: toStringOrNull(item.locationCode),
    levyRate: toFloat(item.levyRate),
    levyAmount: toFloat(item.levyAmount),
    printed: toInt(item.printed),
    subQty: toFloat(item.subQty),
    discountAmount: toFloat(item.discountAmount),
    costPrice: toFloat(item.costPrice),
    grnDate: toDateOrNull(item.grnDate),
    lastReceivedAt: new Date(),
  };
}

async function upsertSyncSource(tx, payload) {
  const now = new Date();
  return tx.salesSyncSource.upsert({
    where: {
      syncSourceCode: payload.syncSourceCode,
    },
    create: {
      branchCode: payload.branchCode,
      branchName: payload.branchName,
      locationId: normalizeLocationId(payload.locationId),
      syncSourceCode: payload.syncSourceCode,
      lastSeenAt: now,
    },
    update: {
      branchCode: payload.branchCode,
      branchName: payload.branchName,
      locationId: normalizeLocationId(payload.locationId),
      lastSeenAt: now,
      updatedAt: now,
    },
  });
}

async function processInvoice(tx, invoice, batchMeta) {
  const invoiceData = normalizeInvoice(invoice, batchMeta);

  // Pre-insert validation: catch missing required fields early
  if (!invoiceData.sourceInvoiceNo) {
    throw new Error(`NON_RETRYABLE: Invoice missing sourceInvoiceNo (invoiceNo=${invoice.invoiceNo})`);
  }
  if (!invoiceData.sourceInvoiceSerialNo) {
    throw new Error(`NON_RETRYABLE: Invoice missing sourceInvoiceSerialNo (invoiceNo=${invoice.invoiceNo})`);
  }
  if (!invoiceData.invoiceDate) {
    throw new Error(`NON_RETRYABLE: Invoice missing invoiceDate (invoiceNo=${invoice.invoiceNo})`);
  }

  try {
    const existingInvoice = await tx.salesInvoice.findFirst({
  where: {
    syncSourceCode: batchMeta.syncSourceCode,
    sourceInvoiceNo: invoiceData.sourceInvoiceNo,
  },
  select: { id: true },
});

    let salesInvoice;
    let inserted = 0;
    let updated = 0;

    if (!existingInvoice) {
      try {
        salesInvoice = await tx.salesInvoice.create({
          data: {
            ...invoiceData,
            firstReceivedAt: new Date(),
          },
          select: { id: true },
        });
        inserted = 1;
      } catch (createErr) {
        logger.errorLog('[REPORTING SYNC][CREATE INVOICE] Creation failed:', {
          invoiceNo: invoice.invoiceNo,
          syncSourceCode: batchMeta.syncSourceCode,
          sourceInvoiceNo: invoiceData.sourceInvoiceNo,
          message: createErr && createErr.message ? createErr.message : String(createErr),
          code: createErr && createErr.code ? createErr.code : null,
        });
        throw createErr;
      }
    } else {
      try {
        salesInvoice = await tx.salesInvoice.update({
          where: { id: existingInvoice.id },
          data: invoiceData,
          select: { id: true },
        });
        updated = 1;
      } catch (updateErr) {
        logger.errorLog('[REPORTING SYNC][UPDATE INVOICE] Update failed:', {
          invoiceNo: invoice.invoiceNo,
          syncSourceCode: batchMeta.syncSourceCode,
          sourceInvoiceNo: invoiceData.sourceInvoiceNo,
          message: updateErr && updateErr.message ? updateErr.message : String(updateErr),
          code: updateErr && updateErr.code ? updateErr.code : null,
        });
        throw updateErr;
      }
    }

    const details = Array.isArray(invoice.details) ? invoice.details : [];
    let detailsInserted = 0;
    let detailsUpdated = 0;

    for (let idx = 0; idx < details.length; idx++) {
      const item = details[idx];
      const sourceInvDetailId = toInt(item.invDetailId);
      
      // Pre-validation for detail items
      if (!sourceInvDetailId || sourceInvDetailId <= 0) {
        logger.errorLog('[REPORTING SYNC][DETAIL] Skipping detail with invalid sourceInvDetailId:', {
          invoiceNo: invoice.invoiceNo,
          detailIndex: idx,
          invDetailId: item.invDetailId,
          sourceInvDetailId,
        });
        continue;
      }

      const detailData = normalizeInvoiceItem(item, batchMeta.syncSourceCode, salesInvoice.id);

      try {
      const existingItem = await tx.salesInvoiceItem.findFirst({
          where: {
            syncSourceCode: batchMeta.syncSourceCode,
            sourceInvDetailId,
          },
          select: { id: true },
        });

        if (!existingItem) {
          await tx.salesInvoiceItem.create({
            data: {
              ...detailData,
              firstReceivedAt: new Date(),
            },
          });
          detailsInserted += 1;
        } else {
          await tx.salesInvoiceItem.update({
            where: { id: existingItem.id },
            data: detailData,
          });
          detailsUpdated += 1;
        }
      } catch (itemErr) {
        logger.errorLog('[REPORTING SYNC][DETAIL] Item operation failed:', {
          invoiceNo: invoice.invoiceNo,
          detailIndex: idx,
          invDetailId: item.invDetailId,
          sourceInvDetailId,
          detailDataKeys: Object.keys(detailData),
          message: itemErr && itemErr.message ? itemErr.message : String(itemErr),
          code: itemErr && itemErr.code ? itemErr.code : null,
        });
        throw itemErr;
      }
    }

    return {
      inserted,
      updated,
      detailsInserted,
      detailsUpdated,
      detailCount: details.length,
    };
  } catch (err) {
    logger.errorLog('[REPORTING SYNC][PROCESS INVOICE] Overall invoice processing failed:', {
      invoiceNo: invoice.invoiceNo,
      message: err && err.message ? err.message : String(err),
    });
    throw err;
  }
}

async function ingestReportingBatch(payload) {
  const invoices = Array.isArray(payload.invoices) ? payload.invoices : [];
  const syncedAt = toDateOrNull(payload.syncedAt) || new Date();

  const result = {
    receivedInvoices: invoices.length,
    storedInvoices: 0,
    updatedInvoices: 0,
    storedDetails: 0,
    updatedDetails: 0,
    skippedInvoices: 0,
    syncSourceCode: payload.syncSourceCode,
  };

  // Upsert the sync source once outside any per-invoice transaction
  const source = await upsertSyncSource(prisma, payload);

  const batchMeta = {
    syncSourceId: source.id,
    branchCode: payload.branchCode,
    branchName: payload.branchName,
    locationId: normalizeLocationId(payload.locationId),
    syncSourceCode: payload.syncSourceCode,
    syncedAt,
  };

  // Process each invoice in its own short-lived transaction to avoid timeouts
  for (const invoice of invoices) {
    try {
      const processed = await prisma.$transaction(
        async (tx) => processInvoice(tx, invoice, batchMeta),
        { timeout: 30000 },
      );
      result.storedInvoices += processed.inserted;
      result.updatedInvoices += processed.updated;
      result.storedDetails += processed.detailsInserted;
      result.updatedDetails += processed.detailsUpdated;
    } catch (invoiceErr) {
      result.skippedInvoices += 1;
      logger.errorLog('[REPORTING SYNC][INGEST] Error processing invoice (skipped):', {
        syncSourceCode: batchMeta.syncSourceCode,
        invoiceNo: invoice && invoice.invoiceNo ? invoice.invoiceNo : null,
        message: invoiceErr && invoiceErr.message ? invoiceErr.message : String(invoiceErr),
        code: invoiceErr && invoiceErr.code ? invoiceErr.code : null,
      });
      // Continue processing remaining invoices instead of aborting the whole batch
    }
  }

  return result;
}

async function ingestLatestProductCosts(payload) {
  const latestProductCosts = Array.isArray(payload.latestProductCosts) ? payload.latestProductCosts : [];
  const syncedAt = toDateOrNull(payload.syncedAt) || new Date();

  const result = {
    receivedProducts: latestProductCosts.length,
    storedProducts: 0,
    updatedProducts: 0,
    syncSourceCode: payload.syncSourceCode,
  };

  const source = await upsertSyncSource(prisma, payload);

  const batchMeta = {
    syncSourceId: source.id,
    branchCode: payload.branchCode,
    branchName: payload.branchName,
    locationId: normalizeLocationId(payload.locationId),
    syncSourceCode: payload.syncSourceCode,
    syncedAt,
  };

  for (const item of latestProductCosts) {
      const productCode = toStringOrNull(item.productCode);
      if (!productCode) continue;

      const data = normalizeLatestProductCost(item, batchMeta);
      const existing = await prisma.posLatestProductCost.findUnique({
        where: {
          syncSourceCode_productCode: {
            syncSourceCode: batchMeta.syncSourceCode,
            productCode,
          },
        },
        select: { id: true },
      });

      if (!existing) {
        await prisma.posLatestProductCost.create({
          data: {
            ...data,
            firstReceivedAt: new Date(),
          },
        });
        result.storedProducts += 1;
      } else {
        await prisma.posLatestProductCost.update({
          where: { id: existing.id },
          data,
        });
        result.updatedProducts += 1;
      }
    }

  return result;
}

function normalizePosStockIntake(grn, batchMeta) {
  return {
    syncSourceId: batchMeta.syncSourceId,
    branchCode: batchMeta.branchCode,
    branchName: batchMeta.branchName,
    locationId: batchMeta.locationId,
    locationCode: toStringOrNull(grn.locationCode),
    syncSourceCode: batchMeta.syncSourceCode,
    grnNo: toStringOrNull(grn.grnNo),
    grnDate: toDateOrNull(grn.grnDate),
    grnObservedAt: toDateOrNull(grn.grnObservedAt),
    grnReference: toStringOrNull(grn.grnReference),
    grnUserName: toStringOrNull(grn.userName || grn.grnUserName),
    supplierCode: toStringOrNull(grn.supplierCode),
    orderNumber: toStringOrNull(grn.orderNumber),
    uploadStatus: toInt(grn.uploadStatus),
    sourceUpdatedAt: toDateOrNull(grn.sourceUpdatedAt),
    sourceSyncedAt: batchMeta.syncedAt,
    lastReceivedAt: new Date(),
  };
}

function normalizePosStockIntakeItem(item, grnMeta) {
  return {
    posStockIntakeId: grnMeta.id,
    syncSourceCode: grnMeta.syncSourceCode,
    stockDetailId: toStringOrNull(item.stockDetailId),
    productCode: toStringOrNull(item.productCode),
    productName: toStringOrNull(item.productName),
    quantity: toFloat(item.quantity, 0),
    unitCost: item.unitCost == null ? null : toFloat(item.unitCost, null),
    lineAmount: item.lineAmount == null ? null : toFloat(item.lineAmount, null),
    expiryDate: toDateOrNull(item.expiryDate),
    uploadStatus: toInt(item.uploadStatus),
    sourceUpdatedAt: toDateOrNull(item.sourceUpdatedAt),
    sourceSyncedAt: grnMeta.syncedAt,
    lastReceivedAt: new Date(),
  };
}

async function ingestPosStockIntakes(payload) {
  const posStockIntakes = Array.isArray(payload.posStockIntakes) ? payload.posStockIntakes : [];
  const syncedAt = toDateOrNull(payload.syncedAt) || new Date();

  const result = {
    receivedGrns: posStockIntakes.length,
    storedGrns: 0,
    updatedGrns: 0,
    storedItems: 0,
    updatedItems: 0,
    syncSourceCode: payload.syncSourceCode,
  };

  const source = await upsertSyncSource(prisma, payload);

  const batchMeta = {
    syncSourceId: source.id,
    branchCode: payload.branchCode,
    branchName: payload.branchName,
    locationId: normalizeLocationId(payload.locationId),
    syncSourceCode: payload.syncSourceCode,
    syncedAt,
  };

  for (const grn of posStockIntakes) {
    const grnNo = toStringOrNull(grn.grnNo);
    if (!grnNo) continue;

    const grnData = normalizePosStockIntake(grn, batchMeta);
    let grnRecord;

    // RUNTIME VERIFICATION: Log ingest input & normalization
    logger.debugLog('[POS GRN INGEST ENRICHMENT] Received payload:', {
      grnNo,
      payloadGrnDate: grn.grnDate,
      payloadGrnObservedAt: grn.grnObservedAt,
      payloadGrnUserName: grn.userName || grn.grnUserName || null,
      payloadSyncSourceCode: batchMeta.syncSourceCode,
      normalizedData: {
        grnDate: grnData.grnDate,
        grnObservedAt: grnData.grnObservedAt,
        grnUserName: grnData.grnUserName,
        syncSourceCode: grnData.syncSourceCode,
      },
    });

    const existingGrn = await prisma.posStockIntake.findUnique({
      where: {
        syncSourceCode_grnNo: {
          syncSourceCode: batchMeta.syncSourceCode,
          grnNo,
        },
      },
      select: { id: true, grnUserName: true, grnObservedAt: true },
    });

    if (!existingGrn) {
      grnRecord = await prisma.posStockIntake.create({
        data: {
          ...grnData,
          firstReceivedAt: new Date(),
        },
      });
      logger.debugLog('[POS GRN INGEST] Created new GRN record:', {
        grnNo,
        storedGrnObservedAt: grnRecord.grnObservedAt,
        storedGrnUserName: grnRecord.grnUserName,
      });
      result.storedGrns += 1;
    } else {
      const updateData = { ...grnData };
      if (existingGrn.grnUserName && !updateData.grnUserName) {
        updateData.grnUserName = existingGrn.grnUserName;
      }
      if (existingGrn.grnObservedAt) {
        updateData.grnObservedAt = existingGrn.grnObservedAt;
      }

      // RUNTIME VERIFICATION: Log preserved metadata
      logger.debugLog('[POS GRN INGEST] Updating existing GRN record:', {
        grnNo,
        existingGrnObservedAt: existingGrn.grnObservedAt,
        preservingGrnObservedAt: !!existingGrn.grnObservedAt,
        existingGrnUserName: existingGrn.grnUserName,
        preservingGrnUserName: !!existingGrn.grnUserName && !updateData.grnUserName,
        updateDataGrnObservedAt: updateData.grnObservedAt,
        updateDataGrnUserName: updateData.grnUserName,
      });

      grnRecord = await prisma.posStockIntake.update({
        where: { id: existingGrn.id },
        data: updateData,
      });
      result.updatedGrns += 1;
    }

    // Process items
    const items = Array.isArray(grn.items) ? grn.items : [];
    for (const item of items) {
      const productCode = toStringOrNull(item.productCode);
      if (!productCode) continue;

      const itemData = normalizePosStockIntakeItem(item, {
        id: grnRecord.id,
        syncSourceCode: batchMeta.syncSourceCode,
        syncedAt,
      });

      const existingItem = await prisma.posStockIntakeItem.findUnique({
        where: {
          posStockIntakeId_stockDetailId: {
            posStockIntakeId: grnRecord.id,
            stockDetailId: itemData.stockDetailId,
          },
        },
        select: { id: true },
      });

      if (!existingItem) {
        await prisma.posStockIntakeItem.create({
          data: {
            ...itemData,
            firstReceivedAt: new Date(),
          },
        });
        result.storedItems += 1;
      } else {
        await prisma.posStockIntakeItem.update({
          where: { id: existingItem.id },
          data: itemData,
        });
        result.updatedItems += 1;
      }
    }
  }

  return result;
}

module.exports = {
  ingestReportingBatch,
  ingestLatestProductCosts,
  ingestPosStockIntakes,
};
