const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/webhooks/resend — Resend email event webhook
// Configure in Resend dashboard → Webhooks → Add endpoint
// URL: https://your-app.up.railway.app/api/webhooks/resend
// Events to enable: email.opened
router.post('/resend', (req, res) => {
  const { type, data } = req.body;

  if (type === 'email.opened') {
    const messageId = data?.email_id;
    if (messageId) {
      const activity = db.get(
        `SELECT lead_id FROM activities WHERE type = 'email_sent' AND json_extract(metadata, '$.resend_message_id') = ? LIMIT 1`,
        [messageId]
      );
      if (activity) {
        db.run(
          'UPDATE leads SET email_opened_at = COALESCE(email_opened_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [activity.lead_id]
        );
        db.run(
          `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'email_opened', 'Email opened', 'Prospect opened your email')`,
          [activity.lead_id]
        );
      }
    }
  }

  res.json({ ok: true });
});

module.exports = router;
