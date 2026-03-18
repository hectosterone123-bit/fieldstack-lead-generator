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

function getFromAddress() {
  if (process.env.RESEND_FROM) return process.env.RESEND_FROM;
  try {
    const db = require('../db');
    const row = db.get('SELECT value FROM settings WHERE key = ?', ['resend_from']);
    if (row?.value) return row.value;
  } catch {}
  return 'onboarding@resend.dev';
}

function getSenderName() {
  try {
    const db = require('../db');
    const row = db.get('SELECT value FROM settings WHERE key = ?', ['sender_name']);
    if (row?.value) return row.value;
  } catch {}
  return '';
}

async function sendEmail(to, subject, htmlBody) {
  const client = getClient();
  if (!client) return { success: false, error: 'Resend API key not configured' };

  const senderName = getSenderName();
  const footer = senderName ? `\n\n${senderName}, from FieldStack` : '';
  const bodyWithFooter = htmlBody + footer;

  try {
    const { data, error } = await client.emails.send({
      from: getFromAddress(),
      to: Array.isArray(to) ? to : [to],
      subject,
      html: bodyWithFooter,
      text: bodyWithFooter.replace(/<[^>]*>/g, ''),
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { isConfigured, sendEmail };
