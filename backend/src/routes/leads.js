const express = require('express');
const router = express.Router();
const db = require('../db');
const { scrapeWebsite } = require('../services/scrapeService');
const { recomputeHeatScore, computeInitialHeatScore } = require('../services/heatScoreService');
const smsService = require('../services/smsService');

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
      imported++;
    }

    res.json({ success: true, data: { imported, skipped } });
  } catch (err) { next(err); }
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
    res.status(201).json({ success: true, data: lead });
  } catch (err) { next(err); }
});

// PUT /api/leads/:id — update lead
router.put('/:id', (req, res, next) => {
  try {
    const lead = db.get('SELECT id FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    const fields = ['business_name','first_name','last_name','email','phone','address','city','state','zip','service_type','status','heat_score','estimated_value','website','has_website','website_live','notes','next_followup_at','tags'];
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

    // Google Review Request: auto-send SMS when lead reaches closed_won
    if (status === 'closed_won' && oldStatus !== 'closed_won') {
      const reviewLink = process.env.GOOGLE_REVIEW_LINK;
      const reviewEnabled = process.env.REVIEW_REQUEST_ENABLED !== 'false';

      if (reviewEnabled && reviewLink && smsService.isConfigured() && lead.phone) {
        const defaultMsg = `Thanks for choosing us! If you had a great experience, a quick Google review means the world: ${reviewLink}. Reply STOP to opt out.`;
        const reviewMessage = (process.env.REVIEW_REQUEST_MESSAGE || defaultMsg).replace('{review_link}', reviewLink);

        // Fire-and-forget: don't block status change on SMS result
        smsService.sendSms(lead.phone, reviewMessage).then(result => {
          if (result.success) {
            db.run(
              `INSERT INTO sms_messages (lead_id, direction, from_number, to_number, body, twilio_sid, status)
               VALUES (?, 'outbound', ?, ?, ?, ?, ?)`,
              [req.params.id, process.env.TWILIO_PHONE_NUMBER, smsService.normalizePhone(lead.phone), reviewMessage, result.sid, result.status]
            );
            db.run(
              'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
              [req.params.id, 'sms_sent', 'Review request sent', reviewMessage.substring(0, 100), JSON.stringify({ twilio_sid: result.sid, trigger: 'review_request' })]
            );
          }
        }).catch(() => {});
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
