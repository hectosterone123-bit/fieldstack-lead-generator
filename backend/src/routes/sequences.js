const express = require('express');
const router = express.Router();
const db = require('../db');
const { renderTemplate } = require('../services/templateService');
const { recomputeHeatScore } = require('../services/heatScoreService');
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSteps(sequence) {
  try {
    return JSON.parse(sequence.steps);
  } catch {
    return [];
  }
}

function getEnrollmentCounts() {
  const rows = db.all(
    "SELECT sequence_id, COUNT(*) as count FROM lead_sequences WHERE status = 'active' GROUP BY sequence_id"
  );
  const map = {};
  rows.forEach(r => { map[r.sequence_id] = r.count; });
  return map;
}

function getSequenceSentCounts() {
  const rows = db.all(`
    SELECT ls.sequence_id, COUNT(DISTINCT a.id) as count
    FROM lead_sequences ls
    JOIN activities a ON a.lead_id = ls.lead_id AND a.type = 'email_sent'
    GROUP BY ls.sequence_id
  `);
  const map = {};
  rows.forEach(r => { map[r.sequence_id] = r.count; });
  return map;
}

function getSequenceOpenedCounts() {
  const rows = db.all(`
    SELECT ls.sequence_id, COUNT(DISTINCT a.id) as count
    FROM lead_sequences ls
    JOIN activities a ON a.lead_id = ls.lead_id AND a.type = 'email_opened'
    GROUP BY ls.sequence_id
  `);
  const map = {};
  rows.forEach(r => { map[r.sequence_id] = r.count; });
  return map;
}

// ─── Outreach Queue (registered before /:id) ────────────────────────────────

router.get('/queue', (req, res) => {
  const enrollments = db.all(`
    SELECT ls.*, s.steps as sequence_steps, s.name as sequence_name,
           s.auto_send_after_step,
           l.business_name, l.first_name, l.last_name, l.email, l.phone,
           l.city, l.state, l.service_type, l.status as lead_status,
           l.has_website, l.website_live, l.rating, l.review_count,
           l.contact_count, l.estimated_value, l.website, l.email_opened_at
    FROM lead_sequences ls
    JOIN sequences s ON ls.sequence_id = s.id
    JOIN leads l ON ls.lead_id = l.id
    WHERE ls.status = 'active'
      AND (ls.auto_send IS NULL OR ls.auto_send = 0)
      AND (s.auto_send IS NULL OR s.auto_send = 0)
      AND (s.auto_send_after_step IS NULL OR s.auto_send_after_step = 0
           OR ls.current_step <= s.auto_send_after_step)
  `);

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const queue = [];

  for (const enrollment of enrollments) {
    const steps = parseSteps({ steps: enrollment.sequence_steps });
    const step = steps.find(s => s.order === enrollment.current_step);
    if (!step) continue;

    const enrolledAt = new Date(enrollment.enrolled_at);
    const dueDate = new Date(enrolledAt);
    dueDate.setDate(dueDate.getDate() + step.delay_days);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate <= now) {
      // Render the template
      const template = db.get('SELECT * FROM templates WHERE id = ?', [step.template_id]);
      let renderedSubject = '';
      let renderedBody = '';

      if (template) {
        renderedSubject = renderTemplate(template.subject, enrollment);
        renderedBody = renderTemplate(template.body, enrollment);
      }

      queue.push({
        enrollment_id: enrollment.id,
        lead_id: enrollment.lead_id,
        sequence_id: enrollment.sequence_id,
        sequence_name: enrollment.sequence_name,
        business_name: enrollment.business_name,
        first_name: enrollment.first_name,
        lead_email: enrollment.email,
        lead_phone: enrollment.phone,
        current_step: enrollment.current_step,
        total_steps: steps.length,
        step_label: step.label,
        channel: step.channel,
        template_id: step.template_id,
        template_name: template?.name || 'Unknown template',
        rendered_subject: renderedSubject,
        rendered_body: renderedBody,
        due_date: dueDate.toISOString(),
        is_overdue: dueDate < now,
        enrolled_at: enrollment.enrolled_at,
        email_opened_at: enrollment.email_opened_at || null,
      });
    }
  }

  // Sort: overdue first, then by due date ascending
  queue.sort((a, b) => {
    if (a.is_overdue && !b.is_overdue) return -1;
    if (!a.is_overdue && b.is_overdue) return 1;
    return new Date(a.due_date) - new Date(b.due_date);
  });

  res.json({ success: true, data: queue });
});

