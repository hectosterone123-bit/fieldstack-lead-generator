require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { initDb } = require('./db');
const errorHandler = require('./middleware/errorHandler');

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[Warning] ANTHROPIC_API_KEY not set — AI Copilot will be unavailable');
}
if (!process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_PLACES_API_KEY === 'YOUR_API_KEY_HERE') {
  console.warn('[Warning] GOOGLE_PLACES_API_KEY not set — Google Places search will be unavailable');
}
if (!process.env.RESEND_API_KEY) {
  console.warn('[Warning] Resend not configured — Email sending will be unavailable. Set RESEND_API_KEY in .env');
}
if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
  console.warn('[Warning] Twilio not configured — SMS sending will be unavailable. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env');
}
if (!process.env.VAPI_API_KEY) {
  console.warn('[Warning] VAPI not configured — AI Cold Caller will be unavailable. Set VAPI_API_KEY in .env');
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
// Capture raw body before JSON parsing — needed for Resend webhook signature verification
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ extended: false }));

// Routes (mounted after DB is ready)
async function start() {
  await initDb();
  console.log('[DB] SQLite initialized');

  const leadsRouter = require('./routes/leads');
  const finderRouter = require('./routes/finder');
  const statsRouter = require('./routes/stats');
  const templatesRouter = require('./routes/templates');
  const chatRouter = require('./routes/chat');
  const sequencesRouter = require('./routes/sequences');
  const smsRouter = require('./routes/sms');
  const settingsRouter = require('./routes/settings');
  const webhooksRouter = require('./routes/webhooks');
  const scraperRouter = require('./routes/scraper');
  const cockpitRouter = require('./routes/cockpit');
  const callsRouter = require('./routes/calls');
  const scoringRulesRouter = require('./routes/scoringRules');

  app.use('/api/leads', leadsRouter);
  app.use('/api/finder', finderRouter);
  app.use('/api/scraper', scraperRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/sequences', sequencesRouter);
  app.use('/api/sms', smsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/webhooks', webhooksRouter);
  app.use('/api/cockpit', cockpitRouter);
  app.use('/api/calls', callsRouter);
  app.use('/api/scoring-rules', scoringRulesRouter);

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // DB backup download — lets you grab a copy of the database
  app.get('/api/backup', (req, res) => {
    const { saveDb } = require('./db');
    saveDb();
    const dbPath = path.join(process.env.DB_DIR || path.join(__dirname, '..', 'data'), 'leads.db');
    if (!require('fs').existsSync(dbPath)) return res.status(404).json({ success: false, error: 'No database file found' });
    res.download(dbPath, `fieldstack-backup-${new Date().toISOString().slice(0,10)}.db`);
  });

  const { startSequenceScheduler } = require('./services/sequenceScheduler');
  startSequenceScheduler();

  const { startCampaignScheduler } = require('./services/campaignScheduler');
  startCampaignScheduler();

  // Serve frontend build
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });

  app.use(errorHandler);

  app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('[Fatal] Failed to start server:', err);
  process.exit(1);
});
