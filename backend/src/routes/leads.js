const express = require('express');
const router = express.Router();
const db = require('../db');
const { scrapeWebsite, extractRecentHighlights } = require('../services/scrapeService');
const { recomputeHeatScore, computeInitialHeatScore } = require('../services/heatScoreService');
const eventBus = require('../services/eventBus');
const smsService = require('../services/smsService');
const { autoEnrollLeads, getDefaultSequenceId } = require('../services/enrollmentService');
const { getTimezone } = require('../services/timezoneService');
const { validatePhoneForLead, validatePhonesAsync } = require('../services/phoneValidationService');
const { analyzeGaps } = require('../services/gapService');
const { generatePitch, generateColdWrite } = require('../services/claudeService');

function formatResponseTime(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

function autoUpdateHeatScore(id) {
  const lead = db.get('SELECT * FROM leads WHERE id = ?', [id]);
  if (!lead) return;
  const newScore = recomputeHeatScore(lead);
  if (newScore !== lead.heat_score) {
    db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newScore, id]);
  }
}

// GET /api/leads — paginated list with filters
router.get('/', (req, res, next) => {
  try {
    const {
      status, service_type, search, tag,
      sort = 'created_at', order = 'desc',
      page = 1, limit = 25
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      conditions.push('status = ?');
      params.push(status);
    }
    if (service_type && service_type !== 'all') {
      conditions.push('service_type = ?');
      params.push(service_type);
    }
    if (search) {
      conditions.push('(business_name LIKE ? OR city LIKE ? OR phone LIKE ? OR email LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (tag) {
      conditions.push('tags LIKE ?');
      params.push(`%"${tag}"%`);
    }
    if (req.query.no_response === 'true') {
      conditions.push('test_submitted_at IS NOT NULL AND test_responded_at IS NULL');
    }
    if (req.query.no_website === 'true') {
      conditions.push('(has_website = 0 OR has_website IS NULL)');
    }
    if (req.query.phone_valid === 'true') {
      conditions.push('phone_valid = 1');
    }
    if (req.query.mobile_only === 'true') {
      conditions.push("phone_line_type = 'mobile'");
    }
    if (req.query.no_gatekeeper === 'true') {
      conditions.push('(gatekeeper_count IS NULL OR gatekeeper_count = 0)');
    }
    if (req.query.has_direct_phone === 'true') {
      conditions.push("direct_phone IS NOT NULL AND direct_phone != ''");
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const validSorts = ['created_at', 'updated_at', 'heat_score', 'business_name', 'status', 'estimated_value'];
    const sortCol = validSorts.includes(sort) ? sort : 'created_at';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';

    const total = db.get(`SELECT COUNT(*) as count FROM leads ${where}`, params)?.count || 0;
    const leads = db.all(
      `SELECT * FROM leads ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: leads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) { next(err); }
});

// PATCH /api/leads/bulk — bulk actions (status, delete, export)
router.patch('/bulk', (req, res, next) => {
  try {
    const { ids, action, value } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids array is required' });
    }

    if (action === 'status') {
      const validStatuses = ['new','contacted','qualified','proposal_sent','booked','lost','closed_won'];
      if (!validStatuses.includes(value)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
      }
      let affected = 0;
      for (const id of ids) {
        const lead = db.get('SELECT * FROM leads WHERE id = ?', [id]);
        if (!lead) continue;
        const oldStatus = lead.status;
        db.run('UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [value, id]);
        db.run(
          `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'status_change', ?, ?)`,
          [id, `Status changed to ${value}`, `Was: ${oldStatus} → Now: ${value}`]
        );
        autoUpdateHeatScore(id);
        affected++;
      }
      return res.json({ success: true, data: { affected } });
    }

    if (action === 'delete') {
      let affected = 0;
      for (const id of ids) {
        const lead = db.get('SELECT id FROM leads WHERE id = ?', [id]);
        if (!lead) continue;
        db.run('DELETE FROM activities WHERE lead_id = ?', [id]);
        db.run('DELETE FROM leads WHERE id = ?', [id]);
        affected++;
      }
      return res.json({ success: true, data: { affected } });
    }

    if (action === 'export') {
      const headers = ['id','business_name','phone','email','website','address','city','state','zip','service_type','status','heat_score','estimated_value','source','contact_count','last_contacted_at','notes','created_at'];
      const rows = [];
      for (const id of ids) {
        const lead = db.get('SELECT * FROM leads WHERE id = ?', [id]);
        if (lead) rows.push(lead);
      }
      const csv = [
        headers.join(','),
        ...rows.map(l => headers.map(h => {
          const val = l[h] ?? '';
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(','))
      ].join('\n');
      return res.json({ success: true, data: { csv } });
    }

    if (action === 'mark_contacted') {
      let affected = 0;
      for (const id of ids) {
        const lead = db.get('SELECT * FROM leads WHERE id = ?', [id]);
        if (!lead) continue;
        db.run(
          'INSERT INTO activities (lead_id, type, title, description) VALUES (?, ?, ?, ?)',
          [id, 'email_sent', 'Manual outreach logged', 'Marked as contacted (bulk)']
        );
        db.run(
          'UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, first_contacted_at = CASE WHEN first_contacted_at IS NULL THEN CURRENT_TIMESTAMP ELSE first_contacted_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [id]
        );
        if (lead.status === 'new') {
          db.run("UPDATE leads SET status = 'contacted', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
        }
        autoUpdateHeatScore(id);
        affected++;
      }
      return res.json({ success: true, data: { affected } });
    }

    if (action === 'callback') {
      if (!value) return res.status(400).json({ success: false, error: 'value (ISO datetime) required' });
      let affected = 0;
      for (const id of ids) {
        const lead = db.get('SELECT id FROM leads WHERE id = ?', [id]);
        if (!lead) continue;
        db.run('UPDATE leads SET next_followup_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [value, id]);
        affected++;
      }
      return res.json({ success: true, data: { affected } });
    }

    if (action === 'snooze') {
      const days = parseInt(value, 10) || 1;
      let affected = 0;
      for (const id of ids) {
        const lead = db.get('SELECT next_followup_at FROM leads WHERE id = ?', [id]);
        if (!lead) continue;
        const base = lead.next_followup_at ? new Date(lead.next_followup_at) : new Date();
        base.setDate(base.getDate() + days);
        db.run('UPDATE leads SET next_followup_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [base.toISOString(), id]);
        affected++;
      }
      return res.json({ success: true, data: { affected } });
    }

    return res.status(400).json({ success: false, error: 'Invalid action' });
  } catch (err) { next(err); }
});

// POST /api/leads/bulk/export — bulk CSV download
router.post('/bulk/export', (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids array is required' });
    }
    const headers = ['id','business_name','phone','email','website','address','city','state','zip','service_type','status','heat_score','estimated_value','source','contact_count','last_contacted_at','notes','created_at'];
    const rows = [];
    for (const id of ids) {
      const lead = db.get('SELECT * FROM leads WHERE id = ?', [id]);
      if (lead) rows.push(lead);
    }
    const csv = [
      headers.join(','),
      ...rows.map(l => headers.map(h => {
        const val = l[h] ?? '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads-export.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

// POST /api/leads/bulk/enrich — bulk website enrichment
router.post('/bulk/enrich', async (req, res, next) => {
  try {
    const { ids } = req.body;
    let leads;
    if (Array.isArray(ids) && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      leads = db.all(
        `SELECT * FROM leads WHERE id IN (${placeholders}) AND website IS NOT NULL AND website != ''`,
        ids
      );
    } else {
      leads = db.all(
        `SELECT * FROM leads WHERE website IS NOT NULL AND website != '' AND enriched_at IS NULL`
      );
    }

    if (leads.length === 0) {
      return res.json({ success: true, data: { total: 0, enriched: 0, failed: 0, skipped: 0 } });
    }

    const CONCURRENCY = 3;
    let enriched = 0, failed = 0, skipped = 0;

    for (let i = 0; i < leads.length; i += CONCURRENCY) {
      const batch = leads.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (lead) => {
          if (lead.enriched_at) { skipped++; return; }

          try {
            console.log(`[Bulk Enrich] Scraping ${lead.website} for lead ${lead.id}`);
            const result = await scrapeWebsite(lead.website);

            const enrichmentJson = JSON.stringify(result);
            db.run(
              'UPDATE leads SET enrichment_data = ?, enriched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [enrichmentJson, lead.id]
            );

            if (!lead.email && result.emails && result.emails.length > 0) {
              db.run('UPDATE leads SET email = ? WHERE id = ?', [result.emails[0], lead.id]);
            }
            autoUpdateHeatScore(lead.id);

            const parts = [];
            if (result.error) {
              parts.push(`Error: ${result.error}`);
            } else {
              if (result.emails?.length) parts.push(`${result.emails.length} email(s)`);
              if (result.team_names?.length) parts.push(`${result.team_names.length} team name(s)`);
              if (result.services?.length) parts.push(`${result.services.length} service(s)`);
              if (result.tech_stack) parts.push(`Tech: ${result.tech_stack}`);
            }

            db.run(
              `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'enrichment', 'Website enriched', ?)`,
              [lead.id, parts.join(', ') || 'No data extracted']
            );

            enriched++;
          } catch (err) {
            console.error(`[Bulk Enrich] Failed for lead ${lead.id}:`, err.message);
            failed++;
          }
        })
      );
    }

    return res.json({ success: true, data: { total: leads.length, enriched, failed, skipped } });
  } catch (err) { next(err); }
});

// POST /api/leads/bulk/send-email — mass email via Resend with template (optionally AI-personalized)
router.post('/bulk/send-email', async (req, res, next) => {
  try {
    const { template_id, lead_ids, status, service_type, not_contacted_days, ai_personalize } = req.body;
    if (!template_id) return res.status(400).json({ success: false, error: 'template_id required' });

    const template = db.get('SELECT * FROM templates WHERE id = ?', [template_id]);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
    if (template.channel !== 'email') return res.status(400).json({ success: false, error: 'Template is not an email template' });

    let leads;
    if (Array.isArray(lead_ids) && lead_ids.length > 0) {
      leads = db.all(
        `SELECT * FROM leads WHERE id IN (${lead_ids.map(() => '?').join(',')}) AND email IS NOT NULL AND email != '' AND (unsubscribed_at IS NULL OR unsubscribed_at = '')`,
        lead_ids
      );
    } else {
      const conditions = ["email IS NOT NULL AND email != ''", "(unsubscribed_at IS NULL OR unsubscribed_at = '')"];
      const params = [];
      if (status) { conditions.push('status = ?'); params.push(status); }
      if (service_type) { conditions.push('service_type = ?'); params.push(service_type); }
      if (not_contacted_days && parseInt(not_contacted_days) > 0) {
        conditions.push(`(last_contacted_at IS NULL OR datetime(last_contacted_at) <= datetime('now', '-${parseInt(not_contacted_days)} days'))`);
      }
      leads = db.all(`SELECT * FROM leads WHERE ${conditions.join(' AND ')} ORDER BY heat_score DESC`, params);
    }

    const emailService = require('../services/emailService');
    if (!emailService.isConfigured()) {
      return res.status(503).json({ success: false, error: 'Email not configured (missing RESEND_API_KEY)' });
    }

    const { renderTemplate } = require('../services/templateService');
    const { generatePersonalizedEmail } = require('../services/claudeService');
    const useAI = ai_personalize && process.env.GEMINI_API_KEY;
    let sent = 0, failed = 0, ai_personalized = 0;
    const errors = [];

    for (const lead of leads) {
      try {
        let subject, body;
        if (useAI) {
          try {
            const p = await generatePersonalizedEmail(lead, template);
            subject = p.subject;
            body = p.body;
            ai_personalized++;
          } catch {
            const rendered = renderTemplate(template, lead);
            subject = rendered.subject || template.subject || 'Follow-up';
            body = rendered.body;
          }
        } else {
          const rendered = renderTemplate(template, lead);
          subject = rendered.subject || template.subject || 'Follow-up';
          body = rendered.body;
        }

        const result = await emailService.sendEmail(lead.email, subject, body);
        if (result.success) {
          sent++;
          db.run(
            'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
            [lead.id, 'email_sent', `Email sent: ${template.name}`, subject,
             JSON.stringify({ resend_message_id: result.messageId, template_id, via: 'bulk_blast', ai_personalized: !!useAI })]
          );
          db.run(
            'UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [lead.id]
          );
          if (lead.status === 'new') {
            db.run("UPDATE leads SET status = 'contacted', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [lead.id]);
          }
        } else {
          failed++;
          errors.push(`${lead.business_name}: ${result.error}`);
        }
      } catch (err) {
        failed++;
        errors.push(`${lead.business_name}: ${err.message}`);
      }
    }

    res.json({ success: true, data: { sent, failed, ai_personalized, total: leads.length, errors: errors.slice(0, 5) } });
  } catch (err) { next(err); }
});

// POST /api/leads/bulk/blast-sms — broadcast a manual SMS to a filtered segment
router.post('/bulk/blast-sms', async (req, res, next) => {
  try {
    const { message, status, service_type, not_contacted_days } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ success: false, error: 'message required' });
    if (!smsService.isConfigured()) return res.status(503).json({ success: false, error: 'Twilio not configured' });

    const conditions = [
      "phone IS NOT NULL AND phone != ''",
      "dnc_at IS NULL",
      "status NOT IN ('lost', 'closed_won')"
    ];
    const params = [];
    if (status) { conditions.push('status = ?'); params.push(status); }
    if (service_type) { conditions.push('service_type = ?'); params.push(service_type); }
    if (not_contacted_days && parseInt(not_contacted_days) > 0) {
      conditions.push(`(last_contacted_at IS NULL OR datetime(last_contacted_at) <= datetime('now', '-${parseInt(not_contacted_days)} days'))`);
    }

    const leads = db.all(
      `SELECT id, business_name, phone, status FROM leads WHERE ${conditions.join(' AND ')} ORDER BY heat_score DESC`,
      params
    );

    let sent = 0, failed = 0, skipped = 0;
    for (const lead of leads) {
      const normalized = smsService.normalizePhone(lead.phone);
      if (!normalized) { skipped++; continue; }
      const optedOut = db.get('SELECT id FROM sms_opt_outs WHERE phone = ?', [normalized]);
      if (optedOut) { skipped++; continue; }

      const result = await smsService.sendSms(lead.phone, message);
      if (!result.success) { failed++; continue; }

      db.run(
        `INSERT INTO sms_messages (lead_id, direction, from_number, to_number, body, twilio_sid, status)
         VALUES (?, 'outbound', ?, ?, ?, ?, ?)`,
        [lead.id, process.env.TWILIO_PHONE_NUMBER, normalized, message, result.sid || null, 'sent']
      );
      db.run(
        'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
        [lead.id, 'sms_sent', 'SMS blast', message.substring(0, 100),
         JSON.stringify({ twilio_sid: result.sid, bulk: true })]
      );
      db.run(
        `UPDATE leads SET contact_count = contact_count + 1,
         last_contacted_at = CURRENT_TIMESTAMP,
         first_contacted_at = CASE WHEN first_contacted_at IS NULL THEN CURRENT_TIMESTAMP ELSE first_contacted_at END,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [lead.id]
      );
      if (lead.status === 'new') {
        db.run("UPDATE leads SET status = 'contacted', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [lead.id]);
      }
      sent++;
    }

    res.json({ success: true, data: { sent, failed, skipped, total: leads.length } });
  } catch (err) { next(err); }
});

