const posSyncService = require('../services/posSync.service');
const posCommandQueueService = require('../services/posCommandQueue.service');

const VALID_EXPIRY_FILTERS = new Set(['expired', 'expiring']);
const VALID_EXPIRY_SOURCES = new Set(['view', 'stockdetails']);
const VALID_EXPIRY_DAYS = new Set([7, 14, 30]);

function normalizeExpiryFilter(value) {
  const filter = String(value || 'expiring').toLowerCase();
  return VALID_EXPIRY_FILTERS.has(filter) ? filter : 'expiring';
}

function normalizeExpirySource(value) {
  const source = String(value || 'view').toLowerCase();
  return VALID_EXPIRY_SOURCES.has(source) ? source : 'view';
}

function normalizeExpiryDays(value) {
  const parsed = parseInt(value, 10);
  return VALID_EXPIRY_DAYS.has(parsed) ? parsed : 7;
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
    const filter = normalizeExpiryFilter(req.query.filter);
    const source = normalizeExpirySource(req.query.source);
    const days = normalizeExpiryDays(req.query.days);

    const result = await posSyncService.getExpiryProductsFromPOS({ filter, days, source });

    if (!result.success) {
      return res.status(getPreviewFailureStatus(result.error)).json({
        success: false,
        error: result.error,
      });
    }

    const payload = result.data || {};
    console.log(`[EXPIRY] fetched ${payload.count || 0} expiring products`, {
      filter,
      days,
      source,
    });

    return res.json({
      success: true,
      filter: payload.filter || filter,
      days: payload.days || days,
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