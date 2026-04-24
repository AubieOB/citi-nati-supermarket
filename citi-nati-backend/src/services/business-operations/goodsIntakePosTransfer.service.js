'use strict';

const { PrismaClient } = require('@prisma/client');
const { deriveBranchCodeFromLocationCode } = require('../../utils/operationalScope');
const posCommandQueueService = require('../posCommandQueue.service');

const prisma = new PrismaClient();

const BLANTYRE_LOCATION_CODE = 'BT';
const DEFAULT_OPEN_STOCK_BALANCES_CODE = 'OPEN STOCK BALANCES';

/**
 * Generate a GRN number from intake ID + date.
 * Format: GRN_YYYYMDD-NNN  (month/day without leading zeros per spec example GRN_2026423-002)
 */
function generateGrnNo(intakeId, date) {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date(date);
  const yyyy = d.getFullYear();
  const m    = d.getMonth() + 1;  // no leading zero
  const dd   = d.getDate();        // no leading zero
  const seq  = String((Number(intakeId) % 999) + 1).padStart(3, '0');
  return `GRN_${yyyy}${m}${dd}-${seq}`;
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
 * Transfer a finalized Blantyre goods intake to POS pending stock tables.
 * Inserts ONLY into stocks_temp + stockdetails_temp (never live stocks / stockdetails).
 *
 * @param {number} intakeId
 * @returns {{ success, grnNo?, linesInserted?, data?, error?, alreadyTransferred?, existingGrn? }}
 */
async function transferGoodsIntakeToBlantyrePosPending(intakeId) {
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
      error: `Transfer to POS pending stock is available for Blantyre (BT) location only. This intake is for ${intake.locationName || branch || locationCode || '(unknown location)'}.`,
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
    return {
      success: false,
      error: `This intake has ${existingLabel} POS pending stock (GRN: ${intake.posTransferGrn}).`,
      alreadyTransferred: true,
      existingGrn: intake.posTransferGrn,
    };
  }

  // --- Build transfer payload ---
  const grnDate   = intake.purchaseDate ? new Date(intake.purchaseDate) : new Date();
  const grnNo     = generateGrnNo(intakeId, grnDate);
  const supplierCode = supplierResolution.supplierCode;

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
    `[BO][GOODS_INTAKE][TRANSFER] intakeId=${intakeId} ref=${intake.intakeRef} grnNo=${grnNo}` +
    ` supplier=${supplierCode} location=${locationCode} lines=${detailItems.length} fallbackSupplier=${supplierResolution.usedFallback ? 'yes' : 'no'}`
  );

  // --- Enqueue command for Blantyre POS agent (polling model — no direct LAN call) ---
  const posLocationCode = mapToPostLocationCode(locationCode); // BT → SH

  const queued = await posCommandQueueService.enqueueCommand(
    'CREATE_PENDING_STOCK_INTAKE',
    {
      intakeId,
      intakeRef:    intake.intakeRef,
      grnNo,
      grnDate:      grnDate.toISOString(),
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
      posTransferGrn:          grnNo,
      posTransferAt:           new Date(),
      posTransferLocationCode: posLocationCode,
    },
  });

  console.log(
    `[BO][GOODS_INTAKE][TRANSFER] QUEUED intakeId=${intakeId} grnNo=${grnNo}` +
    ` commandId=${queued.id} supplier=${supplierCode} lines=${detailItems.length}`
  );

  return {
    success:    true,
    queued:     true,
    grnNo,
    commandId:  queued.id,
    supplierCode,
    locationCode: posLocationCode,
    linesQueued:  detailItems.length,
  };
}

/**
 * Map the website location code (BT) to the POS location code (SH for Blantyre shelf).
 */
function mapToPostLocationCode(websiteLocationCode) {
  const code = String(websiteLocationCode || '').toUpperCase().trim();
  if (code === 'BT') return 'SH';
  return code;
}

module.exports = {
  transferGoodsIntakeToBlantyrePosPending,
};
