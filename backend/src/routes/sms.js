const express = require('express');
const router = express.Router();
const db = require('../db');
const smsService = require('../services/smsService');
const { renderTemplate } = require('../services/templateService');
const { recomputeHeatScore } = require('../services/heatScoreService');

// ─── SMS Status ──────────────────────────────────────────────────────────────

router.get('/status', (req, res) => {
  res.json({ success: true, data: { configured: smsService.isConfigured() } });
});

// ─── Send SMS to a lead ──────────────────────────────────────────────────────

router.post('/send', async (req, res) => {
  const { lead_id, body, template_id } = req.body;
  if (!lead_id) return res.status(400).json({ success: false, error: 'lead_id is required' });

  const lead = db.get('SELECT * FROM leads WHERE id = ?', [lead_id]);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  if (!lead.phone) return res.status(400).json({ success: false, error: 'Lead has no phone number' });

  let messageBody = body;

  // If template_id is provided, render the template
  if (template_id && !body) {
    const template = db.get('SELECT * FROM templates WHERE id = ?', [template_id]);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
    messageBody = renderTemplate(template.body, lead);
  }

  if (!messageBody) return res.status(400).json({ success: false, error: 'body or template_id is required' });

  const result = await smsService.sendSms(lead.phone, messageBody);
  if (!result.success) {
    return res.status(500).json({ success: false, error: result.error });
  }

  // Log SMS to sms_messages table
  db.run(
    `INSERT INTO sms_messages (lead_id, direction, from_number, to_number, body, twilio_sid, status)
     VALUES (?, 'outbound', ?, ?, ?, ?, ?)`,
    [lead_id, process.env.TWILIO_PHONE_NUMBER, smsService.normalizePhone(lead.phone), messageBody, result.sid, result.status]
  );

  // Log activity
  db.run(
    'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
    [lead_id, 'sms_sent', 'SMS sent', messageBody.substring(0, 100) + (messageBody.length > 100 ? '...' : ''), JSON.stringify({ twilio_sid: result.sid })]
  );

  // Update lead contact tracking
  db.run(
    'UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, first_contacted_at = CASE WHEN first_contacted_at IS NULL THEN CURRENT_TIMESTAMP ELSE first_contacted_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [lead_id]
  );

  // Recompute heat score
  const updatedLead = db.get('SELECT * FROM leads WHERE id = ?', [lead_id]);
  if (updatedLead) {
    const newScore = recomputeHeatScore(updatedLead);
    if (newScore !== updatedLead.heat_score) {
      db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newScore, lead_id]);
    }
  }

  res.json({ success: true, data: { sid: result.sid, status: result.status } });
});

// ─── SMS conversation for a lead ─────────────────────────────────────────────

router.get('/conversation/:leadId', (req, res) => {
  const { leadId } = req.params;
  const messages = db.all(
    'SELECT * FROM sms_messages WHERE lead_id = ? ORDER BY created_at ASC',
    [leadId]
  );
  res.json({ success: true, data: messages });
});

// ─── Twilio Incoming Webhook ─────────────────────────────────────────────────
// Set your Twilio webhook URL to: https://yourdomain.com/api/sms/webhook

router.post('/webhook', express.urlencoded({ extended: false }), (req, res) => {
  const { From, To, Body, MessageSid } = req.body;

  if (!From || !Body) {
    return res.status(400).send('<Response></Response>');
  }

  const normalized = smsService.normalizePhone(From);

  // Handle opt-out keywords (STOP, UNSUBSCRIBE, etc.)
  if (smsService.isOptOut(Body)) {
    smsService.handleOptOut(From);
    // Twilio handles STOP automatically, but we track it too
    res.type('text/xml').send('<Response><Message>You have been unsubscribed. Reply START to resubscribe.</Message></Response>');
    return;
  }

  // Handle opt-in keywords (START, UNSTOP, etc.)
  if (smsService.isOptIn(Body)) {
    smsService.handleOptIn(From);
    res.type('text/xml').send('<Response><Message>You have been resubscribed. Reply STOP to unsubscribe.</Message></Response>');
    return;
  }

  // Find lead by phone number
  const lead = db.get(
    'SELECT * FROM leads WHERE phone LIKE ? OR phone LIKE ? OR phone LIKE ?',
    [`%${normalized ? normalized.slice(-10) : From.slice(-10)}%`, `%${From.slice(-10)}%`, From]
  );

  const leadId = lead ? lead.id : null;

  // Store inbound message
  db.run(
    `INSERT INTO sms_messages (lead_id, direction, from_number, to_number, body, twilio_sid, status)
     VALUES (?, 'inbound', ?, ?, ?, ?, 'received')`,
    [leadId, From, To, Body, MessageSid]
  );

  // Log activity if we found a lead
  if (lead) {
    db.run(
      'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
      [lead.id, 'sms_sent', 'SMS received', Body.substring(0, 100) + (Body.length > 100 ? '...' : ''), JSON.stringify({ twilio_sid: MessageSid, direction: 'inbound' })]
    );
  }

  // Empty TwiML response (don't auto-reply — Sam AI will handle that separately)
  res.type('text/xml').send('<Response></Response>');
});

