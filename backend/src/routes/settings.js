const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/settings — return all settings as key-value object
router.get('/', (req, res, next) => {
  try {
    const rows = db.all('SELECT key, value FROM settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    // Expose VAPI public key from env (safe to send to frontend)
    if (process.env.VAPI_PUBLIC_KEY) {
      settings.vapi_public_key = process.env.VAPI_PUBLIC_KEY;
    }
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
});

// PUT /api/settings/:key — upsert a setting
router.put('/:key', (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ success: false, error: 'value is required' });

    const existing = db.get('SELECT key FROM settings WHERE key = ?', [key]);
    if (existing) {
      db.run('UPDATE settings SET value = ? WHERE key = ?', [String(value), key]);
    } else {
      db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
    }

    res.json({ success: true, data: { key, value: String(value) } });
  } catch (err) { next(err); }
});

module.exports = router;
