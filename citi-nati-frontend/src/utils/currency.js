/**
 * MALAWI KWACHA (MWK) CURRENCY FORMATTING
 * Single source of truth for all price formatting
 * 
 * RULE: All prices MUST be displayed as "MWK X,XXX"
 * NO USD, NO floating decimals unless backend provides them
 */

/**
 * Format number as MWK currency
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string (e.g., "MWK 12,500")
 */
export const formatMWK = (amount) => {
  if (amount === null || amount === undefined) {
    return 'MWK 0';
  }

  // Ensure it's a number
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) {
    return 'MWK 0';
  }

  // Use Intl.NumberFormat for proper Malawi locale formatting
  const formatter = new Intl.NumberFormat('en-MW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return `MWK ${formatter.format(numAmount)}`;
};

/**
 * Format number as MWK without "MWK" prefix (for display in tables)
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency (e.g., "12,500")
 */
export const formatMWKNumber = (amount) => {
  if (amount === null || amount === undefined) {
    return '0';
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) {
    return '0';
  }

  const formatter = new Intl.NumberFormat('en-MW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return formatter.format(numAmount);
};

/**
 * Convert MWK string to number
 * @param {string} mwkString - String like "MWK 12,500"
 * @returns {number} Parsed amount
 */
export const parseMWK = (mwkString) => {
  if (!mwkString) return 0;
  return parseFloat(mwkString.replace(/[^0-9.-]/g, ''));
};

export default {
  formatMWK,
  formatMWKNumber,
  parseMWK,
};
