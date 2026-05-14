'use strict';

const { PrismaClient } = require('@prisma/client');
const { resolveEffectiveStock } = require('../../utils/stockResolver');

const prisma = new PrismaClient();

function toNum(value, decimals = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function roundMoney(value) {
  return toNum(value, 2);
}

function normalize(value) {
  return String(value || '').trim();
}

function normalizeUpper(value) {
  return normalize(value).toUpperCase();
}

const BLANTYRE_TZ_OFFSET_MS = 2 * 60 * 60 * 1000; // Africa/Blantyre UTC+2

function pad(value) {
  return String(value).padStart(2, '0');
}

function buildBlantyreDate(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  return new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}.${String(ms).padStart(3, '0')}+02:00`);
}

function formatBlantyreDateTimeParts(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return { transactionDate: null, transactionTime: null };
  const shifted = new Date(date.getTime() + BLANTYRE_TZ_OFFSET_MS);
  return {
    transactionDate: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    transactionTime: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`,
  };
}

function buildPeriod(filters = {}) {
  const now = new Date();
  let startDate, endDate;

  const localNow = new Date(now.getTime() + BLANTYRE_TZ_OFFSET_MS);
  const currentYear = localNow.getUTCFullYear();
  const currentMonth = localNow.getUTCMonth() + 1;
  const currentDay = localNow.getUTCDate();

  switch (filters.periodType) {
    case 'day': {
      const dateValue = filters.date || `${currentYear}-${pad(currentMonth)}-${pad(currentDay)}`;
      startDate = buildBlantyreDate(dateValue.split('-')[0], Number(dateValue.split('-')[1]), Number(dateValue.split('-')[2]), 0, 0, 0, 0);
      endDate = buildBlantyreDate(dateValue.split('-')[0], Number(dateValue.split('-')[1]), Number(dateValue.split('-')[2]), 23, 59, 59, 999);
      break;
    }
    case 'month': {
      const month = parseInt(filters.month || currentMonth, 10);
      const year = parseInt(filters.year || currentYear, 10);
      startDate = buildBlantyreDate(year, month, 1, 0, 0, 0, 0);
      endDate = buildBlantyreDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate(), 23, 59, 59, 999);
      break;
    }
    case 'year': {
      const year = parseInt(filters.year || currentYear, 10);
      startDate = buildBlantyreDate(year, 1, 1, 0, 0, 0, 0);
      endDate = buildBlantyreDate(year, 12, 31, 23, 59, 59, 999);
      break;
    }
    case 'custom': {
      const startValue = filters.startDate || `${currentYear}-${pad(currentMonth)}-${pad(currentDay)}`;
      const endValue = filters.endDate || `${currentYear}-${pad(currentMonth)}-${pad(currentDay)}`;
      const [startYear, startMonth, startDay] = startValue.split('-').map(Number);
      const [endYear, endMonth, endDay] = endValue.split('-').map(Number);
      startDate = buildBlantyreDate(startYear, startMonth, startDay, 0, 0, 0, 0);
      endDate = buildBlantyreDate(endYear, endMonth, endDay, 23, 59, 59, 999);
      break;
    }
    default: {
      startDate = buildBlantyreDate(currentYear, currentMonth, currentDay, 0, 0, 0, 0);
      endDate = buildBlantyreDate(currentYear, currentMonth, currentDay, 23, 59, 59, 999);
      break;
    }
  }

  return { startDate, endDate };
}

/**
 * Build location filter
 */
function buildLocationFilter(filters = {}) {
  const locationFilter = {};
  
  if (filters.locationId) {
    locationFilter.locationId = Number(filters.locationId);
  }
  if (filters.locationCode) {
    locationFilter.locationCode = normalizeUpper(filters.locationCode);
  }
  if (filters.branchCode) {
    locationFilter.branchCode = normalizeUpper(filters.branchCode);
  }
  
  return locationFilter;
}

function isSameUtcDate(left, right) {
  if (!(left instanceof Date) || !(right instanceof Date)) return false;
  return left.getUTCFullYear() === right.getUTCFullYear()
    && left.getUTCMonth() === right.getUTCMonth()
    && left.getUTCDate() === right.getUTCDate();
}

function isMidnightUtc(dateValue) {
  if (!(dateValue instanceof Date)) return false;
  return dateValue.getUTCHours() === 0 && dateValue.getUTCMinutes() === 0 && dateValue.getUTCSeconds() === 0 && dateValue.getUTCMilliseconds() === 0;
}

function getBestPosGrnMovementDate(item) {
  const grnDate = item.posStockIntake?.grnDate;
  const sourceUpdatedAt = item.posStockIntake?.sourceUpdatedAt || item.sourceUpdatedAt || item.sourceSyncedAt;

  if (grnDate instanceof Date) {
    if (isMidnightUtc(grnDate) && sourceUpdatedAt instanceof Date && isSameUtcDate(grnDate, sourceUpdatedAt)) {
      return sourceUpdatedAt;
    }
    return grnDate;
  }

  if (sourceUpdatedAt instanceof Date) {
    return sourceUpdatedAt;
  }

  return new Date();
}

function movementTypeMatchesFilter(movementType, filterType) {
  const requestedType = normalizeUpper(filterType);
  const actualType = normalizeUpper(movementType);

  if (!requestedType || requestedType === 'ALL') return true;
  if (requestedType === 'SALE' || requestedType === 'SALES') return actualType === 'SALE';

  const intakeAliases = new Set(['STOCK_IN', 'STOCK_INTAKE', 'POS_GRN', 'GOODS_INTAKE']);
  if (intakeAliases.has(requestedType)) return intakeAliases.has(actualType);

  return actualType === requestedType;
}

/**
 * Get sales movements for a period and location
 */
