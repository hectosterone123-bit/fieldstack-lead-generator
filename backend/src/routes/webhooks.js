const express = require('express');
const router = express.Router();
const db = require('../db');
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');
const { recomputeHeatScore } = require('../services/heatScoreService');

// Helper: calculate the UTC datetime of the next calling window (8 AM or 4 PM local)
function nextCallingWindowUtc(state) {
  const STATE_TO_TZ = {
    AL:'America/Chicago',AK:'America/Anchorage',AZ:'America/Phoenix',AR:'America/Chicago',
    CA:'America/Los_Angeles',CO:'America/Denver',CT:'America/New_York',DE:'America/New_York',
    FL:'America/New_York',GA:'America/New_York',HI:'Pacific/Honolulu',ID:'America/Denver',
    IL:'America/Chicago',IN:'America/Indiana/Indianapolis',IA:'America/Chicago',KS:'America/Chicago',
    KY:'America/New_York',LA:'America/Chicago',ME:'America/New_York',MD:'America/New_York',
    MA:'America/New_York',MI:'America/Detroit',MN:'America/Chicago',MS:'America/Chicago',
    MO:'America/Chicago',MT:'America/Denver',NE:'America/Chicago',NV:'America/Los_Angeles',
    NH:'America/New_York',NJ:'America/New_York',NM:'America/Denver',NY:'America/New_York',
    NC:'America/New_York',ND:'America/Chicago',OH:'America/New_York',OK:'America/Chicago',
    OR:'America/Los_Angeles',PA:'America/New_York',RI:'America/New_York',SC:'America/New_York',
    SD:'America/Chicago',TN:'America/Chicago',TX:'America/Chicago',UT:'America/Denver',
    VT:'America/New_York',VA:'America/New_York',WA:'America/Los_Angeles',WV:'America/New_York',
    WI:'America/Chicago',WY:'America/Denver',
  };
  const tz = (state && STATE_TO_TZ[state.toUpperCase()]) || 'America/Chicago';
  const now = new Date();
  const localHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now)
  );
  const targetHour = localHour < 8 ? 8 : localHour < 16 ? 16 : 8;
  const addDays = localHour >= 16 ? 1 : 0;
  const localDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  const [y, m, d] = localDateStr.split('-').map(Number);
  const candidate = new Date(Date.UTC(y, m - 1, d + addDays, targetHour, 0, 0));
  const localHourAtCandidate = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(candidate)
  );
  const result = new Date(candidate.getTime() - (localHourAtCandidate - targetHour) * 3600000);
  return result.toISOString().replace('T', ' ').split('.')[0];
}