router.get('/queue/stats', (req, res) => {
  const enrollments = db.all(`
    SELECT ls.current_step, ls.enrolled_at, s.steps as sequence_steps
    FROM lead_sequences ls
    JOIN sequences s ON ls.sequence_id = s.id
    WHERE ls.status = 'active'
  `);

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  let overdue = 0;
  let due_today = 0;
  let upcoming = 0;

  for (const enrollment of enrollments) {
    const steps = parseSteps({ steps: enrollment.sequence_steps });
    const step = steps.find(s => s.order === enrollment.current_step);
    if (!step) continue;

    const enrolledAt = new Date(enrollment.enrolled_at);
    const dueDate = new Date(enrolledAt);
    dueDate.setDate(dueDate.getDate() + step.delay_days);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate < now) overdue++;
    else if (dueDate < tomorrow) due_today++;
    else upcoming++;
  }

  res.json({ success: true, data: { overdue, due_today, upcoming } });
});

router.post('/queue/:enrollmentId/mark-sent', (req, res) => {
  const { enrollmentId } = req.params;
  const enrollment = db.get('SELECT * FROM lead_sequences WHERE id = ?', [enrollmentId]);
  if (!enrollment) return res.status(404).json({ success: false, error: 'Enrollment not found' });

  const sequence = db.get('SELECT * FROM sequences WHERE id = ?', [enrollment.sequence_id]);
  if (!sequence) return res.status(404).json({ success: false, error: 'Sequence not found' });

  const steps = parseSteps(sequence);
  const step = steps.find(s => s.order === enrollment.current_step);
  if (!step) return res.status(400).json({ success: false, error: 'Current step not found' });

  // Determine activity type based on channel
  const activityType = step.channel === 'sms' ? 'sms_sent'
    : step.channel === 'call_script' ? 'call_attempt'
    : step.channel === 'loom_script' ? 'email_sent'
    : 'email_sent';

  // Log activity
  db.run(
    'INSERT INTO activities (lead_id, type, title, description) VALUES (?, ?, ?, ?)',
    [enrollment.lead_id, activityType, `${step.label} (Step ${step.order})`, `Sent via sequence: ${sequence.name}`]
  );

  // Update lead contact tracking
  db.run(
    'UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
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

  // Advance to next step or complete
  const nextStep = enrollment.current_step + 1;
  if (nextStep > steps.length) {
    db.run(
      "UPDATE lead_sequences SET status = 'completed', completed_at = CURRENT_TIMESTAMP, current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [nextStep, enrollmentId]
    );
  } else {
    db.run(
      'UPDATE lead_sequences SET current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nextStep, enrollmentId]
    );
  }

  res.json({ success: true, data: { advanced_to: nextStep > steps.length ? 'completed' : nextStep } });
});

router.post('/queue/:enrollmentId/dismiss', (req, res) => {
  const { enrollmentId } = req.params;
  const enrollment = db.get('SELECT * FROM lead_sequences WHERE id = ?', [enrollmentId]);
  if (!enrollment) return res.status(404).json({ success: false, error: 'Enrollment not found' });

  const sequence = db.get('SELECT * FROM sequences WHERE id = ?', [enrollment.sequence_id]);
  const steps = sequence ? parseSteps(sequence) : [];

  const nextStep = enrollment.current_step + 1;
  if (nextStep > steps.length) {
    db.run(
      "UPDATE lead_sequences SET status = 'completed', completed_at = CURRENT_TIMESTAMP, current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [nextStep, enrollmentId]
    );
  } else {
    db.run(
      'UPDATE lead_sequences SET current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nextStep, enrollmentId]
    );
  }

  res.json({ success: true, data: { skipped_to: nextStep > steps.length ? 'completed' : nextStep } });
});

// ─── Channel Status ───────────────────────────────────────────────────────────

router.get('/email-status', (req, res) => {
  res.json({ success: true, data: { configured: emailService.isConfigured() } });
});

router.get('/sms-status', (req, res) => {
  res.json({ success: true, data: { configured: smsService.isConfigured() } });
});

router.post('/queue/:enrollmentId/send', async (req, res) => {
  const { enrollmentId } = req.params;
  const enrollment = db.get('SELECT * FROM lead_sequences WHERE id = ?', [enrollmentId]);
  if (!enrollment) return res.status(404).json({ success: false, error: 'Enrollment not found' });

  const sequence = db.get('SELECT * FROM sequences WHERE id = ?', [enrollment.sequence_id]);
  if (!sequence) return res.status(404).json({ success: false, error: 'Sequence not found' });

  const steps = parseSteps(sequence);
  const step = steps.find(s => s.order === enrollment.current_step);
  if (!step) return res.status(400).json({ success: false, error: 'Current step not found' });

  if (step.channel !== 'email') {
    return res.status(400).json({ success: false, error: 'Send is only available for email steps' });
  }

  const lead = db.get('SELECT * FROM leads WHERE id = ?', [enrollment.lead_id]);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  if (lead.unsubscribed_at) return res.status(400).json({ success: false, error: 'Lead has unsubscribed' });
  if (!lead.email) return res.status(400).json({ success: false, error: 'Lead has no email address' });

  const template = db.get('SELECT * FROM templates WHERE id = ?', [step.template_id]);
  if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

  const subject = renderTemplate(template.subject, lead);
  const body = renderTemplate(template.body, lead);

  const result = await emailService.sendEmail(lead.email, subject, body);
  if (!result.success) {
    return res.status(500).json({ success: false, error: result.error });
  }

  // Log activity
  db.run(
    'INSERT INTO activities (lead_id, type, title, description) VALUES (?, ?, ?, ?)',
    [enrollment.lead_id, 'email_sent', `${step.label} (Step ${step.order})`, `Sent via sequence: ${sequence.name}`]
  );

  // Update lead contact tracking
  db.run(
    'UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [enrollment.lead_id]
  );

  // Recompute heat score
  const updatedLead = db.get('SELECT * FROM leads WHERE id = ?', [enrollment.lead_id]);
  if (updatedLead) {
    const newScore = recomputeHeatScore(updatedLead);
    if (newScore !== updatedLead.heat_score) {
      db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newScore, enrollment.lead_id]);
    }
  }

  // Advance to next step or complete
  const nextStep = enrollment.current_step + 1;
  if (nextStep > steps.length) {
    db.run(
      "UPDATE lead_sequences SET status = 'completed', completed_at = CURRENT_TIMESTAMP, current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [nextStep, enrollmentId]
    );
  } else {
    db.run(
      'UPDATE lead_sequences SET current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nextStep, enrollmentId]
    );
  }

  res.json({ success: true, data: { message_id: result.messageId, advanced_to: nextStep > steps.length ? 'completed' : nextStep } });
});

