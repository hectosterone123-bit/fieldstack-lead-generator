const express = require('express');
const router = express.Router();
const db = require('../db');

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const MODEL = 'gemini-2.5-flash';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(num, denom) {
  if (!denom) return 0;
  return Math.round((num / denom) * 100);
}

function safeGet(sql, fallback = null) {
  try { return db.get(sql) ?? fallback; } catch { return fallback; }
}
function safeAll(sql) {
  try { return db.all(sql); } catch { return []; }
}

function computeMetrics() {
  const total_leads = safeGet('SELECT COUNT(*) as n FROM leads', { n: 0 }).n || 0;

  const by_status_rows = safeAll("SELECT status, COUNT(*) as n FROM leads GROUP BY status");
  const by_status = {};
  for (const r of by_status_rows) by_status[r.status] = r.n;

  const contacted_leads = (by_status.contacted || 0) + (by_status.qualified || 0) + (by_status.proposal_sent || 0) + (by_status.booked || 0) + (by_status.closed_won || 0);
  const booked = (by_status.booked || 0) + (by_status.closed_won || 0);
  const conversion_rate = pct(booked, total_leads);

  const by_source_rows = safeAll("SELECT source, COUNT(*) as n FROM leads GROUP BY source");

  const total_emails_sent = safeGet("SELECT COUNT(*) as n FROM activities WHERE type = 'email_sent'", { n: 0 }).n || 0;
  const total_opens = safeGet("SELECT COUNT(DISTINCT lead_id) as n FROM leads WHERE email_opened_at IS NOT NULL", { n: 0 }).n || 0;
  const total_replies = safeGet("SELECT COUNT(*) as n FROM activities WHERE type = 'email_replied'", { n: 0 }).n || 0;
  const open_rate = pct(total_opens, total_emails_sent);
  const reply_rate = pct(total_replies, total_emails_sent);

  const active_enrollments = safeGet("SELECT COUNT(*) as n FROM lead_sequences WHERE status = 'active'", { n: 0 }).n || 0;

  const proposals_open_count = (by_status.proposal_sent || 0);

  const hot_leads_count = safeGet("SELECT COUNT(*) as n FROM leads WHERE heat_score >= 70 AND status NOT IN ('lost','closed_won','booked')", { n: 0 }).n || 0;

  const leads_found_this_week = safeGet("SELECT COUNT(*) as n FROM leads WHERE datetime(created_at) >= datetime('now', '-7 days')", { n: 0 }).n || 0;

  const outreach_coverage = pct(contacted_leads, total_leads);

  const avg_untouched_age_days = Math.round(safeGet("SELECT AVG((julianday('now') - julianday(created_at))) as avg FROM leads WHERE status = 'new' AND last_contacted_at IS NULL", { avg: 0 }).avg || 0);

  const ghost_count = safeGet("SELECT COUNT(*) as n FROM leads WHERE status IN ('contacted','qualified') AND (last_contacted_at IS NULL OR datetime(last_contacted_at) < datetime('now', '-7 days'))", { n: 0 }).n || 0;

  const avg_speed_to_lead_minutes = Math.round(safeGet("SELECT AVG((julianday(last_contacted_at) - julianday(created_at)) * 1440) as avg FROM leads WHERE last_contacted_at IS NOT NULL AND contact_count >= 1 LIMIT 1", { avg: 0 }).avg || 0);

  return {
    total_leads, by_status, by_source: by_source_rows, contacted_leads, booked,
    conversion_rate, total_emails_sent, total_opens, total_replies,
    open_rate, reply_rate, active_enrollments, proposals_open_count,
    hot_leads_count, leads_found_this_week, outreach_coverage,
    avg_untouched_age_days, ghost_count, avg_speed_to_lead_minutes,
  };
}

