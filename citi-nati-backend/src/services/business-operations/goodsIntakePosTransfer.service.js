'use strict';

const { PrismaClient } = require('@prisma/client');
const { deriveBranchCodeFromLocationCode } = require('../../utils/operationalScope');
const posCommandQueueService = require('../posCommandQueue.service');

const prisma = new PrismaClient();

const BLANTYRE_LOCATION_CODE = 'BT';
const DEFAULT_OPEN_STOCK_BALANCES_CODE = 'OPEN STOCK BALANCES';   // Blantyre POS supplier name
const ZOMBA_OPEN_BALANCES_CODE = 'OPEN BALANCES';                 // Zomba POS supplier name
const GRN_PATTERN = /^GRN_(\d{4}\d{1,2}\d{1,2})-(\d{3})$/i;

function buildGrnDatePart(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}${d.getMonth() + 1}${d.getDate()}`;
}

function normalizeRequestedGrn(value) {
  return String(value || '').trim().toUpperCase();
}

function validateRequestedGrnForDate(requestedGrn, grnDate) {
  const normalized = normalizeRequestedGrn(requestedGrn);
  if (!normalized) {
    return { requestedGrn: '', error: null };
  }

  const match = normalized.match(GRN_PATTERN);
  if (!match) {
    return {
      requestedGrn: normalized,
      error: 'Manual GRN must use POS format GRN_YYYYMDD-###.',
    };
  }

  const expectedDatePart = buildGrnDatePart(grnDate);
  if (match[1] !== expectedDatePart) {
    return {
      requestedGrn: normalized,
      error: `Manual GRN must match the intake date. Use format GRN_${expectedDatePart}-###.`,
    };
  }

  return { requestedGrn: normalized, error: null };
}

function resolveSupplierCodeForTransfer(intake) {
  const explicitSupplierCode = String(intake?.supplier?.supplierCode || '').trim();
  if (explicitSupplierCode) {
    return { supplierCode: explicitSupplierCode, usedFallback: false };
  }

  const supplierName = String(intake?.supplier?.name || '').trim().toUpperCase();
  const manualSupplierName = String(intake?.manualSupplierName || '').trim().toUpperCase();
  const isOpenStockBalances = supplierName === DEFAULT_OPEN_STOCK_BALANCES_CODE
    || manualSupplierName === DEFAULT_OPEN_STOCK_BALANCES_CODE;

  if (!isOpenStockBalances) {
    return {
      supplierCode: '',
      usedFallback: false,
      error: 'Supplier with a valid SupplierCode is required for POS transfer. Update the intake to link a registered supplier.',
    };
  }

  const fallbackCode = String(
    process.env.POS_OPEN_STOCK_BALANCES_SUPPLIER_CODE
    || process.env.POS_FALLBACK_SUPPLIER_CODE
    || DEFAULT_OPEN_STOCK_BALANCES_CODE
  ).trim();

  if (!fallbackCode) {
    return {
      supplierCode: '',
      usedFallback: false,
      error: 'OPEN STOCK BALANCES fallback supplier code is not configured. Set POS_OPEN_STOCK_BALANCES_SUPPLIER_CODE.',
    };
  }

  return { supplierCode: fallbackCode, usedFallback: true };
}

/**
 * Resolve supplier code for a Zomba intake transfer.
 * Recognises "OPEN BALANCES" as the Zomba-specific open-stock fallback supplier
 * (Blantyre uses "OPEN STOCK BALANCES" — they are different POS supplier records).
 */
function resolveZombaSupplierCodeForTransfer(intake) {
  const explicitSupplierCode = String(intake?.supplier?.supplierCode || '').trim();
  if (explicitSupplierCode) {
    return { supplierCode: explicitSupplierCode, usedFallback: false };
  }

  const supplierName = String(intake?.supplier?.name || '').trim().toUpperCase();
  const manualSupplierName = String(intake?.manualSupplierName || '').trim().toUpperCase();
  const isOpenBalances = supplierName === ZOMBA_OPEN_BALANCES_CODE
    || manualSupplierName === ZOMBA_OPEN_BALANCES_CODE
    // also accept Blantyre's name here so mis-labeled intakes still work
    || supplierName === DEFAULT_OPEN_STOCK_BALANCES_CODE
    || manualSupplierName === DEFAULT_OPEN_STOCK_BALANCES_CODE;

  if (!isOpenBalances) {
    return {
      supplierCode: '',
      usedFallback: false,
      error: 'Supplier with a valid SupplierCode is required for POS transfer. Update the intake to link a registered supplier.',
    };
  }

  const fallbackCode = String(
    process.env.POS_ZOMBA_OPEN_BALANCES_SUPPLIER_CODE
    || process.env.POS_OPEN_STOCK_BALANCES_SUPPLIER_CODE
    || process.env.POS_FALLBACK_SUPPLIER_CODE
    || ZOMBA_OPEN_BALANCES_CODE
  ).trim();

  if (!fallbackCode) {
    return {
      supplierCode: '',
      usedFallback: false,
      error: 'OPEN BALANCES fallback supplier code is not configured for Zomba. Set POS_ZOMBA_OPEN_BALANCES_SUPPLIER_CODE.',
    };
  }

  return { supplierCode: fallbackCode, usedFallback: true };
}

