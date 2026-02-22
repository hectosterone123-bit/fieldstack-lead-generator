const express = require('express');
const router = express.Router();
const db = require('../db');
const { renderTemplate, getAvailableVariables } = require('../services/templateService');

// GET /api/templates — list all, with optional filters
router.get('/', (req, res, next) => {
  try {
    const { channel, status_stage } = req.query;
    const conditions = [];
    const params = [];

    if (channel) {
      conditions.push('channel = ?');
      params.push(channel);
    }
    if (status_stage) {
      conditions.push('status_stage = ?');
      params.push(status_stage);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db.all(`SELECT * FROM templates ${where} ORDER BY step_order ASC, id ASC`, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/templates/variables — list available template variables
router.get('/variables', (req, res) => {
  res.json({ success: true, data: getAvailableVariables() });
});

// GET /api/templates/:id — single template
router.get('/:id', (req, res, next) => {
  try {
    const template = db.get('SELECT * FROM templates WHERE id = ?', [req.params.id]);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
    res.json({ success: true, data: template });
  } catch (err) { next(err); }
});

// POST /api/templates — create custom template
router.post('/', (req, res, next) => {
  try {
    const { name, channel, status_stage, step_order, subject, body } = req.body;
    if (!name || !channel || !status_stage || !body) {
      return res.status(400).json({ success: false, error: 'name, channel, status_stage, and body are required' });
    }

    const valid_channels = ['email', 'sms', 'call_script'];
    if (!valid_channels.includes(channel)) {
      return res.status(400).json({ success: false, error: `channel must be one of: ${valid_channels.join(', ')}` });
    }

    const { lastInsertRowid } = db.run(
      `INSERT INTO templates (name, channel, status_stage, step_order, subject, body, is_default) VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [name, channel, status_stage, step_order || 0, subject || null, body]
    );

    const template = db.get('SELECT * FROM templates WHERE id = ?', [lastInsertRowid]);
    res.status(201).json({ success: true, data: template });
  } catch (err) { next(err); }
});

// PUT /api/templates/:id — update template
router.put('/:id', (req, res, next) => {
  try {
    const template = db.get('SELECT * FROM templates WHERE id = ?', [req.params.id]);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

    const { name, channel, status_stage, step_order, subject, body } = req.body;
    db.run(
      `UPDATE templates SET name = ?, channel = ?, status_stage = ?, step_order = ?, subject = ?, body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [
        name || template.name,
        channel || template.channel,
        status_stage || template.status_stage,
        step_order != null ? step_order : template.step_order,
        subject !== undefined ? subject : template.subject,
        body || template.body,
        req.params.id
      ]
    );

    const updated = db.get('SELECT * FROM templates WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// DELETE /api/templates/:id — delete (block defaults)
router.delete('/:id', (req, res, next) => {
  try {
    const template = db.get('SELECT * FROM templates WHERE id = ?', [req.params.id]);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
    if (template.is_default) {
      return res.status(400).json({ success: false, error: 'Cannot delete default templates. Edit them instead.' });
    }

    db.run('DELETE FROM templates WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) { next(err); }
});

// POST /api/templates/:id/preview — render template with lead data
router.post('/:id/preview', (req, res, next) => {
  try {
    const template = db.get('SELECT * FROM templates WHERE id = ?', [req.params.id]);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

    const { lead_id } = req.body;
    if (!lead_id) return res.status(400).json({ success: false, error: 'lead_id is required' });

    const lead = db.get('SELECT * FROM leads WHERE id = ?', [lead_id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    const rendered_subject = template.subject ? renderTemplate(template.subject, lead) : null;
    const rendered_body = renderTemplate(template.body, lead);

    res.json({
      success: true,
      data: {
        ...template,
        rendered_subject,
        rendered_body,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