function buildInsights(m) {
  const insights = [];

  const add = (id, type, priority, title, description, metric, action, action_href) => {
    insights.push({ id, type, priority, title, description, metric, action, action_href });
  };

  // Priority 1 — urgent
  if (m.total_leads < 50 && m.leads_found_this_week === 0) {
    add('pipeline_dry', 'warning', 1,
      'Pipeline is drying up',
      `You have ${m.total_leads} leads and added none this week. Without a steady flow, your call queue runs out fast.`,
      { label: 'Leads this week', value: '0', benchmark: '10–20/week' },
      'Find more leads', '/finder');
  }

  if (m.outreach_coverage < 30 && m.total_leads > 5) {
    add('no_outreach', 'warning', 1,
      'Most leads never contacted',
      `Only ${m.outreach_coverage}% of your leads have been reached out to. The rest are sitting cold.`,
      { label: 'Outreach coverage', value: `${m.outreach_coverage}%`, benchmark: '60%+' },
      'Start calling', '/leads');
  }

  if (m.hot_leads_count > 5 && m.outreach_coverage < 50) {
    add('hot_leads_untouched', 'warning', 1,
      `${m.hot_leads_count} hot leads haven't been contacted`,
      'High heat score leads are the most likely to convert. They should be your first calls every day.',
      { label: 'Hot leads', value: String(m.hot_leads_count), benchmark: '0 untouched' },
      'View hot leads', '/leads');
  }

  if (m.avg_speed_to_lead_minutes > 60 && m.contacted_leads > 5) {
    const hrs = m.avg_speed_to_lead_minutes >= 60
      ? `${Math.round(m.avg_speed_to_lead_minutes / 60)}h`
      : `${m.avg_speed_to_lead_minutes}m`;
    add('slow_speed_to_lead', 'warning', 1,
      'Slow response time',
      `You're averaging ${hrs} before first contact. Studies show response within 5 minutes gets 21× more qualified leads.`,
      { label: 'Avg speed to lead', value: hrs, benchmark: '< 5 min' },
      'View pipeline', '/leads');
  }

  // Priority 2 — important
  if (m.total_emails_sent > 20 && m.reply_rate < 3) {
    add('low_reply_rate', 'warning', 2,
      'Email reply rate is critically low',
      `Only ${m.reply_rate}% of emails get replies. Try a shorter, more direct message or a stronger offer.`,
      { label: 'Reply rate', value: `${m.reply_rate}%`, benchmark: '8–15%' },
      'Edit sequences', '/sequences');
  }

  if (m.total_emails_sent > 20 && m.open_rate < 20) {
    add('low_open_rate', 'warning', 2,
      'Low email open rate',
      `Only ${m.open_rate}% of emails are opened. Test a different subject line — first impressions matter most.`,
      { label: 'Open rate', value: `${m.open_rate}%`, benchmark: '30–50%' },
      'Edit sequences', '/sequences');
  }

  if (m.total_emails_sent > 20 && m.open_rate > 35 && m.reply_rate < 5) {
    add('open_no_reply', 'tip', 2,
      'People open but don\'t reply',
      `${m.open_rate}% open rate but only ${m.reply_rate}% reply. Your subject lines work — but the body or CTA needs fixing.`,
      { label: 'Open → Reply gap', value: `${m.open_rate}% → ${m.reply_rate}%`, benchmark: '10%+ reply' },
      'Rewrite email body', '/sequences');
  }

  if (m.active_enrollments === 0 && m.total_leads > 10) {
    add('no_sequences_active', 'tip', 2,
      'No active email sequences',
      `You have ${m.total_leads} leads but no one is enrolled in a sequence. You're doing all outreach manually.`,
      { label: 'Active enrollments', value: '0', benchmark: '1 per lead' },
      'Enroll leads', '/campaigns');
  }

  if (m.proposals_open_count >= 3) {
    add('stale_proposals', 'tip', 2,
      `${m.proposals_open_count} proposals haven't closed`,
      'Proposals that sit open for 2+ weeks rarely close. Follow up directly or disqualify them to keep your pipeline clean.',
      { label: 'Open proposals', value: String(m.proposals_open_count), benchmark: '< 3' },
      'View proposals', '/leads');
  }

  if (m.contacted_leads > 10 && m.ghost_count / m.contacted_leads > 0.3) {
    const ghostPct = pct(m.ghost_count, m.contacted_leads);
    add('high_ghost_rate', 'tip', 2,
      'High ghost rate',
      `${ghostPct}% of contacted leads went silent. Either your follow-up cadence is too slow or the channel isn't working.`,
      { label: 'Ghost rate', value: `${ghostPct}%`, benchmark: '< 20%' },
      'View ghosts', '/leads');
  }

  if (m.avg_untouched_age_days > 10 && m.total_leads > 5) {
    add('untouched_leads', 'tip', 2,
      'Leads sitting too long before first contact',
      `New leads are averaging ${m.avg_untouched_age_days} days before being contacted. The longer you wait, the colder they get.`,
      { label: 'Avg age before contact', value: `${m.avg_untouched_age_days}d`, benchmark: '< 2 days' },
      'Start calling', '/leads');
  }

  // Priority 3 — nice to know / good news
  if (m.reply_rate > 15 && m.total_emails_sent > 20) {
    add('good_reply_rate', 'good', 3,
      'Strong email reply rate',
      `${m.reply_rate}% reply rate is excellent. This sequence is working — consider enrolling more leads.`,
      { label: 'Reply rate', value: `${m.reply_rate}%`, benchmark: '8–15%' },
      'Enroll more leads', '/campaigns');
  }

  if (m.conversion_rate > 20 && m.total_leads < 100) {
    add('scale_signal', 'good', 3,
      'Strong close rate — time to scale',
      `${m.conversion_rate}% of leads reach booked status. Your pitch is working. Adding more leads at the top of the funnel will directly increase revenue.`,
      { label: 'Close rate', value: `${m.conversion_rate}%`, benchmark: '10–15%' },
      'Find more leads', '/finder');
  }

  if (m.leads_found_this_week === 0 && m.total_leads >= 50) {
    add('no_new_leads_week', 'info', 3,
      'No new leads added this week',
      'Your existing pipeline may be enough for now, but keep the Finder warm so you don\'t hit a gap in 2–3 weeks.',
      { label: 'New this week', value: '0', benchmark: 'ongoing' },
      'Find leads', '/finder');
  }

  if (m.by_source.length === 1 && m.total_leads > 20) {
    const src = m.by_source[0]?.source || 'one source';
    add('diversify_sources', 'tip', 3,
      'All leads from one source',
      `Every lead came from ${src}. Diversifying (Google Places, CSV import, manual) reduces risk and improves lead quality.`,
      { label: 'Sources', value: '1', benchmark: '2–3 sources' },
      'Try Google Places', '/finder');
  }

  insights.sort((a, b) => a.priority - b.priority || (a.type === 'warning' ? -1 : 1));
  return insights;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/insights — rule-based insight cards
router.get('/', (req, res, next) => {
  try {
    const metrics = computeMetrics();
    const insights = buildInsights(metrics);
    res.json({ success: true, data: { insights, metrics } });
  } catch (err) {
    console.error('[Insights] computeMetrics failed:', err.message);
    next(err);
  }
});

// POST /api/insights/ai-summary — Gemini strategic analysis
router.post('/ai-summary', async (req, res, next) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(400).json({ success: false, error: 'GEMINI_API_KEY not configured' });

    const metrics = computeMetrics();
    const insights = buildInsights(metrics);

    const prompt = `You are a sales strategy advisor for a solo HVAC contractor cold outreach operation.

Here are the current pipeline metrics:
- Total leads: ${metrics.total_leads}
- Outreach coverage: ${metrics.outreach_coverage}%
- Email reply rate: ${metrics.reply_rate}% (${metrics.total_replies} replies from ${metrics.total_emails_sent} sent)
- Email open rate: ${metrics.open_rate}%
- Conversion rate (booked/total): ${metrics.conversion_rate}%
- Active sequence enrollments: ${metrics.active_enrollments}
- Ghost leads (went silent): ${metrics.ghost_count}
- Hot leads not contacted: ${metrics.hot_leads_count}
- Avg speed to first contact: ${metrics.avg_speed_to_lead_minutes} minutes
- New leads this week: ${metrics.leads_found_this_week}
- Open proposals: ${metrics.proposals_open_count}

Current rule-based alerts triggered:
${insights.map(i => `- [${i.type.toUpperCase()}] ${i.title}: ${i.description}`).join('\n')}

Give a concise (3–5 sentence) strategic recommendation. Be direct and specific — what should this person do differently THIS week to improve results? Focus on the highest-leverage action. Do not restate the metrics; give advice.`;

    const body = {
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    };

    const geminiRes = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return res.status(502).json({ success: false, error: `AI error: ${errText}` });
    }

    const data = await geminiRes.json();
    const summary = data.choices?.[0]?.message?.content || '';
    res.json({ success: true, data: { summary } });
  } catch (err) { next(err); }
});

module.exports = router;