/**
 * Transfer a finalized Blantyre goods intake to POS pending stock tables.
 * Inserts ONLY into stocks_temp + stockdetails_temp (never live stocks / stockdetails).
 *
 * @param {number} intakeId
 * @returns {{ success, grnNo?, linesInserted?, data?, error?, alreadyTransferred?, existingGrn? }}
 */
async function transferGoodsIntakeToBlantyrePosPending(intakeId, options = {}) {
  const intake = await prisma.goodsIntake.findUnique({
    where: { id: intakeId },
    include: {
      supplier: {
        select: { id: true, name: true, supplierCode: true },
      },
      items: {
        orderBy: { lineNo: 'asc' },
        include: {
          product: {
            select: { sourceCode: true, barcode: true },
          },
        },
      },
    },
  });

  if (!intake) {
    return { success: false, error: 'Goods intake record not found' };
  }

  // --- Blantyre-only guard ---
  const locationCode = String(intake.locationCode || '').trim().toUpperCase();
  if (locationCode !== BLANTYRE_LOCATION_CODE) {
    const branch = deriveBranchCodeFromLocationCode(intake.locationCode);
    return {
      success: false,
      error: `Transfer to POS pending stock is available for Blantyre (SH) location only. This intake is for ${intake.locationName || branch || locationCode || '(unknown location)'}.`,
    };
  }

  // --- Status guard ---
  if (intake.status !== 'finalized') {
    return {
      success: false,
      error: `Only finalized intakes can be transferred to POS. Current status: ${intake.status}.`,
    };
  }

  // --- Supplier guard (supports OPEN STOCK BALANCES fallback) ---
  const supplierResolution = resolveSupplierCodeForTransfer(intake);
  if (supplierResolution.error) {
    return {
      success: false,
      error: supplierResolution.error,
    };
  }

  // --- Items guard ---
  if (!Array.isArray(intake.items) || intake.items.length === 0) {
    return { success: false, error: 'Intake must have at least one line item' };
  }

  for (let i = 0; i < intake.items.length; i++) {
    const item = intake.items[i];
    const label = `Line ${item.lineNo || i + 1}`;
    if (!item.productName) return { success: false, error: `${label}: productName is required` };
    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
      return { success: false, error: `${label}: quantity must be > 0` };
    }
    if (!Number.isFinite(Number(item.unitCost)) || Number(item.unitCost) < 0) {
      return { success: false, error: `${label}: unitCost must be >= 0` };
    }
  }

  // --- Duplicate protection ---
  if (intake.posTransferStatus === 'transferred' || intake.posTransferStatus === 'queued') {
    const existingLabel = intake.posTransferStatus === 'queued' ? 'queued for' : 'already transferred to';
    const existingGrnLabel = intake.posTransferGrn ? ` (GRN: ${intake.posTransferGrn})` : '';
    return {
      success: false,
      error: `This intake has ${existingLabel} POS pending stock${existingGrnLabel}.`,
      alreadyTransferred: true,
      existingGrn: intake.posTransferGrn,
    };
  }

  // --- Build transfer payload ---
  const grnDate   = intake.purchaseDate ? new Date(intake.purchaseDate) : new Date();
  const supplierCode = supplierResolution.supplierCode;
  const manualGrnOverride = Boolean(options?.manualGrnOverride);
  const requestedGrnValidation = validateRequestedGrnForDate(options?.requestedGrn, grnDate);

  if (manualGrnOverride && requestedGrnValidation.error) {
    return {
      success: false,
      error: requestedGrnValidation.error,
    };
  }

  const detailItems = intake.items.map((item) => ({
    productCode: item.product?.sourceCode
      || String(item.barcode || '').trim()
      || String(item.productName || '').trim().slice(0, 20),
    productName: item.productName,
    stockQty:    Number(item.quantity),
    unit:        '',
    costPrice:   Number(item.unitCost),
    expiryDate:  item.expiryDate ? new Date(item.expiryDate).toISOString() : null,
  }));

  console.log(
    `[BO][GOODS_INTAKE][TRANSFER] intakeId=${intakeId} ref=${intake.intakeRef}` +
    ` requestedGrn=${requestedGrnValidation.requestedGrn || 'AUTO'} supplier=${supplierCode} location=${locationCode}` +
    ` lines=${detailItems.length} fallbackSupplier=${supplierResolution.usedFallback ? 'yes' : 'no'}`
  );

  // --- Enqueue command for Blantyre POS agent (polling model — no direct LAN call) ---
  const posLocationCode = mapToPostLocationCode(locationCode); // BT → SH

  const queued = await posCommandQueueService.enqueueCommand(
    'CREATE_PENDING_STOCK_INTAKE',
    {
      intakeId,
      intakeRef:    intake.intakeRef,
      grnDate:      grnDate.toISOString(),
      requestedGrn: requestedGrnValidation.requestedGrn || null,
      manualGrnOverride,
      supplierCode,
      locationCode: posLocationCode,
      items:        detailItems,
      usedFallbackSupplier: supplierResolution.usedFallback,
    },
    {
      source:            'goods-intake-transfer',
      relatedEntityType: 'GoodsIntake',
      relatedEntityId:   String(intakeId),
      createdBy:         null,
      maxRetries:        3,
    }
  );

  // --- Mark intake as queued ---
  await prisma.goodsIntake.update({
    where: { id: intakeId },
    data: {
      posTransferStatus:       'queued',
      posTransferGrn:          null,
      posTransferAt:           new Date(),
      posTransferLocationCode: posLocationCode,
    },
  });

  console.log(
    `[BO][GOODS_INTAKE][TRANSFER] QUEUED intakeId=${intakeId} requestedGrn=${requestedGrnValidation.requestedGrn || 'AUTO'}` +
    ` commandId=${queued.id} supplier=${supplierCode} lines=${detailItems.length}`
  );

  return {
    success:    true,
    queued:     true,
    grnMode:    manualGrnOverride ? 'manual' : 'auto',
    requestedGrn: requestedGrnValidation.requestedGrn || null,
    commandId:  queued.id,
    supplierCode,
    locationCode: posLocationCode,
    linesQueued:  detailItems.length,
  };
}

