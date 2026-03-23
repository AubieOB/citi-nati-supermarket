const DEFAULT_LOW_STOCK_THRESHOLD = 10;

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value) {
  return value === true || value === 'true';
}

function resolvePosStock(product) {
  if (!product) return 0;
  if (product.posStock != null) return toFiniteNumber(product.posStock, 0);
  if (product.pos_stock != null) return toFiniteNumber(product.pos_stock, 0);
  return toFiniteNumber(product.stock, 0);
}

function resolveEffectiveStock(product) {
  if (!product) return 0;

  const overrideActive = toBoolean(product.overrideActive) || toBoolean(product.override_active);
  const overrideStockRaw = product.overrideStock != null ? product.overrideStock : product.override_stock;

  if (overrideActive && overrideStockRaw != null) {
    return toFiniteNumber(overrideStockRaw, 0);
  }

  if (product.effectiveStock != null) return toFiniteNumber(product.effectiveStock, 0);
  if (product.effective_stock != null) return toFiniteNumber(product.effective_stock, 0);

  return resolvePosStock(product);
}

function resolveLowStockThreshold(product) {
  if (!product) return DEFAULT_LOW_STOCK_THRESHOLD;

  const thresholdRaw = product.lowStockThreshold != null
    ? product.lowStockThreshold
    : product.low_stock_threshold;

  if (thresholdRaw == null) return DEFAULT_LOW_STOCK_THRESHOLD;

  const parsed = parseInt(thresholdRaw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return DEFAULT_LOW_STOCK_THRESHOLD;
  }

  return parsed;
}

function resolveStockStatus(product) {
  const effectiveStock = resolveEffectiveStock(product);
  const lowStockThreshold = resolveLowStockThreshold(product);

  if (effectiveStock <= 0) return 'out_of_stock';
  if (effectiveStock <= lowStockThreshold) return 'low_stock';
  return 'in_stock';
}

function enrichProductStock(product) {
  const posStock = resolvePosStock(product);
  const effectiveStock = resolveEffectiveStock(product);
  const lowStockThreshold = resolveLowStockThreshold(product);
  const stockStatus = resolveStockStatus(product);

  const overrideActive = toBoolean(product?.overrideActive) || toBoolean(product?.override_active);
  const overrideStock = product?.overrideStock != null ? product.overrideStock : (product?.override_stock ?? null);

  return {
    ...product,
    posStock,
    pos_stock: posStock,
    overrideActive,
    override_active: overrideActive,
    overrideStock,
    override_stock: overrideStock,
    effectiveStock,
    effective_stock: effectiveStock,
    lowStockThreshold,
    low_stock_threshold: lowStockThreshold,
    stockStatus,
    stock_status: stockStatus,
  };
}

module.exports = {
  DEFAULT_LOW_STOCK_THRESHOLD,
  resolvePosStock,
  resolveEffectiveStock,
  resolveLowStockThreshold,
  resolveStockStatus,
  enrichProductStock,
};
