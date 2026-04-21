/**
 * Mail Service Configuration
 * 
 * Centralizes mail provider configuration and validation.
 * Supports multiple providers (SMTP, SendGrid) via environment variables.
 */

const logger = require('../utils/logger');

/**
 * Get mail configuration from environment variables
 * @returns {Object} Mail configuration object
 */
function getMailConfig() {
  const provider = process.env.MAIL_PROVIDER || 'smtp';
  const fromEmail = process.env.MAIL_FROM || process.env.FROM_EMAIL || 'noreply@citi-nati.com';
  const fromName = process.env.MAIL_FROM_NAME || 'Citi-Nati Supermarket';

  const config = {
    provider,
    fromEmail,
    fromName,
    from: `${fromName} <${fromEmail}>`,
  };

  // Provider-specific configuration
  if (provider === 'smtp') {
    config.smtp = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    };
  } else if (provider === 'sendgrid') {
    config.sendgrid = {
      apiKey: process.env.SENDGRID_API_KEY,
    };
  }

  return config;
}

/**
 * Validate mail configuration
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
function validateMailConfig() {
  const config = getMailConfig();
  const errors = [];

  // Basic validation
  if (!config.fromEmail) {
    errors.push('MAIL_FROM or FROM_EMAIL environment variable not set');
  }

  // Provider-specific validation
  if (config.provider === 'smtp') {
    if (!config.smtp.host) {
      errors.push('SMTP_HOST environment variable not set');
    }
    if (!config.smtp.auth.user) {
      errors.push('SMTP_USER environment variable not set');
    }
    if (!config.smtp.auth.pass) {
      errors.push('SMTP_PASS environment variable not set');
    }
  } else if (config.provider === 'sendgrid') {
    if (!config.sendgrid.apiKey) {
      errors.push('SENDGRID_API_KEY environment variable not set');
    }
  } else {
    errors.push(`Unknown mail provider: ${config.provider}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Initialize and validate mail configuration at startup
 * Logs warnings if configuration is incomplete
 */
function initializeMailConfig() {
  const validation = validateMailConfig();
  const config = getMailConfig();

  logger.info(`Mail service initialized with provider: ${config.provider}`);

  if (!validation.isValid) {
    logger.warn('Mail configuration incomplete:');
    validation.errors.forEach(error => logger.warn(`  - ${error}`));
    logger.warn('Some email functionality may not work correctly');
  }

  return config;
}

module.exports = {
  getMailConfig,
  validateMailConfig,
  initializeMailConfig,
};
