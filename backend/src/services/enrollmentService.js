const db = require('../db');

function getDefaultSequenceId() {
  const row = db.get("SELECT value FROM settings WHERE key = 'default_sequence_id'");
  return row?.value ? parseInt(row.value) : null;
}

function autoEnrollLeads(leadIds, sequenceId) {
  if (!sequenceId || !leadIds?.length) return { enrolled: 0, skipped: 0 };

  const sequence = db.get('SELECT * FROM sequences WHERE id = ? AND is_active = 1', [sequenceId]);
  if (!sequence) return { enrolled: 0, skipped: 0 };

  let steps;
  try { steps = JSON.parse(sequence.steps || '[]'); } catch { steps = []; }

  let enrolled = 0, skipped = 0;
  for (const leadId of leadIds) {
    const existing = db.get(
      "SELECT id FROM lead_sequences WHERE lead_id = ? AND sequence_id = ? AND status IN ('active','paused')",
      [leadId, sequenceId]
    );
    if (existing) { skipped++; continue; }

    db.run('INSERT INTO lead_sequences (lead_id, sequence_id, current_step, status) VALUES (?, ?, 1, ?)',
      [leadId, sequenceId, 'active']);
    db.run(
      "INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'note', ?, ?)",
      [leadId, `Auto-enrolled in ${sequence.name}`, `${steps.length} steps`]
    );
    enrolled++;
  }

  if (enrolled > 0) {
    console.log(`[AutoEnroll] ${enrolled} lead(s) enrolled in "${sequence.name}"`);
  }

  return { enrolled, skipped };
}

module.exports = { autoEnrollLeads, getDefaultSequenceId };
