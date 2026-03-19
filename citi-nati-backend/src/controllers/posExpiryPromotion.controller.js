const posSyncService = require('../services/posSync.service');
const posCommandQueueService = require('../services/posCommandQueue.service');

const VALID_EXPIRY_SOURCES = new Set(['view', 'stockdetails']);
const DEFAULT_EXPIRY_DAYS = 14;

function normalizeExpirySource(value) {
  const source = String(value || 'view').toLowerCase();
  return VALID_EXPIRY_SOURCES.has(source) ? source : 'view';
}

function normalizeExpiryDays(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_EXPIRY_DAYS;
}

function normalizeLocationCode(value) {
  const normalized = String(value || process.env.POS_LOCATION_CODE || 'SH').trim().toUpperCase();
  return normalized || 'SH';
}

function normalizeIncludeExpired(value, legacyFilter) {
  if (value != null) {
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return false;
    }
  }

  return String(legacyFilter || '').trim().toLowerCase() === 'expired';
}

function normalizeReasonCode(value) {
  const trimmed = String(value || '').trim();
  return trimmed || 'EXPIRY_CLEARANCE';
}

function getPreviewFailureStatus(errorMessage) {
  return String(errorMessage || '').includes('does not exist in POS') ? 404 : 502;
}

async function getExpiryCandidates(req, res) {
  try {
    console.log('[ADMIN EXPIRY] request start', {
      endpoint: '/api/admin/pos-expiry',
      query: req.query,
    });

    const days = normalizeExpiryDays(req.query.days);
    const locationCode = normalizeLocationCode(req.query.locationCode);
    const includeExpired = normalizeIncludeExpired(req.query.includeExpired, req.query.filter);
    const source = normalizeExpirySource(req.query.source);

    console.log('[ADMIN EXPIRY] agent call', {
      endpoint: '/api/admin/pos-expiry',
      days,
      locationCode,
      includeExpired,
      source,
    });

    const result = await posSyncService.getExpiryProductsFromPOS({ days, locationCode, includeExpired, source });

    if (!result.success) {
      return res.status(getPreviewFailureStatus(result.error)).json({
        success: false,
        error: result.error,
      });
    }

    const payload = result.data || {};
    console.log('[ADMIN EXPIRY] response count', {
      count: payload.count || 0,
      days,
      locationCode,
      includeExpired,
      source,
    });

    return res.json({
      success: true,
      days: payload.days || days,
      locationCode: payload.locationCode || locationCode,
      includeExpired: payload.includeExpired != null ? payload.includeExpired : includeExpired,
      source: payload.source || source,
      count: payload.count || 0,
      data: payload.data || [],
    });
  } catch (error) {
    console.error('[EXPIRY] backend fetch failed:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch expiry candidates',
    });
  }
}

async function previewPromotion(req, res) {
  try {
    const productCode = String(req.params.productCode || '').trim();
    const locationCode = String(req.query.locationCode || process.env.POS_LOCATION_CODE || 'SH').trim();
    const priceTypeCode = String(req.query.priceTypeCode || 'RT').trim();

    if (!productCode) {
      return res.status(400).json({
        success: false,
        error: 'productCode is required',
      });
    }

    const result = await posSyncService.previewPromotionPriceFromPOS(productCode, {
      locationCode,
      priceTypeCode,
    });

    if (!result.success) {
      return res.status(502).json({
        success: false,
        error: result.error,
      });
    }

    const payload = result.data || {};
    console.log(`[PROMO] current latest price = ${payload.latestPriceRow ? payload.latestPriceRow.price : 'N/A'}`);

    return res.json({
      success: true,
      productCode,
      locationCode,
      priceTypeCode,
      latestPriceRow: payload.latestPriceRow || null,
    });
  } catch (error) {
    console.error('[PROMO] backend preview failed:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to preview promotion price',
    });
  }
}

