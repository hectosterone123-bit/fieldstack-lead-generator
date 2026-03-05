const twilio = require('twilio');

let client = null;

function isConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
}

function getClient() {
  if (client) return client;
  if (!isConfigured()) return null;
  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
}

async function sendSms(to, body) {
  const c = getClient();
  if (!c) return { success: false, error: 'Twilio not configured' };

  // Normalize phone number
  const normalized = normalizePhone(to);
  if (!normalized) return { success: false, error: 'Invalid phone number' };

  // Check opt-out
  const db = require('../db');
  const optOut = db.get('SELECT id FROM sms_opt_outs WHERE phone = ?', [normalized]);
  if (optOut) return { success: false, error: 'Recipient has opted out of SMS' };

  try {
    const message = await c.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: normalized,
    });

    return {
      success: true,
      sid: message.sid,
      status: message.status,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getMessageStatus(sid) {
  const c = getClient();
  if (!c) return { success: false, error: 'Twilio not configured' };

  try {
    const message = await c.messages(sid).fetch();
    return {
      success: true,
      status: message.status,
      error_code: message.errorCode,
      error_message: message.errorMessage,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.startsWith('+')) return phone;
  return null;
}

function handleOptOut(phone) {
  const db = require('../db');
  const normalized = normalizePhone(phone);
  if (!normalized) return false;

  const existing = db.get('SELECT id FROM sms_opt_outs WHERE phone = ?', [normalized]);
  if (!existing) {
    db.run('INSERT INTO sms_opt_outs (phone) VALUES (?)', [normalized]);
  }
  return true;
}

function handleOptIn(phone) {
  const db = require('../db');
  const normalized = normalizePhone(phone);
  if (!normalized) return false;

  db.run('DELETE FROM sms_opt_outs WHERE phone = ?', [normalized]);
  return true;
}

const OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'cancel', 'end', 'quit'];
const OPT_IN_KEYWORDS = ['start', 'unstop', 'subscribe'];

function isOptOut(message) {
  return OPT_OUT_KEYWORDS.includes(message.trim().toLowerCase());
}

function isOptIn(message) {
  return OPT_IN_KEYWORDS.includes(message.trim().toLowerCase());
}

module.exports = {
  isConfigured,
  sendSms,
  getMessageStatus,
  normalizePhone,
  handleOptOut,
  handleOptIn,
  isOptOut,
  isOptIn,
};
