const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { db } = require('../db');

const JOB_TYPE_LABELS = {
  hvac: 'HVAC',
  roofing: 'Roofing',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  landscaping: 'Landscaping',
  pest_control: 'Pest Control',
  general: 'General Contracting',
};

// POST /api/estimates/analyze
router.post('/analyze', async (req, res) => {
  try {
    const { image_base64, mime_type, job_type, notes } = req.body;

    if (!image_base64) return res.status(400).json({ success: false, error: 'image_base64 is required' });
    if (!job_type) return res.status(400).json({ success: false, error: 'job_type is required' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(503).json({ success: false, error: 'GEMINI_API_KEY not configured' });

    const jobLabel = JOB_TYPE_LABELS[job_type] || job_type;
    const prompt = `You are an expert licensed contractor estimator with 20 years of experience in US markets.
Analyze this ${jobLabel} job photo${notes ? ` (notes: ${notes})` : ''}.

Return ONLY valid JSON (no markdown, no code fences) in this exact shape:
{
  "scope": "2-3 sentence description of what the job involves",
  "line_items": [
    { "description": "...", "quantity": 1, "unit": "each", "cost_low": 0, "cost_high": 0 }
  ],
  "total_low": 0,
  "total_high": 0,
  "confidence": "low",
  "flags": []
}

Rules:
- Use realistic US market pricing for 2024 (materials + labor)
- Break labor and materials into separate line items
- unit values: "each", "sqft", "lf", "hr", "lot", "ton", "unit"
- confidence: "high" if photo is clear and job scope is obvious, "medium" if some uncertainty, "low" if unclear
- flags: permit required, structural concern, asbestos risk, mold risk, etc. — empty array if none
- If photo is unclear, set confidence "low" and explain in flags`;

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:${mime_type || 'image/jpeg'};base64,${image_base64}` },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[Estimates] Gemini API error:', response.status, errBody);
      return res.status(502).json({ success: false, error: `AI service error (${response.status})` });
    }

    const aiResponse = await response.json();
    const rawText = aiResponse.choices?.[0]?.message?.content || '';

    let parsed;
    try {
      // Strip any accidental markdown fences
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[Estimates] Failed to parse AI response:', rawText);
      return res.status(502).json({ success: false, error: 'AI returned invalid JSON. Try a clearer photo.' });
    }

    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('[Estimates] analyze error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/estimates — save estimate
router.post('/', (req, res) => {
  try {
    const { lead_id, job_type, notes, scope, line_items, total_low, total_high, confidence, flags } = req.body;
    if (!job_type) return res.status(400).json({ success: false, error: 'job_type is required' });

    const result = db.run(
      `INSERT INTO estimates (lead_id, job_type, notes, scope, line_items, total_low, total_high, confidence, flags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lead_id || null,
        job_type,
        notes || null,
        scope || null,
        line_items ? JSON.stringify(line_items) : null,
        total_low || 0,
        total_high || 0,
        confidence || null,
        flags ? JSON.stringify(flags) : null,
      ]
    );

    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err) {
    console.error('[Estimates] save error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/estimates — list estimates
router.get('/', (req, res) => {
  try {
    const { lead_id } = req.query;
    let rows;
    if (lead_id) {
      rows = db.all('SELECT * FROM estimates WHERE lead_id = ? ORDER BY created_at DESC', [lead_id]);
    } else {
      rows = db.all('SELECT * FROM estimates ORDER BY created_at DESC LIMIT 100', []);
    }

    const parsed = rows.map(r => ({
      ...r,
      line_items: r.line_items ? JSON.parse(r.line_items) : [],
      flags: r.flags ? JSON.parse(r.flags) : [],
    }));

    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('[Estimates] list error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