/**
 * Map Blantyre's internal website scope code to the POS shelf location code (SH).
 */
function mapToPostLocationCode(websiteLocationCode) {
  const code = String(websiteLocationCode || '').toUpperCase().trim();
  if (code === 'BT') return 'SH';
  return code;
}

// ---------------------------------------------------------------------------
// Zomba locations: SH (main shelf), BAR (bar), ST999 (restaurant)
// ---------------------------------------------------------------------------
const ZOMBA_INTERNAL_CODE = 'ZA';
const ZOMBA_POS_LOCATION_CODES = ['SH', 'BAR', 'ST999'];

/**
 * Map a Zomba internal location code (ZA, SH, BAR, ST999) to a POS location code.
 * ZA (the combined scope) defaults to SH (main shelf) for a single-intake transfer.
 * Concrete sub-location codes pass through unchanged.
 */
function mapZombaToPostLocationCode(websiteLocationCode) {
  const code = String(websiteLocationCode || '').toUpperCase().trim();
  if (code === ZOMBA_INTERNAL_CODE) return 'SH';
  if (ZOMBA_POS_LOCATION_CODES.indexOf(code) !== -1) return code;
  return code;
}

/**
 * Returns true when the location code belongs to Zomba (ZA, SH, BAR, ST999).
 */
function isZombaLocationCode(locationCode) {
  const code = String(locationCode || '').toUpperCase().trim();
  return code === ZOMBA_INTERNAL_CODE || ZOMBA_POS_LOCATION_CODES.indexOf(code) !== -1;
}

/**
 * Transfer a finalized Zomba goods intake to POS pending stock tables.
 * Inserts ONLY into stocks_temp + stockdetails_temp via the Zomba POS agent command queue.
 * Supports all Zomba sub-locations: SH, BAR, ST999.
 *
 * @param {number} intakeId
 * @param {object} options
 * @returns {{ success, grnNo?, linesQueued?, commandId?, error?, alreadyTransferred?, existingGrn? }}
 */
