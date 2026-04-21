/**
 * Mail Provider Factory
 * 
 * Creates and manages mail provider instances (SMTP, SendGrid, etc.)
 * Provides a unified interface for sending emails regardless of underlying provider.
 */

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const mailConfig = require('../config/mailConfig');

let mailProvider = null;

/**
 * SMTP Provider Implementation
 */
class SmtpProvider {
  constructor(config) {
    this.config = config;
    this.transporter = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      this.transporter = nodemailer.createTransport({
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure,
        auth: {
          user: this.config.smtp.auth.user,
          pass: this.config.smtp.auth.pass,
        },
      });

      // Verify connection
      await this.transporter.verify();
      logger.info('SMTP connection verified successfully');
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize SMTP provider:', {
        error: error.message,
        host: this.config.smtp.host,
        port: this.config.smtp.port,
      });
      throw error;
    }
  }

  async send(options) {
    if (!this.initialized) {
      await this.initialize();
    }

    const mailOptions = {
      from: options.from || this.config.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      ...(options.text && { text: options.text }),
      ...(options.cc && { cc: options.cc }),
      ...(options.bcc && { bcc: options.bcc }),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      logger.info('Email sent via SMTP', {
        to: options.to,
        subject: options.subject,
        messageId: info.messageId,
      });
      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      logger.error('SMTP email send failed', {
        to: options.to,
        subject: options.subject,
        error: error.message,
      });
      
      // Classify error
      let errorType = 'EMAIL_SEND_FAILED';
      let userMessage = 'Failed to send email. Please try again later.';

      if (error.message.includes('ECONNREFUSED') || error.message.includes('EHOSTUNREACH')) {
        errorType = 'EMAIL_SERVICE_UNAVAILABLE';
        userMessage = 'Email service is temporarily unavailable.';
      } else if (error.message.includes('Invalid login') || error.message.includes('Unauthorized')) {
        errorType = 'EMAIL_PROVIDER_UNAUTHORIZED';
        userMessage = 'Email service authentication failed.';
      }

      throw {
        code: errorType,
        message: userMessage,
        originalError: error.message,
      };
    }
  }

  async testConnection() {
    try {
      await this.initialize();
      return {
        success: true,
        message: 'SMTP connection successful',
        provider: 'smtp',
        host: this.config.smtp.host,
        port: this.config.smtp.port,
      };
    } catch (error) {
      return {
        success: false,
        message: 'SMTP connection failed',
        provider: 'smtp',
        error: error.message,
      };
    }
  }
}

/**
 * SendGrid Provider Implementation (fallback/optional)
 */
class SendgridProvider {
  constructor(config) {
    this.config = config;
    this.sgMail = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(this.config.sendgrid.apiKey);
      this.sgMail = sgMail;
      this.initialized = true;
      logger.info('SendGrid provider initialized');
    } catch (error) {
      logger.error('Failed to initialize SendGrid provider:', {
        error: error.message,
      });
      throw error;
    }
  }

  async send(options) {
    if (!this.initialized) {
      await this.initialize();
    }

    const mailOptions = {
      to: options.to,
      from: options.from || this.config.from,
      subject: options.subject,
      html: options.html,
      ...(options.text && { text: options.text }),
      ...(options.cc && { cc: options.cc }),
      ...(options.bcc && { bcc: options.bcc }),
    };

    try {
      const [response] = await this.sgMail.send(mailOptions);
      logger.info('Email sent via SendGrid', {
        to: options.to,
        subject: options.subject,
        statusCode: response.statusCode,
      });
      return {
        success: true,
        messageId: response.headers['x-message-id'],
      };
    } catch (error) {
      logger.error('SendGrid email send failed', {
        to: options.to,
        subject: options.subject,
        error: error.message,
      });

      let errorType = 'EMAIL_SEND_FAILED';
      let userMessage = 'Failed to send email. Please try again later.';

      if (error.code === 429) {
        errorType = 'EMAIL_PROVIDER_CREDITS_EXCEEDED';
        userMessage = 'Too many requests. Please try again later.';
      } else if (error.code === 401 || error.code === 403) {
        errorType = 'EMAIL_PROVIDER_UNAUTHORIZED';
        userMessage = 'Email service authentication failed.';
      }

      throw {
        code: errorType,
        message: userMessage,
        originalError: error.message,
      };
    }
  }

  async testConnection() {
    try {
      await this.initialize();
      return {
        success: true,
        message: 'SendGrid connection successful',
        provider: 'sendgrid',
      };
    } catch (error) {
      return {
        success: false,
        message: 'SendGrid connection failed',
        provider: 'sendgrid',
        error: error.message,
      };
    }
  }
}

/**
 * Get or create mail provider instance
 * @returns {SmtpProvider|SendgridProvider} Mail provider instance
 */
function getMailProvider() {
  if (mailProvider) return mailProvider;

  const config = mailConfig.getMailConfig();
  const validation = mailConfig.validateMailConfig();

  if (!validation.isValid) {
    logger.warn('Mail provider validation failed:', validation.errors);
  }

  if (config.provider === 'smtp') {
    mailProvider = new SmtpProvider(config);
  } else if (config.provider === 'sendgrid') {
    mailProvider = new SendgridProvider(config);
  } else {
    throw new Error(`Unknown mail provider: ${config.provider}`);
  }

  logger.info(`Mail provider created: ${config.provider}`);
  return mailProvider;
}

/**
 * Reset mail provider (useful for testing)
 */
function resetMailProvider() {
  mailProvider = null;
}

module.exports = {
  SmtpProvider,
  SendgridProvider,
  getMailProvider,
  resetMailProvider,
};
