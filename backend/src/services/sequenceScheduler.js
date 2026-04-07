const cron = require('node-cron');
const db = require('../db');
const { renderTemplate } = require('./templateService');
const emailService = require('./emailService');
const smsService = require('./smsService');
const { recomputeHeatScore } = require('./heatScoreService');

const MAX_SENDS_PER_TICK = 20;

function getWarmupLimit(startDate) {
  const dayNum = Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000) + 1;
  if (dayNum <= 3) return 5;
  if (dayNum <= 7) return 15;
  if (dayNum <= 14) return 30;
  if (dayNum <= 21) return 50;
  return Infinity;
}

function getRemainingBudget() {
  const limitSetting = db.get("SELECT value FROM settings WHERE key = 'daily_send_limit'");
  const warmupDate = db.get("SELECT value FROM settings WHERE key = 'warmup_start_date'");

  let dailyLimit = parseInt(limitSetting?.value) || 50;

  if (warmupDate?.value) {
    const warmupLimit = getWarmupLimit(warmupDate.value);
    dailyLimit = Math.min(dailyLimit, warmupLimit);
  }

  const sent = db.get("SELECT COUNT(*) as count FROM activities WHERE type = 'email_sent' AND created_at >= date('now')");
  const remaining = Math.max(0, dailyLimit - (sent?.count || 0));
  return { remaining, dailyLimit, sentToday: sent?.count || 0 };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function startSequenceScheduler() {
  const TZ = { timezone: 'America/Chicago' };

  // Run every 15 minutes during Central business hours (8am-5pm Mon-Fri)
  cron.schedule('*/15 8-17 * * 1-5', async () => {
    try {
      autoCompleteEnrollments();
      await autoSendDueItems();
      await autoFlushOverdueItems();
      await sendScheduledEmails();
      logPendingCount();
    } catch (err) {
      console.error('[Scheduler] Error:', err.message);
    }
  }, TZ);

  // Daily digest + re-queue at 7am CT
  cron.schedule('0 7 * * *', async () => {
    try {
      await sendDailyDigest();
      autoRequeueStaleLeads();
    } catch (err) {
      console.error('[Scheduler] Digest error:', err.message);
    }
  }, TZ);

  // Campaign mode — auto-dial from queue every 5 min during business hours
  cron.schedule('*/5 8-17 * * 1-5', async () => {
    try {
      const enabled = db.get("SELECT value FROM settings WHERE key = 'vapi_campaign_enabled'")?.value;
      if (enabled !== '1') return;
      // No overlap — skip if a call is already active
      const active = db.get("SELECT COUNT(*) as c FROM calls WHERE status IN ('queued','ringing','in_progress')");
      if (active?.c > 0) return;
      // Daily cap check
      const cap = parseInt(db.get("SELECT value FROM settings WHERE key = 'vapi_campaign_calls_per_day'")?.value) || 0;
      if (cap > 0) {
        const today = db.get("SELECT COUNT(*) as c FROM calls WHERE date(created_at) = date('now')");
        if ((today?.c || 0) >= cap) return;
      }
      // Check queue has items
      const next = db.get("SELECT id FROM call_queue WHERE status = 'pending' AND (scheduled_for IS NULL OR scheduled_for <= datetime('now')) LIMIT 1");
      if (!next) return;
      // Trigger via internal HTTP call — reuses all existing queue/next logic
      const fetch = require('node-fetch');
      await fetch('http://localhost:' + (process.env.PORT || 3001) + '/api/calls/queue/next', { method: 'POST' });
      console.log('[Campaign] Auto-dialed next in queue');
    } catch (err) {
      console.error('[Campaign] Error:', err.message);
    }
  }, TZ);

  // Callback alarm — every 5 minutes, alert on imminent callbacks
  cron.schedule('*/5 * * * *', async () => {
    try {
      const alertPhone = db.get("SELECT value FROM settings WHERE key = 'alert_phone'")?.value;
      if (!alertPhone || !smsService.isConfigured()) return;

      const now = new Date();
      const windowEnd = new Date(now.getTime() + 15 * 60 * 1000);
      const upcoming = db.all(
        `SELECT id, business_name, phone, next_followup_at FROM leads
         WHERE next_followup_at BETWEEN ? AND ?
         AND callback_alerted_at IS NULL
         AND next_followup_at IS NOT NULL`,
        [now.toISOString(), windowEnd.toISOString()]
      );

      for (const lead of upcoming) {
        const timeStr = new Date(lead.next_followup_at).toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true,
        });
        const msg = `Callback due at ${timeStr}: ${lead.business_name} — ${lead.phone || 'no phone'}`;
        await smsService.sendSms(alertPhone, msg);
        db.run('UPDATE leads SET callback_alerted_at = CURRENT_TIMESTAMP WHERE id = ?', [lead.id]);
      }
    } catch (err) {
      console.error('[Scheduler] Callback alarm error:', err.message);
    }
  });

  console.log('[Scheduler] Sequence scheduler started (every 15 min, Mon-Fri 8am-5pm CT + daily digest 7am + callback alarm every 5 min)');
}

