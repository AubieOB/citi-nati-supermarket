/**
 * HYBRID EXPIRY ALERT SYSTEM
 * 
 * Computes expiryStatus dynamically based on expiryDate
 * This status is NOT stored in DB - calculated on every request
 */

/**
 * Calculate days remaining until expiry
 * @param {Date} expiryDate - Expiry date from database
 * @returns {number} Days remaining (negative if expired)
 */
const calculateDaysRemaining = (expiryDate) => {
  if (!expiryDate) return null;
  
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffMs = expiry - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  return diffDays;
};

/**
 * Compute expiryStatus dynamically
 * 
 * Status levels (in order of severity):
 * - null: No expiry date set
 * - "2_months_warning": 31-60 days remaining
 * - "1_month_warning": 16-30 days remaining
 * - "2_weeks_warning": 8-14 days remaining
 * - "1_week_warning": 1-7 days remaining
 * - "expired": 0 or fewer days remaining
 * 
 * @param {Date|null} expiryDate - Expiry date from product
 * @returns {Object} { status, daysRemaining, message }
 */
const computeExpiryStatus = (expiryDate) => {
  if (!expiryDate) {
    return {
      status: null,
      daysRemaining: null,
      message: null
    };
  }

  const daysRemaining = calculateDaysRemaining(expiryDate);

  let status, message;

  if (daysRemaining <= 0) {
    status = 'expired';
    message = '❌ Product expired';
  } else if (daysRemaining <= 7) {
    status = '1_week_warning';
    message = `⚠ Expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`;
  } else if (daysRemaining <= 14) {
    status = '2_weeks_warning';
    message = '⚠ Expires in 2 weeks';
  } else if (daysRemaining <= 30) {
    status = '1_month_warning';
    message = '⚠ Expires in 1 month';
  } else if (daysRemaining <= 60) {
    status = '2_months_warning';
    message = '⚠ Expires in 2 months';
  }

  return {
    status,
    daysRemaining,
    message
  };
};

/**
 * Suggest discount for expiring products
 * Only applies to products nearing expiry AND not already on sale
 * 
 * @param {Object} product - Product object with expiryStatus
 * @returns {Object|null} Suggestion or null
 */
const suggestDiscount = (product) => {
  // No suggestion if already on sale or no expiry date
  if (product.isOnSale || !product.expiryStatus?.status) {
    return null;
  }

  const { status } = product.expiryStatus;

  if (status === '2_weeks_warning') {
    return {
      suggestedDiscount: 0.10, // 10%
      reason: 'Product expires in 2 weeks',
      discountedPrice: product.price * 0.9,
      message: '💡 Suggest 10% discount to move stock'
    };
  } else if (status === '1_week_warning') {
    return {
      suggestedDiscount: 0.20, // 20%
      reason: 'Product expires in 1 week',
      discountedPrice: product.price * 0.8,
      message: '💡 Suggest 20% discount to clear stock'
    };
  }

  return null;
};

module.exports = {
  calculateDaysRemaining,
  computeExpiryStatus,
  suggestDiscount
};
