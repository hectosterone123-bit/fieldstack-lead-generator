const cron = require('node-cron');
const db = require('../db');
const vapiService = require('./vapiService');
const { renderTemplate } = require('./templateService');

const STATE_TO_TIMEZONE = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix',
  AR: 'America/Chicago', CA: 'America/Los_Angeles', CO: 'America/Denver',
  CT: 'America/New_York', DE: 'America/New_York', FL: 'America/New_York',
  GA: 'America/New_York', HI: 'Pacific/Honolulu', ID: 'America/Denver',
  IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis', IA: 'America/Chicago',
  KS: 'America/Chicago', KY: 'America/New_York', LA: 'America/Chicago',
  ME: 'America/New_York', MD: 'America/New_York', MA: 'America/New_York',
  MI: 'America/Detroit', MN: 'America/Chicago', MS: 'America/Chicago',
  MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago',
  NV: 'America/Los_Angeles', NH: 'America/New_York', NJ: 'America/New_York',
  NM: 'America/Denver', NY: 'America/New_York', NC: 'America/New_York',
  ND: 'America/Chicago', OH: 'America/New_York', OK: 'America/Chicago',
  OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', SD: 'America/Chicago', TN: 'America/Chicago',
  TX: 'America/Chicago', UT: 'America/Denver', VT: 'America/New_York',
  VA: 'America/New_York', WA: 'America/Los_Angeles', WV: 'America/New_York',
  WI: 'America/Chicago', WY: 'America/Denver',
};

