/**
 * BACKEND ALIGNMENT VALIDATOR
 * Ensures frontend strictly follows the backendContract.md
 * 
 * Use this to validate API payloads before/after calls
 */

/**
 * Validates required fields are present and not empty
 * @param {object} data - Data to validate
 * @param {array} requiredFields - Array of field names that MUST be present
 * @returns {object} { isValid: boolean, errors: array }
 */
export const validateRequired = (data, requiredFields) => {
  const errors = [];

  requiredFields.forEach((field) => {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      errors.push(`Required field missing: ${field}`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validates that response includes expected fields
 * @param {object} response - API response data
 * @param {array} expectedFields - Expected field names
 * @returns {object} { isValid: boolean, missing: array }
 */
export const validateResponseSchema = (response, expectedFields) => {
  const missing = [];

  expectedFields.forEach((field) => {
    if (!(field in response)) {
      missing.push(field);
    }
  });

  return {
    isValid: missing.length === 0,
    missing,
  };
};

/**
 * Ensures no unauthorized field manipulation
 * Fields that MUST NEVER be set by frontend:
 * - id, userId, createdAt, updatedAt
 * - role, status, paymentStatus, driverId (unless specified)
 */
export const validateNoForbiddenFields = (data, forbiddenFields) => {
  const found = [];

  forbiddenFields.forEach((field) => {
    if (field in data) {
      found.push(field);
    }
  });

  if (found.length > 0) {
    console.warn('⚠️  ALIGNMENT VIOLATION: Attempting to set forbidden fields:', found);
  }

  return {
    isValid: found.length === 0,
    forbiddenFound: found,
  };
};

/**
 * USER VALIDATION
 */
export const userValidation = {
  // Register payload validation
  registerRequired: ['name', 'email', 'password'],
  registerForbidden: ['id', 'role', 'createdAt', 'updatedAt', 'isActive'],
  
  // Login payload validation
  loginRequired: ['email', 'password'],
  loginForbidden: ['id', 'role', 'createdAt'],

  validateRegister(data) {
    const required = validateRequired(data, this.registerRequired);
    const forbidden = validateNoForbiddenFields(data, this.registerForbidden);
    
    return {
      isValid: required.isValid && forbidden.isValid,
      errors: [...required.errors, ...forbidden.forbiddenFound.map(f => `Forbidden field: ${f}`)],
    };
  },

  validateLogin(data) {
    const required = validateRequired(data, this.loginRequired);
    const forbidden = validateNoForbiddenFields(data, this.loginForbidden);
    
    return {
      isValid: required.isValid && forbidden.isValid,
      errors: [...required.errors, ...forbidden.forbiddenFound.map(f => `Forbidden field: ${f}`)],
    };
  },
};

/**
 * PRODUCT VALIDATION
 */
export const productValidation = {
  listExpected: ['id', 'name', 'price', 'stock', 'category', 'imageUrl'],
  detailExpected: ['id', 'name', 'price', 'stock', 'category', 'imageUrl', 'createdAt', 'updatedAt'],
  
  validateList(products) {
    if (!Array.isArray(products)) {
      return { isValid: false, error: 'Products must be an array' };
    }

    const schemaErrors = [];
    products.forEach((product, index) => {
      const result = validateResponseSchema(product, this.listExpected);
      if (!result.isValid) {
        schemaErrors.push(`Product ${index} missing fields: ${result.missing.join(', ')}`);
      }
    });

    return {
      isValid: schemaErrors.length === 0,
      errors: schemaErrors,
    };
  },
};

/**
 * ORDER VALIDATION
 */
export const orderValidation = {
  createRequired: ['deliveryAddress', 'houseNumber'],
  createForbidden: ['id', 'userId', 'status', 'paymentStatus', 'driverId', 'total', 'items', 'createdAt'],
  
  validateCreate(data) {
    const required = validateRequired(data, this.createRequired);
    const forbidden = validateNoForbiddenFields(data, this.createForbidden);
    
    // Latitude/longitude optional but if provided, should be numbers
    if (data.latitude !== undefined && typeof data.latitude !== 'number') {
      forbidden.forbiddenFound.push('latitude must be a number');
    }
    if (data.longitude !== undefined && typeof data.longitude !== 'number') {
      forbidden.forbiddenFound.push('longitude must be a number');
    }

    return {
      isValid: required.isValid && forbidden.isValid,
      errors: [...required.errors, ...forbidden.forbiddenFound],
    };
  },
};

/**
 * CART VALIDATION
 */
export const cartValidation = {
  addToCartRequired: ['productId', 'quantity'],
  addToCartForbidden: ['id', 'cartId', 'createdAt'],
  
  validateAddToCart(data) {
    const required = validateRequired(data, this.addToCartRequired);
    const forbidden = validateNoForbiddenFields(data, this.addToCartForbidden);
    
    // Quantity must be > 0
    if (data.quantity !== undefined && data.quantity <= 0) {
      required.errors.push('Quantity must be greater than 0');
    }

    return {
      isValid: required.isValid && forbidden.isValid,
      errors: [...required.errors, ...forbidden.forbiddenFound],
    };
  },
};

/**
 * DRIVER VALIDATION
 */
export const driverValidation = {
  createRequired: ['name', 'phone'],
  createForbidden: ['id', 'createdAt'],
  
  validateCreate(data) {
    const required = validateRequired(data, this.createRequired);
    const forbidden = validateNoForbiddenFields(data, this.createForbidden);
    
    return {
      isValid: required.isValid && forbidden.isValid,
      errors: [...required.errors, ...forbidden.forbiddenFound],
    };
  },
};

export default {
  validateRequired,
  validateResponseSchema,
  validateNoForbiddenFields,
  userValidation,
  productValidation,
  orderValidation,
  cartValidation,
  driverValidation,
};
