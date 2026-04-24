'use strict';

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { deriveBranchCodeFromLocationCode } = require('../../utils/operationalScope');

const prisma = new PrismaClient();

const BLANTYRE_LOCATION_CODE = 'BT';
const DEFAULT_OPEN_STOCK_BALANCES_CODE = 'OPEN STOCK BALANCES';

/**
 * Resolve the Blantyre POS agent URL and secret from environment variables.
 * Falls back to the default POS_AGENT_URL / POS_SECRET.
 */
function resolveAgentConfig() {
  const url = String(
    process.env.BLANTYRE_POS_AGENT_URL ||
    process.env.POS_AGENT_URL ||
    'http://localhost:3001'
  ).trim();
  const secret = String(
    process.env.BLANTYRE_POS_SECRET ||
    process.env.POS_SECRET ||
    ''
  ).trim();
  return { url, secret };
}

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
  if (intake.posTransferStatus === 'transferred') {
    return {
      success: false,
      error: `This intake has already been transferred to POS pending stock (GRN: ${intake.posTransferGrn}).`,
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

  // --- Call Blantyre POS agent ---
  const agentConfig = resolveAgentConfig();
  let agentResult;
  try {
    const response = await axios.post(
      `${agentConfig.url}/pos-sync/submit-pending-stock`,
      {
        grnNo,
        grnDate:       grnDate.toISOString(),
        supplierCode,
        locationCode:  appConfig_locationCode(intake.locationCode),  // map BT → SH (Blantyre shelf)
        intakeRef:     intake.intakeRef,
        intakeId,
        items:         detailItems,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-pos-secret': agentConfig.secret,
        },
        timeout: 30000,
      }
    );
    agentResult = response.data;
  } catch (agentError) {
    const msg = agentError.response?.data?.error || agentError.message || 'Unknown agent error';
    console.error(`[BO][GOODS_INTAKE][TRANSFER] Agent call failed for intakeId=${intakeId}: ${msg}`);
    return { success: false, error: `POS agent call failed: ${msg}` };
  }

  if (!agentResult || !agentResult.success) {
    const reason = agentResult?.error || 'Unknown failure from POS agent';
    console.error(`[BO][GOODS_INTAKE][TRANSFER] Agent returned failure for intakeId=${intakeId}: ${reason}`);
    return { success: false, error: reason };
  }

  // --- Mark intake as transferred ---
  const updated = await prisma.goodsIntake.update({
    where: { id: intakeId },
    data: {
      posTransferStatus:       'transferred',
      posTransferGrn:          grnNo,
      posTransferAt:           new Date(),
      posTransferLocationCode: locationCode,
    },
    include: {
      supplier: { select: { id: true, name: true, supplierCode: true } },
      items:    { orderBy: { lineNo: 'asc' } },
    },
  });

  console.log(
    `[BO][GOODS_INTAKE][TRANSFER] SUCCESS intakeId=${intakeId} grnNo=${grnNo}` +
    ` supplier=${supplierCode} location=${locationCode} lines=${detailItems.length}`
  );

  return {
    success:      true,
    grnNo,
    supplierCode,
    locationCode,
    linesInserted: detailItems.length,
    data:          updated,
  };
}

/**
 * Map the website location code (BT) to the POS location code (SH for Blantyre shelf).
 * If the code is already the right POS format, return as-is.
 */
function appConfig_locationCode(websiteLocationCode) {
  const code = String(websiteLocationCode || '').toUpperCase().trim();
  if (code === 'BT') return 'SH';   // Blantyre website code → Blantyre POS shelf code
  return code;
}

module.exports = {
  transferGoodsIntakeToBlantyrePosPending,
};
