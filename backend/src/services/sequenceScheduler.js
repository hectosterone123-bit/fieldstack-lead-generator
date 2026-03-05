const cron = require('node-cron');
const db = require('../db');

function startSequenceScheduler() {
  // Run every 15 minutes during business hours (7am-8pm, Mon-Fri)
  cron.schedule('*/15 7-20 * * 1-5', () => {
    try {
      autoCompleteEnrollments();
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

function logPendingCount() {
  const result = db.get("SELECT COUNT(*) as count FROM lead_sequences WHERE status = 'active'");
  if (result && result.count > 0) {
    console.log(`[Scheduler] ${result.count} active enrollment(s)`);
  }
}

module.exports = { startSequenceScheduler };
