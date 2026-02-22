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
        recent_activities
      }
    });
  } catch (err) { next(err); }
});

module.exports = router;
