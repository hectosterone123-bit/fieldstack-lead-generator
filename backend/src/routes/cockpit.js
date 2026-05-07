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

    const outcome_rows = db.all(
      `SELECT outcome, COUNT(*) as count FROM calls WHERE date(created_at) = date('now') AND outcome IS NOT NULL GROUP BY outcome`
    );
    const call_outcomes_today = {};
    for (const row of outcome_rows) call_outcomes_today[row.outcome] = row.count;

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
        call_outcomes_today,
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
      SELECT * FROM (
        SELECT 'sms' as channel, m.id, m.created_at, l.id as lead_id, l.business_name, l.phone, l.status,
               substr(m.body, 1, 80) as message
        FROM sms_messages m
        JOIN leads l ON l.id = m.lead_id
        WHERE m.direction = 'inbound'
          AND m.created_at >= datetime('now', '-24 hours')
          AND NOT EXISTS (
            SELECT 1 FROM sms_messages m2
            WHERE m2.lead_id = m.lead_id AND m2.direction = 'outbound' AND m2.created_at > m.created_at
          )
        UNION ALL
        SELECT 'email' as channel, a.id, a.created_at, l.id as lead_id, l.business_name, l.phone, l.status,
               a.title as message
        FROM activities a
        JOIN leads l ON l.id = a.lead_id
        WHERE a.type = 'email_replied'
          AND a.created_at >= datetime('now', '-24 hours')
      ) ORDER BY created_at DESC
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

// POST /api/cockpit/morning-brief — AI morning brief for calling session
router.post('/morning-brief', async (req, res, next) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'GEMINI_API_KEY not configured' });
    }

    // Gather pipeline stats for context
    const totalCallable = db.get(`
      SELECT COUNT(*) as count FROM leads
      WHERE phone IS NOT NULL AND phone != ''
        AND status NOT IN ('booked', 'lost', 'closed_won')
        AND dnc_at IS NULL
    `)?.count || 0;

    const newToday = db.get(`
      SELECT COUNT(*) as count FROM leads
      WHERE date(created_at) = date('now')
        AND status = 'new'
    `)?.count || 0;

    const overdue = db.get(`
      SELECT COUNT(*) as count FROM leads
      WHERE next_followup_at IS NOT NULL
        AND datetime(next_followup_at) <= datetime('now')
        AND status NOT IN ('booked', 'lost', 'closed_won')
    `)?.count || 0;

    const hot = db.get(`
      SELECT AVG(heat_score) as avg_heat FROM leads
      WHERE status NOT IN ('booked', 'lost', 'closed_won')
        AND phone IS NOT NULL
        AND dnc_at IS NULL
    `)?.avg_heat || 0;

    const prompt = `You are a sales coach for a solo HVAC contractor running a cold calling operation.

Pipeline summary:
- Total callable leads: ${totalCallable}
- New leads today: ${newToday}
- Overdue follow-ups: ${overdue}
- Average lead heat score: ${Math.round(hot)}/100

Write a 2–3 sentence morning brief:
1. Who to focus on today (new, hot, overdue, etc.)
2. What's the highest-leverage action right now
3. Whether they need to find more leads (if < 25 total callable)

Be direct, specific, and motivating. No fluff.`;

    const body = {
      model: 'gemini-2.5-flash',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    };

    const geminiRes = await fetch(`${process.env.GEMINI_API_KEY ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' : ''}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('[Cockpit] Gemini error:', err);
      return res.status(500).json({ success: false, error: 'Gemini API error' });
    }

    const data = await geminiRes.json();
    const brief = data.choices?.[0]?.message?.content || 'Unable to generate brief.';

    // Determine if user needs more leads
    const add_leads = totalCallable < 25 || (newToday === 0 && totalCallable < 50);
    const add_leads_reason = totalCallable < 25
      ? `Only ${totalCallable} callable leads left`
      : 'No new leads today — go run a Finder search';

    res.json({
      success: true,
      data: {
        brief,
        add_leads,
        add_leads_reason,
        pipeline_stats: { totalCallable, newToday, overdue, avg_heat: Math.round(hot) },
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
