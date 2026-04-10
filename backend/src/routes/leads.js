const express = require('express');
const router = express.Router();
const db = require('../db');
const { scrapeWebsite } = require('../services/scrapeService');
const { recomputeHeatScore, computeInitialHeatScore } = require('../services/heatScoreService');
const smsService = require('../services/smsService');
const { autoEnrollLeads, getDefaultSequenceId } = require('../services/enrollmentService');

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

// POST /api/leads/bulk/send-email — mass email via Resend with template
router.post('/bulk/send-email', async (req, res, next) => {
  try {
    const { template_id, lead_ids, status, service_type } = req.body;
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
      leads = db.all(`SELECT * FROM leads WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`, params);
    }

    const emailService = require('../services/emailService');
    if (!emailService.isConfigured()) {
      return res.status(503).json({ success: false, error: 'Email not configured (missing RESEND_API_KEY)' });
    }

    const { renderTemplate } = require('../services/templateService');
    let sent = 0, failed = 0;
    const errors = [];

    for (const lead of leads) {
      try {
        const rendered = renderTemplate(template, lead);
        const result = await emailService.sendEmail(lead.email, rendered.subject || template.subject || 'Follow-up', rendered.body);
        if (result.success) {
          sent++;
          db.run(
            'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
            [lead.id, 'email_sent', `Email sent: ${template.name}`, template.subject || '',
             JSON.stringify({ resend_message_id: result.messageId, template_id, via: 'sam_ai_bulk' })]
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

    res.json({ success: true, data: { sent, failed, total: leads.length, errors: errors.slice(0, 5) } });
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

      const result = db.run(
        `INSERT INTO leads (business_name, phone, email, website, address, city, state, zip, service_type, status, heat_score, estimated_value, has_website, notes, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv_import')`,
        [business_name, phone, email, website, get('address') || null, get('city') || null,
         get('state') || null, get('zip') || null, service_type, status, heat_score,
         estimated_value, website ? 1 : 0, get('notes') || null]
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
      `INSERT INTO leads (business_name, first_name, last_name, email, phone, address, city, state, zip, latitude, longitude, service_type, status, heat_score, estimated_value, website, has_website, website_live, google_maps_url, source, osm_id, osm_type, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [business_name, first_name || null, last_name || null, email || null, phone || null, address || null, city || null, state || null, zip || null, latitude || null, longitude || null, service_type, status, heat_score, estimated_value, website || null, has_website ? 1 : 0, website_live ? 1 : 0, google_maps_url || null, source, osm_id || null, osm_type || null, notes || null]
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
    autoUpdateHeatScore(req.params.id);

    // Build activity description
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
      [req.params.id, parts.join(', ') || 'No data extracted']
    );

    const updated = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    const activities = db.all('SELECT * FROM activities WHERE lead_id = ? ORDER BY created_at DESC', [req.params.id]);
    res.json({ success: true, data: { ...updated, activities } });
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
    }

    db.run(
      `INSERT INTO activities (lead_id, type, title, description) VALUES (?, ?, ?, ?)`,
      [req.params.id, type, title, description]
    );

    const activity = db.get('SELECT * FROM activities WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [req.params.id]);
    res.status(201).json({ success: true, data: activity });
  } catch (err) { next(err); }
});

module.exports = router;
