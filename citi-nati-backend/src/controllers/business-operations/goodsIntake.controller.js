'use strict';

const goodsIntakeService = require('../../services/business-operations/goodsIntake.service');
const goodsIntakePosTransferService = require('../../services/business-operations/goodsIntakePosTransfer.service');
const { isZombaLocationCode } = goodsIntakePosTransferService;
const {
  parsePagination,
  parseSort,
  requiredString,
  toInt,
  toNumber,
  toDate,
  listResponse,
} = require('../../utils/business-operations/common');

const GOODS_INTAKE_SORT_FIELDS = new Set(['id', 'purchaseDate', 'status', 'totalCost', 'createdAt', 'updatedAt']);

function parseItems(items) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    barcode: item.barcode,
    productId: item.productId ? toInt(item.productId) : null,
    productName: String(item.productName || '').trim(),
    quantity: toNumber(item.quantity, 0),
    unitCost: toNumber(item.unitCost, 0),
    sellingPrice: item.sellingPrice === '' || item.sellingPrice === undefined || item.sellingPrice === null
      ? null
      : toNumber(item.sellingPrice, null),
    expiryDate: item.expiryDate ? toDate(item.expiryDate) : null,
    batchRef: item.batchRef,
    lineNotes: item.lineNotes,
  }));
}

function normalizePayload(req) {
  return {
    supplierId: req.body.supplierId ? toInt(req.body.supplierId) : null,
    manualSupplierName: req.body.manualSupplierName ? String(req.body.manualSupplierName).trim() : null,
    supplierStoreRef: req.body.supplierStoreRef ? String(req.body.supplierStoreRef).trim() : null,
    purchaseDate: toDate(req.body.purchaseDate),
    receiptReference: req.body.receiptReference ? String(req.body.receiptReference).trim() : null,
    locationId: req.body.locationId ? toInt(req.body.locationId) : null,
    branchCode: req.body.branchCode ? String(req.body.branchCode).trim() : null,
    locationCode: req.body.locationCode ? String(req.body.locationCode).trim() : null,
    locationName: req.body.locationName ? String(req.body.locationName).trim() : null,
    overallNotes: req.body.overallNotes ? String(req.body.overallNotes).trim() : null,
    receiptTotalAmount: req.body.receiptTotalAmount == null ? null : toNumber(req.body.receiptTotalAmount, null),
    status: req.body.status,
    enteredBy: req.user?.email || req.user?.name || req.user?.userId || null,
    items: parseItems(req.body.items),
  };
}

function validatePayload(payload) {
  if (!payload.purchaseDate) return 'purchaseDate is required and must be valid';
  if (!payload.supplierId && !payload.manualSupplierName) return 'Select a supplier or enter a manual supplier name';
  if (!Array.isArray(payload.items) || payload.items.length === 0) return 'At least one line item is required';

  for (const [index, item] of payload.items.entries()) {
    const rowLabel = `Line ${index + 1}`;
    if (!item.productName) return `${rowLabel}: productName is required`;
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) return `${rowLabel}: quantity must be greater than 0`;
    if (!Number.isFinite(item.unitCost) || item.unitCost < 0) return `${rowLabel}: unitCost must be 0 or greater`;
  }

  return null;
}

async function createGoodsIntake(req, res) {
  try {
    const payload = normalizePayload(req);
    const validationError = validatePayload(payload);
    if (validationError) return res.status(400).json({ success: false, error: validationError });

    const created = await goodsIntakeService.createGoodsIntake(payload);
    let priceSync = { attempted: 0, updated: 0, queued: 0, failed: 0 };

    try {
      priceSync = await goodsIntakeService.syncGoodsIntakeSellingPrices({
        goodsIntakeId: created.id,
        items: payload.items,
        locationCode: payload.locationCode,
        createdBy: payload.enteredBy,
        source: 'goodsIntake.createGoodsIntake',
      });
    } catch (priceSyncError) {
      console.error('[BO][GOODS_INTAKE] create price sync error:', priceSyncError);
    }

    return res.status(201).json({ success: true, data: created, priceSync });
  } catch (error) {
    console.error('[BO][GOODS_INTAKE] create error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create goods intake record' });
  }
}

async function updateGoodsIntake(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid goods intake id' });

    const payload = normalizePayload(req);
    const validationError = validatePayload(payload);
    if (validationError) return res.status(400).json({ success: false, error: validationError });

    const updated = await goodsIntakeService.updateGoodsIntake(id, payload);
    let priceSync = { attempted: 0, updated: 0, queued: 0, failed: 0 };

    try {
      priceSync = await goodsIntakeService.syncGoodsIntakeSellingPrices({
        goodsIntakeId: id,
        items: payload.items,
        locationCode: payload.locationCode,
        createdBy: payload.enteredBy,
        source: 'goodsIntake.updateGoodsIntake',
      });
    } catch (priceSyncError) {
      console.error('[BO][GOODS_INTAKE] update price sync error:', priceSyncError);
    }

    return res.json({ success: true, data: updated, priceSync });
  } catch (error) {
    console.error('[BO][GOODS_INTAKE] update error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update goods intake record' });
  }
}

async function deleteGoodsIntake(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid goods intake id' });
    await goodsIntakeService.deleteGoodsIntake(id);
    return res.json({ success: true });
  } catch (error) {
    console.error('[BO][GOODS_INTAKE] delete error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete goods intake record' });
  }
}

