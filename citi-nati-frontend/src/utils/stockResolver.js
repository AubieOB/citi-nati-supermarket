export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value) => value === true || value === 'true';

export const resolvePosStock = (product) => {
  if (!product) return 0;
  if (product.posStock != null) return toFiniteNumber(product.posStock, 0);
  if (product.pos_stock != null) return toFiniteNumber(product.pos_stock, 0);
  return toFiniteNumber(product.stock, 0);
};

export const resolveEffectiveStock = (product) => {
  if (!product) return 0;

  const overrideActive = toBool(product.overrideActive) || toBool(product.override_active);
  const overrideStock = product.overrideStock != null ? product.overrideStock : product.override_stock;

  if (overrideActive && overrideStock != null) {
    return toFiniteNumber(overrideStock, 0);
  }

  if (product.effectiveStock != null) return toFiniteNumber(product.effectiveStock, 0);
  if (product.effective_stock != null) return toFiniteNumber(product.effective_stock, 0);

  return resolvePosStock(product);
};

export const resolveLowStockThreshold = (product) => {
  if (!product) return DEFAULT_LOW_STOCK_THRESHOLD;

  const rawThreshold = product.lowStockThreshold != null
    ? product.lowStockThreshold
    : product.low_stock_threshold;

  if (rawThreshold == null) return DEFAULT_LOW_STOCK_THRESHOLD;

  const parsed = parseInt(rawThreshold, 10);
  if (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_LOW_STOCK_THRESHOLD;

  return parsed;
};

export const resolveStockStatus = (product) => {
  const effectiveStock = resolveEffectiveStock(product);
  const threshold = resolveLowStockThreshold(product);

  if (effectiveStock <= 0) return 'out_of_stock';
  if (effectiveStock <= threshold) return 'low_stock';
  return 'in_stock';
};

export const enrichProductStock = (product) => {
  const posStock = resolvePosStock(product);
  const effectiveStock = resolveEffectiveStock(product);
  const lowStockThreshold = resolveLowStockThreshold(product);
  const stockStatus = resolveStockStatus(product);

  const overrideActive = toBool(product?.overrideActive) || toBool(product?.override_active);
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
};
