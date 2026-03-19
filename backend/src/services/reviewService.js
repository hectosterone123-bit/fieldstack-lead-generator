const db = require('../db');
const smsService = require('./smsService');

function getReviewSettings() {
  const rows = db.all("SELECT key, value FROM settings WHERE key IN ('google_review_link', 'review_request_enabled', 'company_name')");
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  return settings;
}

function isEnabled() {
  const settings = getReviewSettings();
  return settings.review_request_enabled === 'true'
    && !!settings.google_review_link
    && smsService.isConfigured();
}

async function sendInitialRequest(lead) {
  if (!isEnabled()) return { success: false, error: 'Review requests not configured' };
  if (!lead.phone) return { success: false, error: 'Lead has no phone number' };

  const normalized = smsService.normalizePhone(lead.phone);
  if (!normalized) return { success: false, error: 'Invalid phone number' };

  // Don't double-send if there's already a pending request
  const existing = db.get(
    "SELECT id FROM review_requests WHERE lead_id = ? AND status = 'pending'",
    [lead.id]
  );
  if (existing) return { success: false, error: 'Review request already pending' };

  const settings = getReviewSettings();
  const companyName = settings.company_name || 'us';

  const message = `Thanks for choosing ${companyName}! How would you rate your experience? Reply with a number 1-5. Reply STOP to opt out.`;

  const result = await smsService.sendSms(lead.phone, message);
  if (!result.success) return result;

  db.run(
    'INSERT INTO review_requests (lead_id, phone, status, initial_sms_sid) VALUES (?, ?, ?, ?)',
    [lead.id, normalized, 'pending', result.sid]
  );

  db.run(
    `INSERT INTO sms_messages (lead_id, direction, from_number, to_number, body, twilio_sid, status)
     VALUES (?, 'outbound', ?, ?, ?, ?, ?)`,
    [lead.id, process.env.TWILIO_PHONE_NUMBER, normalized, message, result.sid, result.status]
  );

  db.run(
    'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
    [lead.id, 'sms_sent', 'Review request sent', message.substring(0, 100),
     JSON.stringify({ twilio_sid: result.sid, trigger: 'review_request' })]
  );

  return { success: true, sid: result.sid };
}

async function handleRatingReply(fromPhone, body) {
  const normalized = smsService.normalizePhone(fromPhone);
  if (!normalized) return null;

  // Only match a single digit 1-5
  const match = body.trim().match(/^[1-5]$/);
  if (!match) return null;

  const request = db.get(
    `SELECT rr.*, l.business_name
     FROM review_requests rr
     JOIN leads l ON rr.lead_id = l.id
     WHERE rr.phone = ? AND rr.status = 'pending'
     ORDER BY rr.created_at DESC LIMIT 1`,
    [normalized]
  );
  if (!request) return null;

  const rating = parseInt(match[0]);
  const settings = getReviewSettings();
  let responseMessage, outcome, newStatus;

  if (rating >= 4) {
    responseMessage = `Thank you! We'd love if you could share your experience on Google: ${settings.google_review_link}. It helps other homeowners find quality service.`;
    outcome = 'google_review_sent';
    newStatus = 'rated_positive';
  } else {
    responseMessage = `Thank you for your honest feedback. We want to make things right. Could you share what we could improve? Your feedback goes directly to our team.`;
    outcome = 'feedback_requested';
    newStatus = 'rated_negative';
  }

  const result = await smsService.sendSms(fromPhone, responseMessage);

  db.run(
    `UPDATE review_requests SET status = ?, rating = ?, outcome = ?, rated_at = CURRENT_TIMESTAMP,
     followup_sms_sid = ? WHERE id = ?`,
    [newStatus, rating, outcome, result.success ? result.sid : null, request.id]
  );

  if (result.success) {
    db.run(
      `INSERT INTO sms_messages (lead_id, direction, from_number, to_number, body, twilio_sid, status)
       VALUES (?, 'outbound', ?, ?, ?, ?, ?)`,
      [request.lead_id, process.env.TWILIO_PHONE_NUMBER, normalized, responseMessage, result.sid, result.status]
    );
  }

  const activityTitle = rating >= 4
    ? `Review: ${rating}/5 — Google link sent`
    : `Review: ${rating}/5 — Feedback requested`;

  db.run(
    'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
    [request.lead_id, 'sms_sent', activityTitle, responseMessage.substring(0, 100),
     JSON.stringify({ trigger: 'review_response', rating, outcome })]
  );

  return { handled: true, rating, outcome, lead_id: request.lead_id };
}

function getStats() {
  const total = db.get('SELECT COUNT(*) as count FROM review_requests')?.count || 0;
  const responded = db.get("SELECT COUNT(*) as count FROM review_requests WHERE status != 'pending'")?.count || 0;
  const positive = db.get("SELECT COUNT(*) as count FROM review_requests WHERE status = 'rated_positive'")?.count || 0;
  const negative = db.get("SELECT COUNT(*) as count FROM review_requests WHERE status = 'rated_negative'")?.count || 0;
  const avgRating = db.get("SELECT AVG(rating) as avg FROM review_requests WHERE rating IS NOT NULL")?.avg || 0;

  return {
    total_sent: total,
    total_responded: responded,
    response_rate: total > 0 ? Math.round((responded / total) * 100) : 0,
    positive_count: positive,
    negative_count: negative,
    google_reviews_directed: positive,
    avg_rating: Math.round(avgRating * 10) / 10,
  };
}

function getRecentRequests(limit = 50) {
  return db.all(`
    SELECT rr.*, l.business_name, l.first_name
    FROM review_requests rr
    JOIN leads l ON rr.lead_id = l.id
    ORDER BY rr.created_at DESC
    LIMIT ?
  `, [limit]);
}

module.exports = { sendInitialRequest, handleRatingReply, getStats, getRecentRequests, isEnabled, getReviewSettings };
