const express = require('express');
const router = express.Router();
const { addClient, removeClient } = require('../services/eventBus');

// GET /api/events — SSE stream for real-time lead notifications
router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Keep-alive ping every 25s to prevent proxy timeouts
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(ping); }
  }, 25000);

  addClient(res);

  req.on('close', () => {
    clearInterval(ping);
    removeClient(res);
  });
});

module.exports = router;
