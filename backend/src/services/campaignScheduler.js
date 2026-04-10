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

module.exports = { startCampaignScheduler };
