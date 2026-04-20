const db = require('../db');

function applyRules(leadId, triggerEvent) {
  const lead = db.get('SELECT * FROM leads WHERE id = ?', [leadId]);
  if (!lead) return;

  const rules = db.all(
    "SELECT * FROM scoring_rules WHERE trigger = ? AND enabled = 1",
    [triggerEvent]
  );
  if (!rules.length) return;

  let score = lead.heat_score || 0;
  for (const rule of rules) {
    if (rule.condition_type === 'score_below' && score >= rule.condition_value) continue;
    if (rule.condition_type === 'score_above' && score <= rule.condition_value) continue;
    if (rule.action === 'add') score = Math.min(100, score + rule.value);
    else if (rule.action === 'subtract') score = Math.max(0, score - rule.value);
    else if (rule.action === 'set') score = Math.max(0, Math.min(100, rule.value));
  }

  if (score !== lead.heat_score) {
    db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [score, leadId]);
    db.run(
      "INSERT INTO activities (lead_id, type, title) VALUES (?, 'heat_update', ?)",
      [leadId, `Heat score updated to ${score} (trigger: ${triggerEvent})`]
    );
  }
}

function applyNoActivityRules() {
  const rules = db.all("SELECT * FROM scoring_rules WHERE trigger = 'no_activity_days' AND enabled = 1");
  if (!rules.length) return;

  for (const rule of rules) {
    const days = rule.value;
    const leads = db.all(
      `SELECT * FROM leads WHERE last_contacted_at IS NOT NULL
       AND last_contacted_at <= datetime('now', '-${days} days')
       AND status NOT IN ('lost', 'closed_won')`,
      []
    );
    for (const lead of leads) {
      if (rule.condition_type === 'score_above' && lead.heat_score <= rule.condition_value) continue;
      if (rule.condition_type === 'score_below' && lead.heat_score >= rule.condition_value) continue;
      let score = lead.heat_score || 0;
      if (rule.action === 'subtract') score = Math.max(0, score - rule.value);
      else if (rule.action === 'set') score = Math.max(0, Math.min(100, rule.value));
      if (score !== lead.heat_score) {
        db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [score, lead.id]);
      }
    }
  }
}

module.exports = { applyRules, applyNoActivityRules };
