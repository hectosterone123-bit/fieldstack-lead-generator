const express = require('express');
const router = express.Router();
const db = require('../db');
const { streamChat, generateTitle } = require('../services/claudeService');

// GET /api/chat/conversations — list conversations
router.get('/conversations', (req, res, next) => {
  try {
    const conversations = db.all(
      'SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 20'
    );
    res.json({ success: true, data: conversations });
  } catch (err) { next(err); }
});

// POST /api/chat/conversations — create conversation
router.post('/conversations', (req, res, next) => {
  try {
    const { context, title } = req.body;
    const result = db.run(
      'INSERT INTO conversations (title, context) VALUES (?, ?)',
      [title || 'New conversation', context ? JSON.stringify(context) : null]
    );
    const conversation = db.get('SELECT * FROM conversations WHERE id = ?', [result.lastInsertRowid]);
    res.json({ success: true, data: conversation });
  } catch (err) { next(err); }
});

// DELETE /api/chat/conversations/:id — delete conversation + messages
router.delete('/conversations/:id', (req, res, next) => {
  try {
    db.run('DELETE FROM messages WHERE conversation_id = ?', [req.params.id]);
    db.run('DELETE FROM conversations WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) { next(err); }
});

// GET /api/chat/conversations/:id/messages — get messages
router.get('/conversations/:id/messages', (req, res, next) => {
  try {
    const messages = db.all(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ success: true, data: messages });
  } catch (err) { next(err); }
});

// POST /api/chat/conversations/:id/messages — send message + stream response
router.post('/conversations/:id/messages', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content, context } = req.body;

    const conversation = db.get('SELECT * FROM conversations WHERE id = ?', [id]);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Save user message
    db.run(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [id, 'user', content]
    );

    // Update conversation
    db.run(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, context = ? WHERE id = ?',
      [context ? JSON.stringify(context) : conversation.context, id]
    );

    // Load full history
    const history = db.all(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [id]
    );

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Stream response
    const parsedContext = context || (conversation.context ? JSON.parse(conversation.context) : null);

    const fullResponse = await streamChat(history, parsedContext, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    // Save assistant message
    if (fullResponse) {
      db.run(
        'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
        [id, 'assistant', fullResponse]
      );
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

    // Auto-title: generate AI title after first exchange (fire-and-forget)
    if (conversation.title === 'New conversation' && fullResponse) {
      generateTitle(content, fullResponse)
        .then(title => {
          db.run('UPDATE conversations SET title = ? WHERE id = ?', [title, id]);
        })
        .catch(err => {
          console.error('[Chat] Title generation failed:', err.message);
          const fallback = content.length > 50 ? content.slice(0, 47) + '...' : content;
          db.run('UPDATE conversations SET title = ? WHERE id = ?', [fallback, id]);
        });
    }
  } catch (err) {
    console.error('[Chat] Stream error:', err.message);
    if (!res.headersSent) {
      return next(err);
    }
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

module.exports = router;