router.post('/queue/:enrollmentId/send-sms', async (req, res) => {
  const { enrollmentId } = req.params;
  const enrollment = db.get('SELECT * FROM lead_sequences WHERE id = ?', [enrollmentId]);
  if (!enrollment) return res.status(404).json({ success: false, error: 'Enrollment not found' });

  const sequence = db.get('SELECT * FROM sequences WHERE id = ?', [enrollment.sequence_id]);
  if (!sequence) return res.status(404).json({ success: false, error: 'Sequence not found' });

  const steps = parseSteps(sequence);
  const step = steps.find(s => s.order === enrollment.current_step);
  if (!step) return res.status(400).json({ success: false, error: 'Current step not found' });

  if (step.channel !== 'sms') {
    return res.status(400).json({ success: false, error: 'Send SMS is only available for SMS steps' });
  }

  const lead = db.get('SELECT * FROM leads WHERE id = ?', [enrollment.lead_id]);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  if (lead.unsubscribed_at) return res.status(400).json({ success: false, error: 'Lead has unsubscribed' });
  if (!lead.phone) return res.status(400).json({ success: false, error: 'Lead has no phone number' });

  const template = db.get('SELECT * FROM templates WHERE id = ?', [step.template_id]);
  if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

  const body = renderTemplate(template.body, lead);

  const result = await smsService.sendSms(lead.phone, body);
  if (!result.success) {
    return res.status(500).json({ success: false, error: result.error });
  }

  // Log SMS message
  db.run(
    `INSERT INTO sms_messages (lead_id, direction, from_number, to_number, body, twilio_sid, status)
     VALUES (?, 'outbound', ?, ?, ?, ?, ?)`,
    [enrollment.lead_id, process.env.TWILIO_PHONE_NUMBER, smsService.normalizePhone(lead.phone), body, result.sid, result.status]
  );

  // Log activity
  db.run(
    'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
    [enrollment.lead_id, 'sms_sent', `${step.label} (Step ${step.order})`, `Sent via sequence: ${sequence.name}`, JSON.stringify({ twilio_sid: result.sid })]
  );

  // Update lead contact tracking
  db.run(
    'UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [enrollment.lead_id]
  );

  // Recompute heat score
  const updatedLead = db.get('SELECT * FROM leads WHERE id = ?', [enrollment.lead_id]);
  if (updatedLead) {
    const newScore = recomputeHeatScore(updatedLead);
    if (newScore !== updatedLead.heat_score) {
      db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newScore, enrollment.lead_id]);
    }
  }

  // Advance to next step or complete
  const nextStep = enrollment.current_step + 1;
  if (nextStep > steps.length) {
    db.run(
      "UPDATE lead_sequences SET status = 'completed', completed_at = CURRENT_TIMESTAMP, current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [nextStep, enrollmentId]
    );
  } else {
    db.run(
      'UPDATE lead_sequences SET current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nextStep, enrollmentId]
    );
  }

  res.json({ success: true, data: { sid: result.sid, advanced_to: nextStep > steps.length ? 'completed' : nextStep } });
});