function autoCompleteEnrollments() {
  const active = db.all(`
    SELECT ls.id, ls.current_step, s.steps as sequence_steps
    FROM lead_sequences ls
    JOIN sequences s ON ls.sequence_id = s.id
    WHERE ls.status = 'active'
  `);

  let completed = 0;
  for (const enrollment of active) {
    let steps;
    try { steps = JSON.parse(enrollment.sequence_steps); } catch { continue; }

    if (enrollment.current_step > steps.length) {
      db.run(
        "UPDATE lead_sequences SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [enrollment.id]
      );
      completed++;
    }
  }

  if (completed > 0) {
    console.log(`[Scheduler] Auto-completed ${completed} enrollment(s)`);
  }
}

async function autoSendDueItems() {
  // Process enrollments where auto_send is on OR current step is past the manual cutoff
  const enrollments = db.all(`
    SELECT ls.*, s.steps as sequence_steps, s.name as sequence_name, s.auto_send,
           s.auto_send_after_step,
           l.id as lead_id_real, l.business_name, l.first_name, l.last_name, l.email, l.phone,
           l.city, l.state, l.service_type, l.status as lead_status,
           l.has_website, l.website_live, l.rating, l.review_count,
           l.contact_count, l.estimated_value, l.website, l.loom_url
    FROM lead_sequences ls
    JOIN sequences s ON ls.sequence_id = s.id
    JOIN leads l ON ls.lead_id = l.id
    WHERE ls.status = 'active'
      AND (s.auto_send = 1 OR ls.auto_send = 1
           OR (s.auto_send_after_step > 0 AND ls.current_step > s.auto_send_after_step))
      AND (l.unsubscribed_at IS NULL)
      AND (l.email_invalid_at IS NULL)
  `);

  if (enrollments.length === 0) return;

  let { remaining } = getRemainingBudget();
  if (remaining <= 0) { console.log('[scheduler] daily send limit reached, skipping auto-send'); return; }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let sent = 0;
  let failed = 0;
  const tickLimit = Math.min(MAX_SENDS_PER_TICK, remaining);

  for (const enrollment of enrollments) {
    if (sent >= tickLimit) break;

    let steps;
    try { steps = JSON.parse(enrollment.sequence_steps); } catch { continue; }

    const step = steps.find(s => s.order === enrollment.current_step);
    if (!step) continue;

    const baseDate = enrollment.last_sent_at ? new Date(enrollment.last_sent_at) : new Date(enrollment.enrolled_at);
    const dueDate = new Date(baseDate);
    dueDate.setDate(dueDate.getDate() + step.delay_days);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate > now) continue; // not due yet

    const template = db.get('SELECT * FROM templates WHERE id = ?', [step.template_id]);
    if (!template) continue;

    try {
      if (step.channel === 'email') {
        if (!enrollment.email) { failed++; continue; }
        if (!emailService.isConfigured()) { failed++; continue; }

        // Jitter: random 30-90s delay between sends to avoid bulk-send fingerprint
        await sleep(30000 + Math.floor(Math.random() * 60000));

        const subject = renderTemplate(template.subject, enrollment);
        const body = renderTemplate(template.body, enrollment);
        const result = await emailService.sendEmail(enrollment.email, subject, body, { leadId: enrollment.lead_id, fromEmail: step.from_email || null, plainText: !!step.plain_text });

        if (!result.success) {
          console.error(`[Scheduler] Email failed for enrollment ${enrollment.id}: ${result.error}`);
          failed++;
          continue;
        }

        db.run(
          'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
          [enrollment.lead_id, 'email_sent', `${step.label} (Step ${step.order})`, `Auto-sent via sequence: ${enrollment.sequence_name}`,
           JSON.stringify({ resend_message_id: result.messageId, sequence_id: enrollment.sequence_id, step_order: step.order })]
        );
      } else if (step.channel === 'sms') {
        if (!enrollment.phone) { failed++; continue; }
        if (!smsService.isConfigured()) { failed++; continue; }

        const body = renderTemplate(template.body, enrollment);
        const result = await smsService.sendSms(enrollment.phone, body);

        if (!result.success) {
          console.error(`[Scheduler] SMS failed for enrollment ${enrollment.id}: ${result.error}`);
          failed++;
          continue;
        }

        db.run(
          `INSERT INTO sms_messages (lead_id, direction, from_number, to_number, body, twilio_sid, status)
           VALUES (?, 'outbound', ?, ?, ?, ?, ?)`,
          [enrollment.lead_id, process.env.TWILIO_PHONE_NUMBER, smsService.normalizePhone(enrollment.phone), body, result.sid, result.status]
        );
        db.run(
          'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
          [enrollment.lead_id, 'sms_sent', `${step.label} (Step ${step.order})`, `Auto-sent via sequence: ${enrollment.sequence_name}`, JSON.stringify({ twilio_sid: result.sid })]
        );
      } else {
        // call_script / loom_script can't be auto-sent, skip
        continue;
      }

      // Update lead contact tracking
      db.run(
        'UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, first_contacted_at = CASE WHEN first_contacted_at IS NULL THEN CURRENT_TIMESTAMP ELSE first_contacted_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [enrollment.lead_id]
      );

      // Recompute heat score
      const lead = db.get('SELECT * FROM leads WHERE id = ?', [enrollment.lead_id]);
      if (lead) {
        const newScore = recomputeHeatScore(lead);
        if (newScore !== lead.heat_score) {
          db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newScore, enrollment.lead_id]);
        }
      }

      // Advance enrollment
      const nextStep = enrollment.current_step + 1;
      if (nextStep > steps.length) {
        db.run(
          "UPDATE lead_sequences SET status = 'completed', completed_at = CURRENT_TIMESTAMP, current_step = ?, last_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [nextStep, enrollment.id]
        );
      } else {
        db.run(
          'UPDATE lead_sequences SET current_step = ?, last_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [nextStep, enrollment.id]
        );
      }

      sent++;
    } catch (err) {
      console.error(`[Scheduler] Error processing enrollment ${enrollment.id}:`, err.message);
      failed++;
    }
  }

  if (sent > 0 || failed > 0) {
    console.log(`[Scheduler] Auto-send: ${sent} sent, ${failed} failed`);
  }
}