// GET /api/leads/daily-queue — top 40 leads to cold call today, ranked by priority
// Time-of-day strategy: 9 AM–2 PM = non-gatekeeper leads (owners answer direct lines)
//                       5 PM+      = gatekeeper leads (gatekeepers have left for the day)
//                       2 PM–5 PM  = mixed
router.get('/daily-queue', (req, res, next) => {
  try {
    const now = Date.now();
    // Use Central Time (Austin) — Railway runs UTC, so getHours() would be wrong
    const ctHour = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', hour12: false, hour: 'numeric' });
    const hour = parseInt(ctHour, 10);
    const isMorning = hour >= 9 && hour < 14;
    const isEvening = hour >= 17;

    const leads = db.all(
      `SELECT * FROM leads
       WHERE phone IS NOT NULL AND phone != ''
         AND status NOT IN ('booked', 'lost', 'closed_won')
         AND (dnc_at IS NULL)
         AND (next_followup_at IS NULL OR datetime(next_followup_at) <= datetime('now'))
       ORDER BY heat_score DESC`
    );

    // Morning: ONLY direct contractor numbers — skip office lines entirely
    // Evening: all leads, but gatekeeper leads get score boost
    const filtered = isMorning
      ? leads.filter(lead => lead.direct_phone && lead.direct_phone.trim() !== '')
      : leads;

    const scored = filtered.map(lead => {
      let score = (lead.heat_score || 0) * 0.4;
      const isGatekeeper = (lead.gatekeeper_count || 0) > 0;
      const hasDirectPhone = !!lead.direct_phone;

      // Morning: boost leads with direct contractor numbers
      if (isMorning && hasDirectPhone) score += 25;

      // Status weight
      const sw = { new: 20, contacted: 30, qualified: 40, proposal_sent: 35 };
      score += sw[lead.status] || 0;

      // Never contacted — high priority
      if (!lead.last_contacted_at) score += 30;

      // Recency of last contact
      if (lead.last_contacted_at) {
        const days = Math.floor((now - new Date(lead.last_contacted_at).getTime()) / 86400000);
        if (days >= 3 && days <= 14) score += 20;
        else if (days > 14 && days <= 30) score += 10;
        else if (days > 30) score -= 10;
      }

      // Overdue follow-up
      if (lead.next_followup_at && new Date(lead.next_followup_at).getTime() <= now) score += 25;

      // New lead bonus (added in last 48h)
      const ageHrs = (now - new Date(lead.created_at).getTime()) / 3600000;
      if (ageHrs <= 24) score += 30;
      else if (ageHrs <= 48) score += 15;

      // High rating bonus
      if (lead.rating >= 4.5) score += 5;

      // Evening: boost gatekeeper leads to the top (gatekeepers gone home)
      if (isEvening && isGatekeeper) {
        score += 40;
      }

      // Build reason label
      let reason = 'Follow up';
      if (ageHrs <= 48 && !lead.last_contacted_at) reason = 'New lead — never contacted';
      else if (ageHrs <= 48) reason = 'New lead';
      else if (lead.next_followup_at && new Date(lead.next_followup_at).getTime() <= now) reason = 'Follow-up overdue';
      else if (!lead.last_contacted_at) reason = 'Never contacted';
      else {
        const days = Math.floor((now - new Date(lead.last_contacted_at).getTime()) / 86400000);
        reason = `${days}d since last contact`;
      }
      if (lead.status === 'qualified') reason = `Qualified — ${reason}`;
      else if (lead.status === 'proposal_sent') reason = `Proposal sent — ${reason}`;
      if (isGatekeeper && isEvening) reason = `Gatekeeper bypass — ${reason}`;
      if (isMorning && hasDirectPhone) reason = `Direct line — ${reason}`;

      return { ...lead, _priority: Math.round(score), _reason: reason };
    });

    scored.sort((a, b) => b._priority - a._priority);
    const queue = scored.slice(0, 40);

    // New leads in last 24h (for alert banner)
    const newLeads24h = db.all(
      `SELECT id, business_name, phone, service_type, heat_score, created_at FROM leads
       WHERE datetime(created_at) >= datetime('now', '-24 hours')
       ORDER BY created_at DESC`
    );

    res.json({ success: true, data: { queue, new_leads_24h: newLeads24h } });
  } catch (err) { next(err); }
});