// ─── Enrollments (registered before /:id) ────────────────────────────────────

router.post('/enroll', (req, res) => {
  const { lead_ids, sequence_id } = req.body;
  if (!lead_ids?.length || !sequence_id) {
    return res.status(400).json({ success: false, error: 'lead_ids and sequence_id are required' });
  }

  const sequence = db.get('SELECT * FROM sequences WHERE id = ?', [sequence_id]);
  if (!sequence) return res.status(404).json({ success: false, error: 'Sequence not found' });
  if (!sequence.is_active) return res.status(400).json({ success: false, error: 'Sequence is not active' });

  let enrolled = 0;
  let skipped = 0;

  for (const leadId of lead_ids) {
    // Check if lead already has an active enrollment in this sequence
    const existing = db.get(
      "SELECT id FROM lead_sequences WHERE lead_id = ? AND sequence_id = ? AND status IN ('active', 'paused')",
      [leadId, sequence_id]
    );
    if (existing) {
      skipped++;
      continue;
    }

    db.run(
      'INSERT INTO lead_sequences (lead_id, sequence_id, current_step, status) VALUES (?, ?, 1, ?)',
      [leadId, sequence_id, 'active']
    );

    // Log activity
    db.run(
      'INSERT INTO activities (lead_id, type, title, description) VALUES (?, ?, ?, ?)',
      [leadId, 'note', `Enrolled in sequence: ${sequence.name}`, `Started ${sequence.name} (${parseSteps(sequence).length} steps)`]
    );

    enrolled++;
  }

  res.json({ success: true, data: { enrolled, skipped } });
});

