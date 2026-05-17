function parseEnrichment(lead) {
  try { return JSON.parse(lead.enrichment_data || '{}'); } catch { return {}; }
}

// Computes an initial heat score for a newly discovered business.
function computeInitialHeatScore(lead) {
  let score = 0;
  const enrichment = parseEnrichment(lead);

  if (lead.has_website) score += 20;
  if (lead.website_live) score += 15;
  if (lead.phone) score += 15;
  if (lead.email) score += 10;
  if (lead.rating >= 4.0) score += 15;
  if (lead.review_count >= 10) score += 5;
  if (lead.review_count >= 50) score += 5;   // high review count = established business
  if (enrichment.google_ads) score += 10;    // running Google Ads = has budget, buys leads

  return Math.min(score, 90);
}

// Recompute score based on full lead data (for existing leads)
function recomputeHeatScore(lead) {
  let score = 0;
  const enrichment = parseEnrichment(lead);

  if (lead.has_website) score += 20;
  if (lead.website_live) score += 15;
  if (lead.phone) score += 15;
  if (lead.email) score += 10;
  if (lead.rating >= 4.0) score += 15;
  if (lead.review_count >= 10) score += 5;
  if (lead.review_count >= 50) score += 5;
  if (enrichment.google_ads) score += 10;
  if (lead.contact_count >= 1) score += 15;
  if (lead.contact_count >= 3) score += 10;
  if (['qualified', 'proposal_sent', 'booked'].includes(lead.status)) score += 15;

  return Math.min(score, 100);
}

// Apply daily heat score decay to leads that have gone inactive
function applyHeatDecay(db) {
  try {
    const enabled = db.get("SELECT value FROM settings WHERE key='heat_decay_enabled'")?.value;
    if (enabled === '0') return;

    const thresholdDays = parseInt(db.get("SELECT value FROM settings WHERE key='heat_decay_threshold_days'")?.value || '30') || 30;
    const rate = parseInt(db.get("SELECT value FROM settings WHERE key='heat_decay_rate'")?.value || '1') || 1;
    const floor = parseInt(db.get("SELECT value FROM settings WHERE key='heat_decay_floor'")?.value || '10') || 10;

    const leads = db.all(`
      SELECT id, heat_score FROM leads
      WHERE heat_score > ?
        AND status NOT IN ('booked', 'closed_won', 'lost')
        AND dnc_at IS NULL
        AND (
          (last_contacted_at IS NOT NULL AND last_contacted_at < datetime('now', '-' || ? || ' days'))
          OR (last_contacted_at IS NULL AND created_at < datetime('now', '-' || ? || ' days'))
        )
    `, [floor, thresholdDays, thresholdDays]);

    for (const lead of leads) {
      const newScore = Math.max(floor, (lead.heat_score || 0) - rate);
      db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newScore, lead.id]);
    }

    if (leads.length > 0) {
      console.log(`[heatDecay] Applied -${rate}pt decay to ${leads.length} inactive leads (threshold: ${thresholdDays}d, floor: ${floor})`);
    }
  } catch (err) {
    console.error('[heatDecay] Error:', err.message);
  }
}

module.exports = { computeInitialHeatScore, recomputeHeatScore, applyHeatDecay };