// ─── SMS threads (grouped by lead) ──────────────────────────────────────────

router.get('/threads', (req, res) => {
  const threads = db.all(
    `SELECT
       sm.lead_id,
       l.business_name,
       l.first_name,
       l.phone,
       l.status as lead_status,
       l.service_type,
       COUNT(*) as message_count,
       SUM(CASE WHEN sm.direction = 'inbound' THEN 1 ELSE 0 END) as inbound_count,
       SUM(CASE WHEN sm.direction = 'outbound' THEN 1 ELSE 0 END) as outbound_count,
       MAX(sm.created_at) as last_message_at,
       (SELECT body FROM sms_messages WHERE lead_id = sm.lead_id ORDER BY created_at DESC LIMIT 1) as last_message,
       (SELECT direction FROM sms_messages WHERE lead_id = sm.lead_id ORDER BY created_at DESC LIMIT 1) as last_direction
     FROM sms_messages sm
     LEFT JOIN leads l ON sm.lead_id = l.id
     WHERE sm.lead_id IS NOT NULL
     GROUP BY sm.lead_id
     ORDER BY last_message_at DESC`
  );
  res.json({ success: true, data: threads });
});

// ─── Recent inbound messages ─────────────────────────────────────────────────

router.get('/inbox', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const messages = db.all(
    `SELECT sm.*, l.business_name, l.first_name, l.status as lead_status
     FROM sms_messages sm
     LEFT JOIN leads l ON sm.lead_id = l.id
     WHERE sm.direction = 'inbound'
     ORDER BY sm.created_at DESC
     LIMIT ?`,
    [limit]
  );
  res.json({ success: true, data: messages });
});

// ─── All messages (paginated) ────────────────────────────────────────────────