// GET /api/leads/followups/today — leads due for follow-up
router.get('/followups/today', (req, res, next) => {
  try {
    const leads = db.all(
      `SELECT * FROM leads WHERE next_followup_at IS NOT NULL AND date(next_followup_at) <= date('now') AND status NOT IN ('lost', 'closed_won') ORDER BY next_followup_at ASC`,
      []
    );
    const today = new Date().toISOString().slice(0, 10);
    const overdue = leads.filter(l => l.next_followup_at && l.next_followup_at.slice(0, 10) < today);
    const due_today = leads.filter(l => l.next_followup_at && l.next_followup_at.slice(0, 10) === today);
    res.json({ success: true, data: { overdue, due_today } });
  } catch (err) { next(err); }
});

// GET /api/leads/replied — leads with email_replied activity in the last 14 days
router.get('/replied', (req, res, next) => {
  try {
    const leads = db.all(`
      SELECT l.* FROM leads l
      WHERE EXISTS (
        SELECT 1 FROM activities a
        WHERE a.lead_id = l.id
          AND a.type = 'email_replied'
          AND datetime(a.created_at) > datetime('now', '-14 days')
      )
      AND l.status NOT IN ('lost', 'closed_won')
      ORDER BY l.heat_score DESC
    `, []);
    res.json({ success: true, data: leads });
  } catch (err) { next(err); }
});

