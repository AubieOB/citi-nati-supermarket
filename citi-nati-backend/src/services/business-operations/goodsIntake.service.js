'use strict';

const { PrismaClient } = require('@prisma/client');
const posCommandQueueService = require('../posCommandQueue.service');
const { updateProductPrice: updateCachedProductPrice } = require('../cache.service');
const {
  normalizeScopeCode,
} = require('../../utils/operationalScope');
const { enrichProductStock } = require('../../utils/stockResolver');

const prisma = new PrismaClient();
const POS_DEFAULT_LOCATION_CODE = normalizeScopeCode(process.env.POS_LOCATION_CODE) || 'BT';
const POS_DEFAULT_PRICE_TYPE_CODE = process.env.POS_PRICE_TYPE_CODE || 'RT';
const POS_BLANTYRE_SELLING_LOCATION_CODE = normalizeScopeCode(
  process.env.POS_BLANTYRE_SELLING_LOCATION_CODE
  || process.env.POS_BLANTYRE_PROMOTION_LOCATION_CODE
  || 'SH'
) || 'SH';
const POS_ZOMBA_SELLING_LOCATION_CODE = normalizeScopeCode(
  process.env.POS_ZOMBA_SELLING_LOCATION_CODE
  || process.env.POS_ZOMBA_PROMOTION_LOCATION_CODE
  || 'SH'
) || 'SH';

function expandLocationScopeCodes(locationCode) {
  const code = normalizeScopeCode(locationCode);

  if (!code) return [];

  // Important: do not expand SH globally because SH exists in more than one branch.
  // Branch filtering must handle BLANTYRE+SH vs ZOMBA+SH.
  return [code];
}

function roundMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
}

