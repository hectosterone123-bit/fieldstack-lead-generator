const cron = require('node-cron');
const db = require('../db');
const { renderTemplate } = require('./templateService');
const emailService = require('./emailService');
const smsService = require('./smsService');
const { recomputeHeatScore } = require('./heatScoreService');

const MAX_SENDS_PER_TICK = 20;

function startSequenceScheduler() {
  // Run every 15 minutes during business hours (7am-8pm, Mon-Fri)
  cron.schedule('*/15 7-20 * * 1-5', async () => {
    try {
      autoCompleteEnrollments();
      await autoSendDueItems();
      await sendScheduledEmails();
      logPendingCount();
    } catch (err) {
      console.error('[Scheduler] Error:', err.message);
    }
  });

  // Daily digest at 7am
  cron.schedule('0 7 * * *', async () => {
    try {
      await sendDailyDigest();
    } catch (err) {
      console.error('[Scheduler] Digest error:', err.message);
    }
  });

  console.log('[Scheduler] Sequence scheduler started (every 15 min, Mon-Fri 7am-8pm + daily digest 7am)');
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
           l.contact_count, l.estimated_value, l.website
    FROM lead_sequences ls
    JOIN sequences s ON ls.sequence_id = s.id
    JOIN leads l ON ls.lead_id = l.id
    WHERE ls.status = 'active'
      AND (s.auto_send = 1 OR ls.auto_send = 1
           OR (s.auto_send_after_step > 0 AND ls.current_step > s.auto_send_after_step))
      AND (l.unsubscribed_at IS NULL)
  `);

  if (enrollments.length === 0) return;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let sent = 0;
  let failed = 0;

  for (const enrollment of enrollments) {
    if (sent >= MAX_SENDS_PER_TICK) break;

    let steps;
    try { steps = JSON.parse(enrollment.sequence_steps); } catch { continue; }

    const step = steps.find(s => s.order === enrollment.current_step);
    if (!step) continue;

    const enrolledAt = new Date(enrollment.enrolled_at);
    const dueDate = new Date(enrolledAt);
    dueDate.setDate(dueDate.getDate() + step.delay_days);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate > now) continue; // not due yet

    const template = db.get('SELECT * FROM templates WHERE id = ?', [step.template_id]);
    if (!template) continue;

    try {
      if (step.channel === 'email') {
        if (!enrollment.email) { failed++; continue; }
        if (!emailService.isConfigured()) { failed++; continue; }

        const subject = renderTemplate(template.subject, enrollment);
        const body = renderTemplate(template.body, enrollment);
        const result = await emailService.sendEmail(enrollment.email, subject, body);

        if (!result.success) {
          console.error(`[Scheduler] Email failed for enrollment ${enrollment.id}: ${result.error}`);
          failed++;
          continue;
        }

        db.run(
          'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
          [enrollment.lead_id, 'email_sent', `${step.label} (Step ${step.order})`, `Auto-sent via sequence: ${enrollment.sequence_name}`,
           JSON.stringify({ resend_message_id: result.messageId })]
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
          "UPDATE lead_sequences SET status = 'completed', completed_at = CURRENT_TIMESTAMP, current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [nextStep, enrollment.id]
        );
      } else {
        db.run(
          'UPDATE lead_sequences SET current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
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

async function sendScheduledEmails() {
  if (!emailService.isConfigured()) return;

  const due = db.all(
    `SELECT se.id, se.lead_id, t.name as template_name, t.subject as template_subject, t.body as template_body
     FROM scheduled_emails se
     JOIN leads l ON l.id = se.lead_id
     JOIN templates t ON t.id = se.template_id
     WHERE se.scheduled_at <= datetime('now') AND se.sent_at IS NULL AND se.cancelled_at IS NULL
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
      const result = await emailService.sendEmail(lead.email, subject, body);

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
    SELECT ls.id, l.business_name, l.city, l.state, s.steps as sequence_steps, ls.current_step
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
      const enrolled = new Date(e.enrolled_at || Date.now());
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

module.exports = { startSequenceScheduler };
