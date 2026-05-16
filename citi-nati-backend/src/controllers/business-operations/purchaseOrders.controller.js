'use strict';

const purchaseOrdersService = require('../../services/business-operations/purchaseOrders.service');
const {
  parsePagination,
  parseSort,
  requiredString,
  toInt,
  toDate,
  listResponse,
} = require('../../utils/business-operations/common');

const PURCHASE_ORDER_SORT_FIELDS = new Set(['id', 'purchaseDate', 'expectedDeliveryDate', 'status', 'totalCost', 'createdAt', 'updatedAt']);
const PURCHASE_ORDER_STATUSES = new Set(['draft', 'printed', 'submitted']);

async function createPurchaseOrder(req, res) {
  try {
    // Minimal payload for purchase order sheet
    const status = req.body.status ? String(req.body.status).trim().toLowerCase() : 'draft';
    const locationId = req.body.locationId !== undefined ? toInt(req.body.locationId) : undefined;
    const payload = {
      purchaseOrderRef: req.body.purchaseOrderRef,
      branchCode: req.body.branchCode,
      locationId,
      locationCode: req.body.locationCode,
      locationName: req.body.locationName,
      enteredBy: req.user?.email || req.user?.name || null,
      status: PURCHASE_ORDER_STATUSES.has(status) ? status : 'draft',
      notes: req.body.notes,
      items: Array.isArray(req.body.items) ? req.body.items : [],
    };

    const order = await purchaseOrdersService.createPurchaseOrder(payload);
    return res.status(201).json({ success: true, data: order });
  } catch (err) {
    console.error('[PURCHASE_ORDER_SAVE_ERROR] createPurchaseOrder request body:', JSON.stringify(req.body));
    console.error('[PURCHASE_ORDER_SAVE_ERROR] createPurchaseOrder payload:', JSON.stringify({
      purchaseOrderRef: req.body.purchaseOrderRef,
      branchCode: req.body.branchCode,
      locationId: req.body.locationId,
      locationCode: req.body.locationCode,
      locationName: req.body.locationName,
      status: req.body.status,
      notes: req.body.notes,
      items: Array.isArray(req.body.items) ? req.body.items : [],
    }));
    console.error('[PURCHASE_ORDER_SAVE_ERROR] createPurchaseOrder error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create purchase order' });
  }
}

async function updatePurchaseOrder(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid purchase order id' });
    const status = req.body.status !== undefined ? String(req.body.status).trim().toLowerCase() : undefined;
    const locationId = req.body.locationId !== undefined ? toInt(req.body.locationId) : undefined;
    const payload = {
      purchaseOrderRef: req.body.purchaseOrderRef,
      branchCode: req.body.branchCode,
      locationId,
      locationCode: req.body.locationCode,
      locationName: req.body.locationName,
      enteredBy: req.user?.email || req.user?.name || null,
      status: status && PURCHASE_ORDER_STATUSES.has(status) ? status : undefined,
      notes: req.body.notes,
      items: Array.isArray(req.body.items) ? req.body.items : undefined,
    };

    const order = await purchaseOrdersService.updatePurchaseOrder(id, payload);
    return res.json({ success: true, data: order });
  } catch (err) {
    console.error('[PURCHASE_ORDER_SAVE_ERROR] updatePurchaseOrder request body:', JSON.stringify(req.body));
    console.error('[PURCHASE_ORDER_SAVE_ERROR] updatePurchaseOrder error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update purchase order' });
  }
}

async function deletePurchaseOrder(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid purchase order id' });

    await purchaseOrdersService.deletePurchaseOrder(id);
    return res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('[BO][PURCHASE_ORDERS] deletePurchaseOrder error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete purchase order' });
  }
}

async function getPurchaseOrderById(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid purchase order id' });

    const order = await purchaseOrdersService.getPurchaseOrderById(id);
    if (!order) return res.status(404).json({ success: false, error: 'Purchase order not found' });

    return res.json({ success: true, data: order });
  } catch (err) {
    console.error('[BO][PURCHASE_ORDERS] getPurchaseOrderById error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch purchase order' });
  }
}

async function listPurchaseOrders(req, res) {
  try {
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, PURCHASE_ORDER_SORT_FIELDS, 'purchaseDate', 'desc');
    if (sort.error) return res.status(400).json({ success: false, error: sort.error });

    const search = req.query.search ? String(req.query.search).trim() : null;
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;
    const branchCode = req.query.branchCode ? String(req.query.branchCode).trim().toUpperCase() : null;
    const locationCode = req.query.locationCode ? String(req.query.locationCode).trim().toUpperCase() : null;
    const locationId = toInt(req.query.locationId);
    const startDate = req.query.startDate ? toDate(req.query.startDate) : null;
    const endDate = req.query.endDate ? toDate(req.query.endDate) : null;

    const { data, total } = await purchaseOrdersService.listPurchaseOrders({
      filters: {
        search,
        status,
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
      filters: { search, status, branchCode, locationCode, locationId, startDate, endDate },
    }));
  } catch (err) {
    console.error('[BO][PURCHASE_ORDERS] listPurchaseOrders error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list purchase orders' });
  }
}

module.exports = {
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrderById,
  listPurchaseOrders,
};
