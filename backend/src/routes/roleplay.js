const express = require('express');
const router = express.Router();
const { callGemini } = require('../services/claudeService');
const db = require('../db');

const SCENARIO_OPENERS = {
  cold_opener: "Yeah, who's this?",
  warm_followup: "Oh yeah, I think I got an email from you. What's this about again?",
  price_objection: "What are we talking about here, how much does this cost?",
  close_demo: "Okay I hear you, it sounds interesting. I just don't know if this is the right time.",
  already_has_system: "We actually already have someone handling our follow-ups.",
  send_email: "Listen I'm on a job site right now. Can you just send me an email?",
};

const SCENARIO_LABELS = {
  cold_opener: 'Cold Opener',
  warm_followup: 'Warm Follow-up',
  price_objection: 'Price Objection',
  close_demo: 'Close the Demo',
  already_has_system: 'Already Has System',
  send_email: 'Send Me Email',
};

function buildRoleplayPrompt(lead, scenario) {
  const personality = [];
  if ((lead.rating || 0) >= 4.5) personality.push("You're established and confident. Harder to impress.");
  if (!lead.has_website) personality.push("Old-school. Skeptical of digital marketing people.");
  if ((lead.contact_count || 0) > 2) personality.push("You've heard pitches before. Slightly more guarded.");
  if ((lead.gatekeeper_count || 0) > 0) personality.push("Protective of your time. Brief answers.");
  if (!personality.length) personality.push("Busy but open to a good pitch if they earn it quickly.");

  const scenarioDesc = {
    cold_opener: 'A stranger is calling you out of the blue. You answered by reflex. You have 30 seconds of patience.',
    warm_followup: 'Someone emailed you a few days ago. You vaguely remember it but have no context.',
    price_objection: 'You cut straight to the chase — what does this cost? That determines if you keep listening.',
    close_demo: "You've heard enough to be mildly interested but you're hesitant to commit to a meeting right now.",
    already_has_system: 'You already have a solution in place (Jobber, a VA, or ServiceTitan). Why would you switch?',
    send_email: "You're literally on a job site. This is not a good time. At all.",
  };

  return `You are playing the role of the owner/decision-maker at ${lead.business_name || 'a contracting business'}, a ${lead.service_type || 'home services'} contractor in ${lead.city || 'Texas'}${lead.state ? `, ${lead.state}` : ''}.

YOUR PROFILE:
- Google rating: ${lead.rating ? `${lead.rating} stars (${lead.review_count || 0} reviews)` : 'no rating'}
- Has a website: ${lead.has_website ? 'yes' : 'no'}
- Prior contact attempts on file: ${lead.contact_count || 0}
- Owner name: ${lead.owner_name || 'not known'}

PERSONALITY (calibrated from profile):
${personality.join(' ')}

SCENARIO: ${scenarioDesc[scenario] || 'A sales call.'}

THE SELLER IS PITCHING: FieldStack — AI that responds to contractor leads in under 20 seconds, books appointments, prevents lead ghosting. Guarantee: 5 booked quotes or you don't pay.

RULES:
- Stay in character as the contractor at ALL times
- Respond in 1-3 short sentences (you're a busy contractor)
- Start skeptical. Warm up ONLY if they handle objections well
- Use contractor language: job sites, crew, dispatch, estimate, callbacks
- Push back harder if they give weak or generic responses
- If they earn a genuine commitment from you to a specific demo time, end your reply with [BOOKED]
- If they've truly lost you with bad responses and you hang up, end with [NOT_INTERESTED]
- Never break character or give coaching tips`;
}

function buildCoachPrompt(lead, scenario, transcript, outcome) {
  const outcomeStr = outcome === 'booked' ? '✓ Demo booked'
    : outcome === 'not_interested' ? '✗ Lost the prospect'
    : 'Inconclusive — no clear outcome';

  return `You are a world-class B2B sales coach specializing in contractor tech. Evaluate this cold call roleplay.

SELLER: Hector, selling FieldStack (AI that responds to contractor leads in under 20 seconds, books appointments, prevents lead ghosting)
PROSPECT: ${lead.business_name || 'Contractor'}, ${lead.service_type || 'home services'} in ${lead.city || 'Texas'}
SCENARIO: ${scenario}
OUTCOME: ${outcomeStr}

TRANSCRIPT:
${transcript}

SCORE THESE 7 CRITERIA (0-10 each):
1. PATTERN INTERRUPT — Did the opener stop the hang-up reflex? Was it unexpected and specific?
2. DISCOVERY — Did they ask about current lead flow BEFORE pitching features?
3. PAIN AMPLIFICATION — Did they quantify the cost of slow response before offering a fix?
4. SOCIAL PROOF TIMING — Was any case study or proof used AFTER pain was established (not before)?
5. OBJECTION HANDLING — Did they use acknowledge → reframe → advance? Or did they cave or argue?
6. URGENCY — Did they create a real reason to act now (busy season, limited spots, competitor threat)?
7. CLOSE ATTEMPT — Did they ask for a SPECIFIC time slot, not just "are you interested?"

FORMAT YOUR RESPONSE EXACTLY AS:
**OVERALL: X/10**

| Criterion | Score | Note |
|-----------|-------|------|
| Pattern Interrupt | X/10 | one sentence |
| Discovery | X/10 | one sentence |
| Pain Amplification | X/10 | one sentence |
| Social Proof Timing | X/10 | one sentence |
| Objection Handling | X/10 | one sentence |
| Urgency | X/10 | one sentence |
| Close Attempt | X/10 | one sentence |

**What landed:**
- "[exact quote from transcript]" — why it worked

**What to fix:**
- "[exact quote from transcript]" → try: "[better version]"

**THE ONE DRILL:**
The single highest-leverage thing to practice before the next session (1-2 sentences max).`;
}

