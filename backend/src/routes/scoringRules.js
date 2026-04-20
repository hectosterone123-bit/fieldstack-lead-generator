const express = require('express');
const router = express.Router();
const db = require('../db');

const VALID_TRIGGERS = ['email_opened', 'email_clicked', 'email_replied', 'sms_replied', 'no_activity_days'];
const VALID_ACTIONS = ['add', 'subtract', 'set'];
const VALID_CONDITIONS = ['score_below', 'score_above', null];

// GET /api/scoring-rules
router.get('/', (req, res, next) => {
  try {
    const rules = db.all('SELECT * FROM scoring_rules ORDER BY id ASC', []);
    res.json({ success: true, data: rules });
  } catch (err) { next(err); }
});

// POST /api/scoring-rules
router.post('/', (req, res, next) => {
  try {
    const { name, trigger, action, value, condition_type = null, condition_value = null } = req.body;
    if (!name || !VALID_TRIGGERS.includes(trigger) || !VALID_ACTIONS.includes(action) || value == null) {
      return res.status(400).json({ success: false, error: 'Missing or invalid fields' });
    }
    const result = db.run(
      'INSERT INTO scoring_rules (name, trigger, action, value, condition_type, condition_value) VALUES (?, ?, ?, ?, ?, ?)',
      [name, trigger, action, parseInt(value), condition_type || null, condition_value != null ? parseInt(condition_value) : null]
    );
    const rule = db.get('SELECT * FROM scoring_rules WHERE id = ?', [result.lastInsertRowid]);
    res.json({ success: true, data: rule });
  } catch (err) { next(err); }
});

// PUT /api/scoring-rules/:id
router.put('/:id', (req, res, next) => {
  try {
    const { name, trigger, action, value, condition_type = null, condition_value = null } = req.body;
    const rule = db.get('SELECT id FROM scoring_rules WHERE id = ?', [req.params.id]);
    if (!rule) return res.status(404).json({ success: false, error: 'Not found' });
    db.run(
      'UPDATE scoring_rules SET name = ?, trigger = ?, action = ?, value = ?, condition_type = ?, condition_value = ? WHERE id = ?',
      [name, trigger, action, parseInt(value), condition_type || null, condition_value != null ? parseInt(condition_value) : null, req.params.id]
    );
    const updated = db.get('SELECT * FROM scoring_rules WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// DELETE /api/scoring-rules/:id
router.delete('/:id', (req, res, next) => {
  try {
    const rule = db.get('SELECT id FROM scoring_rules WHERE id = ?', [req.params.id]);
    if (!rule) return res.status(404).json({ success: false, error: 'Not found' });
    db.run('DELETE FROM scoring_rules WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /api/scoring-rules/:id/toggle
router.patch('/:id/toggle', (req, res, next) => {
  try {
    const rule = db.get('SELECT * FROM scoring_rules WHERE id = ?', [req.params.id]);
    if (!rule) return res.status(404).json({ success: false, error: 'Not found' });
    db.run('UPDATE scoring_rules SET enabled = ? WHERE id = ?', [rule.enabled ? 0 : 1, req.params.id]);
    const updated = db.get('SELECT * FROM scoring_rules WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

module.exports = router;
