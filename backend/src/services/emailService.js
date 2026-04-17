const { Resend } = require('resend');

let resend = null;

function isConfigured() {
  // Check env var first (highest priority)
  if (process.env.RESEND_API_KEY) return true;
  // Fall back to database setting (user configured via UI)
  const apiKey = getSetting('resend_api_key');
  return !!apiKey;
}

function getClient() {
  if (resend) return resend;
  if (!isConfigured()) return null;
  // Use env var or fall back to database setting
  const apiKey = process.env.RESEND_API_KEY || getSetting('resend_api_key');
  if (!apiKey) return null;
  resend = new Resend(apiKey);
  return resend;
}

function getSetting(key) {
  try {
    const db = require('../db');
    const row = db.get('SELECT value FROM settings WHERE key = ?', [key]);
    return row?.value || '';
  } catch { return ''; }
}

function getFromAddress() {
  const raw = process.env.RESEND_FROM || getSetting('resend_from');
  if (!raw) return 'onboarding@resend.dev';
  // Already formatted as "Name <email>" — use as-is
  if (raw.includes('<')) return raw;
  // Auto-prefix sender name so inbox shows "Hector <email@domain.com>"
  const name = getSetting('sender_name');
  return name ? `${name} <${raw}>` : raw;
}

function getReplyTo() {
  return getSetting('reply_to_email');
}

function getAppUrl() {
  return process.env.APP_URL || getSetting('app_url');
}

async function sendEmail(to, subject, htmlBody, { leadId, fromEmail, plainText } = {}) {
  const client = getClient();
  if (!client) return { success: false, error: 'Resend API key not configured' };

  const toEmail = Array.isArray(to) ? to[0] : to;
  const appUrl = getAppUrl();

  // Append unsubscribe link (CAN-SPAM compliance)
  const unsubUrl = appUrl
    ? `${appUrl}/api/leads/unsubscribe?email=${encodeURIComponent(toEmail)}`
    : null;
  const footer = unsubUrl ? `\n\n---\nTo unsubscribe: ${unsubUrl}` : '';
  const textBody = htmlBody.replace(/<[^>]*>/g, '') + footer;

  const payload = {
    from: fromEmail || getFromAddress(),
    to: Array.isArray(to) ? to : [to],
    subject,
    // plain_text mode: only send text, no HTML — looks like a real human email
    ...(plainText
      ? { text: textBody }
      : { html: htmlBody + footer, text: textBody }
    ),
    headers: {
      // One-click unsubscribe (RFC 8058) — Gmail shows "Unsubscribe" button next to sender name
      ...(unsubUrl && {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      }),
    },
  };

  // Per-lead reply-to: reply+{lead_id}@domain.com for future inbound parsing
  const replyTo = getReplyTo();
  if (replyTo && leadId) {
    const domain = replyTo.split('@')[1];
    if (domain) {
      payload.replyTo = `reply+${leadId}@${domain}`;
    } else {
      payload.replyTo = replyTo;
    }
  } else if (replyTo) {
    payload.replyTo = replyTo;
  }

  try {
    const { data, error } = await client.emails.send(payload);
    if (error) return { success: false, error: error.message };
    return { success: true, messageId: data.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { isConfigured, sendEmail };