// POST /api/roleplay/message
router.post('/message', async (req, res, next) => {
  try {
    const { lead_id, scenario, messages = [] } = req.body;
    if (!lead_id || !scenario) return res.status(400).json({ success: false, error: 'lead_id and scenario are required' });

    const lead = db.get('SELECT * FROM leads WHERE id = ?', [lead_id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    // First message — return hardcoded opener, no AI call needed
    if (messages.length === 0) {
      const opener = SCENARIO_OPENERS[scenario] || "Hello?";
      return res.json({ success: true, data: { reply: opener, outcome: null } });
    }

    const systemPrompt = buildRoleplayPrompt(lead, scenario);
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const data = await callGemini(fullMessages, false);
    const raw = data.choices?.[0]?.message?.content || '';

    const outcome = raw.includes('[BOOKED]') ? 'booked'
      : raw.includes('[NOT_INTERESTED]') ? 'not_interested'
      : null;

    const reply = raw.replace(/\[BOOKED\]|\[NOT_INTERESTED\]/g, '').trim();

    res.json({ success: true, data: { reply, outcome } });
  } catch (err) {
    next(err);
  }
});

// POST /api/roleplay/coach
router.post('/coach', async (req, res, next) => {
  try {
    const { lead_id, scenario, messages = [], outcome } = req.body;
    if (!lead_id || !scenario) return res.status(400).json({ success: false, error: 'lead_id and scenario are required' });

    const lead = db.get('SELECT * FROM leads WHERE id = ?', [lead_id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    const transcript = messages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role === 'user' ? 'HECTOR' : 'CONTRACTOR'}: ${m.content}`)
      .join('\n');

    const coachPrompt = buildCoachPrompt(lead, scenario, transcript, outcome);
    const data = await callGemini([{ role: 'user', content: coachPrompt }], false);
    const report = data.choices?.[0]?.message?.content || '';

    res.json({ success: true, data: { report } });
  } catch (err) {
    next(err);
  }
});

// POST /api/roleplay/drill
// Body: { objection, response }
router.post('/drill', async (req, res, next) => {
  try {
    const { objection, response } = req.body;
    if (!objection || !response) return res.status(400).json({ success: false, error: 'objection and response required' });

    const prompt = `You are an elite B2B sales coach for contractor tech sales.

WHAT'S BEING SOLD: FieldStack — AI that responds to contractor leads in under 20 seconds, books appointments. Guarantee: 5 booked quotes or free.

OBJECTION: "${objection}"
SELLER'S RESPONSE: "${response}"

RATE THE RESPONSE using this scale:
1 = Caved completely or had no answer
2 = Acknowledged but no reframe
3 = Decent reframe, no attempt to advance
4 = Strong reframe + tried to advance
5 = Perfect: acknowledge → pain amplify → reframe → specific next step

Return ONLY valid JSON, no markdown:
{"score": N, "feedback": "One specific sentence about what worked or what to fix. Reference the exact words they used."}`;

    const data = await callGemini([{ role: 'user', content: prompt }], false);
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    let parsed;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : raw);
    } catch {
      parsed = { score: 3, feedback: 'Could not evaluate. Try again.' };
    }

    res.json({ success: true, data: { score: Math.max(1, Math.min(5, parsed.score || 3)), feedback: parsed.feedback || '' } });
  } catch (err) {
    next(err);
  }
});

// GET /api/roleplay/real-objections — pull actual objections from past calls' ai_key_intel
router.get('/real-objections', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const rows = db.all(`
      SELECT c.ai_key_intel, l.business_name, l.service_type
      FROM calls c
      JOIN leads l ON l.id = c.lead_id
      WHERE c.ai_key_intel IS NOT NULL
        AND length(c.ai_key_intel) > 10
        AND c.outcome IN ('not_interested', 'gatekeeper', 'callback_requested', 'no_answer')
      ORDER BY c.created_at DESC
      LIMIT ?
    `, [limit]);

    const objections = [];
    for (const row of rows) {
      const text = row.ai_key_intel || '';
      // Try to extract explicit objection phrase
      const objMatch = text.match(/objection[s]?:?\s*([^.\n]+)/i)
        || text.match(/said[:\s]+"?([^".\n]{10,120})"?/i)
        || text.match(/mentioned[:\s]+([^.\n]{10,120})/i);
      const phrase = objMatch ? objMatch[1].trim() : text.split(/[.\n]/)[0].trim();
      if (phrase.length >= 8 && phrase.length <= 200) {
        objections.push(phrase);
      }
    }

    // Deduplicate
    const unique = [...new Set(objections)];
    res.json({ success: true, data: unique });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
});

module.exports = router;
