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
      logPendingCount();
    } catch (err) {
      console.error('[Scheduler] Error:', err.message);
    }
  });

  console.log('[Scheduler] Sequence scheduler started (every 15 min, Mon-Fri 7am-8pm)');
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
  // Only process enrollments in sequences with auto_send = 1
  const enrollments = db.all(`
    SELECT ls.*, s.steps as sequence_steps, s.name as sequence_name, s.auto_send,
           l.id as lead_id_real, l.business_name, l.first_name, l.last_name, l.email, l.phone,
           l.city, l.state, l.service_type, l.status as lead_status,
           l.has_website, l.website_live, l.rating, l.review_count,
           l.contact_count, l.estimated_value, l.website
    FROM lead_sequences ls
    JOIN sequences s ON ls.sequence_id = s.id
    JOIN leads l ON ls.lead_id = l.id
    WHERE ls.status = 'active' AND s.auto_send = 1
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
          'INSERT INTO activities (lead_id, type, title, description) VALUES (?, ?, ?, ?)',
          [enrollment.lead_id, 'email_sent', `${step.label} (Step ${step.order})`, `Auto-sent via sequence: ${enrollment.sequence_name}`]
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

function logPendingCount() {
  const result = db.get("SELECT COUNT(*) as count FROM lead_sequences WHERE status = 'active'");
  if (result && result.count > 0) {
    console.log(`[Scheduler] ${result.count} active enrollment(s)`);
  }
}

module.exports = { startSequenceScheduler };
