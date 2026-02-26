/**
 * ORDER VALIDATION UTILITY
 * 
 * Validates order data according to backend contract
 * Only validates fields that frontend collects:
 * - deliveryAddress (required)
 * - houseNumber (required)
 * - phone (required)
 * - latitude (required)
 * - longitude (required)
 */

/**
 * Validate order creation form data
 * @param {object} formData - Form data to validate
 * @returns {object} - { isValid: boolean, errors: object }
 */
export const validateOrderCreate = (formData) => {
  const errors = {};

  // deliveryAddress validation
  if (!formData.deliveryAddress || formData.deliveryAddress.trim() === '') {
    errors.deliveryAddress = 'Delivery address is required';
  } else if (formData.deliveryAddress.trim().length < 3) {
    errors.deliveryAddress = 'Delivery address must be at least 3 characters';
  } else if (formData.deliveryAddress.trim().length > 255) {
    errors.deliveryAddress = 'Delivery address must not exceed 255 characters';
  }

  // houseNumber validation
  if (!formData.houseNumber || formData.houseNumber.trim() === '') {
    errors.houseNumber = 'House number is required';
  } else if (formData.houseNumber.trim().length < 1) {
    errors.houseNumber = 'House number is required';
  } else if (formData.houseNumber.trim().length > 50) {
    errors.houseNumber = 'House number must not exceed 50 characters';
  }

  // phone validation
  if (!formData.phone || formData.phone.trim() === '') {
    errors.phone = 'Phone number is required';
  } else if (formData.phone.trim().length < 7) {
    errors.phone = 'Phone number must be at least 7 characters';
  } else if (formData.phone.trim().length > 20) {
    errors.phone = 'Phone number must not exceed 20 characters';
  }

  // latitude validation (required)
  if (!formData.latitude || formData.latitude === '') {
    errors.latitude = 'Latitude is required';
  } else {
    const lat = parseFloat(formData.latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.latitude = 'Latitude must be between -90 and 90';
    }
  }

  // longitude validation (required)
  if (!formData.longitude || formData.longitude === '') {
    errors.longitude = 'Longitude is required';
  } else {
    const lon = parseFloat(formData.longitude);
    if (isNaN(lon) || lon < -180 || lon > 180) {
      errors.longitude = 'Longitude must be between -180 and 180';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Sanitize order data before sending to backend
 * Removes any fields not allowed by contract
 * @param {object} formData - Form data to sanitize
 * @returns {object} - Sanitized data with only allowed fields
 */
export const sanitizeOrderData = (formData) => {
  const sanitized = {
    deliveryAddress: formData.deliveryAddress?.trim() || '',
    houseNumber: formData.houseNumber?.trim() || '',
    phone: formData.phone?.trim() || '',
    latitude: parseFloat(formData.latitude),
    longitude: parseFloat(formData.longitude),
  };

  return sanitized;
};
