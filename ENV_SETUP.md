# PyrocelCRM Environment Variables Setup

This document explains the environment variables required to run PyrocelCRM.

## Supabase Configuration

These variables are automatically configured when you connect Supabase integration:

```
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]
```

## Email Configuration

PyrocelCRM uses Resend for sending automated service completion reports. To enable email functionality:

### 1. Get a Resend API Key

- Visit [Resend.com](https://resend.com)
- Sign up for a free account
- Navigate to API Keys section
- Copy your API key

### 2. Add to Environment Variables

Add these variables to your project settings (v0 Settings → Vars):

```
RESEND_API_KEY=re_[your-api-key]
RESEND_FROM_EMAIL=PyrocelCRM <noreply@yourdomain.com>  # Optional, defaults to noreply@pyrocelcrm.com
```

### 3. Configure Internal Alert Emails (Optional)

If you want internal teams to be alerted when inspection items fail:

```
INTERNAL_ALERT_EMAILS=admin@company.com,supervisor@company.com
```

## Email Features

### Automatic Client Reports

When engineers complete a task:
- **If all items pass**: Client receives a professional pass report
- **If any items fail**: Client receives a detailed failure report with recommended actions

### Internal Alerts

When items fail, the specified internal email addresses receive alerts with:
- List of failed items
- Site and service details
- Engineer notes
- Instructions to follow up with client

## Testing Email Locally

When `RESEND_API_KEY` is not configured:
- Email sending is disabled (graceful degradation)
- Console warnings indicate email configuration is missing
- Functionality works normally, emails just won't be sent

## Setting Up Variables in v0

1. Click **Settings** (gear icon) in the top right
2. Go to **Vars** tab
3. Add the environment variables listed above
4. Changes take effect on the next deploy/restart

## Troubleshooting

### Emails not sending?
- Check that `RESEND_API_KEY` is correctly set
- Verify the API key hasn't expired
- Check the console for error messages

### Getting "Email service not configured"?
- Add the `RESEND_API_KEY` environment variable
- Restart the development server

### Client not receiving emails?
- Verify `RESEND_FROM_EMAIL` is correctly configured
- Check spam/junk folders
- Ensure the email address is valid in the site contact information

## Security Notes

- Never commit API keys to version control
- Use the v0 Vars editor to manage secrets securely
- The `SUPABASE_SERVICE_ROLE_KEY` is especially sensitive - keep it private
- Consider using different API keys for development and production
