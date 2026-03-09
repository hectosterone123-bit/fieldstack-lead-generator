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

    res.json({
      success: true,
      data: {
        total_leads,
        by_status,
        by_service_type,
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
      }
    });
  } catch (err) { next(err); }
});

module.exports = router;