async function autoFlushOverdueItems() {
  // Auto-send overdue items from sequences with auto_flush_overdue=1
  // These are items that would normally sit in the manual queue
  const enrollments = db.all(`
    SELECT ls.*, s.steps as sequence_steps, s.name as sequence_name,
           s.auto_send, s.auto_send_after_step,
           l.id as lead_id_real, l.business_name, l.first_name, l.last_name, l.email, l.phone,
           l.city, l.state, l.service_type, l.status as lead_status,
           l.has_website, l.website_live, l.rating, l.review_count,
           l.contact_count, l.estimated_value, l.website, l.loom_url
    FROM lead_sequences ls
    JOIN sequences s ON ls.sequence_id = s.id
    JOIN leads l ON ls.lead_id = l.id
    WHERE ls.status = 'active'
      AND s.auto_flush_overdue = 1
      AND (s.auto_send IS NULL OR s.auto_send = 0)
      AND (ls.auto_send IS NULL OR ls.auto_send = 0)
      AND (s.auto_send_after_step IS NULL OR s.auto_send_after_step = 0
           OR ls.current_step <= s.auto_send_after_step)
      AND (l.unsubscribed_at IS NULL)
      AND (l.email_invalid_at IS NULL)
  `);

  if (enrollments.length === 0) return;

  let { remaining } = getRemainingBudget();
  if (remaining <= 0) { console.log('[scheduler] daily send limit reached, skipping auto-flush'); return; }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let sent = 0;
  let failed = 0;
  const tickLimit = Math.min(MAX_SENDS_PER_TICK, remaining);

  for (const enrollment of enrollments) {
    if (sent >= tickLimit) break;

    let steps;
    try { steps = JSON.parse(enrollment.sequence_steps); } catch { continue; }

    const step = steps.find(s => s.order === enrollment.current_step);
    if (!step) continue;

    // Only auto-flush email and sms channels — loom/call stay manual
    if (step.channel !== 'email' && step.channel !== 'sms') continue;

    const baseDate = enrollment.last_sent_at ? new Date(enrollment.last_sent_at) : new Date(enrollment.enrolled_at);
    const dueDate = new Date(baseDate);
    dueDate.setDate(dueDate.getDate() + step.delay_days);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate > now) continue; // not overdue yet

    const template = db.get('SELECT * FROM templates WHERE id = ?', [step.template_id]);
    if (!template) continue;

    try {
      if (step.channel === 'email') {
        if (!enrollment.email) { failed++; continue; }
        if (!emailService.isConfigured()) { failed++; continue; }

        // Jitter: random 30-90s delay between sends to avoid bulk-send fingerprint
        await sleep(30000 + Math.floor(Math.random() * 60000));

        const subject = renderTemplate(template.subject, enrollment);
        const body = renderTemplate(template.body, enrollment);
        const result = await emailService.sendEmail(enrollment.email, subject, body, { leadId: enrollment.lead_id, fromEmail: step.from_email || null, plainText: !!step.plain_text });

        if (!result.success) {
          console.error(`[Scheduler] Flush email failed for enrollment ${enrollment.id}: ${result.error}`);
          failed++;
          continue;
        }

        db.run(
          'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
          [enrollment.lead_id, 'email_sent', `${step.label} (Step ${step.order})`, `Auto-flushed via sequence: ${enrollment.sequence_name}`,
           JSON.stringify({ resend_message_id: result.messageId, sequence_id: enrollment.sequence_id, step_order: step.order })]
        );
      } else if (step.channel === 'sms') {
        if (!enrollment.phone) { failed++; continue; }
        if (!smsService.isConfigured()) { failed++; continue; }

        const body = renderTemplate(template.body, enrollment);
        const result = await smsService.sendSms(enrollment.phone, body);

        if (!result.success) {
          console.error(`[Scheduler] Flush SMS failed for enrollment ${enrollment.id}: ${result.error}`);
          failed++;
          continue;
        }

        db.run(
          `INSERT INTO sms_messages (lead_id, direction, from_number, to_number, body, twilio_sid, status)
           VALUES (?, 'outbound', ?, ?, ?, ?, ?)`,
          [enrollment.lead_id, process.env.TWILIO_PHONE_NUMBER, smsService.normalizePhone(enrollment.phone), body, result.sid, result.status]
        );
        db.run(
          'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
          [enrollment.lead_id, 'sms_sent', `${step.label} (Step ${step.order})`, `Auto-flushed via sequence: ${enrollment.sequence_name}`, JSON.stringify({ twilio_sid: result.sid })]
        );
      }

      // Update lead contact tracking
      db.run(
        'UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, first_contacted_at = CASE WHEN first_contacted_at IS NULL THEN CURRENT_TIMESTAMP ELSE first_contacted_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [enrollment.lead_id]
      );

      // Recompute heat score
      const lead = db.get('SELECT * FROM leads WHERE id = ?', [enrollment.lead_id]);
      if (lead) {
        const newScore = recomputeHeatScore(lead);
        if (newScore !== lead.heat_score) {
          db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newScore, enrollment.lead_id]);
        }
      }

      // Advance enrollment
      const nextStep = enrollment.current_step + 1;
      if (nextStep > steps.length) {
        db.run(
          "UPDATE lead_sequences SET status = 'completed', completed_at = CURRENT_TIMESTAMP, current_step = ?, last_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [nextStep, enrollment.id]
        );
      } else {
        db.run(
          'UPDATE lead_sequences SET current_step = ?, last_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [nextStep, enrollment.id]
        );
      }

      sent++;
    } catch (err) {
      console.error(`[Scheduler] Flush error for enrollment ${enrollment.id}:`, err.message);
      failed++;
    }
  }

  if (sent > 0 || failed > 0) {
    console.log(`[Scheduler] Auto-flush overdue: ${sent} sent, ${failed} failed`);
  }
}

