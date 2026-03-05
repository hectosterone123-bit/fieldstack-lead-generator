const BASIC_TECH = ['WordPress', 'Wix', 'GoDaddy', 'Squarespace', 'Weebly'];

function computeProspectScore(lead) {
  let score = 0;

  // Rating sweet spot: 3.5-4.5 (motivated, not complacent)
  if (lead.rating >= 3.5 && lead.rating <= 4.5) score += 25;
  else if (lead.rating > 4.5 && lead.rating < 4.8) score += 10;
  else if (lead.rating >= 3.0 && lead.rating < 3.5) score += 10;

  // Review count sweet spot: 50-200 (right size)
  if (lead.review_count >= 50 && lead.review_count <= 200) score += 25;
  else if (lead.review_count >= 20 && lead.review_count < 50) score += 15;
  else if (lead.review_count > 200 && lead.review_count <= 400) score += 10;
  else if (lead.review_count >= 10 && lead.review_count < 20) score += 5;

  // Website + tech stack (basic tech = less sophisticated = needs help)
  const tech = lead.enrichment_data?.tech_stack || lead.tech_stack || '';
  if (lead.has_website && lead.website_live && BASIC_TECH.some(t => tech.includes(t))) score += 20;
  else if (lead.has_website && lead.website_live) score += 10;
  else if (lead.has_website && !lead.website_live) score += 5;

  // Phone available (can be reached)
  if (lead.phone) score += 15;

  // Has contact form (can be mystery-shopped) — only known after full enrichment
  if (lead.enrichment_data?.has_contact_form) score += 15;

  return Math.min(score, 100);
}

module.exports = { computeProspectScore };
