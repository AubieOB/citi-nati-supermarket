const PASSWORD_MIN_LENGTH = Math.max(8, parseInt(process.env.PASSWORD_MIN_LENGTH || '10', 10) || 10);
const PASSWORD_MAX_LENGTH = Math.max(PASSWORD_MIN_LENGTH, parseInt(process.env.PASSWORD_MAX_LENGTH || '128', 10) || 128);

function validateStrongPassword(password) {
  const value = String(password || '');
  const errors = [];

  if (value.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
  }

  if (value.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Password must be no more than ${PASSWORD_MAX_LENGTH} characters long`);
  }

  if (!/[a-z]/.test(value)) {
    errors.push('Password must include at least one lowercase letter');
  }

  if (!/[A-Z]/.test(value)) {
    errors.push('Password must include at least one uppercase letter');
  }

  if (!/[0-9]/.test(value)) {
    errors.push('Password must include at least one number');
  }

  if (!/[^A-Za-z0-9]/.test(value)) {
    errors.push('Password must include at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  validateStrongPassword,
};