async function sendScheduledEmails() {
  if (!emailService.isConfigured()) return;

  const due = db.all(
    `SELECT se.id, se.lead_id, t.name as template_name, t.subject as template_subject, t.body as template_body
     FROM scheduled_emails se
     JOIN leads l ON l.id = se.lead_id
     JOIN templates t ON t.id = se.template_id
     WHERE se.scheduled_at <= datetime('now') AND se.sent_at IS NULL AND se.cancelled_at IS NULL
       AND (l.unsubscribed_at IS NULL OR l.unsubscribed_at = '')
     LIMIT 20`
  );

  if (due.length === 0) return;

  let sent = 0;
  for (const row of due) {
    try {
      const lead = db.get('SELECT * FROM leads WHERE id = ?', [row.lead_id]);
      if (!lead?.email) continue;

      const subject = renderTemplate(row.template_subject || row.template_name, lead);
      const body = renderTemplate(row.template_body, lead);
      const result = await emailService.sendEmail(lead.email, subject, body, { leadId: lead.id });

      if (result.success) {
        db.run(`UPDATE scheduled_emails SET sent_at = CURRENT_TIMESTAMP WHERE id = ?`, [row.id]);
        db.run(
          `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'email_sent', ?, ?)`,
          [row.lead_id, `Follow-up sent: ${subject}`, `Template: ${row.template_name} (auto-scheduled)`]
        );
        db.run(
          'UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [row.lead_id]
        );
        const updatedLead = db.get('SELECT * FROM leads WHERE id = ?', [row.lead_id]);
        if (updatedLead) {
          const newScore = recomputeHeatScore(updatedLead);
          if (newScore !== updatedLead.heat_score) {
            db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newScore, row.lead_id]);
          }
        }
        sent++;
      }
    } catch (e) {
      console.error('[Scheduler] Scheduled email error:', e.message);
    }
  }

  if (sent > 0) console.log(`[Scheduler] Auto-sent ${sent} scheduled follow-up(s)`);
}

