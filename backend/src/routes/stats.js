const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/stats
router.get('/', (req, res, next) => {
  try {
    const total_leads = db.get('SELECT COUNT(*) as count FROM leads')?.count || 0;

    const by_status = db.all(
      `SELECT status, COUNT(*) as count FROM leads GROUP BY status ORDER BY count DESC`
    );

    const by_service_type = db.all(
      `SELECT service_type, COUNT(*) as count FROM leads GROUP BY service_type ORDER BY count DESC`
    );

    const by_source = db.all(
      `SELECT source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC`
    );

    const pipeline_value = db.get(
      `SELECT SUM(estimated_value) as total FROM leads WHERE status NOT IN ('lost')`
    )?.total || 0;

    const hot_leads_count = db.get(
      `SELECT COUNT(*) as count FROM leads WHERE heat_score >= 70`
    )?.count || 0;

    const booked_count = db.get(
      `SELECT COUNT(*) as count FROM leads WHERE status = 'booked' OR status = 'closed_won'`
    )?.count || 0;

    const conversion_rate = total_leads > 0
      ? Math.round((booked_count / total_leads) * 100)
      : 0;

    const contacted_this_week = db.get(
      `SELECT COUNT(*) as count FROM leads WHERE last_contacted_at >= datetime('now', '-7 days')`
    )?.count || 0;

    const recent_activities = db.all(
      `SELECT a.*, l.business_name FROM activities a
       JOIN leads l ON l.id = a.lead_id
       ORDER BY a.created_at DESC LIMIT 10`
    );

    // Leads found this week
    const leads_found_this_week = db.get(
      `SELECT COUNT(*) as count FROM leads WHERE created_at >= datetime('now', '-7 days')`
    )?.count || 0;

    // Enrichment rate: % of leads with phone OR email
    const enrichment_row = db.get(
      `SELECT COUNT(*) as total,
         SUM(CASE WHEN (phone IS NOT NULL AND phone != '') OR (email IS NOT NULL AND email != '') THEN 1 ELSE 0 END) as enriched
       FROM leads`
    );
    const enrichment_rate = enrichment_row?.total > 0
      ? Math.round((enrichment_row.enriched / enrichment_row.total) * 100)
      : 0;

    // Outreach coverage: % of leads past 'new' status
    const outreach_row = db.get(
      `SELECT COUNT(*) as total,
         SUM(CASE WHEN status != 'new' THEN 1 ELSE 0 END) as worked
       FROM leads`
    );
    const outreach_coverage = outreach_row?.total > 0
      ? Math.round((outreach_row.worked / outreach_row.total) * 100)
      : 0;

    // Avg untouched age: days since creation for leads still in 'new'
    const avg_untouched_row = db.get(
      `SELECT AVG(julianday('now') - julianday(created_at)) as avg_days FROM leads WHERE status = 'new'`
    );
    const avg_untouched_age_days = avg_untouched_row?.avg_days != null
      ? Math.round(avg_untouched_row.avg_days)
      : null;

    // Speed-to-lead: avg minutes from lead creation to first contact
    const speed_row = db.get(
      `SELECT
         AVG((julianday(first_contacted_at) - julianday(created_at)) * 24 * 60) as avg_minutes,
         MIN((julianday(first_contacted_at) - julianday(created_at)) * 24 * 60) as best_minutes,
         COUNT(*) as sample_size
       FROM leads WHERE first_contacted_at IS NOT NULL`
    );
    const avg_speed_to_lead_minutes = speed_row?.avg_minutes != null
      ? Math.round(speed_row.avg_minutes * 10) / 10
      : null;
    const best_speed_to_lead_minutes = speed_row?.best_minutes != null
      ? Math.round(speed_row.best_minutes * 10) / 10
      : null;
    const speed_to_lead_sample = speed_row?.sample_size || 0;

    // Deal tracking stats
    const total_won_revenue = db.get(
      `SELECT COALESCE(SUM(won_amount), 0) as total FROM leads WHERE status = 'closed_won' AND won_amount IS NOT NULL`
    )?.total || 0;

    const avg_deal_size = db.get(
      `SELECT AVG(won_amount) as avg FROM leads WHERE status = 'closed_won' AND won_amount IS NOT NULL`
    )?.avg || 0;

    const deals_closed_this_month = db.get(
      `SELECT COUNT(*) as count FROM leads WHERE status = 'closed_won' AND updated_at >= date('now', 'start of month')`
    )?.count || 0;

    const revenue_this_month = db.get(
      `SELECT COALESCE(SUM(won_amount), 0) as total FROM leads WHERE status = 'closed_won' AND won_amount IS NOT NULL AND updated_at >= date('now', 'start of month')`
    )?.total || 0;

    const proposals_open = db.get(
      `SELECT COUNT(*) as count, COALESCE(SUM(proposal_amount), 0) as total FROM leads WHERE status = 'proposal_sent' AND proposal_amount IS NOT NULL`
    );

    // Outreach performance summary
    const total_emails_sent = db.get(
      `SELECT COUNT(*) as count FROM activities WHERE type = 'email_sent'`
    )?.count || 0;

    const total_opens = db.get(
      `SELECT COUNT(*) as count FROM leads WHERE email_opened_at IS NOT NULL`
    )?.count || 0;

    const total_replies = db.get(
      `SELECT COUNT(*) as count FROM activities WHERE type = 'email_replied'`
    )?.count || 0;

    const active_enrollments = db.get(
      `SELECT COUNT(*) as count FROM lead_sequences WHERE status = 'active'`
    )?.count || 0;

    const completed_enrollments = db.get(
      `SELECT COUNT(*) as count FROM lead_sequences WHERE status = 'completed'`
    )?.count || 0;

    const outreach_summary = {
      total_emails_sent,
      total_opens,
      total_replies,
      open_rate: total_emails_sent > 0 ? Math.round((total_opens / total_emails_sent) * 100) : 0,
      reply_rate: total_emails_sent > 0 ? Math.round((total_replies / total_emails_sent) * 100) : 0,
      active_enrollments,
      completed_enrollments,
    };

    // Per-step performance: parse sequence steps JSON, join with activities
    let step_performance = [];
    try {
      const sequences_raw = db.all(`SELECT id, name, steps FROM sequences WHERE is_active = 1`);
      for (const seq of sequences_raw) {
        const steps = JSON.parse(seq.steps || '[]');
        const stepStats = [];
        for (const step of steps) {
          const stepNum = step.order;
          // Count sends for this step by matching activity title pattern "Step N" or step label
          const sent = db.get(
            `SELECT COUNT(*) as count FROM activities a
             JOIN lead_sequences ls ON ls.lead_id = a.lead_id AND ls.sequence_id = ?
             WHERE a.type = 'email_sent' AND a.title LIKE ?`,
            [seq.id, `%Step ${stepNum}%`]
          )?.count || 0;

          const opened = db.get(
            `SELECT COUNT(*) as count FROM leads l
             JOIN lead_sequences ls ON ls.lead_id = l.id AND ls.sequence_id = ?
             WHERE ls.current_step > ? AND l.email_opened_at IS NOT NULL`,
            [seq.id, stepNum]
          )?.count || 0;

          const replied = db.get(
            `SELECT COUNT(*) as count FROM activities a
             JOIN lead_sequences ls ON ls.lead_id = a.lead_id AND ls.sequence_id = ?
             WHERE a.type = 'email_replied' AND a.title LIKE ?`,
            [seq.id, `%Step ${stepNum}%`]
          )?.count || 0;

          stepStats.push({
            step: stepNum,
            label: step.label || `Step ${stepNum}`,
            channel: step.channel,
            sent,
            opened,
            replied,
            open_rate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
            reply_rate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
          });
        }
        step_performance.push({
          sequence_id: seq.id,
          sequence_name: seq.name,
          steps: stepStats,
        });
      }
    } catch (e) {
      // step_performance stays empty if sequences table doesn't exist yet
    }

    // Re-queue eligible count
    const requeue_settings = db.get("SELECT value FROM settings WHERE key = 'requeue_enabled'");
    const requeue_delay = db.get("SELECT value FROM settings WHERE key = 'requeue_delay_days'");
    const requeue_max = db.get("SELECT value FROM settings WHERE key = 'requeue_max_times'");
    const rqEnabled = requeue_settings?.value === '1';
    const rqDelay = parseInt(requeue_delay?.value) || 30;
    const rqMax = parseInt(requeue_max?.value) || 2;

    let requeue_eligible = 0;
    try {
      requeue_eligible = db.get(`
        SELECT COUNT(DISTINCT l.id) as count FROM leads l
        LEFT JOIN lead_sequences ls_active ON ls_active.lead_id = l.id AND ls_active.status IN ('active', 'paused')
        WHERE ls_active.id IS NULL
          AND (l.unsubscribed_at IS NULL OR l.unsubscribed_at = '')
          AND l.status NOT IN ('lost', 'closed_won', 'booked')
          AND COALESCE(l.requeue_count, 0) < ?
          AND (
            EXISTS (
              SELECT 1 FROM lead_sequences ls2
              WHERE ls2.lead_id = l.id AND ls2.status = 'completed'
              AND ls2.completed_at < datetime('now', '-' || ? || ' days')
            )
            OR (
              l.status IN ('contacted', 'qualified')
              AND l.last_contacted_at IS NOT NULL
              AND l.last_contacted_at < datetime('now', '-' || ? || ' days')
            )
          )
      `, [rqMax, rqDelay, rqDelay])?.count || 0;
    } catch (e) {
      // requeue_count column may not exist yet
    }

    const ghost_count = db.get(`
      SELECT COUNT(*) as count FROM leads
      WHERE status IN ('contacted', 'qualified')
      AND last_contacted_at IS NOT NULL
      AND last_contacted_at < datetime('now', '-7 days')
      AND (unsubscribed_at IS NULL OR unsubscribed_at = '')
    `)?.count || 0;

    const ghost_leads = db.all(`
      SELECT id, business_name, last_contacted_at, status, phone, service_type
      FROM leads
      WHERE status IN ('contacted', 'qualified')
      AND last_contacted_at IS NOT NULL
      AND last_contacted_at < datetime('now', '-7 days')
      AND (unsubscribed_at IS NULL OR unsubscribed_at = '')
      ORDER BY last_contacted_at ASC
      LIMIT 5
    `);

    // Reply alerts: leads who replied to email in last 7 days with no outbound follow-up since
    const replied_leads = db.all(`
      SELECT l.id, l.business_name, l.owner_name, l.phone, l.heat_score, l.service_type, l.city,
             MAX(a.created_at) as replied_at
      FROM leads l
      JOIN activities a ON a.lead_id = l.id AND a.type = 'email_replied'
      WHERE a.created_at > datetime('now', '-7 days')
        AND l.status NOT IN ('lost', 'closed_won')
        AND NOT EXISTS (
          SELECT 1 FROM activities a2
          WHERE a2.lead_id = l.id
            AND a2.type IN ('call_attempt', 'email_sent', 'sms_sent')
            AND a2.created_at > a.created_at
        )
      GROUP BY l.id
      ORDER BY replied_at DESC
      LIMIT 5
    `);

    // Hot signals: leads who opened an email in last 48h but haven't been called back yet
    const hot_signal_leads = db.all(`
      SELECT l.id, l.business_name, l.owner_name, l.phone, l.heat_score, l.email_opened_at, l.service_type, l.city
      FROM leads l
      WHERE l.email_opened_at > datetime('now', '-48 hours')
        AND l.status NOT IN ('lost', 'closed_won')
        AND NOT EXISTS (
          SELECT 1 FROM activities a
          WHERE a.lead_id = l.id AND a.type = 'call_attempt'
            AND a.created_at > l.email_opened_at
        )
      ORDER BY l.email_opened_at DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        total_leads,
        by_status,
        by_service_type,
        by_source,
        pipeline_value,
        hot_leads_count,
        booked_count,
        conversion_rate,
        contacted_this_week,
        recent_activities,
        leads_found_this_week,
        enrichment_rate,
        outreach_coverage,
        avg_untouched_age_days,
        avg_speed_to_lead_minutes,
        best_speed_to_lead_minutes,
        speed_to_lead_sample,
        total_won_revenue,
        avg_deal_size: Math.round(avg_deal_size),
        deals_closed_this_month,
        revenue_this_month,
        proposals_open_count: proposals_open?.count || 0,
        proposals_open_value: proposals_open?.total || 0,
        ghost_count,
        ghost_leads,
        replied_leads,
        hot_signal_leads,
        outreach_summary,
        step_performance,
        requeue_eligible,
      }
    });
  } catch (err) { next(err); }
});

// GET /api/stats/setup — setup checklist status
router.get('/setup', (req, res) => {
  const checks = {
    resend_configured: !!(process.env.RESEND_API_KEY &&
      db.get("SELECT value FROM settings WHERE key = 'resend_from'")?.value),
    twilio_configured: !!(process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER),
    has_leads: (db.get('SELECT COUNT(*) as c FROM leads')?.c || 0) > 0,
    has_sequence: (db.get("SELECT COUNT(*) as c FROM sequences WHERE is_template = 0 AND is_active = 1")?.c || 0) > 0,
    has_enrollments: (db.get('SELECT COUNT(*) as c FROM lead_sequences')?.c || 0) > 0,
    booking_link_set: !!(db.get("SELECT value FROM settings WHERE key = 'booking_link'")?.value),
  };
  const complete = Object.values(checks).every(Boolean);
  res.json({ success: true, data: { complete, checks } });
});

module.exports = router;