async function getSaleMovements(period, filters = {}) {
  const normalizedProductCode = normalize(filters.productCode);
  const normalizedProductName = normalize(filters.productName);

  const productFilter = normalizedProductCode || normalizedProductName ? {
    OR: [
      normalizedProductCode ? { productCode: { equals: normalizedProductCode, mode: 'insensitive' } } : null,
      normalizedProductName ? { productName: { contains: normalizedProductName, mode: 'insensitive' } } : null,
    ].filter(Boolean)
  } : {};

  // Build salesInvoice filter with location scoping
  const salesInvoiceFilter = {
    OR: [
      { invoiceDate: { gte: period.startDate, lte: period.endDate } },
      { invoiceTime: { gte: period.startDate, lte: period.endDate } },
    ],
  };
  if (filters.locationId) {
    salesInvoiceFilter.locationId = Number(filters.locationId);
  }
  if (filters.locationCode) {
    salesInvoiceFilter.locationCode = normalizeUpper(filters.locationCode);
  }
  if (filters.branchCode) {
    salesInvoiceFilter.branchCode = normalizeUpper(filters.branchCode);
  }
  if (filters.branchCode) {
    salesInvoiceFilter.branchCode = normalizeUpper(filters.branchCode);
  }

  const where = {
    ...productFilter,
    salesInvoice: salesInvoiceFilter,
  };

  const rows = await prisma.salesInvoiceItem.findMany({
    where,
    select: {
      id: true,
      productCode: true,
      productName: true,
      qty: true,
      unitPrice: true,
      amount: true,
      locationCode: true,
      createdAt: true,
      salesInvoice: {
        select: {
          invoiceDate: true,
          invoiceTime: true,
          sourceInvoiceNo: true,
          refNo: true,
          userName: true,
          locationCode: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  });

  return rows.map((row) => ({
    movementDate: row.salesInvoice?.invoiceTime || row.salesInvoice?.invoiceDate || row.createdAt,
    movementType: 'SALE',
    referenceNo: row.salesInvoice?.refNo || String(row.salesInvoice?.sourceInvoiceNo || ''),
    cashierName: row.salesInvoice?.userName || null,
    productCode: row.productCode,
    productName: row.productName,
    qtyIn: 0,
    qtyOut: toNum(row.qty),
    runningBalance: null,
    unitPrice: roundMoney(row.unitPrice),
    lineAmount: roundMoney(row.amount),
    locationCode: row.salesInvoice?.locationCode || row.locationCode || null,
  }));
}

/**
 * Get intake movements for a period and location
 * Fetches web-based goods intake entries that were finalized/posted
 */
async function getIntakeMovements(period, filters = {}) {
  // Treat POS-approved GRN / POS stock intake as the single source of truth for stock intake movements.
  const movements = await getPOSGRNMovements(period, filters);
  console.log('[LEDGER STOCK_IN MOVEMENTS] getIntakeMovements returning POS GRN intake rows:', movements.length);
  return movements;
}

/**
 * Get emergency sales movements for a period and location
 */
async function getEmergencySalesMovements(period, filters = {}) {
  const locationFilter = buildLocationFilter(filters);
  const normalizedProductCode = normalize(filters.productCode);
  const normalizedProductName = normalize(filters.productName);

  const searchTerm = normalizedProductCode || normalizedProductName;
  const productFilter = searchTerm ? {
    productName: { contains: searchTerm, mode: 'insensitive' }
  } : {};

  const where = {
    ...productFilter,
    ...locationFilter,
    status: { in: ['approved', 'completed'] },
    createdAt: { gte: period.startDate, lte: period.endDate },
  };

  const rows = await prisma.emergencySale?.findMany?.({
    where,
    select: {
      id: true,
      productName: true,
      quantity: true,
      unitPrice: true,
      totalAmount: true,
      approvedBy: true,
      approvalDate: true,
      locationCode: true,
      createdAt: true,
      referenceNo: true,
    },
    orderBy: { createdAt: 'asc' },
    take: 2000,
  }) || [];

  return rows.map((row) => ({
    movementDate: row.approvalDate || row.createdAt,
    movementType: 'EMERGENCY_SALE',
    referenceNo: row.referenceNo || null,
    cashierName: row.approvedBy || 'Emergency',
    productCode: null,
    productName: row.productName,
    qtyIn: 0,
    qtyOut: toNum(row.quantity),
    runningBalance: null,
    unitPrice: roundMoney(row.unitPrice),
    lineAmount: roundMoney(row.totalAmount),
    locationCode: row.locationCode || null,
  }));
}

/**
 * Get stock adjustment movements for a period and location
 * Note: Stock adjustments are handled through POS sync and stored in external tables
 */
async function getAdjustmentMovements(period, filters = {}) {
  // Stock adjustments are not stored in Prisma database
  // They are handled through POS sync agents in external tables
  return [];
}

/**
 * Get POS-initiated GRN (Goods Received Note) movements for a period and location
 * These are stock intakes entered directly in the physical POS system, not through our web interface
 * 
 * Current Status: POS GRN data is stored in POS database SQL Server tables (stocks_temp, stockdetails_temp)
 * Backend does NOT currently have access to POS database or received/approved GRN records
 * 
 * To enable POS GRN movements in the ledger, one of these approaches must be implemented:
 * 1. POS Agent periodically syncs approved GRN records to backend via webhook/API endpoint
 * 2. Backend connects to POS database directly (requires secure SQL Server connection config)
 * 3. Manual import of GRN records from POS via batch upload
 * 
 * @param {object} period - Period with startDate and endDate
 * @param {object} filters - Location and product filters
 * @returns {array} Empty array (POS GRN data not yet available in backend)
 */
async function getPOSGRNMovements(period, filters = {}) {
  const locationFilter = buildLocationFilter(filters);
  const normalizedProductCode = normalize(filters.productCode);
  const normalizedProductName = normalize(filters.productName);
  const productFilter = normalizedProductCode || normalizedProductName ? {
    OR: [
      normalizedProductCode ? { productCode: { equals: normalizedProductCode, mode: 'insensitive' } } : null,
      normalizedProductName ? { productName: { contains: normalizedProductName, mode: 'insensitive' } } : null,
    ].filter(Boolean),
  } : {};

  console.log('[INVENTORY_ACTIVITY_SERVICE] getPOSGRNMovements requested:', {
    period: { start: period.startDate.toISOString(), end: period.endDate.toISOString() },
    locationFilter,
    productFilter: filters.productCode || filters.productName ? { productCode: filters.productCode, productName: filters.productName } : null,
  });

  try {
    const locationWhere = {};
    if (locationFilter.branchCode) {
      locationWhere.branchCode = {
        equals: locationFilter.branchCode,
        mode: 'insensitive',
      };
    }
    if (locationFilter.locationCode) {
      locationWhere.locationCode = {
        equals: locationFilter.locationCode,
        mode: 'insensitive',
      };
    }

    const dateWhere = {
      OR: [
        {
          grnDate: {
            gte: period.startDate,
            lte: period.endDate,
          },
        },
        {
          sourceUpdatedAt: {
            gte: period.startDate,
            lte: period.endDate,
          },
        },
      ],
    };

    console.log('[LEDGER POS_GRN QUERY FILTERS]', {
      table: 'posStockIntakeItem',
      relation: 'posStockIntake',
      movementType: 'STOCK_IN',
      branchCode: locationFilter.branchCode || null,
      locationCode: locationFilter.locationCode || null,
      locationId: locationFilter.locationId || null,
      periodStart: period.startDate.toISOString(),
      periodEnd: period.endDate.toISOString(),
    });

    const countNoDateWithLocation = await prisma.posStockIntakeItem.count({
      where: {
        ...productFilter,
        posStockIntake: {
          is: locationWhere,
        },
        quantity: { gt: 0 },
      },
    });

    const countWithDate = await prisma.posStockIntakeItem.count({
      where: {
        ...productFilter,
        posStockIntake: {
          is: {
            ...dateWhere,
            ...locationWhere,
          },
        },
        quantity: { gt: 0 },
      },
    });

    const countDateOnly = await prisma.posStockIntakeItem.count({
      where: {
        ...productFilter,
        posStockIntake: {
          is: dateWhere,
        },
        quantity: { gt: 0 },
      },
    });

    const sampleRow = await prisma.posStockIntakeItem.findFirst({
      where: {
        ...productFilter,
        posStockIntake: {
          is: locationWhere,
        },
        quantity: { gt: 0 },
      },
      select: {
        id: true,
        productCode: true,
        productName: true,
        quantity: true,
        unitCost: true,
        lineAmount: true,
        sourceUpdatedAt: true,
        sourceSyncedAt: true,
        createdAt: true,
        posStockIntake: {
          select: {
            grnNo: true,
            grnDate: true,
            grnObservedAt: true,
            grnReference: true,
            grnUserName: true,
            syncSourceCode: true,
            branchCode: true,
            locationCode: true,
            sourceUpdatedAt: true,
            sourceSyncedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log('[LEDGER POS_GRN COUNT NO DATE]', countNoDateWithLocation);
    console.log('[LEDGER POS_GRN COUNT WITH DATE]', countWithDate);
    console.log('[LEDGER POS_GRN COUNT DATE_ONLY]', countDateOnly);
    console.log('[LEDGER POS_GRN SAMPLE ROW]', sampleRow || null);

    // RUNTIME VERIFICATION: Log Prisma field selection
    console.log('[PRISMA SELECT VERIFICATION] posStockIntakeItem.findMany() will select:', {
      requiredFields: [
        'id',
        'productCode',
        'productName',
        'quantity',
        'unitCost',
        'lineAmount',
        'sourceUpdatedAt',
        'sourceSyncedAt',
        'createdAt',
      ],
      posStockIntakeRelation: [
        'grnNo',
        'grnDate',
        'grnObservedAt (PRIORITY 1)',
        'sourceSyncedAt (PRIORITY 2)',
        'sourceUpdatedAt (PRIORITY 3)',
        'grnUserName',
        'syncSourceCode',
        'branchCode',
        'locationCode',
        'supplierCode',
        'orderNumber',
        'grnReference',
        'createdAt',
        'updatedAt',
      ],
    });

    // Query synced POS GRN data from database
    const grnItems = await prisma.posStockIntakeItem.findMany({
      where: {
        ...productFilter,
        posStockIntake: {
          is: {
            ...dateWhere,
            ...locationWhere,
          },
        },
        quantity: {
          gt: 0, // Only positive stock intakes
        },
      },
      include: {
        posStockIntake: {
          select: {
            grnNo: true,
            grnDate: true,
            grnObservedAt: true,
            grnReference: true,
            syncSourceCode: true,
            branchCode: true,
            locationCode: true,
            supplierCode: true,
            orderNumber: true,
            grnUserName: true,
            sourceUpdatedAt: true,
            sourceSyncedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: [
        { posStockIntake: { grnDate: 'asc' } },
        { posStockIntake: { grnNo: 'asc' } },
        { productCode: 'asc' },
      ],
    });

    console.log('[LEDGER POS_GRN QUERY] count', grnItems.length, {
      periodStart: period.startDate.toISOString(),
      periodEnd: period.endDate.toISOString(),
      branchCode: locationFilter.branchCode || null,
      locationCode: locationFilter.locationCode || null,
    });

    console.log(`[INVENTORY_ACTIVITY_SERVICE] Found ${grnItems.length} POS GRN item records`);

    // Transform to movement format expected by ledger
    const movements = grnItems.map((item) => {
      const selectedUser = item.posStockIntake.grnUserName || item.posStockIntake.syncSourceCode || 'POS GRN Sync';

      // Determine if this is a historical GRN (from a previous day, not just earlier time today)
      const grnDate = item.posStockIntake.grnDate;
      const grnObservedAt = item.posStockIntake.grnObservedAt;
      let isHistoricalGrn = false;

      if (grnDate && grnObservedAt) {
        const grnDateObj = new Date(grnDate);
        const observedDateObj = new Date(grnObservedAt);

        // Only consider historical if grnDate is from a different day (not just earlier time today)
        const grnDateOnly = new Date(grnDateObj.getFullYear(), grnDateObj.getMonth(), grnDateObj.getDate());
        const observedDateOnly = new Date(observedDateObj.getFullYear(), observedDateObj.getMonth(), observedDateObj.getDate());

        isHistoricalGrn = grnDateOnly.getTime() < observedDateOnly.getTime();
      }

      let movementDate;
      let isDateOnly = false;

      if (isHistoricalGrn) {
        // For historical GRNs, use grnDate and mark as date-only
        movementDate = grnDate;
        isDateOnly = true;
      } else {
        // For live GRNs, use observed timestamp or fallback, converted to Malawi local time
        const rawTimestamp =
          item.posStockIntake.grnObservedAt ||
          item.posStockIntake.sourceSyncedAt ||
          item.posStockIntake.sourceUpdatedAt ||
          item.posStockIntake.grnDate ||
          item.posStockIntake.updatedAt ||
          item.posStockIntake.createdAt ||
          new Date();
        
        // Convert from UTC to Africa/Blantyre (add 2 hours) to match SALE row display
        movementDate = new Date(rawTimestamp.getTime() + BLANTYRE_TZ_OFFSET_MS);
      }

      const { transactionDate, transactionTime } = formatBlantyreDateTimeParts(movementDate);
      const mappedRow = {
        id: `pos-grn-${item.posStockIntake.grnNo}-${item.stockDetailId || item.productCode}`,
        type: 'pos_grn',
        movementDate,
        movementType: 'STOCK_IN',
        transactionDate,
        transactionTime,
        isDateOnly, // NEW: Flag for historical date-only entries
        productCode: item.productCode,
        productName: item.productName || item.productCode,
        locationCode: item.posStockIntake.locationCode || locationFilter.locationCode,
        branchCode: item.posStockIntake.branchCode,
        qtyIn: toNum(item.quantity),
        qtyOut: 0,
        unitCost: item.unitCost,
        unitPrice: roundMoney(item.unitCost),
        lineAmount: roundMoney(item.lineAmount),
        referenceNo: item.posStockIntake.grnNo,
        referenceType: 'GRN',
        supplierCode: item.posStockIntake.supplierCode,
        orderNumber: item.posStockIntake.orderNumber,
        grnReference: item.posStockIntake.grnReference,
        expiryDate: item.expiryDate,
        source: 'POS_GRN_SYNC',
        sourceUpdatedAt: item.posStockIntake.sourceUpdatedAt,
        syncedAt: item.sourceSyncedAt,
        userName: selectedUser,
      };

      console.log('[LEDGER STOCK_IN METADATA] Historical GRN detection:', {
        grnNo: item.posStockIntake.grnNo,
        grnDate: item.posStockIntake.grnDate,
        grnObservedAt: item.posStockIntake.grnObservedAt,
        grnDateOnly: grnDate ? new Date(new Date(grnDate).getFullYear(), new Date(grnDate).getMonth(), new Date(grnDate).getDate()).toDateString() : null,
        observedDateOnly: grnObservedAt ? new Date(new Date(grnObservedAt).getFullYear(), new Date(grnObservedAt).getMonth(), new Date(grnObservedAt).getDate()).toDateString() : null,
        isHistoricalGrn,
        isDateOnly,
        selectedMovementDate: movementDate.toISOString(),
        selectedUser,
      });
      console.log('[POS GRN MAPPED ROW]', mappedRow);
      return mappedRow;
    });

    console.log('[INVENTORY_ACTIVITY_SERVICE][LEDGER GRN NORMALIZATION] POS GRN movement sample:', movements[0] || null);
    console.log(`[INVENTORY_ACTIVITY_SERVICE] Returning ${movements.length} POS GRN movements`);
    return movements;
  } catch (error) {
    console.error('[INVENTORY_ACTIVITY_SERVICE] Error fetching POS GRN movements:', error);
    // Return empty array on error to avoid breaking the ledger
    return [];
  }
}

/**
 * Get opening stock balance for a product at period start
 * Formula: currentSyncedStock + (qtyOut after period - qtyIn after period)
 * This represents the stock that existed at the START of the period
 */
async function getOpeningBalance(productCode, productName, locationCode, periodStartDate, filters = {}) {
  const locationFilter = buildLocationFilter(filters);
  const normalizedProductCode = normalize(productCode);
  const normalizedBranchCode = locationFilter.branchCode ? normalizeUpper(locationFilter.branchCode) : null;
  const normalizedLocationCode = locationFilter.locationCode ? normalizeUpper(locationFilter.locationCode) : null;

  console.log('[OPENING_BALANCE_DEBUG] Input:', {
    productCode: normalizedProductCode,
    productName,
    branchCode: normalizedBranchCode,
    locationCode: normalizedLocationCode,
    locationId: filters.locationId || null,
    periodStartDate: periodStartDate.toISOString(),
  });

  if (!normalizedProductCode) {
    console.warn('[OPENING BALANCE] Missing productCode - cannot compute exact opening balance', {
      productName,
      branchCode: normalizedBranchCode,
      locationCode: normalizedLocationCode,
    });
    return 0;
  }

  if (!normalizedBranchCode || !normalizedLocationCode) {
    console.warn('[OPENING BALANCE] branchCode+locationCode required for exact stock lookup', {
      productCode: normalizedProductCode,
      branchCode: normalizedBranchCode,
      locationCode: normalizedLocationCode,
    });
    return 0;
  }

  try {
    // 1. Get current synced POS stock from the same Product table used by Products / Emergency Sales
    const currentSyncedStock = await resolveExactPersistedProduct(
      normalizedProductCode,
      normalizedBranchCode,
      normalizedLocationCode,
      productName
    );

    const latestStockBalance = currentSyncedStock ? toNum(resolveEffectiveStock(currentSyncedStock)) : null;
    const stockSource = currentSyncedStock ? 'PersistedProduct.stock' : 'PersistedProduct.not_found';

    console.log('[OPENING_BALANCE_DEBUG] Exact stock query:', {
      productCode: normalizedProductCode,
      branchCode: normalizedBranchCode,
      locationCode: normalizedLocationCode,
      found: !!currentSyncedStock,
      latestStockBalance,
      stockSource,
    });

    // 2. Get all transactions AFTER the period start (to calculate what's happened since period began)
    const [salesAfter, posGrnAfter] = await Promise.all([
      prisma.salesInvoiceItem.findMany({
        where: {
          productCode: { equals: normalizedProductCode, mode: 'insensitive' },
          salesInvoice: {
            ...locationFilter,
            OR: [
              { invoiceDate: { gt: periodStartDate } },
              { invoiceTime: { gt: periodStartDate } },
            ],
          },
        },
        select: { qty: true },
      }),
      prisma.posStockIntakeItem.findMany({
        where: {
          productCode: { equals: normalizedProductCode, mode: 'insensitive' },
          posStockIntake: {
            ...locationFilter,
            OR: [
              { grnDate: { gt: periodStartDate } },
              { sourceUpdatedAt: { gt: periodStartDate } },
            ],
          },
          quantity: { gt: 0 },
        },
        select: { quantity: true },
      }),
    ]);

    const totalQtyOutInSelectedPeriod = salesAfter.reduce((sum, row) => sum + toNum(row.qty), 0);
    const totalQtyInInSelectedPeriod = posGrnAfter.reduce((sum, row) => sum + toNum(row.quantity), 0);

    const openingBal = latestStockBalance != null
      ? toNum(latestStockBalance + totalQtyOutInSelectedPeriod - totalQtyInInSelectedPeriod)
      : 0;

    console.log('[OPENING BALANCE] Product:', {
      productCode: normalizedProductCode,
      productName,
      branchCode: normalizedBranchCode,
      locationCode: normalizedLocationCode,
    }, 'PeriodStart:', periodStartDate.toISOString(), 'Calculation:', {
      latestStockBalance,
      totalQtyOutInSelectedPeriod,
      totalQtyInInSelectedPeriod,
      openingBalance: openingBal,
      stockSource,
    });

    return openingBal;
  } catch (err) {
    console.error('[OPENING BALANCE] Error:', err);
    return 0;
  }
}

/**
 * Get product summary for the period and location
 */
async function getProductSummary(period, filters = {}) {
  const locationFilter = buildLocationFilter(filters);

  const [salesItems, intakeItems] = await Promise.all([
    prisma.salesInvoiceItem.findMany({
      where: {
        salesInvoice: {
          ...locationFilter,
          invoiceDate: { gte: period.startDate, lte: period.endDate },
        },
      },
      select: {
        productCode: true,
        productName: true,
        qty: true,
        amount: true,
      },
      take: 5000,
    }),
    prisma.goodsIntakeItem.findMany({
      where: {
        goodsIntake: {
          ...locationFilter,
          status: { not: 'draft' },
          finalizedAt: { gte: period.startDate, lte: period.endDate },
        },
      },
      select: {
        productName: true,
        quantity: true,
        totalCost: true,
        product: { select: { sourceCode: true } },
      },
      take: 5000,
    }),
  ]);

  const map = new Map();

  // Aggregate sales
  for (const row of salesItems) {
    const key = normalizeUpper(row.productCode || row.productName);
    const existing = map.get(key) || {
      productCode: row.productCode,
      productName: row.productName,
      totalQtyIn: 0,
      totalQtyOut: 0,
      totalSalesAmount: 0,
      movementCount: 0,
    };
    existing.totalQtyOut += toNum(row.qty);
    existing.totalSalesAmount += roundMoney(row.amount);
    existing.movementCount += 1;
    map.set(key, existing);
  }

  // Aggregate intakes
  for (const row of intakeItems) {
    const key = normalizeUpper(row.product?.sourceCode || row.productName);
    const existing = map.get(key) || {
      productCode: row.product?.sourceCode || null,
      productName: row.productName,
      totalQtyIn: 0,
      totalQtyOut: 0,
      totalSalesAmount: 0,
      movementCount: 0,
    };
    existing.totalQtyIn += toNum(row.quantity);
    existing.movementCount += 1;
    map.set(key, existing);
  }

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      totalQtyIn: toNum(row.totalQtyIn),
      totalQtyOut: toNum(row.totalQtyOut),
      netMovement: toNum(row.totalQtyIn - row.totalQtyOut),
    }))
    .sort((a, b) => b.movementCount - a.movementCount)
    .slice(0, 100);
}

/**
 * Get current product stock for a location
 */
async function resolveExactPersistedProduct(productCode, branchCode, locationCode, productName = null) {
  if ((!productCode && !productName) || !branchCode || !locationCode) {
    return null;
  }

  const normalizedProductCode = normalize(productCode);
  const normalizedProductName = normalize(productName);
  const normalizedBranchCode = normalizeUpper(branchCode);
  const normalizedLocationCode = normalizeUpper(locationCode);

  const select = {
    id: true,
    stock: true,
    overrideActive: true,
    overrideStock: true,
    sourceCode: true,
    barcode: true,
    name: true,
    branchCode: true,
    locationCode: true,
  };

  // 1. Exact lookup by sourceCode/barcode
  if (normalizedProductCode) {
    const byCode = await prisma.product.findFirst({
      where: {
        branchCode: normalizedBranchCode,
        locationCode: normalizedLocationCode,
        OR: [
          {
            sourceCode: {
              equals: normalizedProductCode,
              mode: 'insensitive',
            },
          },
          {
            barcode: {
              equals: normalizedProductCode,
              mode: 'insensitive',
            },
          },
        ],
      },
      select,
    });

    if (byCode) {
      return byCode;
    }
  }

  // 2. Fallback exact product name lookup
  if (normalizedProductName) {
    const byName = await prisma.product.findFirst({
      where: {
        branchCode: normalizedBranchCode,
        locationCode: normalizedLocationCode,
        name: {
          equals: normalizedProductName,
          mode: 'insensitive',
        },
      },
      select,
    });

    if (byName) {
      return byName;
    }
  }

  return null;
}
async function getCurrentProductStock(productCode, locationCode, branchCode, locationId) {
  const product = await resolveExactPersistedProduct(productCode, branchCode, locationCode);
  return product ? toNum(resolveEffectiveStock(product)) : null;
}

/**
 * Main function to get inventory activity data
 */
async function getInventoryActivityLedgerData({ period: periodParams, filters = {} }) {
  try {
    console.log('[INVENTORY_LEDGER_SERVICE] Active implementation loaded');
    const period = buildPeriod(filters);
    const hasProductFilter = Boolean(normalize(filters.productCode) || normalize(filters.productName));
    const isAllLocations = !filters.locationId && !filters.locationCode;

    const now = new Date();
    const isPeriodOngoing = now.getTime() <= period.endDate.getTime();
    const periodStartDay = new Date(Date.UTC(period.startDate.getUTCFullYear(), period.startDate.getUTCMonth(), period.startDate.getUTCDate()));
    const localNow = new Date(now.getTime() + BLANTYRE_TZ_OFFSET_MS);
    const today = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()));
    const isPeriodToday = periodStartDay.getTime() === today.getTime();

    console.log('[INVENTORY LEDGER] Period is today:', isPeriodToday, 'startDate:', period.startDate.toISOString(), 'today:', today.toISOString());
    console.log('[INVENTORY LEDGER] Product filter:', { hasProductFilter, productCode: filters.productCode, productName: filters.productName });
    console.log('[INVENTORY LEDGER] Location filter:', {
      isAllLocations,
      branchCode: filters.branchCode,
      locationCode: filters.locationCode,
      locationId: filters.locationId,
    });

    if ((filters.locationId || filters.branchCode || filters.locationCode) && (!filters.branchCode || !filters.locationCode)) {
      console.warn('[INVENTORY LEDGER] Incomplete canonical location scope. Exact opening balance requires branchCode + locationCode.', {
        branchCode: filters.branchCode,
        locationCode: filters.locationCode,
        locationId: filters.locationId,
      });
    }

    // Get all movement types in parallel
    const [saleMovements, intakeMovements, emergencySalesMovements, adjustmentMovements] = await Promise.all([
      getSaleMovements(period, filters),
      getIntakeMovements(period, filters),
      getEmergencySalesMovements(period, filters).catch(() => []),
      getAdjustmentMovements(period, filters),
    ]);

    console.log('[INVENTORY LEDGER] Movements fetched:', { sales: saleMovements.length, intakes: intakeMovements.length, emergencySales: emergencySalesMovements.length, adjustments: adjustmentMovements.length });
    console.log('[LEDGER STOCK_IN MOVEMENTS] count', intakeMovements.length);

    // Log intake movement quality check
    if (intakeMovements.length > 0) {
      console.log('[INVENTORY LEDGER] Intake movements summary:');
      const intakeSummary = {};
      intakeMovements.forEach(m => {
        const key = `${m.branchCode || '?'}/${m.locationCode || '?'}`;
        intakeSummary[key] = (intakeSummary[key] || 0) + 1;
      });
      console.log('[INVENTORY LEDGER] Intakes by location:', intakeSummary);
    } else {
      console.warn('[INVENTORY LEDGER] ⚠️ NO INTAKE MOVEMENTS FOUND', {
        period: { start: period.startDate.toISOString(), end: period.endDate.toISOString() },
        filters: { branchCode: filters.branchCode, locationCode: filters.locationCode, locationId: filters.locationId },
        advice: 'Check that POS GRN / stock intake sync records exist in the backend for the selected period and location',
      });
    }

    // Combine movements before filtering
    const rawAllMovements = [...saleMovements, ...intakeMovements, ...emergencySalesMovements, ...adjustmentMovements];
    const rawCounts = { sales: 0, stockIn: 0, other: 0 };
    rawAllMovements.forEach((row) => {
      if (normalizeUpper(row.movementType) === 'SALE') rawCounts.sales += 1;
      else if (normalizeUpper(row.movementType) === 'STOCK_IN') rawCounts.stockIn += 1;
      else rawCounts.other += 1;
    });

    const requestedMovementType = normalizeUpper(filters.movementType || 'ALL');
    const preFilterCount = rawAllMovements.length;
    const allMovements = rawAllMovements
      .filter((row) => movementTypeMatchesFilter(row.movementType, filters.movementType));

    const postCounts = { sales: 0, stockIn: 0, other: 0 };
    allMovements.forEach((row) => {
      if (normalizeUpper(row.movementType) === 'SALE') postCounts.sales += 1;
      else if (normalizeUpper(row.movementType) === 'STOCK_IN') postCounts.stockIn += 1;
      else postCounts.other += 1;
    });

    console.log('[LEDGER ALL MOVEMENTS] sales count:', rawCounts.sales, 'stockIn count:', rawCounts.stockIn, 'total count:', preFilterCount);
    console.log('[LEDGER FILTER]', {
      requestedMovementType,
      beforeCount: preFilterCount,
      afterCount: allMovements.length,
      before: rawCounts,
      after: postCounts,
    });

    allMovements.sort((a, b) => new Date(a.movementDate).getTime() - new Date(b.movementDate).getTime());

    // Get unique product keys from movements (use productCode if present, else normalized productName)
    const productKeyLookup = new Map();
    allMovements.forEach((movement) => {
      const key = movement.productCode || normalizeUpper(movement.productName || '');
      if (!key) return;
      if (!productKeyLookup.has(key)) {
        productKeyLookup.set(key, {
          productCode: movement.productCode || null,
          productName: movement.productName || null,
        });
      }
    });

    const uniqueProductKeys = Array.from(productKeyLookup.keys());

    // Calculate opening balances for each product key
    const productOpeningBalances = {};
    const productClosingBalances = {};
    const productCurrentBalances = {};
    const productDiagnostics = new Map();

    console.log('[INVENTORY LEDGER] Processing opening balances for', uniqueProductKeys.length, 'unique products');

    let diagnosticCounter = 0;
    let stockInDiagnostics = 0;

    for (const productKey of uniqueProductKeys) {
      const { productCode, productName } = productKeyLookup.get(productKey) || {};
      const openingBal = await getOpeningBalance(
        productCode,
        productName,
        filters.locationCode || null,
        period.startDate,
        filters
      );
      productOpeningBalances[productKey] = toNum(openingBal);
      productCurrentBalances[productKey] = toNum(openingBal);

      console.log('[INVENTORY LEDGER] Opening balance set for', { productCode, productName }, 'value:', openingBal);

      if (diagnosticCounter < 10) {
        let currentStock = null;
        let stockSource = 'PersistedProduct.not_found';

        if (productCode && filters.branchCode && filters.locationCode) {
          const currentProduct = await resolveExactPersistedProduct(
            productCode,
            filters.branchCode,
            filters.locationCode,
            productName
          );

          if (currentProduct) {
            currentStock = toNum(resolveEffectiveStock(currentProduct));
            stockSource = 'PersistedProduct.stock';
          }
        }

        let totalQtyOutInSelectedPeriod = 0;
        let totalQtyInInSelectedPeriod = 0;

        if (productCode) {
          const [salesAfter, posGrnAfter] = await Promise.all([
            prisma.salesInvoiceItem.findMany({
              where: {
                productCode: { equals: productCode, mode: 'insensitive' },
                salesInvoice: {
                  ...(filters.branchCode ? { branchCode: normalizeUpper(filters.branchCode) } : {}),
                  ...(filters.locationCode ? { locationCode: { equals: normalizeUpper(filters.locationCode), mode: 'insensitive' } } : {}),
                  ...(filters.locationId ? { locationId: Number(filters.locationId) } : {}),
                  OR: [
                    { invoiceDate: { gt: period.startDate } },
                    { invoiceTime: { gt: period.startDate } },
                  ],
                },
              },
              select: { qty: true },
            }),
            prisma.posStockIntakeItem.findMany({
              where: {
                productCode: { equals: productCode, mode: 'insensitive' },
                posStockIntake: {
                  ...(filters.branchCode ? { branchCode: normalizeUpper(filters.branchCode) } : {}),
                  ...(filters.locationCode ? { locationCode: { equals: normalizeUpper(filters.locationCode), mode: 'insensitive' } } : {}),
                  ...(filters.locationId ? { locationId: Number(filters.locationId) } : {}),
                  OR: [
                    { grnDate: { gt: period.startDate } },
                    { sourceUpdatedAt: { gt: period.startDate } },
                  ],
                },
                quantity: { gt: 0 },
              },
              select: { quantity: true },
            }),
          ]);

          totalQtyOutInSelectedPeriod = salesAfter.reduce((sum, row) => sum + toNum(row.qty), 0);
          totalQtyInInSelectedPeriod = posGrnAfter.reduce((sum, row) => sum + toNum(row.quantity), 0);
        }

        productDiagnostics.set(productKey, {
          productCode: productCode || null,
          latestStockBalance: currentStock,
          totalQtyOutInSelectedPeriod,
          totalQtyInInSelectedPeriod,
          computedOpeningBalance: openingBal,
          firstBalanceAfterTransaction: null,
          computedClosingBalance: null,
          stockSource,
        });

        console.log(`[LEDGER DIAGNOSTIC ${diagnosticCounter + 1}/10]`, {
          productCode,
          productName,
          branchCode: filters.branchCode || null,
          locationCode: filters.locationCode || null,
          latestStockBalance: currentStock,
          stockSource,
          totalQtyOutInSelectedPeriod,
          totalQtyInInSelectedPeriod,
          computedOpeningBalance: openingBal,
          firstBalanceAfterTransaction: null,
          computedClosingBalance: null,
        });

        diagnosticCounter++;
      }
    }

    // Calculate running balances per product key
    const firstBalanceLogged = new Set();
    const movementProductCache = new Map();

    for (const movement of allMovements) {
      const productKey = movement.productCode || normalizeUpper(movement.productName || '');
      const movementBranchCode = movement.branchCode || filters.branchCode || null;
      const movementLocationCode = movement.locationCode || filters.locationCode || null;
      const lookupKey = `${normalize(movement.productCode || '')}|${normalizeUpper(movementBranchCode || '')}|${normalizeUpper(movementLocationCode || '')}`;

      let resolvedProduct = movementProductCache.get(lookupKey);
      if (!resolvedProduct && movement.productCode && movementBranchCode && movementLocationCode) {
        resolvedProduct = await resolveExactPersistedProduct(
        movement.productCode,
        movementBranchCode,
        movementLocationCode,
        movement.productName
      );
        movementProductCache.set(lookupKey, resolvedProduct || null);
      }

      if (productKey && productCurrentBalances.hasOwnProperty(productKey)) {
        // Initialize from opening balance once
        if (productCurrentBalances[productKey] == null) {
          productCurrentBalances[productKey] =
            productOpeningBalances[productKey] ?? 0;
        }

        const prevBalance = toNum(productCurrentBalances[productKey]);
        const runningBalanceBefore = prevBalance;

        // Apply movement chronologically
        const nextBalance = toNum(
          prevBalance +
          movement.qtyIn -
          movement.qtyOut
        );

        movement.balanceBeforeTransaction = prevBalance;
        movement.balanceAfterTransaction = nextBalance;

        if (movement.movementType === 'STOCK_IN' && stockInDiagnostics < 10) {
          console.log('[LEDGER STOCK_IN FLOW]', {
            productCode: movement.productCode,
            GRNNo: movement.referenceNo,
            transactionTime: movement.transactionTime,
            openingBalance: productOpeningBalances[productKey],
            qtyIn: movement.qtyIn,
            runningBalanceBefore,
            balanceAfterTransaction: nextBalance,
            userName: movement.userName || movement.cashierName || 'POS',
          });
          stockInDiagnostics += 1;
        }

        // Persist running balance
        productCurrentBalances[productKey] = nextBalance;
        productClosingBalances[productKey] = nextBalance;
        if (productDiagnostics.has(productKey) && !firstBalanceLogged.has(productKey)) {
          const diag = productDiagnostics.get(productKey);
          diag.firstBalanceAfterTransaction = movement.balanceAfterTransaction;
          console.log(`[LEDGER DIAGNOSTIC UPDATE] First balance after transaction for ${movement.productCode || movement.productName}: ${movement.balanceAfterTransaction}`);
          firstBalanceLogged.add(productKey);
        }

        console.log('[LEDGER BALANCE] Movement:', {
          productCode: movement.productCode,
          branchCode: movementBranchCode,
          locationCode: movementLocationCode,
          resolvedProductId: resolvedProduct?.id || null,
          resolvedProductSourceCode: resolvedProduct?.sourceCode || null,
          resolvedProductStock: resolvedProduct ? toNum(resolveEffectiveStock(resolvedProduct)) : null,
          matched: Boolean(resolvedProduct),
          movementType: movement.movementType,
          timestamp: movement.movementDate,
          qtyIn: movement.qtyIn,
          qtyOut: movement.qtyOut,
          balanceBeforeTransaction: prevBalance,
          balanceAfterTransaction: movement.balanceAfterTransaction,
        });
      } else {
        movement.balanceAfterTransaction =
        productCurrentBalances[productKey] ??
        productOpeningBalances[productKey] ??
        null;
        console.warn('[LEDGER BALANCE] No balance tracking for productKey:', productKey, {
          branchCode: movementBranchCode,
          locationCode: movementLocationCode,
          matched: Boolean(resolvedProduct),
          resolvedProductId: resolvedProduct?.id || null,
        });
      }
    }

    // Set closing balances
    for (const productKey of uniqueProductKeys) {
      productClosingBalances[productKey] = productCurrentBalances[productKey];
      if (productDiagnostics.has(productKey)) {
        productDiagnostics.get(productKey).computedClosingBalance = productClosingBalances[productKey];
      }
    }

    // Calculate summary totals
    let totalQtyIn = 0;
    let totalQtyOut = 0;
    let totalSalesAmount = 0;
    let totalIntakeValue = 0;
    let totalOpeningBalance = 0;
    let totalClosingBalance = 0;

    allMovements.forEach((movement) => {
      totalQtyIn += Number(movement.qtyIn || 0);
      totalQtyOut += Number(movement.qtyOut || 0);
      if (movement.movementType === 'SALE') {
        totalSalesAmount += Number(movement.lineAmount || 0);
      }
      if (movement.movementType === 'STOCK_IN') {
        totalIntakeValue += Number(movement.lineAmount || 0);
      }
    });

    uniqueProductKeys.forEach((productKey) => {
      totalOpeningBalance += productOpeningBalances[productKey] || 0;
      totalClosingBalance += productClosingBalances[productKey] || 0;
      
      // Log summary per product
      const { productCode, productName } = productKeyLookup.get(productKey) || {};
      console.log('[LEDGER SUMMARY PER PRODUCT]', {
        productCode,
        productName,
        openingBalance: productOpeningBalances[productKey],
        closingBalance: productClosingBalances[productKey],
        netMovement: (productClosingBalances[productKey] || 0) - (productOpeningBalances[productKey] || 0),
      });
    });

    for (const [productKey, diag] of productDiagnostics.entries()) {
      console.log('[LEDGER DIAGNOSTIC SUMMARY]', {
        productCode: diag.productCode,
        latestStockBalance: diag.latestStockBalance,
        totalQtyOutInSelectedPeriod: diag.totalQtyOutInSelectedPeriod,
        totalQtyInInSelectedPeriod: diag.totalQtyInInSelectedPeriod,
        computedOpeningBalance: diag.computedOpeningBalance,
        firstBalanceAfterTransaction: diag.firstBalanceAfterTransaction,
        computedClosingBalance: diag.computedClosingBalance,
        stockSource: diag.stockSource,
      });
    }

    // Get product summary if no product filter
    const products = hasProductFilter ? [] : await getProductSummary(period, filters);

    // Get current product stock if product filter and location specified
    let currentProductStock = null;
    let productInfo = null;
    
    if (hasProductFilter && !isAllLocations) {
      currentProductStock = await getCurrentProductStock(
        filters.productCode,
        filters.locationCode,
        filters.branchCode,
        filters.locationId,
      );
      
      if (currentProductStock !== null) {
        productInfo = {
          productCode: filters.productCode || null,
          productName: filters.productName || null,
          currentStock: currentProductStock,
        };
      }
    }

    // Build ledger rows in the expected frontend shape with local time
    const ledger = allMovements.map((movement, idx) => {
      const productKey = movement.productCode || normalizeUpper(movement.productName || '');
      const openingBalance = productOpeningBalances[productKey] || 0;
      const closingBalance = isPeriodOngoing ? null : (productClosingBalances[productKey] || 0);
      const timestampValue = movement.movementDate instanceof Date ? movement.movementDate.toISOString() : movement.movementDate;

      // Diagnostic log for each ledger row
      console.log('[LEDGER ROW]', {
        productCode: movement.productCode,
        branchCode: filters.branchCode,
        locationCode: movement.locationCode,
        movementType: movement.movementType,
        timestamp: timestampValue,
        openingBalance,
        qtyIn: movement.qtyIn,
        qtyOut: movement.qtyOut,
        balanceAfterTransaction: movement.balanceAfterTransaction,
      });

      return {
        transactionId: movement.transactionId || `${movement.movementType}-${idx}`,
        timestamp: timestampValue,
        transactionDate: movement.transactionDate || null,
        transactionTime: movement.transactionTime || null,
        isDateOnly: movement.isDateOnly || false, // NEW: Flag for historical date-only entries
        movementType: movement.movementType,
        referenceNo: movement.referenceNo,
        user: movement.userName || movement.cashierName || 'POS',
        productCode: movement.productCode,
        productName: movement.productName,
        openingBalance,
        qtyIn: movement.qtyIn,
        qtyOut: movement.qtyOut,
        balanceAfterTransaction: movement.balanceAfterTransaction,
        closingBalance,
        unitPrice: movement.unitPrice,
        lineAmount: movement.lineAmount,
        locationCode: movement.locationCode,
        branchCode: movement.branchCode || null,
        status: movement.status || null,
      };
    });

    // Build summary (closing balance only for completed periods)
    const summary = {
      totalQtyIn: toNum(totalQtyIn),
      totalQtyOut: toNum(totalQtyOut),
      totalSalesAmount: roundMoney(totalSalesAmount),
      totalIntakeValue: roundMoney(totalIntakeValue),
      movementCount: allMovements.length,
      transactionCount: allMovements.length,
      productCount: products.length,
      currentProductStock,
      productInfo,
      openingBalance: toNum(totalOpeningBalance),
      closingBalance: isPeriodOngoing ? null : toNum(totalClosingBalance),
      isPeriodToday,
      isPeriodOngoing,
    };

    // Data quality info
    let dataQuality = {
      level: 'ok',
      message: null,
    };

    if (isAllLocations && hasProductFilter) {
      dataQuality = {
        level: 'warning',
        message: 'Select a specific location for accurate running balance. Stock is location-specific.',
      };
    } else if (hasProductFilter && currentProductStock === null) {
      dataQuality = {
        level: 'warning',
        message: 'Product not found at this location. Showing movement data only.',
      };
    }

    return {
      success: true,
      mode: hasProductFilter ? 'ledger' : 'summary',
      period: {
        startDate: period.startDate,
        endDate: period.endDate,
        periodType: filters.periodType || 'day',
      },
      location: {
        locationId: filters.locationId || null,
        locationCode: filters.locationCode || null,
        isAllLocations,
      },
      summary,
      products,
      movements: allMovements,
      ledger,
      dataQuality,
    };
  } catch (error) {
    console.error('Inventory Activity Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to load inventory activity data',
      mode: 'summary',
      summary: {},
      products: [],
      movements: [],
      dataQuality: { level: 'error', message: error.message },
    };
  }
}

module.exports = {
  getInventoryActivityLedgerData,
};
