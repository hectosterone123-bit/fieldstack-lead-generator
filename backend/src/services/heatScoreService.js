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

module.exports = { computeInitialHeatScore, recomputeHeatScore };