router.get('/enrollments/:leadId', (req, res) => {
  const { leadId } = req.params;
  const enrollments = db.all(`
    SELECT ls.*, s.name as sequence_name, s.steps as sequence_steps
    FROM lead_sequences ls
    JOIN sequences s ON ls.sequence_id = s.id
    WHERE ls.lead_id = ?
    ORDER BY ls.created_at DESC
  `, [leadId]);

  const result = enrollments.map(e => ({
    ...e,
    steps: parseSteps({ steps: e.sequence_steps }),
    sequence_steps: undefined,
  }));

  res.json({ success: true, data: result });
});

router.patch('/enrollments/:enrollmentId/pause', (req, res) => {
  const { enrollmentId } = req.params;
  const enrollment = db.get('SELECT * FROM lead_sequences WHERE id = ?', [enrollmentId]);
  if (!enrollment) return res.status(404).json({ success: false, error: 'Enrollment not found' });
  if (enrollment.status !== 'active') return res.status(400).json({ success: false, error: 'Only active enrollments can be paused' });

  db.run(
    "UPDATE lead_sequences SET status = 'paused', paused_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [enrollmentId]
  );
  res.json({ success: true, data: { id: enrollmentId, status: 'paused' } });
});

router.patch('/enrollments/:enrollmentId/resume', (req, res) => {
  const { enrollmentId } = req.params;
  const enrollment = db.get('SELECT * FROM lead_sequences WHERE id = ?', [enrollmentId]);
  if (!enrollment) return res.status(404).json({ success: false, error: 'Enrollment not found' });
  if (enrollment.status !== 'paused') return res.status(400).json({ success: false, error: 'Only paused enrollments can be resumed' });

  db.run(
    "UPDATE lead_sequences SET status = 'active', paused_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [enrollmentId]
  );
  res.json({ success: true, data: { id: enrollmentId, status: 'active' } });
});

router.patch('/enrollments/:enrollmentId/cancel', (req, res) => {
  const { enrollmentId } = req.params;
  const enrollment = db.get('SELECT * FROM lead_sequences WHERE id = ?', [enrollmentId]);
  if (!enrollment) return res.status(404).json({ success: false, error: 'Enrollment not found' });
  if (!['active', 'paused'].includes(enrollment.status)) {
    return res.status(400).json({ success: false, error: 'Enrollment is already completed or cancelled' });
  }

  db.run(
    "UPDATE lead_sequences SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [enrollmentId]
  );
  res.json({ success: true, data: { id: enrollmentId, status: 'cancelled' } });
});

router.patch('/enrollments/:enrollmentId/auto-send', (req, res) => {
  const { enrollmentId } = req.params;
  const enrollment = db.get('SELECT * FROM lead_sequences WHERE id = ?', [enrollmentId]);
  if (!enrollment) return res.status(404).json({ success: false, error: 'Enrollment not found' });
  db.run('UPDATE lead_sequences SET auto_send = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [enrollmentId]);
  res.json({ success: true, data: { ok: true } });
});

router.patch('/enrollments/:enrollmentId/skip', (req, res) => {
  const { enrollmentId } = req.params;
  const enrollment = db.get('SELECT * FROM lead_sequences WHERE id = ?', [enrollmentId]);
  if (!enrollment) return res.status(404).json({ success: false, error: 'Enrollment not found' });
  if (enrollment.status !== 'active') return res.status(400).json({ success: false, error: 'Only active enrollments can skip steps' });

  const sequence = db.get('SELECT * FROM sequences WHERE id = ?', [enrollment.sequence_id]);
  const steps = sequence ? parseSteps(sequence) : [];

  const nextStep = enrollment.current_step + 1;
  if (nextStep > steps.length) {
    db.run(
      "UPDATE lead_sequences SET status = 'completed', completed_at = CURRENT_TIMESTAMP, current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [nextStep, enrollmentId]
    );
  } else {
    db.run(
      'UPDATE lead_sequences SET current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nextStep, enrollmentId]
    );
  }

  res.json({ success: true, data: { skipped_to: nextStep > steps.length ? 'completed' : nextStep } });
});

// ─── Sequence CRUD ───────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const sequences = db.all('SELECT * FROM sequences ORDER BY created_at DESC');
  const counts = getEnrollmentCounts();
  const sentCounts = getSequenceSentCounts();
  const openedCounts = getSequenceOpenedCounts();

  const result = sequences.map(s => ({
    ...s,
    steps: parseSteps(s),
    active_enrollments: counts[s.id] || 0,
    emails_sent: sentCounts[s.id] || 0,
    emails_opened: openedCounts[s.id] || 0,
  }));

  res.json({ success: true, data: result });
});

