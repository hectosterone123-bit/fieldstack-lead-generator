const express = require('express');
const router = express.Router();
const db = require('../db');
const vapiService = require('../services/vapiService');
const { renderTemplate } = require('../services/templateService');
const { recomputeHeatScore } = require('../services/heatScoreService');

// GET /api/calls/active — currently active calls
router.get('/active', (req, res) => {
  const calls = db.all(`
    SELECT c.*, l.business_name, l.phone, l.city, l.state, l.service_type
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
    SELECT cq.*, l.business_name, l.phone, l.city, l.state
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
    SELECT c.*, l.business_name, l.phone, l.city, l.state
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
    const lead = db.get('SELECT id, phone FROM leads WHERE id = ?', [lead_ids[i]]);
    if (lead && lead.phone) {
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
      "SELECT * FROM call_queue WHERE status = 'pending' ORDER BY position ASC LIMIT 1"
    );
    if (!next_item) {
      return res.json({ success: true, data: null, message: 'Queue is empty' });
    }

    const lead = db.get('SELECT * FROM leads WHERE id = ?', [next_item.lead_id]);
    if (!lead || !lead.phone) {
      db.run("UPDATE call_queue SET status = 'skipped' WHERE id = ?", [next_item.id]);
      return res.json({ success: false, error: 'Lead has no phone, skipped' });
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