function normalizeProductCode(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function resolveGoodsIntakePosProductCode(product) {
  return normalizeProductCode(product?.sourceCode) || normalizeProductCode(product?.barcode);
}

function buildLineItem(line, index) {
  const quantity = Math.max(0, Number(line.quantity || 0));
  const unitCost = Math.max(0, Number(line.unitCost || 0));
  const totalCost = roundMoney(quantity * unitCost);
  const sellingPrice = line.sellingPrice === null || line.sellingPrice === undefined || line.sellingPrice === ''
    ? null
    : Math.max(0, Number(line.sellingPrice));
  const estimatedProfit = sellingPrice == null ? 0 : roundMoney((sellingPrice - unitCost) * quantity);
  const marginPercent = (sellingPrice == null || sellingPrice <= 0)
    ? null
    : roundMoney(((sellingPrice - unitCost) / sellingPrice) * 100);

  return {
    lineNo: index + 1,
    barcode: line.barcode ? String(line.barcode).trim() : null,
    productId: line.productId || null,
    productName: String(line.productName || '').trim(),
    quantity,
    unitCost: roundMoney(unitCost),
    totalCost,
    sellingPrice: sellingPrice == null ? null : roundMoney(sellingPrice),
    estimatedProfit,
    marginPercent,
    expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
    batchRef: line.batchRef ? String(line.batchRef).trim() : null,
    lineNotes: line.lineNotes ? String(line.lineNotes).trim() : null,
  };
}

function computeTotals(items) {
  const totalItems = items.length;
  const totalQuantity = roundMoney(items.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
  const totalCost = roundMoney(items.reduce((sum, item) => sum + Number(item.totalCost || 0), 0));
  const totalEstimatedProfit = roundMoney(items.reduce((sum, item) => sum + Number(item.estimatedProfit || 0), 0));
  return {
    totalItems,
    totalQuantity,
    totalCost,
    totalEstimatedProfit,
  };
}

function normalizeStatus(status) {
  const normalized = String(status || 'draft').trim().toLowerCase();
  return normalized === 'finalized' ? 'finalized' : 'draft';
}

function generateIntakeRef() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const sec = String(now.getSeconds()).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GI-${yyyy}${mm}${dd}-${hh}${min}${sec}-${suffix}`;
}

function toWhereFilters(filters = {}) {
  const where = {};

  if (filters.status) where.status = normalizeStatus(filters.status);
  if (filters.branchCode) {
  where.branchCode = { equals: String(filters.branchCode).trim().toUpperCase(), mode: 'insensitive' };
}

if (filters.locationCode) {
  where.locationCode = { equals: String(filters.locationCode).trim().toUpperCase(), mode: 'insensitive' };
}

// Legacy fallback only
if (!filters.branchCode && !filters.locationCode && filters.locationId) {
  where.locationId = filters.locationId;
}

if (filters.supplierId) where.supplierId = filters.supplierId;

  if (filters.search) {
    where.OR = [
      { intakeRef: { contains: filters.search, mode: 'insensitive' } },
      { receiptReference: { contains: filters.search, mode: 'insensitive' } },
      { supplierStoreRef: { contains: filters.search, mode: 'insensitive' } },
      { manualSupplierName: { contains: filters.search, mode: 'insensitive' } },
      { supplier: { name: { contains: filters.search, mode: 'insensitive' } } },
      { items: { some: { productName: { contains: filters.search, mode: 'insensitive' } } } },
      { items: { some: { barcode: { contains: filters.search, mode: 'insensitive' } } } },
    ];
  }

  if (filters.startDate || filters.endDate) {
    where.purchaseDate = {};
    if (filters.startDate) where.purchaseDate.gte = filters.startDate;
    if (filters.endDate) where.purchaseDate.lte = filters.endDate;
  }

  return where;
}

function shapeHeader(payload) {
  const status = normalizeStatus(payload.status);
  return {
    supplierId: payload.supplierId || null,
    manualSupplierName: payload.manualSupplierName || null,
    supplierStoreRef: payload.supplierStoreRef || null,
    purchaseDate: payload.purchaseDate,
    receiptReference: payload.receiptReference || null,
    locationId: payload.locationId || null,
    branchCode: payload.branchCode ? String(payload.branchCode).trim().toUpperCase() : null,
    locationCode: payload.locationCode ? String(payload.locationCode).trim().toUpperCase() : null,
    locationName: payload.locationName || null,
    status,
    overallNotes: payload.overallNotes || null,
    receiptTotalAmount: payload.receiptTotalAmount == null ? null : roundMoney(payload.receiptTotalAmount),
    enteredBy: payload.enteredBy || null,
    finalizedAt: status === 'finalized' ? new Date() : null,
  };
}

function includeShape() {
  return {
    supplier: {
      select: {
        id: true,
        name: true,
        supplierCode: true,
      },
    },
    items: {
      orderBy: { lineNo: 'asc' },
    },
  };
}

function buildProductScopeWhere(normalizedLocationCode) {
  const scopeCodes = expandLocationScopeCodes(normalizedLocationCode);

  return {
    OR: scopeCodes.map((code) => ({
      locationCode: { equals: code, mode: 'insensitive' },
    })),
  };
}

function getDefaultPosLocationCodeForBranch(branchCode, requestedLocationCode) {
  if (branchCode === 'BLANTYRE') return 'SH';

  if (branchCode === 'ZOMBA') {
    const normalizedRequestedLocation = normalizeScopeCode(requestedLocationCode);
    if (normalizedRequestedLocation && normalizedRequestedLocation !== 'ZA') {
      return normalizedRequestedLocation;
    }
    return POS_ZOMBA_SELLING_LOCATION_CODE;
  }

  return normalizeScopeCode(requestedLocationCode) || POS_DEFAULT_LOCATION_CODE;
}

function buildGoodsIntakePriceWritebackScope(product, payloadLocationCode) {
  const requestedLocationCode = normalizeScopeCode(payloadLocationCode || product?.locationCode || POS_DEFAULT_LOCATION_CODE) || POS_DEFAULT_LOCATION_CODE;
  const branchCode = String(product?.branchCode || '').trim().toUpperCase();
  if (!branchCode) {
    throw new Error('branchCode is required for goods intake price writeback scope');
  }

  return {
    requestedLocationCode,
    locationCode: getDefaultPosLocationCodeForBranch(branchCode, requestedLocationCode),
    branchCode,
    priceTypeCode: POS_DEFAULT_PRICE_TYPE_CODE,
  };
}

async function attachTransferCommandMetadata(records) {
  const list = Array.isArray(records) ? records : [];
  if (list.length === 0) return list;

  const intakeIds = list
    .map((record) => Number(record?.id))
    .filter((value) => Number.isFinite(value))
    .map((value) => String(value));

  if (intakeIds.length === 0) return list;

  const commands = await prisma.posWriteCommand.findMany({
    where: {
      commandType: 'CREATE_PENDING_STOCK_INTAKE',
      relatedEntityType: 'GoodsIntake',
      relatedEntityId: { in: intakeIds },
    },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      relatedEntityId: true,
      status: true,
      payload: true,
      errorMessage: true,
      resultSummary: true,
      createdAt: true,
      processedAt: true,
      updatedAt: true,
      retryCount: true,
      maxRetries: true,
      agentId: true,
    },
  });

  const latestByIntakeId = new Map();
  for (const command of commands) {
    const key = String(command.relatedEntityId || '');
    if (!key || latestByIntakeId.has(key)) continue;
    latestByIntakeId.set(key, command);
  }

  return list.map((record) => {
    const key = String(record.id || '');
    const command = latestByIntakeId.get(key) || null;
    return {
      ...record,
      posTransferCommand: command
        ? {
            id: command.id,
            status: command.status,
          requestedGrn: String(command.payload?.requestedGrn || command.payload?.grnNo || '').trim() || null,
          manualGrnOverride: Boolean(command.payload?.manualGrnOverride),
          grnDate: command.payload?.grnDate || null,
          finalGrn: String(command.resultSummary?.finalGrn || command.resultSummary?.grnNo || '').trim() || null,
            errorMessage: command.errorMessage,
            resultSummary: command.resultSummary,
            createdAt: command.createdAt,
            processedAt: command.processedAt,
            updatedAt: command.updatedAt,
            retryCount: command.retryCount,
            maxRetries: command.maxRetries,
            agentId: command.agentId,
          }
        : null,
    };
  });
}

function toPriceSyncStatusCounts(commands) {
  return commands.reduce((acc, command) => {
    const status = String(command?.status || '').trim().toLowerCase();
    if (status === 'completed') acc.completed += 1;
    else if (status === 'failed') acc.failed += 1;
    else if (status === 'processing') acc.processing += 1;
    else acc.queued += 1;
    return acc;
  }, {
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  });
}

async function attachPriceSyncCommandMetadata(records) {
  const list = Array.isArray(records) ? records : [];
  if (list.length === 0) return list;

  const intakeIds = list
    .map((record) => Number(record?.id))
    .filter((value) => Number.isFinite(value))
    .map((value) => String(value));

  if (intakeIds.length === 0) return list;

  const commands = await prisma.posWriteCommand.findMany({
    where: {
      commandType: 'UPDATE_PRICE',
      relatedEntityType: 'GoodsIntake',
      relatedEntityId: { in: intakeIds },
    },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      relatedEntityId: true,
      status: true,
      payload: true,
      errorMessage: true,
      resultSummary: true,
      createdAt: true,
      processedAt: true,
      updatedAt: true,
      retryCount: true,
      maxRetries: true,
      agentId: true,
    },
  });

  const commandsByIntakeId = new Map();
  const unresolvedProductIds = new Set();
  const unresolvedProductCodes = new Set();

  for (const command of commands) {
    const key = String(command.relatedEntityId || '');
    if (!key) continue;
    if (!commandsByIntakeId.has(key)) {
      commandsByIntakeId.set(key, []);
    }
    commandsByIntakeId.get(key).push(command);

    const payloadName = String(command?.payload?.productName || '').trim();
    if (!payloadName) {
      const payloadProductId = Number(command?.payload?.productId);
      const payloadProductCode = String(command?.payload?.productCode || '').trim();
      if (Number.isFinite(payloadProductId) && payloadProductId > 0) {
        unresolvedProductIds.add(payloadProductId);
      }
      if (payloadProductCode) {
        unresolvedProductCodes.add(payloadProductCode.toUpperCase());
      }
    }
  }

  let products = [];
  if (unresolvedProductIds.size > 0 || unresolvedProductCodes.size > 0) {
    const codeMatchers = Array.from(unresolvedProductCodes).flatMap((code) => ([
      { sourceCode: { equals: code, mode: 'insensitive' } },
      { barcode: { equals: code, mode: 'insensitive' } },
    ]));

    products = await prisma.product.findMany({
      where: {
        OR: [
          ...(unresolvedProductIds.size > 0 ? [{ id: { in: Array.from(unresolvedProductIds) } }] : []),
          ...codeMatchers,
        ],
      },
      select: {
        id: true,
        name: true,
        sourceCode: true,
        barcode: true,
      },
    });
  }

  const productNameById = new Map();
  const productNameByCode = new Map();
  for (const product of products) {
    const productName = String(product?.name || '').trim();
    if (!productName) continue;
    if (Number.isFinite(Number(product?.id))) {
      productNameById.set(Number(product.id), productName);
    }
    const sourceCode = String(product?.sourceCode || '').trim().toUpperCase();
    const barcode = String(product?.barcode || '').trim().toUpperCase();
    if (sourceCode) productNameByCode.set(sourceCode, productName);
    if (barcode) productNameByCode.set(barcode, productName);
  }

  return list.map((record) => {
    const key = String(record.id || '');
    const priceCommands = commandsByIntakeId.get(key) || [];
    const statusCounts = toPriceSyncStatusCounts(priceCommands);

    return {
      ...record,
      priceSyncSummary: {
        attempted: priceCommands.length,
        queued: statusCounts.queued,
        processing: statusCounts.processing,
        completed: statusCounts.completed,
        failed: statusCounts.failed,
        lastQueuedAt: priceCommands[0]?.createdAt || null,
        lastProcessedAt: priceCommands.find((entry) => entry?.processedAt)?.processedAt || null,
      },
      priceSyncCommands: priceCommands.map((command) => ({
        ...(() => {
          const payloadName = String(command?.payload?.productName || '').trim();
          const payloadProductId = Number(command?.payload?.productId);
          const payloadProductCode = String(command?.payload?.productCode || '').trim().toUpperCase();
          const resolvedName = payloadName
            || (Number.isFinite(payloadProductId) ? productNameById.get(payloadProductId) : null)
            || (payloadProductCode ? productNameByCode.get(payloadProductCode) : null)
            || null;

          return {
            productName: resolvedName,
          };
        })(),
        id: command.id,
        status: command.status,
        productId: command.payload?.productId || null,
        productCode: command.payload?.productCode || null,
        oldPrice: command.payload?.oldPrice ?? null,
        newPrice: command.payload?.newPrice ?? null,
        locationCode: command.payload?.locationCode || null,
        requestedLocationCode: command.payload?.requestedLocationCode || null,
        branchCode: command.payload?.branchCode || null,
        priceTypeCode: command.payload?.priceTypeCode || null,
        errorMessage: command.errorMessage,
        resultSummary: command.resultSummary,
        createdAt: command.createdAt,
        processedAt: command.processedAt,
        updatedAt: command.updatedAt,
        retryCount: command.retryCount,
        maxRetries: command.maxRetries,
        agentId: command.agentId,
      })),
    };
  });
}

async function lookupGoodsIntakeProducts({ query, branchCode, locationCode, locationId, take = 20 }) {
  const normalizedQuery = String(query || '').trim();
  const normalizedLocationCode = normalizeScopeCode(locationCode);
  const normalizedBranchCode = branchCode ? String(branchCode).trim().toUpperCase() : null;
  
  if (!normalizedQuery || !normalizedLocationCode) {
    return [];
  }

  const scopeWhere = buildProductScopeWhere(normalizedLocationCode);
  const scopeCodes = expandLocationScopeCodes(normalizedLocationCode);
  
  // For ambiguous location codes (like SH that exists in both Blantyre and Zomba),
  // use branchCode to further disambiguate
  const whereClause = { AND: [scopeWhere] };
  if (normalizedBranchCode && normalizedLocationCode === 'SH') {
    whereClause.AND.push({
      branchCode: { equals: normalizedBranchCode, mode: 'insensitive' },
    });
  }
  whereClause.AND.push({
    OR: [
      { barcode: { equals: normalizedQuery, mode: 'insensitive' } },
      { sourceCode: { equals: normalizedQuery, mode: 'insensitive' } },
      { name: { contains: normalizedQuery, mode: 'insensitive' } },
      { barcode: { contains: normalizedQuery, mode: 'insensitive' } },
      { sourceCode: { contains: normalizedQuery, mode: 'insensitive' } },
    ],
  });

  const products = await prisma.product.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      sourceCode: true,
      barcode: true,
      price: true,
      stock: true,
      overrideActive: true,
      overrideStock: true,
      lowStockThreshold: true,
      category: true,
      branchCode: true,
      locationCode: true,
      isActive: true,
      enabled: true,
    },
    take: Math.max(1, Math.min(Number(take) || 20, 30)),
    orderBy: [
      { name: 'asc' },
    ],
  });

  const loweredQuery = normalizedQuery.toLowerCase();
  const scoreLocationPriority = (product) => {
    const code = normalizeScopeCode(product?.locationCode);
    if (code === normalizedLocationCode) return 0;
    if (!code) return 1;
    if (scopeCodes.includes(code)) return 2;
    return 3;
  };

  return products
    .map((product) => {
      const stockAwareProduct = enrichProductStock(product);
      return {
        ...stockAwareProduct,
        productCode: product.sourceCode,
        product_code: product.sourceCode,
        sellingPrice: Number(product.price || 0),
        selling_price: Number(product.price || 0),
        unitPrice: Number(product.price || 0),
        unit_price: Number(product.price || 0),
      };
    })
    .sort((a, b) => {
      const aExact = String(a.barcode || '').toLowerCase() === loweredQuery
        || String(a.sourceCode || '').toLowerCase() === loweredQuery;
      const bExact = String(b.barcode || '').toLowerCase() === loweredQuery
        || String(b.sourceCode || '').toLowerCase() === loweredQuery;

      if (aExact !== bExact) {
        return aExact ? -1 : 1;
      }

      const locationDelta = scoreLocationPriority(a) - scoreLocationPriority(b);
      if (locationDelta !== 0) {
        return locationDelta;
      }

      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

async function getGoodsIntakeLineStock({ branchCode, locationCode, locationId, productIds = [] }) {
  const normalizedLocationCode = normalizeScopeCode(locationCode);
  const normalizedBranchCode = branchCode ? String(branchCode).trim().toUpperCase() : null;
  const ids = Array.from(new Set((Array.isArray(productIds) ? productIds : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)));

  if (!normalizedLocationCode || ids.length === 0) {
    return [];
  }

  const scopeWhere = buildProductScopeWhere(normalizedLocationCode);
  const whereClause = { AND: [scopeWhere, { id: { in: ids } }] };
  
  // For ambiguous location codes, use branchCode for disambiguation
  if (normalizedBranchCode && normalizedLocationCode === 'SH') {
    whereClause.AND.push({
      branchCode: { equals: normalizedBranchCode, mode: 'insensitive' },
    });
  }

  const products = await prisma.product.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      sourceCode: true,
      barcode: true,
      price: true,
      stock: true,
      overrideActive: true,
      overrideStock: true,
      lowStockThreshold: true,
      branchCode: true,
      locationCode: true,
      enabled: true,
      isActive: true,
    },
  });

  return products.map((product) => {
    const stockAwareProduct = enrichProductStock(product);
    return {
      id: stockAwareProduct.id,
      productId: stockAwareProduct.id,
      productCode: stockAwareProduct.sourceCode,
      barcode: stockAwareProduct.barcode,
      effectiveStock: stockAwareProduct.effectiveStock,
      effective_stock: stockAwareProduct.effective_stock,
      stockStatus: stockAwareProduct.stockStatus,
      stock_status: stockAwareProduct.stock_status,
      locationCode: stockAwareProduct.locationCode,
      branchCode: stockAwareProduct.branchCode,
      syncedAt: new Date().toISOString(),
    };
  });
}

async function syncGoodsIntakeSellingPrices({ goodsIntakeId, items = [], locationCode = null, createdBy = null, source = 'goodsIntake.save' }) {
  const candidateMap = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const productId = Number(item?.productId);
    const sellingPrice = item?.sellingPrice == null || item?.sellingPrice === '' ? null : roundMoney(item.sellingPrice);

    if (!Number.isFinite(productId) || productId <= 0) continue;
    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) continue;

    candidateMap.set(productId, sellingPrice);
  }

  console.log('[GOODS INTAKE PRICE SYNC] syncGoodsIntakeSellingPrices called:', {
    goodsIntakeId,
    locationCode,
    candidateCount: candidateMap.size,
  });

  if (candidateMap.size === 0) {
    console.log('[GOODS INTAKE PRICE SYNC] No candidates to sync');
    return { attempted: 0, updated: 0, queued: 0, failed: 0 };
  }

  const products = await prisma.product.findMany({
    where: { id: { in: Array.from(candidateMap.keys()) } },
    select: {
      id: true,
      name: true,
      sourceCode: true,
      barcode: true,
      price: true,
      branchCode: true,
      locationCode: true,
    },
  });

  console.log('[GOODS INTAKE PRICE SYNC] Found products:', {
    count: products.length,
    products: products.map(p => ({ id: p.id, code: p.sourceCode, price: p.price })),
  });

  let updated = 0;
  let queued = 0;
  let failed = 0;

  for (const product of products) {
    const newPrice = candidateMap.get(Number(product.id));
    const oldPrice = roundMoney(product.price);
    const resolvedPosCode = resolveGoodsIntakePosProductCode(product);

    console.log('[GOODS INTAKE PRICE SYNC] Processing product:', {
      productId: product.id,
      sourceCode: product.sourceCode,
      barcode: product.barcode,
      resolvedPosCode,
      oldPrice,
      newPrice,
      unchanged: newPrice === oldPrice,
    });

    if (!Number.isFinite(newPrice) || newPrice <= 0 || newPrice === oldPrice) {
      console.log('[GOODS INTAKE PRICE SYNC] Skipping product (no valid price change):', {
        productId: product.id,
      });
      continue;
    }

    await prisma.product.update({
      where: { id: product.id },
      data: { price: newPrice },
    });
    updated += 1;
    console.log('[GOODS INTAKE PRICE SYNC] Updated product price in DB:', {
      productId: product.id,
      newPrice,
    });

    if (!resolvedPosCode) {
      console.log('[GOODS INTAKE PRICE SYNC] Skipping POS sync (no POS product code):', {
        productId: product.id,
      });
      continue;
    }

    try {
      await updateCachedProductPrice(resolvedPosCode, newPrice);
    } catch (cacheError) {
      console.warn('[GOODS INTAKE PRICE SYNC] Cache update failed (non-fatal):', {
        productCode: resolvedPosCode,
        error: cacheError.message,
      });
    }

    const scope = buildGoodsIntakePriceWritebackScope(product, locationCode);
    console.log('[GOODS INTAKE PRICE SYNC] Built writeback scope:', {
      productId: product.id,
      scope,
    });

    try {
      console.log('[POS COMMAND QUEUE] enqueue UPDATE_PRICE start (from goods intake)');
      const payload = {
        productId: String(product.id),
        productCode: resolvedPosCode,
        productName: String(product.name || '').trim() || null,
        newPrice,
        oldPrice,
        requestedLocationCode: scope.requestedLocationCode,
        locationCode: scope.locationCode,
        branchCode: scope.branchCode,
        priceTypeCode: scope.priceTypeCode,
      };
      console.log('[POS COMMAND QUEUE] enqueue payload:', payload);

      const queuedCommand = await posCommandQueueService.enqueueCommand('UPDATE_PRICE', payload, {
        source,
        relatedEntityType: 'GoodsIntake',
        relatedEntityId: goodsIntakeId,
        createdBy,
      });

      queued += 1;
      console.log('[POS COMMAND QUEUE] UPDATE_PRICE queued (goods intake):', {
        commandId: queuedCommand.id,
        productCode: payload.productCode,
        locationCode: payload.locationCode,
        branchCode: payload.branchCode,
      });
    } catch (queueErr) {
      failed += 1;
      console.error('[POS COMMAND QUEUE ERROR] enqueue UPDATE_PRICE failed (goods intake):', {
        productId: product.id,
        productCode: resolvedPosCode,
        error: queueErr.message,
        stack: queueErr.stack,
      });
    }
  }

  console.log('[GOODS INTAKE PRICE SYNC] Completed:', {
    attempted: candidateMap.size,
    updated,
    queued,
    failed,
  });

  return {
    attempted: candidateMap.size,
    updated,
    queued,
    failed,
  };
}

async function createGoodsIntake(payload) {
  const items = payload.items.map(buildLineItem).filter((line) => line.productName);
  const totals = computeTotals(items);

  return prisma.$transaction(async (tx) => {
    let intakeRef = generateIntakeRef();
    for (let i = 0; i < 6; i += 1) {
      const existing = await tx.goodsIntake.findUnique({ where: { intakeRef } });
      if (!existing) break;
      intakeRef = generateIntakeRef();
    }

    return tx.goodsIntake.create({
      data: {
        intakeRef,
        ...shapeHeader(payload),
        ...totals,
        items: {
          create: items,
        },
      },
      include: includeShape(),
    });
  });
}

async function updateGoodsIntake(id, payload) {
  const items = payload.items.map(buildLineItem).filter((line) => line.productName);
  const totals = computeTotals(items);

  return prisma.$transaction(async (tx) => {
    await tx.goodsIntake.update({
      where: { id },
      data: {
        ...shapeHeader(payload),
        ...totals,
      },
    });

    await tx.goodsIntakeItem.deleteMany({ where: { goodsIntakeId: id } });

    if (items.length > 0) {
      await tx.goodsIntakeItem.createMany({
        data: items.map((line) => ({
          goodsIntakeId: id,
          ...line,
        })),
      });
    }

    return tx.goodsIntake.findUnique({
      where: { id },
      include: includeShape(),
    });
  });
}

async function deleteGoodsIntake(id) {
  return prisma.goodsIntake.delete({ where: { id } });
}

async function getGoodsIntakeById(id) {
  const record = await prisma.goodsIntake.findUnique({
    where: { id },
    include: includeShape(),
  });

  if (!record) return null;
  const [transferEnriched] = await attachTransferCommandMetadata([record]);
  const [priceEnriched] = await attachPriceSyncCommandMetadata([transferEnriched]);
  return priceEnriched;
}

async function listGoodsIntakes({ filters, skip, take, sortBy, sortOrder }) {
  const where = toWhereFilters(filters);
  const [data, total] = await Promise.all([
    prisma.goodsIntake.findMany({
      where,
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            supplierCode: true,
          },
        },
        _count: {
          select: { items: true },
        },
      },
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.goodsIntake.count({ where }),
  ]);

  const transferEnrichedData = await attachTransferCommandMetadata(data);
  const enrichedData = await attachPriceSyncCommandMetadata(transferEnrichedData);

  return { data: enrichedData, total, where };
}

module.exports = {
  createGoodsIntake,
  updateGoodsIntake,
  deleteGoodsIntake,
  getGoodsIntakeById,
  listGoodsIntakes,
  lookupGoodsIntakeProducts,
  getGoodsIntakeLineStock,
  syncGoodsIntakeSellingPrices,
};