async function applyPromotion(req, res) {
  try {
    const productCode = String(req.body.productCode || '').trim();
    const promotionalPrice = Number(req.body.promotionalPrice);
    const locationCode = String(req.body.locationCode || process.env.POS_LOCATION_CODE || 'SH').trim();
    const priceTypeCode = String(req.body.priceTypeCode || 'RT').trim();
    const reasonCode = normalizeReasonCode(req.body.reasonCode);
    const updatePromotionalFlag = req.body.updatePromotionalFlag === true;

    if (!productCode) {
      return res.status(400).json({ success: false, error: 'productCode is required' });
    }

    if (!Number.isFinite(promotionalPrice) || promotionalPrice <= 0) {
      return res.status(400).json({ success: false, error: 'promotionalPrice must be greater than 0' });
    }

    console.log(`[PROMO] applying promotion for ProductCode ${productCode}`);

    const previewResult = await posSyncService.previewPromotionPriceFromPOS(productCode, {
      locationCode,
      priceTypeCode,
    });

    if (!previewResult.success) {
      return res.status(getPreviewFailureStatus(previewResult.error)).json({ success: false, error: previewResult.error });
    }

    const latestPriceRow = previewResult.data?.latestPriceRow || null;
    const currentLatestPrice = latestPriceRow ? Number(latestPriceRow.price) : null;

    console.log(`[PROMO] current latest price = ${currentLatestPrice == null ? 'N/A' : currentLatestPrice}`);
    console.log(`[PROMO] new promo price = ${promotionalPrice}`);

    if (currentLatestPrice != null && currentLatestPrice === promotionalPrice) {
      return res.status(400).json({
        success: false,
        error: 'promotionalPrice must differ from current latest price',
      });
    }

    const payload = {
      productCode,
      promotionalPrice,
      locationCode,
      priceTypeCode,
      reasonCode,
      updatePromotionalFlag,
    };

    console.log('[PROMO][BACKEND] queue APPLY_PROMOTION', {
      productCode,
      locationCode,
      priceTypeCode,
      promotionalPrice,
      reasonCode,
      updatePromotionalFlag,
    });

    const queued = await posCommandQueueService.enqueueCommand('APPLY_PROMOTION', payload, {
      source: 'admin.posExpiryPromotion.applyPromotion',
      relatedEntityType: 'POS_PRODUCT',
      relatedEntityId: productCode,
      createdBy: req.user?.email || String(req.user?.id || 'admin'),
    });

    return res.status(202).json({
      success: true,
      message: 'Promotion queued for POS write-back',
      commandId: queued.id,
      productCode,
      locationCode,
      priceTypeCode,
      currentLatestPrice,
      promotionalPrice,
      reasonCode,
      updatePromotionalFlag,
    });
  } catch (error) {
    console.error('[PROMO] backend apply failed:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to queue promotion write-back',
    });
  }
}

async function revertPromotion(req, res) {
  try {
    const productCode = String(req.body.productCode || '').trim();
    const locationCode = String(req.body.locationCode || process.env.POS_LOCATION_CODE || 'SH').trim();
    const priceTypeCode = String(req.body.priceTypeCode || 'RT').trim();
    const reasonCode = normalizeReasonCode(req.body.reasonCode);
    const updatePromotionalFlag = req.body.updatePromotionalFlag === true;
    const restorePrice = req.body.restorePrice == null ? null : Number(req.body.restorePrice);

    if (!productCode) {
      return res.status(400).json({ success: false, error: 'productCode is required' });
    }

    if (restorePrice != null && (!Number.isFinite(restorePrice) || restorePrice <= 0)) {
      return res.status(400).json({ success: false, error: 'restorePrice must be greater than 0 when provided' });
    }

    const previewResult = await posSyncService.previewPromotionPriceFromPOS(productCode, {
      locationCode,
      priceTypeCode,
    });

    if (!previewResult.success) {
      return res.status(getPreviewFailureStatus(previewResult.error)).json({ success: false, error: previewResult.error });
    }

    const latestPriceRow = previewResult.data?.latestPriceRow || null;
    const currentLatestPrice = latestPriceRow ? Number(latestPriceRow.price) : null;

    console.log(`[PROMO] applying revert for ProductCode ${productCode}`);
    console.log(`[PROMO] current latest price = ${currentLatestPrice == null ? 'N/A' : currentLatestPrice}`);

    if (restorePrice != null && currentLatestPrice != null && restorePrice === currentLatestPrice) {
      return res.status(400).json({
        success: false,
        error: 'restorePrice must differ from current latest price',
      });
    }

    const payload = {
      productCode,
      locationCode,
      priceTypeCode,
      restorePrice,
      reasonCode,
      updatePromotionalFlag,
    };

    console.log('[PROMO][BACKEND] queue REVERT_PROMOTION', {
      productCode,
      locationCode,
      priceTypeCode,
      restorePrice,
      reasonCode,
      updatePromotionalFlag,
    });

    const queued = await posCommandQueueService.enqueueCommand('REVERT_PROMOTION', payload, {
      source: 'admin.posExpiryPromotion.revertPromotion',
      relatedEntityType: 'POS_PRODUCT',
      relatedEntityId: productCode,
      createdBy: req.user?.email || String(req.user?.id || 'admin'),
    });

    return res.status(202).json({
      success: true,
      message: 'Promotion revert queued for POS write-back',
      commandId: queued.id,
      productCode,
      locationCode,
      priceTypeCode,
      currentLatestPrice,
      restorePrice,
      reasonCode,
      updatePromotionalFlag,
    });
  } catch (error) {
    console.error('[PROMO] backend revert failed:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to queue promotion revert',
    });
  }
}

module.exports = {
  getExpiryCandidates,
  previewPromotion,
  applyPromotion,
  revertPromotion,
};