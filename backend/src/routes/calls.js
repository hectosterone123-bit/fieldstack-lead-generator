const express = require('express');
const router = express.Router();
const db = require('../db');
const vapiService = require('../services/vapiService');
const { renderTemplate } = require('../services/templateService');
const { recomputeHeatScore } = require('../services/heatScoreService');

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

// GET /api/calls/active — currently active calls
router.get('/active', (req, res) => {
  // Auto-complete calls stuck in active status for more than 30 minutes
  db.run(
    `UPDATE calls SET status = 'completed', ended_at = CURRENT_TIMESTAMP
     WHERE status IN ('queued', 'ringing', 'in_progress')
     AND created_at < datetime('now', '-30 minutes')`
  );

  const calls = db.all(`
    SELECT c.*, l.business_name, l.phone, l.city, l.state, l.service_type,
           l.website, l.rating, l.review_count, l.notes, l.contact_count,
           l.last_contacted_at, l.heat_score, l.google_maps_url,
           c.ai_next_step, c.ai_key_intel
    FROM calls c
    JOIN leads l ON l.id = c.lead_id
    WHERE c.status IN ('queued', 'ringing', 'in_progress')
    ORDER BY c.created_at DESC
  `);
  res.json({ success: true, data: calls });
});

// GET /api/calls/queue — current call queue
router.get('/queue', (req, res) => {
  const items = db.all(`
    SELECT cq.*, l.business_name, l.phone, l.city, l.state, l.contact_count
    FROM call_queue cq
    JOIN leads l ON l.id = cq.lead_id
    WHERE cq.status = 'pending'
    ORDER BY cq.position ASC
  `);
  res.json({ success: true, data: items });
});

// GET /api/calls/history — today's completed calls
router.get('/history', (req, res) => {
  const calls = db.all(`
    SELECT c.*, l.business_name, l.phone, l.city, l.state,
           c.ai_next_step, c.ai_key_intel
    FROM calls c
    JOIN leads l ON l.id = c.lead_id
    WHERE date(c.created_at) = date('now')
    ORDER BY c.created_at DESC
  `);
  res.json({ success: true, data: calls });
});