async function transferGoodsIntakeToZombaPosPending(intakeId, options) {
  if (!options) options = {};
  const intake = await prisma.goodsIntake.findUnique({
    where: { id: intakeId },
    include: {
      supplier: {
        select: { id: true, name: true, supplierCode: true },
      },
      items: {
        orderBy: { lineNo: 'asc' },
        include: {
          product: {
            select: { sourceCode: true, barcode: true },
          },
        },
      },
    },
  });

  if (!intake) {
    return { success: false, error: 'Goods intake record not found' };
  }

  const rawLocationCode = String(intake.locationCode || '').trim().toUpperCase();
  if (!isZombaLocationCode(rawLocationCode)) {
    return {
      success: false,
      error: 'Transfer to Zomba POS is only available for Zomba location intakes (ZA, SH, BAR, ST999).',
    };
  }

  if (intake.status !== 'finalized') {
    return {
      success: false,
      error: 'Only finalized intakes can be transferred to POS. Current status: ' + intake.status + '.',
    };
  }

  const supplierResolution = resolveZombaSupplierCodeForTransfer(intake);
  if (supplierResolution.error) {
    return { success: false, error: supplierResolution.error };
  }

  if (!Array.isArray(intake.items) || intake.items.length === 0) {
    return { success: false, error: 'Intake must have at least one line item' };
  }

  for (let i = 0; i < intake.items.length; i++) {
    const itm = intake.items[i];
    const label = 'Line ' + (itm.lineNo || i + 1);
    if (!itm.productName) return { success: false, error: label + ': productName is required' };
    if (!Number.isFinite(Number(itm.quantity)) || Number(itm.quantity) <= 0) {
      return { success: false, error: label + ': quantity must be > 0' };
    }
    if (!Number.isFinite(Number(itm.unitCost)) || Number(itm.unitCost) < 0) {
      return { success: false, error: label + ': unitCost must be >= 0' };
    }
  }

  if (intake.posTransferStatus === 'transferred' || intake.posTransferStatus === 'queued') {
    const existingLabel = intake.posTransferStatus === 'queued' ? 'queued for' : 'already transferred to';
    const existingGrnLabel = intake.posTransferGrn ? ' (GRN: ' + intake.posTransferGrn + ')' : '';
    return {
      success: false,
      error: 'This intake has ' + existingLabel + ' POS pending stock' + existingGrnLabel + '.',
      alreadyTransferred: true,
      existingGrn: intake.posTransferGrn,
    };
  }

  const posLocationCode = mapZombaToPostLocationCode(rawLocationCode);
  const grnDate = intake.purchaseDate ? new Date(intake.purchaseDate) : new Date();
  const supplierCode = supplierResolution.supplierCode;
  const manualGrnOverride = Boolean(options.manualGrnOverride);
  const requestedGrnValidation = validateRequestedGrnForDate(options.requestedGrn, grnDate);

  if (manualGrnOverride && requestedGrnValidation.error) {
    return { success: false, error: requestedGrnValidation.error };
  }

  const detailItems = intake.items.map((itm) => ({
    productCode: (itm.product && itm.product.sourceCode)
      || String(itm.barcode || '').trim()
      || String(itm.productName || '').trim().slice(0, 20),
    productName: itm.productName,
    stockQty: Number(itm.quantity),
    unit: '',
    costPrice: Number(itm.unitCost),
    expiryDate: itm.expiryDate ? new Date(itm.expiryDate).toISOString() : null,
  }));

  console.log(
    '[BO][GOODS_INTAKE][ZOMBA_TRANSFER] intakeId=' + intakeId + ' ref=' + intake.intakeRef +
    ' requestedGrn=' + (requestedGrnValidation.requestedGrn || 'AUTO') +
    ' supplier=' + supplierCode + ' locationCode=' + posLocationCode +
    ' lines=' + detailItems.length + ' fallbackSupplier=' + (supplierResolution.usedFallback ? 'yes' : 'no')
  );

  const queued = await posCommandQueueService.enqueueCommand(
    'CREATE_PENDING_STOCK_INTAKE',
    {
      intakeId,
      intakeRef: intake.intakeRef,
      grnDate: grnDate.toISOString(),
      requestedGrn: requestedGrnValidation.requestedGrn || null,
      manualGrnOverride,
      supplierCode,
      locationCode: posLocationCode,
      branchCode: 'ZOMBA',
      items: detailItems,
      usedFallbackSupplier: supplierResolution.usedFallback,
    },
    {
      source: 'goods-intake-transfer',
      relatedEntityType: 'GoodsIntake',
      relatedEntityId: String(intakeId),
      createdBy: null,
      maxRetries: 3,
    }
  );

  await prisma.goodsIntake.update({
    where: { id: intakeId },
    data: {
      posTransferStatus: 'queued',
      posTransferGrn: null,
      posTransferAt: new Date(),
      posTransferLocationCode: posLocationCode,
    },
  });

  console.log(
    '[BO][GOODS_INTAKE][ZOMBA_TRANSFER] QUEUED intakeId=' + intakeId +
    ' requestedGrn=' + (requestedGrnValidation.requestedGrn || 'AUTO') +
    ' commandId=' + queued.id + ' supplier=' + supplierCode + ' lines=' + detailItems.length
  );

  return {
    success: true,
    queued: true,
    grnMode: manualGrnOverride ? 'manual' : 'auto',
    requestedGrn: requestedGrnValidation.requestedGrn || null,
    commandId: queued.id,
    supplierCode,
    locationCode: posLocationCode,
    linesQueued: detailItems.length,
  };
}

module.exports = {
  transferGoodsIntakeToBlantyrePosPending,
  transferGoodsIntakeToZombaPosPending,
  isZombaLocationCode,
};
