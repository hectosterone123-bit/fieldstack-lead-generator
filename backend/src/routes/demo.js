const express = require('express');
const router = express.Router();
const db = require('../db');
const { computeInitialHeatScore } = require('../services/heatScoreService');

const DEMO_LEADS = [
  { business_name: 'Austin Air Pros', first_name: 'Mike', last_name: 'Rivera', phone: '(512) 555-0101', email: 'mike@austinairpros.com', city: 'Austin', state: 'TX', service_type: 'hvac', website: 'https://austinairpros.com', estimated_value: 5500, status: 'new', notes: 'High-volume HVAC contractor, 4.8 stars on Google' },
  { business_name: 'Texas Comfort Systems', first_name: 'David', last_name: 'Chen', phone: '(512) 555-0102', email: 'david@txcomfort.com', city: 'Round Rock', state: 'TX', service_type: 'hvac', website: 'https://txcomfort.com', estimated_value: 7200, status: 'contacted', notes: 'Spoke briefly, interested in demo' },
  { business_name: 'Cedar Park HVAC', first_name: 'Sarah', last_name: 'Thompson', phone: '(737) 555-0103', email: null, city: 'Cedar Park', state: 'TX', service_type: 'hvac', website: null, estimated_value: 4000, status: 'new', notes: null },
  { business_name: 'Capital City Cooling', first_name: 'James', last_name: 'Walker', phone: '(512) 555-0104', email: 'james@capitalcitycooling.com', city: 'Austin', state: 'TX', service_type: 'hvac', website: 'https://capitalcitycooling.com', estimated_value: 6800, status: 'qualified', notes: 'Ready to book — just needs contract review' },
  { business_name: 'Pflugerville Plumbing Co', first_name: 'Carlos', last_name: 'Morales', phone: '(512) 555-0105', email: 'carlos@pfplumbing.com', city: 'Pflugerville', state: 'TX', service_type: 'plumbing', website: 'https://pfplumbing.com', estimated_value: 4500, status: 'new', notes: null },
  { business_name: 'Kyle Electric Services', first_name: 'Tom', last_name: 'Bradley', phone: '(512) 555-0106', email: null, city: 'Kyle', state: 'TX', service_type: 'electrical', website: null, estimated_value: 3500, status: 'new', notes: 'Missed 3 calls — strong candidate' },
  { business_name: 'Hays County Roofing', first_name: 'Jennifer', last_name: 'Scott', phone: '(512) 555-0107', email: 'jen@hayscountyroofing.com', city: 'San Marcos', state: 'TX', service_type: 'roofing', website: 'https://hayscountyroofing.com', estimated_value: 9500, status: 'proposal_sent', notes: 'Sent proposal 5 days ago, awaiting response' },
  { business_name: 'Leander Home Services', first_name: 'Robert', last_name: 'Davis', phone: '(512) 555-0108', email: 'rob@leanderhs.com', city: 'Leander', state: 'TX', service_type: 'hvac', website: 'https://leanderhs.com', estimated_value: 5000, status: 'contacted', notes: null },
  { business_name: 'Georgetown HVAC Experts', first_name: 'Lisa', last_name: 'Martinez', phone: '(512) 555-0109', email: 'lisa@gtownhvac.com', city: 'Georgetown', state: 'TX', service_type: 'hvac', website: 'https://gtownhvac.com', estimated_value: 6000, status: 'new', notes: '4.9 stars, 120 reviews — busy season coming' },
  { business_name: 'Buda Plumbing & Drain', first_name: 'Mark', last_name: 'Johnson', phone: '(737) 555-0110', email: null, city: 'Buda', state: 'TX', service_type: 'plumbing', website: null, estimated_value: 3800, status: 'new', notes: null },
  { business_name: 'Bastrop Electrical Group', first_name: 'Nancy', last_name: 'Wilson', phone: '(512) 555-0111', email: 'nancy@bastropelec.com', city: 'Bastrop', state: 'TX', service_type: 'electrical', website: 'https://bastropelec.com', estimated_value: 4200, status: 'qualified', notes: 'Owner confirmed pain — misses 4+ leads/day' },
  { business_name: 'Wimberley Roofing LLC', first_name: 'Greg', last_name: 'Harris', phone: '(512) 555-0112', email: 'greg@wimberleyroofing.com', city: 'Wimberley', state: 'TX', service_type: 'roofing', website: 'https://wimberleyroofing.com', estimated_value: 8000, status: 'new', notes: null },
  { business_name: 'Lakeway AC & Heat', first_name: 'Amanda', last_name: 'Lewis', phone: '(512) 555-0113', email: 'amanda@lakewayac.com', city: 'Lakeway', state: 'TX', service_type: 'hvac', website: 'https://lakewayac.com', estimated_value: 5800, status: 'booked', notes: 'Demo scheduled — pilot client' },
  { business_name: 'Dripping Springs HVAC', first_name: 'Paul', last_name: 'Young', phone: '(737) 555-0114', email: null, city: 'Dripping Springs', state: 'TX', service_type: 'hvac', website: null, estimated_value: 4800, status: 'new', notes: null },
  { business_name: 'Manor Home Comfort', first_name: 'Susan', last_name: 'Allen', phone: '(512) 555-0115', email: 'susan@manorcomfort.com', city: 'Manor', state: 'TX', service_type: 'hvac', website: 'https://manorcomfort.com', estimated_value: 5200, status: 'lost', notes: 'Went with competitor — re-engage in 60 days' },
];

