const { Resend } = require('resend');

let resend = null;

function isConfigured() {
  return !!process.env.RESEND_API_KEY;
}

function getClient() {
  if (resend) return resend;
  if (!isConfigured()) return null;
  resend = new Resend(process.env.RESEND_API_KEY);
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

async function sendEmail(to, subject, htmlBody, { leadId } = {}) {
  const client = getClient();
  if (!client) return { success: false, error: 'Resend API key not configured' };

  const toEmail = Array.isArray(to) ? to[0] : to;

  // Append unsubscribe link (CAN-SPAM compliance)
  const appUrl = getAppUrl();
  const footer = appUrl
    ? `\n\n---\nTo unsubscribe: ${appUrl}/api/leads/unsubscribe?email=${encodeURIComponent(toEmail)}`
    : '';
  const body = htmlBody + footer;

  const payload = {
    from: getFromAddress(),
    to: Array.isArray(to) ? to : [to],
    subject,
    html: body,
    text: body.replace(/<[^>]*>/g, ''),
  };

  // Per-lead reply-to: reply+{lead_id}@domain.com for future inbound parsing
  const replyTo = getReplyTo();
  if (replyTo && leadId) {
    const domain = replyTo.split('@')[1];
    if (domain) {
      payload.reply_to = `reply+${leadId}@${domain}`;
    } else {
      payload.reply_to = replyTo;
    }
  } else if (replyTo) {
    payload.reply_to = replyTo;
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