// POST /api/webhooks/resend — Resend email event webhook
// Configure in Resend dashboard → Webhooks → Add endpoint
// URL: https://your-app.up.railway.app/api/webhooks/resend
// Events to enable: email.opened, email.clicked, email.bounced, email.complained
router.post('/resend', async (req, res) => {
  const { type, data } = req.body;

  // Helper: find lead_id by resend message ID
  function findLeadByMessageId(messageId) {
    if (!messageId) return null;
    return db.get(
      `SELECT lead_id FROM activities WHERE type = 'email_sent' AND json_extract(metadata, '$.resend_message_id') = ? LIMIT 1`,
      [messageId]
    );
  }

  if (type === 'email.opened') {
    const messageId = data?.email_id;
    const activity = findLeadByMessageId(messageId);
    if (activity) {
      db.run(
        'UPDATE leads SET email_opened_at = COALESCE(email_opened_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [activity.lead_id]
      );
      db.run(
        `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'email_opened', 'Email opened', 'Prospect opened your email')`,
        [activity.lead_id]
      );

      // Multi-open alert: SMS to user when lead opens 2+ times
      const openCount = db.get(
        `SELECT COUNT(*) as count FROM activities WHERE lead_id = ? AND type = 'email_opened'`,
        [activity.lead_id]
      )?.count || 0;

      if (openCount >= 2) {
        const alertPhone = db.get("SELECT value FROM settings WHERE key = 'alert_phone'")?.value;
        if (alertPhone && smsService.isConfigured()) {
          const lead = db.get('SELECT business_name, city FROM leads WHERE id = ?', [activity.lead_id]);
          if (lead) {
            const name = lead.business_name || 'A lead';
            const city = lead.city ? ` (${lead.city})` : '';
            smsService.sendSms(alertPhone, `Fieldstack: ${name}${city} opened your email ${openCount}x — send the Loom now`).catch(() => {});
          }
        }
      }
    }
  }

  else if (type === 'email.clicked') {
    const messageId = data?.email_id;
    const activity = findLeadByMessageId(messageId);
    if (activity) {
      const link = data?.click?.link || 'Link clicked';
      db.run(
        `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'email_clicked', 'Email link clicked', ?)`,
        [activity.lead_id, link]
      );
      // Boost heat score on click — stronger buying signal than open
      const lead = db.get('SELECT * FROM leads WHERE id = ?', [activity.lead_id]);
      if (lead) {
        const newScore = Math.min(recomputeHeatScore(lead) + 5, 100);
        if (newScore !== lead.heat_score) {
          db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newScore, lead.id]);
        }
      }
    }
  }

  else if (type === 'email.bounced') {
    const messageId = data?.email_id;
    const activity = findLeadByMessageId(messageId);
    if (activity) {
      db.run(
        'UPDATE leads SET email_invalid_at = COALESCE(email_invalid_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [activity.lead_id]
      );
      db.run(
        `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'email_bounced', 'Email bounced', 'Email address is invalid or unreachable — removed from future sends')`,
        [activity.lead_id]
      );
    }
  }

  else if (type === 'email.complained') {
    const messageId = data?.email_id;
    const activity = findLeadByMessageId(messageId);
    if (activity) {
      db.run(
        'UPDATE leads SET unsubscribed_at = COALESCE(unsubscribed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [activity.lead_id]
      );
      db.run(
        `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'email_complained', 'Spam complaint received', 'Lead marked this email as spam — unsubscribed automatically')`,
        [activity.lead_id]
      );
    }
  }

  res.json({ ok: true });
});

// POST /api/webhooks/email-inbound — future-ready inbound email parser endpoint
// Wire this to CloudMailin, SendGrid Inbound Parse, or similar service
// Expects: { to: "reply+{lead_id}@domain.com", from: "prospect@gmail.com", text: "reply body", subject: "Re: ..." }
router.post('/email-inbound', (req, res) => {
  const { to, from, text, subject } = req.body;

  // Extract lead_id from reply+{id}@domain.com
  const match = (Array.isArray(to) ? to[0] : to || '').match(/reply\+(\d+)@/);
  if (!match) return res.status(400).json({ ok: false, error: 'Could not parse lead_id from To address' });

  const leadId = parseInt(match[1]);
  const lead = db.get('SELECT * FROM leads WHERE id = ?', [leadId]);
  if (!lead) return res.status(404).json({ ok: false, error: 'Lead not found' });

  const replyBody = (text || '').slice(0, 500);

  // Log email reply activity
  db.run(
    'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
    [leadId, 'email_replied', 'Prospect replied via email', replyBody,
     JSON.stringify({ from, subject: subject || '' })]
  );

  // Auto-pause all active enrollments for this lead
  db.run(
    "UPDATE lead_sequences SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE lead_id = ? AND status = 'active'",
    [leadId]
  );

  db.run(
    'INSERT INTO activities (lead_id, type, title, description) VALUES (?, ?, ?, ?)',
    [leadId, 'note', 'Sequence auto-paused', 'Lead replied via email (auto-detected) — all active sequences paused']
  );

  res.json({ ok: true, lead_id: leadId });
});