async function sendDailyDigest() {
  const digestEmail = db.get("SELECT value FROM settings WHERE key = 'digest_email'");
  if (!digestEmail?.value || !emailService.isConfigured()) return;

  // Loom videos due today (step 2 = manual Loom step)
  const loomDue = db.all(`
    SELECT ls.id, ls.enrolled_at, ls.last_sent_at, l.business_name, l.city, l.state, s.steps as sequence_steps, ls.current_step
    FROM lead_sequences ls
    JOIN sequences s ON ls.sequence_id = s.id
    JOIN leads l ON ls.lead_id = l.id
    WHERE ls.status = 'active'
      AND s.auto_send_after_step > 0
      AND ls.current_step <= s.auto_send_after_step
  `).filter(e => {
    try {
      const steps = JSON.parse(e.sequence_steps);
      const step = steps.find(s => s.order === e.current_step);
      if (!step) return false;
      const enrolled = new Date(e.last_sent_at || e.enrolled_at || Date.now());
      const due = new Date(enrolled);
      due.setDate(due.getDate() + step.delay_days);
      due.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return due <= today;
    } catch { return false; }
  });

  // Emails sent overnight (last 24h)
  const sentOvernight = db.get(`
    SELECT COUNT(*) as count FROM activities
    WHERE type = 'email_sent'
      AND description LIKE '%Auto-sent via sequence%'
      AND created_at >= datetime('now', '-1 day')
  `);

  // Active enrollments
  const activeCount = db.get("SELECT COUNT(*) as count FROM lead_sequences WHERE status = 'active'");

  // New leads (last 24h)
  const newLeads = db.get("SELECT COUNT(*) as count FROM leads WHERE created_at >= datetime('now', '-1 day')");

  const loomCount = loomDue.length;
  const sentCount = sentOvernight?.count || 0;
  const loomList = loomDue.map(e => `  - ${e.business_name} (${e.city}, ${e.state})`).join('\n');

  const subject = `FieldStack Daily: ${loomCount} Loom${loomCount !== 1 ? 's' : ''} due, ${sentCount} sent overnight`;
  const body = `
<div style="font-family: system-ui, sans-serif; max-width: 500px; color: #e4e4e7;">
  <h2 style="color: #f97316; margin-bottom: 16px;">FieldStack Daily Digest</h2>

  <div style="background: #18181b; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
    <h3 style="color: #f97316; margin: 0 0 8px 0;">Loom Videos Due: ${loomCount}</h3>
    ${loomCount > 0 ? `<pre style="color: #a1a1aa; margin: 0; white-space: pre-wrap;">${loomList}</pre>` : '<p style="color: #71717a; margin: 0;">None today — all caught up!</p>'}
  </div>

  <div style="background: #18181b; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
    <p style="margin: 4px 0; color: #a1a1aa;">Emails sent overnight: <strong style="color: #e4e4e7;">${sentCount}</strong></p>
    <p style="margin: 4px 0; color: #a1a1aa;">Active sequences: <strong style="color: #e4e4e7;">${activeCount?.count || 0}</strong></p>
    <p style="margin: 4px 0; color: #a1a1aa;">New leads (24h): <strong style="color: #e4e4e7;">${newLeads?.count || 0}</strong></p>
  </div>

  <p style="color: #71717a; font-size: 12px;">— FieldStack Autopilot</p>
</div>`.trim();

  const result = await emailService.sendEmail(digestEmail.value, subject, body);
  if (result.success) {
    console.log(`[Scheduler] Daily digest sent to ${digestEmail.value}`);
  } else {
    console.error(`[Scheduler] Digest failed: ${result.error}`);
  }
}