router.get('/messages', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  const total = db.get('SELECT COUNT(*) as count FROM sms_messages');
  const messages = db.all(
    `SELECT sm.*, l.business_name, l.first_name
     FROM sms_messages sm
     LEFT JOIN leads l ON sm.lead_id = l.id
     ORDER BY sm.created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  res.json({
    success: true,
    data: messages,
    pagination: { page, limit, total: total.count, totalPages: Math.ceil(total.count / limit) },
  });
});

// ─── Twilio Voice Webhook (Missed Call Text-Back) ───────────────────────────
// Set your Twilio voice webhook URL to: https://yourdomain.com/api/sms/voice-webhook

router.post('/voice-webhook', express.urlencoded({ extended: false }), async (req, res) => {
  const { From, To, CallStatus, CallSid } = req.body;

  // Only trigger on no-answer / busy / failed (missed calls)
  // Twilio sends 'completed' for answered calls, 'no-answer' / 'busy' / 'failed' for missed
  const missedStatuses = ['no-answer', 'busy', 'failed', 'canceled'];
  const isMissed = missedStatuses.includes(CallStatus);

  if (!From || !isMissed) {
    // Answered call or no caller info — just play voicemail or hang up
    res.type('text/xml').send(`<Response><Say>Sorry we missed you. Please leave a message after the beep.</Say><Record maxLength="120" /></Response>`);
    return;
  }

  const normalized = smsService.normalizePhone(From);

  // Check opt-out
  const optedOut = normalized ? db.get('SELECT id FROM sms_opt_outs WHERE phone = ?', [normalized]) : null;
  if (optedOut) {
    res.type('text/xml').send('<Response></Response>');
    return;
  }

  // Check if Twilio is configured for sending
  if (!smsService.isConfigured()) {
    res.type('text/xml').send('<Response></Response>');
    return;
  }

  // Check if missed call text-back is enabled
  const missedCallEnabled = process.env.MISSED_CALL_TEXTBACK !== 'false';
  if (!missedCallEnabled) {
    res.type('text/xml').send('<Response></Response>');
    return;
  }

  const missedCallMessage = process.env.MISSED_CALL_MESSAGE
    || "Sorry we missed your call! We're currently on a job but want to help. What can we do for you?";

  // Find lead by phone
  const last10 = normalized ? normalized.slice(-10) : From.slice(-10);
  const lead = db.get(
    'SELECT * FROM leads WHERE phone LIKE ? OR phone LIKE ? OR phone LIKE ?',
    [`%${last10}%`, `%${From.slice(-10)}%`, From]
  );

  // Send the text-back SMS
  const smsResult = await smsService.sendSms(From, missedCallMessage);

  if (smsResult.success) {
    // Log to sms_messages
    db.run(
      `INSERT INTO sms_messages (lead_id, direction, from_number, to_number, body, twilio_sid, status)
       VALUES (?, 'outbound', ?, ?, ?, ?, ?)`,
      [lead ? lead.id : null, process.env.TWILIO_PHONE_NUMBER, normalized || From, missedCallMessage, smsResult.sid, smsResult.status]
    );

    // Log activity if lead exists
    if (lead) {
      db.run(
        'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
        [lead.id, 'sms_sent', 'Missed call text-back sent', missedCallMessage, JSON.stringify({ twilio_sid: smsResult.sid, call_sid: CallSid, trigger: 'missed_call' })]
      );

      // Update contact tracking
      db.run(
        'UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, first_contacted_at = CASE WHEN first_contacted_at IS NULL THEN CURRENT_TIMESTAMP ELSE first_contacted_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [lead.id]
      );
    }

    // If caller isn't a known lead, create one
    if (!lead && normalized) {
      const newLead = db.run(
        `INSERT INTO leads (business_name, phone, source, status, notes)
         VALUES (?, ?, 'missed_call', 'new', ?)`,
        [`Unknown (${normalized})`, normalized, `Missed call on ${new Date().toLocaleString()}`]
      );

      if (newLead.lastInsertRowid) {
        db.run(
          `UPDATE sms_messages SET lead_id = ? WHERE twilio_sid = ?`,
          [newLead.lastInsertRowid, smsResult.sid]
        );

        db.run(
          'INSERT INTO activities (lead_id, type, title, description) VALUES (?, ?, ?, ?)',
          [newLead.lastInsertRowid, 'import', 'Lead created from missed call', `Inbound call from ${normalized}, auto-texted back`]
        );
      }
    }
  }

  // TwiML: play a brief message then hang up
  res.type('text/xml').send(`<Response><Say>Sorry we missed you. We just sent you a text message. Talk soon!</Say></Response>`);
});

// ─── Missed Call Settings ───────────────────────────────────────────────────

router.get('/missed-call-settings', (req, res) => {
  res.json({
    success: true,
    data: {
      enabled: process.env.MISSED_CALL_TEXTBACK !== 'false',
      message: process.env.MISSED_CALL_MESSAGE || "Sorry we missed your call! We're currently on a job but want to help. What can we do for you?",
      twilio_configured: smsService.isConfigured(),
    },
  });
});

// ─── Review Request Settings ────────────────────────────────────────────────

router.get('/review-settings', (req, res) => {
  const reviewLink = process.env.GOOGLE_REVIEW_LINK || '';
  res.json({
    success: true,
    data: {
      enabled: process.env.REVIEW_REQUEST_ENABLED !== 'false' && !!reviewLink,
      message: process.env.REVIEW_REQUEST_MESSAGE || `Thanks for choosing us! If you had a great experience, a quick Google review means the world: ${reviewLink || '{review_link}'}. Reply STOP to opt out.`,
      google_review_link: reviewLink,
      twilio_configured: smsService.isConfigured(),
    },
  });
});

module.exports = router;