// POST /api/calls/start — start an AI call
router.post('/start', async (req, res, next) => {
  try {
    const { lead_id, template_id } = req.body;
    if (!lead_id) return res.status(400).json({ success: false, error: 'lead_id required' });

    const lead = db.get('SELECT * FROM leads WHERE id = ?', [lead_id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    if (!lead.phone) return res.status(400).json({ success: false, error: 'Lead has no phone number' });

    let scriptBody = 'You are a sales representative making a cold call to a contractor. Be direct, professional, and value-focused. Keep the conversation under 3 minutes.';

    if (template_id) {
      const template = db.get('SELECT * FROM templates WHERE id = ?', [template_id]);
      if (template) {
        scriptBody = renderTemplate(template.body, lead);
      }
    }

    const contextPrefix = `You are calling ${lead.business_name || 'a contractor'}${lead.city ? ` in ${lead.city}, ${lead.state}` : ''}. Their service type is ${lead.service_type || 'general contracting'}.\n\n`;
    const fullScript = contextPrefix + scriptBody;

    const result = await vapiService.startCall(lead, fullScript);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    db.run(
      `INSERT INTO calls (lead_id, template_id, vapi_call_id, status, monitor_listen_url, monitor_control_url, started_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [lead_id, template_id || null, result.callId, result.status || 'queued', result.listenUrl || null, result.controlUrl || null]
    );

    const call = db.get('SELECT * FROM calls WHERE vapi_call_id = ?', [result.callId]);

    res.json({ success: true, data: { id: call.id, vapi_call_id: result.callId, status: result.status, monitor_listen_url: result.listenUrl, monitor_control_url: result.controlUrl } });
  } catch (err) {
    next(err);
  }
});

// POST /api/calls/:callId/end — force-end a call
router.post('/:callId/end', async (req, res, next) => {
  try {
    const call = db.get('SELECT * FROM calls WHERE id = ?', [req.params.callId]);
    if (!call) return res.status(404).json({ success: false, error: 'Call not found' });

    if (call.vapi_call_id) {
      await vapiService.endCall(call.vapi_call_id);
    }

    db.run(
      "UPDATE calls SET status = 'completed', ended_at = CURRENT_TIMESTAMP WHERE id = ?",
      [call.id]
    );

    res.json({ success: true, data: { id: call.id, status: 'completed' } });
  } catch (err) {
    next(err);
  }
});

// POST /api/calls/queue — set call queue
router.post('/queue', (req, res) => {
  const { lead_ids, template_id } = req.body;
  if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
    return res.status(400).json({ success: false, error: 'lead_ids array required' });
  }
  if (!template_id) {
    return res.status(400).json({ success: false, error: 'template_id required' });
  }

  // Clear existing queue
  db.run("DELETE FROM call_queue WHERE status = 'pending'");

  let queued = 0;
  for (let i = 0; i < lead_ids.length; i++) {
    const lead = db.get('SELECT id, phone, dnc_at, phone_valid FROM leads WHERE id = ?', [lead_ids[i]]);
    if (lead && lead.phone && !lead.dnc_at && lead.phone_valid !== 0) {
      db.run(
        'INSERT INTO call_queue (lead_id, template_id, position, status) VALUES (?, ?, ?, ?)',
        [lead.id, template_id, i + 1, 'pending']
      );
      queued++;
    }
  }

  res.json({ success: true, data: { queued } });
});

// POST /api/calls/queue/next — start next call in queue
router.post('/queue/next', async (req, res, next) => {
  try {
    const next_item = db.get(
      "SELECT * FROM call_queue WHERE status = 'pending' AND (scheduled_for IS NULL OR scheduled_for <= datetime('now')) ORDER BY position ASC LIMIT 1"
    );
    if (!next_item) {
      return res.json({ success: true, data: null, message: 'Queue is empty' });
    }

    const lead = db.get('SELECT * FROM leads WHERE id = ? AND dnc_at IS NULL', [next_item.lead_id]);
    if (!lead || !lead.phone || lead.phone_valid === 0) {
      db.run("UPDATE call_queue SET status = 'skipped' WHERE id = ?", [next_item.id]);
      return res.json({ success: false, error: 'Lead skipped (DNC, no phone, or invalid phone)' });
    }

    // Best time windows check (8–10 AM and 4–6 PM local time)
    const bestTimeEnabled = db.get("SELECT value FROM settings WHERE key = 'vapi_best_time_enabled'")?.value === '1';
    if (bestTimeEnabled && lead.state) {
      const tz = STATE_TO_TIMEZONE[lead.state.toUpperCase()] || 'America/Chicago';
      const localHour = parseInt(
        new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date())
      );
      const inWindow = (localHour >= 8 && localHour < 10) || (localHour >= 16 && localHour < 18);
      if (!inWindow) {
        const nextWindowHour = localHour < 8 ? 8 : localHour < 16 ? 16 : 8;
        const nextLabel = nextWindowHour === 8 ? '8 AM' : '4 PM';
        return res.status(425).json({
          success: false,
          error: 'outside_window',
          message: `Outside calling window for ${lead.state} (${tz}). Local hour: ${localHour}. Next window: ${nextLabel}.`,
          local_hour: localHour,
          timezone: tz,
        });
      }
    }

    let scriptBody = '';
    const template = db.get('SELECT * FROM templates WHERE id = ?', [next_item.template_id]);
    if (template) {
      scriptBody = renderTemplate(template.body, lead);
    }

    const contextPrefix = `You are calling ${lead.business_name || 'a contractor'}${lead.city ? ` in ${lead.city}, ${lead.state}` : ''}. Their service type is ${lead.service_type || 'general contracting'}.\n\n`;

    const result = await vapiService.startCall(lead, contextPrefix + scriptBody);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    db.run("UPDATE call_queue SET status = 'started' WHERE id = ?", [next_item.id]);

    db.run(
      `INSERT INTO calls (lead_id, template_id, vapi_call_id, status, monitor_listen_url, monitor_control_url, started_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [lead.id, next_item.template_id, result.callId, result.status || 'queued', result.listenUrl || null, result.controlUrl || null]
    );

    const call = db.get('SELECT * FROM calls WHERE vapi_call_id = ?', [result.callId]);

    res.json({ success: true, data: { id: call.id, vapi_call_id: result.callId, status: result.status } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/calls/queue — clear queue
router.delete('/queue', (req, res) => {
  db.run("DELETE FROM call_queue WHERE status = 'pending'");
  res.json({ success: true, data: { cleared: true } });
});

// PATCH /api/calls/bulk/outcome — bulk update call outcomes
router.patch('/bulk/outcome', (req, res) => {
  const { call_ids, outcome } = req.body;
  const valid = ['interested', 'callback_requested', 'not_interested', 'no_answer', 'voicemail', 'wrong_number', 'transferred'];
  if (!Array.isArray(call_ids) || call_ids.length === 0) return res.status(400).json({ success: false, error: 'call_ids required' });
  if (!valid.includes(outcome)) return res.status(400).json({ success: false, error: 'Invalid outcome' });

  let updated = 0;
  for (const id of call_ids) {
    const call = db.get('SELECT * FROM calls WHERE id = ?', [id]);
    if (call) {
      db.run('UPDATE calls SET outcome = ? WHERE id = ?', [outcome, id]);
      updated++;
    }
  }
  res.json({ success: true, data: { updated } });
});

// POST /api/calls/:callId/takeover — send control message to transfer call to fallback phone
router.post('/:callId/takeover', async (req, res, next) => {
  try {
    const call = db.get('SELECT * FROM calls WHERE id = ?', [req.params.callId]);
    if (!call) return res.status(404).json({ success: false, error: 'Call not found' });

    const lead = db.get('SELECT business_name, phone FROM leads WHERE id = ?', [call.lead_id]);

    // Send control message via VAPI controlUrl if available
    if (call.monitor_control_url) {
      const fetch = require('node-fetch');
      try {
        // Inject a system message telling the AI to transfer immediately
        await fetch(call.monitor_control_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'add-message',
            message: {
              role: 'system',
              content: 'The human operator is taking over this call. Say "Please hold for one moment, I\'m connecting you with our specialist now." then immediately use the transferCall tool to transfer the call.',
            },
          }),
        });
      } catch (e) {
        // Control message failed — fall through to return phone number
      }
    }

    res.json({
      success: true,
      data: {
        message: 'Takeover initiated',
        contractor_phone: lead?.phone || null,
        contractor_name: lead?.business_name || null,
        control_available: !!call.monitor_control_url,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/calls/:callId/whisper — inject a system message to AI mid-call (operator can't be heard by lead)
router.post('/:callId/whisper', async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, error: 'message required' });

    const call = db.get('SELECT * FROM calls WHERE id = ?', [req.params.callId]);
    if (!call) return res.status(404).json({ success: false, error: 'Call not found' });

    if (call.monitor_control_url) {
      const fetch = require('node-fetch');
      await fetch(call.monitor_control_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'add-message',
          message: { role: 'system', content: `[WHISPER FROM OPERATOR]: ${message}. Naturally work this into your next response.` },
        }),
      });
    }

    res.json({ success: true, data: { sent: !!call.monitor_control_url } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/calls/:callId/outcome — manually set/override call outcome
router.patch('/:callId/outcome', async (req, res) => {
  const { outcome } = req.body;
  const valid = ['interested', 'callback_requested', 'not_interested', 'no_answer', 'voicemail', 'wrong_number', 'transferred'];
  if (!valid.includes(outcome)) {
    return res.status(400).json({ success: false, error: 'Invalid outcome' });
  }

  const call = db.get('SELECT * FROM calls WHERE id = ?', [req.params.callId]);
  if (!call) return res.status(404).json({ success: false, error: 'Call not found' });

  db.run('UPDATE calls SET outcome = ? WHERE id = ?', [outcome, call.id]);

  const lead = db.get('SELECT * FROM leads WHERE id = ?', [call.lead_id]);

  if (outcome === 'callback_requested') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const followup = d.toISOString().split('T')[0] + ' 09:00:00';
    db.run(
      `UPDATE leads SET next_followup_at = ?,
       status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [followup, call.lead_id]
    );
  }

  if (outcome === 'interested') {
    db.run(
      "UPDATE lead_sequences SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE lead_id = ? AND status = 'active'",
      [call.lead_id]
    );
    db.run(
      "UPDATE leads SET status = 'qualified', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('new', 'contacted')",
      [call.lead_id]
    );
    const { autoEnrollLeads, getDefaultSequenceId } = require('../services/enrollmentService');
    const defaultSeqId = getDefaultSequenceId();
    if (defaultSeqId) {
      autoEnrollLeads([call.lead_id], parseInt(defaultSeqId));
    }
  }

  // Post-call SMS (voicemail + no_answer only)
  const smsService = require('../services/smsService');
  if (['voicemail', 'no_answer'].includes(outcome) && lead && lead.phone && smsService.isConfigured()) {
    const smsTemplateName = outcome === 'voicemail'
      ? 'Post-Call SMS — Voicemail'
      : 'Post-Call SMS — No Answer';
    const smsTmpl = db.get("SELECT * FROM templates WHERE name = ? AND channel = 'sms' LIMIT 1", [smsTemplateName]);
    if (smsTmpl) {
      const smsBody = renderTemplate(smsTmpl.body, lead);
      const smsResult = await smsService.sendSms(lead.phone, smsBody);
      if (smsResult.success) {
        db.run(
          "INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, 'sms_sent', 'Post-call SMS sent', ?, ?)",
          [lead.id, `Auto-sent after ${outcome} call`, JSON.stringify({ twilio_sid: smsResult.sid, template_name: smsTemplateName })]
        );
      }
    }
  }

  res.json({ success: true, data: { id: call.id, outcome } });
});

// POST /api/calls/coach — AI objection coaching for manual callers
router.post('/coach', async (req, res, next) => {
  try {
    const { lead_id, objection, script_body } = req.body;
    if (!objection?.trim()) return res.status(400).json({ success: false, error: 'objection required' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY not set' });

    const lead = lead_id ? db.get('SELECT business_name, city, state, service_type FROM leads WHERE id = ?', [lead_id]) : null;
    const contextLine = lead
      ? `Business: ${lead.business_name || 'Unknown'} in ${[lead.city, lead.state].filter(Boolean).join(', ')} — ${lead.service_type || 'general'}.`
      : 'Business: unknown contractor.';
    const scriptLine = script_body?.trim() ? `\n\nCall script:\n${script_body.slice(0, 800)}` : '';
    const userMessage = `${contextLine}${scriptLine}\n\nObjection: "${objection.trim()}"\n\nWhat do I say right now?`;

    const fetch = require('node-fetch');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: `You are a battle-hardened sales coach. A rep is on a LIVE cold call right now selling AI lead response software to home service contractors.
Give 1-2 sentences the rep can say OUT LOUD right now to handle the objection.
Rules: Direct and confident. Focus on pain (missed leads, lost revenue) not features. No opener phrases like "Great question". Output ONLY the response — nothing else.`,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(500).json({ success: false, error: errData.error?.message || 'AI request failed' });
    }
    const data = await response.json();
    const suggestion = data.content?.[0]?.text?.trim() || '';
    res.json({ success: true, data: { suggestion } });
  } catch (err) { next(err); }
});

// GET /api/calls/:callId — single call detail
router.get('/:callId', (req, res) => {
  const call = db.get(`
    SELECT c.*, l.business_name, l.phone, l.city, l.state, l.service_type, l.email
    FROM calls c
    JOIN leads l ON l.id = c.lead_id
    WHERE c.id = ?
  `, [req.params.callId]);

  if (!call) return res.status(404).json({ success: false, error: 'Call not found' });
  res.json({ success: true, data: call });
});

module.exports = router;