router.post('/', (req, res) => {
  const { name, description, steps, auto_send, auto_send_after_step } = req.body;
  if (!name || !steps?.length) {
    return res.status(400).json({ success: false, error: 'name and steps are required' });
  }

  const { lastInsertRowid } = db.run(
    'INSERT INTO sequences (name, description, steps, auto_send, auto_send_after_step) VALUES (?, ?, ?, ?, ?)',
    [name, description || null, JSON.stringify(steps), auto_send ? 1 : 0, parseInt(auto_send_after_step) || 0]
  );

  const sequence = db.get('SELECT * FROM sequences WHERE id = ?', [lastInsertRowid]);
  res.json({ success: true, data: { ...sequence, steps: parseSteps(sequence) } });
});

router.get('/:id', (req, res) => {
  const sequence = db.get('SELECT * FROM sequences WHERE id = ?', [req.params.id]);
  if (!sequence) return res.status(404).json({ success: false, error: 'Sequence not found' });

  const enrollments = db.all(
    'SELECT ls.*, l.business_name FROM lead_sequences ls JOIN leads l ON ls.lead_id = l.id WHERE ls.sequence_id = ? ORDER BY ls.created_at DESC',
    [req.params.id]
  );

  res.json({
    success: true,
    data: {
      ...sequence,
      steps: parseSteps(sequence),
      enrollments,
    },
  });
});

router.put('/:id', (req, res) => {
  const { name, description, steps, auto_send, auto_send_after_step } = req.body;
  const existing = db.get('SELECT * FROM sequences WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ success: false, error: 'Sequence not found' });

  db.run(
    'UPDATE sequences SET name = ?, description = ?, steps = ?, auto_send = ?, auto_send_after_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name || existing.name, description !== undefined ? description : existing.description, steps ? JSON.stringify(steps) : existing.steps, auto_send !== undefined ? (auto_send ? 1 : 0) : existing.auto_send, auto_send_after_step !== undefined ? (parseInt(auto_send_after_step) || 0) : existing.auto_send_after_step, req.params.id]
  );

  const updated = db.get('SELECT * FROM sequences WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: { ...updated, steps: parseSteps(updated) } });
});

router.delete('/:id', (req, res) => {
  const sequence = db.get('SELECT * FROM sequences WHERE id = ?', [req.params.id]);
  if (!sequence) return res.status(404).json({ success: false, error: 'Sequence not found' });

  // Cancel any active enrollments
  db.run(
    "UPDATE lead_sequences SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE sequence_id = ? AND status IN ('active', 'paused')",
    [req.params.id]
  );

  db.run('DELETE FROM sequences WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: { deleted: true } });
});

router.patch('/:id/toggle', (req, res) => {
  const sequence = db.get('SELECT * FROM sequences WHERE id = ?', [req.params.id]);
  if (!sequence) return res.status(404).json({ success: false, error: 'Sequence not found' });

  const newState = sequence.is_active ? 0 : 1;
  db.run('UPDATE sequences SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newState, req.params.id]);

  res.json({ success: true, data: { id: sequence.id, is_active: newState } });
});

module.exports = router;