function logPendingCount() {
  const result = db.get("SELECT COUNT(*) as count FROM lead_sequences WHERE status = 'active'");
  if (result && result.count > 0) {
    console.log(`[Scheduler] ${result.count} active enrollment(s)`);
  }
}

// On-demand flush: sends all overdue email/SMS items from manual queues right now
async function flushOverdueNow() {
  const enrollments = db.all(`
    SELECT ls.*, s.steps as sequence_steps, s.name as sequence_name,
           l.id as lead_id_real, l.business_name, l.first_name, l.last_name, l.email, l.phone,
           l.city, l.state, l.service_type, l.status as lead_status,
           l.has_website, l.website_live, l.rating, l.review_count,
           l.contact_count, l.estimated_value, l.website, l.loom_url
    FROM lead_sequences ls
    JOIN sequences s ON ls.sequence_id = s.id
    JOIN leads l ON ls.lead_id = l.id
    WHERE ls.status = 'active'
      AND (s.auto_send IS NULL OR s.auto_send = 0)
      AND (ls.auto_send IS NULL OR ls.auto_send = 0)
      AND (l.unsubscribed_at IS NULL)
      AND (l.email_invalid_at IS NULL)
  `);

  if (enrollments.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  let { remaining } = getRemainingBudget();
  if (remaining <= 0) return { sent: 0, failed: 0, skipped: 0, limitReached: true };

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const tickLimit = Math.min(MAX_SENDS_PER_TICK, remaining);

  for (const enrollment of enrollments) {
    if (sent >= tickLimit) break;

    let steps;
    try { steps = JSON.parse(enrollment.sequence_steps); } catch { continue; }

    const step = steps.find(s => s.order === enrollment.current_step);
    if (!step) continue;

    if (step.channel !== 'email' && step.channel !== 'sms') { skipped++; continue; }

    const baseDate = enrollment.last_sent_at ? new Date(enrollment.last_sent_at) : new Date(enrollment.enrolled_at);
    const dueDate = new Date(baseDate);
    dueDate.setDate(dueDate.getDate() + step.delay_days);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate > now) { skipped++; continue; }

    const template = db.get('SELECT * FROM templates WHERE id = ?', [step.template_id]);
    if (!template) { skipped++; continue; }

    try {
      if (step.channel === 'email') {
        if (!enrollment.email || !emailService.isConfigured()) { failed++; continue; }
        const subject = renderTemplate(template.subject, enrollment);
        const body = renderTemplate(template.body, enrollment);
        const result = await emailService.sendEmail(enrollment.email, subject, body, { leadId: enrollment.lead_id, fromEmail: step.from_email || null, plainText: !!step.plain_text });
        if (!result.success) { failed++; continue; }
        db.run(
          'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
          [enrollment.lead_id, 'email_sent', `${step.label} (Step ${step.order})`, `On-demand flush: ${enrollment.sequence_name}`,
           JSON.stringify({ resend_message_id: result.messageId, sequence_id: enrollment.sequence_id, step_order: step.order })]
        );
      } else if (step.channel === 'sms') {
        if (!enrollment.phone || !smsService.isConfigured()) { failed++; continue; }
        const body = renderTemplate(template.body, enrollment);
        const result = await smsService.sendSms(enrollment.phone, body);
        if (!result.success) { failed++; continue; }
        db.run(
          `INSERT INTO sms_messages (lead_id, direction, from_number, to_number, body, twilio_sid, status)
           VALUES (?, 'outbound', ?, ?, ?, ?, ?)`,
          [enrollment.lead_id, process.env.TWILIO_PHONE_NUMBER, smsService.normalizePhone(enrollment.phone), body, result.sid, result.status]
        );
        db.run(
          'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
          [enrollment.lead_id, 'sms_sent', `${step.label} (Step ${step.order})`, `On-demand flush: ${enrollment.sequence_name}`, JSON.stringify({ twilio_sid: result.sid })]
        );
      }

      db.run(
        'UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, first_contacted_at = CASE WHEN first_contacted_at IS NULL THEN CURRENT_TIMESTAMP ELSE first_contacted_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [enrollment.lead_id]
      );

      const lead = db.get('SELECT * FROM leads WHERE id = ?', [enrollment.lead_id]);
      if (lead) {
        const newScore = recomputeHeatScore(lead);
        if (newScore !== lead.heat_score) {
          db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newScore, enrollment.lead_id]);
        }
      }

      const nextStep = enrollment.current_step + 1;
      if (nextStep > steps.length) {
        db.run("UPDATE lead_sequences SET status = 'completed', completed_at = CURRENT_TIMESTAMP, current_step = ?, last_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [nextStep, enrollment.id]);
      } else {
        db.run('UPDATE lead_sequences SET current_step = ?, last_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nextStep, enrollment.id]);
      }

      sent++;
    } catch (err) {
      console.error(`[FlushNow] Error for enrollment ${enrollment.id}:`, err.message);
      failed++;
    }
  }

  console.log(`[FlushNow] ${sent} sent, ${failed} failed, ${skipped} skipped`);
  return { sent, failed, skipped };
}

