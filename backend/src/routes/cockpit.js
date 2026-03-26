const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/cockpit/today
router.get('/today', (req, res, next) => {
  try {
    const calls_today = db.get(
      `SELECT COUNT(*) as count FROM activities WHERE type = 'call_attempt' AND date(created_at) = date('now')`
    )?.count || 0;

    const emails_today = db.get(
      `SELECT COUNT(*) as count FROM activities WHERE type = 'email_sent' AND date(created_at) = date('now')`
    )?.count || 0;

    const sms_today = db.get(
      `SELECT COUNT(*) as count FROM activities WHERE type = 'sms_sent' AND date(created_at) = date('now')`
    )?.count || 0;

    const leads_added_today = db.get(
      `SELECT COUNT(*) as count FROM leads WHERE date(created_at) = date('now')`
    )?.count || 0;

    const demos_booked_today = db.get(
      `SELECT COUNT(*) as count FROM activities WHERE type = 'status_change' AND title LIKE '%booked%' AND date(created_at) = date('now')`
    )?.count || 0;

    const demos_this_month = db.get(
      `SELECT COUNT(*) as count FROM activities WHERE type = 'status_change' AND title LIKE '%booked%' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`
    )?.count || 0;

    const followups_completed_today = db.get(
      `SELECT COUNT(DISTINCT lead_id) as count FROM activities WHERE type IN ('call_attempt', 'email_sent', 'sms_sent') AND date(created_at) = date('now')`
    )?.count || 0;

    const status_changes_today = db.get(
      `SELECT COUNT(*) as count FROM activities WHERE type = 'status_change' AND date(created_at) = date('now')`
    )?.count || 0;

    const enriched_today = db.get(
      `SELECT COUNT(*) as count FROM activities WHERE type = 'enrichment' AND date(created_at) = date('now')`
    )?.count || 0;

    const followups_due = db.get(
      `SELECT COUNT(*) as count FROM leads WHERE date(next_followup_at) = date('now')`
    )?.count || 0;

    const followups_overdue = db.get(
      `SELECT COUNT(*) as count FROM leads WHERE next_followup_at < date('now') AND next_followup_at IS NOT NULL AND status NOT IN ('lost', 'closed_won')`
    )?.count || 0;

    res.json({
      success: true,
      data: {
        calls_today,
        emails_today,
        sms_today,
        leads_added_today,
        demos_booked_today,
        demos_this_month,
        followups_completed_today,
        status_changes_today,
        enriched_today,
        followups_due,
        followups_overdue,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/cockpit/targets
router.get('/targets', (req, res, next) => {
  try {
    const defs = {
      cockpit_target_calls: 40,
      cockpit_target_emails: 20,
      cockpit_target_demos: 1,
      cockpit_target_leads: 40,
      cockpit_monthly_goal: 5,
    };

    const result = {};
    for (const [key, def] of Object.entries(defs)) {
      const row = db.get(`SELECT value FROM settings WHERE key = ?`, [key]);
      const shortKey = key.replace('cockpit_target_', '').replace('cockpit_', '');
      result[shortKey] = row ? parseInt(row.value, 10) : def;
    }

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// PUT /api/cockpit/targets
router.put('/targets', (req, res, next) => {
  try {
    const { calls, emails, demos, leads, monthly_goal } = req.body;
    const pairs = [
      ['cockpit_target_calls', calls],
      ['cockpit_target_emails', emails],
      ['cockpit_target_demos', demos],
      ['cockpit_target_leads', leads],
      ['cockpit_monthly_goal', monthly_goal],
    ];

    for (const [key, value] of pairs) {
      if (value != null) {
        db.run(
          `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [key, String(value)]
        );
      }
    }

    const result = {};
    const defs = { cockpit_target_calls: 40, cockpit_target_emails: 20, cockpit_target_demos: 1, cockpit_target_leads: 40, cockpit_monthly_goal: 5 };
    for (const [key, def] of Object.entries(defs)) {
      const row = db.get(`SELECT value FROM settings WHERE key = ?`, [key]);
      const shortKey = key.replace('cockpit_target_', '').replace('cockpit_', '');
      result[shortKey] = row ? parseInt(row.value, 10) : def;
    }

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /api/cockpit/hot-leads
router.get('/hot-leads', (req, res, next) => {
  try {
    const leads = db.all(`
      SELECT id, business_name, phone, city, state, service_type, heat_score, status, last_contacted_at
      FROM leads
      WHERE status NOT IN ('lost', 'closed_won', 'booked')
        AND phone IS NOT NULL AND phone != ''
      ORDER BY heat_score DESC, COALESCE(last_contacted_at, '0001-01-01') ASC
      LIMIT 8
    `);
    res.json({ success: true, data: leads });
  } catch (err) { next(err); }
});

// GET /api/cockpit/alerts
router.get('/alerts', (req, res, next) => {
  try {
    const hot_replies = db.all(`
      SELECT a.id, a.created_at, l.id as lead_id, l.business_name, l.phone, l.status
      FROM activities a
      JOIN leads l ON l.id = a.lead_id
      WHERE a.type = 'email_replied'
        AND a.created_at >= datetime('now', '-48 hours')
      ORDER BY a.created_at DESC
      LIMIT 10
    `);

    const upcoming_demos = db.all(`
      SELECT id, business_name, phone, city, service_type, next_followup_at
      FROM leads
      WHERE status = 'booked'
        AND next_followup_at IS NOT NULL
        AND date(next_followup_at) BETWEEN date('now') AND date('now', '+7 days')
      ORDER BY next_followup_at ASC
      LIMIT 5
    `);

    res.json({ success: true, data: { hot_replies, upcoming_demos } });
  } catch (err) { next(err); }
});

module.exports = router;
