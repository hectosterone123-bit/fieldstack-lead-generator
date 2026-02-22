require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes (mounted after DB is ready)
async function start() {
  await initDb();
  console.log('[DB] SQLite initialized');

  const leadsRouter = require('./routes/leads');
  const finderRouter = require('./routes/finder');
  const statsRouter = require('./routes/stats');
  const templatesRouter = require('./routes/templates');
  const chatRouter = require('./routes/chat');

  app.use('/api/leads', leadsRouter);
  app.use('/api/finder', finderRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/chat', chatRouter);

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.use(errorHandler);

  app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('[Fatal] Failed to start server:', err);
  process.exit(1);
});
