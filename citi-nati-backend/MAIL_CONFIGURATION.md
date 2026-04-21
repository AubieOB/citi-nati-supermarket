# Mail Configuration Variables

## Required Environment Variables for SMTP

Configure these variables in your `.env` or `.env.production` file:

```bash
# Mail Provider (smtp or sendgrid)
MAIL_PROVIDER=smtp

# SMTP Configuration (when MAIL_PROVIDER=smtp)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_SECURE=false

# Sender Information
MAIL_FROM=your-email@gmail.com
MAIL_FROM_NAME=Citi-Nati Supermarket
```

## Configuration Details

### SMTP Variables

- **MAIL_PROVIDER**: Set to `smtp` to use SMTP (or `sendgrid` for SendGrid)
- **SMTP_HOST**: Your SMTP server hostname (e.g., `smtp.gmail.com`, `smtp.office365.com`)
- **SMTP_PORT**: SMTP port number (typically `587` for TLS, `465` for SSL)
- **SMTP_USER**: SMTP authentication username (email address)
- **SMTP_PASS**: SMTP authentication password or app-specific password
- **SMTP_SECURE**: Set to `true` for SSL (port 465), `false` for TLS (port 587)
- **MAIL_FROM**: Email address that appears as the sender
- **MAIL_FROM_NAME**: Display name that appears as the sender

### Alternative: SendGrid

If using SendGrid instead of SMTP:

```bash
MAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.your-api-key-here
MAIL_FROM=your-email@example.com
MAIL_FROM_NAME=Citi-Nati Supermarket
```

## Email Types Supported

The system sends the following email types automatically:

1. **Email Verification** - New user registration (10-minute code expiry)
2. **Password Reset** - Password recovery request (15-minute code expiry)
3. **Order Confirmation** - Order placement confirmation with items
4. **Payment Confirmation** - Successful payment processing
5. **Driver Assigned** - Driver assigned to delivery
6. **Delivery Status** - Order status changes (In Transit, Delivered, Cancelled)
7. **Refund Notification** - Payment refunded due to unavailable items

## Common SMTP Providers

### Gmail
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
```

**Note:** Use an [App Password](https://support.google.com/accounts/answer/185833), not your regular password.

### Office 365 / Outlook
```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@yourdomain.com
SMTP_PASS=your-password
```

### SendGrid
```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=SG.your-api-key-here
```

### Mailgun
```
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@yourdomain.mailgun.org
SMTP_PASS=your-password
```

## Testing Mail Configuration

### Via Admin Dashboard

1. Navigate to the admin dashboard
2. Go to **System Settings** → **Mail Configuration Test**
3. Enter a test email address
4. Click **Send Test Email**

### Via Terminal (Development)

```bash
# Set environment variables
export MAIL_PROVIDER=smtp
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USER=your-email@gmail.com
export SMTP_PASS=your-app-password
export MAIL_FROM=your-email@gmail.com
export MAIL_FROM_NAME="Citi-Nati Supermarket"

# Run the application
npm start
```

Check logs for mail configuration status:

```
Mail service initialized with provider: smtp
SMTP connection verified successfully
```

## Error Codes

- `EMAIL_SEND_FAILED` - Generic email send failure
- `EMAIL_SERVICE_UNAVAILABLE` - Cannot connect to SMTP server
- `EMAIL_PROVIDER_UNAUTHORIZED` - Authentication failure (check credentials)
- `EMAIL_PROVIDER_CREDITS_EXCEEDED` - SendGrid quota exceeded (SMTP only)

## Troubleshooting

### Connection Refused
- Verify SMTP_HOST and SMTP_PORT are correct
- Check firewall/network rules allow outbound connection
- Verify port 587 (TLS) or 465 (SSL) is open

### Authentication Failed
- Double-check SMTP_USER and SMTP_PASS
- For Gmail, use an [App Password](https://support.google.com/accounts/answer/185833)
- Ensure user account has SMTP access enabled

### Emails Not Sent
- Check application logs for detailed error messages
- Verify MAIL_FROM email address is valid
- Test with admin dashboard mail test function

### Rate Limiting
- Some providers limit emails per minute/hour
- Space out test emails to avoid hitting limits
- Check provider documentation for rate limits

## Email Log Locations

- Application logs: `citi-nati-backend/logs/` (if configured)
- Database audit logs: `securityAuditLog` table
- System notifications: Check email delivery logs in provider console
