const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const crypto = require('crypto');
const db = require('../db');

const SERVICE_LABELS = {
  hvac: 'HVAC',
  roofing: 'Roofing',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  landscaping: 'Landscaping',
  pest_control: 'Pest Control',
  general: 'General Contracting',
};

async function callGemini(messages, systemPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const payload = {
    model: 'gemini-2.5-flash',
    max_tokens: 512,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  };

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error('[SamDemo] Gemini API error:', response.status, errBody);
    throw new Error(`AI service error (${response.status})`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content || '';
}

// POST /api/sam-demo/simulate
router.post('/simulate', async (req, res) => {
  try {
    const { contractor, messages } = req.body;
    if (!contractor?.name) return res.status(400).json({ success: false, error: 'contractor.name is required' });
    if (!contractor?.service_type) return res.status(400).json({ success: false, error: 'contractor.service_type is required' });
    if (!contractor?.city) return res.status(400).json({ success: false, error: 'contractor.city is required' });
    if (!Array.isArray(messages)) return res.status(400).json({ success: false, error: 'messages array is required' });

    const serviceLabel = SERVICE_LABELS[contractor.service_type] || contractor.service_type;

    const systemPrompt = `You are Sam, a friendly AI scheduling assistant texting on behalf of ${contractor.name}, a ${serviceLabel} company in ${contractor.city}, Texas.
Your job: qualify the homeowner, build urgency, and book a quote appointment.
Rules:
- Maximum 2 sentences per reply. No emojis.
- Sound human and local — not corporate or robotic.
- Ask one qualifying question per reply to move the conversation forward.
- Always push toward scheduling ("When works for you?", "Can we get you on the calendar?", "We have availability this week.").
- If asked if you are a robot or AI, say: "I'm Sam, the scheduling assistant for ${contractor.name}. Let me get you connected with the right person."
- Never identify yourself as an AI assistant.
- Use urgency cues: "slots are filling up", "we're in your area this week", etc.`;

    const geminiMessages = messages.map(m => ({
      role: m.role === 'sam' ? 'assistant' : 'user',
      content: m.text,
    }));

    const reply = await callGemini(geminiMessages, systemPrompt);

    res.json({ success: true, data: { reply: reply.trim() } });
  } catch (err) {
    console.error('[SamDemo] simulate error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/sam-demo/proposal
router.post('/proposal', async (req, res) => {
  try {
    const { name, service_type, city, avg_job_value, monthly_leads, sam_price } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });
    if (!service_type) return res.status(400).json({ success: false, error: 'service_type is required' });

    const serviceLabel = SERVICE_LABELS[service_type] || service_type;
    const avgJob = Number(avg_job_value) || 5000;
    const monthlyLeads = Number(monthly_leads) || 15;
    const samCost = Number(sam_price) || 497;
    const monthlyGhosted = Math.round(monthlyLeads * 0.65);
    const revenueAtRisk = monthlyGhosted * avgJob;

    const systemPrompt = `You are a sales consultant writing a personalized growth proposal for a contractor considering Sam AI.`;

    const prompt = `Write a personalized growth proposal for this contractor:
- Business: ${name}
- Industry: ${serviceLabel}
- Location: ${city || 'Texas'}
- Average job value: $${avgJob.toLocaleString()}
- Estimated monthly leads: ${monthlyLeads}
- Sam AI price: $${samCost}/month

Return ONLY valid JSON (no markdown, no code fences) in this exact shape:
{
  "pain_point": "1 compelling sentence describing their specific lead-ghosting pain as a ${serviceLabel} company",
  "pitch": "2-3 sentence personalized pitch for why Sam AI is their solution",
  "proof_points": ["brief proof point 1", "brief proof point 2", "brief proof point 3"],
  "cta": "1 sentence closing call to action"
}

Rules:
- Use the contractor's business name and industry throughout.
- Make it feel specific to them — not generic.
- Pain point should reference being busy on job sites or missing calls while doing ${serviceLabel} work.
- Proof points should be concrete (speed to lead, response rate, etc.).`;

    const rawText = await callGemini([{ role: 'user', content: prompt }], systemPrompt);

    let aiData;
    try {
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      aiData = JSON.parse(cleaned);
    } catch {
      console.error('[SamDemo] Failed to parse proposal AI response:', rawText);
      return res.status(502).json({ success: false, error: 'AI returned invalid JSON. Try again.' });
    }

    const roiMultiple = samCost > 0 ? Math.round(revenueAtRisk / samCost) : 0;

    const proposal = {
      pain_point: aiData.pain_point || '',
      ghosted_pct: 65,
      monthly_ghosted: monthlyGhosted,
      monthly_revenue_at_risk: revenueAtRisk,
      sam_cost: samCost,
      roi_multiple: `${roiMultiple}x`,
      pitch: aiData.pitch || '',
      proof_points: aiData.proof_points || [],
      cta: aiData.cta || '',
    };

    res.json({ success: true, data: proposal });
  } catch (err) {
    console.error('[SamDemo] proposal error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/sam-demo/send-proposal
router.post('/send-proposal', async (req, res) => {
  try {
    const { to, contractor_name, pdf_base64 } = req.body;
    if (!to) return res.status(400).json({ success: false, error: 'Recipient email (to) is required' });
    if (!pdf_base64) return res.status(400).json({ success: false, error: 'pdf_base64 is required' });

    const rows = db.all('SELECT key, value FROM settings WHERE key IN (?, ?)', ['resend_api_key', 'resend_from']);
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });

    const resendKey = settings.resend_api_key;
    const fromEmail = settings.resend_from;
    if (!resendKey || !fromEmail) {
      return res.status(400).json({ success: false, error: 'Resend not configured. Set API key and sender email in Settings.' });
    }

    const name = contractor_name || 'Your Company';

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: `Growth Proposal for ${name} — FieldStack`,
        html: `<p>Hi,</p><p>Please find attached a personalized growth proposal for <strong>${name}</strong>.</p><p>This shows exactly how much revenue you're leaving on the table from unanswered leads — and how Sam AI fixes it.</p><p>Let me know if you have any questions.</p><p>— FieldStack</p>`,
        attachments: [
          {
            filename: `Proposal - ${name}.pdf`,
            content: pdf_base64,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[SamDemo] Resend error:', response.status, errBody);
      return res.status(502).json({ success: false, error: 'Failed to send email. Check Resend config.' });
    }

    const result = await response.json();
    res.json({ success: true, data: { id: result.id } });
  } catch (err) {
    console.error('[SamDemo] send-proposal error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/sam-demo/recordings — save a demo conversation for sharing
router.post('/recordings', (req, res) => {
  try {
    const { contractor, messages } = req.body;
    if (!contractor?.name || !contractor?.service_type || !contractor?.city) {
      return res.status(400).json({ success: false, error: 'contractor (name, service_type, city) is required' });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'messages array is required' });
    }

    const token = crypto.randomBytes(12).toString('hex');
    db.run(
      `INSERT INTO sam_demo_recordings (share_token, contractor_name, service_type, city, messages) VALUES (?, ?, ?, ?, ?)`,
      [token, contractor.name, contractor.service_type, contractor.city, JSON.stringify(messages)]
    );

    res.json({ success: true, data: { token, url: `/demo/recording/${token}` } });
  } catch (err) {
    console.error('[SamDemo] save recording error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/sam-demo/recordings/:token — public endpoint to fetch a saved demo
router.get('/recordings/:token', (req, res) => {
  try {
    const row = db.get('SELECT * FROM sam_demo_recordings WHERE share_token = ?', [req.params.token]);
    if (!row) return res.status(404).json({ success: false, error: 'Recording not found' });

    let messages;
    try { messages = JSON.parse(row.messages); } catch { messages = []; }

    res.json({
      success: true,
      data: {
        contractor_name: row.contractor_name,
        service_type: row.service_type,
        city: row.city,
        messages,
        created_at: row.created_at,
      },
    });
  } catch (err) {
    console.error('[SamDemo] fetch recording error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