async function getGoodsIntakeById(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid goods intake id' });

    const record = await goodsIntakeService.getGoodsIntakeById(id);
    if (!record) return res.status(404).json({ success: false, error: 'Goods intake record not found' });

    return res.json({ success: true, data: record });
  } catch (error) {
    console.error('[BO][GOODS_INTAKE] get by id error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch goods intake record' });
  }
}

async function listGoodsIntakes(req, res) {
  try {
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, GOODS_INTAKE_SORT_FIELDS, 'purchaseDate', 'desc');
    if (sort.error) return res.status(400).json({ success: false, error: sort.error });

    const search = req.query.search ? String(req.query.search).trim() : null;
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;
    const supplierId = toInt(req.query.supplierId);
    const branchCode = req.query.branchCode ? String(req.query.branchCode).trim() : null;
    const locationCode = req.query.locationCode ? String(req.query.locationCode).trim() : null;
    const locationId = toInt(req.query.locationId);
    const startDate = req.query.startDate ? toDate(req.query.startDate) : null;
    const endDate = req.query.endDate ? toDate(req.query.endDate) : null;

    const { data, total } = await goodsIntakeService.listGoodsIntakes({
      filters: {
        search,
        status,
        supplierId,
        branchCode,
        locationCode,
        locationId,
        startDate,
        endDate,
      },
      skip: pagination.skip,
      take: pagination.take,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    });

    return res.json(listResponse({
      data,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      filters: { search, status, supplierId, branchCode, locationCode, locationId, startDate, endDate },
    }));
  } catch (error) {
    console.error('[BO][GOODS_INTAKE] list error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list goods intake records' });
  }
}

async function lookupGoodsIntakeProducts(req, res) {
  try {
    const query = String(req.query.q || req.query.search || '').trim();
    const branchCode = req.query.branchCode ? String(req.query.branchCode).trim() : null;
    const locationCode = req.query.locationCode ? String(req.query.locationCode).trim() : null;
    const locationId = req.query.locationId ? String(req.query.locationId).trim() : null;

    if (!query) {
      return res.json({ success: true, products: [] });
    }

    if (!locationCode) {
      return res.status(400).json({ success: false, error: 'locationCode is required for goods intake lookup' });
    }

    const products = await goodsIntakeService.lookupGoodsIntakeProducts({
      query,
      branchCode,
      locationCode,
      locationId,
      take: req.query.take,
    });

    return res.json({ success: true, products });
  } catch (error) {
    console.error('[BO][GOODS_INTAKE] lookup error:', error);
    return res.status(500).json({ success: false, error: 'Failed to lookup goods intake products' });
  }
}

async function getGoodsIntakeLineStock(req, res) {
  try {
    const branchCode = req.body?.branchCode ? String(req.body.branchCode).trim() : null;
    const locationCode = req.body?.locationCode ? String(req.body.locationCode).trim() : null;
    const locationId = req.body?.locationId ? String(req.body.locationId).trim() : null;
    const productIds = Array.isArray(req.body?.productIds) ? req.body.productIds : [];

    if (!locationCode) {
      return res.status(400).json({ success: false, error: 'locationCode is required for goods intake stock refresh' });
    }

    const lines = await goodsIntakeService.getGoodsIntakeLineStock({
      branchCode,
      locationCode,
      locationId,
      productIds,
    });

    return res.json({ success: true, lines });
  } catch (error) {
    console.error('[BO][GOODS_INTAKE] line stock refresh error:', error);
    return res.status(500).json({ success: false, error: 'Failed to refresh goods intake line stock' });
  }
}

async function transferToPOS(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid goods intake id' });

    // Determine which agent should handle this transfer based on the branch code.
    const rawBranchCode = String((req.body && req.body.branchCode) || '').trim().toUpperCase();
    const hintBranchCode = rawBranchCode === 'BT' ? 'BLANTYRE'
      : rawBranchCode === 'ZA' ? 'ZOMBA'
      : rawBranchCode;
    const useZomba = hintBranchCode === 'ZOMBA';

    const result = useZomba
      ? await goodsIntakePosTransferService.transferGoodsIntakeToZombaPosPending(id, {
          ...req.body,
          branchCode: hintBranchCode,
        })
      : await goodsIntakePosTransferService.transferGoodsIntakeToBlantyrePosPending(id, {
          ...req.body,
          branchCode: hintBranchCode,
        });
    if (!result.success) {
      const statusCode = result.alreadyTransferred ? 409 : 422;
      return res.status(statusCode).json({ success: false, error: result.error, grnNo: result.existingGrn });
    }
    return res.json({
      success: true,
      data: result.data,
      grnNo: result.grnNo,
      grnMode: result.grnMode,
      requestedGrn: result.requestedGrn,
      linesInserted: result.linesInserted,
      linesQueued: result.linesQueued,
      commandId: result.commandId,
    });
  } catch (error) {
    console.error('[BO][GOODS_INTAKE] transfer-to-pos error:', error);
    return res.status(500).json({ success: false, error: 'Failed to transfer goods intake to POS' });
  }
}

module.exports = {
  createGoodsIntake,
  updateGoodsIntake,
  deleteGoodsIntake,
  getGoodsIntakeById,
  listGoodsIntakes,
  lookupGoodsIntakeProducts,
  getGoodsIntakeLineStock,
  transferToPOS,
};
