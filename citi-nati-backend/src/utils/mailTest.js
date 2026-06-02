/**
 * Mail Configuration Test Utility
 * 
 * Helps verify SMTP configuration is working correctly.
 * Can be called from admin endpoints or CLI for testing.
 * 
 * Usage:
 *   node utils/mailTest.js
 * 
 * Or in code:
 *   const { testMailConfig } = require('./mailTest');
 *   const result = await testMailConfig('test@example.com');
 */

const mailProvider = require('../services/mailProvider');
const mailConfig = require('../config/mailConfig');
const logger = require('./logger');

/**
 * Test mail configuration by sending a test email
 * @param {string} testEmail - Email address to send test email to
 * @returns {Promise<Object>} Result object { success, message, details }
 */
async function testMailConfig(testEmail) {
  if (!testEmail || typeof testEmail !== 'string' || !testEmail.includes('@')) {
    return {
      success: false,
      message: 'Invalid test email address',
      details: { email: testEmail },
    };
  }

  try {
    // Validate mail configuration first
    const validation = mailConfig.validateMailConfig();
    if (!validation.isValid) {
      return {
        success: false,
        message: 'Mail configuration is incomplete',
        details: { errors: validation.errors },
      };
    }

    const config = mailConfig.getMailConfig();
    
    logger.infoLog('Mail config test started', { provider: config.provider, testEmail });

    // Get the provider and send test email
    const provider = mailProvider.getMailProvider();
    
    const testContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #5B4B8A; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">Citi-Nati Supermarket</h1>
        </div>
        <div style="padding: 30px; background-color: #f9f9f9;">
          <h2 style="color: #333;">Mail Configuration Test</h2>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            If you received this email, your mail configuration is working correctly!
          </p>
          <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="color: #155724; margin: 0;">✓ Mail Service Verified</p>
          </div>
          <div style="background-color: #fff; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #e0e0e0; font-size: 12px;">
            <p style="color: #999; margin: 0;"><strong>Provider:</strong> ${config.provider}</p>
            <p style="color: #999; margin: 5px 0 0 0;"><strong>From:</strong> ${config.from}</p>
            <p style="color: #999; margin: 5px 0 0 0;"><strong>Sent At:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <p style="color: #666; font-size: 14px;">
            This is an automated test email from the Citi-Nati Supermarket system.
          </p>
        </div>
        <div style="background-color: #f0f0f0; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #999;">
          <p style="margin: 0;">© 2026 Citi-Nati Supermarket. All rights reserved.</p>
        </div>
      </div>
    `;

    const result = await provider.send({
      to: testEmail,
      subject: 'Citi-Nati Mail Configuration Test',
      html: testContent,
    });

    logger.infoLog('Mail config test succeeded', { 
      provider: config.provider, 
      testEmail,
      messageId: result.messageId 
    });

    return {
      success: true,
      message: 'Test email sent successfully',
      details: {
        provider: config.provider,
        testEmail,
        messageId: result.messageId,
        timestamp: new Date().toISOString(),
        senderName: config.fromName,
        senderEmail: config.fromEmail,
      },
    };
  } catch (err) {
    logger.errorLog('Mail config test failed', {
      provider: mailConfig.getMailConfig().provider,
      error: err.message || err.code,
      testEmail,
    });

    return {
      success: false,
      message: err.message || 'Failed to send test email',
      details: {
        provider: mailConfig.getMailConfig().provider,
        testEmail,
        error: err.originalError || err.message || err.code,
        code: err.code,
      },
    };
  }
}

/**
 * Get mail configuration status
 * @returns {Object} Configuration status details
 */
function getMailConfigStatus() {
  const validation = mailConfig.validateMailConfig();
  const config = mailConfig.getMailConfig();

  return {
    configured: validation.isValid,
    provider: config.provider,
    senderName: config.fromName,
    senderEmail: config.fromEmail,
    validation: validation.isValid ? 
      { status: 'ok' } : 
      { status: 'incomplete', errors: validation.errors },
    ...(config.provider === 'smtp' && {
      smtp: {
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        user: config.smtp.auth.user,
        // Never log password
      },
    }),
    ...(config.provider === 'sendgrid' && {
      sendgrid: {
        apiKeyConfigured: Boolean(config.sendgrid.apiKey),
      },
    }),
  };
}

// If running directly from CLI
if (require.main === module) {
  const testEmail = process.argv[2];
  
  if (!testEmail) {
    console.log('Usage: node mailTest.js <test-email@example.com>');
    console.log('\nCurrent mail configuration:');
    console.log(JSON.stringify(getMailConfigStatus(), null, 2));
    process.exit(0);
  }

  testMailConfig(testEmail).then(result => {
    console.log('\nMail Test Result:');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  }).catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}

module.exports = {
  testMailConfig,
  getMailConfigStatus,
};