// POST /api/webhooks/vapi — VAPI call event webhooks
router.post('/vapi', async (req, res) => {
  const { message } = req.body || {};
  if (!message) return res.json({ ok: true });

  const vapiCallId = message.call?.id;

  // Handle reportOutcome tool call (fires during the call)
  if (message.type === 'tool-calls') {
    const toolCalls = message.toolCallList || [];
    const results = [];
    for (const toolCall of toolCalls) {
      if (toolCall.function?.name === 'reportOutcome') {
        const args = toolCall.function.arguments || {};
        if (vapiCallId) {
          const callRecord = db.get('SELECT id FROM calls WHERE vapi_call_id = ?', [vapiCallId]);
          if (callRecord) {
            db.run(
              'UPDATE calls SET outcome = ?, ai_next_step = ?, ai_key_intel = ? WHERE id = ?',
              [args.outcome || null, args.next_step || null, args.key_intel || null, callRecord.id]
            );
          }
        }
        results.push({ toolCallId: toolCall.id, result: 'Outcome recorded.' });
      }
    }
    return res.json({ results });
  }

  if (message.type === 'end-of-call-report') {
    const callRecord = db.get('SELECT * FROM calls WHERE vapi_call_id = ?', [vapiCallId]);
    if (!callRecord) return res.json({ ok: true });

    const transcript = message.transcript || message.artifact?.transcript || null;
    const summary = message.summary || message.artifact?.summary || null;
    const recordingUrl = message.recordingUrl || message.artifact?.recordingUrl || null;
    const duration = message.call?.duration || message.durationSeconds || null;

    // If outcome was already set by reportOutcome tool call, keep it
    // Otherwise fall back to keyword-based detection from summary
    let outcome = callRecord.outcome;
    if (!outcome) {
      outcome = 'no_answer';
      if (summary) {
        const lower = summary.toLowerCase();
        if (lower.includes('interested') || lower.includes('quote') || lower.includes('schedule') || lower.includes('appointment')) {
          outcome = 'interested';
        } else if (lower.includes('callback') || lower.includes('call back') || lower.includes('call me back')) {
          outcome = 'callback_requested';
        } else if (lower.includes('not interested') || lower.includes('no thanks') || lower.includes('don\'t call')) {
          outcome = 'not_interested';
        } else if (lower.includes('voicemail') || lower.includes('leave a message')) {
          outcome = 'voicemail';
        } else if (lower.includes('wrong number')) {
          outcome = 'wrong_number';
        } else if (lower.includes('transfer')) {
          outcome = 'transferred';
        } else {
          outcome = 'not_interested';
        }
      }
    }

    db.run(
      `UPDATE calls SET status = 'completed', duration_seconds = ?, outcome = ?,
       transcript = ?, summary = ?, recording_url = ?, ended_at = CURRENT_TIMESTAMP
       WHERE vapi_call_id = ?`,
      [duration, outcome, typeof transcript === 'string' ? transcript : JSON.stringify(transcript), summary, recordingUrl, vapiCallId]
    );

    db.run(
      `INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, 'call_attempt', ?, ?, ?)`,
      [
        callRecord.lead_id,
        `AI call — ${outcome.replace(/_/g, ' ')}`,
        summary || 'AI cold call completed',
        JSON.stringify({ vapi_call_id: vapiCallId, duration, outcome, recording_url: recordingUrl }),
      ]
    );

    db.run(
      `UPDATE leads SET contact_count = contact_count + 1,
       last_contacted_at = CURRENT_TIMESTAMP,
       first_contacted_at = COALESCE(first_contacted_at, CURRENT_TIMESTAMP),
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [callRecord.lead_id]
    );

    const lead = db.get('SELECT * FROM leads WHERE id = ?', [callRecord.lead_id]);
    if (lead) {
      const newScore = recomputeHeatScore(lead);
      if (newScore !== lead.heat_score) {
        db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newScore, lead.id]);
      }
    }

    // Auto-pause sequences if interested
    if (outcome === 'interested' || outcome === 'callback_requested') {
      db.run(
        "UPDATE lead_sequences SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE lead_id = ? AND status = 'active'",
        [callRecord.lead_id]
      );
    }

    // Auto-schedule callback for tomorrow 9 AM
    if (outcome === 'callback_requested') {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      const followup = d.toISOString().split('T')[0] + ' 09:00:00';
      db.run(
        `UPDATE leads SET next_followup_at = ?,
         status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [followup, callRecord.lead_id]
      );
    }

    // Post-call email follow-up (auto-send based on outcome)
    const OUTCOME_TO_TEMPLATE = {
      voicemail:          'Post-Call — Voicemail Follow-Up',
      no_answer:          'Post-Call — Voicemail Follow-Up',
      callback_requested: 'Post-Call — Callback Requested',
      interested:         'Post-Call — Interest Follow-Up',
    };
    const followUpTemplateName = OUTCOME_TO_TEMPLATE[outcome];

    if (
      followUpTemplateName &&
      lead && lead.email &&
      !lead.unsubscribed_at &&
      !lead.email_invalid_at &&
      emailService.isConfigured()
    ) {
      const { renderTemplate } = require('../services/templateService');
      const tmpl = db.get(
        "SELECT * FROM templates WHERE name = ? AND channel = 'email' LIMIT 1",
        [followUpTemplateName]
      );
      if (tmpl) {
        const subject = renderTemplate(tmpl.subject, lead);
        const body    = renderTemplate(tmpl.body,    lead);
        const sendResult = await emailService.sendEmail(lead.email, subject, body, { leadId: lead.id });
        if (sendResult.success) {
          db.run(
            `INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, 'email_sent', ?, ?, ?)`,
            [
              lead.id,
              `Post-call email sent`,
              `Auto-sent after ${outcome.replace(/_/g, ' ')} call`,
              JSON.stringify({
                resend_message_id: sendResult.messageId,
                template_name: followUpTemplateName,
                vapi_call_id: vapiCallId,
              }),
            ]
          );
        }
      }
    }
    // Post-call SMS follow-up (voicemail + no_answer only)
    if (
      ['voicemail', 'no_answer'].includes(outcome) &&
      lead && lead.phone &&
      smsService.isConfigured()
    ) {
      const { renderTemplate } = require('../services/templateService');
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

    // Auto-enroll interested leads + advance to qualified
    if (outcome === 'interested') {
      const { autoEnrollLeads, getDefaultSequenceId } = require('../services/enrollmentService');
      const defaultSeqId = getDefaultSequenceId();
      if (defaultSeqId) {
        autoEnrollLeads([callRecord.lead_id], parseInt(defaultSeqId));
      }
      db.run(
        "UPDATE leads SET status = 'qualified', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('new', 'contacted')",
        [callRecord.lead_id]
      );
    }

    // Auto-DNC after max no-answer attempts
    if (['no_answer', 'voicemail'].includes(outcome)) {
      const maxAttempts = parseInt(
        db.get("SELECT value FROM settings WHERE key = 'vapi_max_no_answer_attempts'")?.value || '3'
      );
      if (maxAttempts > 0) {
        const attemptCount = db.get(
          "SELECT COUNT(*) as count FROM calls WHERE lead_id = ? AND outcome IN ('no_answer', 'voicemail')",
          [callRecord.lead_id]
        )?.count || 0;
        if (attemptCount >= maxAttempts) {
          db.run(
            'UPDATE leads SET dnc_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND dnc_at IS NULL',
            [callRecord.lead_id]
          );
          db.run(
            "INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'note', 'Auto-DNC applied', ?)",
            [callRecord.lead_id, `Exceeded no-answer retry cap (${maxAttempts} attempts). Lead auto-marked Do Not Call.`]
          );
        }
      }
    }

    // Auto-requeue for retry at next calling window (no_answer or voicemail, not DNC'd)
    if (['no_answer', 'voicemail'].includes(outcome)) {
      const freshLead = db.get('SELECT dnc_at, state FROM leads WHERE id = ?', [callRecord.lead_id]);
      if (freshLead && !freshLead.dnc_at) {
        const scheduledFor = nextCallingWindowUtc(freshLead.state);
        db.run(
          "INSERT INTO call_queue (lead_id, template_id, position, status, scheduled_for) VALUES (?, ?, 9999, 'pending', ?)",
          [callRecord.lead_id, callRecord.template_id || 1, scheduledFor]
        );
      }
    }
  }

  if (message.type === 'status-update') {
    const status = message.status;
    if (vapiCallId && status) {
      const mapped = status === 'in-progress' ? 'in_progress' : status;
      db.run('UPDATE calls SET status = ? WHERE vapi_call_id = ?', [mapped, vapiCallId]);
    }
  }

  res.json({ ok: true });
});

module.exports = router;