function autoRequeueStaleLeads() {
  try {
    const enabled = db.get("SELECT value FROM settings WHERE key = 'requeue_enabled'");
    if (enabled?.value !== '1') return;

    const delayDays = parseInt(db.get("SELECT value FROM settings WHERE key = 'requeue_delay_days'")?.value) || 30;
    const seqId = parseInt(db.get("SELECT value FROM settings WHERE key = 'requeue_sequence_id'")?.value);
    const maxTimes = parseInt(db.get("SELECT value FROM settings WHERE key = 'requeue_max_times'")?.value) || 2;

    if (!seqId) {
      console.log('[ReQueue] No re-queue sequence configured, skipping');
      return;
    }

    // Check sequence exists and is active
    const seq = db.get('SELECT id, steps FROM sequences WHERE id = ? AND is_active = 1', [seqId]);
    if (!seq) {
      console.log('[ReQueue] Configured sequence not found or inactive');
      return;
    }

    // Find eligible leads: completed sequence or ghost, no active enrollment, not maxed out
    const eligible = db.all(`
      SELECT DISTINCT l.id, l.business_name FROM leads l
      LEFT JOIN lead_sequences ls_active ON ls_active.lead_id = l.id AND ls_active.status IN ('active', 'paused')
      WHERE ls_active.id IS NULL
        AND (l.unsubscribed_at IS NULL OR l.unsubscribed_at = '')
        AND l.status NOT IN ('lost', 'closed_won', 'booked')
        AND COALESCE(l.requeue_count, 0) < ?
        AND (
          EXISTS (
            SELECT 1 FROM lead_sequences ls2
            WHERE ls2.lead_id = l.id AND ls2.status = 'completed'
            AND ls2.completed_at < datetime('now', '-' || ? || ' days')
          )
          OR (
            l.status IN ('contacted', 'qualified')
            AND l.last_contacted_at IS NOT NULL
            AND l.last_contacted_at < datetime('now', '-' || ? || ' days')
          )
        )
    `, [maxTimes, delayDays, delayDays]);

    if (eligible.length === 0) {
      console.log('[ReQueue] No leads eligible for re-queue');
      return;
    }

    let enrolled = 0;
    for (const lead of eligible) {
      try {
        db.run(
          `INSERT INTO lead_sequences (lead_id, sequence_id, current_step, status) VALUES (?, ?, 1, 'active')`,
          [lead.id, seqId]
        );
        db.run(
          `UPDATE leads SET requeue_count = COALESCE(requeue_count, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [lead.id]
        );
        db.run(
          `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'note', 'Auto re-queued', ?)`,
          [lead.id, `Re-enrolled into sequence after ${delayDays} days of inactivity`]
        );
        enrolled++;
      } catch (e) {
        console.error(`[ReQueue] Failed to re-queue lead ${lead.id}:`, e.message);
      }
    }

    console.log(`[ReQueue] Re-queued ${enrolled} of ${eligible.length} eligible leads into sequence #${seqId}`);
  } catch (err) {
    console.error('[ReQueue] Error:', err.message);
  }
}

module.exports = { startSequenceScheduler, flushOverdueNow, getRemainingBudget };
