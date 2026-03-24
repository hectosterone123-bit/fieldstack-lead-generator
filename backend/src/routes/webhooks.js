const express = require('express');
const router = express.Router();
const db = require('../db');
const smsService = require('../services/smsService');
const { recomputeHeatScore } = require('../services/heatScoreService');

// POST /api/webhooks/resend — Resend email event webhook
// Configure in Resend dashboard → Webhooks → Add endpoint
// URL: https://your-app.up.railway.app/api/webhooks/resend
// Events to enable: email.opened, email.clicked, email.bounced, email.complained
router.post('/resend', async (req, res) => {
  const { type, data } = req.body;

  // Helper: find lead_id by resend message ID
  function findLeadByMessageId(messageId) {
    if (!messageId) return null;
    return db.get(
      `SELECT lead_id FROM activities WHERE type = 'email_sent' AND json_extract(metadata, '$.resend_message_id') = ? LIMIT 1`,
      [messageId]
    );
  }

  if (type === 'email.opened') {
    const messageId = data?.email_id;
    const activity = findLeadByMessageId(messageId);
    if (activity) {
      db.run(
        'UPDATE leads SET email_opened_at = COALESCE(email_opened_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [activity.lead_id]
      );
      db.run(
        `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'email_opened', 'Email opened', 'Prospect opened your email')`,
        [activity.lead_id]
      );

      // Multi-open alert: SMS to user when lead opens 2+ times
      const openCount = db.get(
        `SELECT COUNT(*) as count FROM activities WHERE lead_id = ? AND type = 'email_opened'`,
        [activity.lead_id]
      )?.count || 0;

      if (openCount >= 2) {
        const alertPhone = db.get("SELECT value FROM settings WHERE key = 'alert_phone'")?.value;
        if (alertPhone && smsService.isConfigured()) {
          const lead = db.get('SELECT business_name, city FROM leads WHERE id = ?', [activity.lead_id]);
          if (lead) {
            const name = lead.business_name || 'A lead';
            const city = lead.city ? ` (${lead.city})` : '';
            smsService.sendSms(alertPhone, `Fieldstack: ${name}${city} opened your email ${openCount}x — send the Loom now`).catch(() => {});
          }
        }
      }
    }
  }

  else if (type === 'email.clicked') {
    const messageId = data?.email_id;
    const activity = findLeadByMessageId(messageId);
    if (activity) {
      const link = data?.click?.link || 'Link clicked';
      db.run(
        `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'email_clicked', 'Email link clicked', ?)`,
        [activity.lead_id, link]
      );
      // Boost heat score on click — stronger buying signal than open
      const lead = db.get('SELECT * FROM leads WHERE id = ?', [activity.lead_id]);
      if (lead) {
        const newScore = Math.min(recomputeHeatScore(lead) + 5, 100);
        if (newScore !== lead.heat_score) {
          db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newScore, lead.id]);
        }
      }
    }
  }

  else if (type === 'email.bounced') {
    const messageId = data?.email_id;
    const activity = findLeadByMessageId(messageId);
    if (activity) {
      db.run(
        'UPDATE leads SET email_invalid_at = COALESCE(email_invalid_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [activity.lead_id]
      );
      db.run(
        `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'email_bounced', 'Email bounced', 'Email address is invalid or unreachable — removed from future sends')`,
        [activity.lead_id]
      );
    }
  }

  else if (type === 'email.complained') {
    const messageId = data?.email_id;
    const activity = findLeadByMessageId(messageId);
    if (activity) {
      db.run(
        'UPDATE leads SET unsubscribed_at = COALESCE(unsubscribed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [activity.lead_id]
      );
      db.run(
        `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'email_complained', 'Spam complaint received', 'Lead marked this email as spam — unsubscribed automatically')`,
        [activity.lead_id]
      );
    }
  }

  res.json({ ok: true });
});

// POST /api/webhooks/email-inbound — future-ready inbound email parser endpoint
// Wire this to CloudMailin, SendGrid Inbound Parse, or similar service
// Expects: { to: "reply+{lead_id}@domain.com", from: "prospect@gmail.com", text: "reply body", subject: "Re: ..." }
router.post('/email-inbound', (req, res) => {
  const { to, from, text, subject } = req.body;

  // Extract lead_id from reply+{id}@domain.com
  const match = (Array.isArray(to) ? to[0] : to || '').match(/reply\+(\d+)@/);
  if (!match) return res.status(400).json({ ok: false, error: 'Could not parse lead_id from To address' });

  const leadId = parseInt(match[1]);
  const lead = db.get('SELECT * FROM leads WHERE id = ?', [leadId]);
  if (!lead) return res.status(404).json({ ok: false, error: 'Lead not found' });

  const replyBody = (text || '').slice(0, 500);

  // Log email reply activity
  db.run(
    'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
    [leadId, 'email_replied', 'Prospect replied via email', replyBody,
     JSON.stringify({ from, subject: subject || '' })]
  );

  // Auto-pause all active enrollments for this lead
  db.run(
    "UPDATE lead_sequences SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE lead_id = ? AND status = 'active'",
    [leadId]
  );

  db.run(
    'INSERT INTO activities (lead_id, type, title, description) VALUES (?, ?, ?, ?)',
    [leadId, 'note', 'Sequence auto-paused', 'Lead replied via email (auto-detected) — all active sequences paused']
  );

  res.json({ ok: true, lead_id: leadId });
});

module.exports = router;