// GET /api/leads/export — CSV download
router.get('/export', (req, res, next) => {
  try {
    const { status, service_type } = req.query;
    const conditions = [];
    const params = [];
    if (status && status !== 'all') { conditions.push('status = ?'); params.push(status); }
    if (service_type && service_type !== 'all') { conditions.push('service_type = ?'); params.push(service_type); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const leads = db.all(`SELECT * FROM leads ${where} ORDER BY created_at DESC`, params);

    const headers = ['id','business_name','phone','email','website','address','city','state','zip','service_type','status','heat_score','estimated_value','source','contact_count','last_contacted_at','notes','created_at'];
    const csv = [
      headers.join(','),
      ...leads.map(l => headers.map(h => {
        const val = l[h] ?? '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

// POST /api/leads/import-csv — import leads from CSV text
const CSV_COLUMN_ALIASES = {
  business_name: ['business_name', 'business name', 'company', 'name', 'business'],
  phone:         ['phone', 'phone number', 'tel', 'telephone'],
  email:         ['email', 'email address', 'e-mail'],
  website:       ['website', 'url', 'web', 'website url'],
  address:       ['address', 'street', 'street address'],
  city:          ['city'],
  state:         ['state'],
  zip:           ['zip', 'zip code', 'postal code', 'postcode'],
  service_type:  ['service_type', 'service type', 'service', 'type'],
  status:        ['status'],
  heat_score:    ['heat_score', 'heat score', 'heat'],
  estimated_value: ['estimated_value', 'estimated value', 'value'],
  notes:         ['notes', 'note'],
};

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

router.post('/import-csv', (req, res, next) => {
  try {
    const { csv } = req.body;
    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ success: false, error: 'csv string is required' });
    }

    const lines = csv.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      return res.status(400).json({ success: false, error: 'CSV must have a header row and at least one data row' });
    }

    const rawHeaders = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/^["']|["']$/g, '').trim());

    // Build field → column index map
    const colIndex = {};
    for (const [field, aliases] of Object.entries(CSV_COLUMN_ALIASES)) {
      for (const alias of aliases) {
        const idx = rawHeaders.indexOf(alias);
        if (idx !== -1) { colIndex[field] = idx; break; }
      }
    }

    if (colIndex.business_name === undefined) {
      return res.status(400).json({ success: false, error: 'CSV must include a business name column (e.g. "business_name", "Company", or "Name")' });
    }

    const validStatuses = ['new','contacted','qualified','proposal_sent','booked','lost','closed_won'];
    const validServiceTypes = ['hvac','plumbing','electrical','roofing','landscaping','pest_control','general'];

    let imported = 0;
    let skipped = 0;
    const importedIds = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const get = (field) => colIndex[field] !== undefined ? (cols[colIndex[field]] || '').trim() : '';

      const business_name = get('business_name');
      if (!business_name) { skipped++; continue; }

      const website = get('website') || null;
      const phone = get('phone') || null;
      const email = get('email') || null;
      const status = validStatuses.includes(get('status')) ? get('status') : 'new';
      const service_type = validServiceTypes.includes(get('service_type')) ? get('service_type') : 'general';
      const rawScore = parseInt(get('heat_score'));
      const rawValue = parseFloat(get('estimated_value'));
      const estimated_value = !isNaN(rawValue) ? rawValue : 2000;

      const leadForScore = { has_website: website ? 1 : 0, website_live: 0, phone, email, rating: null, review_count: 0 };
      const heat_score = !isNaN(rawScore) ? Math.min(100, Math.max(0, rawScore)) : computeInitialHeatScore(leadForScore);

      // Dedup: phone → email → business_name+city
      if (phone) {
        const dup = db.get('SELECT id FROM leads WHERE phone = ?', [phone]);
        if (dup) { skipped++; continue; }
      }
      if (email) {
        const dup = db.get('SELECT id FROM leads WHERE email = ?', [email]);
        if (dup) { skipped++; continue; }
      }
      {
        const dup = db.get(
          "SELECT id FROM leads WHERE LOWER(business_name) = LOWER(?) AND LOWER(COALESCE(city,'')) = LOWER(COALESCE(?,?))",
          [business_name, get('city') || '', '']
        );
        if (dup) { skipped++; continue; }
      }

      const csvState = get('state') || null;
      const result = db.run(
        `INSERT INTO leads (business_name, phone, email, website, address, city, state, zip, service_type, status, heat_score, estimated_value, has_website, notes, source, timezone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv_import', ?)`,
        [business_name, phone, email, website, get('address') || null, get('city') || null,
         csvState, get('zip') || null, service_type, status, heat_score,
         estimated_value, website ? 1 : 0, get('notes') || null, getTimezone(csvState)]
      );
      db.run(
        `INSERT INTO activities (lead_id, type, title) VALUES (?, 'import', 'Lead imported from CSV')`,
        [result.lastInsertRowid]
      );
      importedIds.push(result.lastInsertRowid);
      imported++;
    }

    // Auto-enroll imported leads into default sequence
    let auto_enrolled = 0;
    const defaultSeqId = getDefaultSequenceId();
    if (defaultSeqId && importedIds.length > 0) {
      const result2 = autoEnrollLeads(importedIds, defaultSeqId);
      auto_enrolled = result2.enrolled;
    }

    res.json({ success: true, data: { imported, skipped, lead_ids: importedIds, auto_enrolled } });

    // Non-blocking phone validation for newly imported leads
    if (importedIds.length > 0) {
      setImmediate(() => validatePhonesAsync(importedIds, db).catch(() => {}));
    }
  } catch (err) { next(err); }
});

// POST /api/leads/import-tdlr — import from Texas TDLR contractor license CSV
const LICENSE_TO_SERVICE = {
  // HVAC — actual TDLR type names
  'a/c contractor': 'hvac',
  'a/c technician': 'hvac',
  'air conditioning and refrigeration contractor': 'hvac',
  'air conditioning and refrigeration technician': 'hvac',
  'hvac': 'hvac',
  'hvac technician': 'hvac',
  // Electrical
  'electrician': 'electrical',
  'master electrician': 'electrical',
  'journeyman electrician': 'electrical',
  'electrical sign': 'electrical',
  'electrical contractor': 'electrical',
  'apprentice electrician': 'electrical',
  // Plumbing
  'plumber': 'plumbing',
  'master plumber': 'plumbing',
  'journeyman plumber': 'plumbing',
  'plumbing contractor': 'plumbing',
  // Landscaping / Irrigation
  'irrigator': 'landscaping',
  'landscape irrigator': 'landscaping',
  'lawn irrigator': 'landscaping',
};

function parseTdlrCityStateZip(raw) {
  if (!raw) return { city: '', state: 'TX', zip: '' };
  const m = raw.trim().match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!m) return { city: raw.trim(), state: 'TX', zip: '' };
  return { city: m[1].trim(), state: m[2], zip: m[3] };
}

function normalizeTdlrPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

function parseTdlrExpiration(raw) {
  if (!raw || raw.trim().length < 8) return null;
  const s = raw.trim().replace(/\D/g, '');
  if (s.length === 8) {
    const mm = s.slice(0, 2), dd = s.slice(2, 4), yyyy = s.slice(4, 8);
    return new Date(`${yyyy}-${mm}-${dd}`);
  }
  return null;
}

const PERMIT_TO_SERVICE = {
  mechanical: 'hvac', 'a/c': 'hvac', hvac: 'hvac', 'air conditioning': 'hvac', heating: 'hvac',
  electrical: 'electrical', electric: 'electrical',
  plumbing: 'plumbing', plumb: 'plumbing',
  roofing: 'roofing', roof: 'roofing',
};

router.post('/import-permits', (req, res, next) => {
  try {
    const { csv, permit_types = [], days_back = 180 } = req.body;
    if (!csv) return res.status(400).json({ success: false, error: 'csv field required' });

    const lines = csv.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ success: false, error: 'CSV appears empty' });

    const headers = parseCsvLine(lines[0]).map(h => h.trim());
    const col = (candidates) => {
      for (const c of candidates) {
        const idx = headers.findIndex(h => h.toLowerCase().includes(c.toLowerCase()));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const iPermitType  = col(['Permit Type Desc', 'Permit Type', 'PermitTypeDesc', 'PermitType', 'Work Type']);
    const iPermitNum   = col(['Permit Num', 'PermitNum', 'Permit Number', 'PermitNumber']);
    const iIssueDate   = col(['Issue Date', 'IssueDate', 'Issued Date', 'IssuedDate', 'Calendar Year']);
    const iContractor  = col(['Contractor Company Name', 'Contractor Name', 'ContractorName', 'Contractor']);
    const iPhone       = col(['Contractor Phone', 'ContractorPhone', 'Phone']);
    const iAddress     = col(['Contractor Address', 'ContractorAddress', 'Original Address', 'OriginalAddress']);
    const iCity        = col(['Contractor City', 'ContractorCity', 'Original City', 'OriginalCity']);
    const iState       = col(['Contractor State', 'ContractorState', 'Original State', 'OriginalState']);
    const iZip         = col(['Contractor Zip', 'ContractorZip', 'Original Zip', 'OriginalZip', 'Zip']);
    const iDescription = col(['Work Description', 'Description', 'Permit Description']);

    if (iContractor === -1) {
      return res.status(400).json({ success: false, error: 'Not a recognized permit CSV — missing Contractor column' });
    }

    const cutoff = days_back > 0 ? new Date(Date.now() - days_back * 86400000) : null;
    const filterTypes = permit_types.map(t => t.toLowerCase());
    let imported = 0, skipped_dedup = 0, skipped_filter = 0;
    const importedIds = [];

    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      if (row.length < 2) continue;
      const get = (idx) => (idx >= 0 && idx < row.length ? row[idx]?.trim() : '') || '';

      const permitTypeRaw = get(iPermitType).toLowerCase();
      const permitNum     = get(iPermitNum);
      const issueDate     = get(iIssueDate);
      const contractor    = get(iContractor);
      const phone         = normalizeTdlrPhone(get(iPhone));
      const address       = get(iAddress);
      const city          = get(iCity);
      const state         = get(iState) || 'TX';
      const zip           = get(iZip);
      const description   = get(iDescription);

      if (!contractor) continue;

      // Map permit type → service_type
      let service_type = 'general';
      for (const [key, val] of Object.entries(PERMIT_TO_SERVICE)) {
        if (permitTypeRaw.includes(key)) { service_type = val; break; }
      }

      // Filter by selected permit types
      if (filterTypes.length > 0 && !filterTypes.includes(service_type)) {
        skipped_filter++;
        continue;
      }

      // Recency filter
      if (cutoff && issueDate) {
        const d = new Date(issueDate);
        if (!isNaN(d.getTime()) && d < cutoff) { skipped_filter++; continue; }
      }

      // Dedup by phone
      if (phone) {
        const dup = db.get('SELECT id FROM leads WHERE phone = ?', [phone]);
        if (dup) { skipped_dedup++; continue; }
      }
      // Dedup by contractor name + city
      {
        const dup = db.get(
          "SELECT id FROM leads WHERE LOWER(business_name) = LOWER(?) AND LOWER(COALESCE(city,'')) = LOWER(COALESCE(?,?))",
          [contractor, city, '']
        );
        if (dup) { skipped_dedup++; continue; }
      }

      const notesParts = [];
      if (permitNum) notesParts.push(`Permit #${permitNum}`);
      if (issueDate) notesParts.push(`issued ${issueDate}`);
      if (description) notesParts.push(description.substring(0, 100));
      const notes = notesParts.join(' · ') || null;

      const leadForScore = { phone, website: null, has_website: 0, website_live: 0, email: null, rating: null, review_count: null };
      const heat_score = Math.min(100, computeInitialHeatScore(leadForScore) + 20);

      const r = db.run(
        `INSERT INTO leads (business_name, address, city, state, zip, phone, direct_phone,
           service_type, status, heat_score, notes, source, estimated_value, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, 'permits', 3000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [contractor, address || null, city || null, state, zip || null,
         phone, phone, service_type, heat_score, notes]
      );
      db.run(
        "INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'import', 'Imported from permits', ?)",
        [r.lastInsertRowid, `Source: ${permitTypeRaw || 'permit'}. ${notes || ''}`]
      );
      importedIds.push(r.lastInsertRowid);
      imported++;
    }

    res.json({ success: true, data: { imported, skipped_dedup, skipped_filter, lead_ids: importedIds } });
  } catch (err) { next(err); }
});

const TDLR_METRO_CITIES = {
  houston: ['houston','katy','sugar land','pearland','pasadena','league city',
            'friendswood','baytown','cypress','spring','humble','missouri city',
            'stafford','conroe','the woodlands','rosenberg','richmond'],
  dallas:  ['dallas','plano','irving','garland','mesquite','frisco','mckinney',
            'arlington','grand prairie','carrollton','richardson','denton',
            'lewisville','allen','rowlett','wylie','desoto'],
  austin:  ['austin','cedar park','round rock','pflugerville','georgetown',
            'kyle','buda','leander','hutto','manor','bastrop','dripping springs'],
};

router.post('/import-tdlr', (req, res, next) => {
  try {
    const { csv, service_types = [], active_only = true, metro = '' } = req.body;
    if (!csv) return res.status(400).json({ success: false, error: 'csv field required' });

    const lines = csv.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ success: false, error: 'CSV appears empty' });

    const headers = parseCsvLine(lines[0]).map(h => h.trim().toUpperCase());
    const col = (name) => headers.indexOf(name.toUpperCase());

    const iLicenseType   = col('LICENSE TYPE');
    const iLicenseNum    = col('LICENSE NUMBER');
    const iBusinessName  = col('BUSINESS NAME');
    const iAddressLine1  = col('BUSINESS ADDRESS-LINE1');
    const iCityStateZip  = col('BUSINESS CITY, STATE ZIP');
    const iBusinessPhone = col('BUSINESS TELEPHONE');
    const iOwnerName     = col('OWNER NAME');
    const iOwnerPhone    = col('OWNER TELEPHONE');
    const iExpiration    = col('LICENSE EXPIRATION DATE (MMDDCCYY)');

    if (iBusinessName === -1) {
      return res.status(400).json({ success: false, error: 'Not a TDLR CSV — missing BUSINESS NAME column' });
    }

    let imported = 0, skipped_dedup = 0, skipped_filter = 0;
    const importedIds = [];
    const today = new Date();
    const filterTypes = service_types.map(s => s.toLowerCase());

    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      if (row.length < 3) continue;

      const get = (idx) => (idx >= 0 && idx < row.length ? row[idx]?.trim() : '') || '';

      const licenseType  = get(iLicenseType);
      const licenseNum   = get(iLicenseNum);
      const businessName = get(iBusinessName);
      const addrLine1    = get(iAddressLine1);
      const cityStateZip = get(iCityStateZip);
      const bizPhone     = get(iBusinessPhone);
      const ownerName    = get(iOwnerName);
      const ownerPhone   = get(iOwnerPhone);
      const expirationRaw = get(iExpiration);

      if (!businessName) continue;

      // Map license type → service_type
      const service_type = LICENSE_TO_SERVICE[licenseType.toLowerCase()] || 'general';

      // Filter by selected service types
      if (filterTypes.length > 0 && !filterTypes.includes(service_type)) {
        skipped_filter++;
        continue;
      }

      // Filter expired licenses
      if (active_only && expirationRaw) {
        const expDate = parseTdlrExpiration(expirationRaw);
        if (expDate && expDate < today) {
          skipped_filter++;
          continue;
        }
      }

      const { city, state, zip } = parseTdlrCityStateZip(cityStateZip);

      // Metro filter
      if (metro && TDLR_METRO_CITIES[metro]) {
        const cityLower = (city || '').toLowerCase();
        if (!TDLR_METRO_CITIES[metro].some(c => cityLower.includes(c))) {
          skipped_filter++;
          continue;
        }
      }

      const phone       = normalizeTdlrPhone(bizPhone);
      const direct_phone = normalizeTdlrPhone(ownerPhone);

      // Build notes
      const notesParts = [];
      if (licenseNum)   notesParts.push(`License #${licenseNum}`);
      if (expirationRaw) {
        const exp = parseTdlrExpiration(expirationRaw);
        if (exp) notesParts.push(`expires ${(exp.getMonth()+1).toString().padStart(2,'0')}/${exp.getDate().toString().padStart(2,'0')}/${exp.getFullYear()}`);
      }
      if (licenseType)  notesParts.push(licenseType);
      const notes = notesParts.join(', ') || null;

      // Dedup: phone
      if (phone) {
        const dup = db.get('SELECT id FROM leads WHERE phone = ?', [phone]);
        if (dup) { skipped_dedup++; continue; }
      }
      // Dedup: business_name + city
      {
        const dup = db.get(
          "SELECT id FROM leads WHERE LOWER(business_name) = LOWER(?) AND LOWER(COALESCE(city,'')) = LOWER(COALESCE(?,?))",
          [businessName, city, '']
        );
        if (dup) { skipped_dedup++; continue; }
      }

      const leadForScore = { phone, website: null, has_website: 0, website_live: 0, email: null, rating: null, review_count: null };
      const heat_score = computeInitialHeatScore(leadForScore);

      const result2 = db.run(
        `INSERT INTO leads (business_name, address, city, state, zip, phone, direct_phone, owner_name,
           service_type, status, heat_score, notes, source, estimated_value, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, 'tdlr', 2000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [businessName, addrLine1 || null, city || null, state || 'TX', zip || null,
         phone, direct_phone, ownerName || null,
         service_type, heat_score, notes]
      );

      const newId = result2.lastInsertRowid;
      db.run(
        `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'import', 'Imported from TDLR', ?)`,
        [newId, `Source: Texas TDLR license database. ${notes || ''}`]
      );

      importedIds.push(newId);
      imported++;
    }

    res.json({ success: true, data: { imported, skipped_dedup, skipped_filter, lead_ids: importedIds } });
  } catch (err) { next(err); }
});

// GET /api/leads/unsubscribe — one-click unsubscribe from email sequences
router.get('/unsubscribe', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).send('<p>Invalid unsubscribe link.</p>');
  const lead = db.get('SELECT id FROM leads WHERE email = ?', [email]);
  if (lead) {
    db.run('UPDATE leads SET unsubscribed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [lead.id]);
    db.run(
      "UPDATE lead_sequences SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE lead_id = ? AND status IN ('active', 'paused')",
      [lead.id]
    );
  }
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
    <body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#333;padding:0 20px">
    <h2 style="color:#111">You've been unsubscribed</h2>
    <p style="color:#666">You've been removed from all email sequences and won't receive further emails.</p>
    </body></html>`);
});

// GET /api/leads/:id — single lead with activities
router.get('/:id', (req, res, next) => {
  try {
    const lead = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    const activities = db.all('SELECT * FROM activities WHERE lead_id = ? ORDER BY created_at DESC', [req.params.id]);
    res.json({ success: true, data: { ...lead, activities } });
  } catch (err) { next(err); }
});

// POST /api/leads — create lead
router.post('/', (req, res, next) => {
  try {
    const {
      business_name, first_name, last_name, email, phone,
      address, city, state, zip, latitude, longitude,
      service_type = 'hvac', status = 'new', heat_score = 0,
      estimated_value = 2000, website, notes,
      source = 'manual', osm_id, osm_type,
      has_website = 0, website_live = 0, google_maps_url
    } = req.body;

    if (!business_name) return res.status(400).json({ success: false, error: 'business_name is required' });

    const result = db.run(
      `INSERT INTO leads (business_name, first_name, last_name, email, phone, address, city, state, zip, latitude, longitude, service_type, status, heat_score, estimated_value, website, has_website, website_live, google_maps_url, source, osm_id, osm_type, notes, timezone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [business_name, first_name || null, last_name || null, email || null, phone || null, address || null, city || null, state || null, zip || null, latitude || null, longitude || null, service_type, status, heat_score, estimated_value, website || null, has_website ? 1 : 0, website_live ? 1 : 0, google_maps_url || null, source, osm_id || null, osm_type || null, notes || null, getTimezone(state)]
    );

    const lead = db.get('SELECT * FROM leads WHERE id = ?', [result.lastInsertRowid]);
    if (!lead) return res.status(500).json({ success: false, error: 'Failed to create lead' });

    // Auto-enroll into default sequence
    const defaultSeqId = getDefaultSequenceId();
    if (defaultSeqId) {
      autoEnrollLeads([lead.id], defaultSeqId);
    }

    // Speed-to-lead: auto-queue new lead for immediate calling (8 AM–8 PM CT only)
    const speedEnabled = db.get("SELECT value FROM settings WHERE key = 'speed_to_lead_enabled'")?.value === '1';
    const speedTemplateId = parseInt(db.get("SELECT value FROM settings WHERE key = 'speed_to_lead_template_id'")?.value);
    if (speedEnabled && speedTemplateId && lead.phone && !lead.dnc_at) {
      const localHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date()));
      if (localHour >= 8 && localHour < 20) {
        db.run("UPDATE call_queue SET position = position + 1 WHERE status = 'pending'");
        db.run("INSERT INTO call_queue (lead_id, template_id, position, status) VALUES (?, ?, 1, 'pending')", [lead.id, speedTemplateId]);
      }
    }

    eventBus.emit({ type: 'new_lead', id: lead.id, name: lead.business_name });

    // Non-blocking phone validation
    if (lead.phone) setImmediate(() => validatePhoneForLead(lead.id, db).catch(() => {}));

    res.status(201).json({ success: true, data: lead });
  } catch (err) { next(err); }
});

// PUT /api/leads/:id — update lead
router.put('/:id', (req, res, next) => {
  try {
    const lead = db.get('SELECT id FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    const fields = ['business_name','first_name','last_name','email','phone','address','city','state','zip','service_type','status','heat_score','estimated_value','website','has_website','website_live','notes','next_followup_at','tags','proposal_amount','proposal_date','close_date','won_amount','lost_reason','loom_url','ghost_time','test_submitted_at','test_responded_at','dnc_at','owner_name','direct_phone','linkedin_url'];
    const updates = [];
    const params = [];

    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(req.body[f]);
      }
    });

    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    db.run(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`, params);
    const updated = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// PATCH /api/leads/:id/status — change status + log activity
router.patch('/:id/status', (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['new','contacted','qualified','proposal_sent','booked','lost','closed_won'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });

    const lead = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    const oldStatus = lead.status;
    db.run('UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);

    // Auto-fill deal fields on status change
    if (status === 'proposal_sent' && !lead.proposal_date) {
      db.run('UPDATE leads SET proposal_date = date(\'now\') WHERE id = ?', [req.params.id]);
    }
    if (status === 'closed_won' && !lead.won_amount && lead.proposal_amount) {
      db.run('UPDATE leads SET won_amount = ? WHERE id = ?', [lead.proposal_amount, req.params.id]);
    }

    // Log activity
    if (status === 'contacted') {
      db.run('UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, first_contacted_at = CASE WHEN first_contacted_at IS NULL THEN CURRENT_TIMESTAMP ELSE first_contacted_at END WHERE id = ?', [req.params.id]);
    }
    db.run(
      `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'status_change', ?, ?)`,
      [req.params.id, `Status changed to ${status}`, `Was: ${oldStatus} → Now: ${status}`]
    );
    autoUpdateHeatScore(req.params.id);

    // Auto-schedule follow-up based on new status
    const FOLLOWUP_DAYS = { new: 1, contacted: 3, qualified: 2, proposal_sent: 5, booked: 1 };
    const followupDays = FOLLOWUP_DAYS[status];
    if (followupDays) {
      db.run(
        `UPDATE leads SET next_followup_at = datetime('now', '+' || ? || ' days') WHERE id = ?`,
        [followupDays, req.params.id]
      );
      db.run(
        `INSERT INTO activities (lead_id, type, title) VALUES (?, 'note', ?)`,
        [req.params.id, `Auto-scheduled follow-up in ${followupDays} day(s)`]
      );
    } else {
      // Terminal statuses (lost, closed_won): clear any scheduled follow-up
      db.run('UPDATE leads SET next_followup_at = NULL WHERE id = ?', [req.params.id]);
    }

    // Review Request Funnel: send rating request when lead reaches closed_won
    if (status === 'closed_won' && oldStatus !== 'closed_won') {
      const reviewService = require('../services/reviewService');
      if (reviewService.isEnabled() && lead.phone) {
        reviewService.sendInitialRequest(lead).catch(() => {});
      }
    }

    const updated = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// PATCH /api/leads/:id/heat-score — update heat score
router.patch('/:id/heat-score', (req, res, next) => {
  try {
    const { heat_score } = req.body;
    const score = Math.max(0, Math.min(100, parseInt(heat_score) || 0));
    const lead = db.get('SELECT id FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [score, req.params.id]);
    db.run(`INSERT INTO activities (lead_id, type, title) VALUES (?, 'heat_update', ?)`, [req.params.id, `Heat score updated to ${score}`]);

    const updated = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// POST /api/leads/autopilot/run — manually trigger weekly autopilot import
router.post('/autopilot/run', async (req, res, next) => {
  try {
    const { runAutopilotImport } = require('../services/campaignScheduler');
    await runAutopilotImport();
    res.json({ success: true, data: { triggered: true } });
  } catch (err) { next(err); }
});

// POST /api/leads/batch-validate-phones — Twilio Lookup v2 on all leads with phone_valid IS NULL
router.post('/batch-validate-phones', async (req, res, next) => {
  try {
    const { service_type, source, limit = 100 } = req.body;
    const { isConfigured, getClient } = require('../services/smsService');
    if (!isConfigured()) return res.status(503).json({ success: false, error: 'Twilio not configured' });
    const client = getClient();

    let query = `SELECT * FROM leads WHERE phone IS NOT NULL AND phone != '' AND phone_valid IS NULL AND dnc_at IS NULL`;
    const params = [];
    if (service_type) { query += ` AND service_type = ?`; params.push(service_type); }
    if (source) { query += ` AND source = ?`; params.push(source); }
    query += ` LIMIT ?`;
    params.push(parseInt(limit, 10));

    const leads = db.all(query, params);
    let checked = 0, valid = 0, invalid = 0;

    for (const lead of leads) {
      checked++;
      try {
        const digits = lead.phone.replace(/\D/g, '');
        const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
        const lookup = await client.lookups.v2.phoneNumbers(e164).fetch({ fields: 'line_type_intelligence' });
        const lineType = lookup.lineTypeIntelligence?.type || null;
        const isValid = lookup.valid !== false && !['voip', 'nonFixedVoip'].includes(lineType);
        db.run('UPDATE leads SET phone_valid = ?, phone_line_type = ? WHERE id = ?', [isValid ? 1 : 0, lineType, lead.id]);
        if (isValid) valid++; else invalid++;
      } catch (e) {
        console.warn(`[BatchValidate] Lead ${lead.id} failed:`, e.message);
      }
      await new Promise(r => setTimeout(r, 100));
    }

    res.json({ success: true, data: { checked, valid, invalid } });
  } catch (err) { next(err); }
});

// POST /api/leads/import-tsbpe — import Texas plumber licenses from TSBPE bulk CSV
router.post('/import-tsbpe', (req, res, next) => {
  try {
    const { csv, active_only = true } = req.body;
    if (!csv) return res.status(400).json({ success: false, error: 'csv field required' });

    const lines = csv.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ success: false, error: 'CSV appears empty' });

    const headers = parseCsvLine(lines[0]).map(h => h.trim().toUpperCase());
    const col = (name) => headers.indexOf(name.toUpperCase());

    const iCompany    = col('PLUMB_COMPANY');
    const iLicNum     = col('LICENSE_NBR');
    const iStatus     = col('LIC_STATUS');
    const iExpDate    = col('EXPIRATION_DTE');
    const iFirstName  = col('FIRST_NAME');
    const iMiddleName = col('MIDDLE_NAME');
    const iLastName   = col('LAST_NAME');
    const iAddr1      = col('ADDR1');
    const iCity       = col('CITY');
    const iState      = col('STATE');
    const iZip        = col('ZIP');
    const iPhone      = col('PHONE');
    const iCounty     = col('COUNTY');

    if (iCompany === -1) {
      return res.status(400).json({ success: false, error: 'Not a TSBPE CSV — missing PLUMB_COMPANY column' });
    }

    function normalizeTsbpePhone(raw) {
      if (!raw) return null;
      const digits = raw.replace(/\D/g, '');
      if (digits.length === 11 && digits[0] === '1') return digits.slice(1);
      if (digits.length === 10) return digits;
      return null;
    }

    let imported = 0, skipped_dedup = 0, skipped_filter = 0;
    const importedIds = [];
    const today = new Date();

    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      if (row.length < 3) continue;

      const get = (idx) => (idx >= 0 && idx < row.length ? row[idx]?.trim() : '') || '';

      const businessName = get(iCompany);
      if (!businessName) continue;

      const licStatus   = get(iStatus);
      const expirationRaw = get(iExpDate);

      // Filter inactive licenses
      if (active_only) {
        if (licStatus && licStatus !== 'Current') { skipped_filter++; continue; }
        if (expirationRaw) {
          const expDate = new Date(expirationRaw);
          if (!isNaN(expDate.getTime()) && expDate < today) { skipped_filter++; continue; }
        }
      }

      const firstName  = get(iFirstName);
      const middleName = get(iMiddleName);
      const lastName   = get(iLastName);
      const ownerName  = [firstName, middleName, lastName].filter(Boolean).join(' ') || null;

      const address = get(iAddr1) || null;
      const city    = get(iCity) || null;
      const state   = get(iState) || 'TX';
      const zip     = get(iZip) || null;
      const phone   = normalizeTsbpePhone(get(iPhone));
      const county  = get(iCounty);
      const licNum  = get(iLicNum);

      const notesParts = [];
      if (licNum) notesParts.push(`License #${licNum}`);
      if (expirationRaw) notesParts.push(`expires ${expirationRaw}`);
      if (county) notesParts.push(`${county} County`);
      const notes = notesParts.join(', ') || null;

      // Dedup by phone
      if (phone) {
        const dup = db.get('SELECT id FROM leads WHERE phone = ?', [phone]);
        if (dup) { skipped_dedup++; continue; }
      }
      // Dedup by business_name + city
      {
        const dup = db.get(
          "SELECT id FROM leads WHERE LOWER(business_name) = LOWER(?) AND LOWER(COALESCE(city,'')) = LOWER(COALESCE(?,?))",
          [businessName, city, '']
        );
        if (dup) { skipped_dedup++; continue; }
      }

      const leadForScore = { phone, website: null, has_website: 0, website_live: 0, email: null, rating: null, review_count: null };
      const heat_score = computeInitialHeatScore(leadForScore);

      const result2 = db.run(
        `INSERT INTO leads (business_name, address, city, state, zip, phone, direct_phone, owner_name,
           service_type, status, heat_score, notes, source, estimated_value, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'plumbing', 'new', ?, ?, 'tsbpe', 3000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [businessName, address, city, state, zip, phone, phone, ownerName, heat_score, notes]
      );

      const newId = result2.lastInsertRowid;
      db.run(
        `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'import', 'Imported from TSBPE', ?)`,
        [newId, `Source: Texas TSBPE plumber license database. ${notes || ''}`]
      );

      importedIds.push(newId);
      imported++;
    }

    res.json({ success: true, data: { imported, skipped_dedup, skipped_filter, lead_ids: importedIds } });
  } catch (err) { next(err); }
});

// POST /api/leads/batch-find-phones — AI lookup for owner phones on multiple leads
router.post('/batch-find-phones', async (req, res, next) => {
  try {
    const { service_type, limit = 20 } = req.body;
    const { findOwnerPhone } = require('../services/claudeService');

    let query = `SELECT * FROM leads WHERE (direct_phone IS NULL OR direct_phone = '') AND dnc_at IS NULL AND status NOT IN ('booked','lost','closed_won')`;
    const params = [];
    if (service_type) {
      query += ` AND service_type = ?`;
      params.push(service_type);
    }
    query += ` ORDER BY heat_score DESC LIMIT ?`;
    params.push(parseInt(limit, 10));

    const leads = db.all(query, params);
    let checked = 0;
    let found = 0;
    const foundIds = [];

    for (const lead of leads) {
      checked++;
      try {
        const phone = await findOwnerPhone(lead);
        if (phone) {
          db.run('UPDATE leads SET direct_phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [phone, lead.id]);
          db.run(
            "INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'note', 'Direct phone found via AI', ?)",
            [lead.id, `Batch AI lookup returned: ${phone}`]
          );
          found++;
          foundIds.push(lead.id);
        }
      } catch (e) {
        console.warn(`[BatchFindPhones] Lead ${lead.id} failed:`, e.message);
      }
      // Rate limit: 500ms between calls
      await new Promise(r => setTimeout(r, 500));
    }

    res.json({ success: true, data: { checked, found, lead_ids: foundIds } });
  } catch (err) { next(err); }
});

// POST /api/leads/:id/find-direct-phone — AI lookup for owner's direct/cell number
router.post('/:id/find-direct-phone', async (req, res, next) => {
  try {
    const lead = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    const { findOwnerPhone } = require('../services/claudeService');
    const phone = await findOwnerPhone(lead);
    if (phone) {
      db.run('UPDATE leads SET direct_phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [phone, lead.id]);
      db.run(
        "INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'note', 'Direct phone found via AI', ?)",
        [lead.id, `AI lookup returned: ${phone}`]
      );
    }
    res.json({ success: true, data: { found: !!phone, phone: phone || null } });
  } catch (err) { next(err); }
});

// POST /api/leads/:id/enrich — scrape website for intel
router.post('/:id/enrich', async (req, res, next) => {
  try {
    const lead = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    if (!lead.website) return res.status(400).json({ success: false, error: 'Lead has no website to enrich' });

    console.log(`[Enrich] Scraping ${lead.website} for lead ${lead.id}`);
    const result = await scrapeWebsite(lead.website);

    const enrichmentJson = JSON.stringify(result);
    db.run(
      'UPDATE leads SET enrichment_data = ?, enriched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [enrichmentJson, req.params.id]
    );

    // Auto-fill email if lead has none and scrape found one
    if (!lead.email && result.emails && result.emails.length > 0) {
      db.run('UPDATE leads SET email = ? WHERE id = ?', [result.emails[0], req.params.id]);
    }

    // Auto-fill owner_name if not set and scrape found one (extractTeamNames filters for owner/founder/president/CEO)
    let ownerAutoFilled = false;
    if (!lead.owner_name && result.team_names?.length > 0) {
      db.run('UPDATE leads SET owner_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [result.team_names[0], req.params.id]);
      ownerAutoFilled = true;
    }

    // Auto-fill direct_phone if not set and scrape found a number different from the main phone
    let directPhoneAutoFilled = false;
    if (!lead.direct_phone && result.phones?.length > 0) {
      const mainDigits = (lead.phone || '').replace(/\D/g, '').slice(-10);
      const alt = result.phones.find(p => p !== mainDigits);
      if (alt) {
        db.run('UPDATE leads SET direct_phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [alt, req.params.id]);
        directPhoneAutoFilled = alt;
      }
    }

    autoUpdateHeatScore(req.params.id);

    // Build activity description
    const parts = [];
    if (result.error) {
      parts.push(`Error: ${result.error}`);
    } else {
      if (result.emails?.length) parts.push(`${result.emails.length} email(s)`);
      if (result.team_names?.length) parts.push(`${result.team_names.length} team name(s)`);
      if (ownerAutoFilled) parts.push(`owner auto-filled: ${result.team_names[0]}`);
      if (directPhoneAutoFilled) parts.push(`direct phone found: ${directPhoneAutoFilled}`);
      if (result.services?.length) parts.push(`${result.services.length} service(s)`);
      if (result.tech_stack) parts.push(`Tech: ${result.tech_stack}`);
      const toolsDetected = Object.values(result.detected_tools || {}).filter(Boolean);
      if (toolsDetected.length) parts.push(`Tools: ${toolsDetected.join(', ')}`);
    }

    db.run(
      `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'enrichment', 'Website enriched', ?)`,
      [req.params.id, parts.join(', ') || 'No data extracted']
    );

    // Auto-generate gap pitch (non-blocking — enrichment succeeds even if this fails)
    let pitchJson = null;
    try {
      const freshLead = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
      const gapAnalysis = analyzeGaps(freshLead, result);
      const pitch = await generatePitch(freshLead, gapAnalysis);
      pitchJson = JSON.stringify(pitch);
      db.run('UPDATE leads SET pitch_data = ? WHERE id = ?', [pitchJson, req.params.id]);
    } catch (pitchErr) {
      console.error('[Enrich] Pitch generation failed (non-fatal):', pitchErr.message);
    }

    const updated = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    const activities = db.all('SELECT * FROM activities WHERE lead_id = ? ORDER BY created_at DESC', [req.params.id]);
    res.json({ success: true, data: { ...updated, activities } });
  } catch (err) { next(err); }
});

// POST /api/leads/:id/pitch — regenerate gap pitch on demand
router.post('/:id/pitch', async (req, res, next) => {
  try {
    const lead = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    let enrichment = null;
    try { enrichment = lead.enrichment_data ? JSON.parse(lead.enrichment_data) : null; } catch {}

    const gapAnalysis = analyzeGaps(lead, enrichment);
    const pitch = await generatePitch(lead, gapAnalysis);
    const pitchJson = JSON.stringify(pitch);
    db.run('UPDATE leads SET pitch_data = ? WHERE id = ?', [pitchJson, lead.id]);

    res.json({ success: true, data: pitch });
  } catch (err) { next(err); }
});

// POST /api/leads/:id/cold-write — generate hyper-personalized cold outreach using website scraping + Gemini
router.post('/:id/cold-write', async (req, res, next) => {
  try {
    const lead = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    let enrichment = null;
    if (lead.enrichment_data) {
      try { enrichment = JSON.parse(lead.enrichment_data); } catch {}
    }

    // Scrape recent highlights from website (non-fatal if fails)
    let recentHighlights = [];
    if (lead.website) {
      try {
        const fetch = require('node-fetch');
        const cheerio = require('cheerio');
        const r = await fetch(lead.website, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FieldStack/1.0)' },
          signal: AbortSignal.timeout(6000),
        });
        if (r.ok) {
          const $ = cheerio.load(await r.text());
          recentHighlights = await extractRecentHighlights($, lead.website);
        }
      } catch { /* non-fatal */ }
    }

    const result = await generateColdWrite(lead, enrichment, recentHighlights);

    db.run('UPDATE leads SET cold_write_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(result), req.params.id]);

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// PATCH /api/leads/:id/snooze — snooze follow-up
router.patch('/:id/snooze', (req, res, next) => {
  try {
    const lead = db.get('SELECT id FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    const days = Math.max(1, parseInt(req.body.days) || 1);
    db.run(
      `UPDATE leads SET next_followup_at = datetime('now', '+' || ? || ' days'), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [days, req.params.id]
    );
    db.run(
      `INSERT INTO activities (lead_id, type, title) VALUES (?, 'note', ?)`,
      [req.params.id, `Follow-up snoozed ${days} day(s)`]
    );

    const updated = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// POST /api/leads/:id/validate-phone — Twilio Lookup v2
router.post('/:id/validate-phone', async (req, res, next) => {
  try {
    const lead = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    if (!lead.phone) return res.status(400).json({ success: false, error: 'Lead has no phone number' });

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return res.status(500).json({ success: false, error: 'Twilio credentials not configured' });
    }

    const phone = lead.phone.replace(/[^\d+]/g, '');
    const e164 = phone.startsWith('+') ? phone : '+1' + phone.replace(/^1/, '');

    const client = require('twilio')(accountSid, authToken);
    const lookup = await client.lookups.v2.phoneNumbers(e164).fetch({ fields: 'line_type_intelligence' });
    const lineType = lookup.lineTypeIntelligence?.type || null;
    const valid = lookup.valid !== false && !['voip', 'nonFixedVoip'].includes(lineType);

    db.run('UPDATE leads SET phone_valid = ?, phone_line_type = ? WHERE id = ?', [valid ? 1 : 0, lineType, lead.id]);

    res.json({ success: true, data: { phone_valid: valid, phone_line_type: lineType } });
  } catch (err) { next(err); }
});

// POST /api/leads/:id/find-email — fast email-only scrape (root + /contact + /about)
router.post('/:id/find-email', async (req, res, next) => {
  try {
    const lead = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    if (!lead.website) return res.status(400).json({ success: false, error: 'Lead has no website' });

    const result = await scrapeWebsite(lead.website);
    const emails = result.emails || [];

    let saved = null;
    if (!lead.email && emails.length > 0) {
      db.run('UPDATE leads SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [emails[0], lead.id]);
      saved = emails[0];
    }

    db.run(
      `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'enrichment', 'Email search', ?)`,
      [lead.id, emails.length > 0 ? `Found ${emails.length} email(s): ${emails.join(', ')}` : 'No emails found on website']
    );

    res.json({ success: true, data: { emails, saved } });
  } catch (err) { next(err); }
});

// POST /api/leads/:id/quick-email — send a one-off email from the caller page (no template needed)
router.post('/:id/quick-email', async (req, res, next) => {
  try {
    const lead = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    if (!lead.email) return res.status(400).json({ success: false, error: 'Lead has no email address' });

    const { subject, body } = req.body;
    if (!subject || !body) return res.status(400).json({ success: false, error: 'subject and body required' });

    const emailService = require('../services/emailService');
    if (!emailService.isConfigured()) return res.status(400).json({ success: false, error: 'Email not configured (missing RESEND_API_KEY)' });

    const result = await emailService.sendEmail(lead.email, subject, body);
    if (!result.success) return res.status(502).json({ success: false, error: result.error || 'Send failed' });

    db.run(
      `INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, 'email_sent', ?, ?, ?)`,
      [lead.id, `Email sent: ${subject}`, body.slice(0, 200), JSON.stringify({ resend_message_id: result.messageId, quick_send: true })]
    );
    db.run(
      `UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP,
       first_contacted_at = COALESCE(first_contacted_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [lead.id]
    );

    res.json({ success: true, data: { message_id: result.messageId } });
  } catch (err) { next(err); }
});

// POST /api/leads/:id/fetch-gbp — fetch Google Places reviews + enrich lead with place_id / maps URL
// Requires GOOGLE_PLACES_API_KEY env var
router.post('/:id/fetch-gbp', async (req, res, next) => {
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return res.status(400).json({ success: false, error: 'GOOGLE_PLACES_API_KEY not configured' });

    const lead = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    let placeId = lead.google_place_id;

    // Step 1: Text Search to get place_id (skip if already saved)
    if (!placeId) {
      const query = encodeURIComponent(`${lead.business_name} ${lead.city || ''} ${lead.state || ''}`);
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&type=establishment&key=${apiKey}`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();
      if (!searchData.results?.length) {
        return res.json({ success: true, data: { found: false } });
      }
      placeId = searchData.results[0].place_id;
    }

    // Step 2: Place Details — get phone, maps URL, reviews
    const fields = 'name,formatted_phone_number,url,reviews';
    const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`;
    const detailRes = await fetch(detailUrl);
    const detailData = await detailRes.json();
    const result = detailData.result;
    if (!result) return res.json({ success: true, data: { found: false } });

    const mapsUrl = result.url || null;
    const phone = result.formatted_phone_number || null;
    const reviews = (result.reviews || []).map(r => ({
      author: r.author_name,
      rating: r.rating,
      text: r.text,
      ago: r.relative_time_description,
    }));

    // Save place_id + maps_url back to lead
    db.run(
      'UPDATE leads SET google_place_id = ?, google_maps_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [placeId, mapsUrl, lead.id]
    );

    res.json({ success: true, data: { found: true, maps_url: mapsUrl, phone, reviews } });
  } catch (err) { next(err); }
});

// PATCH /api/leads/:id/test-submit — stamp test_submitted_at, start timer
router.patch('/:id/test-submit', (req, res, next) => {
  try {
    const { id } = req.params;
    const lead = db.get('SELECT * FROM leads WHERE id = ?', [id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    db.run(
      'UPDATE leads SET test_submitted_at = CURRENT_TIMESTAMP, test_responded_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
    db.run(
      `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'note', 'Response test submitted', 'Submitted a test lead to their website. Timer started.')`,
      [id]
    );
    res.json({ success: true, data: db.get('SELECT * FROM leads WHERE id = ?', [id]) });
  } catch (err) { next(err); }
});

// PATCH /api/leads/:id/test-respond — stamp test_responded_at, compute elapsed
router.patch('/:id/test-respond', (req, res, next) => {
  try {
    const { id } = req.params;
    const lead = db.get('SELECT * FROM leads WHERE id = ?', [id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    if (!lead.test_submitted_at) {
      return res.status(400).json({ success: false, error: 'No test submitted yet' });
    }

    db.run(
      'UPDATE leads SET test_responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    const diffMs = Date.now() - new Date(lead.test_submitted_at).getTime();
    const mins = Math.floor(diffMs / 60000);
    db.run(
      `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'note', 'Response received', ?)`,
      [id, `Contractor responded after ${formatResponseTime(mins)}.`]
    );
    res.json({ success: true, data: db.get('SELECT * FROM leads WHERE id = ?', [id]) });
  } catch (err) { next(err); }
});

// POST /api/leads/:id/send-email — send template email via Resend
router.post('/:id/send-email', async (req, res, next) => {
  try {
    const { template_id } = req.body;
    if (!template_id) return res.status(400).json({ success: false, error: 'template_id required' });

    const lead = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    if (!lead.email) return res.status(400).json({ success: false, error: 'Lead has no email address' });

    const template = db.get('SELECT * FROM templates WHERE id = ?', [template_id]);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

    const emailService = require('../services/emailService');
    if (!emailService.isConfigured()) {
      return res.status(400).json({ success: false, error: 'Email not configured — set RESEND_API_KEY' });
    }

    const { renderTemplate } = require('../services/templateService');
    const subject = renderTemplate(template.subject || template.name, lead);
    const body = renderTemplate(template.body, lead);

    const result = await emailService.sendEmail(lead.email, subject, body);
    if (!result.success) return res.status(500).json({ success: false, error: result.error });

    db.run(
      `INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, 'email_sent', ?, ?, ?)`,
      [lead.id, `Email sent: ${subject}`, `Template: ${template.name}`, JSON.stringify({ resend_message_id: result.messageId })]
    );
    db.run(
      'UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, first_contacted_at = CASE WHEN first_contacted_at IS NULL THEN CURRENT_TIMESTAMP ELSE first_contacted_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [lead.id]
    );
    autoUpdateHeatScore(lead.id);

    if (lead.status === 'new') {
      db.run(
        `UPDATE leads SET status = 'contacted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [lead.id]
      );
      db.run(
        `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'status_change', 'Status changed to contacted', 'Auto-advanced after email sent')`,
        [lead.id]
      );
    }

    // Auto-schedule step 3 follow-up if this was the Loom email (step 2)
    if (template.step_order === 2 && template.channel === 'email') {
      const next = db.get(
        `SELECT id FROM templates WHERE channel = 'email' AND step_order = 3 AND status_stage = ? AND is_default = 1 LIMIT 1`,
        [template.status_stage]
      );
      if (next) {
        db.run(
          `UPDATE scheduled_emails SET cancelled_at = CURRENT_TIMESTAMP WHERE lead_id = ? AND sent_at IS NULL AND cancelled_at IS NULL`,
          [lead.id]
        );
        const scheduledAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
        db.run(
          `INSERT INTO scheduled_emails (lead_id, template_id, scheduled_at) VALUES (?, ?, ?)`,
          [lead.id, next.id, scheduledAt]
        );
      }
    }

    res.json({ success: true, data: { message_id: result.messageId } });
  } catch (err) { next(err); }
});

// GET /api/leads/:id/scheduled-emails
router.get('/:id/scheduled-emails', (req, res, next) => {
  try {
    const rows = db.all(
      `SELECT se.*, t.name as template_name, t.subject as template_subject
       FROM scheduled_emails se
       JOIN templates t ON t.id = se.template_id
       WHERE se.lead_id = ? AND se.sent_at IS NULL AND se.cancelled_at IS NULL
       ORDER BY se.scheduled_at ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// DELETE /api/leads/:id/scheduled-emails/:schedId
router.delete('/:id/scheduled-emails/:schedId', (req, res, next) => {
  try {
    db.run(
      `UPDATE scheduled_emails SET cancelled_at = CURRENT_TIMESTAMP WHERE id = ? AND lead_id = ?`,
      [req.params.schedId, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/leads/:id
router.delete('/:id', (req, res, next) => {
  try {
    const lead = db.get('SELECT id FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    db.run('DELETE FROM activities WHERE lead_id = ?', [req.params.id]);
    db.run('DELETE FROM leads WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/leads/:id/activities — log a custom activity
router.post('/:id/activities', (req, res, next) => {
  try {
    const { type = 'note', title, description } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'title is required' });
    const lead = db.get('SELECT id FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    if (type === 'call_attempt') {
      db.run('UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, first_contacted_at = CASE WHEN first_contacted_at IS NULL THEN CURRENT_TIMESTAMP ELSE first_contacted_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
      autoUpdateHeatScore(req.params.id);
      // Auto-schedule 3-day follow-up if none exists or current one is overdue
      db.run(
        `UPDATE leads SET next_followup_at = datetime('now', '+3 days'), updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND (next_followup_at IS NULL OR date(next_followup_at) <= date('now'))`,
        [req.params.id]
      );
    }

    db.run(
      `INSERT INTO activities (lead_id, type, title, description) VALUES (?, ?, ?, ?)`,
      [req.params.id, type, title, description]
    );

    const activity = db.get('SELECT * FROM activities WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [req.params.id]);
    res.status(201).json({ success: true, data: activity });
  } catch (err) { next(err); }
});

// POST /api/leads/:id/call-prep — AI-generated call prep for a lead
router.post('/:id/call-prep', async (req, res, next) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'GEMINI_API_KEY not configured' });
    }

    const lead = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    // Get recent activities for context
    const activities = db.all(
      `SELECT type, title, description, created_at FROM activities WHERE lead_id = ? ORDER BY created_at DESC LIMIT 5`,
      [req.params.id]
    );

    // Parse enrichment data if it exists
    let enrichmentStr = '';
    if (lead.enrichment_data) {
      try {
        const enrichment = JSON.parse(lead.enrichment_data);
        enrichmentStr = `Website info: ${enrichment.services?.join(', ') || 'N/A'}. Tech stack: ${enrichment.tech_stack?.join(', ') || 'N/A'}`;
      } catch {}
    }

    // Build context string
    const activitySummary = activities
      .map(a => `${new Date(a.created_at).toLocaleDateString()}: ${a.type} — ${a.title}`)
      .join('\n');

    const prompt = `You are a sales coach helping a contractor prepare for a cold call.

Lead details:
- Business: ${lead.business_name}
- City: ${lead.city}, ${lead.state}
- Service type: ${lead.service_type}
- Rating: ${lead.rating || 'N/A'} stars
- Heat score: ${lead.heat_score}
${enrichmentStr ? `- ${enrichmentStr}` : ''}

Recent activity:
${activitySummary || 'No prior contact'}

Generate a JSON object with:
{
  "opener": "First sentence to say on the call (max 2 sentences)",
  "context": "Key business insight or hook (1-2 sentences)",
  "objections": ["Likely objection 1", "Likely objection 2", "Likely objection 3"],
  "goal": "Specific outcome to push for"
}

Be specific to this business, not generic.`;

    const body = {
      model: 'gemini-2.5-flash',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    };

    const geminiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('[Leads] Gemini error:', err);
      return res.status(500).json({ success: false, error: 'Gemini API error' });
    }

    const data = await geminiRes.json();
    const content = data.choices?.[0]?.message?.content || '{}';

    let prep;
    try {
      prep = JSON.parse(content);
    } catch {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      prep = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        opener: content,
        context: '',
        objections: [],
        goal: '',
      };
    }

    res.json({
      success: true,
      data: {
        opener: prep.opener || '',
        context: prep.context || '',
        objections: Array.isArray(prep.objections) ? prep.objections : [],
        goal: prep.goal || '',
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