async function runCampaignTick() {
  try {
    // Check campaign is enabled
    const enabled = db.get("SELECT value FROM settings WHERE key = 'vapi_campaign_enabled'")?.value;
    if (enabled !== '1') return;

    // Check best time window if enabled
    const bestTimeEnabled = db.get("SELECT value FROM settings WHERE key = 'vapi_best_time_enabled'")?.value === '1';
    if (bestTimeEnabled) {
      const now = new Date();
      // Use a default timezone check — individual lead tz handled per-call
      const localHour = parseInt(
        new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(now)
      );
      const inWindow = (localHour >= 8 && localHour < 10) || (localHour >= 16 && localHour < 18);
      if (!inWindow) return;
    }

    // Check no active call already in progress
    const active = db.get("SELECT id FROM calls WHERE status IN ('queued','ringing','in_progress')");
    if (active) return;

    // Check daily cap
    const cap = parseInt(db.get("SELECT value FROM settings WHERE key = 'vapi_campaign_calls_per_day'")?.value || '20', 10);
    const today = new Date().toISOString().slice(0, 10);
    const { count } = db.get(`SELECT COUNT(*) as count FROM calls WHERE date(created_at) = ?`, [today]) || { count: 0 };
    if (count >= cap) return;

    // Get next queued item (respects scheduled_for)
    const next_item = db.get(
      "SELECT * FROM call_queue WHERE status = 'pending' AND (scheduled_for IS NULL OR scheduled_for <= datetime('now')) ORDER BY position ASC LIMIT 1"
    );
    if (!next_item) return;

    // Validate lead
    const lead = db.get('SELECT * FROM leads WHERE id = ? AND dnc_at IS NULL', [next_item.lead_id]);
    if (!lead || !lead.phone || lead.phone_valid === 0) {
      db.run("UPDATE call_queue SET status = 'skipped' WHERE id = ?", [next_item.id]);
      return;
    }

    // Render script
    let scriptBody = '';
    const template = db.get('SELECT * FROM templates WHERE id = ?', [next_item.template_id]);
    if (template) {
      scriptBody = renderTemplate(template.body, lead);
    }
    const contextPrefix = `You are calling ${lead.business_name || 'a contractor'}${lead.city ? ` in ${lead.city}, ${lead.state}` : ''}. Their service type is ${lead.service_type || 'general contracting'}.\n\n`;

    const result = await vapiService.startCall(lead, contextPrefix + scriptBody);
    if (!result.success) {
      console.error('[CampaignScheduler] startCall failed:', result.error);
      return;
    }

    db.run("UPDATE call_queue SET status = 'started' WHERE id = ?", [next_item.id]);
    db.run(
      `INSERT INTO calls (lead_id, template_id, vapi_call_id, status, monitor_listen_url, monitor_control_url, started_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [lead.id, next_item.template_id, result.callId, result.status || 'queued', result.listenUrl || null, result.controlUrl || null]
    );

    console.log(`[CampaignScheduler] Started call to ${lead.business_name} (${lead.phone})`);
  } catch (err) {
    console.error('[CampaignScheduler] Error:', err.message);
  }
}

function startCampaignScheduler() {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', runCampaignTick);
  console.log('[CampaignScheduler] Started (runs every 5 min)');
}

// Morning queue scoring — same logic as calls.js scoreLeadForMorning
function scoreLead(lead) {
  const now = Date.now();
  let score = (lead.heat_score || 0) * 0.4;
  const sw = { new: 20, contacted: 30, qualified: 40, proposal_sent: 35 };
  score += sw[lead.status] || 0;
  if (!lead.last_contacted_at) score += 30;
  if (lead.last_contacted_at) {
    const days = Math.floor((now - new Date(lead.last_contacted_at).getTime()) / 86400000);
    if (days >= 3 && days <= 14) score += 20;
    else if (days > 14 && days <= 30) score += 10;
    else if (days > 30) score -= 10;
  }
  if (lead.next_followup_at && new Date(lead.next_followup_at).getTime() <= now) score += 25;
  return score;
}

function runMorningQueueLoad() {
  try {
    // Find default call script template
    const template = db.get(
      "SELECT id FROM templates WHERE channel = 'call_script' AND step_order = 1 ORDER BY id ASC LIMIT 1"
    );
    if (!template) {
      console.warn('[MorningQueue] No call_script template found — skipping');
      return;
    }

    // Score and rank leads
    const raw = db.all(`
      SELECT * FROM leads
      WHERE phone IS NOT NULL AND phone != ''
        AND status NOT IN ('booked', 'lost', 'closed_won')
        AND dnc_at IS NULL
        AND (next_followup_at IS NULL OR datetime(next_followup_at) <= datetime('now'))
        AND (phone_valid IS NULL OR phone_valid != 0)
    `);

    const scored = raw.map(l => ({ ...l, _score: scoreLead(l) }));
    scored.sort((a, b) => b._score - a._score);
    const queueCount = parseInt(db.get("SELECT value FROM settings WHERE key = 'morning_queue_count'")?.value) || 100;
    const top = scored.slice(0, queueCount);

    // Clear pending queue and reload
    db.run("DELETE FROM call_queue WHERE status = 'pending'");
    for (let i = 0; i < top.length; i++) {
      db.run(
        'INSERT INTO call_queue (lead_id, template_id, position, status) VALUES (?, ?, ?, ?)',
        [top[i].id, template.id, i + 1, 'pending']
      );
    }

    // Stamp today's date so frontend can detect fresh load
    const today = new Date().toISOString().slice(0, 10);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('morning_queue_loaded_at', ?)", [today]);

    console.log(`[MorningQueue] Loaded ${top.length} leads into queue (template ${template.id})`);

    // Send morning alert SMS if phone is configured
    const alertPhone = db.get("SELECT value FROM settings WHERE key = 'morning_alert_phone'")?.value;
    if (alertPhone) {
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const ymd = yesterday.toISOString().slice(0, 10);
        const stats = db.get(`
          SELECT COUNT(*) as total,
            SUM(CASE WHEN outcome NOT IN ('no_answer','voicemail','gatekeeper') AND outcome IS NOT NULL THEN 1 ELSE 0 END) as pickups
          FROM calls WHERE date(created_at) = ?
        `, [ymd]) || { total: 0, pickups: 0 };
        const total = stats.total || 0;
        const pickups = stats.pickups || 0;
        const pct = total > 0 ? Math.round((pickups / total) * 100) : 0;
        const msg = `FieldStack: ${top.length} leads queued. Yesterday: ${total} calls, ${pickups} pickups (${pct}%). Go.`;
        const { sendSms } = require('./smsService');
        sendSms(alertPhone, msg).catch(e => console.warn('[MorningQueue] SMS alert failed:', e.message));
      } catch (e) {
        console.warn('[MorningQueue] SMS alert error:', e.message);
      }
    }
  } catch (err) {
    console.error('[MorningQueue] Error:', err.message);
  }
}

function startMorningQueueScheduler() {
  // Run every day at 8:00 AM Central Time
  cron.schedule('0 8 * * *', runMorningQueueLoad, { timezone: 'America/Chicago' });
  console.log('[MorningQueue] Scheduler started (fires 8 AM CT daily)');
}

// ─── Weekly Lead Autopilot ────────────────────────────────────────────────────

async function runAutopilotImport() {
  try {
    const raw = db.get("SELECT value FROM settings WHERE key = 'autopilot_configs'")?.value;
    if (!raw) return;
    let configs;
    try { configs = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(configs) || configs.length === 0) return;

    const { searchBusinesses } = require('./overpassService');
    const { computeInitialHeatScore } = require('./heatScoreService');
    const { getTimezone } = require('./timezoneService');

    let totalImported = 0;

    for (const cfg of configs) {
      const { city, state, service_type = 'hvac', radius = 10 } = cfg;
      if (!city || !state) continue;
      try {
        const results = await searchBusinesses(service_type, city, state, radius);
        for (const biz of results) {
          if (!biz.business_name) continue;
          // Dedup: osm_id, phone, or business_name+city
          if (biz.osm_id && db.get('SELECT id FROM leads WHERE osm_id = ?', [biz.osm_id])) continue;
          if (biz.phone && db.get('SELECT id FROM leads WHERE phone = ?', [biz.phone])) continue;
          const nameDup = db.get(
            "SELECT id FROM leads WHERE LOWER(business_name) = LOWER(?) AND LOWER(COALESCE(city,'')) = LOWER(?)",
            [biz.business_name, city]
          );
          if (nameDup) continue;

          const lead = { has_website: biz.website ? 1 : 0, website_live: 0, phone: biz.phone, email: null, rating: biz.rating, review_count: biz.review_count || 0 };
          const heat_score = computeInitialHeatScore(lead);

          const { lastInsertRowid } = db.run(
            `INSERT INTO leads (business_name, phone, website, address, city, state, service_type, status, heat_score, estimated_value, has_website, rating, review_count, google_maps_url, osm_id, osm_type, source, latitude, longitude, timezone)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, 2000, ?, ?, ?, ?, ?, ?, 'osm_finder', ?, ?, ?)`,
            [biz.business_name, biz.phone || null, biz.website || null, biz.address || null, city, state,
             service_type, heat_score, biz.website ? 1 : 0, biz.rating || null, biz.review_count || 0,
             biz.google_maps_url || null, biz.osm_id || null, biz.osm_type || null,
             biz.latitude || null, biz.longitude || null, getTimezone(state)]
          );
          db.run("INSERT INTO activities (lead_id, type, title) VALUES (?, 'import', 'Lead imported by Lead Autopilot')", [lastInsertRowid]);
          totalImported++;
        }
      } catch (e) {
        console.warn(`[Autopilot] Search failed for ${city}, ${state} (${service_type}):`, e.message);
      }
    }

    console.log(`[Autopilot] Weekly import complete — ${totalImported} new leads`);

    const alertPhone = db.get("SELECT value FROM settings WHERE key = 'morning_alert_phone'")?.value;
    if (alertPhone && totalImported > 0) {
      const { sendSms } = require('./smsService');
      sendSms(alertPhone, `FieldStack Autopilot: ${totalImported} new leads imported for the week. Pipeline refreshed.`).catch(() => {});
    }
  } catch (err) {
    console.error('[Autopilot] Error:', err.message);
  }
}

function startAutopilotScheduler() {
  // Run every Sunday at 10 PM Central Time
  cron.schedule('0 22 * * 0', runAutopilotImport, { timezone: 'America/Chicago' });
  console.log('[Autopilot] Weekly scheduler started (fires Sunday 10 PM CT)');
}

async function runHailCheck() {
  try {
    const enabled = db.get("SELECT value FROM settings WHERE key = 'hail_trigger_enabled'")?.value;
    if (enabled !== '1') return;

    const fetch = require('node-fetch');
    const res = await fetch('https://api.weather.gov/alerts/active?area=TX', {
      headers: { 'User-Agent': 'FieldStack/1.0 (fieldstack.ai)' }
    });
    if (!res.ok) return;

    const data = await res.json();
    const features = data.features || [];

    const hailEvents = features.filter(f => {
      const evt = (f.properties?.event || '').toLowerCase();
      const headline = (f.properties?.headline || '').toLowerCase();
      const desc = (f.properties?.description || '').toLowerCase();
      return (evt.includes('thunderstorm') || evt.includes('severe')) &&
             (headline.includes('hail') || desc.includes('hail'));
    });

    if (hailEvents.length === 0) return;

    let totalFlagged = 0;
    const newAreas = [];

    for (const feature of hailEvents) {
      const noaaId = feature.id;
      const areaDesc = feature.properties?.areaDesc || '';
      const eventType = feature.properties?.event || '';

      const existing = db.get('SELECT id FROM hail_alerts WHERE noaa_id = ?', [noaaId]);
      if (existing) continue;

      const areas = areaDesc.split(/[;,]/).map(a => a.trim().toLowerCase()).filter(Boolean);
      if (areas.length === 0) continue;

      const placeholders = areas.map(() => '?').join(',');
      const leads = db.all(
        `SELECT id, business_name, city, phone, heat_score, status FROM leads
         WHERE service_type = 'roofing'
           AND dnc_at IS NULL
           AND status NOT IN ('lost','closed_won','booked')
           AND LOWER(COALESCE(city,'')) IN (${placeholders})`,
        areas
      );

      db.run('INSERT OR IGNORE INTO hail_alerts (noaa_id, area_desc, event_type, leads_flagged) VALUES (?, ?, ?, ?)',
        [noaaId, areaDesc, eventType, leads.length]);

      if (leads.length === 0) continue;

      for (const lead of leads) {
        const newScore = Math.min(100, (lead.heat_score || 0) + 25);
        db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newScore, lead.id]);
        db.run(
          "INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'heat_update', 'Hail alert — heat boosted', ?)",
          [lead.id, `NOAA hail alert: ${areaDesc}. Heat +25 (${lead.heat_score} → ${newScore}).`]
        );
      }

      const hailSeqId = db.get("SELECT value FROM settings WHERE key = 'hail_sequence_id'")?.value;
      if (hailSeqId) {
        const { autoEnrollLeads } = require('./enrollmentService');
        autoEnrollLeads(leads.map(l => l.id), parseInt(hailSeqId));
      }

      totalFlagged += leads.length;
      newAreas.push(areaDesc);
    }

    if (totalFlagged > 0) {
      console.log(`[HailTrigger] ${totalFlagged} roofing leads flagged in: ${newAreas.join(', ')}`);
      const alertPhone = db.get("SELECT value FROM settings WHERE key = 'morning_alert_phone'")?.value;
      if (alertPhone) {
        const { sendSms } = require('./smsService');
        sendSms(alertPhone,
          `FieldStack: Hail alert — ${totalFlagged} roofing leads flagged in ${newAreas.slice(0, 2).join(', ')}. Check leads.`
        ).catch(() => {});
      }
    }
  } catch (e) {
    console.warn('[HailTrigger] Error:', e.message);
  }
}

function startHailTriggerScheduler() {
  cron.schedule('0 */6 * * *', runHailCheck, { timezone: 'America/Chicago' });
  console.log('[HailTrigger] Scheduler started (runs every 6h CT)');
}

module.exports = { startCampaignScheduler, startMorningQueueScheduler, startAutopilotScheduler, runAutopilotImport, startHailTriggerScheduler };