// POST /api/demo/seed
router.post('/seed', (req, res, next) => {
  try {
    const existing = db.get('SELECT COUNT(*) as cnt FROM leads WHERE source = ?', ['demo']);
    if (existing && existing.cnt > 0) {
      return res.json({ success: true, data: { skipped: true, message: 'Demo data already exists. Use DELETE /api/demo/reset first.' } });
    }

    const created = [];
    for (const lead of DEMO_LEADS) {
      const result = db.run(
        `INSERT INTO leads (business_name, first_name, last_name, phone, email, city, state, service_type, website, has_website, estimated_value, notes, status, source, heat_score, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo', 0, datetime('now', '-' || ? || ' days'), datetime('now'))`,
        [
          lead.business_name, lead.first_name, lead.last_name, lead.phone, lead.email,
          lead.city, lead.state, lead.service_type, lead.website || null, lead.website ? 1 : 0,
          lead.estimated_value, lead.notes, lead.status,
          Math.floor(Math.random() * 21),
        ]
      );
      const newLead = db.get('SELECT * FROM leads WHERE id = ?', [result.lastInsertRowid]);
      const score = computeInitialHeatScore(newLead);
      db.run('UPDATE leads SET heat_score = ? WHERE id = ?', [score, newLead.id]);

      // Import activity
      db.run("INSERT INTO activities (lead_id, type, title, created_at) VALUES (?, 'import', 'Demo lead created', datetime('now', '-' || ? || ' days'))", [newLead.id, Math.floor(Math.random() * 21)]);

      // Add activities for non-new leads
      if (lead.status === 'contacted' || lead.status === 'qualified' || lead.status === 'proposal_sent' || lead.status === 'booked') {
        db.run("INSERT INTO activities (lead_id, type, title, created_at) VALUES (?, 'call_attempt', 'Cold call — spoke briefly', datetime('now', '-' || ? || ' days'))", [newLead.id, Math.floor(Math.random() * 14) + 1]);
        db.run("UPDATE leads SET contact_count = 1, last_contacted_at = datetime('now', '-' || ? || ' days') WHERE id = ?", [Math.floor(Math.random() * 10) + 1, newLead.id]);
      }
      if (lead.status === 'qualified' || lead.status === 'proposal_sent' || lead.status === 'booked') {
        db.run("INSERT INTO activities (lead_id, type, title, created_at) VALUES (?, 'email_sent', 'Sent pitch email + Loom', datetime('now', '-' || ? || ' days'))", [newLead.id, Math.floor(Math.random() * 7) + 1]);
        db.run("UPDATE leads SET contact_count = 2 WHERE id = ?", [newLead.id]);
      }

      created.push(newLead.id);
    }

    res.json({ success: true, data: { created: created.length, lead_ids: created } });
  } catch (err) { next(err); }
});

// DELETE /api/demo/reset
router.delete('/reset', (req, res, next) => {
  try {
    const leads = db.all('SELECT id FROM leads WHERE source = ?', ['demo']);
    const ids = leads.map(l => l.id);
    if (ids.length === 0) return res.json({ success: true, data: { deleted: 0 } });

    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM activities WHERE lead_id IN (${placeholders})`, ids);
    db.run(`DELETE FROM lead_sequences WHERE lead_id IN (${placeholders})`, ids);
    db.run(`DELETE FROM sms_messages WHERE lead_id IN (${placeholders})`, ids);
    db.run(`DELETE FROM leads WHERE id IN (${placeholders})`, ids);

    res.json({ success: true, data: { deleted: ids.length } });
  } catch (err) { next(err); }
});

module.exports = router;
