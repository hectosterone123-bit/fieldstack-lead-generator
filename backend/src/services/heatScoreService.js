// Computes an initial heat score (0-65) for a newly discovered business.
// The remaining points (up to 100) are added manually by the user.
function computeInitialHeatScore(lead) {
  let score = 0;

  if (lead.has_website) score += 20;
  if (lead.website_live) score += 15;
  if (lead.phone) score += 15;
  if (lead.email) score += 10;
  if (lead.rating >= 4.0) score += 15;
  if (lead.review_count >= 10) score += 10;

  return Math.min(score, 90);
}

// Recompute score based on full lead data (for existing leads)
function recomputeHeatScore(lead) {
  let score = 0;

  if (lead.has_website) score += 20;
  if (lead.website_live) score += 15;
  if (lead.phone) score += 15;
  if (lead.email) score += 10;
  if (lead.rating >= 4.0) score += 15;
  if (lead.review_count >= 10) score += 10;
  if (lead.contact_count >= 1) score += 15;
  if (lead.contact_count >= 3) score += 10;
  if (['qualified', 'proposal_sent', 'booked'].includes(lead.status)) score += 15;

  return Math.min(score, 100);
}

module.exports = { computeInitialHeatScore, recomputeHeatScore };
