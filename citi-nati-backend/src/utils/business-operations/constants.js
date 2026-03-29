'use strict';

const SUPPLIER_TRANSACTION_TYPES = new Set(['debt', 'payment', 'adjustment']);
const SUPPLIER_PAYMENT_METHODS = new Set(['cash', 'bank', 'mobile_money', 'capital_injection', 'other']);
const PAYROLL_MODES = new Set(['mid_month', 'full_month']);

const DEFAULT_EXPENSE_CATEGORIES = [
  { code: 'WATER', name: 'Water', description: 'Water bills and related costs' },
  { code: 'ELECTRICITY', name: 'Electricity', description: 'Power bills and utility costs' },
  { code: 'DSTV', name: 'DSTV', description: 'DSTV subscription and media costs' },
  { code: 'EXPIRED_DAMAGED', name: 'Expired/Damaged Products', description: 'Spoilage and damaged product costs' },
  { code: 'MBS_PENALTIES', name: 'MBS Penalties', description: 'Regulatory and penalty expenses' },
  { code: 'POS_LICENCE', name: 'POS Licence', description: 'POS license and software fees' },
  { code: 'UTILITIES', name: 'Utilities', description: 'Other utility expenses' },
  { code: 'OTHER_OPERATING', name: 'Other Operating Expenses', description: 'General operating expenses' },
];

module.exports = {
  SUPPLIER_TRANSACTION_TYPES,
  SUPPLIER_PAYMENT_METHODS,
  PAYROLL_MODES,
  DEFAULT_EXPENSE_CATEGORIES,
};
