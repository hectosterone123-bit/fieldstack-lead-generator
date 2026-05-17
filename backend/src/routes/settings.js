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

// GET /api/settings/google-calendar/auth-url — get OAuth URL for Google Calendar
router.get('/google-calendar/auth-url', (req, res) => {
  const { getAuthUrl } = require('../services/calendarService');
  const url = getAuthUrl(db);
  if (!url) return res.status(400).json({ success: false, error: 'Google Calendar client_id not configured' });
  res.json({ success: true, data: { url } });
});

// GET /api/settings/google-calendar/callback — OAuth callback handler
router.get('/google-calendar/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code parameter');
    const { exchangeCode } = require('../services/calendarService');
    await exchangeCode(db, code);
    res.send('<html><body><h2>Google Calendar connected!</h2><p>You can close this window.</p><script>window.close()</script></body></html>');
  } catch (err) {
    res.status(500).send('Failed to connect: ' + err.message);
  }
});

// GET /api/settings/google-calendar/status — check if connected
router.get('/google-calendar/status', (req, res) => {
  const { getCalendarSettings } = require('../services/calendarService');
  const s = getCalendarSettings(db);
  res.json({ success: true, data: { connected: !!(s.enabled && s.refreshToken), enabled: s.enabled } });
});

module.exports = router;
